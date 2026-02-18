"use strict";

(function injectPageScript() {
  const target = document.documentElement || document.head;
  if (!target) {
    return;
  }
  const script = document.createElement("script");
  script.src = browser.runtime.getURL("inject-geolocation.js");
  script.async = false;
  target.appendChild(script);
  script.remove();
})();

function postConfigToPage(config) {
  window.postMessage(
    {
      source: "tab-geo-extension",
      type: "set-config",
      config
    },
    "*"
  );
}

async function requestCurrentConfig() {
  try {
    const response = await browser.runtime.sendMessage({ type: "get-tab-config" });
    if (response && response.ok) {
      postConfigToPage(response.config);
    }
  } catch (error) {
    // Ignore pages where extension messaging is not available.
  }
}

window.addEventListener("message", (event) => {
  if (event.source !== window || !event.data || event.data.source !== "tab-geo-page") {
    return;
  }
  if (event.data.type === "request-config") {
    requestCurrentConfig();
  }
});

browser.runtime.onMessage.addListener((message) => {
  if (!message || message.type !== "tab-config-updated") {
    return;
  }
  postConfigToPage(message.config);
});

requestCurrentConfig();
