//js/webtorrent.js

/**
 * js/webtorrent.js
 *
 * This module wraps the WebTorrent client and manages the Service Worker integration.
 * It is responsible for the "Torrent" half of the playback strategy.
 *
 * Key Responsibilities:
 * - Singleton WebTorrent client: It ensures we reuse a single client instance to
 *   avoid resource leaks and connection churn.
 * - Service Worker Registration: It registers and manages `/sw.min.js`. This is critical
 *   because WebTorrent in the browser streams data via a Service Worker "proxy" that
 *   intercepts HTTP requests from the <video> element and serves bytes fetched from peers.
 * - "Claim" Logic: It handles the complex dance of ensuring the Service Worker has
 *   active control over the page (clients.claim) before attempting to stream, fixing
 *   common "grey screen" regressions on page reload.
 * - Browser Quirks: It handles Brave/Firefox specific logic.
 */

import WebTorrent from "./webtorrent.min.js";
import { WSS_TRACKERS } from "./constants.js";
import { safeDecodeURIComponent } from "./utils/safeDecode.js";
import { devLogger, userLogger } from "./utils/logger.js";
import { emit } from "./embedDiagnostics.js";
import { infoHashFromMagnet } from "./magnets.js";

const DEFAULT_PROBE_TRACKERS = Object.freeze([...WSS_TRACKERS]);

function normalizeTrackerList(trackers) {
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

function appendProbeTrackers(magnetURI, trackers) {
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

function normalizeNumber(value, fallback = 0) {
  const coerced = Number(value);
  if (Number.isFinite(coerced)) {
    return coerced;
  }
  return fallback;
}

function toError(err) {
  if (err instanceof Error) {
    return err;
  }
  try {
    return new Error(String(err));
  } catch (stringifyError) {
    return new Error("Unknown error");
  }
}

export class TorrentClient {
  constructor({ webTorrentClass } = {}) {
    this.WebTorrentClass =
      typeof webTorrentClass === "function" ? webTorrentClass : WebTorrent;
    // Reusable objects and flags
    this.client = null;
    this.currentTorrent = null;
    this.probeClient = null;

    // Service worker registration is cached
    this.swRegistration = null;
    this.serverCreated = false; // Indicates if we've called createServer on this.client

    this.serviceWorkerDisabled = false;
    this.serviceWorkerError = null;

    // Timeout for SW operations
    this.TIMEOUT_DURATION = 60000;

    this.probeInFlight = new Map();
  }

  ensureClientForProbe() {
    if (!this.probeClient) {
      this.probeClient = new this.WebTorrentClass();
      if (typeof this.probeClient.setMaxListeners === "function") {
        this.probeClient.setMaxListeners(0);
      }
    }
    return this.probeClient;
  }

  /**
   * Helper to check if a magnet link has active peers without starting a full
   * download. Used for "Stream Health" badges/indicators in the UI.
   */
  async probePeers(
    magnetURI,
    { timeoutMs = 8000, maxWebConns = 2, polls = 2, urlList = [] } = {}
  ) {
    const magnet = typeof magnetURI === "string" ? magnetURI.trim() : "";
    if (!magnet) {
      return {
        healthy: false,
        peers: 0,
        reason: "invalid",
        appendedTrackers: false,
        hasProbeTrackers: false,
        usedTrackers: [...TorrentClient.PROBE_TRACKERS],
        durationMs: 0,
      };
    }

    const trackers = normalizeTrackerList(TorrentClient.PROBE_TRACKERS);
    const { magnet: augmentedMagnet, appended, hasProbeTrackers } =
      appendProbeTrackers(magnet, trackers);

    const hasMagnetWebSeed = magnet.includes("ws=") || magnet.includes("webSeed=");
    const hasExplicitWebSeed = Array.isArray(urlList) && urlList.length > 0;
    const hasWebSeed = hasMagnetWebSeed || hasExplicitWebSeed;

    if (!hasProbeTrackers && !hasWebSeed) {
      return {
        healthy: false,
        peers: 0,
        reason: "no-trackers",
        appendedTrackers: false,
        hasProbeTrackers: false,
        usedTrackers: trackers,
        durationMs: 0,
      };
    }

    const infoHash = infoHashFromMagnet(magnet);
    const probeKey = infoHash || null;

    if (probeKey && this.probeInFlight.has(probeKey)) {
      return this.probeInFlight.get(probeKey);
    }

    const client = this.ensureClientForProbe();
    const safeTimeout = Math.max(0, normalizeNumber(timeoutMs, 8000));
    const safePolls = Math.max(0, Math.floor(normalizeNumber(polls, 2)));
    const safeMaxWebConns = Math.max(1, Math.floor(normalizeNumber(maxWebConns, 2)));
    const pollInterval =
      safePolls > 0
        ? Math.max(1000, Math.floor(safeTimeout / Math.max(1, safePolls)))
        : 0;

    const startedAt =
      typeof performance !== "undefined" && performance?.now
        ? performance.now()
        : Date.now();

    emit("torrent-probe-start", { magnet: augmentedMagnet });

    const probePromise = new Promise((resolve) => {
      let settled = false;
      let torrent = null;
      let timeoutId = null;
      let pollId = null;
      let pollStartId = null;

      const finalize = (overrides = {}) => {
        if (settled) {
          return;
        }
        settled = true;
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        if (pollId) {
          clearInterval(pollId);
          pollId = null;
        }
        if (pollStartId) {
          clearTimeout(pollStartId);
          pollStartId = null;
        }
        if (torrent) {
          try {
            torrent.destroy({ destroyStore: true });
          } catch (err) {
            // ignore
          }
        }

        const endedAt =
          typeof performance !== "undefined" && performance?.now
            ? performance.now()
            : Date.now();

        const isHealthy = Boolean(overrides.healthy);
        const peersCount = Number.isFinite(overrides.peers) ? overrides.peers : 0;

        const result = {
          healthy: isHealthy,
          peers: peersCount,
          reason: isHealthy ? "peer" : "timeout",
          appendedTrackers: appended,
          hasProbeTrackers,
          usedTrackers: trackers,
          durationMs: Math.max(0, endedAt - startedAt),
          ...overrides,
        };
        emit("torrent-probe-result", result);
        resolve(result);
      };

      try {
        const addOptions = {
          announce: trackers,
          maxWebConns: safeMaxWebConns,
        };
        if (hasExplicitWebSeed) {
          addOptions.urlList = urlList;
        }
        torrent = client.add(augmentedMagnet, addOptions);
      } catch (err) {
        finalize({
          reason: "error",
          error: toError(err),
          peers: 0,
          webseedOnly: hasWebSeed,
        });
        return;
      }

      const settleHealthy = () => {
        const peers = Math.max(1, Math.floor(normalizeNumber(torrent?.numPeers, 1)));
        finalize({ healthy: true, peers, reason: "peer" });
      };

      torrent.once("wire", settleHealthy);

      torrent.once("error", (err) => {
        const peers = Math.max(0, Math.floor(normalizeNumber(torrent?.numPeers, 0)));
        finalize({
          healthy: false,
          reason: "error",
          error: toError(err),
          peers,
          webseedOnly: peers === 0 && hasWebSeed,
        });
      });

      if (safeTimeout > 0) {
        timeoutId = setTimeout(() => {
          const peers = Math.max(0, Math.floor(normalizeNumber(torrent?.numPeers, 0)));
          finalize({
            healthy: false,
            peers,
            reason: "timeout",
            webseedOnly: peers === 0 && hasWebSeed,
          });
        }, safeTimeout);
      }

      if (safePolls > 0 && pollInterval > 0) {
        pollStartId = setTimeout(() => {
          if (!torrent || settled) {
            return;
          }
          pollId = setInterval(() => {
            if (!torrent || settled) {
              return;
            }
            const peers = Math.max(0, Math.floor(normalizeNumber(torrent.numPeers, 0)));
            if (peers > 0) {
              finalize({ healthy: true, peers, reason: "peer" });
            }
          }, pollInterval);
        }, pollInterval);
      }
    });

    if (probeKey) {
      this.probeInFlight.set(probeKey, probePromise);
      probePromise.finally(() => {
        if (this.probeInFlight.get(probeKey) === probePromise) {
          this.probeInFlight.delete(probeKey);
        }
      });
    }

    return probePromise;
  }

  log(...args) {
    devLogger.log(...args);
  }

  isServiceWorkerUnavailable() {
    return this.serviceWorkerDisabled;
  }

  getServiceWorkerInitError() {
    return this.serviceWorkerError || null;
  }

  async isBrave() {
    return (
      (navigator.brave?.isBrave && (await navigator.brave.isBrave())) || false
    );
  }

  isFirefox() {
    return /firefox/i.test(window.navigator.userAgent);
  }

  /**
   * Makes sure we have exactly one WebTorrent client instance and one SW registration.
   * Called once from streamVideo.
   */
  async init() {
    if (!this.client) {
      this.client = new this.WebTorrentClass();
      if (typeof this.client.setMaxListeners === "function") {
        this.client.setMaxListeners(0);
      }
    }

    if (this.serviceWorkerDisabled) {
      return {
        serviceWorkerReady: false,
        registration: null,
        error: this.serviceWorkerError,
      };
    }

    try {
      if (!this.swRegistration) {
        this.swRegistration = await this.setupServiceWorker();
      } else {
        // Even with an existing registration we still wait for control so that a
        // transient controller drop (e.g. Chrome devtools unregister/reload) does
        // not resurrect the grey-screen regression mentioned in
        // waitForActiveController().
        this.requestClientsClaim(this.swRegistration);
        await this.waitForActiveController(this.swRegistration);
      }

      return {
        serviceWorkerReady: !!this.swRegistration,
        registration: this.swRegistration,
      };
    } catch (error) {
      const normalizedError = toError(error);
      this.log(
        "[WebTorrent] Service worker setup failed; continuing without it:",
        normalizedError
      );
      userLogger.warn(
        "[WebTorrent] Service worker unavailable; falling back to direct streaming.",
        normalizedError
      );
      this.serviceWorkerDisabled = true;
      this.serviceWorkerError = normalizedError;
      this.swRegistration = null;
      return {
        serviceWorkerReady: false,
        registration: null,
        error: normalizedError,
      };
    }
  }

  async waitForServiceWorkerActivation(registration) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Service worker activation timeout"));
      }, this.TIMEOUT_DURATION);

      this.log("Waiting for service worker activation...");

      const checkActivation = () => {
        if (registration.active) {
          clearTimeout(timeout);
          this.log("Service worker is active");
          resolve(registration);
          return true;
        }
        return false;
      };

      if (checkActivation()) return;

      registration.addEventListener("activate", () => {
        checkActivation();
      });

      if (registration.waiting) {
        this.log("Service worker is waiting, sending skip waiting message");
        registration.waiting.postMessage({ type: "SKIP_WAITING" });
      }

      registration.addEventListener("statechange", () => {
        checkActivation();
      });
    });
  }

  /**
   * Ensure a live service worker is actively controlling the page before we
   * start WebTorrent streaming.
   *
   * This regression has bitten us repeatedly: the first playback attempt after
   * a cold load would get stuck on a grey frame because `navigator.serviceWorker`
   * had finished installing but never claimed the page yet. WebTorrent's
   * service-worker proxy never attached, so `file.streamTo(videoElement)` fed
   * data into the void. Refreshing the page “fixed” it because the worker became
   * the controller during navigation. Future refactors **must not** remove this
   * guard — wait for `controllerchange` whenever `controller` is still null.
   */
  requestClientsClaim(registration = this.swRegistration) {
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
      this.log("Failed to request clients.claim():", err);
    }
  }

  async waitForActiveController(registration = this.swRegistration) {
    if (!("serviceWorker" in navigator)) {
      return null;
    }

    if (navigator.serviceWorker.controller) {
      return navigator.serviceWorker.controller;
    }

    this.requestClientsClaim(registration);

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
        this.requestClientsClaim(registration);
      };

      timeoutId = setTimeout(() => {
        cleanup();
        reject(new Error("Service worker controller claim timeout"));
      }, this.TIMEOUT_DURATION);

      pollId = setInterval(() => {
        if (maybeResolve()) {
          return;
        }
        this.requestClientsClaim(registration);
      }, 500);

      navigator.serviceWorker.addEventListener(
        "controllerchange",
        onControllerChange
      );

      // One last check in case the controller appeared between the earlier
      // synchronous guard and the promise wiring above.
      if (!maybeResolve()) {
        this.requestClientsClaim(registration);
      }
    });
  }

  async setupServiceWorker() {
    try {
      const isBraveBrowser = await this.isBrave();

      if (!window.isSecureContext) {
        throw new Error("HTTPS or localhost required");
      }
      if (!("serviceWorker" in navigator) || !navigator.serviceWorker) {
        throw new Error("Service Worker not supported or disabled");
      }

      // Brave-specific logic: Brave Shields has a long-standing bug where
      // stale service worker registrations linger even after we ship fixes.
      // When that happens, the outdated worker keeps intercepting requests
      // and WebTorrent fails to spin up, leaving playback broken until the
      // user manually nukes the registration. To guarantee a clean slate we
      // blanket-unregister every worker, then pause briefly so Brave can
      // finish tearing down the old instance before we register the fresh
      // one again. That delay is intentional—future tweaks should not shorten
      // or remove it without understanding the regression risk.
      if (isBraveBrowser) {
        this.log("Checking Brave configuration...");
        if (!navigator.serviceWorker) {
          throw new Error(
            "Please enable Service Workers in Brave Shield settings"
          );
        }
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error("Please enable WebRTC in Brave Shield settings");
        }

        // Unregister all existing service workers before installing a fresh one
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const reg of registrations) {
          await reg.unregister();
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      this.log("Registering service worker at /sw.min.js...");
      const registration = await navigator.serviceWorker.register(
        "/sw.min.js",
        {
          scope: "/",
          updateViaCache: "none",
        }
      );

      this.log("Service worker registered");

      if (registration.installing) {
        this.log("Waiting for installation...");
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error("Installation timeout"));
          }, this.TIMEOUT_DURATION);

          registration.installing.addEventListener("statechange", (e) => {
            this.log("Service worker state:", e.target.state);
            if (
              e.target.state === "activated" ||
              e.target.state === "redundant"
            ) {
              clearTimeout(timeout);
              resolve();
            }
          });
        });
      }

      await this.waitForServiceWorkerActivation(registration);
      this.log("Service worker activated");

      const readyRegistration = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error("Service worker ready timeout")),
            this.TIMEOUT_DURATION
          )
        ),
      ]);

      if (!readyRegistration.active) {
        throw new Error("Service worker not active after ready state");
      }

      // Give the newly activated worker an explicit nudge to claim the page
      // before we continue. This keeps Chromium's occasionally sluggish claim
      // hand-offs from derailing the subsequent wait below.
      this.requestClientsClaim(registration);

      // See waitForActiveController() docstring for why this must remain in
      // place. We intentionally wait here instead of racing with playback so a
      // newly installed worker claims the page before WebTorrent spins up.
      await this.waitForActiveController(registration);

      // Force the SW to check for updates
      registration.update();
      this.log("Service worker ready");

      return registration;
    } catch (error) {
      this.log("Service worker setup error:", error);
      throw error;
    }
  }

  attemptAutoplay(videoElement, context = "webtorrent") {
    if (!videoElement || typeof videoElement.play !== "function") {
      return;
    }

    videoElement
      .play()
      .catch((err) => {
        this.log(`Autoplay failed (${context} path):`, err);
        if (videoElement.muted) {
          return;
        }
        this.log(`Retrying with muted autoplay (${context} path).`);
        videoElement.muted = true;
        videoElement.play().catch((err2) => {
          this.log(`Muted autoplay also failed (${context} path):`, err2);
        });
      });
  }

  // Handle Chrome-based browsers
  handleChromeTorrent(torrent, videoElement, resolve, reject) {
    // Prune demo web seeds/trackers that chronically trip Chromium CORS and
    // deliberately mutate `torrent._opts` as a sanctioned WebTorrent workaround.
    torrent.on("warning", (err) => {
      if (err && typeof err.message === "string") {
        if (
          err.message.includes("CORS") ||
          err.message.includes("Access-Control-Allow-Origin")
        ) {
          userLogger.warn(
            "CORS warning detected. Attempting to remove the failing webseed/tracker."
          );
          if (torrent._opts?.urlList?.length) {
            torrent._opts.urlList = torrent._opts.urlList.filter((url) => {
              return !url.includes("distribution.bbb3d.renderfarming.net");
            });
            userLogger.warn("Cleaned up webseeds =>", torrent._opts.urlList);
          }
          if (torrent._opts?.announce?.length) {
            torrent._opts.announce = torrent._opts.announce.filter((url) => {
              return !url.includes("fastcast.nz");
            });
            userLogger.warn("Cleaned up trackers =>", torrent._opts.announce);
          }
        }
      }
    });

    const file = torrent.files.find((f) => /\.(mp4|webm|mkv)$/i.test(f.name));
    if (!file) {
      return reject(new Error("No compatible video file found in torrent"));
    }

    // Satisfy autoplay requirements and keep cross-origin chunks usable (e.g., for snapshots).
    videoElement.crossOrigin = "anonymous";

    videoElement.addEventListener("error", (e) => {
      this.log("Video error:", e.target.error);
    });

    videoElement.addEventListener(
      "canplay",
      () => {
        this.attemptAutoplay(videoElement, "chrome");
      },
      { once: true }
    );

    try {
      file.streamTo(videoElement);
      this.currentTorrent = torrent;
      resolve(torrent);
    } catch (err) {
      this.log("Streaming error (Chrome path):", err);
      reject(err);
    }

    torrent.on("error", (err) => {
      this.log("Torrent error (Chrome path):", err);
      reject(err);
    });
  }

  // Handle Firefox-based browsers
  handleFirefoxTorrent(torrent, videoElement, resolve, reject) {
    const file = torrent.files.find((f) =>
      /\.(mp4|webm|mkv)$/.test(f.name.toLowerCase())
    );
    if (!file) {
      return reject(new Error("No compatible video file found in torrent"));
    }

    // Satisfy autoplay requirements and keep cross-origin chunks usable (e.g., for snapshots).
    videoElement.crossOrigin = "anonymous";

    videoElement.addEventListener("error", (e) => {
      this.log("Video error (Firefox path):", e.target.error);
    });

    videoElement.addEventListener(
      "canplay",
      () => {
        this.attemptAutoplay(videoElement, "firefox");
      },
      { once: true }
    );

    try {
      file.streamTo(videoElement, { highWaterMark: 256 * 1024 });
      this.currentTorrent = torrent;
      resolve(torrent);
    } catch (err) {
      this.log("Streaming error (Firefox path):", err);
      reject(err);
    }

    torrent.on("error", (err) => {
      this.log("Torrent error (Firefox path):", err);
      reject(err);
    });
  }

  async destroyWithTimeout(
    target,
    { label = "resource", args = [], timeoutMs = 8000 } = {}
  ) {
    if (!target || typeof target.destroy !== "function") {
      return;
    }

    const safeTimeout = Math.max(
      1000,
      Math.min(
        Number.isFinite(timeoutMs) ? timeoutMs : 8000,
        this.TIMEOUT_DURATION
      )
    );

    await new Promise((resolve) => {
      let settled = false;

      const finalize = () => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeoutId);
        resolve();
      };

      const logError = (error) => {
        if (error) {
          this.log(`[cleanup] ${label} destroy error:`, error);
        }
      };

      const timeoutId = setTimeout(() => {
        this.log(
          `[cleanup] ${label} destroy timed out after ${safeTimeout}ms; forcing resolution.`
        );
        finalize();
      }, safeTimeout);

      const callback = (error) => {
        logError(error);
        finalize();
      };

      let result;
      try {
        result = target.destroy(...args, callback);
      } catch (error) {
        logError(error);
        finalize();
        return;
      }

      if (result && typeof result.then === "function") {
        result
          .then(() => {
            finalize();
          })
          .catch((error) => {
            logError(error);
            finalize();
          });
      }
    });
  }

  /**
   * Initiates streaming of a torrent magnet to a <video> element.
   * Ensures the service worker is set up only once and the client is reused.
   */
  async streamVideo(magnetURI, videoElement, opts = {}) {
    try {
      emit("torrent-stream-start", { magnet: magnetURI });
      // 1) Make sure we have a WebTorrent client and a valid SW registration.
      const initResult = await this.init();

      if (!this.client) {
        throw new Error("Client destroyed during initialization");
      }

      const serviceWorkerReady =
        !!(initResult?.serviceWorkerReady && this.swRegistration);

      // 2) Create the server once if not already created.
      // This "server" is the bridge that feeds the Service Worker.
      if (serviceWorkerReady && !this.serverCreated) {
        this.client.createServer({
          controller: this.swRegistration,
          pathPrefix: location.origin + "/webtorrent",
        });
        this.serverCreated = true;
        this.log("WebTorrent server created");
      }

      const isFirefoxBrowser = this.isFirefox();
      const candidateUrls = Array.isArray(opts?.urlList)
        ? opts.urlList
            .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
            .filter((entry) => /^https?:\/\//i.test(entry))
        : [];

      const chromeOptions = { strategy: "sequential" };
      if (candidateUrls.length) {
        chromeOptions.urlList = candidateUrls;
      }

      return new Promise((resolve, reject) => {
        // 3) Add the torrent to the client and handle accordingly.
        if (isFirefoxBrowser) {
          this.log("Starting torrent download (Firefox path)");
          this.client.add(
            magnetURI,
            { ...chromeOptions, maxWebConns: 4 },
            (torrent) => {
              this.log("Torrent added (Firefox path):", torrent.name);
              this.handleFirefoxTorrent(torrent, videoElement, resolve, reject);
            }
          );
        } else {
          this.log("Starting torrent download (Chrome path)");
          this.client.add(magnetURI, chromeOptions, (torrent) => {
            this.log("Torrent added (Chrome path):", torrent.name);
            this.handleChromeTorrent(torrent, videoElement, resolve, reject);
          });
        }
      });
    } catch (error) {
      this.log("Failed to set up video streaming:", error);
      throw error;
    }
  }

  /**
   * Clean up resources.
   * You might decide to keep the client alive if you want to reuse torrents.
   * Currently, this fully destroys the client and resets everything.
   */
  async cleanup() {
    try {
      if (this.currentTorrent) {
        try {
          await this.destroyWithTimeout(this.currentTorrent, {
            label: "current torrent",
            args: [{ destroyStore: true }],
          });
        } finally {
          this.currentTorrent = null;
        }
      }

      if (this.client) {
        try {
          await this.destroyWithTimeout(this.client, {
            label: "WebTorrent client",
          });
        } finally {
          this.client = null;
          this.serverCreated = false;
        }
      } else {
        this.serverCreated = false;
      }

      if (this.probeClient) {
        try {
          await this.destroyWithTimeout(this.probeClient, {
            label: "probe client",
          });
        } finally {
          this.probeClient = null;
        }
      }
    } catch (error) {
      this.log("Cleanup error:", error);
    }
  }
}

TorrentClient.PROBE_TRACKERS = DEFAULT_PROBE_TRACKERS;

export const torrentClient = new TorrentClient();
