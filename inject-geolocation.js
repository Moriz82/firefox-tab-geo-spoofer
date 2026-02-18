"use strict";

(function overrideGeolocation() {
  const nativeGeolocation = navigator.geolocation;
  if (!nativeGeolocation || nativeGeolocation.__tabGeoSpooferInstalled) {
    return;
  }

  const realGetCurrentPosition = nativeGeolocation.getCurrentPosition.bind(nativeGeolocation);
  const realWatchPosition = nativeGeolocation.watchPosition.bind(nativeGeolocation);
  const realClearWatch = nativeGeolocation.clearWatch.bind(nativeGeolocation);

  let activeConfig = { enabled: false };
  let watchCounter = 900000;
  const localWatchTimers = new Map();

  function isEnabledConfig(config) {
    return (
      config &&
      config.enabled === true &&
      Number.isFinite(config.lat) &&
      Number.isFinite(config.lng)
    );
  }

  function normalizeConfig(config) {
    if (!isEnabledConfig(config)) {
      return { enabled: false };
    }
    return {
      enabled: true,
      lat: Number(config.lat),
      lng: Number(config.lng),
      accuracy: Number.isFinite(Number(config.accuracy))
        ? Number(config.accuracy)
        : 20
    };
  }

  function makePosition(config) {
    return {
      coords: {
        latitude: config.lat,
        longitude: config.lng,
        accuracy: config.accuracy,
        altitude: null,
        altitudeAccuracy: null,
        heading: null,
        speed: null
      },
      timestamp: Date.now()
    };
  }

  function emitSpoofedPosition(success) {
    if (typeof success === "function") {
      try {
        success(makePosition(activeConfig));
      } catch (error) {
        // Ignore consumer callback errors.
      }
    }
  }

  function startLocalWatcher(success, error, options) {
    const watchId = watchCounter++;
    const tick = () => {
      if (!localWatchTimers.has(watchId)) {
        return;
      }
      if (activeConfig.enabled) {
        emitSpoofedPosition(success);
      } else {
        realGetCurrentPosition(success, error, options);
      }
      const timerId = setTimeout(tick, 1000);
      localWatchTimers.set(watchId, timerId);
    };

    localWatchTimers.set(watchId, null);
    tick();
    return watchId;
  }

  nativeGeolocation.getCurrentPosition = function patchedGetCurrentPosition(success, error, options) {
    if (activeConfig.enabled) {
      setTimeout(() => emitSpoofedPosition(success), 0);
      return;
    }
    realGetCurrentPosition(success, error, options);
  };

  nativeGeolocation.watchPosition = function patchedWatchPosition(success, error, options) {
    if (!activeConfig.enabled) {
      return realWatchPosition(success, error, options);
    }
    return startLocalWatcher(success, error, options);
  };

  nativeGeolocation.clearWatch = function patchedClearWatch(watchId) {
    if (localWatchTimers.has(watchId)) {
      clearTimeout(localWatchTimers.get(watchId));
      localWatchTimers.delete(watchId);
      return;
    }
    realClearWatch(watchId);
  };

  nativeGeolocation.__tabGeoSpooferInstalled = true;

  window.addEventListener("message", (event) => {
    if (event.source !== window || !event.data || event.data.source !== "tab-geo-extension") {
      return;
    }
    if (event.data.type === "set-config") {
      activeConfig = normalizeConfig(event.data.config);
    }
  });

  window.postMessage(
    {
      source: "tab-geo-page",
      type: "request-config"
    },
    "*"
  );
})();
