// HLS (.m3u8) playback support.
//
// bitvid historically attached every hosted source with `videoEl.src = url`.
// That works for progressive MP4/WebM but NOT for HLS: only Safari/iOS can play
// an .m3u8 natively, so on Chrome/Firefox the element fails immediately with
// MEDIA_ERR_SRC_NOT_SUPPORTED ("Hosted playback failed: source not supported or
// blocked."). Nostr clients that publish bitvid's v3 schema with HLS ladders
// (e.g. nostube/slidestr) were therefore unplayable everywhere but Safari.
//
// This module owns the decision + the hls.js lifecycle. hls.js is vendored
// (scripts/build-hls.mjs) and lazy-imported ONLY when an HLS URL is actually
// encountered, so the ~500KB bundle never touches a normal MP4/WebTorrent load.
//
// Rollback: stop calling attachHlsSource() from playbackService/playbackCoordinator
// and the old `videoEl.src = url` behavior returns; nothing else imports this.
import { devLogger } from "../utils/logger.js";

// Vendored, pinned hls.js bundle (scripts/build-hls.mjs). Lazy-imported.
const HLS_BUNDLE_URL = "../../vendor/hls.bundle.min.js";

// Canonical + legacy HLS media types. Servers are wildly inconsistent here —
// the slidestr CDN serves playlists as `text/plain` — so the URL extension is
// the primary signal and the MIME type is only ever corroborating evidence.
export const HLS_MIME_TYPES = Object.freeze([
  "application/vnd.apple.mpegurl",
  "application/x-mpegurl",
  "audio/mpegurl",
  "audio/x-mpegurl",
  "application/mpegurl",
  "vnd.apple.mpegurl",
]);

/**
 * True when the URL's *path* ends in .m3u8. Query strings and fragments are
 * ignored (signed CDN URLs routinely carry `?token=...`), and a bare .m3u8
 * substring elsewhere in the URL must not match.
 */
export function isHlsUrl(url) {
  const trimmed = typeof url === "string" ? url.trim() : "";
  if (!trimmed) {
    return false;
  }
  // Strip fragment then query, without `new URL()` — relative/odd inputs must
  // not throw, and bitvid never runs URL parsers over user-supplied media
  // strings (see the magnet rules in AGENTS.md).
  const path = trimmed.split("#")[0].split("?")[0];
  return /\.m3u8$/i.test(path);
}

/** True when a declared MIME type is one of the HLS playlist types. */
export function isHlsMimeType(mimeType) {
  const normalized =
    typeof mimeType === "string" ? mimeType.trim().toLowerCase() : "";
  if (!normalized) {
    return false;
  }
  const bare = normalized.split(";")[0].trim();
  return HLS_MIME_TYPES.includes(bare);
}

/** Combined check used by callers that may have an imeta `m` hint. */
export function isHlsSource({ url = "", mimeType = "" } = {}) {
  return isHlsUrl(url) || isHlsMimeType(mimeType);
}

/**
 * Whether `canPlayType` claims native HLS support.
 *
 * DO NOT branch on this alone. Chrome LIES here: Chrome 149 returns "maybe" for
 * every HLS MIME type, but assigning an .m3u8 to `video.src` then fires NO
 * events at all — not `loadeddata`, not even `error`. The element simply hangs,
 * which is exactly the silent "nothing happens" failure this module exists to
 * fix (and why the URL-health probe timed out instead of erroring, leaving the
 * card visible but unplayable). Use prefersNativeHls() to make decisions.
 */
export function supportsNativeHls(videoElement) {
  const el =
    videoElement ||
    (typeof document !== "undefined" ? document.createElement("video") : null);
  if (!el || typeof el.canPlayType !== "function") {
    return false;
  }
  for (const type of HLS_MIME_TYPES) {
    try {
      if (el.canPlayType(type)) {
        return true;
      }
    } catch (err) {
      // canPlayType must never throw, but never let a probe kill playback.
    }
  }
  return false;
}

// A representative baseline codec: every MSE implementation that can run hls.js
// supports fragmented-MP4 H.264. This mirrors what Hls.isSupported() checks, so
// we can predict the engine choice WITHOUT paying to load the bundle (the
// URL-health probe needs the answer for every visible card).
const MSE_PROBE_TYPE = 'video/mp4; codecs="avc1.42E01E"';

/** True when Media Source Extensions can back hls.js in this browser. */
export function supportsMse() {
  const MediaSourceImpl =
    (typeof globalThis !== "undefined" &&
      (globalThis.MediaSource ||
        globalThis.ManagedMediaSource ||
        globalThis.WebKitMediaSource)) ||
    null;
  if (!MediaSourceImpl || typeof MediaSourceImpl.isTypeSupported !== "function") {
    return false;
  }
  try {
    return MediaSourceImpl.isTypeSupported(MSE_PROBE_TYPE);
  } catch (err) {
    return false;
  }
}

/**
 * Whether to use the browser's own HLS implementation instead of hls.js.
 *
 * Only when MSE is genuinely unavailable (older iOS Safari, some TV browsers).
 * hls.js is the default everywhere else — this is hls.js's own recommended
 * ordering, and on Chrome it is mandatory: see supportsNativeHls() for the
 * canPlayType lie that makes a native-first branch hang forever.
 */
export function prefersNativeHls(videoElement) {
  return !supportsMse() && supportsNativeHls(videoElement);
}

let hlsEnginePromise = null;

/**
 * Lazy-import the vendored hls.js bundle. Cached across calls (including the
 * rejection case, deliberately reset so a transient network failure can retry).
 */
export async function loadHlsEngine() {
  if (!hlsEnginePromise) {
    hlsEnginePromise = import(HLS_BUNDLE_URL)
      .then((mod) => mod?.default || mod?.Hls || null)
      .catch((err) => {
        hlsEnginePromise = null;
        devLogger.warn("[hlsPlayback] Failed to load hls.js bundle:", err);
        return null;
      });
  }
  return hlsEnginePromise;
}

/** Test seam: drop the cached engine promise. */
export function __resetHlsEngineCacheForTests() {
  hlsEnginePromise = null;
}

// videoEl -> active hls.js instance. A WeakMap keeps teardown paths (which only
// ever hold the element) from having to thread an extra handle around, and lets
// a discarded element be collected without leaking the instance.
const attachedInstances = new WeakMap();

export function getAttachedHls(videoElement) {
  return videoElement ? attachedInstances.get(videoElement) || null : null;
}

/**
 * Tear down any hls.js instance bound to this element. Safe to call
 * unconditionally on every reset path — it is a no-op for non-HLS playback.
 */
export function detachHls(videoElement) {
  if (!videoElement) {
    return false;
  }
  const hls = attachedInstances.get(videoElement);
  if (!hls) {
    return false;
  }
  attachedInstances.delete(videoElement);
  try {
    hls.destroy();
  } catch (err) {
    devLogger.warn("[hlsPlayback] hls.destroy() threw during detach:", err);
  }
  return true;
}

function describeHlsError(data) {
  const type = data?.type || "unknown";
  const details = data?.details || "unknown";
  if (data?.type === "networkError") {
    return "Hosted playback failed: the HLS stream could not be reached (network or CORS).";
  }
  if (data?.type === "mediaError") {
    return "Hosted playback failed: this HLS stream uses a codec your browser cannot decode.";
  }
  return `Hosted playback failed: HLS error (${type}/${details}).`;
}

/**
 * Attach `url` to `videoElement`, using native HLS where available and hls.js
 * (MSE) otherwise.
 *
 * Resolves once the manifest is parsed — the meaningful "this is playable"
 * signal for both the player and the URL-health probe. Callers are still
 * responsible for calling play(); this only wires up the source.
 *
 * Returns null when HLS cannot be supported at all (no native support and MSE
 * unavailable), so the caller can fall back to its normal `src` assignment and
 * surface a real media error.
 *
 * `createEngine` is a test seam: it resolves the hls.js constructor and defaults
 * to the lazy import of the vendored bundle. Tests inject a fake so the MSE
 * branch can be specified without a real MediaSource.
 *
 * @returns {Promise<{mode: "native"|"mse", destroy: () => void}|null>}
 */
export async function attachHlsSource(
  videoElement,
  url,
  {
    onFatalError,
    log = () => {},
    manifestTimeoutMs = 15000,
    createEngine = loadHlsEngine,
  } = {}
) {
  if (!videoElement) {
    return null;
  }
  const trimmed = typeof url === "string" ? url.trim() : "";
  if (!trimmed) {
    return null;
  }

  // Always clear a previous instance before rebinding — reusing the modal's
  // <video> across videos is the norm in bitvid.
  detachHls(videoElement);

  const useNative = () => {
    log("[hlsPlayback] Using native HLS playback.");
    videoElement.src = trimmed;
    return { mode: "native", destroy: () => {} };
  };

  // Native only when MSE genuinely cannot back hls.js. Never trust canPlayType
  // on its own — Chrome claims HLS support and then hangs silently.
  if (prefersNativeHls(videoElement)) {
    return useNative();
  }

  const Hls = await createEngine();
  if (!Hls || typeof Hls.isSupported !== "function" || !Hls.isSupported()) {
    // Last resort: if the bundle failed to load but the browser claims native
    // support, an attempt beats a guaranteed failure.
    if (supportsNativeHls(videoElement)) {
      log("[hlsPlayback] hls.js unavailable; falling back to native HLS.");
      return useNative();
    }
    log("[hlsPlayback] hls.js unavailable/unsupported; cannot play HLS.");
    return null;
  }

  const hls = new Hls({
    enableWorker: true,
    lowLatencyMode: false,
    // Keep a bounded back-buffer so long VOD (this note is ~1h) does not grow
    // the SourceBuffer without limit on low-memory devices.
    backBufferLength: 90,
  });

  attachedInstances.set(videoElement, hls);

  let settled = false;
  let networkRetries = 0;
  let mediaRecoveries = 0;

  return new Promise((resolve) => {
    let timeoutId = null;

    const finish = (value) => {
      if (settled) {
        return;
      }
      settled = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      resolve(value);
    };

    const fail = (message) => {
      // Only tear down once we've given up; recoverable errors keep the
      // instance alive so hls.js can heal itself.
      detachHls(videoElement);
      if (typeof onFatalError === "function") {
        onFatalError(message);
      }
      finish(null);
    };

    if (Number.isFinite(manifestTimeoutMs) && manifestTimeoutMs > 0) {
      timeoutId = setTimeout(() => {
        if (settled) {
          return;
        }
        log("[hlsPlayback] Manifest parse timed out.");
        fail("Hosted playback failed: the HLS manifest did not load in time.");
      }, manifestTimeoutMs);
    }

    hls.on(Hls.Events.MANIFEST_PARSED, (_event, data) => {
      log(
        `[hlsPlayback] Manifest parsed; ${data?.levels?.length ?? 0} playable level(s).`
      );
      // hls.js drops levels whose codecs MSE cannot decode (e.g. an HEVC
      // rendition on Firefox). Zero survivors means nothing is playable.
      if (Array.isArray(data?.levels) && data.levels.length === 0) {
        fail(
          "Hosted playback failed: no HLS rendition uses a codec your browser supports."
        );
        return;
      }
      finish({ mode: "mse", destroy: () => detachHls(videoElement) });
    });

    hls.on(Hls.Events.ERROR, (_event, data) => {
      if (!data?.fatal) {
        log(
          `[hlsPlayback] Non-fatal HLS error (${data?.type}/${data?.details}); continuing.`
        );
        return;
      }

      log(`[hlsPlayback] Fatal HLS error (${data?.type}/${data?.details}).`);

      if (data.type === Hls.ErrorTypes.NETWORK_ERROR && networkRetries < 2) {
        networkRetries += 1;
        log(`[hlsPlayback] Retrying load (attempt ${networkRetries}).`);
        try {
          hls.startLoad();
          return;
        } catch (err) {
          log("[hlsPlayback] startLoad() threw during recovery.", err);
        }
      }

      if (data.type === Hls.ErrorTypes.MEDIA_ERROR && mediaRecoveries < 2) {
        mediaRecoveries += 1;
        log(`[hlsPlayback] Recovering media error (attempt ${mediaRecoveries}).`);
        try {
          if (mediaRecoveries === 2 && typeof hls.swapAudioCodec === "function") {
            hls.swapAudioCodec();
          }
          hls.recoverMediaError();
          return;
        } catch (err) {
          log("[hlsPlayback] recoverMediaError() threw during recovery.", err);
        }
      }

      fail(describeHlsError(data));
    });

    try {
      hls.attachMedia(videoElement);
      hls.loadSource(trimmed);
    } catch (err) {
      log("[hlsPlayback] attachMedia/loadSource threw:", err);
      fail("Hosted playback failed: the HLS stream could not be attached.");
    }
  });
}

/**
 * Cheap playability check for the URL-health badge that does NOT pull in hls.js.
 *
 * On MSE browsers hls.js fetches the playlist with XHR, so a CORS-readable
 * `#EXTM3U` response is exactly the condition for playability — and a bare
 * <video> probe (the old path) would report every HLS URL as dead. On Safari,
 * native playback needs no CORS, so the caller should keep using the element
 * probe there.
 *
 * @returns {Promise<"ok"|"error"|"timeout">}
 */
export async function probeHlsManifest(url, timeoutMs = 4000) {
  const trimmed = typeof url === "string" ? url.trim() : "";
  if (!trimmed || typeof fetch !== "function") {
    return "error";
  }

  const controller =
    typeof AbortController === "function" ? new AbortController() : null;
  let timedOut = false;
  const timeoutId =
    Number.isFinite(timeoutMs) && timeoutMs > 0
      ? setTimeout(() => {
          timedOut = true;
          controller?.abort();
        }, timeoutMs)
      : null;

  try {
    const response = await fetch(trimmed, {
      method: "GET",
      cache: "no-store",
      signal: controller?.signal,
    });
    if (!response.ok) {
      return "error";
    }
    const text = await response.text();
    return text.trimStart().startsWith("#EXTM3U") ? "ok" : "error";
  } catch (err) {
    return timedOut ? "timeout" : "error";
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}
