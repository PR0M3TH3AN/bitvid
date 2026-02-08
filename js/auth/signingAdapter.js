export function createNip07SigningAdapter({ extension } = {}) {
  const resolvedExtension =
    extension ||
    (typeof window !== "undefined" && window?.nostr ? window.nostr : null);

  const getPubkey = async () => {
    if (!resolvedExtension) {
      throw new Error("NIP-07 extension unavailable.");
    }
    return resolvedExtension.getPublicKey();
  };

  const signEvent = async (event) => {
    if (!resolvedExtension) {
      throw new Error("NIP-07 extension unavailable.");
    }
    return resolvedExtension.signEvent(event);
  };

  return {
    getPubkey,
    signEvent,
  };
}
