import { devLogger, userLogger } from "../utils/logger.js";

const DB_NAME = "bitvidDm";
const DB_VERSION = 2;

const STORES = Object.freeze({
  CONVERSATIONS: "conversations",
  MESSAGES: "messages",
  CONTACTS: "contacts",
  RELAYS: "relays",
  SEEN_CACHE: "seen_cache",
});

const MIGRATIONS = [
  {
    version: 1,
    migrate: (db) => {
      if (!db.objectStoreNames.contains(STORES.CONVERSATIONS)) {
        const store = db.createObjectStore(STORES.CONVERSATIONS, {
          keyPath: "conversation_id",
        });
        store.createIndex("created_at", "created_at", { unique: false });
        store.createIndex("unseen_count", "unseen_count", { unique: false });
      }

      if (!db.objectStoreNames.contains(STORES.MESSAGES)) {
        const store = db.createObjectStore(STORES.MESSAGES, { keyPath: "id" });
        store.createIndex("conversation_id", "conversation_id", {
          unique: false,
        });
        store.createIndex("created_at", "created_at", { unique: false });
        store.createIndex("sender_pubkey", "sender_pubkey", {
          unique: false,
        });
        store.createIndex("conversation_created_at", [
          "conversation_id",
          "created_at",
        ]);
      }

      if (!db.objectStoreNames.contains(STORES.CONTACTS)) {
        db.createObjectStore(STORES.CONTACTS, { keyPath: "pubkey" });
      }

      if (!db.objectStoreNames.contains(STORES.RELAYS)) {
        db.createObjectStore(STORES.RELAYS, { keyPath: "url" });
      }

      if (!db.objectStoreNames.contains(STORES.SEEN_CACHE)) {
        const store = db.createObjectStore(STORES.SEEN_CACHE, {
          keyPath: "id",
        });
        store.createIndex("conversation_id", "conversation_id", {
          unique: false,
        });
        store.createIndex("created_at", "created_at", { unique: false });
      }
    },
  },
  {
    version: 2,
    migrate: (db, transaction) => {
      if (!db.objectStoreNames.contains(STORES.CONVERSATIONS)) {
        return;
      }

      // If transaction is provided (during upgrade), use it.
      // Otherwise create a new one (but this path is questionable during upgrade).
      const store = transaction
        ? transaction.objectStore(STORES.CONVERSATIONS)
        : db.createObjectStore(STORES.CONVERSATIONS, { keyPath: "conversation_id" });
        // Fallback: If store doesn't exist and no transaction provided (unlikely in upgrade), create it?
        // Actually, if transaction is missing in migration, we are in trouble.
        // But for safe-guarding against "store not found":
      if (!store.indexNames.contains("opened_until")) {
        store.createIndex("opened_until", "opened_until", { unique: false });
      }
      if (!store.indexNames.contains("downloaded_until")) {
        store.createIndex("downloaded_until", "downloaded_until", {
          unique: false,
        });
      }
    },
  },
];

function isIndexedDbAvailable() {
  try {
    return typeof indexedDB !== "undefined";
  } catch (error) {
    return false;
  }
}

function applyMigrations(db, oldVersion, newVersion, transaction) {
  for (const migration of MIGRATIONS) {
    if (migration.version > oldVersion && migration.version <= newVersion) {
      migration.migrate(db, transaction);
    }
  }
}

function openDmDb() {
  return new Promise((resolve, reject) => {
    if (!isIndexedDbAvailable()) {
      resolve(null);
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = request.result;
      const oldVersion = event.oldVersion ?? 0;
      const newVersion = event.newVersion ?? DB_VERSION;
      const upgradeTransaction =
        request.transaction || event.target?.transaction || null;
      applyMigrations(db, oldVersion, newVersion, upgradeTransaction);
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error || new Error("Failed to open DM database."));
  });
}

function sanitizeTimestamp(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return 0;
  }
  return Math.floor(numeric);
}

function normalizePubkey(pubkey) {
  if (typeof pubkey !== "string") {
    return "";
  }
  return pubkey.trim().toLowerCase();
}

function normalizeMessage(raw) {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const id = typeof raw.id === "string" ? raw.id.trim() : "";
  const conversationId =
    typeof raw.conversation_id === "string"
      ? raw.conversation_id.trim()
      : typeof raw.conversationId === "string"
        ? raw.conversationId.trim()
        : "";
  const senderPubkey = normalizePubkey(
    raw.sender_pubkey ?? raw.senderPubkey ?? raw.pubkey,
  );

  if (!id || !conversationId || !senderPubkey) {
    return null;
  }

  const receiverPubkey = normalizePubkey(
    raw.receiver_pubkey ?? raw.receiverPubkey ?? raw.to_pubkey,
  );
  const statusRaw = typeof raw.status === "string" ? raw.status.trim() : "";
  const status =
    statusRaw === "pending" || statusRaw === "published" || statusRaw === "failed"
      ? statusRaw
      : "";
  const seen = raw.seen === true;
  const encryptionScheme =
    typeof raw.encryption_scheme === "string"
      ? raw.encryption_scheme.trim()
      : typeof raw.encryptionScheme === "string"
        ? raw.encryptionScheme.trim()
        : typeof raw.scheme === "string"
          ? raw.scheme.trim()
          : "";

  return {
    id,
    conversation_id: conversationId,
    sender_pubkey: senderPubkey,
    receiver_pubkey: receiverPubkey,
    created_at: sanitizeTimestamp(raw.created_at ?? raw.createdAt),
    kind: Number.isFinite(Number(raw.kind)) ? Number(raw.kind) : 0,
    content: typeof raw.content === "string" ? raw.content : "",
    tags: Array.isArray(raw.tags) ? raw.tags : [],
    relay: typeof raw.relay === "string" ? raw.relay : "",
    status,
    seen,
    encryption_scheme: encryptionScheme,
  };
}

function normalizeConversation(raw) {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const conversationId =
    typeof raw.conversation_id === "string"
      ? raw.conversation_id.trim()
      : typeof raw.conversationId === "string"
        ? raw.conversationId.trim()
        : "";

  if (!conversationId) {
    return null;
  }

  return {
    conversation_id: conversationId,
    created_at: sanitizeTimestamp(raw.created_at ?? raw.createdAt),
    last_message_at: sanitizeTimestamp(
      raw.last_message_at ?? raw.lastMessageAt,
    ),
    downloaded_until: sanitizeTimestamp(
      raw.downloaded_until ?? raw.downloadedUntil,
    ),
    opened_until: sanitizeTimestamp(raw.opened_until ?? raw.openedUntil),
    last_message_preview:
      typeof raw.last_message_preview === "string"
        ? raw.last_message_preview
        : typeof raw.lastMessagePreview === "string"
          ? raw.lastMessagePreview
          : "",
    unseen_count: Number.isFinite(Number(raw.unseen_count))
      ? Number(raw.unseen_count)
      : Number.isFinite(Number(raw.unseenCount))
        ? Number(raw.unseenCount)
        : 0,
    participants: Array.isArray(raw.participants) ? raw.participants : [],
  };
}

function runRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function finalizeTransaction(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("Transaction aborted"));
  });
}

export async function writeConversationMetadata(conversation) {
  const normalized = normalizeConversation(conversation);
  if (!normalized) {
    return null;
  }

  try {
    const db = await openDmDb();
    if (!db) {
      return null;
    }

    const tx = db.transaction(STORES.CONVERSATIONS, "readwrite");
    tx.objectStore(STORES.CONVERSATIONS).put(normalized);
    await finalizeTransaction(tx);
    db.close();
    return normalized;
  } catch (error) {
    userLogger.warn("[dmDb] Failed to write conversation metadata", error);
    return null;
  }
}

export async function writeMessages(messages) {
  const list = Array.isArray(messages) ? messages : [messages];
  const normalized = list
    .map((message) => normalizeMessage(message))
    .filter(Boolean);

  if (normalized.length === 0) {
    return [];
  }

  try {
    const db = await openDmDb();
    if (!db) {
      return [];
    }

    const tx = db.transaction(STORES.MESSAGES, "readwrite");
    const store = tx.objectStore(STORES.MESSAGES);

    for (const message of normalized) {
      store.put(message);
    }

    await finalizeTransaction(tx);
    db.close();
    return normalized;
  } catch (error) {
    userLogger.warn("[dmDb] Failed to persist messages", error);
    return [];
  }
}

export async function getConversation(conversationId) {
  if (typeof conversationId !== "string" || !conversationId.trim()) {
    return null;
  }

  try {
    const db = await openDmDb();
    if (!db) {
      return null;
    }

    const tx = db.transaction(STORES.CONVERSATIONS, "readonly");
    const store = tx.objectStore(STORES.CONVERSATIONS);
    const result = await runRequest(store.get(conversationId.trim()));
    await finalizeTransaction(tx);
    db.close();
    return result || null;
  } catch (error) {
    userLogger.warn("[dmDb] Failed to read conversation metadata", error);
    return null;
  }
}

export async function listMessagesByConversation(conversationId, options = {}) {
  if (typeof conversationId !== "string" || !conversationId.trim()) {
    return [];
  }

  const limit =
    Number.isFinite(Number(options.limit)) && Number(options.limit) > 0
      ? Number(options.limit)
      : 50;
  const direction = options.direction === "asc" ? "next" : "prev";

  try {
    const db = await openDmDb();
    if (!db) {
      return [];
    }

    const tx = db.transaction(STORES.MESSAGES, "readonly");
    const store = tx.objectStore(STORES.MESSAGES);
    const index = store.index("conversation_created_at");
    const range = IDBKeyRange.bound(
      [conversationId.trim(), 0],
      [conversationId.trim(), Number.MAX_SAFE_INTEGER],
    );

    const results = [];
    const request = index.openCursor(range, direction);

    return await new Promise((resolve) => {
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor || results.length >= limit) {
          resolve(results);
          return;
        }
        results.push(cursor.value);
        cursor.continue();
      };
      request.onerror = () => {
        userLogger.warn("[dmDb] Failed to list messages", request.error);
        resolve(results);
      };
    }).finally(() => db.close());
  } catch (error) {
    userLogger.warn("[dmDb] Failed to list messages", error);
    return [];
  }
}

export async function updateConversationFromMessage(message, options = {}) {
  const normalized = normalizeMessage(message);
  if (!normalized) {
    return null;
  }

  const preview =
    typeof options.preview === "string" && options.preview.trim()
      ? options.preview.trim()
      : normalized.content.slice(0, 160);
  const unseenDelta =
    Number.isFinite(Number(options.unseenDelta))
      ? Number(options.unseenDelta)
      : 0;
  const downloadedUntil = sanitizeTimestamp(
    options.downloadedUntil ?? normalized.created_at,
  );
  const openedUntil = sanitizeTimestamp(options.openedUntil);

  try {
    const db = await openDmDb();
    if (!db) {
      return null;
    }

    const tx = db.transaction(STORES.CONVERSATIONS, "readwrite");
    const store = tx.objectStore(STORES.CONVERSATIONS);
    const existing = (await runRequest(
      store.get(normalized.conversation_id),
    )) || {
      conversation_id: normalized.conversation_id,
      created_at: normalized.created_at,
      unseen_count: 0,
    };

    const next = {
      ...existing,
      created_at: existing.created_at || normalized.created_at,
      last_message_at: normalized.created_at,
      downloaded_until: Math.max(
        existing.downloaded_until || 0,
        downloadedUntil,
      ),
      opened_until: Math.max(existing.opened_until || 0, openedUntil),
      last_message_preview: preview,
      unseen_count: Math.max(
        0,
        Number(existing.unseen_count || 0) + unseenDelta,
      ),
    };

    store.put(next);
    await finalizeTransaction(tx);
    db.close();
    return next;
  } catch (error) {
    userLogger.warn("[dmDb] Failed to update conversation metadata", error);
    return null;
  }
}

export async function updateConversationOpenState(
  conversationId,
  { openedUntil, unseenCount } = {},
) {
  if (typeof conversationId !== "string" || !conversationId.trim()) {
    return null;
  }

  const normalizedId = conversationId.trim();
  const nextOpenedUntil = sanitizeTimestamp(openedUntil);
  const nextUnseenCount = Number.isFinite(Number(unseenCount))
    ? Math.max(0, Number(unseenCount))
    : null;

  try {
    const db = await openDmDb();
    if (!db) {
      return null;
    }

    const tx = db.transaction(STORES.CONVERSATIONS, "readwrite");
    const store = tx.objectStore(STORES.CONVERSATIONS);
    const existing =
      (await runRequest(store.get(normalizedId))) ||
      normalizeConversation({ conversation_id: normalizedId });

    if (!existing) {
      return null;
    }

    const next = {
      ...existing,
      opened_until: Math.max(existing.opened_until || 0, nextOpenedUntil),
      unseen_count:
        nextUnseenCount === null
          ? existing.unseen_count
          : nextUnseenCount,
    };

    store.put(next);
    await finalizeTransaction(tx);
    db.close();
    return next;
  } catch (error) {
    userLogger.warn("[dmDb] Failed to update conversation open state", error);
    return null;
  }
}

export async function listConversations() {
  try {
    const db = await openDmDb();
    if (!db) {
      return [];
    }

    const tx = db.transaction(STORES.CONVERSATIONS, "readonly");
    const store = tx.objectStore(STORES.CONVERSATIONS);
    const results = [];
    const request = store.openCursor();

    return await new Promise((resolve) => {
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) {
          resolve(results);
          return;
        }
        results.push(cursor.value);
        cursor.continue();
      };
      request.onerror = () => {
        userLogger.warn("[dmDb] Failed to list conversations", request.error);
        resolve(results);
      };
    }).finally(() => db.close());
  } catch (error) {
    userLogger.warn("[dmDb] Failed to list conversations", error);
    return [];
  }
}

export function describeDmDbSchema() {
  return {
    name: DB_NAME,
    version: DB_VERSION,
    stores: STORES,
    migrations: MIGRATIONS.map((migration) => migration.version),
  };
}

export async function clearDmDb() {
  try {
    const db = await openDmDb();
    if (!db) {
      return false;
    }

    const tx = db.transaction(
      [
        STORES.CONVERSATIONS,
        STORES.MESSAGES,
        STORES.CONTACTS,
        STORES.RELAYS,
        STORES.SEEN_CACHE,
      ],
      "readwrite",
    );

    for (const storeName of tx.objectStoreNames) {
      tx.objectStore(storeName).clear();
    }

    await finalizeTransaction(tx);
    db.close();
    return true;
  } catch (error) {
    devLogger.warn("[dmDb] Failed to clear DM database", error);
    return false;
  }
}

export const dmDbStores = STORES;
export const dmDbVersion = DB_VERSION;
