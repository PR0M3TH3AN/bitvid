// js/payments/nwcClient.js

const HEX64_REGEX = /^[0-9a-f]{64}$/i;
const URI_SCHEMES = [
  "nostr+walletconnect://",
  "walletconnect://",
  "nwc://",
];
const REQUEST_KIND = 23194;
const RESPONSE_KIND = 23195;
const DEFAULT_REQUEST_TIMEOUT_MS = 25_000;

let activeState = null;
let pendingRequests = new Map();
let socket = null;
let subscriptionId = null;
let connectionPromise = null;
let requestCounter = 0;

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
  const tools = win?.NostrTools || null;
  const canonical = win?.__BITVID_CANONICAL_NOSTR_TOOLS__ || null;

  if (tools && canonical && !tools.nip04 && canonical.nip04) {
    try {
      tools.nip04 = canonical.nip04;
    } catch (error) {
      return { ...canonical, ...tools, nip04: canonical.nip04 };
    }
  }

  if (tools) {
    return tools;
  }

  return canonical || null;
}

function assertNostrTools(methods = []) {
  const tools = getNostrTools();
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
        console.error(
          "[nwcClient] Required NostrTools capability is missing.",
          {
            missingMethod: method,
            availableMethods: available,
          }
        );
      } catch (loggingError) {
        console.error(
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
  const relay = params.get("relay") || params.get("r");
  const secret = params.get("secret") || params.get("s");

  if (!relay) {
    throw new Error("NWC URI is missing a relay parameter.");
  }

  if (!secret || !HEX64_REGEX.test(secret)) {
    throw new Error("NWC URI secret must be a 64 character hex string.");
  }

  const relayUrl = decodeURIComponent(relay);
  const secretKey = secret.toLowerCase();

  const tools = assertNostrTools(["getPublicKey"]);
  const clientPubkey = tools.getPublicKey(secretKey);

  return {
    normalizedUri: `nostr+walletconnect://${walletPubkey}?relay=${encodeURIComponent(
      relayUrl
    )}&secret=${secretKey}`,
    relayUrl,
    walletPubkey,
    secretKey,
    clientPubkey,
  };
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

  if (!keepState) {
    activeState = null;
  }

  for (const [, entry] of pendingRequests.entries()) {
    try {
      entry.reject(new Error("Wallet connection closed."));
    } catch (error) {
      // ignore
    }
  }
  pendingRequests.clear();
}

function isSocketOpen() {
  return socket && socket.readyState === socket.OPEN;
}

function handleSocketError(error) {
  console.warn("[nwcClient] WebSocket error", error);
  closeSocket({ keepState: true });
}

function handleSocketClose() {
  console.warn("[nwcClient] Wallet connection closed.");
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
  const tools = assertNostrTools(["nip04"]);
  if (typeof tools.nip04?.decrypt !== "function") {
    throw new Error("NostrTools.nip04.decrypt is not available.");
  }
  const context = activeState?.context;
  if (!context) {
    throw new Error("Wallet context is unavailable for decrypting responses.");
  }
  const plaintext = await tools.nip04.decrypt(
    context.secretKey,
    context.walletPubkey,
    event.content
  );
  return JSON.parse(plaintext);
}

async function handleSocketMessage(messageEvent) {
  let payload;
  try {
    payload = JSON.parse(messageEvent.data);
  } catch (error) {
    console.warn("[nwcClient] Failed to parse relay message", error);
    return;
  }

  if (!Array.isArray(payload) || payload.length < 2) {
    return;
  }

  const [type] = payload;
  if (type === "EVENT" && payload.length >= 3) {
    const event = payload[2];
    if (event?.kind !== RESPONSE_KIND || !Array.isArray(event.tags)) {
      return;
    }

    const eTag = event.tags.find((tag) => Array.isArray(tag) && tag[0] === "e");
    const requestId = eTag?.[1];
    if (!requestId || !pendingRequests.has(requestId)) {
      return;
    }

    const pending = pendingRequests.get(requestId);
    pendingRequests.delete(requestId);
    clearTimeout(pending.timeoutId);

    try {
      const response = await decryptResponse(event);
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
        requestId,
        result: response?.result || null,
        response,
        event,
      });
    } catch (error) {
      pending.reject(error);
    }
    return;
  }

  if (type === "NOTICE" && payload.length >= 2) {
    console.warn("[nwcClient] Relay notice:", payload[1]);
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
    return activeState.context;
  }

  closeSocket();

  activeState = {
    normalizedUri: parsed.normalizedUri,
    settings: { ...settings, nwcUri: parsed.normalizedUri },
    context: {
      relayUrl: parsed.relayUrl,
      walletPubkey: parsed.walletPubkey,
      secretKey: parsed.secretKey,
      clientPubkey: parsed.clientPubkey,
      uri: parsed.normalizedUri,
    },
  };

  pendingRequests = new Map();
  return activeState.context;
}

export async function ensureWallet({ settings } = {}) {
  const candidateSettings =
    settings || activeState?.settings || activeState?.context?.settings || null;

  const context = ensureActiveState(candidateSettings);

  if (!isSocketOpen()) {
    await connectSocket(context);
  }

  return context;
}

async function encryptRequestPayload(context, payload) {
  const tools = assertNostrTools(["nip04", "getEventHash", "signEvent"]);
  if (typeof tools.nip04?.encrypt !== "function") {
    throw new Error("NostrTools.nip04.encrypt is not available.");
  }

  const plaintext = JSON.stringify(payload);
  const encrypted = await tools.nip04.encrypt(
    context.secretKey,
    context.walletPubkey,
    plaintext
  );

  const event = {
    kind: REQUEST_KIND,
    created_at: Math.floor(Date.now() / 1000),
    content: encrypted,
    pubkey: context.clientPubkey,
    tags: [["p", context.walletPubkey]],
  };

  event.id = tools.getEventHash(event);
  event.tags.push(["e", event.id]);
  event.sig = tools.signEvent(event, context.secretKey);

  return event;
}

function registerPendingRequest(eventId, { resolve, reject, timeoutMs }) {
  const timeoutId = setTimeout(() => {
    if (pendingRequests.has(eventId)) {
      pendingRequests.delete(eventId);
      reject(new Error("Wallet request timed out."));
    }
  }, timeoutMs || DEFAULT_REQUEST_TIMEOUT_MS);

  pendingRequests.set(eventId, { resolve, reject, timeoutId });
}

async function sendWalletRequest(context, payload, { timeoutMs } = {}) {
  if (!isSocketOpen()) {
    await connectSocket(context);
  }

  const event = await encryptRequestPayload(context, payload);

  const promise = new Promise((resolve, reject) => {
    registerPendingRequest(event.id, { resolve, reject, timeoutMs });
  });

  socket.send(JSON.stringify(["EVENT", event]));
  return promise;
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

export async function sendPayment(bolt11, { settings, amountSats, zapRequest, timeoutMs } = {}) {
  const context = await ensureWallet({ settings });
  const invoice = sanitizeInvoice(bolt11);
  const payload = {
    id: `req-${Date.now()}-${++requestCounter}`,
    method: "pay_invoice",
    params: {
      invoice,
    },
  };

  const amount = sanitizeAmount(amountSats);
  if (amount && amount > 0) {
    payload.params.amount = amount;
  }

  if (zapRequest) {
    payload.params.zap_request = zapRequest;
  }

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
});
