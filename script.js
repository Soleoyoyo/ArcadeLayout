const room = document.getElementById("room");
const updateRoomBtn = document.getElementById("updateRoom");
const addCabinetBtn = document.getElementById("addCabinet");
const titleInput = document.getElementById("titleInput");
const mainTitle = document.getElementById("mainTitle");

let gridSize = 1;
let pixelsPerMeter = 100;
let selectedCabinet = null;
let cabinets = [];

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

/** Clamp within the room bounds. */
function clampToRoom(el, x, y) {
  const nx = Math.max(0, Math.min(x, room.clientWidth - el.offsetWidth));
  const ny = Math.max(0, Math.min(y, room.clientHeight - el.offsetHeight));
  return { x: nx, y: ny };
}

/** Get rotation in radians from element dataset (defaults 0). */
function getRotationRad(el) {
  return ((parseFloat(el.dataset.rotation) || 0) * Math.PI) / 180;
}

/** Build oriented-rectangle polygon for element if placed at (x,y). */
function getOrientedRect(el, x, y) {
  const w = el.offsetWidth;
  const h = el.offsetHeight;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const a = getRotationRad(el);
  const cos = Math.cos(a);
  const sin = Math.sin(a);

  // local corners around origin (center)
  const halfW = w / 2, halfH = h / 2;
  const pts = [
    { x: -halfW, y: -halfH }, // top-left
    { x:  halfW, y: -halfH }, // top-right
    { x:  halfW, y:  halfH }, // bottom-right
    { x: -halfW, y:  halfH }  // bottom-left
  ];

  // rotate + translate to world
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

  // Build axes from polygon edges (perpendicular vectors)
  function addAxes(poly) {
    for (let i = 0; i < poly.length; i++) {
      const p1 = poly[i];
      const p2 = poly[(i + 1) % poly.length];
      const edge = { x: p2.x - p1.x, y: p2.y - p1.y };
      // normal (perpendicular)
      const axis = { x: -edge.y, y: edge.x };
      // normalize
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
    const polyB = getOrientedRect(other, other.offsetLeft, other.offsetTop);
    if (polysOverlapSAT(polyA, polyB)) return true;
  }
  return false;
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

      // NOTE: The following edge-to-edge snapping still uses AABB edges for simplicity.
      // It remains visually helpful even when other cabinets are rotated.
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

    // Clamp within room
    ({ x: newX, y: newY } = clampToRoom(el, newX, newY));

    // --- COLLISION PREVENTION with ROTATION (edges can touch) ---
    if (!collidesAt(newX, newY, el)) {
      el.style.left = newX + "px";
      el.style.top = newY + "px";
      lastValidX = newX;
      lastValidY = newY;
    } else {
      // Try slide along one axis if possible
      const canMoveX = !collidesAt(newX, lastValidY, el);
      const canMoveY = !collidesAt(lastValidX, newY, el);

      if (canMoveX) {
        el.style.left = newX + "px";
        lastValidX = newX;
      }
      if (canMoveY) {
        el.style.top = newY + "px";
        lastValidY = newY;
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

      // After rotation change, re-snap TOP-LEFT to grid (if enabled)
      if (snapEnabled) {
        let x = parseFloat(selectedCabinet.style.left) || 0;
        let y = parseFloat(selectedCabinet.style.top) || 0;
        const g = snapTopLeft(x, y);
        ({ x, y } = clampToRoom(selectedCabinet, g.x, g.y));
        if (!collidesAt(x, y, selectedCabinet)) {
          selectedCabinet.style.left = x + "px";
          selectedCabinet.style.top = y + "px";
        }
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

  // position: offset by 10px, then snap top-left if snapping is ON
  let newX = (parseFloat(selectedCabinet.style.left) || 0) + 10;
  let newY = (parseFloat(selectedCabinet.style.top) || 0) + 10;

  if (snapEnabled) {
    const g = snapTopLeft(newX, newY);
    newX = g.x; newY = g.y;
  }

  ({ x: newX, y: newY } = clampToRoom(copy, newX, newY));
  copy.style.left = newX + "px";
  copy.style.top = newY + "px";

  // name element
  const nameEl = document.createElement("div");
  nameEl.classList.add("cabinet-name");
  nameEl.textContent = selectedCabinet.dataset.name;
  nameEl.style.transform = "rotate(" + (-rot) + "deg)";
  copy.appendChild(nameEl);

  // dataset copy
  copy.dataset.name = selectedCabinet.dataset.name;
  copy.dataset.width = selectedCabinet.dataset.width;
  copy.dataset.height = selectedCabinet.dataset.height;
  copy.dataset.color = selectedCabinet.dataset.color;
  copy.dataset.rotation = rot;
  copy.dataset.locked = selectedCabinet.dataset.locked || "false";
  copy.classList.toggle("locked", copy.dataset.locked === "true");

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

  // Title for file contents and filename
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

      // restore the title if present
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

    const payload = { name, width, height, color }; // no rotation, as requested

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

        // Find first non-overlapping position scanning grid (already edge-aligned)
        const gridPx = gridSize * pixelsPerMeter;
        let placed = false;
        for (let y = 0; y <= room.clientHeight - newCab.offsetHeight + 1 && !placed; y += gridPx) {
          for (let x = 0; x <= room.clientWidth - newCab.offsetWidth + 1 && !placed; x += gridPx) {
            // Temporarily attach to compute offsets
            newCab.style.left = x + "px";
            newCab.style.top = y + "px";
            room.appendChild(newCab);
            const collision = collidesAt(x, y, newCab);
            room.removeChild(newCab);
            if (!collision) {
              newCab.style.left = x + "px";
              newCab.style.top = y + "px";
              placed = true;
            }
          }
        }
        if (!placed) {
          // fallback: place at (0,0) clamped
          newCab.style.left = "0px";
          newCab.style.top = "0px";
        }

        // Name label
        const nameEl = document.createElement("div");
        nameEl.classList.add("cabinet-name");
        nameEl.textContent = name;
        nameEl.style.transform = "rotate(0deg)";
        newCab.appendChild(nameEl);

        newCab.dataset.name = name;
        newCab.dataset.width = widthM;
        newCab.dataset.height = heightM;
        newCab.dataset.color = color;
        newCab.dataset.rotation = 0;
        newCab.dataset.locked = "false";
        newCab.classList.toggle("locked", false);

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
saveRoomBtn.addEventListener("click", () => {
  const titleVal = (document.getElementById("titleInput").value || "Untitled Room").trim();
  if (!titleVal) {
    alert("Please enter a valid room name before saving.");
    return;
  }

  const saved = JSON.parse(localStorage.getItem("savedRooms") || "{}");

  // ✅ Prevent overwriting existing room
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
