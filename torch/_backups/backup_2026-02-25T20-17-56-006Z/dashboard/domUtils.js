// DOM utility functions for safe rendering

/**
 * Escapes unsafe HTML characters in a string.
 * @param {string} unsafe The string to escape.
 * @returns {string} The escaped string.
 */
export function escapeHtml(unsafe) {
  if (unsafe == null) return '';
  return String(unsafe)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Creates an element with optional class and text content.
 * @param {string} tag The tag name.
 * @param {string} [className] The class name(s).
 * @param {string} [text] The text content.
 * @returns {HTMLElement} The created element.
 */
export function createElement(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text != null) el.textContent = text;
  return el;
}
