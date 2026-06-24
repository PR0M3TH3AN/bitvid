// Watch-history month bucketing. Items are grouped into "YYYY-MM" buckets by their
// watch time. Legacy/migrated items can arrive with no real watch time
// (watchedAt 0); those used to silo into a literal "1970-01" month that
// self-perpetuated (read back as 0 -> re-bucketed -> re-published with 0). bitvid
// pointer values look like "<kind>:<pubkey>:<dTag>" and the dTag usually embeds the
// video's creation time as a 13-digit millisecond timestamp, so we derive a STABLE
// fallback from it instead.

// Returns the embedded creation time (seconds) from a pointer's d-tag, or 0 if no
// plausible 13-digit ms timestamp is present (e.g. a hash-only d-tag).
export function deriveWatchedAtFromPointer(pointer) {
  const value = typeof pointer?.value === "string" ? pointer.value : "";
  if (!value) {
    return 0;
  }
  const dTag = value.includes(":") ? value.slice(value.lastIndexOf(":") + 1) : value;
  const matches = dTag.match(/\d{13}/g);
  if (!matches) {
    return 0;
  }
  // Constrain to a sane ms range (~2014..~2033) so we don't latch onto 13 random
  // digits inside a hex d-tag.
  const MIN_MS = 1_400_000_000_000;
  const MAX_MS = 2_000_000_000_000;
  for (const match of matches) {
    const ms = Number(match);
    if (Number.isFinite(ms) && ms >= MIN_MS && ms <= MAX_MS) {
      return Math.floor(ms / 1000);
    }
  }
  return 0;
}

// Group already-deduped/sorted/limited pointer items into { "YYYY-MM": [items] }.
// For items with no watch time, derive a stable one from the d-tag and BACKFILL it
// (this is what breaks the 0 -> "1970-01" -> 0 loop). Only truly undecodable items
// still land in the stable epoch bucket.
export function bucketWatchHistoryItemsByMonth(items) {
  const buckets = {};
  const list = Array.isArray(items) ? items : [];
  for (const item of list) {
    let watchedAt = Number.isFinite(item.watchedAt) ? item.watchedAt : 0;
    if (watchedAt <= 0) {
      const derived = deriveWatchedAtFromPointer(item);
      if (derived > 0) {
        watchedAt = derived;
        item.watchedAt = derived;
      }
    }
    const date = new Date(watchedAt * 1000);
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, "0");
    const key = watchedAt > 0 ? `${year}-${month}` : "1970-01";
    if (!buckets[key]) {
      buckets[key] = [];
    }
    buckets[key].push(item);
  }
  return buckets;
}
