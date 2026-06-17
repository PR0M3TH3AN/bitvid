const INFO_JSON_SUFFIX = ".info.json";

function safeTrim(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeStoragePointer(value) {
  return safeTrim(value);
}

function parseStoragePointer(value) {
  const normalized = normalizeStoragePointer(value);
  if (!normalized) {
    return null;
  }

  const separatorIndex = normalized.indexOf(":");
  if (separatorIndex <= 0) {
    return null;
  }

  const provider = normalized.slice(0, separatorIndex).trim().toLowerCase();
  const prefix = normalized.slice(separatorIndex + 1).trim();
  if (!provider || !prefix) {
    return null;
  }

  return { provider, prefix };
}

export function buildStoragePointerValue({ provider, prefix } = {}) {
  const normalizedProvider = safeTrim(provider).toLowerCase();
  const normalizedPrefix = safeTrim(prefix);
  if (!normalizedProvider || !normalizedPrefix) {
    return "";
  }

  return `${normalizedProvider}:${normalizedPrefix}`;
}

function deriveStoragePrefixFromUrl(url) {
  const trimmed = safeTrim(url);
  if (!trimmed || !/^https?:\/\//i.test(trimmed)) {
    return "";
  }

  try {
    const parsed = new URL(trimmed);
    const path = parsed.pathname || "";
    if (!path || path === "/") {
      return "";
    }
    const normalizedPath = path.replace(/\/+$/, "");
    const withoutExtension = normalizedPath.replace(/\.[^/.]+$/, "");
    const cleanedPath = withoutExtension.startsWith("/")
      ? withoutExtension
      : `/${withoutExtension}`;
    return `${parsed.origin}${cleanedPath}`;
  } catch (error) {
    return "";
  }
}

export function deriveStoragePointerFromUrl(url, provider = "url") {
  const prefix = deriveStoragePrefixFromUrl(url);
  return buildStoragePointerValue({ provider, prefix });
}

export function buildStoragePrefixFromKey({ publicBaseUrl, key } = {}) {
  const base = safeTrim(publicBaseUrl).replace(/\/+$/, "");
  const normalizedKey = safeTrim(key).replace(/^\//, "");
  if (!base || !normalizedKey) {
    return "";
  }
  const baseKey = normalizedKey.replace(/\.[^/.]+$/, "");
  if (!baseKey) {
    return "";
  }
  return `${base}/${baseKey}`;
}

export function getStoragePointerFromTags(tags = []) {
  if (!Array.isArray(tags)) {
    return "";
  }
  const tag = tags.find(
    (entry) =>
      Array.isArray(entry) &&
      entry[0] === "s" &&
      typeof entry[1] === "string"
  );
  return normalizeStoragePointer(tag?.[1]);
}

function normalizeInfoJsonBase(base) {
  const trimmed = safeTrim(base);
  if (!trimmed) {
    return "";
  }
  if (trimmed.toLowerCase().endsWith(INFO_JSON_SUFFIX)) {
    return trimmed;
  }
  return `${trimmed.replace(/\/+$/, "")}${INFO_JSON_SUFFIX}`;
}

export function resolveInfoJsonUrl({ storagePointer, url } = {}) {
  const parsed = parseStoragePointer(storagePointer);
  if (!parsed) {
    return "";
  }

  const prefix = parsed.prefix;
  if (/^https?:\/\//i.test(prefix)) {
    return normalizeInfoJsonBase(prefix);
  }

  const fallbackPrefix = deriveStoragePrefixFromUrl(url);
  if (fallbackPrefix) {
    return normalizeInfoJsonBase(fallbackPrefix);
  }

  return normalizeInfoJsonBase(prefix);
}

export function resolveStoragePointerValue({
  storagePointer,
  url,
  infoHash,
  fallbackId,
  provider,
} = {}) {
  const normalized = normalizeStoragePointer(storagePointer);
  if (normalized) {
    return normalized;
  }

  const derivedFromUrl = deriveStoragePointerFromUrl(url, provider || "url");
  if (derivedFromUrl) {
    return derivedFromUrl;
  }

  if (typeof infoHash === "string" && infoHash.trim()) {
    return buildStoragePointerValue({
      provider: "btih",
      prefix: infoHash.trim().toLowerCase(),
    });
  }

  if (typeof fallbackId === "string" && fallbackId.trim()) {
    return buildStoragePointerValue({
      provider: "nostr",
      prefix: fallbackId.trim(),
    });
  }

  return "";
}

/**
 * Given one or more parsed video notes and the owner's bucket public base URL,
 * returns the set of object KEYS backing them — the video object, its sibling
 * `.torrent`, and the thumbnail — but ONLY for URLs that live under that base
 * URL. URLs pointing at other hosts/buckets (e.g. external links) are ignored,
 * so callers can never delete an object they don't own. Pure + deterministic.
 *
 * @param {object} params
 * @param {Array|object} params.videos - parsed video note(s) (need url/thumbnail)
 * @param {string} params.publicBaseUrl - the bucket's public base URL
 * @returns {string[]} unique object keys (decoded, no leading slash)
 */
export function collectVideoStorageKeys({ videos, publicBaseUrl } = {}) {
  const base = safeTrim(publicBaseUrl).replace(/\/+$/, "");
  if (!base) {
    return [];
  }
  const prefix = `${base}/`;

  const keyFromUrl = (value) => {
    const url = safeTrim(value);
    if (!url || !url.startsWith(prefix)) {
      return "";
    }
    let rel = url.slice(prefix.length).split(/[?#]/)[0];
    if (!rel) {
      return "";
    }
    try {
      rel = rel
        .split("/")
        .map((segment) => decodeURIComponent(segment))
        .join("/");
    } catch (error) {
      // Keep the raw relative path if it isn't valid percent-encoding.
    }
    return rel.replace(/^\/+/, "");
  };

  const list = Array.isArray(videos) ? videos : [videos];
  const keys = new Set();
  for (const video of list) {
    if (!video || typeof video !== "object") {
      continue;
    }
    const videoKey = keyFromUrl(video.url);
    if (videoKey) {
      keys.add(videoKey);
      // The sibling torrent is uploaded as "<key-without-extension>.torrent".
      const torrentKey = `${videoKey.replace(/\.[^/.]+$/, "")}.torrent`;
      if (torrentKey && torrentKey !== videoKey) {
        keys.add(torrentKey);
      }
    }
    const thumbnailKey = keyFromUrl(video.thumbnail);
    if (thumbnailKey) {
      keys.add(thumbnailKey);
    }
  }
  return [...keys];
}
