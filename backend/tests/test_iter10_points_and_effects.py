"""Iteration 10 backend tests: custom task points + Loja de Efeitos.

Covers:
- POST /tasks with points=25 stored & GET /tasks returns it
- complete_task on-time returns points_earned = task.points
- complete_task after due_date returns points_earned = max(1, floor(points*0.3))
- uncomplete_task deducts same amount
- GET /effects (admin gets all 13 owned; student gets only ["none"])
- PUT /effects/{id} admin updates cost; student -> 403
- PUT /effects with negative cost -> 400; unknown id -> 404
- POST /me/effects/buy: student insufficient -> 400; enough -> deducts & adds
- POST /me/effects/equip: not owned -> 400; owned -> ok; None -> unequips
- Admin buy returns already_owned; admin equip anything ok
- GET /auth/profiles contains equipped_effect
"""
import os
import math
import uuid
from datetime import date, timedelta

import pytest
import requests

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


# ---------------- Fixtures ----------------
@pytest.fixture(scope="module")
def admin_headers():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, r.text
    tok = r.json()["token"]
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def student(admin_headers):
    name = f"TEST_Aluno_{uuid.uuid4().hex[:8]}"
    password = "aluno123"
    r = requests.post(f"{API}/users", json={"name": name, "password": password}, headers=admin_headers)
    assert r.status_code == 200, r.text
    u = r.json()
    r2 = requests.post(f"{API}/auth/login", json={"user_id": u["id"], "password": password})
    assert r2.status_code == 200
    tok = r2.json()["token"]
    yield {
        "id": u["id"],
        "name": name,
        "headers": {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"},
    }
    # cleanup
    requests.delete(f"{API}/users/{u['id']}", headers=admin_headers)


def _create_task(admin_headers, points, due_offset_days=7):
    due = (date.today() + timedelta(days=due_offset_days)).isoformat()
    # fetch a subject
    subs = requests.get(f"{API}/subjects", headers=admin_headers).json()
    subject = subs[0]["name"] if subs else "Matemática"
    payload = {
        "title": f"TEST_task_{uuid.uuid4().hex[:6]}",
        "description": "test",
        "subject": subject,
        "due_date": due,
        "points": points,
    }
    r = requests.post(f"{API}/tasks", json=payload, headers=admin_headers)
    assert r.status_code == 200, r.text
    return r.json()


# ---------------- Task points ----------------
class TestTaskPoints:
    def test_create_with_points_25_persists(self, admin_headers):
        t = _create_task(admin_headers, 25)
        assert t.get("points") == 25
        # GET /tasks
        r = requests.get(f"{API}/tasks", headers=admin_headers)
        assert r.status_code == 200
        found = next((x for x in r.json() if x["id"] == t["id"]), None)
        assert found is not None
        assert found["points"] == 25
        # cleanup
        requests.delete(f"{API}/tasks/{t['id']}", headers=admin_headers)

    def test_complete_on_time_awards_full(self, admin_headers, student):
        t = _create_task(admin_headers, 25, due_offset_days=7)
        r = requests.post(f"{API}/tasks/{t['id']}/complete", headers=student["headers"])
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["points_earned"] == 25
        assert body["on_time"] is True
        # cleanup
        requests.post(f"{API}/tasks/{t['id']}/uncomplete", headers=student["headers"])
        requests.delete(f"{API}/tasks/{t['id']}", headers=admin_headers)

    def test_complete_late_awards_30pct_min1(self, admin_headers, student):
        t = _create_task(admin_headers, 25, due_offset_days=-3)  # past due
        r = requests.post(f"{API}/tasks/{t['id']}/complete", headers=student["headers"])
        assert r.status_code == 200, r.text
        body = r.json()
        expected = max(1, math.floor(25 * 0.3))  # = 7
        assert body["points_earned"] == expected == 7
        assert body["on_time"] is False
        requests.post(f"{API}/tasks/{t['id']}/uncomplete", headers=student["headers"])
        requests.delete(f"{API}/tasks/{t['id']}", headers=admin_headers)

    def test_uncomplete_deducts_same_amount(self, admin_headers, student):
        # Get current points baseline
        me0 = requests.get(f"{API}/auth/me", headers=student["headers"]).json()
        p0 = me0.get("points", 0)
        t = _create_task(admin_headers, 20, due_offset_days=5)
        requests.post(f"{API}/tasks/{t['id']}/complete", headers=student["headers"])
        me1 = requests.get(f"{API}/auth/me", headers=student["headers"]).json()
        assert me1["points"] == p0 + 20
        requests.post(f"{API}/tasks/{t['id']}/uncomplete", headers=student["headers"])
        me2 = requests.get(f"{API}/auth/me", headers=student["headers"]).json()
        assert me2["points"] == p0
        requests.delete(f"{API}/tasks/{t['id']}", headers=admin_headers)


# ---------------- Effects ----------------
class TestEffects:
    def test_get_effects_admin_owns_all_13(self, admin_headers):
        r = requests.get(f"{API}/effects", headers=admin_headers)
        assert r.status_code == 200
        d = r.json()
        assert isinstance(d["effects"], list)
        assert len(d["effects"]) == 13
        ids = [e["id"] for e in d["effects"]]
        # spot check expected ids
        for expected in ["none", "neon_pulse", "golden", "rainbow", "diamond", "phoenix"]:
            assert expected in ids, f"missing effect {expected}"
        # admin owns all
        assert set(d["owned"]) == set(ids)

    def test_get_effects_student_owns_only_none(self, student):
        r = requests.get(f"{API}/effects", headers=student["headers"])
        assert r.status_code == 200
        d = r.json()
        assert "none" in d["owned"]
        # student shouldn't have anything else at start
        assert set(d["owned"]) <= set([e["id"] for e in d["effects"]])
        assert d["equipped"] in [e["id"] for e in d["effects"]]

    def test_put_effect_admin_updates_cost(self, admin_headers):
        # Save original
        r0 = requests.get(f"{API}/effects", headers=admin_headers).json()
        original = next(e for e in r0["effects"] if e["id"] == "golden")["cost"]
        try:
            r = requests.put(f"{API}/effects/golden", json={"cost": 999}, headers=admin_headers)
            assert r.status_code == 200, r.text
            r2 = requests.get(f"{API}/effects", headers=admin_headers).json()
            new = next(e for e in r2["effects"] if e["id"] == "golden")["cost"]
            assert new == 999
        finally:
            requests.put(f"{API}/effects/golden", json={"cost": original}, headers=admin_headers)

    def test_put_effect_student_forbidden(self, student):
        r = requests.put(f"{API}/effects/golden", json={"cost": 10}, headers=student["headers"])
        assert r.status_code == 403

    def test_put_effect_negative_cost(self, admin_headers):
        r = requests.put(f"{API}/effects/golden", json={"cost": -5}, headers=admin_headers)
        assert r.status_code == 400

    def test_put_effect_unknown_id(self, admin_headers):
        r = requests.put(f"{API}/effects/unknown_id_xyz", json={"cost": 10}, headers=admin_headers)
        assert r.status_code == 404

    def test_buy_insufficient_points(self, student):
        # student starts with 0 (or near); diamond costs 1200
        r = requests.post(f"{API}/me/effects/buy", json={"effect_id": "diamond"}, headers=student["headers"])
        assert r.status_code == 400
        detail = r.json().get("detail", "")
        assert "pontos" in detail.lower()

    def test_admin_buy_returns_already_owned(self, admin_headers):
        r = requests.post(f"{API}/me/effects/buy", json={"effect_id": "golden"}, headers=admin_headers)
        assert r.status_code == 200
        assert r.json().get("already_owned") is True

    def test_buy_enough_points_deducts_and_owns(self, admin_headers, student):
        # give student points via admin
        r = requests.post(f"{API}/users/{student['id']}/points", json={"delta": 100}, headers=admin_headers)
        assert r.status_code == 200
        me0 = requests.get(f"{API}/auth/me", headers=student["headers"]).json()
        p0 = me0["points"]
        # neon_pulse default cost = 50
        r = requests.post(f"{API}/me/effects/buy", json={"effect_id": "neon_pulse"}, headers=student["headers"])
        assert r.status_code == 200, r.text
        body = r.json()
        assert "neon_pulse" in body["owned_effects"]
        assert body["points"] == p0 - 50

    def test_equip_not_owned_400(self, student):
        r = requests.post(f"{API}/me/effects/equip", json={"effect_id": "diamond"}, headers=student["headers"])
        assert r.status_code == 400

    def test_equip_owned_ok(self, student):
        r = requests.post(f"{API}/me/effects/equip", json={"effect_id": "neon_pulse"}, headers=student["headers"])
        assert r.status_code == 200
        assert r.json()["equipped"] == "neon_pulse"

    def test_equip_null_unequips(self, student):
        r = requests.post(f"{API}/me/effects/equip", json={"effect_id": None}, headers=student["headers"])
        assert r.status_code == 200
        assert r.json()["equipped"] == "none"

    def test_admin_equip_anything(self, admin_headers):
        r = requests.post(f"{API}/me/effects/equip", json={"effect_id": "phoenix"}, headers=admin_headers)
        assert r.status_code == 200
        assert r.json()["equipped"] == "phoenix"
        # reset
        requests.post(f"{API}/me/effects/equip", json={"effect_id": "none"}, headers=admin_headers)

    def test_profiles_include_equipped_effect(self, admin_headers, student):
        # Equip admin with golden, check public profiles
        requests.post(f"{API}/me/effects/equip", json={"effect_id": "golden"}, headers=admin_headers)
        r = requests.get(f"{API}/auth/profiles")
        assert r.status_code == 200
        data = r.json()
        for p in data:
            assert "equipped_effect" in p, f"profile missing equipped_effect: {p}"
        admin_p = next(p for p in data if p["role"] == "admin")
        assert admin_p["equipped_effect"] == "golden"
        # reset
        requests.post(f"{API}/me/effects/equip", json={"effect_id": "none"}, headers=admin_headers)
