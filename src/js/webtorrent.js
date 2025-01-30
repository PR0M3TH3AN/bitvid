// js/webtorrent.js

import WebTorrent from "./webtorrent.min.js";

export class TorrentClient {
  constructor() {
    this.client = new WebTorrent();
    this.currentTorrent = null;
    this.TIMEOUT_DURATION = 60000; // 60 seconds
    // We remove the “statsInterval” since we’re not using it here anymore
    // this.statsInterval = null;
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

      // Optional Brave config
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

        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const registration of registrations) {
          await registration.unregister();
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      const currentPath = window.location.pathname;
      const basePath = currentPath.substring(
        0,
        currentPath.lastIndexOf("/") + 1
      );

      this.log("Registering service worker...");
      const registration = await navigator.serviceWorker.register(
        "./sw.min.js",
        {
          scope: basePath,
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

      this.log("Service worker ready");
      return registration;
    } catch (error) {
      this.log("Service worker setup error:", error);
      throw error;
    }
  }

  formatBytes(bytes) {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  }

  /**
   * Streams the magnet to the <video> element.
   * No stats intervals here—just returns the torrent object.
   */
  async streamVideo(magnetURI, videoElement) {
    try {
      // 1) Setup service worker
      const registration = await this.setupServiceWorker();
      if (!registration || !registration.active) {
        throw new Error("Service worker setup failed");
      }

      // 2) Create WebTorrent server
      this.client.createServer({ controller: registration });
      this.log("WebTorrent server created");

      const isFirefoxBrowser = this.isFirefox();

      return new Promise((resolve, reject) => {
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
          this.client.add(magnetURI, (torrent) => {
            this.log("Torrent added (Chrome path):", torrent.name);
            this.handleChromeTorrent(torrent, videoElement, resolve, reject);
          });
        }
      });
    } catch (error) {
      this.log("Failed to setup video streaming:", error);
      throw error;
    }
  }

  // Minimal handleChromeTorrent — no internal setInterval
  handleChromeTorrent(torrent, videoElement, resolve, reject) {
    const file = torrent.files.find((f) =>
      /\.(mp4|webm|mkv)$/.test(f.name.toLowerCase())
    );
    if (!file) {
      return reject(new Error("No compatible video file found in torrent"));
    }

    // Mute & crossOrigin
    videoElement.muted = true;
    videoElement.crossOrigin = "anonymous";

    // Catch video errors
    videoElement.addEventListener("error", (e) => {
      this.log("Video error:", e.target.error);
    });

    // Attempt autoplay
    videoElement.addEventListener("canplay", () => {
      videoElement.play().catch((err) => {
        this.log("Autoplay failed:", err);
      });
    });

    // Actually stream
    try {
      file.streamTo(videoElement);
      this.currentTorrent = torrent;
      resolve(torrent);
    } catch (err) {
      this.log("Streaming error (Chrome path):", err);
      reject(err);
    }

    // Also handle torrent error events
    torrent.on("error", (err) => {
      this.log("Torrent error (Chrome path):", err);
      reject(err);
    });
  }

  // Minimal handleFirefoxTorrent
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
      file.streamTo(videoElement, { highWaterMark: 32 * 1024 });
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
   * Clean up
   */
  async cleanup() {
    try {
      // No local interval to clear here
      if (this.currentTorrent) {
        this.currentTorrent.destroy();
      }
      if (this.client) {
        await this.client.destroy();
        this.client = new WebTorrent();
      }
    } catch (error) {
      this.log("Cleanup error:", error);
    }
  }
}

export const torrentClient = new TorrentClient();
