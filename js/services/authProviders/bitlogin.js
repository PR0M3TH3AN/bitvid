import { accessControl } from "../../accessControl.js";

const PROVIDER_ID = "bitlogin";
const PROVIDER_LABEL = "BitLogin";
const PROVIDER_DESCRIPTION =
  "A portable Nostr identity behind a familiar login name and password.";
const PROVIDER_CAPABILITIES = Object.freeze([
  Object.freeze({
    id: "signing",
    label: "Signs Nostr events",
    variant: "info",
  }),
  Object.freeze({
    id: "portable",
    label: "Works on every BitLogin site",
    variant: "neutral",
  }),
]);
const PROVIDER_BUTTON = Object.freeze({
  variant: "primary",
});
const PROVIDER_MESSAGES = Object.freeze({
  loading: "Signing in with BitLogin…",
  slow: "Still waiting on BitLogin…",
  error: "Failed to sign in with BitLogin. Please try again.",
});

// Set by the widget's own "bitlogin-login" listener (js/ui/applicationBootstrap.js)
// right before it calls authService.requestLogin({ providerId: "bitlogin" }): by
// the time that reaches this provider's login(), the widget has already run its
// own multi-screen sign-in/create/recover flow and produced a pubkey + signer.
// This provider exists so that result goes through the exact same session-
// establishment path (AuthService.login -> handleAuthLogin) as every other
// signer, without BitLogin also rendering as a redundant button in the login
// grid -- see providersForModal in ./index.js.
let pendingResult = null;

export function setPendingBitloginResult(result) {
  pendingResult = result && typeof result === "object" ? result : null;
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
  async login({ nostrClient } = {}) {
    const result = pendingResult;
    pendingResult = null;

    if (!result || typeof result.pubkey !== "string" || !result.pubkey.trim()) {
      const error = new Error("BitLogin sign-in hasn't completed yet.");
      error.code = "provider-unavailable";
      throw error;
    }

    const pubkey = result.pubkey.trim();

    if (!accessControl.canAccess(pubkey)) {
      if (accessControl.isBlacklisted(pubkey)) {
        throw new Error("Your account has been blocked on this platform.");
      }
      throw new Error("Access restricted to admins and moderators users only.");
    }

    if (
      nostrClient?.signerManager &&
      typeof nostrClient.signerManager.setActiveSigner === "function"
    ) {
      nostrClient.signerManager.setActiveSigner(result.signer);
    }

    return {
      authType: PROVIDER_ID,
      pubkey,
      signer: result.signer,
    };
  },
};
