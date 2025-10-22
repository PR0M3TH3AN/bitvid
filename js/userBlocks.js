// js/userBlocks.js
import {
  getActiveSigner,
  nostrClient,
  requestDefaultExtensionPermissions,
} from "./nostr.js";
import { buildBlockListEvent, BLOCK_LIST_IDENTIFIER } from "./nostrEventSchemas.js";
import { userLogger } from "./utils/logger.js";
import {
  publishEventToRelays,
  assertAnyRelayAccepted,
} from "./nostrPublish.js";

class TinyEventEmitter {
  constructor() {
    this.listeners = new Map();
  }

  on(eventName, handler) {
    if (typeof eventName !== "string" || typeof handler !== "function") {
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
        userLogger.warn(
          `[UserBlockList] listener for "${eventName}" threw an error`,
          error,
        );
      }
    }
  }
}

export const USER_BLOCK_EVENTS = Object.freeze({
  CHANGE: "change",
  STATUS: "status",
});

const FAST_BLOCKLIST_RELAY_LIMIT = 3;
const FAST_BLOCKLIST_TIMEOUT_MS = 2500;
const BACKGROUND_BLOCKLIST_TIMEOUT_MS = 6000;

const BLOCKLIST_STORAGE_PREFIX = "bitvid:user-blocks";
const BLOCKLIST_SEEDED_KEY_PREFIX = `${BLOCKLIST_STORAGE_PREFIX}:seeded:v1`;
const BLOCKLIST_REMOVALS_KEY_PREFIX = `${BLOCKLIST_STORAGE_PREFIX}:removals:v1`;

function decodeNpubToHex(npub) {
  if (typeof npub !== "string") {
    return null;
  }

  const trimmed = npub.trim();
  if (!trimmed) {
    return null;
  }

  if (/^[0-9a-f]{64}$/i.test(trimmed)) {
    return trimmed.toLowerCase();
  }

  if (!trimmed.toLowerCase().startsWith("npub1")) {
    return null;
  }

  const tools = window?.NostrTools;
  const decoder = tools?.nip19?.decode;
  if (typeof decoder !== "function") {
    return null;
  }

  try {
    const decoded = decoder(trimmed);
    if (decoded?.type === "npub" && typeof decoded.data === "string") {
      const hex = decoded.data.trim();
      if (/^[0-9a-f]{64}$/i.test(hex)) {
        return hex.toLowerCase();
      }
    }
  } catch (error) {
    return null;
  }

  return null;
}

function readSeededFlag(actorHex) {
  if (typeof actorHex !== "string" || !actorHex) {
    return false;
  }

  if (typeof localStorage === "undefined") {
    return false;
  }

  const key = `${BLOCKLIST_SEEDED_KEY_PREFIX}:${actorHex}`;

  try {
    const value = localStorage.getItem(key);
    return value === "1";
  } catch (error) {
    userLogger.warn(
      `[UserBlockList] Failed to read seeded baseline state for ${actorHex}:`,
      error,
    );
    return false;
  }
}

function writeSeededFlag(actorHex, seeded) {
  if (typeof actorHex !== "string" || !actorHex) {
    return;
  }

  if (typeof localStorage === "undefined") {
    return;
  }

  const key = `${BLOCKLIST_SEEDED_KEY_PREFIX}:${actorHex}`;

  try {
    if (seeded) {
      localStorage.setItem(key, "1");
    } else {
      localStorage.removeItem(key);
    }
  } catch (error) {
    userLogger.warn(
      `[UserBlockList] Failed to persist seeded baseline state for ${actorHex}:`,
      error,
    );
  }
}

function readRemovalSet(actorHex) {
  const empty = new Set();
  if (typeof actorHex !== "string" || !actorHex) {
    return empty;
  }

  if (typeof localStorage === "undefined") {
    return empty;
  }

  const key = `${BLOCKLIST_REMOVALS_KEY_PREFIX}:${actorHex}`;

  try {
    const raw = localStorage.getItem(key);
    if (raw === null) {
      return empty;
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return empty;
    }

    const normalized = parsed
      .map((entry) => (typeof entry === "string" ? entry.trim().toLowerCase() : ""))
      .filter((entry) => /^[0-9a-f]{64}$/.test(entry));

    return new Set(normalized);
  } catch (error) {
    userLogger.warn(
      `[UserBlockList] Failed to read seed removal state for ${actorHex}:`,
      error,
    );
    return empty;
  }
}

function writeRemovalSet(actorHex, removals) {
  if (typeof actorHex !== "string" || !actorHex) {
    return;
  }

  if (typeof localStorage === "undefined") {
    return;
  }

  const key = `${BLOCKLIST_REMOVALS_KEY_PREFIX}:${actorHex}`;

  try {
    if (!removals || !removals.size) {
      localStorage.removeItem(key);
      return;
    }

    localStorage.setItem(key, JSON.stringify(Array.from(removals)));
  } catch (error) {
    userLogger.warn(
      `[UserBlockList] Failed to persist seed removal state for ${actorHex}:`,
      error,
    );
  }
}

function normalizeHex(pubkey) {
  if (typeof pubkey !== "string") {
    return null;
  }

  const trimmed = pubkey.trim();
  if (!trimmed) {
    return null;
  }

  if (/^[0-9a-f]{64}$/i.test(trimmed)) {
    return trimmed.toLowerCase();
  }

  const decoded = decodeNpubToHex(trimmed);
  if (decoded) {
    return decoded;
  }

  return null;
}

class UserBlockListManager {
  constructor() {
    this.blockedPubkeys = new Set();
    this.blockEventId = null;
    this.blockEventCreatedAt = null;
    this.lastPublishedCreatedAt = null;
    this.loaded = false;
    this.emitter = new TinyEventEmitter();
    this.seedStateCache = new Map();
  }

  reset() {
    this.blockedPubkeys.clear();
    this.blockEventId = null;
    this.blockEventCreatedAt = null;
    this.lastPublishedCreatedAt = null;
    this.loaded = false;
  }

  on(eventName, handler) {
    return this.emitter.on(eventName, handler);
  }

  getBlockedPubkeys() {
    return Array.from(this.blockedPubkeys);
  }

  isBlocked(pubkey) {
    const normalized = normalizeHex(pubkey);
    if (!normalized) {
      return false;
    }
    return this.blockedPubkeys.has(normalized);
  }

  async ensureLoaded(userPubkey) {
    if (this.loaded) {
      return;
    }

    const normalized = normalizeHex(userPubkey);
    if (!normalized) {
      return;
    }

    await this.loadBlocks(normalized);
  }

  async loadBlocks(userPubkey, options = {}) {
    const normalized = normalizeHex(userPubkey);
    if (!normalized) {
      this.reset();
      this.loaded = true;
      return;
    }

    const since = Number.isFinite(options?.since)
      ? Math.max(0, Math.floor(options.since))
      : null;
    const statusCallback =
      typeof options?.statusCallback === "function" ? options.statusCallback : null;

    const emitStatus = (detail) => {
      if (!detail || typeof detail !== "object") {
        return;
      }

      try {
        statusCallback?.(detail);
      } catch (callbackError) {
        userLogger.warn(
          "[UserBlockList] statusCallback threw while emitting status",
          callbackError,
        );
      }

      try {
        this.emitter.emit(USER_BLOCK_EVENTS.STATUS, detail);
      } catch (emitterError) {
        userLogger.warn(
          "[UserBlockList] Failed to dispatch status event",
          emitterError,
        );
      }
    };

    emitStatus({ status: "loading", relays: Array.from(nostrClient.relays || []) });

    const applyBlockedPubkeys = (nextValues, meta = {}) => {
      const nextSet = new Set(Array.isArray(nextValues) ? nextValues : []);
      this.blockedPubkeys = nextSet;

      this.emitter.emit(USER_BLOCK_EVENTS.CHANGE, {
        action: "sync",
        blockedPubkeys: Array.from(this.blockedPubkeys),
        ...meta,
      });
    };

    const activeSigner = getActiveSigner();
    const signerDecryptor =
      activeSigner && typeof activeSigner.nip04Decrypt === "function"
        ? activeSigner.nip04Decrypt
        : null;

    let extensionDecryptor =
      typeof window?.nostr?.nip04?.decrypt === "function"
        ? (pubkey, payload) => window.nostr.nip04.decrypt(pubkey, payload)
        : null;

    if (!signerDecryptor && !extensionDecryptor) {
      const permissionResult = await requestDefaultExtensionPermissions();
      if (!permissionResult.ok) {
        userLogger.warn(
          "[UserBlockList] Unable to load block list via extension decryptor; permissions denied.",
          permissionResult.error,
        );
        this.reset();
        this.loaded = true;
        const error =
          permissionResult.error instanceof Error
            ? permissionResult.error
            : new Error(
                "Extension permissions are required to use the browser decryptor.",
              );
        emitStatus({ status: "error", error, decryptor: "extension" });
        emitStatus({ status: "settled" });
        return;
      }

      extensionDecryptor =
        typeof window?.nostr?.nip04?.decrypt === "function"
          ? (pubkey, payload) => window.nostr.nip04.decrypt(pubkey, payload)
          : null;
    }

    if (!signerDecryptor && !extensionDecryptor) {
      userLogger.warn(
        "[UserBlockList] No nip04 decryptor available; treating block list as empty.",
      );
      this.reset();
      this.loaded = true;
      const error = new Error(
        "No NIP-04 decryptor is available to load the block list.",
      );
      emitStatus({ status: "error", error, decryptor: "unavailable" });
      emitStatus({ status: "settled" });
      return;
    }

    try {
      const filter = {
        kinds: [30002],
        authors: [normalized],
        "#d": [BLOCK_LIST_IDENTIFIER],
        limit: 1,
      };

      if (since !== null) {
        filter.since = since;
      }

      const relays = Array.isArray(nostrClient.relays)
        ? nostrClient.relays.filter((relay) => typeof relay === "string" && relay)
        : [];

      if (!relays.length) {
        this.blockedPubkeys.clear();
        this.blockEventId = null;
        this.blockEventCreatedAt = null;
        this.loaded = true;
        emitStatus({ status: "applied-empty" });
        emitStatus({ status: "settled" });
        return;
      }

      const fastRelays = relays.slice(0, FAST_BLOCKLIST_RELAY_LIMIT);
      const backgroundRelays = relays.slice(fastRelays.length);

      const fetchFromRelay = (relayUrl, timeoutMs, requireEvent) =>
        new Promise((resolve, reject) => {
          let settled = false;
          const pool = nostrClient?.pool;
          if (!pool || typeof pool.list !== "function") {
            const poolError = new Error(
              "nostrClient.pool.list is unavailable; cannot query block list.",
            );
            poolError.code = "pool-unavailable";
            poolError.relay = relayUrl;
            reject(poolError);
            return;
          }
          const timer = setTimeout(() => {
            if (settled) {
              return;
            }
            settled = true;
            const timeoutError = new Error(
              `Timed out fetching block list from ${relayUrl} after ${timeoutMs}ms`
            );
            timeoutError.code = "timeout";
            timeoutError.relay = relayUrl;
            timeoutError.timeoutMs = timeoutMs;
            reject(timeoutError);
          }, timeoutMs);

          Promise.resolve()
            .then(() => pool.list([relayUrl], [filter]))
            .then((result) => {
              if (settled) {
                return;
              }
              settled = true;
              clearTimeout(timer);
              const events = Array.isArray(result)
                ? result.filter((event) => event && event.pubkey === normalized)
                : [];
              if (requireEvent && !events.length) {
                const emptyError = new Error(
                  `No block list events returned from ${relayUrl}`
                );
                emptyError.code = "empty";
                emptyError.relay = relayUrl;
                reject(emptyError);
                return;
              }
              resolve({ relayUrl, events });
            })
            .catch((error) => {
              if (settled) {
                return;
              }
              settled = true;
              clearTimeout(timer);
              const wrapped =
                error instanceof Error ? error : new Error(String(error));
              wrapped.relay = relayUrl;
              reject(wrapped);
            });
        });

      const fastPromises = fastRelays.map((relayUrl) =>
        fetchFromRelay(relayUrl, FAST_BLOCKLIST_TIMEOUT_MS, true)
      );
      const backgroundPromises = backgroundRelays.map((relayUrl) =>
        fetchFromRelay(relayUrl, BACKGROUND_BLOCKLIST_TIMEOUT_MS, false)
      );

      const applyEvents = async (
        events,
        { skipIfEmpty = false, source = "fast" } = {},
      ) => {
        if (!Array.isArray(events) || !events.length) {
          if (skipIfEmpty) {
            return;
          }
          if (this.lastPublishedCreatedAt !== null || this.blockEventCreatedAt !== null) {
            emitStatus({ status: "stale", reason: "empty-result", source });
            return;
          }
          this.blockEventId = null;
          this.blockEventCreatedAt = null;
          applyBlockedPubkeys([], { source, reason: "empty-result" });
          emitStatus({ status: "applied-empty", source });
          return;
        }

        const sorted = events
          .filter((event) => event && event.pubkey === normalized)
          .sort((a, b) => (b?.created_at || 0) - (a?.created_at || 0));

        if (!sorted.length) {
          if (skipIfEmpty) {
            return;
          }
          if (this.lastPublishedCreatedAt !== null || this.blockEventCreatedAt !== null) {
            emitStatus({ status: "stale", reason: "empty-result", source });
            return;
          }
          this.blockEventId = null;
          this.blockEventCreatedAt = null;
          applyBlockedPubkeys([], { source, reason: "empty-result" });
          emitStatus({ status: "applied-empty", source });
          return;
        }

        const newest = sorted[0];
        const newestCreatedAt = Number.isFinite(newest?.created_at)
          ? newest.created_at
          : 0;
        const guardCreatedAt = Math.max(
          this.blockEventCreatedAt ?? 0,
          this.lastPublishedCreatedAt ?? 0,
        );

        if (newestCreatedAt < guardCreatedAt) {
          emitStatus({ status: "stale", event: newest, guardCreatedAt, source });
          return;
        }

        if (
          newestCreatedAt === guardCreatedAt &&
          this.blockEventId &&
          newest?.id &&
          newest.id !== this.blockEventId
        ) {
          emitStatus({ status: "stale", event: newest, guardCreatedAt, source });
          return;
        }

        if (newest?.id && newest.id === this.blockEventId) {
          this.blockEventCreatedAt = Number.isFinite(newestCreatedAt)
            ? newestCreatedAt
            : this.blockEventCreatedAt;
          emitStatus({ status: "confirmed", event: newest, source });
          return;
        }

        this.blockEventId = newest?.id || null;
        this.blockEventCreatedAt = Number.isFinite(newestCreatedAt)
          ? newestCreatedAt
          : null;

        if (!newest?.content) {
          applyBlockedPubkeys([], { source, reason: "empty-event", event: newest });
          emitStatus({ status: "applied-empty", event: newest, source });
          return;
        }

        let decrypted = "";
        const decryptPath = signerDecryptor
          ? "active-signer"
          : extensionDecryptor
            ? "extension"
            : "unavailable";
        try {
          if (signerDecryptor) {
            decrypted = await signerDecryptor(normalized, newest.content);
          } else if (extensionDecryptor) {
            decrypted = await extensionDecryptor(normalized, newest.content);
          } else {
            throw new Error("nip04-unavailable");
          }
        } catch (err) {
          userLogger.error(
            `[UserBlockList] Failed to decrypt block list via ${decryptPath}:`,
            err,
          );
          applyBlockedPubkeys([], {
            source,
            reason: "decrypt-error",
            event: newest,
            error: err,
            decryptor: decryptPath,
          });
          emitStatus({
            status: "error",
            event: newest,
            error: err,
            source,
            decryptor: decryptPath,
          });
          return;
        }

        try {
          const parsed = JSON.parse(decrypted);
          const list = Array.isArray(parsed?.blockedPubkeys)
            ? parsed.blockedPubkeys
            : [];
          const sanitized = list
            .map((entry) => normalizeHex(entry))
            .filter((candidate) => {
              if (!candidate) {
                return false;
              }
              if (candidate === normalized) {
                return false;
              }
              return true;
            });
          applyBlockedPubkeys(sanitized, {
            source,
            reason: "applied",
            event: newest,
          });
          emitStatus({
            status: "applied",
            event: newest,
            blockedPubkeys: Array.from(this.blockedPubkeys),
            source,
          });
        } catch (err) {
          userLogger.error("[UserBlockList] Failed to parse block list:", err);
          applyBlockedPubkeys([], {
            source,
            reason: "parse-error",
            event: newest,
            error: err,
          });
          emitStatus({ status: "error", event: newest, error: err, source });
        }
      };

      const background = Promise.allSettled([
        ...fastPromises,
        ...backgroundPromises,
      ])
        .then(async (outcomes) => {
          const aggregated = [];
          for (const outcome of outcomes) {
            if (outcome.status === "fulfilled") {
              const events = Array.isArray(outcome.value?.events)
                ? outcome.value.events
                : [];
              if (events.length) {
                aggregated.push(...events);
              }
            } else {
              const reason = outcome.reason;
              if (reason?.code === "timeout") {
                userLogger.warn(
                  `[UserBlockList] Relay ${reason.relay} timed out while loading block list (${reason.timeoutMs}ms)`
                );
              } else {
                const relay = reason?.relay || reason?.relayUrl;
                userLogger.error(
                  `[UserBlockList] Relay error at ${relay}:`,
                  reason?.error ?? reason
                );
              }
            }
          }

          if (!aggregated.length) {
            return { foundEvents: false };
          }

          await applyEvents(aggregated, { skipIfEmpty: true, source: "background" });
          return { foundEvents: true };
        })
        .catch((error) => {
          userLogger.error("[UserBlockList] background block list refresh failed:", error);
          return { foundEvents: false, error };
        });

      let fastResult = null;
      if (fastPromises.length) {
        try {
          fastResult = await Promise.any(fastPromises);
        } catch (error) {
          if (error instanceof AggregateError) {
            error.errors?.forEach((err) => {
              if (err?.code === "timeout") {
                userLogger.warn(
                  `[UserBlockList] Relay ${err.relay} timed out while loading block list (${err.timeoutMs}ms)`
                );
              }
            });
          } else {
            userLogger.error("[UserBlockList] Fast block list fetch failed:", error);
          }
        }
      }

      if (fastResult?.events?.length) {
        await applyEvents(fastResult.events, { source: "fast" });
        background.catch(() => {});
        return;
      }

      if (backgroundRelays.length || fastPromises.length) {
        emitStatus({
          status: "awaiting-background",
          relays: backgroundRelays.length ? backgroundRelays : fastRelays,
        });
      }

      const backgroundOutcome = await background;

      if (backgroundOutcome?.foundEvents) {
        return;
      }

      if (backgroundOutcome?.error) {
        emitStatus({ status: "error", error: backgroundOutcome.error, source: "background" });
        return;
      }

      await applyEvents([], { source: "background" });
    } catch (error) {
      userLogger.error("[UserBlockList] loadBlocks failed:", error);
      applyBlockedPubkeys([], { source: "fast", reason: "load-error", error });
      this.blockEventId = null;
      this.blockEventCreatedAt = null;
      emitStatus({ status: "error", error });
    } finally {
      this.loaded = true;
      emitStatus({ status: "settled" });
    }
  }

  _getSeedState(actorHex) {
    const normalized = normalizeHex(actorHex);
    if (!normalized) {
      return { seeded: false, removals: new Set() };
    }

    if (this.seedStateCache.has(normalized)) {
      return this.seedStateCache.get(normalized);
    }

    const seeded = readSeededFlag(normalized);
    const removals = readRemovalSet(normalized);
    const state = { seeded, removals };
    this.seedStateCache.set(normalized, state);
    return state;
  }

  _setSeeded(actorHex, seeded) {
    const normalized = normalizeHex(actorHex);
    if (!normalized) {
      return;
    }

    const state = this._getSeedState(normalized);
    state.seeded = Boolean(seeded);
    writeSeededFlag(normalized, state.seeded);
  }

  _addSeedRemoval(actorHex, targetHex) {
    const normalizedActor = normalizeHex(actorHex);
    const normalizedTarget = normalizeHex(targetHex);
    if (!normalizedActor || !normalizedTarget) {
      return;
    }

    const state = this._getSeedState(normalizedActor);
    if (!state.removals.has(normalizedTarget)) {
      state.removals.add(normalizedTarget);
      writeRemovalSet(normalizedActor, state.removals);
    }
  }

  _clearSeedRemoval(actorHex, targetHex) {
    const normalizedActor = normalizeHex(actorHex);
    const normalizedTarget = normalizeHex(targetHex);
    if (!normalizedActor || !normalizedTarget) {
      return;
    }

    const state = this._getSeedState(normalizedActor);
    if (state.removals.delete(normalizedTarget)) {
      writeRemovalSet(normalizedActor, state.removals);
    }
  }

  async seedWithNpubs(userPubkey, candidateNpubs = []) {
    const actorHex = normalizeHex(userPubkey);
    if (!actorHex) {
      return { ok: false, seeded: false, reason: "invalid-user" };
    }

    await this.ensureLoaded(actorHex);

    const state = this._getSeedState(actorHex);
    if (state.seeded) {
      return { ok: true, seeded: false, reason: "already-seeded" };
    }

    if (this.blockedPubkeys.size > 0) {
      return { ok: true, seeded: false, reason: "non-empty" };
    }

    const removals = state.removals;
    const additions = new Set();

    const candidates = Array.isArray(candidateNpubs) ? candidateNpubs : [];
    for (const candidate of candidates) {
      const candidateHex = normalizeHex(candidate);
      if (!candidateHex) {
        continue;
      }
      if (candidateHex === actorHex) {
        continue;
      }
      if (removals.has(candidateHex)) {
        continue;
      }
      additions.add(candidateHex);
    }

    if (!additions.size) {
      return { ok: true, seeded: false, reason: "no-candidates" };
    }

    const snapshot = new Set(this.blockedPubkeys);
    additions.forEach((hex) => this.blockedPubkeys.add(hex));

    try {
      await this.publishBlockList(actorHex);
    } catch (error) {
      this.blockedPubkeys = snapshot;
      throw error;
    }

    this._setSeeded(actorHex, true);
    additions.forEach((hex) => this._clearSeedRemoval(actorHex, hex));

    try {
      this.emitter.emit(USER_BLOCK_EVENTS.CHANGE, {
        action: "seed",
        actorPubkey: actorHex,
        blockedPubkeys: Array.from(this.blockedPubkeys),
        addedPubkeys: Array.from(additions),
      });
    } catch (error) {
      userLogger.warn("[UserBlockList] Failed to emit seed change event:", error);
    }

    return { ok: true, seeded: true, addedPubkeys: Array.from(additions) };
  }

  async addBlock(targetPubkey, userPubkey) {
    const actorHex = normalizeHex(userPubkey);
    if (!actorHex) {
      throw new Error("Invalid user pubkey.");
    }

    const targetHex = normalizeHex(targetPubkey);
    if (!targetHex) {
      const err = new Error("Invalid target pubkey.");
      err.code = "invalid";
      throw err;
    }

    if (actorHex === targetHex) {
      const err = new Error("Cannot block yourself.");
      err.code = "self";
      throw err;
    }

    await this.ensureLoaded(actorHex);

    if (this.blockedPubkeys.has(targetHex)) {
      return { ok: true, already: true };
    }

    const snapshot = new Set(this.blockedPubkeys);
    this.blockedPubkeys.add(targetHex);

    try {
      await this.publishBlockList(actorHex);
      this.emitter.emit(USER_BLOCK_EVENTS.CHANGE, {
        action: "block",
        targetPubkey: targetHex,
        actorPubkey: actorHex,
      });
      this._clearSeedRemoval(actorHex, targetHex);
      return { ok: true };
    } catch (err) {
      this.blockedPubkeys = snapshot;
      throw err;
    }
  }

  async removeBlock(targetPubkey, userPubkey) {
    const actorHex = normalizeHex(userPubkey);
    if (!actorHex) {
      throw new Error("Invalid user pubkey.");
    }

    const targetHex = normalizeHex(targetPubkey);
    if (!targetHex) {
      return { ok: true, already: true };
    }

    await this.ensureLoaded(actorHex);

    if (!this.blockedPubkeys.has(targetHex)) {
      return { ok: true, already: true };
    }

    const snapshot = new Set(this.blockedPubkeys);
    this.blockedPubkeys.delete(targetHex);

    try {
      await this.publishBlockList(actorHex);
      this.emitter.emit(USER_BLOCK_EVENTS.CHANGE, {
        action: "unblock",
        targetPubkey: targetHex,
        actorPubkey: actorHex,
      });
      this._addSeedRemoval(actorHex, targetHex);
      return { ok: true };
    } catch (err) {
      this.blockedPubkeys = snapshot;
      throw err;
    }
  }

  async publishBlockList(userPubkey, options = {}) {
    const onStatus =
      options && typeof options.onStatus === "function" ? options.onStatus : null;

    onStatus?.({ status: "publishing" });

    const signer = getActiveSigner();
    if (!signer) {
      const err = new Error(
        "An active signer is required to update the block list."
      );
      err.code = "signer-missing";
      throw err;
    }

    if (signer.type === "extension") {
      const permissionResult = await requestDefaultExtensionPermissions();
      if (!permissionResult.ok) {
        userLogger.warn(
          "[UserBlockList] Signer permissions denied while updating the block list.",
          permissionResult.error,
        );
        const err = new Error(
          "The active signer must allow encryption and signing before updating the block list.",
        );
        err.code = "extension-permission-denied";
        err.cause = permissionResult.error;
        throw err;
      }
    }

    if (typeof signer.nip04Encrypt !== "function") {
      const err = new Error(
        "NIP-04 encryption is required to update the block list."
      );
      err.code = "nip04-missing";
      throw err;
    }

    if (typeof signer.signEvent !== "function") {
      const err = new Error("Active signer missing signEvent support.");
      err.code = "sign-event-missing";
      throw err;
    }

    const normalized = normalizeHex(userPubkey);
    if (!normalized) {
      throw new Error("Invalid user pubkey.");
    }

    const payload = {
      blockedPubkeys: Array.from(this.blockedPubkeys).filter(
        (candidate) => candidate && candidate !== normalized
      ),
    };
    const plaintext = JSON.stringify(payload);

    let cipherText = "";
    try {
      cipherText = await signer.nip04Encrypt(normalized, plaintext);
    } catch (error) {
      const err = new Error("Failed to encrypt block list.");
      err.code = "nip04-missing";
      throw err;
    }

    const event = buildBlockListEvent({
      pubkey: normalized,
      created_at: Math.floor(Date.now() / 1000),
      content: cipherText,
    });

    const signedEvent = await signer.signEvent(event);

    const publishResults = await publishEventToRelays(
      nostrClient.pool,
      nostrClient.relays,
      signedEvent
    );

    let publishSummary;
    try {
      publishSummary = assertAnyRelayAccepted(publishResults, {
        context: "block list",
      });
    } catch (publishError) {
      if (publishError?.relayFailures?.length) {
        publishError.relayFailures.forEach(
          ({ url, error: relayError, reason }) => {
            userLogger.error(
              `[UserBlockList] Block list rejected by ${url}: ${reason}`,
              relayError || reason
            );
          }
        );
      }
      throw publishError;
    }

    if (publishSummary.failed.length) {
      publishSummary.failed.forEach(({ url, error: relayError }) => {
        const reason =
          relayError instanceof Error
            ? relayError.message
            : relayError
            ? String(relayError)
            : "publish failed";
        userLogger.warn(
          `[UserBlockList] Block list not accepted by ${url}: ${reason}`,
          relayError
        );
      });
    }

    this.blockEventId = signedEvent.id;
    this.blockEventCreatedAt = Number.isFinite(signedEvent?.created_at)
      ? signedEvent.created_at
      : event.created_at;
    this.lastPublishedCreatedAt = this.blockEventCreatedAt;
    onStatus?.({ status: "published", event: signedEvent });

    try {
      await this.loadBlocks(normalized, {
        since: this.lastPublishedCreatedAt ?? undefined,
        statusCallback: (detail) => {
          if (!onStatus) {
            return;
          }
          onStatus({ status: "relay", detail });
        },
      });
    } catch (refreshError) {
      onStatus?.({ status: "relay-error", error: refreshError });
    }

    return signedEvent;
  }
}

export const userBlocks = new UserBlockListManager();

if (typeof window !== "undefined") {
  window.userBlocks = userBlocks;
}
