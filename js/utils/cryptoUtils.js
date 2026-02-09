import { bytesToHex, sha256 } from "../../vendor/crypto-helpers.bundle.min.js";
import { devLogger } from "./logger.js";

let sharedTextEncoder = null;

export function getSharedTextEncoder() {
  if (!sharedTextEncoder && typeof TextEncoder !== "undefined") {
    sharedTextEncoder = new TextEncoder();
  }
  return sharedTextEncoder;
}

const BlobConstructor = typeof Blob !== "undefined" ? Blob : null;

export async function valueToUint8Array(value) {
  if (!value) {
    return null;
  }

  try {
    if (
      BlobConstructor &&
      value instanceof BlobConstructor &&
      typeof value.arrayBuffer === "function"
    ) {
      const buffer = await value.arrayBuffer();
      return new Uint8Array(buffer);
    }
  } catch (error) {
    devLogger.warn("[nostr] Failed to read Blob while computing hash:", error);
    return null;
  }

  if (typeof ArrayBuffer !== "undefined") {
    if (value instanceof ArrayBuffer) {
      return new Uint8Array(value);
    }
    if (ArrayBuffer.isView?.(value)) {
      return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    }
  }

  if (typeof Buffer !== "undefined" && Buffer.isBuffer?.(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }

  if (typeof value === "string") {
    const encoder = getSharedTextEncoder();
    return encoder ? encoder.encode(value) : null;
  }

  return null;
}

export async function computeSha256HexFromValue(value) {
  const data = await valueToUint8Array(value);
  if (!data) {
    return "";
  }

  try {
    const digest = sha256(data);
    const hex = typeof digest === "string" ? digest : bytesToHex(digest);
    return hex ? hex.toLowerCase() : "";
  } catch (error) {
    devLogger.warn("[nostr] Failed to compute SHA-256 for mirror payload:", error);
    return "";
  }
}
