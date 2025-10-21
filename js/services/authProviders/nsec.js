import { isDevMode } from "../../config.js";

const PROVIDER_ID = "nsec";
const PROVIDER_LABEL = "Direct key (nsec/seed)";
const PROVIDER_BUTTON_CLASS =
  "w-full bg-emerald-500 text-white px-4 py-2 rounded-md hover:bg-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 transition-colors";
const PROVIDER_BUTTON_LABEL = "Unlock with nsec or seed";
const PROVIDER_LOADING_LABEL = "Decrypting your key...";
const PROVIDER_SLOW_HINT = "Still waiting for the key input...";
const PROVIDER_ERROR_MESSAGE =
  "Unable to unlock your key. Double-check the value and try again.";

const PROVIDER_DESCRIPTION =
  "Your private key never leaves this device. We encrypt the backup with a session secret before asking to remember it.";
const PROVIDER_DISABLED_LABEL = "Secure storage unavailable";
const PROVIDER_DISABLED_DESCRIPTION =
  "This browser is missing WebCrypto support required to safely encrypt your key.";

const BACKUP_STORAGE_KEY = "bitvid:auth:nsec-backup:v1";
const BACKUP_CONTEXT_LABEL = "bitvid:nsec-provider:v1";

const HEX64_REGEX = /^[0-9a-f]{64}$/i;

function getRuntimeCrypto() {
  if (typeof window !== "undefined" && window?.crypto) {
    return window.crypto;
  }
  if (typeof globalThis !== "undefined" && globalThis.crypto) {
    return globalThis.crypto;
  }
  return null;
}

function getTextEncoder() {
  if (typeof TextEncoder === "function") {
    return new TextEncoder();
  }
  return null;
}

const runtimeCrypto = getRuntimeCrypto();
const textEncoder = getTextEncoder();

function hasWebCryptoSupport() {
  if (!runtimeCrypto) {
    return false;
  }
  const subtle = runtimeCrypto.subtle || runtimeCrypto.webkitSubtle;
  if (!subtle) {
    return false;
  }
  return (
    typeof runtimeCrypto.getRandomValues === "function" &&
    typeof subtle.importKey === "function" &&
    typeof subtle.encrypt === "function" &&
    typeof subtle.decrypt === "function" &&
    typeof TextEncoder === "function"
  );
}

const WEB_CRYPTO_AVAILABLE = hasWebCryptoSupport();

function hexToBytes(hex) {
  if (typeof hex !== "string") {
    return null;
  }
  const normalized = hex.trim();
  if (!normalized || normalized.length % 2 !== 0) {
    return null;
  }
  if (!/^[0-9a-f]+$/i.test(normalized)) {
    return null;
  }
  const bytes = new Uint8Array(normalized.length / 2);
  for (let index = 0; index < normalized.length; index += 2) {
    const byte = normalized.slice(index, index + 2);
    bytes[index / 2] = parseInt(byte, 16);
  }
  return bytes;
}

function concatBytes(...segments) {
  const filtered = segments.filter(
    (segment) => segment && typeof segment.length === "number",
  );
  const totalLength = filtered.reduce((sum, segment) => sum + segment.length, 0);
  const combined = new Uint8Array(totalLength);
  let offset = 0;
  for (const segment of filtered) {
    combined.set(segment, offset);
    offset += segment.length;
  }
  return combined;
}

function bytesToBase64(bytes) {
  if (!bytes) {
    return "";
  }
  if (typeof btoa === "function") {
    let binary = "";
    for (let index = 0; index < bytes.length; index += 1) {
      binary += String.fromCharCode(bytes[index]);
    }
    return btoa(binary);
  }
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }
  // Fallback: manual base64 encoding
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let output = "";
  let i;
  for (i = 0; i + 2 < bytes.length; i += 3) {
    const triple = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    output += alphabet[(triple >> 18) & 0x3f];
    output += alphabet[(triple >> 12) & 0x3f];
    output += alphabet[(triple >> 6) & 0x3f];
    output += alphabet[triple & 0x3f];
  }
  if (i < bytes.length) {
    let remaining = bytes[i] << 16;
    output += alphabet[(remaining >> 18) & 0x3f];
    if (i + 1 < bytes.length) {
      remaining |= bytes[i + 1] << 8;
      output += alphabet[(remaining >> 12) & 0x3f];
      output += alphabet[(remaining >> 6) & 0x3f];
      output += "=";
    } else {
      output += alphabet[(remaining >> 12) & 0x3f];
      output += "==";
    }
  }
  return output;
}

function getPromptFunction(options) {
  if (options && typeof options.promptSecret === "function") {
    return options.promptSecret;
  }
  if (typeof window !== "undefined" && typeof window.prompt === "function") {
    return () =>
      window.prompt(
        "Enter your nsec (bech32) or 64-character hex seed. This never leaves your browser.",
        "",
      );
  }
  return null;
}

function getConfirmFunction(options) {
  if (options && typeof options.promptRemember === "function") {
    return options.promptRemember;
  }
  if (typeof window !== "undefined" && typeof window.confirm === "function") {
    return (message) => window.confirm(message);
  }
  return null;
}

function clearStoredBackup() {
  if (typeof localStorage === "undefined") {
    return;
  }
  try {
    localStorage.removeItem(BACKUP_STORAGE_KEY);
  } catch (error) {
    if (isDevMode) {
      console.warn("[auth:nsec] Failed to clear stored backup:", error);
    }
  }
}

async function persistEncryptedBackup({
  privateKey,
  pubkey,
  sessionPrivateKey,
}) {
  if (!WEB_CRYPTO_AVAILABLE || typeof localStorage === "undefined") {
    return null;
  }
  if (!privateKey || !pubkey || !sessionPrivateKey) {
    return null;
  }

  try {
    const subtle = runtimeCrypto.subtle || runtimeCrypto.webkitSubtle;
    const pubkeyBytes = hexToBytes(pubkey);
    const sessionBytes = hexToBytes(sessionPrivateKey);
    if (!pubkeyBytes || !sessionBytes) {
      throw new Error("invalid-key-material");
    }
    if (!textEncoder) {
      throw new Error("text-encoder-missing");
    }
    const contextBytes = textEncoder.encode(BACKUP_CONTEXT_LABEL);
    const salt = concatBytes(sessionBytes, pubkeyBytes, contextBytes);
    const digest = await subtle.digest("SHA-256", salt);
    const aesKey = await subtle.importKey(
      "raw",
      digest,
      { name: "AES-GCM" },
      false,
      ["encrypt", "decrypt"],
    );
    const iv = new Uint8Array(12);
    runtimeCrypto.getRandomValues(iv);
    const plaintextBytes = textEncoder.encode(privateKey);
    const ciphertextBuffer = await subtle.encrypt(
      { name: "AES-GCM", iv },
      aesKey,
      plaintextBytes,
    );
    const ciphertext = new Uint8Array(ciphertextBuffer);

    const payload = {
      version: 1,
      createdAt: Date.now(),
      pubkey,
      iv: bytesToBase64(iv),
      ciphertext: bytesToBase64(ciphertext),
    };

    localStorage.setItem(BACKUP_STORAGE_KEY, JSON.stringify(payload));
    return payload;
  } catch (error) {
    if (isDevMode) {
      console.warn("[auth:nsec] Failed to persist encrypted backup:", error);
    }
    const message =
      error && typeof error.message === "string" && error.message
        ? error.message
        : "Failed to persist encrypted backup.";
    const failure = new Error(message);
    failure.cause = error;
    throw failure;
  }
}

async function derivePrivateKey(secret, tools) {
  const trimmed = typeof secret === "string" ? secret.trim() : "";
  if (!trimmed) {
    throw new Error("A private key or seed is required.");
  }

  if (trimmed.toLowerCase().startsWith("nsec")) {
    const nip19 = tools?.nip19;
    if (!nip19 || typeof nip19.decode !== "function") {
      throw new Error("Unable to decode nsec without nostr-tools support.");
    }
    try {
      const decoded = nip19.decode(trimmed);
      if (decoded?.type === "nsec" && typeof decoded.data === "string") {
        const normalized = decoded.data.trim().toLowerCase();
        if (HEX64_REGEX.test(normalized)) {
          return normalized;
        }
      }
    } catch (error) {
      throw new Error("Invalid nsec value. Please double-check and try again.");
    }
    throw new Error("Unsupported nsec payload. Please try again.");
  }

  if (HEX64_REGEX.test(trimmed)) {
    return trimmed.toLowerCase();
  }

  throw new Error(
    "Unrecognised seed format. Please provide an nsec or 64-character hex seed.",
  );
}

function normalizePubkey(pubkey) {
  if (typeof pubkey !== "string") {
    return "";
  }
  return pubkey.trim().toLowerCase();
}

function createSignEventFn({ tools, privateKey, pubkey }) {
  if (!tools || typeof tools.signEvent !== "function" || !tools.getEventHash) {
    return null;
  }

  return async function signEvent(event) {
    const tags = Array.isArray(event?.tags)
      ? event.tags.map((tag) => (Array.isArray(tag) ? [...tag] : tag))
      : [];
    const prepared = {
      kind: event?.kind,
      pubkey: typeof event?.pubkey === "string" && event.pubkey.trim()
        ? event.pubkey.trim()
        : pubkey,
      created_at: event?.created_at,
      tags,
      content: typeof event?.content === "string" ? event.content : "",
    };
    if (!prepared.pubkey || prepared.pubkey.toLowerCase() !== pubkey) {
      prepared.pubkey = pubkey;
    }
    const id = tools.getEventHash(prepared);
    const sig = tools.signEvent(prepared, privateKey);
    return { ...prepared, id, sig };
  };
}

function createNip04EncryptFn({ tools, privateKey }) {
  if (!tools?.nip04 || typeof tools.nip04.encrypt !== "function") {
    return null;
  }
  return (targetPubkey, plaintext) =>
    tools.nip04.encrypt(privateKey, targetPubkey, plaintext);
}

function createNip04DecryptFn({ tools, privateKey }) {
  if (!tools?.nip04 || typeof tools.nip04.decrypt !== "function") {
    return null;
  }
  return (targetPubkey, ciphertext) =>
    tools.nip04.decrypt(privateKey, targetPubkey, ciphertext);
}

async function login({ nostrClient, options } = {}) {
  if (!WEB_CRYPTO_AVAILABLE) {
    throw new Error(
      "Manual key login requires WebCrypto support. Please switch to a compatible browser.",
    );
  }

  if (!nostrClient || typeof nostrClient.ensureNostrTools !== "function") {
    throw new Error("Manual key login is unavailable in this session.");
  }

  const normalizedOptions =
    options && typeof options === "object" ? { ...options } : {};

  const promptSecret = getPromptFunction(normalizedOptions);
  let secret =
    typeof normalizedOptions.secret === "string"
      ? normalizedOptions.secret.trim()
      : "";

  if (!secret) {
    if (!promptSecret) {
      throw new Error("No private key provided.");
    }
    const promptResult = await Promise.resolve(promptSecret());
    secret = typeof promptResult === "string" ? promptResult.trim() : "";
  }

  if (!secret) {
    throw new Error("A private key is required to continue.");
  }

  const tools = await nostrClient.ensureNostrTools();
  if (!tools || typeof tools.getPublicKey !== "function") {
    throw new Error(
      "Unable to load Nostr cryptography helpers. Please try again after reloading.",
    );
  }

  const privateKey = await derivePrivateKey(secret, tools);
  let pubkey = "";
  try {
    pubkey = tools.getPublicKey(privateKey);
  } catch (error) {
    throw new Error("Failed to derive a public key from the provided secret.");
  }

  const normalizedPubkey = normalizePubkey(pubkey);
  if (!normalizedPubkey || !HEX64_REGEX.test(normalizedPubkey)) {
    throw new Error("Derived public key is invalid. Please verify your secret.");
  }

  let rememberChoice = null;
  if (normalizedOptions.remember === true) {
    rememberChoice = true;
  } else if (normalizedOptions.remember === false) {
    rememberChoice = false;
  }

  if (rememberChoice === null) {
    const confirmRemember = getConfirmFunction(normalizedOptions);
    if (confirmRemember) {
      const confirmation = await Promise.resolve(
        confirmRemember(
          "Remember this key on this device? We'll encrypt it with a session secret and store it locally.",
        ),
      );
      rememberChoice = !!confirmation;
    } else {
      rememberChoice = false;
    }
  }

  try {
    await nostrClient.ensureSessionActor();
  } catch (error) {
    if (isDevMode) {
      console.warn(
        "[auth:nsec] Failed to ensure session actor before storing backup:",
        error,
      );
    }
  }

  const sessionPrivateKey =
    typeof nostrClient?.sessionActor?.privateKey === "string"
      ? nostrClient.sessionActor.privateKey.trim()
      : "";

  if (rememberChoice && !sessionPrivateKey) {
    throw new Error(
      "Secure session storage failed. Unable to remember this key in this browser.",
    );
  }

  if (rememberChoice && sessionPrivateKey) {
    await persistEncryptedBackup({
      privateKey,
      pubkey: normalizedPubkey,
      sessionPrivateKey,
    });
  } else {
    clearStoredBackup();
  }

  const signerPayload = (() => {
    const signEvent = createSignEventFn({
      tools,
      privateKey,
      pubkey: normalizedPubkey,
    });
    const encrypt = createNip04EncryptFn({ tools, privateKey });
    const decrypt = createNip04DecryptFn({ tools, privateKey });

    if (!signEvent && !encrypt && !decrypt) {
      return null;
    }

    return {
      providerId: PROVIDER_ID,
      pubkey: normalizedPubkey,
      signEvent,
      encrypt,
      decrypt,
      metadata: { label: PROVIDER_LABEL },
    };
  })();

  if (signerPayload && typeof nostrClient.setActiveSigner === "function") {
    try {
      nostrClient.setActiveSigner(signerPayload);
    } catch (error) {
      if (isDevMode) {
        console.warn("[auth:nsec] Failed to register signer:", error);
      }
    }
  }

  const signerResult = signerPayload
    ? {
        providerId: PROVIDER_ID,
        signEvent: signerPayload.signEvent,
        encrypt: signerPayload.encrypt,
        decrypt: signerPayload.decrypt,
      }
    : null;

  return {
    authType: PROVIDER_ID,
    pubkey: normalizedPubkey,
    signer: signerResult,
  };
}

function clearStorage() {
  clearStoredBackup();
}

export default Object.freeze({
  id: PROVIDER_ID,
  label: PROVIDER_LABEL,
  login,
  clearStorage,
  ui: Object.freeze({
    buttonClass: PROVIDER_BUTTON_CLASS,
    buttonLabel: PROVIDER_BUTTON_LABEL,
    loadingLabel: PROVIDER_LOADING_LABEL,
    slowHint: PROVIDER_SLOW_HINT,
    errorMessage: PROVIDER_ERROR_MESSAGE,
    description: PROVIDER_DESCRIPTION,
    disabled: !WEB_CRYPTO_AVAILABLE,
    disabledLabel: PROVIDER_DISABLED_LABEL,
    disabledDescription: PROVIDER_DISABLED_DESCRIPTION,
  }),
});

export { clearStorage as clearNsecBackupStorage };
