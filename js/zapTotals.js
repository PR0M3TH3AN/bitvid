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

export const ZAP_RECEIPT_KIND = 9735;
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

export function pointerKey(pointer) {
  const type = pointer?.type === "e" ? "e" : pointer?.type === "a" ? "a" : "";
  const value = typeof pointer?.value === "string" ? pointer.value.trim() : "";
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
} = {}) {
  const totals = new Map(); // key → { sats, receiptIds:Set, fetchedAt }
  const pending = new Map(); // key → pointer
  const listeners = new Set();
  let batchTimer = null;

  const entryFor = (key) => {
    let entry = totals.get(key);
    if (!entry) {
      entry = { sats: 0, receiptIds: new Set(), fetchedAt: 0 };
      totals.set(key, entry);
    }
    return entry;
  };

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

    const filters = [];
    for (let i = 0; i < aValues.length; i += MAX_POINTERS_PER_FILTER) {
      filters.push({
        kinds: [ZAP_RECEIPT_KIND],
        "#a": aValues.slice(i, i + MAX_POINTERS_PER_FILTER),
        limit: RECEIPTS_PER_FILTER_LIMIT,
      });
    }
    for (let i = 0; i < eValues.length; i += MAX_POINTERS_PER_FILTER) {
      filters.push({
        kinds: [ZAP_RECEIPT_KIND],
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
    for (const event of Array.isArray(events) ? events : []) {
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
      for (const key of keys) {
        const entry = entryFor(key);
        if (entry.receiptIds.has(event.id)) {
          continue;
        }
        entry.receiptIds.add(event.id);
        if (sats > 0) {
          entry.sats += sats;
        }
        changed = true;
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
      return key ? totals.get(key)?.sats || 0 : 0;
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
      return entry?.sats || 0;
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
