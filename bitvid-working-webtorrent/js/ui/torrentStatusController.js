import { devLogger } from "../utils/logger.js";

export default class TorrentStatusController {
  constructor({ getVideoModal, onRemovePoster }) {
    if (typeof getVideoModal !== "function") {
      throw new Error("TorrentStatusController requires a getVideoModal accessor.");
    }
    this.getVideoModal = getVideoModal;
    this.onRemovePoster = typeof onRemovePoster === "function" ? onRemovePoster : () => {};
  }

  update(torrent) {
    devLogger.log("[DEBUG] TorrentStatusController.update called with torrent:", torrent);

    if (!torrent) {
      devLogger.log("[DEBUG] torrent is null/undefined!");
      return;
    }

    if (torrent.ready || (typeof torrent.progress === "number" && torrent.progress > 0)) {
      // Belt-and-suspenders: if WebTorrent reports progress but the DOM events
      // failed to fire we still rip off the loading GIF. This regression has
      // bitten us in past releases, so the extra clear is intentional.
      this.onRemovePoster(
        torrent.ready ? "torrent-ready-flag" : "torrent-progress"
      );
    }

    // Log only fields that actually exist on the torrent:
    devLogger.log("[DEBUG] torrent.progress =", torrent.progress);
    devLogger.log("[DEBUG] torrent.numPeers =", torrent.numPeers);
    devLogger.log("[DEBUG] torrent.downloadSpeed =", torrent.downloadSpeed);
    devLogger.log("[DEBUG] torrent.downloaded =", torrent.downloaded);
    devLogger.log("[DEBUG] torrent.length =", torrent.length);
    devLogger.log("[DEBUG] torrent.ready =", torrent.ready);

    const videoModal = this.getVideoModal();

    // Use "Complete" vs. "Downloading" as the textual status.
    if (videoModal) {
      const fullyDownloaded = torrent.progress >= 1;
      if (typeof videoModal.updateStatus === "function") {
        videoModal.updateStatus(fullyDownloaded ? "Complete" : "Downloading");
      }

      if (typeof videoModal.updateProgress === "function") {
        const percent = (torrent.progress * 100).toFixed(2);
        videoModal.updateProgress(`${percent}%`);
      }

      if (typeof videoModal.updatePeers === "function") {
        videoModal.updatePeers(`Peers: ${torrent.numPeers}`);
      }

      if (typeof videoModal.updateSpeed === "function") {
        const kb = (torrent.downloadSpeed / 1024).toFixed(2);
        videoModal.updateSpeed(`${kb} KB/s`);
      }

      if (typeof videoModal.updateDownloaded === "function") {
        const downloadedMb = (torrent.downloaded / (1024 * 1024)).toFixed(2);
        const lengthMb = (torrent.length / (1024 * 1024)).toFixed(2);
        videoModal.updateDownloaded(
          `${downloadedMb} MB / ${lengthMb} MB`
        );
      }

      if (torrent.ready && typeof videoModal.updateStatus === "function") {
        videoModal.updateStatus("Ready to play");
      }
    }
  }
}
