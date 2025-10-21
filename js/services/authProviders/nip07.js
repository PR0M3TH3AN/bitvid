const PROVIDER_ID = "nip07";
const PROVIDER_LABEL = "NIP-07 browser extension";

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
});
