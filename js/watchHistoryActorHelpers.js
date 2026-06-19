// js/watchHistoryActorHelpers.js
//
// Actor-key resolution + extension-permission helpers extracted from
// watchHistoryService.js to keep that module under the file-size budget. These
// depend only on imported singletons (no watchHistoryService module state), so
// they move cleanly. No behavior change.

import {
  getActiveSigner,
  nostrClient,
  requestDefaultExtensionPermissions,
} from "./nostrClientFacade.js";
import { normalizeActorKey } from "./nostr/watchHistory.js";
import { getApplication } from "./applicationContext.js";
import { devLogger, userLogger } from "./utils/logger.js";

export function getLoggedInActorKey() {
  const direct = normalizeActorKey(nostrClient?.pubkey);
  if (direct) {
    return direct;
  }

  if (typeof window !== "undefined") {
    const appCandidate =
      getApplication() || null;
    if (appCandidate && typeof appCandidate === "object") {
      if (typeof appCandidate.normalizeHexPubkey === "function") {
        try {
          const normalized = appCandidate.normalizeHexPubkey(
            appCandidate.pubkey
          );
          if (normalized) {
            return normalizeActorKey(normalized);
          }
        } catch (error) {
          devLogger.warn(
            "[watchHistoryService] Failed to normalize app login pubkey:",
            error
          );
        }
      }

      if (typeof appCandidate.pubkey === "string" && appCandidate.pubkey) {
        const fallback = normalizeActorKey(appCandidate.pubkey);
        if (fallback) {
          return fallback;
        }
      }
    }
  }

  return "";
}

export function getSessionActorKey() {
  const logged = getLoggedInActorKey();
  if (logged) {
    return "";
  }
  return normalizeActorKey(nostrClient?.sessionActor?.pubkey);
}

export async function ensureWatchHistoryExtensionPermissions(actorKey, options = {}) {
  const normalizedActor = normalizeActorKey(actorKey);
  if (!normalizedActor) {
    return { ok: true };
  }

  const loggedActor = normalizeActorKey(nostrClient?.pubkey);
  if (!loggedActor || loggedActor !== normalizedActor) {
    return { ok: true };
  }

  const allowPermissionPrompt = options?.allowPermissionPrompt !== false;

  // FIX: Always attempt to resolve the signer regardless of allowPermissionPrompt.
  // ensureActiveSignerForPubkey does not prompt the user — it only resolves an
  // already-injected extension or returns the existing signer.
  let signer = getActiveSigner();
  if (
    !signer && typeof nostrClient?.ensureActiveSignerForPubkey === "function"
  ) {
    signer = await nostrClient.ensureActiveSignerForPubkey(normalizedActor);
  }

  const canSign = typeof signer?.canSign === "function"
    ? signer.canSign()
    : typeof signer?.signEvent === "function";
  // FIX: NIP-07 adapters use type "nip07", not "extension". Both types
  // represent browser extension signers that need permission pre-granting.
  if (!canSign || (signer?.type !== "extension" && signer?.type !== "nip07")) {
    return { ok: true };
  }

  if (!allowPermissionPrompt) {
    return { ok: true };
  }

  const permissionResult = await requestDefaultExtensionPermissions();
  if (permissionResult.ok) {
    return { ok: true };
  }

  const message =
    "Approve your NIP-07 extension to sync watch history.";
  const error = new Error(message);
  error.code = "watch-history-extension-permission-denied";
  error.cause = permissionResult.error;

  userLogger.warn(
    "[watchHistoryService] Extension denied decrypt permission required for watch history.",
    {
      actor: normalizeActorKey(actorKey) || null,
      error: permissionResult.error,
    },
  );

  return { ok: false, error };
}
