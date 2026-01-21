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

let cachedApplicationClass = null;

async function getApplicationClass() {
  if (!cachedApplicationClass) {
    if (typeof globalThis.self === "undefined") {
      globalThis.self = globalThis;
    }
    if (typeof globalThis.WebSocket === "undefined") {
      globalThis.WebSocket = class {
        constructor() {}
        close() {}
        addEventListener() {}
        removeEventListener() {}
        send() {}
      };
    }
    const module = await import("../../js/app.js");
    cachedApplicationClass = module.Application || module.default;
  }
  return cachedApplicationClass;
}

export async function createModerationAppHarness() {
  const Application = await getApplicationClass();
  const app = Object.create(Application.prototype);

  Object.defineProperty(app, "__profiles", {
    value: new Map(),
    writable: true,
    configurable: true,
  });

  app.getProfileCacheEntry = (pubkey) => {
    if (!pubkey || typeof pubkey !== "string") {
      return null;
    }
    return app.__profiles.get(pubkey) || null;
  };

  app.moderationDecorator = new ModerationDecorator({
    getProfileCacheEntry: (pubkey) => app.getProfileCacheEntry(pubkey),
  });

  app.moderationActionController = new ModerationActionController({
    services: {
      userBlocks,
      setModerationOverride,
      clearModerationOverride,
    },
    auth: {
      isLoggedIn: () => app.isUserLoggedIn(),
      getViewerPubkey: () => app.pubkey,
      normalizePubkey: (value) =>
        app.normalizeHexPubkey
          ? app.normalizeHexPubkey(value)
          : Application.prototype.normalizeHexPubkey.call(app, value),
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

  app.decorateVideoModeration = Application.prototype.decorateVideoModeration;
  app.resumePendingModeratedPlayback =
    Application.prototype.resumePendingModeratedPlayback;
  app.describeUserBlockActionError =
    Application.prototype.describeUserBlockActionError;
  app.deriveModerationReportType = Application.prototype.deriveModerationReportType;
  app.deriveModerationTrustedCount = Application.prototype.deriveModerationTrustedCount;
  app.getReporterDisplayName = Application.prototype.getReporterDisplayName;
  app.handleModerationOverride = Application.prototype.handleModerationOverride;
  app.handleModerationBlock = Application.prototype.handleModerationBlock;
  app.handleModerationHide = Application.prototype.handleModerationHide;
  app.handleModerationSettingsChange =
    Application.prototype.handleModerationSettingsChange;
  app.normalizeModerationSettings =
    Application.prototype.normalizeModerationSettings;
  app.getActiveModerationThresholds =
    Application.prototype.getActiveModerationThresholds;

  app.defaultModerationSettings = getDefaultModerationSettings();
  app.moderationSettings = { ...app.defaultModerationSettings };

  app.videosMap = new Map();
  app.currentVideo = null;
  app.pendingModeratedPlayback = null;

  return app;
}
