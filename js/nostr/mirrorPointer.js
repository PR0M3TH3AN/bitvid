// Addressable pointers to a video's NIP-71 mirror.
//
// The mirror (js/nostr/nip71Mirror.js) is an ADDRESSABLE event: kind
// 34235/34236, author = the video's pubkey, `d` = videoRootId. That makes its
// coordinate fully derivable from a video object with no relay lookup, and the
// pointer keeps resolving after the author edits the video (a plain `nevent`
// would rot on the next replace).
//
// Used by the share flow so a shared note can embed `nostr:naddr1…`, which
// nostr clients render as a native video quote card instead of a bare link.

import {
  NIP71_NORMAL_VIDEO_KIND,
  NIP71_SHORT_VIDEO_KIND,
} from "./nip71Mirror.js";

export { NIP71_NORMAL_VIDEO_KIND, NIP71_SHORT_VIDEO_KIND };

const str = (value) => (typeof value === "string" ? value.trim() : "");

/**
 * Which mirror kind a video's pointer should address.
 *
 * Prefers `kinds` — the kinds actually observed on relays (nip71MirrorService
 * `findMirror`), which is ground truth. Only when that is unavailable does it
 * fall back to the SAME portrait heuristic the mirror builder uses
 * (nip71Mirror.js: `hasDims && height > width`), so a derived pointer matches
 * the event that would be published rather than guessing independently.
 *
 * Returns 0 when there is nothing to point at.
 */
export function resolveMirrorKind({ kinds = [], width, height } = {}) {
  const observed = (Array.isArray(kinds) ? kinds : []).filter(
    (kind) => kind === NIP71_NORMAL_VIDEO_KIND || kind === NIP71_SHORT_VIDEO_KIND
  );
  if (observed.length === 1) {
    return observed[0];
  }
  if (observed.length > 1) {
    // Cross-kind duplicate (nip71MirrorService flags this as `duplicate`).
    // Prefer the normal kind so the pointer is stable rather than arbitrary.
    return observed.includes(NIP71_NORMAL_VIDEO_KIND)
      ? NIP71_NORMAL_VIDEO_KIND
      : observed[0];
  }

  const w = Number(width);
  const h = Number(height);
  const hasDims = Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0;
  if (!hasDims) {
    return NIP71_NORMAL_VIDEO_KIND;
  }
  return h > w ? NIP71_SHORT_VIDEO_KIND : NIP71_NORMAL_VIDEO_KIND;
}

/**
 * Build the `a`-tag coordinate (`kind:pubkey:d`) for a video's mirror.
 * Returns "" when the inputs cannot address anything.
 */
export function buildMirrorCoordinate({ pubkey, videoRootId, kind } = {}) {
  const author = str(pubkey);
  const identifier = str(videoRootId);
  const resolvedKind = Number(kind);
  if (!author || !identifier || !Number.isFinite(resolvedKind) || resolvedKind <= 0) {
    return "";
  }
  return `${resolvedKind}:${author}:${identifier}`;
}

/**
 * Build `naddr1…` for a video's mirror.
 *
 * `nip19` is injected so this stays testable without a browser; callers in the
 * app pass `window.NostrTools.nip19`. Returns "" on any failure — a share note
 * must never embed a malformed pointer, because clients render that as a broken
 * quote box, which is strictly worse than the plain-link fallback.
 *
 * Relay hints matter here: without them a client that doesn't already have the
 * mirror has nowhere to fetch it from, and the quote card renders empty.
 */
export function buildMirrorNaddr({
  pubkey,
  videoRootId,
  kind,
  relays = [],
  nip19,
} = {}) {
  const author = str(pubkey);
  const identifier = str(videoRootId);
  const resolvedKind = Number(kind);
  if (!author || !identifier || !Number.isFinite(resolvedKind) || resolvedKind <= 0) {
    return "";
  }
  if (!nip19 || typeof nip19.naddrEncode !== "function") {
    return "";
  }

  const relayHints = (Array.isArray(relays) ? relays : [])
    .map((entry) => str(entry))
    .filter((entry) => /^wss?:\/\//i.test(entry))
    // A handful is plenty; an naddr carrying a user's whole relay list gets
    // unwieldy in note bodies and leaks more than it helps.
    .slice(0, 3);

  try {
    return (
      nip19.naddrEncode({
        kind: resolvedKind,
        pubkey: author,
        identifier,
        relays: relayHints,
      }) || ""
    );
  } catch (err) {
    return "";
  }
}
