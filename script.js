/* =========================================
   Arcade Layout – Full Script (Popup Edition)
   ========================================= */

const room = document.getElementById("room");
const updateRoomBtn = document.getElementById("updateRoom");
const addCabinetBtn = document.getElementById("addCabinet");
const titleInput = document.getElementById("titleInput");
const mainTitle = document.getElementById("mainTitle");

let gridSize = 1;
let pixelsPerMeter = 100;
let selectedCabinet = null;
let cabinets = [];

/* ===== THEME DEFAULTS (no startup flash) ===== */
const SIMPLE_MODE_KEY = "ui.simpleMode";
const DARK_MODE_KEY   = "ui.darkMode";

let simpleMode = JSON.parse(localStorage.getItem(SIMPLE_MODE_KEY) ?? "true");
let darkMode   = JSON.parse(localStorage.getItem(DARK_MODE_KEY)   ?? "true");

function applyModes() {
  document.body.classList.toggle("simple-mode", simpleMode);
  document.body.classList.toggle("dark-mode",   darkMode);
  document.body.classList.toggle("light-mode",  !darkMode);

  const smb = document.getElementById("simpleModeBtn");
  if (smb) smb.textContent = simpleMode ? "Arcade Mode" : "Simple Mode";

  const tmb = document.getElementById("themeModeBtn");
  if (tmb) tmb.textContent = darkMode ? "Light Mode" : "Dark Mode";
}

document.addEventListener("DOMContentLoaded", () => {
  // Apply stored preferences (if any)
  applyModes();

  // Remove transition block shortly after initial paint
  setTimeout(() => {
    document.body.classList.remove("disable-transitions");
  }, 150);
});

// Apply as soon as DOM is safe
document.addEventListener("DOMContentLoaded", applyModes);

/* Global snapping state */
let snapEnabled = true;

/* DOM for bottom cabinet bar */
const bar = document.getElementById("cabinetDetailsBar");
const barName = document.getElementById("barName");
const barWidth = document.getElementById("barWidth");
const barHeight = document.getElementById("barHeight");
const barRotation = document.getElementById("barRotation");
const barColor = document.getElementById("barColor");
const barSnapToggle = document.getElementById("barSnapToggle");
const barLockToggle = document.getElementById("barLockToggle");
const barDeselect = document.getElementById("barDeselect");
const barDuplicate = document.getElementById("barDuplicate");
const barDelete = document.getElementById("barDelete");

/* Toggle buttons in the hidden (CSS-hidden) left UI – kept for logic reuse */
const snapBtn = document.getElementById("snapToggleBtn");
const lockBtn = document.getElementById("lockToggleBtn");

/* Cabinet import/export controls */
const exportCabinetBtn = document.getElementById("exportCabinetBtn");
const importCabinetBtn = document.getElementById("importCabinetBtn");
const importCabinetFile = document.getElementById("importCabinetFile");

/* PNG export */
const exportPngBtn = document.getElementById("exportPngBtn");

/* Theme + mode buttons */
const simpleModeBtn = document.getElementById("simpleModeBtn");
const themeModeBtn = document.getElementById("themeModeBtn");

/* Reset Room */
const resetBtn = document.getElementById("resetRoomBtn");

/* Saved Rooms */
const saveRoomBtn = document.getElementById("saveRoomBtn");
const savedRoomsList = document.getElementById("savedRoomsList");

/* Saved Cabinets */
const saveCabinetBtn = document.getElementById("saveCabinetBtn");
const savedCabinetsList = document.getElementById("savedCabinetsList");

/* ===== INIT ===== */
updateRoom();
syncSnapButtonUI();
loadSavedRoomsList();
loadSavedCabinetsList();

/* Title binding */
titleInput.addEventListener("input", () => (mainTitle.textContent = titleInput.value));

/* Simple (UI) mode toggle — persisted */
simpleModeBtn.addEventListener("click", () => {
  simpleMode = !simpleMode;
  localStorage.setItem(SIMPLE_MODE_KEY, JSON.stringify(simpleMode));
  applyModes();
});

/* Theme toggle (dark/light) — persisted */
themeModeBtn.addEventListener("click", () => {
  darkMode = !darkMode;
  localStorage.setItem(DARK_MODE_KEY, JSON.stringify(darkMode));
  applyModes();
});

/* Add cabinet + update room */
updateRoomBtn.addEventListener("click", updateRoom);
addCabinetBtn.addEventListener("click", addCabinet);

/* ---------- UI Helpers ---------- */
function syncSnapButtonUI() {
  if (snapBtn) {
    snapBtn.classList.toggle("off", !snapEnabled);
    snapBtn.textContent = `Snapping: ${snapEnabled ? "ON" : "OFF"}`;
  }
  if (barSnapToggle) {
    barSnapToggle.classList.toggle("off", !snapEnabled);
    barSnapToggle.textContent = `Snapping: ${snapEnabled ? "ON" : "OFF"}`;
  }
}

function syncLockButtonUI() {
  const isLocked = selectedCabinet && selectedCabinet.dataset.locked === "true";
  if (lockBtn) {
    lockBtn.classList.toggle("on", !!isLocked);
    lockBtn.textContent = isLocked ? "Locked" : "Unlocked";
  }
  if (barLockToggle) {
    barLockToggle.classList.toggle("on", !!isLocked);
    barLockToggle.textContent = isLocked ? "Locked" : "Unlocked";
  }
}

/* ---------- Toggle handlers (global and bar) ---------- */
if (snapBtn) {
  snapBtn.addEventListener("click", () => {
    snapEnabled = !snapEnabled;
    syncSnapButtonUI();
  });
}
if (lockBtn) {
  lockBtn.addEventListener("click", () => {
    if (!selectedCabinet) return;
    const nextLocked = !(selectedCabinet.dataset.locked === "true");
    selectedCabinet.dataset.locked = nextLocked ? "true" : "false";
    selectedCabinet.classList.toggle("locked", nextLocked);
    syncLockButtonUI();
  });
}
if (barSnapToggle) {
  barSnapToggle.addEventListener("click", () => {
    snapEnabled = !snapEnabled;
    syncSnapButtonUI();
    updateCabinetDetailsBar();
  });
}
if (barLockToggle) {
  barLockToggle.addEventListener("click", () => {
    if (!selectedCabinet) return;
    const locked = selectedCabinet.dataset.locked === "true";
    selectedCabinet.dataset.locked = locked ? "false" : "true";
    selectedCabinet.classList.toggle("locked", !locked);
    syncLockButtonUI();
    updateCabinetDetailsBar();
  });
}
if (barDeselect) {
  barDeselect.addEventListener("click", () => {
    if (selectedCabinet) selectedCabinet.classList.remove("selected");
    selectedCabinet = null;
    updateCabinetDetailsBar();
  });
}
if (barDuplicate) {
  barDuplicate.addEventListener("click", () => {
    const btn = document.getElementById("duplicateCabinet");
    if (btn) btn.click();
    updateCabinetDetailsBar();
  });
}
if (barDelete) {
  barDelete.addEventListener("click", async () => {
    if (!selectedCabinet) return;
    const ok = await showPopup("Delete selected cabinet?", "Delete", "Cancel");
    if (!ok) return;
    cabinets = cabinets.filter(c => c !== selectedCabinet);
    selectedCabinet.remove();
    selectedCabinet = null;
    updateCabinetDetailsBar();
  });
}

/* ---------- Geometry helpers ---------- */
function snapTopLeft(x, y) {
  const gridPx = gridSize * pixelsPerMeter;
  const nx = Math.round(x / gridPx) * gridPx;
  const ny = Math.round(y / gridPx) * gridPx;
  return { x: nx, y: ny };
}

function getRotationRad(el) {
  return ((parseFloat(el.dataset.rotation) || 0) * Math.PI) / 180;
}

function getOrientedRect(el, x, y) {
  const w = (parseFloat(el.dataset.width) || el.offsetWidth / pixelsPerMeter) * pixelsPerMeter;
  const h = (parseFloat(el.dataset.height) || el.offsetHeight / pixelsPerMeter) * pixelsPerMeter;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const a = getRotationRad(el);
  const cos = Math.cos(a);
  const sin = Math.sin(a);

  const halfW = w / 2, halfH = h / 2;
  const pts = [
    { x: -halfW, y: -halfH },
    { x:  halfW, y: -halfH },
    { x:  halfW, y:  halfH },
    { x: -halfW, y:  halfH }
  ];

  return pts.map(p => ({
    x: cx + p.x * cos - p.y * sin,
    y: cy + p.x * sin + p.y * cos
  }));
}

function projectPolygon(axis, poly) {
  let min = Infinity, max = -Infinity;
  for (const p of poly) {
    const val = p.x * axis.x + p.y * axis.y;
    if (val < min) min = val;
    if (val > max) max = val;
  }
  return [min, max];
}

function polysOverlapSAT(polyA, polyB) {
  const axes = [];
  function addAxes(poly) {
    for (let i = 0; i < poly.length; i++) {
      const p1 = poly[i];
      const p2 = poly[(i + 1) % poly.length];
      const edge = { x: p2.x - p1.x, y: p2.y - p1.y };
      const axis = { x: -edge.y, y: edge.x };
      const len = Math.hypot(axis.x, axis.y) || 1;
      axes.push({ x: axis.x / len, y: axis.y / len });
    }
  }
  addAxes(polyA); addAxes(polyB);
  for (const axis of axes) {
    const [minA, maxA] = projectPolygon(axis, polyA);
    const [minB, maxB] = projectPolygon(axis, polyB);
    if (maxA <= minB || maxB <= minA) return false;
  }
  return true;
}

function collidesAt(x, y, el) {
  const polyA = getOrientedRect(el, x, y);
  for (const other of cabinets) {
    if (other === el) continue;
    const ox = parseFloat(other.style.left) || 0;
    const oy = parseFloat(other.style.top) || 0;
    const polyB = getOrientedRect(other, ox, oy);
    if (polysOverlapSAT(polyA, polyB)) return true;
  }
  return false;
}

function getPolygonBounds(poly) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of poly) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

function clampToRoomRotated(el, x, y) {
  const poly = getOrientedRect(el, x, y);
  const b = getPolygonBounds(poly);
  let dx = 0, dy = 0;

  if (b.minX < 0) dx = -b.minX;
  if (b.maxX > room.clientWidth) dx = Math.min(dx, room.clientWidth - b.maxX);
  if (b.minY < 0) dy = -b.minY;
  if (b.maxY > room.clientHeight) dy = Math.min(dy, room.clientHeight - b.maxY);

  return { x: x + dx, y: y + dy };
}

/* ---------- Room ---------- */
function updateRoom() {
  const width = parseFloat(document.getElementById("roomWidth").value);
  const height = parseFloat(document.getElementById("roomHeight").value);
  gridSize = parseFloat(document.getElementById("gridSize").value);

  const roomWidthPx = width * pixelsPerMeter;
  const roomHeightPx = height * pixelsPerMeter;
  const padding = 20;

  room.style.width = roomWidthPx + "px";
  room.style.height = roomHeightPx + "px";

  const containerRect = document.getElementById("roomContainer").getBoundingClientRect();
  room.style.position = "absolute";
  room.style.left = Math.max((containerRect.width - roomWidthPx) / 2, 0) + padding + "px";
  room.style.top = Math.max((containerRect.height - roomHeightPx) / 2, 0) + padding + "px";

  drawGrid(width, height);
}

function drawGrid(width, height) {
  room.innerHTML = "";
  const gridPx = gridSize * pixelsPerMeter;

  for (let x = 0; x <= width * pixelsPerMeter; x += gridPx) {
    const line = document.createElement("div");
    line.classList.add("grid-line");
    line.style.left = x + "px";
    line.style.top = 0;
    line.style.width = "1px";
    line.style.height = height * pixelsPerMeter + "px";
    room.appendChild(line);
  }
  for (let y = 0; y <= height * pixelsPerMeter; y += gridPx) {
    const line = document.createElement("div");
    line.classList.add("grid-line");
    line.style.top = y + "px";
    line.style.left = 0;
    line.style.height = "1px";
    line.style.width = width * pixelsPerMeter + "px";
    room.appendChild(line);
  }

  cabinets.forEach(cab => room.appendChild(cab));
}

/* ---------- Cabinets ---------- */
function addCabinet() {
  const name = document.getElementById("cabinetName").value;
  const width = parseFloat(document.getElementById("cabinetWidth").value);
  const height = parseFloat(document.getElementById("cabinetHeight").value);
  const color = document.getElementById("cabinetColor").value;

  const cabinet = document.createElement("div");
  cabinet.classList.add("cabinet");
  cabinet.style.width = width * pixelsPerMeter + "px";
  cabinet.style.height = height * pixelsPerMeter + "px";
  cabinet.style.background = color;
  cabinet.style.left = "0px";
  cabinet.style.top = "0px";
  cabinet.style.transformOrigin = "center center";

  const nameEl = document.createElement("div");
  nameEl.classList.add("cabinet-name");
  nameEl.textContent = name;
  cabinet.appendChild(nameEl);

  cabinet.dataset.name = name;
  cabinet.dataset.width = width;
  cabinet.dataset.height = height;
  cabinet.dataset.color = color;
  cabinet.dataset.rotation = 0;
  cabinet.dataset.locked = "false";

  room.appendChild(cabinet);
  cabinets.push(cabinet);

  enableDragging(cabinet);
  cabinet.addEventListener("click", (e) => selectCabinet(e, cabinet));
  updateCabinetDetailsBar();
}

function enableDragging(el) {
  let isDragging = false;
  let offsetX = 0;
  let offsetY = 0;

  let lastValidX = parseFloat(el.style.left) || 0;
  let lastValidY = parseFloat(el.style.top) || 0;

  el.addEventListener("mousedown", e => {
    if (selectedCabinet) selectedCabinet.classList.remove("selected");
    selectedCabinet = el;
    el.classList.add("selected");
    updateSelectedUIFromCabinet(el);
    updateCabinetDetailsBar();

    lastValidX = parseFloat(el.style.left) || 0;
    lastValidY = parseFloat(el.style.top) || 0;

    if (el.dataset.locked === "true") {
      isDragging = false;
      return;
    }

    isDragging = true;
    offsetX = e.offsetX;
    offsetY = e.offsetY;
  });

document.addEventListener("mousemove", e => {
  if (!isDragging) return;

  const rect = room.getBoundingClientRect();

  // Adjust mouse coordinates for zoom level
  const adjustedX = (e.clientX - rect.left - offsetX) / roomZoom;
  const adjustedY = (e.clientY - rect.top - offsetY) / roomZoom;

  let newX = adjustedX;
  let newY = adjustedY;


    let snappedToCabinet = false;

    if (snapEnabled) {
      const threshold = 10;
      cabinets.forEach(cabinet => {
        if (cabinet === el) return;

        const cabSides = {
          left: cabinet.offsetLeft,
          right: cabinet.offsetLeft + cabinet.offsetWidth,
          top: cabinet.offsetTop,
          bottom: cabinet.offsetTop + cabinet.offsetHeight
        };

        const elSides = {
          left: newX,
          right: newX + el.offsetWidth,
          top: newY,
          bottom: newY + el.offsetHeight
        };

        if (Math.abs(elSides.left - cabSides.right) < threshold) { newX = cabSides.right; snappedToCabinet = true; }
        if (Math.abs(elSides.right - cabSides.left) < threshold) { newX = cabSides.left - el.offsetWidth; snappedToCabinet = true; }
        if (Math.abs(elSides.top - cabSides.bottom) < threshold) { newY = cabSides.bottom; snappedToCabinet = true; }
        if (Math.abs(elSides.bottom - cabSides.top) < threshold) { newY = cabSides.top - el.offsetHeight; snappedToCabinet = true; }
      });

      if (!snappedToCabinet) {
        const g = snapTopLeft(newX, newY);
        newX = g.x;
        newY = g.y;
      }
    }

    ({ x: newX, y: newY } = clampToRoomRotated(el, newX, newY));

    if (!collidesAt(newX, newY, el)) {
      el.style.left = newX + "px";
      el.style.top = newY + "px";
      lastValidX = newX;
      lastValidY = newY;
    } else {
      let tryX = clampToRoomRotated(el, newX, lastValidY);
      let tryY = clampToRoomRotated(el, lastValidX, newY);

      if (!collidesAt(tryX.x, tryX.y, el)) {
        el.style.left = tryX.x + "px";
        el.style.top = tryX.y + "px";
        lastValidX = tryX.x;
        lastValidY = tryX.y;
      } else if (!collidesAt(tryY.x, tryY.y, el)) {
        el.style.left = tryY.x + "px";
        el.style.top = tryY.y + "px";
        lastValidX = tryY.x;
        lastValidY = tryY.y;
      }
    }
  });

  document.addEventListener("mouseup", () => (isDragging = false));
}

function selectCabinet(e, cab) {
  e.stopPropagation();
  if (selectedCabinet) selectedCabinet.classList.remove("selected");
  selectedCabinet = cab;
  selectedCabinet.classList.add("selected");
  updateSelectedUIFromCabinet(cab);
  updateCabinetDetailsBar();
}

function updateSelectedUIFromCabinet(cab) {
  const panel = document.getElementById("selectedCabinetUI");
  if (panel) panel.style.display = "block";
  const n = document.getElementById("selectedName");
  const w = document.getElementById("selectedWidth");
  const h = document.getElementById("selectedHeight");
  const c = document.getElementById("selectedColor");
  const r = document.getElementById("selectedRotation");
  if (n) n.value = cab.dataset.name;
  if (w) w.value = cab.dataset.width;
  if (h) h.value = cab.dataset.height;
  if (c) c.value = cab.dataset.color;
  if (r) r.value = cab.dataset.rotation || 0;

  cab.classList.toggle("locked", cab.dataset.locked === "true");
  syncLockButtonUI();
  syncSnapButtonUI();
}

/* Reflect property edits live from the hidden panel (kept for logic reuse) */
["selectedName", "selectedWidth", "selectedHeight", "selectedColor", "selectedRotation"].forEach(id => {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener("input", () => {
    if (!selectedCabinet) return;

    if (id === "selectedName") {
      selectedCabinet.dataset.name = el.value;
      const nameEl = selectedCabinet.querySelector(".cabinet-name");
      if (nameEl) nameEl.textContent = el.value;
      return;
    }
    if (id === "selectedWidth") {
      const w = parseFloat(el.value) || 0;
      selectedCabinet.dataset.width = w;
      selectedCabinet.style.width = (w * pixelsPerMeter) + "px";
      return;
    }
    if (id === "selectedHeight") {
      const h = parseFloat(el.value) || 0;
      selectedCabinet.dataset.height = h;
      selectedCabinet.style.height = (h * pixelsPerMeter) + "px";
      return;
    }
    if (id === "selectedColor") {
      selectedCabinet.dataset.color = el.value;
      selectedCabinet.style.background = el.value;
      return;
    }
    if (id === "selectedRotation") {
      const r = parseFloat(el.value) || 0;
      selectedCabinet.dataset.rotation = r;
      selectedCabinet.style.transform = "rotate(" + r + "deg)";
      const nameEl = selectedCabinet.querySelector(".cabinet-name");
      if (nameEl) nameEl.style.transform = "rotate(" + (-r) + "deg)";
      let x = parseFloat(selectedCabinet.style.left) || 0;
      let y = parseFloat(selectedCabinet.style.top) || 0;
      if (snapEnabled) {
        const g = snapTopLeft(x, y);
        x = g.x; y = g.y;
      }
      ({ x, y } = clampToRoomRotated(selectedCabinet, x, y));
      if (!collidesAt(x, y, selectedCabinet)) {
        selectedCabinet.style.left = x + "px";
        selectedCabinet.style.top = y + "px";
      }
      return;
    }
  });
});

/* Delete via hidden button (used by barDelete too) */
const hiddenDeleteBtn = document.getElementById("deleteCabinet");
if (hiddenDeleteBtn) {
  hiddenDeleteBtn.addEventListener("click", async () => {
    if (!selectedCabinet) return;
    const ok = await showPopup("Delete selected cabinet?", "Delete", "Cancel");
    if (!ok) return;
    cabinets = cabinets.filter(c => c !== selectedCabinet);
    selectedCabinet.remove();
    selectedCabinet = null;
    const panel = document.getElementById("selectedCabinetUI");
    if (panel) panel.style.display = "none";
    updateCabinetDetailsBar();
  });
}

/* Deselect via hidden button */
const hiddenDeselectBtn = document.getElementById("deselectCabinet");
if (hiddenDeselectBtn) {
  hiddenDeselectBtn.addEventListener("click", () => {
    if (selectedCabinet) selectedCabinet.classList.remove("selected");
    selectedCabinet = null;
    const panel = document.getElementById("selectedCabinetUI");
    if (panel) panel.style.display = "none";
    updateCabinetDetailsBar();
  });
}

/* Duplicate via hidden button */
const hiddenDuplicateBtn = document.getElementById("duplicateCabinet");
if (hiddenDuplicateBtn) {
  hiddenDuplicateBtn.addEventListener("click", () => {
    if (!selectedCabinet) return;

    const copy = document.createElement("div");
    copy.classList.add("cabinet");
    copy.style.width = selectedCabinet.style.width;
    copy.style.height = selectedCabinet.style.height;
    copy.style.background = selectedCabinet.dataset.color;
    copy.style.transformOrigin = "center center";
    const rot = parseFloat(selectedCabinet.dataset.rotation) || 0;
    copy.style.transform = "rotate(" + rot + "deg)";

    let newX = (parseFloat(selectedCabinet.style.left) || 0) + 10;
    let newY = (parseFloat(selectedCabinet.style.top) || 0) + 10;

    if (snapEnabled) {
      const g = snapTopLeft(newX, newY);
      newX = g.x; newY = g.y;
    }

    copy.dataset.name = selectedCabinet.dataset.name;
    copy.dataset.width = selectedCabinet.dataset.width;
    copy.dataset.height = selectedCabinet.dataset.height;
    copy.dataset.color = selectedCabinet.dataset.color;
    copy.dataset.rotation = rot;
    copy.dataset.locked = selectedCabinet.dataset.locked || "false";
    copy.classList.toggle("locked", copy.dataset.locked === "true");

    ({ x: newX, y: newY } = clampToRoomRotated(copy, newX, newY));
    copy.style.left = newX + "px";
    copy.style.top = newY + "px";

    const nameEl = document.createElement("div");
    nameEl.classList.add("cabinet-name");
    nameEl.textContent = selectedCabinet.dataset.name;
    nameEl.style.transform = "rotate(" + (-rot) + "deg)";
    copy.appendChild(nameEl);

    room.appendChild(copy);
    cabinets.push(copy);

    enableDragging(copy);
    copy.addEventListener("click", (e) => selectCabinet(e, copy));

    if (selectedCabinet) selectedCabinet.classList.remove("selected");
    selectedCabinet = copy;
    copy.classList.add("selected");
    updateSelectedUIFromCabinet(copy);
    updateCabinetDetailsBar();
  });
}

/* ---------- ROOM EXPORT LAYOUT ---------- */
document.getElementById("exportLayout").addEventListener("click", async () => {
  const roomWidth = parseFloat(document.getElementById("roomWidth").value);
  const roomHeight = parseFloat(document.getElementById("roomHeight").value);
  const gridSizeVal = parseFloat(document.getElementById("gridSize").value);

  const titleVal = (document.getElementById("titleInput").value || "Arcade Layout").trim();
  const safeTitle = titleVal.replace(/[\\\/:*?"<>|]+/g, "").replace(/\s+/g, " ").substring(0, 120);
  const filename = (safeTitle.length ? safeTitle : "Arcade Layout") + "_Layout.json";

  const layout = {
    title: titleVal,
    room: { width: roomWidth, height: roomHeight, gridSize: gridSizeVal },
    cabinets: cabinets.map(cab => ({
      name: cab.dataset.name,
      width: parseFloat(cab.dataset.width),
      height: parseFloat(cab.dataset.height),
      color: cab.dataset.color,
      x: parseFloat(cab.style.left),
      y: parseFloat(cab.style.top),
      rotation: parseFloat(cab.dataset.rotation) || 0,
      locked: cab.dataset.locked === "true"
    }))
  };

  const blob = new Blob([JSON.stringify(layout, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);

  //New popup message
  await showPopup(`Room "${safeTitle}" exported successfully!`, "OK", "");
});


/* ---------- ROOM IMPORT LAYOUT ---------- */
const importBtn = document.getElementById("importLayoutBtn");
const importInput = document.getElementById("importFile");

importBtn.addEventListener("click", () => {
  importInput.value = "";
  importInput.click();
});

importInput.addEventListener("change", event => {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async e => {
    try {
      const data = JSON.parse(e.target.result);

      const importedTitle = (data && (data.title || (data.meta && data.meta.title))) || null;
      if (importedTitle && typeof importedTitle === "string") {
        titleInput.value = importedTitle;
        mainTitle.textContent = importedTitle;
      }

      document.getElementById("roomWidth").value = data.room.width;
      document.getElementById("roomHeight").value = data.room.height;
      document.getElementById("gridSize").value = data.room.gridSize;
      updateRoom();

      cabinets.forEach(c => c.remove());
      cabinets = [];

      (data.cabinets || []).forEach(cab => {
        const cabinet = document.createElement("div");
        cabinet.classList.add("cabinet");
        cabinet.style.width = (cab.width * pixelsPerMeter) + "px";
        cabinet.style.height = (cab.height * pixelsPerMeter) + "px";
        cabinet.style.background = cab.color;
        cabinet.style.left = cab.x + "px";
        cabinet.style.top = cab.y + "px";
        cabinet.style.transformOrigin = "center center";
        const r = parseFloat(cab.rotation) || 0;
        cabinet.style.transform = "rotate(" + r + "deg)";

        const nameEl = document.createElement("div");
        nameEl.classList.add("cabinet-name");
        nameEl.textContent = cab.name;
        nameEl.style.transform = "rotate(" + (-r) + "deg)";
        cabinet.appendChild(nameEl);

        cabinet.dataset.name = cab.name;
        cabinet.dataset.width = cab.width;
        cabinet.dataset.height = cab.height;
        cabinet.dataset.color = cab.color;
        cabinet.dataset.rotation = r;
        cabinet.dataset.locked = cab.locked ? "true" : "false";
        cabinet.classList.toggle("locked", !!cab.locked);

        room.appendChild(cabinet);
        cabinets.push(cabinet);
        enableDragging(cabinet);
        cabinet.addEventListener("click", e => selectCabinet(e, cabinet));
      });

      syncSnapButtonUI();
      syncLockButtonUI();

      await showPopup("Layout imported successfully!", "OK", "");
    } catch (err) {
      console.error(err);
      await showPopup("Invalid JSON layout file!", "OK", "");
    }
  };

  reader.readAsText(file);
});

/* ---------- CABINET EXPORT ---------- */
if (exportCabinetBtn) {
  exportCabinetBtn.addEventListener("click", async () => {
    if (!selectedCabinet) {
      await showPopup("Select a cabinet first to export.", "OK", "");
      return;
    }
    const name = selectedCabinet.dataset.name || "Cabinet";
    const width = parseFloat(selectedCabinet.dataset.width) || 0;
    const height = parseFloat(selectedCabinet.dataset.height) || 0;
    const color = selectedCabinet.dataset.color || "#ffffff";

    const payload = { name, width, height, color };
    const safeName = name.replace(/[\\\/:*?"<>|]+/g, "").replace(/\s+/g, " ").trim().substring(0, 120) || "Cabinet";
    const filename = `${safeName}_Cabinet.json`;

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);

    await showPopup(`Cabinet "${safeName}" exported.`, "OK", "");
  });
}

/* ---------- CABINET IMPORT ---------- */
if (importCabinetBtn && importCabinetFile) {
  importCabinetBtn.addEventListener("click", () => {
    importCabinetFile.value = "";
    importCabinetFile.click();
  });

  importCabinetFile.addEventListener("change", (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async e => {
      try {
        const data = JSON.parse(e.target.result);
        const name = (data && data.name) ? String(data.name) : "Cabinet";
        const widthM = parseFloat(data.width);
        const heightM = parseFloat(data.height);
        const color = data.color || "#ff00ff";

        if (!widthM || !heightM) throw new Error("Missing cabinet dimensions.");

        const newCab = document.createElement("div");
        newCab.classList.add("cabinet");
        newCab.style.width = (widthM * pixelsPerMeter) + "px";
        newCab.style.height = (heightM * pixelsPerMeter) + "px";
        newCab.style.background = color;
        newCab.style.transformOrigin = "center center";
        newCab.style.transform = "rotate(0deg)";

        newCab.dataset.name = name;
        newCab.dataset.width = widthM;
        newCab.dataset.height = heightM;
        newCab.dataset.color = color;
        newCab.dataset.rotation = 0;
        newCab.dataset.locked = "false";
        newCab.classList.toggle("locked", false);

        const gridPx = gridSize * pixelsPerMeter;
        let placed = false;
        for (let y = 0; y <= room.clientHeight - newCab.offsetHeight + 1 && !placed; y += gridPx) {
          for (let x = 0; x <= room.clientWidth - newCab.offsetWidth + 1 && !placed; x += gridPx) {
            const clamped = clampToRoomRotated(newCab, x, y);
            if (!collidesAt(clamped.x, clamped.y, newCab)) {
              newCab.style.left = clamped.x + "px";
              newCab.style.top = clamped.y + "px";
              placed = true;
            }
          }
        }
        if (!placed) {
          const clamped = clampToRoomRotated(newCab, 0, 0);
          newCab.style.left = clamped.x + "px";
          newCab.style.top = clamped.y + "px";
        }

        const nameEl = document.createElement("div");
        nameEl.classList.add("cabinet-name");
        nameEl.textContent = name;
        nameEl.style.transform = "rotate(0deg)";
        newCab.appendChild(nameEl);

        room.appendChild(newCab);
        cabinets.push(newCab);

        enableDragging(newCab);
        newCab.addEventListener("click", (e) => selectCabinet(e, newCab));

        if (selectedCabinet) selectedCabinet.classList.remove("selected");
        selectedCabinet = newCab;
        newCab.classList.add("selected");
        updateSelectedUIFromCabinet(newCab);
        updateCabinetDetailsBar();

        await showPopup("Cabinet imported successfully!", "OK", "");
      } catch (err) {
        console.error(err);
        await showPopup("Invalid cabinet file. It should contain name, width, height, and color.", "OK", "");
      }
    };
    reader.readAsText(file);
  });
}

/* ---------- LOCAL SAVED ROOMS ---------- */
async function confirmAndLoadRoom(name) {
  const ok = await showPopup(
    'Loading a saved room will overwrite your current layout.\n\nContinue?',
    'Load Room',
    'Cancel'
  );
  if (!ok) return;
  loadSavedRoom(name);
  await showPopup(`Loaded saved room: "${name}"`, "OK", "");
}

function loadSavedRoomsList() {
  if (!savedRoomsList) return;
  savedRoomsList.innerHTML = "";
  const saved = JSON.parse(localStorage.getItem("savedRooms") || "{}");
  const names = Object.keys(saved);

  if (names.length === 0) {
    const p = document.createElement("p");
    p.style.fontSize = "0.7rem";
    p.style.color = "var(--muted, #aaa)";
    p.textContent = "No saved rooms yet.";
    savedRoomsList.appendChild(p);
    return;
  }

  names.forEach(name => {
    const entry = document.createElement("div");
    entry.classList.add("saved-room-entry");

    const label = document.createElement("span");
    label.textContent = name;
    entry.appendChild(label);

    const controls = document.createElement("div");

    const loadBtn = document.createElement("button");
    loadBtn.textContent = "Load";
    loadBtn.classList.add("load-btn");
    //New: Confirm before loading room
    loadBtn.addEventListener("click", async () => { 
      await confirmAndLoadRoom(name); 
    });

    const delBtn = document.createElement("button");
    delBtn.textContent = "Delete";
    delBtn.classList.add("delete-btn");
    delBtn.addEventListener("click", async () => {
      const ok = await showPopup(`Delete saved room "${name}"?`, "Delete", "Cancel");
      if (!ok) return;
      deleteSavedRoom(name);
      await showPopup(`Deleted room "${name}"`, "OK", "");
    });

    controls.appendChild(loadBtn);
    controls.appendChild(delBtn);
    entry.appendChild(controls);
    savedRoomsList.appendChild(entry);
  });
}

if (saveRoomBtn) {
  saveRoomBtn.addEventListener("click", async () => {
    const titleVal = (document.getElementById("titleInput").value || "Untitled Room").trim();
    if (!titleVal) {
      await showPopup("Please enter a valid room name before saving.", "OK", "");
      return;
    }

    const saved = JSON.parse(localStorage.getItem("savedRooms") || "{}");

    if (saved[titleVal]) {
      await showPopup(`A saved room named "${titleVal}" already exists.\nPlease use a different name.`, "OK", "");
      return;
    }

    const layout = {
      title: titleVal,
      room: {
        width: parseFloat(document.getElementById("roomWidth").value),
        height: parseFloat(document.getElementById("roomHeight").value),
        gridSize: parseFloat(document.getElementById("gridSize").value)
      },
      cabinets: cabinets.map(cab => ({
        name: cab.dataset.name,
        width: parseFloat(cab.dataset.width),
        height: parseFloat(cab.dataset.height),
        color: cab.dataset.color,
        x: parseFloat(cab.style.left),
        y: parseFloat(cab.style.top),
        rotation: parseFloat(cab.dataset.rotation) || 0,
        locked: cab.dataset.locked === "true"
      }))
    };

    saved[titleVal] = layout;
    localStorage.setItem("savedRooms", JSON.stringify(saved));

    loadSavedRoomsList();
    await showPopup(`Room "${titleVal}" saved locally!`, "OK", "");
  });
}

function loadSavedRoom(name) {
  const saved = JSON.parse(localStorage.getItem("savedRooms") || "{}");
  const data = saved[name];
  if (!data) return;

  document.getElementById("roomWidth").value = data.room.width;
  document.getElementById("roomHeight").value = data.room.height;
  document.getElementById("gridSize").value = data.room.gridSize;
  updateRoom();

  cabinets.forEach(c => c.remove());
  cabinets = [];

  (data.cabinets || []).forEach(cab => {
    const cabinet = document.createElement("div");
    cabinet.classList.add("cabinet");
    cabinet.style.width = (cab.width * pixelsPerMeter) + "px";
    cabinet.style.height = (cab.height * pixelsPerMeter) + "px";
    cabinet.style.background = cab.color;
    cabinet.style.left = cab.x + "px";
    cabinet.style.top = cab.y + "px";
    cabinet.style.transformOrigin = "center center";
    const r = parseFloat(cab.rotation) || 0;
    cabinet.style.transform = "rotate(" + r + "deg)";

    const nameEl = document.createElement("div");
    nameEl.classList.add("cabinet-name");
    nameEl.textContent = cab.name;
    nameEl.style.transform = "rotate(" + (-r) + "deg)";
    cabinet.appendChild(nameEl);

    cabinet.dataset.name = cab.name;
    cabinet.dataset.width = cab.width;
    cabinet.dataset.height = cab.height;
    cabinet.dataset.color = cab.color;
    cabinet.dataset.rotation = r;
    cabinet.dataset.locked = cab.locked ? "true" : "false";
    cabinet.classList.toggle("locked", !!cab.locked);

    room.appendChild(cabinet);
    cabinets.push(cabinet);
    enableDragging(cabinet);
    cabinet.addEventListener("click", e => selectCabinet(e, cabinet));
  });
}

function deleteSavedRoom(name) {
  const saved = JSON.parse(localStorage.getItem("savedRooms") || "{}");
  delete saved[name];
  localStorage.setItem("savedRooms", JSON.stringify(saved));
  loadSavedRoomsList();
}

/* ---------- LOCAL SAVED CABINETS ---------- */
function loadSavedCabinetsList() {
  if (!savedCabinetsList) return;
  savedCabinetsList.innerHTML = "";
  const saved = JSON.parse(localStorage.getItem("savedCabinets") || "{}");
  const names = Object.keys(saved);

  if (names.length === 0) {
    const p = document.createElement("p");
    p.style.fontSize = "0.7rem";
    p.style.color = "var(--muted, #aaa)";
    p.textContent = "No saved cabinets yet.";
    savedCabinetsList.appendChild(p);
    return;
  }

  names.forEach(name => {
    const entry = document.createElement("div");
    entry.classList.add("saved-cabinet-entry");

    const label = document.createElement("span");
    label.textContent = name;
    entry.appendChild(label);

    const controls = document.createElement("div");

    const loadBtn = document.createElement("button");
    loadBtn.textContent = "Load";
    loadBtn.classList.add("load-cabinet-btn");
    loadBtn.addEventListener("click", async () => {
      loadSavedCabinet(name);
      await showPopup(`Loaded saved cabinet: "${name}"`, "OK", "");
    });

    const delBtn = document.createElement("button");
    delBtn.textContent = "Delete";
    delBtn.classList.add("delete-cabinet-btn");
    delBtn.addEventListener("click", async () => {
      const ok = await showPopup(`Delete saved cabinet "${name}"?`, "Delete", "Cancel");
      if (!ok) return;
      deleteSavedCabinet(name);
      await showPopup(`Deleted cabinet "${name}"`, "OK", "");
    });

    controls.appendChild(loadBtn);
    controls.appendChild(delBtn);
    entry.appendChild(controls);

    savedCabinetsList.appendChild(entry);
  });
}

if (saveCabinetBtn) {
  saveCabinetBtn.addEventListener("click", async () => {
    if (!selectedCabinet) {
      await showPopup("Select a cabinet first to save.", "OK", "");
      return;
    }

    const name = (selectedCabinet.dataset.name || "").trim();
    if (!name) {
      await showPopup("Cabinet must have a valid name.", "OK", "");
      return;
    }

    const saved = JSON.parse(localStorage.getItem("savedCabinets") || "{}");

    if (saved[name]) {
      await showPopup(`A saved cabinet named "${name}" already exists.\nPlease use a different name.`, "OK", "");
      return;
    }

    saved[name] = {
      name,
      width: parseFloat(selectedCabinet.dataset.width),
      height: parseFloat(selectedCabinet.dataset.height),
      color: selectedCabinet.dataset.color,
      rotation: parseFloat(selectedCabinet.dataset.rotation) || 0
    };

    localStorage.setItem("savedCabinets", JSON.stringify(saved));
    loadSavedCabinetsList();
    await showPopup(`Cabinet "${name}" saved successfully!`, "OK", "");
  });
}

function loadSavedCabinet(name) {
  const saved = JSON.parse(localStorage.getItem("savedCabinets") || "{}");
  const data = saved[name];
  if (!data) return;

  const newCab = document.createElement("div");
  newCab.classList.add("cabinet");
  newCab.style.width = (data.width * pixelsPerMeter) + "px";
  newCab.style.height = (data.height * pixelsPerMeter) + "px";
  newCab.style.background = data.color;
  newCab.style.transformOrigin = "center center";
  newCab.style.transform = "rotate(" + data.rotation + "deg)";
  newCab.dataset.name = data.name;
  newCab.dataset.width = data.width;
  newCab.dataset.height = data.height;
  newCab.dataset.color = data.color;
  newCab.dataset.rotation = data.rotation;
  newCab.dataset.locked = "false";

  const nameEl = document.createElement("div");
  nameEl.classList.add("cabinet-name");
  nameEl.textContent = data.name;
  nameEl.style.transform = "rotate(" + (-data.rotation) + "deg)";
  newCab.appendChild(nameEl);

  const gridPx = gridSize * pixelsPerMeter;
  let placed = false;
  for (let y = 0; y <= room.clientHeight - newCab.offsetHeight + 1 && !placed; y += gridPx) {
    for (let x = 0; x <= room.clientWidth - newCab.offsetWidth + 1 && !placed; x += gridPx) {
      const clamped = clampToRoomRotated(newCab, x, y);
      if (!collidesAt(clamped.x, clamped.y, newCab)) {
        newCab.style.left = clamped.x + "px";
        newCab.style.top = clamped.y + "px";
        placed = true;
      }
    }
  }
  if (!placed) {
    const clamped = clampToRoomRotated(newCab, 0, 0);
    newCab.style.left = clamped.x + "px";
    newCab.style.top = clamped.y + "px";
  }

  room.appendChild(newCab);
  cabinets.push(newCab);
  enableDragging(newCab);
  newCab.addEventListener("click", (e) => selectCabinet(e, newCab));

  if (selectedCabinet) selectedCabinet.classList.remove("selected");
  selectedCabinet = newCab;
  newCab.classList.add("selected");
  updateSelectedUIFromCabinet(newCab);
  updateCabinetDetailsBar();
}

function deleteSavedCabinet(name) {
  const saved = JSON.parse(localStorage.getItem("savedCabinets") || "{}");
  delete saved[name];
  localStorage.setItem("savedCabinets", JSON.stringify(saved));
  loadSavedCabinetsList();
}

/* ===================== CABINET DETAILS BAR ===================== */
function updateCabinetDetailsBar() {
  if (!bar) return;
  if (!selectedCabinet) {
    bar.classList.add("disabled");
    return;
  }
  bar.classList.remove("disabled");
  if (barName) barName.value = selectedCabinet.dataset.name || "";
  if (barWidth) barWidth.value = selectedCabinet.dataset.width || 1;
  if (barHeight) barHeight.value = selectedCabinet.dataset.height || 1;
  if (barRotation) barRotation.value = selectedCabinet.dataset.rotation || 0;
  if (barColor) barColor.value = selectedCabinet.dataset.color || "#ffffff";
  syncLockButtonUI();
  syncSnapButtonUI();
}

if (barName) {
  barName.addEventListener("input", () => {
    if (!selectedCabinet) return;
    selectedCabinet.dataset.name = barName.value;
    const nameEl = selectedCabinet.querySelector(".cabinet-name");
    if (nameEl) nameEl.textContent = barName.value;
  });
}
if (barWidth) {
  barWidth.addEventListener("input", () => {
    if (!selectedCabinet) return;
    const w = parseFloat(barWidth.value) || 1;
    selectedCabinet.dataset.width = w;
    selectedCabinet.style.width = w * pixelsPerMeter + "px";
  });
}
if (barHeight) {
  barHeight.addEventListener("input", () => {
    if (!selectedCabinet) return;
    const h = parseFloat(barHeight.value) || 1;
    selectedCabinet.dataset.height = h;
    selectedCabinet.style.height = h * pixelsPerMeter + "px";
  });
}
if (barRotation) {
  barRotation.addEventListener("input", () => {
    if (!selectedCabinet) return;
    const r = parseFloat(barRotation.value) || 0;
    selectedCabinet.dataset.rotation = r;
    selectedCabinet.style.transform = `rotate(${r}deg)`;
    const nameEl = selectedCabinet.querySelector(".cabinet-name");
    if (nameEl) nameEl.style.transform = `rotate(${-r}deg)`;
  });
}
if (barColor) {
  barColor.addEventListener("input", () => {
    if (!selectedCabinet) return;
    selectedCabinet.dataset.color = barColor.value;
    selectedCabinet.style.background = barColor.value;
  });
}

/* --- Deselect when clicking outside room & bar --- */
document.addEventListener("click", (e) => {
  if (!room.contains(e.target) && !(bar && bar.contains(e.target))) {
    if (selectedCabinet) selectedCabinet.classList.remove("selected");
    selectedCabinet = null;
    updateCabinetDetailsBar();
  }
});

/* ---------- EXPORT ROOM AS PNG ---------- */
if (exportPngBtn) {
  exportPngBtn.addEventListener("click", async () => {
    if (typeof html2canvas !== "function") {
      await showPopup("html2canvas not found. Please include it on the page.", "OK", "");
      return;
    }

    const roomEl = document.getElementById("room");
    const prevCursor = document.body.style.cursor;
    document.body.style.cursor = "wait";

    const canvas = await html2canvas(roomEl, {
      backgroundColor: getComputedStyle(roomEl).backgroundColor || "#222",
      scale: 2,
      logging: false
    });

    document.body.style.cursor = prevCursor;

    const titleVal = (document.getElementById("titleInput").value || "Arcade Layout").trim();
    const safeTitle = titleVal.replace(/[\\\/:*?"<>|]+/g, "").replace(/\s+/g, " ");
    const link = document.createElement("a");
    link.download = `${safeTitle}_Layout.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();

    // ✅ New popup message
    await showPopup(`Room "${safeTitle}" exported as PNG!`, "OK", "");
  });
}


/* ===== DELETE SELECTED CABINET WITH KEYBOARD ===== */
document.addEventListener("keydown", async (e) => {
  const active = document.activeElement;
  const typing =
    active &&
    (active.tagName === "INPUT" ||
     active.tagName === "TEXTAREA" ||
     active.isContentEditable);

  if (typing) return;

  if (e.key === "Delete" && selectedCabinet) {
    e.preventDefault();
    const ok = await showPopup("Delete selected cabinet?", "Delete", "Cancel");
    if (!ok) return;
    cabinets = cabinets.filter(c => c !== selectedCabinet);
    selectedCabinet.remove();
    selectedCabinet = null;
    updateCabinetDetailsBar();
  }
});

/* ===== RESET ROOM (Reload Site) ===== */
if (resetBtn) {
  resetBtn.addEventListener("click", async () => {
    const ok = await showPopup('Any unsaved rooms or cabinets will be lost.', 'Reset', 'Cancel');
    if (!ok) return;
    window.location.reload();
  });
}

/* ===================== CUSTOM POPUP (replaces alert/confirm) ===================== */
/* 
  Reusable modal:
  - message: string
  - confirmText: string ("OK" by default)
  - cancelText: string ("" for no cancel button)
  Returns: Promise<boolean> -> true if confirmed, false if cancelled
*/
function showPopup(message, confirmText = "OK", cancelText = "") {
  return new Promise((resolve) => {
    const popup = document.getElementById("customPopup");
    const msg = document.getElementById("popupMessage");
    const confirmBtn = document.getElementById("popupConfirm");
    const cancelBtn = document.getElementById("popupCancel");

    if (!popup || !msg || !confirmBtn || !cancelBtn) {
      // Fallback (shouldn’t happen if HTML is present)
      const fallback = window.confirm(message);
      resolve(fallback);
      return;
    }

    msg.textContent = message;
    confirmBtn.textContent = confirmText || "OK";

    // Show/hide cancel button depending on label provided
    if (cancelText && cancelText.trim().length) {
      cancelBtn.textContent = cancelText;
      cancelBtn.style.display = "";
    } else {
      cancelBtn.style.display = "none";
    }

    popup.classList.remove("hidden");

    const close = (result) => {
      popup.classList.add("hidden");
      confirmBtn.removeEventListener("click", onConfirm);
      cancelBtn.removeEventListener("click", onCancel);
      popup.removeEventListener("click", onBackdrop);
      resolve(result);
    };
    const onConfirm = () => close(true);
    const onCancel = () => close(false);
    const onBackdrop = (e) => {
      if (e.target === popup && cancelBtn.style.display !== "none") close(false);
    };

    confirmBtn.addEventListener("click", onConfirm);
    cancelBtn.addEventListener("click", onCancel);
    popup.addEventListener("click", onBackdrop);
  });
}

// ===== HELP POPUP FUNCTIONALITY =====
document.addEventListener("DOMContentLoaded", () => {
  const helpBtn = document.getElementById("helpBtn");
  const helpPopup = document.getElementById("helpPopup");
  const closeHelpBtn = document.getElementById("closeHelpBtn");

  if (!helpBtn || !helpPopup) return;

  helpBtn.addEventListener("click", () => {
    helpPopup.classList.remove("hidden");
  });

  closeHelpBtn.addEventListener("click", () => {
    helpPopup.classList.add("hidden");
  });

  // Close when clicking outside popup box
  helpPopup.addEventListener("click", (e) => {
    if (e.target === helpPopup) helpPopup.classList.add("hidden");
  });
});

/* =========================================================
   ZOOM CONTROLS FOR ROOM VIEW – PERFECT CENTER + SCROLL PAD
   ========================================================= */
const zoomInBtn = document.getElementById("zoomInBtn");
const zoomOutBtn = document.getElementById("zoomOutBtn");
const roomContainer = document.getElementById("roomContainer");
let roomZoom = 0.67;

function applyRoomZoom() {
  room.style.transform = `scale(${roomZoom})`;
  room.style.transformOrigin = "center center";

  // Center room visually inside container after zoom
  const roomRect = room.getBoundingClientRect();
  const containerRect = roomContainer.getBoundingClientRect();

  // Calculate scroll offset to keep room centered
  const scrollLeft = (room.scrollWidth * roomZoom - containerRect.width) / 2;
  const scrollTop  = (room.scrollHeight * roomZoom - containerRect.height) / 2;

  // Add a little buffer for smooth edge access
  roomContainer.scrollLeft = Math.max(scrollLeft, 0);
  roomContainer.scrollTop  = Math.max(scrollTop, 0);
}

if (zoomInBtn && zoomOutBtn) {
  zoomInBtn.addEventListener("click", () => {
    roomZoom = Math.min(roomZoom + 0.1, 3);
    applyRoomZoom();
  });

  zoomOutBtn.addEventListener("click", () => {
    roomZoom = Math.max(roomZoom - 0.1, 0.3);
    applyRoomZoom();
  });
}

applyRoomZoom();

function setHeaderHeightVar() {
  const h = document.querySelector('header')?.offsetHeight || 120;
  document.documentElement.style.setProperty('--header-h', h + 'px');
}
window.addEventListener('load', setHeaderHeightVar);
window.addEventListener('resize', setHeaderHeightVar);
setHeaderHeightVar();


