// js/zapTotals.js
//
// Per-video ZAP TOTAL aggregation (kind-9735 receipts) for the "Most Zapped"
// tab (#47). Mirrors viewCounter's surface at feed granularity: the feed's
// getZapTotal(video) reads the cached sats total AND schedules a batched
// one-shot fetch for unknown/stale pointers; when a batch lands,
// onZapTotalsChanged fires and the Most Zapped view re-runs the feed (a cheap
// in-memory re-rank), so the order settles as totals stream in.
//
// Amounts: nostr-tools nip57.getSatoshisAmountFromBolt11 on the receipt's
// bolt11 tag, falling back to the embedded zap request's amount tag (msats).
// Receipts are deduped by event id per pointer, so re-fetches never
// double-count.

import { devLogger } from "./utils/logger.js";
import {
  verifyBitvidZapTally,
  extractBolt11Fields,
} from "./payments/zapReceiptValidator.js";
import { ZAP_TALLY_KIND } from "./nostrEventSchemas.js";
import { FEATURE_ZAP_TALLY } from "./constants.js";

export const ZAP_RECEIPT_KIND = 9735;
export const SENT_ZAPS_STORAGE_KEY = "bitvid:sentZaps:v1";
const FETCH_TTL_MS = 120000;
const BATCH_DELAY_MS = 150;
const MAX_POINTERS_PER_FILTER = 100;
const RECEIPTS_PER_FILTER_LIMIT = 500;

function tagValues(event, name) {
  if (!Array.isArray(event?.tags)) {
    return [];
  }
  return event.tags
    .filter((tag) => Array.isArray(tag) && tag[0] === name && typeof tag[1] === "string")
    .map((tag) => tag[1]);
}

// Accepts BOTH pointer shapes used in the app: the canonical tag-style array
// ["a"|"e", value, relay?] (what deriveVideoPointerInfo/resolveVideoPointer
// produce) and the object form { type, value }.
export function pointerKey(pointer) {
  let type = "";
  let value = "";
  if (Array.isArray(pointer)) {
    type = pointer[0] === "a" || pointer[0] === "e" ? pointer[0] : "";
    value = typeof pointer[1] === "string" ? pointer[1].trim() : "";
  } else if (pointer && typeof pointer === "object") {
    type = pointer.type === "a" || pointer.type === "e" ? pointer.type : "";
    value = typeof pointer.value === "string" ? pointer.value.trim() : "";
  }
  if (!type || !value) {
    return "";
  }
  return `${type}:${value}`;
}

// Sats carried by one receipt: bolt11 first (the actual paid invoice), then
// the zap request's amount tag (msats) embedded in the description.
export function extractReceiptAmountSats(event, tools) {
  const bolt11 = tagValues(event, "bolt11")[0] || "";
  const fromBolt11 = tools?.nip57?.getSatoshisAmountFromBolt11;
  if (bolt11 && typeof fromBolt11 === "function") {
    try {
      const sats = Number(fromBolt11(bolt11));
      if (Number.isFinite(sats) && sats > 0) {
        return Math.round(sats);
      }
    } catch (error) {
      // fall through to the description amount
    }
  }
  const description = tagValues(event, "description")[0] || "";
  if (description) {
    try {
      const request = JSON.parse(description);
      const amountTag = Array.isArray(request?.tags)
        ? request.tags.find((tag) => Array.isArray(tag) && tag[0] === "amount")
        : null;
      const msats = Number(amountTag?.[1]);
      if (Number.isFinite(msats) && msats > 0) {
        return Math.round(msats / 1000);
      }
    } catch (error) {
      // unparseable description — count the receipt as zero
    }
  }
  return 0;
}

export function createZapTotalsStore({
  now = () => Date.now(),
  batchDelayMs = BATCH_DELAY_MS,
  fetchTtlMs = FETCH_TTL_MS,
  getClient = () => null,
  getTools = () => null,
  schedule = (fn, ms) => setTimeout(fn, ms),
  // bitvid-native zap tally (docs/zap-tally-plan.md): count kind-30081
  // preimage-verified tallies alongside 9735s, deduped by payment_hash.
  // Injectable for tests; the singleton wires the real verifier + flag.
  isTallyEnabled = () => true,
  verifyTally = verifyBitvidZapTally,
  tallyKind = ZAP_TALLY_KIND,
  // Durable ledger of the user's OWN sent zaps (localStorage key), so their
  // zapped videos keep the count + Most-Zapped rank across reloads even when
  // the recipient's LNURL server never publishes a 9735 receipt (custodial
  // wallets like Strike routinely don't). Pass null to disable (tests).
  persistKey = SENT_ZAPS_STORAGE_KEY,
} = {}) {
  // key → { sats, optimisticSats, receiptIds:Set, fetchedAt }
  //   sats            — summed from real relay receipts (deduped by event id)
  //   optimisticSats  — the user's OWN sent zaps (durable ledger + session
  //                     bumps), shown instantly like ingestLocalViewEvent.
  //                     Cleared once a real receipt for the pointer arrives, so
  //                     if the recipient DOES publish, the relay becomes
  //                     authoritative and the value is never double-counted.
  const totals = new Map();
  const pending = new Map(); // key → pointer
  const listeners = new Set();
  let batchTimer = null;

  // --- durable sent-zap ledger (localStorage: { pointerKey: sats }) ---
  const readLedger = () => {
    if (!persistKey || typeof localStorage === "undefined") {
      return {};
    }
    try {
      const raw = localStorage.getItem(persistKey);
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (error) {
      return {};
    }
  };
  const writeLedger = (ledger) => {
    if (!persistKey || typeof localStorage === "undefined") {
      return;
    }
    try {
      const keys = Object.keys(ledger || {});
      if (!keys.length) {
        localStorage.removeItem(persistKey);
      } else {
        localStorage.setItem(persistKey, JSON.stringify(ledger));
      }
    } catch (error) {
      /* best-effort */
    }
  };

  const entryFor = (key) => {
    let entry = totals.get(key);
    if (!entry) {
      entry = {
        sats: 0,
        optimisticSats: 0,
        receiptIds: new Set(),
        // Cross-source dedup: a single payment can yield BOTH a 9735 and a
        // bitvid tally; count its sats once (docs/zap-tally-plan.md §4).
        paymentHashes: new Set(),
        fetchedAt: 0,
      };
      totals.set(key, entry);
    }
    return entry;
  };

  // Seed the optimistic layer from the durable ledger at construction.
  for (const [key, sats] of Object.entries(readLedger())) {
    const amount = Number(sats);
    if (typeof key === "string" && key && Number.isFinite(amount) && amount > 0) {
      entryFor(key).optimisticSats = Math.round(amount);
    }
  }

  const totalOf = (entry) =>
    (entry?.sats || 0) + (entry?.optimisticSats || 0);

  const emitChange = () => {
    for (const listener of listeners) {
      try {
        listener();
      } catch (error) {
        devLogger.warn("[zapTotals] Change listener threw:", error);
      }
    }
  };

  async function runBatch() {
    batchTimer = null;
    if (!pending.size) {
      return;
    }
    const batch = new Map(pending);
    pending.clear();

    const client = getClient();
    const manager =
      typeof client?.getSubscriptionManager === "function"
        ? client.getSubscriptionManager()
        : null;
    const relays = Array.isArray(client?.relays) ? client.relays : [];
    if (!manager || typeof manager.list !== "function" || !relays.length) {
      // Leave fetchedAt untouched so a later attempt retries.
      return;
    }

    const aValues = [];
    const eValues = [];
    for (const pointer of batch.values()) {
      if (pointer.type === "a") aValues.push(pointer.value);
      else if (pointer.type === "e") eValues.push(pointer.value);
    }

    // One query for both sources: real 9735 receipts + bitvid tallies.
    const tallyOn = (() => {
      try {
        return isTallyEnabled() !== false;
      } catch (error) {
        return false;
      }
    })();
    const kinds = tallyOn ? [ZAP_RECEIPT_KIND, tallyKind] : [ZAP_RECEIPT_KIND];
    const filters = [];
    for (let i = 0; i < aValues.length; i += MAX_POINTERS_PER_FILTER) {
      filters.push({
        kinds,
        "#a": aValues.slice(i, i + MAX_POINTERS_PER_FILTER),
        limit: RECEIPTS_PER_FILTER_LIMIT,
      });
    }
    for (let i = 0; i < eValues.length; i += MAX_POINTERS_PER_FILTER) {
      filters.push({
        kinds,
        "#e": eValues.slice(i, i + MAX_POINTERS_PER_FILTER),
        limit: RECEIPTS_PER_FILTER_LIMIT,
      });
    }

    let events = [];
    try {
      // Routed through the L1 SubscriptionManager (relay caps + in-flight
      // dedupe) — the direct-pool-access lint gate forbids raw pool.list here.
      events = await manager.list({ relays, filters });
    } catch (error) {
      devLogger.warn("[zapTotals] Receipt fetch failed:", error);
      return; // retry on the next request
    }

    const fetchedAt = now();
    // Mark every requested pointer fresh (a pointer with no receipts is a
    // real answer: zero sats), THEN fold receipts in.
    for (const key of batch.keys()) {
      entryFor(key).fetchedAt = fetchedAt;
    }

    let changed = false;
    const keysWithRealReceipt = new Set();
    const list = Array.isArray(events) ? events : [];

    // 1) Real NIP-57 receipts (9735). Record each payment_hash so a matching
    //    bitvid tally for the same payment isn't also counted.
    for (const event of list) {
      if (!event || event.kind !== ZAP_RECEIPT_KIND || !event.id) {
        continue;
      }
      const keys = [
        ...tagValues(event, "a").map((value) => `a:${value}`),
        ...tagValues(event, "e").map((value) => `e:${value}`),
      ].filter((key) => batch.has(key) || totals.has(key));
      if (!keys.length) {
        continue;
      }
      const sats = extractReceiptAmountSats(event, getTools());
      const paymentHash = extractBolt11Fields(tagValues(event, "bolt11")[0] || "")
        .paymentHash;
      for (const key of keys) {
        const entry = entryFor(key);
        keysWithRealReceipt.add(key);
        if (entry.receiptIds.has(event.id)) {
          continue;
        }
        entry.receiptIds.add(event.id);
        if (paymentHash) {
          entry.paymentHashes.add(paymentHash);
        }
        if (sats > 0) {
          entry.sats += sats;
        }
        changed = true;
      }
    }

    // 2) bitvid tallies (verified; deduped by payment_hash vs. 9735s + earlier
    //    tallies). Pointers come from the embedded, hash-bound zap request.
    if (tallyOn) {
      for (const event of list) {
        if (!event || event.kind !== tallyKind) {
          continue;
        }
        let verdict;
        try {
          verdict = verifyTally(event, {
            getSats: getTools()?.nip57?.getSatoshisAmountFromBolt11,
          });
        } catch (error) {
          verdict = null;
        }
        if (!verdict?.ok || !(verdict.sats > 0) || !verdict.paymentHash) {
          continue;
        }
        const keys = verdict.pointerTags
          .filter((t) => t[0] === "a" || t[0] === "e")
          .map((t) => `${t[0]}:${t[1]}`)
          .filter((key) => batch.has(key) || totals.has(key));
        for (const key of keys) {
          const entry = entryFor(key);
          keysWithRealReceipt.add(key);
          if (entry.paymentHashes.has(verdict.paymentHash)) {
            continue; // already counted via a 9735 or an earlier tally
          }
          entry.paymentHashes.add(verdict.paymentHash);
          entry.sats += verdict.sats;
          changed = true;
        }
      }
    }
    // A pointer that now has real receipts is authoritative — drop its
    // optimistic bump AND its durable ledger entry, so once the relay actually
    // reflects zaps for this video we trust it and never double-count.
    if (keysWithRealReceipt.size) {
      const ledger = readLedger();
      let ledgerChanged = false;
      for (const key of keysWithRealReceipt) {
        const entry = totals.get(key);
        if (entry && entry.optimisticSats > 0) {
          entry.optimisticSats = 0;
          changed = true;
        }
        if (key in ledger) {
          delete ledger[key];
          ledgerChanged = true;
        }
      }
      if (ledgerChanged) {
        writeLedger(ledger);
      }
    }
    if (changed || batch.size) {
      emitChange();
    }
  }

  return {
    // Cached total only — never triggers a fetch.
    getSnapshot(pointer) {
      const key = pointerKey(pointer);
      return key ? totalOf(totals.get(key)) : 0;
    },
    // Cached total now, plus a scheduled batched fetch when unknown/stale.
    request(pointer) {
      const key = pointerKey(pointer);
      if (!key) {
        return 0;
      }
      const entry = totals.get(key);
      const fresh = entry && now() - entry.fetchedAt < fetchTtlMs;
      if (!fresh && !pending.has(key)) {
        pending.set(key, { type: key[0], value: key.slice(2) });
        if (!batchTimer) {
          batchTimer = schedule(() => {
            void runBatch();
          }, batchDelayMs);
        }
      }
      return totalOf(entry);
    },
    // Optimistic bump for a zap THIS client just sent (mirrors
    // ingestLocalViewEvent): the sats show instantly on the card + modal, and
    // fetchedAt is refreshed so we don't immediately re-fetch and double-count
    // before the real receipt propagates. When the real receipt later lands,
    // runBatch clears the optimistic portion. Persists in-memory until the real
    // receipt arrives or the page reloads (receipts from custodial wallets may
    // never be published — the bump keeps the zapper's own view honest).
    ingestLocalZap(pointer, sats) {
      const key = pointerKey(pointer);
      const amount = Number.isFinite(sats) ? Math.max(0, Math.round(sats)) : 0;
      if (!key || amount <= 0) {
        return;
      }
      const entry = entryFor(key);
      entry.optimisticSats += amount;
      entry.fetchedAt = now();
      // Persist to the durable ledger so the badge + Most-Zapped rank survive a
      // reload even when no 9735 receipt is ever published for this zap.
      const ledger = readLedger();
      ledger[key] = (Number(ledger[key]) || 0) + amount;
      writeLedger(ledger);
      emitChange();
    },
    onChange(listener) {
      if (typeof listener !== "function") {
        return () => {};
      }
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    // Test hook: run the pending batch immediately.
    async flush() {
      await runBatch();
    },
  };
}

// --- App singleton -----------------------------------------------------------

let clientRef = null;
let toolsRef = null;

const store = createZapTotalsStore({
  getClient: () => clientRef,
  // Lazily resolve the canonical nostr-tools (nip57 bolt11 amount helper);
  // the toolkit bootstrap stamps it on the global before feeds run.
  getTools: () =>
    toolsRef ||
    globalThis.__BITVID_CANONICAL_NOSTR_TOOLS__ ||
    globalThis.NostrTools ||
    null,
  // Read the flag live so a runtime toggle takes effect on the next fetch.
  isTallyEnabled: () => FEATURE_ZAP_TALLY,
});

export function initZapTotals({ nostrClient, tools } = {}) {
  if (nostrClient) {
    clientRef = nostrClient;
  }
  if (tools) {
    toolsRef = tools;
  }
}

export function getVideoZapTotalSnapshot(pointer) {
  return store.getSnapshot(pointer);
}

export function requestVideoZapTotal(pointer) {
  return store.request(pointer);
}

export function onZapTotalsChanged(listener) {
  return store.onChange(listener);
}

// Optimistic bump after this client sends a zap, so the card + modal badge
// update instantly (the relay receipt reconciles later).
export function ingestLocalVideoZap(pointer, sats) {
  return store.ingestLocalZap(pointer, sats);
}

// The singleton store itself — exposes flush() for tests.
export default store;

// Console debug handle: window.__bitvidZapTotals.getSnapshot(["a","30078:…"]),
// .request(pointer), .flush() — for diagnosing why a badge is (not) showing.
if (typeof window !== "undefined") {
  window.__bitvidZapTotals = store;
}
