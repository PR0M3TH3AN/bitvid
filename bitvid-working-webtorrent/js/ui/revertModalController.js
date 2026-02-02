import { devLogger } from "../utils/logger.js";

export default class RevertModalController {
  constructor({
    revertModal,
    services = {},
    state = {},
    ui = {},
    callbacks = {},
    helpers = {},
  }) {
    this.revertModal = revertModal;
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

      const activeVideos = await this.services.nostrService.fetchVideos({
        blacklistedEventIds: this.state.getBlacklistedEventIds(),
        isAuthorBlocked: (pubkey) => this.callbacks.isAuthorBlocked(pubkey),
      });

      const video = await this.helpers.resolveVideoActionTarget({
        ...normalizedTarget,
        preloadedList: activeVideos,
      });

      const pubkey = this.state.getPubkey();
      if (!pubkey) {
        this.ui.showError("Please login to revert.");
        return;
      }

      const userPubkey = (pubkey || "").toLowerCase();
      const videoPubkey = (video?.pubkey || "").toLowerCase();
      if (!video || !videoPubkey || videoPubkey !== userPubkey) {
        this.ui.showError("You do not own this video.");
        return;
      }

      if (!this.revertModal) {
        this.ui.showError("Revert modal is not available right now.");
        return;
      }

      const loaded = await this.revertModal.load();
      if (!loaded) {
        this.ui.showError("Revert modal is not available right now.");
        return;
      }

      const history = await this.services.nostrClient.hydrateVideoHistory(video);

      this.revertModal.setHistory(video, history);
      this.revertModal.open({ video }, { triggerElement });
    } catch (err) {
      devLogger.error("Failed to revert video:", err);
      this.ui.showError("Failed to load revision history. Please try again.");
    }
  }

  async handleConfirm(event) {
    const detail = event?.detail || {};
    const target = detail.target;
    const entries = Array.isArray(detail.entries)
      ? detail.entries.slice()
      : [];

    if (!target || !entries.length) {
      return;
    }

    const pubkey = this.state.getPubkey();
    if (!pubkey) {
      this.ui.showError("Please login to revert.");
      return;
    }

    if (!this.revertModal) {
      this.ui.showError("Revert modal is not available right now.");
      return;
    }

    this.revertModal.setBusy(true, "Reverting…");

    try {
      for (const entry of entries) {
        await this.services.nostrClient.revertVideo(
          {
            id: entry.id,
            pubkey: entry.pubkey,
            tags: entry.tags,
          },
          pubkey,
        );
      }

      await this.callbacks.loadVideos();

      const timestampLabel = this.helpers.formatAbsoluteTimestamp(target.created_at);
      this.ui.showSuccess(`Reverted to revision from ${timestampLabel}.`);
      this.revertModal.close();
      this.callbacks.forceRefreshAllProfiles();
    } catch (err) {
      devLogger.error("Failed to revert video:", err);
      this.ui.showError("Failed to revert video. Please try again.");
    } finally {
      this.revertModal.setBusy(false);
    }
  }
}
