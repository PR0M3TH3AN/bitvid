const DB_NAME = "bitvid-vault";
const STORE_NAME = "keys";
const PRIMARY_KEY = "primary";

let openPromise = null;

function ensureIndexedDb() {
  if (typeof indexedDB === "undefined") {
    throw new Error("IndexedDB is not available in this environment");
  }
}

function openDatabase() {
  ensureIndexedDb();
  if (openPromise) {
    return openPromise;
  }

  openPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        try {
          db.close();
        } catch (_) {
          // ignore
        }
        openPromise = null;
      };
      resolve(db);
    };

    request.onerror = () => {
      openPromise = null;
      reject(request.error || new Error("Failed to open vault database"));
    };

    request.onblocked = () => {
      console.warn("bitvid vault database upgrade is blocked by another tab");
    };
  });

  return openPromise;
}

function runTransaction(mode, operation) {
  return openDatabase().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, mode);
        const store = tx.objectStore(STORE_NAME);

        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(tx.error || new Error("Vault transaction aborted"));
        tx.onerror = () => {
          // default error handler keeps the transaction alive until abort fires
        };

        try {
          operation(store, resolve, reject);
        } catch (error) {
          reject(error);
        }
      })
  );
}

export async function getNcryptsec() {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(PRIMARY_KEY);

    request.onsuccess = () => {
      const value = request.result;
      resolve(value && typeof value.ncryptsec === "string" ? value.ncryptsec : null);
    };

    request.onerror = () => {
      reject(request.error || new Error("Failed to read encrypted key"));
    };

    tx.onabort = () => {
      reject(tx.error || new Error("Vault read aborted"));
    };
  });
}

export async function getVaultMetadata() {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(PRIMARY_KEY);

    request.onsuccess = () => {
      const value = request.result;
      resolve(value && typeof value.meta === "object" ? value.meta : null);
    };

    request.onerror = () => {
      reject(request.error || new Error("Failed to read vault metadata"));
    };

    tx.onabort = () => {
      reject(tx.error || new Error("Vault read aborted"));
    };
  });
}

export function saveNcryptsec(ncryptsec, meta = null) {
  if (typeof ncryptsec !== "string" || !ncryptsec) {
    return Promise.reject(new Error("ncryptsec must be a non-empty string"));
  }
  return runTransaction("readwrite", (store, resolve, reject) => {
    const request = store.put(
      {
        ncryptsec,
        meta: meta || null,
        updatedAt: Date.now(),
      },
      PRIMARY_KEY
    );
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error || new Error("Failed to save encrypted key"));
  });
}

export function clearVault() {
  return runTransaction("readwrite", (store, resolve, reject) => {
    const request = store.delete(PRIMARY_KEY);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error || new Error("Failed to clear vault"));
  });
}
