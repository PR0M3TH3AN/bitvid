import { bytesToHex, sha256 } from "../../vendor/crypto-helpers.bundle.min.js";
import { devLogger, userLogger } from "../utils/logger.js";

const ATTACHMENT_CACHE_LIMIT = 20;
const AES_GCM_IV_BYTES = 12;

const cache = new Map();

function getCacheEntry(key) {
  if (!cache.has(key)) {
    return null;
  }
  const entry = cache.get(key);
  cache.delete(key);
  cache.set(key, entry);
  return entry;
}

function revokeEntry(entry) {
  if (entry?.objectUrl && typeof URL !== "undefined") {
    try {
      URL.revokeObjectURL(entry.objectUrl);
    } catch (error) {
      devLogger.warn("[attachments] Failed to revoke object URL", error);
    }
  }
}

function setCacheEntry(key, entry) {
  if (!key) {
    return;
  }

  if (cache.has(key)) {
    const existing = cache.get(key);
    if (existing && existing !== entry) {
      revokeEntry(existing);
    }
    cache.delete(key);
  } else if (cache.size >= ATTACHMENT_CACHE_LIMIT) {
    const oldestKey = cache.keys().next().value;
    const oldest = cache.get(oldestKey);
    cache.delete(oldestKey);
    revokeEntry(oldest);
  }

  cache.set(key, entry);
}

export function clearAttachmentCache() {
  cache.forEach((entry) => revokeEntry(entry));
  cache.clear();
}

function normalizeBase64(bytes) {
  if (!(bytes instanceof Uint8Array)) {
    return "";
  }
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function decodeBase64(value) {
  if (typeof value !== "string" || !value) {
    return null;
  }

  try {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch (error) {
    devLogger.warn("[attachments] Failed to decode base64 key", error);
    return null;
  }
}

async function readBlobAsUint8Array(blob) {
  if (!blob || typeof blob.arrayBuffer !== "function") {
    return null;
  }
  try {
    const buffer = await blob.arrayBuffer();
    return new Uint8Array(buffer);
  } catch (error) {
    devLogger.warn("[attachments] Failed to read attachment bytes", error);
    return null;
  }
}

async function computeSha256Hex(bytes) {
  if (!(bytes instanceof Uint8Array)) {
    return "";
  }

  try {
    const digest = sha256(bytes);
    const hex = typeof digest === "string" ? digest : bytesToHex(digest);
    return hex ? hex.toLowerCase() : "";
  } catch (error) {
    devLogger.warn("[attachments] Failed to compute attachment hash", error);
    return "";
  }
}

async function encryptAttachment(blob) {
  if (!blob) {
    return null;
  }

  if (!globalThis.crypto?.subtle) {
    throw new Error("Encryption unavailable in this environment.");
  }

  const rawBytes = await readBlobAsUint8Array(blob);
  if (!rawBytes) {
    throw new Error("Failed to read attachment bytes for encryption.");
  }

  const keyBytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(keyBytes);
  const ivBytes = new Uint8Array(AES_GCM_IV_BYTES);
  globalThis.crypto.getRandomValues(ivBytes);

  const key = await globalThis.crypto.subtle.importKey(
    "raw",
    keyBytes,
    "AES-GCM",
    false,
    ["encrypt", "decrypt"],
  );

  const encrypted = await globalThis.crypto.subtle.encrypt(
    { name: "AES-GCM", iv: ivBytes },
    key,
    rawBytes,
  );

  const encryptedBytes = new Uint8Array(encrypted);
  const payload = new Uint8Array(ivBytes.length + encryptedBytes.length);
  payload.set(ivBytes, 0);
  payload.set(encryptedBytes, ivBytes.length);

  return {
    payload,
    key: normalizeBase64(keyBytes),
  };
}

async function decryptAttachment(bytes, keyBase64) {
  if (!globalThis.crypto?.subtle) {
    throw new Error("Decryption unavailable in this environment.");
  }

  const keyBytes = decodeBase64(keyBase64);
  if (!keyBytes) {
    throw new Error("Missing decryption key.");
  }

  if (!(bytes instanceof Uint8Array) || bytes.length <= AES_GCM_IV_BYTES) {
    throw new Error("Encrypted payload is missing IV.");
  }

  const iv = bytes.slice(0, AES_GCM_IV_BYTES);
  const cipherBytes = bytes.slice(AES_GCM_IV_BYTES);

  const key = await globalThis.crypto.subtle.importKey(
    "raw",
    keyBytes,
    "AES-GCM",
    false,
    ["decrypt"],
  );

  const decrypted = await globalThis.crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    cipherBytes,
  );

  return new Uint8Array(decrypted);
}

export async function prepareAttachmentUpload({ file, encrypt = false } = {}) {
  if (!file) {
    throw new Error("Attachment file missing.");
  }

  let payloadBytes = await readBlobAsUint8Array(file);
  if (!payloadBytes) {
    throw new Error("Attachment could not be read.");
  }

  let key = "";
  let uploadBlob = file;

  if (encrypt) {
    const encrypted = await encryptAttachment(file);
    if (!encrypted?.payload) {
      throw new Error("Attachment encryption failed.");
    }

    payloadBytes = encrypted.payload;
    key = encrypted.key || "";
    uploadBlob = new File([payloadBytes], file.name, {
      type: "application/octet-stream",
    });
  }

  const sha256 = await computeSha256Hex(payloadBytes);
  if (!sha256) {
    throw new Error("Failed to compute attachment hash.");
  }

  return {
    uploadBlob,
    sha256,
    key,
    name: file.name,
    type: file.type || "application/octet-stream",
    size: file.size,
    encrypted: Boolean(key),
  };
}

async function readResponseWithProgress(response, onProgress) {
  if (!response.body || typeof response.body.getReader !== "function") {
    const blob = await response.blob();
    if (typeof onProgress === "function") {
      onProgress(1);
    }
    return new Uint8Array(await blob.arrayBuffer());
  }

  const reader = response.body.getReader();
  const contentLength = Number(response.headers.get("content-length")) || 0;
  const chunks = [];
  let received = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    if (value) {
      chunks.push(value);
      received += value.length;
      if (contentLength && typeof onProgress === "function") {
        onProgress(Math.min(received / contentLength, 1));
      }
    }
  }

  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const merged = new Uint8Array(totalLength);
  let offset = 0;
  chunks.forEach((chunk) => {
    merged.set(chunk, offset);
    offset += chunk.length;
  });

  if (typeof onProgress === "function") {
    onProgress(1);
  }

  return merged;
}

export async function downloadAttachment({
  url,
  expectedHash,
  key,
  mimeType,
  onProgress,
} = {}) {
  if (!url) {
    throw new Error("Attachment URL missing.");
  }

  const cached = expectedHash ? getCacheEntry(expectedHash) : null;
  if (cached) {
    return { ...cached, cached: true };
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Attachment download failed (${response.status}).`);
  }

  const bytes = await readResponseWithProgress(response, onProgress);
  if (expectedHash) {
    const actual = await computeSha256Hex(bytes);
    if (actual && actual !== expectedHash) {
      throw new Error("Attachment hash mismatch.");
    }
  }

  let payloadBytes = bytes;
  if (key) {
    payloadBytes = await decryptAttachment(bytes, key);
  }

  const blob = new Blob([payloadBytes], {
    type: mimeType || "application/octet-stream",
  });
  const objectUrl = typeof URL !== "undefined" ? URL.createObjectURL(blob) : "";

  const entry = {
    blob,
    objectUrl,
    mimeType,
    size: blob.size,
  };

  if (expectedHash) {
    setCacheEntry(expectedHash, entry);
  }

  return entry;
}

export async function uploadAttachment({
  r2Service,
  pubkey,
  file,
  encrypt = false,
  onProgress,
  buildKey,
  buildUrl,
} = {}) {
  if (!r2Service || typeof r2Service.uploadFile !== "function") {
    throw new Error("Storage service unavailable.");
  }

  if (!file) {
    throw new Error("Attachment file missing.");
  }

  if (!pubkey) {
    throw new Error("Active pubkey required for attachment upload.");
  }

  const credentials =
    typeof r2Service.resolveConnection === "function"
      ? await r2Service.resolveConnection(pubkey)
      : null;

  if (!credentials) {
    throw new Error("Storage configuration missing.");
  }

  const prepared = await prepareAttachmentUpload({ file, encrypt });
  const key = typeof buildKey === "function" ? buildKey(pubkey, file) : "";
  if (!key) {
    throw new Error("Unable to derive storage key for attachment.");
  }

  await r2Service.uploadFile({
    file: prepared.uploadBlob,
    ...credentials,
    bucket: credentials.bucket,
    key,
    onProgress,
  });

  const url = typeof buildUrl === "function" ? buildUrl(credentials.baseDomain, key) : "";
  if (!url) {
    userLogger.warn("[attachments] Attachment uploaded without public URL.");
  }

  return {
    url,
    x: prepared.sha256,
    key: prepared.key,
    name: prepared.name,
    type: prepared.type,
    size: prepared.size,
    encrypted: prepared.encrypted,
  };
}

export function getAttachmentCacheStats() {
  return {
    size: cache.size,
    maxSize: ATTACHMENT_CACHE_LIMIT,
  };
}
