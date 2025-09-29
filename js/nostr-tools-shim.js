const tools = window?.NostrTools;

if (!tools) {
  console.error("NostrTools bundle failed to load – nostr features are unavailable.");
} else {
  const hasFinalize = typeof tools.finalizeEvent === "function";
  const hasGetEventHash = typeof tools.getEventHash === "function";
  const hasSignEvent = typeof tools.signEvent === "function";
  const hasGetPublicKey = typeof tools.getPublicKey === "function";

  if (!hasFinalize && hasGetEventHash && hasSignEvent && hasGetPublicKey) {
    const hexToBytes = (hex) => {
      if (typeof hex !== "string") {
        throw new TypeError("Secret key must be a 32-byte hex string or Uint8Array");
      }
      const normalized = hex.trim().toLowerCase();
      if (normalized.length !== 64 || /[^0-9a-f]/.test(normalized)) {
        throw new TypeError("Secret key must be a 32-byte hex string or Uint8Array");
      }
      const bytes = new Uint8Array(32);
      for (let i = 0; i < 32; i += 1) {
        const byte = parseInt(normalized.slice(i * 2, i * 2 + 2), 16);
        if (Number.isNaN(byte)) {
          throw new TypeError("Secret key must be a 32-byte hex string or Uint8Array");
        }
        bytes[i] = byte;
      }
      return bytes;
    };

    const toBytes = (secretKey) => {
      if (secretKey instanceof Uint8Array) {
        if (secretKey.length !== 32) {
          throw new TypeError("Secret key must be 32 bytes long");
        }
        return secretKey;
      }
      return hexToBytes(secretKey);
    };

    const finalizeEvent = (eventTemplate, secretKey) => {
      if (!eventTemplate || typeof eventTemplate !== "object") {
        throw new TypeError("Event template must be an object");
      }
      const sk = toBytes(secretKey);
      const event = { ...eventTemplate, pubkey: tools.getPublicKey(sk) };
      event.id = tools.getEventHash(event);
      event.sig = tools.signEvent(event, sk);
      return event;
    };

    Object.defineProperty(tools, "finalizeEvent", {
      value: finalizeEvent,
      writable: false,
      configurable: true,
    });
  }
}
