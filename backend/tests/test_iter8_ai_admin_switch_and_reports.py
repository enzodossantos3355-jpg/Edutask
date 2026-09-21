"""Iteration 8 tests:
- BUG FIX: task due_date persists exactly (no timezone shift).
- AI kill-switch (/api/ai/status) GET/PUT + gating on all AI endpoints.
- New AI endpoints: /api/ai/monthly-report/{user_id}, /api/ai/prize-tips, /api/ai/prize-evaluate.
"""
import os
import time
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL must be set"

ADMIN_EMAIL = "admin@escola.com"
ADMIN_PASSWORD = "enzo123cg"


# --------------- fixtures ---------------
@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="session")
def admin_h(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="session")
def student(admin_h):
    """Create a fresh student for the test session."""
    name = f"TEST_iter8_{int(time.time())}"
    pw = "test1234"
    r = requests.post(f"{BASE_URL}/api/users", headers=admin_h,
                      json={"name": name, "password": pw}, timeout=30)
    assert r.status_code in (200, 201), r.text
    u = r.json()
    yield {**u, "password": pw}
    requests.delete(f"{BASE_URL}/api/users/{u['id']}", headers=admin_h, timeout=30)


@pytest.fixture(scope="session")
def student_token(student):
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"user_id": student["id"], "password": student["password"]}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="session")
def student_h(student_token):
    return {"Authorization": f"Bearer {student_token}"}


@pytest.fixture(autouse=True)
def _ai_reset(admin_h):
    """Ensure AI is enabled before each test and after each test."""
    requests.put(f"{BASE_URL}/api/ai/status", headers=admin_h, json={"enabled": True}, timeout=15)
    yield
    requests.put(f"{BASE_URL}/api/ai/status", headers=admin_h, json={"enabled": True}, timeout=15)


# --------------- BUG FIX: due_date ---------------
def test_due_date_no_timezone_shift(admin_h):
    """POST a task with due_date '2026-10-15' then GET it back — must be exactly '2026-10-15'."""
    payload = {
        "title": "TEST_iter8_datebug",
        "subject": "Matemática",
        "description": "date shift check",
        "due_date": "2026-10-15",
    }
    r = requests.post(f"{BASE_URL}/api/tasks", headers=admin_h, json=payload, timeout=30)
    assert r.status_code in (200, 201), r.text
    task = r.json()
    task_id = task["id"]
    try:
        assert task["due_date"] == "2026-10-15", f"POST response shifted: {task['due_date']}"
        # GET the list and find our task
        r2 = requests.get(f"{BASE_URL}/api/tasks", headers=admin_h, timeout=30)
        assert r2.status_code == 200
        found = next((t for t in r2.json() if t["id"] == task_id), None)
        assert found is not None, "task not found in list"
        assert found["due_date"] == "2026-10-15", f"GET returned {found['due_date']}"
    finally:
        requests.delete(f"{BASE_URL}/api/tasks/{task_id}", headers=admin_h, timeout=30)


# --------------- /api/ai/status ---------------
def test_ai_status_get_admin(admin_h):
    r = requests.get(f"{BASE_URL}/api/ai/status", headers=admin_h, timeout=15)
    assert r.status_code == 200
    assert r.json().get("enabled") is True


def test_ai_status_get_student(student_h):
    r = requests.get(f"{BASE_URL}/api/ai/status", headers=student_h, timeout=15)
    assert r.status_code == 200
    assert "enabled" in r.json()


def test_ai_status_put_student_forbidden(student_h):
    r = requests.put(f"{BASE_URL}/api/ai/status", headers=student_h, json={"enabled": False}, timeout=15)
    assert r.status_code == 403


def test_ai_status_put_admin_toggles(admin_h):
    r = requests.put(f"{BASE_URL}/api/ai/status", headers=admin_h, json={"enabled": False}, timeout=15)
    assert r.status_code == 200 and r.json().get("enabled") is False
    r2 = requests.get(f"{BASE_URL}/api/ai/status", headers=admin_h, timeout=15)
    assert r2.json().get("enabled") is False
    # re-enable
    r3 = requests.put(f"{BASE_URL}/api/ai/status", headers=admin_h, json={"enabled": True}, timeout=15)
    assert r3.json().get("enabled") is True


# --------------- AI kill-switch: when disabled, endpoints return 503 ---------------
def test_ai_disabled_blocks_endpoints(admin_h, student_h, student):
    # disable
    requests.put(f"{BASE_URL}/api/ai/status", headers=admin_h, json={"enabled": False}, timeout=15)

    # improve-task (admin)
    r = requests.post(f"{BASE_URL}/api/ai/improve-task", headers=admin_h,
                      json={"title": "x", "subject": "y"}, timeout=15)
    assert r.status_code == 503, r.text

    # generate-announcement (admin)
    r = requests.post(f"{BASE_URL}/api/ai/generate-announcement", headers=admin_h,
                      json={"prompt": "test"}, timeout=15)
    assert r.status_code == 503

    # check-answer (admin per current implementation)
    r = requests.post(f"{BASE_URL}/api/ai/check-answer", headers=admin_h,
                      json={"task_title": "t", "task_description": "d", "student_answer": "a"}, timeout=15)
    assert r.status_code == 503

    # explain-task (student)
    r = requests.post(f"{BASE_URL}/api/ai/explain-task", headers=student_h,
                      json={"task_id": "nonexistent"}, timeout=15)
    assert r.status_code == 503

    # chat (student)
    r = requests.post(f"{BASE_URL}/api/ai/chat", headers=student_h,
                      json={"message": "hi"}, timeout=15)
    assert r.status_code == 503

    # generate-task-answer (admin)
    r = requests.post(f"{BASE_URL}/api/ai/generate-task-answer", headers=admin_h,
                      json={"task_id": "nonexistent"}, timeout=15)
    assert r.status_code == 503

    # monthly-report (admin)
    r = requests.get(f"{BASE_URL}/api/ai/monthly-report/{student['id']}", headers=admin_h, timeout=15)
    assert r.status_code == 503

    # prize-evaluate (admin)
    r = requests.get(f"{BASE_URL}/api/ai/prize-evaluate", headers=admin_h, timeout=15)
    assert r.status_code == 503

    # daily-summary — safe fallback expected (200 with disabled flag)
    r = requests.get(f"{BASE_URL}/api/ai/daily-summary", headers=student_h, timeout=15)
    assert r.status_code == 200
    body = r.json()
    assert body.get("disabled") is True, f"expected disabled=true fallback, got {body}"

    # prize-tips — safe fallback expected
    r = requests.get(f"{BASE_URL}/api/ai/prize-tips", headers=student_h, timeout=15)
    assert r.status_code == 200
    body = r.json()
    assert body.get("disabled") is True, f"expected disabled=true fallback, got {body}"


# --------------- monthly-report ---------------
def test_monthly_report_admin_ok(admin_h, student):
    r = requests.get(f"{BASE_URL}/api/ai/monthly-report/{student['id']}", headers=admin_h, timeout=90)
    assert r.status_code == 200, r.text
    body = r.json()
    assert "student" in body and body["student"]["id"] == student["id"]
    metrics = body.get("metrics", {})
    for k in ("total_assigned", "total_completed", "completion_pct",
              "month_completions", "on_time", "late", "by_subject"):
        assert k in metrics, f"missing metric {k}"
    assert isinstance(body.get("report"), str) and len(body["report"]) > 20
    assert "generated_at" in body


def test_monthly_report_student_forbidden(student_h, student):
    r = requests.get(f"{BASE_URL}/api/ai/monthly-report/{student['id']}", headers=student_h, timeout=15)
    assert r.status_code == 403


# --------------- prize-evaluate ---------------
def test_prize_evaluate_admin(admin_h):
    r = requests.get(f"{BASE_URL}/api/ai/prize-evaluate", headers=admin_h, timeout=90)
    assert r.status_code == 200, r.text
    body = r.json()
    assert "candidates" in body
    if body["candidates"]:
        assert "winner_id" in body
        assert "winner_name" in body
        assert "justification" in body
        assert isinstance(body.get("criteria", []), list)


def test_prize_evaluate_student_forbidden(student_h):
    r = requests.get(f"{BASE_URL}/api/ai/prize-evaluate", headers=student_h, timeout=15)
    assert r.status_code == 403


# --------------- prize-tips ---------------
def test_prize_tips_student(student_h):
    r = requests.get(f"{BASE_URL}/api/ai/prize-tips", headers=student_h, timeout=90)
    assert r.status_code == 200, r.text
    body = r.json()
    for k in ("rank", "total", "gap_to_leader", "my_points", "leader_points", "tips"):
        assert k in body, f"missing {k}"
    assert isinstance(body["tips"], str) and len(body["tips"]) > 5


def test_prize_tips_admin_forbidden(admin_h):
    r = requests.get(f"{BASE_URL}/api/ai/prize-tips", headers=admin_h, timeout=15)
    assert r.status_code == 403
