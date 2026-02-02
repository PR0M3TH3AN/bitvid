import { accessControl } from "../../accessControl.js";

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
    if (!nostrClient || typeof nostrClient.loginWithExtension !== "function") {
      const error = new Error("Extension login is not available in this environment.");
      error.code = "provider-unavailable";
      throw error;
    }

    const validator = (pubkey) => {
      if (!accessControl.canAccess(pubkey)) {
        if (accessControl.isBlacklisted(pubkey)) {
          throw new Error("Your account has been blocked on this platform.");
        }
        throw new Error("Access restricted to admins and moderators users only.");
      }
      return true;
    };

    const result = await nostrClient.loginWithExtension({ ...options, validator });
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
