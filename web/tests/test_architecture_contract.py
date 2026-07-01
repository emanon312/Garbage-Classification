import importlib
import sys
from io import BytesIO
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PROJECT_ROOT = ROOT.parent


def load_app_without_predictor(monkeypatch):
    sys.path.insert(0, str(ROOT))
    sys.modules.pop("app", None)
    sys.modules.pop("predictor", None)
    monkeypatch.setitem(sys.modules, "predictor", None)
    return importlib.import_module("app")


def test_app_import_does_not_load_predictor(monkeypatch):
    app_module = load_app_without_predictor(monkeypatch)

    assert hasattr(app_module, "app")


def test_health_and_metadata_are_available_without_model(monkeypatch):
    app_module = load_app_without_predictor(monkeypatch)
    client = app_module.app.test_client()

    health = client.get("/health")
    metadata = client.get("/metadata")

    assert health.status_code == 200
    assert health.get_json()["ok"] is True
    assert "model_loaded" in health.get_json()
    assert metadata.status_code == 200
    payload = metadata.get_json()
    assert len(payload["classes"]) == 12
    assert set(payload["groups"]) == {"recyclable", "kitchen", "hazardous", "other"}


def test_upload_validation_rejects_bad_inputs(monkeypatch):
    app_module = load_app_without_predictor(monkeypatch)
    client = app_module.app.test_client()

    bad_type = client.post(
        "/feedback",
        data={
            "correct_class": "battery",
            "image": (BytesIO(b"not an image"), "note.txt"),
        },
        content_type="multipart/form-data",
    )
    oversized = client.post(
        "/feedback",
        data={
            "correct_class": "battery",
            "image": (BytesIO(b"x" * (app_module.MAX_UPLOAD_BYTES + 1)), "large.jpg"),
        },
        content_type="multipart/form-data",
    )

    assert bad_type.status_code == 400
    assert oversized.status_code == 413


def test_public_template_has_no_private_team_or_placeholder_github_link():
    html = (ROOT / "templates" / "index.html").read_text(encoding="utf-8")

    assert "https://github.com/emanon312/Garbage-Classification" in html
    assert 'href="https://github.com/"' not in html
    assert "团队成员" not in html
    assert "张世勇" not in html
    assert "大数据一班" not in html
