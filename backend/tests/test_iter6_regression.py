"""Iteration 6 regression tests.

Focus:
- Verify _fire_webhook fix (previously undefined _fire_zapier caused 500 on
  POST /api/tasks and POST /api/announcements).
- Regression: PUT /tasks, PUT /announcements, POST /tasks/{id}/complete.
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://escola-tasks-pro.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@escola.com"
ADMIN_PASSWORD = "enzo123cg"


@pytest.fixture(scope="module")
def admin_headers():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    return {"Authorization": f"Bearer {r.json()['token']}"}


@pytest.fixture(scope="module")
def student_ctx(admin_headers):
    name = f"TEST_stu_{uuid.uuid4().hex[:6]}"
    password = "stu12345"
    r = requests.post(f"{API}/users", json={"name": name, "password": password}, headers=admin_headers, timeout=15)
    assert r.status_code in (200, 201), r.text
    uid = r.json()["id"]
    lr = requests.post(f"{API}/auth/login", json={"user_id": uid, "password": password}, timeout=15)
    assert lr.status_code == 200
    yield {"id": uid, "token": lr.json()["token"]}
    requests.delete(f"{API}/users/{uid}", headers=admin_headers, timeout=15)


@pytest.fixture(scope="module")
def subject_id(admin_headers):
    subs = requests.get(f"{API}/subjects", headers=admin_headers, timeout=15).json()
    if subs:
        return subs[0]["id"]
    sr = requests.post(f"{API}/subjects", json={"name": f"TEST_Sub_{uuid.uuid4().hex[:4]}"}, headers=admin_headers, timeout=15)
    assert sr.status_code in (200, 201)
    return sr.json()["id"]


class TestWebhookFix:
    """Verify _fire_zapier -> _fire_webhook rename works: task/announcement creation no longer 500s."""

    def test_post_task_returns_200(self, admin_headers, subject_id):
        payload = {
            "title": f"TEST_Task_{uuid.uuid4().hex[:4]}",
            "description": "webhook regression",
            "subject_id": subject_id,
            "subject": "TEST",
            "due_date": "2026-12-31",
        }
        r = requests.post(f"{API}/tasks", json=payload, headers=admin_headers, timeout=15)
        assert r.status_code in (200, 201), f"POST /tasks failed: {r.status_code} {r.text}"
        data = r.json()
        assert "id" in data
        assert data["title"] == payload["title"]
        tid = data["id"]

        # GET verify persistence
        g = requests.get(f"{API}/tasks", headers=admin_headers, timeout=15)
        assert g.status_code == 200
        ids = [t.get("id") for t in g.json()]
        assert tid in ids

        # cleanup
        requests.delete(f"{API}/tasks/{tid}", headers=admin_headers, timeout=15)

    def test_post_announcement_returns_200(self, admin_headers):
        payload = {"title": f"TEST_Ann_{uuid.uuid4().hex[:4]}", "message": "regression"}
        r = requests.post(f"{API}/announcements", json=payload, headers=admin_headers, timeout=15)
        assert r.status_code in (200, 201), f"POST /announcements failed: {r.status_code} {r.text}"
        data = r.json()
        assert data.get("title") == payload["title"]
        aid = data.get("id")
        assert aid

        # GET verify persistence
        g = requests.get(f"{API}/announcements", headers=admin_headers, timeout=15)
        assert g.status_code == 200
        ids = [a.get("id") for a in g.json()]
        assert aid in ids

        requests.delete(f"{API}/announcements/{aid}", headers=admin_headers, timeout=15)


class TestPutRegression:
    def test_put_task(self, admin_headers, subject_id):
        payload = {"title": f"TEST_Task_{uuid.uuid4().hex[:4]}", "description": "orig",
                   "subject_id": subject_id, "subject": "TEST", "due_date": "2026-12-31"}
        r = requests.post(f"{API}/tasks", json=payload, headers=admin_headers, timeout=15)
        assert r.status_code in (200, 201), r.text
        tid = r.json()["id"]

        upd = {"title": "TEST_Task_UPDATED", "description": "changed"}
        pr = requests.put(f"{API}/tasks/{tid}", json=upd, headers=admin_headers, timeout=15)
        assert pr.status_code == 200, f"PUT /tasks failed: {pr.status_code} {pr.text}"

        # verify persistence
        g = requests.get(f"{API}/tasks", headers=admin_headers, timeout=15).json()
        task = next((t for t in g if t.get("id") == tid), None)
        assert task is not None
        assert task["title"] == "TEST_Task_UPDATED"

        requests.delete(f"{API}/tasks/{tid}", headers=admin_headers, timeout=15)

    def test_put_announcement(self, admin_headers):
        r = requests.post(f"{API}/announcements",
                          json={"title": f"TEST_Ann_{uuid.uuid4().hex[:4]}", "message": "orig"},
                          headers=admin_headers, timeout=15)
        assert r.status_code in (200, 201), r.text
        aid = r.json()["id"]

        pr = requests.put(f"{API}/announcements/{aid}",
                          json={"title": "TEST_Ann_UPDATED", "message": "changed"},
                          headers=admin_headers, timeout=15)
        assert pr.status_code == 200, f"PUT /announcements failed: {pr.status_code} {pr.text}"

        g = requests.get(f"{API}/announcements", headers=admin_headers, timeout=15).json()
        ann = next((a for a in g if a.get("id") == aid), None)
        assert ann is not None
        assert ann["title"] == "TEST_Ann_UPDATED"

        requests.delete(f"{API}/announcements/{aid}", headers=admin_headers, timeout=15)


class TestCompleteTask:
    def test_student_completes_task(self, admin_headers, student_ctx, subject_id):
        # Create task
        payload = {"title": f"TEST_Task_{uuid.uuid4().hex[:4]}", "description": "complete me",
                   "subject_id": subject_id, "subject": "TEST", "due_date": "2026-12-31"}
        r = requests.post(f"{API}/tasks", json=payload, headers=admin_headers, timeout=15)
        assert r.status_code in (200, 201), r.text
        tid = r.json()["id"]

        stu_headers = {"Authorization": f"Bearer {student_ctx['token']}"}
        cr = requests.post(f"{API}/tasks/{tid}/complete", headers=stu_headers, timeout=15)
        assert cr.status_code == 200, f"complete failed: {cr.status_code} {cr.text}"

        requests.delete(f"{API}/tasks/{tid}", headers=admin_headers, timeout=15)
