// js/nostr/adapters/nsecAdapter.js

import { signEventWithPrivateKey } from "../publishHelpers.js";
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

async function createPrivateKeyCipherClosures(privateKey) {
  const normalizedPrivateKey = normalizePrivateKey(privateKey);
  if (!normalizedPrivateKey) {
    return {};
  }

  const tools = (await ensureNostrTools()) || getCachedNostrTools();
  if (!tools) {
    return {};
  }

  const closures = {};

  const normalizeTargetPubkey = (candidate) => {
    const normalized = normalizeActorKey(candidate);
    if (!normalized || !HEX64_REGEX.test(normalized)) {
      throw new Error("A hex-encoded pubkey is required for encryption.");
    }
    return normalized;
  };

  const resolveHexToBytes = () => {
    if (typeof tools?.utils?.hexToBytes === "function") {
      return (value) => tools.utils.hexToBytes(value);
    }

    return (value) => {
      if (typeof value !== "string") {
        throw new Error("Invalid hex input.");
      }
      const trimmed = value.trim();
      if (!trimmed || trimmed.length % 2 !== 0) {
        throw new Error("Invalid hex input.");
      }

      const bytes = new Uint8Array(trimmed.length / 2);
      for (let index = 0; index < trimmed.length; index += 2) {
        const byte = Number.parseInt(trimmed.slice(index, index + 2), 16);
        if (Number.isNaN(byte)) {
          throw new Error("Invalid hex input.");
        }
        bytes[index / 2] = byte;
      }
      return bytes;
    };
  };

  if (
    tools?.nip04?.encrypt &&
    typeof tools.nip04.encrypt === "function" &&
    tools?.nip04?.decrypt &&
    typeof tools.nip04.decrypt === "function"
  ) {
    closures.nip04Encrypt = async (targetPubkey, plaintext) =>
      tools.nip04.encrypt(
        normalizedPrivateKey,
        normalizeTargetPubkey(targetPubkey),
        plaintext,
      );

    closures.nip04Decrypt = async (targetPubkey, ciphertext) =>
      tools.nip04.decrypt(
        normalizedPrivateKey,
        normalizeTargetPubkey(targetPubkey),
        ciphertext,
      );
  }

  const nip44 = tools?.nip44 || null;
  let nip44Encrypt = null;
  let nip44Decrypt = null;
  let nip44GetConversationKey = null;

  if (nip44?.v2 && typeof nip44.v2 === "object") {
    if (typeof nip44.v2.encrypt === "function") {
      nip44Encrypt = nip44.v2.encrypt;
    }
    if (typeof nip44.v2.decrypt === "function") {
      nip44Decrypt = nip44.v2.decrypt;
    }
    if (typeof nip44.v2?.utils?.getConversationKey === "function") {
      nip44GetConversationKey = nip44.v2.utils.getConversationKey;
    }
  }

  if ((!nip44Encrypt || !nip44Decrypt) && nip44 && typeof nip44 === "object") {
    if (typeof nip44.encrypt === "function") {
      nip44Encrypt = nip44.encrypt;
    }
    if (typeof nip44.decrypt === "function") {
      nip44Decrypt = nip44.decrypt;
    }
    if (!nip44GetConversationKey) {
      if (typeof nip44.getConversationKey === "function") {
        nip44GetConversationKey = nip44.getConversationKey;
      } else if (typeof nip44.utils?.getConversationKey === "function") {
        nip44GetConversationKey = nip44.utils.getConversationKey;
      }
    }
  }

  if (nip44Encrypt && nip44Decrypt && nip44GetConversationKey) {
    const hexToBytes = resolveHexToBytes();
    let cachedPrivateKeyBytes = null;
    const getPrivateKeyBytes = () => {
      if (!cachedPrivateKeyBytes) {
        cachedPrivateKeyBytes = hexToBytes(normalizedPrivateKey);
      }
      return cachedPrivateKeyBytes;
    };

    const conversationKeyCache = new Map();
    const ensureConversationKey = (targetPubkey) => {
      const normalizedTarget = normalizeTargetPubkey(targetPubkey);
      const cached = conversationKeyCache.get(normalizedTarget);
      if (cached) {
        return cached;
      }

      const privateKeyBytes = getPrivateKeyBytes();
      const derived = nip44GetConversationKey(privateKeyBytes, normalizedTarget);
      conversationKeyCache.set(normalizedTarget, derived);
      return derived;
    };

    closures.nip44Encrypt = async (targetPubkey, plaintext) =>
      nip44Encrypt(plaintext, ensureConversationKey(targetPubkey));

    closures.nip44Decrypt = async (targetPubkey, ciphertext) =>
      nip44Decrypt(ciphertext, ensureConversationKey(targetPubkey));
  }

  return closures;
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

  return signer;
}
