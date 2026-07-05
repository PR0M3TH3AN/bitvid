// js/payments/zapReceiptValidator.js

import { nostrToolsReady } from "../nostrToolsBootstrap.js";
import {
  normalizeToolkitCandidate,
  readToolkitFromScope,
  shimLegacySimplePoolMethods,
} from "../nostr/toolkit.js";
import { userLogger } from "../utils/logger.js";
import { bech32, bytesToHex, sha256 } from "../../vendor/crypto-helpers.bundle.min.js";

const ZAP_RECEIPT_KIND = 9735;
const BOLT11_CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
const textEncoder = new TextEncoder();

const globalScope =
  typeof window !== "undefined"
    ? window
    : typeof globalThis !== "undefined"
    ? globalThis
    : null;

const nostrToolsReadySource =
  globalScope &&
  globalScope.nostrToolsReady &&
  typeof globalScope.nostrToolsReady.then === "function"
    ? globalScope.nostrToolsReady
    : nostrToolsReady;

let cachedTools = null;

function rememberTools(candidate) {
  const normalized = normalizeToolkitCandidate(candidate);
  if (normalized) {
    cachedTools = normalized;
  }
}

async function ensureNostrTools() {
  if (cachedTools) {
    return cachedTools;
  }
  try {
    const result = await nostrToolsReadySource;
    rememberTools(result);
  } catch (error) {
    userLogger.warn("[zapReceiptValidator] Failed to await nostr tools bootstrap.", error);
  }
  if (!cachedTools) {
    rememberTools(readToolkitFromScope(globalScope));
  }
  return cachedTools;
}

function computeZapRequestHash(zapRequest) {
  const payload = typeof zapRequest === "string" ? zapRequest : "";
  const data = textEncoder.encode(payload);
  return bytesToHex(sha256(data));
}

function hexToBytes(hex) {
  const clean = typeof hex === "string" ? hex.trim().toLowerCase() : "";
  if (!clean || clean.length % 2 !== 0 || /[^0-9a-f]/.test(clean)) {
    return null;
  }
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

// Proof of settlement: a Lightning payment_hash is sha256(preimage). Anyone can
// check it — this is what makes a payer-signed tally as trustworthy as a
// recipient-signed 9735 (docs/zap-tally-plan.md §3, step 2).
export function verifyPaymentPreimage(preimageHex, paymentHashHex) {
  const preimage = hexToBytes(preimageHex);
  const expected =
    typeof paymentHashHex === "string" ? paymentHashHex.trim().toLowerCase() : "";
  if (!preimage || preimage.length !== 32 || expected.length !== 64) {
    return false;
  }
  return bytesToHex(sha256(preimage)) === expected;
}

const tagValue = (tags, name) => {
  const list = Array.isArray(tags) ? tags : [];
  const tag = list.find((t) => Array.isArray(t) && t[0] === name && t[1] != null);
  return tag ? String(tag[1]) : "";
};

// Verify a bitvid zap-tally event (kind ZAP_TALLY_KIND). Returns
// { ok, sats, paymentHash, pointerTags } — pointerTags come from the EMBEDDED
// zap request (a/e/p), not the outer wrapper, so a mangled wrapper can't
// retarget the credit. `getSats` defaults to nostr-tools' bolt11 amount parser;
// injectable for tests. See docs/zap-tally-plan.md §3.
export function verifyBitvidZapTally(event, { getSats, extractFields } = {}) {
  const fail = { ok: false, sats: 0, paymentHash: null, pointerTags: [] };
  if (!event || typeof event !== "object" || !Array.isArray(event.tags)) {
    return fail;
  }
  const bolt11 = tagValue(event.tags, "bolt11");
  const preimage = tagValue(event.tags, "preimage");
  const zapRequestJson = tagValue(event.tags, "description");
  if (!bolt11 || !preimage) {
    return fail;
  }

  const decode = typeof extractFields === "function" ? extractFields : extractBolt11Fields;
  const { paymentHash, descriptionHash } = decode(bolt11);
  if (!paymentHash) {
    return fail;
  }
  // Step 2: the invoice was actually paid.
  if (!verifyPaymentPreimage(preimage, paymentHash)) {
    return fail;
  }
  // Step 3: that payment was for THIS zap request (binds pointer + amount;
  // blocks reusing a leaked preimage against a different video).
  if (descriptionHash) {
    if (!zapRequestJson || computeZapRequestHash(zapRequestJson) !== descriptionHash) {
      return fail;
    }
  }

  // Amount is authoritative from the bolt11, never the tag.
  let sats = 0;
  try {
    const fn =
      typeof getSats === "function"
        ? getSats
        : cachedTools?.nip57?.getSatoshisAmountFromBolt11;
    const parsed = typeof fn === "function" ? Number(fn(bolt11)) : NaN;
    sats = Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 0;
  } catch (error) {
    sats = 0;
  }
  if (sats <= 0) {
    return fail;
  }

  // Pointer tags from the embedded, hash-bound zap request.
  const req = parseZapRequest(zapRequestJson);
  const reqTags = Array.isArray(req?.tags) ? req.tags : event.tags;
  const pointerTags = reqTags.filter(
    (t) => Array.isArray(t) && (t[0] === "a" || t[0] === "e" || t[0] === "p"),
  );

  return { ok: true, sats, paymentHash, pointerTags };
}

function normalizeRelayList(relays) {
  if (!Array.isArray(relays)) {
    return [];
  }
  const seen = new Set();
  const normalized = [];
  for (const relay of relays) {
    if (typeof relay !== "string") {
      continue;
    }
    const trimmed = relay.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    normalized.push(trimmed);
  }
  return normalized;
}

function parseZapRequest(zapRequest) {
  if (typeof zapRequest !== "string" || !zapRequest.trim()) {
    return null;
  }
  try {
    return JSON.parse(zapRequest);
  } catch (error) {
    return null;
  }
}

function resolveRelayUrls(zapEvent) {
  if (!zapEvent || typeof zapEvent !== "object" || !Array.isArray(zapEvent.tags)) {
    return [];
  }
  const relaysTag = zapEvent.tags.find((tag) => Array.isArray(tag) && tag[0] === "relays");
  if (!relaysTag) {
    return [];
  }
  return normalizeRelayList(relaysTag.slice(1));
}

// Build the relay query to FIND the zap receipt (kind 9735). The receipt copies
// the zap request's #e (event) / #a (coordinate) / #p (recipient) tags, and those
// are the tags relays actually index. A previous implementation filtered ONLY on
// "#bolt11": [invoice] — but most relays do NOT index arbitrary tags like bolt11,
// so the query returned nothing even when the receipt was published, and a
// successful zap looked unconfirmed. Prefer the indexed anchors; the precise
// match (author pubkey + bolt11 + description) still confirms the right receipt.
export function buildReceiptFilters(parsedZapRequest, invoiceCandidate) {
  const tags = Array.isArray(parsedZapRequest?.tags) ? parsedZapRequest.tags : [];
  const findTag = (name) => {
    const tag = tags.find(
      (entry) =>
        Array.isArray(entry) &&
        entry[0] === name &&
        typeof entry[1] === "string" &&
        entry[1].trim()
    );
    return tag ? tag[1].trim() : "";
  };

  const recipient = findTag("p");
  const eventId = findTag("e");
  const coordinate = findTag("a");

  const filter = { kinds: [ZAP_RECEIPT_KIND], limit: 20 };
  if (eventId) {
    filter["#e"] = [eventId];
  } else if (coordinate) {
    filter["#a"] = [coordinate];
  }
  if (recipient) {
    filter["#p"] = [recipient];
  }

  // Last resort: no reliably-indexed anchor available — fall back to the bolt11
  // tag (works only on relays that happen to index it).
  if (!filter["#e"] && !filter["#a"] && !filter["#p"]) {
    const bolt =
      typeof invoiceCandidate === "string" ? invoiceCandidate.toLowerCase() : "";
    return [{ kinds: [ZAP_RECEIPT_KIND], "#bolt11": [bolt], limit: 10 }];
  }

  return [filter];
}

function normalizeInvoiceValue(invoice) {
  if (typeof invoice !== "string") {
    return "";
  }
  const trimmed = invoice.trim();
  return trimmed ? trimmed : "";
}

function normalizePubkey(pubkey) {
  if (typeof pubkey !== "string") {
    return "";
  }
  const trimmed = pubkey.trim();
  return trimmed ? trimmed.toLowerCase() : "";
}

// Walk a bolt11's bech32 tagged fields once, returning the fields we care about:
//   paymentHash     — bolt11 tag 'p' (proves settlement when sha256(preimage)===it)
//   descriptionHash — bolt11 tag 'h' (NIP-57 binds the invoice to the zap request)
// Both hex, or null if absent/undecodable. Shared by the 9735 path and the
// bitvid zap-tally verifier (docs/zap-tally-plan.md §3).
export function extractBolt11Fields(bolt11) {
  const out = { paymentHash: null, descriptionHash: null };
  const normalized = normalizeInvoiceValue(bolt11).toLowerCase();
  if (!normalized) {
    return out;
  }

  let decoded;
  try {
    decoded = bech32.decode(normalized, 2000);
  } catch (error) {
    return out;
  }

  const words = Array.isArray(decoded?.words) ? decoded.words.slice() : [];
  if (words.length <= 104) {
    return out;
  }

  const dataWords = words.slice(0, -104);
  if (dataWords.length <= 7) {
    return out;
  }

  let index = 7; // skip timestamp words
  while (index < dataWords.length) {
    const tagCode = dataWords[index];
    index += 1;
    if (typeof tagCode !== "number" || tagCode < 0 || tagCode >= BOLT11_CHARSET.length) {
      return out;
    }
    if (index + 1 >= dataWords.length) {
      return out;
    }
    const length = (dataWords[index] << 5) + dataWords[index + 1];
    index += 2;
    if (length < 0 || index + length > dataWords.length) {
      return out;
    }
    const dataSlice = dataWords.slice(index, index + length);
    index += length;
    const tag = BOLT11_CHARSET[tagCode];
    if (tag === "h" && !out.descriptionHash) {
      try {
        out.descriptionHash = bytesToHex(Uint8Array.from(bech32.fromWords(dataSlice)));
      } catch (error) {
        /* leave null */
      }
    } else if (tag === "p" && !out.paymentHash) {
      try {
        out.paymentHash = bytesToHex(Uint8Array.from(bech32.fromWords(dataSlice)));
      } catch (error) {
        /* leave null */
      }
    }
    if (out.paymentHash && out.descriptionHash) {
      break;
    }
  }

  return out;
}

function extractDescriptionHashFromBolt11(bolt11) {
  const normalized = normalizeInvoiceValue(bolt11).toLowerCase();
  if (!normalized) {
    return null;
  }

  let decoded;
  try {
    decoded = bech32.decode(normalized, 2000);
  } catch (error) {
    return null;
  }

  const words = Array.isArray(decoded?.words) ? decoded.words.slice() : [];
  if (!words.length) {
    return null;
  }

  if (words.length <= 104) {
    return null;
  }

  const dataWords = words.slice(0, -104);
  if (dataWords.length <= 7) {
    return null;
  }

  let index = 7; // skip timestamp words
  while (index < dataWords.length) {
    const tagCode = dataWords[index];
    index += 1;
    if (typeof tagCode !== "number" || tagCode < 0 || tagCode >= BOLT11_CHARSET.length) {
      return null;
    }
    if (index + 1 >= dataWords.length) {
      return null;
    }
    const length = (dataWords[index] << 5) + dataWords[index + 1];
    index += 2;
    if (length < 0 || index + length > dataWords.length) {
      return null;
    }
    const dataSlice = dataWords.slice(index, index + length);
    index += length;
    const tag = BOLT11_CHARSET[tagCode];
    if (tag === "h") {
      try {
        const bytes = bech32.fromWords(dataSlice);
        return bytesToHex(Uint8Array.from(bytes));
      } catch (error) {
        return null;
      }
    }
  }

  return null;
}

function getInvoiceAmountSats(bolt11, tools, override) {
  if (typeof override === "function") {
    try {
      const overrideResult = override(bolt11);
      const normalized = Number(overrideResult);
      if (Number.isFinite(normalized)) {
        return Math.max(0, Math.round(normalized));
      }
    } catch (error) {
      userLogger.warn("[zapReceiptValidator] Custom bolt11 amount parser failed.", error);
    }
  }
  const fn = tools?.nip57?.getSatoshisAmountFromBolt11;
  if (typeof fn !== "function") {
    return null;
  }
  try {
    const result = Number(fn(bolt11));
    if (!Number.isFinite(result)) {
      return null;
    }
    return Math.max(0, Math.round(result));
  } catch (error) {
    userLogger.warn("[zapReceiptValidator] Failed to parse bolt11 amount via nostr-tools.", error);
    return null;
  }
}

function buildValidationResult({
  status = "skipped",
  reason = null,
  event = null,
  relays = [],
} = {}) {
  return {
    status,
    reason,
    event,
    checkedRelays: Array.isArray(relays) ? relays.slice() : [],
  };
}

// Build the relay pool used to fetch the zap receipt. nostr-tools 2.x SimplePool
// no longer exposes .list(), so a freshly constructed pool can't query — which
// made receipt validation always fail with "Unable to initialize a relay pool"
// after an otherwise-successful zap. Apply the app's legacy .list shim (unless a
// listEvents override supplies its own fetch path).
export function resolveReceiptListPool(tools, overrides = {}) {
  let pool = null;
  try {
    if (typeof overrides.createPool === "function") {
      pool = overrides.createPool(tools);
    } else if (tools && typeof tools.SimplePool === "function") {
      pool = new tools.SimplePool();
    }
  } catch (error) {
    userLogger.warn("[zapReceiptValidator] Failed to create SimplePool instance.", error);
    return null;
  }
  if (
    pool &&
    typeof pool.list !== "function" &&
    typeof overrides.listEvents !== "function"
  ) {
    try {
      shimLegacySimplePoolMethods(pool);
    } catch (error) {
      userLogger.warn("[zapReceiptValidator] Failed to shim SimplePool.list.", error);
    }
  }
  return pool;
}

export async function validateZapReceipt(context = {}, overrides = {}) {
  const {
    zapRequest,
    amountSats,
    metadata,
    invoice,
    payment,
  } = context || {};

  const zapRequestString = typeof zapRequest === "string" ? zapRequest : "";
  if (!zapRequestString) {
    return buildValidationResult({
      status: "skipped",
      reason: "Zap request was not provided.",
    });
  }

  const parsedZapRequest = parseZapRequest(zapRequestString);
  if (!parsedZapRequest) {
    return buildValidationResult({
      status: "failed",
      reason: "Zap request JSON could not be parsed.",
    });
  }

  const relayUrls = resolveRelayUrls(parsedZapRequest);
  if (!relayUrls.length) {
    return buildValidationResult({
      status: "failed",
      reason: "Zap request did not specify any relays.",
    });
  }

  const invoiceCandidate =
    normalizeInvoiceValue(invoice?.invoice ?? invoice) ||
    normalizeInvoiceValue(payment?.invoice ?? payment?.bolt11 ?? "");
  if (!invoiceCandidate) {
    return buildValidationResult({
      status: "failed",
      reason: "Zap invoice was not available for validation.",
      relays: relayUrls,
    });
  }

  const expectedHash = computeZapRequestHash(zapRequestString);
  const decodeHash = overrides.decodeDescriptionHash || extractDescriptionHashFromBolt11;
  let invoiceHash = null;
  try {
    invoiceHash = decodeHash(invoiceCandidate);
  } catch (error) {
    userLogger.warn(
      "[zapReceiptValidator] Custom description hash decoder threw an error.",
      error
    );
    invoiceHash = null;
  }

  if (!invoiceHash) {
    return buildValidationResult({
      status: "failed",
      reason: "Zap invoice did not include a description hash.",
      relays: relayUrls,
    });
  }

  if (invoiceHash !== expectedHash) {
    return buildValidationResult({
      status: "failed",
      reason: "Zap invoice description hash did not match the zap request.",
      relays: relayUrls,
    });
  }

  const tools = overrides.nostrTools || (await ensureNostrTools());
  if (!tools || typeof tools !== "object") {
    return buildValidationResult({
      status: "failed",
      reason: "nostr-tools helpers are unavailable.",
      relays: relayUrls,
    });
  }

  if (typeof tools.validateEvent !== "function" || typeof tools.verifyEvent !== "function") {
    return buildValidationResult({
      status: "failed",
      reason: "nostr-tools validation helpers are missing.",
      relays: relayUrls,
    });
  }

  const expectedAmount = Math.max(0, Math.round(Number(amountSats || 0)));
  if (expectedAmount > 0) {
    const amount = getInvoiceAmountSats(invoiceCandidate, tools, overrides.getAmountFromBolt11);
    if (!Number.isFinite(amount) || amount <= 0) {
      return buildValidationResult({
        status: "failed",
        reason: "Zap invoice amount could not be determined.",
        relays: relayUrls,
      });
    }
    if (amount !== expectedAmount) {
      return buildValidationResult({
        status: "failed",
        reason: "Zap invoice amount did not match the expected share.",
        relays: relayUrls,
      });
    }
  }

  const expectedPubkey = normalizePubkey(metadata?.nostrPubkey);
  if (!expectedPubkey) {
    return buildValidationResult({
      status: "failed",
      reason: "LNURL metadata is missing a nostrPubkey for receipt validation.",
      relays: relayUrls,
    });
  }

  const pool = resolveReceiptListPool(tools, overrides);
  const canListEvents =
    typeof overrides.listEvents === "function" ||
    (pool && typeof pool.list === "function");
  if (!pool || !canListEvents) {
    return buildValidationResult({
      status: "failed",
      reason: "Unable to initialize a relay pool for receipt validation.",
      relays: relayUrls,
    });
  }

  const filters = buildReceiptFilters(parsedZapRequest, invoiceCandidate);

  const normalizedBolt = invoiceCandidate.toLowerCase();
  const matchesReceipt = (event) => {
    if (!event || typeof event !== "object") {
      return false;
    }
    if (event.kind !== ZAP_RECEIPT_KIND) {
      return false;
    }
    if (!tools.validateEvent(event) || !tools.verifyEvent(event)) {
      return false;
    }
    const pubkey = normalizePubkey(event.pubkey);
    if (!pubkey || pubkey !== expectedPubkey) {
      return false;
    }
    if (!Array.isArray(event.tags)) {
      return false;
    }
    const boltTag = event.tags.find(
      (tag) =>
        Array.isArray(tag) &&
        tag[0] === "bolt11" &&
        typeof tag[1] === "string" &&
        tag[1].trim().toLowerCase() === normalizedBolt
    );
    if (!boltTag) {
      return false;
    }
    const descriptionTag = event.tags.find(
      (tag) => Array.isArray(tag) && tag[0] === "description" && typeof tag[1] === "string"
    );
    if (!descriptionTag) {
      return false;
    }
    return descriptionTag[1] === zapRequestString;
  };

  // The recipient's Lightning service publishes the 9735 receipt asynchronously
  // AFTER the invoice is paid — it can land a few seconds after our first query
  // (which resolves on EOSE). One immediate lookup therefore misses slow receipts.
  // Poll a few times with a short delay before giving up. Injectable for tests.
  const attempts = Number.isFinite(overrides.receiptLookupAttempts)
    ? Math.max(1, Math.floor(overrides.receiptLookupAttempts))
    : 3;
  const retryDelayMs = Number.isFinite(overrides.receiptLookupDelayMs)
    ? Math.max(0, Math.floor(overrides.receiptLookupDelayMs))
    : 1200;
  const sleep =
    typeof overrides.sleep === "function"
      ? overrides.sleep
      : (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  let successfulEvent = null;
  let sawAnyEvents = false;
  try {
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      if (attempt > 0 && retryDelayMs > 0) {
        await sleep(retryDelayMs);
      }

      let events = [];
      try {
        if (typeof overrides.listEvents === "function") {
          events = await overrides.listEvents(pool, relayUrls, filters);
        } else {
          events = await pool.list(relayUrls, filters);
        }
      } catch (error) {
        userLogger.warn(
          "[zapReceiptValidator] Failed to fetch zap receipts from relays.",
          error,
        );
        events = [];
      }

      if (Array.isArray(events) && events.length) {
        sawAnyEvents = true;
        const match = events.find(matchesReceipt);
        if (match) {
          successfulEvent = match;
          break;
        }
      }
    }
  } finally {
    try {
      if (typeof pool.close === "function") {
        pool.close(relayUrls);
      }
    } catch (error) {
      // Ignore close errors.
    }
  }

  if (!successfulEvent) {
    return buildValidationResult({
      status: "failed",
      // Distinguish "nothing was there at all" from "events existed but none
      // matched" — the latter is more suspicious; the former is usually just
      // relay coverage/timing.
      reason: sawAnyEvents
        ? "No compliant zap receipt matched the zap request."
        : "No zap receipt was published on the advertised relays.",
      relays: relayUrls,
    });
  }

  return buildValidationResult({
    status: "passed",
    event: successfulEvent,
    relays: relayUrls,
  });
}

export const __TESTING__ = Object.freeze({
  computeZapRequestHash,
  extractDescriptionHashFromBolt11,
});
