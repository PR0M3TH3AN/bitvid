import { devLogger } from "../utils/logger.js";

export const SESSION_ACTOR_STORAGE_KEY = "bitvid:sessionActor:v1";
// Per-pubkey encrypted-key store. Follows the existing `bitvid:<thing>:<npub>`
// convention (profileCache, nwcSettings, …) so several saved nsec accounts can
// each keep their own encrypted key on the device and be switched between. The
// v1 single slot above is kept in sync as the "active/last-saved" default and is
// migrated into this map on first read.
export const SESSION_ACTORS_MAP_STORAGE_KEY = "bitvid:sessionActors:v2";
export const SESSION_ACTORS_MAP_VERSION = 2;
export const SESSION_ACTOR_ENCRYPTION_VERSION = 1;
export const SESSION_ACTOR_KDF_ITERATIONS = 250_000;
export const SESSION_ACTOR_KDF_HASH = "SHA-256";
export const SESSION_ACTOR_ENCRYPTION_ALGORITHM = "AES-GCM";
export const SESSION_ACTOR_SALT_BYTES = 16;
export const SESSION_ACTOR_IV_BYTES = 12;
const SESSION_ACTOR_DB_NAME = "bitvidSessionActor";
const SESSION_ACTOR_DB_VERSION = 1;
const SESSION_ACTOR_STORE = "sessionActor";
let sessionActorDbPromise = null;

function arrayBufferToBase64(buffer) {
  if (!buffer) {
    return "";
  }

  let view;
  if (buffer instanceof ArrayBuffer) {
    view = new Uint8Array(buffer);
  } else if (ArrayBuffer.isView(buffer)) {
    view = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  } else {
    return "";
  }

  if (typeof globalThis?.btoa === "function") {
    let binary = "";
    for (let index = 0; index < view.length; index += 1) {
      binary += String.fromCharCode(view[index]);
    }
    return globalThis.btoa(binary);
  }

  if (typeof Buffer !== "undefined") {
    return Buffer.from(view).toString("base64");
  }

  return "";
}

function base64ToUint8Array(base64) {
  if (typeof base64 !== "string" || !base64.trim()) {
    return null;
  }

  let binary;
  try {
    if (typeof globalThis?.atob === "function") {
      binary = globalThis.atob(base64);
    } else if (typeof Buffer !== "undefined") {
      binary = Buffer.from(base64, "base64").toString("binary");
    } else {
      return null;
    }
  } catch (error) {
    return null;
  }

  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function isIndexedDbAvailable() {
  try {
    return typeof indexedDB !== "undefined";
  } catch (error) {
    return false;
  }
}

function openSessionActorDb() {
  if (!isIndexedDbAvailable()) {
    return Promise.resolve(null);
  }

  if (sessionActorDbPromise) {
    return sessionActorDbPromise;
  }

  sessionActorDbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(SESSION_ACTOR_DB_NAME, SESSION_ACTOR_DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(SESSION_ACTOR_STORE)) {
        db.createObjectStore(SESSION_ACTOR_STORE);
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error || new Error("Failed to open session actor DB"));
    };
  });

  return sessionActorDbPromise;
}

function persistSessionActorToIndexedDb(payload) {
  return openSessionActorDb()
    .then((db) => {
      if (!db) {
        return false;
      }
      return new Promise((resolve, reject) => {
        const tx = db.transaction(SESSION_ACTOR_STORE, "readwrite");
        const store = tx.objectStore(SESSION_ACTOR_STORE);
        // Key each account's payload by pubkey so multiple saved accounts don't
        // clobber one another (legacy single-slot records used the storage key).
        store.put(payload, normalizePubkeyKey(payload?.pubkey) || SESSION_ACTOR_STORAGE_KEY);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () =>
          reject(tx.error || new Error("Session actor IndexedDB write failed"));
        tx.onabort = () =>
          reject(tx.error || new Error("Session actor IndexedDB write aborted"));
      });
    })
    .catch((error) => {
      devLogger.warn("[nostr] Failed to persist session actor to IndexedDB:", error);
      return false;
    });
}

function clearStoredSessionActorIndexedDb(pubkey) {
  return openSessionActorDb()
    .then((db) => {
      if (!db) {
        return false;
      }
      return new Promise((resolve, reject) => {
        const tx = db.transaction(SESSION_ACTOR_STORE, "readwrite");
        const store = tx.objectStore(SESSION_ACTOR_STORE);
        const key = normalizePubkeyKey(pubkey);
        if (key) {
          // Forget just this account's key…
          store.delete(key);
        } else {
          // …or wipe everything (logout / legacy single-slot record too).
          store.clear();
        }
        tx.oncomplete = () => resolve(true);
        tx.onerror = () =>
          reject(tx.error || new Error("Session actor IndexedDB delete failed"));
        tx.onabort = () =>
          reject(tx.error || new Error("Session actor IndexedDB delete aborted"));
      });
    })
    .catch((error) => {
      devLogger.warn("[nostr] Failed to clear session actor IndexedDB entry:", error);
      return false;
    });
}

function generateRandomBytes(length) {
  const size = Number.isFinite(length) ? Math.max(0, Math.floor(length)) : 0;
  if (size <= 0) {
    return new Uint8Array(0);
  }

  if (globalThis?.crypto?.getRandomValues) {
    const array = new Uint8Array(size);
    globalThis.crypto.getRandomValues(array);
    return array;
  }

  throw new Error("secure-random-unavailable");
}

function isSubtleCryptoAvailable() {
  return !!(
    globalThis?.crypto?.subtle &&
    typeof globalThis.crypto.subtle.importKey === "function"
  );
}

async function deriveSessionEncryptionKey(passphrase, saltBytes, iterations, hash) {
  if (!isSubtleCryptoAvailable()) {
    throw new Error("webcrypto-unavailable");
  }

  if (!(saltBytes instanceof Uint8Array)) {
    throw new Error("invalid-salt");
  }

  const encoder = typeof TextEncoder === "function" ? new TextEncoder() : null;
  if (!encoder) {
    throw new Error("text-encoder-unavailable");
  }

  const passphraseBytes = encoder.encode(passphrase);

  const baseKey = await globalThis.crypto.subtle.importKey(
    "raw",
    passphraseBytes,
    { name: "PBKDF2" },
    false,
    ["deriveKey"],
  );

  const normalizedIterations = Number.isFinite(iterations)
    ? Math.max(1, Math.floor(iterations))
    : SESSION_ACTOR_KDF_ITERATIONS;
  const normalizedHash = typeof hash === "string" && hash.trim()
    ? hash.trim()
    : SESSION_ACTOR_KDF_HASH;

  return globalThis.crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: saltBytes,
      iterations: normalizedIterations,
      hash: normalizedHash,
    },
    baseKey,
    { name: SESSION_ACTOR_ENCRYPTION_ALGORITHM, length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptSessionPrivateKey(privateKey, passphrase) {
  if (typeof privateKey !== "string" || !privateKey.trim()) {
    throw new Error("invalid-private-key");
  }

  if (typeof passphrase !== "string" || !passphrase.trim()) {
    throw new Error("passphrase-required");
  }

  if (!isSubtleCryptoAvailable()) {
    throw new Error("webcrypto-unavailable");
  }

  const encoder = typeof TextEncoder === "function" ? new TextEncoder() : null;
  if (!encoder) {
    throw new Error("text-encoder-unavailable");
  }

  const payload = encoder.encode(privateKey);
  const salt = generateRandomBytes(SESSION_ACTOR_SALT_BYTES);
  const iv = generateRandomBytes(SESSION_ACTOR_IV_BYTES);
  const key = await deriveSessionEncryptionKey(
    passphrase,
    salt,
    SESSION_ACTOR_KDF_ITERATIONS,
    SESSION_ACTOR_KDF_HASH,
  );

  const ciphertext = await globalThis.crypto.subtle.encrypt(
    { name: SESSION_ACTOR_ENCRYPTION_ALGORITHM, iv },
    key,
    payload,
  );

  return {
    ciphertext: arrayBufferToBase64(ciphertext),
    salt: arrayBufferToBase64(salt),
    iv: arrayBufferToBase64(iv),
    iterations: SESSION_ACTOR_KDF_ITERATIONS,
    hash: SESSION_ACTOR_KDF_HASH,
    algorithm: SESSION_ACTOR_ENCRYPTION_ALGORITHM,
    version: SESSION_ACTOR_ENCRYPTION_VERSION,
  };
}

export function normalizeStoredEncryptionMetadata(metadata) {
  if (!metadata || typeof metadata !== "object") {
    return null;
  }

  const salt = typeof metadata.salt === "string" ? metadata.salt.trim() : "";
  const iv = typeof metadata.iv === "string" ? metadata.iv.trim() : "";
  if (!salt || !iv) {
    return null;
  }

  const iterations = Number.isFinite(metadata.iterations)
    ? Math.max(1, Math.floor(metadata.iterations))
    : SESSION_ACTOR_KDF_ITERATIONS;
  const version = Number.isFinite(metadata.version)
    ? Math.max(1, Math.floor(metadata.version))
    : SESSION_ACTOR_ENCRYPTION_VERSION;
  const algorithm =
    typeof metadata.algorithm === "string" && metadata.algorithm.trim()
      ? metadata.algorithm.trim()
      : SESSION_ACTOR_ENCRYPTION_ALGORITHM;
  const hash =
    typeof metadata.hash === "string" && metadata.hash.trim()
      ? metadata.hash.trim()
      : SESSION_ACTOR_KDF_HASH;

  return { version, algorithm, salt, iv, iterations, hash };
}

export async function decryptSessionPrivateKey(payload, passphrase) {
  if (!payload || typeof payload !== "object") {
    throw new Error("encrypted-session-invalid");
  }

  if (typeof passphrase !== "string" || !passphrase.trim()) {
    throw new Error("passphrase-required");
  }

  if (!isSubtleCryptoAvailable()) {
    throw new Error("webcrypto-unavailable");
  }

  const ciphertext =
    typeof payload.privateKeyEncrypted === "string"
      ? payload.privateKeyEncrypted.trim()
      : "";
  const encryption = normalizeStoredEncryptionMetadata(payload.encryption);

  if (!ciphertext || !encryption) {
    throw new Error("encrypted-session-invalid");
  }

  const cipherBytes = base64ToUint8Array(ciphertext);
  const saltBytes = base64ToUint8Array(encryption.salt);
  const ivBytes = base64ToUint8Array(encryption.iv);
  if (!cipherBytes || !saltBytes || !ivBytes) {
    throw new Error("encrypted-session-invalid");
  }

  const key = await deriveSessionEncryptionKey(
    passphrase,
    saltBytes,
    encryption.iterations,
    encryption.hash,
  );

  let decrypted;
  try {
    decrypted = await globalThis.crypto.subtle.decrypt(
      { name: encryption.algorithm || SESSION_ACTOR_ENCRYPTION_ALGORITHM, iv: ivBytes },
      key,
      cipherBytes,
    );
  } catch (error) {
    const failure = new Error("Failed to decrypt the stored private key.");
    failure.code = "decrypt-failed";
    failure.cause = error;
    throw failure;
  }

  const decoder = typeof TextDecoder === "function" ? new TextDecoder() : null;
  if (!decoder) {
    throw new Error("text-decoder-unavailable");
  }

  return decoder.decode(decrypted);
}

function normalizePubkeyKey(pubkey) {
  return typeof pubkey === "string" && pubkey.trim()
    ? pubkey.trim().toLowerCase()
    : "";
}

// Turn a parsed stored payload into a canonical entry, or null if it lacks a
// usable encrypted key. Never exposes plaintext (privateKey is always "").
function normalizeStoredActorEntry(parsed) {
  const pubkey = typeof parsed?.pubkey === "string" ? parsed.pubkey.trim() : "";
  const privateKeyEncrypted =
    typeof parsed?.privateKeyEncrypted === "string"
      ? parsed.privateKeyEncrypted.trim()
      : "";
  const encryption = normalizeStoredEncryptionMetadata(parsed?.encryption);
  const createdAt = Number.isFinite(parsed?.createdAt)
    ? parsed.createdAt
    : Date.now();
  if (!privateKeyEncrypted || !encryption) {
    return null;
  }
  return { pubkey, privateKey: "", privateKeyEncrypted, encryption, createdAt };
}

// Read the per-pubkey map { [pubkeyLower]: entry } from localStorage.
function readSessionActorsMap() {
  if (typeof localStorage === "undefined") {
    return {};
  }
  let raw = null;
  try {
    raw = localStorage.getItem(SESSION_ACTORS_MAP_STORAGE_KEY);
  } catch (error) {
    devLogger.warn("[nostr] Failed to read session actor map:", error);
    return {};
  }
  if (!raw || typeof raw !== "string") {
    return {};
  }
  try {
    const parsed = JSON.parse(raw);
    const entries =
      parsed && typeof parsed === "object" ? parsed.entries : null;
    if (!entries || typeof entries !== "object") {
      return {};
    }
    const map = {};
    for (const key of Object.keys(entries)) {
      const entry = normalizeStoredActorEntry(entries[key]);
      if (!entry) {
        continue;
      }
      const normalizedKey = normalizePubkeyKey(entry.pubkey || key);
      if (normalizedKey) {
        map[normalizedKey] = entry;
      }
    }
    return map;
  } catch (error) {
    devLogger.warn("[nostr] Failed to parse session actor map:", error);
    try {
      localStorage.removeItem(SESSION_ACTORS_MAP_STORAGE_KEY);
    } catch (cleanupError) {
      devLogger.warn(
        "[nostr] Failed to clear corrupt session actor map:",
        cleanupError,
      );
    }
    return {};
  }
}

function writeSessionActorsMap(map) {
  if (typeof localStorage === "undefined") {
    return;
  }
  const entries = {};
  for (const key of Object.keys(map || {})) {
    const entry = map[key];
    if (!entry || !entry.privateKeyEncrypted || !entry.encryption) {
      continue;
    }
    entries[key] = {
      pubkey: entry.pubkey || key,
      privateKeyEncrypted: entry.privateKeyEncrypted,
      encryption: entry.encryption,
      createdAt: Number.isFinite(entry.createdAt) ? entry.createdAt : Date.now(),
    };
  }
  try {
    if (!Object.keys(entries).length) {
      localStorage.removeItem(SESSION_ACTORS_MAP_STORAGE_KEY);
      return;
    }
    localStorage.setItem(
      SESSION_ACTORS_MAP_STORAGE_KEY,
      JSON.stringify({ version: SESSION_ACTORS_MAP_VERSION, entries }),
    );
  } catch (error) {
    devLogger.warn("[nostr] Failed to persist session actor map:", error);
  }
}

// Read the legacy single-slot (v1) entry. Also handles the legacy plaintext
// migration: a payload that still carries `privateKey` is re-persisted in the
// encrypted-only shape, or cleared if it can't be salvaged.
function readV1Entry() {
  if (typeof localStorage === "undefined") {
    return null;
  }

  let raw = null;
  try {
    raw = localStorage.getItem(SESSION_ACTOR_STORAGE_KEY);
  } catch (error) {
    devLogger.warn("[nostr] Failed to read session actor from storage:", error);
    return null;
  }

  if (!raw || typeof raw !== "string") {
    return null;
  }

  try {
    const parsed = JSON.parse(raw);
    const pubkey =
      typeof parsed?.pubkey === "string" ? parsed.pubkey.trim() : "";
    const privateKeyEncrypted =
      typeof parsed?.privateKeyEncrypted === "string"
        ? parsed.privateKeyEncrypted.trim()
        : "";
    const encryption = normalizeStoredEncryptionMetadata(parsed?.encryption);
    const createdAt = Number.isFinite(parsed?.createdAt)
      ? parsed.createdAt
      : Date.now();

    if (parsed?.privateKey) {
      if (privateKeyEncrypted && encryption) {
        persistSessionActor({
          pubkey,
          privateKeyEncrypted,
          encryption,
          createdAt,
        });
      } else {
        try {
          localStorage.removeItem(SESSION_ACTOR_STORAGE_KEY);
        } catch (cleanupError) {
          devLogger.warn(
            "[nostr] Failed to clear legacy session actor entry:",
            cleanupError,
          );
        }
      }
    }

    if (!privateKeyEncrypted || !encryption) {
      return null;
    }

    return {
      pubkey,
      privateKey: "",
      privateKeyEncrypted,
      encryption,
      createdAt,
    };
  } catch (error) {
    devLogger.warn("[nostr] Failed to parse stored session actor:", error);
    try {
      localStorage.removeItem(SESSION_ACTOR_STORAGE_KEY);
    } catch (cleanupError) {
      devLogger.warn(
        "[nostr] Failed to clear corrupt session actor entry:",
        cleanupError,
      );
    }
  }

  return null;
}

// Read a stored, passphrase-encrypted nsec entry.
//   readStoredSessionActorEntry(pubkey) → that specific account's entry (or null)
//   readStoredSessionActorEntry()       → the active/last-saved account (v1 slot),
//                                          for boot restore / backward-compat.
// The v1 single slot is migrated into the per-pubkey map on first read so
// existing single-account installs keep working and gain multi-account storage.
export function readStoredSessionActorEntry(pubkey) {
  const v1 = readV1Entry();
  const map = readSessionActorsMap();

  // Migrate the legacy single slot into the per-pubkey map.
  if (v1 && v1.pubkey) {
    const key = normalizePubkeyKey(v1.pubkey);
    if (key && !map[key]) {
      map[key] = v1;
      writeSessionActorsMap(map);
    }
  }

  const target = normalizePubkeyKey(pubkey);
  if (target) {
    if (map[target]) {
      return map[target];
    }
    if (v1 && normalizePubkeyKey(v1.pubkey) === target) {
      return v1;
    }
    return null;
  }

  // No target: the active/last-saved account (v1 slot). Fall back to the sole
  // stored account if the v1 slot was cleared but the map still has exactly one.
  if (v1) {
    return v1;
  }
  const keys = Object.keys(map);
  return keys.length === 1 ? map[keys[0]] : null;
}

// Pubkeys (hex, lowercase) of every account with an encrypted key on this device.
export function listStoredSessionActorPubkeys() {
  return Object.keys(readSessionActorsMap());
}

export function persistSessionActor(actor) {
  if (
    !actor ||
    typeof actor.pubkey !== "string" ||
    !actor.pubkey ||
    typeof actor.privateKeyEncrypted !== "string" ||
    !actor.privateKeyEncrypted ||
    !actor.encryption ||
    typeof actor.encryption !== "object"
  ) {
    return;
  }

  const createdAt = Number.isFinite(actor.createdAt)
    ? actor.createdAt
    : Date.now();

  const payload = {
    pubkey: actor.pubkey,
    createdAt,
  };

  const normalizedEncryption = normalizeStoredEncryptionMetadata(actor.encryption);
  if (!normalizedEncryption) {
    return;
  }
  payload.privateKeyEncrypted = actor.privateKeyEncrypted;
  payload.encryption = normalizedEncryption;

  persistSessionActorToIndexedDb(payload);

  // Store under the account's pubkey so several saved accounts coexist…
  const key = normalizePubkeyKey(payload.pubkey);
  if (key) {
    const map = readSessionActorsMap();
    map[key] = {
      pubkey: payload.pubkey,
      privateKeyEncrypted: payload.privateKeyEncrypted,
      encryption: payload.encryption,
      createdAt,
    };
    writeSessionActorsMap(map);
  }

  // …and keep the v1 single slot pointed at the last-saved account so boot
  // restore and no-arg reads resolve a sensible default.
  if (typeof localStorage !== "undefined") {
    try {
      localStorage.setItem(
        SESSION_ACTOR_STORAGE_KEY,
        JSON.stringify(payload),
      );
    } catch (error) {
      devLogger.warn("[nostr] Failed to persist session actor:", error);
    }
  }
}

// Forget a stored key. With a pubkey, only that account is removed (the others
// stay switchable); without one, every stored account is wiped (logout).
export function clearStoredSessionActor(pubkey) {
  const target = normalizePubkeyKey(pubkey);

  if (target) {
    clearStoredSessionActorIndexedDb(target);
    const map = readSessionActorsMap();
    if (map[target]) {
      delete map[target];
      writeSessionActorsMap(map);
    }
    // Drop the v1 default only if it pointed at the account we just removed.
    if (typeof localStorage !== "undefined") {
      const v1 = readV1Entry();
      if (v1 && normalizePubkeyKey(v1.pubkey) === target) {
        try {
          localStorage.removeItem(SESSION_ACTOR_STORAGE_KEY);
        } catch (error) {
          devLogger.warn("[nostr] Failed to clear stored session actor:", error);
        }
      }
    }
    return;
  }

  // No target pubkey: clear ONLY the legacy v1 "last saved" slot. Wiping the
  // per-account v2 map here deleted EVERY saved account's remembered nsec key —
  // the no-arg callers were logout/teardown paths for ONE account, so logging
  // out (or a blocked-key cleanup) silently destroyed the other saved accounts'
  // keys and broke switching back to them. Same bug class as the NIP-46
  // session-map wipe. A specific account is forgotten via
  // clearStoredSessionActor(pubkey), which remains targeted.
  if (typeof localStorage !== "undefined") {
    try {
      localStorage.removeItem(SESSION_ACTOR_STORAGE_KEY);
    } catch (error) {
      devLogger.warn("[nostr] Failed to clear stored session actor:", error);
    }
  }
}

export function isSessionActor(nostrClient) {
  const sa = nostrClient?.sessionActor;
  if (!sa || sa.source === "nsec") {
    return false;
  }
  const clientPubkey =
    typeof nostrClient.pubkey === "string" ? nostrClient.pubkey : "";
  const saPubkey = typeof sa.pubkey === "string" ? sa.pubkey : "";

  return clientPubkey === saPubkey;
}

function _closeSessionActorDb() {
  if (sessionActorDbPromise) {
    return sessionActorDbPromise.then((db) => {
      db.close();
      sessionActorDbPromise = null;
    });
  }
  return Promise.resolve();
}

export const __testExports = {
  arrayBufferToBase64,
  base64ToUint8Array,
  deriveSessionEncryptionKey,
  generateRandomBytes,
  isSubtleCryptoAvailable,
  _closeSessionActorDb,
};
