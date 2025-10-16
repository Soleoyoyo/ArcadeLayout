const room = document.getElementById("room");
const updateRoomBtn = document.getElementById("updateRoom");
const addCabinetBtn = document.getElementById("addCabinet");
const snapToggle = document.getElementById("snapToggle");
const titleInput = document.getElementById("titleInput");
const mainTitle = document.getElementById("mainTitle");

let gridSize = 1;
let pixelsPerMeter = 100;
let selectedCabinet = null;
let cabinets = [];

updateRoomBtn.addEventListener("click", updateRoom);
addCabinetBtn.addEventListener("click", addCabinet);
titleInput.addEventListener("input", () => mainTitle.textContent = titleInput.value);

// Simple mode toggle
const simpleModeBtn = document.getElementById("simpleModeBtn");
let simpleMode = false;
simpleModeBtn.addEventListener("click", () => {
  simpleMode = !simpleMode;
  document.body.classList.toggle("simple-mode", simpleMode);
  simpleModeBtn.textContent = simpleMode ? "Arcade Mode" : "Simple Mode";
});

// Generate initial room
updateRoom();

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

  // Create name element inside cabinet
  const nameEl = document.createElement("div");
  nameEl.classList.add("cabinet-name");
  nameEl.textContent = name;

  cabinet.appendChild(nameEl);

  cabinet.dataset.name = name;
  cabinet.dataset.width = width;
  cabinet.dataset.height = height;
  cabinet.dataset.color = color;
  cabinet.dataset.rotation = 0;

  room.appendChild(cabinet);
  cabinets.push(cabinet);

  enableDragging(cabinet);
  cabinet.addEventListener("click", (e) => selectCabinet(e, cabinet));
}

function enableDragging(el) {
  let isDragging = false;
  let offsetX = 0;
  let offsetY = 0;

  el.addEventListener("mousedown", e => {
    isDragging = true;
    offsetX = e.offsetX;
    offsetY = e.offsetY;

    if (selectedCabinet) selectedCabinet.style.outline = "none";
    selectedCabinet = el;
    el.style.outline = "3px solid #ffcc00";
  });

  document.addEventListener("mousemove", e => {
    if (!isDragging) return;

    const rect = room.getBoundingClientRect();
    let newX = e.clientX - rect.left - offsetX;
    let newY = e.clientY - rect.top - offsetY;

    if (snapToggle.checked) {
      const gridPx = gridSize * pixelsPerMeter;
      const threshold = 10;
      let snappedToCabinet = false;

      cabinets.forEach(cab => {
        if (cab === el) return;

        const cabSides = {
          left: cab.offsetLeft,
          right: cab.offsetLeft + cab.offsetWidth,
          top: cab.offsetTop,
          bottom: cab.offsetTop + cab.offsetHeight
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
        newX = Math.round(newX / gridPx) * gridPx;
        newY = Math.round(newY / gridPx) * gridPx;
      }
    }

    el.style.left = newX + "px";
    el.style.top = newY + "px";
  });

  document.addEventListener("mouseup", () => isDragging = false);
}

function selectCabinet(e, cab) {
  e.stopPropagation();
  if (selectedCabinet) selectedCabinet.style.outline = "none";
  selectedCabinet = cab;
  selectedCabinet.style.outline = "3px solid #ffcc00";

  document.getElementById("selectedCabinetUI").style.display = "block";
  document.getElementById("selectedName").value = cab.dataset.name;
  document.getElementById("selectedWidth").value = cab.dataset.width;
  document.getElementById("selectedHeight").value = cab.dataset.height;
  document.getElementById("selectedColor").value = cab.dataset.color;
  document.getElementById("selectedRotation").value = cab.dataset.rotation || 0;
}

["selectedName", "selectedWidth", "selectedHeight", "selectedColor", "selectedRotation"].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.addEventListener("input", updateSelectedCabinet);
});

function updateSelectedCabinet() {
  if (!selectedCabinet) return;
  selectedCabinet.dataset.name = document.getElementById("selectedName").value;
  selectedCabinet.dataset.width = parseFloat(document.getElementById("selectedWidth").value);
  selectedCabinet.dataset.height = parseFloat(document.getElementById("selectedHeight").value);
  selectedCabinet.dataset.color = document.getElementById("selectedColor").value;
  selectedCabinet.dataset.rotation = parseFloat(document.getElementById("selectedRotation").value) || 0;

  selectedCabinet.style.width = selectedCabinet.dataset.width * pixelsPerMeter + "px";
  selectedCabinet.style.height = selectedCabinet.dataset.height * pixelsPerMeter + "px";
  selectedCabinet.style.background = selectedCabinet.dataset.color;
  selectedCabinet.style.transform = `rotate(${selectedCabinet.dataset.rotation}deg)`;

  // Update the name text and keep it upright
  const nameEl = selectedCabinet.querySelector(".cabinet-name");
  if (nameEl) {
    nameEl.textContent = selectedCabinet.dataset.name;
    nameEl.style.transform = `rotate(${-selectedCabinet.dataset.rotation}deg)`;
  }
}

document.getElementById("deleteCabinet").addEventListener("click", () => {
  if (selectedCabinet) {
    cabinets = cabinets.filter(c => c !== selectedCabinet);
    selectedCabinet.remove();
    selectedCabinet = null;
    document.getElementById("selectedCabinetUI").style.display = "none";
  }
});

document.getElementById("deselectCabinet").addEventListener("click", () => {
  if (selectedCabinet) selectedCabinet.style.outline = "none";
  selectedCabinet = null;
  document.getElementById("selectedCabinetUI").style.display = "none";
});

/* ---------- EXPORT LAYOUT ---------- */
document.getElementById("exportLayout").addEventListener("click", () => {
  const roomWidth = parseFloat(document.getElementById("roomWidth").value);
  const roomHeight = parseFloat(document.getElementById("roomHeight").value);
  const gridSize = parseFloat(document.getElementById("gridSize").value);

  const layout = {
    room: { width: roomWidth, height: roomHeight, gridSize: gridSize },
    cabinets: cabinets.map(cab => ({
      name: cab.dataset.name,
      width: parseFloat(cab.dataset.width),
      height: parseFloat(cab.dataset.height),
      color: cab.dataset.color,
      x: parseFloat(cab.style.left),
      y: parseFloat(cab.style.top),
      rotation: parseFloat(cab.dataset.rotation) || 0
    }))
  };

  const blob = new Blob([JSON.stringify(layout, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "room_layout.json";
  a.click();
  URL.revokeObjectURL(a.href);
});

/* ---------- IMPORT LAYOUT ---------- */
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

      document.getElementById("roomWidth").value = data.room.width;
      document.getElementById("roomHeight").value = data.room.height;
      document.getElementById("gridSize").value = data.room.gridSize;
      updateRoom();

      cabinets.forEach(c => c.remove());
      cabinets = [];

      data.cabinets.forEach(cab => {
        const cabinet = document.createElement("div");
        cabinet.classList.add("cabinet");
        cabinet.style.width = cab.width * pixelsPerMeter + "px";
        cabinet.style.height = cab.height * pixelsPerMeter + "px";
        cabinet.style.background = cab.color;
        cabinet.style.left = cab.x + "px";
        cabinet.style.top = cab.y + "px";
        cabinet.style.transformOrigin = "center center";
        cabinet.style.transform = `rotate(${cab.rotation || 0}deg)`;

        // Add inner name element
        const nameEl = document.createElement("div");
        nameEl.classList.add("cabinet-name");
        nameEl.textContent = cab.name;
        nameEl.style.transform = `rotate(${-cab.rotation || 0}deg)`;
        cabinet.appendChild(nameEl);

        cabinet.dataset.name = cab.name;
        cabinet.dataset.width = cab.width;
        cabinet.dataset.height = cab.height;
        cabinet.dataset.color = cab.color;
        cabinet.dataset.rotation = cab.rotation || 0;

        room.appendChild(cabinet);
        cabinets.push(cabinet);
        enableDragging(cabinet);
        cabinet.addEventListener("click", e => selectCabinet(e, cabinet));
      });

      alert("Layout imported successfully!");
    } catch (err) {
      console.error(err);
      alert("Invalid JSON layout file!");
    }
  };

  reader.readAsText(file);
});
