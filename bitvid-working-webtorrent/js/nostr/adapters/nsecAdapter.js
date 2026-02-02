// js/nostr/adapters/nsecAdapter.js

import { signEventWithPrivateKey } from "../publishHelpers.js";
import { createPrivateKeyCipherClosures } from "../signerHelpers.js";
import { ensureNostrTools, getCachedNostrTools } from "../toolkit.js";
import { normalizeActorKey } from "../watchHistory.js";

const HEX64_REGEX = /^[0-9a-f]{64}$/i;

function normalizePrivateKey(privateKey) {
  if (typeof privateKey !== "string") {
    return "";
  }
  const trimmed = privateKey.trim();
  if (!trimmed || !HEX64_REGEX.test(trimmed)) {
    return "";
  }
  return trimmed.toLowerCase();
}

async function resolvePublicKey(privateKey, pubkey) {
  const normalizedPubkey = normalizeActorKey(pubkey);
  if (normalizedPubkey && HEX64_REGEX.test(normalizedPubkey)) {
    return normalizedPubkey;
  }

  if (!privateKey) {
    return "";
  }

  const tools = (await ensureNostrTools()) || getCachedNostrTools();
  if (tools?.getPublicKey && typeof tools.getPublicKey === "function") {
    const derived = tools.getPublicKey(privateKey);
    const normalized = normalizeActorKey(derived);
    if (normalized && HEX64_REGEX.test(normalized)) {
      return normalized;
    }
  }

  return "";
}

export async function createNsecAdapter({ privateKey, pubkey } = {}) {
  const normalizedPrivateKey = normalizePrivateKey(privateKey);
  const resolvedPubkey = await resolvePublicKey(normalizedPrivateKey, pubkey);
  const cipherClosures = await createPrivateKeyCipherClosures(normalizedPrivateKey);

  const signer = {
    type: "nsec",
    pubkey: resolvedPubkey,
    metadata: async () => null,
    relays: async () => null,
    signEvent: async (event) => {
      if (!normalizedPrivateKey) {
        throw new Error("Missing private key for signing.");
      }
      return signEventWithPrivateKey(event, normalizedPrivateKey);
    },
    requestPermissions: async () => ({ ok: true }),
    destroy: async () => {},
    canSign: () => Boolean(normalizedPrivateKey),
    capabilities: {
      sign: Boolean(normalizedPrivateKey),
      nip44: false,
      nip04: false,
    },
  };

  if (typeof cipherClosures.nip04Encrypt === "function") {
    signer.nip04Encrypt = cipherClosures.nip04Encrypt;
  }
  if (typeof cipherClosures.nip04Decrypt === "function") {
    signer.nip04Decrypt = cipherClosures.nip04Decrypt;
  }
  if (typeof cipherClosures.nip44Encrypt === "function") {
    signer.nip44Encrypt = cipherClosures.nip44Encrypt;
  }
  if (typeof cipherClosures.nip44Decrypt === "function") {
    signer.nip44Decrypt = cipherClosures.nip44Decrypt;
  }

  signer.capabilities.nip04 = Boolean(
    signer.nip04Encrypt || signer.nip04Decrypt
  );
  signer.capabilities.nip44 = Boolean(
    signer.nip44Encrypt || signer.nip44Decrypt
  );

  return signer;
}
