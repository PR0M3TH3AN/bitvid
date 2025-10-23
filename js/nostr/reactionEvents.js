import { buildReactionEvent } from "../nostrEventSchemas.js";
import { publishEventToRelay } from "../nostrPublish.js";
import { RELAY_URLS } from "./toolkit.js";
import { normalizePointerInput } from "./watchHistory.js";
import { devLogger, userLogger } from "../utils/logger.js";

function sanitizeRelayList(primary, fallback) {
  if (Array.isArray(primary) && primary.length) {
    return primary;
  }
  if (Array.isArray(fallback) && fallback.length) {
    return fallback;
  }
  return RELAY_URLS;
}

export async function publishVideoReaction(
  client,
  pointerInput,
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

  const pointer = normalizePointerInput(pointerInput);
  if (!pointer) {
    return { ok: false, error: "invalid-pointer" };
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
        (tag) => Array.isArray(tag) && typeof tag[0] === "string"
      )
    : [];

  const optionRelay =
    typeof options.pointerRelay === "string" && options.pointerRelay.trim()
      ? options.pointerRelay.trim()
      : "";

  const pointerRelay =
    typeof pointer.relay === "string" && pointer.relay.trim()
      ? pointer.relay.trim()
      : optionRelay;

  const pointerTag =
    pointer.type === "a"
      ? pointerRelay
        ? ["a", pointer.value, pointerRelay]
        : ["a", pointer.value]
      : pointerRelay
      ? ["e", pointer.value, pointerRelay]
      : ["e", pointer.value];

  const normalizedPointer = {
    type: pointer.type,
    value: pointer.value,
    relay: pointerRelay || null,
  };

  const explicitTargetAuthor =
    typeof options.targetAuthorPubkey === "string" && options.targetAuthorPubkey.trim()
      ? options.targetAuthorPubkey.trim()
      : typeof options.authorPubkey === "string" && options.authorPubkey.trim()
      ? options.authorPubkey.trim()
      : "";

  let content = "+";
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
      devLogger.warn("[nostr] Failed to serialize custom reaction content:", error);
      content = "+";
    }
  } else if (options.content !== undefined && options.content !== null) {
    content = String(options.content);
  }

  const event = buildReactionEvent({
    pubkey: actorPubkey,
    created_at: createdAt,
    pointerValue: pointer.value,
    pointerTag,
    targetPointer: normalizedPointer,
    targetAuthorPubkey: explicitTargetAuthor,
    additionalTags,
    content,
  });

  let signedEvent = null;

  const normalizedActor =
    typeof actorPubkey === "string" ? actorPubkey.toLowerCase() : "";
  const normalizedLogged =
    typeof client.pubkey === "string" ? client.pubkey.toLowerCase() : "";
  const signer = resolveActiveSigner(actorPubkey);
  const canUseActiveSigner =
    normalizedActor &&
    normalizedActor === normalizedLogged &&
    signer &&
    typeof signer.signEvent === "function";

  if (canUseActiveSigner) {
    let permissionResult = { ok: true };
    if (shouldRequestExtensionPermissions(signer)) {
      permissionResult = await client.ensureExtensionPermissions(
        DEFAULT_NIP07_PERMISSION_METHODS
      );
    }
    if (permissionResult.ok) {
      try {
        signedEvent = await signer.signEvent(event);
      } catch (error) {
        userLogger.warn(
          "[nostr] Failed to sign reaction event with active signer:",
          error,
        );
        return { ok: false, error: "signing-failed", details: error };
      }
    } else {
      userLogger.warn(
        "[nostr] Active signer permissions missing; signing reaction with session key.",
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
      userLogger.warn("[nostr] Failed to sign reaction event with session key:", error);
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
    devLogger.info(
      `[nostr] Reaction event accepted by ${acceptedRelays.length} relay(s):`,
      acceptedRelays.join(", ")
    );
  } else {
    userLogger.warn("[nostr] Reaction event rejected by relays:", publishResults);
  }

  return {
    ok: success,
    event: signedEvent,
    results: publishResults,
    acceptedRelays,
  };
}
