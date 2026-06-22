// Phase 2 reconciliation core for the "My Videos" tab: compare what the user's
// video notes reference against what actually lives in their storage bucket, to
// surface (a) MISSING files — an active note whose hosted file is gone — and
// (b) ORPHAN objects — bucket files no live note references, including the
// "deleted on Nostr but the folder is still in the bucket" case. Pure/sync so
// it's deterministic and testable; the controller supplies the bucket listing.

import { collectVideoStorageKeys } from "../../utils/storagePointer.js";

function trimStr(value) {
  return typeof value === "string" ? value.trim() : "";
}

// Derive the bucket KEY for a hosted URL (mirrors collectVideoStorageKeys'
// internal keyFromUrl). Used to identify the PRIMARY video object so a missing
// main file is flagged, without conflating it with a missing sibling .torrent.
function keyFromUrl(url, publicBaseUrl) {
  const u = trimStr(url);
  const base = trimStr(publicBaseUrl).replace(/\/+$/, "");
  if (!u || !base) {
    return "";
  }
  const prefix = `${base}/`;
  if (!u.startsWith(prefix)) {
    return "";
  }
  let rel = u.slice(prefix.length).split(/[?#]/)[0];
  try {
    rel = rel.split("/").map((seg) => decodeURIComponent(seg)).join("/");
  } catch (_) {
    // keep raw if not valid percent-encoding
  }
  return rel.replace(/^\/+/, "");
}

/**
 * Reconcile the user's videos against their bucket contents.
 *
 * @param {object} params
 * @param {Array<object>} params.videos collapsed current-state videos
 * @param {Array<string>} params.bucketKeys keys present in the bucket (ListObjectsV2)
 * @param {string} params.publicBaseUrl the user's storage public base URL
 * @returns {{
 *   missing: Array<{ video: object, key: string }>,
 *   orphanKeys: string[],
 * }}
 *   missing: active hosted notes whose primary file is absent from the bucket
 *   orphanKeys: bucket objects not referenced by any live (non-deleted) note
 */
export function reconcileStorage({ videos = [], bucketKeys = [], publicBaseUrl = "" } = {}) {
  const present = new Set(
    (Array.isArray(bucketKeys) ? bucketKeys : []).filter(
      (k) => typeof k === "string" && k,
    ),
  );
  const referenced = new Set();
  const missing = [];

  for (const video of Array.isArray(videos) ? videos : []) {
    if (!video || typeof video !== "object") {
      continue;
    }
    // A deleted note references nothing (its URL was scrubbed by the tombstone),
    // so any file left behind for it correctly falls through to orphanKeys.
    if (video.deleted === true) {
      continue;
    }
    // Whole bundle (video + sibling .torrent + thumbnail) counts as "referenced"
    // so none of those are mistaken for orphans.
    for (const key of collectVideoStorageKeys({ videos: [video], publicBaseUrl })) {
      referenced.add(key);
    }
    // Missing status keys off the PRIMARY video object only (a missing .torrent
    // or thumbnail is minor and shouldn't paint the row red).
    const primary = keyFromUrl(video.url, publicBaseUrl);
    if (primary && !present.has(primary)) {
      missing.push({ video, key: primary });
    }
  }

  const orphanKeys = [...present].filter((key) => !referenced.has(key));
  return { missing, orphanKeys };
}
