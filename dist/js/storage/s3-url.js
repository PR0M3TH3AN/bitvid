function normalizeEndpoint(endpoint) {
  const trimmed = String(endpoint || "").trim();
  if (!trimmed) {
    return "";
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed.replace(/\/+$/, "");
  }
  return `https://${trimmed.replace(/\/+$/, "")}`;
}

function normalizeBucket(bucket) {
  return String(bucket || "").trim();
}

function normalizeKey(key) {
  return String(key || "").replace(/^\/+/, "").trim();
}

export function normalizeS3PublicBaseUrl(publicBaseUrl) {
  const trimmed = String(publicBaseUrl || "").trim();
  if (!trimmed) {
    return "";
  }
  return trimmed.replace(/\/+$/, "");
}

export function buildS3PublicUrl({
  endpoint,
  bucket,
  key,
  forcePathStyle,
} = {}) {
  const normalizedEndpoint = normalizeEndpoint(endpoint);
  const normalizedBucket = normalizeBucket(bucket);
  const normalizedKey = normalizeKey(key);

  if (!normalizedEndpoint || !normalizedBucket) {
    return "";
  }

  const url = new URL(normalizedEndpoint);
  url.hash = "";
  url.search = "";

  const basePath = url.pathname.replace(/\/+$/, "");
  const prefix = basePath === "/" ? "" : basePath;

  if (forcePathStyle) {
    url.pathname = `${prefix}/${normalizedBucket}`;
  } else if (!url.hostname.startsWith(`${normalizedBucket}.`)) {
    url.hostname = `${normalizedBucket}.${url.hostname}`;
  }

  if (normalizedKey) {
    const pathBase = url.pathname.replace(/\/+$/, "");
    const pathPrefix = pathBase === "/" ? "" : pathBase;
    url.pathname = `${pathPrefix}/${normalizedKey}`;
  }

  return url.toString().replace(/\/+$/, "");
}

export function buildS3UrlFromBase({ publicBaseUrl, key } = {}) {
  const normalizedBase = normalizeS3PublicBaseUrl(publicBaseUrl);
  const normalizedKey = normalizeKey(key);
  if (!normalizedBase || !normalizedKey) {
    return "";
  }
  const baseWithSlash = normalizedBase.endsWith("/")
    ? normalizedBase
    : `${normalizedBase}/`;
  return new URL(normalizedKey, baseWithSlash).toString();
}
