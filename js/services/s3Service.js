import { ensureS3SdkLoaded, makeS3Client } from "../storage/s3-client.js";
import { ensureBucketCors, ensureBucketExists } from "../storage/s3-multipart.js";
import { userLogger } from "../utils/logger.js";

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

function normalizeRegion(region) {
  const trimmed = String(region || "").trim();
  return trimmed || "auto";
}

function normalizeBucket(bucket) {
  return String(bucket || "").trim();
}

export function derivePublicBaseUrl({
  endpoint,
  bucket,
  forcePathStyle,
} = {}) {
  const normalizedEndpoint = normalizeEndpoint(endpoint);
  const normalizedBucket = normalizeBucket(bucket);
  if (!normalizedEndpoint || !normalizedBucket) {
    return "";
  }

  const url = new URL(normalizedEndpoint);
  url.hash = "";
  url.search = "";

  if (forcePathStyle) {
    const basePath = url.pathname.replace(/\/+$/, "");
    const prefix = basePath === "/" ? "" : basePath;
    url.pathname = `${prefix}/${normalizedBucket}`;
  } else if (!url.hostname.startsWith(`${normalizedBucket}.`)) {
    url.hostname = `${normalizedBucket}.${url.hostname}`;
  }

  return url.toString().replace(/\/+$/, "");
}

export function validateS3Connection({
  endpoint,
  region,
  accessKeyId,
  secretAccessKey,
  bucket,
  forcePathStyle,
} = {}) {
  const normalizedEndpoint = normalizeEndpoint(endpoint);
  const normalizedBucket = normalizeBucket(bucket);
  const normalizedRegion = normalizeRegion(region);
  const normalizedAccessKeyId = String(accessKeyId || "").trim();
  const normalizedSecretAccessKey = String(secretAccessKey || "").trim();

  if (!normalizedEndpoint) {
    throw new Error("S3 endpoint is required.");
  }
  if (!normalizedRegion) {
    throw new Error("S3 region is required.");
  }
  if (!normalizedAccessKeyId) {
    throw new Error("S3 access key ID is required.");
  }
  if (!normalizedSecretAccessKey) {
    throw new Error("S3 secret access key is required.");
  }
  if (!normalizedBucket) {
    throw new Error("S3 bucket name is required.");
  }
  if (typeof forcePathStyle !== "boolean") {
    throw new Error("S3 forcePathStyle setting must be true or false.");
  }

  const publicBaseUrl = derivePublicBaseUrl({
    endpoint: normalizedEndpoint,
    bucket: normalizedBucket,
    forcePathStyle,
  });

  if (!publicBaseUrl) {
    throw new Error("Unable to derive a public base URL for the S3 bucket.");
  }

  return {
    endpoint: normalizedEndpoint,
    region: normalizedRegion,
    accessKeyId: normalizedAccessKeyId,
    secretAccessKey: normalizedSecretAccessKey,
    bucket: normalizedBucket,
    forcePathStyle,
    publicBaseUrl,
  };
}

export function getCorsOrigins() {
  const origins = new Set();
  if (typeof window !== "undefined" && window.location) {
    const origin = window.location.origin;
    if (origin && origin !== "null") {
      origins.add(origin);
    }
    if (origin && origin.startsWith("http://localhost")) {
      origins.add(origin.replace("http://", "https://"));
    }
  }
  return Array.from(origins);
}

export async function prepareS3Connection({
  endpoint,
  region,
  accessKeyId,
  secretAccessKey,
  bucket,
  forcePathStyle,
  origins,
} = {}) {
  const normalized = validateS3Connection({
    endpoint,
    region,
    accessKeyId,
    secretAccessKey,
    bucket,
    forcePathStyle,
  });

  await ensureS3SdkLoaded();

  const s3 = makeS3Client({
    endpoint: normalized.endpoint,
    region: normalized.region,
    accessKeyId: normalized.accessKeyId,
    secretAccessKey: normalized.secretAccessKey,
    forcePathStyle: normalized.forcePathStyle,
  });

  try {
    await ensureBucketExists({
      s3,
      bucket: normalized.bucket,
      region: normalized.region,
    });
  } catch (error) {
    userLogger.warn("Failed to ensure S3 bucket exists:", error);
  }

  const allowedOrigins = Array.isArray(origins) ? origins : [];
  if (allowedOrigins.length > 0) {
    try {
      await ensureBucketCors({
        s3,
        bucket: normalized.bucket,
        origins: allowedOrigins,
        region: normalized.region,
      });
    } catch (error) {
      userLogger.warn("Failed to ensure S3 bucket CORS:", error);
    }
  }

  return normalized;
}
