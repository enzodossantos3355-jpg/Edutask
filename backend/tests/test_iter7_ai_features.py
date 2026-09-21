"""Iteration 7 - AI Features tests (Gemini 3 Flash Vision).

Covers:
- /api/ai/improve-task, /generate-announcement, /check-answer (admin)
- /api/ai/explain-task (student/admin)
- /api/ai/chat (multi-turn context) + GET history + DELETE
- /api/ai/daily-summary (student only, 403 for admin)
- /api/ai/generate-task-answer with vision (photos) + security (403 for student)
- Task model: admin_photos + answer; students must NOT see admin_photos
"""
import base64
import io
import os
import time
import uuid

import pytest
import requests
from PIL import Image

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://escola-tasks-pro.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
ADMIN_EMAIL = "admin@escola.com"
ADMIN_PASSWORD = "enzo123cg"


# --------------------------- Fixtures ---------------------------
@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def student_setup(admin_token):
    """Create a fresh test student, log in, return (user_id, token, headers)."""
    ah = {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}
    name = f"TEST_ai_student_{uuid.uuid4().hex[:6]}"
    pwd = "student123"
    r = requests.post(f"{API}/users", json={"name": name, "password": pwd}, headers=ah, timeout=15)
    assert r.status_code in (200, 201), r.text
    uid = r.json()["id"]
    # Login as student (user_id-based)
    r2 = requests.post(f"{API}/auth/login", json={"user_id": uid, "password": pwd}, timeout=15)
    assert r2.status_code == 200, r2.text
    tok = r2.json()["token"]
    yield {"id": uid, "token": tok, "headers": {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}}
    # cleanup
    requests.delete(f"{API}/users/{uid}", headers=ah, timeout=15)


def _png_bytes():
    img = Image.new("RGB", (64, 64), color=(255, 255, 255))
    # draw simple text-like squares
    for x in range(10, 55, 8):
        for y in range(20, 50, 8):
            img.putpixel((x, y), (0, 0, 0))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


# --------------------------- Health ---------------------------
def test_root():
    r = requests.get(f"{API}/", timeout=15)
    assert r.status_code == 200


# --------------------------- AI: improve-task ---------------------------
def test_ai_improve_task(admin_headers):
    r = requests.post(
        f"{API}/ai/improve-task",
        json={"title": "Frações equivalentes", "subject": "Matemática", "hint": "6º ano"},
        headers=admin_headers,
        timeout=60,
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert "description" in data and isinstance(data["description"], str)
    assert len(data["description"]) > 20
    assert isinstance(data.get("tips"), list)
    assert isinstance(data.get("objectives"), list)


def test_ai_improve_task_requires_admin(student_setup):
    r = requests.post(
        f"{API}/ai/improve-task",
        json={"title": "x", "subject": "y"},
        headers=student_setup["headers"],
        timeout=30,
    )
    assert r.status_code == 403


# --------------------------- AI: generate-announcement ---------------------------
def test_ai_generate_announcement(admin_headers):
    r = requests.post(
        f"{API}/ai/generate-announcement",
        json={"prompt": "Lembrar reunião de pais quinta-feira às 19h"},
        headers=admin_headers,
        timeout=60,
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert isinstance(data.get("title"), str) and len(data["title"]) > 0
    assert isinstance(data.get("message"), str) and len(data["message"]) > 10


# --------------------------- AI: check-answer ---------------------------
def test_ai_check_answer(admin_headers):
    r = requests.post(
        f"{API}/ai/check-answer",
        json={
            "task_title": "Frações",
            "task_description": "Some 1/2 + 1/4",
            "student_answer": "3/4",
        },
        headers=admin_headers,
        timeout=60,
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert "score" in data
    assert isinstance(data.get("errors"), list)
    assert isinstance(data.get("suggestions"), list)


# --------------------------- AI: explain-task ---------------------------
def test_ai_explain_task_student(admin_headers, student_setup):
    # Create a task assigned to student
    tid = None
    payload = {
        "subject": "Matemática",
        "title": "TEST_AI_explain",
        "description": "Resolva 2x + 3 = 11",
        "due_date": "2099-12-31",
        "attachments": [],
        "assigned_to": [student_setup["id"]],
    }
    r = requests.post(f"{API}/tasks", json=payload, headers=admin_headers, timeout=15)
    assert r.status_code == 200, r.text
    tid = r.json()["id"]
    try:
        r2 = requests.post(f"{API}/ai/explain-task", json={"task_id": tid}, headers=student_setup["headers"], timeout=60)
        assert r2.status_code == 200, r2.text
        d = r2.json()
        assert isinstance(d.get("explanation"), str) and len(d["explanation"]) > 10
        assert isinstance(d.get("key_concepts"), list)
        assert isinstance(d.get("tips"), list)
    finally:
        requests.delete(f"{API}/tasks/{tid}", headers=admin_headers, timeout=15)


# --------------------------- AI: daily-summary ---------------------------
def test_ai_daily_summary_admin_forbidden(admin_headers):
    r = requests.get(f"{API}/ai/daily-summary", headers=admin_headers, timeout=30)
    assert r.status_code == 403


def test_ai_daily_summary_student(student_setup):
    r = requests.get(f"{API}/ai/daily-summary", headers=student_setup["headers"], timeout=60)
    assert r.status_code == 200, r.text
    d = r.json()
    assert "summary" in d
    assert "count" in d


# --------------------------- AI: chat multi-turn ---------------------------
def test_ai_chat_context_and_history(student_setup):
    h = student_setup["headers"]
    # 1st turn
    r1 = requests.post(f"{API}/ai/chat", json={"message": "Meu nome é Marina e adoro matemática."}, headers=h, timeout=60)
    assert r1.status_code == 200, r1.text
    sess = r1.json()["session_id"]
    assert sess
    # 2nd turn - reference previous context
    r2 = requests.post(f"{API}/ai/chat", json={"session_id": sess, "message": "Qual é o meu nome?"}, headers=h, timeout=60)
    assert r2.status_code == 200, r2.text
    reply = r2.json()["message"].lower()
    # LLM should remember "Marina"
    assert "marina" in reply, f"Context not retained. Reply: {reply}"

    # GET history
    r3 = requests.get(f"{API}/ai/chat/{sess}", headers=h, timeout=15)
    assert r3.status_code == 200
    msgs = r3.json()["messages"]
    assert len(msgs) >= 4

    # DELETE
    r4 = requests.delete(f"{API}/ai/chat/{sess}", headers=h, timeout=15)
    assert r4.status_code == 200
    r5 = requests.get(f"{API}/ai/chat/{sess}", headers=h, timeout=15)
    assert r5.status_code == 200
    assert r5.json()["messages"] == []


# --------------------------- AI: generate-task-answer (vision) ---------------------------
def test_generate_task_answer_no_photos_returns_400(admin_headers):
    payload = {
        "subject": "Matemática",
        "title": "TEST_AI_no_photos",
        "description": "sem fotos",
        "due_date": "2099-12-31",
        "attachments": [],
        "assigned_to": [],
    }
    r = requests.post(f"{API}/tasks", json=payload, headers=admin_headers, timeout=15)
    tid = r.json()["id"]
    try:
        r2 = requests.post(
            f"{API}/ai/generate-task-answer",
            json={"task_id": tid},
            headers=admin_headers,
            timeout=30,
        )
        assert r2.status_code == 400, r2.text
    finally:
        requests.delete(f"{API}/tasks/{tid}", headers=admin_headers, timeout=15)


def test_generate_task_answer_with_photo(admin_headers, admin_token):
    # 1) upload a PNG
    files = {"file": ("q.png", _png_bytes(), "image/png")}
    ur = requests.post(
        f"{API}/files/upload",
        files=files,
        headers={"Authorization": f"Bearer {admin_token}"},
        timeout=30,
    )
    assert ur.status_code == 200, ur.text
    fid = ur.json()["id"]

    # 2) create task
    payload = {
        "subject": "Matemática",
        "title": "TEST_AI_vision",
        "description": "Resolva os exercícios das fotos",
        "due_date": "2099-12-31",
        "attachments": [],
        "assigned_to": [],
    }
    tr = requests.post(f"{API}/tasks", json=payload, headers=admin_headers, timeout=15)
    tid = tr.json()["id"]

    try:
        # 3) attach photo via PUT
        pr = requests.put(f"{API}/tasks/{tid}", json={"admin_photos": [fid]}, headers=admin_headers, timeout=15)
        assert pr.status_code == 200, pr.text

        # 4) call generate-task-answer (real Gemini call; allow retry once)
        last = None
        for attempt in range(2):
            gr = requests.post(
                f"{API}/ai/generate-task-answer",
                json={"task_id": tid},
                headers=admin_headers,
                timeout=90,
            )
            last = gr
            if gr.status_code == 200:
                break
            time.sleep(2)
        assert last.status_code == 200, last.text
        d = last.json()
        assert isinstance(d.get("answer"), str) and len(d["answer"]) > 10
        assert d.get("photos_used", 0) >= 1
    finally:
        requests.delete(f"{API}/tasks/{tid}", headers=admin_headers, timeout=15)


def test_generate_task_answer_forbidden_for_student(admin_headers, student_setup):
    payload = {
        "subject": "Matemática",
        "title": "TEST_AI_sec",
        "description": "x",
        "due_date": "2099-12-31",
        "attachments": [],
        "assigned_to": [student_setup["id"]],
    }
    tr = requests.post(f"{API}/tasks", json=payload, headers=admin_headers, timeout=15)
    tid = tr.json()["id"]
    try:
        r = requests.post(
            f"{API}/ai/generate-task-answer",
            json={"task_id": tid},
            headers=student_setup["headers"],
            timeout=30,
        )
        assert r.status_code == 403, r.text
    finally:
        requests.delete(f"{API}/tasks/{tid}", headers=admin_headers, timeout=15)


# --------------------------- Task model: admin_photos + answer ---------------------------
def test_task_admin_photos_and_answer_visibility(admin_headers, admin_token, student_setup):
    # Upload a file
    files = {"file": ("q2.png", _png_bytes(), "image/png")}
    ur = requests.post(
        f"{API}/files/upload",
        files=files,
        headers={"Authorization": f"Bearer {admin_token}"},
        timeout=30,
    )
    fid = ur.json()["id"]

    payload = {
        "subject": "Matemática",
        "title": "TEST_AI_visibility",
        "description": "checar visibilidade",
        "due_date": "2099-12-31",
        "attachments": [],
        "assigned_to": [student_setup["id"]],
        "admin_photos": [fid],
        "answer": "Gabarito: x=4",
    }
    r = requests.post(f"{API}/tasks", json=payload, headers=admin_headers, timeout=15)
    assert r.status_code == 200, r.text
    tid = r.json()["id"]

    try:
        # Admin GET
        ra = requests.get(f"{API}/tasks", headers=admin_headers, timeout=15)
        assert ra.status_code == 200
        atask = next((t for t in ra.json() if t["id"] == tid), None)
        assert atask is not None
        assert atask.get("answer") == "Gabarito: x=4"
        assert isinstance(atask.get("admin_photos"), list) and len(atask["admin_photos"]) == 1
        assert atask["admin_photos"][0]["id"] == fid

        # Student GET - should NOT see admin_photos, MUST see answer
        rs = requests.get(f"{API}/tasks", headers=student_setup["headers"], timeout=15)
        assert rs.status_code == 200
        stask = next((t for t in rs.json() if t["id"] == tid), None)
        assert stask is not None
        assert "admin_photos" not in stask, f"admin_photos leaked to student: {stask}"
        assert stask.get("answer") == "Gabarito: x=4"
    finally:
        requests.delete(f"{API}/tasks/{tid}", headers=admin_headers, timeout=15)


# --------------------------- Regression: normal task CRUD ---------------------------
def test_regression_task_and_announcement_crud(admin_headers):
    # task
    t = requests.post(f"{API}/tasks", json={
        "subject": "Ciências", "title": "TEST_reg_task", "description": "d",
        "due_date": "2099-12-31", "attachments": [], "assigned_to": [],
    }, headers=admin_headers, timeout=15)
    assert t.status_code == 200
    tid = t.json()["id"]
    u = requests.put(f"{API}/tasks/{tid}", json={"title": "TEST_reg_task_edited"}, headers=admin_headers, timeout=15)
    assert u.status_code == 200
    d = requests.delete(f"{API}/tasks/{tid}", headers=admin_headers, timeout=15)
    assert d.status_code == 200

    # announcement
    a = requests.post(f"{API}/announcements", json={"title": "TEST_reg_ann", "message": "hi"}, headers=admin_headers, timeout=15)
    assert a.status_code == 200
    aid = a.json()["id"]
    au = requests.put(f"{API}/announcements/{aid}", json={"title": "TEST_reg_ann_edit"}, headers=admin_headers, timeout=15)
    assert au.status_code == 200
    ad = requests.delete(f"{API}/announcements/{aid}", headers=admin_headers, timeout=15)
    assert ad.status_code == 200
