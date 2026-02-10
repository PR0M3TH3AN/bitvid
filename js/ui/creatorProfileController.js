import { normalizeHexPubkey } from "../utils/nostrHelpers.js";

export default class CreatorProfileController {
  constructor({
    services: { nostrClient },
    ui: { zapController },
    callbacks: {
      getProfileCacheEntry,
      setProfileCacheEntry,
      getCurrentVideo,
      getVideoModal,
    },
    helpers: {
      fetchProfileMetadata,
      ensureProfileMetadataSubscription,
      safeEncodeNpub,
      formatShortNpub,
      sanitizeProfileMediaUrl,
    },
    logger,
  }) {
    this.nostrClient = nostrClient;
    this.zapController = zapController;
    this.getProfileCacheEntry = getProfileCacheEntry;
    this.setProfileCacheEntry = setProfileCacheEntry;
    this.getCurrentVideo = getCurrentVideo;
    this.getVideoModal = getVideoModal;
    this.fetchProfileMetadata = fetchProfileMetadata;
    this.ensureProfileMetadataSubscription = ensureProfileMetadataSubscription;
    this.safeEncodeNpub = safeEncodeNpub;
    this.formatShortNpub = formatShortNpub;
    this.sanitizeProfileMediaUrl = sanitizeProfileMediaUrl;
    this.logger = logger;

    this.modalCreatorProfileRequestToken = null;
  }

  get videoModal() {
    return this.getVideoModal ? this.getVideoModal() : null;
  }

  get currentVideo() {
    return this.getCurrentVideo ? this.getCurrentVideo() : null;
  }

  log(message, ...args) {
    if (this.logger && typeof this.logger.log === "function") {
      this.logger.log("[CreatorProfileController]", message, ...args);
    }
  }

  warn(message, ...args) {
    if (this.logger && typeof this.logger.warn === "function") {
      this.logger.warn("[CreatorProfileController]", message, ...args);
    }
  }

  error(message, ...args) {
    if (this.logger && typeof this.logger.error === "function") {
      this.logger.error("[CreatorProfileController]", message, ...args);
    }
  }

  normalizeHexPubkey(pubkey) {
    return normalizeHexPubkey(pubkey);
  }

  selectPreferredCreatorName(candidates = []) {
    for (const candidate of candidates) {
      if (typeof candidate !== "string") {
        continue;
      }
      const trimmed = candidate.trim();
      if (!trimmed) {
        continue;
      }
      if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
        continue;
      }
      return trimmed;
    }
    return "";
  }

  selectPreferredCreatorPicture(candidates = []) {
    for (const candidate of candidates) {
      if (typeof candidate !== "string") {
        continue;
      }
      const sanitized = this.sanitizeProfileMediaUrl(candidate);
      if (sanitized) {
        return sanitized;
      }
    }
    return "";
  }

  resolveCreatorProfileFromSources({
    video,
    pubkey,
    cachedProfile = null,
    fetchedProfile = null,
    fallbackAvatar,
  } = {}) {
    const normalizedPubkey =
      typeof pubkey === "string" && pubkey.trim() ? pubkey.trim() : "";
    const fallbackAvatarCandidate =
      typeof fallbackAvatar === "string" && fallbackAvatar.trim()
        ? fallbackAvatar.trim()
        : normalizedPubkey
        ? `https://robohash.org/${normalizedPubkey}`
        : "assets/svg/default-profile.svg";
    const defaultAvatar =
      this.sanitizeProfileMediaUrl(fallbackAvatarCandidate) ||
      fallbackAvatarCandidate ||
      "assets/svg/default-profile.svg";

    const nameCandidates = [];
    const pictureCandidates = [];

    const collectFromSource = (source) => {
      if (!source || typeof source !== "object") {
        return;
      }
      const names = [
        source.display_name,
        source.displayName,
        source.name,
        source.username,
      ];
      names.forEach((value) => {
        if (typeof value === "string") {
          nameCandidates.push(value);
        }
      });
      const pictures = [source.picture, source.image, source.photo];
      pictures.forEach((value) => {
        if (typeof value === "string") {
          pictureCandidates.push(value);
        }
      });
    };

    collectFromSource(fetchedProfile);
    collectFromSource(cachedProfile);

    if (video && typeof video === "object") {
      collectFromSource(video.creator);
      if (typeof video.creatorName === "string") {
        nameCandidates.push(video.creatorName);
      }
      if (typeof video.creatorPicture === "string") {
        pictureCandidates.push(video.creatorPicture);
      }
      collectFromSource(video.author);
      if (typeof video.authorName === "string") {
        nameCandidates.push(video.authorName);
      }
      if (typeof video.authorPicture === "string") {
        pictureCandidates.push(video.authorPicture);
      }
      collectFromSource(video.profile);
      const extraNames = [
        video.shortNpub,
        video.creatorNpub,
        video.npub,
        video.authorNpub,
      ];
      extraNames.forEach((value) => {
        if (typeof value === "string") {
          nameCandidates.push(value);
        }
      });
    }

    const resolvedName =
      this.selectPreferredCreatorName(nameCandidates) || "Unknown";
    const resolvedPicture =
      this.selectPreferredCreatorPicture(pictureCandidates) || defaultAvatar;

    return { name: resolvedName, picture: resolvedPicture };
  }

  resolveModalCreatorProfile({
    video,
    pubkey,
    cachedProfile = null,
    fetchedProfile = null,
  } = {}) {
    return this.resolveCreatorProfileFromSources({
      video,
      pubkey,
      cachedProfile,
      fetchedProfile,
    });
  }

  decorateVideoCreatorIdentity(video) {
    if (!video || typeof video !== "object") {
      return video;
    }

    const normalizedPubkey =
      this.normalizeHexPubkey(video.pubkey) ||
      (typeof video.pubkey === "string" ? video.pubkey.trim() : "");
    if (!normalizedPubkey) {
      return video;
    }

    let cachedProfile = null;
    if (typeof this.getProfileCacheEntry === "function") {
      const cacheEntry = this.getProfileCacheEntry(normalizedPubkey);
      if (cacheEntry && typeof cacheEntry === "object") {
        cachedProfile = cacheEntry.profile || null;
      }
    }

    const resolvedProfile = this.resolveCreatorProfileFromSources({
      video,
      pubkey: normalizedPubkey,
      cachedProfile,
    });

    if (!video.creator || typeof video.creator !== "object") {
      video.creator = {};
    }

    if (!video.creator.pubkey) {
      video.creator.pubkey = normalizedPubkey;
    }

    if (resolvedProfile.name) {
      video.creator.name = resolvedProfile.name;
      if (
        typeof video.creatorName !== "string" ||
        !video.creatorName.trim() ||
        video.creatorName === "Unknown"
      ) {
        video.creatorName = resolvedProfile.name;
      }
      if (
        typeof video.authorName !== "string" ||
        !video.authorName.trim() ||
        video.authorName === "Unknown"
      ) {
        video.authorName = resolvedProfile.name;
      }
    }

    if (resolvedProfile.picture) {
      video.creator.picture = resolvedProfile.picture;
      video.creatorPicture = resolvedProfile.picture;
      if (
        typeof video.authorPicture !== "string" ||
        !video.authorPicture.trim()
      ) {
        video.authorPicture = resolvedProfile.picture;
      }
    }

    const encodedNpub = this.safeEncodeNpub(normalizedPubkey);
    if (encodedNpub) {
      const shortNpub = this.formatShortNpub(encodedNpub) || encodedNpub;
      if (typeof video.npub !== "string" || !video.npub.trim()) {
        video.npub = encodedNpub;
      }
      if (typeof video.shortNpub !== "string" || !video.shortNpub.trim()) {
        video.shortNpub = shortNpub;
      }
      if (
        typeof video.creatorNpub !== "string" ||
        !video.creatorNpub.trim()
      ) {
        video.creatorNpub = shortNpub;
      }
    }

    return video;
  }

  async fetchModalCreatorProfile({
    pubkey,
    displayNpub = "",
    cachedProfile = null,
    requestToken = null,
  } = {}) {
    const normalized = this.normalizeHexPubkey(pubkey);
    if (!normalized) {
      return;
    }

    this.modalCreatorProfileRequestToken = requestToken;

    const relayList =
      Array.isArray(this.nostrClient?.relays) && this.nostrClient.relays.length
        ? this.nostrClient.relays
        : null;
    if (!relayList) {
      return;
    }

    const profileEntry = await this.fetchProfileMetadata(normalized, {
      nostr: this.nostrClient,
      relays: relayList,
      logger: this.logger,
    });

    if (this.modalCreatorProfileRequestToken !== requestToken) {
      return;
    }

    if (!profileEntry?.event) {
      if (this.modalCreatorProfileRequestToken === requestToken) {
        this.modalCreatorProfileRequestToken = null;
      }
      return;
    }

    this.ensureProfileMetadataSubscription({
      pubkey: normalized,
      nostr: this.nostrClient,
      relays: relayList,
      onProfile: ({ profile }) => {
        if (typeof this.setProfileCacheEntry === "function" && profile) {
          this.setProfileCacheEntry(normalized, profile);
        }
      },
    });

    let parsed = null;
    try {
      parsed = profileEntry.event.content
        ? JSON.parse(profileEntry.event.content)
        : null;
    } catch (error) {
      this.warn(
        `Failed to parse creator profile content for ${normalized}:`,
        error,
      );
      if (this.modalCreatorProfileRequestToken === requestToken) {
        this.modalCreatorProfileRequestToken = null;
      }
      return;
    }

    if (this.modalCreatorProfileRequestToken !== requestToken) {
      return;
    }

    const parsedLud16 =
      typeof parsed?.lud16 === "string" ? parsed.lud16.trim() : "";
    const parsedLud06 =
      typeof parsed?.lud06 === "string" ? parsed.lud06.trim() : "";
    const lightningAddressCandidate = (() => {
      const fields = [parsedLud16, parsedLud06];
      for (const field of fields) {
        if (typeof field !== "string") {
          continue;
        }
        const trimmed = field.trim();
        if (trimmed) {
          return trimmed;
        }
      }
      return "";
    })();

    const fetchedProfile = {
      display_name: parsed?.display_name,
      name: parsed?.name,
      username: parsed?.username,
      picture: parsed?.picture,
      image: parsed?.image,
      photo: parsed?.photo,
    };

    const resolvedProfile = this.resolveModalCreatorProfile({
      video: this.currentVideo,
      pubkey: normalized,
      cachedProfile,
      fetchedProfile,
    });

    if (this.modalCreatorProfileRequestToken !== requestToken) {
      return;
    }

    const activeVideoPubkey = this.normalizeHexPubkey(this.currentVideo?.pubkey);
    if (activeVideoPubkey && activeVideoPubkey !== normalized) {
      return;
    }

    const nextLightning = lightningAddressCandidate || "";
    const previousLightning =
      typeof this.currentVideo?.lightningAddress === "string"
        ? this.currentVideo.lightningAddress
        : "";

    if (this.currentVideo) {
      this.currentVideo.lightningAddress = nextLightning ? nextLightning : null;
      this.currentVideo.creatorName = resolvedProfile.name;
      this.currentVideo.creatorPicture = resolvedProfile.picture;
      this.currentVideo.creatorNpub = displayNpub;
      if (this.currentVideo.creator && typeof this.currentVideo.creator === "object") {
        this.currentVideo.creator = {
          ...this.currentVideo.creator,
          name: resolvedProfile.name,
          picture: resolvedProfile.picture,
          pubkey: normalized,
          lightningAddress: nextLightning ? nextLightning : null,
        };
      } else {
        this.currentVideo.creator = {
          name: resolvedProfile.name,
          picture: resolvedProfile.picture,
          pubkey: normalized,
          lightningAddress: nextLightning ? nextLightning : null,
        };
      }
    }

    if (this.videoModal) {
      this.videoModal.updateMetadata({
        creator: {
          name: resolvedProfile.name,
          avatarUrl: resolvedProfile.picture,
          npub: displayNpub,
        },
      });
    }

    this.zapController?.setVisibility(Boolean(this.currentVideo?.lightningAddress));

    const sanitizedFetchedPicture = this.sanitizeProfileMediaUrl(
      parsed?.picture || parsed?.image || parsed?.photo || "",
    );
    const fetchedNameCandidate = this.selectPreferredCreatorName([
      parsed?.display_name,
      parsed?.name,
      parsed?.username,
    ]);

    const cachedLightning =
      typeof cachedProfile?.lightningAddress === "string"
        ? cachedProfile.lightningAddress.trim()
        : "";
    const shouldUpdateCache =
      Boolean(fetchedNameCandidate) ||
      Boolean(sanitizedFetchedPicture) ||
      cachedLightning !== nextLightning ||
      previousLightning !== nextLightning;

    if (shouldUpdateCache) {
      try {
        const profileForCache = {
          name: fetchedNameCandidate || resolvedProfile.name,
          picture: sanitizedFetchedPicture || resolvedProfile.picture,
        };

        if (parsedLud16) {
          profileForCache.lud16 = parsedLud16;
        }

        if (parsedLud06) {
          profileForCache.lud06 = parsedLud06;
        }

        if (nextLightning) {
          profileForCache.lightningAddress = nextLightning;
        }

        this.setProfileCacheEntry(
          normalized,
          profileForCache,
          { persist: false, reason: "modal-profile-fetch" },
        );
      } catch (error) {
        this.warn(
          `Failed to update profile cache for ${normalized}:`,
          error,
        );
      }
    }

    if (this.modalCreatorProfileRequestToken === requestToken) {
      this.modalCreatorProfileRequestToken = null;
    }
  }
}
