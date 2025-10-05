// js/payments/zapSplit.js

import { PLATFORM_FEE_PERCENT, ADMIN_SUPER_NPUB } from "../config.js";
import {
  resolveLightningAddress,
  fetchPayServiceData,
  validateInvoiceAmount,
  requestInvoice,
} from "./lnurl.js";
import { ensureWallet, sendPayment } from "./nwcClient.js";
import { getPlatformLightningAddress } from "./platformAddress.js";

const HEX64_REGEX = /^[0-9a-f]{64}$/i;
const ZAP_KIND = 9734;
const DEFAULT_DEPS = Object.freeze({
  lnurl: Object.freeze({
    resolveLightningAddress,
    fetchPayServiceData,
    validateInvoiceAmount,
    requestInvoice,
  }),
  wallet: Object.freeze({ ensureWallet, sendPayment }),
  platformAddress: Object.freeze({ getPlatformLightningAddress }),
});

function getOverridePlatformFee() {
  const override = globalThis?.__BITVID_PLATFORM_FEE_OVERRIDE__;
  if (Number.isFinite(override)) {
    return override;
  }
  return PLATFORM_FEE_PERCENT;
}

function clampPercent(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  return Math.min(100, Math.max(0, numeric));
}

function sanitizeAmount(amount) {
  const numeric = Number(amount);
  if (!Number.isFinite(numeric)) {
    throw new Error("Zap amount must be a positive integer.");
  }
  const rounded = Math.round(numeric);
  if (rounded <= 0) {
    throw new Error("Zap amount must be greater than zero.");
  }
  return rounded;
}

function sanitizeComment(comment) {
  if (typeof comment !== "string") {
    return "";
  }
  return comment.trim();
}

function sanitizeAddress(address) {
  const trimmed = typeof address === "string" ? address.trim() : "";
  return trimmed || "";
}

function mergeDependencies(overrides = {}) {
  const lnurlDeps = {
    ...DEFAULT_DEPS.lnurl,
    ...(overrides.lnurl || {}),
  };
  const walletDeps = {
    ...DEFAULT_DEPS.wallet,
    ...(overrides.wallet || {}),
  };
  const platformDeps = {
    ...DEFAULT_DEPS.platformAddress,
    ...(overrides.platformAddress || {}),
  };

  return { lnurl: lnurlDeps, wallet: walletDeps, platformAddress: platformDeps };
}

function getNostrTools() {
  if (typeof window !== "undefined" && window?.NostrTools) {
    return window.NostrTools;
  }
  if (typeof globalThis !== "undefined" && globalThis?.NostrTools) {
    return globalThis.NostrTools;
  }
  return null;
}

function decodeAdminPubkey() {
  const trimmed = typeof ADMIN_SUPER_NPUB === "string" ? ADMIN_SUPER_NPUB.trim() : "";
  if (!trimmed) {
    return null;
  }
  if (HEX64_REGEX.test(trimmed)) {
    return trimmed.toLowerCase();
  }
  const tools = getNostrTools();
  const decoder = tools?.nip19?.decode;
  if (typeof decoder === "function") {
    try {
      const decoded = decoder(trimmed);
      if (decoded?.type === "npub" && typeof decoded.data === "string") {
        const hex = decoded.data.trim();
        if (HEX64_REGEX.test(hex)) {
          return hex.toLowerCase();
        }
      }
    } catch (error) {
      return null;
    }
  }
  return null;
}

function derivePointerTag(videoEvent) {
  if (!videoEvent || typeof videoEvent !== "object") {
    return null;
  }
  if (!Array.isArray(videoEvent.tags)) {
    return null;
  }
  const dTag = videoEvent.tags.find((tag) => Array.isArray(tag) && tag[0] === "d" && tag[1]);
  if (!dTag) {
    return null;
  }
  if (!Number.isFinite(videoEvent.kind) || typeof videoEvent.pubkey !== "string") {
    return null;
  }
  const value = `${videoEvent.kind}:${videoEvent.pubkey}:${dTag[1]}`;
  return ["a", value];
}

function buildZapRequest({
  wallet,
  recipientPubkey,
  videoEvent,
  amountSats,
  comment,
  lnurl,
}) {
  const tools = getNostrTools();
  if (!tools?.getEventHash || !tools?.signEvent) {
    throw new Error("NostrTools is required to sign zap requests.");
  }

  const tags = [];
  if (recipientPubkey) {
    tags.push(["p", recipientPubkey]);
  }
  if (videoEvent?.id) {
    tags.push(["e", videoEvent.id]);
  }
  const pointerTag = derivePointerTag(videoEvent);
  if (pointerTag) {
    tags.push(pointerTag);
  }
  if (lnurl) {
    tags.push(["lnurl", lnurl]);
  }
  if (Number.isFinite(amountSats)) {
    tags.push(["amount", String(Math.max(0, Math.round(amountSats)) * 1000)]);
  }

  const event = {
    kind: ZAP_KIND,
    content: comment || "",
    created_at: Math.floor(Date.now() / 1000),
    tags,
    pubkey: wallet?.clientPubkey || "",
  };

  event.id = tools.getEventHash(event);
  event.sig = tools.signEvent(event, wallet?.secretKey);

  return JSON.stringify(event);
}

function determineRecipientPubkey({ recipientType, metadata, videoEvent }) {
  if (metadata?.nostrPubkey && HEX64_REGEX.test(metadata.nostrPubkey)) {
    return metadata.nostrPubkey.toLowerCase();
  }
  if (recipientType === "creator" && typeof videoEvent?.pubkey === "string") {
    return videoEvent.pubkey;
  }
  if (recipientType === "platform") {
    return decodeAdminPubkey();
  }
  return null;
}

async function processShare({
  recipientType,
  address,
  amountSats,
  comment,
  videoEvent,
  wallet,
  deps,
}) {
  const resolved = deps.lnurl.resolveLightningAddress(address);
  const metadata = await deps.lnurl.fetchPayServiceData(resolved.url);
  const { amountMsats } = deps.lnurl.validateInvoiceAmount(metadata, amountSats);

  let zapRequest = null;
  if (metadata.allowsNostr === true || metadata.nostrPubkey) {
    const recipientPubkey = determineRecipientPubkey({
      recipientType,
      metadata,
      videoEvent,
    });
    if (recipientPubkey) {
      zapRequest = buildZapRequest({
        wallet,
        recipientPubkey,
        videoEvent,
        amountSats,
        comment,
        lnurl: resolved.url,
      });
    }
  }

  const invoice = await deps.lnurl.requestInvoice(metadata, {
    amountMsats,
    comment,
    zapRequest,
  });

  const payment = await deps.wallet.sendPayment(invoice.invoice, {
    amountSats,
    zapRequest,
  });

  return {
    recipientType,
    address,
    amount: amountSats,
    lnurl: resolved,
    metadata,
    invoice,
    payment,
    zapRequest,
  };
}

export async function splitAndZap(
  { videoEvent, amountSats, comment = "", walletSettings } = {},
  dependencies = {}
) {
  if (!videoEvent || typeof videoEvent !== "object") {
    throw new Error("A video event is required to zap.");
  }

  const amount = sanitizeAmount(amountSats);
  const note = sanitizeComment(comment);
  const deps = mergeDependencies(dependencies);

  const wallet = await deps.wallet.ensureWallet({ settings: walletSettings });

  const creatorAddress = sanitizeAddress(videoEvent.lightningAddress);
  if (!creatorAddress) {
    throw new Error("This creator has not configured a Lightning address yet.");
  }

  const platformFee = clampPercent(getOverridePlatformFee());
  const platformShare = Math.floor((amount * platformFee) / 100);
  const creatorShare = amount - platformShare;

  let platformAddress = null;
  if (platformShare > 0) {
    platformAddress = sanitizeAddress(
      await deps.platformAddress.getPlatformLightningAddress({ forceRefresh: false })
    );
    if (!platformAddress) {
      throw new Error("Platform Lightning address is unavailable.");
    }
  }

  const receipts = [];

  if (creatorShare > 0) {
    receipts.push(
      await processShare({
        recipientType: "creator",
        address: creatorAddress,
        amountSats: creatorShare,
        comment: note,
        videoEvent,
        wallet,
        deps,
      })
    );
  }

  if (platformShare > 0) {
    receipts.push(
      await processShare({
        recipientType: "platform",
        address: platformAddress,
        amountSats: platformShare,
        comment: note,
        videoEvent,
        wallet,
        deps,
      })
    );
  }

  return {
    totalAmount: amount,
    creatorShare,
    platformShare,
    receipts,
  };
}

export const __TESTING__ = Object.freeze({
  buildZapRequest,
  determineRecipientPubkey,
  derivePointerTag,
  mergeDependencies,
});
