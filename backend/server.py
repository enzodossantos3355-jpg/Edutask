from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import uuid
import logging
import bcrypt
import jwt
import requests
from datetime import datetime, timezone, timedelta
from typing import List, Optional

from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, Response, UploadFile, File, Form, Query, Header
from fastapi.responses import Response as FastResponse
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, EmailStr, Field

# ---------------------------------------------------------------------------
# Setup
# ---------------------------------------------------------------------------
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

JWT_ALGORITHM = "HS256"
JWT_SECRET = os.environ["JWT_SECRET"]

# Object storage
STORAGE_URL = "https://integrations.emergentagent.com/objstore/api/v1/storage"
EMERGENT_KEY = os.environ.get("EMERGENT_LLM_KEY")
APP_NAME = "school-tasks"
storage_key: Optional[str] = None


def init_storage() -> Optional[str]:
    global storage_key
    if storage_key:
        return storage_key
    if not EMERGENT_KEY:
        logger.warning("EMERGENT_LLM_KEY not set - storage disabled")
        return None
    try:
        resp = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_KEY}, timeout=30)
        resp.raise_for_status()
        storage_key = resp.json()["storage_key"]
        logger.info("Storage initialized")
        return storage_key
    except Exception as e:
        logger.error(f"Storage init failed: {e}")
        return None


def put_object(path: str, data: bytes, content_type: str) -> dict:
    key = init_storage()
    if not key:
        raise HTTPException(status_code=500, detail="Storage not available")
    resp = requests.put(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key, "Content-Type": content_type},
        data=data, timeout=120,
    )
    resp.raise_for_status()
    return resp.json()


def get_object(path: str):
    key = init_storage()
    if not key:
        raise HTTPException(status_code=500, detail="Storage not available")
    resp = requests.get(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key}, timeout=60,
    )
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")


# ---------------------------------------------------------------------------
# Password & JWT helpers
# ---------------------------------------------------------------------------
def hash_password(password: str) -> str:
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


def create_access_token(user_id: str, email: str) -> str:
    payload = {
        "sub": user_id, "email": email,
        "exp": datetime.now(timezone.utc) + timedelta(days=7),
        "type": "access",
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------
class LoginRequest(BaseModel):
    user_id: Optional[str] = None
    email: Optional[EmailStr] = None
    password: str


class ProfileOut(BaseModel):
    id: str
    name: str
    role: str
    status: str = "active"
    has_avatar: bool = False


class UserCreate(BaseModel):
    name: str
    password: str


class StatusUpdate(BaseModel):
    status: str  # "active" | "maintenance" | "blocked"


class UserOut(BaseModel):
    id: str
    name: str
    role: str
    status: str = "active"
    created_at: str
    password: Optional[str] = None  # plain-text password, only returned to admin for aluno accounts
    has_avatar: bool = False


class SubjectCreate(BaseModel):
    name: str


class SubjectOut(BaseModel):
    id: str
    name: str


class TaskCreate(BaseModel):
    subject: str
    title: str
    description: str
    due_date: str  # ISO date
    attachments: List[str] = []  # list of file ids
    assigned_to: List[str] = []  # list of student ids; empty = all students


class TaskUpdate(BaseModel):
    subject: Optional[str] = None
    title: Optional[str] = None
    description: Optional[str] = None
    due_date: Optional[str] = None
    attachments: Optional[List[str]] = None
    assigned_to: Optional[List[str]] = None


class AnnouncementCreate(BaseModel):
    title: str
    message: str
    assigned_to: List[str] = []  # empty = all students


class AnnouncementUpdate(BaseModel):
    title: Optional[str] = None
    message: Optional[str] = None
    assigned_to: Optional[List[str]] = None


# ---------------------------------------------------------------------------
# App + router
# ---------------------------------------------------------------------------
app = FastAPI()
api_router = APIRouter(prefix="/api")


async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Não autenticado")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Token inválido")
        user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0, "password_plain": 0})
        if not user:
            raise HTTPException(status_code=401, detail="Usuário não encontrado")
        # Expose has_avatar instead of internal storage path
        user["has_avatar"] = bool(user.pop("avatar_path", None))
        user.pop("avatar_content_type", None)
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expirado")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token inválido")


async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Acesso restrito ao administrador")
    return user


# ---------------------------------------------------------------------------
# Auth endpoints
# ---------------------------------------------------------------------------
@api_router.get("/auth/profiles", response_model=List[ProfileOut])
async def list_profiles():
    """Public endpoint: lists all profiles (id + name + role + status + has_avatar)."""
    users = await db.users.find({}, {"_id": 0, "id": 1, "name": 1, "role": 1, "status": 1, "avatar_path": 1}).to_list(1000)
    for u in users:
        u.setdefault("status", "active")
        u["has_avatar"] = bool(u.pop("avatar_path", None))
    users.sort(key=lambda u: (0 if u["role"] == "admin" else 1, u["name"].lower()))
    return [ProfileOut(**u) for u in users]


@api_router.post("/auth/login")
async def login(payload: LoginRequest, response: Response):
    if not payload.user_id and not payload.email:
        raise HTTPException(status_code=400, detail="Informe um perfil ou email")
    if payload.user_id:
        user = await db.users.find_one({"id": payload.user_id})
    else:
        email = payload.email.lower().strip()
        user = await db.users.find_one({"email": email})
    if not user or not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Senha inválida")
    status = user.get("status", "active")
    if status == "maintenance":
        raise HTTPException(status_code=403, detail="Perfil em manutenção. Fale com o administrador.")
    if status == "blocked":
        raise HTTPException(status_code=403, detail="Perfil bloqueado. Fale com o administrador.")
    token = create_access_token(user["id"], user["email"])
    response.set_cookie(
        key="access_token", value=token, httponly=True,
        secure=False, samesite="lax", max_age=60 * 60 * 24 * 7, path="/",
    )
    return {
        "token": token,
        "user": {
            "id": user["id"], "email": user["email"], "name": user["name"],
            "role": user["role"], "created_at": user["created_at"],
            "has_avatar": bool(user.get("avatar_path")),
        },
    }


@api_router.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    return {"ok": True}


@api_router.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return user


# ---------------------------------------------------------------------------
# Users (admin only)
# ---------------------------------------------------------------------------
@api_router.post("/users", response_model=UserOut)
async def create_user(payload: UserCreate, _: dict = Depends(require_admin)):
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Nome obrigatório")
    if await db.users.find_one({"name": name, "role": "aluno"}):
        raise HTTPException(status_code=400, detail="Já existe um aluno com este nome")
    user_id = str(uuid.uuid4())
    internal_email = f"aluno-{user_id}@local"
    doc = {
        "id": user_id,
        "email": internal_email,
        "name": name,
        "password_hash": hash_password(payload.password),
        "password_plain": payload.password,
        "role": "aluno",
        "status": "active",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(doc)
    return UserOut(id=user_id, name=name, role="aluno", status="active",
                   created_at=doc["created_at"], password=payload.password)


@api_router.get("/users", response_model=List[UserOut])
async def list_users(_: dict = Depends(require_admin)):
    users = await db.users.find(
        {"role": "aluno"},
        {"_id": 0, "id": 1, "name": 1, "role": 1, "status": 1, "created_at": 1, "password_plain": 1, "avatar_path": 1},
    ).sort("created_at", -1).to_list(1000)
    return [
        UserOut(
            id=u["id"], name=u["name"], role=u["role"],
            status=u.get("status", "active"),
            created_at=u["created_at"],
            password=u.get("password_plain"),
            has_avatar=bool(u.get("avatar_path")),
        )
        for u in users
    ]


@api_router.patch("/users/{user_id}/status")
async def update_user_status(user_id: str, payload: StatusUpdate, _: dict = Depends(require_admin)):
    if payload.status not in ("active", "maintenance", "blocked"):
        raise HTTPException(status_code=400, detail="Status inválido")
    result = await db.users.update_one(
        {"id": user_id, "role": "aluno"}, {"$set": {"status": payload.status}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Aluno não encontrado")
    return {"ok": True, "status": payload.status}


# ---------------------------------------------------------------------------
# Avatars (profile photos) - users upload their own, admin can manage anyone's
# ---------------------------------------------------------------------------
ALLOWED_AVATAR_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}


async def _save_avatar(user_id: str, file: UploadFile) -> dict:
    if file.content_type not in ALLOWED_AVATAR_TYPES:
        raise HTTPException(status_code=400, detail="Formato inválido. Use JPG, PNG, WEBP ou GIF.")
    data = await file.read()
    if len(data) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Imagem muito grande (máx 5MB)")
    ext = (file.filename.rsplit(".", 1)[-1] if "." in file.filename else "jpg").lower()
    path = f"{APP_NAME}/avatars/{user_id}.{ext}"
    put_object(path, data, file.content_type)
    await db.users.update_one(
        {"id": user_id},
        {"$set": {"avatar_path": path, "avatar_content_type": file.content_type, "avatar_updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    return {"ok": True}


async def _remove_avatar(user_id: str):
    result = await db.users.update_one(
        {"id": user_id},
        {"$unset": {"avatar_path": "", "avatar_content_type": "", "avatar_updated_at": ""}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")


@api_router.post("/me/avatar")
async def upload_my_avatar(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    return await _save_avatar(user["id"], file)


@api_router.delete("/me/avatar")
async def delete_my_avatar(user: dict = Depends(get_current_user)):
    await _remove_avatar(user["id"])
    return {"ok": True}


@api_router.post("/users/{user_id}/avatar")
async def upload_user_avatar(user_id: str, file: UploadFile = File(...), _: dict = Depends(require_admin)):
    if not await db.users.find_one({"id": user_id}):
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    return await _save_avatar(user_id, file)


@api_router.delete("/users/{user_id}/avatar")
async def delete_user_avatar(user_id: str, _: dict = Depends(require_admin)):
    await _remove_avatar(user_id)
    return {"ok": True}


@api_router.get("/avatars/{user_id}")
async def get_avatar(user_id: str):
    """Public endpoint - returns the avatar image bytes (or 404)."""
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "avatar_path": 1, "avatar_content_type": 1})
    if not user or not user.get("avatar_path"):
        raise HTTPException(status_code=404, detail="Avatar não encontrado")
    data, ct = get_object(user["avatar_path"])
    return FastResponse(
        content=data,
        media_type=user.get("avatar_content_type", ct),
        headers={"Cache-Control": "no-cache"},
    )


# ---------------------------------------------------------------------------
# Subjects (matérias) - admin manages, all read
# ---------------------------------------------------------------------------
@api_router.get("/subjects", response_model=List[SubjectOut])
async def list_subjects(_: dict = Depends(get_current_user)):
    items = await db.subjects.find({}, {"_id": 0, "id": 1, "name": 1}).sort("name", 1).to_list(500)
    return [SubjectOut(**i) for i in items]


@api_router.post("/subjects", response_model=SubjectOut)
async def create_subject(payload: SubjectCreate, _: dict = Depends(require_admin)):
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Nome obrigatório")
    existing = await db.subjects.find_one({"name": {"$regex": f"^{name}$", "$options": "i"}})
    if existing:
        raise HTTPException(status_code=400, detail="Matéria já existe")
    sid = str(uuid.uuid4())
    await db.subjects.insert_one({"id": sid, "name": name})
    return SubjectOut(id=sid, name=name)


@api_router.delete("/subjects/{subject_id}")
async def delete_subject(subject_id: str, _: dict = Depends(require_admin)):
    result = await db.subjects.delete_one({"id": subject_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Matéria não encontrada")
    return {"ok": True}


@api_router.delete("/users/{user_id}")
async def delete_user(user_id: str, _: dict = Depends(require_admin)):
    result = await db.users.delete_one({"id": user_id, "role": "aluno"})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Aluno não encontrado")
    await db.completions.delete_many({"user_id": user_id})
    return {"ok": True}


# ---------------------------------------------------------------------------
# File upload
# ---------------------------------------------------------------------------
@api_router.post("/files/upload")
async def upload_file(file: UploadFile = File(...), user: dict = Depends(require_admin)):
    ext = file.filename.split(".")[-1].lower() if "." in file.filename else "bin"
    file_id = str(uuid.uuid4())
    storage_path = f"{APP_NAME}/uploads/{user['id']}/{file_id}.{ext}"
    data = await file.read()
    content_type = file.content_type or "application/octet-stream"
    result = put_object(storage_path, data, content_type)
    doc = {
        "id": file_id,
        "storage_path": result["path"],
        "original_filename": file.filename,
        "content_type": content_type,
        "size": result.get("size", len(data)),
        "uploaded_by": user["id"],
        "is_deleted": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.files.insert_one(doc)
    return {"id": file_id, "filename": file.filename, "size": doc["size"]}


@api_router.get("/files/{file_id}/download")
async def download_file(file_id: str, request: Request, auth: Optional[str] = Query(None)):
    # Allow auth via query param (?auth=token) for direct browser navigation
    if auth and not request.headers.get("Authorization"):
        # Verify the token by decoding it
        try:
            payload = jwt.decode(auth, JWT_SECRET, algorithms=[JWT_ALGORITHM])
            user = await db.users.find_one({"id": payload["sub"]})
            if not user:
                raise HTTPException(status_code=401, detail="Não autenticado")
        except jwt.InvalidTokenError:
            raise HTTPException(status_code=401, detail="Token inválido")
    else:
        await get_current_user(request)

    record = await db.files.find_one({"id": file_id, "is_deleted": False}, {"_id": 0})
    if not record:
        raise HTTPException(status_code=404, detail="Arquivo não encontrado")
    data, ct = get_object(record["storage_path"])
    return FastResponse(
        content=data,
        media_type=record.get("content_type", ct),
        headers={"Content-Disposition": f'inline; filename="{record["original_filename"]}"'},
    )


# ---------------------------------------------------------------------------
# Tasks
# ---------------------------------------------------------------------------
async def _build_task_response(task: dict, students: list, completions_by_task: dict) -> dict:
    """Attach attachment metadata + completion progress to a task."""
    file_ids = task.get("attachments", []) or []
    files = []
    if file_ids:
        cursor = db.files.find({"id": {"$in": file_ids}, "is_deleted": False}, {"_id": 0, "id": 1, "original_filename": 1, "size": 1, "content_type": 1})
        files = await cursor.to_list(100)
    task_completions = completions_by_task.get(task["id"], [])
    completed_user_ids = {c["user_id"] for c in task_completions}
    assigned_to = task.get("assigned_to", []) or []
    # Filter "students" to only the assigned ones (or all if no filter)
    target_students = students if not assigned_to else [s for s in students if s["id"] in assigned_to]
    progress = []
    for s in target_students:
        progress.append({
            "user_id": s["id"], "name": s["name"], "email": s["email"],
            "completed": s["id"] in completed_user_ids,
            "completed_at": next((c["completed_at"] for c in task_completions if c["user_id"] == s["id"]), None),
        })
    return {
        **task,
        "attachments": files,
        "progress": progress,
        "completed_count": sum(1 for p in progress if p["completed"]),
        "total_students": len(target_students),
        "all_students": not assigned_to,
    }


@api_router.post("/tasks")
async def create_task(payload: TaskCreate, user: dict = Depends(require_admin)):
    task_id = str(uuid.uuid4())
    doc = {
        "id": task_id,
        "subject": payload.subject.strip(),
        "title": payload.title.strip(),
        "description": payload.description.strip(),
        "due_date": payload.due_date,
        "attachments": payload.attachments,
        "assigned_to": payload.assigned_to,  # [] = all students
        "created_by": user["id"],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.tasks.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.get("/tasks")
async def list_tasks(user: dict = Depends(get_current_user)):
    tasks = await db.tasks.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    students = await db.users.find({"role": "aluno"}, {"_id": 0, "id": 1, "name": 1, "email": 1}).to_list(1000)
    completions = await db.completions.find({}, {"_id": 0}).to_list(10000)

    completions_by_task: dict = {}
    for c in completions:
        completions_by_task.setdefault(c["task_id"], []).append(c)

    if user["role"] == "admin":
        return [await _build_task_response(t, students, completions_by_task) for t in tasks]

    # Aluno: filter by assignment + include their own completion state
    my_completed = {c["task_id"] for c in completions if c["user_id"] == user["id"]}
    result = []
    for t in tasks:
        assigned = t.get("assigned_to", []) or []
        # empty list = all students; otherwise must include this user
        if assigned and user["id"] not in assigned:
            continue
        file_ids = t.get("attachments", []) or []
        files = []
        if file_ids:
            cursor = db.files.find({"id": {"$in": file_ids}, "is_deleted": False}, {"_id": 0, "id": 1, "original_filename": 1, "size": 1, "content_type": 1})
            files = await cursor.to_list(100)
        my_completion = next((c for c in completions if c["task_id"] == t["id"] and c["user_id"] == user["id"]), None)
        result.append({
            **t,
            "attachments": files,
            "completed": t["id"] in my_completed,
            "completed_at": my_completion["completed_at"] if my_completion else None,
        })
    return result


# ---------------------------------------------------------------------------
# Announcements (avisos)
# ---------------------------------------------------------------------------
@api_router.post("/announcements")
async def create_announcement(payload: AnnouncementCreate, user: dict = Depends(require_admin)):
    title = payload.title.strip()
    message = payload.message.strip()
    if not title or not message:
        raise HTTPException(status_code=400, detail="Título e mensagem obrigatórios")
    aid = str(uuid.uuid4())
    doc = {
        "id": aid,
        "title": title,
        "message": message,
        "assigned_to": payload.assigned_to,
        "created_by": user["id"],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.announcements.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.get("/announcements")
async def list_announcements(user: dict = Depends(get_current_user)):
    items = await db.announcements.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    if user["role"] == "admin":
        # attach recipient summary for admin view
        students = await db.users.find({"role": "aluno"}, {"_id": 0, "id": 1, "name": 1}).to_list(1000)
        student_by_id = {s["id"]: s for s in students}
        for a in items:
            assigned = a.get("assigned_to", []) or []
            a["recipients"] = (
                [{"id": sid, "name": student_by_id.get(sid, {}).get("name", "?")} for sid in assigned]
                if assigned else []
            )
            a["all_students"] = not assigned
        return items
    # Aluno: filter by assignment
    return [
        a for a in items
        if not a.get("assigned_to") or user["id"] in a.get("assigned_to", [])
    ]


@api_router.delete("/announcements/{ann_id}")
async def delete_announcement(ann_id: str, _: dict = Depends(require_admin)):
    result = await db.announcements.delete_one({"id": ann_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Aviso não encontrado")
    return {"ok": True}


@api_router.put("/announcements/{ann_id}")
async def update_announcement(ann_id: str, payload: AnnouncementUpdate, _: dict = Depends(require_admin)):
    update = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None}
    if "title" in update:
        update["title"] = update["title"].strip()
    if "message" in update:
        update["message"] = update["message"].strip()
    if not update:
        raise HTTPException(status_code=400, detail="Nada para atualizar")
    result = await db.announcements.update_one({"id": ann_id}, {"$set": update})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Aviso não encontrado")
    return {"ok": True}


@api_router.put("/tasks/{task_id}")
async def update_task(task_id: str, payload: TaskUpdate, _: dict = Depends(require_admin)):
    update = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None}
    if not update:
        raise HTTPException(status_code=400, detail="Nada para atualizar")
    result = await db.tasks.update_one({"id": task_id}, {"$set": update})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Tarefa não encontrada")
    return {"ok": True}


@api_router.delete("/tasks/{task_id}")
async def delete_task(task_id: str, _: dict = Depends(require_admin)):
    result = await db.tasks.delete_one({"id": task_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Tarefa não encontrada")
    await db.completions.delete_many({"task_id": task_id})
    return {"ok": True}


@api_router.post("/tasks/{task_id}/complete")
async def complete_task(task_id: str, user: dict = Depends(get_current_user)):
    if user["role"] != "aluno":
        raise HTTPException(status_code=403, detail="Apenas alunos podem marcar tarefas")
    if not await db.tasks.find_one({"id": task_id}):
        raise HTTPException(status_code=404, detail="Tarefa não encontrada")
    existing = await db.completions.find_one({"task_id": task_id, "user_id": user["id"]})
    if existing:
        return {"ok": True, "completed_at": existing["completed_at"]}
    completed_at = datetime.now(timezone.utc).isoformat()
    await db.completions.insert_one({
        "task_id": task_id, "user_id": user["id"], "completed_at": completed_at,
    })
    return {"ok": True, "completed_at": completed_at}


@api_router.post("/tasks/{task_id}/uncomplete")
async def uncomplete_task(task_id: str, user: dict = Depends(get_current_user)):
    if user["role"] != "aluno":
        raise HTTPException(status_code=403, detail="Apenas alunos podem desmarcar tarefas")
    await db.completions.delete_one({"task_id": task_id, "user_id": user["id"]})
    return {"ok": True}


# ---------------------------------------------------------------------------
# Startup
# ---------------------------------------------------------------------------
@app.on_event("startup")
async def on_startup():
    # Indexes
    await db.users.create_index("email", unique=True)
    await db.users.create_index("id", unique=True)
    await db.tasks.create_index("id", unique=True)
    await db.completions.create_index([("task_id", 1), ("user_id", 1)], unique=True)
    await db.files.create_index("id", unique=True)
    await db.subjects.create_index("id", unique=True)
    await db.announcements.create_index("id", unique=True)

    # Seed default subjects (only on empty collection)
    if await db.subjects.count_documents({}) == 0:
        defaults = [
            "Matemática", "Português", "Ciências", "História",
            "Geografia", "Inglês", "Artes", "Educação Física",
        ]
        await db.subjects.insert_many([{"id": str(uuid.uuid4()), "name": n} for n in defaults])
        logger.info("Default subjects seeded")

    # Seed admin
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@escola.com").lower()
    admin_password = os.environ.get("ADMIN_PASSWORD", "admin123")
    existing = await db.users.find_one({"email": admin_email})
    if existing is None:
        await db.users.insert_one({
            "id": str(uuid.uuid4()),
            "email": admin_email,
            "name": "Administrador",
            "password_hash": hash_password(admin_password),
            "role": "admin",
            "status": "active",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        logger.info("Admin seeded")
    elif not verify_password(admin_password, existing["password_hash"]):
        await db.users.update_one(
            {"email": admin_email},
            {"$set": {"password_hash": hash_password(admin_password)}},
        )
        logger.info("Admin password updated")

    init_storage()


@app.on_event("shutdown")
async def on_shutdown():
    client.close()


# ---------------------------------------------------------------------------
# CORS + include router
# ---------------------------------------------------------------------------
@api_router.get("/")
async def root():
    return {"ok": True, "app": "school-tasks"}


app.include_router(api_router)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origin_regex=".*",
    allow_methods=["*"],
    allow_headers=["*"],
)
