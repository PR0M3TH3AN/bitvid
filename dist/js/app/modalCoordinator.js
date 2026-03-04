// js/app/modalCoordinator.js

/**
 * Modal open/close lifecycle and controller routing.
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
export function createModalCoordinator(deps) {
  const {
    devLogger,
    nostrClient,
    recordVideoViewApi,
    torrentClient,
    watchHistoryService,
    isWatchHistoryDebugEnabled,
    subscribeToVideoViewCount,
    unsubscribeFromVideoViewCount,
    formatViewCount,
    ingestLocalViewEvent,
    pointerArrayToKey,
    pointerKey,
    getCanonicalDesignSystemMode,
    BITVID_WEBSITE_URL,
  } = deps;

  return {
    normalizeModalTrigger(candidate) {
      if (!candidate) {
        return null;
      }
      const doc =
        (this.videoModal && this.videoModal.document) ||
        (typeof document !== "undefined" ? document : null);
      const isElement =
        typeof candidate === "object" &&
        candidate !== null &&
        typeof candidate.nodeType === "number" &&
        candidate.nodeType === 1 &&
        typeof candidate.focus === "function";
      if (!isElement) {
        return null;
      }
      if (doc && typeof doc.contains === "function" && !doc.contains(candidate)) {
        return null;
      }
      return candidate;
    },

    setLastModalTrigger(candidate) {
      this.lastModalTrigger = this.normalizeModalTrigger(candidate);
      return this.lastModalTrigger;
    },

    getDesignSystemMode() {
      return getCanonicalDesignSystemMode();
    },

    isDesignSystemNew() {
      return true;
    },

    /**
     * Show the modal and set the "Please stand by" poster on the video.
     */
    async showModalWithPoster(video = this.currentVideo, options = {}) {
      const result = await this.videoModalController.showModalWithPoster(video, options);
      this.cacheTorrentStatusNodes();
      return result;
    },

    applyModalLoadingPoster() {
      this.videoModalController.applyModalLoadingPoster();
    },

    forceRemoveModalPoster(reason = "manual-clear") {
      return this.videoModalController.forceRemoveModalPoster(reason);
    },

    async ensureVideoModalReady({ ensureVideoElement = false } = {}) {
      const result = await this.videoModalController.ensureVideoModalReady({ ensureVideoElement });
      this.modalVideo = result.videoElement;
      return result;
    },

    formatViewCountLabel(total) {
      const value = Number.isFinite(total) ? Number(total) : 0;
      const label = value === 1 ? "view" : "views";
      return `${formatViewCount(value)} ${label}`;
    },

    pruneDetachedViewCountElements() {
      if (this.videoListView) {
        this.videoListView.pruneDetachedViewCountElements();
      }
    },

    teardownAllViewCountSubscriptions() {
      if (this.videoListView) {
        this.videoListView.teardownAllViewCountSubscriptions();
      }
    },

    teardownModalViewCountSubscription() {
      if (typeof this.modalViewCountUnsub === "function") {
        try {
          this.modalViewCountUnsub();
        } catch (error) {
          devLogger.warn("[viewCount] Failed to tear down modal subscription:", error);
        }
      }
      this.modalViewCountUnsub = null;
      if (this.videoModal) {
        this.videoModal.updateViewCountLabel("\u2013 views");
        this.videoModal.setViewCountPointer(null);
      }
    },

    subscribeModalViewCount(pointer, pointerKey) {
      const viewEl = this.videoModal?.getViewCountElement() || null;
      if (!viewEl) {
        return;
      }

      this.teardownModalViewCountSubscription();

      if (!pointer || !pointerKey) {
        return;
      }

      if (this.videoModal) {
        this.videoModal.updateViewCountLabel("Loading views\u2026");
        this.videoModal.setViewCountPointer(pointerKey);
      }
      try {
        const token = subscribeToVideoViewCount(pointer, ({ total, status, partial }) => {
          const latestViewEl = this.videoModal?.getViewCountElement() || null;
          if (!latestViewEl) {
            return;
          }

          if (Number.isFinite(total)) {
            const numeric = Number(total);
            if (this.videoModal) {
              const label = this.formatViewCountLabel(numeric);
              this.videoModal.updateViewCountLabel(
                partial ? `${label} (partial)` : label
              );
            }
            latestViewEl.dataset.viewCountState = partial ? "partial" : "ready";
            return;
          }

          if (status === "hydrating") {
            if (this.videoModal) {
              this.videoModal.updateViewCountLabel("Loading views\u2026");
            }
            latestViewEl.dataset.viewCountState = "hydrating";
          } else {
            if (this.videoModal) {
              this.videoModal.updateViewCountLabel("\u2013 views");
            }
            latestViewEl.dataset.viewCountState = status;
          }
        });

        this.modalViewCountUnsub = () => {
          try {
            unsubscribeFromVideoViewCount(pointer, token);
          } catch (error) {
            devLogger.warn(
              "[viewCount] Failed to unsubscribe modal view counter:",
              error
            );
          } finally {
            this.modalViewCountUnsub = null;
          }
        };
      } catch (error) {
        devLogger.warn("[viewCount] Failed to subscribe modal view counter:", error);
        if (this.videoModal) {
          this.videoModal.updateViewCountLabel("\u2013 views");
          this.videoModal.setViewCountPointer(null);
        }
      }
    },

    async hideModal() {
      // 1) Clear timers/listeners immediately so playback stats stop updating
      this.cancelPendingViewLogging();
      this.clearActiveIntervals();
      this.removeTorrentStatusVisibilityHandlers();
      this.teardownModalViewCountSubscription();
      if (this.reactionController) {
        this.reactionController.unsubscribe();
      }
      this.pendingModeratedPlayback = null;
      if (
        this.videoModal &&
        typeof this.videoModal.clearSimilarContent === "function"
      ) {
        try {
          this.videoModal.clearSimilarContent();
        } catch (error) {
          devLogger.warn("[hideModal] Failed to clear similar content:", error);
        }
      }

      // 2) Close the modal UI right away so the user gets instant feedback
      const modalVideoElement =
        (this.videoModal &&
          typeof this.videoModal.getVideoElement === "function" &&
          this.videoModal.getVideoElement()) ||
        this.modalVideo ||
        null;
      if (modalVideoElement) {
        try {
          modalVideoElement.pause();
          modalVideoElement.removeAttribute("src");
          modalVideoElement.load();
        } catch (error) {
          devLogger.warn("[hideModal] Failed to reset modal video element:", error);
        }
      }

      if (this.videoModal) {
        try {
          this.videoModal.close();
        } catch (error) {
          devLogger.warn("[hideModal] Failed to close video modal immediately:", error);
        }
      }

      this.lastModalTrigger = null;

      this.currentMagnetUri = null;
      this.clearTorrentStatusNodes();

      // 3) Kick off heavy cleanup work asynchronously. We still await it so
      // callers that depend on teardown finishing behave the same, but the
      // user-visible UI is already closed.
      const performCleanup = async () => {
        try {
          if (navigator.serviceWorker && navigator.serviceWorker.controller) {
            await fetch("/webtorrent/cancel/", { mode: "no-cors" });
          }
        } catch (err) {
          devLogger.warn("[hideModal] webtorrent cancel fetch failed:", err);
        }

        await this.cleanup({
          preserveSubscriptions: true,
          preserveObservers: true,
          preserveModals: true,
        });
      };

      // 4) Remove only `?v=` but **keep** the hash
      const url = new URL(window.location.href);
      url.searchParams.delete("v"); // remove ?v= param
      const newUrl = url.pathname + url.search + url.hash;
      window.history.replaceState({}, "", newUrl);

      try {
        await performCleanup();
      } catch (error) {
        devLogger.error("[hideModal] Cleanup failed:", error);
      }
    },

    cancelPendingViewLogging() {
      this.watchHistoryTelemetry?.cancelPlaybackLogging?.();
    },

    resetViewLoggingState() {
      this.watchHistoryTelemetry?.resetPlaybackLoggingState?.();
    },

    persistWatchHistoryMetadataForVideo(video, pointerInfo) {
      if (this.watchHistoryTelemetry) {
        this.watchHistoryTelemetry.persistMetadataForVideo(video, pointerInfo);
        return;
      }

      if (
        !pointerInfo ||
        !pointerInfo.key ||
        typeof watchHistoryService?.setLocalMetadata !== "function"
      ) {
        return;
      }

      if (!video || typeof video !== "object") {
        return;
      }

      const metadata = {
        video: {
          id: typeof video.id === "string" ? video.id : "",
          title: typeof video.title === "string" ? video.title : "",
          thumbnail: typeof video.thumbnail === "string" ? video.thumbnail : "",
          pubkey: typeof video.pubkey === "string" ? video.pubkey : "",
        },
      };

      try {
        watchHistoryService.setLocalMetadata(pointerInfo.key, metadata);
      } catch (error) {
        devLogger.warn(
          "[watchHistory] Failed to persist local metadata for pointer:",
          pointerInfo.key,
          error,
        );
      }
    },

    dropWatchHistoryMetadata(pointerKey) {
      if (this.watchHistoryTelemetry) {
        this.watchHistoryTelemetry.dropMetadata(pointerKey);
        return;
      }

      if (!pointerKey || typeof pointerKey !== "string") {
        return;
      }
      if (typeof watchHistoryService?.removeLocalMetadata !== "function") {
        return;
      }
      try {
        watchHistoryService.removeLocalMetadata(pointerKey);
      } catch (error) {
        devLogger.warn(
          "[watchHistory] Failed to remove cached metadata for pointer:",
          pointerKey,
          error,
        );
      }
    },

    async handleRemoveHistoryAction(dataset = {}, { trigger } = {}) {
      if (!this.watchHistoryController) {
        this.showError("Watch history sync is not available right now.");
        return;
      }

      try {
        await this.watchHistoryController.removeEntry({
          dataset,
          trigger,
          removeCard: dataset.removeCard === "true",
          reason: dataset.reason || "remove-item",
        });
      } catch (error) {
        if (!error?.handled) {
          this.showError("Failed to remove from history. Please try again.");
        }
      }
    },

    async handleWatchHistoryRemoval(payload = {}) {
      if (!this.watchHistoryTelemetry) {
        this.showError("Watch history sync is not available right now.");
        const error = new Error("watch-history-disabled");
        error.handled = true;
        throw error;
      }
      return this.watchHistoryTelemetry.handleRemoval(payload);
    },

    flushWatchHistory(reason = "session-end", context = "watch-history") {
      if (!this.watchHistoryTelemetry) {
        return Promise.resolve();
      }
      return this.watchHistoryTelemetry.flush(reason, context);
    },

    getActiveViewIdentityKey() {
      if (!this.watchHistoryTelemetry) {
        const normalizedUser = this.normalizeHexPubkey(this.pubkey);
        if (normalizedUser) {
          return `actor:${normalizedUser}`;
        }

        const sessionActorPubkey = this.normalizeHexPubkey(
          nostrClient?.sessionActor?.pubkey
        );
        if (sessionActorPubkey) {
          return `actor:${sessionActorPubkey}`;
        }

        return "actor:anonymous";
      }

      return this.watchHistoryTelemetry.getActiveViewIdentityKey();
    },

    deriveViewIdentityKeyFromEvent(event) {
      if (!this.watchHistoryTelemetry) {
        if (!event || typeof event !== "object") {
          return "";
        }

        const normalizedPubkey = this.normalizeHexPubkey(event.pubkey);
        if (!normalizedPubkey) {
          return "";
        }

        return `actor:${normalizedPubkey}`;
      }

      return this.watchHistoryTelemetry.deriveViewIdentityKeyFromEvent(event);
    },

    buildViewCooldownKey(pointerKey, identityKey) {
      if (!this.watchHistoryTelemetry) {
        const normalizedPointerKey =
          typeof pointerKey === "string" && pointerKey.trim()
            ? pointerKey.trim()
            : "";
        if (!normalizedPointerKey) {
          return "";
        }

        const normalizedIdentity =
          typeof identityKey === "string" && identityKey.trim()
            ? identityKey.trim().toLowerCase()
            : "";

        return normalizedIdentity
          ? `${normalizedPointerKey}::${normalizedIdentity}`
          : normalizedPointerKey;
      }

      return this.watchHistoryTelemetry.buildViewCooldownKey(
        pointerKey,
        identityKey
      );
    },

    preparePlaybackLogging(videoEl) {
      if (!this.watchHistoryTelemetry) {
        this.cancelPendingViewLogging();
        return;
      }

      const pointer = this.currentVideoPointer;
      const pointerKey = this.currentVideoPointerKey || pointerArrayToKey(pointer);

      if (!pointer || !pointerKey) {
        this.watchHistoryTelemetry.cancelPlaybackLogging();
        return;
      }

      this.watchHistoryTelemetry.preparePlaybackLogging({
        videoElement: videoEl,
        pointer,
        pointerKey,
        video: this.currentVideo,
      });
    },

    teardownVideoElement(videoElement, { replaceNode = false } = {}) {
      if (!videoElement) {
        this.log(
          `[teardownVideoElement] No video provided (replaceNode=${replaceNode}); skipping.`
        );
        return videoElement;
      }

      const safe = (fn) => {
        try {
          fn();
        } catch (err) {
          devLogger.warn("[teardownVideoElement]", err);
        }
      };

      const describeSource = () => {
        try {
          return videoElement.currentSrc || videoElement.src || "<unset>";
        } catch (err) {
          return "<unavailable>";
        }
      };

      this.log(
        `[teardownVideoElement] Resetting video (replaceNode=${replaceNode}) readyState=${videoElement.readyState} networkState=${videoElement.networkState} src=${describeSource()}`
      );

      safe(() => videoElement.pause());

      safe(() => {
        videoElement.removeAttribute("src");
        videoElement.src = "";
      });

      safe(() => {
        videoElement.srcObject = null;
      });

      safe(() => {
        if ("crossOrigin" in videoElement) {
          videoElement.crossOrigin = null;
        }
        if (videoElement.hasAttribute("crossorigin")) {
          videoElement.removeAttribute("crossorigin");
        }
      });

      safe(() => {
        if (typeof videoElement.load === "function") {
          videoElement.load();
        }
      });

      if (!replaceNode || !videoElement.parentNode) {
        this.log(
          `[teardownVideoElement] Completed without node replacement (readyState=${videoElement.readyState}).`
        );
        return videoElement;
      }

      const parent = videoElement.parentNode;
      const clone = videoElement.cloneNode(false);

      if (clone.dataset && "autoplayBound" in clone.dataset) {
        delete clone.dataset.autoplayBound;
      }
      if (clone.hasAttribute("data-autoplay-bound")) {
        clone.removeAttribute("data-autoplay-bound");
      }

      safe(() => {
        clone.removeAttribute("src");
        clone.src = "";
      });

      safe(() => {
        clone.srcObject = null;
      });

      safe(() => {
        if ("crossOrigin" in clone) {
          clone.crossOrigin = null;
        }
        if (clone.hasAttribute("crossorigin")) {
          clone.removeAttribute("crossorigin");
        }
      });

      clone.autoplay = videoElement.autoplay;
      clone.controls = videoElement.controls;
      clone.loop = videoElement.loop;
      clone.muted = videoElement.muted;
      clone.defaultMuted = videoElement.defaultMuted;
      clone.preload = videoElement.preload;
      clone.playsInline = videoElement.playsInline;

      clone.poster = "";
      if (clone.hasAttribute("poster")) {
        clone.removeAttribute("poster");
      }

      let replaced = false;
      safe(() => {
        parent.replaceChild(clone, videoElement);
        replaced = true;
      });

      if (!replaced) {
        return videoElement;
      }

      safe(() => {
        if (typeof clone.load === "function") {
          clone.load();
        }
      });

      this.log(
        `[teardownVideoElement] Replaced modal video node (readyState=${clone.readyState} networkState=${clone.networkState}).`
      );

      return clone;
    },

    resetTorrentStats() {
      try {
        if (this.videoModal && typeof this.videoModal.resetStats === "function") {
          this.videoModal.resetStats();
        } else {
          devLogger.info(
            "[Application] resetTorrentStats: videoModal.resetStats not available \u2014 skipping."
          );
        }
      } catch (err) {
        devLogger.warn("[Application] resetTorrentStats failed", err);
      }
    },

    setShareButtonState(enabled) {
      if (this.videoModal) {
        this.videoModal.setShareEnabled(enabled);
      }
    },

    getShareUrlBase() {
      if (typeof BITVID_WEBSITE_URL === "string" && BITVID_WEBSITE_URL) {
        // Ensure no trailing slash for consistency if desired, though buildShareUrlFromNevent
        // appends ?v=... so trailing slash is fine if URL ctor handles it.
        // BITVID_WEBSITE_URL usually has a trailing slash in config, but let's be safe.
        return BITVID_WEBSITE_URL.replace(/\/$/, "");
      }

      try {
        const current = new URL(window.location.href);
        // If we are in the embed, we want to strip that filename.
        if (current.pathname.endsWith("/embed.html")) {
          return `${current.origin}${current.pathname.replace(/\/embed\.html$/, "")}`;
        }
        return `${current.origin}${current.pathname}`;
      } catch (err) {
        const origin = window.location?.origin || "";
        const pathname = window.location?.pathname || "";
        if (origin || pathname) {
          return `${origin}${pathname}`;
        }
        const href = window.location?.href || "";
        if (href) {
          const base = href.split(/[?#]/)[0];
          if (base) {
            return base;
          }
        }
        devLogger.warn("Unable to determine share URL base:", err);
        return "";
      }
    },
  };
}
