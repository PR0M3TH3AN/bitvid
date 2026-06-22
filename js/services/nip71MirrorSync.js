// Keeps an opted-in NIP-71 mirror (kind 34235/36) in lockstep with the canonical
// kind-30078 video on edit/delete — the "no UX fuss" glue so the two events never
// drift. Extracted from nostrService (which is size-capped); called from its
// edit/delete handlers. All best-effort: a mirror failure must never break the
// core edit/delete.

import { FEATURE_NIP71_MIRROR } from "../constants.js";
import { nip71MirrorService } from "./nip71MirrorService.js";
import {
  isMirrorEnabled,
  setMirrorEnabled,
  resolveEditSync,
  resolveDeleteSync,
} from "./nip71MirrorFlags.js";
import { devLogger } from "../utils/logger.js";

export async function syncNip71MirrorAfterEdit({ updatedData, pubkey } = {}) {
  if (!updatedData || typeof updatedData !== "object") {
    return;
  }
  const videoRootId =
    typeof updatedData.videoRootId === "string" ? updatedData.videoRootId : "";
  const authorPubkey = typeof pubkey === "string" ? pubkey : "";
  if (!videoRootId || !authorPubkey) {
    return;
  }
  const video = { ...updatedData, pubkey: authorPubkey, videoRootId };
  const decision = resolveEditSync({
    featureOn: FEATURE_NIP71_MIRROR,
    enabled: isMirrorEnabled(authorPubkey, videoRootId),
    eligible: nip71MirrorService.canMirror(video).ok,
  });
  if (decision.action === "none") {
    return;
  }
  try {
    if (decision.action === "publish") {
      await nip71MirrorService.publish(video);
    } else {
      // "unshare": no longer eligible (e.g. flipped private) — pull it down.
      await nip71MirrorService.remove(video);
      setMirrorEnabled(authorPubkey, videoRootId, false);
    }
  } catch (error) {
    devLogger.warn("[nip71MirrorSync] edit sync failed", error);
  }
}

// Drive the lifecycle off nostrService's existing "videos:edited"/"videos:deleted"
// events — so the size-capped nostrService needs no changes. Idempotent: a guard
// prevents double-registration. Returns an unsubscribe fn.
let registered = false;
export function initNip71MirrorSync(nostrService) {
  if (!nostrService || typeof nostrService.on !== "function" || registered) {
    return () => {};
  }
  registered = true;
  const offEdit = nostrService.on("videos:edited", ({ updatedData, pubkey } = {}) => {
    void syncNip71MirrorAfterEdit({ updatedData, pubkey });
  });
  const offDelete = nostrService.on("videos:deleted", ({ videoRootId, video, pubkey } = {}) => {
    void syncNip71MirrorAfterDelete({ videoRootId, video, pubkey });
  });
  return () => {
    registered = false;
    if (typeof offEdit === "function") offEdit();
    if (typeof offDelete === "function") offDelete();
  };
}

export async function syncNip71MirrorAfterDelete({ videoRootId, video, pubkey } = {}) {
  const root = typeof videoRootId === "string" ? videoRootId : "";
  const authorPubkey = typeof pubkey === "string" ? pubkey : "";
  if (!root || !authorPubkey) {
    return;
  }
  const decision = resolveDeleteSync({
    featureOn: FEATURE_NIP71_MIRROR,
    enabled: isMirrorEnabled(authorPubkey, root),
  });
  if (decision.action === "none") {
    return;
  }
  try {
    await nip71MirrorService.remove({
      ...(video || {}),
      videoRootId: root,
      pubkey: authorPubkey,
    });
  } catch (error) {
    devLogger.warn("[nip71MirrorSync] delete sync failed", error);
  } finally {
    setMirrorEnabled(authorPubkey, root, false);
  }
}
