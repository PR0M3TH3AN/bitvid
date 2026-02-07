export const HEX64_REGEX = /^[0-9a-f]{64}$/i;

export function normalizeHexString(value) {
  if (typeof value !== "string") {
    return "";
  }

  const trimmed = value.trim();
  return trimmed ? trimmed.toLowerCase() : "";
}

export const normalizeHexId = normalizeHexString;
export const normalizeHexPubkey = normalizeHexString;
