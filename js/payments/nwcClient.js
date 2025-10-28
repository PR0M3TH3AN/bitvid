// js/payments/nwcClient.js

import { nostrToolsReady } from "../nostrToolsBootstrap.js";
import { userLogger } from "../utils/logger.js";

const HEX64_REGEX = /^[0-9a-f]{64}$/i;
const URI_SCHEMES = [
  "nostr+walletconnect://",
  "walletconnect://",
  "nwc://",
];
const INFO_KIND = 13194;
const REQUEST_KIND = 23194;
const RESPONSE_KIND = 23195;
const DEFAULT_REQUEST_TIMEOUT_MS = 25_000;
const INFO_REQUEST_TIMEOUT_MS = 7_500;

let activeState = null;
let pendingRequests = new Map();
let pendingRequestsByPayloadId = new Map();
let socket = null;
let subscriptionId = null;
let connectionPromise = null;
let requestCounter = 0;
let infoSubscriptionId = null;
let infoRequestState = null;

const globalScope =
  typeof window !== "undefined"
    ? window
    : typeof globalThis !== "undefined"
    ? globalThis
    : null;

const nostrToolsReadySource =
  globalScope &&
  globalScope.nostrToolsReady &&
  typeof globalScope.nostrToolsReady.then === "function"
    ? globalScope.nostrToolsReady
    : nostrToolsReady;

function normalizeToolkitCandidate(candidate) {
  if (
    candidate &&
    typeof candidate === "object" &&
    candidate.ok !== false &&
    typeof candidate.then !== "function"
  ) {
    return candidate;
  }
  return null;
}

function readToolkitFromScope(scope = globalScope) {
  if (!scope || typeof scope !== "object") {
    return null;
  }

  const candidates = [];

  const canonical = scope.__BITVID_CANONICAL_NOSTR_TOOLS__;
  if (canonical) {
    candidates.push(canonical);
  }

  const direct = scope.NostrTools;
  if (direct) {
    candidates.push(direct);
  }

  const nestedWindow =
    scope.window && scope.window !== scope && typeof scope.window === "object"
      ? scope.window
      : null;
  if (nestedWindow) {
    if (nestedWindow.__BITVID_CANONICAL_NOSTR_TOOLS__) {
      candidates.push(nestedWindow.__BITVID_CANONICAL_NOSTR_TOOLS__);
    }
    if (nestedWindow.NostrTools) {
      candidates.push(nestedWindow.NostrTools);
    }
  }

  for (const candidate of candidates) {
    const normalized = normalizeToolkitCandidate(candidate);
    if (normalized) {
      return normalized;
    }
  }

  return null;
}

const __nwcNostrToolsBootstrap = await (async () => {
  try {
    const result = await nostrToolsReadySource;
    if (result && typeof result === "object" && result.ok === false) {
      return {
        toolkit: normalizeToolkitCandidate(readToolkitFromScope()),
        failure: result,
      };
    }
    const normalized = normalizeToolkitCandidate(result);
    if (normalized) {
      return { toolkit: normalized, failure: null };
    }
    return {
      toolkit: normalizeToolkitCandidate(readToolkitFromScope()),
      failure: null,
    };
  } catch (error) {
    return {
      toolkit: normalizeToolkitCandidate(readToolkitFromScope()),
      failure: error,
    };
  }
})();

let cachedNostrTools = __nwcNostrToolsBootstrap.toolkit || null;
const nostrToolsInitializationFailure = __nwcNostrToolsBootstrap.failure || null;

if (!cachedNostrTools && nostrToolsInitializationFailure) {
  userLogger.warn(
    "[nwcClient] nostr-tools helpers unavailable after bootstrap.",
    nostrToolsInitializationFailure
  );
}

function rememberNostrTools(candidate) {
  const normalized = normalizeToolkitCandidate(candidate);
  if (normalized) {
    cachedNostrTools = normalized;
  }
}

function getCachedNostrTools() {
  const fallback = readToolkitFromScope();
  if (cachedNostrTools && fallback && fallback !== cachedNostrTools) {
    rememberNostrTools(fallback);
  } else if (!cachedNostrTools && fallback) {
    rememberNostrTools(fallback);
  }
  return cachedNostrTools || fallback || null;
}

async function ensureNostrTools() {
  if (cachedNostrTools) {
    return cachedNostrTools;
  }
  try {
    const result = await nostrToolsReadySource;
    rememberNostrTools(result);
  } catch (error) {
    userLogger.warn("[nwcClient] Failed to resolve nostr-tools helpers.", error);
  }
  if (!cachedNostrTools) {
    rememberNostrTools(readToolkitFromScope());
  }
  return cachedNostrTools || null;
}

function getGlobalWindow() {
  if (typeof window !== "undefined") {
    return window;
  }
  if (typeof globalThis !== "undefined") {
    return globalThis;
  }
  return {};
}

function getNostrTools() {
  const win = getGlobalWindow();
  const tools = getCachedNostrTools();
  if (tools?.nip04) {
    return tools;
  }
  const canonical = win?.__BITVID_CANONICAL_NOSTR_TOOLS__ || null;
  if (canonical && tools && !tools.nip04 && canonical.nip04) {
    try {
      tools.nip04 = canonical.nip04;
      return tools;
    } catch (error) {
      return { ...canonical, ...tools, nip04: canonical.nip04 };
    }
  }
  return tools || canonical || null;
}

function assertNostrTools(methods = []) {
  const tools = getCachedNostrTools();
  if (!tools) {
    throw new Error("NostrTools is required for NWC operations.");
  }
  for (const method of methods) {
    const candidate = tools?.[method];
    const isCallable = typeof candidate === "function";
    const isNamespace = candidate && typeof candidate === "object";
    if (!isCallable && !isNamespace) {
      try {
        const available = Array.isArray(Object.keys(tools))
          ? Object.keys(tools)
          : [];
        userLogger.error(
          "[nwcClient] Required NostrTools capability is missing.",
          {
          missingMethod: method,
          availableMethods: available,
          }
        );
      } catch (loggingError) {
        userLogger.error(
          "[nwcClient] Failed to enumerate available NostrTools methods.",
          loggingError
        );
      }
      throw new Error(`NostrTools.${method} is unavailable.`);
    }
  }
  return tools;
}

function decodePubkey(value) {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed) {
    throw new Error("Wallet pubkey is missing from the NWC URI.");
  }

  if (HEX64_REGEX.test(trimmed)) {
    return trimmed.toLowerCase();
  }

  const tools = getNostrTools();
  const decoder = tools?.nip19?.decode;
  if (typeof decoder === "function") {
    try {
      const decoded = decoder(trimmed);
      if (decoded?.type === "npub" && typeof decoded.data === "string") {
        const hex = decoded.data.trim();
        if (HEX64_REGEX.test(hex)) {
          return hex.toLowerCase();
        }
      }
    } catch (error) {
      // Ignore decode errors and fall through to failure.
    }
  }

  throw new Error("Wallet pubkey in the NWC URI is invalid.");
}

function parseNwcUri(uri) {
  const trimmed = typeof uri === "string" ? uri.trim() : "";
  if (!trimmed) {
    throw new Error("Wallet URI is required.");
  }

  let stripped = trimmed;
  let scheme = "";
  for (const candidate of URI_SCHEMES) {
    if (trimmed.toLowerCase().startsWith(candidate)) {
      stripped = trimmed.slice(candidate.length);
      scheme = candidate;
      break;
    }
  }

  if (!scheme) {
    throw new Error("Unsupported NWC URI scheme.");
  }

  const [identifierPart, queryPart] = stripped.split("?");
  const walletPubkey = decodePubkey(identifierPart);

  const params = new URLSearchParams(queryPart || "");
  const relays = [];
  const additionalParams = new Map();
  let secret = "";

  for (const [rawKey, rawValue] of params.entries()) {
    const key = typeof rawKey === "string" ? rawKey.trim() : "";
    const value = typeof rawValue === "string" ? rawValue.trim() : "";
    if (!key || !value) {
      continue;
    }

    const lowerKey = key.toLowerCase();
    if (lowerKey === "relay" || lowerKey === "r") {
      relays.push(value);
      continue;
    }

    if (lowerKey === "secret" || lowerKey === "s") {
      if (!secret) {
        secret = value;
      }
      continue;
    }

    if (!additionalParams.has(key)) {
      additionalParams.set(key, []);
    }
    additionalParams.get(key).push(value);
  }

  if (!relays.length) {
    throw new Error("NWC URI is missing a relay parameter.");
  }

  if (!secret || !HEX64_REGEX.test(secret)) {
    throw new Error("NWC URI secret must be a 64 character hex string.");
  }

  const normalizedParams = new URLSearchParams();
  for (const relayUrl of relays) {
    normalizedParams.append("relay", relayUrl);
  }

  const secretKey = secret.toLowerCase();
  normalizedParams.set("secret", secretKey);

  for (const [key, values] of additionalParams.entries()) {
    for (const value of values) {
      normalizedParams.append(key, value);
    }
  }

  const tools = assertNostrTools(["getPublicKey"]);
  const clientPubkey = tools.getPublicKey(secretKey);

  const queryParams = {};
  for (const [key, values] of additionalParams.entries()) {
    if (!values || !values.length) {
      continue;
    }
    if (values.length === 1) {
      queryParams[key] = values[0];
    } else {
      queryParams[key] = values.slice();
    }
  }

  return {
    normalizedUri: `nostr+walletconnect://${walletPubkey}?${normalizedParams.toString()}`,
    relays,
    walletPubkey,
    secretKey,
    clientPubkey,
    queryParams,
  };
}

function normalizeSpaceSeparatedValues(value) {
  if (typeof value !== "string") {
    return [];
  }
  return value
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function hexToBytesCompat(hex) {
  const tools = getNostrTools();
  const candidate = tools?.utils?.hexToBytes;
  if (typeof candidate === "function") {
    return candidate(hex);
  }

  const normalized = typeof hex === "string" ? hex.trim() : "";
  if (!normalized || normalized.length % 2 !== 0) {
    throw new Error("Invalid hex value provided for conversion.");
  }

  const bytes = new Uint8Array(normalized.length / 2);
  for (let i = 0; i < normalized.length; i += 2) {
    const byte = Number.parseInt(normalized.slice(i, i + 2), 16);
    if (Number.isNaN(byte)) {
      throw new Error("Invalid hex value provided for conversion.");
    }
    bytes[i / 2] = byte;
  }
  return bytes;
}

function createNip04Encryption(context) {
  const tools = getNostrTools();
  const nip04 = tools?.nip04 || null;
  if (!nip04 || typeof nip04.encrypt !== "function" || typeof nip04.decrypt !== "function") {
    return null;
  }

  return {
    scheme: "nip04",
    tagValue: "nip04",
    async encrypt(plaintext) {
      return nip04.encrypt(context.secretKey, context.walletPubkey, plaintext);
    },
    async decrypt(ciphertext) {
      return nip04.decrypt(context.secretKey, context.walletPubkey, ciphertext);
    },
  };
}

function resolveNip44Exports(tools) {
  const nip44 = tools?.nip44 || null;
  if (!nip44 || typeof nip44 !== "object") {
    return null;
  }

  const directEncrypt = typeof nip44.encrypt === "function" ? nip44.encrypt : null;
  const directDecrypt = typeof nip44.decrypt === "function" ? nip44.decrypt : null;
  const directGetKey = typeof nip44.getConversationKey === "function" ? nip44.getConversationKey : null;

  const v2 = nip44.v2 && typeof nip44.v2 === "object" ? nip44.v2 : null;
  const v2Encrypt = v2 && typeof v2.encrypt === "function" ? v2.encrypt : null;
  const v2Decrypt = v2 && typeof v2.decrypt === "function" ? v2.decrypt : null;
  const v2GetKey =
    v2?.utils && typeof v2.utils.getConversationKey === "function"
      ? v2.utils.getConversationKey
      : null;

  const utilsGetKey =
    nip44.utils && typeof nip44.utils.getConversationKey === "function"
      ? nip44.utils.getConversationKey
      : null;

  const encrypt = directEncrypt || v2Encrypt || null;
  const decrypt = directDecrypt || v2Decrypt || null;
  const getConversationKey = directGetKey || v2GetKey || utilsGetKey || null;

  if (!encrypt || !decrypt || !getConversationKey) {
    return null;
  }

  return {
    encrypt,
    decrypt,
    getConversationKey,
  };
}

function createNip44Encryption(context) {
  const tools = getNostrTools();
  const resolved = resolveNip44Exports(tools);
  if (!resolved) {
    return null;
  }

  let cachedKey = null;

  const getKey = () => {
    if (!cachedKey) {
      try {
        const secretBytes = hexToBytesCompat(context.secretKey);
        cachedKey = resolved.getConversationKey(secretBytes, context.walletPubkey);
      } catch (error) {
        userLogger.warn("[nwcClient] Failed to derive nip44 conversation key", error);
        throw error;
      }
    }
    return cachedKey;
  };

  return {
    scheme: "nip44_v2",
    tagValue: "nip44_v2",
    async encrypt(plaintext) {
      return resolved.encrypt(plaintext, getKey());
    },
    async decrypt(ciphertext) {
      return resolved.decrypt(ciphertext, getKey());
    },
  };
}

function getWalletSupportedEncryption(infoEvent) {
  if (!infoEvent || !Array.isArray(infoEvent.tags)) {
    return { schemes: [], explicit: false };
  }

  const tag = infoEvent.tags.find((entry) => Array.isArray(entry) && entry[0] === "encryption");
  if (!tag || typeof tag[1] !== "string") {
    return { schemes: [], explicit: false };
  }

  const values = normalizeSpaceSeparatedValues(tag[1]);
  if (!values.length) {
    return { schemes: [], explicit: false };
  }

  const schemes = Array.from(new Set(values));
  return { schemes, explicit: true };
}

function getEncryptionCandidates(context) {
  const candidates = [];
  const nip44 = createNip44Encryption(context);
  if (nip44) {
    candidates.push(nip44);
  }
  const nip04 = createNip04Encryption(context);
  if (nip04) {
    candidates.push(nip04);
  }
  return candidates;
}

function settleInfoRequest(result) {
  if (!infoRequestState) {
    return;
  }

  const resolver = typeof infoRequestState.resolve === "function" ? infoRequestState.resolve : null;
  try {
    if (infoRequestState.timeoutId) {
      clearTimeout(infoRequestState.timeoutId);
    }
  } catch (error) {
    // ignore
  }

  closeInfoSubscription();
  infoRequestState = null;
  infoSubscriptionId = null;

  if (resolver) {
    try {
      resolver(result || null);
    } catch (error) {
      userLogger.warn("[nwcClient] Failed to resolve wallet info request", error);
    }
  }
}

function requestInfoEvent(context) {
  if (!context) {
    return Promise.resolve(null);
  }

  if (context.infoEvent) {
    return Promise.resolve(context.infoEvent);
  }

  if (infoRequestState?.promise) {
    return infoRequestState.promise;
  }

  if (!socket || socket.readyState !== socket.OPEN) {
    return Promise.resolve(null);
  }

  infoSubscriptionId = `nwc-info-${Math.random().toString(36).slice(2, 10)}`;
  const filters = {
    kinds: [INFO_KIND],
    authors: [context.walletPubkey],
    limit: 1,
  };

  const promise = new Promise((resolve) => {
    infoRequestState = {
      resolve,
      timeoutId: setTimeout(() => {
        settleInfoRequest(null);
      }, INFO_REQUEST_TIMEOUT_MS),
      promise: null,
    };
  });

  infoRequestState.promise = promise;

  try {
    socket.send(JSON.stringify(["REQ", infoSubscriptionId, filters]));
  } catch (error) {
    userLogger.warn("[nwcClient] Failed to request wallet info event", error);
    settleInfoRequest(null);
    return Promise.resolve(null);
  }

  return promise;
}

function ensureEncryptionState(context) {
  if (!context.encryptionState || typeof context.encryptionState !== "object") {
    context.encryptionState = { unsupported: new Set() };
    return context.encryptionState;
  }

  if (!(context.encryptionState.unsupported instanceof Set)) {
    context.encryptionState.unsupported = new Set();
  }

  return context.encryptionState;
}

function rememberUnsupportedEncryption(context, scheme) {
  if (!context || !scheme) {
    return;
  }
  const state = ensureEncryptionState(context);
  state.unsupported.add(scheme);
  if (context.encryption && context.encryption.scheme === scheme) {
    context.encryption = null;
  }
}

async function ensureEncryption(context) {
  if (!context || typeof context !== "object") {
    throw new Error("Wallet context is unavailable for encryption.");
  }

  if (context.encryption && typeof context.encryption.encrypt === "function") {
    return context.encryption;
  }

  const state = ensureEncryptionState(context);

  let infoEvent = context.infoEvent || null;
  if (!infoEvent) {
    try {
      infoEvent = await requestInfoEvent(context);
    } catch (error) {
      userLogger.warn("[nwcClient] Failed to load wallet info event", error);
    }
    if (infoEvent) {
      context.infoEvent = infoEvent;
    }
  }

  const { schemes: walletSchemes } = getWalletSupportedEncryption(infoEvent);
  const candidates = getEncryptionCandidates(context).filter((candidate) => {
    return !state.unsupported.has(candidate.scheme);
  });

  const compatibleCandidates = walletSchemes.length
    ? candidates.filter((candidate) => walletSchemes.includes(candidate.scheme))
    : candidates;

  if (compatibleCandidates.length) {
    const selected = compatibleCandidates[0];
    context.encryption = selected;
    return selected;
  }

  if (
    walletSchemes.includes("nip04") &&
    !candidates.some((candidate) => candidate.scheme === "nip04")
  ) {
    throw new Error("NostrTools.nip04.encrypt is not available.");
  }

  if (walletSchemes.length) {
    const message = `Wallet advertises unsupported encryption schemes: ${walletSchemes.join(", ")}.`;
    const error = new Error(message);
    error.code = "UNSUPPORTED_ENCRYPTION";
    throw error;
  }

  throw new Error("No compatible wallet encryption scheme available.");
}

function finalizePendingRequest(entry) {
  if (!entry || typeof entry !== "object") {
    return;
  }

  if (entry.timeoutId) {
    clearTimeout(entry.timeoutId);
  }

  if (entry.eventId && pendingRequests.get(entry.eventId) === entry) {
    pendingRequests.delete(entry.eventId);
  }

  if (entry.payloadId) {
    const stored = pendingRequestsByPayloadId.get(entry.payloadId);
    if (stored === entry) {
      pendingRequestsByPayloadId.delete(entry.payloadId);
    }
  }
}

function closeInfoSubscription() {
  if (infoSubscriptionId && socket && socket.readyState === socket.OPEN) {
    try {
      socket.send(JSON.stringify(["CLOSE", infoSubscriptionId]));
    } catch (error) {
      // ignore
    }
  }
}

function resetInfoRequestState() {
  if (infoRequestState) {
    settleInfoRequest(null);
    return;
  }
  infoSubscriptionId = null;
}

function closeSocket({ keepState = false } = {}) {
  if (socket) {
    try {
      socket.close();
    } catch (error) {
      // Ignore close errors.
    }
  }
  socket = null;
  connectionPromise = null;
  subscriptionId = null;
  resetInfoRequestState();

  if (!keepState) {
    activeState = null;
  }

  const pendingEntries = Array.from(pendingRequests.values());
  pendingRequests.clear();
  pendingRequestsByPayloadId.clear();

  for (const entry of pendingEntries) {
    try {
      if (entry.timeoutId) {
        clearTimeout(entry.timeoutId);
      }
      entry.reject(new Error("Wallet connection closed."));
    } catch (error) {
      // ignore
    }
  }
}

function isSocketOpen() {
  return socket && socket.readyState === socket.OPEN;
}

function handleSocketError(error) {
  userLogger.warn("[nwcClient] WebSocket error", error);
  closeSocket({ keepState: true });
}

function handleSocketClose() {
  userLogger.warn("[nwcClient] Wallet connection closed.");
  closeSocket({ keepState: true });
}

function resolveWebSocketImplementation() {
  if (typeof WebSocket !== "undefined") {
    return WebSocket;
  }
  if (typeof globalThis !== "undefined" && typeof globalThis.WebSocket !== "undefined") {
    return globalThis.WebSocket;
  }
  throw new Error("WebSocket is not available in this environment.");
}

function subscribeToResponses(context) {
  if (!socket) {
    return;
  }
  subscriptionId = `nwc-${Math.random().toString(36).slice(2, 10)}`;
  const filters = {
    kinds: [RESPONSE_KIND],
    authors: [context.walletPubkey],
    "#p": [context.clientPubkey],
  };
  socket.send(JSON.stringify(["REQ", subscriptionId, filters]));
}

async function decryptResponse(event) {
  const context = activeState?.context;
  if (!context) {
    throw new Error("Wallet context is unavailable for decrypting responses.");
  }
  const encryption = await ensureEncryption(context);
  const plaintext = await encryption.decrypt(event.content);
  return JSON.parse(plaintext);
}

async function handleSocketMessage(messageEvent) {
  let payload;
  try {
    payload = JSON.parse(messageEvent.data);
  } catch (error) {
    userLogger.warn("[nwcClient] Failed to parse relay message", error);
    return;
  }

  if (!Array.isArray(payload) || payload.length < 2) {
    return;
  }

  const [type, subscription] = payload;
  if (type === "EVENT" && payload.length >= 3) {
    const event = payload[2];

    if (subscription && subscription === infoSubscriptionId && event?.kind === INFO_KIND) {
      settleInfoRequest(event);
      return;
    }

    if (subscription !== subscriptionId || event?.kind !== RESPONSE_KIND || !Array.isArray(event.tags)) {
      return;
    }

    const eTag = event.tags.find((tag) => Array.isArray(tag) && tag[0] === "e");
    const requestId = typeof eTag?.[1] === "string" ? eTag[1] : null;
    let pending = requestId ? pendingRequests.get(requestId) || null : null;

    let response;
    try {
      response = await decryptResponse(event);
    } catch (error) {
      if (pending) {
        finalizePendingRequest(pending);
        pending.reject(error);
      } else {
        userLogger.warn("[nwcClient] Failed to decrypt wallet response", error);
      }
      return;
    }

    if (!pending) {
      const payloadId =
        typeof response?.id === "string" && response.id.trim() ? response.id.trim() : null;
      if (payloadId) {
        pending = pendingRequestsByPayloadId.get(payloadId) || null;
      }
    }

    if (!pending) {
      return;
    }

    finalizePendingRequest(pending);

    if (response?.error) {
      const message =
        typeof response.error.message === "string" && response.error.message.trim()
          ? response.error.message.trim()
          : "Wallet reported an error.";
      const error = new Error(message);
      error.code = response.error.code || null;
      pending.reject(error);
      return;
    }

    pending.resolve({
      requestId: pending.eventId || requestId || null,
      result: response?.result || null,
      response,
      event,
    });
    return;
  }

  if (type === "EOSE" && subscription === infoSubscriptionId) {
    settleInfoRequest(null);
    return;
  }

  if (type === "NOTICE" && payload.length >= 2) {
    userLogger.warn("[nwcClient] Relay notice:", payload[1]);
    return;
  }
}

function connectSocket(context) {
  if (connectionPromise) {
    return connectionPromise;
  }

  const WebSocketImpl = resolveWebSocketImplementation();
  const url = context.relayUrl;

  connectionPromise = new Promise((resolve, reject) => {
    try {
      socket = new WebSocketImpl(url);
    } catch (error) {
      connectionPromise = null;
      reject(new Error("Failed to open wallet WebSocket."));
      return;
    }

    const handleOpen = () => {
      socket.removeEventListener("open", handleOpen);
      socket.removeEventListener("error", handleError);
      socket.removeEventListener("close", handleCloseDuringConnect);
      socket.addEventListener("message", handleSocketMessage);
      socket.addEventListener("error", handleSocketError);
      socket.addEventListener("close", handleSocketClose);
      subscribeToResponses(context);
      resolve();
    };

    const handleError = (event) => {
      socket.removeEventListener("open", handleOpen);
      socket.removeEventListener("error", handleError);
      socket.removeEventListener("close", handleCloseDuringConnect);
      connectionPromise = null;
      reject(event instanceof Error ? event : new Error("Wallet WebSocket failed."));
    };

    const handleCloseDuringConnect = () => {
      socket.removeEventListener("open", handleOpen);
      socket.removeEventListener("error", handleError);
      socket.removeEventListener("close", handleCloseDuringConnect);
      connectionPromise = null;
      reject(new Error("Wallet WebSocket closed before opening."));
    };

    socket.addEventListener("open", handleOpen);
    socket.addEventListener("error", handleError);
    socket.addEventListener("close", handleCloseDuringConnect);
  });

  return connectionPromise;
}

function ensureActiveState(settings) {
  if (!settings || typeof settings !== "object") {
    throw new Error("Wallet settings are required.");
  }

  const uri =
    typeof settings.nwcUri === "string" && settings.nwcUri.trim()
      ? settings.nwcUri.trim()
      : "";
  if (!uri) {
    throw new Error("Wallet URI is required.");
  }

  const parsed = parseNwcUri(uri);
  if (activeState && activeState.normalizedUri === parsed.normalizedUri) {
    activeState.settings = { ...settings, nwcUri: parsed.normalizedUri };
    if (activeState.context) {
      activeState.context.relayUrl = parsed.relays[0];
      activeState.context.relayUrls = parsed.relays.slice();
      activeState.context.relays = parsed.relays.slice();
      activeState.context.queryParams = parsed.queryParams;
    }
    return activeState.context;
  }

  closeSocket();

  activeState = {
    normalizedUri: parsed.normalizedUri,
    settings: { ...settings, nwcUri: parsed.normalizedUri },
    context: {
      relayUrl: parsed.relays[0],
      relayUrls: parsed.relays.slice(),
      relays: parsed.relays.slice(),
      walletPubkey: parsed.walletPubkey,
      secretKey: parsed.secretKey,
      clientPubkey: parsed.clientPubkey,
      uri: parsed.normalizedUri,
      queryParams: parsed.queryParams,
      infoEvent: null,
      encryption: null,
      encryptionState: { unsupported: new Set() },
    },
  };

  pendingRequests = new Map();
  pendingRequestsByPayloadId = new Map();
  return activeState.context;
}

export async function ensureWallet({ settings } = {}) {
  const candidateSettings =
    settings || activeState?.settings || activeState?.context?.settings || null;

  const context = ensureActiveState(candidateSettings);

  if (!isSocketOpen()) {
    await connectSocket(context);
  }

  await ensureEncryption(context);

  return context;
}

async function encryptRequestPayload(context, payload) {
  const tools = assertNostrTools(["getEventHash", "signEvent"]);
  const encryption = await ensureEncryption(context);

  const plaintext = JSON.stringify(payload);
  const encrypted = await encryption.encrypt(plaintext);

  const tags = [["p", context.walletPubkey]];
  if (encryption?.tagValue) {
    tags.push(["encryption", encryption.tagValue]);
  }

  const event = {
    kind: REQUEST_KIND,
    created_at: Math.floor(Date.now() / 1000),
    content: encrypted,
    pubkey: context.clientPubkey,
    tags,
  };

  event.id = tools.getEventHash(event);
  event.sig = tools.signEvent(event, context.secretKey);

  return event;
}

function registerPendingRequest(eventId, payloadId, { resolve, reject, timeoutMs }) {
  const entry = {
    eventId,
    payloadId: typeof payloadId === "string" ? payloadId : null,
    resolve,
    reject,
    timeoutId: null,
  };

  entry.timeoutId = setTimeout(() => {
    const existing = pendingRequests.get(eventId);
    if (existing === entry) {
      finalizePendingRequest(entry);
      reject(new Error("Wallet request timed out."));
    }
  }, timeoutMs || DEFAULT_REQUEST_TIMEOUT_MS);

  pendingRequests.set(eventId, entry);
  if (entry.payloadId) {
    pendingRequestsByPayloadId.set(entry.payloadId, entry);
  }
}

async function dispatchWalletRequest(context, payload, { timeoutMs } = {}) {
  if (!isSocketOpen()) {
    await connectSocket(context);
  }

  const event = await encryptRequestPayload(context, payload);

  const promise = new Promise((resolve, reject) => {
    registerPendingRequest(event.id, payload?.id || null, { resolve, reject, timeoutMs });
  });

  socket.send(JSON.stringify(["EVENT", event]));
  return promise;
}

async function sendWalletRequest(context, payload, { timeoutMs, __internalRetry = false } = {}) {
  try {
    return await dispatchWalletRequest(context, payload, { timeoutMs });
  } catch (error) {
    const encryption = context?.encryption || null;
    if (
      !__internalRetry &&
      encryption &&
      error &&
      typeof error === "object" &&
      (error.code === "UNSUPPORTED_ENCRYPTION" || error.code === "unsupported_encryption")
    ) {
      rememberUnsupportedEncryption(context, encryption.scheme);
      context.encryption = null;
      return sendWalletRequest(context, payload, { timeoutMs, __internalRetry: true });
    }
    throw error;
  }
}

function sanitizeInvoice(value) {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed) {
    throw new Error("Invoice is required to send a payment.");
  }
  return trimmed;
}

function sanitizeAmount(amount) {
  if (!Number.isFinite(amount)) {
    return null;
  }
  const rounded = Math.round(amount);
  return Math.max(0, rounded);
}

function buildPayInvoiceParams({ invoice, amountSats, zapRequest, lnurl }) {
  const params = { invoice };

  const amount = sanitizeAmount(amountSats);
  if (amount && amount > 0) {
    params.amount = amount * 1000;
  }

  if (zapRequest) {
    params.zap_request = zapRequest;
  }

  if (typeof lnurl === "string") {
    const trimmed = lnurl.trim();
    if (trimmed) {
      params.lnurl = trimmed;
    }
  }

  return params;
}

export async function sendPayment(
  bolt11,
  { settings, amountSats, zapRequest, lnurl, timeoutMs } = {}
) {
  const context = await ensureWallet({ settings });
  const invoice = sanitizeInvoice(bolt11);
  const params = buildPayInvoiceParams({ invoice, amountSats, zapRequest, lnurl });
  const payload = {
    id: `req-${Date.now()}-${++requestCounter}`,
    method: "pay_invoice",
    params,
  };

  const response = await sendWalletRequest(context, payload, { timeoutMs });
  return response;
}

export function getActiveWalletContext() {
  return activeState?.context || null;
}

export function resetWalletClient() {
  closeSocket();
}

export const __TESTING__ = Object.freeze({
  parseNwcUri,
  closeSocket,
  pendingRequests,
  ensureActiveState,
  buildPayInvoiceParams,
  getActiveState: () => activeState,
  ensureEncryptionForContext: ensureEncryption,
});
