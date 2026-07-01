# -*- coding: utf-8 -*-
"""Flask entrypoint for the garbage classification web demo."""

import json
import os
from datetime import datetime
from pathlib import Path

from flask import Flask, jsonify, render_template, request
from werkzeug.exceptions import RequestEntityTooLarge

from metadata import CLASS_CN, public_metadata

BASE_DIR = Path(__file__).resolve().parent
FEEDBACK_DIR = BASE_DIR / "feedback"
MAX_UPLOAD_BYTES = 5 * 1024 * 1024
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png"}

app = Flask(__name__)
_predictor_module = None


def get_predictor():
    """Load the heavy PyTorch predictor only when prediction is requested."""
    global _predictor_module
    if _predictor_module is None:
        import predictor as predictor_module

        _predictor_module = predictor_module
    return _predictor_module


def _image_kind(image_bytes):
    if image_bytes.startswith(b"\xff\xd8\xff"):
        return "jpg"
    if image_bytes.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png"
    return None


def read_image_upload(file_storage):
    if file_storage is None or not file_storage.filename:
        raise ValueError("缺少图片字段 image")

    suffix = Path(file_storage.filename).suffix.lower()
    if suffix not in ALLOWED_EXTENSIONS:
        raise ValueError("仅支持 JPG / PNG 图片")

    image_bytes = file_storage.read(MAX_UPLOAD_BYTES + 1)
    if len(image_bytes) > MAX_UPLOAD_BYTES:
        raise RequestEntityTooLarge("图片不能超过 5MB")

    kind = _image_kind(image_bytes)
    if kind is None:
        raise ValueError("无法识别图片格式，请上传有效 JPG / PNG")

    return image_bytes, kind


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/health", methods=["GET", "HEAD"])
def health_route():
    return jsonify({"ok": True, "model_loaded": _predictor_module is not None})


@app.route("/metadata")
def metadata_route():
    return jsonify(public_metadata())


@app.route("/predict", methods=["POST"])
def predict_route():
    try:
        image_bytes, _ = read_image_upload(request.files.get("image"))
        result = get_predictor().predict(image_bytes)
        return jsonify(result)
    except RequestEntityTooLarge as exc:
        return jsonify({"ok": False, "error": str(exc)}), 413
    except Exception as exc:
        return jsonify({"ok": False, "error": str(exc)}), 400


@app.route("/feedback", methods=["POST"])
def feedback_route():
    correct_class = (request.form.get("correct_class") or "").strip()
    if correct_class not in CLASS_CN:
        return jsonify({"ok": False, "error": "correct_class 非法"}), 400

    try:
        image_bytes, image_kind = read_image_upload(request.files.get("image"))
    except RequestEntityTooLarge as exc:
        return jsonify({"ok": False, "error": str(exc)}), 413
    except ValueError as exc:
        return jsonify({"ok": False, "error": str(exc)}), 400

    note = (request.form.get("note") or "").strip()[:500]
    orig_class = (request.form.get("orig_class") or "").strip()[:50]
    orig_group = (request.form.get("orig_group") or "").strip()[:50]
    now = datetime.now()
    filename = f"{now:%Y%m%d_%H%M%S_%f}.{image_kind}"
    class_dir = FEEDBACK_DIR / correct_class
    rel_path = f"feedback/{correct_class}/{filename}"

    try:
        class_dir.mkdir(parents=True, exist_ok=True)
        (class_dir / filename).write_bytes(image_bytes)
        record = {
            "ts": now.isoformat(timespec="seconds"),
            "file": rel_path,
            "correct_class": correct_class,
            "orig_class": orig_class,
            "orig_group": orig_group,
            "note": note,
        }
        with (FEEDBACK_DIR / "corrections.jsonl").open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(record, ensure_ascii=False) + "\n")
    except Exception as exc:
        return jsonify({"ok": False, "error": str(exc)}), 500

    return jsonify({"ok": True, "saved": rel_path})


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=False)
