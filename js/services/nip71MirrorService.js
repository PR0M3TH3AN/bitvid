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

import {
  buildNip71MirrorEvent,
  NIP71_NORMAL_VIDEO_KIND,
  NIP71_SHORT_VIDEO_KIND,
} from "../nostr/nip71Mirror.js";
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
  // L1 chokepoint (no direct pool.list — see scripts/check-direct-pool-access.mjs).
  getSubscriptionManager = () =>
    typeof nostrClient?.getSubscriptionManager === "function"
      ? nostrClient.getSubscriptionManager()
      : null,
  // Look up the author's existing mirror events (both kinds) for a video root, on
  // the write relays where mirrors are published. Returns [{ kind, created_at }].
  // Injected so the idempotency logic unit-tests without a live relay manager.
  fetchExistingMirrors = async ({ pubkey, root }) => {
    const sm = getSubscriptionManager();
    const relays = getWriteRelays() || [];
    if (!sm || typeof sm.list !== "function" || !relays.length) {
      return [];
    }
    try {
      const events = await sm.list({
        filters: [
          {
            kinds: [NIP71_NORMAL_VIDEO_KIND, NIP71_SHORT_VIDEO_KIND],
            authors: [pubkey],
            "#d": [root],
          },
        ],
        relays,
      });
      return (Array.isArray(events) ? events : []).map((e) => ({
        kind: e?.kind,
        created_at: Number(e?.created_at) || 0,
      }));
    } catch (error) {
      userLogger.warn("[nip71Mirror] existing-mirror lookup failed:", error);
      return [];
    }
  },
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
    const root = str(video?.videoRootId);

    // Idempotency (#34): the mirror kind (34235 normal / 34236 short) is inferred
    // from the video's dimensions, which aren't always present — so re-mirroring the
    // same video could publish the OTHER kind, and since (kind,pubkey,d) is the
    // addressable identity that produced a DUPLICATE in NIP-71 clients. Reuse the kind
    // of any existing mirror so a re-publish REPLACES the same coordinate, and remember
    // a stray of the other kind to clean up (self-heals duplicates created earlier).
    let forcedShort = options.short; // explicit caller override always wins
    let staleKind = null;
    let reusedExistingKind = false;
    if (forcedShort === undefined && pubkey && root) {
      const existing = await fetchExistingMirrors({ pubkey, root });
      if (Array.isArray(existing) && existing.length) {
        const newest = existing.reduce((a, b) =>
          (b.created_at || 0) > (a.created_at || 0) ? b : a,
        );
        forcedShort = newest.kind === NIP71_SHORT_VIDEO_KIND;
        reusedExistingKind = true;
        const otherKind = forcedShort
          ? NIP71_NORMAL_VIDEO_KIND
          : NIP71_SHORT_VIDEO_KIND;
        if (existing.some((e) => e.kind === otherKind)) {
          staleKind = otherKind;
        }
      }
    }

    const built = buildMirrorEvent(
      { ...video, pubkey },
      { ...options, short: forcedShort, createdAt: Math.floor(now() / 1000) },
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

    // Self-heal: if a duplicate of the OTHER kind already existed, tear it down via a
    // NIP-09 delete so the video stops showing twice in NIP-71 clients.
    let healedStaleKind = false;
    if (staleKind != null && accepted.length > 0) {
      try {
        const del = await signEvent({
          kind: 5,
          pubkey,
          created_at: Math.floor(now() / 1000),
          content: "Removed duplicate NIP-71 mirror",
          tags: [
            ["a", `${staleKind}:${pubkey}:${root}`],
            ["k", String(staleKind)],
          ],
        });
        const delResults = await publishEventToRelays(pool, relays, del);
        healedStaleKind = summarizePublishResults(delResults).accepted.length > 0;
      } catch (error) {
        userLogger.warn("[nip71Mirror] Failed to clean up duplicate mirror:", error);
      }
    }

    return {
      ok: accepted.length > 0,
      accepted: accepted.length,
      total: accepted.length + failed.length,
      event: signed,
      kind: built.event.kind,
      reusedExistingKind,
      healedStaleKind,
    };
  }

  // Tear down the mirror (on delete, or when the user toggles sync off). Belt-and-
  // suspenders per the plan: a NIP-09 delete referencing BOTH addressable kinds
  // (robust to a since-changed orientation), AND an empty-replace tombstone so
  // clients that cache addressable events but ignore NIP-09 still see it cleared.
  async function remove(video, options = {}) {
    if (!isAvailable()) {
      return { ok: false, error: "unavailable" };
    }
    const pubkey = str(video?.pubkey) || getActivePubkey();
    const root = str(video?.videoRootId);
    if (!pubkey || !root) {
      return { ok: false, error: "invalid" };
    }

    const createdAt = Math.floor(now() / 1000);
    const reason = str(options.reason) || "Removed NIP-71 mirror";

    const deleteEvent = {
      kind: 5,
      pubkey,
      created_at: createdAt,
      content: reason,
      tags: [
        ["a", `34235:${pubkey}:${root}`],
        ["a", `34236:${pubkey}:${root}`],
        ["k", "34235"],
        ["k", "34236"],
      ],
    };

    const width = Number(video?.width);
    const height = Number(video?.height);
    const portrait =
      Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0 && height > width;
    const tombstoneKind =
      options.short === true || (options.short !== false && portrait) ? 34236 : 34235;
    const tombstone = {
      kind: tombstoneKind,
      pubkey,
      created_at: createdAt,
      // No imeta → nothing plays; title kept so the entry reads as removed.
      tags: [["d", root], ["title", str(video?.title) || "[removed]"], ["client", "bitvid"]],
      content: "",
    };

    const relays = getWriteRelays() || [];
    const pool = getPool();
    if (!pool || !relays.length) {
      return { ok: false, error: "no-relays" };
    }

    let publishedOk = 0;
    let total = 0;
    for (const template of [deleteEvent, tombstone]) {
      total += 1;
      let signed;
      try {
        signed = await signEvent(template);
      } catch (error) {
        userLogger.warn("[nip71Mirror] Failed to sign teardown event:", error);
        continue;
      }
      const results = await publishEventToRelays(pool, relays, signed);
      const { accepted } = summarizePublishResults(results);
      if (accepted.length > 0) {
        publishedOk += 1;
      }
    }

    return { ok: publishedOk > 0, published: publishedOk, total };
  }

  // Relay-truth detection (#34): derive "is this mirrored?" from the actual
  // published events instead of the device-local flag. `kinds.length > 1` flags a
  // pre-existing cross-kind duplicate. (UI wiring is a follow-up — batch these.)
  async function findMirror(video) {
    const pubkey = str(video?.pubkey) || getActivePubkey();
    const root = str(video?.videoRootId);
    if (!pubkey || !root) {
      return { mirrored: false, kinds: [], duplicate: false };
    }
    const existing = await fetchExistingMirrors({ pubkey, root });
    const kinds = [
      ...new Set((Array.isArray(existing) ? existing : []).map((e) => e.kind).filter(Boolean)),
    ];
    return { mirrored: kinds.length > 0, kinds, duplicate: kinds.length > 1 };
  }

  return { isAvailable, canMirror, publish, remove, findMirror };
}

export const nip71MirrorService = createNip71MirrorService();

export default nip71MirrorService;
