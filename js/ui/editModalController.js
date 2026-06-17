import { devLogger } from "../utils/logger.js";
import r2Service from "../services/r2Service.js";

export default class EditModalController {
  constructor({ services, state, ui, callbacks, helpers }) {
    this.services = services;
    this.state = state;
    this.ui = ui;
    this.callbacks = callbacks;
    this.helpers = helpers;
  }

  async open(target) {
    try {
      const normalizedTarget = this.helpers.normalizeActionTarget(target);
      const { triggerElement } = normalizedTarget;

      const blacklistedEventIds = this.state.getBlacklistedEventIds();
      const isAuthorBlocked = this.callbacks.isAuthorBlocked;

      const latestVideos = await this.services.nostrService.fetchVideos({
        blacklistedEventIds,
        isAuthorBlocked: (pubkey) => isAuthorBlocked(pubkey),
      });

      const video = await this.helpers.resolveVideoActionTarget({
        ...normalizedTarget,
        preloadedList: latestVideos,
      });

      // 2) Basic ownership checks
      const pubkey = this.state.getPubkey();
      if (!pubkey) {
        this.ui.showError("Please login to edit videos.");
        return;
      }
      const userPubkey = (pubkey || "").toLowerCase();
      const videoPubkey = (video?.pubkey || "").toLowerCase();
      if (!video || !videoPubkey || videoPubkey !== userPubkey) {
        this.ui.showError("You do not own this video.");
        return;
      }

      const editModal = this.ui.getEditModal();
      if (!editModal) {
        this.ui.showError("Edit modal is not available right now.");
        return;
      }

      try {
        await editModal.load();
      } catch (error) {
        devLogger.error("Failed to load edit modal:", error);
        this.ui.showError(`Failed to initialize edit modal: ${error.message}`);
        return;
      }

      try {
        await editModal.open(video, { triggerElement });
      } catch (error) {
        devLogger.error("Failed to open edit modal:", error);
        this.ui.showError("Edit modal is not available right now.");
      }
    } catch (err) {
      devLogger.error("Failed to edit video:", err);
      this.ui.showError("Failed to edit video. Please try again.");
    }
  }

  async handleSubmit(event) {
    const detail = event?.detail || {};
    const { originalEvent, updatedData } = detail;
    if (!originalEvent || !updatedData) {
      return;
    }

    const pubkey = this.state.getPubkey();
    const editModal = this.ui.getEditModal();

    if (!pubkey) {
      this.ui.showError("Please login to edit videos.");
      if (editModal?.setSubmitState) {
        editModal.setSubmitState({ pending: false });
      }
      return;
    }

    try {
      await this.services.nostrService.handleEditVideoSubmit({
        originalEvent,
        updatedData,
        pubkey,
      });

      // Best-effort: if the hosted video URL was genuinely replaced, the old
      // R2/S3 object (and its .torrent) is now orphaned — remove it. We require
      // both URLs to be non-empty and different so we never delete an object
      // that's still referenced (e.g. via a magnet web-seed when the URL was
      // merely cleared). Thumbnails are intentionally left alone here to avoid
      // deleting one the new note still points at. Never blocks the edit.
      try {
        const oldUrl = detail.video?.url || "";
        const newUrl = updatedData?.url || "";
        if (updatedData?.urlEdited && oldUrl && newUrl && oldUrl !== newUrl) {
          const cleanup = await r2Service.deleteVideoStorage({
            videos: [{ url: oldUrl }],
            pubkey,
          });
          if (cleanup?.deleted?.length) {
            devLogger.log(
              `[edit] Removed ${cleanup.deleted.length} superseded storage object(s).`
            );
          }
        }
      } catch (cleanupErr) {
        devLogger.warn(
          "[edit] Storage cleanup failed (edit still succeeded):",
          cleanupErr
        );
      }

      await this.callbacks.loadVideos();

      const videosMap = this.state.getVideosMap();
      if (videosMap) {
        videosMap.clear();
      }

      this.ui.showSuccess("Video updated successfully!");

      if (editModal?.setSubmitState) {
        editModal.setSubmitState({ pending: false });
      }

      if (typeof editModal.close === "function") {
        editModal.close();
      }

      this.callbacks.forceRefreshAllProfiles();
    } catch (error) {
      devLogger.error("Failed to edit video:", error);
      this.ui.showError("Failed to edit video. Please try again.");
      if (editModal?.setSubmitState) {
        editModal.setSubmitState({ pending: false });
      }
    }
  }
}
