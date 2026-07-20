"""Iteration 5 - Avatar upload bug fix regression tests.

Bug: profile picture upload failing due to expired EMERGENT_LLM_KEY.
Fix: key rotated + auto refresh of storage_key on 401/403.
"""
import io
import os
import struct
import zlib
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://escola-tasks-pro.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@escola.com"
ADMIN_PASSWORD = "enzo123cg"


def _tiny_png_bytes() -> bytes:
    """Generate a minimal valid 1x1 PNG image (no PIL dependency)."""
    def chunk(tag, data):
        return (struct.pack(">I", len(data)) + tag + data +
                struct.pack(">I", zlib.crc32(tag + data) & 0xffffffff))
    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = chunk(b"IHDR", struct.pack(">IIBBBBB", 1, 1, 8, 2, 0, 0, 0))
    raw = b"\x00\xff\x00\x00"  # filter byte + RGB pixel
    idat = chunk(b"IDAT", zlib.compress(raw))
    iend = chunk(b"IEND", b"")
    return sig + ihdr + idat + iend


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="module")
def admin_id(admin_headers):
    r = requests.get(f"{API}/auth/me", headers=admin_headers, timeout=15)
    assert r.status_code == 200
    return r.json()["id"]


@pytest.fixture(scope="module")
def student(admin_headers):
    """Create a fresh student and log in."""
    name = f"TEST_stu_{uuid.uuid4().hex[:6]}"
    password = "stu12345"
    r = requests.post(f"{API}/users", json={"name": name, "password": password}, headers=admin_headers, timeout=15)
    assert r.status_code in (200, 201), f"Create student failed: {r.status_code} {r.text}"
    user = r.json()
    user_id = user["id"]
    # Log in as this student
    lr = requests.post(f"{API}/auth/login", json={"user_id": user_id, "password": password}, timeout=15)
    assert lr.status_code == 200, f"Student login failed: {lr.status_code} {lr.text}"
    token = lr.json()["token"]
    yield {"id": user_id, "name": name, "password": password, "token": token}
    # cleanup
    requests.delete(f"{API}/users/{user_id}", headers=admin_headers, timeout=15)


# ---------------------------------------------------------------------------
# Avatar upload (the bug that was fixed)
# ---------------------------------------------------------------------------
class TestAvatarUpload:
    def test_admin_uploads_own_avatar(self, admin_headers, admin_id):
        img = _tiny_png_bytes()
        files = {"file": ("me.png", img, "image/png")}
        r = requests.post(f"{API}/me/avatar", headers=admin_headers, files=files, timeout=30)
        assert r.status_code == 200, f"Upload failed: {r.status_code} {r.text}"
        assert r.json().get("ok") is True

        # auth/me shows has_avatar
        me = requests.get(f"{API}/auth/me", headers=admin_headers, timeout=15).json()
        assert me.get("has_avatar") is True, f"has_avatar not true: {me}"

        # GET avatar bytes
        g = requests.get(f"{API}/avatars/{admin_id}", timeout=30)
        assert g.status_code == 200, f"GET avatar failed: {g.status_code} {g.text[:200]}"
        assert g.headers.get("content-type", "").startswith("image/"), g.headers
        assert len(g.content) > 0

    def test_admin_uploads_avatar_for_student(self, admin_headers, student):
        img = _tiny_png_bytes()
        files = {"file": ("s.png", img, "image/png")}
        r = requests.post(f"{API}/users/{student['id']}/avatar", headers=admin_headers, files=files, timeout=30)
        assert r.status_code == 200, f"Admin upload for student failed: {r.status_code} {r.text}"
        g = requests.get(f"{API}/avatars/{student['id']}", timeout=30)
        assert g.status_code == 200
        assert g.headers.get("content-type", "").startswith("image/")

    def test_student_uploads_own_avatar_and_delete(self, student):
        headers = {"Authorization": f"Bearer {student['token']}"}
        img = _tiny_png_bytes()
        files = {"file": ("me.png", img, "image/png")}
        r = requests.post(f"{API}/me/avatar", headers=headers, files=files, timeout=30)
        assert r.status_code == 200, f"Student self-upload failed: {r.status_code} {r.text}"

        me = requests.get(f"{API}/auth/me", headers=headers, timeout=15).json()
        assert me.get("has_avatar") is True

        # delete
        d = requests.delete(f"{API}/me/avatar", headers=headers, timeout=15)
        assert d.status_code == 200
        me2 = requests.get(f"{API}/auth/me", headers=headers, timeout=15).json()
        assert me2.get("has_avatar") is False, f"has_avatar not cleared after delete: {me2}"

        g = requests.get(f"{API}/avatars/{student['id']}", timeout=15)
        assert g.status_code == 404


# ---------------------------------------------------------------------------
# Regression: task attachments upload/download
# ---------------------------------------------------------------------------
class TestFileUploadRegression:
    def test_file_upload_and_download(self, admin_headers):
        content = b"Hello world - iter5 regression test file.\n"
        files = {"file": ("test.txt", content, "text/plain")}
        r = requests.post(f"{API}/files/upload", headers=admin_headers, files=files, timeout=30)
        assert r.status_code in (200, 201), f"file upload failed: {r.status_code} {r.text}"
        data = r.json()
        file_id = data.get("id") or data.get("file_id")
        assert file_id, f"no id in response: {data}"

        g = requests.get(f"{API}/files/{file_id}/download", headers=admin_headers, timeout=30, allow_redirects=True)
        assert g.status_code == 200, f"download failed: {g.status_code} {g.text[:200]}"
        assert content in g.content or g.content == content


# ---------------------------------------------------------------------------
# Regression: tasks + announcements end-to-end
# ---------------------------------------------------------------------------
class TestTasksAnnouncementsRegression:
    def test_create_task(self, admin_headers):
        # need a subject
        subs = requests.get(f"{API}/subjects", headers=admin_headers, timeout=15).json()
        if not subs:
            sr = requests.post(f"{API}/subjects", json={"name": f"TEST_Sub_{uuid.uuid4().hex[:4]}"}, headers=admin_headers, timeout=15)
            assert sr.status_code in (200, 201)
            subject_id = sr.json()["id"]
        else:
            subject_id = subs[0]["id"]

        payload = {
            "title": f"TEST_Task_{uuid.uuid4().hex[:4]}",
            "description": "regression test task",
            "subject_id": subject_id,
            "subject": "TEST",
            "due_date": "2026-12-31",
        }
        r = requests.post(f"{API}/tasks", json=payload, headers=admin_headers, timeout=15)
        assert r.status_code in (200, 201), f"create task failed: {r.status_code} {r.text}"
        tid = r.json().get("id")
        assert tid
        # cleanup
        requests.delete(f"{API}/tasks/{tid}", headers=admin_headers, timeout=15)

    def test_create_announcement(self, admin_headers):
        payload = {"title": f"TEST_Ann_{uuid.uuid4().hex[:4]}", "message": "hello"}
        r = requests.post(f"{API}/announcements", json=payload, headers=admin_headers, timeout=15)
        assert r.status_code in (200, 201), f"create announcement failed: {r.status_code} {r.text}"
        aid = r.json().get("id")
        if aid:
            requests.delete(f"{API}/announcements/{aid}", headers=admin_headers, timeout=15)
