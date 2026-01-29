// js/utils/domUtils.js

const TRACKING_SCRIPT_PATTERN = /(?:^|\/)tracking\.js(?:$|\?)/;

/**
 * Removes script tags that match known tracking script patterns.
 */
export function removeTrackingScripts(root) {
  if (!root || typeof root.querySelectorAll !== "function") {
    return;
  }

  root.querySelectorAll("script[src]").forEach((script) => {
    const src = script.getAttribute("src") || "";
    if (TRACKING_SCRIPT_PATTERN.test(src)) {
      script.remove();
    }
  });
}

/**
 * Escapes HTML entities in a string to prevent XSS when injecting content.
 */
export function escapeHTML(unsafe) {
  if (unsafe === null || typeof unsafe === "undefined") {
    return "";
  }

  return String(unsafe)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
