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

// Backblaze B2's S3-compatible endpoint is region-scoped:
//   region "us-west-004" -> https://s3.us-west-004.backblazeb2.com
// Unlike generic S3, the user supplies a region (not a pasted endpoint) and bitvid
// derives the endpoint. Returns "" for a missing/placeholder region so callers can
// surface a "region required" error. B2 buckets are addressed virtual-hosted-style,
// so the public URL then derives to https://<bucket>.s3.<region>.backblazeb2.com via
// buildS3PublicUrl({ forcePathStyle: false }).
export function deriveB2Endpoint(region) {
  const normalizedRegion = String(region || "").trim().toLowerCase();
  if (!normalizedRegion || normalizedRegion === "auto") {
    return "";
  }
  // Defend against a user pasting a full endpoint/host into the region box.
  if (normalizedRegion.includes("/") || normalizedRegion.includes(".")) {
    return "";
  }
  return `https://s3.${normalizedRegion}.backblazeb2.com`;
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
