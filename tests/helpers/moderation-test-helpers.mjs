import "../test-helpers/setup-localstorage.mjs";
import { ModerationService } from "../../js/services/moderationService.js";
import ModerationDecorator from "../../js/services/moderationDecorator.js";
import ModerationActionController from "../../js/services/moderationActionController.js";
import {
  getDefaultModerationSettings,
  setModerationOverride,
  clearModerationOverride,
} from "../../js/state/cache.js";
import { userBlocks } from "../../js/userBlocks.js";
import { HEX64_REGEX } from "../../js/utils/hex.js";

const DEFAULT_CONTACT_OWNER = "f".repeat(64);
const DEFAULT_REPORT_TARGET = "e".repeat(64);

export function withMockedNostrTools(t) {
  const hadWindow = typeof globalThis.window !== "undefined";
  const previousWindow = hadWindow ? globalThis.window : undefined;
  if (!hadWindow) {
    globalThis.window = {};
  }

  const previousGlobalTools = globalThis.NostrTools;
  const previousWindowTools = globalThis.window?.NostrTools;

  const nip19 = {
    npubEncode(hex) {
      if (typeof hex !== "string" || !hex) {
        throw new Error("invalid hex");
      }
      return `npub${hex}`;
    },
    decode(value) {
      if (typeof value !== "string" || !value.startsWith("npub")) {
        throw new Error("invalid npub");
      }
      return { type: "npub", data: value.slice(4) };
    },
  };

  globalThis.NostrTools = { nip19 };
  if (globalThis.window) {
    globalThis.window.NostrTools = globalThis.NostrTools;
  }

  t.after(() => {
    if (typeof previousGlobalTools === "undefined") {
      delete globalThis.NostrTools;
    } else {
      globalThis.NostrTools = previousGlobalTools;
    }

    if (globalThis.window) {
      if (typeof previousWindowTools === "undefined") {
        delete globalThis.window.NostrTools;
      } else {
        globalThis.window.NostrTools = previousWindowTools;
      }
    }

    if (!hadWindow) {
      delete globalThis.window;
    } else {
      globalThis.window = previousWindow;
    }
  });
}

export function createModerationServiceHarness(t, { userBlocks, accessControl } = {}) {
  const service = new ModerationService({
    logger: () => {},
    userBlocks:
      userBlocks || {
        async ensureLoaded() {},
        isBlocked() {
          return false;
        },
      },
    accessControl: accessControl || null,
  });

  const tracked = new Map();

  function capture(eventName) {
    if (!tracked.has(eventName)) {
      tracked.set(eventName, []);
    }
    const records = tracked.get(eventName);
    const unsubscribe = service.on(eventName, (detail) => {
      records.push(detail);
    });
    if (typeof unsubscribe === "function") {
      t.after(() => {
        try {
          unsubscribe();
        } catch {
          // noop for tests
        }
      });
    }
    return records;
  }

  return { service, capture, trackedEvents: tracked };
}

export function createReportEvent({
  id,
  reporter,
  eventId,
  targetPubkey = DEFAULT_REPORT_TARGET,
  relayHint = "",
  createdAt = Math.floor(Date.now() / 1000),
  type = "nudity",
} = {}) {
  const reportId =
    typeof id === "string" && id.length
      ? id
      : `${Math.random().toString(16).slice(2)}${"0".repeat(64)}`.slice(0, 64);
  const reporterPubkey = typeof reporter === "string" && reporter ? reporter : "";
  const targetEventId = typeof eventId === "string" && eventId ? eventId : "";
  const targetAuthor =
    typeof targetPubkey === "string" && targetPubkey
      ? targetPubkey
      : DEFAULT_REPORT_TARGET;
  const normalizedType = typeof type === "string" && type ? type : "nudity";
  const normalizedRelayHint =
    typeof relayHint === "string" && relayHint ? relayHint : "";

  const eventTag = ["e", targetEventId];
  if (normalizedRelayHint) {
    eventTag.push(normalizedRelayHint);
  }
  eventTag.push(normalizedType);

  return {
    kind: 1984,
    id: reportId,
    pubkey: reporterPubkey,
    created_at: Number.isFinite(createdAt) ? Math.floor(createdAt) : Math.floor(Date.now() / 1000),
    tags: [
      eventTag,
      ["p", targetAuthor, normalizedType],
      ["t", normalizedType],
    ],
    content: "fixture report",
  };
}

export function createContactEvent({
  owner = DEFAULT_CONTACT_OWNER,
  contacts = [],
  createdAt = Math.floor(Date.now() / 1000),
  id,
} = {}) {
  const eventId =
    typeof id === "string" && id.length
      ? id
      : `${Math.random().toString(16).slice(2)}${"1".repeat(64)}`.slice(0, 64);
  const ownerHex = typeof owner === "string" && owner ? owner : DEFAULT_CONTACT_OWNER;
  const tags = contacts
    .filter((value) => typeof value === "string" && value)
    .map((value) => ["p", value]);

  return {
    kind: 3,
    id: eventId,
    pubkey: ownerHex,
    created_at: Number.isFinite(createdAt) ? Math.floor(createdAt) : Math.floor(Date.now() / 1000),
    tags,
    content: "",
  };
}

export function applyTrustedContacts(service, contacts = []) {
  const event = createContactEvent({ contacts });
  service.applyContactEvent(event);
  return event;
}

class MockApplication {
  constructor() {
    this.playbackService = {
      _currentVideo: null,
      get currentVideo() {
        return this._currentVideo;
      },
      set currentVideo(value) {
        this._currentVideo = value;
      },
    };

    this.authService = {
      _pubkey: null,
      _currentUserNpub: null,
      _activeProfilePubkey: null,
      _savedProfiles: [],
      get pubkey() {
        return this._pubkey;
      },
      set pubkey(value) {
        this._pubkey = value;
      },
      get currentUserNpub() {
        return this._currentUserNpub;
      },
      set currentUserNpub(value) {
        this._currentUserNpub = value;
      },
      get activeProfilePubkey() {
        return this._activeProfilePubkey;
      },
      setActiveProfilePubkey(value) {
        this._activeProfilePubkey = value;
      },
      get savedProfiles() {
        return this._savedProfiles;
      },
      setSavedProfiles(value) {
        this._savedProfiles = value;
      },
    };

    Object.defineProperty(this, "__profiles", {
      value: new Map(),
      writable: true,
      configurable: true,
    });

    this.defaultModerationSettings = getDefaultModerationSettings();
    this.moderationSettings = { ...this.defaultModerationSettings };
    this.videosMap = new Map();
    this.currentVideo = null;
    this.pendingModeratedPlayback = null;
  }

  get pubkey() {
    return this.authService.pubkey;
  }

  set pubkey(value) {
    this.authService.pubkey = value;
  }

  isUserLoggedIn() {
    return !!this.pubkey;
  }

  getProfileCacheEntry(pubkey) {
    if (!pubkey || typeof pubkey !== "string") {
      return null;
    }
    return this.__profiles.get(pubkey) || null;
  }

  safeDecodeNpub(npub) {
    if (typeof npub !== "string") {
      return null;
    }
    const trimmed = npub.trim();
    if (!trimmed) {
      return null;
    }
    try {
      const decoded = globalThis.NostrTools.nip19.decode(trimmed);
      if (decoded.type === "npub" && typeof decoded.data === "string") {
        return decoded.data;
      }
    } catch (err) {
      return null;
    }
    return null;
  }

  normalizeHexPubkey(pubkey) {
    if (typeof pubkey !== "string") {
      return null;
    }
    const trimmed = pubkey.trim();
    if (!trimmed) {
      return null;
    }
    if (HEX64_REGEX.test(trimmed)) {
      return trimmed.toLowerCase();
    }
    if (trimmed.startsWith("npub1")) {
      const decoded = this.safeDecodeNpub(trimmed);
      if (decoded && HEX64_REGEX.test(decoded)) {
        return decoded.toLowerCase();
      }
    }
    return null;
  }

  decorateVideoModeration(video, feedContext = {}) {
    if (!this.moderationDecorator) return video;
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
  }

  isAuthorBlocked(pubkey) {
    const normalized = this.normalizeHexPubkey(pubkey);
    if (normalized && this.userBlocks && this.userBlocks.isBlocked(normalized)) {
      return true;
    }
    return false;
  }

  resumePendingModeratedPlayback(video) {
    if (this.pendingModeratedPlayback) {
      const { url, magnet } = this.pendingModeratedPlayback;
      this.pendingModeratedPlayback = null;
      if (typeof this.playVideoWithFallback === "function") {
        this.playVideoWithFallback({ url, magnet });
      }
    }
  }

  describeUserBlockActionError(error) {
    return error?.message || "Block action failed";
  }

  deriveModerationReportType(summary) {
    if (!this.moderationDecorator) return null;
    return this.moderationDecorator.deriveModerationReportType(summary);
  }

  deriveModerationTrustedCount(summary, reportType) {
    if (!this.moderationDecorator) return 0;
    return this.moderationDecorator.deriveModerationTrustedCount(summary, reportType);
  }

  getReporterDisplayName(pubkey) {
    if (!this.moderationDecorator) return "";
    return this.moderationDecorator.getReporterDisplayName(pubkey);
  }

  handleModerationOverride(payload) {
    if (!this.moderationActionController) return false;
    return this.moderationActionController.handleOverride(payload);
  }

  handleModerationBlock(payload) {
    if (!this.moderationActionController) return false;
    return this.moderationActionController.handleBlock(payload);
  }

  handleModerationHide(payload) {
    if (!this.moderationActionController) return false;
    return this.moderationActionController.handleHide(payload);
  }

  handleModerationSettingsChange({ settings, skipRefresh }) {
    if (!this.moderationDecorator) return;
    const normalized = this.normalizeModerationSettings(settings);
    this.moderationSettings = normalized;
    this.moderationDecorator.updateSettings(normalized);

    if (this.videosMap instanceof Map) {
      for (const video of this.videosMap.values()) {
        if (video && typeof video === "object") {
          this.decorateVideoModeration(video);
        }
      }
    }

    if (
      this.videoListView &&
      Array.isArray(this.videoListView.videoCardInstances)
    ) {
      for (const card of this.videoListView.videoCardInstances) {
        if (card?.video) {
          this.decorateVideoModeration(card.video);
          if (typeof card.refreshModerationUi === "function") {
            card.refreshModerationUi();
          }
        }
      }
    }

    if (this.videoListView && Array.isArray(this.videoListView.currentVideos)) {
      for (const video of this.videoListView.currentVideos) {
        this.decorateVideoModeration(video);
      }
    }

    if (this.currentVideo) {
      this.decorateVideoModeration(this.currentVideo);
    }

    if (!skipRefresh) {
      this.onVideosShouldRefresh({ reason: "moderation-settings-change" });
    }
    return normalized;
  }

  normalizeModerationSettings(settings) {
    if (!this.moderationDecorator) return settings;
    return this.moderationDecorator.normalizeModerationSettings(settings);
  }

  getActiveModerationThresholds() {
    if (!this.moderationSettings || typeof this.moderationSettings !== "object") {
      this.moderationSettings = this.normalizeModerationSettings(this.moderationSettings);
    }
    return this.moderationSettings;
  }

  onVideosShouldRefresh(payload) {
    // noop
  }

  showStatus(message, options) {}
  showError(message) {}

  refreshCardModerationUi(card, options) {
    if (card && typeof card.refreshModerationUi === "function") {
      card.refreshModerationUi();
    }
  }

  dispatchModerationEvent(eventName, detail) {
    if (typeof document !== "undefined") {
      document.dispatchEvent(new CustomEvent(eventName, { detail }));
      return true;
    }
    return false;
  }
}

export async function createModerationAppHarness(options = {}) {
  const app = new MockApplication();

  app.userBlocks = options.userBlocks || userBlocks;

  app.moderationDecorator = new ModerationDecorator({
    getProfileCacheEntry: (pubkey) => app.getProfileCacheEntry(pubkey),
  });

  app.moderationActionController = new ModerationActionController({
    services: {
      userBlocks: app.userBlocks,
      setModerationOverride,
      clearModerationOverride,
    },
    auth: {
      isLoggedIn: () => app.isUserLoggedIn(),
      getViewerPubkey: () => app.pubkey,
      normalizePubkey: (value) => app.normalizeHexPubkey(value),
    },
    actions: {
      refreshVideos: (payload) => app.onVideosShouldRefresh(payload),
      showStatus: (message, options) => app.showStatus(message, options),
      showError: (message) => app.showError(message),
      decorateVideoModeration: (video) => app.decorateVideoModeration(video),
      resumePlayback: (video) => app.resumePendingModeratedPlayback(video),
      describeBlockError: (error) => app.describeUserBlockActionError(error),
    },
    selectors: {
      getVideoById: (id) => (app.videosMap ? app.videosMap.get(id) : null),
      getCurrentVideo: () => app.currentVideo,
    },
    ui: {
      refreshCardModerationUi: (card, options) =>
        app.refreshCardModerationUi(card, options),
      dispatchModerationEvent: (eventName, detail) =>
        app.dispatchModerationEvent(eventName, detail),
    },
  });

  return app;
}
