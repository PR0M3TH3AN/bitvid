import { devLogger } from "./logger.js";

const LOCALHOST_PATTERN = /^(?:localhost|(?:\d{1,3}\.){3}\d{1,3})(?::\d+)?(?:[/?#].*)?$/i;
const DOMAIN_PATTERN = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9-]{2,}(?::\d+)?(?:[/?#].*)?$/i;

function normalizeIpfsGatewayUrl(trimmed) {
  const ipfsPath = trimmed.replace(/^ipfs:\/\//i, "").replace(/^ipfs\//i, "");
  if (!ipfsPath) {
    return "";
  }
  return `https://ipfs.io/ipfs/${encodeURI(ipfsPath)}`;
}

function coerceHttpToHttps(url) {
  if (!/^http:\/\//i.test(url)) {
    return url;
  }

  if (LOCALHOST_PATTERN.test(url.replace(/^http:\/\//i, ""))) {
    return url;
  }

  return `https://${url.slice(7)}`;
}

export function sanitizeProfileMediaUrl(value) {
  if (typeof value !== "string") {
    return "";
  }

  let trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  trimmed = trimmed.replace(/^['"]+|['"]+$/g, "");
  if (!trimmed) {
    return "";
  }

  if (/^data:image\//i.test(trimmed)) {
    return trimmed;
  }

  if (/^blob:/i.test(trimmed)) {
    return trimmed;
  }

  if (/^ipfs:\/\//i.test(trimmed)) {
    return normalizeIpfsGatewayUrl(trimmed);
  }

  if (trimmed.startsWith("//")) {
    trimmed = `https:${trimmed}`;
  }

  if (/^(?:\.\.\/|\.\/|\/)/.test(trimmed)) {
    return trimmed;
  }

  if (/^assets\//i.test(trimmed)) {
    return trimmed;
  }

  if (/^images\//i.test(trimmed)) {
    return trimmed;
  }

  if (!/^https?:\/\//i.test(trimmed)) {
    if (LOCALHOST_PATTERN.test(trimmed)) {
      trimmed = `http://${trimmed}`;
    } else if (DOMAIN_PATTERN.test(trimmed)) {
      trimmed = `https://${trimmed}`;
    } else {
      devLogger?.warn?.(
        "[profileMedia.sanitizeProfileMediaUrl] Unsupported media URL",
        trimmed
      );
      return "";
    }
  }

  return coerceHttpToHttps(trimmed);
}
