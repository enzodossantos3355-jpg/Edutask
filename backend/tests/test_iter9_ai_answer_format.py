"""Iteration 9 - AI answer format refinement.

Covers:
- _clean_answer_text helper: strips ** __ markdown, headings, bullet asterisks,
  preserves math like 3*5 and newlines.
- POST /api/ai/generate-task-answer: cleaned output (no **, no verbose section
  titles like 'Raciocínio', 'Passo a Passo'), preferably contains 'Resposta:'.
- Kill-switch: PUT /api/ai/status enabled=false blocks generate-task-answer with 503;
  other endpoints (monthly-report, prize-evaluate, prize-tips) still respect kill-switch spec.
"""
import base64
import io
import os
import sys
import time
import uuid

import pytest
import requests
from PIL import Image, ImageDraw

# Ensure backend importable for helper unit test
sys.path.insert(0, "/app/backend")

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://escola-tasks-pro.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
ADMIN_EMAIL = "admin@escola.com"
ADMIN_PASSWORD = "enzo123cg"


# --------------------------- Fixtures ---------------------------
@pytest.fixture(scope="module")
def admin_headers():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
    assert r.status_code == 200, r.text
    tok = r.json()["token"]
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def student_setup(admin_headers):
    name = f"TEST_iter9_stu_{uuid.uuid4().hex[:6]}"
    pwd = "student123"
    r = requests.post(f"{API}/users", json={"name": name, "password": pwd}, headers=admin_headers, timeout=15)
    assert r.status_code in (200, 201), r.text
    uid = r.json()["id"]
    r2 = requests.post(f"{API}/auth/login", json={"user_id": uid, "password": pwd}, timeout=15)
    assert r2.status_code == 200
    tok = r2.json()["token"]
    yield {"id": uid, "headers": {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}}
    requests.delete(f"{API}/users/{uid}", headers=admin_headers, timeout=15)


@pytest.fixture(autouse=True)
def _ai_reset(admin_headers):
    """Force AI ON before/after each test."""
    requests.put(f"{API}/ai/status", json={"enabled": True}, headers=admin_headers, timeout=10)
    yield
    requests.put(f"{API}/ai/status", json={"enabled": True}, headers=admin_headers, timeout=10)


def _math_png_bytes():
    """Create a PNG with '2 + 3 = ?' rendered clearly for Gemini vision."""
    img = Image.new("RGB", (400, 200), color=(255, 255, 255))
    d = ImageDraw.Draw(img)
    # Big text using default font (works even without truetype)
    try:
        from PIL import ImageFont
        font = ImageFont.load_default()
    except Exception:
        font = None
    d.text((30, 60), "Questao 1: 2 + 3 = ?", fill=(0, 0, 0), font=font)
    d.text((30, 110), "Questao 2: 10 - 4 = ?", fill=(0, 0, 0), font=font)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


# --------------------------- Unit test: _clean_answer_text ---------------------------
def test_clean_answer_text_helper():
    from server import _clean_answer_text as clean

    # bold **
    assert clean("**Resposta:** 5") == "Resposta: 5"
    # bold __
    assert clean("__Resposta:__ 5") == "Resposta: 5"
    # headings
    assert clean("# Título\nConteúdo") == "Título\nConteúdo"
    # bullet asterisk
    assert clean("* item 1\n* item 2") == "item 1\nitem 2"
    # code fences
    assert clean("```\nfoo\n```") == "foo"
    # multi-line preserved
    out = clean("Questão 1: 2+3\nContas: 2+3=5\nResposta: 5")
    assert "Questão 1: 2+3" in out and "Resposta: 5" in out
    assert out.count("\n") >= 2
    # math with * between digits preserved
    out2 = clean("Contas: 3 * 5 = 15\nResposta: 15")
    assert "3 * 5 = 15" in out2
    # bold+text mixed
    assert clean("**Questão 1:** 2+3\n**Resposta:** 5") == "Questão 1: 2+3\nResposta: 5"


# --------------------------- Integration: generate-task-answer format ---------------------------
def _upload_photo(admin_headers):
    files = {"file": ("math.png", _math_png_bytes(), "image/png")}
    r = requests.post(
        f"{API}/files/upload",
        files=files,
        headers={"Authorization": admin_headers["Authorization"]},
        timeout=30,
    )
    assert r.status_code == 200, r.text
    return r.json()["id"]


def _create_task_with_photo(admin_headers, fid):
    payload = {
        "subject": "Matemática",
        "title": "TEST_iter9_answer_format",
        "description": "Resolva as questões da foto",
        "due_date": "2099-12-31",
        "attachments": [],
        "assigned_to": [],
        "admin_photos": [fid],
    }
    r = requests.post(f"{API}/tasks", json=payload, headers=admin_headers, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["id"]


def test_generate_task_answer_format_no_markdown_no_verbose(admin_headers):
    fid = _upload_photo(admin_headers)
    tid = _create_task_with_photo(admin_headers, fid)
    try:
        last = None
        for _ in range(2):
            r = requests.post(
                f"{API}/ai/generate-task-answer",
                json={"task_id": tid},
                headers=admin_headers,
                timeout=90,
            )
            last = r
            if r.status_code == 200:
                break
            time.sleep(3)
        assert last.status_code == 200, last.text
        ans = last.json().get("answer", "")
        assert isinstance(ans, str) and len(ans) > 5

        # Must NOT contain markdown bold
        assert "**" not in ans, f"Found ** markdown bold in answer: {ans!r}"
        assert "__" not in ans, f"Found __ markdown bold in answer: {ans!r}"

        # Must NOT contain verbose section titles (case-insensitive)
        lower = ans.lower()
        forbidden = ["passo a passo", "raciocínio", "raciocinio", "identificação da operação", "identificacao da operacao"]
        for w in forbidden:
            assert w not in lower, f"Forbidden verbose word '{w}' in: {ans!r}"

        # Should follow Q/R format (tolerant): expect at least 'Resposta' word
        assert "resposta" in lower, f"'Resposta' not found in answer: {ans!r}"

        print(f"\n[iter9] cleaned AI answer ({len(ans)} chars):\n{ans}\n")
    finally:
        requests.delete(f"{API}/tasks/{tid}", headers=admin_headers, timeout=15)


# --------------------------- Kill-switch regression ---------------------------
def test_killswitch_blocks_generate_task_answer(admin_headers):
    fid = _upload_photo(admin_headers)
    tid = _create_task_with_photo(admin_headers, fid)
    try:
        # Disable AI
        pr = requests.put(f"{API}/ai/status", json={"enabled": False}, headers=admin_headers, timeout=10)
        assert pr.status_code == 200

        r = requests.post(
            f"{API}/ai/generate-task-answer",
            json={"task_id": tid},
            headers=admin_headers,
            timeout=30,
        )
        assert r.status_code == 503, f"Expected 503 when AI disabled, got {r.status_code}: {r.text}"
    finally:
        # Re-enable
        requests.put(f"{API}/ai/status", json={"enabled": True}, headers=admin_headers, timeout=10)
        requests.delete(f"{API}/tasks/{tid}", headers=admin_headers, timeout=15)


def test_other_ai_endpoints_work_when_enabled(admin_headers, student_setup):
    """Regression: monthly-report + prize-evaluate + prize-tips still work when AI enabled."""
    # monthly-report (admin)
    r = requests.get(f"{API}/ai/monthly-report/{student_setup['id']}", headers=admin_headers, timeout=90)
    assert r.status_code == 200, r.text
    assert "report" in r.json()

    # prize-evaluate (admin)
    r2 = requests.get(f"{API}/ai/prize-evaluate", headers=admin_headers, timeout=90)
    assert r2.status_code == 200, r2.text

    # prize-tips (student)
    r3 = requests.get(f"{API}/ai/prize-tips", headers=student_setup["headers"], timeout=90)
    assert r3.status_code == 200, r3.text
