// js/nostr/nip46Connector.js

import { isDevMode } from "../config.js";
import { HEX64_REGEX } from "../utils/hex.js";
import { devLogger, userLogger } from "../utils/logger.js";
import { ensureNostrTools, getCachedNostrTools } from "./toolkit.js";
import { signEventWithPrivateKey } from "./publishHelpers.js";
import { bytesToHex } from "../../vendor/crypto-helpers.bundle.min.js";
import {
  normalizeNostrPubkey,
  encodeHexToNpub,
  generateNip46Secret,
  sanitizeNip46Metadata,
  resolveNip46Relays,
  normalizeNip46EncryptionAlgorithm,
  parseNip46ConnectionString,
  attemptDecryptNip46HandshakePayload,
  readStoredNip46Session,
  writeStoredNip46Session,
  clearStoredNip46Session,
  decryptNip46Session,
  NIP46_RPC_KIND,
  NIP46_HANDSHAKE_TIMEOUT_MS,
  NIP46_AUTH_CHALLENGE_MAX_ATTEMPTS,
  Nip46RpcClient,
} from "./nip46Client.js";
import {
  summarizeHexForLog,
  summarizeSecretForLog,
  summarizeMetadataForLog,
  summarizeUrlForLog,
} from "./nip46LoggingUtils.js";

const DEFAULT_DEPS = {
  ensureNostrTools,
  getCachedNostrTools,
  signEventWithPrivateKey,
  bytesToHex,
  normalizeNostrPubkey,
  encodeHexToNpub,
  generateNip46Secret,
  sanitizeNip46Metadata,
  resolveNip46Relays,
  normalizeNip46EncryptionAlgorithm,
  parseNip46ConnectionString,
  attemptDecryptNip46HandshakePayload,
  readStoredNip46Session,
  writeStoredNip46Session,
  clearStoredNip46Session,
  decryptNip46Session,
  Nip46RpcClient,
  NIP46_RPC_KIND,
  NIP46_HANDSHAKE_TIMEOUT_MS,
  NIP46_AUTH_CHALLENGE_MAX_ATTEMPTS,
};

/**
 * Manages the connection lifecycle for NIP-46 Remote Signers.
 * Encapsulates handshake, connection establishment, and reconnection logic.
 */
export class Nip46Connector {
  /**
   * @param {import("./client.js").NostrClient} nostrClient
   * @param {object} [deps] - Optional dependencies for testing
   */
  constructor(nostrClient, deps = {}) {
    this.nostrClient = nostrClient;
    this.deps = { ...DEFAULT_DEPS, ...deps };
    this.pendingHandshakeCancel = null;
    this.pendingRemoteSignerRestore = null;
  }

  /**
   * Creates a new key pair for the NIP-46 client session.
   * If existing keys are provided, they are validated and returned.
   *
   * @param {string} [existingPrivateKey]
   * @param {string} [existingPublicKey]
   * @returns {Promise<{privateKey: string, publicKey: string}>}
   */
  async createKeyPair(existingPrivateKey = "", existingPublicKey = "") {
    let privateKey =
      typeof existingPrivateKey === "string" && existingPrivateKey.trim()
        ? existingPrivateKey.trim().toLowerCase()
        : "";

    if (privateKey && !HEX64_REGEX.test(privateKey)) {
      const error = new Error("Invalid remote signer private key.");
      error.code = "invalid-private-key";
      throw error;
    }

    if (!privateKey) {
      const tools = (await this.deps.ensureNostrTools()) || this.deps.getCachedNostrTools();
      if (!tools) {
        throw new Error("Unable to generate a remote signer key pair.");
      }

      let generated = null;
      if (typeof tools.generateSecretKey === "function") {
        generated = tools.generateSecretKey();
      }

      if (generated instanceof Uint8Array) {
        privateKey = this.deps.bytesToHex(generated);
      } else if (Array.isArray(generated)) {
        privateKey = this.deps.bytesToHex(Uint8Array.from(generated));
      } else if (typeof generated === "string") {
        privateKey = generated.trim().toLowerCase();
      }

      if (!privateKey || !HEX64_REGEX.test(privateKey)) {
        throw new Error("Generated remote signer key is invalid.");
      }

      privateKey = privateKey.toLowerCase();
    }

    let publicKey =
      typeof existingPublicKey === "string" && existingPublicKey.trim()
        ? existingPublicKey.trim().toLowerCase()
        : "";

    if (!publicKey) {
      const tools = (await this.deps.ensureNostrTools()) || this.deps.getCachedNostrTools();
      if (!tools || typeof tools.getPublicKey !== "function") {
        throw new Error("Public key derivation is unavailable for remote signing.");
      }
      publicKey = tools.getPublicKey(privateKey);
    }

    if (!publicKey || !HEX64_REGEX.test(publicKey)) {
      throw new Error("Derived remote signer public key is invalid.");
    }

    return { privateKey, publicKey: publicKey.toLowerCase() };
  }

  /**
   * Prepares the parameters for a NIP-46 handshake (generation of connection URI).
   *
   * @param {object} params
   * @param {object} [params.metadata]
   * @param {string[]} [params.relays]
   * @param {string} [params.secret]
   * @param {string} [params.permissions]
   * @returns {Promise<object>}
   */
  async prepareHandshake({ metadata, relays, secret, permissions } = {}) {
    const keyPair = await this.createKeyPair();
    const sanitizedMetadata = this.deps.sanitizeNip46Metadata(metadata);
    const requestedPermissions =
      typeof permissions === "string" && permissions.trim() ? permissions.trim() : "";

    const resolvedRelays = this.deps.resolveNip46Relays(relays, this.nostrClient.relays);
    const handshakeSecret =
      typeof secret === "string" && secret.trim() ? secret.trim() : this.deps.generateNip46Secret();

    devLogger.debug("[nostr] Preparing remote signer handshake", {
      clientPublicKey: summarizeHexForLog(keyPair.publicKey),
      relays: resolvedRelays,
      permissions: requestedPermissions || null,
      secret: summarizeSecretForLog(handshakeSecret),
      metadataKeys: summarizeMetadataForLog(sanitizedMetadata),
    });

    const params = [];
    for (const relay of resolvedRelays) {
      params.push(`relay=${encodeURIComponent(relay)}`);
    }
    if (handshakeSecret) {
      params.push(`secret=${encodeURIComponent(handshakeSecret)}`);
    }
    if (requestedPermissions) {
      params.push(`perms=${encodeURIComponent(requestedPermissions)}`);
    }
    for (const [key, value] of Object.entries(sanitizedMetadata)) {
      params.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
    }

    const query = params.length ? `?${params.join("&")}` : "";
    const uri = `nostrconnect://${keyPair.publicKey}${query}`;

    devLogger.debug("[nostr] Prepared nostrconnect URI", {
      uri,
      relayCount: resolvedRelays.length,
      metadataKeys: summarizeMetadataForLog(sanitizedMetadata),
    });

    return {
      type: "client",
      connectionString: uri,
      uri,
      clientPrivateKey: keyPair.privateKey,
      clientPublicKey: keyPair.publicKey,
      relays: resolvedRelays,
      secret: handshakeSecret,
      permissions: requestedPermissions,
      metadata: sanitizedMetadata,
    };
  }

  /**
   * Waits for a remote signer to acknowledge the handshake.
   *
   * @param {object} params
   * @returns {Promise<{remotePubkey: string, eventPubkey: string, response: object, algorithm: string}>}
   */
  async waitForHandshake({
    clientPrivateKey,
    clientPublicKey,
    relays,
    secret,
    onAuthUrl,
    onStatus,
    timeoutMs,
    expectedRemotePubkey,
  } = {}) {
    const normalizedClientPublicKey = this.deps.normalizeNostrPubkey(clientPublicKey);
    if (!normalizedClientPublicKey) {
      throw new Error("A client public key is required to await the remote signer handshake.");
    }

    if (!clientPrivateKey || typeof clientPrivateKey !== "string" || !HEX64_REGEX.test(clientPrivateKey)) {
      throw new Error("A client private key is required to await the remote signer handshake.");
    }

    const resolvedRelays = this.deps.resolveNip46Relays(relays, this.nostrClient.relays);
    if (!resolvedRelays.length) {
      throw new Error("No relays available to complete the remote signer handshake.");
    }

    devLogger.debug("[nostr] Waiting for remote signer handshake", {
      clientPubkey: summarizeHexForLog(normalizedClientPublicKey),
      relays: resolvedRelays,
      secret: summarizeSecretForLog(secret),
      timeoutMs: Number.isFinite(timeoutMs) ? timeoutMs : undefined,
      expectedRemotePubkey: summarizeHexForLog(expectedRemotePubkey || ""),
    });

    const pool = await this.nostrClient.ensurePool();
    const filters = [
      {
        kinds: [this.deps.NIP46_RPC_KIND],
        "#p": [normalizedClientPublicKey],
      },
    ];

    const waitTimeout = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : this.deps.NIP46_HANDSHAKE_TIMEOUT_MS;

    const coerceStructuredString = (value) => {
      if (typeof value === "string") {
        return value.trim();
      }
      if (Array.isArray(value)) {
        for (const entry of value) {
          const candidate = coerceStructuredString(entry);
          if (candidate) {
            return candidate;
          }
        }
        return "";
      }
      if (value && typeof value === "object") {
        const preferredKeys = [
          "secret",
          "message",
          "status",
          "reason",
          "detail",
          "description",
          "value",
          "result",
          "url",
        ];
        for (const key of preferredKeys) {
          if (Object.prototype.hasOwnProperty.call(value, key)) {
            const candidate = coerceStructuredString(value[key]);
            if (candidate) {
              return candidate;
            }
          }
        }
        for (const entry of Object.values(value)) {
          const candidate = coerceStructuredString(entry);
          if (candidate) {
            return candidate;
          }
        }
      }
      return "";
    };

    return new Promise((resolve, reject) => {
      let settled = false;
      const cleanup = () => {
        if (settled) {
          return;
        }
        settled = true;
        if (this.pendingHandshakeCancel === cancelHandshake) {
          this.pendingHandshakeCancel = null;
        }
        try {
          subscription?.unsub?.();
        } catch (error) {
          // ignore subscription cleanup failures
        }
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
      };

      const cancelHandshake = () => {
        cleanup();
        const error = new Error("Remote signer connection cancelled.");
        error.code = "login-cancelled";
        reject(error);
      };

      this.pendingHandshakeCancel = cancelHandshake;

      const timeoutId = setTimeout(() => {
        cleanup();
        const error = new Error("Timed out waiting for the remote signer to acknowledge the connection.");
        error.code = "nip46-handshake-timeout";
        devLogger.warn("[nostr] Handshake wait timed out", {
          clientPubkey: summarizeHexForLog(normalizedClientPublicKey),
          relays: resolvedRelays,
        });
        reject(error);
      }, waitTimeout);

      let subscription;
      try {
        subscription = pool.sub(resolvedRelays, filters);
        devLogger.debug("[nostr] Handshake subscription established", {
          relays: resolvedRelays,
          filters,
        });
      } catch (error) {
        cleanup();
        devLogger.warn("[nostr] Failed to subscribe for handshake responses", error);
        reject(error);
        return;
      }

      subscription.on("event", (event) => {
        if (settled) {
          return;
        }

        if (!event || event.kind !== this.deps.NIP46_RPC_KIND) {
          devLogger.debug("[nostr] Ignoring non-handshake event during wait", event);
          return;
        }

        const eventRemotePubkey = this.deps.normalizeNostrPubkey(event.pubkey);
        const candidateRemotePubkeys = [];
        if (expectedRemotePubkey) {
          candidateRemotePubkeys.push(expectedRemotePubkey);
        }
        if (eventRemotePubkey) {
          candidateRemotePubkeys.push(eventRemotePubkey);
        }

        devLogger.debug("[nostr] Processing handshake event", {
          eventId: typeof event.id === "string" ? event.id : "",
          eventPubkey: summarizeHexForLog(eventRemotePubkey || ""),
          candidateRemotePubkeys: candidateRemotePubkeys.map((key) =>
            summarizeHexForLog(key),
          ),
          contentLength: typeof event.content === "string" ? event.content.length : 0,
        });

        Promise.resolve()
          .then(() =>
            this.deps.attemptDecryptNip46HandshakePayload({
              clientPrivateKey,
              candidateRemotePubkeys,
              ciphertext: event.content,
            }),
          )
          .then((payloadResult) => {
            const plaintext = payloadResult?.plaintext ?? "";
            let parsed;
            try {
              parsed = JSON.parse(plaintext);
            } catch (error) {
              devLogger.warn("[nostr] Failed to parse remote signer handshake payload:", error);
              return;
            }

            devLogger.debug("[nostr] Handshake payload parsed", {
              remotePubkey: summarizeHexForLog(payloadResult?.remotePubkey || ""),
              eventPubkey: summarizeHexForLog(eventRemotePubkey || ""),
              algorithm: payloadResult?.algorithm || null,
              requestId: typeof parsed?.id === "string" ? parsed.id : "",
              hasResult: parsed?.result !== undefined,
              hasError: parsed?.error !== undefined,
            });

            const resultValue = coerceStructuredString(parsed?.result);
            const errorValue = coerceStructuredString(parsed?.error);

            if (resultValue === "auth_url" && errorValue) {
              const handshakeRemotePubkey = payloadResult?.remotePubkey || eventRemotePubkey || "";
              devLogger.debug("[nostr] Handshake provided auth_url challenge", {
                eventId: typeof parsed?.id === "string" ? parsed.id : "",
                remotePubkey: summarizeHexForLog(handshakeRemotePubkey),
                url: summarizeUrlForLog(errorValue),
              });
              if (typeof onAuthUrl === "function") {
                try {
                  onAuthUrl(errorValue, {
                    phase: "handshake",
                    remotePubkey: handshakeRemotePubkey,
                    requestId: typeof parsed?.id === "string" ? parsed.id : "",
                  });
                } catch (callbackError) {
                  devLogger.warn("[nostr] Handshake auth_url callback threw:", callbackError);
                }
              }
              return;
            }

            if (secret) {
              const normalizedResult = resultValue ? resultValue.toLowerCase() : "";
              if (resultValue !== secret && normalizedResult !== "ack") {
                return;
              }
            }

            if (!secret && resultValue) {
              const normalized = resultValue.toLowerCase();
              if (!["ack", "ok", "success"].includes(normalized)) {
                return;
              }
            }

            cleanup();

            if (typeof onStatus === "function") {
              try {
                onStatus({
                  phase: "handshake",
                  state: "acknowledged",
                  message: "Remote signer acknowledged the connect request.",
                  remotePubkey: payloadResult?.remotePubkey || eventRemotePubkey || "",
                });
              } catch (callbackError) {
                devLogger.warn("[nostr] Handshake status callback threw:", callbackError);
              }
            }

            resolve({
              remotePubkey: payloadResult?.remotePubkey || eventRemotePubkey || "",
              eventPubkey: eventRemotePubkey || "",
              response: parsed,
              algorithm: this.deps.normalizeNip46EncryptionAlgorithm(payloadResult?.algorithm),
            });

            devLogger.debug("[nostr] Handshake wait resolved", {
              remotePubkey: summarizeHexForLog(payloadResult?.remotePubkey || eventRemotePubkey || ""),
              eventPubkey: summarizeHexForLog(eventRemotePubkey || ""),
              result: resultValue || null,
              hasSecret: Boolean(secret),
            });
          })
          .catch((error) => {
            devLogger.warn("[nostr] Failed to decrypt remote signer handshake payload:", error);
          });
      });

      subscription.on("eose", () => {
        // no-op: handshake responses are push-based
      });
    });
  }

  /**
   * Establishes a NIP-46 connection.
   *
   * @param {object} params
   * @returns {Promise<{client: Nip46RpcClient, signer: object, userPubkey: string}>}
   */
  async connect({
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
    validator,
  } = {}) {
    const parsed = this.deps.parseNip46ConnectionString(connectionString);
    if (!parsed) {
      const error = new Error(
        "Unsupported NIP-46 URI. Provide a nostrconnect:// handshake or bunker:// pointer.",
      );
      error.code = "invalid-connection-string";
      throw error;
    }

    const baseMetadata = this.deps.sanitizeNip46Metadata(parsed.metadata);
    const overrideMetadata = this.deps.sanitizeNip46Metadata(providedMetadata);
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
        devLogger.warn("[nostr] Remote signer auth callback threw:", error);
      }
    };

    const mergedRelaysSource = parsed.relays.length ? parsed.relays : providedRelays;
    const relays = this.deps.resolveNip46Relays(mergedRelaysSource, this.nostrClient.relays);

    let secret = typeof providedSecret === "string" && providedSecret.trim() ? providedSecret.trim() : parsed.secret;
    let permissions =
      typeof providedPermissions === "string" && providedPermissions.trim()
        ? providedPermissions.trim()
        : parsed.permissions;

    let clientPrivateKey = "";
    let clientPublicKey = "";
    let remotePubkey = this.deps.normalizeNostrPubkey(parsed.remotePubkey);
    let handshakeAlgorithm = "";

    if (parsed.type === "client") {
      clientPrivateKey =
        typeof providedClientPrivateKey === "string" && providedClientPrivateKey.trim()
          ? providedClientPrivateKey.trim().toLowerCase()
          : "";

      if (!clientPrivateKey || !HEX64_REGEX.test(clientPrivateKey)) {
        const error = new Error(
          "Remote signer handshake requires the generated client private key.",
        );
        error.code = "missing-client-private-key";
        throw error;
      }

      clientPublicKey = this.deps.normalizeNostrPubkey(providedClientPublicKey) || parsed.clientPubkey;
      if (!clientPublicKey) {
        const tools = (await this.deps.ensureNostrTools()) || this.deps.getCachedNostrTools();
        if (!tools || typeof tools.getPublicKey !== "function") {
          throw new Error("Public key derivation is unavailable for the remote signer handshake.");
        }
        clientPublicKey = this.deps.normalizeNostrPubkey(tools.getPublicKey(clientPrivateKey));
      }

      if (!clientPublicKey || !HEX64_REGEX.test(clientPublicKey)) {
        const error = new Error("Invalid client public key for the remote signer handshake.");
        error.code = "invalid-client-public-key";
        throw error;
      }

      if (parsed.clientPubkey && this.deps.normalizeNostrPubkey(parsed.clientPubkey) !== clientPublicKey) {
        const error = new Error("Handshake public key mismatch detected.");
        error.code = "client-public-key-mismatch";
        throw error;
      }

      if (!secret) {
        secret = this.deps.generateNip46Secret();
      }

      handleStatus({
        phase: "handshake",
        state: "waiting",
        message: "Waiting for the signer to acknowledge the connection…",
        relays,
      });

      this.nostrClient.emitRemoteSignerChange({
        state: "connecting",
        relays,
        metadata,
        remotePubkey: parsed.remotePubkey || "",
        userPubkey: parsed.userPubkeyHint || "",
        message: "Waiting for the signer to acknowledge the connection.",
      });

      let handshakeResult;
      try {
        handshakeResult = await this.waitForHandshake({
          clientPrivateKey,
          clientPublicKey,
          relays,
          secret,
          onAuthUrl: (url, context) => handleAuthChallenge(url, context),
          onStatus: handleStatus,
          timeoutMs: handshakeTimeoutMs,
          expectedRemotePubkey: parsed.remotePubkey,
        });
        devLogger.debug("[nostr] Remote signer handshake completed", {
          remotePubkey: summarizeHexForLog(handshakeResult?.remotePubkey || parsed.remotePubkey || ""),
          algorithm: handshakeResult?.algorithm || null,
          relays,
          secret: summarizeSecretForLog(secret),
        });
      } catch (error) {
        this.nostrClient.emitRemoteSignerChange({
          state: "error",
          relays,
          metadata,
          message: error?.message || "Remote signer handshake failed.",
          error,
        });
        throw error;
      }

      remotePubkey = this.deps.normalizeNostrPubkey(handshakeResult?.remotePubkey);
      handshakeAlgorithm = this.deps.normalizeNip46EncryptionAlgorithm(
        handshakeResult?.algorithm,
      );
      if (!remotePubkey) {
        const error = new Error("Remote signer did not return a valid public key.");
        error.code = "missing-remote-pubkey";
        throw error;
      }
      devLogger.debug("[nostr] Remote signer handshake provided final pubkey", {
        remotePubkey: summarizeHexForLog(remotePubkey),
        algorithm: handshakeAlgorithm || null,
        clientPublicKey: summarizeHexForLog(clientPublicKey),
      });
    } else {
      const keyPair = await this.createKeyPair(
        providedClientPrivateKey,
        providedClientPublicKey,
      );
      clientPrivateKey = keyPair.privateKey;
      clientPublicKey = keyPair.publicKey;

      this.nostrClient.emitRemoteSignerChange({
        state: "connecting",
        remotePubkey,
        relays,
        metadata,
        userPubkey: parsed.userPubkeyHint || "",
      });
      devLogger.debug("[nostr] Using bunker URI for remote signer connect", {
        remotePubkey: summarizeHexForLog(remotePubkey || parsed.remotePubkey || ""),
        relays,
        metadataKeys: summarizeMetadataForLog(metadata),
      });
    }

    if (!remotePubkey) {
      remotePubkey = this.deps.normalizeNostrPubkey(parsed.remotePubkey);
    }

    if (!remotePubkey) {
      const error = new Error("Remote signer pubkey is required to establish the session.");
      error.code = "missing-remote-pubkey";
      throw error;
    }

    const client = new this.deps.Nip46RpcClient({
      nostrClient: this.nostrClient,
      clientPrivateKey,
      clientPublicKey,
      remotePubkey,
      relays,
      secret,
      permissions,
      metadata,
      encryption: handshakeAlgorithm,
      signEvent: (event, privateKey) => this.deps.signEventWithPrivateKey(event, privateKey),
    });

    devLogger.debug("[nostr] Remote signer RPC client created", {
      clientPublicKey: summarizeHexForLog(client.clientPublicKey),
      remotePubkey: summarizeHexForLog(remotePubkey),
      relays,
      permissions,
      secret: summarizeSecretForLog(secret),
      metadataKeys: summarizeMetadataForLog(metadata),
      handshakeAlgorithm,
    });

    try {
      await client.ensureSubscription();

      devLogger.debug("[nostr] Remote signer subscription ready", {
        remotePubkey: summarizeHexForLog(remotePubkey),
        relayCount: relays.length,
      });

      handleStatus({
        phase: "connect",
        state: "request",
        message: "Requesting approval from the remote signer…",
        remotePubkey,
      });

      let attempts = 0;
      // Attempt the connect RPC, handling auth challenges when provided.
      for (;;) {
        try {
          devLogger.debug("[nostr] Sending NIP-46 connect request", {
            remotePubkey: summarizeHexForLog(remotePubkey),
            attempt: attempts + 1,
            permissions: permissions || null,
          });
          await client.connect({ permissions });
          break;
        } catch (error) {
          devLogger.warn("[nostr] Connect RPC attempt failed", {
            remotePubkey: summarizeHexForLog(remotePubkey),
            attempt: attempts + 1,
            code: error?.code || null,
            message: error?.message || String(error),
          });
          if (error?.code === "auth-challenge" && error.authUrl) {
            attempts += 1;
            handleStatus({
              phase: "auth",
              state: "waiting",
              message: "Complete the authentication challenge in your signer…",
              remotePubkey,
              attempt: attempts,
            });
            await handleAuthChallenge(error.authUrl, {
              phase: "connect",
              remotePubkey,
              attempt: attempts,
            });

            if (attempts >= this.deps.NIP46_AUTH_CHALLENGE_MAX_ATTEMPTS) {
              throw error;
            }
            continue;
          }
          throw error;
        }
      }

      const userPubkey = await client.getUserPubkey();
      devLogger.debug("[nostr] Retrieved user pubkey from remote signer", {
        remotePubkey: summarizeHexForLog(remotePubkey),
        userPubkey: summarizeHexForLog(userPubkey),
      });

      if (typeof validator === "function") {
        try {
          const isValid = await validator(userPubkey);
          if (!isValid) {
            throw new Error("Access denied.");
          }
        } catch (validationError) {
          const message =
            validationError instanceof Error
              ? validationError.message
              : "Access denied.";
          const error = new Error(message);
          error.code = "access-denied";
          client.destroy(); // Cleanup client since we won't use it
          throw error;
        }
      }

      client.metadata = metadata;

      if (remember) {
        devLogger.debug("[nostr] Persisting remote signer session", {
          remotePubkey: summarizeHexForLog(remotePubkey),
          relays,
          encryption: client.encryptionAlgorithm || handshakeAlgorithm || "",
          permissions: permissions || null,
        });
        await this.deps.writeStoredNip46Session(
          {
            version: 1,
            clientPublicKey,
            remotePubkey,
            relays,
            encryption: client.encryptionAlgorithm || handshakeAlgorithm || "",
            permissions,
            metadata,
            userPubkey,
            lastConnectedAt: Date.now(),
            clientPrivateKey,
            secret,
          },
          passphrase,
        );
      } else {
        devLogger.debug(
          "[nostr] Clearing stored remote signer session per request",
        );
        this.deps.clearStoredNip46Session();
      }

      this.nostrClient.emitRemoteSignerChange({
        state: "connected",
        remotePubkey,
        userPubkey,
        relays,
        metadata,
      });

      handleStatus({
        phase: "connected",
        state: "ready",
        message: "Remote signer connected successfully.",
        remotePubkey,
        userPubkey,
      });

      devLogger.debug("[nostr] Remote signer connection established", {
        remotePubkey: summarizeHexForLog(remotePubkey),
        userPubkey: summarizeHexForLog(userPubkey),
        relays,
        permissions: permissions || null,
        secret: summarizeSecretForLog(secret),
      });

      return { pubkey: userPubkey, client };
    } catch (error) {
      devLogger.error("[nostr] Remote signer connection failed", {
        remotePubkey: summarizeHexForLog(remotePubkey),
        relays,
        permissions: permissions || null,
        secret: summarizeSecretForLog(secret),
        message: error?.message || String(error),
        code: error?.code || null,
      });
      client.destroy();
      if (!remember) {
        this.deps.clearStoredNip46Session();
      }
      this.nostrClient.emitRemoteSignerChange({
        state: "error",
        remotePubkey,
        relays,
        metadata,
        message: error?.message || "Remote signer connection failed.",
        error,
      });
      throw error;
    }
  }

  /**
   * Reconnects to a stored session.
   *
   * @param {object} [options]
   * @returns {Promise<{pubkey: string, client: Nip46RpcClient}>}
   */
  async reconnectStored(options = {}) {
    const normalizedOptions =
      options && typeof options === "object" ? options : {};
    const silent = normalizedOptions.silent === true;
    const forgetOnError = normalizedOptions.forgetOnError === true;
    const passphrase =
      typeof normalizedOptions.passphrase === "string"
        ? normalizedOptions.passphrase
        : null;
    const validator =
      typeof normalizedOptions.validator === "function"
        ? normalizedOptions.validator
        : null;

    let stored = this.deps.readStoredNip46Session();
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
        stored = await this.deps.decryptNip46Session(stored, passphrase);
      } catch (decryptError) {
        const error = new Error("Failed to decrypt stored session.");
        error.code = "decrypt-failed";
        error.cause = decryptError;
        throw error;
      }
    }

    const relays = this.deps.resolveNip46Relays(stored.relays, this.nostrClient.relays);

    devLogger.debug("[nostr] Reconnecting to stored remote signer", {
      remotePubkey: summarizeHexForLog(stored.remotePubkey || ""),
      relays,
      encryption: stored.encryption || "",
      permissions: stored.permissions || null,
      hasCredentials: Boolean(stored.clientPrivateKey && stored.secret),
    });

    this.nostrClient.emitRemoteSignerChange({
      state: "connecting",
      remotePubkey: stored.remotePubkey,
      relays,
      metadata: stored.metadata,
    });

    if (!stored.clientPrivateKey || !stored.secret) {
      const error = new Error(
        "Stored remote signer credentials are unavailable.",
      );
      error.code = "stored-session-missing-credentials";
      throw error;
    }

    const client = new this.deps.Nip46RpcClient({
      nostrClient: this.nostrClient,
      clientPrivateKey: stored.clientPrivateKey,
      clientPublicKey: stored.clientPublicKey,
      remotePubkey: stored.remotePubkey,
      relays,
      encryption: stored.encryption,
      secret: stored.secret,
      permissions: stored.permissions,
      metadata: stored.metadata,
      signEvent: (event, privateKey) => this.deps.signEventWithPrivateKey(event, privateKey),
    });

    try {
      await client.ensureSubscription();
      await client.connect({ permissions: stored.permissions });
      const userPubkey = await client.getUserPubkey();

      if (validator) {
        try {
          const isValid = await validator(userPubkey);
          if (!isValid) {
            throw new Error("Access denied.");
          }
        } catch (validationError) {
          const message =
            validationError instanceof Error
              ? validationError.message
              : "Access denied.";
          const error = new Error(message);
          error.code = "access-denied";
          client.destroy();
          throw error;
        }
      }

      client.metadata = stored.metadata;

      await this.deps.writeStoredNip46Session(
        {
          version: 1,
          clientPublicKey: stored.clientPublicKey,
          remotePubkey: stored.remotePubkey,
          relays: stored.relays,
          encryption: client.encryptionAlgorithm || stored.encryption || "",
          permissions: stored.permissions,
          metadata: stored.metadata,
          userPubkey,
          lastConnectedAt: Date.now(),
          clientPrivateKey: stored.clientPrivateKey,
          secret: stored.secret,
        },
        passphrase,
      );

      devLogger.debug("[nostr] Stored remote signer session refreshed", {
        remotePubkey: summarizeHexForLog(stored.remotePubkey || ""),
        userPubkey: summarizeHexForLog(userPubkey),
        encryption: client.encryptionAlgorithm || stored.encryption || "",
      });

      this.nostrClient.emitRemoteSignerChange({
        state: "connected",
        remotePubkey: stored.remotePubkey,
        userPubkey,
        relays,
        metadata: stored.metadata,
      });

      return { pubkey: userPubkey, client };
    } catch (error) {
      await client.destroy().catch(() => {});
      const fatalCodes = new Set([
        "nip46-secret-mismatch",
        "invalid-private-key",
        "invalid-connection-string",
      ]);
      const shouldForgetStored = forgetOnError || fatalCodes.has(error?.code);
      if (shouldForgetStored) {
        this.deps.clearStoredNip46Session();
        devLogger.warn("[nostr] Stored remote signer session cleared after failure", {
          remotePubkey: summarizeHexForLog(stored.remotePubkey || ""),
          error: error?.message || String(error),
          code: error?.code || null,
        });
      }

      const status = {
        state: shouldForgetStored ? "idle" : silent ? "stored" : "error",
        remotePubkey: stored.remotePubkey,
        relays,
        metadata: stored.metadata,
      };

      if (!silent || shouldForgetStored) {
        status.message =
          error?.message || "Failed to reconnect to the remote signer.";
      }
      status.error = error;

      this.nostrClient.emitRemoteSignerChange(status);

      if (silent) {
        devLogger.log("[nostr] Silent remote signer restore failed:", error);
      } else {
        devLogger.warn(
          "[nostr] Stored remote signer reconnection failed:",
          error,
        );
      }
      throw error;
    }
  }

  async abort() {
    if (this.pendingHandshakeCancel) {
      try {
        this.pendingHandshakeCancel();
      } catch (error) {
        devLogger.warn("[nostr] Failed to cancel pending handshake:", error);
      }
      this.pendingHandshakeCancel = null;
    }
  }

  async disconnect({ keepStored = true } = {}) {
    await this.abort();

    if (!keepStored) {
      this.deps.clearStoredNip46Session();
    }
  }
}
