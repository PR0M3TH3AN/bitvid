// js/subscriptions.js
import {
  getActiveSigner,
  nostrClient,
  requestDefaultExtensionPermissions,
} from "./nostrClientFacade.js";
import { convertEventToVideo as sharedConvertEventToVideo } from "./nostr/index.js";
import { normalizeNostrPubkey } from "./nostr/nip46Client.js";
import {
  listVideoViewEvents,
  subscribeVideoViewEvents,
} from "./nostrViewEventsFacade.js";
import { DEFAULT_RELAY_URLS } from "./nostr/toolkit.js";
import {
  buildSubscriptionListEvent,
  SUBSCRIPTION_LIST_IDENTIFIER,
  getNostrEventSchema,
  NOTE_TYPES,
} from "./nostrEventSchemas.js";
import { CACHE_POLICIES, STORAGE_TIERS } from "./nostr/cachePolicies.js";
import { getSidebarLoadingMarkup } from "./sidebarLoading.js";
import {
  publishEventToRelays,
  assertAnyRelayAccepted
} from "./nostrPublish.js";
import { getApplication } from "./applicationContext.js";
import { VideoListView } from "./ui/views/VideoListView.js";
import { ALLOW_NSFW_CONTENT } from "./config.js";
import { devLogger, userLogger } from "./utils/logger.js";
import moderationService from "./services/moderationService.js";
import nostrService from "./services/nostrService.js";
import { profileCache } from "./state/profileCache.js";

const SUBSCRIPTION_SET_KIND =
  getNostrEventSchema(NOTE_TYPES.SUBSCRIPTION_LIST)?.kind ?? 30000;

function normalizeHexPubkey(value) {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim();
  return trimmed ? trimmed.toLowerCase() : "";
}

function normalizeEncryptionToken(value) {
  if (typeof value !== "string") {
    return "";
  }
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function extractEncryptionHints(event) {
  if (!event || typeof event !== "object") {
    return [];
  }

  const tags = Array.isArray(event.tags) ? event.tags : [];
  const hints = [];

  const pushUnique = (scheme) => {
    if (!scheme || hints.includes(scheme)) {
      return;
    }
    hints.push(scheme);
  };

  for (const tag of tags) {
    if (!Array.isArray(tag) || tag.length < 2) {
      continue;
    }
    const label = typeof tag[0] === "string" ? tag[0].trim().toLowerCase() : "";
    if (label !== "encrypted" && label !== "encryption") {
      continue;
    }
    const rawValue = typeof tag[1] === "string" ? tag[1] : "";
    if (!rawValue) {
      continue;
    }
    const parts = rawValue
      .split(/[\s,]+/)
      .map((part) => normalizeEncryptionToken(part))
      .filter(Boolean);
    for (const part of parts) {
      if (part === "nip44v2" || part === "nip44v02") {
        pushUnique("nip44_v2");
        continue;
      }
      if (part === "nip44") {
        pushUnique("nip44");
        continue;
      }
      if (part === "nip04" || part === "nip4") {
        pushUnique("nip04");
      }
    }
  }

  return hints;
}

function determineDecryptionOrder(event, availableSchemes) {
  const available = Array.isArray(availableSchemes) ? availableSchemes : [];
  const availableSet = new Set(available);
  const prioritized = [];

  const hints = extractEncryptionHints(event);
  const aliasMap = {
    nip04: ["nip04"],
    nip44: ["nip44", "nip44_v2"],
    nip44_v2: ["nip44_v2", "nip44"],
  };

  for (const hint of hints) {
    const candidates = Array.isArray(aliasMap[hint]) ? aliasMap[hint] : [hint];
    for (const candidate of candidates) {
      if (availableSet.has(candidate) && !prioritized.includes(candidate)) {
        prioritized.push(candidate);
        break;
      }
    }
  }

  for (const fallback of ["nip44_v2", "nip44", "nip04"]) {
    if (availableSet.has(fallback) && !prioritized.includes(fallback)) {
      prioritized.push(fallback);
    }
  }

  return prioritized.length ? prioritized : available;
}

function serializeSubscriptionTagMatrix(values) {
  const tags = [];
  const seen = new Set();
  if (!values) {
    return JSON.stringify(tags);
  }
  const iterable = Array.isArray(values)
    ? values
    : values instanceof Set
    ? Array.from(values)
    : [];
  for (const candidate of iterable) {
    const normalized = normalizeHexPubkey(candidate);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    tags.push(["p", normalized]);
  }
  return JSON.stringify(tags);
}

function parseSubscriptionPlaintext(plaintext) {
  if (typeof plaintext !== "string" || !plaintext) {
    return [];
  }

  let parsed;
  try {
    parsed = JSON.parse(plaintext);
  } catch (error) {
    devLogger.warn(
      "[SubscriptionsManager] Failed to parse subscription ciphertext as JSON; treating as empty.",
      error,
    );
    return [];
  }

  if (Array.isArray(parsed)) {
    const collected = [];
    const seen = new Set();
    for (const entry of parsed) {
      if (!Array.isArray(entry) || entry.length < 2) {
        continue;
      }
      const marker = typeof entry[0] === "string" ? entry[0].trim().toLowerCase() : "";
      if (marker !== "p") {
        continue;
      }
      const normalized = normalizeHexPubkey(entry[1]);
      if (!normalized || seen.has(normalized)) {
        continue;
      }
      seen.add(normalized);
      collected.push(normalized);
    }
    return collected;
  }

  if (parsed && typeof parsed === "object") {
    const tagArray = Array.isArray(parsed.tags) ? parsed.tags : [];
    if (tagArray.length) {
      try {
        return parseSubscriptionPlaintext(JSON.stringify(tagArray));
      } catch {
        // fall through to legacy handling
      }
    }

    const legacy = Array.isArray(parsed.subPubkeys) ? parsed.subPubkeys : [];
    return legacy.map((value) => normalizeHexPubkey(value)).filter(Boolean);
  }

  return [];
}

const getApp = () => getApplication();

const listVideoViewEventsApi = (pointer, options) =>
  listVideoViewEvents(nostrClient, pointer, options);
const subscribeVideoViewEventsApi = (pointer, options) =>
  subscribeVideoViewEvents(nostrClient, pointer, options);

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
          `[SubscriptionsManager] listener for "${eventName}" threw an error`,
          error,
        );
      }
    }
  }
}

/**
 * Manages the user's subscription list (kind=30000 follow set) *privately*,
 * using encrypted NIP-51 tag arrays (NIP-04/NIP-44) for the content field.
 * Also handles fetching and rendering subscribed channels' videos
 * in the same card style as your home page.
 */
class SubscriptionsManager {
  constructor() {
    this.subscribedPubkeys = new Set();
    this.subsEventId = null;
    this.currentUserPubkey = null;
    this.loaded = false;
    this.loadingPromise = null;
    this.subscriptionListView = null;
    this.lastRunOptions = null;
    this.lastResult = null;
    this.lastContainerId = null;
    this.unsubscribeFromNostrUpdates = null;
    this.pendingRefreshPromise = null;
    this.scheduledRefreshDetail = null;
    this.isRunningFeed = false;
    this.hasRenderedOnce = false;
    this.emitter = new TinyEventEmitter();
    this.ensureNostrServiceListener();

    profileCache.subscribe((event, detail) => {
      if (event === "profileChanged") {
        this.reset();
        // Optionally reload immediately if we have a pubkey?
        // Usually UI triggers reload via showSubscriptionVideos
      } else if (event === "runtimeCleared" && detail.pubkey === this.currentUserPubkey) {
        this.reset();
        if (this.currentUserPubkey) {
          this.loadSubscriptions(this.currentUserPubkey);
        }
      }
    });
  }

  /**
   * Decrypt the subscription list from kind=30000 (d="subscriptions").
   */
  async loadSubscriptions(userPubkey) {
    if (!userPubkey) {
      userLogger.warn("[SubscriptionsManager] No pubkey => cannot load subs.");
      return;
    }

    const normalizedUserPubkey = normalizeHexPubkey(userPubkey) || userPubkey;

    // 1. Attempt to load from cache first
    const cached = profileCache.getProfileData(normalizedUserPubkey, "subscriptions");
    if (Array.isArray(cached)) {
      devLogger.log("[SubscriptionsManager] Loaded subscriptions from cache.");
      this.subscribedPubkeys = new Set(cached);
      this.currentUserPubkey = normalizedUserPubkey;
      this.loaded = true;

      // Trigger background update
      this.updateFromRelays(userPubkey).catch((err) => {
        devLogger.warn("[SubscriptionsManager] Background update failed:", err);
      });
      return;
    }

    // 2. If no cache, must wait for relays
    await this.updateFromRelays(userPubkey);
  }

  saveToCache(userPubkey) {
    // We assume userPubkey matches active profile, enforced by profileCache
    profileCache.set("subscriptions", Array.from(this.subscribedPubkeys));
  }

  on(eventName, handler) {
    return this.emitter.on(eventName, handler);
  }

  async updateFromRelays(userPubkey) {
    if (!userPubkey) return;

    try {
      const normalizedUserPubkey = normalizeHexPubkey(userPubkey) || userPubkey;

      const relaySet = new Set();
      const addRelayCandidates = (candidates) => {
        if (!candidates) {
          return;
        }
        const iterable = Array.isArray(candidates)
          ? candidates
          : candidates instanceof Set
          ? Array.from(candidates)
          : [];
        for (const candidate of iterable) {
          if (typeof candidate !== "string") {
            continue;
          }
          const trimmed = candidate.trim();
          if (trimmed) {
            relaySet.add(trimmed);
          }
        }
      };

      addRelayCandidates(nostrClient.relays);
      if (!relaySet.size) {
        addRelayCandidates(nostrClient.readRelays);
      }
      if (!relaySet.size) {
        addRelayCandidates(DEFAULT_RELAY_URLS);
      }

      const relayUrls = Array.from(relaySet);
      if (!relayUrls.length) {
        devLogger.warn(
          "[SubscriptionsManager] No relay URLs available while loading subscriptions.",
        );
        return;
      }

      // Use incremental fetch helper
      let events = await nostrClient.fetchListIncrementally({
        kind: SUBSCRIPTION_SET_KIND,
        pubkey: normalizedUserPubkey,
        dTag: SUBSCRIPTION_LIST_IDENTIFIER,
        relayUrls
      });

      // Also check session actor if different?
      // The original code checked both userPubkey and sessionActor.pubkey.
      // fetchListIncrementally takes a single pubkey.
      // If we want to check session actor too, we need another call.
      // However, usually the subscription list belongs to the logged in user (userPubkey).
      // The session actor logic in original code:
      // const sessionActorPubkey = normalizeHexPubkey(nostrClient?.sessionActor?.pubkey);
      // ... authors: [normalizedUserPubkey, sessionActorPubkey]
      // Since fetchListIncrementally filters by author=pubkey, we only query for normalizedUserPubkey here.
      // If session actor support is critical for some delegation case, it needs a separate fetch.
      // Assuming userPubkey is the primary target for subscriptions.

      if (!events.length) {
        if (!this.loaded) {
          // If we have nothing loaded and found nothing, maybe user has no list.
          // But we shouldn't wipe blindly if incremental fetch just returned no *new* events.
          // Wait, fetchListIncrementally returns *events found*.
          // If it performed incremental fetch and found nothing, it returns [].
          // If it performed full fetch and found nothing, it returns [].

          // We need to differentiate "no updates" vs "empty list".
          // If we have cached data, we keep it.
          // If we have NO cached data (this.loaded = false), and we get [], we assume empty list.
          this.subscribedPubkeys.clear();
          this.subsEventId = null;
          this.loaded = true;
        } else {
           // We have data loaded, and relays returned nothing.
           // This means no updates. We keep what we have.
           devLogger.log("[SubscriptionsManager] No updates from relays.");
        }
        return;
      }

      // Sort by created_at desc, pick newest
      events.sort((a, b) => b.created_at - a.created_at);
      const newest = events[0];

      // Check if newest is actually newer than what we have
      // If we loaded from cache, we might not have the event object, just the pubkeys.
      // But we don't store the event timestamp in cache currently?
      // profileCache only stores the array.
      // Wait, we don't persist the event ID or created_at in profileCache for subscriptions.
      // So we can't strictly compare timestamps against cache.
      // However, fetchListIncrementally already handles the "newer than last sync" logic per relay.
      // So any event returned here is effectively "new information" (or re-fetched full state).

      this.subsEventId = newest.id;

      const signer = getActiveSigner();
      const signerHasNip04 = typeof signer?.nip04Decrypt === "function";
      const signerHasNip44 = typeof signer?.nip44Decrypt === "function";
      const hints = extractEncryptionHints(newest);
      const requiresNip44 = hints.includes("nip44") || hints.includes("nip44_v2");
      const requiresNip04 =
        !hints.length || hints.includes("nip04") || !requiresNip44;

      let permissionResult = { ok: true };
      const signerCoversRequiredSchemes =
        (!requiresNip04 || signerHasNip04) && (!requiresNip44 || signerHasNip44);

      if (!signerCoversRequiredSchemes) {
        permissionResult = await requestDefaultExtensionPermissions();
      }

      if (!permissionResult.ok) {
        userLogger.warn(
          "[SubscriptionsManager] Extension permissions denied while loading subscriptions; treating list as empty.",
          permissionResult.error,
        );
        // Permission denied is definitive enough to stop trying to use this event
        if (!this.loaded) {
          this.subscribedPubkeys.clear();
          this.subsEventId = null;
          this.loaded = true;
        }
        return;
      }

      let decryptResult;
      try {
        const decryptPromise = this.decryptSubscriptionEvent(newest, userPubkey);
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error("Decryption timed out after 15s")),
            15000,
          ),
        );
        decryptResult = await Promise.race([decryptPromise, timeoutPromise]);
      } catch (error) {
        decryptResult = { ok: false, error };
      }

      if (!decryptResult.ok) {
        userLogger.error(
          "[SubscriptionsManager] Failed to decrypt subscription list:",
          decryptResult.error,
        );
        if (!this.loaded) {
          this.subscribedPubkeys.clear();
          this.subsEventId = null;
          this.loaded = true;
        }
        return;
      }

      const decryptedStr = decryptResult.plaintext;
      const normalized = parseSubscriptionPlaintext(decryptedStr);

      const newSet = new Set(normalized);
      const previousSet = this.subscribedPubkeys;

      // Update state
      this.subscribedPubkeys = newSet;
      this.currentUserPubkey = normalizedUserPubkey;
      this.loaded = true;

      // Update persistent cache
      this.saveToCache(normalizedUserPubkey);

      // Check if we need to refresh the feed
      let changed = newSet.size !== previousSet.size;
      if (!changed) {
        for (const key of newSet) {
          if (!previousSet.has(key)) {
            changed = true;
            break;
          }
        }
      }

      if (changed) {
        this.emitter.emit("change", {
          action: "sync",
          subscribedPubkeys: Array.from(this.subscribedPubkeys),
        });
        devLogger.log("[SubscriptionsManager] Subscription list updated from relays, refreshing feed.");
        this.refreshActiveFeed({ reason: "subscription-update-background" }).catch((error) => {
          userLogger.warn(
            "[SubscriptionsManager] Failed to refresh after background subscription update:",
            error
          );
        });
      }

    } catch (err) {
      userLogger.error("[SubscriptionsManager] Failed to update subs from relays:", err);
    }
  }

  reset() {
    this.subscribedPubkeys.clear();
    this.subsEventId = null;
    this.currentUserPubkey = null;
    this.loaded = false;
    this.lastRunOptions = null;
    this.lastResult = null;
    this.hasRenderedOnce = false;
    this.emitter.emit("change", { action: "reset", subscribedPubkeys: [] });
  }

  async ensureLoaded(actorHex) {
    devLogger.log("[SubscriptionsManager] ensureLoaded start", actorHex);
    const normalizedActor = normalizeHexPubkey(actorHex) || actorHex;
    if (!normalizedActor) {
      return;
    }

    if (this.loaded && this.currentUserPubkey === normalizedActor) {
      devLogger.log("[SubscriptionsManager] ensureLoaded already loaded");
      return;
    }

    if (this.loadingPromise) {
      try {
        devLogger.log("[SubscriptionsManager] ensureLoaded awaiting existing promise");
        await this.loadingPromise;
      } catch (error) {
        throw error;
      }
      return;
    }

    const loader = this.loadSubscriptions(normalizedActor);
    this.loadingPromise = loader;

    try {
      // Race against a timeout so the UI doesn't hang indefinitely if relays stall.
      const timeoutMs = 6000;
      await Promise.race([
        loader,
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error("Timeout loading subscriptions")),
            timeoutMs
          )
        ),
      ]);
      devLogger.log("[SubscriptionsManager] ensureLoaded success");
    } catch (error) {
      userLogger.warn("[SubscriptionsManager] ensureLoaded timed out or failed:", error);
    } finally {
      this.loadingPromise = null;
    }
  }

  isSubscribed(channelHex) {
    const normalized = normalizeHexPubkey(channelHex);
    if (!normalized) {
      return false;
    }
    return this.subscribedPubkeys.has(normalized);
  }

  async toggleChannel(channelHex, userPubkey) {
    if (!userPubkey) {
      throw new Error("No user pubkey => cannot toggleChannel.");
    }
    await this.ensureLoaded(userPubkey);
    const isSubscribed = this.isSubscribed(channelHex) === true;
    try {
      if (isSubscribed) {
        await this.removeChannel(channelHex, userPubkey);
      } else {
        await this.addChannel(channelHex, userPubkey);
      }
      return { ok: true, subscribed: !isSubscribed };
    } catch (error) {
      userLogger.error("[SubscriptionsManager] Failed to toggle subscription:", error);
      throw error;
    }
  }

  getSubscribedAuthors() {
    return Array.from(this.subscribedPubkeys);
  }

  async decryptSubscriptionEvent(event, userPubkey) {
    const ciphertext = typeof event?.content === "string" ? event.content : "";
    if (!ciphertext) {
      const error = new Error("Subscription event is missing ciphertext content.");
      error.code = "subscriptions-empty-ciphertext";
      return { ok: false, error };
    }

    const decryptors = new Map();
    const registerDecryptor = (scheme, handler) => {
      if (!scheme || typeof handler !== "function" || decryptors.has(scheme)) {
        return;
      }
      decryptors.set(scheme, handler);
    };

    let signer = getActiveSigner();
    if (!signer && typeof nostrClient?.ensureActiveSignerForPubkey === "function") {
      signer = await nostrClient.ensureActiveSignerForPubkey(userPubkey);
    }
    const signerHasNip04 = typeof signer?.nip04Decrypt === "function";
    const signerHasNip44 = typeof signer?.nip44Decrypt === "function";

    if (signerHasNip04) {
      registerDecryptor("nip04", (payload) => signer.nip04Decrypt(userPubkey, payload));
    }

    if (signerHasNip44) {
      registerDecryptor("nip44", (payload) => signer.nip44Decrypt(userPubkey, payload));
    }

    if (!decryptors.size) {
      const error = new Error(
        "No active signer or extension decryptors are available for subscriptions."
      );
      error.code = "nostr-extension-missing";
      return { ok: false, error };
    }

    const availableSchemes = Array.from(decryptors.keys());
    const order = determineDecryptionOrder(event, availableSchemes);
    const attemptErrors = [];

    for (const scheme of order) {
      const decryptFn = decryptors.get(scheme);
      if (!decryptFn) {
        continue;
      }
      try {
        const plaintext = await decryptFn(ciphertext);
        if (typeof plaintext !== "string") {
          const error = new Error("Decryption returned a non-string payload.");
          error.code = "subscriptions-invalid-plaintext";
          attemptErrors.push({ scheme, error });
          continue;
        }
        return { ok: true, plaintext, scheme };
      } catch (error) {
        attemptErrors.push({ scheme, error });
      }
    }

    const error = new Error("Failed to decrypt subscription list with available schemes.");
    error.code = "subscriptions-decrypt-failed";
    if (attemptErrors.length) {
      error.cause = attemptErrors;
    }
    return { ok: false, error, errors: attemptErrors };
  }

  async addChannel(channelHex, userPubkey) {
    const normalizedChannel = normalizeHexPubkey(channelHex);
    if (!userPubkey) {
      throw new Error("No user pubkey => cannot addChannel.");
    }
    await this.ensureLoaded(userPubkey);
    if (!normalizedChannel) {
      devLogger.warn("Attempted to subscribe to invalid pubkey", channelHex);
      return;
    }
    if (this.subscribedPubkeys.has(normalizedChannel)) {
      devLogger.log("Already subscribed to", channelHex);
      return;
    }
    this.subscribedPubkeys.add(normalizedChannel);
    this.saveToCache(userPubkey);
    this.emitter.emit("change", {
      action: "add",
      channel: normalizedChannel,
      subscribedPubkeys: Array.from(this.subscribedPubkeys),
    });
    await this.publishSubscriptionList(userPubkey);
    this.refreshActiveFeed({ reason: "subscription-update" }).catch((error) => {
      userLogger.warn(
        "[SubscriptionsManager] Failed to refresh after adding subscription:",
        error
      );
    });
  }

  async removeChannel(channelHex, userPubkey) {
    const normalizedChannel = normalizeHexPubkey(channelHex);
    if (!userPubkey) {
      throw new Error("No user pubkey => cannot removeChannel.");
    }
    await this.ensureLoaded(userPubkey);
    if (!normalizedChannel) {
      devLogger.warn("Attempted to remove invalid pubkey from subscriptions", channelHex);
      return;
    }
    if (!this.subscribedPubkeys.has(normalizedChannel)) {
      devLogger.log("Channel not found in subscription list:", channelHex);
      return;
    }
    this.subscribedPubkeys.delete(normalizedChannel);
    this.saveToCache(userPubkey);
    this.emitter.emit("change", {
      action: "remove",
      channel: normalizedChannel,
      subscribedPubkeys: Array.from(this.subscribedPubkeys),
    });
    await this.publishSubscriptionList(userPubkey);
    this.refreshActiveFeed({ reason: "subscription-update" }).catch((error) => {
      userLogger.warn(
        "[SubscriptionsManager] Failed to refresh after removing subscription:",
        error
      );
    });
  }

  /**
   * Encrypt (NIP-04) + publish the updated subscription set
   * as kind=30000 with ["d", "subscriptions"] to be replaceable.
   */
  async publishSubscriptionList(userPubkey) {
    if (!userPubkey) {
      throw new Error("No pubkey => cannot publish subscription list.");
    }

    let signer = getActiveSigner();
    if (!signer) {
      signer = await nostrClient.ensureActiveSignerForPubkey(userPubkey);
    }

    const canSign = typeof signer?.canSign === "function"
      ? signer.canSign()
      : typeof signer?.signEvent === "function";
    if (!canSign) {
      const error = new Error(
        "An active signer is required to update subscriptions."
      );
      error.code = "signer-missing";
      throw error;
    }

    if (signer.type === "extension") {
      const permissionResult = await requestDefaultExtensionPermissions();
      if (!permissionResult.ok) {
        userLogger.warn(
          "[SubscriptionsManager] Signer permissions denied while updating subscriptions.",
          permissionResult.error,
        );
        const error = new Error(
          "The active signer must allow encryption and signing before updating subscriptions.",
        );
        error.code = "extension-permission-denied";
        error.cause = permissionResult.error;
        throw error;
      }
    }

    if (typeof signer.signEvent !== "function") {
      const error = new Error("Active signer missing signEvent support.");
      error.code = "sign-event-missing";
      throw error;
    }

    const plainStr = serializeSubscriptionTagMatrix(this.subscribedPubkeys);

    const encryptors = [];
    const registerEncryptor = (scheme, handler) => {
      if (!scheme || typeof handler !== "function") {
        return;
      }
      encryptors.push({ scheme, handler });
    };

    if (typeof signer.nip44Encrypt === "function") {
      registerEncryptor("nip44_v2", (value) => signer.nip44Encrypt(userPubkey, value));
      registerEncryptor("nip44", (value) => signer.nip44Encrypt(userPubkey, value));
    }

    if (typeof signer.nip04Encrypt === "function") {
      registerEncryptor("nip04", (value) => signer.nip04Encrypt(userPubkey, value));
    }

    if (!encryptors.length) {
      const error = new Error(
        "An encryption-capable signer is required to update subscriptions.",
      );
      error.code = "subscriptions-missing-encryptor";
      throw error;
    }

    /*
     * The subscription list is stored as an encrypted message to self, so both
     * encryption and decryption intentionally use the user's own pubkey.
     * Extensions are expected to support this encrypt-to-self flow; altering
     * the target would break loadSubscriptions, which decrypts with the same
     * pubkey. Any future sharing model (e.g., sharing with another user) will
     * need a parallel read path and should not overwrite this behavior.
     */
    let cipherText = "";
    let encryptionScheme = "";
    const seenSchemes = new Set();
    const encryptionErrors = [];

    for (const candidate of encryptors) {
      if (seenSchemes.has(candidate.scheme)) {
        continue;
      }
      seenSchemes.add(candidate.scheme);
      try {
        const encrypted = await candidate.handler(plainStr);
        if (typeof encrypted === "string" && encrypted) {
          cipherText = encrypted;
          encryptionScheme = candidate.scheme;
          break;
        }
      } catch (error) {
        encryptionErrors.push({ scheme: candidate.scheme, error });
      }
    }

    if (!cipherText) {
      const error = new Error("Failed to encrypt subscription list payload.");
      error.code = "subscriptions-encrypt-failed";
      error.cause = encryptionErrors;
      throw error;
    }

    const encryptionTagValue =
      encryptionScheme === "nip44_v2"
        ? "nip44_v2"
        : encryptionScheme === "nip44"
          ? "nip44"
          : encryptionScheme === "nip04"
            ? "nip04"
            : undefined;

    const evt = buildSubscriptionListEvent({
      pubkey: userPubkey,
      created_at: Math.floor(Date.now() / 1000),
      content: cipherText,
      encryption: encryptionTagValue,
    });

    let signedEvent;
    try {
      signedEvent = await signer.signEvent(evt);
    } catch (signErr) {
      userLogger.error("Failed to sign subscription list:", signErr);
      throw signErr;
    }

    const sanitizeRelayList = (candidate) =>
      Array.isArray(candidate)
        ? candidate
            .map((url) => (typeof url === "string" ? url.trim() : ""))
            .filter(Boolean)
        : [];

    const writeRelays = sanitizeRelayList(nostrClient.writeRelays);
    const fallbackRelays = writeRelays.length
      ? writeRelays
      : sanitizeRelayList(nostrClient.relays);
    const targetRelays = fallbackRelays.length
      ? fallbackRelays
      : Array.from(DEFAULT_RELAY_URLS);

    const publishResults = await publishEventToRelays(
      nostrClient.pool,
      targetRelays,
      signedEvent
    );

    let publishSummary;
    try {
      publishSummary = assertAnyRelayAccepted(publishResults, {
        context: "subscription list"
      });
    } catch (publishError) {
      if (publishError?.relayFailures?.length) {
        publishError.relayFailures.forEach(
          ({ url, error: relayError, reason }) => {
            userLogger.error(
              `[SubscriptionsManager] Subscription list rejected by ${url}: ${reason}`,
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
          `[SubscriptionsManager] Subscription list not accepted by ${url}: ${reason}`,
          relayError
        );
      });
    }

    this.subsEventId = signedEvent.id;
    const acceptedUrls = publishSummary.accepted.map(({ url }) => url);
    devLogger.log(
      "Subscription list published, event id:",
      signedEvent.id,
      "accepted relays:",
      acceptedUrls
    );
  }

  /**
   * If not loaded, load subs, then fetch + render videos
   * in #subscriptionsVideoList with the same style as app.renderVideoList.
   */
  async showSubscriptionVideos(
    userPubkey,
    containerId = "subscriptionsVideoList",
    options = {}
  ) {
    const limitCandidate = Number(options?.limit);
    const limit =
      Number.isFinite(limitCandidate) && limitCandidate > 0
        ? Math.floor(limitCandidate)
        : null;
    const reason =
      typeof options?.reason === "string" && options.reason.trim()
        ? options.reason.trim()
        : undefined;

    this.lastContainerId = containerId;

    const container = document.getElementById(containerId);
    if (!userPubkey) {
      if (container) {
        container.innerHTML =
          "<p class='text-muted-strong'>Please log in first.</p>";
      }
      this.lastRunOptions = null;
      this.lastResult = null;
      this.hasRenderedOnce = Boolean(container);
      return null;
    }

    try {
      await this.ensureLoaded(userPubkey);
    } catch (error) {
      userLogger.error(
        "[SubscriptionsManager] Failed to load subscriptions while rendering feed:",
        error,
      );
    }

    const channelHexes = this.getSubscribedAuthors();
    if (!container) {
      this.lastRunOptions = {
        actorPubkey: userPubkey,
        limit,
        containerId
      };
      this.hasRenderedOnce = false;
      return null;
    }

    if (!channelHexes.length) {
      container.innerHTML =
        "<p class='text-muted-strong'>No subscriptions found.</p>";
      this.lastRunOptions = {
        actorPubkey: userPubkey,
        limit,
        containerId
      };
      this.lastResult = { items: [], metadata: { reason: "no-subscriptions" } };
      this.hasRenderedOnce = true;
      return this.lastResult;
    }

    if (!this.hasRenderedOnce) {
      container.innerHTML = getSidebarLoadingMarkup("Fetching subscriptions…");
    }

    this.lastRunOptions = {
      actorPubkey: userPubkey,
      limit,
      containerId,
      reason
    };

    this.ensureFeedRegistered();
    this.ensureNostrServiceListener();

    if (typeof nostrService?.awaitInitialLoad === "function") {
      try {
        devLogger.log("[SubscriptionsManager] awaiting nostrService initial load...");
        await nostrService.awaitInitialLoad();
        devLogger.log("[SubscriptionsManager] nostrService initial load done.");
      } catch (error) {
        devLogger.warn(
          "[SubscriptionsManager] Failed to await nostrService initial load:",
          error
        );
      }
    }

    const engine = this.getFeedEngine();
    if (!engine || typeof engine.run !== "function") {
      container.innerHTML =
        "<p class='text-muted-strong'>Subscriptions are unavailable right now.</p>";
      this.hasRenderedOnce = true;
      return null;
    }

    const app = getApp();
    const runtime = this.buildFeedRuntime({
      app,
      authors: channelHexes,
      limit,
    });
    const runOptions = {
      actorPubkey: userPubkey,
      limit,
      runtime,
      hooks: {
        subscriptions: {
          resolveAuthors: () => this.getSubscribedAuthors()
        }
      }
    };

    try {
      this.isRunningFeed = true;
      devLogger.log("[SubscriptionsManager] Calling engine.run('subscriptions')...");
      const result = await engine.run("subscriptions", runOptions);
      devLogger.log("[SubscriptionsManager] engine.run complete. Items:", result?.items?.length);

      const videos = Array.isArray(result?.items)
        ? result.items.map((item) => item?.video).filter(Boolean)
        : [];

      const metadata = result && typeof result.metadata === "object"
        ? { ...result.metadata }
        : {};

      if (!metadata.feed) {
        metadata.feed = "subscriptions";
      }
      if (limit) {
        metadata.limit = limit;
      }
      if (reason) {
        metadata.reason = reason;
      }

      const enrichedResult = { ...result, metadata };

      if (app?.videosMap instanceof Map) {
        videos.forEach((video) => {
          if (video && typeof video.id === "string" && video.id) {
            app.videosMap.set(video.id, video);
          }
        });
      }

      this.lastResult = enrichedResult;
      this.renderSameGridStyle(enrichedResult, containerId, {
        limit,
        reason,
        emptyMessage:
          "No playable subscription videos found yet. We'll keep watching for new posts.",
      });
      this.hasRenderedOnce = true;
      return enrichedResult;
    } catch (error) {
      userLogger.error(
        "[SubscriptionsManager] Failed to run subscriptions feed:",
        error
      );
      if (container && this.lastResult) {
        const fallbackReason = reason
          ? `${reason}:cached`
          : "cached-result";
        this.renderSameGridStyle(this.lastResult, containerId, {
          limit,
          reason: fallbackReason,
        });
      } else if (container) {
        container.innerHTML =
          "<p class='text-muted-strong'>Unable to load subscriptions right now.</p>";
      }
      this.hasRenderedOnce = Boolean(container);
      return this.lastResult;
    } finally {
      this.isRunningFeed = false;
      this.processScheduledRefresh();
    }
  }

  ensureNostrServiceListener() {
    if (this.unsubscribeFromNostrUpdates || typeof nostrService?.on !== "function") {
      return;
    }

    this.unsubscribeFromNostrUpdates = nostrService.on(
      "videos:updated",
      (detail) => {
        this.handleNostrVideosUpdated(detail);
      }
    );
  }

  handleNostrVideosUpdated(detail) {
    if (!detail || !Array.isArray(detail.videos) || !detail.videos.length) {
      return;
    }

    this.scheduledRefreshDetail = detail;
    this.processScheduledRefresh();
  }

  processScheduledRefresh() {
    if (!this.lastRunOptions || !this.hasRenderedOnce) {
      return null;
    }

    if (!this.scheduledRefreshDetail) {
      return null;
    }

    if (this.isRunningFeed || this.pendingRefreshPromise) {
      return null;
    }

    const detail = this.scheduledRefreshDetail;
    this.scheduledRefreshDetail = null;

    const refreshReason =
      typeof detail?.reason === "string" && detail.reason
        ? `nostr:${detail.reason}`
        : "nostr:update";

    this.pendingRefreshPromise = this.refreshActiveFeed({ reason: refreshReason })
      .catch((error) => {
        devLogger.warn(
          "[SubscriptionsManager] Failed to refresh after nostrService update:",
          error
        );
      })
      .finally(() => {
        this.pendingRefreshPromise = null;
        if (this.scheduledRefreshDetail) {
          this.processScheduledRefresh();
        }
      });

    return this.pendingRefreshPromise;
  }

  ensureFeedRegistered() {
    const app = getApp();
    if (typeof app?.registerSubscriptionsFeed === "function") {
      try {
        app.registerSubscriptionsFeed();
      } catch (error) {
        userLogger.warn(
          "[SubscriptionsManager] Failed to register subscriptions feed:",
          error
        );
      }
    }
  }

  getFeedEngine() {
    const app = getApp();
    return app?.feedEngine || null;
  }

  buildFeedRuntime({ app, authors = [], limit = null } = {}) {
    const normalizedAuthors = Array.isArray(authors)
      ? authors
          .map((author) => normalizeHexPubkey(author))
          .filter((author) => Boolean(author))
      : [];

    const blacklist =
      app?.blacklistedEventIds instanceof Set
        ? new Set(app.blacklistedEventIds)
        : new Set();

    const isAuthorBlocked =
      typeof app?.isAuthorBlocked === "function"
        ? (pubkey) => app.isAuthorBlocked(pubkey)
        : () => false;

    const limitCandidate = Number(limit);
    const normalizedLimit =
      Number.isFinite(limitCandidate) && limitCandidate > 0
        ? Math.floor(limitCandidate)
        : null;

    const preferenceSource =
      typeof app?.getHashtagPreferences === "function"
        ? app.getHashtagPreferences()
        : {};

    const moderationThresholds =
      typeof app?.getActiveModerationThresholds === "function"
        ? app.getActiveModerationThresholds()
        : null;

    return {
      subscriptionAuthors: normalizedAuthors,
      authors: normalizedAuthors,
      blacklistedEventIds: blacklist,
      isAuthorBlocked,
      limit: normalizedLimit,
      tagPreferences: {
        interests: Array.isArray(preferenceSource?.interests)
          ? [...preferenceSource.interests]
          : [],
        disinterests: Array.isArray(preferenceSource?.disinterests)
          ? [...preferenceSource.disinterests]
          : [],
      },
      moderationThresholds: moderationThresholds
        ? { ...moderationThresholds }
        : undefined,
    };
  }

  /**
   * Renders the feed in the same style as home.
   * This includes gear menu, time-ago, lazy load, clickable authors, etc.
   */
  renderSameGridStyle(result, containerId, options = {}) {
    const container = document.getElementById(containerId);
    if (!container) {
      return;
    }

    const app = getApp();
    const items = Array.isArray(result?.items) ? result.items : [];
    const metadata =
      result && typeof result.metadata === "object"
        ? { ...result.metadata }
        : {};

    if (!metadata.feed) {
      metadata.feed = "subscriptions";
    }

    const limitCandidate = Number(options?.limit);
    const limit =
      Number.isFinite(limitCandidate) && limitCandidate > 0
        ? Math.floor(limitCandidate)
        : null;

    const limitedItems = limit ? items.slice(0, limit) : items;
    const videos = limitedItems
      .map((item) => (item && typeof item === "object" ? item.video : null))
      .filter((video) => video && typeof video === "object");

    if (!videos.length) {
      const reasonDetail =
        typeof metadata.reason === "string" && metadata.reason
          ? metadata.reason
          : "empty";
      this.renderEmptyState(container, {
        message: options?.emptyMessage,
        reason: reasonDetail,
        metadata,
      });
      return;
    }

    const listView = this.getListView(container, app);
    if (!listView) {
      container.innerHTML = `
        <p class="flex justify-center items-center h-full w-full text-center text-muted-strong">
          Unable to render subscriptions feed.
        </p>`;
      return;
    }

    listView.mount(container);

    if (app?.videosMap instanceof Map) {
      listView.state.videosMap = app.videosMap;
    }

    const enrichedMetadata = {
      ...metadata,
      feed: "subscriptions"
    };
    if (limit) {
      enrichedMetadata.limit = limit;
    }
    if (typeof options?.reason === "string" && options.reason) {
      enrichedMetadata.reason = options.reason;
    }

    listView.state.feedMetadata = enrichedMetadata;
    listView.render(videos, enrichedMetadata);
  }

  renderEmptyState(container, { message, reason, metadata } = {}) {
    if (!container) {
      return;
    }

    const copy =
      typeof message === "string" && message.trim()
        ? message.trim()
        : "No playable subscription videos found yet. We'll keep watching for new posts.";

    container.innerHTML = getSidebarLoadingMarkup(copy, { showSpinner: false });

    if (this.subscriptionListView && this.subscriptionListView.state) {
      const currentMetadata =
        this.subscriptionListView.state.feedMetadata &&
        typeof this.subscriptionListView.state.feedMetadata === "object"
          ? { ...this.subscriptionListView.state.feedMetadata }
          : {};

      if (metadata && typeof metadata === "object") {
        Object.assign(currentMetadata, metadata);
      }

      if (reason && typeof reason === "string") {
        currentMetadata.reason = reason;
      } else if (!currentMetadata.reason) {
        currentMetadata.reason = "empty";
      }

      this.subscriptionListView.state.feedMetadata = currentMetadata;
    }
  }

  getListView(container, app) {
    if (this.subscriptionListView) {
      return this.subscriptionListView;
    }

    if (!container) {
      return null;
    }

    const doc = container.ownerDocument || document;
    const baseView = app?.videoListView || null;

    const badgeHelpers = baseView?.badgeHelpers || {
      attachHealthBadges: () => {},
      attachUrlHealthBadges: () => {}
    };

    const formatTimeAgo = (timestamp) => {
      if (typeof app?.formatTimeAgo === "function") {
        return app.formatTimeAgo(timestamp);
      }
      if (typeof baseView?.formatters?.formatTimeAgo === "function") {
        return baseView.formatters.formatTimeAgo(timestamp);
      }
      return timestamp;
    };

    const formatViewCountLabel = (total) => {
      if (typeof baseView?.formatters?.formatViewCountLabel === "function") {
        return baseView.formatters.formatViewCountLabel(total);
      }
      return typeof total === "number" ? total.toLocaleString() : `${total}`;
    };

    const assets = baseView?.assets || {
      fallbackThumbnailSrc: "/assets/jpg/video-thumbnail-fallback.jpg",
      unsupportedBtihMessage:
        "This magnet link is missing a compatible BitTorrent v1 info hash."
    };

    const loadedThumbnails =
      app?.loadedThumbnails instanceof Map
        ? app.loadedThumbnails
        : baseView?.state?.loadedThumbnails instanceof Map
          ? baseView.state.loadedThumbnails
          : new Map();

    const videosMap =
      app?.videosMap instanceof Map
        ? app.videosMap
        : baseView?.state?.videosMap instanceof Map
          ? baseView.state.videosMap
          : new Map();

    const urlHealthCache =
      app?.urlHealthSnapshots instanceof Map
        ? app.urlHealthSnapshots
        : baseView?.state?.urlHealthByVideoId instanceof Map
          ? baseView.state.urlHealthByVideoId
          : new Map();

    const streamHealthCache =
      app?.streamHealthSnapshots instanceof Map
        ? app.streamHealthSnapshots
        : baseView?.state?.streamHealthByVideoId instanceof Map
          ? baseView.state.streamHealthByVideoId
          : new Map();

    const listViewConfig = {
      document: doc,
      container,
      mediaLoader: app?.mediaLoader || baseView?.mediaLoader || null,
      badgeHelpers,
      formatters: {
        formatTimeAgo,
        formatViewCountLabel
      },
      helpers: {
        escapeHtml: (value) => app?.escapeHTML?.(value) ?? value,
        isMagnetSupported: (magnet) =>
          app?.isMagnetUriSupported?.(magnet) ?? false,
        toLocaleString: (value) =>
          typeof value === "number" ? value.toLocaleString() : value
      },
      assets,
      state: {
        loadedThumbnails,
        videosMap,
        urlHealthByVideoId: urlHealthCache,
        streamHealthByVideoId: streamHealthCache
      },
      utils: {
        dedupeVideos: (videos) => (Array.isArray(videos) ? [...videos] : []),
        getAllEvents: () => Array.from(nostrClient.allEvents.values()),
        hasOlderVersion: (video, events) =>
          app?.hasOlderVersion?.(video, events) ?? false,
        derivePointerInfo: (video) =>
          app?.deriveVideoPointerInfo?.(video) ?? null,
        persistWatchHistoryMetadata: (video, pointerInfo) =>
          app?.persistWatchHistoryMetadataForVideo?.(video, pointerInfo),
        getShareUrlBase: () => app?.getShareUrlBase?.() ?? "",
        buildShareUrlFromNevent: (nevent) =>
          app?.buildShareUrlFromNevent?.(nevent) ?? "",
        buildShareUrlFromEventId: (eventId) =>
          app?.buildShareUrlFromEventId?.(eventId) ?? "",
        canManageBlacklist: () =>
          app?.canCurrentUserManageBlacklist?.() ?? false,
        canEditVideo: (video) => video?.pubkey === app?.pubkey,
        canDeleteVideo: (video) => video?.pubkey === app?.pubkey,
        batchFetchProfiles: (authorSet) => app?.batchFetchProfiles?.(authorSet),
        bindThumbnailFallbacks: (target) =>
          app?.bindThumbnailFallbacks?.(target),
        handleUrlHealthBadge: (payload) => app?.handleUrlHealthBadge?.(payload),
        refreshDiscussionCounts: (videosList, { container: root } = {}) =>
          app?.refreshVideoDiscussionCounts?.(videosList, {
            videoListRoot: root || container || null
          }),
        ensureGlobalMoreMenuHandlers: () =>
          app?.ensureGlobalMoreMenuHandlers?.(),
        closeAllMenus: (options) => app?.closeAllMoreMenus?.(options)
      },
      renderers: {
        getLoadingMarkup: (message) => getSidebarLoadingMarkup(message)
      },
      allowNsfw: ALLOW_NSFW_CONTENT === true
    };

    const listView = new VideoListView(listViewConfig);
    if (typeof listView.setPopularTagsContainer === "function") {
      listView.setPopularTagsContainer(null);
    }

    const buildModerationPayload = (detail = {}) => {
      const event = detail?.event || null;
      const trigger =
        detail?.trigger ||
        (event && (event.currentTarget || event.target)) ||
        null;
      const card = detail?.card || null;
      const video = detail?.video || null;
      const datasetContext = (() => {
        const detailContext =
          typeof detail?.context === "string" ? detail.context.trim() : "";
        if (detailContext) {
          return detailContext;
        }
        const datasetSource =
          (detail?.dataset && typeof detail.dataset === "object"
            ? detail.dataset
            : null) ||
          (trigger && trigger.dataset) ||
          (card && card.root && card.root.dataset) ||
          null;
        if (
          datasetSource &&
          typeof datasetSource.context === "string" &&
          datasetSource.context.trim()
        ) {
          return datasetSource.context.trim();
        }
        return "";
      })();

      return {
        ...detail,
        video,
        card,
        trigger,
        context: datasetContext || "subscriptions",
      };
    };

    listView.setPlaybackHandler((detail) => {
      if (!detail) {
        return;
      }
      if (detail.videoId) {
        Promise.resolve(
          app?.playVideoByEventId?.(detail.videoId, {
            url: detail.url,
            magnet: detail.magnet
          })
        ).catch((error) => {
          userLogger.error(
            "[SubscriptionsManager] Failed to play by event id:",
            error
          );
        });
        return;
      }
      Promise.resolve(
        app?.playVideoWithFallback?.({ url: detail.url, magnet: detail.magnet })
      ).catch((error) => {
        userLogger.error(
          "[SubscriptionsManager] Failed to start playback:",
          error
        );
      });
    });

    listView.setEditHandler(({ video, index }) => {
      if (!video?.id) {
        return;
      }
      app?.handleEditVideo?.({
        eventId: video.id,
        index: Number.isFinite(index) ? index : null,
        video
      });
    });

    listView.setRevertHandler(({ video, index }) => {
      if (!video?.id) {
        return;
      }
      app?.handleRevertVideo?.({
        eventId: video.id,
        index: Number.isFinite(index) ? index : null,
        video
      });
    });

    listView.setDeleteHandler(({ video, index }) => {
      if (!video?.id) {
        return;
      }
      app?.handleFullDeleteVideo?.({
        eventId: video.id,
        index: Number.isFinite(index) ? index : null,
        video
      });
    });

    listView.setBlacklistHandler(({ video, dataset }) => {
      const detail = {
        ...(dataset || {}),
        author: dataset?.author || video?.pubkey || "",
        context: dataset?.context || "subscriptions"
      };
      app?.handleMoreMenuAction?.("blacklist-author", detail);
    });

    listView.setModerationOverrideHandler((detail = {}) => {
      if (typeof app?.handleModerationOverride !== "function") {
        return false;
      }
      return app.handleModerationOverride(buildModerationPayload(detail));
    });

    listView.setModerationBlockHandler((detail = {}) => {
      if (typeof app?.handleModerationBlock !== "function") {
        return false;
      }
      return app.handleModerationBlock(buildModerationPayload(detail));
    });

    listView.addEventListener("video:share", (event) => {
      const detail = event?.detail || {};
      const dataset = {
        ...(detail.dataset || {}),
        eventId:
          detail.eventId || detail.dataset?.eventId || detail.video?.id || "",
        context: detail.dataset?.context || "subscriptions"
      };
      app?.handleMoreMenuAction?.(detail.action || "copy-link", dataset);
    });

    listView.addEventListener("video:context-action", (event) => {
      const detail = event?.detail || {};
      const dataset = {
        ...(detail.dataset || {}),
        eventId: detail.dataset?.eventId || detail.video?.id || "",
        context: detail.dataset?.context || "subscriptions"
      };
      app?.handleMoreMenuAction?.(detail.action, dataset);
    });

    this.subscriptionListView = listView;
    return this.subscriptionListView;
  }

  async refreshActiveFeed(options = {}) {
    if (!this.lastRunOptions) {
      return null;
    }

    const { actorPubkey, containerId, limit } = this.lastRunOptions;
    if (!actorPubkey || !containerId) {
      return null;
    }

    const reason =
      typeof options?.reason === "string" && options.reason.trim()
        ? options.reason.trim()
        : this.lastRunOptions.reason;

    if (typeof moderationService?.awaitUserBlockRefresh === "function") {
      try {
        await moderationService.awaitUserBlockRefresh();
      } catch (error) {
        devLogger.warn(
          "[SubscriptionsManager] Failed to sync moderation before refreshing feed:",
          error,
        );
      }
    }

    return this.showSubscriptionVideos(actorPubkey, containerId, {
      limit,
      reason
    });
  }

  convertEventToVideo(evt) {
    return sharedConvertEventToVideo(evt);
  }
}

SubscriptionsManager.listVideoViewEvents = listVideoViewEventsApi;
SubscriptionsManager.subscribeVideoViewEvents = subscribeVideoViewEventsApi;

export const subscriptions = new SubscriptionsManager();
