export function normalizeHexString(value) {
  if (typeof value !== "string") {
    return "";
  }

  const trimmed = value.trim();
  return trimmed ? trimmed.toLowerCase() : "";
}

export const normalizeHexId = normalizeHexString;
export const normalizeHexPubkey = normalizeHexString;

export function hexToBytes(hex) {
  if (typeof hex !== "string") {
    throw new TypeError("hexToBytes: expected string, got " + typeof hex);
  }
  const normalized = hex.trim();
  if (normalized.length % 2) throw new Error("hex string must have even length");
  const array = new Uint8Array(normalized.length / 2);
  for (let i = 0; i < array.length; i++) {
    const j = i * 2;
    const byte = parseInt(normalized.substring(j, j + 2), 16);
    if (Number.isNaN(byte) || byte < 0) {
      throw new Error("Invalid hex string");
    }
    array[i] = byte;
  }
  return array;
}
