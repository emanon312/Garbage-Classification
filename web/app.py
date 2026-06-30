# -*- coding: utf-8 -*-
"""垃圾分类 Flask Web 服务。

GET  /         返回前端页面 index.html（前端同事放在 templates/）
POST /predict  接收 multipart 字段 image，调用 predictor 返回分类 JSON
POST /feedback 接收纠错的错例图片 + 正确类别 + 备注，落盘到 feedback/ 供后续重训
"""
import json
import os
from datetime import datetime

from flask import Flask, jsonify, render_template, request

from predictor import predict, _CLASS_CN

app = Flask(__name__)  # 标准结构：templates/ 与 static/ 相对本文件

# 12 小类英文名白名单（与推理同源，纠错落盘按这套英文名归目录，结构对齐 TrashBig/train/）
_VALID_CLASSES = set(_CLASS_CN.keys())
# 纠错错例落盘根目录（基于本文件的绝对路径，不依赖 cwd）
_FEEDBACK_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "feedback")


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/predict", methods=["POST"])
def predict_route():
    file = request.files.get("image")
    if file is None:
        return jsonify({"ok": False, "error": "缺少图片字段 image"}), 400
    try:
        result = predict(file.read())
        return jsonify(result)
    except Exception as exc:  # 推理或解码失败，按契约返回 ok=false
        return jsonify({"ok": False, "error": str(exc)}), 500


@app.route("/feedback", methods=["POST"])
def feedback_route():
    """接收用户纠错的错例，落盘到 feedback/<正确类名>/ 供后续并入数据集重训。

    单进程 dev server，corrections.jsonl 追加不加锁（不并发假设）。
    """
    file = request.files.get("image")
    if file is None:
        return jsonify({"ok": False, "error": "缺少图片字段 image"}), 400

    # 安全关键：correct_class 直接用于拼目录路径，必须白名单校验，禁止路径穿越
    correct_class = (request.form.get("correct_class") or "").strip()
    if correct_class not in _VALID_CLASSES:
        return jsonify({"ok": False, "error": "correct_class 非法"}), 400

    note = (request.form.get("note") or "").strip()[:500]
    orig_class = (request.form.get("orig_class") or "").strip()[:50]
    orig_group = (request.form.get("orig_group") or "").strip()[:50]
    image_bytes = file.read()

    now = datetime.now()
    filename = now.strftime("%Y%m%d_%H%M%S_%f") + ".jpg"  # 带微秒，避免同秒覆盖
    class_dir = os.path.join(_FEEDBACK_DIR, correct_class)
    os.makedirs(class_dir, exist_ok=True)
    rel_path = "feedback/" + correct_class + "/" + filename  # 相对 web/ 的相对路径

    try:
        with open(os.path.join(class_dir, filename), "wb") as f:
            f.write(image_bytes)  # 直接写原图字节，不重编码，保留原图供训练
        record = {
            "ts": now.isoformat(timespec="seconds"),
            "file": rel_path,
            "correct_class": correct_class,
            "orig_class": orig_class,
            "orig_group": orig_group,
            "note": note,
        }
        with open(os.path.join(_FEEDBACK_DIR, "corrections.jsonl"), "a", encoding="utf-8") as f:
            f.write(json.dumps(record, ensure_ascii=False) + "\n")
    except Exception as exc:
        return jsonify({"ok": False, "error": str(exc)}), 500

    return jsonify({"ok": True, "saved": rel_path})


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=False)
