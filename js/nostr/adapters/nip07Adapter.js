// js/nostr/adapters/nip07Adapter.js

import { normalizeActorKey } from "../watchHistory.js";
import { runNip07WithRetry } from "../nip07Permissions.js";

async function retryNip07Call(operation, label) {
  let lastError = null;
  const attempts = 2; // Retry once on failure
  for (let i = 0; i < attempts; i++) {
    try {
      return await runNip07WithRetry(operation, { label });
    } catch (error) {
      lastError = error;
      // Don't retry if user explicitly rejected
      if (
        error?.message?.toLowerCase().includes("denied") ||
        error?.message?.toLowerCase().includes("rejected")
      ) {
        throw error;
      }
      if (i < attempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
  }
  throw lastError;
}

function resolveNip44Module(extension) {
  const nip44 = extension?.nip44 && typeof extension.nip44 === "object" ? extension.nip44 : null;
  if (!nip44) {
    return null;
  }

  const v2 = nip44.v2 && typeof nip44.v2 === "object" ? nip44.v2 : null;
  if (v2?.encrypt || v2?.decrypt) {
    return v2;
  }

  return nip44;
}

export async function createNip07Adapter(extension) {
  const resolvedExtension = extension || (typeof window !== "undefined" ? window?.nostr : null);
  if (!resolvedExtension) {
    return {
      type: "nip07",
      pubkey: "",
      metadata: async () => null,
      relays: async () => null,
      signEvent: async () => {
        throw new Error("NIP-07 extension unavailable.");
      },
      requestPermissions: async () => ({
        ok: false,
        error: new Error("extension-unavailable"),
      }),
      destroy: async () => {},
      canSign: () => false,
      capabilities: {
        sign: false,
        nip44: false,
        nip04: false,
      },
    };
  }

  const getPublicKey =
    typeof resolvedExtension.getPublicKey === "function"
      ? resolvedExtension.getPublicKey.bind(resolvedExtension)
      : null;
  const pubkey = getPublicKey ? normalizeActorKey(await getPublicKey()) : "";

  const nip04 =
    resolvedExtension.nip04 && typeof resolvedExtension.nip04 === "object"
      ? resolvedExtension.nip04
      : null;
  const nip44 = resolveNip44Module(resolvedExtension);

  const nip04Encrypt =
    nip04 && typeof nip04.encrypt === "function"
      ? (pubkey, plaintext) =>
          retryNip07Call(() => nip04.encrypt(pubkey, plaintext), "nip04.encrypt")
      : null;

  const nip04Decrypt =
    nip04 && typeof nip04.decrypt === "function"
      ? (pubkey, ciphertext) =>
          retryNip07Call(() => nip04.decrypt(pubkey, ciphertext), "nip04.decrypt")
      : null;

  const nip44Encrypt =
    nip44 && typeof nip44.encrypt === "function"
      ? (pubkey, plaintext) =>
          retryNip07Call(() => nip44.encrypt(pubkey, plaintext), "nip44.encrypt")
      : null;

  const nip44Decrypt =
    nip44 && typeof nip44.decrypt === "function"
      ? (pubkey, ciphertext) =>
          retryNip07Call(() => nip44.decrypt(pubkey, ciphertext), "nip44.decrypt")
      : null;

  const requestPermissions = async (methods = []) => {
    if (typeof resolvedExtension.requestPermissions === "function") {
      return retryNip07Call(
        () =>
          resolvedExtension.requestPermissions({
            permissions: Array.isArray(methods) ? methods : [],
          }),
        "extension.requestPermissions",
      );
    }

    if (typeof resolvedExtension.enable === "function") {
      if (Array.isArray(methods) && methods.length) {
        return retryNip07Call(
          () =>
            resolvedExtension.enable({
              permissions: methods.map((method) => ({ method })),
            }),
          "extension.enable",
        );
      }
      return retryNip07Call(() => resolvedExtension.enable(), "extension.enable");
    }

    return { ok: false, error: new Error("permission-request-unavailable") };
  };

  const signer = {
    type: "nip07",
    pubkey,
    metadata: async () =>
      typeof resolvedExtension.getMetadata === "function"
        ? retryNip07Call(() => resolvedExtension.getMetadata(), "extension.getMetadata")
        : null,
    relays: async () =>
      typeof resolvedExtension.getRelays === "function"
        ? retryNip07Call(() => resolvedExtension.getRelays(), "extension.getRelays")
        : null,
    signEvent: async (event) => {
      if (typeof resolvedExtension.signEvent !== "function") {
        throw new Error("NIP-07 extension missing signEvent.");
      }
      return retryNip07Call(() => resolvedExtension.signEvent(event), "extension.signEvent");
    },
    requestPermissions,
    destroy: async () => {},
    canSign: () => typeof resolvedExtension.signEvent === "function",
    capabilities: {
      sign: typeof resolvedExtension.signEvent === "function",
      nip44: Boolean(nip44Encrypt || nip44Decrypt),
      nip04: Boolean(nip04Encrypt || nip04Decrypt),
    },
  };

  if (nip04Encrypt) {
    signer.nip04Encrypt = nip04Encrypt;
  }
  if (nip04Decrypt) {
    signer.nip04Decrypt = nip04Decrypt;
  }
  if (nip44Encrypt) {
    signer.nip44Encrypt = nip44Encrypt;
  }
  if (nip44Decrypt) {
    signer.nip44Decrypt = nip44Decrypt;
  }

  return signer;
}
