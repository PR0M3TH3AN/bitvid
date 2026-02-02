import { devLogger } from "../utils/logger.js";

export const SESSION_ACTOR_STORAGE_KEY = "bitvid:sessionActor:v1";
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
        store.put(payload, SESSION_ACTOR_STORAGE_KEY);
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

function clearStoredSessionActorIndexedDb() {
  return openSessionActorDb()
    .then((db) => {
      if (!db) {
        return false;
      }
      return new Promise((resolve, reject) => {
        const tx = db.transaction(SESSION_ACTOR_STORE, "readwrite");
        const store = tx.objectStore(SESSION_ACTOR_STORE);
        store.delete(SESSION_ACTOR_STORAGE_KEY);
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

export function readStoredSessionActorEntry() {
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

export function clearStoredSessionActor() {
  clearStoredSessionActorIndexedDb();

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
  return !!sa && sa.source !== "nsec";
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
