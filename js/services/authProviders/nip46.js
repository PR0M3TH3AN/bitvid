import { devLogger } from "../../utils/logger.js";

const PROVIDER_ID = "nip46";
const PROVIDER_LABEL = "remote signer (nip-46)";
const PROVIDER_DESCRIPTION =
  "Connect to a remote signer via Nostr Connect for hardware or mobile approvals.";
const PROVIDER_CAPABILITIES = Object.freeze([
  Object.freeze({
    id: "signing",
    label: "Signs events remotely",
    variant: "info",
  }),
  Object.freeze({
    id: "multi-device",
    label: "Works across browsers",
    variant: "neutral",
  }),
]);
const PROVIDER_BUTTON = Object.freeze({
  variant: "primary",
});
const PROVIDER_MESSAGES = Object.freeze({
  loading: "Connecting to remote signer…",
  slow: "Waiting for the signer to approve…",
  error: "Failed to connect to the remote signer. Please try again.",
});

function normalizePubkey(result) {
  if (typeof result === "string") {
    return result;
  }

  if (!result || typeof result !== "object") {
    return "";
  }

  if (typeof result.pubkey === "string") {
    return result.pubkey;
  }

  if (typeof result.publicKey === "string") {
    return result.publicKey;
  }

  return "";
}

function normalizeOptions(options) {
  if (!options || typeof options !== "object") {
    return {
      connectionString: "",
      remember: true,
      reuseStored: false,
      mode: "handshake",
      onHandshakePrepared: null,
      onStatus: null,
      onAuthUrl: null,
      metadata: {},
      secret: "",
      permissions: "",
      relays: [],
      handshakeTimeoutMs: undefined,
    };
  }

  return {
    connectionString:
      typeof options.connectionString === "string" ? options.connectionString.trim() : "",
    remember: options.remember !== false,
    reuseStored: options.reuseStored === true,
    mode: options.mode === "manual" ? "manual" : "handshake",
    onHandshakePrepared:
      typeof options.onHandshakePrepared === "function" ? options.onHandshakePrepared : null,
    onStatus: typeof options.onStatus === "function" ? options.onStatus : null,
    onAuthUrl: typeof options.onAuthUrl === "function" ? options.onAuthUrl : null,
    metadata: options.metadata && typeof options.metadata === "object" ? options.metadata : {},
    secret:
      typeof options.secret === "string" && options.secret.trim() ? options.secret.trim() : "",
    permissions:
      typeof options.permissions === "string" && options.permissions.trim()
        ? options.permissions.trim()
        : "",
    relays: Array.isArray(options.relays) ? options.relays : [],
    handshakeTimeoutMs: Number.isFinite(options.handshakeTimeoutMs)
      ? Number(options.handshakeTimeoutMs)
      : undefined,
  };
}

export default {
  id: PROVIDER_ID,
  label: PROVIDER_LABEL,
  description: PROVIDER_DESCRIPTION,
  eyebrow: "Nostr Connect",
  tone: "accent",
  badgeVariant: "info",
  capabilities: PROVIDER_CAPABILITIES,
  button: PROVIDER_BUTTON,
  messages: PROVIDER_MESSAGES,
  errorMessage: PROVIDER_MESSAGES.error,
  async login({ nostrClient, options } = {}) {
    if (!nostrClient || typeof nostrClient !== "object") {
      const error = new Error("Remote signer login is not available.");
      error.code = "provider-unavailable";
      throw error;
    }

    if (typeof nostrClient.connectRemoteSigner !== "function") {
      const error = new Error("Remote signer support is unavailable in this environment.");
      error.code = "provider-unavailable";
      throw error;
    }

    const normalized = normalizeOptions(options);
    let result = null;

    if (normalized.reuseStored) {
      if (typeof nostrClient.useStoredRemoteSigner !== "function") {
        const error = new Error("No stored remote signer is available on this device.");
        error.code = "no-stored-session";
        throw error;
      }

      result = await nostrClient.useStoredRemoteSigner();
    } else if (normalized.mode === "manual") {
      const uri = normalized.connectionString;
      if (!uri) {
        const error = new Error("A connection string is required to continue.");
        error.code = "connection-required";
        throw error;
      }

      result = await nostrClient.connectRemoteSigner({
        connectionString: uri,
        remember: normalized.remember,
        onAuthUrl: normalized.onAuthUrl,
        onStatus: normalized.onStatus,
      });
    } else {
      if (normalized.onStatus) {
        try {
          normalized.onStatus({
            phase: "handshake",
            state: "preparing",
            message: "Generating remote signer connect link…",
          });
        } catch (callbackError) {
          devLogger.warn("[nip46] Handshake status callback threw:", callbackError);
        }
      }

      const handshake = await nostrClient.prepareRemoteSignerHandshake({
        metadata: normalized.metadata,
        relays: normalized.relays,
        secret: normalized.secret,
        permissions: normalized.permissions,
      });

      if (normalized.onHandshakePrepared) {
        try {
          normalized.onHandshakePrepared(handshake);
        } catch (callbackError) {
          devLogger.warn("[nip46] Handshake prepared callback threw:", callbackError);
        }
      }

      result = await nostrClient.connectRemoteSigner({
        connectionString: handshake.connectionString,
        remember: normalized.remember,
        clientPrivateKey: handshake.clientPrivateKey,
        clientPublicKey: handshake.clientPublicKey,
        relays: handshake.relays,
        secret: handshake.secret,
        permissions: handshake.permissions,
        metadata: handshake.metadata,
        onAuthUrl: normalized.onAuthUrl,
        onStatus: normalized.onStatus,
        handshakeTimeoutMs: normalized.handshakeTimeoutMs,
      });

      if (result && typeof result === "object") {
        result.handshake = handshake;
      }
    }

    const pubkey = normalizePubkey(result);

    return {
      authType: PROVIDER_ID,
      pubkey,
      signer: result && typeof result === "object" ? result.signer || null : null,
    };
  },
};
