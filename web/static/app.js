// ===== 配置 =====
// mock 开关：true 时不请求后端，直接用假数据演示完整流程。
// 即使为 false，当 fetch /predict 失败时也会自动降级到 mock，保证脱离后端可演示。
const USE_MOCK = false;

// 四大类元信息（颜色严格对应 CONTRACT 的 group_key）
const GROUP_META = {
  recyclable: { cn: "可回收物", color: "#1E88E5", advice: "请投入蓝色可回收物桶" },
  kitchen:    { cn: "厨余垃圾", color: "#43A047", advice: "请投入绿色厨余垃圾桶" },
  hazardous:  { cn: "有害垃圾", color: "#E53935", advice: "请投入红色有害垃圾桶" },
  other:      { cn: "其他垃圾", color: "#757575", advice: "请投入灰色其他垃圾桶" },
};

// ===== DOM 引用 =====
const fileInput   = document.getElementById("fileInput");
const dropZone    = document.getElementById("dropZone");
const dropPrompt  = document.getElementById("dropPrompt");
const preview     = document.getElementById("preview");
const predictBtn  = document.getElementById("predictBtn");
const resetBtn    = document.getElementById("resetBtn");
const statusMsg   = document.getElementById("statusMsg");
const resultPanel = document.getElementById("resultPanel");
const resultBadge = document.getElementById("resultBadge");
const confidenceNum = document.getElementById("confidenceNum");
const itemClassCn = document.getElementById("itemClassCn");
const adviceText  = document.getElementById("adviceText");
const barList     = document.getElementById("barList");
const flyImg      = document.getElementById("flyImg");
const bins        = document.getElementById("bins");

let currentFile = null;       // 当前选中的图片文件
let currentObjectUrl = null;  // 预览用的 object URL，便于释放

// ===== 文件选择 / 拖拽 =====
dropZone.addEventListener("click", () => fileInput.click());
dropZone.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileInput.click(); }
});
fileInput.addEventListener("change", () => {
  if (fileInput.files && fileInput.files[0]) handleFile(fileInput.files[0]);
});

["dragenter", "dragover"].forEach((ev) =>
  dropZone.addEventListener(ev, (e) => { e.preventDefault(); dropZone.classList.add("dragover"); })
);
["dragleave", "drop"].forEach((ev) =>
  dropZone.addEventListener(ev, (e) => { e.preventDefault(); dropZone.classList.remove("dragover"); })
);
dropZone.addEventListener("drop", (e) => {
  const f = e.dataTransfer.files && e.dataTransfer.files[0];
  if (f) handleFile(f);
});

function handleFile(file) {
  if (!file.type.startsWith("image/")) {
    setStatus("请选择图片文件（JPG / PNG）", "error");
    return;
  }
  currentFile = file;
  if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl);
  currentObjectUrl = URL.createObjectURL(file);

  preview.src = currentObjectUrl;
  preview.hidden = false;
  dropPrompt.hidden = true;
  predictBtn.disabled = false;
  resetBtn.hidden = false;
  setStatus("");
  // 重新选图时隐藏旧结果与桶状态
  resultPanel.hidden = true;
  clearBins();
}

// ===== 重置 =====
resetBtn.addEventListener("click", () => {
  currentFile = null;
  if (currentObjectUrl) { URL.revokeObjectURL(currentObjectUrl); currentObjectUrl = null; }
  fileInput.value = "";
  preview.hidden = true;
  preview.src = "";
  dropPrompt.hidden = false;
  predictBtn.disabled = true;
  resetBtn.hidden = true;
  resultPanel.hidden = true;
  setStatus("");
  clearBins();
});

// ===== 识别 =====
predictBtn.addEventListener("click", async () => {
  if (!currentFile) return;
  predictBtn.disabled = true;
  setStatus("识别中…", "loading");
  clearBins();
  resultPanel.hidden = true;

  try {
    const data = USE_MOCK ? await mockPredict() : await realPredict(currentFile);
    if (!data || !data.ok) {
      throw new Error((data && data.error) || "识别失败");
    }
    setStatus("");
    renderResult(data);
  } catch (err) {
    // 真实请求失败 → 自动降级 mock，保证演示不中断
    console.warn("请求失败，降级到 mock：", err);
    setStatus("后端未连接，使用演示数据", "loading");
    const data = await mockPredict();
    renderResult(data);
  } finally {
    predictBtn.disabled = false;
  }
});

async function realPredict(file) {
  const form = new FormData();
  form.append("image", file);
  const resp = await fetch("/predict", { method: "POST", body: form });
  // 即使是 400/500，也尝试解析 JSON 拿 error
  let json;
  try { json = await resp.json(); } catch { json = null; }
  if (!resp.ok && !json) throw new Error("HTTP " + resp.status);
  return json;
}

// ===== 假数据（符合 CONTRACT 结构）=====
function mockPredict() {
  return new Promise((resolve) => {
    setTimeout(() => {
      const keys = Object.keys(GROUP_META);
      const hitKey = keys[Math.floor(Math.random() * keys.length)];

      // 给命中类一个高概率，其余随机后归一化
      const raw = {};
      keys.forEach((k) => { raw[k] = Math.random() * 0.15; });
      raw[hitKey] = 0.6 + Math.random() * 0.35;
      const sum = keys.reduce((s, k) => s + raw[k], 0);
      const top4 = keys
        .map((k) => ({ group_cn: GROUP_META[k].cn, group_key: k, prob: raw[k] / sum }))
        .sort((a, b) => b.prob - a.prob);

      const itemSamples = {
        recyclable: ["metal", "金属"], kitchen: ["vegetable", "蔬菜"],
        hazardous: ["battery", "电池"], other: ["papercup", "纸杯"],
      };
      resolve({
        ok: true,
        item_class: itemSamples[hitKey][0],
        item_class_cn: itemSamples[hitKey][1],
        group_cn: GROUP_META[hitKey].cn,
        group_key: hitKey,
        confidence: top4[0].prob,
        top4,
        advice: GROUP_META[hitKey].advice,
      });
    }, 600);
  });
}

// ===== 渲染结果 =====
function renderResult(data) {
  const key = data.group_key;
  const meta = GROUP_META[key] || GROUP_META.other;

  resultBadge.textContent = data.group_cn || meta.cn;
  resultBadge.style.background = meta.color;
  confidenceNum.textContent = Math.round((data.confidence || 0) * 100) + "%";
  itemClassCn.textContent = data.item_class_cn || "—";
  adviceText.textContent = data.advice || meta.advice;

  renderBars(data.top4 || []);
  resultPanel.hidden = false;

  // 落桶动画：飞向命中桶
  flyToBin(key);
}

// ===== Top-4 条形图 =====
function renderBars(top4) {
  barList.innerHTML = "";
  top4.forEach((item) => {
    const meta = GROUP_META[item.group_key] || GROUP_META.other;
    const pct = Math.round(item.prob * 100);

    const row = document.createElement("div");
    row.className = "bar-row";
    row.innerHTML = `
      <span class="bar-name">${item.group_cn}</span>
      <div class="bar-track"><div class="bar-fill"></div></div>
      <span class="bar-val">${pct}%</span>`;
    const fill = row.querySelector(".bar-fill");
    fill.style.background = meta.color;
    barList.appendChild(row);
    // 下一帧再设宽度，触发过渡动画
    requestAnimationFrame(() => requestAnimationFrame(() => { fill.style.width = pct + "%"; }));
  });
}

// ===== 落桶动画 =====
function flyToBin(key) {
  clearBins();
  const targetBin = bins.querySelector(`.bin[data-key="${key}"]`);
  if (!targetBin || !currentObjectUrl) return;

  // 飞行副本起点 = 预览图位置
  const startRect = preview.getBoundingClientRect();
  const binRect = targetBin.getBoundingClientRect();

  flyImg.src = currentObjectUrl;
  flyImg.classList.remove("flying");
  flyImg.style.transition = "none";
  flyImg.style.transform = "none";
  flyImg.style.left = startRect.left + "px";
  flyImg.style.top = startRect.top + "px";
  flyImg.style.width = startRect.width + "px";
  flyImg.style.height = startRect.height + "px";
  flyImg.style.opacity = "1";
  flyImg.style.display = "block";

  // 计算落点：飞到桶口中心，并缩小
  const targetX = binRect.left + binRect.width / 2 - (startRect.left + startRect.width / 2);
  const targetY = binRect.top - (startRect.top + startRect.height / 2);
  const scale = Math.min(0.18, binRect.width / startRect.width);

  requestAnimationFrame(() => requestAnimationFrame(() => {
    flyImg.classList.add("flying");
    flyImg.style.transform =
      `translate(${targetX}px, ${targetY}px) scale(${scale}) rotate(18deg)`;
    flyImg.style.opacity = "0";
  }));

  // 飞行结束后：桶高亮 + 弹跳
  setTimeout(() => {
    flyImg.style.display = "none";
    flyImg.classList.remove("flying");
    targetBin.classList.add("active", "bounce");
    setTimeout(() => targetBin.classList.remove("bounce"), 520);
  }, 1000);
}

function clearBins() {
  bins.querySelectorAll(".bin").forEach((b) => b.classList.remove("active", "bounce"));
}

// ===== 工具 =====
function setStatus(msg, type) {
  statusMsg.textContent = msg || "";
  statusMsg.className = "status-msg" + (type ? " " + type : "");
}
