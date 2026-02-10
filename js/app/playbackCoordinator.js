// js/app/playbackCoordinator.js

/**
 * URL-first + magnet fallback playback pipeline.
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
export function createPlaybackCoordinator(deps) {
  const {
    devLogger,
    userLogger,
    nostrClient,
    torrentClient,
    emit,
    accessControl,
    isValidMagnetUri,
    safeDecodeMagnet,
    extractBtihFromMagnet,
    collectVideoTags,
    resolveVideoPointer,
    formatShortNpub,
    formatAbsoluteDateWithOrdinalUtil,
    getVideoRootIdentifier,
    applyRootTimestampToVideosMap,
    syncActiveVideoRootTimestamp,
    fetchProfileMetadata,
    ensureProfileMetadataSubscription,
    dedupeToNewestByRoot,
    buildServiceWorkerFallbackStatus,
    sanitizeProfileMediaUrl,
    UNSUPPORTED_BTITH_MESSAGE,
    BITVID_WEBSITE_URL,
    FALLBACK_THUMBNAIL_SRC,
  } = deps;

  return {
    checkUrlParams() {
      const urlParams = new URLSearchParams(window.location.search);
      const maybeNevent = urlParams.get("v");
      if (!maybeNevent) return; // no link param

      try {
        const decoded = window.NostrTools.nip19.decode(maybeNevent);
        if (decoded.type === "nevent" && decoded.data.id) {
          const eventId = decoded.data.id;
          const relay =
            Array.isArray(decoded.data.relays) && decoded.data.relays.length
              ? decoded.data.relays[0]
              : null;
          // 1) check local map
          let localMatch = this.videosMap.get(eventId);
          if (localMatch) {
            this.playVideoByEventId(eventId, { relay });
          } else {
            // 2) fallback => getOldEventById
            this.getOldEventById(eventId)
              .then((video) => {
                if (video) {
                  this.playVideoByEventId(eventId, { relay });
                } else {
                  this.showError("No matching video found for that link.");
                }
              })
              .catch((err) => {
                devLogger.error("Error fetching older event by ID:", err);
                this.showError("Could not load videos for the share link.");
              });
          }
        }
      } catch (err) {
        devLogger.error("Error decoding nevent:", err);
        this.showError("Invalid share link.");
      }
    },

    shouldDeferModeratedPlayback(video) {
      if (!video || typeof video !== "object") {
        return false;
      }

      const moderation =
        video.moderation && typeof video.moderation === "object"
          ? video.moderation
          : null;

      if (!moderation) {
        return false;
      }

      if (moderation.viewerOverride?.showAnyway === true) {
        return false;
      }

      const blurActive = moderation.blurThumbnail === true;
      const hiddenActive = moderation.hidden === true;

      return blurActive || hiddenActive;
    },

    resumePendingModeratedPlayback(video) {
      const pending = this.pendingModeratedPlayback;
      if (!pending) {
        return;
      }

      const activeVideo = this.currentVideo || null;
      const targetVideo = video && typeof video === "object" ? video : activeVideo;
      if (!targetVideo) {
        return;
      }

      const pendingId =
        typeof pending.videoId === "string" && pending.videoId ? pending.videoId : "";
      const targetId =
        typeof targetVideo.id === "string" && targetVideo.id ? targetVideo.id : "";

      const matchesId = pendingId && targetId && pendingId === targetId;
      const matchesActive = !pendingId && !targetId && targetVideo === activeVideo;

      if (!matchesId && !matchesActive) {
        return;
      }

      this.pendingModeratedPlayback = null;

      if (typeof this.playVideoWithFallback !== "function") {
        return;
      }

      const playbackOptions = {
        url: pending.url || "",
        magnet: pending.magnet || "",
      };

      if (pending.triggerProvided) {
        playbackOptions.trigger = Object.prototype.hasOwnProperty.call(pending, "trigger")
          ? pending.trigger
          : this.lastModalTrigger || null;
      }

      const playbackPromise = this.playVideoWithFallback(playbackOptions);
      if (playbackPromise && typeof playbackPromise.catch === "function") {
        playbackPromise.catch((error) => {
          devLogger.error(
            "[Application] Failed to resume moderated playback:",
            error,
          );
        });
      }
    },

    buildShareUrlFromNevent(nevent) {
      if (!nevent) {
        return "";
      }
      const base = this.getShareUrlBase();
      if (!base) {
        return "";
      }
      return `${base}?v=${encodeURIComponent(nevent)}`;
    },

    buildShareUrlFromEventId(eventId) {
      if (!eventId) {
        return "";
      }

      try {
        const nevent = window.NostrTools.nip19.neventEncode({ id: eventId });
        return this.buildShareUrlFromNevent(nevent);
      } catch (err) {
        devLogger.error("Error generating nevent for share URL:", err);
        return "";
      }
    },

    dedupeVideosByRoot(videos) {
      if (!Array.isArray(videos) || videos.length === 0) {
        return [];
      }
      return dedupeToNewestByRoot(videos);
    },

    autoplayModalVideo() {
      if (this.currentVideo?.moderation?.blockAutoplay) {
        this.log(
          "[moderation] Skipping autoplay due to trusted reports or trusted mutes.",
        );
        return;
      }
      if (!this.modalVideo) return;
      this.modalVideo.play().catch((err) => {
        this.log("Autoplay failed:", err);
        if (!this.modalVideo.muted) {
          this.log("Falling back to muted autoplay.");
          this.modalVideo.muted = true;
          this.modalVideo.play().catch((err2) => {
            this.log("Muted autoplay also failed:", err2);
          });
        }
      });
    },

    startTorrentStatusMirrors(torrentInstance) {
      if (!torrentInstance) {
        return;
      }

      this.cacheTorrentStatusNodes();

      const updateMirrorStatus = () => {
        if (!document.body.contains(this.modalVideo)) {
          this.stopTorrentStatusInterval();
          this.removeTorrentStatusVisibilityHandlers();
          return;
        }
        this.updateTorrentStatus(torrentInstance);
        const { status, progress, peers, speed, downloaded } = this.torrentStatusNodes || {};
        if (this.videoModal) {
          if (status) {
            this.videoModal.updateStatus(status.textContent);
          }
          if (progress) {
            const doc = progress.ownerDocument;
            const view = doc?.defaultView;
            let widthValue = "";
            if (view && typeof view.getComputedStyle === "function") {
              const computed = view.getComputedStyle(progress);
              widthValue =
                computed?.getPropertyValue("--progress-width")?.trim() ||
                computed?.getPropertyValue("width")?.trim() ||
                "";
            }
            this.videoModal.updateProgress(widthValue);
          }
          if (peers) {
            this.videoModal.updatePeers(peers.textContent);
          }
          if (speed) {
            this.videoModal.updateSpeed(speed.textContent);
          }
          if (downloaded) {
            this.videoModal.updateDownloaded(downloaded.textContent);
          }
        }
      };

      this.stopTorrentStatusInterval();
      this.startTorrentStatusInterval(updateMirrorStatus);

      this.addTorrentStatusVisibilityHandlers({
        onPause: () => this.stopTorrentStatusInterval(),
        onResume: () => this.startTorrentStatusInterval(updateMirrorStatus),
        onClose: () => this.stopTorrentStatusInterval(),
      });
    },

    startTorrentStatusInterval(callback) {
      if (this.torrentStatusIntervalId) {
        return;
      }
      if (document.visibilityState === "hidden") {
        return;
      }
      const intervalId = setInterval(callback, 3000);
      this.torrentStatusIntervalId = intervalId;
      this.activeIntervals.push(intervalId);
    },

    stopTorrentStatusInterval() {
      if (!this.torrentStatusIntervalId) {
        return;
      }
      clearInterval(this.torrentStatusIntervalId);
      this.removeActiveInterval(this.torrentStatusIntervalId);
      this.torrentStatusIntervalId = null;
    },

    async probeUrlWithVideoElement(url, timeoutMs) {
      return this.urlHealthController.probeUrlWithVideoElement(url, timeoutMs);
    },

    async probeUrl(url, options = {}) {
      const trimmed = typeof url === "string" ? url.trim() : "";
      if (!trimmed) {
        return this.urlHealthController.probeUrl(url, options);
      }
      const existing = this.urlProbePromises.get(trimmed);
      if (existing) {
        return existing;
      }
      const probePromise = (async () => {
        try {
          return await this.urlHealthController.probeUrl(trimmed, options);
        } finally {
          this.urlProbePromises.delete(trimmed);
        }
      })();
      this.urlProbePromises.set(trimmed, probePromise);
      return probePromise;
    },

    async playHttp(videoEl, url) {
      const target = videoEl || this.modalVideo;
      if (!target) {
        return false;
      }

      const sanitizedUrl = typeof url === "string" ? url.trim() : "";
      if (!sanitizedUrl) {
        return false;
      }

      target.src = sanitizedUrl;

      try {
        await target.play();
        return true;
      } catch (err) {
        devLogger.warn("[playHttp] Direct URL playback failed:", err);
        return false;
      }
    },

    async playViaWebTorrent(
      magnet,
      { fallbackMagnet = "", urlList = [] } = {}
    ) {
      const sanitizedUrlList = Array.isArray(urlList)
        ? urlList
            .map((entry) =>
              typeof entry === "string" ? entry.trim() : ""
            )
            .filter((entry) => /^https?:\/\//i.test(entry))
        : [];

      const attemptStream = async (candidate) => {
        const trimmedCandidate =
          typeof candidate === "string" ? candidate.trim() : "";
        if (!trimmedCandidate) {
          throw new Error("No magnet URI provided for torrent playback.");
        }
        if (!isValidMagnetUri(trimmedCandidate)) {
          if (this.videoModal) {
            this.videoModal.updateStatus(UNSUPPORTED_BTITH_MESSAGE);
          }
          throw new Error(UNSUPPORTED_BTITH_MESSAGE);
        }
        if (!this.modalVideo) {
          throw new Error(
            "No modal video element available for torrent playback."
          );
        }

        const timestamp = Date.now().toString();
        const [magnetPrefix, magnetQuery = ""] = trimmedCandidate.split("?", 2);
        let normalizedMagnet = magnetPrefix;
        let queryParts = magnetQuery
          .split("&")
          .map((part) => part.trim())
          .filter((part) => part && !/^ts=\d+$/.test(part));

        if (queryParts.length) {
          normalizedMagnet = `${magnetPrefix}?${queryParts.join("&")}`;
        }

        const separator = normalizedMagnet.includes("?") ? "&" : "?";
        const cacheBustedMagnet = `${normalizedMagnet}${separator}ts=${timestamp}`;

        await torrentClient.cleanup();
        this.resetTorrentStats();

        if (this.videoModal) {
          this.videoModal.updateStatus("Streaming via WebTorrent");
          this.videoModal.setTorrentStatsVisibility?.(true);
        }

        const torrentInstance = await torrentClient.streamVideo(
          cacheBustedMagnet,
          this.modalVideo,
          { urlList: sanitizedUrlList }
        );

        if (torrentClient.isServiceWorkerUnavailable()) {
          const swError = torrentClient.getServiceWorkerInitError();
          const statusMessage = buildServiceWorkerFallbackStatus(swError);
          this.log(
            "[playViaWebTorrent] Service worker unavailable; streaming directly via WebTorrent.",
            swError
          );
          if (swError) {
            userLogger.warn(
              "[playViaWebTorrent] Service worker unavailable; direct streaming engaged.",
              swError
            );
          }
          if (this.videoModal) {
            this.videoModal.updateStatus(statusMessage);
          }
        }
        if (torrentInstance && torrentInstance.ready) {
          // Some browsers delay `playing` events for MediaSource-backed torrents.
          // Clearing the poster here prevents the historic "GIF stuck over the
          // video" regression when WebTorrent is already feeding data.
          this.forceRemoveModalPoster("webtorrent-ready");
        }
        this.startTorrentStatusMirrors(torrentInstance);
        return torrentInstance;
      };

      const primaryTrimmed =
        typeof magnet === "string" ? magnet.trim() : "";
      const fallbackTrimmed =
        typeof fallbackMagnet === "string" ? fallbackMagnet.trim() : "";
      const hasFallback =
        !!fallbackTrimmed && fallbackTrimmed !== primaryTrimmed;

      try {
        return await attemptStream(primaryTrimmed);
      } catch (primaryError) {
        if (!hasFallback) {
          throw primaryError;
        }
        this.log(
          `[playViaWebTorrent] Normalized magnet failed: ${primaryError.message}`
        );
        this.log(
          "[playViaWebTorrent] Primary magnet failed, retrying original string."
        );
        try {
          return await attemptStream(fallbackTrimmed);
        } catch (fallbackError) {
          throw fallbackError;
        }
      }
    },

    /**
     * Unified playback helper that prefers HTTP URL sources
     * and falls back to WebTorrent when needed.
     */
    async playVideoWithFallback(options = {}) {
      const playbackStrategyService = this.playbackStrategyService;
      if (!playbackStrategyService) {
        this.showError("Playback strategy service is not available.");
        return { source: null, error: new Error("Service missing") };
      }

      return playbackStrategyService.play(options, {
        getModalVideo: () => this.modalVideo,
        setModalVideo: (videoElement) => {
          this.modalVideo = videoElement;
        },
        getVideoModalElement: () =>
          this.videoModal && typeof this.videoModal.getVideoElement === "function"
            ? this.videoModal.getVideoElement()
            : null,
        setVideoModalElement: (videoElement) => {
          if (
            this.videoModal &&
            typeof this.videoModal.setVideoElement === "function"
          ) {
            this.videoModal.setVideoElement(videoElement);
          }
        },
        cleanupVideoModalPoster: () => {
          if (
            this.videoModal &&
            typeof this.videoModal.clearPosterCleanup === "function"
          ) {
            this.videoModal.clearPosterCleanup();
          }
        },
        ensureVideoModalReady: (opts) => this.ensureVideoModalReady(opts),
        teardownVideoElement: (videoEl, opts) =>
          this.teardownVideoElement(videoEl, opts),
        applyModalLoadingPoster: () => this.applyModalLoadingPoster(),

        waitForCleanup: () => this.waitForCleanup(),
        cancelPendingViewLogging: () => this.cancelPendingViewLogging(),
        clearActiveIntervals: () => this.clearActiveIntervals(),
        showModalWithPoster: () => this.showModalWithPoster(),
        probeUrl: (candidateUrl) => this.probeUrl(candidateUrl),
        playViaWebTorrent: (magnetUri, opts) =>
          this.playViaWebTorrent(magnetUri, opts),
        autoplay: () => this.autoplayModalVideo(),

        unsupportedBtihMessage: UNSUPPORTED_BTITH_MESSAGE,

        showError: (msg) => this.showError(msg),
        setLastModalTrigger: (trigger) => this.setLastModalTrigger(trigger),

        resetTorrentStats: () => this.resetTorrentStats(),
        setPlaySource: (source) => {
          this.playSource = source;
        },
        setActivePlaybackSession: (session) => {
          this.activePlaybackSession = session;
        },
        setActivePlaybackResultPromise: (promise) => {
          this.activePlaybackResultPromise = promise;
        },

        updateCurrentVideoMetadata: (metadata) => {
          if (this.currentVideo) {
            this.currentVideo.magnet = metadata.magnet;
            this.currentVideo.normalizedMagnet = metadata.normalizedMagnet;
            this.currentVideo.normalizedMagnetFallback =
              metadata.normalizedMagnetFallback;
            if (metadata.legacyInfoHash && !this.currentVideo.legacyInfoHash) {
              this.currentVideo.legacyInfoHash = metadata.legacyInfoHash;
            }
            this.currentVideo.torrentSupported = metadata.torrentSupported;
          }
          this.currentMagnetUri = metadata.magnet || null;
        },

        updateVideoModalStatus: (message) => {
          if (this.videoModal) {
            this.videoModal.updateStatus(message);
          }
        },
        preparePlaybackLogging: (videoElement) =>
          this.preparePlaybackLogging(videoElement),
        forceRemoveModalPoster: (reason) => this.forceRemoveModalPoster(reason),
        setTorrentStatsVisibility: (visible) => {
          if (this.videoModal) {
            this.videoModal.setTorrentStatsVisibility?.(visible);
          }
        },
      });
    },

    async playVideoByEventId(eventId, playbackHint = {}) {
      if (!eventId) {
        this.showError("No video identifier provided.");
        return;
      }

      const hint = playbackHint && typeof playbackHint === "object"
        ? playbackHint
        : {};
      const fallbackUrl =
        typeof hint.url === "string" ? hint.url.trim() : "";
      const fallbackTitle =
        typeof hint.title === "string" ? hint.title : "";
      const fallbackDescription =
        typeof hint.description === "string" ? hint.description : "";
      const fallbackMagnetRaw =
        typeof hint.magnet === "string" ? hint.magnet.trim() : "";
      let fallbackMagnetCandidate = "";
      if (fallbackMagnetRaw) {
        const decoded = safeDecodeMagnet(fallbackMagnetRaw);
        fallbackMagnetCandidate = decoded || fallbackMagnetRaw;
      }

      const hasTrigger = Object.prototype.hasOwnProperty.call(hint, "trigger");
      if (hasTrigger) {
        this.setLastModalTrigger(hint.trigger);
      } else {
        this.setLastModalTrigger(null);
      }

      this.currentVideoPointer = null;
      this.currentVideoPointerKey = null;
      this.pendingModeratedPlayback = null;

      if (this.blacklistedEventIds.has(eventId)) {
        this.showError("This content has been removed or is not allowed.");
        return;
      }

      let video = this.videosMap.get(eventId);
      if (!video) {
        video = await this.getOldEventById(eventId);
      }
      if (!video) {
        if (fallbackUrl || fallbackMagnetCandidate) {
          return this.playVideoWithoutEvent({
            url: fallbackUrl,
            magnet: fallbackMagnetCandidate,
            title: fallbackTitle || "Untitled",
            description: fallbackDescription || "",
            trigger: hasTrigger ? hint.trigger : null,
          });
        }
        this.showError("Video not found or has been removed.");
        return;
      }

      try {
        await accessControl.waitForReady();
      } catch (error) {
        devLogger.warn(
          "Failed to ensure admin lists were loaded before playback:",
          error
        );
      }
      const authorNpub = this.safeEncodeNpub(video.pubkey) || video.pubkey;
      if (!accessControl.canAccess(authorNpub)) {
        if (accessControl.isBlacklisted(authorNpub)) {
          this.showError("This content has been removed or is not allowed.");
        } else if (accessControl.whitelistMode()) {
          this.showError("This content is not from a whitelisted author.");
        } else {
          this.showError("This content has been removed or is not allowed.");
        }
        return;
      }

      this.decorateVideoModeration(video);

      let trimmedUrl = typeof video.url === "string" ? video.url.trim() : "";
      if (!trimmedUrl && fallbackUrl) {
        trimmedUrl = fallbackUrl;
      }
      const rawMagnet =
        typeof video.magnet === "string" ? video.magnet.trim() : "";
      let legacyInfoHash =
        typeof video.infoHash === "string" ? video.infoHash.trim().toLowerCase() : "";
      const fallbackMagnetForCandidate = fallbackMagnetCandidate || "";
      if (!legacyInfoHash && fallbackMagnetForCandidate) {
        const extracted = extractBtihFromMagnet(fallbackMagnetForCandidate);
        if (extracted) {
          legacyInfoHash = extracted;
        }
      }

      let magnetCandidate = rawMagnet || legacyInfoHash || "";
      let decodedMagnetCandidate = safeDecodeMagnet(magnetCandidate);
      let usableMagnetCandidate = decodedMagnetCandidate || magnetCandidate;
      let magnetSupported = isValidMagnetUri(usableMagnetCandidate);

      if (!magnetSupported && fallbackMagnetForCandidate) {
        magnetCandidate = fallbackMagnetForCandidate;
        decodedMagnetCandidate = safeDecodeMagnet(magnetCandidate);
        usableMagnetCandidate = decodedMagnetCandidate || magnetCandidate;
        magnetSupported = isValidMagnetUri(usableMagnetCandidate);
      }

      const sanitizedMagnet = magnetSupported ? usableMagnetCandidate : "";

      const knownPostedAt = this.getKnownVideoPostedAt(video);
      const normalizedEditedAt = Number.isFinite(video.created_at)
        ? Math.floor(video.created_at)
        : null;

      const normalizedCreatorPubkey =
        this.normalizeHexPubkey(video.pubkey) || video.pubkey;
      const cachedCreatorProfileEntry =
        normalizedCreatorPubkey && typeof this.getProfileCacheEntry === "function"
          ? this.getProfileCacheEntry(normalizedCreatorPubkey)
          : null;
      const cachedCreatorProfile =
        cachedCreatorProfileEntry &&
        typeof cachedCreatorProfileEntry === "object"
          ? cachedCreatorProfileEntry.profile || null
          : null;
      const initialLightningAddress =
        typeof video.lightningAddress === "string"
          ? video.lightningAddress.trim()
          : "";

      this.currentVideo = {
        ...video,
        url: trimmedUrl,
        magnet: sanitizedMagnet,
        originalMagnet:
          magnetCandidate || fallbackMagnetForCandidate || legacyInfoHash || "",
        torrentSupported: magnetSupported,
        legacyInfoHash: video.legacyInfoHash || legacyInfoHash,
        lightningAddress: initialLightningAddress || null,
        lastEditedAt: normalizedEditedAt,
      };

      this.decorateVideoModeration(this.currentVideo);

      const modalTags = collectVideoTags(this.currentVideo);
      this.currentVideo.displayTags = modalTags;
      const creatorNpub = this.safeEncodeNpub(video.pubkey) || video.pubkey;
      const displayNpub = formatShortNpub(creatorNpub) || creatorNpub;
      const initialCreatorProfile = this.resolveModalCreatorProfile({
        video: this.currentVideo,
        pubkey: normalizedCreatorPubkey,
        cachedProfile: cachedCreatorProfile,
      });
      this.currentVideo.creatorName = initialCreatorProfile.name;
      this.currentVideo.creatorPicture = initialCreatorProfile.picture;
      this.currentVideo.creatorNpub = displayNpub;
      if (this.currentVideo.creator && typeof this.currentVideo.creator === "object") {
        this.currentVideo.creator = {
          ...this.currentVideo.creator,
          name: initialCreatorProfile.name,
          picture: initialCreatorProfile.picture,
          pubkey: normalizedCreatorPubkey,
        };
      } else {
        this.currentVideo.creator = {
          name: initialCreatorProfile.name,
          picture: initialCreatorProfile.picture,
          pubkey: normalizedCreatorPubkey,
        };
      }
      this.updateModalSimilarContent({ activeVideo: this.currentVideo });

      if (Number.isFinite(knownPostedAt)) {
        this.cacheVideoRootCreatedAt(this.currentVideo, knownPostedAt);
      } else if (this.currentVideo.rootCreatedAt) {
        delete this.currentVideo.rootCreatedAt;
      }

      const dTagValue = (this.extractDTagValue(video.tags) || "").trim();
      const pointerInfo = resolveVideoPointer({
        kind: video.kind,
        pubkey: video.pubkey,
        videoRootId: video.videoRootId,
        dTag: dTagValue,
        fallbackEventId: video.id || eventId,
        relay: hint.relay || video.relay,
      });

      this.currentVideoPointer = pointerInfo?.pointer || null;
      this.currentVideoPointerKey = pointerInfo?.key || null;

      if (this.currentVideo) {
        this.currentVideo.pointer = this.currentVideoPointer;
        this.currentVideo.pointerKey = this.currentVideoPointerKey;
      }

      const forYouState = this.getFeedTelemetryState("for-you");
      if (
        forYouState?.activePlayback?.feed === "for-you" &&
        forYouState.activePlayback.videoId === eventId
      ) {
        forYouState.activePlayback.pointerKey = this.currentVideoPointerKey || null;
      }

      this.subscribeModalViewCount(
        this.currentVideoPointer,
        this.currentVideoPointerKey
      );
      this.reactionController.subscribe(
        this.currentVideoPointer,
        this.currentVideoPointerKey
      );
      this.syncModalMoreMenuData();

      this.currentMagnetUri = sanitizedMagnet || null;

      // this.setCopyMagnetState(!!sanitizedMagnet); // Removed
      // this.setShareButtonState(true); // Moved to after showModalWithPoster

      const nevent = window.NostrTools.nip19.neventEncode({ id: eventId });
      let pushUrl =
        this.buildShareUrlFromNevent(nevent) ||
        `${this.getShareUrlBase() || window.location.pathname}?v=${encodeURIComponent(
          nevent
        )}`;

      try {
        const targetUrl = new URL(pushUrl, window.location.origin);
        if (targetUrl.origin !== window.location.origin) {
          pushUrl = `${window.location.pathname}${targetUrl.search}${targetUrl.hash}`;
        }
      } catch (err) {
        devLogger.warn("[Application] Failed to normalize pushState URL:", err);
      }

      window.history.pushState({}, "", pushUrl);

      this.zapController?.resetState();
      this.zapController?.setVisibility(Boolean(this.currentVideo.lightningAddress));

      const magnetInput =
        sanitizedMagnet ||
        decodedMagnetCandidate ||
        magnetCandidate ||
        fallbackMagnetForCandidate ||
        legacyInfoHash ||
        "";

      await this.showModalWithPoster(this.currentVideo);

      this.setShareButtonState(true);

      this.commentController?.load(this.currentVideo);

      const playbackOptions = {
        url: trimmedUrl,
        magnet: magnetInput,
      };
      if (hasTrigger) {
        playbackOptions.trigger = this.lastModalTrigger;
      }

      let playbackPromise = null;
      if (this.shouldDeferModeratedPlayback(this.currentVideo)) {
        const pendingVideoId =
          (this.currentVideo && typeof this.currentVideo.id === "string" && this.currentVideo.id)
            ? this.currentVideo.id
            : eventId || null;
        this.pendingModeratedPlayback = {
          ...playbackOptions,
          triggerProvided: hasTrigger,
          videoId: pendingVideoId,
        };
      } else {
        playbackPromise = this.playVideoWithFallback(playbackOptions);
      }

      if (this.videoModal) {
        const timestampPayload = this.buildModalTimestampPayload({
          postedAt: this.currentVideo?.rootCreatedAt ?? null,
          editedAt: normalizedEditedAt,
        });
        this.videoModal.updateMetadata({
          title: video.title || "Untitled",
          description: video.description || "No description available.",
          timestamps: timestampPayload,
          tags: modalTags,
          creator: {
            name: initialCreatorProfile.name,
            avatarUrl: initialCreatorProfile.picture,
            npub: displayNpub,
          },
        });
      }

      const profileRequestToken = Symbol("modal-profile-request");
      this.modalCreatorProfileRequestToken = profileRequestToken;
      this.fetchModalCreatorProfile({
        pubkey: normalizedCreatorPubkey,
        displayNpub,
        cachedProfile: cachedCreatorProfile,
        requestToken: profileRequestToken,
      }).catch((error) => {
        devLogger.error(
          "[Application] Failed to fetch creator profile for modal:",
          error,
        );
      });

      this.ensureModalPostedTimestamp(this.currentVideo);

      const playbackResult =
        playbackPromise && typeof playbackPromise.then === "function"
          ? await playbackPromise
          : playbackPromise;

      return playbackResult;
    },

    buildModalTimestampPayload({ postedAt = null, editedAt = null } = {}) {
      const normalizedPostedAt = Number.isFinite(postedAt)
        ? Math.floor(postedAt)
        : null;
      const normalizedEditedAt = Number.isFinite(editedAt)
        ? Math.floor(editedAt)
        : null;

      const payload = {
        posted: "",
        edited: "",
      };

      const effectivePostedAt =
        normalizedPostedAt !== null ? normalizedPostedAt : normalizedEditedAt;

      if (effectivePostedAt !== null) {
        payload.posted = `Posted ${this.formatTimeAgo(effectivePostedAt)}`;
      }

      const shouldShowEdited =
        normalizedEditedAt !== null &&
        (normalizedPostedAt === null || normalizedEditedAt - normalizedPostedAt >= 60);

      if (shouldShowEdited) {
        const abs = formatAbsoluteDateWithOrdinalUtil(normalizedEditedAt);
        const rel = this.formatTimeAgo(normalizedEditedAt);
        payload.edited = `Last edited: ${abs} (${rel})`;
      }

      return payload;
    },

    getKnownVideoPostedAt(video) {
      if (!video || typeof video !== "object") {
        return null;
      }

      const directValue = Number.isFinite(video.rootCreatedAt)
        ? Math.floor(video.rootCreatedAt)
        : null;
      if (directValue !== null) {
        return directValue;
      }

      if (video.id && this.videosMap instanceof Map) {
        const stored = this.videosMap.get(video.id);
        const storedValue = Number.isFinite(stored?.rootCreatedAt)
          ? Math.floor(stored.rootCreatedAt)
          : null;
        if (storedValue !== null) {
          video.rootCreatedAt = storedValue;
          return storedValue;
        }
      }

      const nip71Created = Number.isFinite(video?.nip71Source?.created_at)
        ? Math.floor(video.nip71Source.created_at)
        : null;

      if (nip71Created !== null) {
        return nip71Created;
      }

      return null;
    },

    cacheVideoRootCreatedAt(video, timestamp) {
      if (!Number.isFinite(timestamp)) {
        return;
      }

      const normalized = Math.floor(timestamp);
      const rootId = getVideoRootIdentifier(video);

      if (video && typeof video === "object") {
        video.rootCreatedAt = normalized;
      }

      applyRootTimestampToVideosMap({
        videosMap: this.videosMap,
        video,
        rootId,
        timestamp: normalized,
      });

      syncActiveVideoRootTimestamp({
        activeVideo: this.currentVideo,
        rootId,
        timestamp: normalized,
        buildModalTimestampPayload: (payload) =>
          this.buildModalTimestampPayload(payload),
        videoModal: this.videoModal,
      });

      if (nostrClient && typeof nostrClient.applyRootCreatedAt === "function") {
        try {
          nostrClient.applyRootCreatedAt(video);
        } catch (error) {
          devLogger.warn(
            "[Application] Failed to sync cached root timestamp with nostrClient:",
            error
          );
        }
      }
    },

    async resolveVideoPostedAt(video) {
      if (!video || typeof video !== "object") {
        return null;
      }

      // Prioritize NIP-71 published_at metadata if available
      const rawNip71PublishedAt =
        video?.nip71?.publishedAt ||
        video?.nip71?.published_at ||
        video?.nip71?.["published-at"];
      const parsedNip71PublishedAt = Number(rawNip71PublishedAt);
      const nip71PublishedAt = Number.isFinite(parsedNip71PublishedAt)
        ? Math.floor(parsedNip71PublishedAt)
        : null;

      if (nip71PublishedAt !== null) {
        this.cacheVideoRootCreatedAt(video, nip71PublishedAt);
        return nip71PublishedAt;
      }

      const cached = this.getKnownVideoPostedAt(video);
      if (cached !== null) {
        return cached;
      }

      if (!nostrClient || typeof nostrClient.hydrateVideoHistory !== "function") {
        const fallback = Number.isFinite(video.created_at)
          ? Math.floor(video.created_at)
          : null;
        if (fallback !== null) {
          this.cacheVideoRootCreatedAt(video, fallback);
        }
        return fallback;
      }

      try {
        const history = await nostrClient.hydrateVideoHistory(video);
        if (Array.isArray(history) && history.length) {
          let earliest = null;
          for (const entry of history) {
            if (!entry || entry.deleted) {
              continue;
            }
            const created = Number.isFinite(entry.created_at)
              ? Math.floor(entry.created_at)
              : null;
            if (created === null) {
              continue;
            }
            if (earliest === null || created < earliest) {
              earliest = created;
            }
          }

          if (earliest === null) {
            const lastEntry = history[history.length - 1];
            if (Number.isFinite(lastEntry?.created_at)) {
              earliest = Math.floor(lastEntry.created_at);
            }
          }

          if (earliest !== null) {
            this.cacheVideoRootCreatedAt(video, earliest);
            return earliest;
          }
        }
      } catch (error) {
        devLogger.warn(
          "[Application] Failed to hydrate video history for timestamps:",
          error
        );
      }

      const fallback = Number.isFinite(video.created_at)
        ? Math.floor(video.created_at)
        : null;
      if (fallback !== null) {
        this.cacheVideoRootCreatedAt(video, fallback);
      }
      return fallback;
    },

    async ensureModalPostedTimestamp(video) {
      if (!video || !this.videoModal) {
        return;
      }

      const postedAt = await this.resolveVideoPostedAt(video);
      if (!this.videoModal || this.currentVideo !== video) {
        return;
      }

      const editedAt = Number.isFinite(video.lastEditedAt)
        ? Math.floor(video.lastEditedAt)
        : Number.isFinite(video.created_at)
          ? Math.floor(video.created_at)
          : null;

      const payload = this.buildModalTimestampPayload({
        postedAt,
        editedAt,
      });

      const modalTags = collectVideoTags(video);
      video.displayTags = modalTags;
      this.updateModalSimilarContent({ activeVideo: video });

      this.videoModal.updateMetadata({ timestamps: payload, tags: modalTags });
    },

    async playVideoWithoutEvent(options = {}) {
      const {
        url = "",
        magnet = "",
        title = "Untitled",
        description = "",
        trigger,
        tags: rawTags,
      } = options || {};
      const hasTrigger = Object.prototype.hasOwnProperty.call(
        options || {},
        "trigger"
      );
      if (hasTrigger) {
        this.setLastModalTrigger(trigger);
      } else {
        this.setLastModalTrigger(null);
      }
      this.currentVideoPointer = null;
      this.currentVideoPointerKey = null;
      this.subscribeModalViewCount(null, null);
      this.reactionController.subscribe(null, null);
      this.pendingModeratedPlayback = null;
      const sanitizedUrl = typeof url === "string" ? url.trim() : "";
      const trimmedMagnet = typeof magnet === "string" ? magnet.trim() : "";
      const decodedMagnet = safeDecodeMagnet(trimmedMagnet);
      const usableMagnet = decodedMagnet || trimmedMagnet;
      const magnetSupported = isValidMagnetUri(usableMagnet);
      const sanitizedMagnet = magnetSupported ? usableMagnet : "";

      const modalTags = collectVideoTags({
        nip71: { hashtags: rawTags },
      });

      this.zapController?.setVisibility(false);
      this.zapController?.resetState();

      if (!sanitizedUrl && !sanitizedMagnet) {
        const message = trimmedMagnet && !magnetSupported
          ? UNSUPPORTED_BTITH_MESSAGE
          : "This video has no playable source.";
        this.showError(message);
        return;
      }

      this.currentVideo = {
        id: null,
        title,
        description,
        url: sanitizedUrl,
        magnet: sanitizedMagnet,
        originalMagnet: trimmedMagnet,
        torrentSupported: magnetSupported,
        lightningAddress: null,
        pointer: null,
        pointerKey: null,
        displayTags: modalTags,
      };

      this.decorateVideoModeration(this.currentVideo);
      this.updateModalSimilarContent({ activeVideo: this.currentVideo });

      this.syncModalMoreMenuData();

      this.currentMagnetUri = sanitizedMagnet || null;

      // this.setCopyMagnetState(!!sanitizedMagnet);
      // this.setShareButtonState(false);

      if (this.videoModal) {
        this.videoModal.updateMetadata({
          title: title || "Untitled",
          description: description || "No description available.",
          timestamp: "",
          tags: modalTags,
          creator: {
            name: "Unknown",
            avatarUrl: "assets/svg/default-profile.svg",
            npub: "",
          },
        });
      }

      await this.showModalWithPoster(this.currentVideo, hasTrigger ? { trigger } : {});

      this.setShareButtonState(false);

      this.commentController?.load(null);

      const shareUrl = this.buildShareUrlFromEventId(this.currentVideo.id);
      const urlObj = new URL(window.location.href);
      urlObj.searchParams.delete("v");
      const cleaned = `${urlObj.pathname}${urlObj.search}${urlObj.hash}`;
      window.history.replaceState({}, "", cleaned);

      return this.playVideoWithFallback({
        url: sanitizedUrl,
        magnet: usableMagnet,
        trigger: hasTrigger ? this.lastModalTrigger : null,
      });
    },
  };
}
