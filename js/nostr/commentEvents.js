import {
  buildCommentEvent,
  getNostrEventSchema,
  NOTE_TYPES,
} from "../nostrEventSchemas.js";
import { publishEventToRelay } from "../nostrPublish.js";
import { RELAY_URLS } from "./toolkit.js";
import { normalizePointerInput } from "./watchHistory.js";
import { devLogger, userLogger } from "../utils/logger.js";

const COMMENT_EVENT_SCHEMA = getNostrEventSchema(NOTE_TYPES.VIDEO_COMMENT);
export const COMMENT_EVENT_KIND = Number.isFinite(COMMENT_EVENT_SCHEMA?.kind)
  ? COMMENT_EVENT_SCHEMA.kind
  : 1;

function sanitizeRelayList(primary, fallback) {
  if (Array.isArray(primary) && primary.length) {
    return primary;
  }
  if (Array.isArray(fallback) && fallback.length) {
    return fallback;
  }
  return RELAY_URLS;
}

function normalizeRelay(candidate) {
  if (typeof candidate === "string" && candidate.trim()) {
    return candidate.trim();
  }
  if (Array.isArray(candidate)) {
    const relayCandidate = candidate[2];
    if (typeof relayCandidate === "string" && relayCandidate.trim()) {
      return relayCandidate.trim();
    }
  }
  if (candidate && typeof candidate === "object") {
    if (typeof candidate.relay === "string" && candidate.relay.trim()) {
      return candidate.relay.trim();
    }
    if (typeof candidate.url === "string" && candidate.url.trim()) {
      return candidate.url.trim();
    }
    if (Array.isArray(candidate.relays)) {
      for (const relayCandidate of candidate.relays) {
        if (typeof relayCandidate === "string" && relayCandidate.trim()) {
          return relayCandidate.trim();
        }
      }
    }
    if (candidate.tag) {
      return normalizeRelay(candidate.tag);
    }
    if (candidate.pointer) {
      return normalizeRelay(candidate.pointer);
    }
  }
  return "";
}

function normalizePointerCandidate(candidate, expectedType) {
  if (!candidate) {
    return null;
  }

  if (Array.isArray(candidate)) {
    if (
      candidate[0] === expectedType &&
      typeof candidate[1] === "string" &&
      candidate[1].trim()
    ) {
      return {
        value: candidate[1].trim(),
        relay: normalizeRelay(candidate),
      };
    }
    return null;
  }

  if (typeof candidate === "string") {
    const pointer = normalizePointerInput(candidate);
    if (pointer?.type === expectedType && pointer.value) {
      return {
        value: pointer.value.trim(),
        relay: normalizeRelay(pointer),
      };
    }
    if (expectedType === "e" && candidate.trim() && !candidate.includes(":")) {
      return { value: candidate.trim(), relay: "" };
    }
    if (expectedType === "a" && candidate.trim() && candidate.includes(":")) {
      return { value: candidate.trim(), relay: "" };
    }
    return null;
  }

  if (candidate && typeof candidate === "object") {
    if (
      typeof candidate.type === "string" &&
      candidate.type === expectedType &&
      typeof candidate.value === "string" &&
      candidate.value.trim()
    ) {
      return {
        value: candidate.value.trim(),
        relay: normalizeRelay(candidate),
      };
    }
    if (
      expectedType === "e" &&
      typeof candidate.id === "string" &&
      candidate.id.trim()
    ) {
      return {
        value: candidate.id.trim(),
        relay: normalizeRelay(candidate),
      };
    }
    if (
      expectedType === "a" &&
      typeof candidate.address === "string" &&
      candidate.address.trim()
    ) {
      return {
        value: candidate.address.trim(),
        relay: normalizeRelay(candidate),
      };
    }
    if (candidate.tag) {
      return normalizePointerCandidate(candidate.tag, expectedType);
    }
    if (candidate.pointer) {
      return normalizePointerCandidate(candidate.pointer, expectedType);
    }
  }

  return null;
}

function pickString(...candidates) {
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }
  return "";
}

function normalizeCommentTarget(targetInput = {}, overrides = {}) {
  const target = targetInput && typeof targetInput === "object" ? targetInput : {};
  const options = overrides && typeof overrides === "object" ? overrides : {};

  const videoEventPointer =
    normalizePointerCandidate(options.videoEventPointer, "e") ||
    normalizePointerCandidate(options.videoEvent, "e") ||
    normalizePointerCandidate(target.videoEventPointer, "e") ||
    normalizePointerCandidate(target.videoEvent, "e") ||
    normalizePointerCandidate(target.eventPointer, "e") ||
    normalizePointerCandidate(target.event, "e");

  const videoDefinitionPointer =
    normalizePointerCandidate(options.videoDefinitionPointer, "a") ||
    normalizePointerCandidate(options.videoDefinition, "a") ||
    normalizePointerCandidate(target.videoDefinitionPointer, "a") ||
    normalizePointerCandidate(target.videoDefinition, "a") ||
    normalizePointerCandidate(target.definitionPointer, "a") ||
    normalizePointerCandidate(target.definition, "a");

  const parentCommentPointer =
    normalizePointerCandidate(options.parentCommentPointer, "e") ||
    normalizePointerCandidate(options.parentComment, "e") ||
    normalizePointerCandidate(target.parentCommentPointer, "e") ||
    normalizePointerCandidate(target.parentComment, "e") ||
    normalizePointerCandidate(target.parentPointer, "e");

  const videoEventId = pickString(
    options.videoEventId,
    target.videoEventId,
    target.eventId,
    videoEventPointer?.value,
  );
  const videoEventRelay = pickString(
    options.videoEventRelay,
    target.videoEventRelay,
    target.eventRelay,
    videoEventPointer?.relay,
  );

  const videoDefinitionAddress = pickString(
    options.videoDefinitionAddress,
    target.videoDefinitionAddress,
    target.definitionAddress,
    videoDefinitionPointer?.value,
  );
  const videoDefinitionRelay = pickString(
    options.videoDefinitionRelay,
    target.videoDefinitionRelay,
    target.definitionRelay,
    videoDefinitionPointer?.relay,
  );

  const parentCommentId = pickString(
    options.parentCommentId,
    target.parentCommentId,
    target.parentId,
    parentCommentPointer?.value,
  );
  const parentCommentRelay = pickString(
    options.parentCommentRelay,
    target.parentCommentRelay,
    target.parentRelay,
    parentCommentPointer?.relay,
  );

  const threadParticipantPubkey = pickString(
    options.threadParticipantPubkey,
    target.threadParticipantPubkey,
    target.participantPubkey,
    target.authorPubkey,
  );
  const threadParticipantRelay = pickString(
    options.threadParticipantRelay,
    target.threadParticipantRelay,
    target.participantRelay,
  );

  if (!videoEventId || !videoDefinitionAddress) {
    return null;
  }

  return {
    videoEventId,
    videoEventRelay,
    videoDefinitionAddress,
    videoDefinitionRelay,
    parentCommentId,
    parentCommentRelay,
    threadParticipantPubkey,
    threadParticipantRelay,
  };
}

function createVideoCommentFilters(targetInput, options = {}) {
  const descriptor = normalizeCommentTarget(targetInput, options);
  if (!descriptor) {
    throw new Error("Invalid video comment target supplied.");
  }

  const filter = {
    kinds: [COMMENT_EVENT_KIND],
    "#e": [descriptor.videoEventId],
    "#a": [descriptor.videoDefinitionAddress],
  };

  if (descriptor.parentCommentId) {
    if (!filter["#e"].includes(descriptor.parentCommentId)) {
      filter["#e"].push(descriptor.parentCommentId);
    }
  }

  if (
    typeof options.limit === "number" &&
    Number.isFinite(options.limit) &&
    options.limit > 0
  ) {
    filter.limit = Math.floor(options.limit);
  }

  if (typeof options.since === "number" && Number.isFinite(options.since)) {
    filter.since = Math.floor(options.since);
  }

  if (typeof options.until === "number" && Number.isFinite(options.until)) {
    filter.until = Math.floor(options.until);
  }

  return { descriptor, filters: [filter] };
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

function isVideoCommentEvent(event, descriptor) {
  if (!event || typeof event !== "object") {
    return false;
  }

  if (Number(event.kind) !== COMMENT_EVENT_KIND) {
    return false;
  }

  const tags = Array.isArray(event.tags) ? event.tags : [];
  let hasEventTag = false;
  let hasDefinitionTag = false;
  let hasParentTag = !descriptor.parentCommentId;

  for (const tag of tags) {
    if (!Array.isArray(tag) || tag.length < 2) {
      continue;
    }
    const [name, value] = tag;
    if (name === "e" && typeof value === "string") {
      if (value === descriptor.videoEventId) {
        hasEventTag = true;
      }
      if (descriptor.parentCommentId && value === descriptor.parentCommentId) {
        hasParentTag = true;
      }
    } else if (name === "a" && typeof value === "string") {
      if (value === descriptor.videoDefinitionAddress) {
        hasDefinitionTag = true;
      }
    }
  }

  return hasEventTag && hasDefinitionTag && hasParentTag;
}

export async function publishComment(
  client,
  targetInput,
  options = {},
  {
    resolveActiveSigner,
    shouldRequestExtensionPermissions,
    signEventWithPrivateKey,
    DEFAULT_NIP07_PERMISSION_METHODS,
  } = {},
) {
  if (!client?.pool) {
    return { ok: false, error: "nostr-uninitialized" };
  }

  const descriptor = normalizeCommentTarget(targetInput, options);
  if (!descriptor) {
    return { ok: false, error: "invalid-target" };
  }

  const actorPubkey = await client.ensureSessionActor();
  if (!actorPubkey) {
    return { ok: false, error: "missing-actor" };
  }

  const createdAt =
    typeof options.created_at === "number" && options.created_at > 0
      ? Math.floor(options.created_at)
      : Math.floor(Date.now() / 1000);

  const additionalTags = Array.isArray(options.additionalTags)
    ? options.additionalTags.filter(
        (tag) => Array.isArray(tag) && typeof tag[0] === "string",
      )
    : [];

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
    parentCommentId: descriptor.parentCommentId,
    parentCommentRelay: descriptor.parentCommentRelay,
    threadParticipantPubkey: descriptor.threadParticipantPubkey,
    threadParticipantRelay: descriptor.threadParticipantRelay,
    additionalTags,
    content,
  });

  let signedEvent = null;

  const normalizedActor =
    typeof actorPubkey === "string" ? actorPubkey.toLowerCase() : "";
  const normalizedLogged =
    typeof client.pubkey === "string" ? client.pubkey.toLowerCase() : "";

  const resolveSignerFn =
    typeof resolveActiveSigner === "function" ? resolveActiveSigner : null;
  const signer = resolveSignerFn ? resolveSignerFn(actorPubkey) : null;

  const canUseActiveSigner =
    normalizedActor &&
    normalizedActor === normalizedLogged &&
    signer &&
    typeof signer.signEvent === "function";

  if (canUseActiveSigner) {
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

    if (permissionResult.ok) {
      try {
        signedEvent = await signer.signEvent(event);
      } catch (error) {
        userLogger.warn(
          "[nostr] Failed to sign comment event with active signer:",
          error,
        );
        return { ok: false, error: "signing-failed", details: error };
      }
    } else {
      userLogger.warn(
        "[nostr] Active signer permissions missing; signing comment with session key.",
        permissionResult.error,
      );
    }
  }

  if (!signedEvent) {
    if (typeof signEventWithPrivateKey !== "function") {
      return { ok: false, error: "signing-unavailable" };
    }
    try {
      if (!client.sessionActor || client.sessionActor.pubkey !== actorPubkey) {
        await client.ensureSessionActor(true);
      }
      if (!client.sessionActor || client.sessionActor.pubkey !== actorPubkey) {
        throw new Error("session-actor-mismatch");
      }
      signedEvent = signEventWithPrivateKey(
        event,
        client.sessionActor.privateKey,
      );
    } catch (error) {
      userLogger.warn("[nostr] Failed to sign comment event with session key:", error);
      return { ok: false, error: "signing-failed", details: error };
    }
  }

  const relayList = sanitizeRelayList(options.relays, client.relays);

  const publishResults = await Promise.all(
    relayList.map((url) => publishEventToRelay(client.pool, url, signedEvent)),
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
  const pool = client?.pool;
  const canQueryPool = pool && typeof pool.list === "function";

  if (!canQueryPool) {
    devLogger.warn("[nostr] Unable to list video comments: pool missing.");
    return [];
  }

  let descriptor;
  let filters;
  try {
    ({ descriptor, filters } = createVideoCommentFilters(targetInput, options));
  } catch (error) {
    devLogger.warn("[nostr] Failed to build comment filters:", error);
    return [];
  }

  const relayList = sanitizeRelayList(options.relays, client.relays);

  let rawResults;
  try {
    rawResults = await pool.list(relayList, filters);
  } catch (error) {
    devLogger.warn("[nostr] Failed to list video comments:", error);
    return [];
  }

  const flattened = flattenListResults(rawResults);
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

export function subscribeVideoComments(client, targetInput, options = {}) {
  const pool = client?.pool;
  const canSubscribe = pool && typeof pool.sub === "function";

  if (!canSubscribe) {
    devLogger.warn("[nostr] Unable to subscribe to video comments: pool missing.");
    return () => {};
  }

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

  let subscription;
  try {
    subscription = pool.sub(relayList, filters);
  } catch (error) {
    devLogger.warn("[nostr] Failed to open video comment subscription:", error);
    return () => {};
  }

  if (onEvent && subscription && typeof subscription.on === "function") {
    try {
      subscription.on("event", (event) => {
        if (isVideoCommentEvent(event, descriptor)) {
          try {
            onEvent(event);
          } catch (handlerError) {
            devLogger.warn("[nostr] Comment subscription handler threw:", handlerError);
          }
        }
      });
    } catch (error) {
      devLogger.warn("[nostr] Failed to attach comment subscription handler:", error);
    }
  }

  const originalUnsub =
    subscription && typeof subscription.unsub === "function"
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
        devLogger.warn("[nostr] Failed to unsubscribe from video comments:", error);
      }
    }
  };
}

export const __testExports = {
  normalizeCommentTarget,
  createVideoCommentFilters,
  isVideoCommentEvent,
};
