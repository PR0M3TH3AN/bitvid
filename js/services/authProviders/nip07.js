import { isDevMode } from "../../config.js";
import { accessControl } from "../../accessControl.js";
import {
  DEFAULT_NIP07_PERMISSION_METHODS,
  getEnableVariantTimeoutMs,
  NIP07_LOGIN_TIMEOUT_MS,
  runNip07WithRetry,
} from "../../nip07Support.js";

const PROVIDER_ID = "nip07";
const PROVIDER_LABEL = "NIP-07 browser extension";
const PROVIDER_BUTTON_CLASS =
  "w-full bg-blue-500 text-white px-4 py-2 rounded-md hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors";
const PROVIDER_BUTTON_LABEL = "Login with Extension (NIP-07)";
const PROVIDER_LOADING_LABEL = "Connecting to NIP-07 extension...";
const PROVIDER_SLOW_HINT = "Waiting for the extension prompt…";
const PROVIDER_ERROR_MESSAGE =
  "Failed to login with NIP-07. Please try again.";

async function resolveNip19Tools(nostrClient) {
  if (nostrClient && typeof nostrClient.ensureNostrTools === "function") {
    return nostrClient.ensureNostrTools();
  }
  return null;
}

async function login({ nostrClient, options } = {}) {
  if (!nostrClient || typeof nostrClient !== "object") {
    throw new Error("NIP-07 login is not available.");
  }

  const extension = typeof window !== "undefined" ? window.nostr : null;
  if (!extension) {
    throw new Error("Please install a NIP-07 compatible extension.");
  }

  if (typeof extension.getPublicKey !== "function") {
    throw new Error(
      "This NIP-07 extension is missing getPublicKey support. Please update the extension.",
    );
  }

  const normalizedOptions =
    options && typeof options === "object" ? { ...options } : {};
  const allowAccountSelection = normalizedOptions.allowAccountSelection === true;
  const expectPubkey =
    typeof normalizedOptions.expectPubkey === "string"
      ? normalizedOptions.expectPubkey.trim()
      : "";
  const normalizedExpectedPubkey = expectPubkey
    ? expectPubkey.toLowerCase()
    : null;

  if (typeof extension.enable === "function") {
    const requestedPermissionMethods = Array.from(
      DEFAULT_NIP07_PERMISSION_METHODS,
    );

    const permissionVariants = [null];
    const objectPermissions = requestedPermissionMethods
      .map((method) =>
        typeof method === "string" && method.trim()
          ? { method: method.trim() }
          : null,
      )
      .filter(Boolean);
    if (objectPermissions.length) {
      permissionVariants.push({ permissions: objectPermissions });
    }
    const stringPermissions = Array.from(
      new Set(objectPermissions.map((entry) => entry.method)),
    );
    if (stringPermissions.length) {
      permissionVariants.push({ permissions: stringPermissions });
    }

    let enableError = null;
    for (const variant of permissionVariants) {
      try {
        await runNip07WithRetry(
          () => (variant ? extension.enable(variant) : extension.enable()),
          {
            label: "extension.enable",
            ...(variant
              ? {
                  timeoutMs: Math.min(
                    NIP07_LOGIN_TIMEOUT_MS,
                    getEnableVariantTimeoutMs(),
                  ),
                  retryMultiplier: 1,
                }
              : { retryMultiplier: 1 }),
          },
        );
        enableError = null;
        break;
      } catch (error) {
        enableError = error;
        if (variant && isDevMode) {
          console.warn(
            "[auth:nip07] extension.enable request with explicit permissions failed:",
            error,
          );
        }
      }
    }

    if (enableError) {
      throw new Error(
        enableError && enableError.message
          ? enableError.message
          : "The NIP-07 extension denied the permission request.",
      );
    }

    if (typeof nostrClient.markExtensionPermissions === "function") {
      try {
        nostrClient.markExtensionPermissions(requestedPermissionMethods);
      } catch (error) {
        if (isDevMode) {
          console.warn(
            "[auth:nip07] Failed to mark extension permissions:",
            error,
          );
        }
      }
    }
  }

  if (allowAccountSelection && typeof extension.selectAccounts === "function") {
    try {
      const selection = await runNip07WithRetry(
        () => extension.selectAccounts(expectPubkey ? [expectPubkey] : undefined),
        { label: "extension.selectAccounts" },
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
      "The NIP-07 extension did not return a public key. Please try again.",
    );
  }

  if (normalizedExpectedPubkey && pubkey.toLowerCase() !== normalizedExpectedPubkey) {
    throw new Error(
      "The selected account doesn't match the expected profile. Please try again.",
    );
  }

  const nip19Tools = await resolveNip19Tools(nostrClient);
  const npubEncode = nip19Tools?.nip19?.npubEncode;
  const npub = typeof npubEncode === "function" ? npubEncode(pubkey) : null;

  if (isDevMode) {
    console.log("[auth:nip07] Got pubkey:", pubkey);
    if (npub) {
      console.log("[auth:nip07] Converted to npub:", npub);
    }
    console.log("[auth:nip07] Whitelist:", accessControl.getWhitelist());
    console.log("[auth:nip07] Blacklist:", accessControl.getBlacklist());
  }

  if (npub && !accessControl.canAccess(npub)) {
    if (accessControl.isBlacklisted(npub)) {
      throw new Error("Your account has been blocked on this platform.");
    }
    throw new Error("Access restricted to whitelisted users only.");
  }

  if (typeof nostrClient.markExtensionPermissions === "function") {
    try {
      nostrClient.markExtensionPermissions(DEFAULT_NIP07_PERMISSION_METHODS);
    } catch (error) {
      if (isDevMode) {
        console.warn(
          "[auth:nip07] Failed to memoize default permission set:",
          error,
        );
      }
    }
  }

  const signerPayload = (() => {
    const signEvent =
      typeof extension.signEvent === "function"
        ? extension.signEvent.bind(extension)
        : null;
    const encrypt =
      extension.nip04 && typeof extension.nip04.encrypt === "function"
        ? extension.nip04.encrypt.bind(extension.nip04)
        : null;
    const decrypt =
      extension.nip04 && typeof extension.nip04.decrypt === "function"
        ? extension.nip04.decrypt.bind(extension.nip04)
        : null;

    if (!signEvent && !encrypt && !decrypt) {
      return null;
    }

    return {
      providerId: PROVIDER_ID,
      pubkey,
      signEvent,
      encrypt,
      decrypt,
      metadata: { label: PROVIDER_LABEL },
    };
  })();

  if (signerPayload && typeof nostrClient.setActiveSigner === "function") {
    try {
      nostrClient.setActiveSigner(signerPayload);
    } catch (error) {
      if (isDevMode) {
        console.warn("[auth:nip07] Failed to set active signer:", error);
      }
    }
  } else if (typeof nostrClient.clearActiveSigner === "function") {
    try {
      nostrClient.clearActiveSigner(PROVIDER_ID);
    } catch (error) {
      if (isDevMode) {
        console.warn(
          "[auth:nip07] Failed to clear active signer after login:",
          error,
        );
      }
    }
  }

  if (typeof nostrClient.pubkey === "string" || nostrClient.pubkey === null) {
    nostrClient.pubkey = pubkey;
  }

  const signerResult = signerPayload
    ? {
        providerId: PROVIDER_ID,
        signEvent: signerPayload.signEvent,
        encrypt: signerPayload.encrypt,
        decrypt: signerPayload.decrypt,
      }
    : null;

  return { authType: PROVIDER_ID, pubkey, signer: signerResult };
}

export default Object.freeze({
  id: PROVIDER_ID,
  label: PROVIDER_LABEL,
  login,
  ui: Object.freeze({
    buttonClass: PROVIDER_BUTTON_CLASS,
    buttonLabel: PROVIDER_BUTTON_LABEL,
    loadingLabel: PROVIDER_LOADING_LABEL,
    slowHint: PROVIDER_SLOW_HINT,
    errorMessage: PROVIDER_ERROR_MESSAGE,
  }),
});
