const PROVIDER_ID = "nip07";
const PROVIDER_LABEL = "NIP-07 browser extension";
const PROVIDER_BUTTON_CLASS =
  "w-full bg-blue-500 text-white px-4 py-2 rounded-md hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors";
const PROVIDER_BUTTON_LABEL = "Login with Extension (NIP-07)";
const PROVIDER_LOADING_LABEL = "Connecting to NIP-07 extension...";
const PROVIDER_SLOW_HINT = "Waiting for the extension prompt…";
const PROVIDER_ERROR_MESSAGE =
  "Failed to login with NIP-07. Please try again.";

async function login({ nostrClient, options } = {}) {
  if (!nostrClient || typeof nostrClient.login !== "function") {
    throw new Error("NIP-07 login is not available.");
  }

  const normalizedOptions =
    options && typeof options === "object" ? options : {};
  const result = await nostrClient.login(normalizedOptions);

  let pubkey = "";
  let signer = null;
  if (typeof result === "string") {
    pubkey = result;
  } else if (result && typeof result === "object") {
    if (typeof result.pubkey === "string") {
      pubkey = result.pubkey;
    } else if (typeof result.publicKey === "string") {
      pubkey = result.publicKey;
    }

    if (result.signer !== undefined) {
      signer = result.signer;
    }
  }

  return { authType: PROVIDER_ID, pubkey, signer };
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
