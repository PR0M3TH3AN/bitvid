import { devLogger } from "../utils/logger.js";
import { buildStorageChallengeEvent } from "../nostrEventSchemas.js";

/**
 * Generates a random 32-byte hex challenge string.
 * @returns {string} The challenge string.
 */
function generateRandomChallenge() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Requests a signature for a storage key derivation challenge.
 *
 * @param {object} params
 * @param {object} params.signer - The active signer (must implement signEvent).
 * @param {string} params.pubkey - The user's public key (hex).
 * @returns {Promise<string>} The signature (hex string).
 */
export async function requestStorageSignature({ signer, pubkey }) {
  if (!signer || typeof signer.signEvent !== "function") {
    throw new Error("Invalid signer provided");
  }
  if (!pubkey) {
    throw new Error("Missing pubkey");
  }

  const challenge = generateRandomChallenge();
  const event = buildStorageChallengeEvent({
    pubkey,
    created_at: Math.floor(Date.now() / 1000),
    challenge,
  });

  devLogger.info("[SignerKeyManager] Requesting signature for storage challenge");

  const signedEvent = await signer.signEvent(event);

  if (!signedEvent.sig) {
    throw new Error("Signer returned event without signature");
  }

  // Basic validation that the signer actually signed *our* event
  // (In a real scenario, we might also verify the signature against the pubkey,
  // but here we trust the signer returned what we asked for if the IDs match).
  if (signedEvent.content !== event.content || signedEvent.kind !== event.kind) {
     devLogger.warn("[SignerKeyManager] Signer returned modified event structure");
  }

  // Mask the signature in logs if we were to log it (we won't).
  devLogger.info("[SignerKeyManager] Received signature");

  return signedEvent.sig;
}

/**
 * Derives an AES-GCM CryptoKey from a signature.
 *
 * @param {string} signature - The hex signature string.
 * @returns {Promise<CryptoKey>} The derived symmetric key.
 */
export async function deriveKeyFromSignature(signature) {
  if (!signature || typeof signature !== "string") {
    throw new Error("Invalid signature");
  }

  // 1. Convert hex signature to Uint8Array
  const signatureBytes = new Uint8Array(
    signature.match(/.{1,2}/g).map((byte) => parseInt(byte, 16))
  );

  // 2. Hash the signature with SHA-256 to get uniform key material
  const hashBuffer = await crypto.subtle.digest("SHA-256", signatureBytes);

  // 3. Import as AES-GCM key
  const key = await crypto.subtle.importKey(
    "raw",
    hashBuffer,
    { name: "AES-GCM" },
    false, // not extractable
    ["encrypt", "decrypt"]
  );

  return key;
}

/**
 * Generates a random 16-byte salt for PBKDF2.
 * @returns {Uint8Array} The salt.
 */
export function generatePassphraseSalt() {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  return salt;
}

/**
 * Derives an AES-GCM CryptoKey from a passphrase using PBKDF2.
 *
 * @param {string} passphrase - The user's passphrase.
 * @param {Uint8Array} salt - The salt.
 * @returns {Promise<CryptoKey>} The derived symmetric key.
 */
export async function deriveKeyFromPassphrase(passphrase, salt) {
  if (!passphrase) {
    throw new Error("Passphrase required");
  }
  if (!salt || !(salt instanceof Uint8Array) || salt.length !== 16) {
    throw new Error("Invalid salt (must be 16 bytes)");
  }

  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(passphrase),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );

  const key = await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt,
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );

  return key;
}
