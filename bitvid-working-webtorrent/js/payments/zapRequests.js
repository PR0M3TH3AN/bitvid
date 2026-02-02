// js/payments/zapRequests.js

import {
  resolveLightningAddress,
  fetchPayServiceData,
  encodeLnurlBech32,
  validateInvoiceAmount,
  requestInvoice,
} from "./lnurl.js";
import { buildZapRequestEvent, NOTE_TYPES } from "../nostrEventSchemas.js";
import { publishEventToRelays, assertAnyRelayAccepted } from "../nostrPublish.js";
import { queueSignEvent } from "../nostr/signRequestQueue.js";
import { RELAY_URLS } from "../nostr/toolkit.js";
import { devLogger } from "../utils/logger.js";

const DEFAULT_ZAP_RELAYS = Array.from(RELAY_URLS);

function normalizeRelayList(relays) {
  const list = Array.isArray(relays) ? relays : [];
  const seen = new Set();
  const normalized = [];
  list.forEach((relay) => {
    if (typeof relay !== "string") {
      return;
    }
    const trimmed = relay.trim();
    if (!trimmed || seen.has(trimmed)) {
      return;
    }
    seen.add(trimmed);
    normalized.push(trimmed);
  });
  return normalized;
}

async function resolveSignerPubkey(signer) {
  if (!signer || typeof signer !== "object") {
    return "";
  }
  if (typeof signer.getPublicKey === "function") {
    return signer.getPublicKey();
  }
  if (typeof signer.getPubkey === "function") {
    return signer.getPubkey();
  }
  if (typeof signer.pubkey === "string") {
    return signer.pubkey;
  }
  return "";
}

function resolveLnurlTag(resolved) {
  const candidate = typeof resolved?.address === "string" ? resolved.address.trim() : "";
  if (candidate && candidate.toLowerCase().startsWith("lnurl")) {
    return candidate.toLowerCase();
  }

  const url = typeof resolved?.url === "string" ? resolved.url.trim() : "";
  if (!url) {
    return "";
  }

  return encodeLnurlBech32(url);
}

export async function resolveZapRecipient(address, { fetcher } = {}) {
  const resolved = resolveLightningAddress(address);
  const metadata = await fetchPayServiceData(resolved.url, { fetcher });
  const lnurl = resolveLnurlTag(resolved);
  return { resolved, metadata, lnurl };
}

export function buildZapRequestPayload({
  senderPubkey,
  recipientPubkey,
  relays,
  amountSats,
  comment,
  lnurl,
  eventId,
  coordinate,
  createdAt,
  additionalTags = [],
} = {}) {
  const created_at = Number.isFinite(createdAt)
    ? Math.max(0, Math.floor(createdAt))
    : Math.floor(Date.now() / 1000);
  const event = buildZapRequestEvent({
    pubkey: senderPubkey,
    created_at,
    recipientPubkey,
    relays,
    amountSats,
    content: comment || "",
    lnurl,
    eventId,
    coordinate,
    additionalTags,
  });
  return event;
}

export async function signZapRequest(event, signer, options = {}) {
  if (!signer || typeof signer.signEvent !== "function") {
    throw new Error("A Nostr signer is required to create zap requests.");
  }
  const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : undefined;
  return queueSignEvent(signer, event, { timeoutMs });
}

export async function publishZapRequest(signedEvent, { relays, pool } = {}) {
  const targetRelays = normalizeRelayList(relays);
  const publishTargets = targetRelays.length ? targetRelays : DEFAULT_ZAP_RELAYS;
  const publishResults = await publishEventToRelays(pool, publishTargets, signedEvent);
  const summary = assertAnyRelayAccepted(publishResults, { context: "zap request" });
  return {
    relays: publishTargets,
    summary,
    results: publishResults,
  };
}

export async function createAndPublishZapRequest({
  address,
  recipientPubkey,
  relays,
  amountSats,
  comment,
  eventId,
  coordinate,
  signer,
  pool,
  fetcher,
  additionalTags = [],
} = {}) {
  const { resolved, metadata, lnurl } = await resolveZapRecipient(address, { fetcher });

  if (!metadata?.allowsNostr && !metadata?.nostrPubkey) {
    throw new Error("Recipient LNURL endpoint does not support Nostr zaps.");
  }

  const resolvedRecipient = recipientPubkey || metadata?.nostrPubkey || "";
  if (!resolvedRecipient) {
    throw new Error("Recipient pubkey is required to send a zap request.");
  }

  const normalizedRelays = normalizeRelayList(relays);
  const senderPubkey = await resolveSignerPubkey(signer);
  if (!senderPubkey) {
    throw new Error("Unable to resolve sender pubkey for zap request.");
  }

  const zapRequestEvent = buildZapRequestPayload({
    senderPubkey,
    recipientPubkey: resolvedRecipient,
    relays: normalizedRelays,
    amountSats,
    comment,
    lnurl,
    eventId,
    coordinate,
    additionalTags,
  });

  const signedEvent = await signZapRequest(zapRequestEvent, signer);

  const publishResult = await publishZapRequest(signedEvent, {
    relays: normalizedRelays,
    pool,
  });

  let invoice = null;
  try {
    validateInvoiceAmount(metadata, amountSats);
    invoice = await requestInvoice(metadata, {
      amountSats,
      comment,
      zapRequest: JSON.stringify(signedEvent),
      lnurl,
      fetcher,
    });
  } catch (error) {
    devLogger.warn("[zapRequests] Failed to request invoice for zap request.", error);
  }

  return {
    kind: NOTE_TYPES.ZAP_REQUEST,
    resolved,
    metadata,
    lnurl,
    zapRequest: signedEvent,
    publishResult,
    invoice,
  };
}

export const __TESTING__ = Object.freeze({
  normalizeRelayList,
  resolveLnurlTag,
});
