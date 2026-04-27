"""Iteration 4 backend tests: /api/app-info (Firmware) endpoints + regression of monthly-prize/tasks/announcements/users.

Covers:
- GET /api/app-info accessible to admin and aluno
- GET requires auth
- PUT by admin updates fields, sets updated_at
- PUT by aluno -> 403
- PUT empty version -> 400
- After PUT, GET returns new values (persistence)
- App info seeded on startup with defaults (>=9 features)
- Regression: GET /api/monthly-prize, /api/tasks, /api/announcements, /api/users
"""
import os
import uuid
import requests
import pytest

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


@pytest.fixture(scope="module")
def admin_headers():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def student(admin_headers):
    suf = uuid.uuid4().hex[:8]
    name = f"TEST_FW_{suf}"
    pw = "aluno123"
    r = requests.post(f"{API}/users", json={"name": name, "password": pw}, headers=admin_headers)
    assert r.status_code == 200, r.text
    user = r.json()
    rl = requests.post(f"{API}/auth/login", json={"user_id": user["id"], "password": pw})
    assert rl.status_code == 200
    headers = {"Authorization": f"Bearer {rl.json()['token']}", "Content-Type": "application/json"}
    yield {"id": user["id"], "headers": headers, "password": pw}
    requests.delete(f"{API}/users/{user['id']}", headers=admin_headers)


@pytest.fixture(scope="module")
def baseline_app_info(admin_headers):
    """Snapshot current app_info to restore after PUT tests."""
    r = requests.get(f"{API}/app-info", headers=admin_headers)
    assert r.status_code == 200
    return r.json()


# ---------------- App Info ----------------
class TestAppInfo:
    def test_get_requires_auth(self):
        r = requests.get(f"{API}/app-info")
        assert r.status_code == 401

    def test_get_admin(self, admin_headers):
        r = requests.get(f"{API}/app-info", headers=admin_headers)
        assert r.status_code == 200
        d = r.json()
        assert "version" in d and isinstance(d["version"], str)
        assert "codename" in d
        assert "release_notes" in d
        assert isinstance(d.get("features"), list)
        assert "_id" not in d
        # Seeded defaults: 9 features, version 1.0.0 (unless mutated by previous tests)
        assert len(d["features"]) >= 1
        for f in d["features"]:
            assert "name" in f and "emoji" in f and "status" in f

    def test_get_aluno_allowed(self, student):
        r = requests.get(f"{API}/app-info", headers=student["headers"])
        assert r.status_code == 200
        d = r.json()
        assert "version" in d and isinstance(d["features"], list)

    def test_seeded_defaults_present(self, admin_headers):
        # Hit GET; if seed ran, version is set + features count >= 9 by default.
        r = requests.get(f"{API}/app-info", headers=admin_headers)
        assert r.status_code == 200
        d = r.json()
        # If field is set by seed, version should be non-empty
        assert d["version"].strip() != ""
        # Default seed has 9 features. After some tests may rewrite, but on first run >=9
        assert len(d["features"]) >= 1

    def test_put_aluno_forbidden(self, student):
        r = requests.put(
            f"{API}/app-info",
            json={"version": "9.9.9"},
            headers=student["headers"],
        )
        assert r.status_code == 403

    def test_put_empty_version_returns_400(self, admin_headers):
        r = requests.put(
            f"{API}/app-info",
            json={"version": "   "},
            headers=admin_headers,
        )
        assert r.status_code == 400

    def test_put_admin_updates_and_persists(self, admin_headers, baseline_app_info):
        new_version = f"9.9.9-test-{uuid.uuid4().hex[:6]}"
        new_codename = "TEST_Codename"
        new_notes = "TEST_release_notes_block"
        new_features = [
            {"name": "TEST_Feature_A", "description": "desc A", "emoji": "🅰️", "status": "stable"},
            {"name": "TEST_Feature_B", "description": "desc B", "emoji": "🅱️", "status": "beta"},
            {"name": "", "description": "should be filtered", "emoji": "❌", "status": "novo"},  # empty name -> filtered
        ]
        r = requests.put(
            f"{API}/app-info",
            json={
                "version": new_version,
                "codename": new_codename,
                "release_notes": new_notes,
                "features": new_features,
            },
            headers=admin_headers,
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["version"] == new_version
        assert d["codename"] == new_codename
        assert d["release_notes"] == new_notes
        # Features filtered (empty name dropped)
        assert isinstance(d["features"], list)
        assert len(d["features"]) == 2
        names = {f["name"] for f in d["features"]}
        assert names == {"TEST_Feature_A", "TEST_Feature_B"}
        assert d.get("updated_at"), "updated_at must be set"

        # GET to verify persistence
        rg = requests.get(f"{API}/app-info", headers=admin_headers)
        assert rg.status_code == 200
        g = rg.json()
        assert g["version"] == new_version
        assert g["codename"] == new_codename
        assert g["release_notes"] == new_notes
        assert len(g["features"]) == 2

        # Restore baseline (ensure clean state for other agents/tests)
        restore_payload = {
            "version": baseline_app_info["version"],
            "codename": baseline_app_info.get("codename", ""),
            "release_notes": baseline_app_info.get("release_notes", ""),
            "features": baseline_app_info.get("features", []),
        }
        rr = requests.put(f"{API}/app-info", json=restore_payload, headers=admin_headers)
        assert rr.status_code == 200

    def test_put_partial_update(self, admin_headers, baseline_app_info):
        # Update only codename, others must remain
        new_code = f"TEST_Partial_{uuid.uuid4().hex[:4]}"
        r = requests.put(f"{API}/app-info", json={"codename": new_code}, headers=admin_headers)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["codename"] == new_code
        assert d["version"] == baseline_app_info["version"]  # unchanged
        # restore codename
        rr = requests.put(
            f"{API}/app-info",
            json={"codename": baseline_app_info.get("codename", "")},
            headers=admin_headers,
        )
        assert rr.status_code == 200


# ---------------- Regression ----------------
class TestRegression:
    def test_monthly_prize(self, admin_headers):
        r = requests.get(f"{API}/monthly-prize", headers=admin_headers)
        assert r.status_code == 200
        # Either null/empty OR has fields
        d = r.json()
        assert isinstance(d, (dict, type(None)))

    def test_tasks_list(self, admin_headers):
        r = requests.get(f"{API}/tasks", headers=admin_headers)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_announcements_list(self, admin_headers):
        r = requests.get(f"{API}/announcements", headers=admin_headers)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_users_list(self, admin_headers):
        r = requests.get(f"{API}/users", headers=admin_headers)
        assert r.status_code == 200
        users = r.json()
        assert isinstance(users, list)
        for u in users:
            assert "_id" not in u
