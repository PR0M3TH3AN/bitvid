// Channel-profile video sourcing: a creator's wall should show BOTH their
// bitvid-native kind-30078 videos AND the NIP-71 videos they published via other
// apps (Nostube etc.) — matching what the main feed shows via ingest. Previously
// the profile fetched only kind-30078, so cross-posted NIP-71 videos were absent.

import { convertEventToVideo as sharedConvertEventToVideo } from "./nostr/index.js";
import { buildVideoFromNip71Event, NIP71_KINDS } from "./nostr/nip71IngestAdapter.js";

// Two filters for one author: native video notes (kind 30078, tagged "video")
// and their NIP-71 videos (kinds 21/22/34235/34236).
export function buildChannelVideoFilters(pubkey, { limit = 200 } = {}) {
  return [
    { kinds: [30078], authors: [pubkey], "#t": ["video"], limit },
    { kinds: Array.from(NIP71_KINDS), authors: [pubkey], limit },
  ];
}

// Convert a raw channel event to a bitvid video object. Foreign NIP-71 kinds go
// through the ingest adapter (which also rejects bitvid's own outbound mirrors so
// they don't duplicate the canonical kind-30078 note); everything else uses the
// standard kind-30078 converter. May return an { invalid: true } object — the
// caller filters those out (same contract as convertEventToVideo).
export function convertChannelEvent(entry) {
  const kind = Number(entry?.kind);
  if (NIP71_KINDS.has(kind)) {
    return buildVideoFromNip71Event(entry);
  }
  return sharedConvertEventToVideo(entry);
}
