// js/nostr/signerHelpers.js

import { devLogger } from "../utils/logger.js";
import { HEX64_REGEX } from "./nip46Client.js";
import { ensureNostrTools, getCachedNostrTools } from "./toolkit.js";
import { normalizeActorKey } from "./watchHistory.js";

let loggedMissingCipherToolkit = false;
let loggedMissingNip04Cipher = false;
let loggedMissingNip44Cipher = false;

export async function createPrivateKeyCipherClosures(privateKey) {
  const normalizedPrivateKey =
    typeof privateKey === "string" && HEX64_REGEX.test(privateKey)
      ? privateKey.toLowerCase()
      : "";

  if (!normalizedPrivateKey) {
    return {};
  }

  const tools = (await ensureNostrTools()) || getCachedNostrTools();
  if (!tools) {
    if (!loggedMissingCipherToolkit) {
      loggedMissingCipherToolkit = true;
      devLogger.warn(
        "[nostr] nostr-tools bundle missing for private key cipher helpers.",
      );
    }
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
  } else if (!loggedMissingNip04Cipher) {
    loggedMissingNip04Cipher = true;
    devLogger.warn(
      "[nostr] nip04 helpers unavailable in nostr-tools bundle.",
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
  } else if (!loggedMissingNip44Cipher) {
    loggedMissingNip44Cipher = true;
    devLogger.warn(
      "[nostr] nip44 helpers unavailable in nostr-tools bundle.",
    );
  }

  return closures;
}
