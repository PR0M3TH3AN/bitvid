// Torrent piece-map lookup for Blossom videos (Phase 2 of the WebTorrent-metadata
// companion event). Given a magnet's infohash + the video's author, fetches the
// infohash-keyed kind-30078 companion event, decodes the embedded `.torrent`, and
// VERIFIES that the reconstructed infohash equals the requested one before handing
// the bytes to WebTorrent. Untrusted content: a mismatch (tamper / wrong event) is
// rejected → the caller falls back to URL-only. See docs/blossom-torrent-metadata-plan.md.
import {
  TORRENT_METADATA_KIND,
  torrentMetadataDTag,
  normalizeInfoHash,
} from "../nostrEventSchemas.js";

// base64 → Uint8Array (browser + Node).
export function base64ToBytes(b64) {
  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(b64, "base64"));
  }
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

function bytesToHex(bytes) {
  let hex = "";
  for (let i = 0; i < bytes.length; i += 1) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}

// Advance past one bencoded value beginning at `i`; returns the index after it.
// Handles integers (`i…e`), byte strings (`<len>:…`), lists (`l…e`) and dicts
// (`d…e`). Throws on anything malformed (callers treat that as "unverifiable").
function skipValue(b, i) {
  if (i >= b.length) throw new Error("bencode: truncated");
  const c = b[i];
  if (c === 0x69 /* i */) {
    i += 1;
    while (i < b.length && b[i] !== 0x65 /* e */) i += 1;
    if (i >= b.length) throw new Error("bencode: unterminated int");
    return i + 1;
  }
  if (c === 0x6c /* l */ || c === 0x64 /* d */) {
    i += 1;
    while (i < b.length && b[i] !== 0x65 /* e */) i = skipValue(b, i);
    if (i >= b.length) throw new Error("bencode: unterminated container");
    return i + 1;
  }
  // byte string: <len>:<bytes>
  let len = 0;
  let sawDigit = false;
  while (i < b.length && b[i] >= 0x30 && b[i] <= 0x39) {
    len = len * 10 + (b[i] - 0x30);
    sawDigit = true;
    i += 1;
  }
  if (!sawDigit || b[i] !== 0x3a /* : */) throw new Error("bencode: bad string");
  i += 1;
  if (i + len > b.length) throw new Error("bencode: string overruns buffer");
  return i + len;
}

// Return the raw bytes of the top-level `info` value in a `.torrent`, or null.
function extractInfoDictBytes(b) {
  if (!(b instanceof Uint8Array) || b[0] !== 0x64 /* d */) return null;
  let i = 1;
  const decoder = new TextDecoder();
  while (i < b.length && b[i] !== 0x65 /* e */) {
    // key (byte string)
    let len = 0;
    let sawDigit = false;
    while (i < b.length && b[i] >= 0x30 && b[i] <= 0x39) {
      len = len * 10 + (b[i] - 0x30);
      sawDigit = true;
      i += 1;
    }
    if (!sawDigit || b[i] !== 0x3a) return null;
    i += 1;
    if (i + len > b.length) return null;
    const key = decoder.decode(b.subarray(i, i + len));
    i += len;
    const valueStart = i;
    i = skipValue(b, i);
    if (key === "info") return b.subarray(valueStart, i);
  }
  return null;
}

// The BitTorrent v1 infohash (SHA-1 of the bencoded `info` dict) of a `.torrent`
// buffer, lowercase hex, or "" if it can't be parsed/hashed.
export async function infoHashFromTorrent(bytes) {
  try {
    const info = extractInfoDictBytes(bytes);
    if (!info) return "";
    const digest = await crypto.subtle.digest("SHA-1", info);
    return bytesToHex(new Uint8Array(digest));
  } catch {
    return "";
  }
}

export class TorrentMetadataService {
  constructor() {
    // Cache the verified piece-map by infohash so repeated plays don't re-query.
    this.cache = new Map();
  }

  /**
   * Fetch + verify a video's torrent piece-map from its companion event.
   *
   * @param {object} params
   * @param {string} params.infoHash - The magnet's `btih` (40 hex).
   * @param {string} [params.author] - The video's author hex pubkey (scopes the query).
   * @param {(filter:object)=>Promise<Array<object>>} params.queryEvents - Relay query.
   * @returns {Promise<{infoHash:string,torrentBytes:Uint8Array}|null>} null ⇒ URL-only.
   */
  async fetch({ infoHash, author, queryEvents } = {}) {
    const hex = normalizeInfoHash(infoHash);
    if (!hex || typeof queryEvents !== "function") return null;
    if (this.cache.has(hex)) return this.cache.get(hex);

    const filter = {
      kinds: [TORRENT_METADATA_KIND],
      "#d": [torrentMetadataDTag(hex)],
    };
    if (author) filter.authors = [author];

    let events;
    try {
      events = await queryEvents(filter);
    } catch {
      return null;
    }
    if (!Array.isArray(events) || events.length === 0) return null;

    // Newest event wins.
    const newest = events
      .filter((e) => e && typeof e.content === "string")
      .sort((a, b) => (b.created_at || 0) - (a.created_at || 0))[0];
    if (!newest) return null;

    let bytes;
    try {
      const envelope = JSON.parse(newest.content);
      if (!envelope || typeof envelope.torrent !== "string") return null;
      bytes = base64ToBytes(envelope.torrent);
    } catch {
      return null;
    }

    // SECURITY: only trust the piece-map if it reconstructs to the requested
    // infohash. A tampered/wrong event fails this and is discarded.
    const actual = await infoHashFromTorrent(bytes);
    if (actual !== hex) return null;

    const result = { infoHash: hex, torrentBytes: bytes };
    this.cache.set(hex, result);
    return result;
  }
}

const torrentMetadataService = new TorrentMetadataService();
export default torrentMetadataService;
