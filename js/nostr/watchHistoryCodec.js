// js/nostr/watchHistoryCodec.js
//
// Pure, dependency-free encode/decode helpers extracted from watchHistory.js to
// keep that module under the file-size budget. No behavior change.

export function sanitizeWatchHistoryMetadata(metadata) {
  return {};
}

export function serializeWatchHistoryItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return "[]";
  }
  const normalized = items
    .map((item) => {
      const type = item?.type === "a" ? "a" : "e";
      const value = typeof item?.value === "string" ? item.value : "";
      if (!type || !value) {
        return null;
      }
      const relay =
        typeof item?.relay === "string" && item.relay.trim()
          ? item.relay.trim()
          : undefined;
      const watchedAt = Number.isFinite(item?.watchedAt)
        ? Math.max(0, Math.floor(item.watchedAt))
        : undefined;
      const payload = { type, value };
      if (relay) {
        payload.relay = relay;
      }
      if (watchedAt !== undefined) {
        payload.watchedAt = watchedAt;
      }
      const resumeAt = Number.isFinite(item?.resumeAt)
        ? Math.max(0, Math.floor(item.resumeAt))
        : undefined;
      if (resumeAt !== undefined) {
        payload.resumeAt = resumeAt;
      }
      if (item?.completed === true) {
        payload.completed = true;
      }
      return payload;
    })
    .filter(Boolean);
  return JSON.stringify(normalized);
}

export function bytesToHex(bytes) {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function looksLikeJsonStructure(content) {
  if (typeof content !== "string") {
    return false;
  }
  const trimmed = content.trim();
  if (!trimmed) {
    return false;
  }
  const first = trimmed[0];
  return first === "{" || first === "[";
}

export function hexToBytesCompat(hex, tools = null) {
  if (typeof hex !== "string") {
    throw new Error("Invalid hex input.");
  }
  const trimmed = hex.trim();
  if (!trimmed || trimmed.length % 2 !== 0) {
    throw new Error("Invalid hex input.");
  }
  if (tools?.utils && typeof tools.utils.hexToBytes === "function") {
    return tools.utils.hexToBytes(trimmed);
  }
  const bytes = new Uint8Array(trimmed.length / 2);
  for (let index = 0; index < trimmed.length; index += 2) {
    const byte = Number.parseInt(trimmed.slice(index, index + 2), 16);
    if (Number.isNaN(byte)) {
      throw new Error("Invalid hex input.");
    }
    bytes[index / 2] = byte;
  }
  return bytes;
}
