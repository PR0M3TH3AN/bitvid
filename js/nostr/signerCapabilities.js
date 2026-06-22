// js/nostr/signerCapabilities.js
//
// Signer capability/permission helpers extracted from managers/SignerManager.js
// to keep that module under the file-size budget. These operate on a signer
// object (or plain method lists) passed in — no SignerManager instance state —
// so they move cleanly. No behavior change.

import { resolveActiveSigner as resolveActiveSignerFromRegistry } from "../nostrClientRegistry.js";

export function resolveSignerCapabilities(signer) {
  const fallback = {
    sign: false,
    nip44: false,
    nip04: false,
  };

  if (!signer || typeof signer !== "object") {
    return fallback;
  }

  const capabilities =
    signer.capabilities && typeof signer.capabilities === "object"
      ? signer.capabilities
      : {};

  return {
    sign:
      (typeof capabilities.sign === "boolean" && capabilities.sign) ||
      typeof signer.signEvent === "function",
    nip44:
      (typeof capabilities.nip44 === "boolean" && capabilities.nip44) ||
      typeof signer.nip44Encrypt === "function" ||
      typeof signer.nip44Decrypt === "function",
    nip04:
      (typeof capabilities.nip04 === "boolean" && capabilities.nip04) ||
      typeof signer.nip04Encrypt === "function" ||
      typeof signer.nip04Decrypt === "function",
  };
}

export function hydrateExtensionSignerCapabilities(signer) {
  if (!signer || typeof signer !== "object") {
    return;
  }

  const signerType = typeof signer.type === "string" ? signer.type : "";
  if (signerType !== "extension" && signerType !== "nip07") {
    return;
  }

  const extension =
    typeof window !== "undefined" && window && window.nostr ? window.nostr : null;
  if (!extension) {
    return;
  }

  if (typeof signer.signEvent !== "function" && extension.signEvent) {
    if (typeof extension.signEvent === "function") {
      signer.signEvent = extension.signEvent.bind(extension);
    }
  }

  if (!signer.nip04 && extension.nip04) {
    signer.nip04 = extension.nip04;
  }

  if (!signer.nip44 && extension.nip44) {
    signer.nip44 = extension.nip44;
  }
}

export function attachNipMethodAliases(signer) {
  if (!signer || typeof signer !== "object") {
    return;
  }

  const nip04 =
    signer && typeof signer.nip04 === "object" && signer.nip04 !== null
      ? signer.nip04
      : null;
  if (nip04) {
    const encrypt =
      typeof nip04.encrypt === "function" ? nip04.encrypt.bind(nip04) : null;
    const decrypt =
      typeof nip04.decrypt === "function" ? nip04.decrypt.bind(nip04) : null;

    if (encrypt && typeof signer.nip04Encrypt !== "function") {
      signer.nip04Encrypt = (targetPubkey, plaintext) =>
        encrypt(targetPubkey, plaintext);
    }

    if (decrypt && typeof signer.nip04Decrypt !== "function") {
      signer.nip04Decrypt = (actorPubkey, ciphertext) =>
        decrypt(actorPubkey, ciphertext);
    }
  }

  const nip44 =
    signer && typeof signer.nip44 === "object" && signer.nip44 !== null
      ? signer.nip44
      : null;
  if (nip44) {
    const v2 =
      typeof nip44.v2 === "object" && nip44.v2 !== null ? nip44.v2 : null;

    const encrypt = (() => {
      if (typeof signer.nip44Encrypt === "function") {
        return null;
      }
      if (typeof v2?.encrypt === "function") {
        return v2.encrypt.bind(v2);
      }
      if (typeof nip44.encrypt === "function") {
        return nip44.encrypt.bind(nip44);
      }
      return null;
    })();

    const decrypt = (() => {
      if (typeof signer.nip44Decrypt === "function") {
        return null;
      }
      if (typeof v2?.decrypt === "function") {
        return v2.decrypt.bind(v2);
      }
      if (typeof nip44.decrypt === "function") {
        return nip44.decrypt.bind(nip44);
      }
      return null;
    })();

    if (encrypt) {
      signer.nip44Encrypt = (targetPubkey, plaintext) =>
        encrypt(targetPubkey, plaintext);
    }

    if (decrypt) {
      signer.nip44Decrypt = (actorPubkey, ciphertext) =>
        decrypt(actorPubkey, ciphertext);
    }
  }
}

// Build the plain NIP-07 signer adapter from a live `window.nostr`-style
// extension. Shared by loginWithExtension and the refresh-restore path in
// ensureActiveSignerForPubkey so the adapter shape stays identical. Capability
// aliases (nip04Decrypt/nip44Decrypt) are hydrated later by resolveActiveSigner.
export function buildExtensionSignerAdapter(extension, pubkey) {
  return {
    type: "extension",
    pubkey,
    signEvent:
      typeof extension?.signEvent === "function"
        ? extension.signEvent.bind(extension)
        : undefined,
    nip04: extension?.nip04,
    nip44: extension?.nip44,
  };
}

export function resolveActiveSigner(pubkey) {
  const signer = resolveActiveSignerFromRegistry(pubkey);
  hydrateExtensionSignerCapabilities(signer);
  attachNipMethodAliases(signer);
  if (signer && typeof signer === "object") {
    const capsDescriptor = Object.getOwnPropertyDescriptor(
      signer,
      "capabilities",
    );
    const isGetter = capsDescriptor && typeof capsDescriptor.get === "function";

    if (!isGetter) {
      signer.capabilities = resolveSignerCapabilities(signer);
    }
  }
  return signer;
}

const ENCRYPTION_METHOD_PREFIXES = ["nip04.", "nip44."];

export function hasEncryptionPermissionMethods(methods) {
  if (!Array.isArray(methods)) {
    return false;
  }
  return methods.some((method) =>
    ENCRYPTION_METHOD_PREFIXES.some((prefix) => method.startsWith(prefix)),
  );
}

export function hasSigningPermissionMethods(methods) {
  if (!Array.isArray(methods)) {
    return false;
  }
  return methods.some(
    (method) => method === "sign_event" || method === "get_public_key",
  );
}

export function resolvePermissionStatusMessage(methods, context) {
  const normalizedContext =
    typeof context === "string" ? context.trim().toLowerCase() : "";

  if (normalizedContext === "dm") {
    return "Approve the extension prompt to enable encrypted direct messages.";
  }
  if (normalizedContext === "lists") {
    return "Approve the extension prompt to access your encrypted lists.";
  }

  const includesEncryption = hasEncryptionPermissionMethods(methods);
  const includesSigning = hasSigningPermissionMethods(methods);

  if (includesEncryption && includesSigning) {
    return "Approve the extension prompt to enable signing and encrypted features (DMs, subscriptions, block lists).";
  }
  if (includesEncryption) {
    return "Approve the extension prompt to enable encrypted features like DMs and private lists.";
  }
  if (includesSigning) {
    return "Approve the extension prompt to enable signing.";
  }

  return "Approve the extension prompt to continue.";
}
