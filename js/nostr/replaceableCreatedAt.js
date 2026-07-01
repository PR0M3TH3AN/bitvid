// Monotonic created_at for replaceable events (NIP-01: kind 30000 subscriptions,
// 30015/30078 preference notes, 10000 blocks, etc). Relays keep only the newest
// event per (kind, pubkey, d-tag) and reject/ignore an update whose created_at is
// not STRICTLY greater than the stored one. Two quick edits within the same
// wall-clock second otherwise collide: the second is rejected as "not newer" (the
// client shows an error) yet lands on relays that break same-created_at ties by id
// (so it "failed but works after refresh"). Always advance past the last-published
// created_at to remove the collision.
//
// @param {number} lastCreatedAt - created_at of the last event we published (0 if none).
// @param {number} [nowSeconds] - current unix seconds (injectable for tests).
// @returns {number} A created_at strictly greater than lastCreatedAt.
export function nextReplaceableCreatedAt(lastCreatedAt, nowSeconds) {
  const now = Number.isFinite(nowSeconds)
    ? Math.floor(nowSeconds)
    : Math.floor(Date.now() / 1000);
  const last = Number.isFinite(lastCreatedAt) ? Math.floor(lastCreatedAt) : 0;
  return Math.max(now, last + 1);
}

export default nextReplaceableCreatedAt;
