"use strict";

const TILE_SIZE = 256;
const MIN_ZOOM = 1;
const MAX_ZOOM = 18;
const MAX_MERCATOR_LAT = 85.05112878;

const state = {
  tabId: null,
  presets: [],
  map: {
    centerLat: 20,
    centerLng: 0,
    zoom: 2,
    marker: null,
    dragging: false,
    dragMoved: false,
    dragStart: null,
    renderInfo: null,
    tileLayer: null,
    markerEl: null
  }
};

const els = {
  tabContext: document.getElementById("tab-context"),
  status: document.getElementById("status"),
  latitude: document.getElementById("latitude"),
  longitude: document.getElementById("longitude"),
  accuracy: document.getElementById("accuracy"),
  applyBtn: document.getElementById("apply-btn"),
  resetBtn: document.getElementById("reset-btn"),
  map: document.getElementById("map"),
  zoomOut: document.getElementById("zoom-out"),
  zoomIn: document.getElementById("zoom-in"),
  zoomLevel: document.getElementById("zoom-level"),
  presetName: document.getElementById("preset-name"),
  savePresetBtn: document.getElementById("save-preset-btn"),
  presetSelect: document.getElementById("preset-select"),
  applyPresetBtn: document.getElementById("apply-preset-btn"),
  deletePresetBtn: document.getElementById("delete-preset-btn")
};

function setStatus(message, isError) {
  els.status.textContent = message || "";
  els.status.classList.toggle("error", Boolean(isError));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function wrap(value, max) {
  return ((value % max) + max) % max;
}

function normalizeLng(lng) {
  const wrapped = ((lng + 180) % 360 + 360) % 360 - 180;
  if (wrapped === -180) {
    return 180;
  }
  return wrapped;
}

function clampMapLat(lat) {
  return clamp(lat, -MAX_MERCATOR_LAT, MAX_MERCATOR_LAT);
}

function clampGeoLat(lat) {
  return clamp(lat, -90, 90);
}

function latLngToWorld(lat, lng, zoom) {
  const boundedLat = clampMapLat(lat);
  const sin = Math.sin((boundedLat * Math.PI) / 180);
  const size = TILE_SIZE * Math.pow(2, zoom);

  return {
    x: ((normalizeLng(lng) + 180) / 360) * size,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * size
  };
}

function worldToLatLng(x, y, zoom) {
  const size = TILE_SIZE * Math.pow(2, zoom);
  const lng = (x / size) * 360 - 180;
  const mercatorY = Math.PI - (2 * Math.PI * y) / size;
  const lat =
    (180 / Math.PI) *
    Math.atan(0.5 * (Math.exp(mercatorY) - Math.exp(-mercatorY)));
  return {
    lat: clampMapLat(lat),
    lng: normalizeLng(lng)
  };
}

function formatCoordinate(value) {
  return Number(value).toFixed(6);
}

function formatAccuracy(value) {
  return String(Math.round(Number(value)));
}

function updateZoomLabel() {
  els.zoomLevel.textContent = `Zoom ${state.map.zoom}`;
}

function fillCoordinateInputs(lat, lng) {
  els.latitude.value = formatCoordinate(lat);
  els.longitude.value = formatCoordinate(lng);
}

function readConfigFromInputs() {
  const lat = Number.parseFloat(els.latitude.value);
  const lng = Number.parseFloat(els.longitude.value);
  const accuracy = Number.parseFloat(els.accuracy.value);

  if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
    throw new Error("Latitude must be between -90 and 90.");
  }
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
    throw new Error("Longitude must be between -180 and 180.");
  }
  if (!Number.isFinite(accuracy) || accuracy < 1 || accuracy > 100000) {
    throw new Error("Accuracy must be between 1 and 100000.");
  }

  return {
    lat,
    lng,
    accuracy
  };
}

function setMarker(lat, lng, shouldCenter) {
  state.map.marker = {
    lat: clampGeoLat(lat),
    lng: normalizeLng(lng)
  };
  fillCoordinateInputs(state.map.marker.lat, state.map.marker.lng);
  if (shouldCenter) {
    state.map.centerLat = state.map.marker.lat;
    state.map.centerLng = state.map.marker.lng;
  }
  renderMap();
}

function createTileElement(x, y, left, top, zoom) {
  const tile = document.createElement("img");
  tile.className = "map-tile";
  tile.alt = "";
  tile.draggable = false;
  tile.style.left = `${left}px`;
  tile.style.top = `${top}px`;
  tile.src = `https://tile.openstreetmap.org/${zoom}/${x}/${y}.png`;
  return tile;
}

function renderMap() {
  const { map } = state;
  const width = els.map.clientWidth;
  const height = els.map.clientHeight;
  if (!width || !height) {
    return;
  }

  const worldTiles = Math.pow(2, map.zoom);
  const worldSize = TILE_SIZE * worldTiles;
  const centerWorld = latLngToWorld(map.centerLat, map.centerLng, map.zoom);
  const topLeftX = centerWorld.x - width / 2;
  const topLeftY = centerWorld.y - height / 2;

  map.tileLayer.textContent = "";

  const startX = Math.floor(topLeftX / TILE_SIZE);
  const endX = Math.floor((topLeftX + width) / TILE_SIZE);
  const startY = Math.floor(topLeftY / TILE_SIZE);
  const endY = Math.floor((topLeftY + height) / TILE_SIZE);

  for (let tileY = startY; tileY <= endY; tileY += 1) {
    if (tileY < 0 || tileY >= worldTiles) {
      continue;
    }
    for (let tileX = startX; tileX <= endX; tileX += 1) {
      const wrappedX = wrap(tileX, worldTiles);
      const left = tileX * TILE_SIZE - topLeftX;
      const top = tileY * TILE_SIZE - topLeftY;
      map.tileLayer.appendChild(
        createTileElement(wrappedX, tileY, left, top, map.zoom)
      );
    }
  }

  if (map.marker) {
    const markerWorld = latLngToWorld(map.marker.lat, map.marker.lng, map.zoom);
    const dx = markerWorld.x - centerWorld.x;
    if (dx > worldSize / 2) {
      markerWorld.x -= worldSize;
    } else if (dx < -worldSize / 2) {
      markerWorld.x += worldSize;
    }

    map.markerEl.hidden = false;
    map.markerEl.style.left = `${markerWorld.x - topLeftX}px`;
    map.markerEl.style.top = `${markerWorld.y - topLeftY}px`;
  } else {
    map.markerEl.hidden = true;
  }

  map.renderInfo = {
    width,
    height,
    worldSize,
    topLeftX,
    topLeftY
  };
}

function screenToLatLng(clientX, clientY) {
  const info = state.map.renderInfo;
  if (!info) {
    return null;
  }
  const rect = els.map.getBoundingClientRect();
  const offsetX = clientX - rect.left;
  const offsetY = clientY - rect.top;

  if (
    offsetX < 0 ||
    offsetX > info.width ||
    offsetY < 0 ||
    offsetY > info.height
  ) {
    return null;
  }

  const worldX = wrap(info.topLeftX + offsetX, info.worldSize);
  const worldY = clamp(info.topLeftY + offsetY, 0, info.worldSize);
  return worldToLatLng(worldX, worldY, state.map.zoom);
}

function setZoom(nextZoom, anchorClientX, anchorClientY) {
  const oldInfo = state.map.renderInfo;
  if (!oldInfo) {
    return;
  }
  const zoom = clamp(nextZoom, MIN_ZOOM, MAX_ZOOM);
  if (zoom === state.map.zoom) {
    return;
  }

  const rect = els.map.getBoundingClientRect();
  const anchorX =
    typeof anchorClientX === "number"
      ? anchorClientX - rect.left
      : oldInfo.width / 2;
  const anchorY =
    typeof anchorClientY === "number"
      ? anchorClientY - rect.top
      : oldInfo.height / 2;

  const worldX = wrap(oldInfo.topLeftX + anchorX, oldInfo.worldSize);
  const worldY = clamp(oldInfo.topLeftY + anchorY, 0, oldInfo.worldSize);
  const anchorLatLng = worldToLatLng(worldX, worldY, state.map.zoom);

  state.map.zoom = zoom;
  const newAnchorWorld = latLngToWorld(
    anchorLatLng.lat,
    anchorLatLng.lng,
    state.map.zoom
  );
  const newWorldSize = TILE_SIZE * Math.pow(2, state.map.zoom);

  const centerWorldX = wrap(newAnchorWorld.x - anchorX + oldInfo.width / 2, newWorldSize);
  const centerWorldY = clamp(
    newAnchorWorld.y - anchorY + oldInfo.height / 2,
    0,
    newWorldSize
  );

  const centerLatLng = worldToLatLng(centerWorldX, centerWorldY, state.map.zoom);
  state.map.centerLat = centerLatLng.lat;
  state.map.centerLng = centerLatLng.lng;

  updateZoomLabel();
  renderMap();
}

async function sendMessage(message) {
  return browser.runtime.sendMessage(message);
}

async function loadPresets() {
  const response = await sendMessage({ type: "list-presets" });
  if (!response || !response.ok) {
    throw new Error((response && response.error) || "Failed to load presets.");
  }
  state.presets = response.presets || [];
}

function renderPresets() {
  els.presetSelect.textContent = "";
  if (!state.presets.length) {
    const option = document.createElement("option");
    option.textContent = "No presets saved";
    option.disabled = true;
    option.selected = true;
    els.presetSelect.appendChild(option);
    return;
  }

  for (const preset of state.presets) {
    const option = document.createElement("option");
    option.value = preset.id;
    option.textContent = `${preset.name} (${preset.lat.toFixed(4)}, ${preset.lng.toFixed(4)})`;
    els.presetSelect.appendChild(option);
  }
}

function getSelectedPreset() {
  const id = els.presetSelect.value;
  return state.presets.find((preset) => preset.id === id) || null;
}

async function applyConfigToCurrentTab(config) {
  if (state.tabId === null) {
    throw new Error("No active tab found.");
  }
  const response = await sendMessage({
    type: "set-tab-config",
    tabId: state.tabId,
    config
  });

  if (!response || !response.ok) {
    throw new Error((response && response.error) || "Failed to apply location.");
  }

  setStatus(
    `Spoofing this tab at ${config.lat.toFixed(5)}, ${config.lng.toFixed(5)}.`,
    false
  );
}

function bindMapEvents() {
  els.map.addEventListener("mousedown", (event) => {
    if (event.button !== 0) {
      return;
    }
    const centerWorld = latLngToWorld(
      state.map.centerLat,
      state.map.centerLng,
      state.map.zoom
    );
    state.map.dragging = true;
    state.map.dragMoved = false;
    state.map.dragStart = {
      clientX: event.clientX,
      clientY: event.clientY,
      centerX: centerWorld.x,
      centerY: centerWorld.y
    };
    event.preventDefault();
  });

  window.addEventListener("mousemove", (event) => {
    if (!state.map.dragging || !state.map.dragStart) {
      return;
    }
    const deltaX = event.clientX - state.map.dragStart.clientX;
    const deltaY = event.clientY - state.map.dragStart.clientY;
    if (Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2) {
      state.map.dragMoved = true;
    }

    const worldSize = TILE_SIZE * Math.pow(2, state.map.zoom);
    const centerX = wrap(state.map.dragStart.centerX - deltaX, worldSize);
    const centerY = clamp(state.map.dragStart.centerY - deltaY, 0, worldSize);
    const centerLatLng = worldToLatLng(centerX, centerY, state.map.zoom);
    state.map.centerLat = centerLatLng.lat;
    state.map.centerLng = centerLatLng.lng;
    renderMap();
  });

  window.addEventListener("mouseup", () => {
    state.map.dragging = false;
    state.map.dragStart = null;
  });

  els.map.addEventListener("click", (event) => {
    if (state.map.dragMoved) {
      state.map.dragMoved = false;
      return;
    }
    const selected = screenToLatLng(event.clientX, event.clientY);
    if (!selected) {
      return;
    }
    setMarker(selected.lat, selected.lng, false);
  });

  els.map.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      const direction = event.deltaY < 0 ? 1 : -1;
      setZoom(state.map.zoom + direction, event.clientX, event.clientY);
    },
    { passive: false }
  );
}

function bindUiEvents() {
  els.applyBtn.addEventListener("click", async () => {
    try {
      const config = readConfigFromInputs();
      setMarker(config.lat, config.lng, true);
      await applyConfigToCurrentTab(config);
    } catch (error) {
      setStatus(error.message, true);
    }
  });

  els.resetBtn.addEventListener("click", async () => {
    if (state.tabId === null) {
      setStatus("No active tab found.", true);
      return;
    }
    try {
      const response = await sendMessage({
        type: "reset-tab-config",
        tabId: state.tabId
      });
      if (!response || !response.ok) {
        throw new Error(
          (response && response.error) || "Failed to reset location."
        );
      }
      setStatus("Real device location restored for this tab.", false);
    } catch (error) {
      setStatus(error.message, true);
    }
  });

  els.zoomIn.addEventListener("click", () => {
    setZoom(state.map.zoom + 1);
  });

  els.zoomOut.addEventListener("click", () => {
    setZoom(state.map.zoom - 1);
  });

  els.savePresetBtn.addEventListener("click", async () => {
    try {
      const config = readConfigFromInputs();
      const name = els.presetName.value.trim();
      if (!name) {
        throw new Error("Preset name is required.");
      }
      const response = await sendMessage({
        type: "save-preset",
        name,
        config
      });
      if (!response || !response.ok) {
        throw new Error((response && response.error) || "Failed to save preset.");
      }
      state.presets = response.presets || [];
      els.presetName.value = "";
      renderPresets();
      setStatus(`Preset "${name}" saved.`, false);
    } catch (error) {
      setStatus(error.message, true);
    }
  });

  els.applyPresetBtn.addEventListener("click", async () => {
    const preset = getSelectedPreset();
    if (!preset) {
      setStatus("Select a preset first.", true);
      return;
    }
    const config = {
      lat: Number(preset.lat),
      lng: Number(preset.lng),
      accuracy: Number(preset.accuracy) || 20
    };
    els.accuracy.value = formatAccuracy(config.accuracy);
    setMarker(config.lat, config.lng, true);
    try {
      await applyConfigToCurrentTab(config);
    } catch (error) {
      setStatus(error.message, true);
    }
  });

  els.deletePresetBtn.addEventListener("click", async () => {
    const preset = getSelectedPreset();
    if (!preset) {
      setStatus("Select a preset to delete.", true);
      return;
    }
    try {
      const response = await sendMessage({
        type: "delete-preset",
        id: preset.id
      });
      if (!response || !response.ok) {
        throw new Error(
          (response && response.error) || "Failed to delete preset."
        );
      }
      state.presets = response.presets || [];
      renderPresets();
      setStatus(`Preset "${preset.name}" deleted.`, false);
    } catch (error) {
      setStatus(error.message, true);
    }
  });
}

async function initTab() {
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  const activeTab = tabs[0];
  if (!activeTab || !Number.isInteger(activeTab.id)) {
    throw new Error("No active tab found.");
  }

  state.tabId = activeTab.id;
  const rawUrl = activeTab.url || "(unknown URL)";
  try {
    const parsed = new URL(rawUrl);
    els.tabContext.textContent = `Current tab: ${parsed.hostname}`;
  } catch (error) {
    els.tabContext.textContent = `Current tab: ${rawUrl}`;
  }

  const response = await sendMessage({
    type: "get-tab-config",
    tabId: state.tabId
  });
  if (!response || !response.ok) {
    throw new Error((response && response.error) || "Unable to load tab settings.");
  }

  if (response.config && response.config.enabled) {
    const lat = Number(response.config.lat);
    const lng = Number(response.config.lng);
    const accuracy = Number(response.config.accuracy) || 20;
    els.accuracy.value = formatAccuracy(accuracy);
    setMarker(lat, lng, true);
    setStatus(
      `Using saved spoofed location for this tab (${lat.toFixed(5)}, ${lng.toFixed(5)}).`,
      false
    );
  } else {
    els.accuracy.value = formatAccuracy(20);
  }
}

function initMap() {
  state.map.tileLayer = document.createElement("div");
  state.map.tileLayer.className = "tile-layer";
  els.map.appendChild(state.map.tileLayer);

  state.map.markerEl = document.createElement("div");
  state.map.markerEl.className = "marker";
  state.map.markerEl.hidden = true;
  els.map.appendChild(state.map.markerEl);

  updateZoomLabel();
  renderMap();
  bindMapEvents();
}

async function init() {
  bindUiEvents();
  initMap();

  try {
    await loadPresets();
    renderPresets();
    await initTab();
  } catch (error) {
    setStatus(error.message || "Failed to initialize extension.", true);
  }
}

init();
