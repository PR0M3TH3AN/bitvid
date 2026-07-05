// js/payments/zapTallyPublisher.js
//
// Publishes bitvid-native zap tallies (kind ZAP_TALLY_KIND) after a successful
// zap, so the zapped video/profile's total is global + durable even when the
// recipient's LNURL server never publishes a NIP-57 9735 receipt
// (docs/zap-tally-plan.md §5.4-5.5). Each settled share (creator + platform)
// carries its own invoice/preimage, so each becomes one payer-signed,
// preimage-verified tally. Best-effort: a publish failure never affects the
// payment UX (the sats already moved).

import { buildZapTallyEvent } from "../nostrEventSchemas.js";
import { extractBolt11Fields } from "./zapReceiptValidator.js";
import { devLogger, userLogger } from "../utils/logger.js";

const tagFromReq = (req, name) => {
  const tags = Array.isArray(req?.tags) ? req.tags : [];
  const tag = tags.find((t) => Array.isArray(t) && t[0] === name && t[1] != null);
  return tag ? String(tag[1]) : "";
};

// Pure: build the unsigned tally event for one settled zap share, or null when
// it can't be made verifiable (no decodable payment_hash / missing proof).
export function buildTallyFromShare({ share, pubkey, now = () => Math.floor(Date.now() / 1000) } = {}) {
  if (!share || typeof share !== "object" || !pubkey) {
    return null;
  }
  const bolt11 = typeof share.bolt11 === "string" ? share.bolt11.trim() : "";
  const preimage = typeof share.preimage === "string" ? share.preimage.trim() : "";
  const zapRequestJson =
    typeof share.zapRequest === "string" ? share.zapRequest.trim() : "";
  if (!bolt11 || !preimage || !zapRequestJson) {
    return null;
  }

  const { paymentHash } = extractBolt11Fields(bolt11);
  if (!paymentHash) {
    return null; // needs payment_hash for the `d` tag + verification
  }

  let req = null;
  try {
    req = JSON.parse(zapRequestJson);
  } catch (error) {
    return null;
  }

  const amountSats = Math.max(0, Math.round(Number(share.amountSats) || 0));

  return buildZapTallyEvent({
    pubkey,
    created_at: now(),
    paymentHash,
    recipientPubkey: tagFromReq(req, "p"),
    eventId: tagFromReq(req, "e"),
    coordinate: tagFromReq(req, "a"),
    amountMsats: amountSats > 0 ? amountSats * 1000 : undefined,
    bolt11,
    preimage,
    zapRequestJson,
  });
}

// Publish a tally per settled share. `publish(event)` signs + broadcasts (best
// effort); `enabled` gates the whole thing (FEATURE_ZAP_TALLY). Never throws.
export async function publishZapTallies({ shares, pubkey, publish, enabled = true, now } = {}) {
  if (!enabled || typeof publish !== "function" || !pubkey) {
    return { published: 0 };
  }
  const list = Array.isArray(shares) ? shares : [];
  let published = 0;
  for (const share of list) {
    const event = buildTallyFromShare({ share, pubkey, now });
    if (!event) {
      continue;
    }
    try {
      await publish(event);
      published += 1;
      devLogger.log("[zapTally] Published tally for a settled share.");
    } catch (error) {
      // The payment already succeeded; a failed tally publish is non-fatal —
      // the durable local ledger still shows the zap to the sender.
      userLogger.warn("[zapTally] Failed to publish zap tally:", error);
    }
  }
  return { published };
}
