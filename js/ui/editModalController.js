import { devLogger } from "../utils/logger.js";
import r2Service from "../services/r2Service.js";
import blossomService, {
  blobSha256FromUrl,
} from "../services/blossomService.js";
import { getActiveSigner } from "../nostrClientRegistry.js";
import { readRelayPublishSummary } from "../nostrPublish.js";

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
      const editedEvent = await this.services.nostrService.handleEditVideoSubmit({
        originalEvent,
        updatedData,
        pubkey,
      });

      // Best-effort: when the hosted video URL and/or thumbnail were genuinely
      // replaced, the old R2/S3 objects are now orphaned — remove them. For each,
      // we require both old and new values to be non-empty and different so we
      // never delete an object the new note still references (e.g. the URL was
      // merely cleared, or the thumbnail was left unchanged). The video entry
      // also takes its sibling .torrent. Never blocks the edit.
      try {
        const orphans = [];

        const oldUrl = detail.video?.url || "";
        const newUrl = updatedData?.url || "";
        if (updatedData?.urlEdited && oldUrl && newUrl && oldUrl !== newUrl) {
          // collectVideoStorageKeys derives the video key + its .torrent.
          orphans.push({ url: oldUrl });
        }

        const oldThumb = detail.video?.thumbnail || "";
        const newThumb = updatedData?.thumbnail || "";
        if (oldThumb && newThumb && oldThumb !== newThumb) {
          orphans.push({ thumbnail: oldThumb });
        }

        if (orphans.length) {
          const cleanup = await r2Service.deleteVideoStorage({
            videos: orphans,
            pubkey,
          });
          if (cleanup?.deleted?.length) {
            devLogger.log(
              `[edit] Removed ${cleanup.deleted.length} superseded storage object(s).`
            );
          }

          // Blossom orphans are content-addressed blobs, not R2/S3 keys — delete
          // them via BUD-12 (best-effort, from each blob URL's own origin).
          const blossomUrls = orphans
            .map((o) => o.url || o.thumbnail || "")
            .filter((u) => blobSha256FromUrl(u));
          if (blossomUrls.length) {
            const activeSigner = getActiveSigner();
            if (activeSigner && typeof activeSigner.signEvent === "function") {
              const signer = (draft) => activeSigner.signEvent(draft);
              for (const url of blossomUrls) {
                const res = await blossomService.deleteByUrl({ url, signer });
                if (res.deleted?.length) {
                  devLogger.log(
                    `[edit] Deleted superseded Blossom blob ${res.sha256}.`
                  );
                }
              }
            }
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

      // #49: an all-timeout publish reaches here flagged unconfirmed — say so
      // honestly instead of claiming a confirmed update.
      const tally = readRelayPublishSummary(editedEvent);
      if (tally?.unconfirmed === true && !(tally.accepted > 0)) {
        this.ui.showSuccess(
          "Video update sent, but no relay has confirmed it yet — it may take a moment to propagate.",
        );
      } else {
        this.ui.showSuccess("Video updated successfully!");
      }

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
