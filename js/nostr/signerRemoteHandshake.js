// js/nostr/signerRemoteHandshake.js
//
// NIP-46 remote-signer handshake wait, extracted from managers/SignerManager.js
// to keep that module under the file-size budget. Takes the SignerManager
// instance (`ctx`) for its client/pool and cancel hook, so behavior is identical
// to the former method; SignerManager keeps a thin delegator. No behavior change.

import {
  normalizeNip46EncryptionAlgorithm,
  resolveNip46Relays,
  NIP46_RPC_KIND,
  NIP46_HANDSHAKE_TIMEOUT_MS,
  attemptDecryptNip46HandshakePayload,
  normalizeNostrPubkey,
} from "./nip46Client.js";
import { devLogger } from "../utils/logger.js";
import { HEX64_REGEX } from "../utils/hex.js";

export async function waitForRemoteSignerHandshake(
  ctx,
  {
    clientPrivateKey,
    clientPublicKey,
    relays,
    secret,
    onAuthUrl,
    onStatus,
    timeoutMs,
  } = {},
) {
  const normalizedClientPublicKey = normalizeNostrPubkey(clientPublicKey);
  if (!normalizedClientPublicKey) {
    throw new Error(
      "A client public key is required to await the remote signer handshake.",
    );
  }
  if (
    !clientPrivateKey ||
    typeof clientPrivateKey !== "string" ||
    !HEX64_REGEX.test(clientPrivateKey)
  ) {
    throw new Error(
      "A client private key is required to await the remote signer handshake.",
    );
  }

  const resolvedRelays = resolveNip46Relays(relays, ctx.client?.relays);
  if (!resolvedRelays.length) {
    throw new Error("No relays available to complete the remote signer handshake.");
  }

  const pool = await ctx.client.ensurePool();
  const filters = [
    { kinds: [NIP46_RPC_KIND], "#p": [normalizedClientPublicKey] },
  ];
  const waitTimeout =
    Number.isFinite(timeoutMs) && timeoutMs > 0
      ? timeoutMs
      : NIP46_HANDSHAKE_TIMEOUT_MS;

  const coerceStructuredString = (value) => {
    if (typeof value === "string") {
      return value.trim();
    }
    if (Array.isArray(value)) {
      for (const entry of value) {
        const candidate = coerceStructuredString(entry);
        if (candidate) return candidate;
      }
      return "";
    }
    if (value && typeof value === "object") {
      for (const key of ["secret", "message", "status", "result", "url"]) {
        if (Object.prototype.hasOwnProperty.call(value, key)) {
          const candidate = coerceStructuredString(value[key]);
          if (candidate) return candidate;
        }
      }
    }
    return "";
  };

  return new Promise((resolve, reject) => {
    let settled = false;
    let subscription;
    let timeoutId;
    const cleanup = () => {
      if (settled) return;
      settled = true;
      ctx.pendingHandshakeCancel = null;
      try {
        subscription?.unsub?.();
      } catch (error) {
        // ignore subscription cleanup failures
      }
      if (timeoutId) clearTimeout(timeoutId);
    };

    // Allow the UI (modal close / disconnect) to abort the wait.
    ctx.pendingHandshakeCancel = () => {
      cleanup();
      const error = new Error("Remote signer connection cancelled.");
      error.code = "login-cancelled";
      reject(error);
    };

    timeoutId = setTimeout(() => {
      cleanup();
      const error = new Error(
        "Timed out waiting for the remote signer to acknowledge the connection.",
      );
      error.code = "nip46-handshake-timeout";
      reject(error);
    }, waitTimeout);

    try {
      subscription = pool.sub(resolvedRelays, filters);
    } catch (error) {
      cleanup();
      reject(error);
      return;
    }

    subscription.on("event", (event) => {
      if (settled || !event || event.kind !== NIP46_RPC_KIND) {
        return;
      }
      const eventRemotePubkey = normalizeNostrPubkey(event.pubkey);
      const candidateRemotePubkeys = eventRemotePubkey ? [eventRemotePubkey] : [];

      const decryptHandshake =
        ctx._decryptHandshakePayload || attemptDecryptNip46HandshakePayload;
      Promise.resolve()
        .then(() =>
          decryptHandshake({
            clientPrivateKey,
            candidateRemotePubkeys,
            ciphertext: event.content,
          }),
        )
        .then((payloadResult) => {
          let parsed;
          try {
            parsed = JSON.parse(payloadResult?.plaintext ?? "");
          } catch (error) {
            return;
          }

          const resultValue = coerceStructuredString(parsed?.result);
          const errorValue = coerceStructuredString(parsed?.error);

          // auth_url challenge: surface to the UI and keep waiting.
          if (resultValue === "auth_url" && errorValue) {
            if (typeof onAuthUrl === "function") {
              try {
                onAuthUrl(errorValue, {
                  phase: "handshake",
                  remotePubkey: payloadResult?.remotePubkey || eventRemotePubkey || "",
                  requestId: typeof parsed?.id === "string" ? parsed.id : "",
                });
              } catch (callbackError) {
                devLogger.warn("[nostr] Handshake auth_url callback threw:", callbackError);
              }
            }
            return;
          }

          // Match the handshake secret (or accept a generic ack).
          if (secret) {
            const normalizedResult = resultValue ? resultValue.toLowerCase() : "";
            if (resultValue !== secret && normalizedResult !== "ack") return;
          } else if (resultValue) {
            if (!["ack", "ok", "success"].includes(resultValue.toLowerCase())) return;
          }

          cleanup();
          if (typeof onStatus === "function") {
            try {
              onStatus({
                phase: "handshake",
                state: "acknowledged",
                message: "Remote signer acknowledged the connect request.",
                remotePubkey: payloadResult?.remotePubkey || eventRemotePubkey || "",
              });
            } catch (callbackError) {
              devLogger.warn("[nostr] Handshake status callback threw:", callbackError);
            }
          }
          resolve({
            remotePubkey: payloadResult?.remotePubkey || eventRemotePubkey || "",
            eventPubkey: eventRemotePubkey || "",
            response: parsed,
            algorithm: normalizeNip46EncryptionAlgorithm(payloadResult?.algorithm),
          });
        })
        .catch((error) => {
          devLogger.warn(
            "[nostr] Failed to decrypt remote signer handshake payload:",
            error,
          );
        });
    });

    subscription.on("eose", () => {
      // no-op: handshake responses are push-based
    });
  });
}
