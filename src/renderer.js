const DEFAULT_LABELS = [];
const initialLocale = localStorage.getItem("uiLocale") || navigator.language;
const i18n = SegmentLabelerI18n.create(SegmentLabelerLocales, initialLocale);
const t = (key, values) => i18n.text(key, values);

const state = {
  metadata: null,
  labels: DEFAULT_LABELS.map((label) => ({ ...label })),
  segments: [],
  selectedId: null,
  undoStack: [],
  redoStack: [],
  projectPath: null,
  dirty: false,
  revision: 0,
  videoAspect: null,
  pendingCurrentTime: 0,
  loading: false,
  restoreRequested: false,
  timelineZoom: TimelineView.MIN_ZOOM,
  timelineViewStart: 0,
  rangeSelection: null,
  selectedCutId: null,
};

const ui = Object.fromEntries(
  [
    "video", "video-frame", "video-format", "drop-zone", "drop-overlay", "empty-state",
    "file-name", "open-video", "open-project", "save-project", "save-status", "undo", "redo",
    "export", "play-toggle", "jump-back",
    "jump-forward", "time-display", "speed", "speed-value", "speed-reset",
    "timeline", "timeline-ruler", "segments-track", "cut-markers", "range-selection", "range-action",
    "clear-range-cuts", "cut-adjust-tooltip", "playhead", "selection-summary", "pause-on-cut",
    "remove-cut", "move-cut-to-playhead",
    "timeline-zoom-value", "timeline-zoom-reset",
    "timeline-status", "positive-labels", "negative-labels", "labeled-count",
    "positive-label-form", "positive-label-name", "positive-label-id",
    "negative-label-form", "negative-label-name", "negative-label-id",
    "selected-number", "selected-empty", "selected-editor", "selected-start",
    "selected-end", "selected-duration", "segment-note", "segment-list",
    "unlabeled-next", "cut-flash", "export-dialog", "precise-export",
    "cancel-export", "confirm-export", "export-progress", "progress-bar",
    "progress-text", "toast", "language-select",
  ].map((id) => [id, document.getElementById(id)]),
);

let labelById = new Map(state.labels.map((label) => [label.id, label]));
let toastTimer;
let noteTimer;
let autosaveTimer;
let snapFeedbackTimer;
let lastPlaybackSave = 0;
let dragDepth = 0;
const scrub = {
  active: false,
  pointerId: null,
  previewTime: 0,
  animationFrame: null,
  lastMediaSeek: 0,
  wasPlaying: false,
  snapped: false,
};
const rangeDrag = {
  active: false,
  pointerId: null,
  anchorTime: 0,
  anchorY: 0,
  wasPlaying: false,
};
const cutDrag = {
  pending: false,
  active: false,
  pointerId: null,
  segmentId: null,
  startX: 0,
  originalTime: 0,
  previewTime: 0,
  originalSegments: null,
  wasPlaying: false,
};

function syncLabelIndex() {
  labelById = new Map(state.labels.map((label) => [label.id, label]));
}

function storedLabels() {
  try {
    const value = JSON.parse(localStorage.getItem("customLabels") || "null");
    if (Array.isArray(value)) return value;
  } catch (_error) {
    // Ignore an invalid previous preference and use the defaults.
  }
  return DEFAULT_LABELS.map((label) => ({ ...label }));
}

function persistLabels() {
  localStorage.setItem("customLabels", JSON.stringify(state.labels));
}

function formatTime(seconds, millis = true) {
  if (!Number.isFinite(seconds)) return "00:00:00.000";
  const safe = Math.max(0, seconds);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const wholeSeconds = Math.floor(safe % 60);
  const milliseconds = Math.floor((safe - Math.floor(safe)) * 1000);
  const base = [hours, minutes, wholeSeconds].map((value) => String(value).padStart(2, "0")).join(":");
  return millis ? `${base}.${String(milliseconds).padStart(3, "0")}` : base;
}

function snapshot() {
  return {
    labels: state.labels.map((label) => ({ ...label })),
    segments: state.segments.map((segment) => ({ ...segment })),
    selectedId: state.selectedId,
    selectedCutId: state.selectedCutId,
  };
}

function restore(value) {
  state.labels = (value.labels || state.labels).map((label) => ({ ...label }));
  syncLabelIndex();
  persistLabels();
  state.segments = value.segments.map((segment) => ({ ...segment }));
  state.selectedId = value.selectedId;
  state.selectedCutId = value.selectedCutId || null;
  state.dirty = true;
  state.revision += 1;
  renderAll();
  scheduleAutosave();
}

function commit(change) {
  if (!change.changed) return false;
  state.undoStack.push(snapshot());
  if (state.undoStack.length > 200) state.undoStack.shift();
  state.redoStack = [];
  state.segments = change.segments;
  if (change.selectedId !== undefined) state.selectedId = change.selectedId;
  state.dirty = true;
  state.revision += 1;
  renderAll();
  scheduleAutosave();
  return true;
}

function undo() {
  if (!state.undoStack.length) return;
  state.redoStack.push(snapshot());
  restore(state.undoStack.pop());
}

function redo() {
  if (!state.redoStack.length) return;
  state.undoStack.push(snapshot());
  restore(state.redoStack.pop());
}

function showToast(message, error = false) {
  clearTimeout(toastTimer);
  ui.toast.textContent = message;
  ui.toast.className = `toast${error ? " error" : ""}`;
  toastTimer = setTimeout(() => ui.toast.classList.add("hidden"), 3200);
}

function setSaveStatus(text, kind = "") {
  ui["save-status"].textContent = text;
  ui["save-status"].className = `save-status${kind ? ` ${kind}` : ""}`;
}

function setLocale(value, persist = true) {
  const locale = i18n.setLocale(value);
  if (persist) localStorage.setItem("uiLocale", locale);
  ui["language-select"].value = locale;
  i18n.apply();
  ui["file-name"].textContent = state.metadata?.name || t("app.noVideo");
  const saveKey = state.dirty ? "save.changed" : state.projectPath ? "save.saved" : "save.unsaved";
  setSaveStatus(t(saveKey), state.dirty ? "saving" : state.projectPath ? "saved" : "");
  if (state.metadata) applyVideoDimensions();
  renderAll();
  window.desktop.setLocale(locale);
}

function fitVideoFrame() {
  if (!state.videoAspect || !Number.isFinite(state.videoAspect)) return;
  const stageWidth = ui["drop-zone"].clientWidth;
  const stageHeight = ui["drop-zone"].clientHeight;
  if (!stageWidth || !stageHeight) return;
  let width;
  let height;
  if (stageWidth / stageHeight > state.videoAspect) {
    height = stageHeight;
    width = height * state.videoAspect;
  } else {
    width = stageWidth;
    height = width / state.videoAspect;
  }
  ui["video-frame"].style.width = `${Math.max(1, width)}px`;
  ui["video-frame"].style.height = `${Math.max(1, height)}px`;
}

function applyVideoDimensions() {
  const width = Number(ui.video.videoWidth || state.metadata?.displayWidth || state.metadata?.width || 0);
  const height = Number(ui.video.videoHeight || state.metadata?.displayHeight || state.metadata?.height || 0);
  if (!width || !height) return;
  state.videoAspect = width / height;
  const orientation = height > width ? "video.portrait" : width > height ? "video.landscape" : "video.square";
  ui["video-format"].textContent = `${t(orientation)} ${Math.round(width)}×${Math.round(height)}`;
  ui["video-format"].classList.remove("hidden");
  fitVideoFrame();
}

function renderLabels() {
  for (const polarity of ["positive", "negative"]) {
    const root = polarity === "positive" ? ui["positive-labels"] : ui["negative-labels"];
    root.replaceChildren();
    const labels = state.labels.filter((label) => label.polarity === polarity);
    if (!labels.length) {
      const empty = document.createElement("div");
      empty.className = "label-grid-empty";
      empty.textContent = t("labels.empty");
      root.append(empty);
    }
    labels.forEach((label) => {
      const item = document.createElement("div");
      item.className = "label-item";
      const button = document.createElement("button");
      button.className = `label-button ${polarity}`;
      button.dataset.labelId = label.id;
      button.textContent = label.key ? `${label.name}  ${label.key}` : label.name;
      button.title = label.key ? t("format.shortcut", { key: label.key }) : label.name;
      button.addEventListener("click", () => assignSelected(label.id));
      const remove = document.createElement("button");
      remove.className = "label-delete";
      remove.type = "button";
      remove.textContent = "×";
      remove.title = t("format.deleteLabel", { name: label.name });
      remove.addEventListener("click", () => deleteLabel(label.id));
      item.append(button, remove);
      root.append(item);
    });
  }
}

function renderTimeline() {
  ui["segments-track"].replaceChildren();
  ui["cut-markers"].replaceChildren();
  const duration = state.metadata?.duration || 0;
  const viewWindow = TimelineView.getWindow(duration, state.timelineZoom, state.timelineViewStart);
  state.timelineZoom = viewWindow.zoom;
  state.timelineViewStart = viewWindow.start;
  ui["timeline-zoom-value"].textContent = `${viewWindow.zoom < 10 ? viewWindow.zoom.toFixed(1) : Math.round(viewWindow.zoom)}×`;
  ui["timeline-zoom-reset"].disabled = !duration || viewWindow.zoom === TimelineView.MIN_ZOOM;
  if (!duration) {
    updatePlayhead();
    return;
  }
  state.segments.forEach((segment, index) => {
    const visible = TimelineView.visibleSegment(segment, viewWindow);
    if (!visible) return;
    const label = labelById.get(segment.labelId);
    const item = document.createElement("div");
    item.className = `timeline-segment ${label?.polarity || "unlabeled"}${segment.id === state.selectedId ? " selected" : ""}`;
    item.style.left = `${visible.left}%`;
    item.style.width = `${visible.width}%`;
    item.title = `${index + 1}. ${formatTime(segment.start)} - ${formatTime(segment.end)}${label ? ` · ${label.name}` : ` · ${t("segment.unlabeled")}`}`;
    const text = document.createElement("span");
    text.textContent = label?.name || `${index + 1}`;
    item.append(text);
    ui["segments-track"].append(item);
  });
  const range = state.rangeSelection;
  state.segments.slice(1).forEach((segment) => {
    if (segment.start < viewWindow.start || segment.start > viewWindow.end) return;
    const marker = document.createElement("div");
    marker.className = `cut-marker${selectedRangeCutTimes().includes(segment.start) ? " in-range" : ""}${segment.id === state.selectedCutId ? " selected" : ""}`;
    marker.dataset.segmentId = segment.id;
    marker.title = segment.id === state.selectedCutId
      ? t("format.cutSelected", { time: formatTime(segment.start) })
      : t("format.cutSelect", { time: formatTime(segment.start) });
    marker.style.left = `${((segment.start - viewWindow.start) / viewWindow.span) * 100}%`;
    ui["cut-markers"].append(marker);
  });
  if (range && range.end >= viewWindow.start && range.start <= viewWindow.end) {
    const visibleStart = Math.max(range.start, viewWindow.start);
    const visibleEnd = Math.min(range.end, viewWindow.end);
    ui["range-selection"].style.left = `${((visibleStart - viewWindow.start) / viewWindow.span) * 100}%`;
    ui["range-selection"].style.width = `${((visibleEnd - visibleStart) / viewWindow.span) * 100}%`;
    ui["range-selection"].style.top = `${range.topRatio * 100}%`;
    ui["range-selection"].style.height = `${(range.bottomRatio - range.topRatio) * 100}%`;
    ui["range-selection"].classList.remove("hidden");
    if (!rangeDrag.active) positionRangeAction(range, viewWindow);
    else ui["range-action"].classList.add("hidden");
  } else {
    ui["range-selection"].classList.add("hidden");
    ui["range-action"].classList.add("hidden");
  }
  updatePlayhead();
}

function selectedRangeCutTimes() {
  if (!state.rangeSelection) return [];
  const timelineRect = ui.timeline.getBoundingClientRect();
  const markerRect = ui["cut-markers"].getBoundingClientRect();
  if (!timelineRect.height) return [];
  const markerTopRatio = (markerRect.top - timelineRect.top) / timelineRect.height;
  const markerBottomRatio = (markerRect.bottom - timelineRect.top) / timelineRect.height;
  if (state.rangeSelection.bottomRatio < markerTopRatio || state.rangeSelection.topRatio > markerBottomRatio) return [];
  return state.segments.slice(1)
    .map((segment) => segment.start)
    .filter((time) => time >= state.rangeSelection.start && time <= state.rangeSelection.end);
}

function selectedCut() {
  const index = state.segments.findIndex((segment) => segment.id === state.selectedCutId);
  if (index <= 0) return null;
  return { segment: state.segments[index], index };
}

function positionRangeAction(range, viewWindow) {
  const timelineRect = ui.timeline.getBoundingClientRect();
  if (!timelineRect.width || !timelineRect.height) return;
  const rangeRight = ((Math.min(range.end, viewWindow.end) - viewWindow.start) / viewWindow.span) * timelineRect.width;
  const rangeTop = range.topRatio * timelineRect.height;
  const rangeBottom = range.bottomRatio * timelineRect.height;
  const menuWidth = 86;
  const menuHeight = 34;
  const left = Math.max(4, Math.min(timelineRect.width - menuWidth - 4, rangeRight - menuWidth));
  const top = rangeBottom + menuHeight + 4 <= timelineRect.height
    ? rangeBottom + 4
    : Math.max(4, rangeTop - menuHeight - 4);
  ui["range-action"].style.left = `${left}px`;
  ui["range-action"].style.top = `${top}px`;
  ui["range-action"].classList.toggle("hidden", selectedRangeCutTimes().length === 0);
}

function renderSegmentList() {
  ui["segment-list"].replaceChildren();
  state.segments.forEach((segment, index) => {
    const label = labelById.get(segment.labelId);
    const row = document.createElement("div");
    row.className = `segment-row${segment.id === state.selectedId ? " selected" : ""}`;
    row.dataset.segmentId = segment.id;
    const number = document.createElement("span");
    number.className = "segment-index";
    number.textContent = String(index + 1).padStart(2, "0");
    const main = document.createElement("div");
    main.className = "segment-main";
    const name = document.createElement("strong");
    name.textContent = label?.name || t("segment.unlabeled");
    const timing = document.createElement("span");
    timing.textContent = `${formatTime(segment.start, false)} – ${formatTime(segment.end, false)} · ${formatTime(segment.end - segment.start, false)}`;
    main.append(name, timing);
    const tag = document.createElement("span");
    tag.className = `segment-tag ${label?.polarity || ""}`;
    tag.textContent = label
      ? t(label.polarity === "positive" ? "segment.positiveShort" : "segment.negativeShort")
      : t("segment.pending");
    row.append(number, main, tag);
    row.addEventListener("click", () => selectSegment(segment.id, true));
    ui["segment-list"].append(row);
  });
}

function renderSelection() {
  const selected = state.segments.find((segment) => segment.id === state.selectedId);
  document.querySelectorAll(".label-button").forEach((button) => {
    button.classList.toggle("active", selected?.labelId === button.dataset.labelId);
    button.disabled = !selected;
  });
  if (!selected) {
    ui["selected-number"].textContent = "—";
    ui["selected-empty"].classList.remove("hidden");
    ui["selected-editor"].classList.add("hidden");
    ui["selection-summary"].textContent = t("timeline.noneSelected");
    ui["remove-cut"].disabled = true;
    return;
  }
  const index = state.segments.findIndex((segment) => segment.id === selected.id);
  const label = labelById.get(selected.labelId);
  ui["selected-number"].textContent = `#${index + 1}`;
  ui["selected-empty"].classList.add("hidden");
  ui["selected-editor"].classList.remove("hidden");
  ui["selected-start"].textContent = formatTime(selected.start);
  ui["selected-end"].textContent = formatTime(selected.end);
  ui["selected-duration"].textContent = formatTime(selected.end - selected.start, false);
  if (document.activeElement !== ui["segment-note"]) ui["segment-note"].value = selected.note || "";
  ui["selection-summary"].textContent = `#${index + 1} · ${label?.name || t("segment.unlabeled")} · ${formatTime(selected.end - selected.start, false)}`;
  ui["remove-cut"].disabled = index === 0;
}

function renderControls() {
  const ready = Boolean(state.metadata);
  const labeled = state.segments.filter((segment) => segment.labelId).length;
  ui["labeled-count"].textContent = `${labeled} / ${state.segments.length}`;
  ui["save-project"].disabled = !ready;
  ui.export.disabled = !ready || labeled === 0;
  ui["play-toggle"].disabled = !ready;
  ui.speed.disabled = !ready;
  ui.undo.disabled = state.undoStack.length === 0;
  ui.redo.disabled = state.redoStack.length === 0;
  const rangeCutCount = selectedRangeCutTimes().length;
  const cut = selectedCut();
  ui["move-cut-to-playhead"].disabled = !cut;
  ui["timeline-status"].textContent = state.rangeSelection
    ? `${formatTime(state.rangeSelection.start, false)} – ${formatTime(state.rangeSelection.end, false)} · ${t("format.cuts", { count: rangeCutCount })}`
    : cut
      ? t("format.cutAdjust", { time: formatTime(cut.segment.start) })
    : ready
      ? t("format.segmentStats", { segments: state.segments.length, labeled, unlabeled: state.segments.length - labeled })
      : t("timeline.ready");
}

function renderAll() {
  renderLabels();
  renderTimeline();
  renderSegmentList();
  renderSelection();
  renderControls();
}

function selectSegment(id, seek = false) {
  const segment = state.segments.find((item) => item.id === id);
  if (!segment) return;
  state.selectedId = id;
  if (seek) {
    ui.video.currentTime = segment.start;
    ensureTimeVisible(segment.start, true);
  }
  renderAll();
  requestAnimationFrame(() => {
    ui["segment-list"].querySelector(`[data-segment-id="${id}"]`)?.scrollIntoView({ block: "nearest" });
  });
}

function commitLabelChange(labels, segments = state.segments) {
  state.undoStack.push(snapshot());
  if (state.undoStack.length > 200) state.undoStack.shift();
  state.redoStack = [];
  state.labels = labels.map((label) => ({ ...label }));
  state.segments = segments.map((segment) => ({ ...segment }));
  syncLabelIndex();
  persistLabels();
  state.dirty = true;
  state.revision += 1;
  renderAll();
  scheduleAutosave();
}

function addLabel(polarity) {
  const nameInput = ui[`${polarity}-label-name`];
  const idInput = ui[`${polarity}-label-id`];
  const name = nameInput.value.trim();
  const requestedId = idInput.value.trim().toLowerCase().replace(/\s+/g, "_");
  if (!name) return;
  if (requestedId && !/^[a-z][a-z0-9_-]{0,63}$/.test(requestedId)) {
    showToast(t("toast.idInvalid"), true);
    idInput.focus();
    return;
  }
  const id = requestedId || `label_${polarity}_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
  if (state.labels.some((label) => label.id === id)) {
    showToast(t("toast.idExists"), true);
    idInput.focus();
    return;
  }
  if (state.labels.some((label) => label.polarity === polarity && label.name === name)) {
    showToast(t("toast.labelExists"), true);
    nameInput.focus();
    return;
  }
  commitLabelChange([...state.labels, { id, name, polarity }]);
  nameInput.value = "";
  idInput.value = "";
  nameInput.focus();
  showToast(t("toast.labelAdded", { polarity: t(polarity === "positive" ? "toast.positive" : "toast.negative"), name }));
}

function deleteLabel(labelId) {
  const label = labelById.get(labelId);
  if (!label) return;
  const affected = state.segments.filter((segment) => segment.labelId === labelId).length;
  if (affected && !window.confirm(t("toast.labelDeleteConfirm", { name: label.name, count: affected }))) return;
  const segments = state.segments.map((segment) => (
    segment.labelId === labelId ? { ...segment, labelId: null } : segment
  ));
  commitLabelChange(state.labels.filter((item) => item.id !== labelId), segments);
  showToast(t("toast.labelDeleted", { name: label.name }));
}

function assignSelected(labelId) {
  if (!state.selectedId) {
    const atPlayhead = SegmentModel.segmentAt(state.segments, ui.video.currentTime);
    if (atPlayhead) state.selectedId = atPlayhead.id;
  }
  if (!state.selectedId) return;
  const result = SegmentModel.assignLabel(state.segments, state.selectedId, labelId);
  if (result.changed) {
    commit({ ...result, selectedId: state.selectedId });
    const label = labelById.get(labelId);
    showToast(t("toast.annotated", { polarity: t(label.polarity === "positive" ? "toast.positive" : "toast.negative"), name: label.name }));
  }
}

function splitAtPlayhead() {
  if (!state.metadata) return;
  const wasPlaying = !ui.video.paused;
  const result = SegmentModel.splitAt(state.segments, ui.video.currentTime);
  if (!commit(result)) {
    showToast(t("toast.cutTooClose"), true);
    return;
  }
  if (ui["pause-on-cut"].checked && wasPlaying) ui.video.pause();
  ui["cut-flash"].classList.add("visible");
  setTimeout(() => ui["cut-flash"].classList.remove("visible"), 550);
}

function removeSelectedLeftCut() {
  if (!state.selectedId) return;
  commit(SegmentModel.removeCutBefore(state.segments, state.selectedId));
}

function clearRangeSelection(render = true) {
  state.rangeSelection = null;
  rangeDrag.active = false;
  ui.timeline.classList.remove("range-selecting");
  ui["range-action"].classList.add("hidden");
  if (render) renderAll();
}

function updateRangeSelection(clientX, clientY) {
  const rect = ui.timeline.getBoundingClientRect();
  const currentTime = timelineTimeAt(clientX);
  const currentY = Math.min(rect.bottom, Math.max(rect.top, clientY));
  const currentRatio = (currentY - rect.top) / rect.height;
  state.rangeSelection = {
    start: Math.min(rangeDrag.anchorTime, currentTime),
    end: Math.max(rangeDrag.anchorTime, currentTime),
    topRatio: Math.min(rangeDrag.anchorY, currentRatio),
    bottomRatio: Math.max(rangeDrag.anchorY, currentRatio),
  };
  renderTimeline();
  renderControls();
}

function finishRangeSelection(event) {
  if (!rangeDrag.active || event.pointerId !== rangeDrag.pointerId) return;
  if (event.type !== "pointercancel") updateRangeSelection(event.clientX, event.clientY);
  rangeDrag.active = false;
  ui.timeline.classList.remove("range-selecting");
  if (ui.timeline.hasPointerCapture?.(event.pointerId)) ui.timeline.releasePointerCapture(event.pointerId);
  if (selectedRangeCutTimes().length === 0) clearRangeSelection(false);
  renderAll();
  if (rangeDrag.wasPlaying) ui.video.play().catch((error) => showToast(error.message, true));
}

function removeRangeCuts() {
  if (!state.rangeSelection) return;
  const result = SegmentModel.removeCutsInRange(
    state.segments,
    state.rangeSelection.start,
    state.rangeSelection.end,
  );
  const removedCount = result.removedCount || 0;
  state.rangeSelection = null;
  if (commit(result)) showToast(t("toast.cutsCleared", { count: removedCount }));
  else renderAll();
}

function frameAlignedTime(time) {
  const fps = state.metadata?.fps || 30;
  return Math.round(Number(time) * fps) / fps;
}

function moveSelectedCut(time, message = t("toast.cutAdjusted")) {
  const cut = selectedCut();
  if (!cut) return false;
  const result = SegmentModel.moveCutBefore(
    state.segments,
    cut.segment.id,
    frameAlignedTime(time),
  );
  if (!commit({ ...result, selectedId: state.selectedId })) {
    showToast(t("toast.cutCrossing"), true);
    return false;
  }
  ui.video.currentTime = result.time;
  showToast(`${message}：${formatTime(result.time)}`);
  return true;
}

function showCutAdjustTooltip(time) {
  const rect = ui.timeline.getBoundingClientRect();
  const viewWindow = TimelineView.getWindow(
    state.metadata?.duration || 0,
    state.timelineZoom,
    state.timelineViewStart,
  );
  const position = ((time - viewWindow.start) / viewWindow.span) * rect.width;
  const change = time - cutDrag.originalTime;
  const width = 225;
  ui["cut-adjust-tooltip"].style.left = `${Math.max(4, Math.min(rect.width - width - 4, position - width / 2))}px`;
  ui["cut-adjust-tooltip"].textContent = `${formatTime(cutDrag.originalTime)} → ${formatTime(time)} · ${change >= 0 ? "+" : ""}${change.toFixed(3)}s`;
  ui["cut-adjust-tooltip"].classList.remove("hidden");
}

function previewCutDrag(clientX) {
  if (!cutDrag.pending) return;
  if (!cutDrag.active && Math.abs(clientX - cutDrag.startX) < 4) return;
  if (!cutDrag.active) {
    cutDrag.active = true;
    if (cutDrag.wasPlaying) ui.video.pause();
    ui.timeline.classList.add("cut-dragging");
  }
  const targetTime = frameAlignedTime(timelineTimeAt(clientX));
  const result = SegmentModel.moveCutBefore(
    cutDrag.originalSegments,
    cutDrag.segmentId,
    targetTime,
  );
  if (!result.changed) return;
  cutDrag.previewTime = result.time;
  state.segments = result.segments;
  ui.video.currentTime = result.time;
  showCutAdjustTooltip(result.time);
  renderTimeline();
  renderSegmentList();
  renderSelection();
  renderControls();
}

function finishCutDrag(event) {
  if (!cutDrag.pending || event.pointerId !== cutDrag.pointerId) return;
  if (event.type !== "pointercancel") previewCutDrag(event.clientX);
  const wasActive = cutDrag.active;
  const originalSegments = cutDrag.originalSegments;
  const finalTime = cutDrag.previewTime;
  const segmentId = cutDrag.segmentId;
  state.segments = originalSegments;
  cutDrag.pending = false;
  cutDrag.active = false;
  ui.timeline.classList.remove("cut-dragging");
  ui["cut-adjust-tooltip"].classList.add("hidden");
  if (ui.timeline.hasPointerCapture?.(event.pointerId)) ui.timeline.releasePointerCapture(event.pointerId);
  if (wasActive && event.type !== "pointercancel") {
    const result = SegmentModel.moveCutBefore(originalSegments, segmentId, finalTime);
    commit({ ...result, selectedId: state.selectedId });
    ui.video.currentTime = finalTime;
  } else {
    renderAll();
  }
  if (cutDrag.wasPlaying) ui.video.play().catch((error) => showToast(error.message, true));
}

function updatePlayhead(atTime = ui.video.currentTime) {
  const duration = state.metadata?.duration || 0;
  const viewWindow = TimelineView.getWindow(duration, state.timelineZoom, state.timelineViewStart);
  const ratio = viewWindow.span ? (atTime - viewWindow.start) / viewWindow.span : 0;
  ui.playhead.style.opacity = ratio < 0 || ratio > 1 ? "0" : "1";
  ui.playhead.style.left = `${ratio * 100}%`;
  ui["time-display"].textContent = `${formatTime(atTime)} / ${formatTime(duration)}`;
}

function timelineTimeAt(clientX) {
  const rect = ui.timeline.getBoundingClientRect();
  const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  const viewWindow = TimelineView.getWindow(
    state.metadata?.duration || 0,
    state.timelineZoom,
    state.timelineViewStart,
  );
  return viewWindow.start + ratio * viewWindow.span;
}

function ensureTimeVisible(time, center = false) {
  const duration = state.metadata?.duration || 0;
  const viewWindow = TimelineView.getWindow(duration, state.timelineZoom, state.timelineViewStart);
  if (viewWindow.zoom === TimelineView.MIN_ZOOM) return false;
  if (!center && time >= viewWindow.start && time <= viewWindow.end) return false;
  const anchor = center ? 0.5 : (time < viewWindow.start ? 0.08 : 0.92);
  const nextWindow = TimelineView.getWindow(duration, viewWindow.zoom, time - anchor * viewWindow.span);
  state.timelineViewStart = nextWindow.start;
  renderTimeline();
  return true;
}

function resetTimelineZoom() {
  state.timelineZoom = TimelineView.MIN_ZOOM;
  state.timelineViewStart = 0;
  renderTimeline();
  scheduleAutosave(400);
}

function previewScrub(clientX) {
  const rawTime = timelineTimeAt(clientX);
  const viewWindow = TimelineView.getWindow(
    state.metadata?.duration || 0,
    state.timelineZoom,
    state.timelineViewStart,
  );
  const snap = TimelineView.snapTime(
    rawTime,
    state.segments.slice(1).map((segment) => segment.start),
    viewWindow,
    ui.timeline.getBoundingClientRect().width,
  );
  scrub.previewTime = snap.time;
  scrub.snapped = snap.snapped;
  ui.timeline.classList.toggle("snap-active", snap.snapped);
  if (!scrub.animationFrame) {
    scrub.animationFrame = requestAnimationFrame(() => {
      scrub.animationFrame = null;
      updatePlayhead(scrub.previewTime);
    });
  }
  const now = performance.now();
  if (now - scrub.lastMediaSeek >= 100) {
    scrub.lastMediaSeek = now;
    ui.video.currentTime = scrub.previewTime;
  }
}

function finishScrub(event) {
  if (!scrub.active || event.pointerId !== scrub.pointerId) return;
  if (event.type !== "pointercancel") previewScrub(event.clientX);
  scrub.active = false;
  ui.timeline.classList.remove("scrubbing", "snap-active");
  if (scrub.snapped) {
    clearTimeout(snapFeedbackTimer);
    ui.timeline.classList.add("snap-confirmed");
    snapFeedbackTimer = setTimeout(() => ui.timeline.classList.remove("snap-confirmed"), 380);
  }
  if (ui.timeline.hasPointerCapture?.(event.pointerId)) ui.timeline.releasePointerCapture(event.pointerId);
  ui.video.currentTime = scrub.previewTime;
  const segment = SegmentModel.segmentAt(state.segments, scrub.previewTime);
  if (segment) state.selectedId = segment.id;
  renderAll();
  if (scrub.wasPlaying) ui.video.play().catch((error) => showToast(error.message, true));
  scheduleAutosave();
}

function togglePlayback() {
  if (!state.metadata) return;
  if (ui.video.paused) ui.video.play().catch((error) => showToast(error.message, true));
  else ui.video.pause();
}

async function loadVideo(metadata, segments = null, workspace = {}, projectPath = null, labels = null) {
  state.loading = true;
  ui.video.pause();
  state.metadata = metadata;
  state.labels = (Array.isArray(labels) ? labels : storedLabels()).map((label) => ({ ...label }));
  syncLabelIndex();
  persistLabels();
  state.segments = segments?.length ? segments : SegmentModel.createInitial(metadata.duration);
  state.selectedId = state.segments.some((segment) => segment.id === workspace.selectedId)
    ? workspace.selectedId
    : state.segments[0]?.id || null;
  state.undoStack = [];
  state.redoStack = [];
  state.projectPath = projectPath;
  state.dirty = false;
  state.revision = 0;
  state.videoAspect = Number(metadata.displayWidth || metadata.width) / Number(metadata.displayHeight || metadata.height);
  state.pendingCurrentTime = Math.min(metadata.duration, Math.max(0, Number(workspace.currentTime || 0)));
  const savedTimeline = TimelineView.getWindow(metadata.duration, workspace.timelineZoom, workspace.timelineViewStart);
  state.timelineZoom = savedTimeline.zoom;
  state.timelineViewStart = savedTimeline.start;
  state.rangeSelection = null;
  state.selectedCutId = null;
  state.restoreRequested = false;
  const savedRate = Number(workspace.playbackRate || localStorage.getItem("playbackRate") || 1);
  ui.speed.value = String(Math.min(10, Math.max(0.25, savedRate)));
  ui["speed-value"].textContent = `${Number(ui.speed.value).toFixed(2)}×`;
  const savedPauseOnCut = workspace.pauseOnCut;
  ui["pause-on-cut"].checked = savedPauseOnCut === undefined
    ? localStorage.getItem("pauseOnCut") === "true"
    : Boolean(savedPauseOnCut);
  ui.video.src = state.pendingCurrentTime > 0.01
    ? `${metadata.url}#t=${state.pendingCurrentTime.toFixed(3)}`
    : metadata.url;
  ui["file-name"].textContent = metadata.name;
  ui["drop-zone"].classList.remove("empty");
  ui["empty-state"].classList.add("hidden");
  ui.video.playbackRate = Number(ui.speed.value);
  applyVideoDimensions();
  setSaveStatus(t(projectPath && segments?.length ? "save.restored" : "save.unsaved"), projectPath && segments?.length ? "saved" : "");
  renderAll();
}

async function loadVideoResult(result) {
  if (!result) return;
  if (result.metadata) {
    await loadVideo(
      result.metadata,
      result.project?.segments,
      result.project?.workspace || {},
      result.projectPath,
      result.project?.labels,
    );
    if (result.recovered) showToast(t("toast.projectRestored"));
    return;
  }
  await loadVideo(result);
}

async function openVideo() {
  try {
    await loadVideoResult(await window.desktop.openVideo());
  } catch (error) {
    showToast(t("toast.openFailed", { message: error.message }), true);
  }
}

function projectPayload() {
  return {
    schemaVersion: "1.3.0",
    app: "segment-labeler",
    sourcePath: state.metadata.path,
    metadata: state.metadata,
    labels: state.labels,
    segments: state.segments,
    workspace: {
      currentTime: ui.video.currentTime,
      playbackRate: ui.video.playbackRate,
      pauseOnCut: ui["pause-on-cut"].checked,
      selectedId: state.selectedId,
      timelineZoom: state.timelineZoom,
      timelineViewStart: state.timelineViewStart,
    },
    savedAt: new Date().toISOString(),
  };
}

async function saveProject(notify = true) {
  if (!state.metadata) return;
  const savingRevision = state.revision;
  clearTimeout(autosaveTimer);
  setSaveStatus(t("save.saving"), "saving");
  try {
    const savedPath = await window.desktop.saveProject(projectPayload(), state.projectPath);
    if (savedPath) {
      state.projectPath = savedPath;
      if (state.revision === savingRevision) state.dirty = false;
      setSaveStatus(t("save.saved"), "saved");
      if (notify) showToast(t("toast.progressSaved"));
    }
  } catch (error) {
    setSaveStatus(t("save.failed"), "error");
    showToast(t("toast.saveFailed", { message: error.message }), true);
  }
}

function scheduleAutosave(delay = 700) {
  if (!state.metadata || state.loading) return;
  clearTimeout(autosaveTimer);
  state.dirty = true;
  setSaveStatus(t("save.changed"), "saving");
  autosaveTimer = setTimeout(() => saveProject(false), delay);
}

async function openProject() {
  try {
    const result = await window.desktop.openProject();
    if (!result) return;
    await loadVideo(result.metadata, result.project.segments, result.project.workspace || {}, result.projectPath, result.project.labels);
    showToast(t("toast.projectOpened"));
  } catch (error) {
    showToast(t("toast.projectOpenFailed", { message: error.message }), true);
  }
}

function showExportDialog() {
  ui["export-progress"].classList.add("hidden");
  ui["progress-bar"].style.width = "0%";
  ui["confirm-export"].disabled = false;
  ui["cancel-export"].disabled = false;
  ui["export-dialog"].classList.remove("hidden");
}

async function exportDataset() {
  ui["export-progress"].classList.remove("hidden");
  ui["confirm-export"].disabled = true;
  ui["cancel-export"].disabled = true;
  try {
    const result = await window.desktop.exportDataset({
      sourcePath: state.metadata.path,
      metadata: state.metadata,
      labels: state.labels,
      segments: state.segments,
      precise: ui["precise-export"].checked,
    });
    if (!result) {
      ui["export-dialog"].classList.add("hidden");
      return;
    }
    ui["export-dialog"].classList.add("hidden");
    showToast(t("toast.exported", { count: result.count }));
    await window.desktop.showInFolder(result.outputRoot);
  } catch (error) {
    showToast(t("toast.exportFailed", { message: error.message }), true);
    ui["confirm-export"].disabled = false;
    ui["cancel-export"].disabled = false;
  }
}

function nextUnlabeled() {
  const selectedIndex = state.segments.findIndex((segment) => segment.id === state.selectedId);
  const ordered = [...state.segments.slice(selectedIndex + 1), ...state.segments.slice(0, selectedIndex + 1)];
  const next = ordered.find((segment) => !segment.labelId);
  if (next) selectSegment(next.id, true);
  else showToast(t("toast.allLabeled"));
}

function handleKeydown(event) {
  const activeElement = document.activeElement;
  const editingText = activeElement?.tagName === "TEXTAREA"
    || (activeElement?.tagName === "INPUT" && !["range", "checkbox", "radio", "button", "submit"].includes(activeElement.type))
    || activeElement?.isContentEditable;
  const modifier = event.metaKey || event.ctrlKey;
  if (modifier && event.key.toLowerCase() === "s") {
    event.preventDefault();
    saveProject();
    return;
  }
  if (modifier && event.key.toLowerCase() === "z") {
    event.preventDefault();
    if (event.shiftKey) redo(); else undo();
    return;
  }
  if (editingText) return;
  if (event.key === "Escape" && cutDrag.pending) {
    event.preventDefault();
    state.segments = cutDrag.originalSegments;
    cutDrag.pending = false;
    cutDrag.active = false;
    ui.timeline.classList.remove("cut-dragging");
    ui["cut-adjust-tooltip"].classList.add("hidden");
    renderAll();
  } else if (event.key === "Escape" && state.rangeSelection) {
    event.preventDefault();
    clearRangeSelection();
  } else if (event.key === "Escape" && state.selectedCutId) {
    event.preventDefault();
    state.selectedCutId = null;
    renderAll();
  } else if (["Delete", "Backspace"].includes(event.key) && selectedRangeCutTimes().length) {
    event.preventDefault();
    removeRangeCuts();
  } else if (event.code === "Space") {
    event.preventDefault();
    splitAtPlayhead();
  } else if (event.key.toLowerCase() === "k") {
    event.preventDefault();
    togglePlayback();
  } else if (event.key === "ArrowLeft") {
    event.preventDefault();
    const cut = selectedCut();
    if (cut) moveSelectedCut(cut.segment.start - (event.shiftKey ? 1 : 1 / (state.metadata?.fps || 30)));
    else ui.video.currentTime = Math.max(0, ui.video.currentTime - (event.shiftKey ? 1 : 1 / (state.metadata?.fps || 30)));
  } else if (event.key === "ArrowRight") {
    event.preventDefault();
    const cut = selectedCut();
    if (cut) moveSelectedCut(cut.segment.start + (event.shiftKey ? 1 : 1 / (state.metadata?.fps || 30)));
    else ui.video.currentTime = Math.min(state.metadata?.duration || 0, ui.video.currentTime + (event.shiftKey ? 1 : 1 / (state.metadata?.fps || 30)));
  } else if (/^[0-9]$/.test(event.key)) {
    const label = state.labels.find((item) => item.key === event.key);
    if (label) assignSelected(label.id);
  }
}

ui["open-video"].addEventListener("click", openVideo);
ui["open-project"].addEventListener("click", openProject);
ui["save-project"].addEventListener("click", () => saveProject());
ui.undo.addEventListener("click", undo);
ui.redo.addEventListener("click", redo);
ui.export.addEventListener("click", showExportDialog);
ui["play-toggle"].addEventListener("click", togglePlayback);
ui.video.addEventListener("click", togglePlayback);
ui["jump-back"].addEventListener("click", () => { ui.video.currentTime = Math.max(0, ui.video.currentTime - 1); });
ui["jump-forward"].addEventListener("click", () => { ui.video.currentTime = Math.min(state.metadata?.duration || 0, ui.video.currentTime + 1); });
ui.speed.addEventListener("input", () => {
  const rate = Number(ui.speed.value);
  ui.video.playbackRate = rate;
  ui["speed-value"].textContent = `${rate.toFixed(2)}×`;
  localStorage.setItem("playbackRate", String(rate));
});
ui.speed.addEventListener("change", () => scheduleAutosave());
ui["speed-reset"].addEventListener("click", () => {
  ui.speed.value = "1";
  ui.speed.dispatchEvent(new Event("input"));
});
ui.timeline.addEventListener("pointerdown", (event) => {
  if (!state.metadata || event.button !== 0) return;
  event.preventDefault();
  const marker = event.target.closest?.(".cut-marker");
  if (marker) {
    const segmentId = marker.dataset.segmentId;
    if (state.selectedCutId !== segmentId) {
      state.selectedCutId = segmentId;
      renderTimeline();
      renderControls();
      return;
    }
    const cut = selectedCut();
    if (!cut) return;
    cutDrag.pending = true;
    cutDrag.active = false;
    cutDrag.pointerId = event.pointerId;
    cutDrag.segmentId = segmentId;
    cutDrag.startX = event.clientX;
    cutDrag.originalTime = cut.segment.start;
    cutDrag.previewTime = cut.segment.start;
    cutDrag.originalSegments = state.segments.map((segment) => ({ ...segment }));
    cutDrag.wasPlaying = !ui.video.paused;
    ui.timeline.setPointerCapture(event.pointerId);
    return;
  }
  const trackRect = ui["segments-track"].getBoundingClientRect();
  if (event.clientY >= trackRect.top) {
    rangeDrag.active = true;
    rangeDrag.pointerId = event.pointerId;
    rangeDrag.anchorTime = timelineTimeAt(event.clientX);
    const timelineRect = ui.timeline.getBoundingClientRect();
    rangeDrag.anchorY = Math.min(1, Math.max(0, (event.clientY - timelineRect.top) / timelineRect.height));
    rangeDrag.wasPlaying = !ui.video.paused;
    ui["range-action"].classList.add("hidden");
    if (rangeDrag.wasPlaying) ui.video.pause();
    state.rangeSelection = {
      start: rangeDrag.anchorTime,
      end: rangeDrag.anchorTime,
      topRatio: rangeDrag.anchorY,
      bottomRatio: rangeDrag.anchorY,
    };
    ui.timeline.classList.add("range-selecting");
    ui.timeline.setPointerCapture(event.pointerId);
    renderTimeline();
    renderControls();
    return;
  }
  scrub.active = true;
  scrub.pointerId = event.pointerId;
  scrub.wasPlaying = !ui.video.paused;
  scrub.snapped = false;
  scrub.lastMediaSeek = 0;
  if (scrub.wasPlaying) ui.video.pause();
  ui.timeline.classList.add("scrubbing");
  ui.timeline.setPointerCapture(event.pointerId);
  previewScrub(event.clientX);
});
ui.timeline.addEventListener("pointermove", (event) => {
  if (cutDrag.pending && event.pointerId === cutDrag.pointerId) {
    previewCutDrag(event.clientX);
    return;
  }
  if (rangeDrag.active && event.pointerId === rangeDrag.pointerId) {
    updateRangeSelection(event.clientX, event.clientY);
    return;
  }
  if (scrub.active && event.pointerId === scrub.pointerId) previewScrub(event.clientX);
});
ui.timeline.addEventListener("pointerup", (event) => {
  if (cutDrag.pending) finishCutDrag(event);
  else if (rangeDrag.active) finishRangeSelection(event);
  else finishScrub(event);
});
ui.timeline.addEventListener("pointercancel", (event) => {
  if (cutDrag.pending) finishCutDrag(event);
  else if (rangeDrag.active) finishRangeSelection(event);
  else finishScrub(event);
});
ui.timeline.addEventListener("wheel", (event) => {
  if (!(event.metaKey || event.ctrlKey) || !state.metadata) return;
  event.preventDefault();
  const rect = ui.timeline.getBoundingClientRect();
  const anchorRatio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
  const nextWindow = TimelineView.zoomAt(
    state.metadata.duration,
    state.timelineZoom,
    state.timelineViewStart,
    anchorRatio,
    event.deltaY,
  );
  state.timelineZoom = nextWindow.zoom;
  state.timelineViewStart = nextWindow.start;
  renderTimeline();
  scheduleAutosave(400);
}, { passive: false });
ui["timeline-zoom-reset"].addEventListener("click", resetTimelineZoom);
ui["clear-range-cuts"].addEventListener("click", removeRangeCuts);
ui["range-action"].addEventListener("pointerdown", (event) => event.stopPropagation());
ui["move-cut-to-playhead"].addEventListener("click", () => moveSelectedCut(ui.video.currentTime, t("toast.cutMoved")));
ui["language-select"].addEventListener("change", () => setLocale(ui["language-select"].value));
ui["positive-label-form"].addEventListener("submit", (event) => {
  event.preventDefault();
  addLabel("positive");
});
ui["negative-label-form"].addEventListener("submit", (event) => {
  event.preventDefault();
  addLabel("negative");
});
ui["remove-cut"].addEventListener("click", removeSelectedLeftCut);
ui["unlabeled-next"].addEventListener("click", nextUnlabeled);
ui["segment-note"].addEventListener("input", () => {
  clearTimeout(noteTimer);
  noteTimer = setTimeout(() => {
    state.undoStack.push(snapshot());
    state.segments = SegmentModel.updateNote(state.segments, state.selectedId, ui["segment-note"].value);
    state.redoStack = [];
    state.dirty = true;
    state.revision += 1;
    renderControls();
    scheduleAutosave();
  }, 300);
});
ui["pause-on-cut"].addEventListener("change", () => {
  localStorage.setItem("pauseOnCut", String(ui["pause-on-cut"].checked));
  scheduleAutosave();
});
ui["cancel-export"].addEventListener("click", () => ui["export-dialog"].classList.add("hidden"));
ui["confirm-export"].addEventListener("click", exportDataset);
ui.video.addEventListener("loadedmetadata", () => {
  applyVideoDimensions();
  ui.video.playbackRate = Number(ui.speed.value);
  updatePlayhead();
  if (state.loading && !state.restoreRequested) {
    state.restoreRequested = true;
    if (state.pendingCurrentTime > 0.01) {
      ui.video.currentTime = state.pendingCurrentTime;
    } else {
      state.loading = false;
    }
  }
});
ui.video.addEventListener("loadeddata", () => {
  if (!state.loading) return;
  if (state.pendingCurrentTime > 0.01 && Math.abs(ui.video.currentTime - state.pendingCurrentTime) > 0.2) {
    state.restoreRequested = true;
    ui.video.currentTime = state.pendingCurrentTime;
  } else {
    state.loading = false;
    updatePlayhead();
  }
});
ui.video.addEventListener("timeupdate", () => {
  if (scrub.active) return;
  ensureTimeVisible(ui.video.currentTime);
  updatePlayhead();
  if (Date.now() - lastPlaybackSave > 5000) {
    lastPlaybackSave = Date.now();
    scheduleAutosave(500);
  }
});
ui.video.addEventListener("seeked", () => {
  if (scrub.active) return;
  ensureTimeVisible(ui.video.currentTime);
  updatePlayhead();
  if (state.loading && state.restoreRequested) {
    state.loading = false;
    return;
  }
  scheduleAutosave();
});
ui.video.addEventListener("play", () => { ui["play-toggle"].textContent = "❚❚"; });
ui.video.addEventListener("pause", () => {
  ui["play-toggle"].textContent = "▶";
  scheduleAutosave();
});
ui.video.addEventListener("error", () => {
  state.loading = false;
  const mediaError = ui.video.error;
  const reason = mediaError ? t("toast.mediaError", { code: mediaError.code }) : t("toast.unknownMediaError");
  showToast(t("toast.videoPlaybackFailed", { reason }), true);
});
document.addEventListener("keydown", handleKeydown);

function isFileDrag(event) {
  return Array.from(event.dataTransfer?.types || []).includes("Files");
}

document.addEventListener("dragenter", (event) => {
  if (!isFileDrag(event)) return;
  event.preventDefault();
  dragDepth += 1;
  ui["drop-overlay"].classList.remove("hidden");
});
document.addEventListener("dragover", (event) => {
  if (!isFileDrag(event)) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = "copy";
});
document.addEventListener("dragleave", (event) => {
  if (!isFileDrag(event)) return;
  dragDepth = Math.max(0, dragDepth - 1);
  if (dragDepth === 0) ui["drop-overlay"].classList.add("hidden");
});
document.addEventListener("drop", async (event) => {
  event.preventDefault();
  dragDepth = 0;
  ui["drop-overlay"].classList.add("hidden");
  const file = event.dataTransfer?.files?.[0];
  if (!file) return;
  try {
    const filePath = window.desktop.getDroppedFilePath(file);
    await loadVideoResult(await window.desktop.openVideoPath(filePath));
  } catch (error) {
    showToast(t("toast.dropFailed", { message: error.message }), true);
  }
});

new ResizeObserver(fitVideoFrame).observe(ui["drop-zone"]);

window.desktop.onExportProgress(({ current, total, file }) => {
  ui["progress-bar"].style.width = `${(current / total) * 100}%`;
  ui["progress-text"].textContent = `${current} / ${total} · ${file}`;
});
window.desktop.onStartupVideo((result) => {
  loadVideoResult(result).catch((error) => showToast(t("toast.startupFailed", { message: error.message }), true));
});

document.body.classList.add(`platform-${window.desktop.platform}`);
setLocale(i18n.locale, false);
