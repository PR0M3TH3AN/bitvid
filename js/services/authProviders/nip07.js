import {
  waitForNip07Extension,
  runNip07WithRetry,
  requestEnablePermissions,
  DEFAULT_NIP07_PERMISSION_METHODS,
} from "../../nostr/nip07Permissions.js";
import { createNip07Adapter } from "../../nostr/adapters/nip07Adapter.js";
import { setActiveSigner } from "../../nostrClientRegistry.js";
import { ensureNostrTools } from "../../nostr/toolkit.js";
import { accessControl } from "../../accessControl.js";
import { devLogger, userLogger } from "../../utils/logger.js";

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

async function performNip07Login(options = {}, nostrClient = null) {
  let extension = null;
  let attempts = 0;
  const maxAttempts = 3;

  // Optimistic check: if window.nostr is already there, use it immediately.
  if (typeof window !== "undefined" && window.nostr) {
    extension = window.nostr;
  } else {
    while (!extension && attempts < maxAttempts) {
      try {
        // Fast wait for the first attempt, slightly longer for retries
        const timeout = attempts === 0 ? 1500 : 3000;
        await waitForNip07Extension(timeout);
        extension = window.nostr;
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
    throw new Error(
      "Please install a Nostr extension (Alby, nos2x, etc.)."
    );
  }

  const { allowAccountSelection = false, expectPubkey } =
    typeof options === "object" && options !== null ? options : {};
  const normalizedExpectedPubkey =
    typeof expectPubkey === "string" && expectPubkey.trim()
      ? expectPubkey.trim().toLowerCase()
      : null;

  if (typeof extension.getPublicKey !== "function") {
    throw new Error(
      "This NIP-07 extension is missing getPublicKey support. Please update the extension."
    );
  }

  // Use the client instance if available to ensure permission cache is updated
  if (nostrClient && typeof nostrClient.ensureExtensionPermissions === "function") {
    const permissionResult = await nostrClient.ensureExtensionPermissions(
      DEFAULT_NIP07_PERMISSION_METHODS,
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
  } else {
    const permissionResult = await requestEnablePermissions(
      extension,
      DEFAULT_NIP07_PERMISSION_METHODS,
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
  }

  if (allowAccountSelection && typeof extension.selectAccounts === "function") {
    try {
      const selection = await runNip07WithRetry(
        () => extension.selectAccounts(expectPubkey ? [expectPubkey] : undefined),
        { label: "extension.selectAccounts" }
      );

      const didCancelSelection =
        selection === undefined ||
        selection === null ||
        selection === false ||
        (Array.isArray(selection) && selection.length === 0);

      if (didCancelSelection) {
        throw new Error("Account selection was cancelled.");
      }
    } catch (selectionErr) {
      const message =
        selectionErr && typeof selectionErr.message === "string"
          ? selectionErr.message
          : "Account selection was cancelled.";
      throw new Error(message);
    }
  }

  const pubkey = await runNip07WithRetry(() => extension.getPublicKey(), {
    label: "extension.getPublicKey",
  });

  if (!pubkey || typeof pubkey !== "string") {
    throw new Error(
      "The NIP-07 extension did not return a public key. Please try again."
    );
  }

  if (
    normalizedExpectedPubkey &&
    pubkey.toLowerCase() !== normalizedExpectedPubkey
  ) {
    throw new Error(
      "The selected account doesn't match the expected profile. Please try again."
    );
  }

  const nip19Tools = await ensureNostrTools();
  const npubEncode = nip19Tools?.nip19?.npubEncode;
  if (typeof npubEncode !== "function") {
    throw new Error("NostrTools nip19 encoder is unavailable.");
  }
  const npub = npubEncode(pubkey);

  devLogger.log("Got pubkey:", pubkey);
  devLogger.log("Converted to npub:", npub);

  // Access control
  if (!accessControl.canAccess(npub)) {
    if (accessControl.isBlacklisted(npub)) {
      throw new Error("Your account has been blocked on this platform.");
    } else {
      throw new Error("Access restricted to admins and moderators users only.");
    }
  }

  const adapter = await createNip07Adapter(extension);
  adapter.pubkey = pubkey;
  setActiveSigner(adapter);

  // Ensure full permissions are requested post-login (e.g. encryption)
  // This is non-blocking to avoid stalling if the user already approved
  if (nostrClient && typeof nostrClient.ensureExtensionPermissions === "function") {
    nostrClient.ensureExtensionPermissions(DEFAULT_NIP07_PERMISSION_METHODS).catch((err) => {
      userLogger.warn(
        "[nostr] Extension permissions were not fully granted after login:",
        err
      );
    });
  } else {
    requestEnablePermissions(extension, DEFAULT_NIP07_PERMISSION_METHODS).catch((err) => {
      userLogger.warn(
        "[nostr] Extension permissions were not fully granted after login:",
        err
      );
    });
  }

  return { pubkey, signer: adapter };
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
    const result = await performNip07Login(options, nostrClient);
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
