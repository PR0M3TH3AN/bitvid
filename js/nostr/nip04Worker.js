import { ensureNostrTools, getCachedNostrTools } from "./toolkit.js";
import { devLogger } from "../utils/logger.js";

const workerScope = typeof self !== "undefined" ? self : null;

const postResponse = (payload) => {
  if (!workerScope || typeof workerScope.postMessage !== "function") {
    return;
  }
  workerScope.postMessage(payload);
};

const ensureNip04 = async () => {
  const tools = (await ensureNostrTools()) || getCachedNostrTools();
  const nip04 = tools?.nip04;
  if (!nip04 || typeof nip04.encrypt !== "function") {
    throw new Error("nip04-unavailable");
  }
  return nip04;
};

const normalizePayload = (payload) => {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const id =
    typeof payload.id === "string" || typeof payload.id === "number"
      ? payload.id
      : null;
  const privateKey =
    typeof payload.privateKey === "string" ? payload.privateKey.trim() : "";
  const targetPubkey =
    typeof payload.targetPubkey === "string" ? payload.targetPubkey.trim() : "";
  const plaintext =
    typeof payload.plaintext === "string" ? payload.plaintext : "";

  if (!id || !privateKey || !targetPubkey) {
    return null;
  }

  return {
    id,
    privateKey,
    targetPubkey,
    plaintext,
  };
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

  try {
    const nip04 = await ensureNip04();
    const ciphertext = await nip04.encrypt(
      payload.privateKey,
      payload.targetPubkey,
      payload.plaintext,
    );

    postResponse({
      id: payload.id,
      ok: true,
      ciphertext,
    });
  } catch (error) {
    devLogger.warn("[nip04Worker] Encryption failed", error);
    postResponse({
      id: payload.id,
      ok: false,
      error: {
        message: error?.message || "nip04-worker-failed",
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
