const room = document.getElementById("room");
const updateRoomBtn = document.getElementById("updateRoom");
const addCabinetBtn = document.getElementById("addCabinet");
const titleInput = document.getElementById("titleInput");
const mainTitle = document.getElementById("mainTitle");

let gridSize = 1;
let pixelsPerMeter = 100;
let selectedCabinet = null;
let cabinets = [];


// ===== FORCE DEFAULT THEME =====
// Ensure the app starts in Simple Dark Mode by default
document.body.classList.add("dark-mode");
document.body.classList.remove("light-mode");

/* Global snapping state */
let snapEnabled = true;

updateRoomBtn.addEventListener("click", updateRoom);
addCabinetBtn.addEventListener("click", addCabinet);
titleInput.addEventListener("input", () => (mainTitle.textContent = titleInput.value));

// Simple mode toggle
const simpleModeBtn = document.getElementById("simpleModeBtn");
let simpleMode = false;
simpleModeBtn.addEventListener("click", () => {
  simpleMode = !simpleMode;
  document.body.classList.toggle("simple-mode", simpleMode);
  simpleModeBtn.textContent = simpleMode ? "Arcade Mode" : "Simple Mode";
});

// Toggle buttons
const snapBtn = document.getElementById("snapToggleBtn");
const lockBtn = document.getElementById("lockToggleBtn");

/* Cabinet import/export controls (always visible in HTML) */
const exportCabinetBtn = document.getElementById("exportCabinetBtn");
const importCabinetBtn = document.getElementById("importCabinetBtn");
const importCabinetFile = document.getElementById("importCabinetFile");

/* ---------- INIT ---------- */
updateRoom();
syncSnapButtonUI();

/* ---------- UI Helpers ---------- */
function syncSnapButtonUI() {
  if (!snapBtn) return;
  snapBtn.classList.toggle("off", !snapEnabled);
  snapBtn.textContent = `Snapping: ${snapEnabled ? "ON" : "OFF"}`;
}

function syncLockButtonUI() {
  if (!lockBtn) return;
  const isLocked = selectedCabinet && selectedCabinet.dataset.locked === "true";
  lockBtn.classList.toggle("on", !!isLocked);
  lockBtn.textContent = isLocked ? "Locked" : "Unlocked";
}

/* ---------- Toggle handlers ---------- */
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

/* ---------- Geometry helpers ---------- */

/** Snap TOP-LEFT corner to nearest grid intersection (edge-based snapping). */
function snapTopLeft(x, y) {
  const gridPx = gridSize * pixelsPerMeter;
  const nx = Math.round(x / gridPx) * gridPx;
  const ny = Math.round(y / gridPx) * gridPx;
  return { x: nx, y: ny };
}

/** Get rotation in radians from element dataset (defaults 0). */
function getRotationRad(el) {
  return ((parseFloat(el.dataset.rotation) || 0) * Math.PI) / 180;
}

/** Build oriented-rectangle polygon for element if placed at (x,y). Uses dataset sizes (in meters) for rotation-accurate hitbox. */
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
    { x: -halfW, y: -halfH }, // top-left
    { x:  halfW, y: -halfH }, // top-right
    { x:  halfW, y:  halfH }, // bottom-right
    { x: -halfW, y:  halfH }  // bottom-left
  ];

  return pts.map(p => ({
    x: cx + p.x * cos - p.y * sin,
    y: cy + p.x * sin + p.y * cos
  }));
}

/** Project polygon onto axis and return [min,max]. */
function projectPolygon(axis, poly) {
  let min = Infinity, max = -Infinity;
  for (const p of poly) {
    const val = p.x * axis.x + p.y * axis.y;
    if (val < min) min = val;
    if (val > max) max = val;
  }
  return [min, max];
}

/** SAT overlap test for two convex polygons. Edges touching counts as NO overlap (allowed). */
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

  addAxes(polyA);
  addAxes(polyB);

  for (const axis of axes) {
    const [minA, maxA] = projectPolygon(axis, polyA);
    const [minB, maxB] = projectPolygon(axis, polyB);
    // If there is a gap OR they just touch at an endpoint (<= or >=), we treat as NO overlap.
    if (maxA <= minB || maxB <= minA) {
      return false; // Separating axis found → no collision
    }
  }
  return true; // Overlaps on all axes → collision
}

/** True if placing `el` at (x,y) would overlap any other cabinet (edges touching OK). */
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

/** Bounds of a polygon */
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

/** Clamp a ROTATED rect inside room by shifting x/y so its rotated polygon fits perfectly (no wall gaps). */
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
  cabinet.dataset.locked = "false"; // default unlocked

  room.appendChild(cabinet);
  cabinets.push(cabinet);

  enableDragging(cabinet);
  cabinet.addEventListener("click", (e) => selectCabinet(e, cabinet));
}

function enableDragging(el) {
  let isDragging = false;
  let offsetX = 0;
  let offsetY = 0;

  // Track last valid (non-overlapping) position during drag
  let lastValidX = parseFloat(el.style.left) || 0;
  let lastValidY = parseFloat(el.style.top) || 0;

  el.addEventListener("mousedown", e => {
    // Select even if locked
    if (selectedCabinet) selectedCabinet.classList.remove("selected");
    selectedCabinet = el;
    el.classList.add("selected");
    updateSelectedUIFromCabinet(el);

    // refresh last valid from current position
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
    let newX = e.clientX - rect.left - offsetX;
    let newY = e.clientY - rect.top - offsetY;

    let snappedToCabinet = false;

    if (snapEnabled) {
      const threshold = 10;

      // Edge-to-edge snapping using AABB of targets (kept simple),
      // then final clamp uses rotated geometry to avoid gaps.
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

      // If we didn't snap to another cabinet, snap top-left edge to the grid.
      if (!snappedToCabinet) {
        const g = snapTopLeft(newX, newY);
        newX = g.x;
        newY = g.y;
      }
    }

    // Clamp within room using ROTATED geometry to eliminate wall gaps
    ({ x: newX, y: newY } = clampToRoomRotated(el, newX, newY));

    // --- COLLISION PREVENTION with ROTATION (edges can touch) ---
    if (!collidesAt(newX, newY, el)) {
      el.style.left = newX + "px";
      el.style.top = newY + "px";
      lastValidX = newX;
      lastValidY = newY;
    } else {
      // Try slide along one axis if possible (also clamp with rotated geometry)
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
      // Otherwise, stay at last valid
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
}

function updateSelectedUIFromCabinet(cab) {
  document.getElementById("selectedCabinetUI").style.display = "block";
  document.getElementById("selectedName").value = cab.dataset.name;
  document.getElementById("selectedWidth").value = cab.dataset.width;
  document.getElementById("selectedHeight").value = cab.dataset.height;
  document.getElementById("selectedColor").value = cab.dataset.color;
  document.getElementById("selectedRotation").value = cab.dataset.rotation || 0;

  cab.classList.toggle("locked", cab.dataset.locked === "true");
  syncLockButtonUI();
  syncSnapButtonUI();
}

/* Reflect property edits live */
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

      // After rotation change, keep within room using rotated clamp (prevents new gaps)
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

/* Delete */
document.getElementById("deleteCabinet").addEventListener("click", () => {
  if (!selectedCabinet) return;
  cabinets = cabinets.filter(c => c !== selectedCabinet);
  selectedCabinet.remove();
  selectedCabinet = null;
  document.getElementById("selectedCabinetUI").style.display = "none";
});

/* Deselect */
document.getElementById("deselectCabinet").addEventListener("click", () => {
  if (selectedCabinet) selectedCabinet.classList.remove("selected");
  selectedCabinet = null;
  document.getElementById("selectedCabinetUI").style.display = "none";
});

/* Duplicate */
document.getElementById("duplicateCabinet").addEventListener("click", () => {
  if (!selectedCabinet) return;

  const copy = document.createElement("div");
  copy.classList.add("cabinet");

  // copy size/appearance
  copy.style.width = selectedCabinet.style.width;
  copy.style.height = selectedCabinet.style.height;
  copy.style.background = selectedCabinet.dataset.color;
  copy.style.transformOrigin = "center center";
  const rot = parseFloat(selectedCabinet.dataset.rotation) || 0;
  copy.style.transform = "rotate(" + rot + "deg)";

  // position: offset by 10px, then snap/clamp
  let newX = (parseFloat(selectedCabinet.style.left) || 0) + 10;
  let newY = (parseFloat(selectedCabinet.style.top) || 0) + 10;

  if (snapEnabled) {
    const g = snapTopLeft(newX, newY);
    newX = g.x; newY = g.y;
  }

  // dataset copy (needed before rotated clamp/collision checks)
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

  // select the new copy
  if (selectedCabinet) selectedCabinet.classList.remove("selected");
  selectedCabinet = copy;
  copy.classList.add("selected");
  updateSelectedUIFromCabinet(copy);
});

/* ---------- ROOM EXPORT LAYOUT ---------- */
document.getElementById("exportLayout").addEventListener("click", () => {
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
  reader.onload = e => {
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

      // Re-sync toggle button UIs
      syncSnapButtonUI();
      syncLockButtonUI();

      alert("Layout imported successfully!");
    } catch (err) {
      console.error(err);
      alert("Invalid JSON layout file!");
    }
  };

  reader.readAsText(file);
});

/* ---------- CABINET EXPORT ---------- */
if (exportCabinetBtn) {
  exportCabinetBtn.addEventListener("click", () => {
    if (!selectedCabinet) {
      alert("Select a cabinet first to export.");
      return;
    }
    const name = selectedCabinet.dataset.name || "Cabinet";
    const width = parseFloat(selectedCabinet.dataset.width) || 0;
    const height = parseFloat(selectedCabinet.dataset.height) || 0;
    const color = selectedCabinet.dataset.color || "#ffffff";

    const payload = { name, width, height, color }; // no rotation

    const safeName = name.replace(/[\\\/:*?"<>|]+/g, "").replace(/\s+/g, " ").trim().substring(0, 120) || "Cabinet";
    const filename = `${safeName}_Cabinet.json`;

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
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
    reader.onload = e => {
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

        // Set dataset BEFORE placement so rotated hitbox routines read correct size
        newCab.dataset.name = name;
        newCab.dataset.width = widthM;
        newCab.dataset.height = heightM;
        newCab.dataset.color = color;
        newCab.dataset.rotation = 0;
        newCab.dataset.locked = "false";
        newCab.classList.toggle("locked", false);

        // Find first non-overlapping position scanning grid
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

        // Select the imported cabinet
        if (selectedCabinet) selectedCabinet.classList.remove("selected");
        selectedCabinet = newCab;
        newCab.classList.add("selected");
        updateSelectedUIFromCabinet(newCab);

        alert("Cabinet imported successfully!");
      } catch (err) {
        console.error(err);
        alert("Invalid cabinet file. It should contain name, width, height, and color.");
      }
    };
    reader.readAsText(file);
  });
}

// ---------- LOCAL SAVED ROOMS ----------
const saveRoomBtn = document.getElementById("saveRoomBtn");
const savedRoomsList = document.getElementById("savedRoomsList");

// Load saved rooms from localStorage
function loadSavedRoomsList() {
  if (!savedRoomsList) return;
  savedRoomsList.innerHTML = "";
  const saved = JSON.parse(localStorage.getItem("savedRooms") || "{}");
  const names = Object.keys(saved);

  if (names.length === 0) {
    savedRoomsList.innerHTML = "<p style='font-size:0.7rem; color:#aaa;'>No saved rooms yet.</p>";
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
    loadBtn.addEventListener("click", () => loadSavedRoom(name));

    const delBtn = document.createElement("button");
    delBtn.textContent = "Delete";
    delBtn.classList.add("delete-btn");
    delBtn.addEventListener("click", () => {
      if (confirm(`Delete saved room "${name}"?`)) {
        deleteSavedRoom(name);
      }
    });

    controls.appendChild(loadBtn);
    controls.appendChild(delBtn);
    entry.appendChild(controls);

    savedRoomsList.appendChild(entry);
  });
}

// Save current layout locally
if (saveRoomBtn) {
  saveRoomBtn.addEventListener("click", () => {
    const titleVal = (document.getElementById("titleInput").value || "Untitled Room").trim();
    if (!titleVal) {
      alert("Please enter a valid room name before saving.");
      return;
    }

    const saved = JSON.parse(localStorage.getItem("savedRooms") || "{}");

    // Prevent overwriting existing room
    if (saved[titleVal]) {
      alert(`A saved room named "${titleVal}" already exists.\nPlease use a different name.`);
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
    alert(`Room "${titleVal}" saved locally!`);
  });
}

// Load saved room
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

  alert(`Loaded saved room: "${name}"`);
}

// Delete saved room
function deleteSavedRoom(name) {
  const saved = JSON.parse(localStorage.getItem("savedRooms") || "{}");
  delete saved[name];
  localStorage.setItem("savedRooms", JSON.stringify(saved));
  loadSavedRoomsList();
}

// Initialize on startup
loadSavedRoomsList();

// ---------- LOCAL SAVED CABINETS ----------
const saveCabinetBtn = document.getElementById("saveCabinetBtn");
const savedCabinetsList = document.getElementById("savedCabinetsList");

// Load saved cabinets from localStorage
function loadSavedCabinetsList() {
  if (!savedCabinetsList) return;
  savedCabinetsList.innerHTML = "";
  const saved = JSON.parse(localStorage.getItem("savedCabinets") || "{}");
  const names = Object.keys(saved);

  if (names.length === 0) {
    savedCabinetsList.innerHTML = "<p style='font-size:0.7rem; color:#aaa;'>No saved cabinets yet.</p>";
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
    loadBtn.addEventListener("click", () => loadSavedCabinet(name));

    const delBtn = document.createElement("button");
    delBtn.textContent = "Delete";
    delBtn.classList.add("delete-cabinet-btn");
    delBtn.addEventListener("click", () => {
      if (confirm(`Delete saved cabinet "${name}"?`)) {
        deleteSavedCabinet(name);
      }
    });

    controls.appendChild(loadBtn);
    controls.appendChild(delBtn);
    entry.appendChild(controls);

    savedCabinetsList.appendChild(entry);
  });
}

// Save current selected cabinet
if (saveCabinetBtn) {
  saveCabinetBtn.addEventListener("click", () => {
    if (!selectedCabinet) {
      alert("Select a cabinet first to save.");
      return;
    }

    const name = selectedCabinet.dataset.name.trim();
    if (!name) {
      alert("Cabinet must have a valid name.");
      return;
    }

    const saved = JSON.parse(localStorage.getItem("savedCabinets") || "{}");

    if (saved[name]) {
      alert(`A saved cabinet named "${name}" already exists.\nPlease use a different name.`);
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
    alert(`Cabinet "${name}" saved successfully!`);
  });
}

// Load saved cabinet (spawn in room)
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

  // Find first non-overlapping position scanning grid
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

  alert(`Loaded saved cabinet: "${name}"`);
}

// Delete saved cabinet
function deleteSavedCabinet(name) {
  const saved = JSON.parse(localStorage.getItem("savedCabinets") || "{}");
  delete saved[name];
  localStorage.setItem("savedCabinets", JSON.stringify(saved));
  loadSavedCabinetsList();
}

// Initialize cabinet saves on startup
loadSavedCabinetsList();

// ===================== CABINET DETAILS BAR =====================

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

// Refresh UI
function updateCabinetDetailsBar() {
  if (!selectedCabinet) {
    bar.classList.add("disabled");
    return;
  }

  bar.classList.remove("disabled");
  barName.value = selectedCabinet.dataset.name || "";
  barWidth.value = selectedCabinet.dataset.width || 1;
  barHeight.value = selectedCabinet.dataset.height || 1;
  barRotation.value = selectedCabinet.dataset.rotation || 0;
  barColor.value = selectedCabinet.dataset.color || "#ffffff";

  const isLocked = selectedCabinet.dataset.locked === "true";
  barLockToggle.textContent = isLocked ? "Locked" : "Unlocked";
  barLockToggle.classList.toggle("on", isLocked);
  barSnapToggle.textContent = `Snapping: ${snapEnabled ? "ON" : "OFF"}`;
}

// --- Input bindings ---
barName.addEventListener("input", () => {
  if (!selectedCabinet) return;
  selectedCabinet.dataset.name = barName.value;
  const nameEl = selectedCabinet.querySelector(".cabinet-name");
  if (nameEl) nameEl.textContent = barName.value;
});

barWidth.addEventListener("input", () => {
  if (!selectedCabinet) return;
  const w = parseFloat(barWidth.value) || 1;
  selectedCabinet.dataset.width = w;
  selectedCabinet.style.width = w * pixelsPerMeter + "px";
});

barHeight.addEventListener("input", () => {
  if (!selectedCabinet) return;
  const h = parseFloat(barHeight.value) || 1;
  selectedCabinet.dataset.height = h;
  selectedCabinet.style.height = h * pixelsPerMeter + "px";
});

barRotation.addEventListener("input", () => {
  if (!selectedCabinet) return;
  const r = parseFloat(barRotation.value) || 0;
  selectedCabinet.dataset.rotation = r;
  selectedCabinet.style.transform = `rotate(${r}deg)`;
  const nameEl = selectedCabinet.querySelector(".cabinet-name");
  if (nameEl) nameEl.style.transform = `rotate(${-r}deg)`;
});

barColor.addEventListener("input", () => {
  if (!selectedCabinet) return;
  selectedCabinet.dataset.color = barColor.value;
  selectedCabinet.style.background = barColor.value;
});

// --- Button actions ---
barSnapToggle.addEventListener("click", () => {
  snapEnabled = !snapEnabled;
  updateCabinetDetailsBar();
});

barLockToggle.addEventListener("click", () => {
  if (!selectedCabinet) return;
  const locked = selectedCabinet.dataset.locked === "true";
  selectedCabinet.dataset.locked = locked ? "false" : "true";
  selectedCabinet.classList.toggle("locked", !locked);
  updateCabinetDetailsBar();
});

barDeselect.addEventListener("click", () => {
  if (selectedCabinet) selectedCabinet.classList.remove("selected");
  selectedCabinet = null;
  updateCabinetDetailsBar();
});

barDuplicate.addEventListener("click", () => {
  document.getElementById("duplicateCabinet").click(); // triggers existing logic
  updateCabinetDetailsBar();
});

barDelete.addEventListener("click", () => {
  document.getElementById("deleteCabinet").click(); // triggers existing logic
  updateCabinetDetailsBar();
});

// --- Hook into selection ---
const oldSelectCabinet = selectCabinet;
selectCabinet = function (e, cab) {
  oldSelectCabinet.call(this, e, cab);
  updateCabinetDetailsBar();
};

// --- Deselect when clicking outside ---
document.addEventListener("click", (e) => {
  if (!room.contains(e.target) && !bar.contains(e.target)) {
    if (selectedCabinet) selectedCabinet.classList.remove("selected");
    selectedCabinet = null;
    updateCabinetDetailsBar();
  }
});

// Init once
updateCabinetDetailsBar();


// ---------- EXPORT ROOM AS PNG ----------
const exportPngBtn = document.getElementById("exportPngBtn");

if (exportPngBtn) {
  exportPngBtn.addEventListener("click", async () => {
    const roomEl = document.getElementById("room");

    // Disable selection highlights for clean render
    const prevOutline = roomEl.style.outline;
    const prevCursor = document.body.style.cursor;
    document.body.style.cursor = "wait";
    roomEl.classList.remove("selected");

    // Render to canvas using html2canvas
    const canvas = await html2canvas(roomEl, {
      backgroundColor: "#222", // fallback background
      scale: 2,                // higher quality
      logging: false
    });

    // Restore cursor
    document.body.style.cursor = prevCursor;
    roomEl.style.outline = prevOutline;

    // Download PNG
    const link = document.createElement("a");
    const titleVal = (document.getElementById("titleInput").value || "Arcade Layout").trim();
    const safeTitle = titleVal.replace(/[\\\/:*?"<>|]+/g, "").replace(/\s+/g, " ");
    link.download = `${safeTitle}_Layout.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  });
}

// ===== DELETE SELECTED CABINET WITH KEYBOARD =====
document.addEventListener("keydown", (e) => {
  // Ignore if user is typing in an input, textarea, or contenteditable element
  const active = document.activeElement;
  const typing =
    active &&
    (active.tagName === "INPUT" ||
     active.tagName === "TEXTAREA" ||
     active.isContentEditable);

  if (typing) return; // don't delete if typing

  // If Delete key pressed and a cabinet is selected
  if (e.key === "Delete" && selectedCabinet) {
    e.preventDefault();
    // Perform same logic as the delete button
    cabinets = cabinets.filter(c => c !== selectedCabinet);
    selectedCabinet.remove();
    selectedCabinet = null;
    updateCabinetDetailsBar();
  }
});

// ---------- THEME MODE TOGGLE ----------
const themeModeBtn = document.getElementById("themeModeBtn");
let darkMode = true; // start in dark mode by default

themeModeBtn.addEventListener("click", () => {
  darkMode = !darkMode;
  document.body.classList.toggle("dark-mode", darkMode);
  document.body.classList.toggle("light-mode", !darkMode);
  themeModeBtn.textContent = darkMode ? "Dark Mode" : "Light Mode";
});