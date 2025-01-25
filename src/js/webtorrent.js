// <!-- keep this <ai_context> section if it already exists at the top of your file -->

// js/webtorrent.js

import WebTorrent from "./webtorrent.min.js";

export class TorrentClient {
  constructor() {
    // Create WebTorrent client
    this.client = new WebTorrent();
    this.currentTorrent = null;
    this.TIMEOUT_DURATION = 60000; // 60 seconds
    this.statsInterval = null;
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

  /**
   * Registers the service worker, waiting until it's fully active before proceeding.
   */
  async setupServiceWorker() {
    try {
      const isBraveBrowser = await this.isBrave();

      if (!window.isSecureContext) {
        throw new Error("HTTPS or localhost required");
      }

      if (!("serviceWorker" in navigator) || !navigator.serviceWorker) {
        throw new Error("Service Worker not supported or disabled");
      }

      // If Brave, we optionally clear all service workers so we can re-register cleanly
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

      // Wait for service worker to become active
      await this.waitForServiceWorkerActivation(registration);
      this.log("Service worker activated");

      // Make sure it’s truly active
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
   * Streams the given magnet URI to the specified <video> element.
   */
  async streamVideo(magnetURI, videoElement) {
    try {
      // 1) Setup service worker
      const registration = await this.setupServiceWorker();
      if (!registration || !registration.active) {
        throw new Error("Service worker setup failed");
      }

      // 2) Create WebTorrent server AFTER service worker is ready
      this.client.createServer({ controller: registration });
      this.log("WebTorrent server created");

      const isFirefoxBrowser = this.isFirefox();

      if (isFirefoxBrowser) {
        // ----------------------
        // FIREFOX CODE PATH
        // (sequential, concurrency limit, smaller chunk)
        // ----------------------
        return new Promise((resolve, reject) => {
          this.log("Starting torrent download (Firefox path)");
          this.client.add(
            magnetURI,
            {
              strategy: "sequential",
              maxWebConns: 4, // reduce concurrency
            },
            (torrent) => {
              this.handleFirefoxTorrent(torrent, videoElement, resolve, reject);
            }
          );
        });
      } else {
        // ----------------------
        // CHROME / OTHER BROWSERS CODE PATH
        // (your original "faster" approach)
        // ----------------------
        return new Promise((resolve, reject) => {
          this.log("Starting torrent download (Chrome path)");
          this.client.add(magnetURI, (torrent) => {
            this.handleChromeTorrent(torrent, videoElement, resolve, reject);
          });
        });
      }
    } catch (error) {
      this.log("Failed to setup video streaming:", error);
      throw error;
    }
  }

  /**
   * The "faster" original approach for Chrome/other browsers.
   */
  handleChromeTorrent(torrent, videoElement, resolve, reject) {
    this.log("Torrent added (Chrome path): " + torrent.name);

    const status = document.getElementById("status");
    const progress = document.getElementById("progress");
    const peers = document.getElementById("peers");
    const speed = document.getElementById("speed");
    const downloaded = document.getElementById("downloaded");

    if (status) {
      status.textContent = `Loading ${torrent.name}...`;
    }

    // Find playable file (same as old code)
    const file = torrent.files.find(
      (f) =>
        f.name.endsWith(".mp4") ||
        f.name.endsWith(".webm") ||
        f.name.endsWith(".mkv")
    );
    if (!file) {
      const error = new Error("No compatible video file found in torrent");
      this.log(error.message);
      if (status) status.textContent = "Error: No video file found";
      return reject(error);
    }

    // Mute for autoplay
    videoElement.muted = true;
    videoElement.crossOrigin = "anonymous";

    // Error handling same as old code
    videoElement.addEventListener("error", (e) => {
      const errObj = e.target.error;
      this.log("Video error:", errObj);
      if (errObj) {
        this.log("Error code:", errObj.code);
        this.log("Error message:", errObj.message);
      }
      if (status) {
        status.textContent =
          "Error playing video. Try disabling Brave Shields.";
      }
    });

    // Attempt autoplay
    videoElement.addEventListener("canplay", () => {
      const playPromise = videoElement.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => this.log("Autoplay started (Chrome path)"))
          .catch((err) => {
            this.log("Autoplay failed:", err);
            if (status) status.textContent = "Click to play video";
            videoElement.addEventListener(
              "click",
              () => {
                videoElement
                  .play()
                  .catch((err2) => this.log("Play failed:", err2));
              },
              { once: true }
            );
          });
      }
    });

    videoElement.addEventListener("loadedmetadata", () => {
      this.log("Video metadata loaded (Chrome path)");
      if (videoElement.duration === Infinity || isNaN(videoElement.duration)) {
        this.log("Invalid duration, attempting to fix...");
        videoElement.currentTime = 1e101;
        videoElement.currentTime = 0;
      }
    });

    // Now stream to the video element
    try {
      file.streamTo(videoElement); // no chunk constraints
      this.log("Streaming started (Chrome path)");

      // Update stats
      this.statsInterval = setInterval(() => {
        if (!document.body.contains(videoElement)) {
          clearInterval(this.statsInterval);
          return;
        }

        const percentage = torrent.progress * 100;
        if (progress) progress.style.width = `${percentage}%`;
        if (peers) peers.textContent = `Peers: ${torrent.numPeers}`;
        if (speed) {
          speed.textContent = `${this.formatBytes(torrent.downloadSpeed)}/s`;
        }
        if (downloaded) {
          downloaded.textContent = `${this.formatBytes(
            torrent.downloaded
          )} / ${this.formatBytes(torrent.length)}`;
        }

        if (status) {
          status.textContent =
            torrent.progress === 1
              ? `${torrent.name}`
              : `Loading ${torrent.name}...`;
        }
      }, 1000);

      this.currentTorrent = torrent;
      resolve();
    } catch (err) {
      this.log("Streaming error (Chrome path):", err);
      if (status) status.textContent = "Error starting video stream";
      reject(err);
    }

    // Torrent error event
    torrent.on("error", (err) => {
      this.log("Torrent error (Chrome path):", err);
      if (status) status.textContent = "Error loading video";
      clearInterval(this.statsInterval);
      reject(err);
    });
  }

  /**
   * The new approach for Firefox: sequential, concurrency limit, smaller chunk size.
   */
  handleFirefoxTorrent(torrent, videoElement, resolve, reject) {
    this.log("Torrent added (Firefox path): " + torrent.name);

    const status = document.getElementById("status");
    const progress = document.getElementById("progress");
    const peers = document.getElementById("peers");
    const speed = document.getElementById("speed");
    const downloaded = document.getElementById("downloaded");

    if (status) {
      status.textContent = `Loading ${torrent.name}...`;
    }

    // Find playable file
    const file = torrent.files.find(
      (f) =>
        f.name.endsWith(".mp4") ||
        f.name.endsWith(".webm") ||
        f.name.endsWith(".mkv")
    );
    if (!file) {
      const error = new Error("No compatible video file found in torrent");
      this.log(error.message);
      if (status) status.textContent = "Error: No video file found";
      return reject(error);
    }

    videoElement.muted = true;
    videoElement.crossOrigin = "anonymous";

    videoElement.addEventListener("error", (e) => {
      const errObj = e.target.error;
      this.log("Video error (Firefox path):", errObj);
      if (errObj) {
        this.log("Error code:", errObj.code);
        this.log("Error message:", errObj.message);
      }
      if (status) {
        status.textContent =
          "Error playing video. Try disabling Brave Shields.";
      }
    });

    videoElement.addEventListener("canplay", () => {
      const playPromise = videoElement.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => this.log("Autoplay started (Firefox path)"))
          .catch((err) => {
            this.log("Autoplay failed:", err);
            if (status) status.textContent = "Click to play video";
            videoElement.addEventListener(
              "click",
              () => {
                videoElement
                  .play()
                  .catch((err2) => this.log("Play failed:", err2));
              },
              { once: true }
            );
          });
      }
    });

    videoElement.addEventListener("loadedmetadata", () => {
      this.log("Video metadata loaded (Firefox path)");
      if (videoElement.duration === Infinity || isNaN(videoElement.duration)) {
        this.log("Invalid duration, attempting to fix...");
        videoElement.currentTime = 1e101;
        videoElement.currentTime = 0;
      }
    });

    // We set a smaller chunk size for Firefox
    try {
      file.streamTo(videoElement, { highWaterMark: 32 * 1024 }); // 32 KB chunk
      this.log("Streaming started (Firefox path)");

      this.statsInterval = setInterval(() => {
        if (!document.body.contains(videoElement)) {
          clearInterval(this.statsInterval);
          return;
        }

        const percentage = torrent.progress * 100;
        if (progress) progress.style.width = `${percentage}%`;
        if (peers) peers.textContent = `Peers: ${torrent.numPeers}`;
        if (speed) {
          speed.textContent = `${this.formatBytes(torrent.downloadSpeed)}/s`;
        }
        if (downloaded) {
          downloaded.textContent = `${this.formatBytes(
            torrent.downloaded
          )} / ${this.formatBytes(torrent.length)}`;
        }

        if (status) {
          status.textContent =
            torrent.progress === 1
              ? `${torrent.name}`
              : `Loading ${torrent.name}...`;
        }
      }, 1000);

      this.currentTorrent = torrent;
      resolve();
    } catch (err) {
      this.log("Streaming error (Firefox path):", err);
      if (status) status.textContent = "Error starting video stream";
      reject(err);
    }

    // Listen for torrent errors
    torrent.on("error", (err) => {
      this.log("Torrent error (Firefox path):", err);
      if (status) status.textContent = "Error loading video";
      clearInterval(this.statsInterval);
      reject(err);
    });
  }

  /**
   * Clean up after playback or page unload.
   */
  async cleanup() {
    try {
      if (this.statsInterval) {
        clearInterval(this.statsInterval);
      }
      if (this.currentTorrent) {
        this.currentTorrent.destroy();
      }
      if (this.client) {
        await this.client.destroy();
        // Recreate fresh client for next time
        this.client = new WebTorrent();
      }
    } catch (error) {
      this.log("Cleanup error:", error);
    }
  }
}

export const torrentClient = new TorrentClient();
