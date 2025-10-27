import { devLogger } from "../utils/logger.js";

export default class ModerationActionController {
  constructor({
    services = {},
    selectors = {},
    actions = {},
    auth = {},
    ui = {},
  } = {}) {
    this.services = {
      setModerationOverride:
        typeof services.setModerationOverride === "function"
          ? services.setModerationOverride
          : null,
      clearModerationOverride:
        typeof services.clearModerationOverride === "function"
          ? services.clearModerationOverride
          : null,
      userBlocks:
        services.userBlocks && typeof services.userBlocks === "object"
          ? services.userBlocks
          : null,
    };

    this.selectors = {
      getVideoById:
        typeof selectors.getVideoById === "function"
          ? selectors.getVideoById
          : null,
      getCurrentVideo:
        typeof selectors.getCurrentVideo === "function"
          ? selectors.getCurrentVideo
          : null,
    };

    this.actions = {
      decorateVideoModeration:
        typeof actions.decorateVideoModeration === "function"
          ? actions.decorateVideoModeration
          : null,
      resumePlayback:
        typeof actions.resumePlayback === "function"
          ? actions.resumePlayback
          : null,
      refreshVideos:
        typeof actions.refreshVideos === "function"
          ? actions.refreshVideos
          : null,
      showStatus:
        typeof actions.showStatus === "function" ? actions.showStatus : null,
      showError:
        typeof actions.showError === "function" ? actions.showError : null,
      describeBlockError:
        typeof actions.describeBlockError === "function"
          ? actions.describeBlockError
          : null,
    };

    this.auth = {
      isLoggedIn:
        typeof auth.isLoggedIn === "function" ? auth.isLoggedIn : null,
      getViewerPubkey:
        typeof auth.getViewerPubkey === "function"
          ? auth.getViewerPubkey
          : null,
      normalizePubkey:
        typeof auth.normalizePubkey === "function"
          ? auth.normalizePubkey
          : null,
    };

    this.ui = {
      refreshCardModerationUi:
        typeof ui.refreshCardModerationUi === "function"
          ? ui.refreshCardModerationUi
          : null,
      dispatchModerationEvent:
        typeof ui.dispatchModerationEvent === "function"
          ? ui.dispatchModerationEvent
          : null,
    };

    this.destroyed = false;
  }

  destroy() {
    this.destroyed = true;
  }

  handleOverride({ video, card } = {}) {
    if (this.destroyed) {
      return false;
    }

    if (!video || typeof video !== "object" || !video.id) {
      return false;
    }

    this.persistModerationOverride(video.id);

    const target = this.resolveTargetVideo(video);
    this.clearHideState(target);
    this.decorateVideo(target);

    const current = this.getCurrentVideo();
    if (current && current.id === video.id) {
      this.clearHideState(current);
      this.decorateVideo(current);
    }

    this.refreshCard(card, { reason: "" });
    this.dispatchModerationEvent("video:moderation-override", { video: target });

    if (target) {
      this.resumePlayback(target);
    }

    return true;
  }

  async handleBlock({ video, card } = {}) {
    if (this.destroyed) {
      return false;
    }

    if (!video || typeof video !== "object" || !video.id) {
      return false;
    }

    const { userBlocks } = this.services;
    if (!userBlocks) {
      devLogger.warn(
        "[ModerationActionController] Block action requested but userBlocks service is unavailable.",
      );
      return false;
    }

    if (!this.isUserLoggedIn()) {
      this.showStatus("Log in to block accounts.", { showSpinner: false });
      return false;
    }

    const viewerHex = this.getViewerHex();
    if (!viewerHex) {
      this.showError("Select a profile before blocking accounts.");
      return false;
    }

    const targetHex = this.getTargetHex(video);
    if (!targetHex) {
      this.showError("Unable to determine which account to block.");
      return false;
    }

    if (viewerHex === targetHex) {
      this.showError("You cannot block yourself.");
      return false;
    }

    try {
      await userBlocks.ensureLoaded(viewerHex);
    } catch (error) {
      devLogger.warn(
        "[ModerationActionController] Failed to load block list before blocking:",
        error,
      );
      this.showError("Unable to load your block list. Please try again.");
      return false;
    }

    let alreadyBlocked =
      typeof userBlocks.isBlocked === "function" &&
      userBlocks.isBlocked(targetHex);
    let blockApplied = false;

    if (!alreadyBlocked) {
      try {
        const result = await userBlocks.addBlock(targetHex, viewerHex);
        alreadyBlocked = true;
        blockApplied = result?.already !== true;
      } catch (error) {
        const message =
          this.describeBlockError(error) ||
          "Failed to block this creator. Please try again.";
        this.showError(message);
        devLogger.warn(
          "[ModerationActionController] Failed to block creator:",
          error,
        );
        return false;
      }
    }

    if (alreadyBlocked) {
      const statusMessage = blockApplied
        ? "Creator blocked. Their videos will disappear from your feed."
        : "Creator already blocked. Their videos will disappear from your feed.";
      this.showStatus(statusMessage, { showSpinner: false });
    }

    this.clearModerationOverride(video.id);

    const target = this.resolveTargetVideo(video);
    this.clearViewerOverride(target);
    this.clearHideBypass(target);
    this.decorateVideo(target);

    const current = this.getCurrentVideo();
    if (current && current.id === video.id) {
      this.clearViewerOverride(current);
      this.clearHideBypass(current);
      this.decorateVideo(current);
    }

    this.refreshCard(card, { reason: "after block" });

    const detail = { video: target };
    this.dispatchModerationEvent("video:moderation-block", detail);
    this.dispatchModerationEvent("video:moderation-hide", detail);

    await this.refreshVideosAfterBlock();

    return true;
  }

  handleHide({ video, card } = {}) {
    if (this.destroyed) {
      return false;
    }

    if (!video || typeof video !== "object" || !video.id) {
      return false;
    }

    this.clearModerationOverride(video.id);

    const target = this.resolveTargetVideo(video);
    this.clearViewerOverride(target);
    this.decorateVideo(target);

    const current = this.getCurrentVideo();
    if (current && current.id === video.id) {
      this.clearViewerOverride(current);
      this.decorateVideo(current);
    }

    this.refreshCard(card, { reason: "after hide" });
    this.dispatchModerationEvent("video:moderation-hide", { video: target });

    return true;
  }

  resolveTargetVideo(video) {
    if (!video || typeof video !== "object" || !video.id) {
      return null;
    }

    if (!this.selectors.getVideoById) {
      return video;
    }

    try {
      const stored = this.selectors.getVideoById(video.id);
      return stored || video;
    } catch (error) {
      devLogger.warn(
        "[ModerationActionController] Failed to resolve video by id:",
        error,
      );
      return video;
    }
  }

  getCurrentVideo() {
    if (!this.selectors.getCurrentVideo) {
      return null;
    }

    try {
      return this.selectors.getCurrentVideo();
    } catch (error) {
      devLogger.warn(
        "[ModerationActionController] Failed to resolve current video:",
        error,
      );
      return null;
    }
  }

  clearHideState(video) {
    const moderation = this.getModerationState(video);
    if (!moderation) {
      return;
    }

    if (moderation.hidden) {
      delete moderation.hidden;
    }
    if (moderation.hideReason) {
      delete moderation.hideReason;
    }
    if (moderation.hideCounts) {
      delete moderation.hideCounts;
    }
    if (moderation.hideBypass) {
      delete moderation.hideBypass;
    }
  }

  clearViewerOverride(video) {
    const moderation = this.getModerationState(video);
    if (moderation?.viewerOverride) {
      delete moderation.viewerOverride;
    }
  }

  clearHideBypass(video) {
    const moderation = this.getModerationState(video);
    if (moderation?.hideBypass) {
      delete moderation.hideBypass;
    }
  }

  getModerationState(video) {
    if (!video || typeof video !== "object") {
      return null;
    }

    const moderation = video.moderation;
    if (!moderation || typeof moderation !== "object") {
      return null;
    }

    return moderation;
  }

  decorateVideo(video) {
    if (!video || !this.actions.decorateVideoModeration) {
      return;
    }

    try {
      this.actions.decorateVideoModeration(video);
    } catch (error) {
      devLogger.warn(
        "[ModerationActionController] Failed to decorate video moderation:",
        error,
      );
    }
  }

  refreshCard(card, { reason } = {}) {
    if (!card) {
      return;
    }

    if (this.ui.refreshCardModerationUi) {
      this.ui.refreshCardModerationUi(card, { reason });
      return;
    }

    if (typeof card.refreshModerationUi === "function") {
      try {
        card.refreshModerationUi();
      } catch (error) {
        const suffix = reason ? ` ${reason}` : "";
        devLogger.warn(
          `[ModerationActionController] Failed to refresh moderation UI${suffix}:`,
          error,
        );
      }
    }
  }

  dispatchModerationEvent(eventName, detail = {}) {
    if (this.ui.dispatchModerationEvent) {
      this.ui.dispatchModerationEvent(eventName, detail);
      return;
    }

    const doc =
      typeof document !== "undefined" && document
        ? document
        : null;
    if (!doc || typeof doc.dispatchEvent !== "function") {
      return;
    }

    try {
      doc.dispatchEvent(new CustomEvent(eventName, { detail }));
    } catch (error) {
      devLogger.warn(
        `[ModerationActionController] Failed to dispatch ${eventName}:`,
        error,
      );
    }
  }

  resumePlayback(video) {
    if (!video || !this.actions.resumePlayback) {
      return;
    }

    try {
      this.actions.resumePlayback(video);
    } catch (error) {
      devLogger.warn(
        "[ModerationActionController] Failed to resume moderated playback:",
        error,
      );
    }
  }

  async refreshVideosAfterBlock() {
    if (!this.actions.refreshVideos) {
      return;
    }

    try {
      await this.actions.refreshVideos({ reason: "user-block-update" });
    } catch (error) {
      devLogger.warn(
        "[ModerationActionController] Failed to refresh videos after block:",
        error,
      );
    }
  }

  persistModerationOverride(eventId) {
    if (!eventId || !this.services.setModerationOverride) {
      return;
    }

    try {
      this.services.setModerationOverride(eventId, {
        showAnyway: true,
        updatedAt: Date.now(),
      });
    } catch (error) {
      devLogger.warn(
        "[ModerationActionController] Failed to persist moderation override:",
        error,
      );
    }
  }

  clearModerationOverride(eventId) {
    if (!eventId || !this.services.clearModerationOverride) {
      return;
    }

    try {
      this.services.clearModerationOverride(eventId);
    } catch (error) {
      devLogger.warn(
        "[ModerationActionController] Failed to clear moderation override:",
        error,
      );
    }
  }

  isUserLoggedIn() {
    if (!this.auth.isLoggedIn) {
      return false;
    }

    try {
      return this.auth.isLoggedIn();
    } catch (error) {
      devLogger.warn(
        "[ModerationActionController] Failed to evaluate login state:",
        error,
      );
      return false;
    }
  }

  getViewerHex() {
    if (!this.auth.getViewerPubkey || !this.auth.normalizePubkey) {
      return null;
    }

    try {
      const pubkey = this.auth.getViewerPubkey();
      return pubkey ? this.auth.normalizePubkey(pubkey) : null;
    } catch (error) {
      devLogger.warn(
        "[ModerationActionController] Failed to resolve viewer pubkey:",
        error,
      );
      return null;
    }
  }

  getTargetHex(video) {
    if (!video || !this.auth.normalizePubkey) {
      return null;
    }

    try {
      return this.auth.normalizePubkey(video?.pubkey);
    } catch (error) {
      devLogger.warn(
        "[ModerationActionController] Failed to normalize target pubkey:",
        error,
      );
      return null;
    }
  }

  showStatus(message, options) {
    if (!this.actions.showStatus) {
      return;
    }

    try {
      this.actions.showStatus(message, options);
    } catch (error) {
      devLogger.warn(
        "[ModerationActionController] Failed to show status message:",
        error,
      );
    }
  }

  showError(message) {
    if (!this.actions.showError) {
      return;
    }

    try {
      this.actions.showError(message);
    } catch (error) {
      devLogger.warn(
        "[ModerationActionController] Failed to show error message:",
        error,
      );
    }
  }

  describeBlockError(error) {
    if (!this.actions.describeBlockError) {
      return "";
    }

    try {
      return this.actions.describeBlockError(error);
    } catch (describeError) {
      devLogger.warn(
        "[ModerationActionController] Failed to describe block error:",
        describeError,
      );
      return "";
    }
  }
}
