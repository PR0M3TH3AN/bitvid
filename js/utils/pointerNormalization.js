import { devLogger } from "./logger.js";
import { getCachedNostrTools } from "../nostr/toolkit.js";

export function pointerKey(pointer) {
  if (!pointer) {
    return "";
  }
  const type = pointer.type === "a" ? "a" : "e";
  const value = typeof pointer.value === "string" ? pointer.value.trim().toLowerCase() : "";
  if (!type || !value) {
    return "";
  }
  return `${type}:${value}`;
}

export function normalizePointerTag(tag) {
  if (!Array.isArray(tag) || tag.length < 2) {
    return null;
  }
  const type = tag[0] === "a" ? "a" : tag[0] === "e" ? "e" : "";
  if (!type) {
    return null;
  }
  const value = typeof tag[1] === "string" ? tag[1].trim() : "";
  if (!value) {
    return null;
  }
  const relay =
    tag.length > 2 && typeof tag[2] === "string" && tag[2].trim()
      ? tag[2].trim()
      : null;
  return { type, value, relay };
}

function clonePointerItem(pointer) {
  if (!pointer || typeof pointer !== "object") {
    return null;
  }

  const cloned = {
    type: pointer.type === "a" ? "a" : "e",
    value: typeof pointer.value === "string" ? pointer.value.trim() : "",
  };

  if (!cloned.value) {
    return null;
  }

  if (typeof pointer.relay === "string" && pointer.relay.trim()) {
    cloned.relay = pointer.relay.trim();
  }

  if (Number.isFinite(pointer.watchedAt)) {
    cloned.watchedAt = Math.max(0, Math.floor(pointer.watchedAt));
  }

  if (Number.isFinite(pointer.resumeAt)) {
    cloned.resumeAt = Math.max(0, Math.floor(pointer.resumeAt));
  }

  if (pointer.completed === true) {
    cloned.completed = true;
  }

  if (pointer.session === true) {
    cloned.session = true;
  }

  return cloned;
}

export { clonePointerItem };

export function mergePointerDetails(target, source) {
  if (!target || typeof target !== "object" || !source || typeof source !== "object") {
    return target;
  }
  if (source.session === true) {
    target.session = true;
  }
  if (Number.isFinite(source.resumeAt)) {
    target.resumeAt = Math.max(0, Math.floor(source.resumeAt));
  }
  if (source.completed === true) {
    target.completed = true;
  }
  if (Number.isFinite(source.watchedAt)) {
    target.watchedAt = Math.max(0, Math.floor(source.watchedAt));
  }
  if (typeof source.relay === "string" && source.relay.trim()) {
    if (!target.relay || !target.relay.trim()) {
      target.relay = source.relay.trim();
    }
  }
  return target;
}

export function normalizePointerInput(pointer) {
  if (!pointer) {
    return null;
  }
  if (Array.isArray(pointer)) {
    return normalizePointerTag(pointer);
  }
  if (typeof pointer === "object") {
    if (typeof pointer.type === "string" && typeof pointer.value === "string") {
      return clonePointerItem(pointer);
    }
    if (Array.isArray(pointer.tag)) {
      return normalizePointerTag(pointer.tag);
    }
  }
  if (typeof pointer !== "string") {
    return null;
  }
  const trimmed = pointer.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.startsWith("naddr") || trimmed.startsWith("nevent")) {
    try {
      const decoder = getCachedNostrTools()?.nip19?.decode;
      if (typeof decoder === "function") {
        const decoded = decoder(trimmed);
        if (decoded?.type === "naddr" && decoded.data) {
          const { kind, pubkey, identifier, relays } = decoded.data;
          if (
            typeof kind === "number" &&
            typeof pubkey === "string" &&
            typeof identifier === "string"
          ) {
            const relay =
              Array.isArray(relays) && relays.length && typeof relays[0] === "string"
                ? relays[0]
                : null;
            return {
              type: "a",
              value: `${kind}:${pubkey}:${identifier}`,
              relay,
            };
          }
        }
        if (decoded?.type === "nevent" && decoded.data) {
          const { id, relays } = decoded.data;
          if (typeof id === "string" && id.trim()) {
            const relay =
              Array.isArray(relays) && relays.length && typeof relays[0] === "string"
                ? relays[0]
                : null;
            return {
              type: "e",
              value: id.trim(),
              relay,
            };
          }
        }
      }
    } catch (error) {
      devLogger.warn(`[nostr] Failed to decode pointer ${trimmed}:`, error);
    }
  }
  const type = trimmed.includes(":") ? "a" : "e";
  return { type, value: trimmed, relay: null };
}
