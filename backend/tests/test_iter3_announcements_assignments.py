"""Iteration 3 tests: announcements + assigned_to filtering for tasks/announcements."""
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


def _login(email=None, user_id=None, password=ADMIN_PASSWORD):
    body = {"password": password}
    if email:
        body["email"] = email
    if user_id:
        body["user_id"] = user_id
    r = requests.post(f"{API}/auth/login", json=body)
    return r


@pytest.fixture(scope="module")
def admin_headers():
    r = _login(email=ADMIN_EMAIL, password=ADMIN_PASSWORD)
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}", "Content-Type": "application/json"}


def _new_student(admin_headers, label):
    name = f"TEST_{label}_{uuid.uuid4().hex[:6]}"
    pw = "alu123"
    r = requests.post(f"{API}/users", json={"name": name, "password": pw}, headers=admin_headers)
    assert r.status_code == 200, r.text
    u = r.json()
    rl = _login(user_id=u["id"], password=pw)
    assert rl.status_code == 200
    token = rl.json()["token"]
    return {
        "id": u["id"], "name": name, "password": pw,
        "headers": {"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
    }


@pytest.fixture(scope="module")
def two_students(admin_headers):
    a = _new_student(admin_headers, "AlunoA")
    b = _new_student(admin_headers, "AlunoB")
    yield a, b
    requests.delete(f"{API}/users/{a['id']}", headers=admin_headers)
    requests.delete(f"{API}/users/{b['id']}", headers=admin_headers)


# ---------------- Announcements ----------------
class TestAnnouncements:
    def test_create_admin_only(self, admin_headers, two_students):
        a, _ = two_students
        r = requests.post(f"{API}/announcements", json={"title": "X", "message": "Y"}, headers=a["headers"])
        assert r.status_code == 403

    def test_create_validation(self, admin_headers):
        r = requests.post(f"{API}/announcements", json={"title": "  ", "message": "  "}, headers=admin_headers)
        assert r.status_code == 400

    def test_create_for_all_then_visible_to_all(self, admin_headers, two_students):
        a, b = two_students
        title = f"TEST_AvisoTodos_{uuid.uuid4().hex[:6]}"
        r = requests.post(f"{API}/announcements",
                          json={"title": title, "message": "para todos", "assigned_to": []},
                          headers=admin_headers)
        assert r.status_code == 200, r.text
        ann = r.json()
        assert "_id" not in ann
        aid = ann["id"]
        try:
            # admin sees with all_students=True and recipients=[]
            la = requests.get(f"{API}/announcements", headers=admin_headers).json()
            mine = next(x for x in la if x["id"] == aid)
            assert mine["all_students"] is True
            assert mine["recipients"] == []

            # Both students see it
            for s in (a, b):
                lst = requests.get(f"{API}/announcements", headers=s["headers"]).json()
                ids = [x["id"] for x in lst]
                assert aid in ids, f"student {s['name']} should see broadcast"
        finally:
            requests.delete(f"{API}/announcements/{aid}", headers=admin_headers)

    def test_create_for_specific_student_only(self, admin_headers, two_students):
        a, b = two_students
        title = f"TEST_AvisoSoA_{uuid.uuid4().hex[:6]}"
        r = requests.post(f"{API}/announcements",
                          json={"title": title, "message": "só A", "assigned_to": [a["id"]]},
                          headers=admin_headers)
        assert r.status_code == 200
        aid = r.json()["id"]
        try:
            # admin sees with recipients=[A] and all_students=False
            la = requests.get(f"{API}/announcements", headers=admin_headers).json()
            mine = next(x for x in la if x["id"] == aid)
            assert mine["all_students"] is False
            recipient_ids = [x["id"] for x in mine["recipients"]]
            assert recipient_ids == [a["id"]]
            assert mine["recipients"][0]["name"] == a["name"]

            # A sees, B does not
            la_a = [x["id"] for x in requests.get(f"{API}/announcements", headers=a["headers"]).json()]
            la_b = [x["id"] for x in requests.get(f"{API}/announcements", headers=b["headers"]).json()]
            assert aid in la_a, "A must see own announcement"
            assert aid not in la_b, "B must NOT see announcement assigned only to A"
        finally:
            requests.delete(f"{API}/announcements/{aid}", headers=admin_headers)

    def test_delete_admin_only_and_404(self, admin_headers, two_students):
        a, _ = two_students
        # Create one
        r = requests.post(f"{API}/announcements",
                          json={"title": "TEST_del", "message": "m"},
                          headers=admin_headers)
        aid = r.json()["id"]
        # aluno cannot delete
        rf = requests.delete(f"{API}/announcements/{aid}", headers=a["headers"])
        assert rf.status_code == 403
        # admin deletes ok
        rd = requests.delete(f"{API}/announcements/{aid}", headers=admin_headers)
        assert rd.status_code == 200
        # second delete -> 404
        rd2 = requests.delete(f"{API}/announcements/{aid}", headers=admin_headers)
        assert rd2.status_code == 404

    def test_aluno_response_has_no_recipients_field_required(self, admin_headers, two_students):
        """Aluno endpoint just returns announcements they can see - no enrichment required."""
        a, _ = two_students
        r = requests.post(f"{API}/announcements",
                          json={"title": "TEST_alunoview", "message": "m"},
                          headers=admin_headers)
        aid = r.json()["id"]
        try:
            lst = requests.get(f"{API}/announcements", headers=a["headers"]).json()
            mine = next(x for x in lst if x["id"] == aid)
            assert mine["title"] == "TEST_alunoview"
            assert mine["message"] == "m"
        finally:
            requests.delete(f"{API}/announcements/{aid}", headers=admin_headers)


# ---------------- Tasks assigned_to ----------------
class TestTasksAssignedTo:
    def test_task_assigned_to_specific_only_visible_to_them(self, admin_headers, two_students):
        a, b = two_students
        payload = {
            "subject": "Matemática",
            "title": f"TEST_TaskA_{uuid.uuid4().hex[:6]}",
            "description": "só A",
            "due_date": "2026-03-01",
            "attachments": [],
            "assigned_to": [a["id"]],
        }
        r = requests.post(f"{API}/tasks", json=payload, headers=admin_headers)
        assert r.status_code == 200, r.text
        t = r.json()
        assert t["assigned_to"] == [a["id"]]
        assert "_id" not in t
        tid = t["id"]
        try:
            # A sees it
            la = requests.get(f"{API}/tasks", headers=a["headers"]).json()
            assert any(x["id"] == tid for x in la), "A must see own task"
            # B does not see it
            lb = requests.get(f"{API}/tasks", headers=b["headers"]).json()
            assert not any(x["id"] == tid for x in lb), "B must NOT see task only assigned to A"

            # Admin: progress only counts target_students = [A]; all_students=False
            ladm = requests.get(f"{API}/tasks", headers=admin_headers).json()
            mine = next(x for x in ladm if x["id"] == tid)
            assert mine["all_students"] is False
            assert mine["total_students"] == 1
            progress_ids = [p["user_id"] for p in mine["progress"]]
            assert progress_ids == [a["id"]]
            # B should NOT appear in progress (target filtering)
            assert b["id"] not in progress_ids
        finally:
            requests.delete(f"{API}/tasks/{tid}", headers=admin_headers)

    def test_task_assigned_empty_visible_to_all(self, admin_headers, two_students):
        a, b = two_students
        payload = {
            "subject": "Português",
            "title": f"TEST_TaskAll_{uuid.uuid4().hex[:6]}",
            "description": "todos",
            "due_date": "2026-03-02",
            "attachments": [],
            # assigned_to omitted -> default []
        }
        r = requests.post(f"{API}/tasks", json=payload, headers=admin_headers)
        assert r.status_code == 200
        tid = r.json()["id"]
        try:
            for s in (a, b):
                lst = requests.get(f"{API}/tasks", headers=s["headers"]).json()
                assert any(x["id"] == tid for x in lst), f"{s['name']} must see broadcast task"
            ladm = requests.get(f"{API}/tasks", headers=admin_headers).json()
            mine = next(x for x in ladm if x["id"] == tid)
            assert mine["all_students"] is True
            assert mine["total_students"] >= 2
            # both A and B should appear in progress
            progress_ids = {p["user_id"] for p in mine["progress"]}
            assert a["id"] in progress_ids and b["id"] in progress_ids
        finally:
            requests.delete(f"{API}/tasks/{tid}", headers=admin_headers)

    def test_put_task_update_assigned_to(self, admin_headers, two_students):
        a, b = two_students
        # Start broadcast
        r = requests.post(f"{API}/tasks", json={
            "subject": "Ciências", "title": f"TEST_Reassign_{uuid.uuid4().hex[:6]}",
            "description": "x", "due_date": "2026-03-03", "attachments": [],
        }, headers=admin_headers)
        tid = r.json()["id"]
        try:
            # both see it
            assert any(x["id"] == tid for x in requests.get(f"{API}/tasks", headers=b["headers"]).json())
            # update assigned_to=[a.id]
            ru = requests.put(f"{API}/tasks/{tid}", json={"assigned_to": [a["id"]]}, headers=admin_headers)
            assert ru.status_code == 200
            # A still sees, B no longer sees
            assert any(x["id"] == tid for x in requests.get(f"{API}/tasks", headers=a["headers"]).json())
            assert not any(x["id"] == tid for x in requests.get(f"{API}/tasks", headers=b["headers"]).json())
            # admin progress reflects only A
            ladm = requests.get(f"{API}/tasks", headers=admin_headers).json()
            mine = next(x for x in ladm if x["id"] == tid)
            assert mine["all_students"] is False
            assert [p["user_id"] for p in mine["progress"]] == [a["id"]]
        finally:
            requests.delete(f"{API}/tasks/{tid}", headers=admin_headers)

    def test_progress_count_only_for_target_students(self, admin_headers, two_students):
        """Even if B somehow had a completion, admin progress for A-only task should still target A."""
        a, b = two_students
        r = requests.post(f"{API}/tasks", json={
            "subject": "História", "title": f"TEST_TargetProg_{uuid.uuid4().hex[:6]}",
            "description": "x", "due_date": "2026-03-04", "attachments": [],
            "assigned_to": [a["id"]],
        }, headers=admin_headers)
        tid = r.json()["id"]
        try:
            # A completes
            rc = requests.post(f"{API}/tasks/{tid}/complete", headers=a["headers"])
            assert rc.status_code == 200
            ladm = requests.get(f"{API}/tasks", headers=admin_headers).json()
            mine = next(x for x in ladm if x["id"] == tid)
            assert mine["completed_count"] == 1
            assert mine["total_students"] == 1
            assert mine["progress"][0]["user_id"] == a["id"]
            assert mine["progress"][0]["completed"] is True
        finally:
            requests.delete(f"{API}/tasks/{tid}", headers=admin_headers)


# ---------------- Regression smoke from iter 2 ----------------
class TestRegressionSmoke:
    def test_subjects_still_seeded(self, admin_headers):
        r = requests.get(f"{API}/subjects", headers=admin_headers)
        assert r.status_code == 200
        names = {s["name"] for s in r.json()}
        assert {"Matemática", "Português", "Ciências"}.issubset(names)

    def test_status_blocks_login(self, admin_headers, two_students):
        a, _ = two_students
        # Set maintenance
        r = requests.patch(f"{API}/users/{a['id']}/status",
                           json={"status": "maintenance"}, headers=admin_headers)
        assert r.status_code == 200
        rl = _login(user_id=a["id"], password=a["password"])
        assert rl.status_code == 403
        # restore
        requests.patch(f"{API}/users/{a['id']}/status",
                       json={"status": "active"}, headers=admin_headers)
        rl2 = _login(user_id=a["id"], password=a["password"])
        assert rl2.status_code == 200
        # rotate token in fixture so subsequent tests still work
        a["headers"] = {"Authorization": f"Bearer {rl2.json()['token']}", "Content-Type": "application/json"}
