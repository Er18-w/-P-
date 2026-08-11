const state = { images: [], logos: [], selectedIndex: 0, selectedLogoId: null, position: "bottom-right", ratioFilter: "all" };

const els = Object.fromEntries([
  "imageInput", "logoInput", "previewCanvas", "emptyState", "thumbs", "fileCount", "statusText", "clearAll",
  "downloadCurrent", "downloadZip", "logoLibrary", "logoName", "logoGroup", "exportScope", "ratioFilter",
  "logoSize", "logoMargin", "logoOpacity", "brightness", "contrast", "saturation", "sharpen", "format", "quality",
  "logoSizeValue", "logoMarginValue", "logoOpacityValue", "brightnessValue", "contrastValue", "saturationValue", "qualityValue",
].map((id) => [id, document.querySelector(`#${id}`)]));
els.positionButtons = [...document.querySelectorAll("[data-position]")];
const ctx = els.previewCanvas.getContext("2d", { willReadFrequently: true });

els.imageInput.addEventListener("change", async (event) => {
  const loaded = await Promise.all([...event.target.files].filter(isImage).map(loadImageFile));
  state.images.push(...loaded.map((image) => ({ ...image, ratio: classifyRatio(image.img.naturalWidth, image.img.naturalHeight) })));
  state.selectedIndex = 0;
  refreshRatioFilter(); renderThumbs(); drawPreview();
});

els.logoInput.addEventListener("change", async (event) => {
  const loaded = await Promise.all([...event.target.files].filter(isImage).map(loadImageFile));
  loaded.forEach((item) => state.logos.push({ ...item, id: crypto.randomUUID(), name: stripExtension(item.file.name), group: "未分组" }));
  if (!state.selectedLogoId && state.logos[0]) state.selectedLogoId = state.logos[0].id;
  renderLogoLibrary(); drawPreview();
  event.target.value = "";
});

[els.logoSize, els.logoMargin, els.logoOpacity, els.brightness, els.contrast, els.saturation, els.quality].forEach((control) => {
  control.addEventListener("input", () => { updateValueLabels(); drawPreview(); });
});
els.sharpen.addEventListener("change", drawPreview);
els.format.addEventListener("change", drawPreview);
els.logoName.addEventListener("input", () => updateSelectedLogoMeta("name", els.logoName.value));
els.logoGroup.addEventListener("input", () => updateSelectedLogoMeta("group", els.logoGroup.value));
els.ratioFilter.addEventListener("change", () => { state.ratioFilter = els.ratioFilter.value; ensureSelectedImageVisible(); renderThumbs(); drawPreview(); });
els.positionButtons.forEach((button) => button.addEventListener("click", () => { state.position = button.dataset.position; els.positionButtons.forEach((item) => item.classList.toggle("active", item === button)); drawPreview(); }));

els.clearAll.addEventListener("click", () => {
  [...state.images, ...state.logos].forEach((item) => URL.revokeObjectURL(item.url));
  Object.assign(state, { images: [], logos: [], selectedIndex: 0, selectedLogoId: null, ratioFilter: "all" });
  els.imageInput.value = ""; refreshRatioFilter(); renderLogoLibrary(); renderThumbs(); drawPreview();
});
els.downloadCurrent.addEventListener("click", async () => {
  const image = getSelectedImage(); if (!image) return;
  downloadBlob(await renderImageBlob(image), makeOutputName(image.file.name));
});
els.downloadZip.addEventListener("click", async () => {
  const images = getExportImages(); if (!images.length) return;
  els.downloadZip.disabled = true; els.downloadZip.textContent = `正在处理 0/${images.length}`;
  const files = [];
  for (let i = 0; i < images.length; i += 1) {
    const image = images[i]; const blob = await renderImageBlob(image);
    files.push({ name: makeOutputName(image.file.name), bytes: new Uint8Array(await blob.arrayBuffer()) });
    els.downloadZip.textContent = `正在处理 ${i + 1}/${images.length}`;
  }
  downloadBlob(createZip(files), `batch-photo-${Date.now()}.zip`);
  els.downloadZip.textContent = "导出并打包 ZIP"; updateStatus();
});

function isImage(file) { return file.type.startsWith("image/"); }
function loadImageFile(file) { return new Promise((resolve, reject) => { const img = new Image(); const url = URL.createObjectURL(file); img.onload = () => resolve({ file, img, url }); img.onerror = reject; img.src = url; }); }
function getSelectedImage() { return state.images[state.selectedIndex]; }
function getSelectedLogo() { return state.logos.find((logo) => logo.id === state.selectedLogoId) || null; }
function getVisibleImages() { return state.ratioFilter === "all" ? state.images : state.images.filter((image) => image.ratio === state.ratioFilter); }
function getExportImages() { return els.exportScope.value === "all" ? state.images : getVisibleImages(); }
function classifyRatio(width, height) { const ratio = width / height; if (Math.abs(ratio - 1) < 0.06) return "1:1 方图"; if (ratio > 1.55) return "横图"; if (ratio < 0.75) return "竖图"; return "常规图"; }
function stripExtension(name) { return name.replace(/\.[^.]+$/, ""); }
function updateValueLabels() { [[els.logoSize, els.logoSizeValue, "%"], [els.logoMargin, els.logoMarginValue, "%"], [els.logoOpacity, els.logoOpacityValue, "%"], [els.brightness, els.brightnessValue, ""], [els.contrast, els.contrastValue, ""], [els.saturation, els.saturationValue, ""], [els.quality, els.qualityValue, "%"]].forEach(([input, output, suffix]) => { output.textContent = `${input.value}${suffix}`; }); }

function refreshRatioFilter() {
  const current = state.ratioFilter; const groups = [...new Set(state.images.map((image) => image.ratio))];
  els.ratioFilter.innerHTML = `<option value="all">全部 (${state.images.length})</option>${groups.map((group) => `<option value="${group}">${group} (${state.images.filter((image) => image.ratio === group).length})</option>`).join("")}`;
  state.ratioFilter = groups.includes(current) ? current : "all"; els.ratioFilter.value = state.ratioFilter;
}
function ensureSelectedImageVisible() { const image = getSelectedImage(); if (!image || (state.ratioFilter !== "all" && image.ratio !== state.ratioFilter)) { const visible = getVisibleImages()[0]; state.selectedIndex = state.images.indexOf(visible); } }
function updateSelectedLogoMeta(key, value) { const logo = getSelectedLogo(); if (!logo) return; logo[key] = value.trim() || (key === "group" ? "未分组" : "未命名 Logo"); renderLogoLibrary(); }

function renderLogoLibrary() {
  els.logoLibrary.innerHTML = "";
  if (!state.logos.length) { els.logoLibrary.innerHTML = '<p class="hint">添加透明 PNG 后，会保存在本次工作中。</p>'; els.logoName.value = ""; els.logoGroup.value = ""; return; }
  state.logos.forEach((logo) => {
    const button = document.createElement("button"); button.className = `logo-item${logo.id === state.selectedLogoId ? " active" : ""}`;
    button.innerHTML = `<img src="${logo.url}" alt=""><span><strong>${escapeHtml(logo.name)}</strong><small>${escapeHtml(logo.group)}</small></span>`;
    button.addEventListener("click", () => { state.selectedLogoId = logo.id; els.logoName.value = logo.name; els.logoGroup.value = logo.group; renderLogoLibrary(); drawPreview(); });
    els.logoLibrary.append(button);
  });
  const active = getSelectedLogo(); els.logoName.value = active?.name || ""; els.logoGroup.value = active?.group || "";
}
function renderThumbs() {
  els.thumbs.innerHTML = "";
  getVisibleImages().forEach((image) => {
    const index = state.images.indexOf(image); const button = document.createElement("button"); button.className = `thumb${index === state.selectedIndex ? " active" : ""}`;
    button.innerHTML = `<img src="${image.url}" alt=""><span>${escapeHtml(image.file.name)}</span><small>${image.ratio}</small>`;
    button.addEventListener("click", () => { state.selectedIndex = index; renderThumbs(); drawPreview(); }); els.thumbs.append(button);
  });
}
function drawPreview() { updateStatus(); const image = getSelectedImage(); if (!image) { ctx.clearRect(0, 0, els.previewCanvas.width, els.previewCanvas.height); els.emptyState.classList.remove("hidden"); return; } els.emptyState.classList.add("hidden"); renderToCanvas(image, els.previewCanvas); }
function renderToCanvas(image, canvas) { const scale = Math.min(1, 1400 / image.img.naturalWidth); canvas.width = Math.round(image.img.naturalWidth * scale); canvas.height = Math.round(image.img.naturalHeight * scale); const targetCtx = canvas.getContext("2d", { willReadFrequently: true }); targetCtx.clearRect(0, 0, canvas.width, canvas.height); targetCtx.drawImage(image.img, 0, 0, canvas.width, canvas.height); applyAdjustments(targetCtx, canvas.width, canvas.height); drawLogo(targetCtx, canvas.width, canvas.height); }
function applyAdjustments(targetCtx, width, height) { const brightness = Number(els.brightness.value); const contrast = Number(els.contrast.value); const saturation = Number(els.saturation.value); const imageData = targetCtx.getImageData(0, 0, width, height); const data = imageData.data; const contrastFactor = (259 * (contrast + 255)) / (255 * (259 - contrast)); const saturationFactor = 1 + saturation / 100; for (let index = 0; index < data.length; index += 4) { const red = contrastFactor * (data[index] - 128) + 128 + brightness; const green = contrastFactor * (data[index + 1] - 128) + 128 + brightness; const blue = contrastFactor * (data[index + 2] - 128) + 128 + brightness; const gray = 0.299 * red + 0.587 * green + 0.114 * blue; data[index] = clamp(gray + (red - gray) * saturationFactor); data[index + 1] = clamp(gray + (green - gray) * saturationFactor); data[index + 2] = clamp(gray + (blue - gray) * saturationFactor); } targetCtx.putImageData(imageData); if (els.sharpen.checked) sharpenImage(targetCtx, width, height); }
function sharpenImage(targetCtx, width, height) { const imageData = targetCtx.getImageData(0, 0, width, height); const src = imageData.data; const out = new Uint8ClampedArray(src); const kernel = [0, -0.45, 0, -0.45, 2.8, -0.45, 0, -0.45, 0]; for (let y = 1; y < height - 1; y += 1) for (let x = 1; x < width - 1; x += 1) { const pixel = (y * width + x) * 4; for (let channel = 0; channel < 3; channel += 1) { let value = 0; let kernelIndex = 0; for (let ky = -1; ky <= 1; ky += 1) for (let kx = -1; kx <= 1; kx += 1) { value += src[((y + ky) * width + x + kx) * 4 + channel] * kernel[kernelIndex++]; } out[pixel + channel] = clamp(value); } } targetCtx.putImageData(new ImageData(out, width, height)); }
function drawLogo(targetCtx, width, height) { const logo = getSelectedLogo(); if (!logo) return; const placement = getLogoPlacement(targetCtx, width, height, logo); targetCtx.save(); targetCtx.globalAlpha = Number(els.logoOpacity.value) / 100; targetCtx.drawImage(logo.img, placement.x, placement.y, placement.width, placement.height); targetCtx.restore(); }
function getLogoPlacement(targetCtx, width, height, logo) { const logoWidth = Math.round(width * Number(els.logoSize.value) / 100); const logoHeight = Math.round(logoWidth * logo.img.naturalHeight / logo.img.naturalWidth); const margin = Math.round(Math.min(width, height) * Number(els.logoMargin.value) / 100); const placements = { "bottom-right": [width - logoWidth - margin, height - logoHeight - margin], "bottom-left": [margin, height - logoHeight - margin], "top-right": [width - logoWidth - margin, margin], "top-left": [margin, margin], center: [(width - logoWidth) / 2, (height - logoHeight) / 2] }; let [x, y] = placements[state.position] || placements["bottom-right"]; if (state.position === "smart") [x, y] = findBestPlacement(targetCtx, width, height, logoWidth, logoHeight, margin, logo); return { x: Math.round(x), y: Math.round(y), width: logoWidth, height: logoHeight }; }
function findBestPlacement(targetCtx, width, height, logoWidth, logoHeight, margin, logo) { const choices = [[margin, margin], [width - logoWidth - margin, margin], [margin, height - logoHeight - margin], [width - logoWidth - margin, height - logoHeight - margin], [(width - logoWidth) / 2, margin], [(width - logoWidth) / 2, height - logoHeight - margin]]; const logoBrightness = imageBrightness(logo.img); return choices.reduce((best, choice) => { const score = regionContrastScore(targetCtx, choice[0], choice[1], logoWidth, logoHeight, logoBrightness); return score > best.score ? { choice, score } : best; }, { choice: choices[0], score: -Infinity }).choice; }
function imageBrightness(img) { const canvas = document.createElement("canvas"); canvas.width = canvas.height = 24; const c = canvas.getContext("2d", { willReadFrequently: true }); c.drawImage(img, 0, 0, 24, 24); const data = c.getImageData(0, 0, 24, 24).data; let total = 0; let count = 0; for (let i = 0; i < data.length; i += 4) { if (data[i + 3] > 16) { total += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]; count += 1; } } return count ? total / count : 128; }
function regionContrastScore(targetCtx, x, y, width, height, logoBrightness) { const imageData = targetCtx.getImageData(Math.max(0, Math.round(x)), Math.max(0, Math.round(y)), Math.max(1, Math.round(width)), Math.max(1, Math.round(height))).data; let sum = 0; let sumSq = 0; const count = imageData.length / 4; for (let i = 0; i < imageData.length; i += 4) { const value = 0.299 * imageData[i] + 0.587 * imageData[i + 1] + 0.114 * imageData[i + 2]; sum += value; sumSq += value * value; } const mean = sum / count; const deviation = Math.sqrt(sumSq / count - mean * mean); return Math.abs(mean - logoBrightness) - deviation * 0.25; }
async function renderImageBlob(image) { const canvas = document.createElement("canvas"); canvas.width = image.img.naturalWidth; canvas.height = image.img.naturalHeight; const targetCtx = canvas.getContext("2d", { willReadFrequently: true }); targetCtx.drawImage(image.img, 0, 0); applyAdjustments(targetCtx, canvas.width, canvas.height); drawLogo(targetCtx, canvas.width, canvas.height); return new Promise((resolve) => canvas.toBlob(resolve, els.format.value, Number(els.quality.value) / 100)); }
function updateStatus() { const count = state.images.length; const scopeCount = getExportImages().length; els.fileCount.textContent = `${count} 张图片`; els.clearAll.disabled = count === 0 && state.logos.length === 0; els.downloadCurrent.disabled = count === 0; els.downloadZip.disabled = count === 0; els.statusText.textContent = !count ? "添加图片后开始处理" : `${state.ratioFilter === "all" ? "全部比例" : state.ratioFilter}，将导出 ${scopeCount} 张`; }
function makeOutputName(name) { const extensionMap = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }; return `${stripExtension(name)}-edited.${extensionMap[els.format.value]}`; }
function downloadBlob(blob, name) { const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
function createZip(files) { const encoder = new TextEncoder(); const localParts = []; const centralParts = []; let offset = 0; files.forEach((file) => { const nameBytes = encoder.encode(file.name); const crc = crc32(file.bytes); const localHeader = new Uint8Array(30 + nameBytes.length); const localView = new DataView(localHeader.buffer); localView.setUint32(0, 0x04034b50, true); localView.setUint16(4, 20, true); localView.setUint32(14, crc, true); localView.setUint32(18, file.bytes.length, true); localView.setUint32(22, file.bytes.length, true); localView.setUint16(26, nameBytes.length, true); localHeader.set(nameBytes, 30); localParts.push(localHeader, file.bytes); const centralHeader = new Uint8Array(46 + nameBytes.length); const centralView = new DataView(centralHeader.buffer); centralView.setUint32(0, 0x02014b50, true); centralView.setUint16(4, 20, true); centralView.setUint16(6, 20, true); centralView.setUint32(16, crc, true); centralView.setUint32(20, file.bytes.length, true); centralView.setUint32(24, file.bytes.length, true); centralView.setUint16(28, nameBytes.length, true); centralView.setUint32(42, offset, true); centralHeader.set(nameBytes, 46); centralParts.push(centralHeader); offset += localHeader.length + file.bytes.length; }); const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0); const end = new Uint8Array(22); const endView = new DataView(end.buffer); endView.setUint32(0, 0x06054b50, true); endView.setUint16(8, files.length, true); endView.setUint16(10, files.length, true); endView.setUint32(12, centralSize, true); endView.setUint32(16, offset, true); return new Blob([...localParts, ...centralParts, end], { type: "application/zip" }); }
function crc32(bytes) { let crc = -1; for (let index = 0; index < bytes.length; index += 1) crc = (crc >>> 8) ^ crcTable[(crc ^ bytes[index]) & 0xff]; return (crc ^ -1) >>> 0; }
const crcTable = (() => { const table = new Uint32Array(256); for (let n = 0; n < 256; n += 1) { let c = n; for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; table[n] = c >>> 0; } return table; })();
function clamp(value) { return Math.max(0, Math.min(255, Math.round(value))); }
function escapeHtml(value) { const node = document.createElement("div"); node.textContent = value; return node.innerHTML; }
updateValueLabels(); renderLogoLibrary();
