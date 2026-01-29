// js/sidebarLoading.js

function escapeHtml(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function getSidebarLoadingMarkup(message = "", options = {}) {
  const trimmed = typeof message === "string" ? message.trim() : "";
  const copy = trimmed || "Fetching data…";
  const safeCopy = escapeHtml(copy);
  const showSpinner = options?.showSpinner !== false;
  const spinnerMarkup = showSpinner
    ? '<span class="status-spinner status-spinner--inline" aria-hidden="true"></span>'
    : "";

  return `
    <div class="sidebar-loading-wrapper" role="status" aria-live="polite">
      <div class="sidebar-loading-indicator">
        ${spinnerMarkup}
        <span class="sidebar-loading-text">${safeCopy}</span>
      </div>
    </div>
  `;
}
