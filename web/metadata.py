# -*- coding: utf-8 -*-
"""Shared metadata for the Flask API and browser UI."""

GROUPS = {
    "Recyclables": {
        "key": "recyclable",
        "cn": "可回收物",
        "color": "#1E88E5",
        "advice": "请投入蓝色可回收物桶",
    },
    "Kitchen waste": {
        "key": "kitchen",
        "cn": "厨余垃圾",
        "color": "#43A047",
        "advice": "请投入绿色厨余垃圾桶",
    },
    "Hazardous waste": {
        "key": "hazardous",
        "cn": "有害垃圾",
        "color": "#E53935",
        "advice": "请投入红色有害垃圾桶",
    },
    "Other": {
        "key": "other",
        "cn": "其他垃圾",
        "color": "#757575",
        "advice": "请投入灰色其他垃圾桶",
    },
}

CLASS_CN = {
    "cardboard": "纸板",
    "glass": "玻璃",
    "metal": "金属",
    "plastic": "塑料",
    "clothes": "衣物",
    "paper": "纸张",
    "bananapeel": "香蕉皮",
    "vegetable": "蔬菜",
    "battery": "电池",
    "lightbulb": "灯泡",
    "drugs": "药品",
    "papercup": "纸杯",
}

TRASH_KNOWLEDGE = {
    "纸板": {"tip": "拆开压扁后投入可回收物桶", "decompose": "3-6 个月", "note": "干净纸板可回收，脏污纸板归其他垃圾"},
    "玻璃": {"tip": "清洗后投入可回收物桶，破碎玻璃用报纸包好", "decompose": "上千年", "note": "有色玻璃与无色玻璃都可回收处理"},
    "金属": {"tip": "清洗干净后投入可回收物桶", "decompose": "50-100 年", "note": "金属罐可多次回收利用，节约能源"},
    "塑料": {"tip": "清洗后投入可回收物桶", "decompose": "100-500 年", "note": "硬质塑料容器通常更适合回收"},
    "衣物": {"tip": "投入旧衣回收箱或可回收物桶", "decompose": "棉 1-5 年，化纤上百年", "note": "可捐赠衣物建议优先再利用"},
    "纸张": {"tip": "展开铺平后投入可回收物桶", "decompose": "3-6 个月", "note": "卫生纸、纸巾不宜回收"},
    "香蕉皮": {"tip": "投入厨余垃圾桶", "decompose": "2-5 周", "note": "果皮菜叶可用于堆肥处理"},
    "蔬菜": {"tip": "投入厨余垃圾桶", "decompose": "2-4 周", "note": "厨余垃圾经处理后可用于生产有机肥"},
    "电池": {"tip": "投入有害垃圾桶或电池回收箱", "decompose": "上百年", "note": "含重金属，严禁随意丢弃"},
    "灯泡": {"tip": "投入有害垃圾桶，破碎灯泡要包好", "decompose": "上千年", "note": "节能灯含汞，必须单独回收"},
    "药品": {"tip": "投入有害垃圾桶或退回药店回收点", "decompose": "污染水源", "note": "过期药品不可冲入下水道"},
    "纸杯": {"tip": "投入其他垃圾桶", "decompose": "约 50 年", "note": "纸杯内壁有塑料膜，通常不适合回收"},
}


def public_metadata():
    return {
        "classes": [{"key": key, "cn": value} for key, value in CLASS_CN.items()],
        "groups": {
            value["key"]: {
                "cn": value["cn"],
                "color": value["color"],
                "advice": value["advice"],
                "model_name": model_name,
            }
            for model_name, value in GROUPS.items()
        },
        "knowledge": TRASH_KNOWLEDGE,
    }
