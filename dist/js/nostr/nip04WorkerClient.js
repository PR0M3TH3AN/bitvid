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

    if (data.ok && typeof data.ciphertext === "string") {
      entry.resolve(data.ciphertext);
      return;
    }

    const message = data?.error?.message || "nip04-worker-error";
    const error = new Error(message);
    error.name = data?.error?.name || "Error";
    entry.reject(error);
  });

  worker.addEventListener("error", (error) => {
    devLogger.warn("[nip04WorkerClient] Worker error", error);
    for (const entry of pending.values()) {
      clearTimeout(entry.timeoutId);
      entry.reject(error instanceof Error ? error : new Error("nip04-worker-error"));
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
    workerInstance = new Worker(new URL("./nip04Worker.js", import.meta.url), {
      type: "module",
    });
    attachWorkerListeners(workerInstance);
  } catch (error) {
    devLogger.warn("[nip04WorkerClient] Failed to create worker", error);
    workerInstance = null;
  }

  return workerInstance;
}

export function encryptNip04InWorker({
  privateKey,
  targetPubkey,
  plaintext,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  const worker = ensureWorker();
  if (!worker) {
    return Promise.reject(new Error("nip04-worker-unavailable"));
  }

  const trimmedPrivateKey =
    typeof privateKey === "string" ? privateKey.trim() : "";
  const trimmedTarget =
    typeof targetPubkey === "string" ? targetPubkey.trim() : "";
  const message = typeof plaintext === "string" ? plaintext : "";

  if (!trimmedPrivateKey || !trimmedTarget) {
    return Promise.reject(new Error("nip04-worker-invalid-input"));
  }

  const id = `${Date.now()}-${requestId++}`;

  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      pending.delete(id);
      reject(new Error("nip04-worker-timeout"));
    }, timeoutMs);

    pending.set(id, { resolve, reject, timeoutId });
    worker.postMessage({
      id,
      privateKey: trimmedPrivateKey,
      targetPubkey: trimmedTarget,
      plaintext: message,
    });
  });
}
