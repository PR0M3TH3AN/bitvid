const PROVIDER_ID = "nip07";
const PROVIDER_LABEL = "extension (nip-07)";
const PROVIDER_DESCRIPTION =
  "Authorize with a NIP-07 browser extension like Alby or nos2x.";
const PROVIDER_CAPABILITIES = Object.freeze([
  Object.freeze({
    id: "signing",
    label: "Signs Nostr events",
    variant: "info",
  }),
  Object.freeze({
    id: "session",
    label: "Loads your public key",
    variant: "neutral",
  }),
]);
const PROVIDER_BUTTON = Object.freeze({
  variant: "primary",
});
const PROVIDER_MESSAGES = Object.freeze({
  loading: "Connecting to your extension…",
  slow: "Waiting for the extension prompt…",
  error: "Failed to login with your browser extension. Please try again.",
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

export default {
  id: PROVIDER_ID,
  label: PROVIDER_LABEL,
  description: PROVIDER_DESCRIPTION,
  eyebrow: "Recommended",
  tone: "accent",
  badgeVariant: "info",
  capabilities: PROVIDER_CAPABILITIES,
  button: PROVIDER_BUTTON,
  messages: PROVIDER_MESSAGES,
  errorMessage: PROVIDER_MESSAGES.error,
  async login({ nostrClient, options } = {}) {
    if (!nostrClient || typeof nostrClient.login !== "function") {
      const error = new Error("Nostr login is not available.");
      error.code = "provider-unavailable";
      throw error;
    }

    const result = await nostrClient.login(options || {});
    const pubkey = normalizePubkey(result);
    const signer =
      result && typeof result === "object" && result.signer
        ? result.signer
        : null;

    return {
      authType: PROVIDER_ID,
      pubkey,
      signer,
      rawResult: result,
    };
  },
};
