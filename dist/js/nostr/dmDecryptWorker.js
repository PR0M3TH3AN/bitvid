import { ensureNostrTools, getCachedNostrTools } from "./toolkit.js";
import { devLogger } from "../utils/logger.js";

const workerScope = typeof self !== "undefined" ? self : null;
const HEX64_REGEX = /^[0-9a-f]{64}$/i;

const postResponse = (payload) => {
  if (!workerScope || typeof workerScope.postMessage !== "function") {
    return;
  }
  workerScope.postMessage(payload);
};

const normalizeScheme = (scheme) => {
  if (typeof scheme !== "string") {
    return "nip04";
  }
  const normalized = scheme.trim().toLowerCase();
  if (!normalized) {
    return "nip04";
  }
  if (normalized === "nip44-v2") {
    return "nip44_v2";
  }
  if (normalized === "nip-44") {
    return "nip44";
  }
  if (normalized === "nip-04") {
    return "nip04";
  }
  return normalized;
};

const normalizePayload = (payload) => {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const id =
    typeof payload.id === "string" || typeof payload.id === "number"
      ? payload.id
      : null;
  const scheme = normalizeScheme(payload.scheme);
  const privateKey =
    typeof payload.privateKey === "string" ? payload.privateKey.trim() : "";
  const targetPubkey =
    typeof payload.targetPubkey === "string" ? payload.targetPubkey.trim() : "";
  const ciphertext =
    typeof payload.ciphertext === "string" ? payload.ciphertext : "";
  const event =
    payload.event && typeof payload.event === "object" ? payload.event : null;

  if (!id || !privateKey || !targetPubkey || !ciphertext) {
    return null;
  }

  return {
    id,
    scheme,
    privateKey,
    targetPubkey,
    ciphertext,
    event,
  };
};

const normalizeEventForVerification = (event) => {
  if (!event || typeof event !== "object") {
    return null;
  }

  const pubkey = typeof event.pubkey === "string" ? event.pubkey.trim() : "";
  const sig = typeof event.sig === "string" ? event.sig.trim() : "";
  const id = typeof event.id === "string" ? event.id.trim() : "";

  if (!pubkey || !sig || !id) {
    return null;
  }

  return {
    id,
    pubkey,
    sig,
    kind: Number.isFinite(event.kind) ? event.kind : 0,
    created_at: Number.isFinite(event.created_at)
      ? event.created_at
      : Math.floor(Date.now() / 1000),
    tags: Array.isArray(event.tags) ? event.tags : [],
    content: typeof event.content === "string" ? event.content : "",
  };
};

const resolveHexToBytes = (tools) => {
  if (typeof tools?.utils?.hexToBytes === "function") {
    return (value) => tools.utils.hexToBytes(value);
  }

  return (value) => {
    if (typeof value !== "string") {
      throw new Error("Invalid hex input.");
    }
    const trimmed = value.trim();
    if (!trimmed || trimmed.length % 2 !== 0) {
      throw new Error("Invalid hex input.");
    }

    const bytes = new Uint8Array(trimmed.length / 2);
    for (let index = 0; index < trimmed.length; index += 2) {
      const byte = Number.parseInt(trimmed.slice(index, index + 2), 16);
      if (Number.isNaN(byte)) {
        throw new Error("Invalid hex input.");
      }
      bytes[index / 2] = byte;
    }
    return bytes;
  };
};

const ensureNip04 = async () => {
  const tools = (await ensureNostrTools()) || getCachedNostrTools();
  const nip04 = tools?.nip04;
  if (!nip04 || typeof nip04.decrypt !== "function") {
    throw new Error("nip04-unavailable");
  }
  return nip04;
};

const ensureNip44 = async () => {
  const tools = (await ensureNostrTools()) || getCachedNostrTools();
  if (!tools) {
    throw new Error("nip44-unavailable");
  }

  const nip44 = tools.nip44 || null;
  let decrypt = null;
  let getConversationKey = null;

  if (nip44?.v2 && typeof nip44.v2 === "object") {
    if (typeof nip44.v2.decrypt === "function") {
      decrypt = nip44.v2.decrypt;
    }
    if (typeof nip44.v2?.utils?.getConversationKey === "function") {
      getConversationKey = nip44.v2.utils.getConversationKey;
    }
  }

  if ((!decrypt || !getConversationKey) && nip44 && typeof nip44 === "object") {
    if (typeof nip44.decrypt === "function") {
      decrypt = nip44.decrypt;
    }
    if (typeof nip44.getConversationKey === "function") {
      getConversationKey = nip44.getConversationKey;
    } else if (typeof nip44.utils?.getConversationKey === "function") {
      getConversationKey = nip44.utils.getConversationKey;
    }
  }

  if (!decrypt || !getConversationKey) {
    throw new Error("nip44-unavailable");
  }

  return {
    decrypt,
    getConversationKey,
    hexToBytes: resolveHexToBytes(tools),
  };
};

const verifyEventSignature = async (event, tools = null) => {
  const candidate = normalizeEventForVerification(event);
  if (!candidate) {
    throw new Error("missing-event-signature");
  }

  const resolvedTools = tools || (await ensureNostrTools()) || getCachedNostrTools();
  if (!resolvedTools || typeof resolvedTools !== "object") {
    throw new Error("signature-verification-unavailable");
  }

  if (
    typeof resolvedTools.validateEvent !== "function" ||
    typeof resolvedTools.verifyEvent !== "function"
  ) {
    throw new Error("signature-verification-unavailable");
  }

  if (!resolvedTools.validateEvent(candidate) || !resolvedTools.verifyEvent(candidate)) {
    throw new Error("invalid-event-signature");
  }

  return true;
};

const handleMessage = async (event) => {
  const payload = normalizePayload(event?.data);
  if (!payload) {
    postResponse({
      id: event?.data?.id ?? null,
      ok: false,
      error: { message: "invalid-payload" },
    });
    return;
  }

  if (!HEX64_REGEX.test(payload.privateKey)) {
    postResponse({
      id: payload.id,
      ok: false,
      error: { message: "invalid-private-key" },
    });
    return;
  }

  try {
    if (payload.scheme === "nip44" || payload.scheme === "nip44_v2") {
      await verifyEventSignature(payload.event);
      const nip44 = await ensureNip44();
      const privateKeyBytes = nip44.hexToBytes(payload.privateKey);
      const conversationKey = nip44.getConversationKey(
        privateKeyBytes,
        payload.targetPubkey,
      );
      const plaintext = await nip44.decrypt(
        payload.ciphertext,
        conversationKey,
      );

      postResponse({
        id: payload.id,
        ok: true,
        plaintext,
      });
      return;
    }

    const nip04 = await ensureNip04();
    const plaintext = await nip04.decrypt(
      payload.privateKey,
      payload.targetPubkey,
      payload.ciphertext,
    );

    postResponse({
      id: payload.id,
      ok: true,
      plaintext,
    });
  } catch (error) {
    devLogger.warn("[dmDecryptWorker] Decryption failed", error);
    postResponse({
      id: payload.id,
      ok: false,
      error: {
        message: error?.message || "dm-worker-failed",
        name: error?.name || "Error",
      },
    });
  }
};

if (workerScope?.addEventListener) {
  workerScope.addEventListener("message", (event) => {
    void handleMessage(event);
  });
}
