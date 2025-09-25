// js/analytics.js
import { ANALYTICS_CONFIG } from "./analyticsConfig.js";

const SCRIPT_ATTR = "data-bitvid-analytics";
const SCRIPT_IDENTIFIER = "umami";
const pendingCalls = [];
let flushTimerId = null;
let scriptLoadedOnce = false;

function isBrowserEnvironment() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function flushPendingCalls() {
  if (!isBrowserEnvironment()) {
    return;
  }

  const umami = window.umami;
  if (!umami) {
    return;
  }

  while (pendingCalls.length > 0) {
    const { method, args } = pendingCalls.shift();
    const fn = typeof umami[method] === "function" ? umami[method] : null;
    if (!fn) {
      continue;
    }
    try {
      fn.apply(umami, args);
    } catch (err) {
      console.warn("[analytics] Failed to call", method, err);
    }
  }
}

function scheduleFlush() {
  if (!isBrowserEnvironment()) {
    return;
  }

  if (flushTimerId !== null) {
    return;
  }

  flushTimerId = window.setInterval(() => {
    if (window.umami && typeof window.umami.track === "function") {
      window.clearInterval(flushTimerId);
      flushTimerId = null;
      flushPendingCalls();
    }
  }, 500);
}

export function ensureAnalyticsLoaded(doc = typeof document !== "undefined" ? document : null) {
  if (!doc) {
    return null;
  }

  let script = doc.querySelector(`script[${SCRIPT_ATTR}]`);
  if (script) {
    if (!scriptLoadedOnce) {
      // If a server rendered script already exists, make sure we flush asap.
      scriptLoadedOnce = true;
      flushPendingCalls();
    }
    return script;
  }

  script = doc.createElement("script");
  script.defer = true;
  script.src = ANALYTICS_CONFIG.scriptSrc;
  script.setAttribute(SCRIPT_ATTR, SCRIPT_IDENTIFIER);
  script.dataset.websiteId = ANALYTICS_CONFIG.websiteId;
  script.dataset.autoTrack = "false";
  script.addEventListener("load", () => {
    scriptLoadedOnce = true;
    flushPendingCalls();
  });
  doc.head.appendChild(script);

  scheduleFlush();

  return script;
}

function queueCall(method, args) {
  pendingCalls.push({ method, args });
  scheduleFlush();
}

function invokeUmami(method, args) {
  if (!isBrowserEnvironment()) {
    return;
  }

  ensureAnalyticsLoaded();

  const umami = window.umami;
  if (umami && typeof umami[method] === "function") {
    try {
      umami[method].apply(umami, args);
    } catch (err) {
      console.warn("[analytics] Failed to call", method, err);
    }
    return;
  }

  queueCall(method, args);
}

export function trackPageView(path, referrer) {
  if (!isBrowserEnvironment()) {
    return;
  }

  const resolvedPath =
    typeof path === "string" && path.length > 0
      ? path
      : `${window.location.pathname}${window.location.hash || ""}`;

  const resolvedReferrer =
    typeof referrer === "string" ? referrer : document.referrer || "";

  let absoluteUrl = resolvedPath;
  try {
    absoluteUrl = new URL(resolvedPath, window.location.origin).toString();
  } catch (err) {
    // Fall back to the provided path if it cannot be resolved.
  }

  let absoluteReferrer = resolvedReferrer;
  if (resolvedReferrer) {
    try {
      absoluteReferrer = new URL(resolvedReferrer, window.location.origin).toString();
    } catch (err) {
      // Keep original referrer if it cannot be normalized.
    }
  }

  invokeUmami("track", [
    (basePayload = {}) => ({
      ...basePayload,
      url: absoluteUrl || basePayload.url,
      referrer: absoluteReferrer || basePayload.referrer,
    }),
    "pageview",
  ]);
}

export function trackVideoView({
  videoId,
  title,
  source,
  hasMagnet,
  hasUrl,
} = {}) {
  if (!isBrowserEnvironment()) {
    return;
  }

  const payload = {};

  if (videoId) {
    payload.videoId = String(videoId);
  }

  if (title) {
    payload.title = String(title);
  }

  if (source) {
    payload.source = String(source);
  }

  if (typeof hasMagnet === "boolean") {
    payload.hasMagnet = hasMagnet;
  }

  if (typeof hasUrl === "boolean") {
    payload.hasUrl = hasUrl;
  }

  invokeUmami("track", [
    ANALYTICS_CONFIG.videoViewEventName,
    payload,
  ]);
}

// Immediately queue the analytics script so page views are captured early.
if (isBrowserEnvironment()) {
  ensureAnalyticsLoaded();
}
