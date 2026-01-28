// js/nostrClientRegistry.js

let registeredNostrClient = null;
let requestPermissionsDelegate = null;
const registeredSigners = new Map();
let activeSigner = null;
let activeSignerPubkey = "";
const activeSignerListeners = new Set();

const globalScope =
  typeof window !== "undefined"
    ? window
    : typeof globalThis !== "undefined"
    ? globalThis
    : null;

function normalizePubkey(pubkey) {
  return typeof pubkey === "string" ? pubkey.trim().toLowerCase() : "";
}

function emitSignerEvent(type, detail) {
  if (!globalScope || typeof globalScope.dispatchEvent !== "function") {
    return;
  }

  let event = null;
  if (typeof globalScope.CustomEvent === "function") {
    event = new globalScope.CustomEvent(type, { detail });
  } else if (typeof Event === "function") {
    event = new Event(type);
    event.detail = detail;
  }

  if (event) {
    globalScope.dispatchEvent(event);
  }
}

function hasPermissionChanges(previousMeta, nextMeta) {
  const previous = previousMeta?.permissions ?? null;
  const next = nextMeta?.permissions ?? null;
  try {
    return JSON.stringify(previous) !== JSON.stringify(next);
  } catch (error) {
    return previous !== next;
  }
}

function updateActiveSigner(nextSigner, nextPubkey) {
  const normalizedPubkey = normalizePubkey(nextPubkey);
  const previousSigner = activeSigner;
  const previousPubkey = activeSignerPubkey;

  activeSigner = nextSigner || null;
  activeSignerPubkey = normalizedPubkey;

  if (
    previousSigner !== activeSigner ||
    previousPubkey !== activeSignerPubkey
  ) {
    const payload = {
      previousSigner,
      previousPubkey,
      signer: activeSigner,
      pubkey: activeSignerPubkey,
    };
    activeSignerListeners.forEach((listener) => {
      try {
        listener(payload);
      } catch (error) {
        // Intentionally swallow listener errors to avoid breaking signer updates.
      }
    });
  }
}

export function registerNostrClient(client, options = {}) {
  registeredNostrClient = client || null;

  if (typeof options.requestPermissions === "function") {
    requestPermissionsDelegate = options.requestPermissions;
    return;
  }

  if (
    registeredNostrClient &&
    typeof registeredNostrClient.ensureExtensionPermissions === "function"
  ) {
    requestPermissionsDelegate = (...args) =>
      registeredNostrClient.ensureExtensionPermissions(...args);
    if (typeof registeredNostrClient.ensureExtensionPermissionsGate === "function") {
      requestPermissionsDelegate = (...args) =>
        registeredNostrClient.ensureExtensionPermissionsGate(...args);
    }
    return;
  }

  requestPermissionsDelegate = null;
}

export function getRegisteredNostrClient() {
  return registeredNostrClient;
}

export function clearNostrClientRegistration() {
  registeredNostrClient = null;
  requestPermissionsDelegate = null;
}

export function requestDefaultExtensionPermissions(...args) {
  if (typeof requestPermissionsDelegate === "function") {
    try {
      return requestPermissionsDelegate(...args);
    } catch (error) {
      return Promise.resolve({ ok: false, error });
    }
  }

  const error = new Error("Nostr client is not registered.");
  return Promise.resolve({ ok: false, error });
}

export function registerSigner(pubkey, signer, meta = {}) {
  const normalized = normalizePubkey(pubkey);
  if (!normalized) {
    return null;
  }

  const previous = registeredSigners.get(normalized) || null;

  if (!signer || typeof signer !== "object") {
    if (previous) {
      registeredSigners.delete(normalized);
      emitSignerEvent("signer:disconnected", {
        pubkey: normalized,
        signer: previous.signer,
        meta: previous.meta,
      });

      if (activeSignerPubkey === normalized) {
        updateActiveSigner(null, "");
      }
    }
    return null;
  }

  const sanitizedMeta =
    meta && typeof meta === "object" ? { ...meta } : {};

  registeredSigners.set(normalized, { signer, meta: sanitizedMeta });

  if (!previous) {
    emitSignerEvent("signer:connected", {
      pubkey: normalized,
      signer,
      meta: sanitizedMeta,
    });
  } else if (hasPermissionChanges(previous.meta, sanitizedMeta)) {
    emitSignerEvent("signer:permissions:changed", {
      pubkey: normalized,
      signer,
      previousMeta: previous.meta,
      meta: sanitizedMeta,
    });
  }

  if (activeSignerPubkey === normalized) {
    updateActiveSigner(signer, normalized);
  }

  return signer;
}

export function setActiveSigner(signerOrPubkey) {
  if (!signerOrPubkey) {
    updateActiveSigner(null, "");
    return null;
  }

  if (typeof signerOrPubkey === "string") {
    const normalized = normalizePubkey(signerOrPubkey);
    const entry = registeredSigners.get(normalized);
    updateActiveSigner(entry?.signer || null, normalized);
    return entry?.signer || null;
  }

  if (typeof signerOrPubkey === "object") {
    const pubkey = normalizePubkey(signerOrPubkey.pubkey);
    if (pubkey) {
      registerSigner(pubkey, signerOrPubkey);
    }
    updateActiveSigner(signerOrPubkey, pubkey);
    return signerOrPubkey;
  }

  return null;
}

export function clearActiveSigner() {
  updateActiveSigner(null, "");
}

export function getActiveSigner() {
  return activeSigner;
}

export function logoutSigner(pubkey) {
  const normalized = normalizePubkey(pubkey);
  if (normalized) {
    const entry = registeredSigners.get(normalized);
    if (entry?.signer && typeof entry.signer.destroy === "function") {
      try {
        entry.signer.destroy();
      } catch (error) {
        // Ignore signer teardown failures.
      }
    }
    registerSigner(normalized, null);
    return;
  }

  if (activeSigner) {
    const activePubkey = normalizePubkey(activeSigner.pubkey || activeSignerPubkey);
    if (activePubkey) {
      logoutSigner(activePubkey);
      return;
    }
  }

  updateActiveSigner(null, "");
}

export function resolveActiveSigner(pubkey) {
  const normalized = normalizePubkey(pubkey);
  if (normalized) {
    const entry = registeredSigners.get(normalized);
    if (entry?.signer) {
      return entry.signer;
    }
    if (
      activeSigner &&
      typeof activeSigner.pubkey === "string" &&
      normalizePubkey(activeSigner.pubkey) === normalized
    ) {
      return activeSigner;
    }
  }
  return activeSigner;
}

export function listRegisteredSigners() {
  return Array.from(registeredSigners.entries()).map(([pubkey, entry]) => ({
    pubkey,
    signer: entry.signer,
    meta: entry.meta,
  }));
}

export function onActiveSignerChanged(callback) {
  if (typeof callback === "function") {
    activeSignerListeners.add(callback);
  }
}

export function offActiveSignerChanged(callback) {
  activeSignerListeners.delete(callback);
}
