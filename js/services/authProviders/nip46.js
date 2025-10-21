const PROVIDER_ID = "nip46";
const PROVIDER_LABEL = "Remote signer";
const PROVIDER_DESCRIPTION = "Connect to a NIP-46 compatible signer via Nostr Connect.";
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
    };
  }

  return {
    connectionString:
      typeof options.connectionString === "string" ? options.connectionString.trim() : "",
    remember: options.remember !== false,
    reuseStored: options.reuseStored === true,
  };
}

export default {
  id: PROVIDER_ID,
  label: PROVIDER_LABEL,
  description: PROVIDER_DESCRIPTION,
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
    } else {
      const uri = normalized.connectionString;
      if (!uri) {
        const error = new Error("A connection string is required to continue.");
        error.code = "connection-required";
        throw error;
      }

      result = await nostrClient.connectRemoteSigner({
        connectionString: uri,
        remember: normalized.remember,
      });
    }

    const pubkey = normalizePubkey(result);

    return {
      authType: PROVIDER_ID,
      pubkey,
      signer: result && typeof result === "object" ? result.signer || null : null,
    };
  },
};
