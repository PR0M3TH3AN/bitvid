// js/services/authProviders/nip46.js

import { isDevMode, DEFAULT_RELAY_URLS_OVERRIDE } from "../../config.js";

const PROVIDER_ID = "nip46";
const PROVIDER_LABEL = "Remote signer (NIP-46)";
const PROVIDER_BUTTON_CLASS =
  "w-full bg-purple-500 text-white px-4 py-2 rounded-md hover:bg-purple-600 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 transition-colors";
const PROVIDER_BUTTON_LABEL = "Connect remote signer";
const PROVIDER_LOADING_LABEL = "Waiting for remote signer...";
const PROVIDER_SLOW_HINT = "Share the connect link or QR with your signer...";
const PROVIDER_ERROR_MESSAGE =
  "Remote signer login failed. Double-check the connection and try again.";
const PROVIDER_DESCRIPTION =
  "Use a remote signer or key manager that supports NIP-46 (Nostr Connect).";

const STORAGE_KEY = "bitvid:auth:nip46-session:v1";
const STORAGE_CONTEXT_LABEL = "bitvid:nip46-provider:v1";
const STORAGE_VERSION = 1;

const DEFAULT_PERMISSIONS = Object.freeze([
  "sign_event",
  "nip04_encrypt",
  "nip04_decrypt",
]);

const FALLBACK_RELAYS = Object.freeze([
  "wss://relay.damus.io",
  "wss://nos.lol",
  "wss://relay.snort.social",
  "wss://relay.primal.net",
  "wss://relay.nostr.band",
]);

const QR_LIBRARY_URL =
  "https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js";

const HEX64_REGEX = /^[0-9a-f]{64}$/i;

let activeSignerInstance = null;
let qrLoaderPromise = null;
const uiContextByProvider = new Map();

function getRuntimeCrypto() {
  if (typeof window !== "undefined" && window?.crypto) {
    return window.crypto;
  }
  if (typeof globalThis !== "undefined" && globalThis.crypto) {
    return globalThis.crypto;
  }
  return null;
}

const runtimeCrypto = getRuntimeCrypto();
const textEncoder = typeof TextEncoder === "function" ? new TextEncoder() : null;

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
    typeof subtle.digest === "function" &&
    textEncoder
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

function bytesToHex(bytes) {
  if (!bytes) {
    return "";
  }
  let hex = "";
  for (let index = 0; index < bytes.length; index += 1) {
    const value = bytes[index];
    hex += value.toString(16).padStart(2, "0");
  }
  return hex;
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

function base64ToBytes(value) {
  if (typeof value !== "string" || !value) {
    return null;
  }
  if (typeof atob === "function") {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  }
  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(value, "base64"));
  }
  try {
    const binaryString = decodeURIComponent(
      value
        .replace(/-/g, "+")
        .replace(/_/g, "/")
        .replace(/[\s]/g, ""),
    );
    const bytes = new Uint8Array(binaryString.length);
    for (let index = 0; index < binaryString.length; index += 1) {
      bytes[index] = binaryString.charCodeAt(index);
    }
    return bytes;
  } catch (error) {
    if (isDevMode) {
      console.warn("[auth:nip46] Failed to decode base64 value", error);
    }
    return null;
  }
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

function getUiContext(providerId) {
  return uiContextByProvider.get(providerId) || null;
}

function setUiContext(providerId, context) {
  if (!providerId) {
    return;
  }
  if (context) {
    uiContextByProvider.set(providerId, context);
  } else {
    uiContextByProvider.delete(providerId);
  }
}

function resolveDocument() {
  if (typeof document !== "undefined") {
    return document;
  }
  return null;
}

async function ensureQrLibraryLoaded() {
  if (typeof window === "undefined") {
    return null;
  }
  if (window.qrcode) {
    return window.qrcode;
  }
  if (!qrLoaderPromise) {
    qrLoaderPromise = new Promise((resolve, reject) => {
      const doc = resolveDocument();
      if (!doc) {
        resolve(null);
        return;
      }
      const script = doc.createElement("script");
      script.async = true;
      script.src = QR_LIBRARY_URL;
      script.crossOrigin = "anonymous";
      script.onload = () => resolve(window.qrcode || null);
      script.onerror = () =>
        reject(new Error("Failed to load QR code generator script."));
      doc.head.appendChild(script);
    }).catch((error) => {
      qrLoaderPromise = null;
      if (isDevMode) {
        console.warn("[auth:nip46] QR library load failed", error);
      }
      return null;
    });
  }
  try {
    return await qrLoaderPromise;
  } catch (error) {
    if (isDevMode) {
      console.warn("[auth:nip46] QR loader rejected", error);
    }
    return null;
  }
}

async function renderQrToCanvas(canvas, value) {
  if (!canvas) {
    return;
  }
  if (!value) {
    const context = canvas.getContext("2d");
    if (context) {
      context.clearRect(0, 0, canvas.width, canvas.height);
    }
    return;
  }
  const qrcodeFactory = await ensureQrLibraryLoaded();
  if (!qrcodeFactory) {
    canvas.dataset.qrUnsupported = "true";
    return;
  }
  let qr;
  try {
    qr = qrcodeFactory(0, "M");
    qr.addData(value);
    qr.make();
  } catch (error) {
    if (isDevMode) {
      console.warn("[auth:nip46] Failed to generate QR code", error);
    }
    canvas.dataset.qrError = "true";
    return;
  }
  const moduleCount = qr.getModuleCount();
  const cellSize = 4;
  const quietZone = 4;
  const size = (moduleCount + quietZone * 2) * cellSize;
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) {
    return;
  }
  context.fillStyle = "#fff";
  context.fillRect(0, 0, size, size);
  context.fillStyle = "#000";
  for (let row = 0; row < moduleCount; row += 1) {
    for (let col = 0; col < moduleCount; col += 1) {
      if (!qr.isDark(row, col)) {
        continue;
      }
      const x = (col + quietZone) * cellSize;
      const y = (row + quietZone) * cellSize;
      context.fillRect(x, y, cellSize, cellSize);
    }
  }
}

function sanitizeRelays(candidate, fallback) {
  const relays = Array.isArray(candidate) ? candidate : fallback;
  if (!Array.isArray(relays)) {
    return [];
  }
  const sanitized = [];
  const seen = new Set();
  for (const relay of relays) {
    if (typeof relay !== "string") {
      continue;
    }
    const trimmed = relay.trim();
    if (!trimmed) {
      continue;
    }
    if (!/^wss:\/\//i.test(trimmed)) {
      continue;
    }
    const lower = trimmed.toLowerCase();
    if (seen.has(lower)) {
      continue;
    }
    seen.add(lower);
    sanitized.push(trimmed);
  }
  return sanitized;
}

function sanitizeUrl(value) {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  try {
    return new URL(trimmed, window?.location?.href || undefined).toString();
  } catch (error) {
    return trimmed;
  }
}

function getDefaultAppMetadata() {
  const doc = resolveDocument();
  const name = doc?.title || "Bitvid";
  const url = typeof window !== "undefined" ? window.location?.href : "";
  let image = "";
  const meta = doc?.querySelector('meta[property="og:image"]');
  if (meta && meta.content) {
    image = sanitizeUrl(meta.content);
  }
  return { name, url, image };
}

function createRandomSecret() {
  if (runtimeCrypto?.getRandomValues) {
    const bytes = new Uint8Array(16);
    runtimeCrypto.getRandomValues(bytes);
    return bytesToBase64(bytes).replace(/=+$/, "");
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

async function encryptClientSecret({
  clientSecretHex,
  remotePubkey,
  sessionPrivateKey,
}) {
  if (!WEB_CRYPTO_AVAILABLE) {
    return null;
  }
  const subtle = runtimeCrypto.subtle || runtimeCrypto.webkitSubtle;
  const remoteBytes = hexToBytes(remotePubkey);
  const sessionBytes = hexToBytes(sessionPrivateKey);
  const payloadBytes = hexToBytes(clientSecretHex);
  if (!remoteBytes || !sessionBytes || !payloadBytes || !textEncoder) {
    throw new Error("missing-key-material");
  }
  const contextBytes = textEncoder.encode(STORAGE_CONTEXT_LABEL);
  const salt = concatBytes(sessionBytes, remoteBytes, contextBytes);
  const digest = await subtle.digest("SHA-256", salt);
  const aesKey = await subtle.importKey(
    "raw",
    digest,
    { name: "AES-GCM" },
    false,
    ["encrypt"],
  );
  const iv = runtimeCrypto.getRandomValues(new Uint8Array(12));
  const ciphertextBuffer = await subtle.encrypt(
    { name: "AES-GCM", iv },
    aesKey,
    payloadBytes,
  );
  return {
    ciphertext: bytesToBase64(new Uint8Array(ciphertextBuffer)),
    iv: bytesToBase64(iv),
  };
}

async function decryptClientSecret({
  encrypted,
  iv,
  remotePubkey,
  sessionPrivateKey,
}) {
  if (!WEB_CRYPTO_AVAILABLE) {
    return null;
  }
  const subtle = runtimeCrypto.subtle || runtimeCrypto.webkitSubtle;
  const remoteBytes = hexToBytes(remotePubkey);
  const sessionBytes = hexToBytes(sessionPrivateKey);
  const ivBytes = base64ToBytes(iv);
  const cipherBytes = base64ToBytes(encrypted);
  if (!remoteBytes || !sessionBytes || !ivBytes || !cipherBytes || !textEncoder) {
    throw new Error("missing-key-material");
  }
  const contextBytes = textEncoder.encode(STORAGE_CONTEXT_LABEL);
  const salt = concatBytes(sessionBytes, remoteBytes, contextBytes);
  const digest = await subtle.digest("SHA-256", salt);
  const aesKey = await subtle.importKey(
    "raw",
    digest,
    { name: "AES-GCM" },
    false,
    ["decrypt"],
  );
  const plaintextBuffer = await subtle.decrypt(
    { name: "AES-GCM", iv: ivBytes },
    aesKey,
    cipherBytes,
  );
  const bytes = new Uint8Array(plaintextBuffer);
  return bytesToHex(bytes);
}

function readStoredSession() {
  if (typeof localStorage === "undefined") {
    return null;
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    if (parsed.version !== STORAGE_VERSION) {
      return null;
    }
    if (!HEX64_REGEX.test(parsed.remotePubkey || "")) {
      return null;
    }
    if (!HEX64_REGEX.test(parsed.clientPubkey || "")) {
      return null;
    }
    if (typeof parsed.encrypted !== "string" || !parsed.encrypted) {
      return null;
    }
    if (typeof parsed.iv !== "string" || !parsed.iv) {
      return null;
    }
    const relays = sanitizeRelays(parsed.relays, []);
    if (!relays.length) {
      return null;
    }
    const secret = typeof parsed.secret === "string" ? parsed.secret.trim() : "";
    if (!secret) {
      return null;
    }
    return {
      remotePubkey: parsed.remotePubkey,
      clientPubkey: parsed.clientPubkey,
      encrypted: parsed.encrypted,
      iv: parsed.iv,
      relays,
      secret,
      metadata:
        parsed.metadata && typeof parsed.metadata === "object"
          ? { ...parsed.metadata }
          : {},
      lastUsed: Number.isFinite(parsed.lastUsed) ? parsed.lastUsed : Date.now(),
    };
  } catch (error) {
    if (isDevMode) {
      console.warn("[auth:nip46] Failed to parse stored session", error);
    }
    return null;
  }
}

function clearStoredSession() {
  if (typeof localStorage === "undefined") {
    return;
  }
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    if (isDevMode) {
      console.warn("[auth:nip46] Failed to clear stored session", error);
    }
  }
}

async function persistSession({
  clientSecretHex,
  clientPubkey,
  remotePubkey,
  relays,
  secret,
  metadata,
  nostrClient,
}) {
  if (!WEB_CRYPTO_AVAILABLE || typeof localStorage === "undefined") {
    return;
  }
  if (!HEX64_REGEX.test(remotePubkey || "")) {
    return;
  }
  if (!HEX64_REGEX.test(clientPubkey || "")) {
    return;
  }
  const sanitizedRelays = sanitizeRelays(relays, []);
  if (!sanitizedRelays.length) {
    return;
  }
  try {
    if (!nostrClient || typeof nostrClient.ensureSessionActor !== "function") {
      throw new Error("session-actor-unavailable");
    }
    const sessionPubkey = await nostrClient.ensureSessionActor();
    if (!sessionPubkey) {
      throw new Error("session-actor-missing");
    }
    const sessionPrivateKey =
      typeof nostrClient?.sessionActor?.privateKey === "string"
        ? nostrClient.sessionActor.privateKey.trim()
        : "";
    if (!HEX64_REGEX.test(sessionPrivateKey)) {
      throw new Error("session-private-key-missing");
    }
    const encryptedPayload = await encryptClientSecret({
      clientSecretHex,
      remotePubkey,
      sessionPrivateKey,
    });
    if (!encryptedPayload) {
      throw new Error("encryption-failed");
    }
    const payload = {
      version: STORAGE_VERSION,
      clientPubkey,
      remotePubkey,
      relays: sanitizedRelays,
      secret,
      metadata: metadata || {},
      encrypted: encryptedPayload.ciphertext,
      iv: encryptedPayload.iv,
      lastUsed: Date.now(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (error) {
    if (isDevMode) {
      console.warn("[auth:nip46] Failed to persist session", error);
    }
  }
}

function resetActiveSignerInstance() {
  if (activeSignerInstance && typeof activeSignerInstance.close === "function") {
    try {
      activeSignerInstance.close();
    } catch (error) {
      if (isDevMode) {
        console.warn("[auth:nip46] Failed to close existing signer", error);
      }
    }
  }
  activeSignerInstance = null;
}

function buildSignerMetadata({
  label = PROVIDER_LABEL,
  relays = [],
  remotePubkey = "",
}) {
  return {
    label,
    relays: Array.from(relays),
    remotePubkey,
    capabilities: {
      sign_event: true,
      nip04_encrypt: true,
      nip04_decrypt: true,
    },
  };
}

function buildSignerPayload({ signer, remotePubkey, relays }) {
  if (!signer || typeof signer.signEvent !== "function") {
    return null;
  }
  const encryptFn =
    typeof signer.nip04Encrypt === "function"
      ? signer.nip04Encrypt.bind(signer)
      : typeof signer.encrypt === "function"
      ? signer.encrypt.bind(signer)
      : null;
  const decryptFn =
    typeof signer.nip04Decrypt === "function"
      ? signer.nip04Decrypt.bind(signer)
      : typeof signer.decrypt === "function"
      ? signer.decrypt.bind(signer)
      : null;
  const payload = {
    providerId: PROVIDER_ID,
    pubkey: remotePubkey,
    signEvent: (event) => signer.signEvent(event),
    encrypt: encryptFn,
    decrypt: decryptFn,
    metadata: buildSignerMetadata({ relays, remotePubkey }),
  };
  return payload;
}

function notifyUi(providerId, callback) {
  const context = getUiContext(providerId);
  if (!context) {
    return;
  }
  try {
    callback(context);
  } catch (error) {
    if (isDevMode) {
      console.warn("[auth:nip46] UI callback failed", error);
    }
  }
}

function runUiHooks(providerId, directUi, callback) {
  if (typeof callback !== "function") {
    return;
  }
  if (directUi && typeof directUi === "object") {
    try {
      callback(directUi);
    } catch (error) {
      if (isDevMode) {
        console.warn("[auth:nip46] Direct UI callback failed", error);
      }
    }
  }
  notifyUi(providerId, (context) => callback(context));
}

async function ensureNostrTools(nostrClient) {
  if (nostrClient && typeof nostrClient.ensureNostrTools === "function") {
    return nostrClient.ensureNostrTools();
  }
  if (typeof window !== "undefined") {
    const tools = window.__BITVID_CANONICAL_NOSTR_TOOLS__ || window.NostrTools;
    if (tools) {
      return tools;
    }
  }
  throw new Error("nostr-tools-unavailable");
}

function resolveRelays(nostrClient, options) {
  const optionRelays = sanitizeRelays(options?.relays, []);
  if (optionRelays.length) {
    return optionRelays;
  }
  const clientRelays = Array.isArray(nostrClient?.relays)
    ? sanitizeRelays(nostrClient.relays, [])
    : [];
  if (clientRelays.length) {
    return clientRelays;
  }
  const configuredRelays = sanitizeRelays(
    Array.isArray(DEFAULT_RELAY_URLS_OVERRIDE)
      ? Array.from(DEFAULT_RELAY_URLS_OVERRIDE)
      : [],
    [],
  );
  if (configuredRelays.length) {
    return configuredRelays;
  }
  return Array.from(FALLBACK_RELAYS);
}

function attachUiHooks({ wrapper, button }) {
  if (!wrapper) {
    return null;
  }
  const doc = resolveDocument();
  const status = doc?.createElement("p");
  if (status) {
    status.className = "text-xs text-gray-300";
    status.dataset.status = "";
    wrapper.appendChild(status);
  }
  const hint = doc?.createElement("p");
  if (hint) {
    hint.className = "text-xs text-gray-400";
    hint.textContent =
      "Share this connect URL or scan the QR code with your remote signer.";
    wrapper.appendChild(hint);
  }
  const link = doc?.createElement("a");
  if (link) {
    link.href = "";
    link.target = "_blank";
    link.rel = "noopener";
    link.className =
      "block break-all text-xs text-blue-400 hover:text-blue-300 underline";
    link.dataset.connectLink = "";
    link.textContent = "";
    wrapper.appendChild(link);
  }
  const copyButton = doc?.createElement("button");
  if (copyButton) {
    copyButton.type = "button";
    copyButton.className =
      "mt-1 inline-flex items-center rounded border border-purple-400 px-2 py-1 text-xs text-purple-200 hover:bg-purple-500/20";
    copyButton.textContent = "Copy connect URI";
    copyButton.dataset.copyButton = "";
    wrapper.appendChild(copyButton);
  }
  const canvas = doc?.createElement("canvas");
  if (canvas) {
    canvas.width = 0;
    canvas.height = 0;
    canvas.className = "mt-3 bg-white p-2 rounded";
    canvas.style.maxWidth = "200px";
    canvas.style.maxHeight = "200px";
    wrapper.appendChild(canvas);
  }
  const authLink = doc?.createElement("a");
  if (authLink) {
    authLink.href = "";
    authLink.target = "_blank";
    authLink.rel = "noopener";
    authLink.className =
      "mt-2 block text-xs text-emerald-300 hover:text-emerald-200 underline";
    authLink.dataset.authLink = "";
    authLink.textContent = "";
    authLink.style.display = "none";
    wrapper.appendChild(authLink);
  }
  const context = {
    connectUri: "",
    setConnectUri: (uri) => {
      if (link) {
        link.href = uri || "";
        link.textContent = uri || "";
        link.style.display = uri ? "block" : "none";
      }
      if (canvas) {
        renderQrToCanvas(canvas, uri || "");
        canvas.style.display = uri ? "block" : "none";
      }
      context.connectUri = uri;
    },
    setStatus: (message) => {
      if (status) {
        status.textContent = message || "";
        status.className = message
          ? "text-xs text-gray-200"
          : "text-xs text-gray-300";
      }
    },
    setError: (message) => {
      if (status) {
        status.textContent = message || "";
        status.className = message
          ? "text-xs text-red-400"
          : "text-xs text-gray-300";
      }
    },
    setAuthUrl: (url) => {
      if (authLink) {
        if (url) {
          authLink.href = url;
          authLink.textContent = "Open remote authorization";
          authLink.style.display = "block";
        } else {
          authLink.href = "";
          authLink.textContent = "";
          authLink.style.display = "none";
        }
      }
    },
    clear: () => {
      context.setStatus("");
      context.setError("");
      context.setAuthUrl("");
      context.setConnectUri("");
    },
    destroy: () => {
      if (copyButton) {
        copyButton.removeEventListener("click", copyHandler);
      }
      if (canvas) {
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
      }
    },
  };
  const copyHandler = () => {
    if (!context.connectUri) {
      return;
    }
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard
        .writeText(context.connectUri)
        .then(() => {
          context.setStatus("Connect URI copied to clipboard.");
          if (button) {
            button.focus();
          }
        })
        .catch((error) => {
          if (isDevMode) {
            console.warn("[auth:nip46] Clipboard copy failed", error);
          }
          context.setError("Copy failed. Select the link above instead.");
        });
    } else {
      context.setError("Clipboard is unavailable. Select and copy the link.");
    }
  };
  if (copyButton) {
    copyButton.addEventListener("click", copyHandler);
  }
  return context;
}

async function restoreSession({ nostrClient } = {}) {
  if (!WEB_CRYPTO_AVAILABLE) {
    return null;
  }
  if (!nostrClient) {
    return null;
  }
  const stored = readStoredSession();
  if (!stored) {
    return null;
  }
  resetActiveSignerInstance();
  try {
    const tools = await ensureNostrTools(nostrClient);
    const nip46 = tools?.nip46;
    if (!nip46 || typeof nip46.BunkerSigner?.fromBunker !== "function") {
      throw new Error("nip46-support-missing");
    }
    if (typeof nostrClient.ensureSessionActor !== "function") {
      throw new Error("session-actor-unavailable");
    }
    const sessionPubkey = await nostrClient.ensureSessionActor();
    if (!sessionPubkey) {
      throw new Error("session-actor-missing");
    }
    const sessionPrivateKey =
      typeof nostrClient?.sessionActor?.privateKey === "string"
        ? nostrClient.sessionActor.privateKey.trim()
        : "";
    if (!HEX64_REGEX.test(sessionPrivateKey)) {
      throw new Error("session-private-key-missing");
    }
    const clientSecretHex = await decryptClientSecret({
      encrypted: stored.encrypted,
      iv: stored.iv,
      remotePubkey: stored.remotePubkey,
      sessionPrivateKey,
    });
    if (!HEX64_REGEX.test(clientSecretHex || "")) {
      throw new Error("client-secret-unavailable");
    }
    const clientSecret = hexToBytes(clientSecretHex);
    if (!clientSecret) {
      throw new Error("client-secret-decode-failed");
    }
    const signer = nip46.BunkerSigner.fromBunker(
      clientSecret,
      {
        relays: stored.relays,
        pubkey: stored.remotePubkey,
        secret: stored.secret,
      },
      {
        onauth: (url) => {
          runUiHooks(PROVIDER_ID, null, (ui) => ui.setAuthUrl?.(url));
        },
      },
    );
    activeSignerInstance = signer;
    await signer.connect();
    const remotePubkey = await signer.getPublicKey();
    if (!HEX64_REGEX.test(remotePubkey || "")) {
      throw new Error("remote-pubkey-invalid");
    }
    const payload = buildSignerPayload({
      signer,
      remotePubkey,
      relays: stored.relays,
    });
    if (payload && typeof nostrClient.setActiveSigner === "function") {
      nostrClient.setActiveSigner(payload);
    }
    return {
      signer,
      remotePubkey,
      payload,
    };
  } catch (error) {
    if (isDevMode) {
      console.warn("[auth:nip46] Silent restore failed", error);
    }
    clearStoredSession();
    resetActiveSignerInstance();
    return null;
  }
}

async function login({ nostrClient, options } = {}) {
  if (!WEB_CRYPTO_AVAILABLE) {
    throw new Error("Secure storage unavailable for NIP-46 sessions.");
  }
  if (!nostrClient || typeof nostrClient !== "object") {
    throw new Error("Remote signer login is not available.");
  }
  resetActiveSignerInstance();
  const directUi =
    options && typeof options.ui === "object" ? options.ui : null;
  const tools = await ensureNostrTools(nostrClient);
  const nip46 = tools?.nip46;
  if (!nip46) {
    throw new Error("Nostr Connect helpers are unavailable.");
  }
  if (typeof nip46.createNostrConnectURI !== "function") {
    throw new Error("Nostr Connect URI helper is missing.");
  }
  if (typeof nip46.BunkerSigner?.fromURI !== "function") {
    throw new Error("Remote signer support is missing from nostr-tools.");
  }
  const relays = resolveRelays(nostrClient, options);
  if (!relays.length) {
    throw new Error("No relay URLs are available for the remote signer.");
  }
  const metadata = {
    ...getDefaultAppMetadata(),
    ...(options?.metadata && typeof options.metadata === "object"
      ? options.metadata
      : {}),
  };
  const secret = createRandomSecret();
  const clientSecret = tools.generateSecretKey();
  const clientPubkey = tools.getPublicKey(clientSecret);
  const connectUri = nip46.createNostrConnectURI({
    clientPubkey,
    relays,
    secret,
    name: metadata.name,
    url: metadata.url,
    image: metadata.image,
    perms: DEFAULT_PERMISSIONS,
  });
  runUiHooks(PROVIDER_ID, directUi, (ui) => {
    ui.clear?.();
    ui.setStatus?.("Share the connect URI with your remote signer.");
    ui.setConnectUri?.(connectUri);
  });
  let signer = null;
  try {
    signer = await nip46.BunkerSigner.fromURI(
      clientSecret,
      connectUri,
      {
        onauth: (url) => {
          runUiHooks(PROVIDER_ID, directUi, (ui) => ui.setAuthUrl?.(url));
        },
      },
    );
    runUiHooks(PROVIDER_ID, directUi, (ui) => {
      ui.setStatus?.("Remote signer connected. Waiting for approval...");
    });
    activeSignerInstance = signer;
    await signer.connect();
    const remotePubkey = await signer.getPublicKey();
    if (!HEX64_REGEX.test(remotePubkey || "")) {
      throw new Error("The remote signer did not return a valid public key.");
    }
    const payload = buildSignerPayload({
      signer,
      remotePubkey,
      relays,
    });
    if (payload && typeof nostrClient.setActiveSigner === "function") {
      nostrClient.setActiveSigner(payload);
    }
    await persistSession({
      clientSecretHex: bytesToHex(clientSecret),
      clientPubkey,
      remotePubkey,
      relays,
      secret,
      metadata,
      nostrClient,
    });
    runUiHooks(PROVIDER_ID, directUi, (ui) => {
      ui.setStatus?.("Remote signer approved. Finishing login...");
      ui.setAuthUrl?.("");
    });
    return {
      authType: PROVIDER_ID,
      pubkey: remotePubkey,
      signer: payload
        ? {
            providerId: payload.providerId,
            signEvent: payload.signEvent,
            encrypt: payload.encrypt,
            decrypt: payload.decrypt,
            metadata: payload.metadata,
          }
        : null,
    };
  } catch (error) {
    resetActiveSignerInstance();
    runUiHooks(PROVIDER_ID, directUi, (ui) => {
      ui.setError?.(
        error?.message ||
          "Remote signer login failed. Check your signer and try again.",
      );
    });
    throw error;
  }
}

function clearStorage({ reason } = {}) {
  clearStoredSession();
  resetActiveSignerInstance();
  if (reason && isDevMode) {
    console.log(`[auth:nip46] Cleared stored session (${reason}).`);
  }
}

async function initialize({ nostrClient } = {}) {
  if (!WEB_CRYPTO_AVAILABLE) {
    return null;
  }
  if (!nostrClient) {
    return null;
  }
  try {
    const restored = await restoreSession({ nostrClient });
    if (restored?.remotePubkey) {
      if (isDevMode) {
        console.log("[auth:nip46] Restored remote signer session.");
      }
    }
    return restored;
  } catch (error) {
    if (isDevMode) {
      console.warn("[auth:nip46] initialize failed", error);
    }
    return null;
  }
}

function mountUi(context) {
  const { wrapper, button } = context;
  const uiHooks = attachUiHooks({ wrapper, button });
  setUiContext(PROVIDER_ID, uiHooks);
  return {
    uiHooks,
    destroy() {
      uiHooks?.destroy?.();
      setUiContext(PROVIDER_ID, null);
    },
  };
}

export default Object.freeze({
  id: PROVIDER_ID,
  label: PROVIDER_LABEL,
  login,
  initialize,
  clearStorage,
  ui: Object.freeze({
    buttonClass: PROVIDER_BUTTON_CLASS,
    buttonLabel: PROVIDER_BUTTON_LABEL,
    loadingLabel: PROVIDER_LOADING_LABEL,
    slowHint: PROVIDER_SLOW_HINT,
    errorMessage: PROVIDER_ERROR_MESSAGE,
    description: PROVIDER_DESCRIPTION,
    disabled: !WEB_CRYPTO_AVAILABLE,
    disabledDescription: !WEB_CRYPTO_AVAILABLE
      ? "This browser is missing secure storage required for remote signers."
      : "",
    render: mountUi,
  }),
});
