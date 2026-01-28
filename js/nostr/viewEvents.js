import {
  VIEW_COUNT_DEDUPE_WINDOW_SECONDS,
  VIEW_COUNT_BACKFILL_MAX_DAYS,
} from "../config.js";
import {
  buildViewEvent,
  getNostrEventSchema,
  NOTE_TYPES,
  sanitizeAdditionalTags,
} from "../nostrEventSchemas.js";
import { publishEventToRelay } from "../nostrPublish.js";
import { RELAY_URLS } from "./toolkit.js";
import { normalizePointerInput } from "./watchHistory.js";
import { devLogger, userLogger } from "../utils/logger.js";
import { logViewCountFailure } from "./countDiagnostics.js";
import { queueSignEvent } from "./signRequestQueue.js";

const VIEW_EVENT_GUARD_PREFIX = "bitvid:viewed";

const viewEventPublishMemory = new Map();

const VIEW_EVENT_SCHEMA = getNostrEventSchema(NOTE_TYPES.VIEW_EVENT);
export const VIEW_EVENT_KIND = Number.isFinite(VIEW_EVENT_SCHEMA?.kind)
  ? VIEW_EVENT_SCHEMA.kind
  : 30079;

function resolveVideoViewPointer(pointer) {
  const normalized = normalizePointerInput(pointer);
  if (!normalized || typeof normalized.value !== "string") {
    throw new Error("Invalid video pointer supplied for view lookup.");
  }

  const value = normalized.value.trim();
  if (!value) {
    throw new Error("Invalid video pointer supplied for view lookup.");
  }

  const type = normalized.type === "a" ? "a" : "e";
  const descriptor = { type, value };

  if (typeof normalized.relay === "string" && normalized.relay.trim()) {
    descriptor.relay = normalized.relay.trim();
  }

  return descriptor;
}

export function createVideoViewEventFilters(pointer) {
  let resolved;

  if (
    pointer &&
    typeof pointer === "object" &&
    (pointer.type === "a" || pointer.type === "e") &&
    typeof pointer.value === "string"
  ) {
    const value = pointer.value.trim();
    if (!value) {
      throw new Error("Invalid video pointer supplied for view lookup.");
    }
    resolved = { type: pointer.type === "a" ? "a" : "e", value };
    if (typeof pointer.relay === "string" && pointer.relay.trim()) {
      resolved.relay = pointer.relay.trim();
    }
  } else {
    resolved = resolveVideoViewPointer(pointer);
  }

  const pointerFilter = {
    kinds: [VIEW_EVENT_KIND],
    "#t": ["view"],
  };

  if (resolved.type === "a") {
    pointerFilter["#a"] = [resolved.value];
  } else {
    pointerFilter["#e"] = [resolved.value];
  }

  const filters = [pointerFilter];

  return { pointer: resolved, filters };
}

export function deriveViewEventBucketIndex(createdAtSeconds) {
  const timestamp = Number.isFinite(createdAtSeconds)
    ? Math.floor(createdAtSeconds)
    : Math.floor(Date.now() / 1000);
  const windowSize = Math.max(
    1,
    Number(VIEW_COUNT_DEDUPE_WINDOW_SECONDS) || 0
  );
  return Math.floor(timestamp / windowSize);
}

export function getViewEventGuardWindowMs() {
  const windowSeconds = Math.max(
    1,
    Number(VIEW_COUNT_DEDUPE_WINDOW_SECONDS) || 0
  );
  return windowSeconds * 1000;
}

export function deriveViewEventPointerScope(pointer) {
  const pointerValue =
    typeof pointer?.value === "string" ? pointer.value.trim().toLowerCase() : "";
  if (!pointerValue) {
    return "";
  }
  const pointerType = pointer?.type === "a" ? "a" : "e";
  return `${pointerType}:${pointerValue}`;
}

function generateViewEventEntropy() {
  const cryptoRef =
    (typeof globalThis !== "undefined" &&
      /** @type {Crypto | undefined} */ (globalThis.crypto)) ||
    null;

  if (cryptoRef && typeof cryptoRef.getRandomValues === "function") {
    try {
      const buffer = new Uint32Array(2);
      cryptoRef.getRandomValues(buffer);
      return Array.from(buffer, (value) =>
        value.toString(16).padStart(8, "0")
      ).join("");
    } catch (error) {
      devLogger.warn("[nostr] Failed to gather crypto entropy for view event:", error);
    }
  }

  const fallbackA = Math.floor(Math.random() * 0xffffffff)
    .toString(16)
    .padStart(8, "0");
  const fallbackB = Math.floor(Math.random() * 0xffffffff)
    .toString(16)
    .padStart(8, "0");
  return `${fallbackA}${fallbackB}`;
}

function generateViewEventDedupeTag(actorPubkey, pointer, createdAtSeconds) {
  const scope = deriveViewEventPointerScope(pointer) || "unknown";
  const normalizedActor =
    typeof actorPubkey === "string" && actorPubkey.trim()
      ? actorPubkey.trim().toLowerCase()
      : "anon";
  const timestamp = Number.isFinite(createdAtSeconds)
    ? Math.max(0, Math.floor(createdAtSeconds))
    : Math.floor(Date.now() / 1000);
  const entropy = generateViewEventEntropy();
  return `${scope}:${normalizedActor}:${timestamp}:${entropy}`;
}

export function hasRecentViewPublish(scope, bucketIndex, actorPubkey) {
  if (!scope || !Number.isFinite(bucketIndex)) {
    return false;
  }

  const windowMs = getViewEventGuardWindowMs();
  const now = Date.now();
  const safeActor =
    typeof actorPubkey === "string" && actorPubkey.trim()
      ? actorPubkey.trim().toLowerCase()
      : "anon";

  let actorMemory = viewEventPublishMemory.get(safeActor);
  if (!actorMemory) {
    actorMemory = new Map();
    viewEventPublishMemory.set(safeActor, actorMemory);
  }

  const entry = actorMemory.get(scope);

  if (entry) {
    const age = now - Number(entry.seenAt);
    if (!Number.isFinite(entry.seenAt) || age >= windowMs) {
      actorMemory.delete(scope);
    } else if (Number(entry.bucket) === bucketIndex) {
      return true;
    }
  }

  if (typeof localStorage === "undefined") {
    return false;
  }

  const storageKey = `${VIEW_EVENT_GUARD_PREFIX}:${safeActor}:${scope}`;
  let rawValue = null;
  try {
    rawValue = localStorage.getItem(storageKey);
  } catch (error) {
    devLogger.warn("[nostr] Failed to read view guard entry:", error);
    return false;
  }

  if (typeof rawValue !== "string" || !rawValue) {
    return false;
  }

  const [storedBucketRaw, storedSeenRaw] = rawValue.split(":", 2);
  const storedBucket = Number(storedBucketRaw);
  const storedSeenAt = Number(storedSeenRaw);

  if (!Number.isFinite(storedBucket) || !Number.isFinite(storedSeenAt)) {
    try {
      localStorage.removeItem(storageKey);
    } catch (error) {
      devLogger.warn("[nostr] Failed to clear corrupt view guard entry:", error);
    }
    return false;
  }

  if (now - storedSeenAt >= windowMs) {
    try {
      localStorage.removeItem(storageKey);
    } catch (error) {
      devLogger.warn("[nostr] Failed to remove expired view guard entry:", error);
    }
    return false;
  }

  actorMemory.set(scope, {
    bucket: storedBucket,
    seenAt: storedSeenAt,
  });

  return storedBucket === bucketIndex;
}

export function rememberViewPublish(scope, bucketIndex, actorPubkey) {
  if (!scope || !Number.isFinite(bucketIndex)) {
    return;
  }

  const now = Date.now();
  const windowMs = getViewEventGuardWindowMs();
  const safeActor =
    typeof actorPubkey === "string" && actorPubkey.trim()
      ? actorPubkey.trim().toLowerCase()
      : "anon";

  let actorMemory = viewEventPublishMemory.get(safeActor);
  if (!actorMemory) {
    actorMemory = new Map();
    viewEventPublishMemory.set(safeActor, actorMemory);
  }

  const entry = actorMemory.get(scope);
  if (entry && Number.isFinite(entry.seenAt) && now - entry.seenAt >= windowMs) {
    actorMemory.delete(scope);
  }

  actorMemory.set(scope, {
    bucket: bucketIndex,
    seenAt: now,
  });

  if (typeof localStorage === "undefined") {
    return;
  }

  const storageKey = `${VIEW_EVENT_GUARD_PREFIX}:${safeActor}:${scope}`;
  try {
    localStorage.setItem(storageKey, `${bucketIndex}:${now}`);
  } catch (error) {
    devLogger.warn("[nostr] Failed to persist view guard entry:", error);
  }
}

function isVideoViewEvent(event, pointer) {
  if (!event || typeof event !== "object") {
    return false;
  }

  if (!Number.isFinite(event.kind) || event.kind !== VIEW_EVENT_KIND) {
    return false;
  }

  const tags = Array.isArray(event.tags) ? event.tags : [];
  let hasViewTag = false;
  let matchesPointer = false;

  const pointerValueRaw =
    typeof pointer?.value === "string" ? pointer.value.trim() : "";
  const pointerValueLower = pointerValueRaw.toLowerCase();
  const pointerType = pointer?.type === "a" ? "a" : "e";

  for (const tag of tags) {
    if (!Array.isArray(tag) || tag.length < 2) {
      continue;
    }

    const tagName = typeof tag[0] === "string" ? tag[0].toLowerCase() : "";
    const tagValue = typeof tag[1] === "string" ? tag[1].trim().toLowerCase() : "";

    if (!tagName || !tagValue) {
      continue;
    }

    if (tagName === "t" && tagValue === "view") {
      hasViewTag = true;
      continue;
    }

    if (pointerType === "a" && tagName === "a" && tagValue === pointerValueLower) {
      matchesPointer = true;
      continue;
    }

    if (pointerType === "e" && tagName === "e" && tagValue === pointerValueLower) {
      matchesPointer = true;
      continue;
    }

  }

  return hasViewTag && matchesPointer;
}

const VIEW_EVENT_COUNT_SECONDS_PER_DAY = 86_400;

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

function sanitizeRelayList(primary, fallback) {
  if (Array.isArray(primary) && primary.length) {
    return primary;
  }
  if (Array.isArray(fallback) && fallback.length) {
    return fallback;
  }
  return RELAY_URLS;
}

export async function listVideoViewEvents(client, pointer, options = {}) {
  const pool = client?.pool;
  const canQueryPool = pool && typeof pool.list === "function";

  if (!canQueryPool) {
    if (
      client &&
      Object.prototype.hasOwnProperty.call(client, "listVideoViewEvents") &&
      typeof client.listVideoViewEvents === "function"
    ) {
      return client.listVideoViewEvents(pointer, options);
    }
    return [];
  }

  const { pointer: pointerDescriptor, filters } = createVideoViewEventFilters(
    pointer
  );
  const { since, until, limit, relays } = options || {};

  for (const filter of filters) {
    if (!filter || typeof filter !== "object") {
      continue;
    }
    if (Number.isFinite(since)) {
      filter.since = Math.floor(since);
    }
    if (Number.isFinite(until)) {
      filter.until = Math.floor(until);
    }
    if (Number.isFinite(limit) && limit > 0) {
      filter.limit = Math.floor(limit);
    }
  }

  const relayList = sanitizeRelayList(relays, client.relays);

  let rawResults;
  try {
    rawResults = await pool.list(relayList, filters);
  } catch (error) {
    devLogger.warn("[nostr] Failed to list video view events:", error);
    return [];
  }

  const flattened = flattenListResults(rawResults);
  const dedupe = new Map();
  const order = [];

  for (const event of flattened) {
    if (!isVideoViewEvent(event, pointerDescriptor)) {
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

  return order
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
}

export function subscribeVideoViewEvents(client, pointer, options = {}) {
  const pool = client?.pool;
  const canSubscribe = pool && typeof pool.sub === "function";

  if (!canSubscribe) {
    devLogger.warn("[nostr] Unable to subscribe to view events: pool missing.");
    return () => {};
  }

  const { pointer: pointerDescriptor, filters } = createVideoViewEventFilters(
    pointer
  );

  if (Number.isFinite(options?.since)) {
    for (const filter of filters) {
      if (filter && typeof filter === "object") {
        filter.since = Math.floor(options.since);
      }
    }
  }

  const relayList = sanitizeRelayList(options?.relays, client.relays);
  const onEvent = typeof options?.onEvent === "function" ? options.onEvent : null;

  let subscription;
  try {
    subscription = pool.sub(relayList, filters);
  } catch (error) {
    devLogger.warn("[nostr] Failed to open video view subscription:", error);
    return () => {};
  }

  if (onEvent) {
    subscription.on("event", (event) => {
      if (isVideoViewEvent(event, pointerDescriptor)) {
        try {
          onEvent(event);
        } catch (error) {
          devLogger.warn("[nostr] Video view event handler threw:", error);
        }
      }
    });
  }

  const originalUnsub =
    typeof subscription.unsub === "function"
      ? subscription.unsub.bind(subscription)
      : null;

  let unsubscribed = false;
  return () => {
    if (unsubscribed) {
      return;
    }
    unsubscribed = true;
    if (originalUnsub) {
      try {
        originalUnsub();
      } catch (error) {
        devLogger.warn(
          "[nostr] Failed to unsubscribe from video view events:",
          error
        );
      }
    }
  };
}

export async function countVideoViewEvents(client, pointer, options = {}) {
  const relayList =
    Array.isArray(options?.relays) && options.relays.length
      ? options.relays
      : undefined;

  const fallbackListOptions = (() => {
    const listOptions = {};

    if (relayList) {
      listOptions.relays = relayList;
    }

    if (Number.isFinite(options?.since)) {
      listOptions.since = Math.floor(options.since);
    } else {
      const horizonDaysRaw = Number(VIEW_COUNT_BACKFILL_MAX_DAYS);
      const horizonDays = Number.isFinite(horizonDaysRaw)
        ? Math.max(0, Math.floor(horizonDaysRaw))
        : 0;
      if (horizonDays > 0) {
        const nowSeconds = Math.floor(Date.now() / 1000);
        listOptions.since = Math.max(
          0,
          nowSeconds - horizonDays * VIEW_EVENT_COUNT_SECONDS_PER_DAY
        );
      }
    }

    if (Number.isFinite(options?.until)) {
      listOptions.until = Math.floor(options.until);
    }

    if (Number.isFinite(options?.limit) && options.limit > 0) {
      listOptions.limit = Math.floor(options.limit);
    }

    return listOptions;
  })();

  const canAttemptCount =
    typeof client?.countEventsAcrossRelays === "function";

  if (!canAttemptCount) {
    const events = await listVideoViewEvents(client, pointer, {
      ...fallbackListOptions,
    });
    return {
      total: Array.isArray(events) ? events.length : 0,
      perRelay: [],
      best: null,
      fallback: true,
    };
  }

  const { filters } = createVideoViewEventFilters(pointer);
  const pointerFilter = Array.isArray(filters) && filters.length ? filters[0] : null;
  if (!pointerFilter || typeof pointerFilter !== "object") {
    throw new Error("Invalid video pointer supplied for view lookup.");
  }

  const signal = options?.signal;
  const normalizeAbortError = () => {
    if (signal?.reason instanceof Error) {
      return signal.reason;
    }
    if (typeof DOMException === "function") {
      return new DOMException("Operation aborted", "AbortError");
    }
    const error = new Error("Operation aborted");
    error.name = "AbortError";
    return error;
  };
  if (signal?.aborted) {
    throw normalizeAbortError();
  }

  try {
    const result = await client.countEventsAcrossRelays([pointerFilter], {
      relays: sanitizeRelayList(relayList, client.relays),
      timeoutMs: options?.timeoutMs,
    });

    if (result?.perRelay?.some((entry) => entry && entry.ok)) {
      return { ...result, fallback: false };
    }
  } catch (error) {
    if (error?.code !== "count-unsupported") {
      logViewCountFailure(error);
    }
  }

  if (signal?.aborted) {
    throw normalizeAbortError();
  }

  const abortPromise =
    signal &&
    typeof signal === "object" &&
    typeof signal.addEventListener === "function"
      ? new Promise((_, reject) => {
          signal.addEventListener(
            "abort",
            () => {
              reject(normalizeAbortError());
            },
            { once: true }
          );
        })
      : null;

  const listPromise = listVideoViewEvents(client, pointer, {
    ...fallbackListOptions,
  });

  const events = abortPromise
    ? await Promise.race([listPromise, abortPromise])
    : await listPromise;

  const uniqueCount = Array.isArray(events)
    ? (() => {
        const withIds = events
          .filter((event) => event && typeof event.id === "string")
          .map((event) => event.id);
        if (withIds.length === 0) {
          return events.length;
        }
        return new Set(withIds).size;
      })()
    : 0;

  return {
    total: uniqueCount,
    perRelay: [],
    best: null,
    fallback: true,
  };
}

let ingestLocalViewEventRef = null;

async function loadIngestLocalViewEvent() {
  if (typeof ingestLocalViewEventRef === "function") {
    return ingestLocalViewEventRef;
  }
  try {
    const module = await import("../viewCounter.js");
    if (typeof module?.ingestLocalViewEvent === "function") {
      ingestLocalViewEventRef = module.ingestLocalViewEvent;
      return ingestLocalViewEventRef;
    }
  } catch (error) {
    devLogger.warn("[nostr] Failed to load view counter ingest helper:", error);
  }
  return null;
}

export async function publishViewEvent(
  client,
  videoPointer,
  options = {},
  {
    resolveActiveSigner,
    shouldRequestExtensionPermissions,
    signEventWithPrivateKey,
    DEFAULT_NIP07_PERMISSION_METHODS,
  }
) {
  if (!client?.pool) {
    return { ok: false, error: "nostr-uninitialized" };
  }

  const pointer = normalizePointerInput(videoPointer);
  if (!pointer) {
    return { ok: false, error: "invalid-pointer" };
  }

  const actorPubkey = await client.ensureSessionActor();
  // actorPubkey derived via client.ensureSessionActor()
  if (!actorPubkey) {
    return { ok: false, error: "missing-actor" };
  }

  const createdAt =
    typeof options.created_at === "number" && options.created_at > 0
      ? Math.floor(options.created_at)
      : Math.floor(Date.now() / 1000);

  const guardScope = deriveViewEventPointerScope(pointer);
  const guardBucket = deriveViewEventBucketIndex(createdAt);
  if (guardScope && hasRecentViewPublish(guardScope, guardBucket, actorPubkey)) {
    devLogger.info("[nostr] Skipping duplicate view publish for scope", guardScope);
    return {
      ok: true,
      duplicate: true,
      event: null,
      results: [],
      acceptedRelays: [],
    };
  }

  const normalizedActor =
    typeof actorPubkey === "string" ? actorPubkey.toLowerCase() : "";
  const normalizedLogged =
    typeof client.pubkey === "string" ? client.pubkey.toLowerCase() : "";
  const usingSessionActor =
    normalizedActor && normalizedActor !== normalizedLogged;

  const additionalTags = sanitizeAdditionalTags(options.additionalTags);

  const pointerTag =
    pointer.type === "a"
      ? pointer.relay
        ? ["a", pointer.value, pointer.relay]
        : ["a", pointer.value]
      : pointer.relay
      ? ["e", pointer.value, pointer.relay]
      : ["e", pointer.value];

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
      devLogger.warn("[nostr] Failed to serialize custom view event content:", error);
      content = "";
    }
  }

  if (!content) {
    const payload = {
      target: {
        type: pointer.type,
        value: pointer.value,
      },
      created_at: createdAt,
    };
    if (pointer.relay) {
      payload.target.relay = pointer.relay;
    }
    try {
      content = JSON.stringify(payload);
    } catch (error) {
      devLogger.warn("[nostr] Failed to serialize default view event content:", error);
      content = "";
    }
  }

  const event = buildViewEvent({
    pubkey: actorPubkey,
    created_at: createdAt,
    pointerValue: pointer.value,
    pointerTag,
    dedupeTag: generateViewEventDedupeTag(actorPubkey, pointer, createdAt),
    includeSessionTag: usingSessionActor,
    additionalTags,
    content,
  });

  let signedEvent = null;

  const signer = resolveActiveSigner(actorPubkey);
  const canUseActiveSigner =
    normalizedActor &&
    normalizedActor === normalizedLogged &&
    signer &&
    typeof signer.signEvent === "function";

  if (canUseActiveSigner) {
    let permissionResult = { ok: true };
    const hasCachedPermissions =
      typeof client?.hasRequiredExtensionPermissions === "function" &&
      client.hasRequiredExtensionPermissions(DEFAULT_NIP07_PERMISSION_METHODS);

    if (shouldRequestExtensionPermissions(signer) && !hasCachedPermissions) {
      const permissionGate =
        typeof client?.ensureExtensionPermissionsGate === "function"
          ? client.ensureExtensionPermissionsGate.bind(client)
          : typeof client?.ensureExtensionPermissions === "function"
            ? client.ensureExtensionPermissions.bind(client)
            : null;

      if (permissionGate) {
        permissionResult = await permissionGate(DEFAULT_NIP07_PERMISSION_METHODS);
      }
    }
    if (permissionResult.ok) {
      try {
        signedEvent = await queueSignEvent(signer, event, {
          timeoutMs: options?.timeoutMs,
        });
      } catch (error) {
        userLogger.warn(
          "[nostr] Failed to sign view event with active signer:",
          error,
        );
        return { ok: false, error: "signing-failed", details: error };
      }
    } else {
      userLogger.warn(
        "[nostr] Active signer permissions missing; signing view event with session key.",
        permissionResult.error,
      );
    }
  }

  if (!signedEvent) {
    try {
      if (!client.sessionActor || client.sessionActor.pubkey !== actorPubkey) {
        await client.ensureSessionActor(true);
      }
      if (!client.sessionActor || client.sessionActor.pubkey !== actorPubkey) {
        throw new Error("session-actor-mismatch");
      }
      const privateKey = client.sessionActor.privateKey;
      signedEvent = signEventWithPrivateKey(event, privateKey);
    } catch (error) {
      userLogger.warn("[nostr] Failed to sign view event with session key:", error);
      return { ok: false, error: "signing-failed", details: error };
    }
  }

  const relayList = sanitizeRelayList(options.relays, client.relays);

  const publishResults = await Promise.all(
    relayList.map((url) => publishEventToRelay(client.pool, url, signedEvent))
  );

  const acceptedRelays = publishResults
    .filter((result) => result.success)
    .map((result) => result.url)
    .filter((url) => typeof url === "string" && url);
  const success = acceptedRelays.length > 0;
  if (success) {
    if (guardScope) {
      rememberViewPublish(guardScope, guardBucket, actorPubkey);
    }
    devLogger.info(
      `[nostr] View event accepted by ${acceptedRelays.length} relay(s):`,
      acceptedRelays.join(", ")
    );
  } else {
    userLogger.warn("[nostr] View event rejected by relays:", publishResults);
  }

  return {
    ok: success,
    event: signedEvent,
    results: publishResults,
    acceptedRelays,
  };
}

export async function recordVideoView(
  client,
  videoPointer,
  options = {},
  helpers
) {
  const pointer = normalizePointerInput(videoPointer);
  if (!pointer) {
    return { ok: false, error: "invalid-pointer" };
  }

  const view = await publishViewEvent(client, pointer, options, helpers);

  if (view?.ok && view.event) {
    try {
      const ingest = await loadIngestLocalViewEvent();
      if (typeof ingest === "function") {
        ingest({ event: view.event, pointer });
      }
    } catch (error) {
      devLogger.warn("[nostr] Failed to ingest optimistic view event:", error);
    }
  }

  return view;
}

export const __testExports = {
  resolveVideoViewPointer,
  generateViewEventEntropy,
  generateViewEventDedupeTag,
  isVideoViewEvent,
  loadIngestLocalViewEvent,
};
