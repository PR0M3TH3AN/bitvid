import sodiumModule from "https://esm.sh/libsodium-wrappers-sumo@0.7.13";
import { scrypt } from "https://esm.sh/scrypt-js@3.0.1";
import { bech32 } from "https://esm.sh/@scure/base@1.1.2";

const VERSION = 0x02;
const KEY_SECURITY_BYTE = 0x00;
const SALT_LENGTH = 16;
const NONCE_LENGTH = 24;
const SECRET_KEY_LENGTH = 32;
const DEFAULT_R = 8;
const DEFAULT_P = 1;
const MAX_BECH32_LENGTH = 500;

const encoder = new TextEncoder();
const sodiumReady = sodiumModule.ready.then(() => sodiumModule);

function ensureUint8Array(input) {
  if (input instanceof Uint8Array) {
    return input;
  }
  if (input instanceof ArrayBuffer) {
    return new Uint8Array(input);
  }
  if (ArrayBuffer.isView(input)) {
    return new Uint8Array(input.buffer.slice(0));
  }
  throw new Error("Expected Uint8Array or ArrayBuffer input");
}

function validateLogN(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 20;
  }
  const rounded = Math.max(10, Math.min(30, Math.round(value)));
  return rounded;
}

function validateWorkParameter(value, fallback, min, max) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  const clamped = Math.max(min, Math.min(max, Math.round(value)));
  return clamped;
}

async function deriveKey(passphraseBytes, salt, logN, r, p) {
  const N = Math.pow(2, logN >>> 0);
  if (!Number.isSafeInteger(N) || N <= 0) {
    throw new Error("Invalid scrypt logN value");
  }
  return scrypt(passphraseBytes, salt, N, r, p, 32);
}

function encodeNcryptsec(payload) {
  const words = bech32.toWords(payload);
  return bech32.encode("ncryptsec", words, MAX_BECH32_LENGTH);
}

function decodeNcryptsec(ncryptsec) {
  const decoded = bech32.decode(ncryptsec, MAX_BECH32_LENGTH);
  if (decoded.prefix !== "ncryptsec") {
    throw new Error("Invalid ncryptsec prefix");
  }
  return new Uint8Array(bech32.fromWords(decoded.words));
}

self.onmessage = async (event) => {
  const { data } = event;
  if (!data || typeof data !== "object") {
    return;
  }
  const { id, type } = data;
  if (typeof id === "undefined") {
    return;
  }

  try {
    if (type === "nip49-encrypt") {
      const sodium = await sodiumReady;
      const nsecBytes = ensureUint8Array(data.nsecBytes);
      if (nsecBytes.length !== SECRET_KEY_LENGTH) {
        throw new Error("NSEC must be 32 bytes");
      }

      const normalizedPassphrase = String(data.passphrase ?? "").normalize("NFKC");
      if (!normalizedPassphrase) {
        throw new Error("Passphrase is required");
      }

      const passphraseBytes = encoder.encode(normalizedPassphrase);
      const logN = validateLogN(data?.kdfParams?.logN);
      const r = validateWorkParameter(data?.kdfParams?.r, DEFAULT_R, 1, 16);
      const p = validateWorkParameter(data?.kdfParams?.p, DEFAULT_P, 1, 8);

      const salt = sodium.randombytes_buf(SALT_LENGTH);
      const key = await deriveKey(passphraseBytes, salt, logN, r, p);
      const nonce = sodium.randombytes_buf(NONCE_LENGTH);
      const ad = new Uint8Array([KEY_SECURITY_BYTE]);

      const ciphertext = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
        nsecBytes,
        ad,
        null,
        nonce,
        key
      );

      const payloadLength =
        1 + // version
        1 + // logN
        SALT_LENGTH +
        NONCE_LENGTH +
        1 + // security byte
        ciphertext.length;
      const payload = new Uint8Array(payloadLength);
      let offset = 0;
      payload[offset++] = VERSION;
      payload[offset++] = logN & 0xff;
      payload.set(salt, offset);
      offset += SALT_LENGTH;
      payload.set(nonce, offset);
      offset += NONCE_LENGTH;
      payload[offset++] = KEY_SECURITY_BYTE;
      payload.set(ciphertext, offset);

      const ncryptsec = encodeNcryptsec(payload);

      passphraseBytes.fill(0);
      if (ArrayBuffer.isView(key)) {
        key.fill(0);
      }
      nsecBytes.fill(0);

      self.postMessage({ id, ok: true, ncryptsec });
      return;
    }

    if (type === "nip49-decrypt") {
      const sodium = await sodiumReady;
      const normalizedPassphrase = String(data.passphrase ?? "").normalize("NFKC");
      if (!normalizedPassphrase) {
        throw new Error("Passphrase is required");
      }

      const payload = decodeNcryptsec(String(data.ncryptsec ?? ""));
      if (payload.length < 1 + 1 + SALT_LENGTH + NONCE_LENGTH + 1 + 16) {
        throw new Error("Encrypted key payload is too short");
      }

      const version = payload[0];
      if (version !== VERSION) {
        throw new Error("Unsupported ncryptsec version");
      }

      const logN = payload[1];
      const saltStart = 2;
      const nonceStart = saltStart + SALT_LENGTH;
      const adStart = nonceStart + NONCE_LENGTH;
      const cipherStart = adStart + 1;

      const salt = payload.slice(saltStart, saltStart + SALT_LENGTH);
      const nonce = payload.slice(nonceStart, nonceStart + NONCE_LENGTH);
      const ad = payload.slice(adStart, adStart + 1);
      const ciphertext = payload.slice(cipherStart);

      if (ciphertext.length === 0) {
        throw new Error("Encrypted key payload is corrupted");
      }

      const passphraseBytes = encoder.encode(normalizedPassphrase);
      const r = validateWorkParameter(data?.kdfParams?.r, DEFAULT_R, 1, 16);
      const p = validateWorkParameter(data?.kdfParams?.p, DEFAULT_P, 1, 8);
      const key = await deriveKey(passphraseBytes, salt, logN, r, p);

      let plaintext;
      try {
        plaintext = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
          null,
          ciphertext,
          ad,
          nonce,
          key
        );
      } catch (error) {
        throw new Error("Invalid passphrase or corrupted encrypted key");
      }

      passphraseBytes.fill(0);
      if (ArrayBuffer.isView(key)) {
        key.fill(0);
      }

      if (!(plaintext instanceof Uint8Array)) {
        plaintext = new Uint8Array(plaintext);
      }

      const result = new Uint8Array(plaintext);
      plaintext.fill(0);

      self.postMessage({ id, ok: true, nsecBytes: result.buffer }, [result.buffer]);
      return;
    }

    throw new Error(`Unknown worker task: ${type}`);
  } catch (error) {
    try {
      const { nsecBytes } = data || {};
      if (nsecBytes) {
        ensureUint8Array(nsecBytes).fill(0);
      }
    } catch (cleanupError) {
      console.warn("Failed to cleanup worker input:", cleanupError);
    }
    self.postMessage({ id, ok: false, error: error?.message ?? "Unexpected error" });
  }
};
