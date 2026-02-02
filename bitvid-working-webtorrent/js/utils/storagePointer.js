const INFO_JSON_SUFFIX = ".info.json";

function safeTrim(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeStoragePointer(value) {
  return safeTrim(value);
}

export function parseStoragePointer(value) {
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

export function deriveStoragePrefixFromUrl(url) {
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
