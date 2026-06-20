// Data aggregation for the "My Videos" management tab.
//
// The Nostr client keeps every version of every video the user has published
// (edits, reverts, deletions) in `allEvents`. For a management view we want ONE
// row per video reflecting its CURRENT state — i.e. the latest version per
// addressable identity (root id / d-tag) — including videos whose latest version
// is a deletion tombstone (those are gone from the active feed but still matter
// here for storage cleanup). Pure/synchronous so it's deterministic + testable.

import { getActiveKey } from "../../nostr/utils.js";

/**
 * Collapse all of a user's video events into one entry per video, keeping the
 * latest version (highest created_at) of each — which carries the current state,
 * including `deleted: true` when the latest version is a tombstone.
 *
 * @param {Array<object>} videos parsed video notes (e.g. nostrClient.allEvents values)
 * @param {string} pubkey the owner's hex pubkey (only their videos are kept)
 * @returns {Array<object>} latest-per-video, newest first
 */
export function collapseUserVideos(videos, pubkey) {
  const target = typeof pubkey === "string" ? pubkey.toLowerCase() : "";
  if (!target) {
    return [];
  }
  const list = Array.isArray(videos) ? videos : [];
  const latestByKey = new Map();

  for (const video of list) {
    if (!video || typeof video !== "object" || video.invalid) {
      continue;
    }
    const videoPubkey =
      typeof video.pubkey === "string" ? video.pubkey.toLowerCase() : "";
    if (videoPubkey !== target) {
      continue;
    }
    const key = getActiveKey(video);
    if (!key) {
      continue;
    }
    const created = Number.isFinite(video.created_at)
      ? Math.floor(video.created_at)
      : 0;
    const existing = latestByKey.get(key);
    const existingCreated =
      existing && Number.isFinite(existing.created_at)
        ? Math.floor(existing.created_at)
        : -1;
    // >= so that, among same-timestamp versions, the last seen wins; the latest
    // version is the authoritative current state of the video.
    if (!existing || created >= existingCreated) {
      latestByKey.set(key, video);
    }
  }

  return Array.from(latestByKey.values()).sort(
    (a, b) => (Number(b.created_at) || 0) - (Number(a.created_at) || 0),
  );
}
