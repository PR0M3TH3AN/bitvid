// js/payments/zapReceiptValidator.js

import { nostrToolsReady } from "../nostrToolsBootstrap.js";
import { normalizeToolkitCandidate, readToolkitFromScope } from "../nostr/toolkit.js";
import { userLogger } from "../utils/logger.js";
import { bech32 } from "@scure/base";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "@noble/hashes/utils";

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

  let pool;
  try {
    if (typeof overrides.createPool === "function") {
      pool = overrides.createPool(tools);
    } else if (typeof tools.SimplePool === "function") {
      pool = new tools.SimplePool();
    }
  } catch (error) {
    userLogger.warn("[zapReceiptValidator] Failed to create SimplePool instance.", error);
    pool = null;
  }

  if (!pool || typeof pool.list !== "function") {
    return buildValidationResult({
      status: "failed",
      reason: "Unable to initialize a relay pool for receipt validation.",
      relays: relayUrls,
    });
  }

  const filters = [
    {
      kinds: [ZAP_RECEIPT_KIND],
      "#bolt11": [invoiceCandidate.toLowerCase()],
      limit: 10,
    },
  ];

  let events = [];
  try {
    if (typeof overrides.listEvents === "function") {
      events = await overrides.listEvents(pool, relayUrls, filters);
    } else {
      events = await pool.list(relayUrls, filters);
    }
  } catch (error) {
    userLogger.warn("[zapReceiptValidator] Failed to fetch zap receipts from relays.", error);
    events = [];
  } finally {
    try {
      if (typeof pool.close === "function") {
        pool.close(relayUrls);
      }
    } catch (error) {
      // Ignore close errors.
    }
  }

  if (!Array.isArray(events) || !events.length) {
    return buildValidationResult({
      status: "failed",
      reason: "No zap receipt was published on the advertised relays.",
      relays: relayUrls,
    });
  }

  const normalizedBolt = invoiceCandidate.toLowerCase();
  const successfulEvent = events.find((event) => {
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
    const descriptionValue = descriptionTag[1];
    return descriptionValue === zapRequestString;
  });

  if (!successfulEvent) {
    return buildValidationResult({
      status: "failed",
      reason: "No compliant zap receipt matched the zap request.",
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
