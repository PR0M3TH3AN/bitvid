// Pure helpers for batching the community-blacklist curator fetch into a single
// multi-author REQ instead of one kind-30000 REQ per curator (the cold-start
// relay storm). Kept dependency-free so they're cheat-resistant to test.

// Build a single batched filter for many (authorHex, dTag) references. A Nostr
// filter ORs `authors` and ORs `#d`, so one REQ replaces N per-curator REQs.
// Over-fetches author×dtag cross-products, which selectNewestEventsForReferences
// discards when matching back to exact references.
export function buildBatchedReferenceFilter(references, { kind = 30000 } = {}) {
  const authors = new Set();
  const dTags = new Set();
  for (const ref of Array.isArray(references) ? references : []) {
    const author =
      typeof ref?.authorHex === "string" ? ref.authorHex.trim().toLowerCase() : "";
    const dTag = typeof ref?.dTag === "string" ? ref.dTag.trim() : "";
    if (author) authors.add(author);
    if (dTag) dTags.add(dTag);
  }
  if (!authors.size || !dTags.size) {
    return null;
  }
  return {
    kinds: [kind],
    authors: Array.from(authors),
    "#d": Array.from(dTags),
  };
}

function dTagOf(event) {
  const tags = Array.isArray(event?.tags) ? event.tags : [];
  for (const tag of tags) {
    if (Array.isArray(tag) && tag[0] === "d") {
      return typeof tag[1] === "string" ? tag[1] : "";
    }
  }
  return "";
}

// Group batched events to the newest per (author, dTag), then return the events
// matching the requested references (in reference order). Cross-product events
// (author×dtag combinations that weren't requested) are discarded.
export function selectNewestEventsForReferences(events, references) {
  const newest = new Map(); // key `${pubkey}:${dtag}` -> event
  for (const event of Array.isArray(events) ? events : []) {
    const pubkey = typeof event?.pubkey === "string" ? event.pubkey.toLowerCase() : "";
    const dTag = dTagOf(event);
    if (!pubkey || !dTag) {
      continue;
    }
    const key = `${pubkey}:${dTag}`;
    const prev = newest.get(key);
    if (
      !prev ||
      event.created_at > prev.created_at ||
      (event.created_at === prev.created_at && event.id > prev.id)
    ) {
      newest.set(key, event);
    }
  }
  const matched = [];
  for (const ref of Array.isArray(references) ? references : []) {
    const author = typeof ref?.authorHex === "string" ? ref.authorHex.toLowerCase() : "";
    const dTag = typeof ref?.dTag === "string" ? ref.dTag : "";
    const event = newest.get(`${author}:${dTag}`);
    if (event) {
      matched.push(event);
    }
  }
  return matched;
}

// Fetch all curator blacklists in ONE batched REQ and return the newest event
// matched to each reference. `listEvents` is injected (the subscription
// manager's health-gated, timeout-bounded list) so this stays off the raw pool.
// Returns [] when there's nothing to batch; rejects on fetch failure.
export async function fetchBatchedReferenceEvents({
  references,
  listEvents,
  relays,
  timeoutMs,
}) {
  const filter = buildBatchedReferenceFilter(references);
  if (!filter || typeof listEvents !== "function") {
    return [];
  }
  const events = await listEvents({ filters: [filter], relays, timeoutMs });
  return selectNewestEventsForReferences(events, references);
}
