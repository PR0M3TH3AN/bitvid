// js/nostr/adapters/nip07Adapter.js

import { normalizeActorKey } from "../watchHistory.js";

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
      requestPermissions: async () => ({ ok: false, error: new Error("extension-unavailable") }),
      destroy: async () => {},
      canSign: () => false,
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
    nip04 && typeof nip04.encrypt === "function" ? nip04.encrypt.bind(nip04) : null;
  const nip04Decrypt =
    nip04 && typeof nip04.decrypt === "function" ? nip04.decrypt.bind(nip04) : null;

  const nip44Encrypt =
    nip44 && typeof nip44.encrypt === "function" ? nip44.encrypt.bind(nip44) : null;
  const nip44Decrypt =
    nip44 && typeof nip44.decrypt === "function" ? nip44.decrypt.bind(nip44) : null;

  const requestPermissions = async (methods = []) => {
    if (typeof resolvedExtension.requestPermissions === "function") {
      return resolvedExtension.requestPermissions({
        permissions: Array.isArray(methods) ? methods : [],
      });
    }

    if (typeof resolvedExtension.enable === "function") {
      if (Array.isArray(methods) && methods.length) {
        return resolvedExtension.enable({ permissions: methods.map((method) => ({ method })) });
      }
      return resolvedExtension.enable();
    }

    return { ok: false, error: new Error("permission-request-unavailable") };
  };

  const signer = {
    type: "nip07",
    pubkey,
    metadata: async () =>
      typeof resolvedExtension.getMetadata === "function"
        ? resolvedExtension.getMetadata()
        : null,
    relays: async () =>
      typeof resolvedExtension.getRelays === "function"
        ? resolvedExtension.getRelays()
        : null,
    signEvent: async (event) => {
      if (typeof resolvedExtension.signEvent !== "function") {
        throw new Error("NIP-07 extension missing signEvent.");
      }
      return resolvedExtension.signEvent(event);
    },
    requestPermissions,
    destroy: async () => {},
    canSign: () => typeof resolvedExtension.signEvent === "function",
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
