"""Backend regression tests for School Tasks (Edutask) - iteration 2.

Covers:
- Auth (profiles with status, login w/ email & user_id, status gating)
- Users CRUD (no email; admin sees password plain)
- Status update endpoint (active/maintenance/blocked)
- Subjects CRUD + 8-subject seed
- Tasks lifecycle (create/list/update/complete/uncomplete/delete)
- File upload/download (Bearer + ?auth= query)
"""
import os
import io
import uuid
import requests
import pytest

# ---------------- Setup ----------------
BASE_URL = os.environ.get("REACT_APP_BACKEND_URL")
if not BASE_URL:
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.strip().split("=", 1)[1].strip().strip('"')
                break
BASE_URL = BASE_URL.rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@escola.com"
ADMIN_PASSWORD = "enzo123cg"

DEFAULT_SUBJECTS = {
    "Matemática", "Português", "Ciências", "História",
    "Geografia", "Inglês", "Artes", "Educação Física",
}


def _new_session():
    """Plain requests with no cookie persistence so Bearer auth is reliable."""
    class S:
        def get(self, url, **kw): return requests.get(url, **kw)
        def post(self, url, **kw): return requests.post(url, **kw)
        def put(self, url, **kw): return requests.put(url, **kw)
        def patch(self, url, **kw): return requests.patch(url, **kw)
        def delete(self, url, **kw): return requests.delete(url, **kw)
    return S()


@pytest.fixture(scope="session")
def session():
    return _new_session()


@pytest.fixture(scope="session")
def admin_token(session):
    r = session.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="session")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


def _create_student(session, admin_headers, name_prefix="TEST_Aluno"):
    suffix = uuid.uuid4().hex[:8]
    name = f"{name_prefix}_{suffix}"
    password = "aluno123"
    r = session.post(f"{API}/users", json={"name": name, "password": password}, headers=admin_headers)
    assert r.status_code == 200, f"create student failed: {r.status_code} {r.text}"
    user = r.json()
    r2 = session.post(f"{API}/auth/login", json={"user_id": user["id"], "password": password})
    assert r2.status_code == 200
    token = r2.json()["token"]
    return {
        "id": user["id"],
        "name": name,
        "password": password,
        "token": token,
        "headers": {"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        "user_obj": user,
    }


@pytest.fixture(scope="session")
def student(session, admin_headers):
    s = _create_student(session, admin_headers)
    yield s
    session.delete(f"{API}/users/{s['id']}", headers=admin_headers)


# ---------------- Health ----------------
class TestHealth:
    def test_root(self, session):
        r = session.get(f"{API}/")
        assert r.status_code == 200
        assert r.json()["ok"] is True


# ---------------- Auth ----------------
class TestAuth:
    def test_profiles_public_with_status(self, session):
        r = session.get(f"{API}/auth/profiles")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        admin = next((p for p in data if p["role"] == "admin"), None)
        assert admin is not None, "admin profile must exist"
        # status field must be present and default to active
        for p in data:
            assert "status" in p, f"profile missing status: {p}"
            assert p["status"] in ("active", "maintenance", "blocked")
            assert "_id" not in p
        assert admin["status"] == "active"

    def test_login_with_email(self, session):
        r = session.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
        assert r.status_code == 200
        d = r.json()
        assert "token" in d and d["user"]["role"] == "admin"

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
        r = session.get(f"{API}/auth/me")
        assert r.status_code == 401


# ---------------- Users ----------------
class TestUsers:
    def test_create_user_no_email_returns_password(self, session, admin_headers):
        suf = uuid.uuid4().hex[:8]
        name = f"TEST_PWBack_{suf}"
        pw = "secret123"
        r = session.post(f"{API}/users", json={"name": name, "password": pw}, headers=admin_headers)
        assert r.status_code == 200, r.text
        u = r.json()
        assert u["name"] == name
        assert u["role"] == "aluno"
        assert u["status"] == "active"
        assert u.get("password") == pw, f"admin should receive plain password, got {u}"
        assert "email" not in u or u.get("email") is None  # email field removed from UserOut
        # cleanup
        session.delete(f"{API}/users/{u['id']}", headers=admin_headers)

    def test_create_duplicate_name_rejected(self, session, admin_headers):
        suf = uuid.uuid4().hex[:8]
        name = f"TEST_Dup_{suf}"
        r1 = session.post(f"{API}/users", json={"name": name, "password": "p"}, headers=admin_headers)
        assert r1.status_code == 200
        r2 = session.post(f"{API}/users", json={"name": name, "password": "p"}, headers=admin_headers)
        assert r2.status_code == 400
        session.delete(f"{API}/users/{r1.json()['id']}", headers=admin_headers)

    def test_list_users_admin_includes_password_and_status(self, session, admin_headers, student):
        r = session.get(f"{API}/users", headers=admin_headers)
        assert r.status_code == 200
        users = r.json()
        ids = [u["id"] for u in users]
        assert student["id"] in ids
        target = next(u for u in users if u["id"] == student["id"])
        assert target["password"] == student["password"], "admin must see plain password for aluno"
        assert target["status"] == "active"
        assert target["role"] == "aluno"
        assert "password_hash" not in target

    def test_list_users_aluno_forbidden(self, session, student):
        r = session.get(f"{API}/users", headers=student["headers"])
        assert r.status_code == 403

    def test_create_user_aluno_forbidden(self, session, student):
        r = session.post(f"{API}/users", json={"name": "X", "password": "p"}, headers=student["headers"])
        assert r.status_code == 403


# ---------------- Status (active/maintenance/blocked) ----------------
class TestUserStatus:
    def test_status_update_admin_only(self, session, admin_headers):
        s = _create_student(session, admin_headers, "TEST_Status")
        try:
            # student cannot patch its own status
            r = session.patch(f"{API}/users/{s['id']}/status", json={"status": "maintenance"}, headers=s["headers"])
            assert r.status_code == 403

            # invalid status
            ri = session.patch(f"{API}/users/{s['id']}/status", json={"status": "weird"}, headers=admin_headers)
            assert ri.status_code == 400

            # admin sets maintenance
            rm = session.patch(f"{API}/users/{s['id']}/status", json={"status": "maintenance"}, headers=admin_headers)
            assert rm.status_code == 200
            assert rm.json()["status"] == "maintenance"

            # login should now return 403 with maintenance message
            rl = session.post(f"{API}/auth/login", json={"user_id": s["id"], "password": s["password"]})
            assert rl.status_code == 403
            assert "manutenção" in rl.json().get("detail", "").lower()

            # admin sets blocked
            rb = session.patch(f"{API}/users/{s['id']}/status", json={"status": "blocked"}, headers=admin_headers)
            assert rb.status_code == 200
            rl2 = session.post(f"{API}/auth/login", json={"user_id": s["id"], "password": s["password"]})
            assert rl2.status_code == 403
            assert "bloquead" in rl2.json().get("detail", "").lower()

            # back to active -> login works
            ra = session.patch(f"{API}/users/{s['id']}/status", json={"status": "active"}, headers=admin_headers)
            assert ra.status_code == 200
            rl3 = session.post(f"{API}/auth/login", json={"user_id": s["id"], "password": s["password"]})
            assert rl3.status_code == 200

            # profiles endpoint reflects updated status
            profiles = session.get(f"{API}/auth/profiles").json()
            mine = next(p for p in profiles if p["id"] == s["id"])
            assert mine["status"] == "active"
        finally:
            session.delete(f"{API}/users/{s['id']}", headers=admin_headers)

    def test_status_update_unknown_user(self, session, admin_headers):
        r = session.patch(f"{API}/users/{uuid.uuid4()}/status", json={"status": "active"}, headers=admin_headers)
        assert r.status_code == 404


# ---------------- Subjects ----------------
class TestSubjects:
    def test_default_subjects_seeded(self, session, admin_headers):
        r = session.get(f"{API}/subjects", headers=admin_headers)
        assert r.status_code == 200
        names = {s["name"] for s in r.json()}
        missing = DEFAULT_SUBJECTS - names
        assert not missing, f"missing default subjects: {missing}"

    def test_subjects_requires_auth(self, session):
        r = session.get(f"{API}/subjects")
        assert r.status_code == 401

    def test_subjects_aluno_can_read(self, session, student):
        r = session.get(f"{API}/subjects", headers=student["headers"])
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_subject_create_admin_only(self, session, admin_headers, student):
        # aluno forbidden
        rf = session.post(f"{API}/subjects", json={"name": "TEST_Robotica"}, headers=student["headers"])
        assert rf.status_code == 403

        suf = uuid.uuid4().hex[:6]
        new_name = f"TEST_Materia_{suf}"
        r = session.post(f"{API}/subjects", json={"name": new_name}, headers=admin_headers)
        assert r.status_code == 200
        sid = r.json()["id"]
        assert r.json()["name"] == new_name

        # case-insensitive duplicate rejected
        rdup = session.post(f"{API}/subjects", json={"name": new_name.lower()}, headers=admin_headers)
        assert rdup.status_code == 400

        # GET reflects new
        names = {x["name"] for x in session.get(f"{API}/subjects", headers=admin_headers).json()}
        assert new_name in names

        # delete
        rd = session.delete(f"{API}/subjects/{sid}", headers=admin_headers)
        assert rd.status_code == 200
        # GET no longer contains
        names2 = {x["name"] for x in session.get(f"{API}/subjects", headers=admin_headers).json()}
        assert new_name not in names2

    def test_subject_delete_aluno_forbidden(self, session, student):
        r = session.delete(f"{API}/subjects/{uuid.uuid4()}", headers=student["headers"])
        assert r.status_code == 403

    def test_subject_delete_unknown(self, session, admin_headers):
        r = session.delete(f"{API}/subjects/{uuid.uuid4()}", headers=admin_headers)
        assert r.status_code == 404

    def test_subject_create_empty_name(self, session, admin_headers):
        r = session.post(f"{API}/subjects", json={"name": "   "}, headers=admin_headers)
        assert r.status_code == 400


# ---------------- Tasks ----------------
class TestTasks:
    def test_task_full_lifecycle(self, session, admin_headers, student):
        payload = {"subject": "Matemática", "title": "TEST_Lição 1", "description": "Resolver", "due_date": "2026-02-01", "attachments": []}
        r = session.post(f"{API}/tasks", json=payload, headers=admin_headers)
        assert r.status_code == 200
        t = r.json()
        tid = t["id"]
        assert "_id" not in t

        # admin list -> progress
        admin_tasks = session.get(f"{API}/tasks", headers=admin_headers).json()
        mine = next(x for x in admin_tasks if x["id"] == tid)
        assert mine["completed_count"] == 0
        assert mine["total_students"] >= 1

        # aluno list -> completed flag
        s_tasks = session.get(f"{API}/tasks", headers=student["headers"]).json()
        s_task = next(x for x in s_tasks if x["id"] == tid)
        assert s_task["completed"] is False

        # admin cannot complete
        rb = session.post(f"{API}/tasks/{tid}/complete", headers=admin_headers)
        assert rb.status_code == 403

        # complete idempotent
        rc1 = session.post(f"{API}/tasks/{tid}/complete", headers=student["headers"])
        rc2 = session.post(f"{API}/tasks/{tid}/complete", headers=student["headers"])
        assert rc1.status_code == 200 and rc2.status_code == 200
        assert rc1.json()["completed_at"] == rc2.json()["completed_at"]

        # admin sees count = 1
        admin_tasks2 = session.get(f"{API}/tasks", headers=admin_headers).json()
        mine2 = next(x for x in admin_tasks2 if x["id"] == tid)
        assert mine2["completed_count"] == 1

        # update partial (subject change)
        ru = session.put(f"{API}/tasks/{tid}", json={"subject": "Português", "title": "TEST_Lição 1 (rev)"}, headers=admin_headers)
        assert ru.status_code == 200
        admin_tasks3 = session.get(f"{API}/tasks", headers=admin_headers).json()
        mine3 = next(x for x in admin_tasks3 if x["id"] == tid)
        assert mine3["subject"] == "Português"

        # uncomplete
        run = session.post(f"{API}/tasks/{tid}/uncomplete", headers=student["headers"])
        assert run.status_code == 200
        admin_tasks4 = session.get(f"{API}/tasks", headers=admin_headers).json()
        mine4 = next(x for x in admin_tasks4 if x["id"] == tid)
        assert mine4["completed_count"] == 0

        # delete
        rd = session.delete(f"{API}/tasks/{tid}", headers=admin_headers)
        assert rd.status_code == 200
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
    def test_upload_and_download(self, session, admin_token):
        content = b"hello school"
        files = {"file": ("test.txt", io.BytesIO(content), "text/plain")}
        r = requests.post(f"{API}/files/upload", files=files, headers={"Authorization": f"Bearer {admin_token}"})
        if r.status_code == 500:
            pytest.skip(f"Storage not available: {r.text}")
        assert r.status_code == 200, r.text
        fid = r.json()["id"]

        rd = requests.get(f"{API}/files/{fid}/download", headers={"Authorization": f"Bearer {admin_token}"})
        assert rd.status_code == 200 and rd.content == content

        rq = requests.get(f"{API}/files/{fid}/download?auth={admin_token}")
        assert rq.status_code == 200 and rq.content == content

        rb = requests.get(f"{API}/files/{fid}/download?auth=bad.token.value")
        assert rb.status_code == 401

    def test_upload_aluno_forbidden(self, session, student):
        files = {"file": ("a.txt", io.BytesIO(b"x"), "text/plain")}
        r = requests.post(f"{API}/files/upload", files=files, headers={"Authorization": f"Bearer {student['token']}"})
        assert r.status_code == 403
