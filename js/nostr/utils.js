// js/nostr/utils.js

export function getActiveKey(video) {
  // A "LEGACY:<pubkey>:<dTag>" videoRootId is synthesized by the deletion
  // builder for legacy videos that have no real root. It must NOT be treated as
  // a distinct root, otherwise a deletion tombstone keys as
  // "ROOT:LEGACY:<pubkey>:<dTag>" while the original legacy event (which carries
  // no videoRootId) keys as "<pubkey>:<dTag>", and the tombstone never matches
  // the zombie it is meant to suppress. Fall through to the pubkey:dTag key so
  // both map to the same identity.
  if (video.videoRootId && !String(video.videoRootId).startsWith("LEGACY:")) {
    return `ROOT:${video.videoRootId}`;
  }
  const dTag = video.tags?.find((t) => t[0] === "d");
  if (dTag) {
    return `${video.pubkey}:${dTag[1]}`;
  }
  return `LEGACY:${video.id}`;
}
