import {
  buildCommentEvent,
  getNostrEventSchema,
  NOTE_TYPES,
  sanitizeAdditionalTags,
} from "../nostrEventSchemas.js";
import { publishEventToRelay } from "../nostrPublish.js";
import { RELAY_URLS } from "./toolkit.js";
import { devLogger, userLogger } from "../utils/logger.js";
import { LRUCache } from "../utils/lruCache.js";
import { CACHE_POLICIES } from "./cachePolicies.js";
import { isSessionActor } from "./sessionActor.js";
import { queueSignEvent } from "./signRequestQueue.js";
import { getActiveSigner } from "../nostrClientRegistry.js";
import { sanitizeRelayList as sanitizeRelayUrls } from "./nip46Client.js";
import { pMap } from "../utils/asyncUtils.js";
import { RELAY_BACKGROUND_CONCURRENCY } from "./relayConstants.js";
import {
  normalizeCommentTarget,
  normalizeDescriptorString,
  getAllowedCommentKinds,
  normalizeTagValue,
  isVideoCommentEvent,
} from "./commentTargetNormalizer.js";

const COMMENT_EVENT_SCHEMA = getNostrEventSchema(NOTE_TYPES.VIDEO_COMMENT);
const CACHE_POLICY = CACHE_POLICIES[NOTE_TYPES.VIDEO_COMMENT];

const commentCache = new LRUCache({ maxSize: 100 });
export const COMMENT_EVENT_KIND = Number.isFinite(COMMENT_EVENT_SCHEMA?.kind)
  ? COMMENT_EVENT_SCHEMA.kind
  : 1111;
export const LEGACY_COMMENT_KIND = 1;

function sanitizeRelayList(primary, fallback) {
  const primaryList = sanitizeRelayUrls(Array.isArray(primary) ? primary : []);
  if (primaryList.length) {
    return primaryList;
  }
  const fallbackList = sanitizeRelayUrls(Array.isArray(fallback) ? fallback : []);
  if (fallbackList.length) {
    return fallbackList;
  }
  return sanitizeRelayUrls(RELAY_URLS);
}

function applyFilterOptions(filter, options = {}) {
  if (!filter || typeof filter !== "object") {
    return filter;
  }

  const result = { ...filter };

  if (
    typeof options.limit === "number" &&
    Number.isFinite(options.limit) &&
    options.limit > 0
  ) {
    result.limit = Math.floor(options.limit);
  }

  if (typeof options.since === "number" && Number.isFinite(options.since)) {
    result.since = Math.floor(options.since);
  }

  if (typeof options.until === "number" && Number.isFinite(options.until)) {
    result.until = Math.floor(options.until);
  }

  return result;
}

function createVideoCommentFilters(targetInput, options = {}) {
  const descriptor = normalizeCommentTarget(targetInput, options);
  if (!descriptor) {
    throw new Error("Invalid video comment target supplied.");
  }

  const filters = [];

  const eventFilter = {
    kinds: getAllowedCommentKinds(),
    "#E": [descriptor.videoEventId],
  };
  filters.push(applyFilterOptions(eventFilter, options));

  const uppercaseFilter = { kinds: getAllowedCommentKinds() };
  let hasUppercasePointer = false;

  if (typeof descriptor.rootIdentifier === "string" && descriptor.rootIdentifier) {
    uppercaseFilter["#I"] = [descriptor.rootIdentifier];
    hasUppercasePointer = true;

  } else if (
    typeof descriptor.videoDefinitionAddress === "string" &&
    descriptor.videoDefinitionAddress
  ) {
    uppercaseFilter["#A"] = [descriptor.videoDefinitionAddress];
    hasUppercasePointer = true;
  } else if (
    typeof descriptor.videoEventId === "string" &&
    descriptor.videoEventId
  ) {
    uppercaseFilter["#E"] = [descriptor.videoEventId];
    hasUppercasePointer = true;
  }

  const normalizedRootKind = normalizeDescriptorString(
    descriptor.rootKind || descriptor.videoKind,
  );
  if (normalizedRootKind) {
    uppercaseFilter["#K"] = [normalizedRootKind];
  }

  const normalizedRootAuthor = normalizeDescriptorString(
    descriptor.rootAuthorPubkey || descriptor.videoAuthorPubkey,
  );
  if (normalizedRootAuthor) {
    uppercaseFilter["#P"] = [normalizedRootAuthor];
  }

  if (hasUppercasePointer) {
    filters.push(applyFilterOptions(uppercaseFilter, options));
  }

  if (
    descriptor.parentCommentId &&
    descriptor.parentCommentId !== descriptor.videoEventId
  ) {
    const parentUppercaseFilter = {
      kinds: getAllowedCommentKinds(),
      "#E": [descriptor.parentCommentId],
    };
    filters.push(applyFilterOptions(parentUppercaseFilter, options));
  }

  if (descriptor.videoDefinitionAddress) {
    const definitionUppercaseFilter = {
      kinds: getAllowedCommentKinds(),
      "#A": [descriptor.videoDefinitionAddress],
    };

    if (descriptor.parentCommentId) {
      definitionUppercaseFilter["#E"] = [descriptor.parentCommentId];
    }

    filters.push(applyFilterOptions(definitionUppercaseFilter, options));
  }

  return { descriptor, filters };
}

function flattenListResults(input) {
  if (!Array.isArray(input)) {
    return [];
  }

  const flat = [];
  for (const chunk of input) {
    if (Array.isArray(chunk)) {
      for (const item of chunk) {
        if (item && typeof item === "object") {
          flat.push(item);
        }
      }
    } else if (chunk && typeof chunk === "object") {
      flat.push(chunk);
    }
  }
  return flat;
}

export async function publishComment(
  client,
  targetInput,
  options = {},
  {
    shouldRequestExtensionPermissions,
    DEFAULT_NIP07_PERMISSION_METHODS,
    resolveActiveSigner,
  } = {},
) {
  if (!client?.pool) {
    return { ok: false, error: "nostr-uninitialized" };
  }

  if (isSessionActor(client)) {
    const error = new Error(
      "Publishing comments is not allowed for session actors."
    );
    error.code = "session-actor-publish-blocked";
    return { ok: false, error: "session-actor-publish-blocked", details: error };
  }

  const descriptor = normalizeCommentTarget(targetInput, options);
  if (!descriptor) {
    return { ok: false, error: "invalid-target" };
  }

  const actorPubkey =
    typeof client?.pubkey === "string" && client.pubkey.trim()
      ? client.pubkey.trim()
      : "";
  if (!actorPubkey) {
    return { ok: false, error: "auth-required" };
  }

  const createdAt =
    typeof options.created_at === "number" && options.created_at > 0
      ? Math.floor(options.created_at)
      : Math.floor(Date.now() / 1000);

  const additionalTags = sanitizeAdditionalTags(options.additionalTags);

  let content = "";
  if (typeof options.content === "string") {
    content = options.content;
  } else if (
    options.content &&
    typeof options.content === "object" &&
    !Array.isArray(options.content)
  ) {
    try {
      content = JSON.stringify(options.content);
    } catch (error) {
      devLogger.warn("[nostr] Failed to serialize comment content:", error);
      content = "";
    }
  } else if (options.content !== undefined && options.content !== null) {
    content = String(options.content);
  }

  const event = buildCommentEvent({
    pubkey: actorPubkey,
    created_at: createdAt,
    videoEventId: descriptor.videoEventId,
    videoEventRelay: descriptor.videoEventRelay,
    videoDefinitionAddress: descriptor.videoDefinitionAddress,
    videoDefinitionRelay: descriptor.videoDefinitionRelay,
    rootIdentifier: descriptor.rootIdentifier,
    rootIdentifierRelay: descriptor.rootIdentifierRelay,
    parentCommentId: descriptor.parentCommentId,
    parentCommentRelay: descriptor.parentCommentRelay,
    threadParticipantPubkey: descriptor.threadParticipantPubkey,
    threadParticipantRelay: descriptor.threadParticipantRelay,
    rootKind: descriptor.rootKind,
    rootAuthorPubkey: descriptor.rootAuthorPubkey,
    rootAuthorRelay: descriptor.rootAuthorRelay,
    parentKind: descriptor.parentKind,
    parentAuthorPubkey: descriptor.parentAuthorPubkey,
    parentAuthorRelay: descriptor.parentAuthorRelay,
    parentIdentifier: descriptor.parentIdentifier,
    parentIdentifierRelay: descriptor.parentIdentifierRelay,
    additionalTags,
    content,
  });

  let signedEvent = null;

  const signer = resolveActiveSigner
    ? resolveActiveSigner()
    : getActiveSigner();

  if (!signer || typeof signer.signEvent !== "function") {
    const error = new Error(
      "Login required: an active signer is needed to publish comments."
    );
    error.code = "auth-required";
    return {
      ok: false,
      error: "auth-required",
      message: error.message,
      details: error,
    };
  }

  let permissionResult = { ok: true };
  const shouldRequestPermissions =
    typeof shouldRequestExtensionPermissions === "function"
      ? shouldRequestExtensionPermissions(signer)
      : false;

  if (shouldRequestPermissions) {
    permissionResult = await client.ensureExtensionPermissions(
      DEFAULT_NIP07_PERMISSION_METHODS,
    );
  }

  if (!permissionResult.ok) {
    userLogger.warn(
      "[nostr] Active signer permissions missing; comment publish requires login.",
      permissionResult.error,
    );
    return {
      ok: false,
      error: "auth-required",
      details: permissionResult,
    };
  }

  try {
    signedEvent = await queueSignEvent(signer, event, {
      timeoutMs: options?.timeoutMs,
    });
  } catch (error) {
    userLogger.warn(
      "[nostr] Failed to sign comment event with active signer:",
      error,
    );
    return { ok: false, error: "signing-failed", details: error };
  }

  const relayList = sanitizeRelayList(options.relays, client.relays);

  const publishResults = await pMap(
    relayList,
    (url) => publishEventToRelay(client.pool, url, signedEvent),
    { concurrency: RELAY_BACKGROUND_CONCURRENCY },
  );

  const acceptedRelays = publishResults
    .filter((result) => result.success)
    .map((result) => result.url)
    .filter((url) => typeof url === "string" && url);

  const success = acceptedRelays.length > 0;

  if (success) {
    devLogger.info(
      `[nostr] Comment event accepted by ${acceptedRelays.length} relay(s):`,
      acceptedRelays.join(", "),
    );
  } else {
    userLogger.warn("[nostr] Comment event rejected by relays:", publishResults);
  }

  return {
    ok: success,
    event: signedEvent,
    results: publishResults,
    acceptedRelays,
  };
}

export async function listVideoComments(client, targetInput, options = {}) {
  let pool = client?.pool;
  const ensurePool =
    typeof client?.ensurePool === "function"
      ? client.ensurePool.bind(client)
      : null;

  if (!pool || typeof pool.list !== "function") {
    if (ensurePool) {
      try {
        pool = await ensurePool();
      } catch (error) {
        devLogger.warn(
          "[nostr] Unable to list video comments: pool init failed.",
          error,
        );
        return [];
      }
    }
  }

  if (!pool || typeof pool.list !== "function") {
    devLogger.warn("[nostr] Unable to list video comments: pool missing.");
    return [];
  }

  let descriptor;
  let filterTemplate;
  try {
    // createVideoCommentFilters returns { descriptor, filters: [...] }
    const result = createVideoCommentFilters(targetInput, options);
    descriptor = result.descriptor;
    // We assume the first filter is the primary one we want to augment with 'since'
    // or use in per-relay logic. For now, we use the full array.
    filterTemplate = result.filters;
  } catch (error) {
    devLogger.warn("[nostr] Failed to build comment filters:", error);
    return [];
  }

  const cacheKey = descriptor.videoEventId;
  const cached = commentCache.get(cacheKey);
  const ttl = CACHE_POLICY.ttl;
  const now = Date.now();
  const forceRefresh = options?.forceRefresh === true;

  if (cached && !forceRefresh && (now - cached.fetchedAt < ttl)) {
    devLogger.debug(`[nostr] Comments cache hit for ${cacheKey}`);
    return cached.items.filter((event) =>
      isVideoCommentEvent(event, descriptor),
    );
  }

  if (cached) {
    devLogger.debug(`[nostr] Comments cache stale for ${cacheKey}, refreshing...`);
  } else {
    devLogger.debug(`[nostr] Comments cache miss for ${cacheKey}`);
  }

  const relayList = sanitizeRelayList(options.relays, client.relays);
  const lastSeens = cached?.lastSeenPerRelay || {};
  const mergedLastSeens = { ...lastSeens };

  const rawResults = [];

  // Parallel fetch from relays with incremental logic
  await pMap(
    relayList,
    async (url) => {
      if (!url) return;
      const lastSeen = lastSeens[url] || 0;
      // Deep clone filters to apply 'since' safely per relay
      const relayFilters = filterTemplate.map(f => {
        const copy = { ...f };
        if (lastSeen > 0) {
          copy.since = lastSeen + 1;
        }
        return copy;
      });

      try {
        const events = await pool.list([url], relayFilters);
        let maxCreated = lastSeen;
        if (Array.isArray(events)) {
          for (const ev of events) {
            rawResults.push(ev);
            if (ev.created_at > maxCreated) {
              maxCreated = ev.created_at;
            }
          }
        }
        if (maxCreated > lastSeen) {
          mergedLastSeens[url] = maxCreated;
        }
      } catch (err) {
        devLogger.warn(`[nostr] Failed to fetch comments from ${url}:`, err);
      }
    },
    { concurrency: RELAY_BACKGROUND_CONCURRENCY },
  );

  // If we have cached items, add them to the raw list for deduplication/merging
  const combinedRaw = cached ? [...cached.items, ...rawResults] : rawResults;
  const flattened = flattenListResults(combinedRaw);
  const dedupe = new Map();
  const order = [];

  for (const event of flattened) {
    if (!isVideoCommentEvent(event, descriptor)) {
      continue;
    }

    const eventId = typeof event.id === "string" ? event.id : null;
    if (!eventId) {
      order.push({ type: "raw", event });
      continue;
    }

    const existing = dedupe.get(eventId);
    if (!existing) {
      dedupe.set(eventId, event);
      order.push({ type: "id", key: eventId });
      continue;
    }

    const existingCreated = Number.isFinite(existing?.created_at)
      ? existing.created_at
      : 0;
    const incomingCreated = Number.isFinite(event.created_at)
      ? event.created_at
      : 0;
    if (incomingCreated > existingCreated) {
      dedupe.set(eventId, event);
    }
  }

  const finalItems = order
    .map((entry) => {
      if (!entry) {
        return null;
      }
      if (entry.type === "raw") {
        return entry.event || null;
      }
      if (entry.type === "id") {
        return dedupe.get(entry.key) || null;
      }
      return null;
    })
    .filter(Boolean);

  // Update cache
  if (cacheKey) {
    commentCache.set(cacheKey, {
      items: finalItems,
      lastSeenPerRelay: mergedLastSeens,
      fetchedAt: Date.now()
    });
  }

  return finalItems;
}

export function subscribeVideoComments(client, targetInput, options = {}) {
  const ensurePool =
    typeof client?.ensurePool === "function"
      ? client.ensurePool.bind(client)
      : null;

  let descriptor;
  let filters;
  try {
    ({ descriptor, filters } = createVideoCommentFilters(targetInput, options));
  } catch (error) {
    devLogger.warn("[nostr] Failed to build comment subscription filters:", error);
    return () => {};
  }

  const relayList = sanitizeRelayList(options.relays, client.relays);
  const onEvent = typeof options.onEvent === "function" ? options.onEvent : null;

  let activeSubscription = null;
  let unsubscribed = false;

  const ensureSubscription = async () => {
    let pool = client?.pool;
    if (!pool || typeof pool.sub !== "function") {
      if (!ensurePool) {
        devLogger.warn(
          "[nostr] Unable to subscribe to video comments: pool missing.",
        );
        return null;
      }
      try {
        pool = await ensurePool();
      } catch (error) {
        devLogger.warn(
          "[nostr] Unable to subscribe to video comments: pool init failed.",
          error,
        );
        return null;
      }
    }

    if (!pool || typeof pool.sub !== "function") {
      devLogger.warn(
        "[nostr] Unable to subscribe to video comments: pool missing.",
      );
      return null;
    }

    try {
      const subscription = pool.sub(relayList, filters);
      if (unsubscribed) {
        try {
          subscription?.unsub?.();
        } catch (error) {
          devLogger.warn(
            "[nostr] Failed to unsubscribe from video comments:",
            error,
          );
        }
        return null;
      }

      if (onEvent && subscription && typeof subscription.on === "function") {
        try {
          subscription.on("event", (event) => {
            if (isVideoCommentEvent(event, descriptor)) {
              try {
                onEvent(event);
              } catch (handlerError) {
                devLogger.warn(
                  "[nostr] Comment subscription handler threw:",
                  handlerError,
                );
              }
            }
          });
        } catch (error) {
          devLogger.warn(
            "[nostr] Failed to attach comment subscription handler:",
            error,
          );
        }
      }

      return subscription;
    } catch (error) {
      devLogger.warn("[nostr] Failed to open video comment subscription:", error);
      return null;
    }
  };

  const subscriptionPromise = ensureSubscription().then((subscription) => {
    activeSubscription = subscription;
    return subscription;
  });

  return () => {
    if (unsubscribed) {
      return;
    }
    unsubscribed = true;

    const teardown = (subscription) => {
      if (subscription && typeof subscription.unsub === "function") {
        try {
          subscription.unsub();
        } catch (error) {
          devLogger.warn(
            "[nostr] Failed to unsubscribe from video comments:",
            error,
          );
        }
      }
    };

    if (activeSubscription) {
      teardown(activeSubscription);
    } else {
      subscriptionPromise.finally(() => {
        teardown(activeSubscription);
      });
    }
  };
}

export const __testExports = {
  normalizeCommentTarget,
  createVideoCommentFilters,
  isVideoCommentEvent,
  commentCache,
};
