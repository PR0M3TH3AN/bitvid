// js/tracking.js
// Centralized configuration and loader for the site's analytics script.
// Update `bitvidTrackingConfig` to change the tracking provider or settings.
window.bitvidTrackingConfig = window.bitvidTrackingConfig || {
  src: "https://umami.malin.onl/script.js",
  websiteId: "1f8eead2-79f0-4dba-8c3b-ed9b08b6e877",
};

(function loadTrackingScript(config) {
  if (!config || !config.src) {
    return;
  }

  if (document.querySelector(`script[src="${config.src}"]`)) {
    return;
  }

  const script = document.createElement("script");
  script.src = config.src;
  script.defer = true;

  if (config.websiteId) {
    script.setAttribute("data-website-id", config.websiteId);
  }

  const additionalAttributes = config.attributes || {};
  Object.entries(additionalAttributes).forEach(([key, value]) => {
    if (key === "defer") {
      script.defer = Boolean(value);
      return;
    }

    if (value === false || value === null || typeof value === "undefined") {
      return;
    }

    script.setAttribute(key, value);
  });

  document.head.appendChild(script);
})(window.bitvidTrackingConfig);
