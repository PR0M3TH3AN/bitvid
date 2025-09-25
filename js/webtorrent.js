//js/webtorrent.js

import WebTorrent from "./webtorrent.min.js";

export class TorrentClient {
  constructor() {
    // Reusable objects and flags
    this.client = null;
    this.currentTorrent = null;

    // Service worker registration is cached
    this.swRegistration = null;
    this.serverCreated = false; // Indicates if we've called createServer on this.client

    // Timeout for SW operations
    this.TIMEOUT_DURATION = 60000;
  }

  log(msg) {
    console.log(msg);
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
    // 1) If the client doesn't exist, create it
    if (!this.client) {
      this.client = new WebTorrent();
    }

    // 2) If we haven’t registered the service worker yet, do it now
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
          console.warn(
            "CORS warning detected. Attempting to remove the failing webseed/tracker."
          );
          if (torrent._opts?.urlList?.length) {
            torrent._opts.urlList = torrent._opts.urlList.filter((url) => {
              return !url.includes("distribution.bbb3d.renderfarming.net");
            });
            console.warn("Cleaned up webseeds =>", torrent._opts.urlList);
          }
          if (torrent._opts?.announce?.length) {
            torrent._opts.announce = torrent._opts.announce.filter((url) => {
              return !url.includes("fastcast.nz");
            });
            console.warn("Cleaned up trackers =>", torrent._opts.announce);
          }
        }
      }
    });

    const file = torrent.files.find((f) => /\.(mp4|webm|mkv)$/i.test(f.name));
    if (!file) {
      return reject(new Error("No compatible video file found in torrent"));
    }

    // Satisfy autoplay requirements and keep cross-origin chunks usable (e.g., for snapshots).
    videoElement.muted = true;
    videoElement.crossOrigin = "anonymous";

    videoElement.addEventListener("error", (e) => {
      this.log("Video error:", e.target.error);
    });

    videoElement.addEventListener("canplay", () => {
      videoElement.play().catch((err) => {
        this.log("Autoplay failed:", err);
      });
    });

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
    videoElement.muted = true;
    videoElement.crossOrigin = "anonymous";

    videoElement.addEventListener("error", (e) => {
      this.log("Video error (Firefox path):", e.target.error);
    });

    videoElement.addEventListener("canplay", () => {
      videoElement.play().catch((err) => {
        this.log("Autoplay failed:", err);
      });
    });

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

  /**
   * Initiates streaming of a torrent magnet to a <video> element.
   * Ensures the service worker is set up only once and the client is reused.
   */
  async streamVideo(magnetURI, videoElement, opts = {}) {
    try {
      // 1) Make sure we have a WebTorrent client and a valid SW registration.
      await this.init();

      // 2) Create the server once if not already created.
      if (!this.serverCreated) {
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
        this.currentTorrent.destroy();
      }
      // Destroy client entirely and set to null so a future streamVideo call starts fresh
      if (this.client) {
        await this.client.destroy();
        this.client = null;
      }
      this.currentTorrent = null;
      this.serverCreated = false;
    } catch (error) {
      this.log("Cleanup error:", error);
    }
  }
}

export const torrentClient = new TorrentClient();
