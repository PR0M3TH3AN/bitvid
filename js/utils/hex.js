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

export function normalizeHexHash(value) {
  if (value === undefined || value === null) {
    return "";
  }
  const stringValue = typeof value === "string" ? value : String(value);
  const trimmed = stringValue.trim().toLowerCase();
  if (!trimmed) {
    return "";
  }
  return HEX64_REGEX.test(trimmed) ? trimmed : "";
}
