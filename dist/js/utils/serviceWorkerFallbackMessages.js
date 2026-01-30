// js/utils/serviceWorkerFallbackMessages.js

const BASE_STATUS_MESSAGE = "Streaming via WebTorrent";

function normalizeMessage(error) {
  if (!error) {
    return "";
  }
  if (error instanceof Error && typeof error.message === "string") {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  try {
    return String(error);
  } catch (_err) {
    return "";
  }
}

export function buildServiceWorkerFallbackStatus(error) {
  const rawMessage = normalizeMessage(error);
  const normalized = rawMessage.toLowerCase();

  if (!normalized) {
    return `${BASE_STATUS_MESSAGE} (service worker unavailable)`;
  }

  if (normalized.includes("https or localhost required")) {
    return `${BASE_STATUS_MESSAGE} (serve over HTTPS to enable service worker)`;
  }

  if (normalized.includes("not supported") || normalized.includes("disabled")) {
    return `${BASE_STATUS_MESSAGE} (browser disabled service workers)`;
  }

  if (normalized.includes("brave shield")) {
    return `${BASE_STATUS_MESSAGE} (Brave Shields blocked the service worker)`;
  }

  if (
    normalized.includes("failed to register") ||
    normalized.includes("failed to fetch") ||
    normalized.includes("blocked") ||
    normalized.includes("net::err_blocked_by_client")
  ) {
    return `${BASE_STATUS_MESSAGE} (service worker blocked by browser or extension)`;
  }

  if (normalized.includes("controller claim timeout")) {
    return `${BASE_STATUS_MESSAGE} (waiting for service worker control)`;
  }

  return `${BASE_STATUS_MESSAGE} (service worker unavailable)`;
}

export default buildServiceWorkerFallbackStatus;
