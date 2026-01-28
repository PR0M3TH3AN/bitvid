import {
  buildDmReadReceiptEvent,
  buildDmTypingIndicatorEvent,
  sanitizeAdditionalTags,
} from "../nostrEventSchemas.js";
import { publishEventToRelay } from "../nostrPublish.js";
import { RELAY_URLS } from "./toolkit.js";
import { devLogger, userLogger } from "../utils/logger.js";
import { queueSignEvent } from "./signRequestQueue.js";
import { getActiveSigner } from "../nostrClientRegistry.js";
import { isSessionActor } from "./sessionActor.js";

const DEFAULT_TYPING_EXPIRY_SECONDS = 15;

function sanitizeRelayList(primary, fallback) {
  if (Array.isArray(primary) && primary.length) {
    return primary;
  }
  if (Array.isArray(fallback) && fallback.length) {
    return fallback;
  }
  return RELAY_URLS;
}

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

export async function publishDmReadReceipt(
  client,
  payload = {},
  options = {},
  {
    shouldRequestExtensionPermissions,
    DEFAULT_NIP07_PERMISSION_METHODS,
  } = {},
) {
  if (!client?.pool) {
    return { ok: false, error: "nostr-uninitialized" };
  }

  if (isSessionActor(client)) {
    const error = new Error(
      "Publishing read receipts is not allowed for session actors.",
    );
    error.code = "session-actor-publish-blocked";
    return { ok: false, error };
  }

  const eventId = normalizeString(payload.eventId);
  const recipientPubkey = normalizeString(payload.recipientPubkey);

  if (!eventId || !recipientPubkey) {
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

  const additionalTags = sanitizeAdditionalTags(payload.additionalTags);

  const event = buildDmReadReceiptEvent({
    pubkey: actorPubkey,
    created_at: createdAt,
    recipientPubkey,
    eventId,
    messageKind: payload.messageKind,
    additionalTags,
  });

  let signedEvent = null;

  const signer = getActiveSigner();

  if (!signer || typeof signer.signEvent !== "function") {
    const error = new Error(
      "Login required: an active signer is needed to publish read receipts.",
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

  const hasCachedPermissions =
    typeof client?.hasRequiredExtensionPermissions === "function" &&
    client.hasRequiredExtensionPermissions(DEFAULT_NIP07_PERMISSION_METHODS);

  if (shouldRequestPermissions && !hasCachedPermissions) {
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

  if (!permissionResult.ok) {
    userLogger.warn(
      "[nostr] Active signer permissions missing; read receipts require login.",
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
      "[nostr] Failed to sign read receipt event with active signer:",
      error,
    );
    return { ok: false, error: "signing-failed", details: error };
  }

  const relayList = sanitizeRelayList(
    payload.relays,
    client.writeRelays || client.relays,
  );

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
      `[nostr] Read receipt accepted by ${acceptedRelays.length} relay(s):`,
      acceptedRelays.join(", "),
    );
  } else {
    userLogger.warn("[nostr] Read receipt rejected by relays:", publishResults);
  }

  return {
    ok: success,
    event: signedEvent,
    results: publishResults,
    acceptedRelays,
  };
}

export async function publishDmTypingIndicator(
  client,
  payload = {},
  options = {},
  {
    shouldRequestExtensionPermissions,
    DEFAULT_NIP07_PERMISSION_METHODS,
  } = {},
) {
  if (!client?.pool) {
    return { ok: false, error: "nostr-uninitialized" };
  }

  if (isSessionActor(client)) {
    const error = new Error(
      "Publishing typing indicators is not allowed for session actors.",
    );
    error.code = "session-actor-publish-blocked";
    return { ok: false, error };
  }

  const recipientPubkey = normalizeString(payload.recipientPubkey);
  if (!recipientPubkey) {
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

  const expiresInSeconds = Number.isFinite(payload.expiresInSeconds)
    ? Math.max(1, Math.floor(payload.expiresInSeconds))
    : DEFAULT_TYPING_EXPIRY_SECONDS;
  const expiresAt = createdAt + expiresInSeconds;

  const additionalTags = sanitizeAdditionalTags(payload.additionalTags);

  const event = buildDmTypingIndicatorEvent({
    pubkey: actorPubkey,
    created_at: createdAt,
    recipientPubkey,
    eventId: payload.conversationEventId,
    expiresAt,
    additionalTags,
  });

  let signedEvent = null;

  const signer = getActiveSigner();

  if (!signer || typeof signer.signEvent !== "function") {
    const error = new Error(
      "Login required: an active signer is needed to publish typing indicators.",
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

  const hasCachedPermissions =
    typeof client?.hasRequiredExtensionPermissions === "function" &&
    client.hasRequiredExtensionPermissions(DEFAULT_NIP07_PERMISSION_METHODS);

  if (shouldRequestPermissions && !hasCachedPermissions) {
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

  if (!permissionResult.ok) {
    userLogger.warn(
      "[nostr] Active signer permissions missing; typing indicators require login.",
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
      "[nostr] Failed to sign typing indicator event with active signer:",
      error,
    );
    return { ok: false, error: "signing-failed", details: error };
  }

  const relayList = sanitizeRelayList(
    payload.relays,
    client.writeRelays || client.relays,
  );

  const publishResults = await Promise.all(
    relayList.map((url) => publishEventToRelay(client.pool, url, signedEvent)),
  );

  const acceptedRelays = publishResults
    .filter((result) => result.success)
    .map((result) => result.url)
    .filter((url) => typeof url === "string" && url);

  const success = acceptedRelays.length > 0;

  if (success) {
    devLogger.debug(
      `[nostr] Typing indicator accepted by ${acceptedRelays.length} relay(s).`,
    );
  } else {
    devLogger.warn(
      "[nostr] Typing indicator rejected by relays:",
      publishResults,
    );
  }

  return {
    ok: success,
    event: signedEvent,
    results: publishResults,
    acceptedRelays,
  };
}
