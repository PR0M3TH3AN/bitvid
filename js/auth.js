import { encryptToNcryptsec, decryptFromNcryptsec } from "./keys/nip49.js";
import {
  getNcryptsec,
  getVaultMetadata,
  saveNcryptsec,
  clearVault,
} from "./keys/vault.js";
import { installSoftSigner, uninstallSoftSigner } from "./nostr-signer.js";
import { nostrClient } from "./nostr.js";

const DEFAULT_R = 8;
const DEFAULT_P = 1;
const SECRET_KEY_LENGTH = 32;

let activeSecretKey = null;
let activePubkey = null;

function detectDefaultLogN() {
  if (typeof navigator === "undefined" || typeof navigator.userAgent !== "string") {
    return 20;
  }
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  );
  return isMobile ? 18 : 20;
}

const DEFAULT_KDF_PARAMS = Object.freeze({
  logN: detectDefaultLogN(),
  r: DEFAULT_R,
  p: DEFAULT_P,
});

function getNostrTools() {
  const tools = window?.NostrTools;
  if (!tools || !tools.nip19) {
    throw new Error("NostrTools not available");
  }
  return tools;
}

function hexToBytes(hex) {
  if (typeof hex !== "string" || hex.length % 2 !== 0) {
    throw new Error("Invalid hex string");
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    const byte = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    if (Number.isNaN(byte)) {
      throw new Error("Invalid hex string");
    }
    bytes[i] = byte;
  }
  return bytes;
}

function decodeNsec(nsec) {
  const { nip19 } = getNostrTools();
  let decoded;
  try {
    decoded = nip19.decode(nsec);
  } catch (error) {
    throw new Error("Invalid NSEC format");
  }
  if (!decoded || decoded.type !== "nsec") {
    throw new Error("Provided value is not an nsec key");
  }
  const { data } = decoded;
  if (data instanceof Uint8Array) {
    return new Uint8Array(data);
  }
  if (typeof data === "string") {
    return hexToBytes(data);
  }
  if (Array.isArray(data)) {
    return Uint8Array.from(data);
  }
  throw new Error("Unsupported nsec payload");
}

function validateSecretKey(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length !== SECRET_KEY_LENGTH) {
    throw new Error("Secret key must be 32 bytes");
  }
}

function sanitizeKdfParams(params) {
  const candidate = params && typeof params === "object" ? params : {};
  const logN = Number.isFinite(candidate.logN) ? Math.round(candidate.logN) : DEFAULT_KDF_PARAMS.logN;
  const r = Number.isFinite(candidate.r) ? Math.round(candidate.r) : DEFAULT_R;
  const p = Number.isFinite(candidate.p) ? Math.round(candidate.p) : DEFAULT_P;
  return {
    logN: Math.max(10, Math.min(30, logN)),
    r: Math.max(1, Math.min(16, r)),
    p: Math.max(1, Math.min(8, p)),
  };
}

function setActiveSecretKey(secretKey) {
  validateSecretKey(secretKey);
  if (activeSecretKey) {
    uninstallSoftSigner(activeSecretKey);
  }
  activeSecretKey = secretKey;
  activePubkey = installSoftSigner(activeSecretKey);
  nostrClient.pubkey = activePubkey;
  return activePubkey;
}

export function getDefaultKdfParams() {
  return { ...DEFAULT_KDF_PARAMS };
}

export function getActivePubkey() {
  return activePubkey;
}

export async function hasStoredKey() {
  try {
    const value = await getNcryptsec();
    return typeof value === "string" && value.length > 0;
  } catch (error) {
    console.error("Failed to read vault:", error);
    return false;
  }
}

export async function importNsec(nsecInput, passphraseInput, options = {}) {
  const trimmed = typeof nsecInput === "string" ? nsecInput.trim() : "";
  if (!trimmed) {
    throw new Error("Please paste an nsec key");
  }
  const normalizedPassphrase = String(passphraseInput ?? "").normalize("NFKC");
  if (!normalizedPassphrase) {
    throw new Error("Passphrase is required");
  }

  const kdfParams = sanitizeKdfParams(options.kdfParams || DEFAULT_KDF_PARAMS);
  const shouldPersist = options.saveEncrypted !== false;

  const decoded = decodeNsec(trimmed);
  if (decoded.length !== SECRET_KEY_LENGTH) {
    throw new Error("Invalid NSEC length");
  }

  const sessionKey = new Uint8Array(decoded);
  let pubkey;
  let installed = false;
  try {
    const workerInput = new Uint8Array(sessionKey);
    const ncryptsec = await encryptToNcryptsec(workerInput, normalizedPassphrase, kdfParams);
    pubkey = setActiveSecretKey(sessionKey);
    installed = true;
    if (shouldPersist) {
      await saveNcryptsec(ncryptsec, {
        kdf: kdfParams,
        pubkey,
        savedAt: Date.now(),
      });
    }
    return { pubkey, saved: shouldPersist };
  } catch (error) {
    if (installed) {
      logout();
    } else {
      sessionKey.fill(0);
    }
    throw error;
  }
}

export async function unlockWithPassphrase(passphraseInput) {
  const normalizedPassphrase = String(passphraseInput ?? "").normalize("NFKC");
  if (!normalizedPassphrase) {
    throw new Error("Passphrase is required");
  }

  const [ncryptsec, meta] = await Promise.all([getNcryptsec(), getVaultMetadata()]);
  if (!ncryptsec) {
    throw new Error("No encrypted key stored on this device");
  }
  const kdfParams = sanitizeKdfParams(meta?.kdf || DEFAULT_KDF_PARAMS);

  const sessionKey = await decryptFromNcryptsec(ncryptsec, normalizedPassphrase, kdfParams);
  validateSecretKey(sessionKey);
  const pubkey = setActiveSecretKey(sessionKey);
  return { pubkey, saved: true };
}

export function logout() {
  if (activeSecretKey) {
    uninstallSoftSigner(activeSecretKey);
    activeSecretKey = null;
  }
  activePubkey = null;
  nostrClient.pubkey = null;
}

export async function forgetDevice() {
  logout();
  await clearVault();
}
