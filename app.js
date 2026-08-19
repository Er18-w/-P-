const LOGO_STORAGE_KEY = "batch-photo-logo-library-v2";
const PRESET_STORAGE_KEY = "batch-photo-logo-presets-v1";
const GROUP_TOLERANCE = 0.008;

const state = {
  images: [],
  groups: [],
  logos: [],
  presets: [],
  selectedImageIds: new Set(),
  activeGroupId: null,
  activeImageId: null,
  focusedLogoId: null,
  selectedLogoIds: new Set(),
  selectedOverlayId: null,
  activePresetId: null,
  drag: null,
  exporting: false,
  cutout: {
    files: [],
    index: 0,
    file: null,
    originalCanvas: null,
    mode: "wand",
    drawing: false,
    lastPoint: null,
    history: [],
    previewUrl: null,
  },
};

const elementIds = [
  "imageInput", "logoInput", "clearAll", "globalStatus", "imageCount", "groupList",
  "activeGroupTitle", "activeImageName", "activeImageMeta", "groupImageCount", "thumbs",
  "selectCurrentGroup", "clearCurrentGroup",
  "previewCanvas", "emptyState", "notice", "logoLibrary", "logoEditor",
  "logoName", "logoGroup", "addLogoToJob", "deleteLogo", "overlayCount", "overlayList",
  "presetList", "presetName", "savePreset", "updatePreset", "activePresetStatus",
  "placementControls", "autoPlace", "logoSize", "logoSizeValue", "logoOpacity",
  "logoOpacityValue", "removeOverlay", "brightness", "brightnessValue", "contrast",
  "contrastValue", "saturation", "saturationValue", "smoothing", "smoothingValue",
  "skinBrightening", "skinBrighteningValue", "beautyStatus", "resetAdjustments", "format", "maxEdge",
  "quality", "qualityValue", "downloadCurrent", "downloadGroup", "exportProgress",
  "exportProgressBar", "selectedImageCount", "selectAllImages", "clearImageSelection",
  "cutoutModal", "closeCutout", "cancelCutout", "saveCutout", "autoCutout",
  "undoCutout", "resetCutout", "cutoutStage", "cutoutCanvas", "cutoutPreview",
  "cutoutTolerance", "cutoutToleranceValue", "cutoutBrush", "cutoutBrushValue",
  "cutoutName", "cutoutGroup", "trimTransparent", "cutoutStatus", "cutoutQueueStatus",
];
const els = Object.fromEntries(elementIds.map((id) => [id, document.getElementById(id)]));
els.positionButtons = [...document.querySelectorAll("[data-position]")];
els.cutoutModeButtons = [...document.querySelectorAll("[data-cutout-mode]")];
const previewCtx = els.previewCanvas.getContext("2d", { alpha: false, willReadFrequently: true });
const cutoutCtx = els.cutoutCanvas.getContext("2d", { willReadFrequently: true });

initialize();

function initialize() {
  restoreLogoLibrary();
  restorePresets();
  bindEvents();
  renderAll();
}

function bindEvents() {
  els.imageInput.addEventListener("change", handleImageUpload);
  els.logoInput.addEventListener("change", handleLogoUpload);
  els.clearAll.addEventListener("click", clearTasks);
  els.logoName.addEventListener("change", () => updateLogoMeta("name", els.logoName.value));
  els.logoGroup.addEventListener("change", () => updateLogoMeta("group", els.logoGroup.value));
  els.addLogoToJob.addEventListener("click", addSelectedLogosToJob);
  els.deleteLogo.addEventListener("click", deleteSelectedLogos);
  els.savePreset.addEventListener("click", saveCurrentPreset);
  els.updatePreset.addEventListener("click", updateCurrentPreset);
  els.removeOverlay.addEventListener("click", removeSelectedOverlay);
  els.autoPlace.addEventListener("click", autoPlaceSelectedOverlay);
  els.positionButtons.forEach((button) => button.addEventListener("click", () => placeSelectedOverlay(button.dataset.position)));

  [els.logoSize, els.logoOpacity].forEach((input) => input.addEventListener("input", updateOverlayFromControls));
  [els.brightness, els.contrast, els.saturation, els.smoothing, els.skinBrightening].forEach((input) => input.addEventListener("input", updateGroupAdjustments));
  els.resetAdjustments.addEventListener("click", resetGroupAdjustments);
  els.selectCurrentGroup.addEventListener("click", () => selectGroupImages(true));
  els.clearCurrentGroup.addEventListener("click", () => selectGroupImages(false));
  els.selectAllImages.addEventListener("click", selectAllImages);
  els.clearImageSelection.addEventListener("click", clearImageSelection);
  els.quality.addEventListener("input", updateControlLabels);
  els.downloadCurrent.addEventListener("click", downloadCurrentImage);
  els.downloadGroup.addEventListener("click", downloadActiveGroup);

  els.closeCutout.addEventListener("click", closeCutoutEditor);
  els.cancelCutout.addEventListener("click", closeCutoutEditor);
  els.saveCutout.addEventListener("click", saveCutoutLogo);
  els.autoCutout.addEventListener("click", autoRemoveBackground);
  els.undoCutout.addEventListener("click", undoCutout);
  els.resetCutout.addEventListener("click", resetCutout);
  els.cutoutTolerance.addEventListener("input", updateCutoutLabels);
  els.cutoutBrush.addEventListener("input", updateCutoutLabels);
  els.cutoutModeButtons.forEach((button) => button.addEventListener("click", () => setCutoutMode(button.dataset.cutoutMode)));
  els.cutoutCanvas.addEventListener("pointerdown", startCutoutAction);
  els.cutoutCanvas.addEventListener("pointermove", moveCutoutAction);
  els.cutoutCanvas.addEventListener("pointerup", endCutoutAction);
  els.cutoutCanvas.addEventListener("pointercancel", endCutoutAction);
  document.addEventListener("keydown", handleModalKeydown);

  els.previewCanvas.addEventListener("pointerdown", startOverlayDrag);
  els.previewCanvas.addEventListener("pointermove", moveOverlayDrag);
  els.previewCanvas.addEventListener("pointerup", endOverlayDrag);
  els.previewCanvas.addEventListener("pointercancel", endOverlayDrag);
  window.addEventListener("resize", fitPreviewCanvas);
}

async function handleImageUpload(event) {
  const files = [...event.target.files].filter(isImageFile);
  if (!files.length) return;
  showNotice(`正在读取 ${files.length} 张图片…`, true);
  const results = await Promise.allSettled(files.map(loadImageFile));
  const loaded = results.filter((result) => result.status === "fulfilled").map((result) => result.value);
  const failed = results.length - loaded.length;
  loaded.forEach((image) => {
    addImageToRatioGroup(image);
    state.selectedImageIds.add(image.id);
  });
  if (!state.activeGroupId && state.groups[0]) activateGroup(state.groups[0].id);
  renderAll();
  showNotice(failed ? `已添加 ${loaded.length} 张，${failed} 张读取失败。` : `已自动分成 ${state.groups.length} 个比例任务。`, failed === 0);
  event.target.value = "";
}

async function handleLogoUpload(event) {
  const files = [...event.target.files].filter(isImageFile);
  if (!files.length) return;
  state.cutout.files = files;
  state.cutout.index = 0;
  await openCutoutFile(files[0]);
  event.target.value = "";
}

async function openCutoutFile(file) {
  try {
    const dataUrl = await fileToDataUrl(file);
    const image = await loadImageSource(dataUrl);
    const maxSide = 1600;
    const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const originalCanvas = document.createElement("canvas");
    originalCanvas.width = width;
    originalCanvas.height = height;
    originalCanvas.getContext("2d").drawImage(image, 0, 0, width, height);

    state.cutout.file = file;
    state.cutout.originalCanvas = originalCanvas;
    state.cutout.history = [];
    state.cutout.drawing = false;
    state.cutout.lastPoint = null;
    els.cutoutCanvas.width = width;
    els.cutoutCanvas.height = height;
    cutoutCtx.clearRect(0, 0, width, height);
    cutoutCtx.drawImage(originalCanvas, 0, 0);
    els.cutoutName.value = stripExtension(file.name);
    if (!els.cutoutGroup.value.trim()) els.cutoutGroup.value = "未分组";
    els.cutoutQueueStatus.textContent = `${state.cutout.index + 1} / ${Math.max(1, state.cutout.files.length)}`;
    els.cutoutStatus.textContent = "自动抠图适合纯色或近似纯色背景；细节可用擦除和恢复调整。";
    els.cutoutModal.hidden = false;
    document.body.classList.add("modal-open");
    setCutoutMode("wand");
    updateCutoutLabels();
    updateCutoutPreview();
  } catch (error) {
    showNotice(`Logo 读取失败：${error.message}`, false);
    closeCutoutEditor();
  }
}

function closeCutoutEditor() {
  cutoutPreviewSequence += 1;
  state.cutout.files = [];
  state.cutout.file = null;
  state.cutout.originalCanvas = null;
  state.cutout.history = [];
  state.cutout.drawing = false;
  if (state.cutout.previewUrl) URL.revokeObjectURL(state.cutout.previewUrl);
  state.cutout.previewUrl = null;
  els.cutoutPreview.removeAttribute("src");
  els.cutoutModal.hidden = true;
  document.body.classList.remove("modal-open");
}

function handleModalKeydown(event) {
  if (event.key === "Escape" && !els.cutoutModal.hidden) closeCutoutEditor();
}

function setCutoutMode(mode) {
  state.cutout.mode = mode;
  els.cutoutModeButtons.forEach((button) => button.classList.toggle("active", button.dataset.cutoutMode === mode));
  els.cutoutCanvas.style.cursor = "crosshair";
}

function updateCutoutLabels() {
  els.cutoutToleranceValue.textContent = els.cutoutTolerance.value;
  els.cutoutBrushValue.textContent = `${els.cutoutBrush.value} px`;
}

function pushCutoutHistory() {
  if (!state.cutout.originalCanvas) return;
  state.cutout.history.push(cutoutCtx.getImageData(0, 0, els.cutoutCanvas.width, els.cutoutCanvas.height));
  if (state.cutout.history.length > 6) state.cutout.history.shift();
  els.undoCutout.disabled = false;
}

function undoCutout() {
  const snapshot = state.cutout.history.pop();
  if (!snapshot) return;
  cutoutCtx.putImageData(snapshot, 0, 0);
  els.undoCutout.disabled = state.cutout.history.length === 0;
  updateCutoutPreview();
}

function resetCutout() {
  if (!state.cutout.originalCanvas) return;
  pushCutoutHistory();
  cutoutCtx.clearRect(0, 0, els.cutoutCanvas.width, els.cutoutCanvas.height);
  cutoutCtx.drawImage(state.cutout.originalCanvas, 0, 0);
  els.cutoutStatus.textContent = "已恢复原图。";
  updateCutoutPreview();
}

function autoRemoveBackground() {
  if (!state.cutout.originalCanvas || !window.MagicWand) return;
  pushCutoutHistory();
  cutoutCtx.clearRect(0, 0, els.cutoutCanvas.width, els.cutoutCanvas.height);
  cutoutCtx.drawImage(state.cutout.originalCanvas, 0, 0);
  const width = els.cutoutCanvas.width;
  const height = els.cutoutCanvas.height;
  const imageData = cutoutCtx.getImageData(0, 0, width, height);
  const image = { data: imageData.data, width, height, bytes: 4 };
  const inset = Math.max(0, Math.min(2, width - 1, height - 1));
  const seeds = [[inset, inset], [width - 1 - inset, inset], [inset, height - 1 - inset], [width - 1 - inset, height - 1 - inset]];
  const combined = new Uint8Array(width * height);
  let removed = 0;
  seeds.forEach(([x, y]) => {
    const mask = window.MagicWand.floodFill(image, x, y, Number(els.cutoutTolerance.value), combined);
    if (!mask) return;
    for (let index = 0; index < combined.length; index += 1) {
      if (mask.data[index] && !combined[index]) {
        combined[index] = 1;
        removed += 1;
      }
    }
  });
  for (let index = 0; index < combined.length; index += 1) {
    if (combined[index]) imageData.data[index * 4 + 3] = 0;
  }
  cutoutCtx.putImageData(imageData, 0, 0);
  const percent = Math.round(removed / combined.length * 100);
  els.cutoutStatus.textContent = `已自动移除约 ${percent}% 的连通背景。可点选遗漏区域，或用笔刷继续调整。`;
  updateCutoutPreview();
}

function startCutoutAction(event) {
  if (!state.cutout.originalCanvas) return;
  const point = cutoutPointer(event);
  pushCutoutHistory();
  if (state.cutout.mode === "wand") {
    removeConnectedBackground(point);
    return;
  }
  state.cutout.drawing = true;
  state.cutout.lastPoint = point;
  els.cutoutCanvas.setPointerCapture(event.pointerId);
  paintCutoutStroke(point, point);
}

function moveCutoutAction(event) {
  if (!state.cutout.drawing || !state.cutout.lastPoint) return;
  const point = cutoutPointer(event);
  paintCutoutStroke(state.cutout.lastPoint, point);
  state.cutout.lastPoint = point;
}

function endCutoutAction(event) {
  if (!state.cutout.drawing) return;
  state.cutout.drawing = false;
  state.cutout.lastPoint = null;
  if (els.cutoutCanvas.hasPointerCapture(event.pointerId)) els.cutoutCanvas.releasePointerCapture(event.pointerId);
  updateCutoutPreview();
}

function removeConnectedBackground(point) {
  const width = els.cutoutCanvas.width;
  const height = els.cutoutCanvas.height;
  const imageData = cutoutCtx.getImageData(0, 0, width, height);
  const x = clamp(Math.round(point.x), 0, width - 1);
  const y = clamp(Math.round(point.y), 0, height - 1);
  const mask = window.MagicWand?.floodFill({ data: imageData.data, width, height, bytes: 4 }, x, y, Number(els.cutoutTolerance.value));
  if (!mask) return;
  let removed = 0;
  mask.data.forEach((selected, index) => {
    if (!selected) return;
    imageData.data[index * 4 + 3] = 0;
    removed += 1;
  });
  cutoutCtx.putImageData(imageData, 0, 0);
  els.cutoutStatus.textContent = removed ? "已移除点选的连通背景区域。" : "这个位置没有可移除的区域。";
  updateCutoutPreview();
}

function paintCutoutStroke(from, to) {
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  const radius = Number(els.cutoutBrush.value) / 2;
  const steps = Math.max(1, Math.ceil(distance / Math.max(1, radius / 2)));
  for (let step = 0; step <= steps; step += 1) {
    const progress = step / steps;
    const x = from.x + (to.x - from.x) * progress;
    const y = from.y + (to.y - from.y) * progress;
    cutoutCtx.save();
    cutoutCtx.beginPath();
    cutoutCtx.arc(x, y, radius, 0, Math.PI * 2);
    cutoutCtx.clip();
    if (state.cutout.mode === "erase") {
      cutoutCtx.clearRect(x - radius, y - radius, radius * 2, radius * 2);
    } else {
      cutoutCtx.drawImage(state.cutout.originalCanvas, 0, 0);
    }
    cutoutCtx.restore();
  }
}

function cutoutPointer(event) {
  const rect = els.cutoutCanvas.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) * els.cutoutCanvas.width / rect.width,
    y: (event.clientY - rect.top) * els.cutoutCanvas.height / rect.height,
  };
}

let cutoutPreviewSequence = 0;
async function updateCutoutPreview() {
  const sequence = ++cutoutPreviewSequence;
  const blob = await canvasToBlob(els.cutoutCanvas, "image/png");
  if (sequence !== cutoutPreviewSequence) return;
  if (state.cutout.previewUrl) URL.revokeObjectURL(state.cutout.previewUrl);
  state.cutout.previewUrl = URL.createObjectURL(blob);
  els.cutoutPreview.src = state.cutout.previewUrl;
}

async function saveCutoutLogo() {
  if (!state.cutout.file) return;
  els.saveCutout.disabled = true;
  try {
    const outputCanvas = els.trimTransparent.checked ? trimTransparentCanvas(els.cutoutCanvas) : cloneCanvas(els.cutoutCanvas);
    const dataUrl = outputCanvas.toDataURL("image/png");
    const img = await loadImageSource(dataUrl);
    const logo = {
      id: uid(),
      name: els.cutoutName.value.trim() || stripExtension(state.cutout.file.name),
      group: els.cutoutGroup.value.trim() || "未分组",
      dataUrl,
      img,
    };
    state.logos.push(logo);
    state.focusedLogoId = logo.id;
    state.selectedLogoIds.add(logo.id);
    persistLogoLibrary();

    state.cutout.index += 1;
    if (state.cutout.index < state.cutout.files.length) {
      await openCutoutFile(state.cutout.files[state.cutout.index]);
    } else {
      closeCutoutEditor();
      renderLogoLibrary();
      renderLogoEditor();
      updateButtons();
      showNotice("透明 Logo 已保存到 Logo 库并自动勾选。", true);
    }
  } catch (error) {
    els.cutoutStatus.textContent = `保存失败：${error.message}`;
  } finally {
    els.saveCutout.disabled = false;
  }
}

function trimTransparentCanvas(source) {
  const ctx = source.getContext("2d", { willReadFrequently: true });
  const { width, height } = source;
  const data = ctx.getImageData(0, 0, width, height).data;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] < 3) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  if (maxX < minX || maxY < minY) throw new Error("画布已经完全透明，请恢复需要保留的 Logo。 ");
  const padding = Math.max(2, Math.round(Math.max(width, height) * 0.005));
  minX = Math.max(0, minX - padding);
  minY = Math.max(0, minY - padding);
  maxX = Math.min(width - 1, maxX + padding);
  maxY = Math.min(height - 1, maxY + padding);
  const canvas = document.createElement("canvas");
  canvas.width = maxX - minX + 1;
  canvas.height = maxY - minY + 1;
  canvas.getContext("2d").drawImage(source, minX, minY, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function cloneCanvas(source) {
  const canvas = document.createElement("canvas");
  canvas.width = source.width;
  canvas.height = source.height;
  canvas.getContext("2d").drawImage(source, 0, 0);
  return canvas;
}

function addImageToRatioGroup(image) {
  const ratio = image.width / image.height;
  let group = state.groups.find((item) => Math.abs(item.ratio - ratio) <= GROUP_TOLERANCE);
  if (!group) {
    group = {
      id: uid(),
      ratio,
      label: ratioLabel(ratio),
      imageIds: [],
      overlays: [],
      adjustments: { brightness: 0, contrast: 0, saturation: 0, smoothing: 0, skinBrightening: 0 },
    };
    state.groups.push(group);
    sortGroups();
  }
  image.groupId = group.id;
  group.imageIds.push(image.id);
  state.images.push(image);
}

function sortGroups() {
  state.groups.sort((a, b) => b.ratio - a.ratio);
}

function activateGroup(groupId) {
  state.activeGroupId = groupId;
  const group = getActiveGroup();
  const preset = getActivePreset();
  if (group && preset && (group.presetId !== preset.id || group.presetUpdatedAt !== preset.updatedAt)) {
    applyPresetToGroup(preset.id, group);
  }
  state.activeImageId = group?.imageIds[0] || null;
  state.selectedOverlayId = group?.overlays[0]?.id || null;
  syncControlsFromGroup();
  renderAll();
}

function activateImage(imageId) {
  state.activeImageId = imageId;
  renderThumbs();
  renderPreview();
  renderWorkspaceHeader();
}

function toggleImageSelection(imageId, selected) {
  if (selected) state.selectedImageIds.add(imageId);
  else state.selectedImageIds.delete(imageId);
  renderThumbs();
  renderGroupList();
  updateButtons();
  updateGlobalStatus();
}

function selectGroupImages(selected) {
  const group = getActiveGroup();
  if (!group) return;
  group.imageIds.forEach((id) => selected ? state.selectedImageIds.add(id) : state.selectedImageIds.delete(id));
  renderThumbs();
  renderGroupList();
  updateButtons();
  updateGlobalStatus();
}

function selectAllImages() {
  state.images.forEach((image) => state.selectedImageIds.add(image.id));
  renderThumbs();
  renderGroupList();
  updateButtons();
  updateGlobalStatus();
}

function clearImageSelection() {
  state.selectedImageIds.clear();
  renderThumbs();
  renderGroupList();
  updateButtons();
  updateGlobalStatus();
}

function clearTasks() {
  state.images.forEach((image) => URL.revokeObjectURL(image.url));
  state.images = [];
  state.groups = [];
  state.selectedImageIds.clear();
  state.activeGroupId = null;
  state.activeImageId = null;
  state.selectedOverlayId = null;
  hideNotice();
  renderAll();
}

function addSelectedLogosToJob() {
  const group = getActiveGroup();
  const logos = state.logos.filter((logo) => state.selectedLogoIds.has(logo.id));
  if (!group || !logos.length) return;
  const existingIds = new Set(group.overlays.map((overlay) => overlay.logoId));
  const added = logos.filter((logo) => !existingIds.has(logo.id)).map((logo, index) => ({
    id: uid(),
    logoId: logo.id,
    x: 0.76,
    y: Math.max(0.04, 0.80 - index * 0.11),
    width: 0.18,
    opacity: 1,
  }));
  group.overlays.push(...added);
  added.forEach(clampOverlay);
  state.selectedOverlayId = added.at(-1)?.id || group.overlays.at(-1)?.id || null;
  renderOverlayList();
  syncOverlayControls();
  renderPreview();
  renderGroupList();
  updateButtons();
}

function removeSelectedOverlay() {
  const group = getActiveGroup();
  if (!group) return;
  group.overlays = group.overlays.filter((overlay) => overlay.id !== state.selectedOverlayId);
  state.selectedOverlayId = group.overlays[0]?.id || null;
  renderOverlayList();
  syncOverlayControls();
  renderPreview();
  renderGroupList();
  updateButtons();
}

function deleteSelectedLogos() {
  const ids = new Set(state.selectedLogoIds);
  if (!ids.size) return;
  state.logos = state.logos.filter((item) => !ids.has(item.id));
  state.groups.forEach((group) => { group.overlays = group.overlays.filter((overlay) => !ids.has(overlay.logoId)); });
  state.presets.forEach((preset) => { preset.overlays = preset.overlays.filter((overlay) => !ids.has(overlay.logoId)); });
  state.presets = state.presets.filter((preset) => preset.overlays.length);
  if (!state.presets.some((preset) => preset.id === state.activePresetId)) state.activePresetId = null;
  state.selectedLogoIds.clear();
  state.focusedLogoId = state.logos[0]?.id || null;
  const activeGroup = getActiveGroup();
  state.selectedOverlayId = activeGroup?.overlays[0]?.id || null;
  persistLogoLibrary();
  persistPresets();
  renderAll();
}

function updateLogoMeta(key, rawValue) {
  const logo = getSelectedLogo();
  if (!logo) return;
  const fallback = key === "group" ? "未分组" : "未命名 Logo";
  logo[key] = rawValue.trim() || fallback;
  persistLogoLibrary();
  renderLogoLibrary();
  renderOverlayList();
}

function saveCurrentPreset() {
  const group = getActiveGroup();
  if (!group?.overlays.length) return;
  const preset = {
    id: uid(),
    name: els.presetName.value.trim() || `Logo 组合 ${state.presets.length + 1}`,
    overlays: serializeOverlays(group.overlays),
    updatedAt: Date.now(),
  };
  state.presets.push(preset);
  state.activePresetId = preset.id;
  group.presetId = preset.id;
  group.presetUpdatedAt = preset.updatedAt;
  els.presetName.value = preset.name;
  persistPresets();
  renderPresetList();
  updateButtons();
  showNotice(`组合预设“${preset.name}”已保存，切换比例任务会继续套用。`, true);
}

function updateCurrentPreset() {
  const group = getActiveGroup();
  const preset = getActivePreset();
  if (!group?.overlays.length || !preset) return;
  preset.name = els.presetName.value.trim() || preset.name;
  preset.overlays = serializeOverlays(group.overlays);
  preset.updatedAt = Date.now();
  group.presetId = preset.id;
  group.presetUpdatedAt = preset.updatedAt;
  persistPresets();
  renderPresetList();
  showNotice(`组合预设“${preset.name}”已更新。`, true);
}

function activatePreset(presetId) {
  state.activePresetId = presetId;
  const preset = getActivePreset();
  if (preset) els.presetName.value = preset.name;
  const group = getActiveGroup();
  if (group) applyPresetToGroup(presetId, group);
  persistPresets();
  renderAll();
}

function applyPresetToGroup(presetId, group) {
  const preset = state.presets.find((item) => item.id === presetId);
  if (!preset) return;
  group.overlays = preset.overlays
    .filter((overlay) => getLogoById(overlay.logoId))
    .map((overlay) => ({ ...overlay, id: uid() }));
  group.overlays.forEach((overlay) => clampOverlayForGroup(overlay, group));
  group.presetId = preset.id;
  group.presetUpdatedAt = preset.updatedAt;
  state.selectedOverlayId = group.overlays[0]?.id || null;
}

function deletePreset(presetId) {
  state.presets = state.presets.filter((preset) => preset.id !== presetId);
  if (state.activePresetId === presetId) state.activePresetId = null;
  persistPresets();
  renderPresetList();
  updateButtons();
}

function serializeOverlays(overlays) {
  return overlays.map(({ logoId, x, y, width, opacity }) => ({ logoId, x, y, width, opacity }));
}

function updateOverlayFromControls() {
  const overlay = getSelectedOverlay();
  if (!overlay) return;
  overlay.width = Number(els.logoSize.value) / 100;
  overlay.opacity = Number(els.logoOpacity.value) / 100;
  clampOverlay(overlay);
  updateControlLabels();
  renderPreview();
  renderOverlayList();
}

function updateGroupAdjustments() {
  const group = getActiveGroup();
  if (!group) return;
  group.adjustments.brightness = Number(els.brightness.value);
  group.adjustments.contrast = Number(els.contrast.value);
  group.adjustments.saturation = Number(els.saturation.value);
  group.adjustments.smoothing = Number(els.smoothing.value);
  group.adjustments.skinBrightening = Number(els.skinBrightening.value);
  updateControlLabels();
  renderPreview();
}

function resetGroupAdjustments() {
  const group = getActiveGroup();
  if (!group) return;
  group.adjustments = { brightness: 0, contrast: 0, saturation: 0, smoothing: 0, skinBrightening: 0 };
  syncControlsFromGroup();
  renderPreview();
}

function placeSelectedOverlay(position) {
  const overlay = getSelectedOverlay();
  const group = getActiveGroup();
  const logo = getLogoById(overlay?.logoId);
  if (!overlay || !group || !logo) return;
  const margin = 0.035;
  const height = overlayHeightNormalized(overlay, logo, group.ratio);
  const positions = {
    "top-left": [margin, margin],
    "top-right": [1 - overlay.width - margin, margin],
    center: [(1 - overlay.width) / 2, (1 - height) / 2],
    "bottom-left": [margin, 1 - height - margin],
    "bottom-right": [1 - overlay.width - margin, 1 - height - margin],
  };
  [overlay.x, overlay.y] = positions[position] || positions["bottom-right"];
  clampOverlay(overlay);
  renderPreview();
}

function autoPlaceSelectedOverlay() {
  const overlay = getSelectedOverlay();
  const image = getActiveImage();
  const group = getActiveGroup();
  const logo = getLogoById(overlay?.logoId);
  if (!overlay || !image || !group || !logo) return;
  drawBaseImage(image, group, els.previewCanvas, previewCtx);
  const height = overlayHeightNormalized(overlay, logo, group.ratio);
  const margin = 0.035;
  const candidates = [
    [margin, margin], [1 - overlay.width - margin, margin],
    [margin, 1 - height - margin], [1 - overlay.width - margin, 1 - height - margin],
    [(1 - overlay.width) / 2, margin], [(1 - overlay.width) / 2, 1 - height - margin],
  ];
  const logoLightness = getLogoLightness(logo);
  let best = { point: candidates[0], score: -Infinity };
  candidates.forEach((point) => {
    const score = contrastScore(previewCtx, point[0], point[1], overlay.width, height, logoLightness);
    if (score > best.score) best = { point, score };
  });
  [overlay.x, overlay.y] = best.point;
  renderPreview();
}

function startOverlayDrag(event) {
  const group = getActiveGroup();
  if (!group) return;
  const point = pointerToCanvas(event);
  const hit = [...group.overlays].reverse().find((overlay) => pointInOverlay(point, overlay));
  if (!hit) return;
  state.selectedOverlayId = hit.id;
  state.drag = { pointerId: event.pointerId, offsetX: point.x - hit.x * els.previewCanvas.width, offsetY: point.y - hit.y * els.previewCanvas.height };
  els.previewCanvas.setPointerCapture(event.pointerId);
  els.previewCanvas.classList.add("dragging");
  renderOverlayList();
  syncOverlayControls();
  renderPreview();
}

function moveOverlayDrag(event) {
  if (!state.drag || state.drag.pointerId !== event.pointerId) return;
  const overlay = getSelectedOverlay();
  if (!overlay) return;
  const point = pointerToCanvas(event);
  overlay.x = (point.x - state.drag.offsetX) / els.previewCanvas.width;
  overlay.y = (point.y - state.drag.offsetY) / els.previewCanvas.height;
  clampOverlay(overlay);
  renderPreview();
}

function endOverlayDrag(event) {
  if (!state.drag || state.drag.pointerId !== event.pointerId) return;
  state.drag = null;
  els.previewCanvas.classList.remove("dragging");
  if (els.previewCanvas.hasPointerCapture(event.pointerId)) els.previewCanvas.releasePointerCapture(event.pointerId);
}

function pointInOverlay(point, overlay) {
  const rect = overlayRect(overlay, els.previewCanvas.width, els.previewCanvas.height);
  return point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height;
}

function pointerToCanvas(event) {
  const rect = els.previewCanvas.getBoundingClientRect();
  return { x: (event.clientX - rect.left) * els.previewCanvas.width / rect.width, y: (event.clientY - rect.top) * els.previewCanvas.height / rect.height };
}

function clampOverlay(overlay) {
  const group = getActiveGroup();
  clampOverlayForGroup(overlay, group);
}

function clampOverlayForGroup(overlay, group) {
  const logo = getLogoById(overlay.logoId);
  if (!group || !logo) return;
  const height = overlayHeightNormalized(overlay, logo, group.ratio);
  overlay.x = clamp(overlay.x, 0, Math.max(0, 1 - overlay.width));
  overlay.y = clamp(overlay.y, 0, Math.max(0, 1 - height));
}

function renderAll() {
  renderGroupList();
  renderWorkspaceHeader();
  renderThumbs();
  renderLogoLibrary();
  renderLogoEditor();
  renderOverlayList();
  renderPresetList();
  syncControlsFromGroup();
  renderPreview();
  updateButtons();
  updateGlobalStatus();
}

function renderGroupList() {
  if (!state.groups.length) {
    els.groupList.innerHTML = '<div class="sidebar-empty">添加图片后，这里会出现“任务 1、任务 2…”</div>';
    return;
  }
  els.groupList.innerHTML = "";
  state.groups.forEach((group, index) => {
    const dimensions = group.imageIds.map((id) => getImageById(id)).filter(Boolean);
    const selectedCount = group.imageIds.filter((id) => state.selectedImageIds.has(id)).length;
    const samples = [...new Set(dimensions.map((image) => `${image.width}×${image.height}`))].slice(0, 2).join("、");
    const button = document.createElement("button");
    button.className = `group-card${group.id === state.activeGroupId ? " active" : ""}`;
    button.innerHTML = `<div class="group-card-top"><strong>任务 ${index + 1}</strong><span>${selectedCount}/${group.imageIds.length} 已选</span></div><div class="group-card-ratio">${escapeHtml(group.label)}</div><div class="group-card-bottom"><span>${escapeHtml(samples)}</span><span class="${group.overlays.length ? "group-ready" : ""}">${group.overlays.length ? `${group.overlays.length} 个 Logo` : "待设置"}</span></div>`;
    button.addEventListener("click", () => activateGroup(group.id));
    els.groupList.append(button);
  });
}

function renderWorkspaceHeader() {
  const group = getActiveGroup();
  const image = getActiveImage();
  const groupIndex = state.groups.findIndex((item) => item.id === group?.id);
  els.activeGroupTitle.textContent = group ? `任务 ${groupIndex + 1} · ${group.label}` : "尚未选择比例任务";
  els.activeImageName.textContent = image?.file.name || "暂无图片";
  els.activeImageMeta.textContent = image ? `${image.width} × ${image.height} px` : "添加图片后可预览";
  els.groupImageCount.textContent = group ? `${group.imageIds.length} 张` : "0 张";
}

function renderThumbs() {
  const group = getActiveGroup();
  els.thumbs.innerHTML = "";
  if (!group) return;
  group.imageIds.forEach((imageId) => {
    const image = getImageById(imageId);
    if (!image) return;
    const selected = state.selectedImageIds.has(image.id);
    const item = document.createElement("div");
    item.className = `thumb${image.id === state.activeImageId ? " active" : ""}${selected ? " selected" : ""}`;
    const preview = document.createElement("button");
    preview.type = "button";
    preview.className = "thumb-preview";
    preview.innerHTML = `<img src="${image.url}" alt=""><span>${escapeHtml(image.file.name)}</span>`;
    preview.addEventListener("click", () => activateImage(image.id));
    const selector = document.createElement("label");
    selector.className = "thumb-select";
    selector.title = selected ? "取消导出这张图片" : "选择导出这张图片";
    selector.innerHTML = `<input type="checkbox" ${selected ? "checked" : ""} aria-label="选择 ${escapeHtml(image.file.name)}">✓`;
    selector.querySelector("input").addEventListener("change", (event) => toggleImageSelection(image.id, event.target.checked));
    item.append(preview, selector);
    els.thumbs.append(item);
  });
}

function renderLogoLibrary() {
  if (!state.logos.length) {
    els.logoLibrary.innerHTML = '<p class="tool-empty">添加图片后先抠图，再保存为透明 Logo。</p>';
    return;
  }
  els.logoLibrary.innerHTML = "";
  const groups = groupBy(state.logos, (logo) => logo.group || "未分组");
  Object.entries(groups).forEach(([groupName, logos]) => {
    const heading = document.createElement("div");
    heading.className = "logo-group-title";
    heading.textContent = groupName;
    els.logoLibrary.append(heading);
    logos.forEach((logo) => {
      const button = document.createElement("button");
      const selected = state.selectedLogoIds.has(logo.id);
      button.className = `logo-card${selected ? " active" : ""}${logo.id === state.focusedLogoId ? " focused" : ""}`;
      button.type = "button";
      button.setAttribute("aria-pressed", String(selected));
      button.innerHTML = `<span class="logo-check">✓</span><img src="${logo.dataUrl}" alt=""><span>${escapeHtml(logo.name)}</span>`;
      button.addEventListener("click", () => {
        state.focusedLogoId = logo.id;
        if (state.selectedLogoIds.has(logo.id)) state.selectedLogoIds.delete(logo.id);
        else state.selectedLogoIds.add(logo.id);
        renderLogoLibrary();
        renderLogoEditor();
        updateButtons();
      });
      els.logoLibrary.append(button);
    });
  });
}

function renderPresetList() {
  const active = getActivePreset();
  els.activePresetStatus.textContent = active ? `已选：${active.name}` : "未选择";
  if (!state.presets.length) {
    els.presetList.innerHTML = '<p class="tool-empty">调好位置后保存，切换比例任务时仍可继续使用。</p>';
    return;
  }
  els.presetList.innerHTML = "";
  state.presets.forEach((preset) => {
    const row = document.createElement("div");
    row.className = "preset-row";
    const choice = document.createElement("button");
    choice.type = "button";
    choice.className = `preset-choice${preset.id === state.activePresetId ? " active" : ""}`;
    choice.textContent = `${preset.name} · ${preset.overlays.length} 个`;
    choice.title = `将“${preset.name}”应用到当前比例任务`;
    choice.addEventListener("click", () => activatePreset(preset.id));
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "preset-delete";
    remove.textContent = "×";
    remove.title = `删除预设“${preset.name}”`;
    remove.addEventListener("click", () => deletePreset(preset.id));
    row.append(choice, remove);
    els.presetList.append(row);
  });
}

function renderLogoEditor() {
  const logo = getSelectedLogo();
  els.logoEditor.hidden = !logo;
  if (!logo) return;
  els.logoName.value = logo.name;
  els.logoGroup.value = logo.group;
  const count = state.selectedLogoIds.size;
  els.addLogoToJob.textContent = count ? `将已选 ${count} 个 Logo 加入组合` : "勾选要使用的 Logo";
  els.deleteLogo.textContent = count > 1 ? `删除已选 ${count} 个` : "删除已选";
}

function renderOverlayList() {
  const group = getActiveGroup();
  const overlays = group?.overlays || [];
  els.overlayCount.textContent = `${overlays.length} 个`;
  if (!overlays.length) {
    els.overlayList.innerHTML = '<p class="tool-empty">从 Logo 库一键添加，可叠加多个 Logo。</p>';
    return;
  }
  els.overlayList.innerHTML = "";
  overlays.forEach((overlay) => {
    const logo = getLogoById(overlay.logoId);
    if (!logo) return;
    const button = document.createElement("button");
    button.className = `overlay-item${overlay.id === state.selectedOverlayId ? " active" : ""}`;
    button.innerHTML = `<img src="${logo.dataUrl}" alt=""><span>${escapeHtml(logo.name)}</span><small>${Math.round(overlay.width * 100)}%</small>`;
    button.addEventListener("click", () => {
      state.selectedOverlayId = overlay.id;
      renderOverlayList();
      syncOverlayControls();
      renderPreview();
    });
    els.overlayList.append(button);
  });
}

function syncControlsFromGroup() {
  const group = getActiveGroup();
  const adjustments = group?.adjustments || { brightness: 0, contrast: 0, saturation: 0, smoothing: 0, skinBrightening: 0 };
  els.brightness.value = adjustments.brightness;
  els.contrast.value = adjustments.contrast;
  els.saturation.value = adjustments.saturation;
  els.smoothing.value = adjustments.smoothing || 0;
  els.skinBrightening.value = adjustments.skinBrightening || 0;
  syncOverlayControls();
  updateControlLabels();
}

function syncOverlayControls() {
  const overlay = getSelectedOverlay();
  els.placementControls.hidden = !overlay;
  if (!overlay) return;
  els.logoSize.value = Math.round(overlay.width * 100);
  els.logoOpacity.value = Math.round(overlay.opacity * 100);
  updateControlLabels();
}

function updateControlLabels() {
  els.logoSizeValue.textContent = `${els.logoSize.value}%`;
  els.logoOpacityValue.textContent = `${els.logoOpacity.value}%`;
  els.brightnessValue.textContent = signedValue(els.brightness.value);
  els.contrastValue.textContent = signedValue(els.contrast.value);
  els.saturationValue.textContent = signedValue(els.saturation.value);
  els.smoothingValue.textContent = `${els.smoothing.value}%`;
  els.skinBrighteningValue.textContent = `${els.skinBrightening.value}%`;
  els.qualityValue.textContent = `${els.quality.value}%`;
}

function renderPreview() {
  const image = getActiveImage();
  const group = getActiveGroup();
  if (!image || !group) {
    previewCtx.clearRect(0, 0, els.previewCanvas.width, els.previewCanvas.height);
    els.previewCanvas.style.width = "";
    els.previewCanvas.style.height = "";
    els.emptyState.classList.remove("hidden");
    els.previewCanvas.classList.remove("can-drag");
    return;
  }
  els.emptyState.classList.add("hidden");
  const beautyEnabled = (group.adjustments.smoothing || group.adjustments.skinBrightening) > 0;
  if (beautyEnabled && !Array.isArray(image.faces)) {
    els.beautyStatus.textContent = "正在识别人脸…";
    ensureFaceDetection(image).then(() => {
      if (state.activeImageId === image.id) renderPreview();
    });
  } else if (beautyEnabled) {
    els.beautyStatus.textContent = image.faces.length ? `当前图检测到 ${image.faces.length} 张脸` : "当前图未检测到正面人脸";
  } else {
    els.beautyStatus.textContent = "开启后自动识别人脸";
  }
  drawBaseImage(image, group, els.previewCanvas, previewCtx);
  drawOverlays(previewCtx, els.previewCanvas.width, els.previewCanvas.height, group, true);
  fitPreviewCanvas();
  els.previewCanvas.classList.toggle("can-drag", group.overlays.length > 0);
}

function fitPreviewCanvas() {
  const stage = els.previewCanvas.parentElement;
  if (!stage || !getActiveImage()) return;
  const workspace = stage.closest(".workspace");
  const maxWidth = Math.max(180, (workspace?.clientWidth || stage.clientWidth) - 40);
  const maxHeight = Math.max(220, stage.getBoundingClientRect().height - 40);
  const scale = Math.min(maxWidth / els.previewCanvas.width, maxHeight / els.previewCanvas.height, 1);
  els.previewCanvas.style.width = `${Math.round(els.previewCanvas.width * scale)}px`;
  els.previewCanvas.style.height = `${Math.round(els.previewCanvas.height * scale)}px`;
}

function drawBaseImage(image, group, canvas, ctx, targetDimensions = null) {
  const dimensions = targetDimensions || previewDimensions(image.width, image.height);
  canvas.width = dimensions.width;
  canvas.height = dimensions.height;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image.img, 0, 0, canvas.width, canvas.height);
  applyPixelAdjustments(ctx, canvas.width, canvas.height, group.adjustments);
  applyFaceBeauty(canvas, ctx, image.faces || [], group.adjustments);
}

function applyPixelAdjustments(ctx, width, height, adjustments) {
  const brightness = Number(adjustments.brightness || 0) / 100;
  const contrast = 1 + Number(adjustments.contrast || 0) / 100;
  const saturation = 1 + Number(adjustments.saturation || 0) / 100;
  if (!brightness && contrast === 1 && saturation === 1) return;

  const imageData = ctx.getImageData(0, 0, width, height);
  const pixels = imageData.data;
  const brightnessFactor = 1 + brightness;
  for (let index = 0; index < pixels.length; index += 4) {
    let r = (pixels[index] * brightnessFactor - 128) * contrast + 128;
    let g = (pixels[index + 1] * brightnessFactor - 128) * contrast + 128;
    let b = (pixels[index + 2] * brightnessFactor - 128) * contrast + 128;
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    r = luminance + (r - luminance) * saturation;
    g = luminance + (g - luminance) * saturation;
    b = luminance + (b - luminance) * saturation;
    pixels[index] = clamp(Math.round(r), 0, 255);
    pixels[index + 1] = clamp(Math.round(g), 0, 255);
    pixels[index + 2] = clamp(Math.round(b), 0, 255);
  }
  ctx.putImageData(imageData, 0, 0);
}

function ensureFaceDetection(image) {
  if (Array.isArray(image.faces)) return Promise.resolve(image.faces);
  if (image.faceDetectionPromise) return image.faceDetectionPromise;
  image.faceDetectionPromise = new Promise((resolve) => {
    try {
      if (!window.tracking?.ObjectTracker || !window.tracking?.ViolaJones?.classifiers?.face) {
        image.faces = [];
        resolve(image.faces);
        return;
      }
      const maxSide = 960;
      const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(image.img, 0, 0, canvas.width, canvas.height);
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      const tracker = new window.tracking.ObjectTracker("face");
      tracker.setInitialScale(1.5);
      tracker.setScaleFactor(1.2);
      tracker.setStepSize(1.3);
      tracker.setEdgesDensity(0.08);
      let faces = [];
      tracker.on("track", (event) => { faces = event.data || []; });
      tracker.track(pixels, canvas.width, canvas.height);
      image.faces = faces.map((face) => ({
        x: face.x / canvas.width,
        y: face.y / canvas.height,
        width: face.width / canvas.width,
        height: face.height / canvas.height,
      }));
      canvas.width = 1;
      canvas.height = 1;
      resolve(image.faces);
    } catch (error) {
      image.faces = [];
      resolve(image.faces);
    }
  });
  return image.faceDetectionPromise;
}

function applyFaceBeauty(canvas, ctx, faces, adjustments) {
  const smoothing = Number(adjustments.smoothing || 0);
  const brightening = Number(adjustments.skinBrightening || 0);
  if ((!smoothing && !brightening) || !faces.length || !window.StackBlur?.canvasRGBA) return;
  faces.forEach((face) => applyBeautyToFace(canvas, ctx, face, smoothing, brightening));
}

function applyBeautyToFace(canvas, ctx, face, smoothing, brightening) {
  const sourceX = clamp(Math.round((face.x - face.width * 0.10) * canvas.width), 0, canvas.width - 1);
  const sourceY = clamp(Math.round((face.y - face.height * 0.08) * canvas.height), 0, canvas.height - 1);
  const sourceWidth = Math.min(canvas.width - sourceX, Math.max(1, Math.round(face.width * 1.20 * canvas.width)));
  const sourceHeight = Math.min(canvas.height - sourceY, Math.max(1, Math.round(face.height * 1.28 * canvas.height)));
  const workScale = Math.min(1, 800 / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * workScale));
  const height = Math.max(1, Math.round(sourceHeight * workScale));
  const original = document.createElement("canvas");
  original.width = width;
  original.height = height;
  const originalCtx = original.getContext("2d", { willReadFrequently: true });
  originalCtx.drawImage(canvas, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, width, height);

  const softened = document.createElement("canvas");
  softened.width = width;
  softened.height = height;
  const softenedCtx = softened.getContext("2d", { willReadFrequently: true });
  softenedCtx.drawImage(original, 0, 0);
  if (smoothing) {
    const radius = clamp(Math.round(Math.min(width, height) * (0.008 + smoothing * 0.00012)), 2, 18);
    window.StackBlur.canvasRGBA(softened, 0, 0, width, height, radius);
  }

  const sourceData = originalCtx.getImageData(0, 0, width, height);
  const resultData = softenedCtx.getImageData(0, 0, width, height);
  const sourcePixels = sourceData.data;
  const resultPixels = resultData.data;
  const smoothStrength = smoothing / 100 * 0.72;
  const brightenStrength = brightening / 60 * 0.16;
  for (let y = 0; y < height; y += 1) {
    const normalizedY = (y / height - 0.48) / 0.52;
    for (let x = 0; x < width; x += 1) {
      const normalizedX = (x / width - 0.50) / 0.48;
      const distance = normalizedX * normalizedX + normalizedY * normalizedY;
      if (distance >= 1) continue;
      const index = (y * width + x) * 4;
      const r = sourcePixels[index];
      const g = sourcePixels[index + 1];
      const b = sourcePixels[index + 2];
      if (!isLikelySkin(r, g, b)) {
        resultPixels[index] = r;
        resultPixels[index + 1] = g;
        resultPixels[index + 2] = b;
        continue;
      }
      const feather = clamp((1 - distance) * 2.5, 0, 1);
      const blend = smoothStrength * feather;
      for (let channel = 0; channel < 3; channel += 1) {
        const originalValue = sourcePixels[index + channel];
        const smoothValue = resultPixels[index + channel];
        let value = originalValue + (smoothValue - originalValue) * blend;
        value += (255 - value) * brightenStrength * feather;
        resultPixels[index + channel] = clamp(Math.round(value), 0, 255);
      }
    }
  }
  softenedCtx.putImageData(resultData, 0, 0);
  ctx.drawImage(softened, 0, 0, width, height, sourceX, sourceY, sourceWidth, sourceHeight);
  original.width = 1;
  original.height = 1;
  softened.width = 1;
  softened.height = 1;
}

function isLikelySkin(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const cb = 128 - 0.169 * r - 0.331 * g + 0.5 * b;
  const cr = 128 + 0.5 * r - 0.419 * g - 0.081 * b;
  return r > 45 && g > 28 && b > 15 && max - min > 10 && r > g * 0.88 && r > b * 1.04 && cb > 70 && cb < 145 && cr > 125 && cr < 190;
}

function drawOverlays(ctx, width, height, group, showSelection) {
  group.overlays.forEach((overlay) => {
    const logo = getLogoById(overlay.logoId);
    if (!logo?.img) return;
    const rect = overlayRect(overlay, width, height);
    ctx.save();
    ctx.globalAlpha = overlay.opacity;
    ctx.drawImage(logo.img, rect.x, rect.y, rect.width, rect.height);
    ctx.restore();
    if (showSelection && overlay.id === state.selectedOverlayId) drawSelection(ctx, rect);
  });
}

function drawSelection(ctx, rect) {
  ctx.save();
  ctx.fillStyle = "rgba(45, 95, 194, 0.12)";
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
  ctx.strokeStyle = "#2d5fc2";
  ctx.lineWidth = Math.max(6, els.previewCanvas.width / 150);
  ctx.setLineDash([18, 10]);
  ctx.strokeRect(rect.x - 3, rect.y - 3, rect.width + 6, rect.height + 6);
  ctx.setLineDash([]);
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "#2d5fc2";
  ctx.lineWidth = Math.max(4, els.previewCanvas.width / 220);
  const size = Math.max(20, els.previewCanvas.width / 45);
  [[rect.x, rect.y], [rect.x + rect.width, rect.y], [rect.x, rect.y + rect.height], [rect.x + rect.width, rect.y + rect.height]].forEach(([x, y]) => {
    ctx.fillRect(x - size / 2, y - size / 2, size, size);
    ctx.strokeRect(x - size / 2, y - size / 2, size, size);
  });
  ctx.restore();
}

async function downloadCurrentImage() {
  const image = getActiveImage();
  const group = getActiveGroup();
  if (!image || !group || state.exporting) return;
  try {
    setExporting(true, 0);
    const blob = await renderImageBlob(image, group);
    triggerDownload(blob, outputName(image.file.name));
    showNotice("当前图片已生成并开始下载。", true);
  } catch (error) {
    showNotice(`导出失败：${error.message}`, false);
  } finally {
    setExporting(false, 0);
  }
}

async function downloadActiveGroup() {
  if (state.exporting) return;
  const images = state.images.filter((image) => state.selectedImageIds.has(image.id));
  if (!images.length) return;
  const entries = [];
  const groupCounters = new Map();
  try {
    setExporting(true, 0);
    for (let index = 0; index < images.length; index += 1) {
      const image = images[index];
      const group = state.groups.find((item) => item.id === image.groupId);
      if (!group) continue;
      const blob = await renderImageBlob(image, group);
      if (!blob?.size) throw new Error(`${image.file.name} 未生成有效图片`);
      const groupIndex = state.groups.findIndex((item) => item.id === group.id) + 1;
      const count = (groupCounters.get(group.id) || 0) + 1;
      groupCounters.set(group.id, count);
      const folder = `任务${String(groupIndex).padStart(2, "0")}-${safeFilePart(group.label)}`;
      entries.push({ name: `${folder}/${String(count).padStart(3, "0")}-${outputName(image.file.name)}`, bytes: new Uint8Array(await blob.arrayBuffer()) });
      setExporting(true, (index + 1) / images.length);
      await yieldToBrowser();
    }
    const zip = createStoredZip(entries);
    if (!zip.size) throw new Error("ZIP 文件为空");
    triggerDownload(zip, `批量P图-已选${images.length}张.zip`);
    showNotice(`已生成 ${images.length} 张图片，并按 ${groupCounters.size} 个比例文件夹打包；ZIP 大小 ${formatBytes(zip.size)}。`, true);
  } catch (error) {
    showNotice(`批量导出失败：${error.message}`, false);
  } finally {
    setExporting(false, 0);
  }
}

async function renderImageBlob(image, group) {
  if ((group.adjustments.smoothing || group.adjustments.skinBrightening) > 0) await ensureFaceDetection(image);
  const dimensions = exportDimensions(image.width, image.height, Number(els.maxEdge.value));
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { alpha: false });
  drawBaseImage(image, group, canvas, ctx, dimensions);
  drawOverlays(ctx, dimensions.width, dimensions.height, group, false);
  const type = els.format.value;
  const quality = type === "image/png" ? undefined : Number(els.quality.value) / 100;
  const blob = await canvasToBlob(canvas, type, quality);
  canvas.width = 1;
  canvas.height = 1;
  return blob;
}

function setExporting(active, progress) {
  state.exporting = active;
  els.exportProgress.hidden = !active;
  els.exportProgressBar.style.width = `${Math.round(progress * 100)}%`;
  els.downloadGroup.textContent = active ? `正在处理已选图片 ${Math.round(progress * 100)}%` : "高清压缩并导出已选图片 ZIP";
  updateButtons();
}

function updateButtons() {
  const hasGroup = Boolean(getActiveGroup());
  const hasImage = Boolean(getActiveImage());
  els.clearAll.disabled = state.images.length === 0;
  els.addLogoToJob.disabled = !hasGroup || state.selectedLogoIds.size === 0;
  els.deleteLogo.disabled = state.selectedLogoIds.size === 0;
  els.savePreset.disabled = !getActiveGroup()?.overlays.length;
  els.updatePreset.disabled = !getActivePreset() || !getActiveGroup()?.overlays.length;
  els.downloadCurrent.disabled = !hasImage || state.exporting;
  els.downloadGroup.disabled = state.selectedImageIds.size === 0 || state.exporting;
  els.selectCurrentGroup.disabled = !hasGroup || state.exporting;
  els.clearCurrentGroup.disabled = !hasGroup || state.exporting;
  els.selectAllImages.disabled = state.images.length === 0 || state.exporting;
  els.clearImageSelection.disabled = state.selectedImageIds.size === 0 || state.exporting;
  els.selectedImageCount.textContent = `已选 ${state.selectedImageIds.size} / ${state.images.length} 张`;
}

function updateGlobalStatus() {
  els.imageCount.textContent = `${state.images.length} 张`;
  els.globalStatus.textContent = state.images.length ? `${state.groups.length} 个比例任务 · 已选 ${state.selectedImageIds.size}/${state.images.length} 张` : "等待添加图片";
}

function restoreLogoLibrary() {
  try {
    const saved = JSON.parse(localStorage.getItem(LOGO_STORAGE_KEY) || "[]");
    saved.forEach((item) => {
      const img = new Image();
      img.onload = renderPreview;
      img.src = item.dataUrl;
      state.logos.push({ ...item, img });
    });
    state.focusedLogoId = state.logos[0]?.id || null;
  } catch (error) {
    localStorage.removeItem(LOGO_STORAGE_KEY);
  }
}

function restorePresets() {
  try {
    const saved = JSON.parse(localStorage.getItem(PRESET_STORAGE_KEY) || "{}");
    state.presets = Array.isArray(saved.presets) ? saved.presets : [];
    state.activePresetId = state.presets.some((preset) => preset.id === saved.activePresetId) ? saved.activePresetId : null;
    const active = getActivePreset();
    if (active) els.presetName.value = active.name;
  } catch (error) {
    localStorage.removeItem(PRESET_STORAGE_KEY);
  }
}

function persistLogoLibrary() {
  const serializable = state.logos.map(({ id, name, group, dataUrl }) => ({ id, name, group, dataUrl }));
  try {
    localStorage.setItem(LOGO_STORAGE_KEY, JSON.stringify(serializable));
  } catch (error) {
    showNotice("Logo 库已载入，但浏览器存储空间不足，刷新后可能不会保留。", false);
  }
}

function persistPresets() {
  try {
    localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify({ presets: state.presets, activePresetId: state.activePresetId }));
  } catch (error) {
    showNotice("组合预设暂时无法保存到浏览器。", false);
  }
}

function loadImageFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve({ id: uid(), file, img, url, width: img.naturalWidth, height: img.naturalHeight, groupId: null });
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error(`无法读取 ${file.name}`)); };
    img.src = url;
  });
}

async function loadLogoFile(file) {
  const dataUrl = await fileToDataUrl(file);
  const img = await loadImageSource(dataUrl);
  return { id: uid(), name: stripExtension(file.name), group: "未分组", dataUrl, img };
}

function loadImageSource(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function getActiveGroup() { return state.groups.find((group) => group.id === state.activeGroupId) || null; }
function getActiveImage() { return getImageById(state.activeImageId); }
function getImageById(id) { return state.images.find((image) => image.id === id) || null; }
function getSelectedLogo() { return getLogoById(state.focusedLogoId); }
function getLogoById(id) { return state.logos.find((logo) => logo.id === id) || null; }
function getSelectedOverlay() { return getActiveGroup()?.overlays.find((overlay) => overlay.id === state.selectedOverlayId) || null; }
function getActivePreset() { return state.presets.find((preset) => preset.id === state.activePresetId) || null; }

function overlayRect(overlay, imageWidth, imageHeight) {
  const logo = getLogoById(overlay.logoId);
  const width = imageWidth * overlay.width;
  const height = logo ? width * logo.img.naturalHeight / logo.img.naturalWidth : 0;
  return { x: imageWidth * overlay.x, y: imageHeight * overlay.y, width, height };
}

function overlayHeightNormalized(overlay, logo, imageRatio) {
  return overlay.width * imageRatio * logo.img.naturalHeight / logo.img.naturalWidth;
}

function previewDimensions(width, height) {
  const maxDimension = 1400;
  const scale = Math.min(1, maxDimension / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

function exportDimensions(width, height, maxEdge) {
  if (!maxEdge || Math.max(width, height) <= maxEdge) return { width, height };
  const scale = maxEdge / Math.max(width, height);
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

function ratioLabel(ratio) {
  const common = [
    [16 / 9, "16:9 横图"], [3 / 2, "3:2 横图"], [4 / 3, "4:3 横图"], [5 / 4, "5:4 横图"],
    [1, "1:1 方图"], [4 / 5, "4:5 竖图"], [3 / 4, "3:4 竖图"], [2 / 3, "2:3 竖图"], [9 / 16, "9:16 竖图"],
  ];
  const matched = common.find(([value]) => Math.abs(value - ratio) < 0.015);
  if (matched) return matched[1];
  const side = ratio > 1 ? "横图" : "竖图";
  return `${ratio.toFixed(3)}:1 ${side}`;
}

function getLogoLightness(logo) {
  if (Number.isFinite(logo.lightness)) return logo.lightness;
  const canvas = document.createElement("canvas");
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(logo.img, 0, 0, 32, 32);
  const data = ctx.getImageData(0, 0, 32, 32).data;
  let total = 0;
  let count = 0;
  for (let index = 0; index < data.length; index += 4) {
    if (data[index + 3] < 20) continue;
    total += 0.299 * data[index] + 0.587 * data[index + 1] + 0.114 * data[index + 2];
    count += 1;
  }
  logo.lightness = count ? total / count : 128;
  return logo.lightness;
}

function contrastScore(ctx, x, y, width, height, logoLightness) {
  const px = Math.max(0, Math.round(x * ctx.canvas.width));
  const py = Math.max(0, Math.round(y * ctx.canvas.height));
  const pw = Math.max(1, Math.min(ctx.canvas.width - px, Math.round(width * ctx.canvas.width)));
  const ph = Math.max(1, Math.min(ctx.canvas.height - py, Math.round(height * ctx.canvas.height)));
  const data = ctx.getImageData(px, py, pw, ph).data;
  const stride = Math.max(4, Math.floor(data.length / 1200 / 4) * 4);
  let sum = 0;
  let sumSquared = 0;
  let count = 0;
  for (let index = 0; index < data.length; index += stride) {
    const lightness = 0.299 * data[index] + 0.587 * data[index + 1] + 0.114 * data[index + 2];
    sum += lightness;
    sumSquared += lightness * lightness;
    count += 1;
  }
  const mean = sum / count;
  const deviation = Math.sqrt(Math.max(0, sumSquared / count - mean * mean));
  return Math.abs(mean - logoLightness) - deviation * 0.35;
}

function createStoredZip(entries) {
  const encoder = new TextEncoder();
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  const { time, date } = dosDateTime(new Date());
  entries.forEach((entry) => {
    const name = encoder.encode(entry.name);
    const crc = crc32(entry.bytes);
    const local = new Uint8Array(30 + name.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0x0800, true);
    localView.setUint16(8, 0, true);
    localView.setUint16(10, time, true);
    localView.setUint16(12, date, true);
    localView.setUint32(14, crc, true);
    localView.setUint32(18, entry.bytes.length, true);
    localView.setUint32(22, entry.bytes.length, true);
    localView.setUint16(26, name.length, true);
    localView.setUint16(28, 0, true);
    local.set(name, 30);
    localParts.push(local, entry.bytes);

    const central = new Uint8Array(46 + name.length);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0x0800, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint16(12, time, true);
    centralView.setUint16(14, date, true);
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, entry.bytes.length, true);
    centralView.setUint32(24, entry.bytes.length, true);
    centralView.setUint16(28, name.length, true);
    centralView.setUint16(30, 0, true);
    centralView.setUint16(32, 0, true);
    centralView.setUint16(34, 0, true);
    centralView.setUint16(36, 0, true);
    centralView.setUint32(38, 0, true);
    centralView.setUint32(42, offset, true);
    central.set(name, 46);
    centralParts.push(central);
    offset += local.length + entry.bytes.length;
  });
  const centralSize = centralParts.reduce((total, part) => total + part.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(4, 0, true);
  endView.setUint16(6, 0, true);
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, offset, true);
  endView.setUint16(20, 0, true);
  return new Blob([...localParts, ...centralParts, end], { type: "application/zip" });
}

function dosDateTime(value) {
  const year = Math.max(1980, value.getFullYear());
  return {
    time: (value.getHours() << 11) | (value.getMinutes() << 5) | Math.floor(value.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((value.getMonth() + 1) << 5) | value.getDate(),
  };
}

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let number = 0; number < 256; number += 1) {
    let value = number;
    for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    table[number] = value >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let crc = -1;
  for (let index = 0; index < bytes.length; index += 1) crc = (crc >>> 8) ^ crcTable[(crc ^ bytes[index]) & 0xff];
  return (crc ^ -1) >>> 0;
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("浏览器没有生成图片数据")), type, quality);
  });
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.display = "none";
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

function outputName(filename) {
  const extensions = { "image/jpeg": "jpg", "image/webp": "webp", "image/png": "png" };
  return `${stripExtension(filename)}-已处理.${extensions[els.format.value]}`;
}

function showNotice(message, success) {
  els.notice.textContent = message;
  els.notice.classList.toggle("success", success);
  els.notice.hidden = false;
}

function hideNotice() { els.notice.hidden = true; }
function isImageFile(file) { return file.type.startsWith("image/"); }
function uid() { return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`; }
function stripExtension(name) { return name.replace(/\.[^.]+$/, ""); }
function signedValue(value) { const number = Number(value); return number > 0 ? `+${number}` : String(number); }
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function groupBy(items, keyFn) { return items.reduce((groups, item) => { const key = keyFn(item); (groups[key] ||= []).push(item); return groups; }, {}); }
function safeFilePart(value) { return value.replace(/[\\/:*?"<>|]/g, "-"); }
function formatBytes(bytes) { if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`; return `${(bytes / 1024 / 1024).toFixed(1)} MB`; }
function yieldToBrowser() { return new Promise((resolve) => requestAnimationFrame(() => resolve())); }
function escapeHtml(value) { const node = document.createElement("div"); node.textContent = value; return node.innerHTML; }
