import { WSS_TRACKERS } from "./constants.js";

const HEX_INFO_HASH = /^[0-9a-f]{40}$/i;
const ENCODED_BTih_PATTERN = /xt=urn%3Abtih%3A([0-9a-z]+)/gi;

function getOriginProtocol() {
  if (typeof window !== "undefined" && window.location?.protocol) {
    return window.location.protocol.toLowerCase();
  }
  return "https:";
}

function decodeLoose(value) {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  try {
    return decodeURIComponent(trimmed);
  } catch (err) {
    return trimmed;
  }
}

function normalizeForComparison(value) {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim().replace(/\/+$/, "").toLowerCase();
}

function tryFormatAbsoluteUrl(candidate) {
  if (typeof candidate !== "string") {
    return "";
  }
  const trimmed = candidate.trim();
  if (!trimmed) {
    return "";
  }
  try {
    const parsed = new URL(trimmed);
    return parsed.toString();
  } catch (err) {
    return trimmed;
  }
}

/**
 * Normalize and enrich a magnet string entered in the upload form so that it
 * always produces a WebTorrent-friendly URI. The logic mirrors the behaviour of
 * the legacy magnetUtils helper but returns a plain string for ease of use.
 */
export function normalizeAndAugmentMagnet(rawValue, { ws = "", xs = "" } = {}) {
  const initial = typeof rawValue === "string" ? rawValue.trim() : "";
  if (!initial) {
    return "";
  }

  let working = initial;

  if (HEX_INFO_HASH.test(working)) {
    working = `magnet:?xt=urn:btih:${working.toLowerCase()}`;
  }

  working = working.replace(ENCODED_BTih_PATTERN, (_, hash) => `xt=urn:btih:${hash}`);

  if (!/^magnet:/i.test(working)) {
    return working;
  }

  let fragment = "";
  const hashIndex = working.indexOf("#");
  if (hashIndex !== -1) {
    fragment = working.slice(hashIndex);
    working = working.slice(0, hashIndex);
  }

  const [, queryPart = ""] = working.split("?", 2);
  const normalizedScheme = "magnet:";
  const rawParams = queryPart
    .split("&")
    .map((part) => part.trim())
    .filter(Boolean);

  const params = [];

  for (const rawParam of rawParams) {
    const [rawKey, rawVal = ""] = rawParam.split("=", 2);
    const key = rawKey.trim();
    if (!key) {
      continue;
    }
    let value = rawVal.trim();
    if (key.toLowerCase() === "xt" && value) {
      const decoded = decodeLoose(value);
      if (decoded) {
        value = decoded;
      }
    }
    params.push({
      key,
      value,
      lowerKey: key.toLowerCase(),
      compareValue: normalizeForComparison(value),
    });
  }

  const appendUniqueParam = (key, value) => {
    if (!value) {
      return;
    }
    const trimmedValue = value.trim();
    if (!trimmedValue) {
      return;
    }
    const lowerKey = key.toLowerCase();
    const compareValue = normalizeForComparison(trimmedValue);
    if (compareValue) {
      const exists = params.some(
        (param) => param.lowerKey === lowerKey && param.compareValue === compareValue
      );
      if (exists) {
        return;
      }
    }
    params.push({
      key,
      value: trimmedValue,
      lowerKey,
      compareValue,
    });
  };

  for (const tracker of WSS_TRACKERS) {
    if (typeof tracker !== "string") {
      continue;
    }
    const trimmedTracker = tracker.trim();
    if (!/^wss:\/\//i.test(trimmedTracker)) {
      continue;
    }
    appendUniqueParam("tr", trimmedTracker);
  }

  const normalizedXs = typeof xs === "string" ? xs.trim() : "";
  if (normalizedXs) {
    appendUniqueParam("xs", normalizedXs);
  }

  const originProtocol = getOriginProtocol();
  const rawWs = typeof ws === "string" ? ws.trim() : "";
  if (rawWs) {
    const formattedWs = tryFormatAbsoluteUrl(rawWs);
    const lowerWs = formattedWs.toLowerCase();
    const isHttpSeed = lowerWs.startsWith("http://");
    const allowHttpSeed = originProtocol === "http:";
    if (!isHttpSeed || allowHttpSeed) {
      appendUniqueParam("ws", formattedWs);
    }
  }

  const queryString = params
    .map(({ key, value }) => (value ? `${key}=${value}` : key))
    .join("&");

  return `${normalizedScheme}${queryString ? `?${queryString}` : ""}${fragment}`;
}
