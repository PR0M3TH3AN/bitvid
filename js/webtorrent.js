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
import {
  compareServiceWorkerScripts,
  normalizeTrackerList,
  appendProbeTrackers,
  normalizeNumber,
  toError,
  requestClientsClaim as requestClientsClaimHelper,
  waitForActiveController as waitForActiveControllerHelper,
} from "./webtorrentHelpers.js";
import { devLogger, userLogger } from "./utils/logger.js";
import { emit } from "./embedDiagnostics.js";

const DEFAULT_PROBE_TRACKERS = Object.freeze([...WSS_TRACKERS]);
const SERVICE_WORKER_PATH = "/sw.min.js";
const SERVICE_WORKER_SCOPE = "/";
// Once torrent playback has actually started, treat this long without any
// playback progress (while buffering) as a stall worth surfacing to the caller.
const TORRENT_PLAYBACK_STALL_MS = 12000;
// Files the player can actually decode. Used to pick the file to stream from a
// multi-file torrent (largest match wins) and to deselect the rest.
const PLAYABLE_VIDEO_PATTERN = /\.(mp4|m4v|webm|mkv|mov|ogv|ogg)$/i;


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
    this.swLifecycleListenerAttached = false;
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
    { timeoutMs = 8000, maxWebConns = 2, polls = 3, urlList = [] } = {}
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

    const client = this.ensureClientForProbe();
    const safeTimeout = Math.max(0, normalizeNumber(timeoutMs, 8000));
    const safePolls = Math.max(1, Math.floor(normalizeNumber(polls, 3)));
    const safeMaxWebConns = Math.max(1, Math.floor(normalizeNumber(maxWebConns, 2)));
    const pollInterval = Math.max(
      250,
      Math.floor(safeTimeout / Math.max(1, safePolls))
    );

    const startedAt =
      typeof performance !== "undefined" && performance?.now
        ? performance.now()
        : Date.now();

    emit("torrent-probe-start", { magnet: augmentedMagnet });

    return new Promise((resolve) => {
      let settled = false;
      let torrent = null;
      let timeoutId = null;
      let pollId = null;

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
          // A probe only needs to detect that >=1 peer/webseed exists, so cap
          // peer connections hard. Without this WebTorrent defaults to 55 per
          // torrent — multiplied across concurrent probes that floods the
          // browser with connections (freeze/crash).
          maxConns: 4,
        };
        /**
         * CRITICAL: We pass the webseed URL (if present) to the client via `urlList`.
         *
         * Regression warning:
         * In the past, we tried to separate "webseed health" from "peer health".
         * That was a mistake. WebTorrent counts a connected webseed as a peer.
         *
         * If we pass `urlList` here, the client connects to the webseed, and `numPeers`
         * increments to at least 1. This correctly signals "Healthy" to our `gridHealth` logic.
         *
         * DO NOT remove this parameter or try to handle webseeds manually outside the client.
         * Trust the client to count the webseed as a peer.
         */
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

      pollId = setInterval(() => {
        if (!torrent || settled) {
          return;
        }
        const peers = Math.max(0, Math.floor(normalizeNumber(torrent.numPeers, 0)));
        if (peers > 0) {
          finalize({ healthy: true, peers, reason: "peer" });
        }
      }, pollInterval);
    });
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

  attachServiceWorkerLifecycleListener() {
    if (
      this.swLifecycleListenerAttached ||
      !("serviceWorker" in navigator) ||
      !navigator.serviceWorker
    ) {
      return;
    }

    navigator.serviceWorker.addEventListener("message", (event) => {
      const payload = event?.data;
      if (payload?.type !== "BITVID_SW_LIFECYCLE") {
        return;
      }

      this.log("[WebTorrent] Service worker lifecycle:", payload);
    });
    this.swLifecycleListenerAttached = true;
  }

  async activateWaitingWorker(registration) {
    if (!registration?.waiting) {
      return false;
    }

    const waitingWorker = registration.waiting;
    const activeScript = registration.active?.scriptURL || "";
    const waitingScript = waitingWorker.scriptURL || "";
    if (compareServiceWorkerScripts(activeScript, waitingScript)) {
      this.log("Activating waiting service worker", {
        activeScript,
        waitingScript,
      });
    }

    waitingWorker.postMessage({ type: "SKIP_WAITING" });
    await this.waitForActiveController(registration);
    return true;
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
    return requestClientsClaimHelper(this, registration);
  }

  async waitForActiveController(registration = this.swRegistration) {
    return waitForActiveControllerHelper(this, registration);
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

      this.attachServiceWorkerLifecycleListener();

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

      this.log(`Registering service worker at ${SERVICE_WORKER_PATH}...`);
      const registration = await navigator.serviceWorker.register(
        SERVICE_WORKER_PATH,
        {
          scope: SERVICE_WORKER_SCOPE,
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

      await registration.update();
      await this.activateWaitingWorker(registration);

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

      // Force the SW to check for updates and immediately claim if a waiting
      // worker appeared after activation.
      await registration.update();
      await this.activateWaitingWorker(registration);
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

  handleTorrentStream(
    torrent,
    videoElement,
    resolve,
    reject,
    context = "chrome",
    hooks = {}
  ) {
    const isChrome = context === "chrome";
    const isFirefox = context === "firefox";
    const onStall =
      hooks && typeof hooks.onStall === "function" ? hooks.onStall : null;
    const onPlaybackError =
      hooks && typeof hooks.onPlaybackError === "function"
        ? hooks.onPlaybackError
        : null;
    const stallMs =
      hooks && Number.isFinite(hooks.stallMs) && hooks.stallMs > 0
        ? hooks.stallMs
        : TORRENT_PLAYBACK_STALL_MS;
    const hostedUrlWebSeed =
      hooks &&
      typeof hooks.hostedUrlWebSeed === "string" &&
      /^https?:\/\//i.test(hooks.hostedUrlWebSeed.trim())
        ? hooks.hostedUrlWebSeed.trim()
        : "";

    // Chrome-specific: Prune demo web seeds/trackers that chronically trip Chromium CORS
    // and deliberately mutate `torrent._opts` as a sanctioned WebTorrent workaround.
    if (isChrome) {
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
    }

    // Stream only the *largest* decodable video file. `.find()` picked whatever
    // came first (could be a sample clip), and leaving the other files selected
    // makes WebTorrent download the whole multi-file torrent — wasting the
    // swarm on data we never play.
    const files = Array.isArray(torrent.files) ? torrent.files : [];
    const videoFiles = files.filter((f) =>
      PLAYABLE_VIDEO_PATTERN.test((f && f.name) || "")
    );
    const file = videoFiles
      .slice()
      .sort((a, b) => (Number(b?.length) || 0) - (Number(a?.length) || 0))[0];
    if (!file) {
      return reject(new Error("No compatible video file found in torrent"));
    }
    if (typeof file.select === "function") {
      try {
        for (const other of files) {
          if (other !== file && typeof other.deselect === "function") {
            other.deselect();
          }
        }
        file.select();
      } catch (err) {
        this.log(`File selection failed (${context} path; non-fatal):`, err);
      }
    }

    // Attach the hosted CDN URL as a webseed ONLY for single-file torrents.
    // A standalone hosted-file URL is a valid BEP19 webseed only when the
    // torrent is a single file (the URL maps directly to it). For a multi-file
    // torrent, WebTorrent treats the URL as a base directory and appends
    // "<torrent name>/<file path>", producing a doubled URL that 404s on every
    // request — the webseed flood. Adding it post-metadata (when files.length
    // is known) avoids that entirely. Magnet-declared `ws=` webseeds are passed
    // separately via urlList and untouched.
    if (
      hostedUrlWebSeed &&
      files.length === 1 &&
      typeof torrent.addWebSeed === "function"
    ) {
      try {
        torrent.addWebSeed(hostedUrlWebSeed);
      } catch (err) {
        this.log(`Failed to attach hosted webseed (${context} path):`, err);
      }
    }

    // Satisfy autoplay requirements and keep cross-origin chunks usable (e.g., for snapshots).
    videoElement.crossOrigin = "anonymous";

    // The modal reuses a single <video> across plays, so listeners added here
    // would otherwise accumulate. Track them and tear down a previous stream's
    // listeners before wiring this one.
    if (typeof this._teardownTorrentStreamListeners === "function") {
      try {
        this._teardownTorrentStreamListeners();
      } catch (err) {
        // ignore
      }
    }

    let settled = false;
    let stallTimerId = null;
    const videoListeners = [];
    const addVideoListener = (eventName, handler, options) => {
      videoElement.addEventListener(eventName, handler, options);
      videoListeners.push([eventName, handler]);
    };
    const onTorrentError = (err) => {
      this.log(`Torrent error (${context} path):`, err);
      if (!settled) {
        // Pre-playback failure: reject so the caller can fall back (e.g. URL).
        settled = true;
        teardown();
        reject(err);
        return;
      }
      // Post-playback failure: the success promise is long gone, so surface it
      // through the hook instead of a dead reject().
      if (onPlaybackError) {
        try {
          onPlaybackError(toError(err));
        } catch (hookErr) {
          this.log("onPlaybackError hook threw:", hookErr);
        }
      }
    };
    const teardown = () => {
      if (stallTimerId) {
        clearTimeout(stallTimerId);
        stallTimerId = null;
      }
      for (const [eventName, handler] of videoListeners) {
        try {
          videoElement.removeEventListener(eventName, handler);
        } catch (err) {
          // ignore
        }
      }
      videoListeners.length = 0;
      if (torrent && typeof torrent.removeListener === "function") {
        try {
          torrent.removeListener("error", onTorrentError);
        } catch (err) {
          // ignore
        }
      }
      if (this._teardownTorrentStreamListeners === teardown) {
        this._teardownTorrentStreamListeners = null;
      }
    };
    this._teardownTorrentStreamListeners = teardown;

    const onVideoError = () => {
      this.log(`Video error (${context} path):`, videoElement.error);
    };
    addVideoListener("error", onVideoError);

    const tryStart = () => {
      this.attemptAutoplay(videoElement, context);
    };
    addVideoListener("canplay", tryStart, { once: true });
    addVideoListener("loadeddata", tryStart, { once: true });

    // Resolve only when playback is actually viable (first frame / can play),
    // NOT the instant streamTo() is called. Previously success was declared
    // synchronously, so a swarm that fetched metadata but could never sustain
    // playback was reported as a success — the caller cleared its fallback
    // timeout and the user was left on a frozen frame with no recovery. Waiting
    // for a real readiness signal lets the caller's playback timeout fall back
    // to the hosted URL (or surface "no peers") for a dead/too-slow swarm.
    const markReady = () => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(torrent);
    };
    addVideoListener("loadeddata", markReady, { once: true });
    addVideoListener("canplay", markReady, { once: true });
    addVideoListener("playing", markReady, { once: true });

    // Mid-stream stall detection: if playback buffers without progress for a
    // sustained window, notify via the hook (so the UI can say "waiting for
    // peers" instead of silently freezing). Progress clears the timer.
    const armStallTimer = () => {
      if (stallTimerId) {
        clearTimeout(stallTimerId);
      }
      stallTimerId = setTimeout(() => {
        stallTimerId = null;
        const peers = Math.max(
          0,
          Math.floor(normalizeNumber(torrent?.numPeers, 0))
        );
        this.log(
          `Torrent playback stalled (${context} path); peers=${peers}.`
        );
        if (onStall) {
          try {
            onStall({ peers });
          } catch (hookErr) {
            this.log("onStall hook threw:", hookErr);
          }
        }
      }, stallMs);
    };
    const clearStallTimer = () => {
      if (stallTimerId) {
        clearTimeout(stallTimerId);
        stallTimerId = null;
      }
    };
    addVideoListener("waiting", armStallTimer);
    addVideoListener("stalled", armStallTimer);
    addVideoListener("timeupdate", clearStallTimer);
    addVideoListener("playing", clearStallTimer);

    // Set this up front (not gated on readiness) so cleanup() can always tear
    // down the torrent even if playback never becomes ready and the caller
    // times out.
    this.currentTorrent = torrent;

    torrent.on("error", onTorrentError);

    try {
      const streamOptions = {};
      if (isFirefox) {
        streamOptions.highWaterMark = 256 * 1024;
      }
      file.streamTo(videoElement, streamOptions);

      // Already buffered enough (cache/fast load): start + mark ready now.
      if (videoElement.readyState >= 3) {
        tryStart();
        markReady();
      }
    } catch (err) {
      this.log(`Streaming error (${context} path):`, err);
      if (!settled) {
        settled = true;
        teardown();
        reject(err);
      }
    }
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
      const streamHooks =
        opts && typeof opts.hooks === "object" && opts.hooks
          ? { ...opts.hooks }
          : {};
      // Hosted CDN URL to use as a single-file webseed (handleTorrentStream
      // attaches it post-metadata, only when the torrent is a single file).
      if (typeof opts?.hostedUrlWebSeed === "string" && opts.hostedUrlWebSeed) {
        streamHooks.hostedUrlWebSeed = opts.hostedUrlWebSeed;
      }
      const candidateUrls = Array.isArray(opts?.urlList)
        ? opts.urlList
            .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
            .filter((entry) => /^https?:\/\//i.test(entry))
        : [];

      // Cap peer connections for the streaming torrent too. 30 is plenty to
      // saturate playback bandwidth while avoiding the WebRTC-handshake storm
      // that can peg the main thread (WebTorrent's default is 55).
      const chromeOptions = { strategy: "sequential", maxConns: 30 };
      /**
       * CRITICAL: Passing `urlList` ensures the client can stream from the webseed.
       * Without this, videos with 0 P2P peers will fail to play even if a valid
       * webseed is available.
       */
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
              this.handleTorrentStream(
                torrent,
                videoElement,
                resolve,
                reject,
                "firefox",
                streamHooks
              );
            }
          );
        } else {
          this.log("Starting torrent download (Chrome path)");
          this.client.add(magnetURI, chromeOptions, (torrent) => {
            this.log("Torrent added (Chrome path):", torrent.name);
            this.handleTorrentStream(
              torrent,
              videoElement,
              resolve,
              reject,
              "chrome",
              streamHooks
            );
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
      if (typeof this._teardownTorrentStreamListeners === "function") {
        try {
          this._teardownTorrentStreamListeners();
        } catch (err) {
          // ignore
        }
        this._teardownTorrentStreamListeners = null;
      }

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
