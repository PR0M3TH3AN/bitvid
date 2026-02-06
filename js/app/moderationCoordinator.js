// js/app/moderationCoordinator.js

/**
 * Moderation setting update flow, decoration, and action routing.
 *
 * All module-level dependencies are injected from the Application
 * composition root rather than imported at module scope.
 *
 * Methods use `this` which is bound to the Application instance.
 */

/**
 * @param {object} deps - Injected dependencies.
 * @returns {object} Methods to be bound to the Application instance.
 */
export function createModerationCoordinator(deps) {
  const {
    devLogger,
    ModerationActionController,
    setModerationOverride,
    clearModerationOverride,
    userBlocks,
    buildVideoAddressPointer,
    VIDEO_EVENT_KIND,
  } = deps;

  return {
    async handleModerationSettingsChange({ settings, skipRefresh = false } = {}) {
      const normalized = this.normalizeModerationSettings(settings);
      this.moderationSettings = normalized;
      const feedContext = {
        feedName: this.feedName || "",
        feedVariant: this.feedVariant || "",
      };

      if (this.videosMap instanceof Map) {
        for (const video of this.videosMap.values()) {
          if (video && typeof video === "object") {
            this.decorateVideoModeration(video, feedContext);
          }
        }
      }

      if (
        this.videoListView &&
        Array.isArray(this.videoListView.videoCardInstances)
      ) {
        for (const card of this.videoListView.videoCardInstances) {
          if (!card || typeof card.refreshModerationUi !== "function") {
            continue;
          }
          if (card.video && typeof card.video === "object") {
            this.decorateVideoModeration(card.video, feedContext);
          }
          try {
            card.refreshModerationUi();
          } catch (error) {
            devLogger.warn(
              "[Application] Failed to refresh moderation UI:",
              error,
            );
          }
        }
      }

      if (this.videoListView && Array.isArray(this.videoListView.currentVideos)) {
        for (const video of this.videoListView.currentVideos) {
          if (video && typeof video === "object") {
            this.decorateVideoModeration(video, feedContext);
          }
        }
      }

      if (this.currentVideo && typeof this.currentVideo === "object") {
        this.decorateVideoModeration(this.currentVideo, feedContext);
      }

      this.moderationDecorator.updateSettings(normalized);

      if (!skipRefresh) {
        try {
          await this.onVideosShouldRefresh({ reason: "moderation-settings-change" });
        } catch (error) {
          devLogger.warn(
            "[Application] Failed to refresh videos after moderation settings change:",
            error,
          );
        }
      }

      return normalized;
    },

    refreshVisibleModerationUi({ reason } = {}) {
      const context = reason ? ` after ${reason}` : "";
      const feedContext = {
        feedName: this.feedName || "",
        feedVariant: this.feedVariant || "",
      };

      const redecorateVideo = (video) => {
        if (!video || typeof video !== "object") {
          return;
        }

        try {
          this.decorateVideoModeration(video, feedContext);
        } catch (error) {
          devLogger.warn(
            `[Application] Failed to decorate video moderation${context}:`,
            error,
          );
        }
      };

      if (this.videosMap instanceof Map) {
        for (const video of this.videosMap.values()) {
          redecorateVideo(video);
        }
      }

      if (this.videoListView && Array.isArray(this.videoListView.currentVideos)) {
        for (const video of this.videoListView.currentVideos) {
          redecorateVideo(video);
        }
      }

      if (this.videoListView && Array.isArray(this.videoListView.videoCardInstances)) {
        for (const card of this.videoListView.videoCardInstances) {
          if (!card || typeof card !== "object") {
            continue;
          }

          if (card.video && typeof card.video === "object") {
            redecorateVideo(card.video);
          }

          if (typeof card.refreshModerationUi === "function") {
            try {
              card.refreshModerationUi();
            } catch (error) {
              devLogger.warn(
                `[Application] Failed to refresh moderation UI on card${context}:`,
                error,
              );
            }
          }
        }
      }

      if (this.currentVideo && typeof this.currentVideo === "object") {
        redecorateVideo(this.currentVideo);

        try {
          this.videoModal?.refreshActiveVideoModeration?.({ video: this.currentVideo });
        } catch (error) {
          devLogger.warn(
            `[Application] Failed to refresh video modal moderation UI${context}:`,
            error,
          );
        }
      }
    },

    deriveModerationReportType(summary) {
      return this.moderationDecorator.deriveModerationReportType(summary);
    },

    deriveModerationTrustedCount(summary, reportType) {
      return this.moderationDecorator.deriveModerationTrustedCount(summary, reportType);
    },

    getReporterDisplayName(pubkey) {
      return this.moderationDecorator.getReporterDisplayName(pubkey);
    },

    normalizeModerationSettings(settings = null) {
      return this.moderationDecorator.normalizeModerationSettings(settings);
    },

    getActiveModerationThresholds() {
      this.moderationSettings = this.moderationDecorator.normalizeModerationSettings(this.moderationSettings);
      return { ...this.moderationSettings };
    },

    decorateVideoModeration(video, feedContext = {}) {
      const decorated = this.moderationDecorator.decorateVideo(video, feedContext);
      if (
        video &&
        video.pubkey &&
        this.isAuthorBlocked(video.pubkey) &&
        decorated &&
        decorated.moderation
      ) {
        decorated.moderation.viewerMuted = true;
        decorated.moderation.hidden = true;
        decorated.moderation.hideReason = "viewer-block";
      }
      return decorated;
    },

    initializeModerationActionController() {
      if (this.moderationActionController) {
        return this.moderationActionController;
      }

      this.moderationActionController = new ModerationActionController({
        services: {
          setModerationOverride,
          clearModerationOverride,
          userBlocks,
        },
        selectors: {
          getVideoById: (id) =>
            this.videosMap instanceof Map && id ? this.videosMap.get(id) : null,
          getCurrentVideo: () => this.currentVideo,
        },
        actions: {
          decorateVideoModeration: (video) => this.decorateVideoModeration(video),
          resumePlayback: (video) => this.resumePendingModeratedPlayback(video),
          refreshVideos: (payload) => this.onVideosShouldRefresh(payload),
          showStatus: (message, options) => this.showStatus(message, options),
          showError: (message) => this.showError(message),
          describeBlockError: (error) => this.describeUserBlockActionError(error),
        },
        auth: {
          isLoggedIn: () => this.isUserLoggedIn(),
          getViewerPubkey: () => this.pubkey,
          normalizePubkey: (value) => this.normalizeHexPubkey(value),
        },
        ui: {
          refreshCardModerationUi: (card, options) =>
            this.refreshCardModerationUi(card, options),
          dispatchModerationEvent: (eventName, detail) =>
            this.dispatchModerationEvent(eventName, detail),
        },
      });

      return this.moderationActionController;
    },

    refreshCardModerationUi(card, { reason } = {}) {
      if (!card || typeof card.refreshModerationUi !== "function") {
        return false;
      }

      try {
        card.refreshModerationUi();
        return true;
      } catch (error) {
        const suffix = reason ? ` ${reason}` : "";
        devLogger.warn(
          `[Application] Failed to refresh moderation UI${suffix}:`,
          error,
        );
        return false;
      }
    },

    dispatchModerationEvent(eventName, detail = {}) {
      const doc =
        (this.videoModal && this.videoModal.document) ||
        (typeof document !== "undefined" ? document : null);

      if (!doc || typeof doc.dispatchEvent !== "function") {
        return false;
      }

      try {
        doc.dispatchEvent(new CustomEvent(eventName, { detail }));
        return true;
      } catch (error) {
        const eventLabels = {
          "video:moderation-override": "moderation override event",
          "video:moderation-block": "moderation block event",
          "video:moderation-hide": "moderation hide event",
        };
        const label = eventLabels[eventName] || eventName;
        devLogger.warn(`[Application] Failed to dispatch ${label}:`, error);
        return false;
      }
    },

    handleModerationOverride(payload = {}) {
      const controller = this.initializeModerationActionController();
      if (!controller) {
        return false;
      }

      return controller.handleOverride(payload);
    },

    async handleModerationBlock(payload = {}) {
      const controller = this.initializeModerationActionController();
      if (!controller) {
        return false;
      }

      return controller.handleBlock(payload);
    },

    handleModerationHide(payload = {}) {
      const controller = this.initializeModerationActionController();
      if (!controller) {
        return false;
      }

      return controller.handleHide(payload);
    },

    getVideoAddressPointer(video) {
      if (
        this.discussionCountService &&
        typeof this.discussionCountService.getVideoAddressPointer === "function"
      ) {
        return this.discussionCountService.getVideoAddressPointer(video);
      }

      return buildVideoAddressPointer(video, { defaultKind: VIDEO_EVENT_KIND });
    },
  };
}
