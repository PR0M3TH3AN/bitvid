import { userLogger } from "../utils/logger.js";
import { bytesToHex } from "../../vendor/crypto-helpers.bundle.min.js";

const DB_NAME = "bitvid-storage";
const DB_VERSION = 1;
const STORE_ACCOUNTS = "accounts";

export const PROVIDERS = Object.freeze({
  R2: "cloudflare_r2",
  S3: "aws_s3",
  GENERIC: "generic_s3",
});

function hexToBytes(hex) {
  if (typeof hex !== "string") return new Uint8Array(0);
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

/**
 * Service to manage encrypted connection storage using IndexedDB.
 * Connections are encrypted with a random Master Key (AES-GCM),
 * which is itself encrypted using the user's Nostr signer (NIP-04).
 */
export class StorageService {
  constructor() {
    this.db = null;
    this.dbPromise = null;
    // Cache decrypted master keys in memory: Map<pubkey, CryptoKey>
    this.masterKeys = new Map();
  }

  /**
   * Initializes the IndexedDB connection.
   * @returns {Promise<IDBDatabase>}
   */
  async init() {
    if (this.db) return this.db;
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve, reject) => {
      if (typeof indexedDB === "undefined") {
        reject(new Error("IndexedDB is not supported in this environment."));
        return;
      }

      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_ACCOUNTS)) {
          // keyPath is pubkey (hex string)
          db.createObjectStore(STORE_ACCOUNTS, { keyPath: "pubkey" });
        }
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;
        resolve(this.db);
      };

      request.onerror = (event) => {
        userLogger.error("[StorageService] Failed to open DB:", event.target.error);
        reject(event.target.error);
      };
    });

    return this.dbPromise;
  }

  /**
   * Helper to execute a transaction.
   * @private
   */
  async _transaction(mode, callback) {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_ACCOUNTS, mode);
      const store = tx.objectStore(STORE_ACCOUNTS);
      const request = callback(store);

      tx.oncomplete = () => resolve(request.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(new Error("Transaction aborted"));
    });
  }

  /**
   * Fetches the account record for a pubkey.
   * @private
   */
  async _getAccount(pubkey) {
    return this._transaction("readonly", (store) => store.get(pubkey));
  }

  /**
   * Saves the account record.
   * @private
   */
  async _saveAccount(data) {
    return this._transaction("readwrite", (store) => store.put(data));
  }

  /**
   * Generates a new random AES-GCM key for the session/account.
   * @private
   * @returns {Promise<CryptoKey>}
   */
  async _generateMasterKey() {
    return crypto.subtle.generateKey(
      {
        name: "AES-GCM",
        length: 256,
      },
      true, // extractable
      ["encrypt", "decrypt"]
    );
  }

  /**
   * Encrypts the Master Key using the user's signer (NIP-04/44).
   * @private
   */
  async _encryptMasterKey(masterKey, signer, pubkey) {
    // 1. Export key to raw bytes
    const rawBuffer = await crypto.subtle.exportKey("raw", masterKey);
    const rawBytes = new Uint8Array(rawBuffer);
    const hexKey = bytesToHex(rawBytes);

    // 2. Encrypt hex key with signer (encrypt to self)
    // We prefer NIP-44 if available, else NIP-04
    if (typeof signer.nip44Encrypt === "function") {
      try {
        const ciphertext = await signer.nip44Encrypt(pubkey, hexKey);
        return { method: "nip44", ciphertext };
      } catch (err) {
        userLogger.warn("[StorageService] NIP-44 encrypt failed, falling back to NIP-04", err);
      }
    }

    if (typeof signer.nip04Encrypt === "function") {
      const ciphertext = await signer.nip04Encrypt(pubkey, hexKey);
      return { method: "nip04", ciphertext };
    } else if (typeof signer.encrypt === "function") {
      // Legacy NIP-04 direct method on some signer objects
      const ciphertext = await signer.encrypt(pubkey, hexKey);
      return { method: "nip04", ciphertext };
    }

    throw new Error("Signer does not support encryption (NIP-04 or NIP-44).");
  }

  /**
   * Decrypts the Master Key using the user's signer.
   * @private
   */
  async _decryptMasterKey(encryptedData, signer, pubkey) {
    const { method, ciphertext } = encryptedData;
    let hexKey = null;

    if (method === "nip44" && typeof signer.nip44Decrypt === "function") {
      hexKey = await signer.nip44Decrypt(pubkey, ciphertext);
    } else if (method === "nip04" || !method) {
      // Default to NIP-04 if method not specified (legacy)
      if (typeof signer.nip04Decrypt === "function") {
        hexKey = await signer.nip04Decrypt(pubkey, ciphertext);
      } else if (typeof signer.decrypt === "function") {
        hexKey = await signer.decrypt(pubkey, ciphertext);
      }
    }

    if (!hexKey) {
      throw new Error(`Failed to decrypt master key using ${method || "nip04"}`);
    }

    const rawBytes = hexToBytes(hexKey);
    return crypto.subtle.importKey(
      "raw",
      rawBytes,
      "AES-GCM",
      true,
      ["encrypt", "decrypt"]
    );
  }

  /**
   * Encrypts a connection payload using the Master Key.
   * @private
   */
  async _encryptPayload(payload, masterKey) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(JSON.stringify(payload));

    const ciphertextBuffer = await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv: iv,
      },
      masterKey,
      encoded
    );

    return {
      cipher: bytesToHex(new Uint8Array(ciphertextBuffer)),
      iv: bytesToHex(iv),
    };
  }

  /**
   * Decrypts a connection payload using the Master Key.
   * @private
   */
  async _decryptPayload(encrypted, masterKey) {
    const { cipher, iv } = encrypted;
    const ciphertextBytes = hexToBytes(cipher);
    const ivBytes = hexToBytes(iv);

    const decryptedBuffer = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: ivBytes,
      },
      masterKey,
      ciphertextBytes
    );

    const decoded = new TextDecoder().decode(decryptedBuffer);
    return JSON.parse(decoded);
  }

  /**
   * Unlocks the storage for a given pubkey.
   * Retrieves or creates the Master Key.
   *
   * @param {string} pubkey - The user's pubkey (hex).
   * @param {object} options - { signer: Object }
   */
  async unlock(pubkey, { signer } = {}) {
    if (!pubkey) throw new Error("Pubkey required to unlock storage.");
    if (!signer) throw new Error("Signer required to unlock storage.");

    if (this.masterKeys.has(pubkey)) {
      return; // Already unlocked
    }

    const account = await this._getAccount(pubkey);
    let masterKey;

    if (account && account.encryptedMasterKey) {
      // Decrypt existing key
      masterKey = await this._decryptMasterKey(account.encryptedMasterKey, signer, pubkey);
    } else {
      // Create new key
      masterKey = await this._generateMasterKey();
      const encryptedMasterKey = await this._encryptMasterKey(masterKey, signer, pubkey);

      // Save new account record
      await this._saveAccount({
        pubkey,
        encryptedMasterKey,
        connections: account?.connections || {}, // Preserve if existed but key was missing (edge case)
      });
    }

    this.masterKeys.set(pubkey, masterKey);
    userLogger.log(`[StorageService] Unlocked storage for ${pubkey.slice(0, 8)}...`);
  }

  /**
   * Locks the storage (clears cached master key).
   */
  lock(pubkey) {
    if (this.masterKeys.has(pubkey)) {
      this.masterKeys.delete(pubkey);
      userLogger.log(`[StorageService] Locked storage for ${pubkey.slice(0, 8)}...`);
    }
  }

  /**
   * Saves a connection configuration.
   * Requires unlock() to be called first.
   *
   * @param {string} pubkey
   * @param {string} connectionId
   * @param {object} payload - Secrets and config (e.g. accessKey, secretKey)
   * @param {object} meta - Plaintext metadata (label, provider, etc.)
   */
  async saveConnection(pubkey, connectionId, payload, meta = {}) {
    if (!this.masterKeys.has(pubkey)) {
      throw new Error("Storage is locked. Call unlock() first.");
    }

    const masterKey = this.masterKeys.get(pubkey);
    const encrypted = await this._encryptPayload(payload, masterKey);
    const account = (await this._getAccount(pubkey)) || { pubkey, connections: {} };

    if (!account.connections) {
      account.connections = {};
    }

    account.connections[connectionId] = {
      id: connectionId,
      provider: payload.provider || meta.provider,
      meta: {
        ...meta,
        lastSaved: Date.now(),
        provider: payload.provider || meta.provider,
      },
      encrypted,
    };

    await this._saveAccount(account);
    userLogger.log(`[StorageService] Saved connection ${connectionId}`);
  }

  /**
   * Retrieves and decrypts a connection.
   * Requires unlock() to be called first.
   */
  async getConnection(pubkey, connectionId) {
    if (!this.masterKeys.has(pubkey)) {
      throw new Error("Storage is locked. Call unlock() first.");
    }

    const account = await this._getAccount(pubkey);
    const conn = account?.connections?.[connectionId];

    if (!conn) return null;

    const masterKey = this.masterKeys.get(pubkey);
    const payload = await this._decryptPayload(conn.encrypted, masterKey);

    return {
      ...payload,
      meta: conn.meta,
    };
  }

  /**
   * Lists connections (metadata only).
   * Does NOT require unlock().
   */
  async listConnections(pubkey) {
    const account = await this._getAccount(pubkey);
    if (!account || !account.connections) return [];

    return Object.values(account.connections).map((conn) => ({
      id: conn.id,
      provider: conn.provider,
      meta: conn.meta,
    }));
  }

  /**
   * Deletes a connection.
   */
  async deleteConnection(pubkey, connectionId) {
    const account = await this._getAccount(pubkey);
    if (account && account.connections && account.connections[connectionId]) {
      delete account.connections[connectionId];
      await this._saveAccount(account);
      userLogger.log(`[StorageService] Deleted connection ${connectionId}`);
    }
  }

  /**
   * Sets a connection as default for uploads (updates metadata).
   */
  async setDefaultConnection(pubkey, connectionId) {
    const account = await this._getAccount(pubkey);
    if (!account || !account.connections) return;

    // Reset others
    for (const key in account.connections) {
      const conn = account.connections[key];
      if (conn.meta) {
        conn.meta.defaultForUploads = (key === connectionId);
      }
    }

    await this._saveAccount(account);
  }
}

const storageService = new StorageService();
export default storageService;
