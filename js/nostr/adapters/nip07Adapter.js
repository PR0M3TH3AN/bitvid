// js/nostr/adapters/nip07Adapter.js

import { normalizeActorKey } from "../watchHistory.js";
import { runNip07WithRetry } from "../nip07Permissions.js";

async function retryNip07Call(operation, label, priority) {
  let lastError = null;
  const attempts = 2; // Retry once on failure
  for (let i = 0; i < attempts; i++) {
    try {
      return await runNip07WithRetry(operation, { label, priority });
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
        const isChannelClosed = error?.message?.includes("message channel closed");
        const delay = isChannelClosed ? 250 : 100;
        await new Promise((resolve) => setTimeout(resolve, delay));
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

export async function createNip07Adapter(initialExtension) {
  const getExtension = () => {
    if (typeof window !== "undefined" && window.nostr) {
      return window.nostr;
    }
    return initialExtension || null;
  };

  // We use the initial extension state to determine which methods to expose.
  // This matches standard behavior where capabilities are negotiated at login.
  const bootstrapExtension = getExtension();

  if (!bootstrapExtension) {
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

  const getPublicKey = async () => {
    const ext = getExtension();
    if (typeof ext?.getPublicKey !== "function") {
      throw new Error("NIP-07 extension missing getPublicKey.");
    }
    return ext.getPublicKey();
  };

  const pubkey =
    typeof bootstrapExtension.getPublicKey === "function"
      ? normalizeActorKey(await getPublicKey())
      : "";

  // Wrapper builders to ensure dynamic lookup at call time
  const createNip04Encrypt = () => (pubkey, plaintext, options = {}) => {
    const ext = getExtension();
    const nip04 = ext?.nip04;
    if (!nip04 || typeof nip04.encrypt !== "function") {
      throw new Error("NIP-04 encryption unavailable on active extension.");
    }
    return retryNip07Call(
      () => nip04.encrypt(pubkey, plaintext),
      "nip04.encrypt",
      options?.priority,
    );
  };

  const createNip04Decrypt = () => (pubkey, ciphertext, options = {}) => {
    const ext = getExtension();
    const nip04 = ext?.nip04;
    if (!nip04 || typeof nip04.decrypt !== "function") {
      throw new Error("NIP-04 decryption unavailable on active extension.");
    }
    return retryNip07Call(
      () => nip04.decrypt(pubkey, ciphertext),
      "nip04.decrypt",
      options?.priority,
    );
  };

  const createNip44Encrypt = () => (pubkey, plaintext, options = {}) => {
    const ext = getExtension();
    const nip44 = resolveNip44Module(ext);
    if (!nip44 || typeof nip44.encrypt !== "function") {
      throw new Error("NIP-44 encryption unavailable on active extension.");
    }
    return retryNip07Call(
      () => nip44.encrypt(pubkey, plaintext),
      "nip44.encrypt",
      options?.priority,
    );
  };

  const createNip44Decrypt = () => (pubkey, ciphertext, options = {}) => {
    const ext = getExtension();
    const nip44 = resolveNip44Module(ext);
    if (!nip44 || typeof nip44.decrypt !== "function") {
      throw new Error("NIP-44 decryption unavailable on active extension.");
    }
    return retryNip07Call(
      () => nip44.decrypt(pubkey, ciphertext),
      "nip44.decrypt",
      options?.priority,
    );
  };

  const requestPermissions = async (methods = []) => {
    const ext = getExtension();
    if (!ext) {
      return { ok: false, error: new Error("extension-unavailable") };
    }

    if (typeof ext.requestPermissions === "function") {
      return retryNip07Call(
        () =>
          ext.requestPermissions({
            permissions: Array.isArray(methods) ? methods : [],
          }),
        "extension.requestPermissions",
      );
    }

    if (typeof ext.enable === "function") {
      if (Array.isArray(methods) && methods.length) {
        return retryNip07Call(
          () =>
            ext.enable({
              permissions: methods.map((method) => ({ method })),
            }),
          "extension.enable",
        );
      }
      return retryNip07Call(() => ext.enable(), "extension.enable");
    }

    return { ok: false, error: new Error("permission-request-unavailable") };
  };

  const signer = {
    type: "nip07",
    pubkey,
    metadata: async () => {
      const ext = getExtension();
      return typeof ext?.getMetadata === "function"
        ? retryNip07Call(() => ext.getMetadata(), "extension.getMetadata")
        : null;
    },
    relays: async () => {
      const ext = getExtension();
      return typeof ext?.getRelays === "function"
        ? retryNip07Call(() => ext.getRelays(), "extension.getRelays")
        : null;
    },
    signEvent: async (event) => {
      const ext = getExtension();
      if (typeof ext?.signEvent !== "function") {
        throw new Error("NIP-07 extension missing signEvent.");
      }
      return retryNip07Call(() => ext.signEvent(event), "extension.signEvent");
    },
    requestPermissions,
    destroy: async () => {},
    canSign: () => typeof getExtension()?.signEvent === "function",
    // Always expose these methods; they perform their own existence checks at runtime.
    // This handles race conditions where NIP-04/44 APIs are injected lazily.
    nip04Encrypt: createNip04Encrypt(),
    nip04Decrypt: createNip04Decrypt(),
    nip44Encrypt: createNip44Encrypt(),
    nip44Decrypt: createNip44Decrypt(),
  };

  // Define capabilities as dynamic properties to reflect current extension state
  Object.defineProperty(signer, "capabilities", {
    get: () => {
      const ext = getExtension();
      const hasNip04 = ext?.nip04 && typeof ext.nip04 === "object";
      const hasNip44 = !!resolveNip44Module(ext);
      return {
        sign: typeof ext?.signEvent === "function",
        nip44: hasNip44,
        nip04: hasNip04,
      };
    },
    enumerable: true,
    configurable: true,
  });

  return signer;
}
