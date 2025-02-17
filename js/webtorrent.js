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

  async setupServiceWorker() {
    try {
      const isBraveBrowser = await this.isBrave();

      if (!window.isSecureContext) {
        throw new Error("HTTPS or localhost required");
      }
      if (!("serviceWorker" in navigator) || !navigator.serviceWorker) {
        throw new Error("Service Worker not supported or disabled");
      }

      // Brave-specific logic
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
  async streamVideo(magnetURI, videoElement) {
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

      return new Promise((resolve, reject) => {
        // 3) Add the torrent to the client and handle accordingly.
        if (isFirefoxBrowser) {
          this.log("Starting torrent download (Firefox path)");
          this.client.add(
            magnetURI,
            { strategy: "sequential", maxWebConns: 4 },
            (torrent) => {
              this.log("Torrent added (Firefox path):", torrent.name);
              this.handleFirefoxTorrent(torrent, videoElement, resolve, reject);
            }
          );
        } else {
          this.log("Starting torrent download (Chrome path)");
          this.client.add(magnetURI, { strategy: "sequential" }, (torrent) => {
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
