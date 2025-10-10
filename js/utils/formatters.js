// js/utils/formatters.js

/**
 * Shortens a string by replacing the middle with an ellipsis when it exceeds
 * the desired length. Ensures the returned string never exceeds `maxLength`.
 */
export function truncateMiddle(text, maxLength = 72) {
  if (!text || typeof text !== "string") {
    return "";
  }

  if (text.length <= maxLength) {
    return text;
  }

  const ellipsis = "…";
  const charsToShow = maxLength - ellipsis.length;
  const front = Math.ceil(charsToShow / 2);
  const back = Math.floor(charsToShow / 2);
  return `${text.slice(0, front)}${ellipsis}${text.slice(text.length - back)}`;
}

/**
 * Formats a timestamp (in seconds) to a localized string. Falls back to
 * ISO-8601 formatting if locale formatting fails.
 */
export function formatAbsoluteTimestamp(timestamp) {
  if (!Number.isFinite(timestamp)) {
    return "Unknown date";
  }

  const date = new Date(timestamp * 1000);
  if (Number.isNaN(date.getTime())) {
    return "Unknown date";
  }

  try {
    return date.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch (err) {
    return date.toISOString();
  }
}

/**
 * Returns a human readable "time ago" string for a timestamp (in seconds).
 */
export function formatTimeAgo(timestamp) {
  const seconds = Math.floor(Date.now() / 1000 - timestamp);
  const intervals = {
    year: 31536000,
    month: 2592000,
    week: 604800,
    day: 86400,
    hour: 3600,
    minute: 60,
  };
  for (const [unit, secInUnit] of Object.entries(intervals)) {
    const int = Math.floor(seconds / secInUnit);
    if (int >= 1) {
      return `${int} ${unit}${int > 1 ? "s" : ""} ago`;
    }
  }
  return "just now";
}
