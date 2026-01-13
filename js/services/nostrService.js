import { nostrClient } from "../nostrClientFacade.js";
import { convertEventToVideo } from "../nostr/index.js";
import { accessControl } from "../accessControl.js";
import { ALLOW_NSFW_CONTENT } from "../config.js";
import { userLogger } from "../utils/logger.js";
import moderationService from "./moderationService.js";
import {
  loadDirectMessageSnapshot,
  saveDirectMessageSnapshot,
  clearDirectMessageSnapshot,
} from "../directMessagesStore.js";
import {
  getVideosMap as getStoredVideosMap,
  setVideosMap as setStoredVideosMap,
  getVideoSubscription as getStoredVideoSubscription,
  setVideoSubscription as setStoredVideoSubscription,
} from "../state/appState.js";

const VIDEO_KIND = 30078;

class SimpleEventEmitter {
  constructor(logger = null) {
    this.logger = typeof logger === "function" ? logger : null;
    this.listeners = new Map();
  }

  on(eventName, handler) {
    if (typeof handler !== "function") {
      return () => {};
    }

    if (!this.listeners.has(eventName)) {
      this.listeners.set(eventName, new Set());
    }

    const handlers = this.listeners.get(eventName);
    handlers.add(handler);

    return () => {
      handlers.delete(handler);
      if (!handlers.size) {
        this.listeners.delete(eventName);
      }
    };
  }

  emit(eventName, detail) {
    const handlers = this.listeners.get(eventName);
    if (!handlers || !handlers.size) {
      return;
    }

    for (const handler of Array.from(handlers)) {
      try {
        handler(detail);
      } catch (error) {
        if (this.logger) {
          try {
            this.logger(`nostrService listener for "${eventName}" threw`, error);
          } catch (logError) {
            userLogger.warn("[nostrService] listener logger threw", logError);
          }
        }
      }
    }
  }
}

function normalizeLogger(logger) {
  if (typeof logger === "function") {
    return logger;
  }
  if (logger && typeof logger.log === "function") {
    return (...args) => logger.log(...args);
  }
  return () => {};
}

function ensureSet(value) {
  if (value instanceof Set) {
    return value;
  }
  if (Array.isArray(value)) {
    return new Set(value);
  }
  return new Set();
}

function normalizeHexPubkey(pubkey) {
  if (typeof pubkey !== "string") {
    return "";
  }

  const trimmed = pubkey.trim();
  return trimmed ? trimmed.toLowerCase() : "";
}

function normalizeUntil(timestamp) {
  const value = Number(timestamp);
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }
  const seconds = Math.floor(value);
  return seconds > 0 ? seconds : 0;
}

function sanitizeSnapshotTimestamp(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return 0;
  }

  const floored = Math.floor(numeric);
  if (!Number.isFinite(floored) || floored <= 0) {
    return 0;
  }

  return floored;
}

const SNAPSHOT_PREVIEW_LIMIT = 160;

function sanitizeSnapshotPreview(value) {
  if (typeof value !== "string") {
    return "";
  }

  let preview = value.replace(/\s+/g, " ").trim();
  if (!preview) {
    return "";
  }

  if (preview.length > SNAPSHOT_PREVIEW_LIMIT) {
    preview = `${preview.slice(0, SNAPSHOT_PREVIEW_LIMIT).trimEnd()}\u2026`;
  }

  return preview;
}

function extractSnapshotPreview(message) {
  if (!message || typeof message !== "object") {
    return "";
  }

  const candidates = [];
  if (typeof message.plaintext === "string") {
    candidates.push(message.plaintext);
  }
  if (typeof message.preview === "string") {
    candidates.push(message.preview);
  }
  if (message.message && typeof message.message.content === "string") {
    candidates.push(message.message.content);
  }

  const selected = candidates.find((candidate) => candidate && candidate.trim());
  return sanitizeSnapshotPreview(selected || "");
}

function getActiveKey(video) {
  if (video.videoRootId) {
    return `ROOT:${video.videoRootId}`;
  }
  const dTag = video.tags?.find((t) => Array.isArray(t) && t[0] === "d");
  if (dTag && typeof dTag[1] === "string") {
    return `${video.pubkey}:${dTag[1]}`;
  }
  return `LEGACY:${video.id}`;
}

function resolveDirectMessageRemotePubkey(message, actorPubkey = "") {
  const normalizedActor = normalizeHexPubkey(actorPubkey);

  const directRemote =
    typeof message?.remotePubkey === "string"
      ? normalizeHexPubkey(message.remotePubkey)
      : "";
  if (directRemote && directRemote !== normalizedActor) {
    return directRemote;
  }

  const snapshotRemote =
    typeof message?.snapshot?.remotePubkey === "string"
      ? normalizeHexPubkey(message.snapshot.remotePubkey)
      : "";
  if (snapshotRemote && snapshotRemote !== normalizedActor) {
    return snapshotRemote;
  }

  const direction =
    typeof message?.direction === "string"
      ? message.direction.toLowerCase()
      : "";

  const senderHex =
    typeof message?.sender?.pubkey === "string"
      ? normalizeHexPubkey(message.sender.pubkey)
      : "";

  if (direction === "incoming" && senderHex && senderHex !== normalizedActor) {
    return senderHex;
  }

  if (Array.isArray(message?.recipients)) {
    for (const recipient of message.recipients) {
      const candidate =
        recipient && typeof recipient.pubkey === "string"
          ? normalizeHexPubkey(recipient.pubkey)
          : "";
      if (candidate && candidate !== normalizedActor) {
        return candidate;
      }
    }
  }

  if (direction === "outgoing" && senderHex && senderHex !== normalizedActor) {
    return senderHex;
  }

  const messagePubkey =
    typeof message?.message?.pubkey === "string"
      ? normalizeHexPubkey(message.message.pubkey)
      : "";
  if (messagePubkey && messagePubkey !== normalizedActor) {
    return messagePubkey;
  }

  const eventPubkey =
    typeof message?.event?.pubkey === "string"
      ? normalizeHexPubkey(message.event.pubkey)
      : "";
  if (eventPubkey && eventPubkey !== normalizedActor) {
    return eventPubkey;
  }

  if (senderHex && senderHex !== normalizedActor) {
    return senderHex;
  }

  return "";
}

function buildSnapshotFromMessages(messages, actorPubkey = "") {
  const normalizedActor = normalizeHexPubkey(actorPubkey);
  const threadMap = new Map();

  for (const message of Array.isArray(messages) ? messages : []) {
    if (!message || message.ok !== true) {
      continue;
    }

    const remote = resolveDirectMessageRemotePubkey(message, normalizedActor);
    if (!remote) {
      continue;
    }

    const timestamp = sanitizeSnapshotTimestamp(message.timestamp);
    const preview = extractSnapshotPreview(message);

    const existing = threadMap.get(remote);
    if (!existing || timestamp > existing.latestTimestamp) {
      threadMap.set(remote, {
        remotePubkey: remote,
        latestTimestamp: timestamp,
        preview,
      });
    }
  }

  return Array.from(threadMap.values()).sort(
    (a, b) => (b.latestTimestamp || 0) - (a.latestTimestamp || 0),
  );
}

function hydrateMessagesFromSnapshot(snapshot, actorPubkey = "") {
  const normalizedActor = normalizeHexPubkey(actorPubkey);
  const hydrated = [];

  const entries = Array.isArray(snapshot) ? snapshot : [];
  entries.sort(
    (a, b) => (b?.latestTimestamp || 0) - (a?.latestTimestamp || 0),
  );

  entries.forEach((entry, index) => {
    const remote = normalizeHexPubkey(entry?.remotePubkey || entry?.remote);
    if (!remote) {
      return;
    }

    const timestamp = sanitizeSnapshotTimestamp(entry?.latestTimestamp);
    const preview = sanitizeSnapshotPreview(entry?.preview || "");

    hydrated.push({
      ok: true,
      timestamp,
      plaintext: preview || null,
      preview: preview || "",
      actorPubkey: normalizedActor,
      remotePubkey: remote,
      sender: remote
        ? {
            pubkey: remote,
            relayHints: [],
            role: "snapshot",
          }
        : null,
      recipients: [],
      direction: "unknown",
      scheme: "",
      decryptor: { scheme: "", source: "snapshot" },
      event: {
        id: `dm-snapshot:${normalizedActor || "actor"}:${remote}:${timestamp}:${index}`,
      },
      message: preview
        ? {
            content: preview,
          }
        : null,
      snapshot: {
        remotePubkey: remote,
        timestamp,
        preview,
      },
    });
  });

  return hydrated;
}

export class NostrService {
  constructor({ logger } = {}) {
    this.nostrClient = nostrClient;
    this.accessControl = accessControl;
    this.logger = normalizeLogger(logger);
    this.emitter = new SimpleEventEmitter((message, error) => {
      try {
        this.logger(message, error);
      } catch (logError) {
        userLogger.warn("[nostrService] logger threw", logError);
      }
    });
    this.videosMap = null;
    this.videosByAuthorIndex = null;
    this.authorIndexDirty = false;
    this.moderationService = moderationService || null;
    this.initialLoadPromise = null;
    this.initialLoadResolved = false;
    this.initialLoadResolve = null;
    this.dmMessages = [];
    this.dmMessageIndex = new Map();
    this.dmSubscription = null;
    this.dmActorPubkey = null;
    this.dmHydratedFromSnapshot = false;
    try {
      if (this.moderationService && typeof this.moderationService.setNostrClient === "function") {
        this.moderationService.setNostrClient(this.nostrClient);
      }
    } catch (error) {
      userLogger.warn("[nostrService] Failed to attach moderation service", error);
    }
  }

  log(...args) {
    try {
      this.logger(...args);
    } catch (error) {
      userLogger.warn("[nostrService] logger threw", error);
    }
  }

  on(eventName, handler) {
    return this.emitter.on(eventName, handler);
  }

  emit(eventName, detail) {
    this.emitter.emit(eventName, detail);
  }

  ensureInitialLoadDeferred() {
    if (!this.initialLoadPromise) {
      this.initialLoadResolved = false;
      this.initialLoadPromise = new Promise((resolve) => {
        this.initialLoadResolve = (value) => {
          if (this.initialLoadResolved) {
            return;
          }
          this.initialLoadResolved = true;
          this.initialLoadResolve = null;
          resolve(value);
        };
      });
    }

    return this.initialLoadPromise;
  }

  resolveInitialLoad(value) {
    if (this.initialLoadResolved) {
      return;
    }

    if (typeof this.initialLoadResolve === "function") {
      try {
        this.initialLoadResolve(value);
      } finally {
        this.initialLoadResolve = null;
        this.initialLoadResolved = true;
      }
    }
  }

  awaitInitialLoad() {
    return this.ensureInitialLoadDeferred();
  }

  resolveActiveDmActor() {
    if (
      this.nostrClient &&
      typeof this.nostrClient.pubkey === "string" &&
      this.nostrClient.pubkey
    ) {
      return this.nostrClient.pubkey;
    }

    if (
      this.nostrClient?.sessionActor &&
      typeof this.nostrClient.sessionActor.pubkey === "string"
    ) {
      return this.nostrClient.sessionActor.pubkey;
    }

    return "";
  }

  getDirectMessages() {
    return Array.isArray(this.dmMessages) ? [...this.dmMessages] : [];
  }

  clearDirectMessages({ actorPubkey = null, emit = true } = {}) {
    this.dmMessages = [];
    this.dmMessageIndex = new Map();
    this.dmHydratedFromSnapshot = false;
    const activeActor = normalizeHexPubkey(
      typeof actorPubkey === "string" && actorPubkey
        ? actorPubkey
        : this.dmActorPubkey || this.resolveActiveDmActor(),
    );
    if (activeActor) {
      clearDirectMessageSnapshot(activeActor).catch((error) => {
        userLogger.warn("[nostrService] Failed to clear DM snapshot", error);
      });
    }
    this.dmActorPubkey = null;
    if (typeof this.nostrClient?.clearDmDecryptCache === "function") {
      try {
        this.nostrClient.clearDmDecryptCache();
      } catch (error) {
        userLogger.warn("[nostrService] Failed to clear DM decrypt cache", error);
      }
    }
    if (emit) {
      this.emit("directMessages:cleared", {});
      this.emit("directMessages:updated", { messages: [] });
    }
  }

  applyDirectMessage(message, { reason = "update", event = null } = {}) {
    if (!message || message.ok !== true) {
      return;
    }

    const eventId = message?.event?.id;
    if (typeof eventId !== "string" || !eventId) {
      return;
    }

    const normalized = {
      ...message,
      timestamp:
        Number.isFinite(message?.timestamp)
          ? message.timestamp
          : Number.isFinite(message?.message?.created_at)
          ? message.message.created_at
          : Number.isFinite(message?.event?.created_at)
          ? message.event.created_at
          : Date.now() / 1000,
    };

    this.dmMessageIndex.set(eventId, normalized);

    const actor = normalizeHexPubkey(
      normalized?.actorPubkey || this.dmActorPubkey || this.resolveActiveDmActor(),
    );
    const remote = resolveDirectMessageRemotePubkey(normalized, actor);

    if (remote) {
      this.dmMessages = this.dmMessages.filter(
        (entry) =>
          !entry?.snapshot || entry.snapshot.remotePubkey !== remote,
      );
    }

    const existingIndex = this.dmMessages.findIndex(
      (entry) => entry?.event?.id === eventId,
    );
    if (existingIndex >= 0) {
      this.dmMessages[existingIndex] = normalized;
    } else {
      this.dmMessages.push(normalized);
    }

    this.dmMessages.sort((a, b) => (b?.timestamp || 0) - (a?.timestamp || 0));
    if (actor) {
      this.dmActorPubkey = actor;
    }
    this.dmHydratedFromSnapshot = false;

    this.emit("directMessages:message", { message: normalized, reason, event });
    this.emit("directMessages:updated", {
      messages: this.getDirectMessages(),
      reason,
    });

    if (actor) {
      this.persistDirectMessageSnapshot(actor).catch((error) => {
        userLogger.warn(
          "[nostrService] Failed to persist DM snapshot after update",
          error,
        );
      });
    }
  }

  async hydrateDirectMessagesFromStore({
    actorPubkey = null,
    emit = false,
    force = false,
  } = {}) {
    const activeActor = normalizeHexPubkey(
      typeof actorPubkey === "string" && actorPubkey
        ? actorPubkey
        : this.resolveActiveDmActor(),
    );

    if (!activeActor) {
      return [];
    }

    let stored = [];
    try {
      stored = await loadDirectMessageSnapshot(activeActor);
    } catch (error) {
      userLogger.warn("[nostrService] Failed to load DM snapshot", error);
      return [];
    }

    const hydrated = hydrateMessagesFromSnapshot(stored, activeActor);

    const shouldReplace =
      force ||
      !Array.isArray(this.dmMessages) ||
      !this.dmMessages.length ||
      this.dmHydratedFromSnapshot;

    this.dmActorPubkey = activeActor;

    if (!shouldReplace) {
      return this.getDirectMessages();
    }

    this.dmMessages = hydrated;
    this.dmMessageIndex = new Map();
    this.dmHydratedFromSnapshot = hydrated.length > 0;

    const snapshot = this.getDirectMessages();

    if (emit) {
      this.emit("directMessages:hydrated", {
        messages: snapshot,
        actorPubkey: activeActor,
      });
      this.emit("directMessages:updated", {
        messages: snapshot,
        reason: "snapshot",
      });
    }

    return snapshot;
  }

  async loadDirectMessages({ actorPubkey, relays, ...options } = {}) {
    const activeActor = actorPubkey || this.resolveActiveDmActor();
    const normalizedActor = normalizeHexPubkey(activeActor);
    if (!normalizedActor) {
      return [];
    }

    const forceHydration =
      this.dmActorPubkey && this.dmActorPubkey !== normalizedActor;

    await this.hydrateDirectMessagesFromStore({
      actorPubkey: normalizedActor,
      emit: true,
      force: forceHydration,
    });

    this.dmActorPubkey = normalizedActor;

    let messages = [];
    try {
      messages = await this.nostrClient.listDirectMessages(normalizedActor, {
        relays,
        ...options,
      });
    } catch (error) {
      userLogger.warn("[nostrService] Failed to load direct messages", error);
      return this.getDirectMessages();
    }

    const collected = [];
    const index = new Map();

    for (const message of Array.isArray(messages) ? messages : []) {
      if (!message || message.ok !== true) {
        continue;
      }

      const eventId = message?.event?.id;
      if (typeof eventId !== "string" || !eventId) {
        continue;
      }

      const normalized = {
        ...message,
        timestamp:
          Number.isFinite(message?.timestamp)
            ? message.timestamp
            : Number.isFinite(message?.message?.created_at)
            ? message.message.created_at
            : Number.isFinite(message?.event?.created_at)
            ? message.event.created_at
            : Date.now() / 1000,
      };

      index.set(eventId, normalized);
      collected.push(normalized);
    }

    collected.sort((a, b) => (b?.timestamp || 0) - (a?.timestamp || 0));
    this.dmMessageIndex = index;
    this.dmMessages = collected;

    const snapshot = this.getDirectMessages();

    this.dmHydratedFromSnapshot = false;

    this.emit("directMessages:loaded", {
      messages: snapshot,
      actorPubkey: normalizedActor,
    });
    this.emit("directMessages:updated", {
      messages: snapshot,
      reason: "load",
    });

    try {
      await this.persistDirectMessageSnapshot(normalizedActor, snapshot);
    } catch (error) {
      userLogger.warn(
        "[nostrService] Failed to persist DM snapshot after load",
        error,
      );
    }

    return snapshot;
  }

  ensureDirectMessageSubscription({ actorPubkey, relays, ...handlers } = {}) {
    if (this.dmSubscription) {
      return this.dmSubscription;
    }

    const activeActor = actorPubkey || this.resolveActiveDmActor();
    const normalizedActor = normalizeHexPubkey(activeActor);
    if (!normalizedActor) {
      return null;
    }

    try {
      const subscription = this.nostrClient.subscribeDirectMessages(
        normalizedActor,
        {
          relays,
          onEvent: handlers.onEvent,
          onMessage: (message, context = {}) => {
            this.applyDirectMessage(message, {
              reason: "subscription",
              event: context.event || null,
            });
            if (typeof handlers.onMessage === "function") {
              try {
                handlers.onMessage(message, context);
              } catch (error) {
                userLogger.warn(
                  "[nostrService] DM onMessage handler threw",
                  error,
                );
              }
            }
          },
          onFailure: (payload, context) => {
            this.emit("directMessages:failure", { failure: payload, context });
            if (typeof handlers.onFailure === "function") {
              try {
                handlers.onFailure(payload, context);
              } catch (error) {
                userLogger.warn(
                  "[nostrService] DM onFailure handler threw",
                  error,
                );
              }
            }
          },
          onError: (error, context) => {
            this.emit("directMessages:error", { error, context });
            if (typeof handlers.onError === "function") {
              try {
                handlers.onError(error, context);
              } catch (handlerError) {
                userLogger.warn(
                  "[nostrService] DM onError handler threw",
                  handlerError,
                );
              }
            } else {
              userLogger.warn(
                "[nostrService] Direct message subscription error",
                error,
              );
            }
          },
          onEose: () => {
            this.emit("directMessages:eose", { actorPubkey: normalizedActor });
            if (typeof handlers.onEose === "function") {
              try {
                handlers.onEose();
              } catch (error) {
                userLogger.warn(
                  "[nostrService] DM onEose handler threw",
                  error,
                );
              }
            }
          },
        },
      );

      this.dmSubscription = subscription;
      this.dmActorPubkey = normalizedActor;
      this.emit("directMessages:subscribed", { subscription });
      return subscription;
    } catch (error) {
      userLogger.warn(
        "[nostrService] Failed to subscribe to direct messages",
        error,
      );
      return null;
    }
  }

  stopDirectMessageSubscription() {
    if (this.dmSubscription && typeof this.dmSubscription.unsub === "function") {
      try {
        this.dmSubscription.unsub();
      } catch (error) {
        userLogger.warn(
          "[nostrService] Failed to unsubscribe from direct messages",
          error,
        );
      }
    }
    this.dmSubscription = null;
  }

  async persistDirectMessageSnapshot(actorPubkey = null, messages = null) {
    const normalizedActor = normalizeHexPubkey(
      typeof actorPubkey === "string" && actorPubkey
        ? actorPubkey
        : this.dmActorPubkey || this.resolveActiveDmActor(),
    );

    if (!normalizedActor) {
      return [];
    }

    const sourceMessages = Array.isArray(messages) ? messages : this.dmMessages;
    const snapshotPayload = buildSnapshotFromMessages(
      sourceMessages,
      normalizedActor,
    );

    if (!snapshotPayload.length) {
      await clearDirectMessageSnapshot(normalizedActor);
      return snapshotPayload;
    }

    return saveDirectMessageSnapshot(normalizedActor, snapshotPayload);
  }

  getModerationService() {
    if (!this.moderationService) {
      return null;
    }

    try {
      if (
        typeof this.moderationService.setNostrClient === "function" &&
        this.moderationService.nostrClient !== this.nostrClient
      ) {
        this.moderationService.setNostrClient(this.nostrClient);
      }

      if (typeof this.moderationService.refreshViewerFromClient === "function") {
        this.moderationService.refreshViewerFromClient();
      }
    } catch (error) {
      userLogger.warn("[nostrService] Failed to synchronize moderation service", error);
    }

    return this.moderationService;
  }

  ensureVideosMap() {
    if (this.videosMap instanceof Map) {
      return this.videosMap;
    }

    let map = getStoredVideosMap();
    if (!(map instanceof Map)) {
      map = new Map();
      setStoredVideosMap(map);
    }

    this.videosMap = map;
    this.markAuthorIndexDirty();
    return this.videosMap;
  }

  getVideosMap() {
    return this.ensureVideosMap();
  }

  getVideoSubscription() {
    return getStoredVideoSubscription();
  }

  setVideoSubscription(subscription) {
    setStoredVideoSubscription(subscription || null);
    this.emit("subscription:changed", { subscription: subscription || null });
  }

  clearVideoSubscription() {
    const current = getStoredVideoSubscription();
    if (current && typeof current.unsub === "function") {
      try {
        current.unsub();
      } catch (error) {
        userLogger.warn("[nostrService] Failed to unsubscribe from video feed:", error);
      }
    }
    this.setVideoSubscription(null);
  }

  cacheVideos(videos = []) {
    if (!Array.isArray(videos) || !videos.length) {
      return;
    }

    const map = this.ensureVideosMap();
    for (const video of videos) {
      if (video && typeof video.id === "string" && video.id) {
        map.set(video.id, video);
      }
    }
    setStoredVideosMap(map);
    this.markAuthorIndexDirty();
    this.emit("videos:cache", { size: map.size });
  }

  resetVideosCache() {
    const map = new Map();
    this.videosMap = map;
    this.videosByAuthorIndex = new Map();
    this.authorIndexDirty = false;
    setStoredVideosMap(map);
    this.emit("videos:cache", { size: 0 });
  }

  markAuthorIndexDirty() {
    this.authorIndexDirty = true;
  }

  ensureVideosByAuthorIndex() {
    const videosMap = this.ensureVideosMap();

    if (this.videosByAuthorIndex instanceof Map && !this.authorIndexDirty) {
      return this.videosByAuthorIndex;
    }

    const index = new Map();
    for (const video of videosMap.values()) {
      if (!video || typeof video !== "object") {
        continue;
      }
      const author = normalizeHexPubkey(video.pubkey);
      if (!author) {
        continue;
      }
      if (!index.has(author)) {
        index.set(author, []);
      }
      index.get(author).push(video);
    }

    for (const [author, videos] of index.entries()) {
      if (!Array.isArray(videos) || videos.length <= 1) {
        continue;
      }
      videos.sort((a, b) => {
        const aCreatedCandidate = Number(a?.created_at);
        const bCreatedCandidate = Number(b?.created_at);
        const aCreated = Number.isFinite(aCreatedCandidate)
          ? aCreatedCandidate
          : 0;
        const bCreated = Number.isFinite(bCreatedCandidate)
          ? bCreatedCandidate
          : 0;
        return bCreated - aCreated;
      });
      index.set(author, videos);
    }

    this.videosByAuthorIndex = index;
    this.authorIndexDirty = false;
    return this.videosByAuthorIndex;
  }

  shouldIncludeVideo(video, {
    blacklistedEventIds = new Set(),
    isAuthorBlocked = () => false,
  } = {}) {
    if (!video || typeof video !== "object") {
      return false;
    }

    const viewerIsAuthor = this.isViewerVideoAuthor(video);

    if (viewerIsAuthor) {
      return true;
    }

    if (ALLOW_NSFW_CONTENT !== true && video.isNsfw === true) {
      return false;
    }

    if (blacklistedEventIds.has(video.id)) {
      return false;
    }

    if (typeof video.pubkey === "string" && video.pubkey) {
      try {
        if (isAuthorBlocked(video.pubkey)) {
          return false;
        }
      } catch (error) {
        userLogger.warn("[nostrService] isAuthorBlocked handler threw", error);
      }
    }

    if (video.isPrivate === true) {
      return false;
    }

    if (this.accessControl && typeof this.accessControl.canAccess === "function") {
      try {
        if (!this.accessControl.canAccess(video)) {
          return false;
        }
      } catch (error) {
        userLogger.warn("[nostrService] access control check failed", error);
        return false;
      }
    }

    return true;
  }

  filterVideos(videos = [], options = {}) {
    const blacklist = ensureSet(options.blacklistedEventIds);
    const isAuthorBlocked =
      typeof options.isAuthorBlocked === "function"
        ? options.isAuthorBlocked
        : () => false;

    return videos.filter((video) =>
      this.shouldIncludeVideo(video, {
        blacklistedEventIds: blacklist,
        isAuthorBlocked,
      })
    );
  }

  async ensureAccessControlReady() {
    if (!this.accessControl || typeof this.accessControl.ensureReady !== "function") {
      return;
    }

    try {
      await this.accessControl.ensureReady();
    } catch (error) {
      userLogger.warn(
        "[nostrService] Failed to ensure access control lists are ready:",
        error
      );
    }
  }

  getFilteredActiveVideos(options = {}) {
    const all = this.nostrClient.getActiveVideos();
    return this.filterVideos(all, options);
  }

  getActiveVideosByAuthors(authors = [], options = {}) {
    const candidates = ensureSet(authors);
    const normalizedAuthors = new Set();
    for (const candidate of candidates) {
      const normalized = normalizeHexPubkey(candidate);
      if (normalized) {
        normalizedAuthors.add(normalized);
      }
    }

    if (!normalizedAuthors.size) {
      return this.getFilteredActiveVideos(options);
    }

    const index = this.ensureVideosByAuthorIndex();
    const collected = [];
    const seen = new Set();
    const limitCandidate = Number(options?.limit);
    const limit =
      Number.isFinite(limitCandidate) && limitCandidate > 0
        ? Math.floor(limitCandidate)
        : null;
    const perAuthorLimit = limit
      ? Math.max(limit * 2, limit + 5)
      : null;

    for (const author of normalizedAuthors) {
      const entries = index.get(author);
      if (!Array.isArray(entries) || entries.length === 0) {
        continue;
      }
      const sliceCount = perAuthorLimit
        ? Math.min(perAuthorLimit, entries.length)
        : entries.length;
      for (let idx = 0; idx < sliceCount; idx += 1) {
        const video = entries[idx];
        if (!video || typeof video !== "object") {
          continue;
        }
        const id = typeof video.id === "string" ? video.id : "";
        if (!id || seen.has(id)) {
          continue;
        }
        seen.add(id);
        collected.push(video);
      }
    }

    const filtered = this.filterVideos(collected, options);

    const sorted = filtered.sort((a, b) => {
      const aCreatedCandidate = Number(a?.created_at);
      const bCreatedCandidate = Number(b?.created_at);
      const aCreated = Number.isFinite(aCreatedCandidate) ? aCreatedCandidate : 0;
      const bCreated = Number.isFinite(bCreatedCandidate) ? bCreatedCandidate : 0;
      return bCreated - aCreated;
    });

    if (limit) {
      return sorted.slice(0, limit);
    }

    return sorted;
  }

  async loadVideos({
    forceFetch = false,
    blacklistedEventIds,
    isAuthorBlocked,
    onVideos,
  } = {}) {
    this.ensureInitialLoadDeferred();

    try {
      this.ensureAccessControlReady().catch((error) => {
        userLogger.warn(
          "[nostrService] Background access control ready check failed:",
          error
        );
      });

      if (forceFetch) {
        this.clearVideoSubscription();
      }

      const applyAndNotify = (videos, reason) => {
        const filtered = this.filterVideos(videos, {
          blacklistedEventIds,
          isAuthorBlocked,
        });
        this.cacheVideos(filtered);
        if (typeof onVideos === "function") {
          try {
            onVideos(filtered, { reason });
          } catch (error) {
            userLogger.warn("[nostrService] onVideos handler threw", error);
          }
        }
        this.emit("videos:updated", { videos: filtered, reason });
        return filtered;
      };

      const cached = this.nostrClient.getActiveVideos();
      const initial = applyAndNotify(cached, "cache");

      this.resolveInitialLoad({ videos: initial, reason: "cache" });

      if (!getStoredVideoSubscription()) {
        const subscriptionOptions = {
          // Start from the freshest cached timestamp to avoid replaying the full history;
          // use loadOlderVideos when the user scrolls for backfill.
          since: this.nostrClient.getLatestCachedCreatedAt() || undefined,
          limit: this.nostrClient.clampVideoRequestLimit(200),
        };
        const subscription = this.nostrClient.subscribeVideos(
          () => {
            const updated = this.nostrClient.getActiveVideos();
            applyAndNotify(updated, "subscription");
          },
          subscriptionOptions,
        );
        this.setVideoSubscription(subscription);
        this.emit("subscription:started", { subscription });
      }

      return initial;
    } catch (error) {
      this.resolveInitialLoad({ videos: [], reason: "error", error });
      throw error;
    }
  }

  async fetchVideos(options = {}) {
    try {
      const videos = await this.nostrClient.fetchVideos();
      const filtered = this.filterVideos(videos, options);
      this.cacheVideos(filtered);
      this.emit("videos:fetched", { videos: filtered });
      return filtered;
    } catch (error) {
      userLogger.error("[nostrService] Failed to fetch videos:", error);
      return [];
    }
  }

  async fetchVideosByAuthors(authors, options = {}) {
    const authorList = Array.isArray(authors) ? authors : [];
    if (!authorList.length) {
      return [];
    }

    this.log(`[nostrService] fetchVideosByAuthors START. Authors: ${authorList.length}`);

    const requestedLimit = Number(options?.limit);
    const resolvedLimit = this.nostrClient.clampVideoRequestLimit(
      requestedLimit
    );

    const filter = {
      kinds: [VIDEO_KIND],
      "#t": ["video"],
      authors: authorList,
      limit: resolvedLimit,
    };

    const localAll = new Map();
    // Track invalid
    const invalidNotes = [];

    try {
      this.log(`[nostrService] Querying ${this.nostrClient.relays.length} relays...`);
      await Promise.all(
        this.nostrClient.relays.map(async (url) => {
          try {
            this.log(`[nostrService] Querying relay: ${url}`);
            const events = await this.nostrClient.pool.list([url], [filter]);
            this.log(`[nostrService] Relay ${url} returned ${events.length} events.`);
            for (const evt of events) {
              if (evt && evt.id) {
                this.nostrClient.rawEvents.set(evt.id, evt);
              }
              const vid = convertEventToVideo(evt);
              if (vid.invalid) {
                invalidNotes.push({ id: vid.id, reason: vid.reason });
              } else {
                if (
                  this.nostrClient &&
                  typeof this.nostrClient.applyRootCreatedAt === "function"
                ) {
                  this.nostrClient.applyRootCreatedAt(vid);
                }
                const activeKey = getActiveKey(vid);
                if (vid.deleted) {
                  this.nostrClient.recordTombstone(activeKey, vid.created_at);
                } else {
                  this.nostrClient.applyTombstoneGuard(vid);
                }
                localAll.set(evt.id, vid);
              }
            }
          } catch (relayErr) {
            this.log(`[nostrService] Relay ${url} failed:`, relayErr);
          }
        })
      );

      // Merge into allEvents
      for (const [id, vid] of localAll.entries()) {
        this.nostrClient.allEvents.set(id, vid);
        if (
          this.nostrClient &&
          typeof this.nostrClient.applyRootCreatedAt === "function"
        ) {
          this.nostrClient.applyRootCreatedAt(vid);
        }
      }

      // Update activeMap for affected keys
      for (const [id, video] of localAll.entries()) {
        if (video.deleted) continue;
        const activeKey = getActiveKey(video);
        const existing = this.nostrClient.activeMap.get(activeKey);

        if (!existing || video.created_at > existing.created_at) {
          this.nostrClient.activeMap.set(activeKey, video);
          if (
            this.nostrClient &&
            typeof this.nostrClient.applyRootCreatedAt === "function"
          ) {
            this.nostrClient.applyRootCreatedAt(video);
          }
        }
      }

      // Re-populate cache indexing
      this.ensureVideosMap();
      this.markAuthorIndexDirty();

      // Collect the actual videos for the requested authors
      const collected = [];
      const seen = new Set();
      // We look at localAll to ensure we only return what we fetched (or fresh stuff)
      // Actually, we should probably return the "best" active videos for these authors
      // now that we've refreshed the cache.
      const index = this.ensureVideosByAuthorIndex();

      for (const author of authorList) {
        const entries = index.get(author);
        if (Array.isArray(entries)) {
          for (const video of entries) {
            if (video && video.id && !seen.has(video.id)) {
              seen.add(video.id);
              collected.push(video);
            }
          }
        }
      }

      const filtered = this.filterVideos(collected, options);

      // Sort newest first
      filtered.sort((a, b) => {
        const createdA = Number(a?.created_at) || 0;
        const createdB = Number(b?.created_at) || 0;
        return createdB - createdA;
      });

      const finalLimit = resolvedLimit || filtered.length;
      const limited = filtered.slice(0, finalLimit);

      // Trigger metadata hydration
      await this.nostrClient.populateNip71MetadataForVideos(limited);
      limited.forEach((video) => {
        if (
          this.nostrClient &&
          typeof this.nostrClient.applyRootCreatedAt === "function"
        ) {
          this.nostrClient.applyRootCreatedAt(video);
        }
      });

      this.cacheVideos(limited);
      this.emit("videos:fetched", { videos: limited, context: "authors" });

      return limited;
    } catch (err) {
      userLogger.error("[nostrService] fetchVideosByAuthors error:", err);
      return [];
    }
  }

  async loadOlderVideos(lastTimestamp, {
    blacklistedEventIds,
    isAuthorBlocked,
    limit = 150,
  } = {}) {
    const until = normalizeUntil(lastTimestamp) - 1;
    if (until <= 0 || !this.nostrClient?.pool || !Array.isArray(this.nostrClient?.relays)) {
      return [];
    }

    const clampedLimit =
      this.nostrClient?.clampVideoRequestLimit(limit) ?? limit ?? 0;

    const filter = {
      kinds: [VIDEO_KIND],
      "#t": ["video"],
      until,
      limit: clampedLimit,
    };

    const collected = new Map();

    try {
      const events = await this.nostrClient.pool.list(this.nostrClient.relays, [filter]);
      for (const event of Array.isArray(events) ? events : []) {
        try {
          const video = convertEventToVideo(event);
          if (video.invalid) {
            continue;
          }
          if (
            this.nostrClient &&
            typeof this.nostrClient.applyRootCreatedAt === "function"
          ) {
            this.nostrClient.applyRootCreatedAt(video);
          }
          if (collected.has(video.id)) {
            continue;
          }
          collected.set(video.id, video);
          this.nostrClient.allEvents.set(video.id, video);
        } catch (error) {
          userLogger.warn("[nostrService] Failed to convert older event", error);
        }
      }
    } catch (error) {
      userLogger.error("[nostrService] Failed to load older videos:", error);
      return [];
    }

    const videos = Array.from(collected.values());
    const filtered = this.filterVideos(videos, {
      blacklistedEventIds,
      isAuthorBlocked,
    });

    this.cacheVideos(filtered);
    this.emit("videos:older", { videos: filtered, until });

    return filtered;
  }

  async publishVideoNote(publishPayload, pubkey) {
    const detail = { pubkey };
    if (publishPayload && typeof publishPayload === "object") {
      detail.payload = publishPayload;
      if (publishPayload.legacyFormData) {
        detail.legacyFormData = publishPayload.legacyFormData;
      }
      if (publishPayload.nip71) {
        detail.nip71 = publishPayload.nip71;
      }
    } else {
      detail.formData = publishPayload;
    }

    let nip71Result = null;
    let legacyResult = null;

    try {
      legacyResult = await this.nostrClient.publishVideo(
        publishPayload,
        pubkey
      );
    } catch (error) {
      detail.error = error;
      throw error;
    }

    let shouldAttemptNip71 = true;
    const pointerIdentifiers = {
      eventId: legacyResult?.id,
    };

    if (Array.isArray(legacyResult?.tags)) {
      const dTag = legacyResult.tags.find(
        (tag) => Array.isArray(tag) && tag[0] === "d" && typeof tag[1] === "string"
      );
      if (dTag) {
        pointerIdentifiers.dTag = dTag[1];
      }
    }

    if (legacyResult?.content) {
      try {
        const parsed = JSON.parse(legacyResult.content);
        if (parsed && typeof parsed.videoRootId === "string") {
          pointerIdentifiers.videoRootId = parsed.videoRootId;
        }
        if (parsed && parsed.isPrivate) {
          shouldAttemptNip71 = false;
        }
      } catch (parseError) {
        this.log("[nostrService] Failed to parse legacy publish payload", parseError);
      }
    }

    if (!pointerIdentifiers.videoRootId) {
      shouldAttemptNip71 = false;
    }

    if (shouldAttemptNip71) {
      try {
        nip71Result = await this.nostrClient.publishNip71Video(
          publishPayload,
          pubkey,
          pointerIdentifiers
        );
      } catch (nip71Error) {
        detail.nip71Error = nip71Error;
        this.log("[nostrService] NIP-71 publish failed", nip71Error);
      }
    }

    const result = { legacy: legacyResult, nip71: nip71Result };
    detail.result = result;
    this.emit("videos:published", detail);
    return result;
  }

  async handleEditVideoSubmit({ originalEvent, updatedData, pubkey }) {
    const result = await this.nostrClient.editVideo(originalEvent, updatedData, pubkey);
    this.emit("videos:edited", { originalEvent, updatedData, pubkey, result });
    return result;
  }

  async handleFullDeleteVideo({ videoRootId, video, pubkey, confirm = true } = {}) {
    const result = await this.nostrClient.deleteAllVersions(videoRootId, pubkey, {
      confirm,
      video,
    });

    if (!result) {
      return result;
    }

    const revertFailures = [];
    const deleteFailures = [];

    if (Array.isArray(result.reverts)) {
      for (const entry of result.reverts) {
        if (!entry || typeof entry !== "object") {
          continue;
        }

        const failed = Array.isArray(entry?.summary?.failed)
          ? entry.summary.failed.filter(Boolean)
          : [];
        if (failed.length) {
          revertFailures.push({
            targetId: entry.targetId || "",
            eventId: entry.event?.id || "",
            failed,
          });
        }
      }
    }

    if (Array.isArray(result.deletes)) {
      for (const entry of result.deletes) {
        if (!entry || typeof entry !== "object") {
          continue;
        }

        const failed = Array.isArray(entry?.summary?.failed)
          ? entry.summary.failed.filter(Boolean)
          : [];
        if (failed.length) {
          deleteFailures.push({
            eventId: entry.event?.id || "",
            identifiers: entry.identifiers || { events: [], addresses: [] },
            failed,
          });
        }
      }
    }

    const detail = {
      videoRootId,
      video,
      pubkey,
      result,
      revertFailures,
      deleteFailures,
    };

    this.emit("videos:deleted", detail);

    return detail;
  }

  async getOldEventById(eventId) {
    const map = this.ensureVideosMap();
    const isBlockedNsfw = (video) =>
      ALLOW_NSFW_CONTENT !== true &&
      video?.isNsfw === true &&
      !this.isViewerVideoAuthor(video);

    if (map.has(eventId)) {
      const existing = map.get(eventId);
      if (existing && !existing.deleted) {
        this.nostrClient.applyTombstoneGuard(existing);
      }
      if (!existing || existing.deleted) {
        map.delete(eventId);
        setStoredVideosMap(map);
        return null;
      }
      if (isBlockedNsfw(existing)) {
        map.delete(eventId);
        setStoredVideosMap(map);
        return null;
      }
      return existing;
    }

    const cached = this.nostrClient.allEvents.get(eventId);
    if (cached) {
      if (!cached.deleted) {
        this.nostrClient.applyTombstoneGuard(cached);
      }
    }
    if (cached && !cached.deleted) {
      if (isBlockedNsfw(cached)) {
        return null;
      }
      map.set(eventId, cached);
      setStoredVideosMap(map);
      return cached;
    }

    const fetched = await this.nostrClient.getEventById(eventId);
    if (fetched && !fetched.deleted) {
      if (isBlockedNsfw(fetched)) {
        return null;
      }
      map.set(eventId, fetched);
      setStoredVideosMap(map);
      return fetched;
    }

    return null;
  }

  isViewerVideoAuthor(video) {
    try {
      this.getModerationService();
    } catch (error) {
      userLogger.warn("[nostrService] Failed to refresh moderation context", error);
    }
    if (!video || typeof video !== "object") {
      return false;
    }

    const viewerPubkey = normalizeHexPubkey(this.nostrClient?.pubkey);
    if (!viewerPubkey) {
      return false;
    }

    const videoPubkey = normalizeHexPubkey(video.pubkey);
    return !!videoPubkey && videoPubkey === viewerPubkey;
  }
}

const nostrService = new NostrService();

export default nostrService;
