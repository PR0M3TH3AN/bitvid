import { devLogger } from "../utils/logger.js";

const DEFAULT_TIMEOUT_MS = 12000;

let workerInstance = null;
let workerReady = false;
let requestId = 0;
const pending = new Map();

function attachWorkerListeners(worker) {
  if (!worker || workerReady) {
    return;
  }

  worker.addEventListener("message", (event) => {
    const data = event?.data || {};
    const id = data.id;
    if (!pending.has(id)) {
      return;
    }

    const entry = pending.get(id);
    pending.delete(id);
    clearTimeout(entry.timeoutId);

    if (data.ok && typeof data.plaintext === "string") {
      entry.resolve(data.plaintext);
      return;
    }

    const message = data?.error?.message || "dm-worker-error";
    const error = new Error(message);
    error.name = data?.error?.name || "Error";
    entry.reject(error);
  });

  worker.addEventListener("error", (error) => {
    devLogger.warn("[dmDecryptWorkerClient] Worker error", error);
    for (const entry of pending.values()) {
      clearTimeout(entry.timeoutId);
      entry.reject(
        error instanceof Error ? error : new Error("dm-worker-error"),
      );
    }
    pending.clear();
  });

  workerReady = true;
}

function ensureWorker() {
  if (workerInstance) {
    return workerInstance;
  }

  if (typeof Worker === "undefined") {
    return null;
  }

  try {
    workerInstance = new Worker(
      new URL("./dmDecryptWorker.js", import.meta.url),
      {
        type: "module",
      },
    );
    attachWorkerListeners(workerInstance);
  } catch (error) {
    devLogger.warn("[dmDecryptWorkerClient] Failed to create worker", error);
    workerInstance = null;
  }

  return workerInstance;
}

export function isDmDecryptWorkerSupported() {
  return typeof Worker !== "undefined";
}

export function getDmDecryptWorkerQueueSize() {
  return pending.size;
}

export function decryptDmInWorker({
  scheme = "nip04",
  privateKey,
  targetPubkey,
  ciphertext,
  event,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  const worker = ensureWorker();
  if (!worker) {
    return Promise.reject(new Error("dm-worker-unavailable"));
  }

  const trimmedPrivateKey =
    typeof privateKey === "string" ? privateKey.trim() : "";
  const trimmedTarget =
    typeof targetPubkey === "string" ? targetPubkey.trim() : "";
  const payloadCiphertext = typeof ciphertext === "string" ? ciphertext : "";
  const payloadScheme = typeof scheme === "string" ? scheme : "";
  const payloadEvent = event && typeof event === "object" ? event : null;

  if (!trimmedPrivateKey || !trimmedTarget || !payloadCiphertext) {
    return Promise.reject(new Error("dm-worker-invalid-input"));
  }

  const id = `${Date.now()}-${requestId++}`;

  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      pending.delete(id);
      reject(new Error("dm-worker-timeout"));
    }, timeoutMs);

    pending.set(id, { resolve, reject, timeoutId });
    worker.postMessage({
      id,
      scheme: payloadScheme,
      privateKey: trimmedPrivateKey,
      targetPubkey: trimmedTarget,
      ciphertext: payloadCiphertext,
      event: payloadEvent,
    });
  });
}
