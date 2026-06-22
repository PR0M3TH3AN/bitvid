// js/webtorrentHelpers.js
//
// Helpers extracted from webtorrent.js to keep that module under the file-size
// budget. The first group is pure (no instance state). requestClientsClaim and
// waitForActiveController take the TorrentClient instance (`ctx`) so behavior is
// identical to the former methods; the client keeps thin delegators so all call
// sites are unchanged. No behavior change.

import { safeDecodeURIComponent } from "./utils/safeDecode.js";

export function compareServiceWorkerScripts(a = "", b = "") {
  if (a === b) {
    return true;
  }

  try {
    const aUrl = new URL(a, window.location.origin);
    const bUrl = new URL(b, window.location.origin);
    return aUrl.pathname === bUrl.pathname;
  } catch {
    return false;
  }
}

export function normalizeTrackerList(trackers) {
  const normalized = [];
  const seen = new Set();
  if (!Array.isArray(trackers)) {
    return normalized;
  }
  trackers.forEach((tracker) => {
    if (typeof tracker !== "string") {
      return;
    }
    const trimmed = tracker.trim();
    if (!trimmed || !/^wss:\/\//i.test(trimmed)) {
      return;
    }
    const lower = trimmed.toLowerCase();
    if (seen.has(lower)) {
      return;
    }
    seen.add(lower);
    normalized.push(trimmed);
  });
  return normalized;
}

export function appendProbeTrackers(magnetURI, trackers) {
  if (typeof magnetURI !== "string") {
    return { magnet: "", appended: false, hasProbeTrackers: false };
  }

  const trimmedMagnet = magnetURI.trim();
  if (!trimmedMagnet) {
    return { magnet: "", appended: false, hasProbeTrackers: false };
  }

  const probeTrackers = normalizeTrackerList(trackers);
  if (!probeTrackers.length) {
    return {
      magnet: trimmedMagnet,
      appended: false,
      hasProbeTrackers: false,
    };
  }

  const trackerSet = new Set();
  const [withoutFragment, fragment = ""] = trimmedMagnet.split("#", 2);
  const [, queryPart = ""] = withoutFragment.split("?", 2);

  if (queryPart) {
    queryPart
      .split("&")
      .map((segment) => segment.trim())
      .filter(Boolean)
      .forEach((segment) => {
        const [rawKey, rawValue = ""] = segment.split("=", 2);
        if (!rawKey || rawKey.trim().toLowerCase() !== "tr") {
          return;
        }
        const decoded = safeDecodeURIComponent(rawValue).trim().toLowerCase();
        if (decoded) {
          trackerSet.add(decoded);
        }
      });
  }

  const normalizedProbe = probeTrackers.map((url) => url.toLowerCase());
  const hadProbeTracker = normalizedProbe.some((url) => trackerSet.has(url));

  const toAppend = [];
  probeTrackers.forEach((tracker, index) => {
    const normalizedTracker = normalizedProbe[index];
    if (trackerSet.has(normalizedTracker)) {
      return;
    }
    trackerSet.add(normalizedTracker);
    toAppend.push(`tr=${encodeURIComponent(tracker)}`);
  });

  if (!toAppend.length) {
    return {
      magnet: trimmedMagnet,
      appended: false,
      hasProbeTrackers: hadProbeTracker,
    };
  }

  const separator = queryPart ? "&" : "?";
  const augmented = `${withoutFragment}${separator}${toAppend.join("&")}`;
  const finalMagnet = fragment
    ? `${augmented}#${fragment}`
    : augmented;

  return {
    magnet: finalMagnet,
    appended: true,
    hasProbeTrackers: true,
  };
}

export function normalizeNumber(value, fallback = 0) {
  const coerced = Number(value);
  if (Number.isFinite(coerced)) {
    return coerced;
  }
  return fallback;
}

export function toError(err) {
  if (err instanceof Error) {
    return err;
  }
  try {
    return new Error(String(err));
  } catch (stringifyError) {
    return new Error("Unknown error");
  }
}

export function requestClientsClaim(ctx, registration = ctx.swRegistration) {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  try {
    const activeWorker = registration?.active;
    if (!activeWorker) {
      return;
    }

    // Some Chromium builds require an explicit startMessages() call before a
    // yet-to-claim worker will accept postMessage traffic. Calling it is a
    // harmless no-op elsewhere.
    if (navigator.serviceWorker.startMessages) {
      navigator.serviceWorker.startMessages();
    }

    activeWorker.postMessage({ type: "ENSURE_CLIENTS_CLAIM" });
  } catch (err) {
    ctx.log("Failed to request clients.claim():", err);
  }
}

export async function waitForActiveController(ctx, registration = ctx.swRegistration) {
  if (!("serviceWorker" in navigator)) {
    return null;
  }

  if (navigator.serviceWorker.controller) {
    return navigator.serviceWorker.controller;
  }

  ctx.requestClientsClaim(registration);

  return new Promise((resolve, reject) => {
    let timeoutId = null;
    let pollId = null;

    const cleanup = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      if (pollId) {
        clearInterval(pollId);
        pollId = null;
      }
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        onControllerChange
      );
    };

    const maybeResolve = () => {
      const controller = navigator.serviceWorker.controller;
      if (controller) {
        cleanup();
        resolve(controller);
        return true;
      }
      return false;
    };

    const onControllerChange = () => {
      if (maybeResolve()) {
        return;
      }
      // If we received a controllerchange event but still don't have a
      // controller it usually means the new worker hasn't claimed this page
      // yet. Ask it again to be safe.
      ctx.requestClientsClaim(registration);
    };

    timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error("Service worker controller claim timeout"));
    }, ctx.TIMEOUT_DURATION);

    pollId = setInterval(() => {
      if (maybeResolve()) {
        return;
      }
      ctx.requestClientsClaim(registration);
    }, 500);

    navigator.serviceWorker.addEventListener(
      "controllerchange",
      onControllerChange
    );

    // One last check in case the controller appeared between the earlier
    // synchronous guard and the promise wiring above.
    if (!maybeResolve()) {
      ctx.requestClientsClaim(registration);
    }
  });
}
