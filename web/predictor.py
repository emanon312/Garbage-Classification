# -*- coding: utf-8 -*-
"""垃圾分类推理封装。

把原版 Code/inference.py 的 PyTorch 推理封装成单一函数 predict()，
返回严格符合 CONTRACT.md 的结构。模型只在模块导入时加载一次。
"""
import io
import os
import sys

import cv2
import numpy as np
import torch
from torchvision import transforms

# ---------- 用绝对路径定位 Code 目录，并加入 sys.path 以便 import config / models ----------
_THIS_DIR = os.path.dirname(os.path.abspath(__file__))
_CODE_DIR = os.path.normpath(os.path.join(_THIS_DIR, "..", "Code"))
_MODELS_DIR = os.path.join(_CODE_DIR, "models")
for _p in (_CODE_DIR, _MODELS_DIR):
    if _p not in sys.path:
        sys.path.insert(0, _p)

from models.mobilenetv3 import MobileNetV3_Small  # noqa: E402

# 权重与数据集信息：原版 config 里是相对路径，这里换成基于 __file__ 的绝对路径
_CKPT_PATH = os.path.join(_CODE_DIR, "checkpoint", "exp2", "ckpt_149.pth")
_DATASET_INFO_PATH = os.path.join(_CODE_DIR, "checkpoint", "exp2", "DataSetInfo.pth")

# ---------- 英文大类 → 中文 / group_key / advice 映射（严格按 CONTRACT.md） ----------
_GROUP_MAP = {
    "Recyclables": ("可回收物", "recyclable", "请投入蓝色可回收物桶"),
    "Kitchen waste": ("厨余垃圾", "kitchen", "请投入绿色厨余垃圾桶"),
    "Hazardous waste": ("有害垃圾", "hazardous", "请投入红色有害垃圾桶"),
    "Other": ("其他垃圾", "other", "请投入灰色其他垃圾桶"),
}

# ---------- 12 小类英文 → 中文映射（严格按 CONTRACT.md） ----------
_CLASS_CN = {
    "cardboard": "纸板", "glass": "玻璃", "metal": "金属", "plastic": "塑料",
    "clothes": "衣物", "paper": "纸张", "bananapeel": "香蕉皮", "vegetable": "蔬菜",
    "battery": "电池", "lightbulb": "灯泡", "drugs": "药品", "papercup": "纸杯",
}

# ---------- 模块级加载：模型与数据集信息只加载一次 ----------
_DATASET_INFO = torch.load(_DATASET_INFO_PATH)
_INDEX_TO_CLASS = _DATASET_INFO["index_to_class"]   # 12 个小类英文名
_INDEX_TO_GROUP = _DATASET_INFO["index_to_group"]   # 每个小类对应的英文大类名

_DEVICE = torch.device("cpu")  # config.InferWithGPU=False
_MODEL = MobileNetV3_Small(_DATASET_INFO["class_num"])
_MODEL.load_state_dict(
    torch.load(_CKPT_PATH, map_location=_DEVICE)["state_dict"]
)
_MODEL.cpu()
_MODEL.eval()

# 预处理：沿用原版（短边 resize 到 224 + BGR→RGB + ToTensor + Normalize）
_TRANSFORM = transforms.Compose([
    transforms.ToTensor(),
    transforms.Normalize(mean=[0.485, 0.456, 0.406],
                         std=[0.229, 0.224, 0.225]),
])


def _cv_img_to_tensor(cv_img):
    """与原版 cvImgToTensor 等价：短边缩放到 224，BGR→RGB，归一化。"""
    image = cv_img.copy()
    height, width = image.shape[:2]
    ratio = 224 / min(height, width)
    image = cv2.resize(image, None, fx=ratio, fy=ratio)
    image = image[:, :, (2, 1, 0)]  # BGR → RGB
    tensor = _TRANSFORM(image)
    tensor.unsqueeze_(0)
    return tensor


def _read_image(image_bytes_or_path):
    """支持传入文件路径(str) 或图片字节(bytes)，统一解码成 cv2 BGR 图。"""
    if isinstance(image_bytes_or_path, (bytes, bytearray)):
        buf = np.frombuffer(bytes(image_bytes_or_path), dtype=np.uint8)
        img = cv2.imdecode(buf, cv2.IMREAD_COLOR)
    elif isinstance(image_bytes_or_path, str):
        img = cv2.imread(image_bytes_or_path)
    else:
        raise TypeError("predict 只接受图片字节(bytes) 或文件路径(str)")
    if img is None:
        raise ValueError("无法解码图片，请确认是有效的 jpg/png 图像")
    return img


def predict(image_bytes_or_path):
    """对单张图片做垃圾分类推理，返回符合 CONTRACT.md 的字典。

    流程：12 小类 logits → softmax → 按英文大类累加成四大类概率 →
    取概率最大的大类作为预测结果；item_class 取 12 类中概率最高者。
    """
    img = _read_image(image_bytes_or_path)
    tensor = _cv_img_to_tensor(img).to(_DEVICE)

    with torch.no_grad():
        logits = _MODEL(tensor)
        probs = torch.softmax(logits, dim=1)[0]  # 12 维小类概率

    # 12 小类概率 → 累加到 4 大类
    group_probs = {}
    for idx, p in enumerate(probs.tolist()):
        group_en = _INDEX_TO_GROUP[idx]
        group_probs[group_en] = group_probs.get(group_en, 0.0) + p

    # 预测大类 = 汇总概率最大的英文大类
    pred_group_en = max(group_probs, key=group_probs.get)
    group_cn, group_key, advice = _GROUP_MAP[pred_group_en]
    confidence = group_probs[pred_group_en]

    # item_class = 12 类中概率最高者
    top_idx = int(torch.argmax(probs).item())
    item_class = _INDEX_TO_CLASS[top_idx]

    # top4 = 四大类汇总概率，按 prob 降序，固定 4 项
    top4 = []
    for group_en in sorted(group_probs, key=group_probs.get, reverse=True):
        g_cn, g_key, _ = _GROUP_MAP[group_en]
        top4.append({"group_cn": g_cn, "group_key": g_key,
                     "prob": round(group_probs[group_en], 4)})

    return {
        "ok": True,
        "item_class": item_class,
        "item_class_cn": _CLASS_CN[item_class],
        "group": pred_group_en,
        "group_cn": group_cn,
        "group_key": group_key,
        "confidence": round(confidence, 4),
        "top4": top4,
        "advice": advice,
    }
