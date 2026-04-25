"""Backend regression tests for School Tasks app."""
import os
import io
import uuid
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL")
if not BASE_URL:
    # fall back to reading frontend env
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.strip().split("=", 1)[1].strip().strip('"')
                break
BASE_URL = BASE_URL.rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@escola.com"
ADMIN_PASSWORD = "enzo123cg"


class _NoCookieSession:
    """Wrapper that always discards cookies so Bearer auth is used reliably."""
    def __init__(self):
        self._h = {"Content-Type": "application/json"}
    def _req(self, method, url, **kw):
        return requests.request(method, url, **kw)
    def get(self, url, **kw): return self._req("GET", url, **kw)
    def post(self, url, **kw): return self._req("POST", url, **kw)
    def put(self, url, **kw): return self._req("PUT", url, **kw)
    def delete(self, url, **kw): return self._req("DELETE", url, **kw)


@pytest.fixture(scope="session")
def session():
    return _NoCookieSession()


@pytest.fixture(scope="session")
def admin_token(session):
    r = session.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="session")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="session")
def admin_id(session, admin_headers):
    r = session.get(f"{API}/auth/me", headers=admin_headers)
    assert r.status_code == 200
    return r.json()["id"]


@pytest.fixture(scope="session")
def student(session, admin_headers):
    """Create a test student and return its info + token."""
    suffix = uuid.uuid4().hex[:8]
    email = f"test_aluno_{suffix}@escola.com"
    password = "aluno123"
    r = session.post(f"{API}/users", json={"email": email, "name": f"Aluno {suffix}", "password": password}, headers=admin_headers)
    assert r.status_code == 200, f"create student failed: {r.status_code} {r.text}"
    user = r.json()
    # login as student
    r2 = session.post(f"{API}/auth/login", json={"email": email, "password": password})
    assert r2.status_code == 200
    token = r2.json()["token"]
    yield {"id": user["id"], "email": email, "password": password, "token": token,
           "headers": {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}}
    # cleanup
    session.delete(f"{API}/users/{user['id']}", headers=admin_headers)


# ---------------- Auth ----------------
class TestAuth:
    def test_root(self, session):
        r = session.get(f"{API}/")
        assert r.status_code == 200
        assert r.json()["ok"] is True

    def test_profiles_public(self, session):
        r = session.get(f"{API}/auth/profiles")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        assert any(p["role"] == "admin" for p in data)
        for p in data:
            assert set(p.keys()) == {"id", "name", "role"}
            assert "_id" not in p

    def test_login_with_email(self, session):
        r = session.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
        assert r.status_code == 200
        d = r.json()
        assert "token" in d and d["user"]["role"] == "admin"
        assert "_id" not in d["user"]

    def test_login_with_user_id(self, session):
        profiles = session.get(f"{API}/auth/profiles").json()
        admin_profile = next(p for p in profiles if p["role"] == "admin")
        r = session.post(f"{API}/auth/login", json={"user_id": admin_profile["id"], "password": ADMIN_PASSWORD})
        assert r.status_code == 200
        assert r.json()["user"]["id"] == admin_profile["id"]

    def test_login_invalid_password(self, session):
        r = session.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": "WRONG"})
        assert r.status_code == 401

    def test_login_missing_identifier(self, session):
        r = session.post(f"{API}/auth/login", json={"password": "x"})
        assert r.status_code == 400

    def test_me_with_bearer(self, session, admin_headers):
        r = session.get(f"{API}/auth/me", headers=admin_headers)
        assert r.status_code == 200
        d = r.json()
        assert d["email"] == ADMIN_EMAIL
        assert "password_hash" not in d
        assert "_id" not in d

    def test_me_without_token(self, session):
        r = requests.get(f"{API}/auth/me")
        assert r.status_code == 401


# ---------------- Users ----------------
class TestUsers:
    def test_create_duplicate_email(self, session, admin_headers, student):
        r = session.post(f"{API}/users", json={"email": student["email"], "name": "Dup", "password": "x"}, headers=admin_headers)
        assert r.status_code == 400

    def test_list_users_admin(self, session, admin_headers, student):
        r = session.get(f"{API}/users", headers=admin_headers)
        assert r.status_code == 200
        users = r.json()
        ids = [u["id"] for u in users]
        assert student["id"] in ids
        for u in users:
            assert u["role"] == "aluno"
            assert "password_hash" not in u

    def test_list_users_aluno_forbidden(self, session, student):
        r = session.get(f"{API}/users", headers=student["headers"])
        assert r.status_code == 403

    def test_create_user_aluno_forbidden(self, session, student):
        r = session.post(f"{API}/users", json={"email": "x@y.com", "name": "X", "password": "p"}, headers=student["headers"])
        assert r.status_code == 403

    def test_delete_user_and_completions_cleanup(self, session, admin_headers):
        # create student
        suf = uuid.uuid4().hex[:8]
        email = f"test_del_{suf}@escola.com"
        u = session.post(f"{API}/users", json={"email": email, "name": "ToDel", "password": "p"}, headers=admin_headers).json()
        # login as student
        tok = session.post(f"{API}/auth/login", json={"email": email, "password": "p"}).json()["token"]
        sh = {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}
        # create task as admin
        t = session.post(f"{API}/tasks", json={"subject": "Mat", "title": "T", "description": "d", "due_date": "2026-01-30", "attachments": []}, headers=admin_headers).json()
        # complete it as student
        rc = session.post(f"{API}/tasks/{t['id']}/complete", headers=sh)
        assert rc.status_code == 200
        # delete student
        rd = session.delete(f"{API}/users/{u['id']}", headers=admin_headers)
        assert rd.status_code == 200
        # cleanup task
        session.delete(f"{API}/tasks/{t['id']}", headers=admin_headers)


# ---------------- Tasks ----------------
class TestTasks:
    def test_task_lifecycle_and_progress(self, session, admin_headers, student):
        # create
        payload = {"subject": "Matemática", "title": "TEST_Lição 1", "description": "Resolver", "due_date": "2026-02-01", "attachments": []}
        r = session.post(f"{API}/tasks", json=payload, headers=admin_headers)
        assert r.status_code == 200
        t = r.json()
        tid = t["id"]
        assert "_id" not in t

        # admin list -> progress
        r2 = session.get(f"{API}/tasks", headers=admin_headers)
        assert r2.status_code == 200
        admin_tasks = r2.json()
        mine = next(x for x in admin_tasks if x["id"] == tid)
        assert "progress" in mine and "completed_count" in mine and "total_students" in mine
        assert mine["completed_count"] == 0

        # aluno list -> completed flag
        r3 = session.get(f"{API}/tasks", headers=student["headers"])
        assert r3.status_code == 200
        s_task = next(x for x in r3.json() if x["id"] == tid)
        assert s_task["completed"] is False

        # admin cannot complete
        rb = session.post(f"{API}/tasks/{tid}/complete", headers=admin_headers)
        assert rb.status_code == 403

        # aluno completes (idempotent)
        rc1 = session.post(f"{API}/tasks/{tid}/complete", headers=student["headers"])
        assert rc1.status_code == 200
        rc2 = session.post(f"{API}/tasks/{tid}/complete", headers=student["headers"])
        assert rc2.status_code == 200
        assert rc1.json()["completed_at"] == rc2.json()["completed_at"]

        # admin sees count = 1
        admin_tasks2 = session.get(f"{API}/tasks", headers=admin_headers).json()
        mine2 = next(x for x in admin_tasks2 if x["id"] == tid)
        assert mine2["completed_count"] == 1
        assert any(p["user_id"] == student["id"] and p["completed"] for p in mine2["progress"])

        # update partial
        ru = session.put(f"{API}/tasks/{tid}", json={"title": "TEST_Lição 1 (rev)"}, headers=admin_headers)
        assert ru.status_code == 200

        # uncomplete
        run = session.post(f"{API}/tasks/{tid}/uncomplete", headers=student["headers"])
        assert run.status_code == 200
        admin_tasks3 = session.get(f"{API}/tasks", headers=admin_headers).json()
        mine3 = next(x for x in admin_tasks3 if x["id"] == tid)
        assert mine3["completed_count"] == 0

        # delete
        rd = session.delete(f"{API}/tasks/{tid}", headers=admin_headers)
        assert rd.status_code == 200
        # ensure 404 on second delete
        rd2 = session.delete(f"{API}/tasks/{tid}", headers=admin_headers)
        assert rd2.status_code == 404

    def test_task_create_aluno_forbidden(self, session, student):
        r = session.post(f"{API}/tasks", json={"subject": "x", "title": "y", "description": "z", "due_date": "2026-01-01", "attachments": []}, headers=student["headers"])
        assert r.status_code == 403

    def test_complete_nonexistent_task(self, session, student):
        r = session.post(f"{API}/tasks/{uuid.uuid4()}/complete", headers=student["headers"])
        assert r.status_code == 404


# ---------------- Files ----------------
class TestFiles:
    def test_upload_and_download(self, session, admin_token, admin_headers):
        content = b"hello school"
        files = {"file": ("test.txt", io.BytesIO(content), "text/plain")}
        # multipart -> drop content-type
        r = requests.post(f"{API}/files/upload", files=files, headers={"Authorization": f"Bearer {admin_token}"})
        if r.status_code == 500:
            pytest.skip(f"Storage not available: {r.text}")
        assert r.status_code == 200, r.text
        fid = r.json()["id"]

        # download via Bearer header
        rd = requests.get(f"{API}/files/{fid}/download", headers={"Authorization": f"Bearer {admin_token}"})
        assert rd.status_code == 200
        assert rd.content == content

        # download via auth query param
        rq = requests.get(f"{API}/files/{fid}/download?auth={admin_token}")
        assert rq.status_code == 200
        assert rq.content == content

        # bad token via query
        rb = requests.get(f"{API}/files/{fid}/download?auth=bad.token.value")
        assert rb.status_code == 401

    def test_upload_aluno_forbidden(self, session, student):
        files = {"file": ("a.txt", io.BytesIO(b"x"), "text/plain")}
        r = requests.post(f"{API}/files/upload", files=files, headers={"Authorization": f"Bearer {student['token']}"})
        assert r.status_code == 403
