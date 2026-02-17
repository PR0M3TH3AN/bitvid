import {
  isSessionActor,
  readStoredSessionActorEntry,
  decryptSessionPrivateKey,
  encryptSessionPrivateKey,
  persistSessionActor as persistSessionActorEntry,
  clearStoredSessionActor as clearStoredSessionActorEntry,
} from "../sessionActor.js";
import {
  waitForNip07Extension,
  NIP07_EXTENSION_WAIT_TIMEOUT_MS,
  requestEnablePermissions,
  normalizePermissionMethod,
  readStoredNip07Permissions,
  writeStoredNip07Permissions,
  clearStoredNip07Permissions,
  runNip07WithRetry,
  DEFAULT_NIP07_ENCRYPTION_METHODS,
  DEFAULT_NIP07_CORE_METHODS,
  DEFAULT_NIP07_PERMISSION_METHODS,
} from "../nip07Permissions.js";
import {
  setActiveSigner as setActiveSignerInRegistry,
  getActiveSigner as getActiveSignerFromRegistry,
  clearActiveSigner as clearActiveSignerInRegistry,
  logoutSigner as logoutSignerFromRegistry,
  resolveActiveSigner as resolveActiveSignerFromRegistry,
} from "../../nostrClientRegistry.js";

import {
  readStoredNip46Session,
  writeStoredNip46Session,
  clearStoredNip46Session,
  Nip46RpcClient,
  decryptNip46Session,
  parseNip46ConnectionString,
  sanitizeNip46Metadata,
  normalizeNip46EncryptionAlgorithm,
  resolveNip46Relays,
  encodeHexToNpub,
  generateNip46Secret,
} from "../nip46Client.js";

import {
  summarizeHexForLog,
  summarizeSecretForLog,
  summarizeMetadataForLog,
  summarizeUrlForLog,
} from "../nip46LoggingUtils.js";

import { devLogger, userLogger } from "../../utils/logger.js";
import { HEX64_REGEX } from "../../utils/hex.js";
import { createPrivateKeyCipherClosures } from "../signerHelpers.js";
import { queueSignEvent } from "../signRequestQueue.js";
import { signEventWithPrivateKey } from "../publishHelpers.js";
import { ensureNostrTools, getCachedNostrTools } from "../toolkit.js";

export function resolveSignerCapabilities(signer) {
  const fallback = {
    sign: false,
    nip44: false,
    nip04: false,
  };

  if (!signer || typeof signer !== "object") {
    return fallback;
  }

  const capabilities =
    signer.capabilities && typeof signer.capabilities === "object"
      ? signer.capabilities
      : {};

  return {
    sign:
      (typeof capabilities.sign === "boolean" && capabilities.sign) ||
      typeof signer.signEvent === "function",
    nip44:
      (typeof capabilities.nip44 === "boolean" && capabilities.nip44) ||
      typeof signer.nip44Encrypt === "function" ||
      typeof signer.nip44Decrypt === "function",
    nip04:
      (typeof capabilities.nip04 === "boolean" && capabilities.nip04) ||
      typeof signer.nip04Encrypt === "function" ||
      typeof signer.nip04Decrypt === "function",
  };
}

export function hydrateExtensionSignerCapabilities(signer) {
  if (!signer || typeof signer !== "object") {
    return;
  }

  const signerType = typeof signer.type === "string" ? signer.type : "";
  if (signerType !== "extension" && signerType !== "nip07") {
    return;
  }

  const extension =
    typeof window !== "undefined" && window && window.nostr ? window.nostr : null;
  if (!extension) {
    return;
  }

  if (typeof signer.signEvent !== "function" && extension.signEvent) {
    if (typeof extension.signEvent === "function") {
      signer.signEvent = extension.signEvent.bind(extension);
    }
  }

  if (!signer.nip04 && extension.nip04) {
    signer.nip04 = extension.nip04;
  }

  if (!signer.nip44 && extension.nip44) {
    signer.nip44 = extension.nip44;
  }
}

export function attachNipMethodAliases(signer) {
  if (!signer || typeof signer !== "object") {
    return;
  }

  const nip04 =
    signer && typeof signer.nip04 === "object" && signer.nip04 !== null
      ? signer.nip04
      : null;
  if (nip04) {
    const encrypt =
      typeof nip04.encrypt === "function" ? nip04.encrypt.bind(nip04) : null;
    const decrypt =
      typeof nip04.decrypt === "function" ? nip04.decrypt.bind(nip04) : null;

    if (encrypt && typeof signer.nip04Encrypt !== "function") {
      signer.nip04Encrypt = (targetPubkey, plaintext) =>
        encrypt(targetPubkey, plaintext);
    }

    if (decrypt && typeof signer.nip04Decrypt !== "function") {
      signer.nip04Decrypt = (actorPubkey, ciphertext) =>
        decrypt(actorPubkey, ciphertext);
    }
  }

  const nip44 =
    signer && typeof signer.nip44 === "object" && signer.nip44 !== null
      ? signer.nip44
      : null;
  if (nip44) {
    const v2 =
      typeof nip44.v2 === "object" && nip44.v2 !== null ? nip44.v2 : null;

    const encrypt = (() => {
      if (typeof signer.nip44Encrypt === "function") {
        return null;
      }
      if (typeof v2?.encrypt === "function") {
        return v2.encrypt.bind(v2);
      }
      if (typeof nip44.encrypt === "function") {
        return nip44.encrypt.bind(nip44);
      }
      return null;
    })();

    const decrypt = (() => {
      if (typeof signer.nip44Decrypt === "function") {
        return null;
      }
      if (typeof v2?.decrypt === "function") {
        return v2.decrypt.bind(v2);
      }
      if (typeof nip44.decrypt === "function") {
        return nip44.decrypt.bind(nip44);
      }
      return null;
    })();

    if (encrypt) {
      signer.nip44Encrypt = (targetPubkey, plaintext) =>
        encrypt(targetPubkey, plaintext);
    }

    if (decrypt) {
      signer.nip44Decrypt = (actorPubkey, ciphertext) =>
        decrypt(actorPubkey, ciphertext);
    }
  }
}

function resolveActiveSigner(pubkey) {
  const signer = resolveActiveSignerFromRegistry(pubkey);
  hydrateExtensionSignerCapabilities(signer);
  attachNipMethodAliases(signer);
  if (signer && typeof signer === "object") {
    const capsDescriptor = Object.getOwnPropertyDescriptor(
      signer,
      "capabilities",
    );
    const isGetter = capsDescriptor && typeof capsDescriptor.get === "function";

    if (!isGetter) {
      signer.capabilities = resolveSignerCapabilities(signer);
    }
  }
  return signer;
}

const PERMISSION_STATUS_AUTO_HIDE_MS = 12_000;
const ENCRYPTION_METHOD_PREFIXES = ["nip04.", "nip44."];

function hasEncryptionPermissionMethods(methods) {
  if (!Array.isArray(methods)) {
    return false;
  }
  return methods.some((method) =>
    ENCRYPTION_METHOD_PREFIXES.some((prefix) => method.startsWith(prefix)),
  );
}

function hasSigningPermissionMethods(methods) {
  if (!Array.isArray(methods)) {
    return false;
  }
  return methods.some(
    (method) => method === "sign_event" || method === "get_public_key",
  );
}

function resolvePermissionStatusMessage(methods, context) {
  const normalizedContext =
    typeof context === "string" ? context.trim().toLowerCase() : "";

  if (normalizedContext === "dm") {
    return "Approve the extension prompt to enable encrypted direct messages.";
  }
  if (normalizedContext === "lists") {
    return "Approve the extension prompt to access your encrypted lists.";
  }

  const includesEncryption = hasEncryptionPermissionMethods(methods);
  const includesSigning = hasSigningPermissionMethods(methods);

  if (includesEncryption && includesSigning) {
    return "Approve the extension prompt to enable signing and encrypted features (DMs, subscriptions, block lists).";
  }
  if (includesEncryption) {
    return "Approve the extension prompt to enable encrypted features like DMs and private lists.";
  }
  if (includesSigning) {
    return "Approve the extension prompt to enable signing.";
  }

  return "Approve the extension prompt to continue.";
}

export class SignerManager {
  constructor(client) {
    this.client = client;
    this.pubkey = null;
    this.sessionActor = null;
    this.lockedSessionActor = null;
    this.nip46Client = null;
    this.extensionReady = false;
    this.extensionPermissionsGranted = false;
    this.extensionPermissionCache = new Map();
    const storedPermissions = readStoredNip07Permissions();
    if (storedPermissions && storedPermissions.size > 0) {
        for (const method of storedPermissions) {
            this.extensionPermissionCache.set(method, true);
        }
    }
    this.sessionActorCipherClosures = null;
    this.sessionActorCipherClosuresPrivateKey = null;
    this.remoteSignerListeners = new Set();
    this.remoteSignerStatus = {};
  }

  setActiveSigner(signer) {
    if (!signer || typeof signer !== "object") {
      return;
    }

    hydrateExtensionSignerCapabilities(signer);
    attachNipMethodAliases(signer);

    const capsDescriptor = Object.getOwnPropertyDescriptor(signer, "capabilities");
    const isGetter = capsDescriptor && typeof capsDescriptor.get === "function";

    if (!isGetter) {
      signer.capabilities = resolveSignerCapabilities(signer);
    }

    setActiveSignerInRegistry(signer);
  }

  getActiveSigner() {
    const signer = getActiveSignerFromRegistry();
    hydrateExtensionSignerCapabilities(signer);
    attachNipMethodAliases(signer);
    if (signer && typeof signer === "object") {
        const capsDescriptor = Object.getOwnPropertyDescriptor(
        signer,
        "capabilities",
        );
        const isGetter = capsDescriptor && typeof capsDescriptor.get === "function";

        if (!isGetter) {
        signer.capabilities = resolveSignerCapabilities(signer);
        }
    }
    return signer;
  }

  resolveActiveSigner(pubkey) {
    return resolveActiveSigner(pubkey);
  }

  async ensureSessionActor(force = false) {
    if (!force) {
      if (this.sessionActor) {
        return this.sessionActor.pubkey;
      }
      if (this.lockedSessionActor) {
        return this.lockedSessionActor.pubkey;
      }
      const storedEntry = readStoredSessionActorEntry();
      if (storedEntry) {
        this.lockedSessionActor = storedEntry;
        this.sessionActor = storedEntry;
        return storedEntry.pubkey;
      }
    }

    const tools = await ensureNostrTools();
    if (!tools) {
      return null;
    }

    let secret;
    try {
      if (typeof tools.generateSecretKey === "function") {
        secret = tools.generateSecretKey();
      } else if (typeof window !== "undefined" && window.crypto) {
        secret = new Uint8Array(32);
        window.crypto.getRandomValues(secret);
      } else {
        return null;
      }
    } catch (error) {
      devLogger.warn("[nostr] Failed to generate session actor key:", error);
      return null;
    }

    const hexKey = Array.from(secret)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const pubkey = tools.getPublicKey(secret);

    const newActor = {
      pubkey,
      privateKey: hexKey,
      source: "session",
      createdAt: Date.now(),
    };

    this.sessionActor = newActor;
    return newActor.pubkey;
  }

  clearStoredSessionActor() {
    clearStoredSessionActorEntry();
    this.sessionActor = null;
    this.lockedSessionActor = null;
  }

  async ensureActiveSignerForPubkey(pubkey) {
    const normalizedPubkey =
      typeof pubkey === "string" && pubkey.trim()
        ? pubkey.trim().toLowerCase()
        : "";

    const existingSigner = this.resolveActiveSigner(normalizedPubkey);
    if (existingSigner && typeof existingSigner.signEvent === "function") {
      return existingSigner;
    }

    let extension =
      typeof window !== "undefined" && window && window.nostr ? window.nostr : null;

    if (!extension && this.extensionPermissionCache && this.extensionPermissionCache.size > 0) {
      try {
        await waitForNip07Extension(NIP07_EXTENSION_WAIT_TIMEOUT_MS);
        extension = window.nostr;
      } catch (error) {
        // Fall through to existing signer check
      }
    }

    const recheckedSigner = this.resolveActiveSigner(normalizedPubkey);
    if (recheckedSigner && typeof recheckedSigner.signEvent === "function") {
      return recheckedSigner;
    }

    if (!extension) {
      return existingSigner;
    }

    let extensionPubkey = normalizedPubkey;

    if (typeof extension.getPublicKey === "function") {
      try {
        const retrieved = await runNip07WithRetry(
          () => extension.getPublicKey(),
          { label: "extension.getPublicKey" },
        );
        if (typeof retrieved === "string" && retrieved.trim()) {
          extensionPubkey = retrieved.trim().toLowerCase();
        }
      } catch (error) {
        devLogger.warn(
          "[nostr] Failed to hydrate active signer from extension pubkey:",
          error,
        );
        return existingSigner;
      }
    }

    if (normalizedPubkey && extensionPubkey !== normalizedPubkey) {
      return existingSigner;
    }

    const raceWinner = this.resolveActiveSigner(extensionPubkey || normalizedPubkey);
    if (raceWinner && typeof raceWinner.signEvent === "function") {
      return raceWinner;
    }

    return null;
  }

  async ensureExtensionPermissions(
    requiredMethods = DEFAULT_NIP07_CORE_METHODS,
    { context = "general" } = {},
  ) {
    const methods = Array.isArray(requiredMethods)
      ? requiredMethods
      : [requiredMethods];

    if (!methods.length) {
      return { ok: true };
    }

    const cacheKey = methods.slice().sort().join(",");
    if (this.extensionPermissionCache.has(cacheKey)) {
      return { ok: true };
    }

    const cachedPermissions = readStoredNip07Permissions();
    const missing = methods.filter(
      (method) => !cachedPermissions.has(method),
    );

    if (missing.length === 0) {
      this.extensionPermissionsGranted = true;
      this.extensionPermissionCache.set(cacheKey, true);
      for (const method of methods) {
        this.extensionPermissionCache.set(method, true);
      }
      return { ok: true };
    }

    let extension = null;
    try {
      extension = await waitForNip07Extension();
    } catch (error) {
      return { ok: false, error: "extension-missing" };
    }

    if (!extension && typeof window !== "undefined") {
      extension = window.nostr;
    }

    const message = resolvePermissionStatusMessage(missing, context);

    try {
      const response = await requestEnablePermissions(extension, missing);
      if (response?.ok) {
        writeStoredNip07Permissions(missing);
        this.extensionPermissionsGranted = true;
        this.extensionPermissionCache.set(cacheKey, true);
        for (const method of missing) {
          this.extensionPermissionCache.set(method, true);
        }
        return { ok: true };
      }
      return { ok: false, error: "permission-denied" };
    } catch (error) {
      devLogger.warn("[nostr] Extension permission request failed:", error);
      return { ok: false, error: "request-failed" };
    }
  }

  async loginWithExtension(options = {}) {
    let extension = null;
    let attempts = 0;
    const maxAttempts = 3;

    if (this.extensionReady && typeof window !== "undefined") {
      extension = window.nostr || null;
      if (!extension) {
        this.extensionReady = false;
      }
    }

    if (!extension && typeof window !== "undefined" && window.nostr) {
      extension = window.nostr;
      this.extensionReady = true;
    } else {
      while (!extension && attempts < maxAttempts) {
        try {
          const timeout = attempts === 0 ? 1500 : 3000;
          await waitForNip07Extension(timeout);
          extension = window.nostr;
          this.extensionReady = Boolean(extension);
        } catch (waitError) {
          devLogger.log(
            `Timed out waiting for extension injection (attempt ${
              attempts + 1
            }/${maxAttempts}):`,
            waitError,
          );
        }

        if (extension) {
          break;
        }

        attempts++;
        if (attempts < maxAttempts) {
          devLogger.log("Retrying NIP-07 detection...");
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }
    }

    if (!extension) {
      devLogger.log("No Nostr extension found");
      throw new Error("Please install a Nostr extension (Alby, nos2x, etc.).");
    }

    const { allowAccountSelection = false, expectPubkey } =
      typeof options === "object" && options !== null ? options : {};
    const normalizedExpectedPubkey =
      typeof expectPubkey === "string" && expectPubkey.trim()
        ? expectPubkey.trim().toLowerCase()
        : null;

    if (typeof extension.getPublicKey !== "function") {
      throw new Error(
        "This NIP-07 extension is missing getPublicKey support. Please update the extension.",
      );
    }

    const permissionResult = await this.client.ensureExtensionPermissions(
      DEFAULT_NIP07_PERMISSION_METHODS,
      { context: "login", logMetrics: true, showStatus: false },
    );
    if (!permissionResult.ok) {
      const denialMessage =
        'The NIP-07 extension reported "permission denied". Please approve the prompt and try again.';
      const denialError = new Error(denialMessage);
      if (permissionResult.error) {
        denialError.cause = permissionResult.error;
      }
      throw denialError;
    }

    const pubkey = await extension.getPublicKey();
    if (!pubkey) {
      throw new Error("Extension did not return a public key.");
    }

    const normalized = pubkey.toLowerCase();
    if (normalizedExpectedPubkey && normalized !== normalizedExpectedPubkey) {
        throw new Error("Extension returned a different public key than expected.");
    }

    this.pubkey = normalized;
    const adapter = {
        type: "extension",
        pubkey: normalized,
        signEvent: typeof extension.signEvent === "function" ? extension.signEvent.bind(extension) : undefined,
        nip04: extension.nip04,
        nip44: extension.nip44,
    };

    this.setActiveSigner(adapter);
    return { pubkey: normalized, signer: adapter };
  }

  installNip46Client(nip46Client, { userPubkey } = {}) {
    if (!nip46Client) {
      return;
    }
    this.nip46Client = nip46Client;
    if (userPubkey) {
      this.pubkey = userPubkey;
      this.setActiveSigner(nip46Client);
    }
    this.emitRemoteSignerChange({
      state: "connected",
      userPubkey: userPubkey || this.pubkey,
      remotePubkey: nip46Client.remotePubkey,
    });
  }

  async connectRemoteSigner({
    connectionString,
    remember = true,
    clientPrivateKey: providedClientPrivateKey = "",
    clientPublicKey: providedClientPublicKey = "",
    relays: providedRelays = [],
    secret: providedSecret = "",
    permissions: providedPermissions = "",
    metadata: providedMetadata = {},
    onAuthUrl,
    onStatus,
    handshakeTimeoutMs,
    passphrase,
  } = {}) {
    const parsed = parseNip46ConnectionString(connectionString);
    if (!parsed) {
      const error = new Error(
        "Unsupported NIP-46 URI. Provide a nostrconnect:// handshake or bunker:// pointer.",
      );
      error.code = "invalid-connection-string";
      throw error;
    }

    const baseMetadata = sanitizeNip46Metadata(parsed.metadata);
    const overrideMetadata = sanitizeNip46Metadata(providedMetadata);
    const metadata = { ...baseMetadata, ...overrideMetadata };

    devLogger.debug("[nostr] Connecting to remote signer", {
      connectionType: parsed.type,
      parsedRemotePubkey: summarizeHexForLog(parsed.remotePubkey || ""),
      providedClientPublicKey: summarizeHexForLog(providedClientPublicKey),
      providedClientPrivateKey: summarizeSecretForLog(
        typeof providedClientPrivateKey === "string" ? providedClientPrivateKey : "",
      ),
      providedSecret: summarizeSecretForLog(providedSecret),
      providedPermissions: providedPermissions || null,
      handshakeTimeoutMs,
      parsedRelays: parsed.relays,
      overrideRelayCount: Array.isArray(providedRelays) ? providedRelays.length : 0,
      metadataKeys: summarizeMetadataForLog(metadata),
    });

    let clientPrivateKey = providedClientPrivateKey || "";
    if (!clientPrivateKey) {
      const tools = await ensureNostrTools();
      if (tools && typeof tools.generateSecretKey === 'function') {
        const secret = tools.generateSecretKey();
        // Convert to hex
        clientPrivateKey = Array.from(secret).map(b => b.toString(16).padStart(2, '0')).join('');
      } else if (typeof window !== 'undefined' && window.crypto) {
         const randomBytes = new Uint8Array(32);
         window.crypto.getRandomValues(randomBytes);
         clientPrivateKey = Array.from(randomBytes).map(b => b.toString(16).padStart(2, '0')).join('');
      } else {
        // Fallback for non-secure contexts (not ideal but functional for test/dev)
        clientPrivateKey = generateNip46Secret(64);
      }
    }

    const handleStatus = (status) => {
      if (typeof onStatus !== "function") {
        return;
      }
      try {
        onStatus(status);
      } catch (error) {
        devLogger.warn("[nostr] Remote signer status callback threw:", error);
      }
    };

    const handleAuthChallenge = async (url, context = {}) => {
      if (typeof onAuthUrl !== "function" || !url) {
        return;
      }
      try {
        devLogger.debug("[nostr] Remote signer auth challenge surfaced", {
          url: summarizeUrlForLog(url),
          context,
        });
        const result = onAuthUrl(url, context);
        if (result && typeof result.then === "function") {
          await result.catch((error) => {
            devLogger.warn("[nostr] Auth challenge callback promise rejected:", error);
          });
        }
      } catch (error) {
        devLogger.warn("[nostr] Auth challenge callback threw:", error);
      }
    };

    await this.client.ensurePool();

    this.nip46Client = new Nip46RpcClient({
        nostrClient: this.client,
        relays: resolveNip46Relays(parsed.relays, providedRelays),
        clientPrivateKey: clientPrivateKey,
        remotePubkey: parsed.remotePubkey,
        secret: providedSecret || parsed.secret,
        signEvent: signEventWithPrivateKey,
    });

    // Subscribe to events from the NIP46 client?
    // The previous code had onStatusChange in the constructor which Nip46RpcClient doesn't seem to support directly based on the read_file output of nip46Client.js.
    // However, Nip46RpcClient has no public event emitter interface shown in the file read.
    // We will just use it to connect.

    this.emitRemoteSignerChange({ state: "connecting" });

    try {
        const result = await this.nip46Client.connect({
            permissions: providedPermissions,
        });

        if (remember) {
            await writeStoredNip46Session(
                {
                  version: 1,
                  clientPrivateKey: this.nip46Client.clientPrivateKey,
                  clientPublicKey: this.nip46Client.clientPublicKey,
                  remotePubkey: this.nip46Client.remotePubkey,
                  relays: this.nip46Client.relays,
                  encryption: this.nip46Client.encryptionAlgorithm,
                  secret: this.nip46Client.secret,
                  permissions: this.nip46Client.permissions,
                  metadata: this.nip46Client.metadata,
                  userPubkey: this.nip46Client.userPubkey,
                  lastConnectedAt: Date.now(),
                },
                passphrase
            );
        }

        const userPubkey = await this.nip46Client.getUserPubkey();
        this.pubkey = userPubkey;

        this.setActiveSigner(this.nip46Client.getActiveSigner());
        this.emitRemoteSignerChange();
        return { ok: true, result, pubkey: userPubkey };
    } catch(err) {
        this.nip46Client = null;
        this.emitRemoteSignerChange({ state: "error", error: err });
        throw err;
    }
  }

  async useStoredRemoteSigner(options = {}) {
    const normalizedOptions =
      options && typeof options === "object" ? options : {};
    const silent = normalizedOptions.silent === true;
    const forgetOnError = normalizedOptions.forgetOnError === true;
    const passphrase =
      typeof normalizedOptions.passphrase === "string"
        ? normalizedOptions.passphrase
        : null;

    let stored = readStoredNip46Session();
    if (!stored) {
      const error = new Error(
        "No remote signer session is stored on this device.",
      );
      error.code = "no-stored-session";
      throw error;
    }

    if (stored.encryptedSecrets) {
      if (!passphrase) {
        const error = new Error("Passphrase required to unlock session.");
        error.code = "passphrase-required";
        throw error;
      }
      try {
        stored = await decryptNip46Session(stored, passphrase);
      } catch (decryptError) {
        const error = new Error("Failed to decrypt stored session.");
        error.code = "decrypt-failed";
        error.cause = decryptError;
        throw error;
      }
    }

    const relays = resolveNip46Relays(stored.relays, this.client.relays);

    devLogger.debug("[nostr] Reconnecting to stored remote signer", {
      remotePubkey: summarizeHexForLog(stored.remotePubkey || ""),
      relays,
      encryption: stored.encryption || "",
      permissions: stored.permissions || null,
      hasCredentials: Boolean(stored.clientPrivateKey && stored.secret),
    });

    this.emitRemoteSignerChange({
        state: "connecting",
        relays,
        remotePubkey: stored.remotePubkey,
    });

    await this.client.ensurePool();

    this.nip46Client = new Nip46RpcClient({
        nostrClient: this.client,
        relays,
        clientPrivateKey: stored.clientPrivateKey,
        remotePubkey: stored.remotePubkey,
        secret: stored.secret,
        encryption: stored.encryption,
        signEvent: signEventWithPrivateKey,
    });

    try {
        // Just verify we can ping or get pubkey
        await this.nip46Client.ensureSubscription();
        const pubkey = await this.nip46Client.getUserPubkey();
        this.pubkey = pubkey;

        this.setActiveSigner(this.nip46Client.getActiveSigner());
        this.emitRemoteSignerChange();
        return { ok: true, pubkey };
    } catch (err) {
        this.nip46Client = null;
        this.emitRemoteSignerChange({ state: "error", error: err });
        if (forgetOnError) {
            clearStoredNip46Session();
        }
        throw err;
    }
  }

  async scheduleStoredRemoteSignerRestore() {
    const stored = readStoredNip46Session();
    if (!stored) {
      return;
    }

    const decryptAndConnect = async () => {
      try {
        await this.useStoredRemoteSigner({ silent: true });
      } catch (err) {
        devLogger.warn("Failed to restore remote signer", err);
      }
    };

    decryptAndConnect();
  }

  async disconnectRemoteSigner({ keepStored = false } = {}) {
    if (this.nip46Client) {
      if (typeof this.nip46Client.destroy === 'function') {
          this.nip46Client.destroy();
      }
      this.nip46Client = null;
    }
    if (!keepStored) {
      clearStoredNip46Session();
    }
    this.emitRemoteSignerChange();
  }

  getStoredNip46Metadata() {
    const stored = readStoredNip46Session() || {};
    const userPubkey =
      typeof stored.userPubkey === "string" ? stored.userPubkey : "";
    return {
      hasSession: Boolean(stored.remotePubkey && stored.clientPrivateKey),
      remotePubkey: stored.remotePubkey || "",
      metadata: stored.metadata || {},
      relays: stored.relays || [],
      encryption: stored.encryption || "",
      userPubkey,
      userNpub: encodeHexToNpub(userPubkey),
    };
  }

  getRemoteSignerStatus() {
    return { ...this.remoteSignerStatus };
  }

  emitRemoteSignerChange(status = {}) {
    const stored = this.getStoredNip46Metadata();
    const nextState =
      typeof status.state === "string" && status.state.trim()
        ? status.state.trim()
        : this.nip46Client
        ? "connected"
        : stored.hasSession
        ? "stored"
        : "idle";

    const remotePubkey =
      (typeof status.remotePubkey === "string" && status.remotePubkey.trim()) ||
      this.nip46Client?.remotePubkey ||
      stored.remotePubkey ||
      "";
    const userPubkey =
      (typeof status.userPubkey === "string" && status.userPubkey.trim()) ||
      this.nip46Client?.userPubkey ||
      stored.userPubkey ||
      "";

    const metadataCandidate =
      status.metadata || this.nip46Client?.metadata || stored.metadata || {};
    const metadata =
      metadataCandidate && typeof metadataCandidate === "object"
        ? { ...metadataCandidate }
        : {};
    const relays = Array.isArray(status.relays)
      ? status.relays.slice()
      : (this.nip46Client?.relays || stored.relays || []).slice();
    const encryption =
      (typeof status.encryption === "string" && status.encryption.trim()
        ? normalizeNip46EncryptionAlgorithm(status.encryption)
        : "") || this.nip46Client?.encryptionAlgorithm || stored.encryption || "";

    const snapshot = {
      state: nextState,
      remotePubkey,
      userPubkey,
      relays,
      metadata,
      encryption,
      error: status.error || null,
    };

    this.remoteSignerStatus = snapshot;

    for (const listener of this.remoteSignerListeners) {
      try {
        listener(snapshot);
      } catch (error) {
        devLogger.warn("[nostr] Remote signer listener threw:", error);
      }
    }

    return snapshot;
  }

  onRemoteSignerChange(listener) {
    if (typeof listener !== "function") {
      return () => {};
    }

    this.remoteSignerListeners.add(listener);
    return () => {
      this.remoteSignerListeners.delete(listener);
    };
  }

  logout() {
    const previousPubkey = this.pubkey;
    this.pubkey = null;
    logoutSignerFromRegistry(previousPubkey);
    const previousSessionActor = this.sessionActor;
    this.sessionActor = null;
    this.sessionActorCipherClosures = null;
    this.sessionActorCipherClosuresPrivateKey = null;

    if (this.nip46Client) {
      this.disconnectRemoteSigner({ keepStored: true });
    }

    const shouldClearStoredSession =
      previousSessionActor &&
      previousSessionActor.source === "nsec" &&
      previousSessionActor.persisted !== true;

    if (shouldClearStoredSession) {
      this.lockedSessionActor = null;
      this.clearStoredSessionActor();
    }

    if (
      this.extensionPermissionCache &&
      typeof this.extensionPermissionCache.clear === "function"
    ) {
      this.extensionPermissionCache.clear();
    }
    clearStoredNip07Permissions();
    this.extensionReady = false;
    this.extensionPermissionsGranted = false;
    this.emitRemoteSignerChange();
  }

  installNip46Client(rpcClient, { userPubkey } = {}) {
    this.nip46Client = rpcClient;
    if (userPubkey) {
      this.pubkey = userPubkey;
    }
    if (rpcClient && typeof rpcClient.getActiveSigner === "function") {
      const signer = rpcClient.getActiveSigner();
      if (signer) {
        this.setActiveSigner(signer);
      }
    }
    this.emitRemoteSignerChange();
  }

  async derivePrivateKeyFromSecret(secret) {
    if (!secret || typeof secret !== "string") {
      throw new Error("A private key or nsec string is required.");
    }

    const trimmed = secret.trim();
    const tools = (await ensureNostrTools()) || getCachedNostrTools();

    // Handle hex private key
    if (HEX64_REGEX.test(trimmed)) {
      const privateKeyHex = trimmed.toLowerCase();
      if (!tools || typeof tools.getPublicKey !== "function") {
        throw new Error("Nostr tools unavailable for key derivation.");
      }
      const pubkey = tools.getPublicKey(privateKeyHex);
      return { privateKey: privateKeyHex, pubkey };
    }

    // Handle nsec bech32 encoding
    if (trimmed.startsWith("nsec1")) {
      const nip19 = tools?.nip19;
      if (!nip19 || typeof nip19.decode !== "function") {
        throw new Error("Nostr tools unavailable for nsec decoding.");
      }
      const decoded = nip19.decode(trimmed);
      if (!decoded || decoded.type !== "nsec" || !decoded.data) {
        throw new Error("Invalid nsec key.");
      }
      const secretBytes = decoded.data;
      const privateKeyHex =
        typeof secretBytes === "string"
          ? secretBytes
          : Array.from(secretBytes)
              .map((b) => b.toString(16).padStart(2, "0"))
              .join("");
      if (!HEX64_REGEX.test(privateKeyHex)) {
        throw new Error("Decoded nsec key is invalid.");
      }
      const pubkey = tools.getPublicKey(privateKeyHex);
      return { privateKey: privateKeyHex, pubkey };
    }

    throw new Error("Unrecognized key format. Provide a hex private key or nsec string.");
  }

  async registerPrivateKeySigner({ privateKey, pubkey, persist, passphrase, validator } = {}) {
    if (!privateKey || typeof privateKey !== "string" || !HEX64_REGEX.test(privateKey)) {
      throw new Error("A valid hex private key is required.");
    }

    const normalizedPrivateKey = privateKey.toLowerCase();
    const normalizedPubkey =
      typeof pubkey === "string" && pubkey.trim()
        ? pubkey.trim().toLowerCase()
        : null;

    if (!normalizedPubkey || !HEX64_REGEX.test(normalizedPubkey)) {
      throw new Error("A valid hex public key is required.");
    }

    if (typeof validator === "function") {
      validator(normalizedPubkey);
    }

    const cipherClosures = await createPrivateKeyCipherClosures(normalizedPrivateKey);

    const adapter = {
      type: "nsec",
      pubkey: normalizedPubkey,
      signEvent: (event) => signEventWithPrivateKey(event, normalizedPrivateKey),
      ...cipherClosures,
    };

    this.setActiveSigner(adapter);
    this.pubkey = normalizedPubkey;

    if (persist && passphrase) {
      try {
        const encrypted = await encryptSessionPrivateKey(normalizedPrivateKey, passphrase);
        persistSessionActorEntry({
          pubkey: normalizedPubkey,
          encrypted,
          source: "nsec",
          persisted: true,
        });
        this.sessionActor = { pubkey: normalizedPubkey, source: "nsec", persisted: true };
      } catch (error) {
        devLogger.warn("[nostr] Failed to persist private key signer:", error);
      }
    }

    return normalizedPubkey;
  }
}
