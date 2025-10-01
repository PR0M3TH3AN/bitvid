// js/loadingTemplates.js

const HTML_ESCAPE_LOOKUP = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

const HTML_ESCAPE_PATTERN = /[&<>"']/g;

function escapeHtml(value) {
  if (typeof value !== "string" || !value) {
    return "";
  }

  return value.replace(HTML_ESCAPE_PATTERN, (char) => HTML_ESCAPE_LOOKUP[char] || char);
}

export function buildFetchingMessage(message) {
  const fallback = "Fetching…";
  const trimmed = typeof message === "string" ? message.trim() : "";
  const safeMessage = trimmed || fallback;

  return `
    <div class="flex flex-col items-center justify-center py-12 space-y-4 text-gray-500">
      <span class="status-spinner status-spinner--inline" aria-hidden="true"></span>
      <p class="text-center">${escapeHtml(safeMessage)}</p>
    </div>
  `;
}
