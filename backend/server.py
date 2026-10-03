from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import uuid
import asyncio
import logging
import bcrypt
import jwt
import requests
import httpx
import json
import base64
from datetime import datetime, timezone, timedelta, time as dtime
from zoneinfo import ZoneInfo
from typing import List, Optional

from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, Response, UploadFile, File, Form, Query, Header
from fastapi.responses import Response as FastResponse
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent
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

BR_TZ = ZoneInfo("America/Sao_Paulo")
LOG_RETENTION_DAYS = 7
TASK_CUTOFF_TIME = dtime(12, 30)  # 12:30 PM in BR_TZ

# Object storage
STORAGE_URL = "https://integrations.emergentagent.com/objstore/api/v1/storage"
EMERGENT_KEY = os.environ.get("EMERGENT_LLM_KEY")
APP_NAME = "school-tasks"
storage_key: Optional[str] = None


def init_storage(force: bool = False) -> Optional[str]:
    global storage_key
    if storage_key and not force:
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
        storage_key = None
        return None


def put_object(path: str, data: bytes, content_type: str) -> dict:
    for attempt in (0, 1):
        key = init_storage(force=attempt == 1)
        if not key:
            raise HTTPException(status_code=500, detail="Storage not available")
        resp = requests.put(
            f"{STORAGE_URL}/objects/{path}",
            headers={"X-Storage-Key": key, "Content-Type": content_type},
            data=data, timeout=120,
        )
        if resp.status_code in (401, 403) and attempt == 0:
            continue  # storage_key expired — refresh once and retry
        resp.raise_for_status()
        return resp.json()
    raise HTTPException(status_code=500, detail="Storage authentication failed")


def get_object(path: str):
    for attempt in (0, 1):
        key = init_storage(force=attempt == 1)
        if not key:
            raise HTTPException(status_code=500, detail="Storage not available")
        resp = requests.get(
            f"{STORAGE_URL}/objects/{path}",
            headers={"X-Storage-Key": key}, timeout=60,
        )
        if resp.status_code in (401, 403) and attempt == 0:
            continue
        resp.raise_for_status()
        return resp.content, resp.headers.get("Content-Type", "application/octet-stream")
    raise HTTPException(status_code=500, detail="Storage authentication failed")


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
    tier_name: Optional[str] = None
    points: int = 0
    equipped_effect: Optional[str] = None


class UserCreate(BaseModel):
    name: str
    password: str


class UserUpdate(BaseModel):
    name: Optional[str] = None
    password: Optional[str] = None


class StatusUpdate(BaseModel):
    status: str  # "active" | "maintenance" | "blocked"


class UserOut(BaseModel):
    id: str
    name: str
    role: str
    status: str = "active"
    created_at: str
    password: Optional[str] = None
    has_avatar: bool = False
    points: int = 0


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
    admin_photos: List[str] = []  # file ids visible only to admin (used by AI to generate answer)
    answer: Optional[str] = ""    # generated/edited answer visible to students
    points: Optional[int] = 10    # points awarded to students on completion


class TaskUpdate(BaseModel):
    subject: Optional[str] = None
    title: Optional[str] = None
    description: Optional[str] = None
    due_date: Optional[str] = None
    attachments: Optional[List[str]] = None
    assigned_to: Optional[List[str]] = None
    admin_photos: Optional[List[str]] = None
    answer: Optional[str] = None
    points: Optional[int] = None


class EffectPriceUpdate(BaseModel):
    cost: int


class EffectBuyIn(BaseModel):
    effect_id: str


class EffectEquipIn(BaseModel):
    effect_id: Optional[str] = None  # None to unequip


class AnnouncementCreate(BaseModel):
    title: str
    message: str
    assigned_to: List[str] = []  # empty = all students


class AnnouncementUpdate(BaseModel):
    title: Optional[str] = None
    message: Optional[str] = None
    assigned_to: Optional[List[str]] = None


class CommentCreate(BaseModel):
    text: str


class PointsAdjust(BaseModel):
    delta: int
    reason: Optional[str] = None


class MonthlyPrize(BaseModel):
    title: str
    description: Optional[str] = ""
    emoji: Optional[str] = "🏆"
    image_id: Optional[str] = None


class AppFeature(BaseModel):
    name: str
    description: Optional[str] = ""
    emoji: Optional[str] = "✨"
    status: Optional[str] = "stable"  # "stable" | "beta" | "novo"


class AppInfoUpdate(BaseModel):
    version: Optional[str] = None
    codename: Optional[str] = None
    release_notes: Optional[str] = None
    features: Optional[List[AppFeature]] = None


class ZapierConfig(BaseModel):
    webhook_url: Optional[str] = ""
    enabled: Optional[bool] = False


# (legacy — kept for potential future user-configurable webhook UI; not used by Make integration)


# ---------------------------------------------------------------------------
# Points / Streak helpers
# ---------------------------------------------------------------------------
TIERS = [
    ("Obsidiana", 2000, "#1a1a1a", "#a78bfa"),
    ("Rubi",      1200, "#dc2626", "#fecaca"),
    ("Diamante",   700, "#0891b2", "#a5f3fc"),
    ("Platina",    350, "#14b8a6", "#ccfbf1"),
    ("Ouro",       150, "#f59e0b", "#fef3c7"),
    ("Prata",       50, "#6b7280", "#f3f4f6"),
    ("Bronze",       0, "#92400e", "#fed7aa"),
]


def get_tier(points: int) -> dict:
    for name, threshold, color, bg in TIERS:
        if points >= threshold:
            # find next tier for progress
            idx = TIERS.index((name, threshold, color, bg))
            next_t = TIERS[idx - 1] if idx > 0 else None
            return {
                "name": name, "threshold": threshold, "color": color, "bg": bg,
                "next_name": next_t[0] if next_t else None,
                "next_threshold": next_t[1] if next_t else None,
            }
    return {"name": "Bronze", "threshold": 0, "color": "#92400e", "bg": "#fed7aa", "next_name": "Prata", "next_threshold": 50}


def _br_today_iso() -> str:
    return datetime.now(timezone.utc).astimezone(BR_TZ).date().isoformat()


async def _maybe_update_streak(user_id: str) -> dict:
    """Update streak based on BR date. Returns updated stats dict."""
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "streak_count": 1, "last_active_date": 1, "longest_streak": 1})
    today = _br_today_iso()
    last = (user or {}).get("last_active_date")
    streak = (user or {}).get("streak_count", 0) or 0
    longest = (user or {}).get("longest_streak", 0) or 0
    if last == today:
        pass  # already counted today
    elif last:
        try:
            d_last = datetime.fromisoformat(last).date()
            d_today = datetime.fromisoformat(today).date()
            if (d_today - d_last).days == 1:
                streak += 1
            else:
                streak = 1
        except Exception:
            streak = 1
    else:
        streak = 1
    longest = max(longest, streak)
    await db.users.update_one(
        {"id": user_id},
        {"$set": {"streak_count": streak, "last_active_date": today, "longest_streak": longest}},
    )
    return {"streak_count": streak, "last_active_date": today, "longest_streak": longest}


async def _add_points(user_id: str, delta: int) -> int:
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "points": 1})
    current = (user or {}).get("points", 0) or 0
    new_total = max(0, current + delta)
    await db.users.update_one({"id": user_id}, {"$set": {"points": new_total}})
    return new_total


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
    """Public endpoint: lists all profiles (id + name + role + status + has_avatar + tier)."""
    users = await db.users.find({}, {"_id": 0, "id": 1, "name": 1, "role": 1, "status": 1, "avatar_path": 1, "points": 1, "equipped_effect": 1}).to_list(1000)
    for u in users:
        u.setdefault("status", "active")
        u["has_avatar"] = bool(u.pop("avatar_path", None))
        pts = u.get("points", 0) or 0
        u["points"] = pts
        u["tier_name"] = get_tier(pts)["name"] if u.get("role") == "aluno" else None
        u["equipped_effect"] = u.get("equipped_effect") or "none"
    users.sort(key=lambda u: (0 if u["role"] == "admin" else 1, u["name"].lower()))
    return [ProfileOut(**u) for u in users]


@api_router.get("/me/stats")
async def my_stats(user: dict = Depends(get_current_user)):
    u = await db.users.find_one(
        {"id": user["id"]},
        {"_id": 0, "points": 1, "streak_count": 1, "longest_streak": 1, "last_active_date": 1},
    ) or {}
    points = u.get("points", 0) or 0
    rank = None
    total = 0
    if user.get("role") == "aluno":
        students = await db.users.find({"role": "aluno"}, {"_id": 0, "id": 1, "points": 1}).to_list(1000)
        # sort by points desc, fallback by id stable
        students.sort(key=lambda s: (-(s.get("points", 0) or 0), s["id"]))
        total = len(students)
        for i, s in enumerate(students):
            if s["id"] == user["id"]:
                rank = i + 1
                break
    return {
        "points": points,
        "streak_count": u.get("streak_count", 0) or 0,
        "longest_streak": u.get("longest_streak", 0) or 0,
        "last_active_date": u.get("last_active_date"),
        "tier": get_tier(points),
        "rank": rank,
        "total_students": total,
    }


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
    # Log access (only for alunos — admin sees their own access via session)
    if user.get("role") == "aluno":
        try:
            await db.login_logs.insert_one({
                "id": str(uuid.uuid4()),
                "user_id": user["id"],
                "user_name": user["name"],
                "role": user["role"],
                "ip": (response.headers.get("X-Forwarded-For") if hasattr(response, "headers") else None),
                "created_at": datetime.now(timezone.utc).isoformat(),
            })
            await _maybe_update_streak(user["id"])
        except Exception as e:
            logger.warning(f"Failed to record login log: {e}")
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
        {"_id": 0, "id": 1, "name": 1, "role": 1, "status": 1, "created_at": 1, "password_plain": 1, "avatar_path": 1, "points": 1},
    ).sort("created_at", -1).to_list(1000)
    return [
        UserOut(
            id=u["id"], name=u["name"], role=u["role"],
            status=u.get("status", "active"),
            created_at=u["created_at"],
            password=u.get("password_plain"),
            has_avatar=bool(u.get("avatar_path")),
            points=u.get("points", 0) or 0,
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


async def _apply_user_update(user_id: str, payload: UserUpdate, role_filter: Optional[str] = None) -> dict:
    update: dict = {}
    if payload.name is not None:
        name = payload.name.strip()
        if not name:
            raise HTTPException(status_code=400, detail="Nome não pode ser vazio")
        # Ensure unique among alunos (admin name change skips this check by role_filter)
        existing = await db.users.find_one({"id": {"$ne": user_id}, "name": name, "role": "aluno"})
        if existing:
            raise HTTPException(status_code=400, detail="Já existe um aluno com este nome")
        update["name"] = name
    if payload.password is not None:
        if len(payload.password) < 4:
            raise HTTPException(status_code=400, detail="Senha deve ter ao menos 4 caracteres")
        update["password_hash"] = hash_password(payload.password)
        update["password_plain"] = payload.password
    if not update:
        raise HTTPException(status_code=400, detail="Nada para atualizar")
    query = {"id": user_id}
    if role_filter:
        query["role"] = role_filter
    result = await db.users.update_one(query, {"$set": update})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    return {"ok": True}


@api_router.patch("/me")
async def update_me(payload: UserUpdate, user: dict = Depends(get_current_user)):
    """Only admin can change own name/password via this endpoint.
    Alunos must ask the admin to change their name or password."""
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Apenas o administrador pode alterar nome e senha. Fale com o administrador.")
    return await _apply_user_update(user["id"], payload)


@api_router.patch("/users/{user_id}")
async def update_user(user_id: str, payload: UserUpdate, _: dict = Depends(require_admin)):
    """Admin updates any aluno's name and/or password."""
    return await _apply_user_update(user_id, payload, role_filter="aluno")


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


@api_router.post("/users/{user_id}/points")
async def adjust_points(user_id: str, payload: PointsAdjust, admin: dict = Depends(require_admin)):
    user = await db.users.find_one({"id": user_id, "role": "aluno"})
    if not user:
        raise HTTPException(status_code=404, detail="Aluno não encontrado")
    new_total = await _add_points(user_id, payload.delta)
    await db.point_adjustments.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "user_name": user["name"],
        "admin_id": admin["id"],
        "delta": payload.delta,
        "reason": (payload.reason or "").strip(),
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return {"ok": True, "total_points": new_total, "delta": payload.delta}


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
async def _build_task_response(task: dict, students: list, completions_by_task: dict, is_admin: bool = False) -> dict:
    """Attach attachment metadata + completion progress to a task."""
    file_ids = task.get("attachments", []) or []
    files = []
    if file_ids:
        cursor = db.files.find({"id": {"$in": file_ids}, "is_deleted": False}, {"_id": 0, "id": 1, "original_filename": 1, "size": 1, "content_type": 1})
        files = await cursor.to_list(100)
    admin_photos_meta = []
    if is_admin:
        admin_photo_ids = task.get("admin_photos", []) or []
        if admin_photo_ids:
            cursor = db.files.find({"id": {"$in": admin_photo_ids}, "is_deleted": False}, {"_id": 0, "id": 1, "original_filename": 1, "size": 1, "content_type": 1})
            admin_photos_meta = await cursor.to_list(100)
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
    result = {
        **task,
        "attachments": files,
        "progress": progress,
        "completed_count": sum(1 for p in progress if p["completed"]),
        "total_students": len(target_students),
        "all_students": not assigned_to,
    }
    if is_admin:
        result["admin_photos"] = admin_photos_meta
    else:
        # strip admin-only fields for students
        result.pop("admin_photos", None)
    return result


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
        "admin_photos": payload.admin_photos or [],
        "answer": (payload.answer or "").strip(),
        "points": max(0, int(payload.points if payload.points is not None else 10)),
        "created_by": user["id"],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.tasks.insert_one(doc)
    doc.pop("_id", None)
    _fire_webhook("task.created", {
        "id": doc["id"],
        "subject": doc["subject"],
        "title": doc["title"],
        "description": doc["description"],
        "due_date": doc["due_date"],
        "assigned_to": doc["assigned_to"],
        "all_students": not doc["assigned_to"],
        "created_by": doc["created_by"],
        "created_at": doc["created_at"],
    })
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
        return [await _build_task_response(t, students, completions_by_task, is_admin=True) for t in tasks]

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
        student_task = {
            **t,
            "attachments": files,
            "completed": t["id"] in my_completed,
            "completed_at": my_completion["completed_at"] if my_completion else None,
        }
        # Strip admin-only fields
        student_task.pop("admin_photos", None)
        result.append(student_task)
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
    _fire_webhook("announcement.created", {
        "id": doc["id"],
        "title": doc["title"],
        "message": doc["message"],
        "assigned_to": doc["assigned_to"],
        "all_students": not doc["assigned_to"],
        "created_by": doc["created_by"],
        "created_at": doc["created_at"],
    })
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


# ---------------------------------------------------------------------------
# Login logs (acessos dos alunos)
# ---------------------------------------------------------------------------
@api_router.get("/login-logs")
async def list_login_logs(_: dict = Depends(require_admin)):
    """List all login logs (alunos). Auto-deleted after 7 days."""
    items = await db.login_logs.find({}, {"_id": 0}).sort("created_at", -1).to_list(2000)
    return items


@api_router.delete("/login-logs")
async def delete_all_login_logs(_: dict = Depends(require_admin)):
    """Clear ALL login logs."""
    result = await db.login_logs.delete_many({})
    return {"ok": True, "deleted": result.deleted_count}


@api_router.delete("/login-logs/{log_id}")
async def delete_login_log(log_id: str, _: dict = Depends(require_admin)):
    """Delete a single login log."""
    result = await db.login_logs.delete_one({"id": log_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Registro não encontrado")
    return {"ok": True}


# ---------------------------------------------------------------------------
# Stats / Gamification
# ---------------------------------------------------------------------------
@api_router.get("/admin/stats")
async def admin_stats(_: dict = Depends(require_admin)):
    """Aggregate stats for admin dashboard."""
    students = await db.users.find(
        {"role": "aluno"},
        {"_id": 0, "id": 1, "name": 1, "points": 1, "streak_count": 1, "avatar_path": 1},
    ).to_list(1000)
    tasks_total = await db.tasks.count_documents({})
    completions_total = await db.completions.count_documents({})
    announcements_total = await db.announcements.count_documents({})

    # Top alunos by points
    enriched = []
    for s in students:
        pts = s.get("points", 0) or 0
        enriched.append({
            "id": s["id"], "name": s["name"],
            "points": pts,
            "streak_count": s.get("streak_count", 0) or 0,
            "tier": get_tier(pts),
            "has_avatar": bool(s.get("avatar_path")),
        })
    enriched.sort(key=lambda x: x["points"], reverse=True)

    # Completions per day (last 7 days, BR)
    now_br = datetime.now(timezone.utc).astimezone(BR_TZ)
    days = []
    for i in range(6, -1, -1):
        d = (now_br.date() - timedelta(days=i)).isoformat()
        days.append(d)
    counts = {d: 0 for d in days}
    completions = await db.completions.find({}, {"_id": 0, "completed_at": 1}).to_list(5000)
    for c in completions:
        try:
            day_utc = datetime.fromisoformat(c["completed_at"].replace("Z", "+00:00"))
            day_br = day_utc.astimezone(BR_TZ).date().isoformat()
            if day_br in counts:
                counts[day_br] += 1
        except Exception:
            pass

    # Tasks by subject
    tasks = await db.tasks.find({}, {"_id": 0, "subject": 1}).to_list(5000)
    subj_counts: dict = {}
    for t in tasks:
        s = t.get("subject", "—")
        subj_counts[s] = subj_counts.get(s, 0) + 1
    top_subjects = sorted(subj_counts.items(), key=lambda x: x[1], reverse=True)[:5]

    return {
        "totals": {
            "tasks": tasks_total,
            "completions": completions_total,
            "announcements": announcements_total,
            "students": len(students),
        },
        "top_students": enriched[:5],
        "all_students_ranking": enriched,
        "completions_per_day": [{"date": d, "count": counts[d]} for d in days],
        "top_subjects": [{"subject": s, "count": c} for s, c in top_subjects],
    }


# ---------------------------------------------------------------------------
# Announcement comments
# ---------------------------------------------------------------------------
@api_router.post("/announcements/{ann_id}/comments")
async def add_announcement_comment(ann_id: str, payload: CommentCreate, user: dict = Depends(get_current_user)):
    text = payload.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Comentário vazio")
    if not await db.announcements.find_one({"id": ann_id}):
        raise HTTPException(status_code=404, detail="Aviso não encontrado")
    doc = {
        "id": str(uuid.uuid4()),
        "announcement_id": ann_id,
        "user_id": user["id"],
        "user_name": user["name"],
        "user_role": user["role"],
        "text": text,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.comments.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.get("/announcements/{ann_id}/comments")
async def list_announcement_comments(ann_id: str, _: dict = Depends(get_current_user)):
    items = await db.comments.find({"announcement_id": ann_id}, {"_id": 0}).sort("created_at", 1).to_list(500)
    return items


@api_router.delete("/announcements/{ann_id}/comments/{comment_id}")
async def delete_comment(ann_id: str, comment_id: str, user: dict = Depends(get_current_user)):
    """Author or admin can delete a comment."""
    comment = await db.comments.find_one({"id": comment_id, "announcement_id": ann_id})
    if not comment:
        raise HTTPException(status_code=404, detail="Comentário não encontrado")
    if user["role"] != "admin" and comment["user_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Sem permissão")
    await db.comments.delete_one({"id": comment_id})
    return {"ok": True}


# ---------------------------------------------------------------------------
# Monthly prize
# ---------------------------------------------------------------------------
def _month_bounds(now_br: datetime) -> tuple:
    start = now_br.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    if start.month == 12:
        next_start = start.replace(year=start.year + 1, month=1)
    else:
        next_start = start.replace(month=start.month + 1)
    return start, next_start


@api_router.get("/monthly-prize")
async def get_monthly_prize(_: dict = Depends(get_current_user)):
    settings = await db.settings.find_one({"id": "monthly_prize"}, {"_id": 0})
    prize = None
    if settings:
        prize = {
            "title": settings.get("title"),
            "description": settings.get("description", ""),
            "emoji": settings.get("emoji", "🏆"),
            "image_id": settings.get("image_id"),
        }

    now_br = datetime.now(timezone.utc).astimezone(BR_TZ)
    month_start_utc = now_br.replace(day=1, hour=0, minute=0, second=0, microsecond=0).astimezone(timezone.utc)

    students = await db.users.find({"role": "aluno", "status": "active"}, {"_id": 0, "id": 1, "name": 1, "avatar_path": 1, "streak": 1}).to_list(1000)
    # Count on-time completions in the current month per student
    tasks = await db.tasks.find({}, {"_id": 0, "id": 1, "due_date": 1}).to_list(2000)
    task_due = {t["id"]: t.get("due_date", "9999-12-31") for t in tasks}
    completions = await db.completions.find({"completed_at": {"$gte": month_start_utc.isoformat()}}, {"_id": 0}).to_list(5000)
    stats = {}
    for c in completions:
        uid = c["user_id"]
        stats.setdefault(uid, {"month": 0, "on_time": 0})
        stats[uid]["month"] += 1
        due = task_due.get(c["task_id"], "9999-12-31")
        completed_day = (c.get("completed_at") or "")[:10]
        if completed_day and completed_day <= due:
            stats[uid]["on_time"] += 1

    def score(s):
        st = stats.get(s["id"], {"month": 0, "on_time": 0})
        return (st["on_time"], st["month"], s.get("streak", 0) or 0)

    students.sort(key=lambda s: score(s), reverse=True)
    leader = None
    if students and score(students[0])[0] + score(students[0])[1] > 0:
        s0 = students[0]
        st = stats.get(s0["id"], {"month": 0, "on_time": 0})
        leader = {
            "id": s0["id"], "name": s0["name"],
            "on_time_this_month": st["on_time"],
            "completions_this_month": st["month"],
            "streak": s0.get("streak", 0) or 0,
            "has_avatar": bool(s0.get("avatar_path")),
        }
    _, next_start = _month_bounds(now_br)
    days_remaining = (next_start.date() - now_br.date()).days
    end_date = (next_start - timedelta(seconds=1)).date().isoformat()
    return {
        "prize": prize,
        "leader": leader,
        "days_remaining": max(0, days_remaining),
        "end_date": end_date,
        "month_label": now_br.strftime("%B/%Y"),
    }


@api_router.put("/monthly-prize")
async def set_monthly_prize(payload: MonthlyPrize, _: dict = Depends(require_admin)):
    title = payload.title.strip()
    if not title:
        raise HTTPException(status_code=400, detail="Título obrigatório")
    doc = {
        "id": "monthly_prize",
        "title": title,
        "description": (payload.description or "").strip(),
        "emoji": (payload.emoji or "🏆"),
        "image_id": payload.image_id,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.settings.update_one(
        {"id": "monthly_prize"},
        {"$set": doc},
        upsert=True,
    )
    return {"ok": True}


@api_router.delete("/monthly-prize")
async def delete_monthly_prize(_: dict = Depends(require_admin)):
    await db.settings.delete_one({"id": "monthly_prize"})
    return {"ok": True}


# ---------------------------------------------------------------------------
# App Info / Firmware
# ---------------------------------------------------------------------------
DEFAULT_APP_INFO = {
    "id": "app_info",
    "version": "1.0.0",
    "codename": "Neo-Brutalist Beta",
    "release_notes": "Lançamento inicial do Edutask com controle de perfis, gamificação e painel admin.",
    "features": [
        {"name": "Seleção de perfis estilo Netflix", "description": "Login com clique no perfil + senha.", "emoji": "🎭", "status": "stable"},
        {"name": "Tarefas com destinatários", "description": "Crie tarefas e defina quais alunos devem recebê-las.", "emoji": "📚", "status": "stable"},
        {"name": "Avisos com comentários", "description": "Comunique-se com a turma em tempo real.", "emoji": "📣", "status": "stable"},
        {"name": "Gamificação (7 patentes)", "description": "De Bronze a Obsidiana com pontos e streaks.", "emoji": "🏆", "status": "stable"},
        {"name": "Prêmio mensal", "description": "Configure um prêmio para o melhor aluno do mês.", "emoji": "🎁", "status": "stable"},
        {"name": "Dar / tirar pontos", "description": "Admin pode ajustar pontos manualmente.", "emoji": "➕", "status": "stable"},
        {"name": "Modo escuro", "description": "Alterne entre claro e escuro no header.", "emoji": "🌙", "status": "stable"},
        {"name": "Calendário de tarefas", "description": "Visualize tarefas por mês.", "emoji": "📅", "status": "stable"},
        {"name": "Histórico de acessos", "description": "Veja quem entrou e quando (limpeza em 7 dias).", "emoji": "🕒", "status": "stable"},
    ],
}


@api_router.get("/app-info")
async def get_app_info(_: dict = Depends(get_current_user)):
    doc = await db.settings.find_one({"id": "app_info"}, {"_id": 0})
    if not doc:
        return DEFAULT_APP_INFO
    return {
        "id": "app_info",
        "version": doc.get("version", DEFAULT_APP_INFO["version"]),
        "codename": doc.get("codename", DEFAULT_APP_INFO["codename"]),
        "release_notes": doc.get("release_notes", DEFAULT_APP_INFO["release_notes"]),
        "features": doc.get("features", DEFAULT_APP_INFO["features"]),
        "updated_at": doc.get("updated_at"),
    }


@api_router.put("/app-info")
async def set_app_info(payload: AppInfoUpdate, _: dict = Depends(require_admin)):
    update = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None}
    if "version" in update:
        update["version"] = update["version"].strip()
        if not update["version"]:
            raise HTTPException(status_code=400, detail="Versão obrigatória")
    if "codename" in update:
        update["codename"] = update["codename"].strip()
    if "release_notes" in update:
        update["release_notes"] = update["release_notes"].strip()
    if "features" in update:
        # normalize list of dicts
        features = []
        for f in update["features"]:
            if isinstance(f, dict):
                features.append({
                    "name": (f.get("name") or "").strip(),
                    "description": (f.get("description") or "").strip(),
                    "emoji": (f.get("emoji") or "✨").strip() or "✨",
                    "status": (f.get("status") or "stable").strip() or "stable",
                })
        update["features"] = [f for f in features if f["name"]]
    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.settings.update_one(
        {"id": "app_info"},
        {"$set": {"id": "app_info", **update}},
        upsert=True,
    )
    doc = await db.settings.find_one({"id": "app_info"}, {"_id": 0})
    return doc


# ---------------------------------------------------------------------------
# Profile Effects Store
# ---------------------------------------------------------------------------
DEFAULT_EFFECTS = [
    {"id": "none", "name": "Padrão", "emoji": "⚪", "description": "Sem efeito visual", "cost": 0, "css": "", "rarity": "common"},
    {"id": "neon_pulse", "name": "Pulso Neon", "emoji": "💠", "description": "Aura azul que pulsa suavemente.", "cost": 50, "css": "fx-neon-pulse", "rarity": "common"},
    {"id": "sunset", "name": "Pôr do Sol", "emoji": "🌅", "description": "Contorno degradê laranja e rosa.", "cost": 80, "css": "fx-sunset", "rarity": "common"},
    {"id": "golden", "name": "Ouro Reluzente", "emoji": "🥇", "description": "Brilho dourado giratório.", "cost": 150, "css": "fx-golden", "rarity": "rare"},
    {"id": "rainbow", "name": "Arco-Íris", "emoji": "🌈", "description": "Borda que muda de cor.", "cost": 200, "css": "fx-rainbow", "rarity": "rare"},
    {"id": "ice", "name": "Gelo", "emoji": "❄️", "description": "Cristais azuis brilhantes.", "cost": 220, "css": "fx-ice", "rarity": "rare"},
    {"id": "fire", "name": "Fogo", "emoji": "🔥", "description": "Chamas dançantes.", "cost": 250, "css": "fx-fire", "rarity": "rare"},
    {"id": "hologram", "name": "Holograma", "emoji": "👾", "description": "Efeito cyberpunk irisado.", "cost": 350, "css": "fx-hologram", "rarity": "epic"},
    {"id": "galaxy", "name": "Galáxia", "emoji": "🌌", "description": "Nebulosa roxa animada.", "cost": 500, "css": "fx-galaxy", "rarity": "epic"},
    {"id": "electric", "name": "Elétrico", "emoji": "⚡", "description": "Raios amarelos ao redor.", "cost": 600, "css": "fx-electric", "rarity": "epic"},
    {"id": "shadow", "name": "Sombra Real", "emoji": "🖤", "description": "Contorno em ébano pulsante.", "cost": 700, "css": "fx-shadow", "rarity": "epic"},
    {"id": "phoenix", "name": "Fênix", "emoji": "🔴", "description": "Chama vermelha renascente.", "cost": 900, "css": "fx-phoenix", "rarity": "legendary"},
    {"id": "diamond", "name": "Diamante", "emoji": "💎", "description": "Cintilação de diamante.", "cost": 1200, "css": "fx-diamond", "rarity": "legendary"},
]


async def _get_effects_catalog() -> list:
    """Return the current effect catalog, seeding defaults if empty and merging admin overrides."""
    doc = await db.settings.find_one({"id": "effects_catalog"}, {"_id": 0})
    overrides = (doc or {}).get("overrides", {})  # {effect_id: {cost: N}}
    catalog = []
    for eff in DEFAULT_EFFECTS:
        o = overrides.get(eff["id"], {})
        catalog.append({**eff, **({"cost": int(o["cost"])} if "cost" in o else {})})
    return catalog


@api_router.get("/effects")
async def list_effects(user: dict = Depends(get_current_user)):
    catalog = await _get_effects_catalog()
    if user["role"] == "admin":
        owned_ids = [e["id"] for e in catalog]  # admin has everything
    else:
        owned_ids = user.get("owned_effects") or ["none"]
        if "none" not in owned_ids:
            owned_ids.append("none")
    equipped = user.get("equipped_effect") or "none"
    return {
        "effects": catalog,
        "owned": owned_ids,
        "equipped": equipped,
        "points": user.get("points", 0),
    }


@api_router.put("/effects/{effect_id}")
async def update_effect_cost(effect_id: str, payload: EffectPriceUpdate, _: dict = Depends(require_admin)):
    catalog = await _get_effects_catalog()
    if not any(e["id"] == effect_id for e in catalog):
        raise HTTPException(status_code=404, detail="Efeito não encontrado")
    if payload.cost < 0:
        raise HTTPException(status_code=400, detail="Custo não pode ser negativo")
    await db.settings.update_one(
        {"id": "effects_catalog"},
        {"$set": {f"overrides.{effect_id}.cost": int(payload.cost),
                  "updated_at": datetime.now(timezone.utc).isoformat()},
         "$setOnInsert": {"id": "effects_catalog"}},
        upsert=True,
    )
    return {"ok": True, "effect_id": effect_id, "new_cost": payload.cost}


@api_router.post("/me/effects/buy")
async def buy_effect(payload: EffectBuyIn, user: dict = Depends(get_current_user)):
    if user["role"] == "admin":
        # admin unlocks are automatic — still return success
        return {"ok": True, "already_owned": True}
    catalog = await _get_effects_catalog()
    effect = next((e for e in catalog if e["id"] == payload.effect_id), None)
    if not effect:
        raise HTTPException(status_code=404, detail="Efeito não encontrado")
    owned = user.get("owned_effects") or []
    if effect["id"] in owned or effect["id"] == "none":
        return {"ok": True, "already_owned": True}
    cost = int(effect["cost"])
    current_points = int(user.get("points") or 0)
    if current_points < cost:
        raise HTTPException(status_code=400, detail=f"Você precisa de {cost} pontos (tem {current_points})")
    # Deduct + add to owned
    await db.users.update_one(
        {"id": user["id"]},
        {"$inc": {"points": -cost}, "$addToSet": {"owned_effects": effect["id"]}},
    )
    updated = await db.users.find_one({"id": user["id"]}, {"_id": 0, "points": 1, "owned_effects": 1})
    return {"ok": True, "points": updated.get("points", 0), "owned_effects": updated.get("owned_effects", [])}


@api_router.post("/me/effects/equip")
async def equip_effect(payload: EffectEquipIn, user: dict = Depends(get_current_user)):
    catalog = await _get_effects_catalog()
    effect_id = payload.effect_id or "none"
    if not any(e["id"] == effect_id for e in catalog):
        raise HTTPException(status_code=404, detail="Efeito não encontrado")
    # Admin can equip anything; students must own it
    if user["role"] != "admin":
        owned = user.get("owned_effects") or ["none"]
        if effect_id != "none" and effect_id not in owned:
            raise HTTPException(status_code=400, detail="Você ainda não comprou esse efeito")
    await db.users.update_one({"id": user["id"]}, {"$set": {"equipped_effect": effect_id}})
    return {"ok": True, "equipped": effect_id}


# ---------------------------------------------------------------------------
# Make.com webhook integration
# ---------------------------------------------------------------------------
MAKE_WEBHOOK_URL = os.environ.get("MAKE_WEBHOOK_URL", "").strip()


async def _send_make_event(event_type: str, payload: dict):
    """Fire-and-forget POST to the configured Make.com webhook.

    Failures are logged but never raised so they don't impact the user request.
    """
    if not MAKE_WEBHOOK_URL or not MAKE_WEBHOOK_URL.startswith("http"):
        return
    body = {
        "event": event_type,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "app": "Edutask",
        "data": payload,
    }
    try:
        async with httpx.AsyncClient(timeout=10.0) as client_http:
            resp = await client_http.post(MAKE_WEBHOOK_URL, json=body)
            logger.info(f"Make {event_type} → {resp.status_code}")
            await db.webhook_logs.insert_one({
                "id": str(uuid.uuid4()),
                "event": event_type,
                "status": resp.status_code,
                "sent_at": datetime.now(timezone.utc).isoformat(),
            })
    except Exception as e:
        logger.error(f"Make webhook failed for {event_type}: {e}")
        try:
            await db.webhook_logs.insert_one({
                "id": str(uuid.uuid4()),
                "event": event_type,
                "status": "error",
                "error": str(e)[:300],
                "sent_at": datetime.now(timezone.utc).isoformat(),
            })
        except Exception:
            pass


def _fire_webhook(event_type: str, payload: dict):
    """Schedule the webhook call without blocking the caller."""
    asyncio.create_task(_send_make_event(event_type, payload))


@api_router.get("/integrations/webhook-logs")
async def get_webhook_logs(_: dict = Depends(require_admin)):
    """Last 50 webhook calls for admin diagnostics."""
    logs = await db.webhook_logs.find({}, {"_id": 0}).sort("sent_at", -1).to_list(50)
    return {
        "configured": bool(MAKE_WEBHOOK_URL),
        "webhook_url": MAKE_WEBHOOK_URL[:60] + "..." if len(MAKE_WEBHOOK_URL) > 60 else MAKE_WEBHOOK_URL,
        "logs": logs,
    }


@api_router.post("/integrations/webhook-test")
async def test_webhook(_: dict = Depends(require_admin)):
    if not MAKE_WEBHOOK_URL:
        raise HTTPException(status_code=400, detail="Make webhook não configurado no servidor")
    body = {
        "event": "test",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "app": "Edutask",
        "data": {"message": "Teste de webhook do Edutask 🎉"},
    }
    try:
        async with httpx.AsyncClient(timeout=10.0) as client_http:
            resp = await client_http.post(MAKE_WEBHOOK_URL, json=body)
        await db.webhook_logs.insert_one({
            "id": str(uuid.uuid4()),
            "event": "test",
            "status": resp.status_code,
            "sent_at": datetime.now(timezone.utc).isoformat(),
        })
        return {"ok": True, "status": resp.status_code}
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Falha: {e}")


# ---------------------------------------------------------------------------
# AI (Gemini 3 Flash)
# ---------------------------------------------------------------------------
AI_MODEL = "gemini-3-flash-preview"
AI_PROVIDER = "gemini"


async def _ai_enabled() -> bool:
    doc = await db.settings.find_one({"id": "ai_config"}, {"_id": 0})
    if not doc:
        return True  # default ON
    return bool(doc.get("enabled", True))


async def _ensure_ai_enabled():
    if not await _ai_enabled():
        raise HTTPException(status_code=503, detail="Recursos de IA estão desativados pelo administrador")


@api_router.get("/ai/status")
async def ai_status(_: dict = Depends(get_current_user)):
    """Public (auth-required) status of AI features. Frontend uses this to hide/show buttons."""
    return {"enabled": await _ai_enabled()}


@api_router.put("/ai/status")
async def set_ai_status(body: dict, _: dict = Depends(require_admin)):
    enabled = bool(body.get("enabled", True))
    await db.settings.update_one(
        {"id": "ai_config"},
        {"$set": {"id": "ai_config", "enabled": enabled, "updated_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )
    return {"enabled": enabled}


def _new_ai_chat(session_id: str, system_message: str) -> LlmChat:
    """Fresh LlmChat instance per request (session-scoped)."""
    return LlmChat(
        api_key=EMERGENT_KEY,
        session_id=session_id,
        system_message=system_message,
    ).with_model(AI_PROVIDER, AI_MODEL)


class AIImproveTaskIn(BaseModel):
    title: str
    subject: Optional[str] = ""
    hint: Optional[str] = ""


class AIGenAnnouncementIn(BaseModel):
    prompt: str


class AICheckAnswerIn(BaseModel):
    task_title: str
    task_description: str
    student_answer: str


class AIGenTaskAnswerIn(BaseModel):
    task_id: str
    extra_hint: Optional[str] = ""


class AIExplainTaskIn(BaseModel):
    task_id: str


class AIChatIn(BaseModel):
    session_id: Optional[str] = None
    message: str
    task_id: Optional[str] = None  # optional context: helps student solve this task


def _strip_json_fence(text: str) -> str:
    """LLM sometimes wraps JSON in ```json ... ``` fences."""
    t = (text or "").strip()
    if t.startswith("```"):
        # remove leading fence
        first_newline = t.find("\n")
        if first_newline > 0:
            t = t[first_newline + 1:]
        if t.endswith("```"):
            t = t[:-3]
    return t.strip()


def _clean_answer_text(text: str) -> str:
    """Remove markdown noise (bold **, italic *, code fences, headings) from AI text
    while preserving line breaks and mathematical symbols.
    """
    import re
    t = (text or "").strip()
    # Strip code fences ```...```
    if t.startswith("```"):
        first_newline = t.find("\n")
        if first_newline > 0:
            t = t[first_newline + 1:]
        if t.endswith("```"):
            t = t[:-3]
    t = t.strip()
    # Remove **bold** and __bold__ but keep inner text
    t = re.sub(r"\*\*(.+?)\*\*", r"\1", t, flags=re.DOTALL)
    t = re.sub(r"__(.+?)__", r"\1", t, flags=re.DOTALL)
    # Remove *italic* (single asterisks NOT surrounded by digits like 3*5)
    t = re.sub(r"(?<![\w\d])\*(?!\s)([^\*\n]+?)(?<!\s)\*(?![\w\d])", r"\1", t)
    # Remove leading heading markers # ## ###
    t = re.sub(r"(?m)^#{1,6}\s+", "", t)
    # Remove markdown bullet stars/hyphens keeping content
    t = re.sub(r"(?m)^\s*[-\*]\s+", "", t)
    # Collapse 3+ blank lines
    t = re.sub(r"\n{3,}", "\n\n", t)
    return t.strip()


@api_router.post("/ai/improve-task")
async def ai_improve_task(payload: AIImproveTaskIn, admin: dict = Depends(require_admin)):
    await _ensure_ai_enabled()
    if not EMERGENT_KEY:
        raise HTTPException(status_code=503, detail="IA não configurada")
    title = payload.title.strip()
    if not title:
        raise HTTPException(status_code=400, detail="Título obrigatório")
    subject = (payload.subject or "").strip() or "matéria não informada"
    hint = (payload.hint or "").strip()
    system = (
        "Você é um professor experiente do ensino fundamental/médio no Brasil. "
        "Responda SEMPRE em português do Brasil. Use linguagem clara, amigável e adequada a alunos. "
        "Responda EXCLUSIVAMENTE em JSON válido, sem texto extra fora do JSON, sem cercas de código."
    )
    prompt = (
        f"Elabore uma tarefa escolar com base nas informações abaixo.\n\n"
        f"Matéria: {subject}\n"
        f"Título da tarefa: {title}\n"
        + (f"Ideias/observações do professor: {hint}\n" if hint else "")
        + "\nRetorne um JSON com as chaves:\n"
        "- \"description\" (string, 2-4 parágrafos explicando a tarefa)\n"
        "- \"tips\" (array de 3-5 dicas curtas para os alunos)\n"
        "- \"objectives\" (array de 2-3 objetivos de aprendizagem)\n"
        "Exemplo: {\"description\":\"...\",\"tips\":[\"...\",\"...\"],\"objectives\":[\"...\"]}"
    )
    try:
        chat = _new_ai_chat(f"improve-{admin['id']}-{uuid.uuid4().hex[:8]}", system)
        resp = await chat.send_message(UserMessage(text=prompt))
        raw = _strip_json_fence(resp if isinstance(resp, str) else str(resp))
        data = json.loads(raw)
        return {
            "description": data.get("description", "").strip(),
            "tips": [t for t in (data.get("tips") or []) if isinstance(t, str)][:5],
            "objectives": [o for o in (data.get("objectives") or []) if isinstance(o, str)][:3],
        }
    except json.JSONDecodeError:
        # Fallback: return raw text as description
        return {"description": raw, "tips": [], "objectives": []}
    except Exception as e:
        logger.error(f"AI improve-task error: {e}")
        raise HTTPException(status_code=502, detail=f"IA indisponível: {e}")


@api_router.post("/ai/generate-announcement")
async def ai_generate_announcement(payload: AIGenAnnouncementIn, admin: dict = Depends(require_admin)):
    await _ensure_ai_enabled()
    if not EMERGENT_KEY:
        raise HTTPException(status_code=503, detail="IA não configurada")
    prompt_text = payload.prompt.strip()
    if not prompt_text:
        raise HTTPException(status_code=400, detail="Descreva o aviso")
    system = (
        "Você é um professor redigindo avisos escolares em português do Brasil. "
        "Tom amigável, respeitoso e claro. Responda APENAS em JSON válido, sem texto extra."
    )
    prompt = (
        f"Com base nesta ideia curta, escreva um aviso escolar completo:\n\n\"{prompt_text}\"\n\n"
        "Retorne JSON com as chaves:\n"
        "- \"title\" (string, até 60 caracteres)\n"
        "- \"message\" (string, 1-3 parágrafos)\n"
        "Exemplo: {\"title\":\"Reunião de pais\",\"message\":\"...\"}"
    )
    try:
        chat = _new_ai_chat(f"ann-{admin['id']}-{uuid.uuid4().hex[:8]}", system)
        resp = await chat.send_message(UserMessage(text=prompt))
        raw = _strip_json_fence(resp if isinstance(resp, str) else str(resp))
        data = json.loads(raw)
        return {
            "title": (data.get("title") or "").strip()[:120],
            "message": (data.get("message") or "").strip(),
        }
    except json.JSONDecodeError:
        return {"title": "Aviso", "message": raw}
    except Exception as e:
        logger.error(f"AI generate-announcement error: {e}")
        raise HTTPException(status_code=502, detail=f"IA indisponível: {e}")


@api_router.post("/ai/check-answer")
async def ai_check_answer(payload: AICheckAnswerIn, admin: dict = Depends(require_admin)):
    await _ensure_ai_enabled()
    if not EMERGENT_KEY:
        raise HTTPException(status_code=503, detail="IA não configurada")
    answer = payload.student_answer.strip()
    if not answer:
        raise HTTPException(status_code=400, detail="Resposta vazia")
    system = (
        "Você é um professor corrigindo a resposta de um aluno. Português do Brasil. "
        "Aponte erros com empatia. Sugira feedback construtivo. Responda APENAS em JSON válido."
    )
    prompt = (
        f"Tarefa: {payload.task_title}\n"
        f"Enunciado: {payload.task_description}\n\n"
        f"Resposta do aluno:\n\"\"\"\n{answer}\n\"\"\"\n\n"
        "Retorne JSON com:\n"
        "- \"score\" (número de 0 a 10)\n"
        "- \"errors\" (array de strings apontando erros específicos, vazio se não houver)\n"
        "- \"feedback\" (string, mensagem construtiva de 1-2 parágrafos para enviar ao aluno)\n"
        "- \"suggestions\" (array de 2-3 sugestões de melhoria)"
    )
    try:
        chat = _new_ai_chat(f"check-{admin['id']}-{uuid.uuid4().hex[:8]}", system)
        resp = await chat.send_message(UserMessage(text=prompt))
        raw = _strip_json_fence(resp if isinstance(resp, str) else str(resp))
        data = json.loads(raw)
        return {
            "score": float(data.get("score", 0)),
            "errors": [e for e in (data.get("errors") or []) if isinstance(e, str)][:6],
            "feedback": (data.get("feedback") or "").strip(),
            "suggestions": [s for s in (data.get("suggestions") or []) if isinstance(s, str)][:4],
        }
    except json.JSONDecodeError:
        return {"score": 0, "errors": [], "feedback": raw, "suggestions": []}
    except Exception as e:
        logger.error(f"AI check-answer error: {e}")
        raise HTTPException(status_code=502, detail=f"IA indisponível: {e}")


@api_router.post("/ai/generate-task-answer")
async def ai_generate_task_answer(payload: AIGenTaskAnswerIn, admin: dict = Depends(require_admin)):
    """Admin-only: uses the task's admin_photos as visual input to generate a complete
    answer/solution for the task. Returns the answer as plain text — admin can then
    review/edit and save it back to the task via PUT /api/tasks/{id}.
    """
    await _ensure_ai_enabled()
    if not EMERGENT_KEY:
        raise HTTPException(status_code=503, detail="IA não configurada")
    task = await db.tasks.find_one({"id": payload.task_id}, {"_id": 0})
    if not task:
        raise HTTPException(status_code=404, detail="Tarefa não encontrada")
    photo_ids = task.get("admin_photos", []) or []
    if not photo_ids:
        raise HTTPException(status_code=400, detail="Adicione ao menos uma foto da tarefa antes de gerar a resposta")

    # Fetch photos as base64 image contents
    image_contents: List[ImageContent] = []
    for pid in photo_ids[:8]:  # cap to 8 images
        f = await db.files.find_one({"id": pid, "is_deleted": False}, {"_id": 0})
        if not f:
            continue
        ct = (f.get("content_type") or "").lower()
        if not ct.startswith("image/"):
            continue
        try:
            content, _ct = get_object(f["storage_path"])
            b64 = base64.b64encode(content).decode()
            image_contents.append(ImageContent(image_base64=b64))
        except Exception as e:
            logger.warning(f"Could not load photo {pid} for AI: {e}")
    if not image_contents:
        raise HTTPException(status_code=400, detail="Nenhuma foto válida encontrada. Envie imagens (jpg/png).")

    system = (
        "Você é um professor gerando um gabarito CURTO E DIRETO em português do Brasil. "
        "NÃO explique o raciocínio, NÃO adicione introdução, NÃO use markdown (nada de ** para negrito). "
        "Texto puro, sem cercas de código. Para cada questão da imagem, siga EXATAMENTE este formato:\n\n"
        "Questão N: <enunciado curto extraído da imagem>\n"
        "Resposta: <resposta final>\n"
        "\n"
        "Se for MATEMÁTICA ou CÁLCULO, mostre as CONTAS em UMA linha antes da resposta, por exemplo:\n"
        "Questão 1: 2 + 3\n"
        "Contas: 2 + 3 = 5\n"
        "Resposta: 5\n"
        "\n"
        "Separe as questões por uma linha em branco. NUNCA adicione títulos, conclusões, dicas ou observações extras."
    )
    hint = (payload.extra_hint or "").strip()
    prompt = (
        f"Matéria: {task.get('subject','')}\n"
        f"Título: {task.get('title','')}\n"
        f"Enunciado: {task.get('description','')}\n"
        + (f"Observações do professor: {hint}\n" if hint else "")
        + "\nAnalise as fotos e liste as questões com suas respostas no formato solicitado. "
        "Sem introdução, sem raciocínio explicado, sem negrito com **, sem markdown."
    )
    try:
        chat = _new_ai_chat(f"gen-answer-{admin['id']}-{payload.task_id}", system)
        resp = await chat.send_message(UserMessage(text=prompt, file_contents=image_contents))
        text = resp if isinstance(resp, str) else str(resp)
        # Post-process: strip markdown bold/italic, code fences, headings
        cleaned = _clean_answer_text(text)
        return {"answer": cleaned, "photos_used": len(image_contents)}
    except Exception as e:
        logger.error(f"AI generate-task-answer error: {e}")
        raise HTTPException(status_code=502, detail=f"IA indisponível: {e}")


@api_router.post("/ai/explain-task")
async def ai_explain_task(payload: AIExplainTaskIn, user: dict = Depends(get_current_user)):
    """Student-facing: explains what the task is asking without giving the answer."""
    await _ensure_ai_enabled()
    if not EMERGENT_KEY:
        raise HTTPException(status_code=503, detail="IA não configurada")
    task = await db.tasks.find_one({"id": payload.task_id}, {"_id": 0})
    if not task:
        raise HTTPException(status_code=404, detail="Tarefa não encontrada")
    # Ensure student can access this task
    if user["role"] == "aluno":
        assigned = task.get("assigned_to", []) or []
        if assigned and user["id"] not in assigned:
            raise HTTPException(status_code=403, detail="Sem acesso a essa tarefa")
    system = (
        "Você é um professor paciente ajudando um aluno a entender o que uma tarefa está pedindo. "
        "Português do Brasil, tom amigável, linguagem simples. "
        "NUNCA entregue a resposta pronta — sua função é EXPLICAR o que deve ser feito, dar dicas e conceitos-chave. "
        "Responda APENAS em JSON válido, sem texto extra."
    )
    prompt = (
        f"Matéria: {task.get('subject','')}\n"
        f"Título: {task.get('title','')}\n"
        f"Enunciado: {task.get('description','')}\n\n"
        "Retorne JSON com:\n"
        "- \"explanation\" (string, 2-3 parágrafos explicando com suas próprias palavras o que a tarefa pede)\n"
        "- \"key_concepts\" (array de 2-4 conceitos que o aluno precisa dominar)\n"
        "- \"tips\" (array de 2-4 dicas para começar SEM entregar a resposta)\n"
        "- \"first_step\" (string, o primeiro passinho pra o aluno começar)"
    )
    try:
        chat = _new_ai_chat(f"explain-{user['id']}-{payload.task_id}", system)
        resp = await chat.send_message(UserMessage(text=prompt))
        raw = _strip_json_fence(resp if isinstance(resp, str) else str(resp))
        data = json.loads(raw)
        return {
            "explanation": (data.get("explanation") or "").strip(),
            "key_concepts": [c for c in (data.get("key_concepts") or []) if isinstance(c, str)][:5],
            "tips": [t for t in (data.get("tips") or []) if isinstance(t, str)][:5],
            "first_step": (data.get("first_step") or "").strip(),
        }
    except json.JSONDecodeError:
        return {"explanation": raw, "key_concepts": [], "tips": [], "first_step": ""}
    except Exception as e:
        logger.error(f"AI explain-task error: {e}")
        raise HTTPException(status_code=502, detail=f"IA indisponível: {e}")


@api_router.post("/ai/chat")
async def ai_chat(payload: AIChatIn, user: dict = Depends(get_current_user)):
    """Multi-turn tutor chat. Optional task_id to bind the session to a task's context.

    Sessions are stored in db.ai_chats (one doc per session).
    Each POST appends user+assistant messages and returns the assistant reply.
    """
    await _ensure_ai_enabled()
    if not EMERGENT_KEY:
        raise HTTPException(status_code=503, detail="IA não configurada")
    text = payload.message.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Mensagem vazia")
    if len(text) > 1000:
        raise HTTPException(status_code=400, detail="Mensagem muito longa (máx 1000 caracteres)")

    session_id = payload.session_id or f"sess-{user['id']}-{uuid.uuid4().hex[:10]}"
    task_ctx = ""
    if payload.task_id:
        task = await db.tasks.find_one({"id": payload.task_id}, {"_id": 0})
        if task:
            task_ctx = (
                f"\n\nCONTEXTO DA TAREFA:\n"
                f"Matéria: {task.get('subject','')}\n"
                f"Título: {task.get('title','')}\n"
                f"Enunciado: {task.get('description','')}\n"
            )
    if user["role"] == "aluno":
        system = (
            "Você é um tutor amigável em português do Brasil. Ajude o aluno a APRENDER — nunca entregue "
            "respostas prontas de tarefas; guie com perguntas, dicas e explicações. Seja breve (até 4 parágrafos). "
            "Use exemplos claros e adequados à faixa etária escolar."
            + task_ctx
        )
    else:
        system = (
            "Você é um assistente pedagógico para o professor. Português do Brasil. Ajude com ideias, "
            "correções, planos de aula. Seja objetivo (até 4 parágrafos)."
            + task_ctx
        )

    # Load existing session (if any) — restore history via new chat + replay
    session_doc = await db.ai_chats.find_one({"id": session_id, "user_id": user["id"]}, {"_id": 0})
    history = session_doc.get("messages", []) if session_doc else []

    # Build a fresh LlmChat and replay history by sending previous user messages
    # (library maintains its own history from send_message calls in this instance).
    chat = _new_ai_chat(session_id, system)
    # Replay: send all prior user messages so the library re-computes assistant history.
    # This is a simple approach; for heavier use, migrate to library's message import when available.
    # NOTE: we cache the last N=20 turns only to keep prompt size manageable.
    prior_user_msgs = [m["content"] for m in history if m.get("role") == "user"][-20:]
    for prev in prior_user_msgs:
        try:
            await chat.send_message(UserMessage(text=prev))
        except Exception:
            pass  # tolerate; continue with fresh call below

    try:
        resp = await chat.send_message(UserMessage(text=text))
        answer = resp if isinstance(resp, str) else str(resp)
    except Exception as e:
        logger.error(f"AI chat error: {e}")
        raise HTTPException(status_code=502, detail=f"IA indisponível: {e}")

    now = datetime.now(timezone.utc).isoformat()
    history.append({"role": "user", "content": text, "ts": now})
    history.append({"role": "assistant", "content": answer, "ts": now})

    await db.ai_chats.update_one(
        {"id": session_id, "user_id": user["id"]},
        {"$set": {
            "id": session_id,
            "user_id": user["id"],
            "task_id": payload.task_id,
            "kind": "task_help" if payload.task_id else "free",
            "messages": history[-60:],  # keep last 60 msgs
            "updated_at": now,
        }, "$setOnInsert": {"created_at": now}},
        upsert=True,
    )
    return {"session_id": session_id, "message": answer, "history_len": len(history)}


@api_router.get("/ai/chat/{session_id}")
async def ai_chat_history(session_id: str, user: dict = Depends(get_current_user)):
    doc = await db.ai_chats.find_one({"id": session_id, "user_id": user["id"]}, {"_id": 0})
    if not doc:
        return {"session_id": session_id, "messages": []}
    return {"session_id": session_id, "messages": doc.get("messages", []), "task_id": doc.get("task_id")}


@api_router.delete("/ai/chat/{session_id}")
async def ai_chat_delete(session_id: str, user: dict = Depends(get_current_user)):
    await db.ai_chats.delete_one({"id": session_id, "user_id": user["id"]})
    return {"ok": True}


@api_router.get("/ai/daily-summary")
async def ai_daily_summary(user: dict = Depends(get_current_user)):
    """Short personalized summary of the student's pending tasks for today."""
    if not await _ai_enabled():
        return {"summary": "", "count": 0, "disabled": True}
    if not EMERGENT_KEY:
        raise HTTPException(status_code=503, detail="IA não configurada")
    if user["role"] != "aluno":
        raise HTTPException(status_code=403, detail="Somente alunos")
    # Pull student's assigned open tasks
    tasks = await db.tasks.find({}, {"_id": 0}).to_list(1000)
    my_tasks = []
    completed = await db.completions.find({"user_id": user["id"]}, {"_id": 0}).to_list(1000)
    completed_ids = {c["task_id"] for c in completed}
    for t in tasks:
        assigned = t.get("assigned_to", []) or []
        if assigned and user["id"] not in assigned:
            continue
        if t["id"] in completed_ids:
            continue
        my_tasks.append(t)
    if not my_tasks:
        return {"summary": "Você está em dia! Nenhuma tarefa pendente. 🎉", "count": 0}
    task_list = "\n".join([f"- {t['subject']}: {t['title']} (entrega {t.get('due_date','')})" for t in my_tasks[:10]])
    system = (
        "Você é um coach amigável de estudos em português do Brasil. Seja breve (2-3 frases), motivador, "
        "e sugira uma ordem prática. Sem formatação markdown."
    )
    prompt = (
        f"O aluno {user['name']} tem {len(my_tasks)} tarefa(s) pendente(s):\n{task_list}\n\n"
        "Escreva um resumo curto e amigável (máx. 3 frases) indicando por onde começar e uma frase de motivação."
    )
    try:
        chat = _new_ai_chat(f"summary-{user['id']}-{datetime.now(timezone.utc).date().isoformat()}", system)
        resp = await chat.send_message(UserMessage(text=prompt))
        text = resp if isinstance(resp, str) else str(resp)
        return {"summary": text.strip(), "count": len(my_tasks)}
    except Exception as e:
        logger.error(f"AI daily-summary error: {e}")
        return {"summary": f"Você tem {len(my_tasks)} tarefa(s) pendente(s). Vamos nessa! 🚀", "count": len(my_tasks)}


@api_router.get("/ai/monthly-report/{user_id}")
async def ai_monthly_report(user_id: str, admin: dict = Depends(require_admin)):
    """Admin-only: AI-generated monthly report per student.
    Analyses tasks completion, points evolution, streak and gives personalized feedback.
    """
    await _ensure_ai_enabled()
    if not EMERGENT_KEY:
        raise HTTPException(status_code=503, detail="IA não configurada")
    student = await db.users.find_one({"id": user_id, "role": "aluno"}, {"_id": 0})
    if not student:
        raise HTTPException(status_code=404, detail="Aluno não encontrado")

    now = datetime.now(timezone.utc)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    all_tasks = await db.tasks.find({}, {"_id": 0}).to_list(2000)
    my_tasks = [t for t in all_tasks if not t.get("assigned_to") or user_id in (t.get("assigned_to") or [])]
    completions = await db.completions.find({"user_id": user_id}, {"_id": 0}).to_list(2000)
    completed_ids = {c["task_id"] for c in completions}
    my_month_completions = [c for c in completions if c.get("completed_at", "") >= month_start.isoformat()]

    total_assigned = len(my_tasks)
    total_completed_ever = sum(1 for t in my_tasks if t["id"] in completed_ids)
    pct = round((total_completed_ever / total_assigned * 100) if total_assigned else 0)
    late = 0
    on_time = 0
    for c in my_month_completions:
        t = next((x for x in my_tasks if x["id"] == c["task_id"]), None)
        if not t or not t.get("due_date"):
            continue
        try:
            if c.get("completed_at", "")[:10] <= t["due_date"]:
                on_time += 1
            else:
                late += 1
        except Exception:
            pass

    # Subjects breakdown
    by_subject = {}
    for t in my_tasks:
        subj = t.get("subject", "-")
        by_subject.setdefault(subj, {"total": 0, "done": 0})
        by_subject[subj]["total"] += 1
        if t["id"] in completed_ids:
            by_subject[subj]["done"] += 1

    system = (
        "Você é um pedagogo experiente. Escreva um bilhete curto e sincero em português do Brasil, "
        "dirigido aos pais do aluno, com base nos dados abaixo. Tom respeitoso, factual e construtivo. "
        "3 parágrafos: (1) desempenho geral, (2) pontos fortes/matérias em destaque, (3) sugestões práticas. "
        "Sem markdown pesado — texto corrido."
    )
    prompt = (
        f"Aluno: {student['name']}\n"
        f"Patente atual (pontos): {student.get('points', 0)}\n"
        f"Sequência (streak): {student.get('streak', 0)} dias\n"
        f"Tarefas do mês concluídas: {len(my_month_completions)} (no prazo: {on_time}, atrasadas: {late})\n"
        f"Progresso geral: {total_completed_ever}/{total_assigned} tarefas concluídas ({pct}%)\n"
        f"Por matéria: " + ", ".join([f"{s} {v['done']}/{v['total']}" for s, v in by_subject.items()]) +
        "\n\nEscreva o bilhete agora."
    )
    try:
        chat = _new_ai_chat(f"report-{user_id}-{now.strftime('%Y%m')}", system)
        resp = await chat.send_message(UserMessage(text=prompt))
        text = resp if isinstance(resp, str) else str(resp)
        return {
            "student": {"id": student["id"], "name": student["name"], "points": student.get("points", 0), "streak": student.get("streak", 0)},
            "metrics": {
                "total_assigned": total_assigned,
                "total_completed": total_completed_ever,
                "completion_pct": pct,
                "month_completions": len(my_month_completions),
                "on_time": on_time,
                "late": late,
                "by_subject": by_subject,
            },
            "report": text.strip(),
            "generated_at": now.isoformat(),
        }
    except Exception as e:
        logger.error(f"AI monthly-report error: {e}")
        raise HTTPException(status_code=502, detail=f"IA indisponível: {e}")


@api_router.get("/ai/prize-tips")
async def ai_prize_tips(user: dict = Depends(get_current_user)):
    """Student-facing: AI analyses the leaderboard + user's stats and gives concrete
    tips to improve chances of winning the monthly prize.
    """
    if not await _ai_enabled():
        return {"tips": "IA desativada pelo administrador.", "disabled": True}
    if not EMERGENT_KEY:
        raise HTTPException(status_code=503, detail="IA não configurada")
    if user["role"] != "aluno":
        raise HTTPException(status_code=403, detail="Somente alunos")

    # Fetch prize + leaderboard
    prize_doc = await db.settings.find_one({"id": "monthly_prize"}, {"_id": 0})
    prize_title = prize_doc.get("title", "Prêmio do mês") if prize_doc else "Prêmio do mês"

    students = await db.users.find({"role": "aluno", "status": "active"}, {"_id": 0}).to_list(500)
    # Compute on-time task metrics for this month for every student
    now_utc = datetime.now(timezone.utc)
    month_start = now_utc.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    tasks_by_id = {t["id"]: t for t in await db.tasks.find({}, {"_id": 0, "id": 1, "due_date": 1}).to_list(5000)}
    all_completions = await db.completions.find({}, {"_id": 0}).to_list(10000)
    stats_map = {}
    for c in all_completions:
        uid = c["user_id"]
        stats_map.setdefault(uid, {"total": 0, "month": 0, "on_time_month": 0})
        stats_map[uid]["total"] += 1
        if c.get("completed_at", "") >= month_start.isoformat():
            stats_map[uid]["month"] += 1
            due = (tasks_by_id.get(c["task_id"], {}) or {}).get("due_date", "9999-12-31")
            if (c.get("completed_at") or "")[:10] <= due:
                stats_map[uid]["on_time_month"] += 1

    def perf_key(s):
        st = stats_map.get(s["id"], {"total": 0, "month": 0, "on_time_month": 0})
        return (st["on_time_month"], st["month"], s.get("streak", 0) or 0, st["total"], s["name"])

    students_sorted = sorted(students, key=perf_key, reverse=True)
    rank = next((i + 1 for i, s in enumerate(students_sorted) if s["id"] == user["id"]), len(students_sorted))
    total = len(students_sorted)
    my = next((s for s in students_sorted if s["id"] == user["id"]), None)
    if not my:
        raise HTTPException(status_code=404, detail="Aluno não encontrado")
    my_st = stats_map.get(user["id"], {"total": 0, "month": 0, "on_time_month": 0})
    leader = students_sorted[0] if students_sorted else my
    leader_st = stats_map.get(leader["id"], {"total": 0, "month": 0, "on_time_month": 0})
    gap_on_time = max(0, leader_st["on_time_month"] - my_st["on_time_month"])

    system = (
        "Você é um coach motivador de estudos em português do Brasil. Fale direto com o aluno (você). "
        "Seja específico, breve (3-5 frases), realista e amigável. Sem markdown."
    )
    prompt = (
        f"O aluno {user['name']} está na posição {rank}º de {total} pelo prêmio \"{prize_title}\".\n"
        f"Neste mês: {my_st['on_time_month']} tarefas concluídas no prazo, {my_st['month']} no total. Sequência: {my.get('streak', 0)} dias.\n"
        f"O líder tem {leader_st['on_time_month']} entregas no prazo ({gap_on_time} de vantagem sobre ele).\n"
        "Dê 3 dicas ESPECÍFICAS e práticas para ele melhorar as chances de vencer neste mês. "
        "Foque em: entregar no prazo, manter constância diária, cobrir diferentes matérias. "
        "Se ele já for líder, dê dicas para manter a liderança."
    )
    try:
        chat = _new_ai_chat(f"prize-tips-{user['id']}", system)
        resp = await chat.send_message(UserMessage(text=prompt))
        text = resp if isinstance(resp, str) else str(resp)
        return {
            "rank": rank,
            "total": total,
            "gap_on_time": gap_on_time,
            "my_on_time": my_st["on_time_month"],
            "my_month": my_st["month"],
            "leader_on_time": leader_st["on_time_month"],
            "tips": text.strip(),
        }
    except Exception as e:
        logger.error(f"AI prize-tips error: {e}")
        raise HTTPException(status_code=502, detail=f"IA indisponível: {e}")


@api_router.get("/ai/prize-evaluate")
async def ai_prize_evaluate(admin: dict = Depends(require_admin)):
    """Admin-only: AI evaluates task performance (completions, on-time delivery,
    streak, subject variety) and suggests a winner. POINTS are NOT considered —
    points are used only for buying profile effects.
    """
    await _ensure_ai_enabled()
    if not EMERGENT_KEY:
        raise HTTPException(status_code=503, detail="IA não configurada")
    prize_doc = await db.settings.find_one({"id": "monthly_prize"}, {"_id": 0})
    prize_title = prize_doc.get("title", "Prêmio do mês") if prize_doc else "Prêmio do mês"

    students = await db.users.find({"role": "aluno", "status": "active"}, {"_id": 0}).to_list(500)
    if not students:
        return {"suggestion": "Nenhum aluno cadastrado.", "candidates": []}

    now = datetime.now(timezone.utc)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    all_tasks = await db.tasks.find({}, {"_id": 0, "id": 1, "due_date": 1, "subject": 1}).to_list(5000)
    task_meta = {t["id"]: t for t in all_tasks}
    all_completions = await db.completions.find({}, {"_id": 0}).to_list(10000)
    stats_per = {}
    for c in all_completions:
        uid = c["user_id"]
        s = stats_per.setdefault(uid, {"total": 0, "month": 0, "on_time_month": 0, "late_month": 0, "subjects": set()})
        s["total"] += 1
        t = task_meta.get(c["task_id"])
        if not t:
            continue
        if c.get("completed_at", "") >= month_start.isoformat():
            s["month"] += 1
            due = t.get("due_date", "9999-12-31")
            if (c.get("completed_at") or "")[:10] <= due:
                s["on_time_month"] += 1
            else:
                s["late_month"] += 1
            if t.get("subject"):
                s["subjects"].add(t["subject"])

    # Sort by task performance only — NO points
    def perf_key(s):
        st = stats_per.get(s["id"], {"total": 0, "month": 0, "on_time_month": 0, "subjects": set()})
        return (st["on_time_month"], st["month"], s.get("streak", 0) or 0, len(st["subjects"]), st["total"])

    students_sorted = sorted(students, key=perf_key, reverse=True)
    top = students_sorted[:10]

    candidates_data = []
    for s in top:
        cs = stats_per.get(s["id"], {"total": 0, "month": 0, "on_time_month": 0, "late_month": 0, "subjects": set()})
        candidates_data.append({
            "id": s["id"], "name": s["name"],
            "streak": s.get("streak", 0), "longest_streak": s.get("longest_streak", 0),
            "total_completions": cs["total"], "month_completions": cs["month"],
            "on_time_month": cs["on_time_month"], "late_month": cs["late_month"],
            "subject_variety": len(cs["subjects"]),
            "subjects": sorted(cs["subjects"]),
        })

    system = (
        "Você é um pedagogo justo escolhendo o vencedor mensal com base em DESEMPENHO ACADÊMICO. "
        "Português do Brasil. Analise: tarefas concluídas no mês (peso alto), entregas no prazo (peso alto), "
        "sequência atual e mais longa, e variedade de matérias. IGNORE pontos de perfil (isso é só para loja). "
        "Responda APENAS em JSON válido: {\"winner_id\":\"...\",\"winner_name\":\"...\",\"justification\":\"...\",\"criteria\":[\"...\",\"...\"]}"
    )
    prompt = (
        f"Prêmio: {prize_title}\n\nCandidatos (top 10):\n" +
        "\n".join([
            f"- {c['name']} (id={c['id']}): mês={c['month_completions']} concluídas ({c['on_time_month']} no prazo, {c['late_month']} atrasadas), "
            f"streak {c['streak']}d (recorde {c['longest_streak']}d), matérias variadas: {c['subject_variety']} ({', '.join(c['subjects']) or '-'}), "
            f"histórico total: {c['total_completions']}"
            for c in candidates_data
        ]) +
        "\n\nEscolha o vencedor mais merecedor, justificando em 2-3 frases claras e listando 2-3 critérios usados."
    )
    try:
        chat = _new_ai_chat(f"prize-eval-{now.strftime('%Y%m')}", system)
        resp = await chat.send_message(UserMessage(text=prompt))
        raw = _strip_json_fence(resp if isinstance(resp, str) else str(resp))
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            data = {"winner_id": candidates_data[0]["id"], "winner_name": candidates_data[0]["name"], "justification": raw, "criteria": []}
        return {
            "winner_id": data.get("winner_id") or candidates_data[0]["id"],
            "winner_name": data.get("winner_name") or candidates_data[0]["name"],
            "justification": (data.get("justification") or "").strip(),
            "criteria": [c for c in (data.get("criteria") or []) if isinstance(c, str)][:5],
            "candidates": candidates_data,
        }
    except Exception as e:
        logger.error(f"AI prize-evaluate error: {e}")
        raise HTTPException(status_code=502, detail=f"IA indisponível: {e}")


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
    task = await db.tasks.find_one({"id": task_id})
    if not task:
        raise HTTPException(status_code=404, detail="Tarefa não encontrada")
    existing = await db.completions.find_one({"task_id": task_id, "user_id": user["id"]})
    if existing:
        return {"ok": True, "completed_at": existing["completed_at"], "points_earned": 0}
    completed_at = datetime.now(timezone.utc).isoformat()
    await db.completions.insert_one({
        "task_id": task_id, "user_id": user["id"], "completed_at": completed_at,
    })
    # Award points: task.points if on-time, 30% (min 1) if late
    today = _br_today_iso()
    on_time = task.get("due_date", "9999-12-31") >= today
    base_points = int(task.get("points") or 10)
    if base_points < 0:
        base_points = 0
    earned = base_points if on_time else max(1, int(base_points * 0.3))
    new_total = await _add_points(user["id"], earned)
    return {"ok": True, "completed_at": completed_at, "points_earned": earned, "total_points": new_total, "on_time": on_time}


@api_router.post("/tasks/{task_id}/uncomplete")
async def uncomplete_task(task_id: str, user: dict = Depends(get_current_user)):
    if user["role"] != "aluno":
        raise HTTPException(status_code=403, detail="Apenas alunos podem desmarcar tarefas")
    task = await db.tasks.find_one({"id": task_id})
    completion = await db.completions.find_one({"task_id": task_id, "user_id": user["id"]})
    await db.completions.delete_one({"task_id": task_id, "user_id": user["id"]})
    if completion and task:
        # subtract points awarded
        today = _br_today_iso()
        completed_at = completion.get("completed_at", "")
        completed_date = completed_at.split("T")[0] if completed_at else today
        on_time = task.get("due_date", "9999-12-31") >= completed_date
        base_points = int(task.get("points") or 10)
        if base_points < 0:
            base_points = 0
        awarded = base_points if on_time else max(1, int(base_points * 0.3))
        await _add_points(user["id"], -awarded)
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
    await db.login_logs.create_index("id", unique=True)
    await db.login_logs.create_index("created_at")

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

    # Seed app info if missing
    if not await db.settings.find_one({"id": "app_info"}):
        await db.settings.insert_one({
            **DEFAULT_APP_INFO,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        })
        logger.info("App info seeded")

    # Start periodic cleanup loop
    asyncio.create_task(_cleanup_loop())


async def _run_cleanup():
    """Delete expired login logs and tasks past their 12:30 PM (BR) cutoff."""
    now_utc = datetime.now(timezone.utc)
    # 1. Delete login logs older than retention window
    cutoff = (now_utc - timedelta(days=LOG_RETENTION_DAYS)).isoformat()
    log_res = await db.login_logs.delete_many({"created_at": {"$lt": cutoff}})
    if log_res.deleted_count:
        logger.info(f"Cleanup: removed {log_res.deleted_count} expired login logs")

    # 2. Delete tasks whose due_date <= today (BR) AND BR-time is past 12:30
    now_br = now_utc.astimezone(BR_TZ)
    today_br = now_br.date()
    if now_br.time() >= TASK_CUTOFF_TIME:
        # Today's tasks past 12:30 + any overdue tasks
        task_res = await db.tasks.delete_many({"due_date": {"$lte": today_br.isoformat()}})
    else:
        # Only strictly overdue tasks (before today)
        task_res = await db.tasks.delete_many({"due_date": {"$lt": today_br.isoformat()}})
    if task_res.deleted_count:
        logger.info(f"Cleanup: removed {task_res.deleted_count} expired tasks")


async def _cleanup_loop():
    """Run cleanup every 60 seconds."""
    while True:
        try:
            await _run_cleanup()
        except Exception as e:
            logger.error(f"Cleanup error: {e}")
        await asyncio.sleep(60)


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
