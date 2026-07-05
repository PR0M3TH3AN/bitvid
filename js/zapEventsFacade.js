// js/zapEventsFacade.js
//
// Lists the zap events for a video/profile pointer so the Popularity chart can
// draw a zaps-over-time series (docs/zap-tally-plan.md §5.9). Fetches BOTH real
// NIP-57 receipts (kind 9735) and bitvid tallies (ZAP_TALLY_KIND); the chart's
// buildZapSatsTimeSeries verifies tallies + dedups by payment_hash, so this just
// needs to return the raw events. Routed through the L1 SubscriptionManager
// (relay caps + in-flight dedupe), matching the zap-totals store.

import { nostrClient } from "./nostrClientFacade.js";
import { ZAP_RECEIPT_KIND } from "./zapTotals.js";
import { ZAP_TALLY_KIND } from "./nostrEventSchemas.js";
import { devLogger } from "./utils/logger.js";

const LIMIT = 500;

// pointer: the tag-style ["a"|"e", value, relay?] array resolveVideoPointer
// produces (or an { type, value } object).
function pointerFilterKey(pointer) {
  const type = Array.isArray(pointer)
    ? pointer[0]
    : pointer && typeof pointer === "object"
      ? pointer.type
      : "";
  const value = Array.isArray(pointer)
    ? pointer[1]
    : pointer && typeof pointer === "object"
      ? pointer.value
      : "";
  if ((type === "a" || type === "e") && typeof value === "string" && value.trim()) {
    return { tag: `#${type}`, value: value.trim() };
  }
  return null;
}

export async function listVideoZapEventsWithDefaultClient(
  pointer,
  { since, client = nostrClient } = {},
) {
  const pf = pointerFilterKey(pointer);
  if (!pf) {
    return [];
  }
  const manager =
    typeof client?.getSubscriptionManager === "function"
      ? client.getSubscriptionManager()
      : null;
  const relays = Array.isArray(client?.relays) ? client.relays : [];
  if (!manager || typeof manager.list !== "function" || !relays.length) {
    return [];
  }

  const filter = {
    kinds: [ZAP_RECEIPT_KIND, ZAP_TALLY_KIND],
    [pf.tag]: [pf.value],
    limit: LIMIT,
  };
  if (Number.isFinite(since) && since > 0) {
    filter.since = Math.floor(since);
  }

  try {
    const events = await manager.list({ relays, filters: [filter] });
    return Array.isArray(events) ? events : [];
  } catch (error) {
    devLogger.warn("[zapEvents] Failed to list zap events:", error);
    return [];
  }
}

export default listVideoZapEventsWithDefaultClient;
