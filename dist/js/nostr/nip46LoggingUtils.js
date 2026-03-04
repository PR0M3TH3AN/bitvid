/**
 * Logging utilities for NIP-46 (Nostr Connect) client and diagnostics.
 */

export function summarizeHexForLog(value) {
  if (typeof value !== "string" || !value.trim()) {
    return "";
  }

  const normalized = value.trim().toLowerCase();
  if (normalized.length <= 12) {
    return `${normalized} (len:${normalized.length})`;
  }
  return `${normalized.slice(0, 8)}…${normalized.slice(-4)} (len:${normalized.length})`;
}

export function summarizeSecretForLog(value) {
  if (typeof value !== "string" || !value.trim()) {
    return "<empty>";
  }

  const trimmed = value.trim();
  const visible = trimmed.length <= 4 ? "*".repeat(trimmed.length) : `${"*".repeat(3)}…`;
  return `${visible} (len:${trimmed.length})`;
}

export function summarizeMetadataForLog(metadata) {
  if (!metadata || typeof metadata !== "object") {
    return [];
  }
  return Object.keys(metadata).slice(0, 12);
}

export function summarizeUrlForLog(value) {
  if (typeof value !== "string" || !value.trim()) {
    return "";
  }

  const trimmed = value.trim();
  try {
    const url = new URL(trimmed);
    return {
      origin: url.origin,
      pathname: url.pathname,
      hasQuery: Boolean(url.search),
      hasHash: Boolean(url.hash),
      length: trimmed.length,
    };
  } catch (error) {
    const length = trimmed.length;
    if (length <= 64) {
      return `${trimmed} (len:${length})`;
    }
    return `${trimmed.slice(0, 32)}…${trimmed.slice(-8)} (len:${length})`;
  }
}

export function summarizePayloadPreviewForLog(value) {
  if (typeof value !== "string") {
    return { type: typeof value };
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return { type: "string", length: 0 };
  }

  return {
    type: "string",
    length: trimmed.length,
    preview: trimmed.length <= 96 ? trimmed : `${trimmed.slice(0, 64)}…`,
  };
}

export function summarizeRpcParamsForLog(method, params) {
  if (!Array.isArray(params)) {
    return [];
  }

  return params.map((param, index) => {
    if (typeof param === "string") {
      if (method === "connect" && index === 1) {
        return { index, secret: summarizeSecretForLog(param) };
      }
      const trimmed = param.trim();
      if (!trimmed) {
        return { index, type: "string", length: 0 };
      }
      if (method === "sign_event") {
        return { index, type: "string", length: trimmed.length };
      }
      if (trimmed.length <= 64) {
        return { index, value: trimmed, length: trimmed.length };
      }
      return {
        index,
        type: "string",
        length: trimmed.length,
        preview: `${trimmed.slice(0, 32)}…${trimmed.slice(-8)}`,
      };
    }

    if (param && typeof param === "object") {
      return {
        index,
        type: Array.isArray(param) ? "array" : "object",
        keys: Object.keys(param).slice(0, 6),
      };
    }

    return { index, type: typeof param };
  });
}

export function summarizeRpcResultForLog(method, result) {
  if (typeof result === "string") {
    const trimmed = result.trim();
    if (!trimmed) {
      return { type: "string", length: 0 };
    }
    if (method === "connect") {
      return { type: "string", length: trimmed.length, secret: summarizeSecretForLog(trimmed) };
    }
    if (trimmed.length <= 96) {
      return { type: "string", length: trimmed.length, value: trimmed };
    }
    return {
      type: "string",
      length: trimmed.length,
      preview: `${trimmed.slice(0, 48)}…${trimmed.slice(-12)}`,
    };
  }

  if (!result) {
    return { type: typeof result };
  }

  if (typeof result === "object") {
    return {
      type: Array.isArray(result) ? "array" : "object",
      keys: Object.keys(result).slice(0, 6),
    };
  }

  return { type: typeof result };
}

export function summarizeRelayPublishResultsForLog(results) {
  if (!Array.isArray(results)) {
    return [];
  }

  return results.map((entry) => ({
    relay: entry?.relay || "",
    success: Boolean(entry?.ok),
    reason: entry?.error ? entry.error?.message || String(entry.error) : null,
  }));
}
