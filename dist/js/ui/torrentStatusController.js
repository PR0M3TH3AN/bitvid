import { isVerboseDevMode } from "../config.js";
import { devLogger } from "../utils/logger.js";

export default class TorrentStatusController {
  constructor({ getVideoModal, onRemovePoster }) {
    if (typeof getVideoModal !== "function") {
      throw new Error("TorrentStatusController requires a getVideoModal accessor.");
    }
    this.getVideoModal = getVideoModal;
    this.onRemovePoster = typeof onRemovePoster === "function" ? onRemovePoster : () => {};
    this.lastEmitted = {
      status: null,
      progress: null,
      peers: null,
      speed: null,
      downloaded: null,
    };
    this.lastVerboseLogAt = 0;
    this.lastVerboseSummaryKey = "";
    this.verboseLogIntervalMs = 3000;
  }

  update(torrent) {
    if (!torrent) {
      if (isVerboseDevMode) {
        this.logVerboseSummary({ hasTorrent: false });
      }
      return;
    }

    if (isVerboseDevMode) {
      this.logVerboseSummary({
        hasTorrent: true,
        progress: torrent.progress,
        numPeers: torrent.numPeers,
        downloadSpeed: torrent.downloadSpeed,
        downloaded: torrent.downloaded,
        length: torrent.length,
        ready: torrent.ready,
      });
    }

    if (torrent.ready || (typeof torrent.progress === "number" && torrent.progress > 0)) {
      // Belt-and-suspenders: if WebTorrent reports progress but the DOM events
      // failed to fire we still rip off the loading GIF. This regression has
      // bitten us in past releases, so the extra clear is intentional.
      this.onRemovePoster(
        torrent.ready ? "torrent-ready-flag" : "torrent-progress"
      );
    }

    const videoModal = this.getVideoModal();

    // Use "Complete" vs. "Downloading" as the textual status.
    if (videoModal) {
      const fullyDownloaded = Number(torrent.progress) >= 1;
      const status = torrent.ready
        ? "Ready to play"
        : fullyDownloaded
          ? "Complete"
          : "Downloading";
      this.updateIfChanged("status", status, () => {
        if (typeof videoModal.updateStatus === "function") {
          videoModal.updateStatus(status);
        }
      });

      const progressValue = Number.isFinite(torrent.progress)
        ? `${(torrent.progress * 100).toFixed(2)}%`
        : "0.00%";
      this.updateIfChanged("progress", progressValue, () => {
        if (typeof videoModal.updateProgress === "function") {
          videoModal.updateProgress(progressValue);
        }
      });

      const peersValue = `Peers: ${Number.isFinite(torrent.numPeers) ? torrent.numPeers : 0}`;
      this.updateIfChanged("peers", peersValue, () => {
        if (typeof videoModal.updatePeers === "function") {
          videoModal.updatePeers(peersValue);
        }
      });

      const speedValue = Number.isFinite(torrent.downloadSpeed)
        ? `${(torrent.downloadSpeed / 1024).toFixed(2)} KB/s`
        : "0.00 KB/s";
      this.updateIfChanged("speed", speedValue, () => {
        if (typeof videoModal.updateSpeed === "function") {
          videoModal.updateSpeed(speedValue);
        }
      });

      const downloadedMb = Number.isFinite(torrent.downloaded)
        ? (torrent.downloaded / (1024 * 1024)).toFixed(2)
        : "0.00";
      const lengthMb = Number.isFinite(torrent.length)
        ? (torrent.length / (1024 * 1024)).toFixed(2)
        : "0.00";
      const downloadedValue = `${downloadedMb} MB / ${lengthMb} MB`;
      this.updateIfChanged("downloaded", downloadedValue, () => {
        if (typeof videoModal.updateDownloaded === "function") {
          videoModal.updateDownloaded(downloadedValue);
        }
      });
    }
  }

  updateIfChanged(key, nextValue, updater) {
    if (this.lastEmitted[key] === nextValue) {
      return;
    }
    this.lastEmitted[key] = nextValue;
    updater();
  }

  logVerboseSummary(summary) {
    const summaryKey = JSON.stringify(summary);
    const now = Date.now();
    const shouldSample = now - this.lastVerboseLogAt >= this.verboseLogIntervalMs;
    if (summaryKey === this.lastVerboseSummaryKey && !shouldSample) {
      return;
    }
    this.lastVerboseSummaryKey = summaryKey;
    this.lastVerboseLogAt = now;
    devLogger.debug("[DEBUG] TorrentStatusController.update", summary);
  }
}
