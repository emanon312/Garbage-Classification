const USE_MOCK = false;
const HISTORY_KEY = "garbage-classifier.history.v1";
const HISTORY_LIMIT = 30;

const GROUP_META = {
  recyclable: { cn: "可回收物", color: "#1E88E5", advice: "请投入蓝色可回收物桶" },
  kitchen: { cn: "厨余垃圾", color: "#43A047", advice: "请投入绿色厨余垃圾桶" },
  hazardous: { cn: "有害垃圾", color: "#E53935", advice: "请投入红色有害垃圾桶" },
  other: { cn: "其他垃圾", color: "#757575", advice: "请投入灰色其他垃圾桶" },
};

const CLASS_CN = {
  cardboard: "纸板",
  glass: "玻璃",
  metal: "金属",
  plastic: "塑料",
  clothes: "衣物",
  paper: "纸张",
  bananapeel: "香蕉皮",
  vegetable: "蔬菜",
  battery: "电池",
  lightbulb: "灯泡",
  drugs: "药品",
  papercup: "纸杯",
};

const fileInput = document.getElementById("fileInput");
const dropZone = document.getElementById("dropZone");
const dropPrompt = document.getElementById("dropPrompt");
const preview = document.getElementById("preview");
const predictBtn = document.getElementById("predictBtn");
const resetBtn = document.getElementById("resetBtn");
const statusMsg = document.getElementById("statusMsg");
const resultPanel = document.getElementById("resultPanel");
const resultBadge = document.getElementById("resultBadge");
const confidenceNum = document.getElementById("confidenceNum");
const itemClassCn = document.getElementById("itemClassCn");
const adviceText = document.getElementById("adviceText");
const barList = document.getElementById("barList");
const flyImg = document.getElementById("flyImg");
const bins = document.getElementById("bins");
const correctBtn = document.getElementById("correctBtn");
const correctPanel = document.getElementById("correctPanel");
const catChips = document.getElementById("catChips");
const correctionNote = document.getElementById("correctionNote");
const submitCorrectionBtn = document.getElementById("submitCorrectionBtn");
const cancelCorrectionBtn = document.getElementById("cancelCorrectionBtn");
const correctionMsg = document.getElementById("correctionMsg");
const historyPanel = document.getElementById("historyPanel");
const historyList = document.getElementById("historyList");
const clearHistoryBtn = document.getElementById("clearHistoryBtn");

let currentFile = null;
let currentObjectUrl = null;
let currentResult = null;
let selectedCorrectionClass = "";
let activeHistoryId = "";

initCorrectionChips();
renderHistory();

dropZone.addEventListener("click", () => fileInput.click());
dropZone.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    fileInput.click();
  }
});

fileInput.addEventListener("change", () => {
  if (fileInput.files && fileInput.files[0]) handleFile(fileInput.files[0]);
});

["dragenter", "dragover"].forEach((eventName) => {
  dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropZone.classList.add("dragover");
  });
});

["dragleave", "drop"].forEach((eventName) => {
  dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropZone.classList.remove("dragover");
  });
});

dropZone.addEventListener("drop", (event) => {
  const file = event.dataTransfer.files && event.dataTransfer.files[0];
  if (file) handleFile(file);
});

resetBtn.addEventListener("click", resetUpload);
predictBtn.addEventListener("click", predictCurrentFile);
correctBtn.addEventListener("click", () => {
  resetCorrectionPanel();
  correctPanel.hidden = false;
});
cancelCorrectionBtn.addEventListener("click", () => {
  resetCorrectionPanel();
  correctPanel.hidden = true;
});
submitCorrectionBtn.addEventListener("click", submitCorrection);
clearHistoryBtn.addEventListener("click", () => {
  saveHistory([]);
  renderHistory();
});

function handleFile(file) {
  if (!file.type.startsWith("image/")) {
    setStatus("请选择图片文件（JPG / PNG）", "error");
    return;
  }

  currentFile = file;
  currentResult = null;
  activeHistoryId = "";
  selectedCorrectionClass = "";

  if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl);
  currentObjectUrl = URL.createObjectURL(file);

  preview.src = currentObjectUrl;
  preview.hidden = false;
  dropPrompt.hidden = true;
  predictBtn.disabled = false;
  resetBtn.hidden = false;
  resultPanel.hidden = true;
  correctPanel.hidden = true;
  setStatus("");
  setCorrectionStatus("");
  clearBins();
}

function resetUpload() {
  currentFile = null;
  currentResult = null;
  activeHistoryId = "";
  selectedCorrectionClass = "";
  if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl);
  currentObjectUrl = null;
  fileInput.value = "";
  preview.hidden = true;
  preview.src = "";
  dropPrompt.hidden = false;
  predictBtn.disabled = true;
  resetBtn.hidden = true;
  resultPanel.hidden = true;
  correctPanel.hidden = true;
  setStatus("");
  setCorrectionStatus("");
  clearBins();
}

async function predictCurrentFile() {
  if (!currentFile) return;

  predictBtn.disabled = true;
  setStatus("识别中...", "loading");
  clearBins();
  resultPanel.hidden = true;
  correctPanel.hidden = true;

  try {
    const data = USE_MOCK ? await mockPredict() : await realPredict(currentFile);
    if (!data || !data.ok) throw new Error((data && data.error) || "识别失败");
    setStatus("");
    await renderResult(data);
  } catch (error) {
    console.warn("Predict failed, falling back to mock data.", error);
    setStatus("后端未连接，使用演示数据", "loading");
    const data = await mockPredict();
    await renderResult(data);
  } finally {
    predictBtn.disabled = false;
  }
}

async function realPredict(file) {
  const form = new FormData();
  form.append("image", file);
  const response = await fetch("/predict", { method: "POST", body: form });
  let json = null;
  try {
    json = await response.json();
  } catch {
    json = null;
  }
  if (!response.ok && !json) throw new Error("HTTP " + response.status);
  return json;
}

function mockPredict() {
  return new Promise((resolve) => {
    setTimeout(() => {
      const keys = Object.keys(GROUP_META);
      const hitKey = keys[Math.floor(Math.random() * keys.length)];
      const raw = {};
      keys.forEach((key) => { raw[key] = Math.random() * 0.15; });
      raw[hitKey] = 0.6 + Math.random() * 0.35;

      const sum = keys.reduce((total, key) => total + raw[key], 0);
      const top4 = keys
        .map((key) => ({ group_cn: GROUP_META[key].cn, group_key: key, prob: raw[key] / sum }))
        .sort((a, b) => b.prob - a.prob);
      const itemSamples = {
        recyclable: ["plastic", "塑料"],
        kitchen: ["vegetable", "蔬菜"],
        hazardous: ["battery", "电池"],
        other: ["papercup", "纸杯"],
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
    }, 500);
  });
}

async function renderResult(data) {
  const key = data.group_key || "other";
  const meta = GROUP_META[key] || GROUP_META.other;

  currentResult = data;
  resultBadge.textContent = data.group_cn || meta.cn;
  resultBadge.style.background = meta.color;
  animateConfidence(data.confidence || 0);
  itemClassCn.textContent = data.item_class_cn || "-";
  adviceText.textContent = data.advice || meta.advice;
  renderBars(data.top4 || []);
  resultPanel.hidden = false;
  resetCorrectionPanel();
  correctPanel.hidden = true;

  activeHistoryId = await addHistoryEntry(data);
  flyToBin(key);
}

function renderBars(top4) {
  barList.innerHTML = "";
  top4.forEach((item, index) => {
    const meta = GROUP_META[item.group_key] || GROUP_META.other;
    const pct = Math.round(item.prob * 100);
    const row = document.createElement("div");
    row.className = "bar-row";
    row.innerHTML = `
      <span class="bar-name">${escapeHTML(item.group_cn || meta.cn)}</span>
      <div class="bar-track"><div class="bar-fill"></div></div>
      <span class="bar-val">${pct}%</span>`;
    const fill = row.querySelector(".bar-fill");
    fill.style.background = meta.color;
    fill.style.transitionDelay = `${index * 70}ms`;
    barList.appendChild(row);
    requestAnimationFrame(() => requestAnimationFrame(() => { fill.style.width = pct + "%"; }));
  });
}

function initCorrectionChips() {
  catChips.innerHTML = "";
  Object.entries(CLASS_CN).forEach(([className, label]) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "cat-chip";
    chip.dataset.className = className;
    chip.textContent = label;
    chip.addEventListener("click", () => selectCorrectionClass(className));
    catChips.appendChild(chip);
  });
}

function selectCorrectionClass(className) {
  selectedCorrectionClass = className;
  catChips.querySelectorAll(".cat-chip").forEach((chip) => {
    chip.classList.toggle("active", chip.dataset.className === className);
  });
  submitCorrectionBtn.disabled = false;
  setCorrectionStatus("");
}

function resetCorrectionPanel() {
  selectedCorrectionClass = "";
  correctionNote.value = "";
  submitCorrectionBtn.disabled = true;
  catChips.querySelectorAll(".cat-chip").forEach((chip) => chip.classList.remove("active"));
  setCorrectionStatus("");
}

async function submitCorrection() {
  if (!currentFile || !currentResult || !selectedCorrectionClass) return;

  submitCorrectionBtn.disabled = true;
  setCorrectionStatus("正在保存纠错样本...", "loading");

  const payload = new FormData();
  payload.append("image", currentFile);
  payload.append("correct_class", selectedCorrectionClass);
  payload.append("note", correctionNote.value.trim());
  payload.append("orig_class", currentResult.item_class || "");
  payload.append("orig_group", currentResult.group || currentResult.group_key || "");

  try {
    const response = await fetch("/feedback", { method: "POST", body: payload });
    const json = await response.json();
    if (!response.ok || !json.ok) throw new Error((json && json.error) || "保存失败");
    markHistoryCorrected(activeHistoryId, selectedCorrectionClass, "saved");
    setCorrectionStatus("已保存到错例样本库", "success");
  } catch (error) {
    console.warn("Feedback save failed; recording locally.", error);
    markHistoryCorrected(activeHistoryId, selectedCorrectionClass, "local");
    setCorrectionStatus("后端未连接，已先记录在本地历史", "loading");
  } finally {
    correctPanel.hidden = true;
  }
}

async function addHistoryEntry(data) {
  const history = loadHistory();
  const id = String(Date.now());
  const thumb = currentFile ? await createThumbnail(currentFile) : "";
  const entry = {
    id,
    ts: new Date().toISOString(),
    thumb,
    group_key: data.group_key || "other",
    group_cn: data.group_cn || (GROUP_META[data.group_key] || GROUP_META.other).cn,
    item_class: data.item_class || "",
    item_class_cn: data.item_class_cn || "-",
    confidence: Number(data.confidence || 0),
    corrected: false,
    corrected_class: "",
    corrected_class_cn: "",
    correction_status: "",
  };
  saveHistory([entry, ...history].slice(0, HISTORY_LIMIT));
  renderHistory();
  return id;
}

function markHistoryCorrected(id, className, status) {
  if (!id) return;
  const history = loadHistory();
  const next = history.map((entry) => {
    if (entry.id !== id) return entry;
    return {
      ...entry,
      corrected: true,
      corrected_class: className,
      corrected_class_cn: CLASS_CN[className] || className,
      correction_status: status,
    };
  });
  saveHistory(next);
  renderHistory();
}

function loadHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveHistory(items) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(items));
  } catch (error) {
    console.warn("Failed to save local history.", error);
  }
}

function renderHistory() {
  const history = loadHistory();
  historyPanel.hidden = history.length === 0;
  historyList.innerHTML = "";

  history.forEach((entry) => {
    const meta = GROUP_META[entry.group_key] || GROUP_META.other;
    const card = document.createElement("article");
    card.className = "history-card";
    card.innerHTML = `
      <img class="history-thumb" src="${entry.thumb}" alt="" />
      <div class="history-content">
        <div class="history-main">
          <span class="history-group" style="background:${meta.color}">${escapeHTML(entry.group_cn)}</span>
          <strong>${escapeHTML(entry.item_class_cn || "-")}</strong>
          <span>${Math.round((entry.confidence || 0) * 100)}%</span>
        </div>
        <div class="history-sub">
          <time>${formatTime(entry.ts)}</time>
          ${entry.corrected ? `<span class="history-corrected">已纠错为 ${escapeHTML(entry.corrected_class_cn)}</span>` : ""}
        </div>
      </div>`;
    historyList.appendChild(card);
  });
}

function createThumbnail(file) {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const size = 96;
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      const scale = Math.max(size / img.width, size / img.height);
      const width = img.width * scale;
      const height = img.height * scale;
      const x = (size - width) / 2;
      const y = (size - height) / 2;
      ctx.drawImage(img, x, y, width, height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.72));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve("");
    };
    img.src = url;
  });
}

function flyToBin(key) {
  clearBins();
  const targetBin = bins.querySelector(`.bin[data-key="${key}"]`);
  if (!targetBin || !currentObjectUrl) return;

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

  const targetX = binRect.left + binRect.width / 2 - (startRect.left + startRect.width / 2);
  const targetY = binRect.top - (startRect.top + startRect.height / 2);
  const scale = Math.min(0.18, binRect.width / startRect.width);

  requestAnimationFrame(() => requestAnimationFrame(() => {
    flyImg.classList.add("flying");
    flyImg.style.transform = `translate(${targetX}px, ${targetY}px) scale(${scale}) rotate(18deg)`;
    flyImg.style.opacity = "0";
  }));

  setTimeout(() => {
    flyImg.style.display = "none";
    flyImg.classList.remove("flying");
    targetBin.classList.add("active", "bounce");
    setTimeout(() => targetBin.classList.remove("bounce"), 520);
  }, 1000);
}

function clearBins() {
  bins.querySelectorAll(".bin").forEach((bin) => bin.classList.remove("active", "bounce"));
}

function animateConfidence(confidence) {
  const target = Math.round(confidence * 100);
  const start = performance.now();
  const duration = 650;

  function tick(now) {
    const progress = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - progress, 3);
    confidenceNum.textContent = Math.round(target * eased) + "%";
    if (progress < 1) requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);
}

function setStatus(message, type) {
  statusMsg.textContent = message || "";
  statusMsg.className = "status-msg" + (type ? " " + type : "");
}

function setCorrectionStatus(message, type) {
  correctionMsg.textContent = message || "";
  correctionMsg.className = "status-msg" + (type ? " " + type : "");
}

function formatTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function escapeHTML(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
