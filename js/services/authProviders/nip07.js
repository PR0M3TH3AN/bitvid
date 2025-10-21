const PROVIDER_ID = "nip07";

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
