const worker = new Worker(new URL("./crypto.worker.js", import.meta.url), {
  type: "module",
});

let nextMessageId = 1;
const pending = new Map();

worker.addEventListener("message", (event) => {
  const { data } = event;
  if (!data || typeof data.id === "undefined") {
    return;
  }
  const entry = pending.get(data.id);
  if (!entry) {
    return;
  }
  pending.delete(data.id);

  if (!data.ok) {
    const error = new Error(data?.error || "NIP-49 worker error");
    entry.reject(error);
    return;
  }

  if (typeof data.ncryptsec === "string") {
    entry.resolve(data.ncryptsec);
    return;
  }

  if (data.nsecBytes) {
    entry.resolve(new Uint8Array(data.nsecBytes));
    return;
  }

  entry.resolve(undefined);
});

const rejectAll = (error) => {
  if (!pending.size) {
    return;
  }
  for (const { reject } of pending.values()) {
    reject(error);
  }
  pending.clear();
};

worker.addEventListener("error", (event) => {
  const error = new Error(event?.message || "NIP-49 worker error");
  rejectAll(error);
});

worker.addEventListener("messageerror", () => {
  rejectAll(new Error("Failed to parse message from NIP-49 worker"));
});

function postToWorker(type, payload, transfer = []) {
  return new Promise((resolve, reject) => {
    const id = nextMessageId++;
    pending.set(id, { resolve, reject });
    try {
      worker.postMessage({ id, type, ...payload }, transfer);
    } catch (error) {
      pending.delete(id);
      reject(error);
    }
  });
}

export function encryptToNcryptsec(nsecBytes, passphrase, kdfParams = {}) {
  if (!(nsecBytes instanceof Uint8Array) && !(nsecBytes instanceof ArrayBuffer)) {
    throw new TypeError("nsecBytes must be a Uint8Array or ArrayBuffer");
  }
  const buffer =
    nsecBytes instanceof Uint8Array
      ? new Uint8Array(nsecBytes)
      : new Uint8Array(nsecBytes.slice(0));
  return postToWorker(
    "nip49-encrypt",
    {
      nsecBytes: buffer.buffer,
      passphrase,
      kdfParams,
    },
    [buffer.buffer]
  );
}

export function decryptFromNcryptsec(ncryptsec, passphrase, kdfParams = {}) {
  if (typeof ncryptsec !== "string") {
    throw new TypeError("ncryptsec must be a string");
  }
  return postToWorker("nip49-decrypt", { ncryptsec, passphrase, kdfParams });
}
