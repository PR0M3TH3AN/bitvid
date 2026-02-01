import { ENSURE_PRESENCE_REBROADCAST_COOLDOWN_SECONDS } from "../config.js";
import {
  publishEventToRelays,
  assertAnyRelayAccepted,
  summarizePublishResults,
} from "../nostrPublish.js";
import {
  buildRepostEvent,
  buildVideoMirrorEvent,
  sanitizeAdditionalTags,
} from "../nostrEventSchemas.js";
import { normalizePointerInput } from "./watchHistory.js";
import { sanitizeRelayList } from "./nip46Client.js";
import {
  RELAY_URLS,
  getCachedNostrTools,
  readToolkitFromScope,
} from "./toolkit.js";
import { DEFAULT_NIP07_PERMISSION_METHODS } from "./nip07Permissions.js";
import { devLogger, userLogger } from "../utils/logger.js";
import { logRebroadcastCountFailure } from "./countDiagnostics.js";
import { queueSignEvent } from "./signRequestQueue.js";

const REBROADCAST_GUARD_PREFIX = "bitvid:rebroadcast:v1";
const rebroadcastAttemptMemory = new Map();

const HEX_PRIVATE_KEY_REGEX = /^[0-9a-f]{64}$/i;
const HEX64_REGEX = /^[0-9a-f]{64}$/i;

function normalizeSha256TagValue(value) {
  if (value === undefined || value === null) {
    return "";
  }
  const stringValue = typeof value === "string" ? value : String(value);
  const trimmed = stringValue.trim().toLowerCase();
  if (!trimmed) {
    return "";
  }
  if (!HEX64_REGEX.test(trimmed)) {
    return null;
  }
  return trimmed;
}

export function signEventWithPrivateKey(event, privateKey) {
  const tools = getCachedNostrTools();
  const scopedTools = readToolkitFromScope();
  const canonicalTools =
    typeof globalThis !== "undefined" &&
    globalThis.__BITVID_CANONICAL_NOSTR_TOOLS__
      ? globalThis.__BITVID_CANONICAL_NOSTR_TOOLS__
      : null;
  const signFn =
    typeof canonicalTools?.signEvent === "function"
      ? canonicalTools.signEvent
      : typeof tools?.signEvent === "function"
        ? tools.signEvent
        : typeof scopedTools?.signEvent === "function"
          ? scopedTools.signEvent
          : null;
  // console.debug('signEventWithPrivateKey', {
  //   signFn: typeof signFn,
  //   scopedSign: typeof scopedTools?.signEvent,
  //   cachedSign: typeof tools?.signEvent,
  // });
  const finalizeFn =
    typeof canonicalTools?.finalizeEvent === "function"
      ? canonicalTools.finalizeEvent
      : typeof tools?.finalizeEvent === "function"
        ? tools.finalizeEvent
        : typeof scopedTools?.finalizeEvent === "function"
          ? scopedTools.finalizeEvent
          : null;
  const hashFn =
    typeof canonicalTools?.getEventHash === "function"
      ? canonicalTools.getEventHash
      : typeof tools?.getEventHash === "function"
        ? tools.getEventHash
        : typeof scopedTools?.getEventHash === "function"
          ? scopedTools.getEventHash
          : null;

  if (
    !privateKey ||
    typeof privateKey !== "string" ||
    (!signFn && !finalizeFn)
  ) {
    throw new Error("Missing signing primitives");
  }

  const tags = Array.isArray(event.tags)
    ? event.tags.map((tag) => (Array.isArray(tag) ? [...tag] : tag))
    : [];

  const prepared = {
    kind: event.kind,
    pubkey: event.pubkey,
    created_at: event.created_at,
    tags,
    content: typeof event.content === "string" ? event.content : "",
  };

  if (signFn) {
    const signature = signFn(prepared, privateKey);
    if (signature && typeof signature === "object") {
      const idValue =
        typeof signature.id === "string"
          ? signature.id
          : hashFn
            ? hashFn(prepared)
            : null;
      const sigValue =
        typeof signature.sig === "string"
          ? signature.sig
          : typeof signature.signature === "string"
            ? signature.signature
            : null;
      if (!idValue || !sigValue) {
        throw new Error("Missing signing primitives");
      }
      return { ...prepared, id: idValue, sig: sigValue };
    }

    const sigValue = typeof signature === "string" ? signature : null;
    if (!sigValue || !hashFn) {
      throw new Error("Missing signing primitives");
    }
    const idValue = hashFn(prepared);
    return { ...prepared, id: idValue, sig: sigValue };
  }

  const normalizedKey = privateKey.trim();
  if (!HEX_PRIVATE_KEY_REGEX.test(normalizedKey)) {
    throw new Error("Missing signing primitives");
  }

  const finalized = finalizeFn(prepared, normalizedKey);
  if (
    !finalized ||
    typeof finalized.id !== "string" ||
    typeof finalized.sig !== "string"
  ) {
    throw new Error("Missing signing primitives");
  }
  return finalized;
}

export function deriveRebroadcastBucketIndex(referenceSeconds = null) {
  const windowSeconds = Math.max(
    1,
    Number(ENSURE_PRESENCE_REBROADCAST_COOLDOWN_SECONDS) || 0,
  );
  const baseSeconds = Number.isFinite(referenceSeconds)
    ? Math.max(0, Math.floor(referenceSeconds))
    : Math.floor(Date.now() / 1000);
  return Math.floor(baseSeconds / windowSeconds);
}

export function getRebroadcastCooldownWindowMs() {
  const windowSeconds = Math.max(
    1,
    Number(ENSURE_PRESENCE_REBROADCAST_COOLDOWN_SECONDS) || 0,
  );
  return windowSeconds * 1000;
}

export function deriveRebroadcastScope(pubkey, eventId) {
  const normalizedPubkey =
    typeof pubkey === "string" && pubkey.trim()
      ? pubkey.trim().toLowerCase()
      : "";
  const normalizedEventId =
    typeof eventId === "string" && eventId.trim()
      ? eventId.trim().toLowerCase()
      : "";
  if (!normalizedPubkey || !normalizedEventId) {
    return "";
  }
  return `${normalizedPubkey}:${normalizedEventId}`;
}

function readRebroadcastGuardEntry(scope) {
  if (!scope) {
    return null;
  }

  const windowMs = getRebroadcastCooldownWindowMs();
  const now = Date.now();
  const entry = rebroadcastAttemptMemory.get(scope);

  if (entry) {
    const age = now - Number(entry.seenAt);
    if (!Number.isFinite(entry.seenAt) || age >= windowMs) {
      rebroadcastAttemptMemory.delete(scope);
    } else {
      return entry;
    }
  }

  if (typeof localStorage === "undefined") {
    return null;
  }

  const storageKey = `${REBROADCAST_GUARD_PREFIX}:${scope}`;
  let rawValue = null;
  try {
    rawValue = localStorage.getItem(storageKey);
  } catch (error) {
    devLogger.warn("[nostr] Failed to read rebroadcast guard entry:", error);
    return null;
  }

  if (typeof rawValue !== "string" || !rawValue) {
    return null;
  }

  const [storedBucketRaw, storedSeenRaw] = rawValue.split(":", 2);
  const storedBucket = Number(storedBucketRaw);
  const storedSeenAt = Number(storedSeenRaw);

  if (!Number.isFinite(storedBucket) || !Number.isFinite(storedSeenAt)) {
    try {
      localStorage.removeItem(storageKey);
    } catch (error) {
      devLogger.warn(
        "[nostr] Failed to clear corrupt rebroadcast guard entry:",
        error,
      );
    }
    return null;
  }

  if (now - storedSeenAt >= windowMs) {
    try {
      localStorage.removeItem(storageKey);
    } catch (error) {
      devLogger.warn(
        "[nostr] Failed to remove expired rebroadcast guard entry:",
        error,
      );
    }
    return null;
  }

  const normalizedEntry = {
    bucket: storedBucket,
    seenAt: storedSeenAt,
  };
  rebroadcastAttemptMemory.set(scope, normalizedEntry);
  return normalizedEntry;
}

export function hasRecentRebroadcastAttempt(scope, bucketIndex) {
  if (!scope || !Number.isFinite(bucketIndex)) {
    return false;
  }

  const entry = readRebroadcastGuardEntry(scope);
  return entry ? Number(entry.bucket) === bucketIndex : false;
}

export function rememberRebroadcastAttempt(scope, bucketIndex) {
  if (!scope || !Number.isFinite(bucketIndex)) {
    return;
  }

  const now = Date.now();
  const windowMs = getRebroadcastCooldownWindowMs();
  const entry = rebroadcastAttemptMemory.get(scope);
  if (entry && Number.isFinite(entry.seenAt) && now - entry.seenAt >= windowMs) {
    rebroadcastAttemptMemory.delete(scope);
  }

  const normalizedEntry = { bucket: bucketIndex, seenAt: now };
  rebroadcastAttemptMemory.set(scope, normalizedEntry);

  if (typeof localStorage === "undefined") {
    return;
  }

  const storageKey = `${REBROADCAST_GUARD_PREFIX}:${scope}`;
  try {
    localStorage.setItem(storageKey, `${bucketIndex}:${now}`);
  } catch (error) {
    devLogger.warn("[nostr] Failed to persist rebroadcast guard entry:", error);
  }
}

export function getRebroadcastCooldownState(scope) {
  if (!scope) {
    return null;
  }
  const entry = readRebroadcastGuardEntry(scope);
  if (!entry || !Number.isFinite(entry.seenAt)) {
    return null;
  }
  const windowMs = getRebroadcastCooldownWindowMs();
  const expiresAt = entry.seenAt + windowMs;
  const remainingMs = Math.max(0, expiresAt - Date.now());
  if (remainingMs <= 0) {
    return null;
  }
  return {
    scope,
    seenAt: entry.seenAt,
    bucket: entry.bucket,
    expiresAt,
    remainingMs,
  };
}

export async function signAndPublishEvent({
  client,
  event,
  options = {},
  resolveActiveSigner,
  shouldRequestExtensionPermissions,
  signEventWithPrivateKey: signWithPrivateKey,
}) {
  const {
    context = "event",
    logName = context,
    devLogLabel = logName,
    rejectionLogLevel = "error",
    relaysOverride = null,
  } = options;

  const normalizedEventPubkey =
    event && typeof event.pubkey === "string"
      ? event.pubkey.toLowerCase()
      : "";
  const normalizedLogged =
    typeof client?.pubkey === "string" ? client.pubkey.toLowerCase() : "";
  const usingSessionActor =
    normalizedEventPubkey &&
    normalizedLogged &&
    normalizedEventPubkey !== normalizedLogged;

  const signer =
    typeof resolveActiveSigner === "function"
      ? resolveActiveSigner(normalizedEventPubkey || client?.pubkey)
      : null;
  const canUseActiveSigner =
    !usingSessionActor && signer && typeof signer.signEvent === "function";

  let eventToSign = event;
  let signedEvent = null;
  let signerPubkey = null;

  if (canUseActiveSigner) {
    let permissionResult = { ok: true };
    if (
      typeof shouldRequestExtensionPermissions === "function" &&
      shouldRequestExtensionPermissions(signer) &&
      typeof client?.ensureExtensionPermissions === "function"
    ) {
      permissionResult = await client.ensureExtensionPermissions(
        DEFAULT_NIP07_PERMISSION_METHODS,
      );
    }
    if (permissionResult.ok) {
      try {
        signedEvent = await queueSignEvent(signer, event, {
          timeoutMs: options.timeoutMs,
        });
      } catch (error) {
        userLogger.warn(
          "[nostr] Failed to sign event with active signer:",
          error,
        );
      }
    } else {
      userLogger.warn(
        "[nostr] Active signer permissions missing; falling back to session signer.",
        permissionResult.error,
      );
    }
  }

  if (!signedEvent) {
    try {
      const currentSessionPubkey =
        typeof client?.sessionActor?.pubkey === "string"
          ? client.sessionActor.pubkey.toLowerCase()
          : "";

      if (
        typeof client?.ensureSessionActor === "function" &&
        usingSessionActor &&
        normalizedEventPubkey &&
        normalizedEventPubkey !== currentSessionPubkey
      ) {
        await client.ensureSessionActor(true);
      } else if (typeof client?.ensureSessionActor === "function") {
        await client.ensureSessionActor();
      }

      const sessionActor = client?.sessionActor;
      if (
        !sessionActor ||
        typeof sessionActor.pubkey !== "string" ||
        !sessionActor.pubkey ||
        typeof sessionActor.privateKey !== "string" ||
        !sessionActor.privateKey
      ) {
        throw new Error("session-actor-unavailable");
      }

      const normalizedSessionPubkey = sessionActor.pubkey.toLowerCase();
      if (
        !normalizedEventPubkey ||
        normalizedEventPubkey !== normalizedSessionPubkey ||
        event.pubkey !== sessionActor.pubkey
      ) {
        eventToSign = { ...event, pubkey: sessionActor.pubkey };
      }

      signedEvent = signWithPrivateKey(eventToSign, sessionActor.privateKey);
      signerPubkey = sessionActor.pubkey;
    } catch (error) {
      userLogger.warn("[nostr] Failed to sign event with session key:", error);
      throw error;
    }
  }

  if (!signerPubkey && signedEvent && typeof signedEvent.pubkey === "string") {
    signerPubkey = signedEvent.pubkey;
  }

  devLogger.log(`Signed ${devLogLabel} event:`, signedEvent);

  let targetRelays = sanitizeRelayList(
    Array.isArray(relaysOverride) && relaysOverride.length
      ? relaysOverride
      : Array.isArray(client?.writeRelays) && client.writeRelays.length
      ? client.writeRelays
      : client?.relays,
  );

  if (!targetRelays.length) {
    targetRelays = Array.from(RELAY_URLS);
  }

  const publishResults = await publishEventToRelays(
    client?.pool,
    targetRelays,
    signedEvent,
  );

  let publishSummary;
  try {
    publishSummary = assertAnyRelayAccepted(publishResults, { context });
  } catch (publishError) {
    if (publishError?.relayFailures?.length) {
      const logLevel = rejectionLogLevel === "warn" ? "warn" : "error";
      publishError.relayFailures.forEach(({ url, error: relayError, reason }) => {
        const logFn = logLevel === "warn" ? userLogger.warn : userLogger.error;
        logFn(`[nostr] ${logName} rejected by ${url}: ${reason}`, relayError || reason);
      });
    }
    throw publishError;
  }

  publishSummary.accepted.forEach(({ url }) => {
    devLogger.log(`${logName} published to ${url}`);
  });

  if (publishSummary.failed.length) {
    publishSummary.failed.forEach(({ url, error: relayError }) => {
      const reason =
        relayError instanceof Error
          ? relayError.message
          : relayError
          ? String(relayError)
          : "publish failed";
      userLogger.warn(
        `[nostr] ${logName} not accepted by ${url}: ${reason}`,
        relayError,
      );
    });
  }

  return {
    signedEvent,
    summary: publishSummary,
    signerPubkey,
    relays: targetRelays,
  };
}

export async function repostEvent({
  client,
  eventId,
  options = {},
  resolveActiveSigner,
  shouldRequestExtensionPermissions,
  signEventWithPrivateKey: signWithPrivateKey,
  eventToAddressPointer,
}) {
  const normalizedId =
    typeof eventId === "string" && eventId.trim() ? eventId.trim() : "";
  if (!normalizedId) {
    return { ok: false, error: "invalid-event-id" };
  }

  let pointer = null;
  if (options.pointer) {
    pointer = normalizePointerInput(options.pointer);
  }
  if (!pointer) {
    const type =
      typeof options.pointerType === "string" ? options.pointerType.trim() : "";
    const value =
      typeof options.pointerValue === "string" ? options.pointerValue.trim() : "";
    if (type && value) {
      const candidate = [type, value];
      const relay =
        typeof options.pointerRelay === "string"
          ? options.pointerRelay.trim()
          : "";
      if (relay) {
        candidate.push(relay);
      }
      pointer = normalizePointerInput(candidate);
    }
  }

  const cachedVideo = client?.allEvents?.get(normalizedId) || null;
  const cachedRaw = client?.rawEvents?.get(normalizedId) || null;
  let resolvedRawEvent = cachedRaw;
  const serializeEvent = (event) => {
    if (!event || typeof event !== "object") {
      return "";
    }
    try {
      return JSON.stringify(event);
    } catch (error) {
      devLogger.warn(
        `[nostr] Failed to serialize repost target ${normalizedId}`,
        error,
      );
      return "";
    }
  };
  let serializedSourceEvent = serializeEvent(resolvedRawEvent);

  let authorPubkey =
    typeof options.authorPubkey === "string" && options.authorPubkey.trim()
      ? options.authorPubkey.trim().toLowerCase()
      : "";

  if (!authorPubkey && cachedVideo?.pubkey) {
    authorPubkey = cachedVideo.pubkey.trim().toLowerCase();
  }
  if (!authorPubkey && cachedRaw?.pubkey) {
    authorPubkey = cachedRaw.pubkey.trim().toLowerCase();
  }

  let address = typeof options.address === "string" ? options.address.trim() : "";
  if (!address && pointer?.type === "a") {
    address = pointer.value;
  }

  let addressRelay =
    typeof options.addressRelay === "string" ? options.addressRelay.trim() : "";
  if (!addressRelay && pointer?.type === "a" && pointer.relay) {
    addressRelay = pointer.relay;
  }

  const relayCandidates = new Set();

  const rememberRelayCandidate = (value) => {
    if (typeof value !== "string") {
      return;
    }
    const normalized = value.trim();
    if (!normalized) {
      return;
    }
    relayCandidates.add(normalized);
  };

  const rememberPointerRelay = (pointerCandidate) => {
    const normalizedPointer = normalizePointerInput(pointerCandidate);
    if (normalizedPointer?.relay) {
      rememberRelayCandidate(normalizedPointer.relay);
    }
  };

  const rememberRelayHintsFromObject = (candidate, depth = 0) => {
    if (!candidate || typeof candidate !== "object" || depth > 3) {
      return;
    }

    const directKeys = [
      "relay",
      "relayUrl",
      "eventRelay",
      "pointerRelay",
      "sourceRelay",
      "originRelay",
      "addressRelay",
    ];
    directKeys.forEach((key) => {
      if (typeof candidate[key] === "string") {
        rememberRelayCandidate(candidate[key]);
      }
    });

    if (Array.isArray(candidate.relays)) {
      candidate.relays.forEach((value) => {
        rememberRelayCandidate(value);
      });
    }

    if (candidate.pointer) {
      rememberPointerRelay(candidate.pointer);
    }
    if (candidate.eventPointer) {
      rememberPointerRelay(candidate.eventPointer);
    }

    if (candidate.pointerInfo && depth <= 3) {
      rememberRelayHintsFromObject(candidate.pointerInfo, depth + 1);
    }

    if (Array.isArray(candidate.pointers)) {
      candidate.pointers.forEach((pointerCandidate) => {
        rememberPointerRelay(pointerCandidate);
      });
    }

    if (candidate.video && depth <= 3) {
      rememberRelayHintsFromObject(candidate.video, depth + 1);
    }
  };

  let eventRelay =
    typeof options.eventRelay === "string" ? options.eventRelay.trim() : "";
  if (eventRelay) {
    rememberRelayCandidate(eventRelay);
  }

  if (pointer) {
    rememberPointerRelay(pointer);
    if (!eventRelay && pointer.type === "e" && pointer.relay) {
      eventRelay = pointer.relay;
    }
  }

  rememberRelayHintsFromObject(options);
  rememberRelayHintsFromObject(pointer);
  rememberRelayHintsFromObject(cachedVideo);
  rememberRelayHintsFromObject(cachedVideo?.pointerInfo);
  rememberRelayHintsFromObject(cachedRaw);

  if (addressRelay) {
    rememberRelayCandidate(addressRelay);
  }

  const deriveRelayFromRawEvent = (event) => {
    if (!event || typeof event !== "object") {
      return "";
    }
    const directRelay =
      typeof event.relay === "string" ? event.relay.trim() : "";
    if (directRelay) {
      return directRelay;
    }
    const relayCollections = [event.relays, event.seenOn, event.seen_on];
    for (const collection of relayCollections) {
      if (!Array.isArray(collection)) {
        continue;
      }
      for (const entry of collection) {
        if (typeof entry === "string" && entry.trim()) {
          return entry.trim();
        }
      }
    }
    return "";
  };

  const cachedRawRelay = deriveRelayFromRawEvent(cachedRaw);
  if (cachedRawRelay) {
    rememberRelayCandidate(cachedRawRelay);
    if (!eventRelay) {
      eventRelay = cachedRawRelay;
    }
  }

  let targetKind = Number.isFinite(options.kind)
    ? Math.floor(options.kind)
    : null;

  const parseAddressMetadata = (candidate) => {
    if (typeof candidate !== "string" || !candidate) {
      return;
    }
    const parts = candidate.split(":");
    if (parts.length >= 3) {
      const maybeKind = Number.parseInt(parts[0], 10);
      if (Number.isFinite(maybeKind) && !Number.isFinite(targetKind)) {
        targetKind = maybeKind;
      }
      const maybePubkey = parts[1];
      if (
        maybePubkey &&
        !authorPubkey &&
        /^[0-9a-f]{64}$/i.test(maybePubkey)
      ) {
        authorPubkey = maybePubkey.toLowerCase();
      }
    }
  };

  if (address) {
    parseAddressMetadata(address);
  }

  if (!Number.isFinite(targetKind)) {
    if (Number.isFinite(cachedRaw?.kind)) {
      targetKind = Math.floor(cachedRaw.kind);
    } else if (Number.isFinite(cachedVideo?.kind)) {
      targetKind = Math.floor(cachedVideo.kind);
    } else {
      targetKind = 30078;
    }
  }

  const deriveIdentifierFromVideo = () => {
    if (!cachedVideo || typeof cachedVideo !== "object") {
      return "";
    }

    if (
      typeof cachedVideo.videoRootId === "string" &&
      cachedVideo.videoRootId.trim()
    ) {
      return cachedVideo.videoRootId.trim();
    }

    if (Array.isArray(cachedVideo.tags)) {
      for (const tag of cachedVideo.tags) {
        if (!Array.isArray(tag) || tag.length < 2) {
          continue;
        }
        if (tag[0] === "d" && typeof tag[1] === "string" && tag[1].trim()) {
          return tag[1].trim();
        }
      }
    }

    return "";
  };

  if (!address) {
    const identifier = deriveIdentifierFromVideo();
    const ownerPubkey =
      authorPubkey ||
      (cachedVideo?.pubkey ? cachedVideo.pubkey.trim().toLowerCase() : "") ||
      (cachedRaw?.pubkey ? cachedRaw.pubkey.trim().toLowerCase() : "");

    if (identifier && ownerPubkey) {
      address = `${targetKind}:${ownerPubkey}:${identifier}`;
      parseAddressMetadata(address);
    } else if (cachedRaw && typeof eventToAddressPointer === "function") {
      const fallbackAddress = eventToAddressPointer(cachedRaw);
      if (fallbackAddress) {
        address = fallbackAddress;
        parseAddressMetadata(address);
      }
    }
  }

  const relaysOverride = sanitizeRelayList(
    Array.isArray(options.relays) && options.relays.length
      ? options.relays
      : Array.isArray(client?.writeRelays) && client.writeRelays.length
      ? client.writeRelays
      : client?.relays,
  );
  const relays = relaysOverride.length ? relaysOverride : Array.from(RELAY_URLS);
  const probeRelays = (() => {
    const order = [];
    if (eventRelay) {
      order.push(eventRelay);
    }
    relayCandidates.forEach((relayUrl) => {
      if (relayUrl && !order.includes(relayUrl)) {
        order.push(relayUrl);
      }
    });
    relays.forEach((relayUrl) => {
      if (relayUrl && !order.includes(relayUrl)) {
        order.push(relayUrl);
      }
    });
    return order;
  })();

  if ((!eventRelay || !resolvedRawEvent) && typeof client?.fetchRawEventById === "function") {
    for (const relayUrl of probeRelays) {
      if (!relayUrl) {
        continue;
      }
      if (!resolvedRawEvent) {
        try {
          const fetched = await client.fetchRawEventById(normalizedId, {
            relays: [relayUrl],
          });
          if (fetched) {
            resolvedRawEvent = fetched;
            serializedSourceEvent = serializeEvent(fetched);
          }
        } catch (error) {
          devLogger.warn(
            `[nostr] Failed to fetch ${normalizedId} from ${relayUrl} while preparing repost`,
            error,
          );
        }
      }

      if (!eventRelay && resolvedRawEvent) {
        eventRelay = relayUrl;
        rememberRelayCandidate(relayUrl);
      }

      if (eventRelay && resolvedRawEvent) {
        break;
      }
    }
  }

  if (resolvedRawEvent && !serializedSourceEvent) {
    serializedSourceEvent = serializeEvent(resolvedRawEvent);
  }

  if (resolvedRawEvent && !eventRelay) {
    const rawRelay = deriveRelayFromRawEvent(resolvedRawEvent);
    if (rawRelay) {
      eventRelay = rawRelay;
      rememberRelayCandidate(rawRelay);
    }
  }

  if (!eventRelay) {
    devLogger.warn(
      `[nostr] Repost aborted: missing source relay for ${normalizedId}`,
      { candidates: probeRelays },
    );
    return {
      ok: false,
      error: "missing-event-relay",
      details: { relays: probeRelays },
    };
  }

  devLogger.log(
    `[nostr] Resolved repost target relay ${eventRelay} for ${normalizedId}`,
  );

  let actorPubkey =
    typeof options.actorPubkey === "string" && options.actorPubkey.trim()
      ? options.actorPubkey.trim()
      : typeof client?.pubkey === "string" && client.pubkey.trim()
      ? client.pubkey.trim()
      : "";

  if (!actorPubkey) {
    try {
      const ensured =
        typeof client?.ensureSessionActor === "function"
          ? await client.ensureSessionActor()
          : null;
      actorPubkey = ensured || "";
    } catch (error) {
      devLogger.warn("[nostr] Failed to ensure session actor before repost:", error);
      return { ok: false, error: "missing-actor", details: error };
    }
  }

  if (!actorPubkey) {
    return { ok: false, error: "missing-actor" };
  }

  if (!client?.pool) {
    try {
      if (typeof client?.ensurePool === "function") {
        await client.ensurePool();
      }
    } catch (error) {
      devLogger.warn("[nostr] Failed to ensure pool before repost:", error);
      return { ok: false, error: "pool-unavailable", details: error };
    }
  }

  const createdAt =
    typeof options.created_at === "number" && Number.isFinite(options.created_at)
      ? Math.max(0, Math.floor(options.created_at))
      : Math.floor(Date.now() / 1000);

  const additionalTags = sanitizeAdditionalTags(options.additionalTags);

  const repostKind =
    Number.isFinite(targetKind) && targetKind !== 1
      ? 16
      : 6;

  const repostEventPayload = buildRepostEvent({
    pubkey: actorPubkey,
    created_at: createdAt,
    eventId: normalizedId,
    eventRelay,
    address,
    addressRelay,
    authorPubkey,
    additionalTags,
    repostKind,
    targetKind,
    targetEvent: resolvedRawEvent,
    serializedEvent: serializedSourceEvent,
  });

  try {
    const { signedEvent, summary, signerPubkey } = await signAndPublishEvent({
      client,
      event: repostEventPayload,
      resolveActiveSigner,
      shouldRequestExtensionPermissions,
      signEventWithPrivateKey: signWithPrivateKey,
      options: {
        context: "repost",
        logName: "Repost",
        devLogLabel: "repost",
        relaysOverride: relays,
      },
    });

    const normalizedSigner =
      typeof signerPubkey === "string" ? signerPubkey.toLowerCase() : "";
    const normalizedLogged =
      typeof client?.pubkey === "string" ? client.pubkey.toLowerCase() : "";
    const sessionPubkey =
      typeof client?.sessionActor?.pubkey === "string"
        ? client.sessionActor.pubkey.toLowerCase()
        : "";

    const usedSessionActor =
      normalizedSigner &&
      normalizedSigner !== normalizedLogged &&
      normalizedSigner === sessionPubkey;

    const sourceInfo = serializedSourceEvent
      ? { raw: resolvedRawEvent, serialized: serializedSourceEvent }
      : null;

    return {
      ok: true,
      event: signedEvent,
      summary,
      relays,
      sessionActor: usedSessionActor,
      signerPubkey,
      source: sourceInfo,
    };
  } catch (error) {
    devLogger.warn("[nostr] Repost publish failed:", error);
    const relayFailure =
      error && typeof error === "object" && Array.isArray(error.relayFailures);
    return {
      ok: false,
      error: relayFailure ? "publish-rejected" : "signing-failed",
      details: error,
    };
  }
}

export async function mirrorVideoEvent({
  client,
  eventId,
  options = {},
  resolveActiveSigner,
  shouldRequestExtensionPermissions,
  signEventWithPrivateKey: signWithPrivateKey,
  inferMimeTypeFromUrl,
}) {
  const normalizedId =
    typeof eventId === "string" && eventId.trim() ? eventId.trim() : "";
  if (!normalizedId) {
    return { ok: false, error: "invalid-event-id" };
  }

  const cachedVideo = client?.allEvents?.get(normalizedId) || null;

  const sanitize = (value) => (typeof value === "string" ? value.trim() : "");

  let url = sanitize(options.url);
  if (!url && cachedVideo?.url) {
    url = sanitize(cachedVideo.url);
  }

  if (!url) {
    return { ok: false, error: "missing-url" };
  }

  const isPrivate =
    options.isPrivate === true ||
    options.isPrivate === "true" ||
    cachedVideo?.isPrivate === true;

  let magnet = sanitize(options.magnet);
  if (!magnet && cachedVideo?.magnet) {
    magnet = sanitize(cachedVideo.magnet);
  }
  if (!magnet && cachedVideo?.rawMagnet) {
    magnet = sanitize(cachedVideo.rawMagnet);
  }
  if (!magnet && cachedVideo?.originalMagnet) {
    magnet = sanitize(cachedVideo.originalMagnet);
  }

  let thumbnail = sanitize(options.thumbnail);
  if (!thumbnail && cachedVideo?.thumbnail) {
    thumbnail = sanitize(cachedVideo.thumbnail);
  }

  let description = sanitize(options.description);
  if (!description && cachedVideo?.description) {
    description = sanitize(cachedVideo.description);
  }

  let title = sanitize(options.title);
  if (!title && cachedVideo?.title) {
    title = sanitize(cachedVideo.title);
  }

  const providedMimeType = sanitize(options.mimeType);
  const normalizedProvidedMimeType = providedMimeType
    ? providedMimeType.toLowerCase()
    : "";
  const inferredMimeType = inferMimeTypeFromUrl
    ? inferMimeTypeFromUrl(url)
    : "";
  const normalizedInferredMimeType = inferredMimeType
    ? inferredMimeType.toLowerCase()
    : "";
  const mimeTypeSource =
    normalizedProvidedMimeType ||
    normalizedInferredMimeType ||
    "application/octet-stream";
  const mimeType = mimeTypeSource.toLowerCase();

  const explicitAlt = sanitize(options.altText);
  const altText = explicitAlt || description || title || "";

  const fileSha256 = normalizeSha256TagValue(options.fileSha256);
  if (fileSha256 === null) {
    return { ok: false, error: "invalid-file-sha" };
  }

  const originalFileSha256 = normalizeSha256TagValue(
    options.originalFileSha256,
  );
  if (originalFileSha256 === null) {
    return { ok: false, error: "invalid-original-file-sha" };
  }

  const tags = [];
  tags.push(["url", url]);
  if (mimeType) {
    tags.push(["m", mimeType]);
  }
  if (thumbnail) {
    tags.push(["thumb", thumbnail]);
  }
  if (altText) {
    tags.push(["alt", altText]);
  }
  if (!isPrivate && magnet) {
    tags.push(["magnet", magnet]);
  }
  if (fileSha256) {
    tags.push(["x", fileSha256]);
  }
  if (originalFileSha256) {
    tags.push(["ox", originalFileSha256]);
  }

  const additionalTags = sanitizeAdditionalTags(options.additionalTags);
  if (additionalTags.length) {
    tags.push(...additionalTags.map((tag) => tag.slice()));
  }

  let actorPubkey =
    typeof options.actorPubkey === "string" && options.actorPubkey.trim()
      ? options.actorPubkey.trim()
      : typeof client?.pubkey === "string" && client.pubkey.trim()
      ? client.pubkey.trim()
      : "";

  if (!actorPubkey) {
    try {
      const ensured =
        typeof client?.ensureSessionActor === "function"
          ? await client.ensureSessionActor()
          : null;
      actorPubkey = ensured || "";
    } catch (error) {
      devLogger.warn("[nostr] Failed to ensure session actor before mirror:", error);
      return { ok: false, error: "missing-actor", details: error };
    }
  }

  if (!actorPubkey) {
    return { ok: false, error: "missing-actor" };
  }

  if (!client?.pool) {
    try {
      if (typeof client?.ensurePool === "function") {
        await client.ensurePool();
      }
    } catch (error) {
      devLogger.warn("[nostr] Failed to ensure pool before mirror:", error);
      return { ok: false, error: "pool-unavailable", details: error };
    }
  }

  const createdAt =
    typeof options.created_at === "number" && Number.isFinite(options.created_at)
      ? Math.max(0, Math.floor(options.created_at))
      : Math.floor(Date.now() / 1000);

  const relaysOverride = sanitizeRelayList(
    Array.isArray(options.relays) && options.relays.length
      ? options.relays
      : Array.isArray(client?.writeRelays) && client.writeRelays.length
      ? client.writeRelays
      : client?.relays,
  );
  const relays = relaysOverride.length ? relaysOverride : Array.from(RELAY_URLS);

  const mirrorEventPayload = buildVideoMirrorEvent({
    pubkey: actorPubkey,
    created_at: createdAt,
    tags,
    content: altText,
  });

  try {
    const { signedEvent, summary, signerPubkey } = await signAndPublishEvent({
      client,
      event: mirrorEventPayload,
      resolveActiveSigner,
      shouldRequestExtensionPermissions,
      signEventWithPrivateKey: signWithPrivateKey,
      options: {
        context: "mirror",
        logName: "NIP-94 mirror",
        devLogLabel: "NIP-94 mirror",
        rejectionLogLevel: "warn",
        relaysOverride: relays,
      },
    });

    const normalizedSigner =
      typeof signerPubkey === "string" ? signerPubkey.toLowerCase() : "";
    const normalizedLogged =
      typeof client?.pubkey === "string" ? client.pubkey.toLowerCase() : "";
    const sessionPubkey =
      typeof client?.sessionActor?.pubkey === "string"
        ? client.sessionActor.pubkey.toLowerCase()
        : "";

    const usedSessionActor =
      normalizedSigner &&
      normalizedSigner !== normalizedLogged &&
      normalizedSigner === sessionPubkey;

    return {
      ok: true,
      event: signedEvent,
      summary,
      relays,
      sessionActor: usedSessionActor,
      signerPubkey,
    };
  } catch (error) {
    devLogger.warn("[nostr] Mirror publish failed:", error);
    const relayFailure =
      error && typeof error === "object" && Array.isArray(error.relayFailures);
    return {
      ok: false,
      error: relayFailure ? "publish-rejected" : "signing-failed",
      details: error,
    };
  }
}

export async function rebroadcastEvent({ client, eventId, options = {} }) {
  const normalizedId =
    typeof eventId === "string" && eventId.trim() ? eventId.trim() : "";
  if (!normalizedId) {
    return { ok: false, error: "invalid-event-id" };
  }

  const candidatePubkeys = [];
  if (typeof options.pubkey === "string" && options.pubkey.trim()) {
    candidatePubkeys.push(options.pubkey.trim().toLowerCase());
  }
  const cachedVideo = client?.allEvents?.get(normalizedId);
  if (cachedVideo?.pubkey) {
    candidatePubkeys.push(cachedVideo.pubkey.toLowerCase());
  }
  const cachedRaw = client?.rawEvents?.get(normalizedId);
  if (cachedRaw?.pubkey) {
    candidatePubkeys.push(cachedRaw.pubkey.toLowerCase());
  }

  let normalizedPubkey = "";
  for (const candidate of candidatePubkeys) {
    if (typeof candidate === "string" && candidate) {
      normalizedPubkey = candidate;
      break;
    }
  }

  let guardScope = deriveRebroadcastScope(normalizedPubkey, normalizedId);
  const guardBucket = deriveRebroadcastBucketIndex();
  if (guardScope && hasRecentRebroadcastAttempt(guardScope, guardBucket)) {
    const cooldown = getRebroadcastCooldownState(guardScope);
    return { ok: false, error: "cooldown-active", throttled: true, cooldown };
  }

  const relayCandidates =
    Array.isArray(options.relays) && options.relays.length
      ? options.relays
      : Array.isArray(client?.relays) && client.relays.length
      ? client.relays
      : RELAY_URLS;
  const relays = relayCandidates
    .map((url) => (typeof url === "string" ? url.trim() : ""))
    .filter(Boolean);

  if (!client?.pool) {
    try {
      if (typeof client?.ensurePool === "function") {
        await client.ensurePool();
      }
    } catch (error) {
      devLogger.warn("[nostr] Failed to ensure pool before rebroadcast:", error);
      return { ok: false, error: "pool-unavailable", details: error };
    }
  }

  let rawEvent =
    options.rawEvent ||
    cachedRaw ||
    (typeof client?.fetchRawEventById === "function"
      ? await client.fetchRawEventById(normalizedId, { relays })
      : null);

  if (!rawEvent) {
    return { ok: false, error: "event-not-found" };
  }

  if (!normalizedPubkey && typeof rawEvent.pubkey === "string") {
    normalizedPubkey = rawEvent.pubkey.trim().toLowerCase();
  }

  const effectiveScope = deriveRebroadcastScope(normalizedPubkey, normalizedId);
  if (effectiveScope && !guardScope) {
    guardScope = effectiveScope;
    if (hasRecentRebroadcastAttempt(guardScope, guardBucket)) {
      const cooldown = getRebroadcastCooldownState(guardScope);
      return { ok: false, error: "cooldown-active", throttled: true, cooldown };
    }
  }

  if (guardScope) {
    rememberRebroadcastAttempt(guardScope, guardBucket);
  }

  let countResult = null;
  if (options.skipCount !== true) {
    try {
      countResult =
        typeof client?.countEventsAcrossRelays === "function"
          ? await client.countEventsAcrossRelays([
              { ids: [normalizedId] },
            ], {
              relays,
              timeoutMs: options.timeoutMs,
            })
          : null;
    } catch (error) {
      logRebroadcastCountFailure(error);
    }

    if (countResult?.total && Number(countResult.total) > 0) {
      return {
        ok: true,
        alreadyPresent: true,
        count: countResult,
        cooldown: guardScope ? getRebroadcastCooldownState(guardScope) : null,
      };
    }
  }

  const publishResults = await publishEventToRelays(client?.pool, relays, rawEvent);

  try {
    const summary = assertAnyRelayAccepted(publishResults, { context: "rebroadcast" });
    return {
      ok: true,
      rebroadcast: true,
      summary,
      count: countResult,
      cooldown: guardScope ? getRebroadcastCooldownState(guardScope) : null,
    };
  } catch (error) {
    devLogger.warn("[nostr] Rebroadcast rejected by relays:", error);
    return {
      ok: false,
      error: "publish-rejected",
      details: error,
      results: publishResults,
      cooldown: guardScope ? getRebroadcastCooldownState(guardScope) : null,
    };
  }
}

export { summarizePublishResults };
