const PROVIDER_ID = "nsec";
const PROVIDER_LABEL = "Direct key";
const PROVIDER_DESCRIPTION = "Import an nsec or mnemonic seed.";
const PROVIDER_CAPABILITIES = Object.freeze([
  Object.freeze({
    id: "signing",
    label: "Signs locally",
    variant: "warning",
  }),
  Object.freeze({
    id: "session",
    label: "Encrypted backup optional",
    variant: "neutral",
  }),
]);
const PROVIDER_BUTTON = Object.freeze({
  variant: "ghost",
});
const PROVIDER_MESSAGES = Object.freeze({
  loading: "Unlocking direct key…",
  slow: "Still deriving your key…",
  error: "Failed to unlock the direct key. Check your secret and try again.",
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
      secret: "",
      persist: false,
      passphrase: "",
      unlockStored: false,
    };
  }

  return {
    secret: typeof options.secret === "string" ? options.secret : "",
    persist: options.persist === true,
    passphrase: typeof options.passphrase === "string" ? options.passphrase : "",
    unlockStored: options.unlockStored === true,
  };
}

export default {
  id: PROVIDER_ID,
  label: PROVIDER_LABEL,
  description: PROVIDER_DESCRIPTION,
  badgeVariant: "warning",
  capabilities: PROVIDER_CAPABILITIES,
  button: PROVIDER_BUTTON,
  messages: PROVIDER_MESSAGES,
  errorMessage: PROVIDER_MESSAGES.error,
  async login({ nostrClient, options } = {}) {
    if (!nostrClient || typeof nostrClient !== "object") {
      const error = new Error("Direct key login is not available.");
      error.code = "provider-unavailable";
      throw error;
    }

    if (
      typeof nostrClient.derivePrivateKeyFromSecret !== "function" ||
      typeof nostrClient.registerPrivateKeySigner !== "function"
    ) {
      const error = new Error("Direct key login is not supported in this environment.");
      error.code = "provider-unavailable";
      throw error;
    }

    const normalized = normalizeOptions(options);

    if (normalized.unlockStored) {
      if (typeof nostrClient.unlockStoredSessionActor !== "function") {
        const error = new Error("Stored key unlock is not supported.");
        error.code = "unlock-unavailable";
        throw error;
      }

      const suppliedPassphrase = normalized.passphrase;
      if (typeof suppliedPassphrase !== "string" || !suppliedPassphrase.trim()) {
        const error = new Error("A passphrase is required to unlock the saved key.");
        error.code = "passphrase-required";
        throw error;
      }

      const unlockResult = await nostrClient.unlockStoredSessionActor(suppliedPassphrase);
      const unlockedPubkey = normalizePubkey(unlockResult);

      return {
        authType: PROVIDER_ID,
        pubkey: unlockedPubkey,
      };
    }

    const trimmedSecret = normalized.secret.trim();
    if (!trimmedSecret) {
      const error = new Error("A private key is required to continue.");
      error.code = "secret-required";
      throw error;
    }

    const { privateKey, pubkey } = await nostrClient.derivePrivateKeyFromSecret(trimmedSecret);

    const shouldPersist = normalized.persist === true;
    const passphrase = shouldPersist ? normalized.passphrase : "";

    if (shouldPersist && (!passphrase || !passphrase.trim())) {
      const error = new Error("A passphrase is required to remember this key.");
      error.code = "passphrase-required";
      throw error;
    }

    const registrationResult = await nostrClient.registerPrivateKeySigner({
      privateKey,
      pubkey,
      persist: shouldPersist,
      passphrase: shouldPersist ? passphrase : undefined,
    });

    const registeredPubkey = normalizePubkey(registrationResult) || pubkey;

    return {
      authType: PROVIDER_ID,
      pubkey: registeredPubkey,
    };
  },
};
