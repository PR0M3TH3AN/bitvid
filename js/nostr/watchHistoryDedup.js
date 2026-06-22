// Watch-history events are PARAMETERIZED REPLACEABLE (kind + pubkey + d-tag,
// where the d-tag is the month). When reading across multiple relays we can
// receive several versions of the same month — e.g. a relay that missed the
// latest removal/clear publish still serves the old, larger copy. The reader
// unions items across events, so unless we keep only the NEWEST version per
// address, a lagging relay resurrects items the user just removed.
//
// This collapses a set of events to the newest per replaceable address (by
// created_at), so the union downstream reflects the user's latest intent.

/**
 * @param {Array<object>} events raw nostr events
 * @returns {Array<object>} newest event per d-tag (events without a d-tag are
 *   kept individually by id), sorted newest-first
 */
export function dedupeNewestPerReplaceableAddress(events) {
  const sorted = (Array.isArray(events) ? events : [])
    .filter((event) => event && typeof event === "object")
    .slice()
    .sort((a, b) => (Number(b?.created_at) || 0) - (Number(a?.created_at) || 0));

  const seen = new Set();
  const out = [];
  for (const event of sorted) {
    const dTag = Array.isArray(event.tags)
      ? event.tags.find((tag) => Array.isArray(tag) && tag[0] === "d")?.[1] || ""
      : "";
    // Distinct months have distinct d-tags, so deduping by d-tag keeps one
    // (newest) per month while preserving every month. Events with no d-tag
    // can't be addressed, so they're kept individually by id.
    const key = dTag ? `d:${dTag}` : `id:${event.id}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(event);
  }
  return out;
}
