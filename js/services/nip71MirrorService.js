// Phase 1 of the NIP-71 interop plan (docs/nip71-migration-plan.md): publish the
// opt-in addressable NIP-71 mirror (kind 34235/34236) for a bitvid video to the
// user's write/outbox relays.
//
// Builds on the Phase 0 pure builder (buildNip71MirrorEvent) which already enforces
// the "private never mirrored" and "HTTPS url required" rules. This service adds:
//   - the site-wide NSFW gate: when ALLOW_NSFW_CONTENT is false, an instance that
//     won't surface NSFW must not publish it outward either (moderation audit item).
//   - signing with the active signer + publishing to the write (outbox) relay set.
//
// Dependency-injected so it unit-tests without a live signer/relay pool.

import { buildNip71MirrorEvent } from "../nostr/nip71Mirror.js";
import { nostrClient } from "../nostrClientFacade.js";
import { getActiveSigner } from "../nostr/index.js";
import {
  publishEventToRelays as defaultPublishEventToRelays,
  summarizePublishResults as defaultSummarize,
} from "../nostrPublish.js";
import { ALLOW_NSFW_CONTENT } from "../config.js";
import { userLogger } from "../utils/logger.js";

function str(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function createNip71MirrorService({
  buildMirrorEvent = buildNip71MirrorEvent,
  getActivePubkey = () => str(nostrClient?.pubkey),
  getSigner = () => getActiveSigner(),
  // Outbox/write set (mirrors getDeletePublishRelays from the delete work).
  getWriteRelays = () =>
    typeof nostrClient?.getDeletePublishRelays === "function"
      ? nostrClient.getDeletePublishRelays()
      : [],
  getPool = () => nostrClient?.pool || null,
  publishEventToRelays = defaultPublishEventToRelays,
  summarizePublishResults = defaultSummarize,
  signEvent = async (template) => {
    const signer = getActiveSigner();
    if (!signer || typeof signer.signEvent !== "function") {
      const err = new Error("Active signer missing signEvent support.");
      err.code = "sign-event-missing";
      throw err;
    }
    return signer.signEvent(template);
  },
  // Instance policy: only mirror NSFW outward when the site permits NSFW.
  allowNsfw = () => ALLOW_NSFW_CONTENT === true,
  now = () => Date.now(),
} = {}) {
  function isAvailable() {
    const pubkey = getActivePubkey();
    const signer = getSigner();
    return Boolean(pubkey) && Boolean(signer) && typeof signer.signEvent === "function";
  }

  // Whether a video is even eligible for the mirror (drives UI gating too).
  function canMirror(video) {
    if (!video || typeof video !== "object") {
      return { ok: false, reason: "invalid" };
    }
    if (video.isPrivate === true) {
      return { ok: false, reason: "private" };
    }
    if (video.isNsfw === true && !allowNsfw()) {
      return { ok: false, reason: "nsfw-blocked" };
    }
    if (!/^https:\/\//i.test(str(video.url))) {
      return { ok: false, reason: "no-url" };
    }
    return { ok: true };
  }

  async function publish(video, options = {}) {
    if (!isAvailable()) {
      return { ok: false, error: "unavailable" };
    }
    // Site NSFW policy gate (defense in depth alongside the UI not offering it).
    if (video?.isNsfw === true && !allowNsfw()) {
      return { ok: false, reason: "nsfw-blocked" };
    }

    const pubkey = str(video?.pubkey) || getActivePubkey();
    const built = buildMirrorEvent(
      { ...video, pubkey },
      { ...options, createdAt: Math.floor(now() / 1000) },
    );
    if (!built.ok) {
      return { ok: false, reason: built.reason };
    }

    let signed;
    try {
      signed = await signEvent(built.event);
    } catch (error) {
      userLogger.warn("[nip71Mirror] Failed to sign mirror event:", error);
      return { ok: false, error: "sign-failed", cause: error };
    }

    const relays = getWriteRelays() || [];
    const pool = getPool();
    if (!pool || !relays.length) {
      return { ok: false, error: "no-relays" };
    }

    const results = await publishEventToRelays(pool, relays, signed);
    const { accepted, failed } = summarizePublishResults(results);
    return {
      ok: accepted.length > 0,
      accepted: accepted.length,
      total: accepted.length + failed.length,
      event: signed,
    };
  }

  return { isAvailable, canMirror, publish };
}

export const nip71MirrorService = createNip71MirrorService();

export default nip71MirrorService;
