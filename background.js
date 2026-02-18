"use strict";

const PRESETS_KEY = "geoPresets";
const DEFAULT_ACCURACY = 20;
const tabOverrides = new Map();

function asNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function sanitizeCoordinate(value, min, max) {
  const parsed = asNumber(value);
  if (parsed === null || parsed < min || parsed > max) {
    return null;
  }
  return parsed;
}

function sanitizeAccuracy(value) {
  const parsed = asNumber(value);
  if (parsed === null || parsed < 1 || parsed > 100000) {
    return DEFAULT_ACCURACY;
  }
  return parsed;
}

function normalizeTabConfig(config) {
  if (!config) {
    return null;
  }
  const lat = sanitizeCoordinate(config.lat, -90, 90);
  const lng = sanitizeCoordinate(config.lng, -180, 180);
  if (lat === null || lng === null) {
    return null;
  }

  return {
    enabled: true,
    lat,
    lng,
    accuracy: sanitizeAccuracy(config.accuracy)
  };
}

function normalizePresetName(name) {
  if (typeof name !== "string") {
    return "";
  }
  return name.trim().slice(0, 64);
}

function getTabId(message, sender) {
  if (Number.isInteger(message.tabId) && message.tabId >= 0) {
    return message.tabId;
  }
  if (sender && sender.tab && Number.isInteger(sender.tab.id)) {
    return sender.tab.id;
  }
  return null;
}

function getTabConfig(tabId) {
  return tabOverrides.get(tabId) || { enabled: false };
}

async function notifyTabConfig(tabId) {
  try {
    await browser.tabs.sendMessage(tabId, {
      type: "tab-config-updated",
      config: getTabConfig(tabId)
    });
  } catch (error) {
    // Ignore pages that cannot receive messages (about:, restricted pages).
  }
}

async function loadPresets() {
  const stored = await browser.storage.local.get(PRESETS_KEY);
  const presets = stored[PRESETS_KEY];
  return Array.isArray(presets) ? presets : [];
}

async function savePresets(presets) {
  await browser.storage.local.set({ [PRESETS_KEY]: presets });
}

browser.tabs.onRemoved.addListener((tabId) => {
  tabOverrides.delete(tabId);
});

browser.runtime.onMessage.addListener(async (message, sender) => {
  if (!message || typeof message.type !== "string") {
    return { ok: false, error: "Invalid request." };
  }

  if (message.type === "get-tab-config") {
    const tabId = getTabId(message, sender);
    if (tabId === null) {
      return { ok: false, error: "No tab context found." };
    }
    return { ok: true, config: getTabConfig(tabId) };
  }

  if (message.type === "set-tab-config") {
    const tabId = getTabId(message, sender);
    if (tabId === null) {
      return { ok: false, error: "No tab selected." };
    }
    const config = normalizeTabConfig(message.config);
    if (!config) {
      return { ok: false, error: "Latitude/longitude are invalid." };
    }

    tabOverrides.set(tabId, config);
    await notifyTabConfig(tabId);
    return { ok: true, config };
  }

  if (message.type === "reset-tab-config") {
    const tabId = getTabId(message, sender);
    if (tabId === null) {
      return { ok: false, error: "No tab selected." };
    }

    tabOverrides.delete(tabId);
    await notifyTabConfig(tabId);
    return { ok: true, config: getTabConfig(tabId) };
  }

  if (message.type === "list-presets") {
    const presets = await loadPresets();
    return { ok: true, presets };
  }

  if (message.type === "save-preset") {
    const config = normalizeTabConfig(message.config);
    const name = normalizePresetName(message.name);
    if (!config) {
      return { ok: false, error: "Preset coordinates are invalid." };
    }
    if (!name) {
      return { ok: false, error: "Preset name is required." };
    }

    const presets = await loadPresets();
    const preset = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      name,
      lat: config.lat,
      lng: config.lng,
      accuracy: config.accuracy
    };
    presets.push(preset);
    await savePresets(presets);
    return { ok: true, preset, presets };
  }

  if (message.type === "delete-preset") {
    const id = typeof message.id === "string" ? message.id : "";
    if (!id) {
      return { ok: false, error: "Preset id is required." };
    }
    const presets = await loadPresets();
    const next = presets.filter((item) => item.id !== id);
    await savePresets(next);
    return { ok: true, presets: next };
  }

  return { ok: false, error: "Unknown request type." };
});
