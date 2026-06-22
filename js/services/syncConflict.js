// Conflict-aware push for encrypted settings sync (todo #15 follow-up).
//
// On save we normally push silently. But if the relay copy is NEWER than the one
// we last pushed, another device changed it — overwriting would lose that. So we
// peek the remote created_at (list-only, no decrypt), compare it to our last
// push, and only when the remote is newer do we ask the caller's confirmOverwrite
// callback. On confirm (or no conflict) we push, forcing created_at strictly
// newer than the remote so the replace wins, and record the new push timestamp.

import { getSyncPushedAt, setSyncPushedAt } from "./settingsSyncFlags.js";

export async function pushWithConflictCheck({
  encryptedSync,
  dTag,
  kind,
  pubkey,
  payload,
  confirmOverwrite,
} = {}) {
  let remoteCreatedAt = 0;
  if (encryptedSync && typeof encryptedSync.exists === "function") {
    try {
      const peek = await encryptedSync.exists(dTag);
      remoteCreatedAt = Number(peek?.createdAt) || 0;
    } catch (error) {
      remoteCreatedAt = 0;
    }
  }

  const lastPushed = getSyncPushedAt(pubkey, kind);
  if (remoteCreatedAt && remoteCreatedAt > lastPushed) {
    const confirmed =
      typeof confirmOverwrite === "function"
        ? await confirmOverwrite({ remoteCreatedAt, lastPushed })
        : true;
    if (!confirmed) {
      return { ok: false, skipped: true, conflict: true, remoteCreatedAt };
    }
  }

  const result = await encryptedSync.push(dTag, payload, {
    afterCreatedAt: remoteCreatedAt,
  });
  if (result?.ok && Number.isFinite(result.createdAt)) {
    setSyncPushedAt(pubkey, kind, result.createdAt);
  }
  return result;
}

export default pushWithConflictCheck;
