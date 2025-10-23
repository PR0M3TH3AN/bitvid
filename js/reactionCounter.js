import { publishVideoReaction } from "./nostr.js";
import { nostrClient } from "./nostrClientFacade.js";
import { normalizePointerInput, pointerKey } from "./nostr/watchHistory.js";
import { devLogger, userLogger } from "./utils/logger.js";

const pointerStates = new Map();
const pointerHandlers = new Map();
const pointerHydrationPromises = new Map();
const pointerSubscriptions = new Map();

const REACTION_EVENT_KIND = 7;
const REACTION_HYDRATION_LIMIT = 400;

function clonePointerDescriptor(pointer) {
  if (!pointer || typeof pointer !== "object") {
    return null;
  }
  const descriptor = {
    type: pointer.type === "a" ? "a" : "e",
    value:
      typeof pointer.value === "string" && pointer.value.trim()
        ? pointer.value.trim()
        : "",
  };
  if (typeof pointer.relay === "string" && pointer.relay.trim()) {
    descriptor.relay = pointer.relay.trim();
  }
  return descriptor;
}

function canonicalizePointerForState(pointerInput) {
  const normalized = normalizePointerInput(pointerInput);
  if (!normalized) {
    return null;
  }
  const key = pointerKey(normalized);
  if (!key) {
    return null;
  }
  const descriptor = clonePointerDescriptor(normalized);
  return descriptor ? { key, pointer: descriptor } : null;
}

function ensurePointerState(key, pointer) {
  let state = pointerStates.get(key);
  if (!state) {
    state = {
      pointer: pointer ? clonePointerDescriptor(pointer) : null,
      totals: new Map(),
      reactionsByPubkey: new Map(),
      lastUpdatedAt: 0,
      latestCreatedAt: 0,
      lastSyncedAt: 0,
      hydrated: false,
    };
    pointerStates.set(key, state);
    return state;
  }
  if (pointer) {
    const descriptor = clonePointerDescriptor(pointer);
    if (!state.pointer) {
      state.pointer = descriptor;
    } else if (descriptor?.relay && !state.pointer.relay) {
      state.pointer = { ...state.pointer, relay: descriptor.relay };
    }
  }
  return state;
}

function normalizeReactionEvent(event) {
  if (!event || typeof event !== "object") {
    return null;
  }
  const pubkey =
    typeof event.pubkey === "string" && event.pubkey.trim()
      ? event.pubkey.trim().toLowerCase()
      : "";
  if (!pubkey) {
    return null;
  }
  let content = "+";
  if (typeof event.content === "string") {
    content = event.content;
  } else if (event.content !== undefined && event.content !== null) {
    try {
      content = String(event.content);
    } catch (error) {
      content = "+";
    }
  }
  if (!content) {
    content = "+";
  }
  const createdAt = Number.isFinite(event.created_at)
    ? Math.max(0, Math.floor(event.created_at))
    : 0;
  const eventId =
    typeof event.id === "string" && event.id.trim() ? event.id.trim() : "";
  return { pubkey, content, created_at: createdAt, eventId };
}

function incrementContentCount(state, content) {
  if (typeof content !== "string") {
    return;
  }
  const existing = state.totals.get(content) || 0;
  state.totals.set(content, existing + 1);
}

function decrementContentCount(state, content) {
  if (typeof content !== "string") {
    return;
  }
  const existing = state.totals.get(content);
  if (!existing) {
    return;
  }
  if (existing <= 1) {
    state.totals.delete(content);
  } else {
    state.totals.set(content, existing - 1);
  }
}

function applyReactionToState(key, pointer, event) {
  const normalized = normalizeReactionEvent(event);
  if (!normalized) {
    return false;
  }
  const state = ensurePointerState(key, pointer);
  const existing = state.reactionsByPubkey.get(normalized.pubkey);

  if (existing) {
    if (existing.created_at > normalized.created_at) {
      return false;
    }
    if (
      existing.created_at === normalized.created_at &&
      existing.eventId &&
      normalized.eventId &&
      existing.eventId === normalized.eventId &&
      existing.content === normalized.content
    ) {
      return false;
    }
    if (
      existing.created_at === normalized.created_at &&
      existing.eventId &&
      !normalized.eventId &&
      existing.content === normalized.content
    ) {
      return false;
    }
  }

  let changed = false;
  if (!existing) {
    incrementContentCount(state, normalized.content);
    changed = true;
  } else {
    if (existing.content !== normalized.content) {
      decrementContentCount(state, existing.content);
      incrementContentCount(state, normalized.content);
      changed = true;
    }
  }

  if (
    !existing ||
    existing.created_at !== normalized.created_at ||
    existing.eventId !== normalized.eventId ||
    existing.content !== normalized.content
  ) {
    state.reactionsByPubkey.set(normalized.pubkey, normalized);
    state.lastUpdatedAt = Date.now();
    if (Number.isFinite(normalized.created_at)) {
      const created = Math.max(0, Math.floor(normalized.created_at));
      if (!Number.isFinite(state.latestCreatedAt) || created > state.latestCreatedAt) {
        state.latestCreatedAt = created;
      }
    }
    if (!changed) {
      changed = true;
    }
  }

  return changed;
}

function snapshotState(state) {
  const counts = {};
  let total = 0;
  for (const [content, count] of state.totals.entries()) {
    counts[content] = count;
    total += count;
  }
  const reactions = {};
  for (const [pubkey, record] of state.reactionsByPubkey.entries()) {
    reactions[pubkey] = {
      content: record.content,
      created_at: record.created_at,
      eventId: record.eventId,
    };
  }
  const latestCreatedAt = Number.isFinite(state.latestCreatedAt)
    ? Math.max(0, Math.floor(state.latestCreatedAt))
    : 0;
  return {
    pointer: state.pointer ? { ...state.pointer } : null,
    total,
    counts,
    reactions,
    lastUpdatedAt: state.lastUpdatedAt,
    latestCreatedAt,
    lastSyncedAt: state.lastSyncedAt,
    hydrated: Boolean(state.hydrated),
  };
}

function notifyHandlers(key) {
  const handlers = pointerHandlers.get(key);
  if (!handlers || !handlers.size) {
    return;
  }
  const state = pointerStates.get(key);
  if (!state) {
    return;
  }
  const snapshot = snapshotState(state);
  for (const handler of handlers) {
    if (typeof handler !== "function") {
      continue;
    }
    try {
      handler(snapshot);
    } catch (error) {
      userLogger.warn("[reactionCounter] Reaction handler threw:", error);
    }
  }
}

function subscribeToPointer(pointerInput, handler) {
  if (typeof handler !== "function") {
    return () => {};
  }

  const canonical = canonicalizePointerForState(pointerInput);
  if (!canonical) {
    return () => {};
  }

  const { key, pointer } = canonical;
  const state = ensurePointerState(key, pointer);
  let handlers = pointerHandlers.get(key);
  if (!handlers) {
    handlers = new Set();
    pointerHandlers.set(key, handlers);
  }
  handlers.add(handler);

  if (state) {
    try {
      handler(snapshotState(state));
    } catch (error) {
      userLogger.warn("[reactionCounter] Reaction handler threw:", error);
    }
  }

  const hydrationPromise = ensureReactionHydration(key, pointer, state);
  if (hydrationPromise && typeof hydrationPromise.then === "function") {
    hydrationPromise
      .catch((error) => {
        devLogger.warn(
          "[reactionCounter] Failed to hydrate reaction history:",
          error,
        );
      })
      .finally(() => {
        if (hasHandlers(key)) {
          ensureReactionLiveSubscription(key, pointer);
        }
      });
  } else {
    const liveToken = ensureReactionLiveSubscription(key, pointer);
    if (
      !liveToken &&
      !hydrationPromise &&
      !nostrClient?.pool &&
      typeof nostrClient?.ensurePool === "function"
    ) {
      Promise.resolve()
        .then(() => nostrClient.ensurePool())
        .then(() => {
          if (!hasHandlers(key)) {
            return;
          }
          const followUp = ensureReactionHydration(key, pointer, state);
          if (followUp && typeof followUp.then === "function") {
            followUp
              .catch((error) => {
                devLogger.warn(
                  "[reactionCounter] Failed to hydrate reaction history after pool init:",
                  error,
                );
              })
              .finally(() => {
                if (hasHandlers(key)) {
                  ensureReactionLiveSubscription(key, pointer);
                }
              });
          } else if (hasHandlers(key)) {
            ensureReactionLiveSubscription(key, pointer);
          }
        })
        .catch((error) => {
          devLogger.warn(
            "[reactionCounter] Failed to initialize nostr pool for reactions:",
            error,
          );
        });
    }
  }

  return () => {
    unsubscribeFromPointer(pointer, handler);
  };
}

function unsubscribeFromPointer(pointerInput, handler) {
  const canonical = canonicalizePointerForState(pointerInput);
  if (!canonical) {
    return;
  }

  const { key } = canonical;
  const handlers = pointerHandlers.get(key);
  if (!handlers) {
    return;
  }

  if (handler && typeof handler === "function") {
    handlers.delete(handler);
  } else {
    handlers.clear();
  }

  if (handlers.size === 0) {
    pointerHandlers.delete(key);
    teardownLiveSubscription(key);
  }
}

function getPointerSnapshot(pointerInput) {
  const canonical = canonicalizePointerForState(pointerInput);
  if (!canonical) {
    return null;
  }

  const state = pointerStates.get(canonical.key);
  if (!state) {
    return null;
  }

  return snapshotState(state);
}

export function ingestLocalReaction({ event, pointer }) {
  if (!event || !pointer) {
    return;
  }
  try {
    const canonical = canonicalizePointerForState(pointer);
    if (!canonical) {
      return;
    }
    const changed = applyReactionToState(canonical.key, canonical.pointer, event);
    if (changed) {
      notifyHandlers(canonical.key);
    }
  } catch (error) {
    userLogger.warn("[reactionCounter] Failed to ingest local reaction:", error);
  }
}

function hasHandlers(key) {
  const handlers = pointerHandlers.get(key);
  return Boolean(handlers && handlers.size);
}

function getPointerSignature(pointer) {
  if (!pointer || typeof pointer !== "object") {
    return "";
  }
  const type = pointer.type === "a" ? "a" : pointer.type === "e" ? "e" : "";
  const value =
    typeof pointer.value === "string" && pointer.value.trim()
      ? pointer.value.trim()
      : "";
  if (!type || !value) {
    return "";
  }
  const relay =
    typeof pointer.relay === "string" && pointer.relay.trim()
      ? pointer.relay.trim()
      : "";
  return `${type}:${value}:${relay}`;
}

function gatherRelayCandidates(pointer) {
  const relays = [];
  const seen = new Set();

  const addRelay = (candidate) => {
    if (typeof candidate !== "string") {
      return;
    }
    const trimmed = candidate.trim();
    if (!trimmed || seen.has(trimmed)) {
      return;
    }
    seen.add(trimmed);
    relays.push(trimmed);
  };

  if (pointer && typeof pointer.relay === "string") {
    addRelay(pointer.relay);
  }

  const client = nostrClient || null;
  const candidateLists = [client?.readRelays, client?.relays];

  for (const list of candidateLists) {
    if (!list) {
      continue;
    }
    if (Array.isArray(list)) {
      for (const relay of list) {
        addRelay(relay);
      }
    } else if (list instanceof Set) {
      for (const relay of list) {
        addRelay(relay);
      }
    }
  }

  return relays;
}

function buildReactionFilters(pointer, { limit, since } = {}) {
  if (!pointer || typeof pointer !== "object") {
    return [];
  }

  const type = pointer.type === "a" ? "a" : pointer.type === "e" ? "e" : "";
  const value =
    typeof pointer.value === "string" && pointer.value.trim()
      ? pointer.value.trim()
      : "";
  if (!type || !value) {
    return [];
  }

  const filter = { kinds: [REACTION_EVENT_KIND] };

  if (type === "a") {
    filter["#a"] = [value];
  } else {
    filter["#e"] = [value];
  }

  if (Number.isFinite(limit) && limit > 0) {
    filter.limit = Math.max(1, Math.floor(limit));
  }

  if (Number.isFinite(since) && since >= 0) {
    filter.since = Math.max(0, Math.floor(since));
  }

  return [filter];
}

function buildPointerQuery(pointer, options = {}) {
  const client = nostrClient || null;
  const pool = client?.pool || null;
  if (!pool || typeof pool.list !== "function") {
    return null;
  }

  const relays = gatherRelayCandidates(pointer);
  if (!relays.length) {
    return null;
  }

  const filters = buildReactionFilters(pointer, options);
  if (!filters.length) {
    return null;
  }

  return { pool, relays, filters };
}

async function hydratePointerState(key, pointer, state) {
  const query = buildPointerQuery(pointer, { limit: REACTION_HYDRATION_LIMIT });
  if (!query) {
    return null;
  }

  let events = [];
  try {
    events = await query.pool.list(query.relays, query.filters);
  } catch (error) {
    throw error;
  }

  const eventList = Array.isArray(events) ? events : [];
  const ordered = eventList
    .filter((event) => event && typeof event === "object")
    .sort((a, b) => {
      const aTime = Number.isFinite(a?.created_at) ? Number(a.created_at) : 0;
      const bTime = Number.isFinite(b?.created_at) ? Number(b.created_at) : 0;
      return aTime - bTime;
    });

  let changed = false;
  for (const event of ordered) {
    if (applyReactionToState(key, pointer, event)) {
      changed = true;
    }
  }

  state.lastSyncedAt = Date.now();
  state.hydrated = true;

  if (changed && hasHandlers(key)) {
    notifyHandlers(key);
  } else if (!ordered.length && hasHandlers(key)) {
    notifyHandlers(key);
  }

  return null;
}

function ensureReactionHydration(key, pointer, state) {
  if (!state || state.hydrated) {
    return null;
  }

  if (pointerHydrationPromises.has(key)) {
    return pointerHydrationPromises.get(key);
  }

  const query = buildPointerQuery(pointer, { limit: REACTION_HYDRATION_LIMIT });
  if (!query) {
    return null;
  }

  const promise = hydratePointerState(key, pointer, state)
    .catch((error) => {
      devLogger.warn("[reactionCounter] Failed to hydrate reaction history:", error);
    })
    .finally(() => {
      pointerHydrationPromises.delete(key);
    });

  pointerHydrationPromises.set(key, promise);
  return promise;
}

function teardownLiveSubscription(key) {
  const existing = pointerSubscriptions.get(key);
  if (!existing) {
    return;
  }
  pointerSubscriptions.delete(key);
  const unsub = existing.unsub;
  if (typeof unsub === "function") {
    try {
      unsub();
    } catch (error) {
      devLogger.warn("[reactionCounter] Failed to tear down reaction stream:", error);
    }
  }
}

function ensureReactionLiveSubscription(key, pointer) {
  const signature = getPointerSignature(pointer);
  if (!signature) {
    teardownLiveSubscription(key);
    return null;
  }

  const existing = pointerSubscriptions.get(key);
  if (existing && existing.signature === signature) {
    return existing.unsub;
  }

  teardownLiveSubscription(key);

  const query = buildPointerQuery(pointer, {});
  if (!query || typeof query.pool.sub !== "function") {
    return null;
  }

  const state = pointerStates.get(key);
  const sinceSeconds =
    Number.isFinite(state?.latestCreatedAt) && state.latestCreatedAt > 0
      ? Math.max(0, Math.floor(state.latestCreatedAt))
      : null;
  if (Number.isFinite(sinceSeconds)) {
    for (const filter of query.filters) {
      if (filter && typeof filter === "object") {
        filter.since = sinceSeconds;
      }
    }
  }

  let subscription;
  try {
    subscription = query.pool.sub(query.relays, query.filters);
  } catch (error) {
    devLogger.warn("[reactionCounter] Failed to subscribe to reaction events:", error);
    return null;
  }

  const handleEvent = (event) => {
    if (!event) {
      return;
    }
    try {
      const changed = applyReactionToState(key, pointer, event);
      if (changed && hasHandlers(key)) {
        notifyHandlers(key);
      }
    } catch (error) {
      devLogger.warn("[reactionCounter] Reaction event handler failed:", error);
    }
  };

  if (subscription && typeof subscription.on === "function") {
    subscription.on("event", handleEvent);
  }

  const originalUnsub =
    subscription && typeof subscription.unsub === "function"
      ? subscription.unsub.bind(subscription)
      : null;

  const unsubscribe = () => {
    if (originalUnsub) {
      try {
        originalUnsub();
      } catch (error) {
        devLogger.warn(
          "[reactionCounter] Failed to unsubscribe from reaction events:",
          error
        );
      }
    }
  };

  pointerSubscriptions.set(key, {
    signature,
    unsub: unsubscribe,
  });

  return unsubscribe;
}

export const reactionCounter = {
  async publish(pointer, options = {}) {
    try {
      const publishOptions = { ...options };

      const pointerRelayFromPointer = (() => {
        if (Array.isArray(pointer) && pointer.length >= 3) {
          const relay = pointer[2];
          if (typeof relay === "string" && relay.trim()) {
            return relay.trim();
          }
        }
        if (pointer && typeof pointer === "object") {
          const relay = pointer.relay;
          if (typeof relay === "string" && relay.trim()) {
            return relay.trim();
          }
        }
        return "";
      })();

      const pointerRelay =
        typeof publishOptions.pointerRelay === "string" && publishOptions.pointerRelay.trim()
          ? publishOptions.pointerRelay.trim()
          : pointerRelayFromPointer;

      if (pointerRelay && !publishOptions.pointerRelay) {
        publishOptions.pointerRelay = pointerRelay;
      }

      const enrichedPointer = (() => {
        if (!pointerRelay) {
          return pointer;
        }

        if (Array.isArray(pointer) && pointer.length >= 2) {
          const [type, value] = pointer;
          return [type, value, pointerRelay];
        }

        if (pointer && typeof pointer === "object") {
          return { ...pointer, relay: pointerRelay };
        }

        return pointer;
      })();

      const explicitAuthor =
        typeof publishOptions.targetAuthorPubkey === "string" &&
        publishOptions.targetAuthorPubkey.trim()
          ? publishOptions.targetAuthorPubkey.trim()
          : "";

      if (!explicitAuthor) {
        const fallbackAuthor = (() => {
          if (
            typeof publishOptions.authorPubkey === "string" &&
            publishOptions.authorPubkey.trim()
          ) {
            return publishOptions.authorPubkey.trim();
          }
          if (
            typeof publishOptions.currentVideoPubkey === "string" &&
            publishOptions.currentVideoPubkey.trim()
          ) {
            return publishOptions.currentVideoPubkey.trim();
          }
          if (
            publishOptions.video &&
            typeof publishOptions.video.pubkey === "string" &&
            publishOptions.video.pubkey.trim()
          ) {
            return publishOptions.video.pubkey.trim();
          }
          return "";
        })();

        if (fallbackAuthor) {
          publishOptions.targetAuthorPubkey = fallbackAuthor;
        }
      }

      const result = await publishVideoReaction(enrichedPointer, publishOptions);
      if (!result || !result.ok) {
        userLogger.warn(
          "[reactionCounter] Reaction publish rejected by relays:",
          result?.results || result
        );
      } else if (Array.isArray(result.acceptedRelays)) {
        devLogger.info(
          `[reactionCounter] Reaction accepted by ${result.acceptedRelays.length} relay(s):`,
          result.acceptedRelays.join(", ")
        );
        const eventPayload = result.event || {
          pubkey:
            typeof publishOptions.actorPubkey === "string"
              ? publishOptions.actorPubkey
              : undefined,
          content: publishOptions.content,
          created_at: publishOptions.created_at,
        };
        if (eventPayload && eventPayload.pubkey) {
          ingestLocalReaction({
            pointer: enrichedPointer,
            event: eventPayload,
          });
        }
      }
      return result;
    } catch (error) {
      userLogger.warn("[reactionCounter] Failed to publish reaction event:", error);
      throw error;
    }
  },
};

reactionCounter.ingestLocalReaction = ingestLocalReaction;
reactionCounter.subscribe = subscribeToPointer;
reactionCounter.unsubscribe = unsubscribeFromPointer;
reactionCounter.getSnapshot = getPointerSnapshot;

export default reactionCounter;
export {
  subscribeToPointer as subscribeToReactions,
  unsubscribeFromPointer as unsubscribeFromReactions,
  getPointerSnapshot as getReactionSnapshot,
};
