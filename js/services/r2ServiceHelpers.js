// js/services/r2ServiceHelpers.js
//
// State-free helpers extracted from r2Service.js to keep that service under the
// file-size budget. No behavior change.

import { userLogger, devLogger } from "../utils/logger.js";
import { calculateTorrentInfoHash } from "../utils/torrentHash.js";
import { buildPublicUrl } from "../r2.js";
import { sanitizeBucketName } from "../storage/r2-mgmt.js";
import { truncateMiddle } from "../utils/formatters.js";
import { safeEncodeNpub } from "../utils/nostrHelpers.js";
import { ensureS3SdkLoaded } from "../storage/s3-client.js";

const INFO_HASH_PATTERN = /^[a-f0-9]{40}$/;

export function normalizeInfoHash(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function isValidInfoHash(value) {
  return INFO_HASH_PATTERN.test(value);
}

export async function resolveUploadIdentifier({ infoHash = "", file = null } = {}) {
  const normalizedInfoHash = normalizeInfoHash(infoHash);
  if (isValidInfoHash(normalizedInfoHash)) {
    return normalizedInfoHash;
  }
  if (!file) {
    return "";
  }
  try {
    const computedHash = await calculateTorrentInfoHash(file);
    const normalizedComputed = normalizeInfoHash(computedHash);
    if (isValidInfoHash(normalizedComputed)) {
      return normalizedComputed;
    }
  } catch (err) {
    userLogger.warn("Failed to precompute info hash for storage key:", err);
  }
  return "";
}

export function buildCorsGuidance({ accountId } = {}) {
  const origin =
    typeof window !== "undefined" && window.location
      ? window.location.origin
      : "";
  const originLabel = origin && origin !== "null" ? origin : "<your-app-origin>";
  const endpoint = accountId
    ? `https://${accountId}.r2.cloudflarestorage.com`
    : "https://<account>.r2.cloudflarestorage.com";

  return [
    "This is likely a CORS issue.",
    `Configure CORS on the R2 S3 API endpoint (${endpoint}) — not just the public domain.`,
    `Add AllowedOrigins: ${originLabel} (and any other origins),`,
    "AllowedMethods: GET, HEAD, PUT, POST, DELETE, OPTIONS,",
    "and AllowedHeaders: *.",
  ].join(" ");
}

export function createDefaultSettings() {
  return {
    accountId: "",
    accessKeyId: "",
    secretAccessKey: "",
    baseDomain: "", // Now interpreted as the public URL base
    buckets: {},
  };
}

export function safeDecodeNpub(npub) {
  if (typeof npub !== "string") {
    return null;
  }
  const trimmed = npub.trim();
  if (!trimmed) {
    return null;
  }
  if (!trimmed.startsWith("npub1")) {
    return null;
  }
  try {
    if (
      typeof window !== "undefined" &&
      window.NostrTools &&
      window.NostrTools.nip19
    ) {
      const { type, data } = window.NostrTools.nip19.decode(trimmed);
      if (type === "npub") {
        return data;
      }
    }
  } catch (err) {
    // Ignore decode errors
  }
  return null;
}

// Uploads a tiny verification object, fetches it back over the public URL, and
// cleans up — proving the bucket exists, CORS is configured, and the public URL
// base is correct. Takes the R2Service instance (`ctx`) for its S3 operations.
export async function verifyPublicAccess(ctx, { settings, npub }) {
  if (!settings || !npub) {
    return { success: false, error: "Missing settings or npub." };
  }

  const { accountId, accessKeyId, secretAccessKey, baseDomain } = settings;
  if (!accountId || !accessKeyId || !secretAccessKey || !baseDomain) {
    return { success: false, error: "Incomplete credentials or missing public URL." };
  }

  const bucketName =
    settings.bucket || settings.meta?.bucket || sanitizeBucketName(npub);
  const verifyKey = `.verify-${Date.now()}-${Math.random().toString(36).substring(7)}.txt`;
  const verifyContent = "bitvid-verification";
  const publicUrl = buildPublicUrl(baseDomain, verifyKey);

  userLogger.info(
    `[R2] Verifying access for Bucket: '${bucketName}' in Account: '${truncateMiddle(accountId, 6)}'`
  );

  try {
    // 1. Initialize S3
    const s3 = ctx.makeR2Client({
      accountId,
      accessKeyId,
      secretAccessKey,
      endpoint: settings.endpoint,
      region: settings.region,
    });

    // 2. Ensure bucket (best effort)
    try {
      await ctx.ensureBucketExists({
        s3,
        bucket: bucketName,
        region: settings.region,
      });
    } catch (setupErr) {
      userLogger.warn("Bucket creation/check warning during verification:", setupErr);
      // Continue, assuming bucket might already exist and be configured
    }

    // 3. Ensure CORS (best effort)
    try {
      const corsOrigins = ctx.getCorsOrigins();
      if (corsOrigins.length > 0) {
        await ctx.ensureBucketCors({
          s3,
          bucket: bucketName,
          origins: corsOrigins,
          region: settings.region,
        });
      }
    } catch (corsErr) {
      userLogger.warn("CORS setup warning during verification:", corsErr);
    }

    // 4. Upload Test File
    const file = new File([verifyContent], "verify.txt", { type: "text/plain" });
    await ctx.multipartUpload({
      s3,
      bucket: bucketName,
      key: verifyKey,
      file,
      contentType: "text/plain",
      createBucketIfMissing: true,
      region: settings.region,
    });

    // 4. Verify Public Access (Fetch)
    // Wait a moment for propagation (R2 is usually instant-ish but helpful to wait)
    await new Promise((r) => setTimeout(r, 500));

    const response = await fetch(publicUrl, { method: "GET", cache: "no-cache" });

    if (!response.ok) {
      // Cleanup attempt
      try { await ctx.deleteObject({ s3, bucket: bucketName, key: verifyKey }); } catch (e) {}

      if (response.status === 404) {
         return { success: false, error: "File not found. Check your Public Bucket URL." };
      }
      return { success: false, error: `Public access failed (HTTP ${response.status}). Is the bucket public?` };
    }

    const text = await response.text();

    // Cleanup
    try { await ctx.deleteObject({ s3, bucket: bucketName, key: verifyKey }); } catch (e) {}

    if (text.trim() !== verifyContent) {
      return { success: false, error: "Content mismatch. URL might be pointing elsewhere." };
    }

    return { success: true };

  } catch (err) {
    userLogger.error("Verification failed:", err);
    let errorMessage = err.message || "Unknown error during verification.";
    if (
      errorMessage.includes("Failed to fetch") ||
      errorMessage.includes("NetworkError")
    ) {
      errorMessage += ` ${buildCorsGuidance({ accountId })} Also verify that the Bucket Name exists and your API Token has 'Object Read & Write' permissions.`;
    }
    return { success: false, error: errorMessage };
  }
}

/**
 * Build a provider-aware S3 client from resolved connection settings.
 * Cloudflare R2 always uses path-style (via makeR2Client); a generic S3 bucket
 * honors the connection's forcePathStyle. Shared by storage list/delete paths.
 */
export function buildProviderClient(settings, { makeR2Client, makeS3Client } = {}) {
  const accessKeyId = (settings?.accessKeyId || "").trim();
  const secretAccessKey = (settings?.secretAccessKey || "").trim();
  const useR2 =
    settings?.provider === "cloudflare_r2" || Boolean(settings?.accountId);
  if (useR2) {
    return makeR2Client({
      accountId: settings.accountId,
      endpoint: settings.endpoint,
      accessKeyId,
      secretAccessKey,
      region: settings.region,
    });
  }
  return makeS3Client({
    endpoint: settings.endpoint,
    region: settings.region,
    accessKeyId,
    secretAccessKey,
    forcePathStyle: Boolean(settings?.forcePathStyle),
  });
}

/**
 * List the object keys under a user's storage prefix (u/<npub>/). `ctx` is the
 * R2Service instance (resolveConnection / makeR2Client / makeS3Client /
 * listObjects). Unlock-gated; returns { ok, reason, keys }.
 */
export async function listVideoStorageObjects(
  ctx,
  { npub = "", pubkey = "", credentials = null } = {},
) {
  let resolvedNpub = (npub || "").trim();
  if (!resolvedNpub && pubkey) {
    resolvedNpub = safeEncodeNpub(pubkey) || "";
  }
  let settings = credentials;
  if (!settings && resolvedNpub) {
    try {
      settings = await ctx.resolveConnection(resolvedNpub);
    } catch (err) {
      devLogger.warn("[R2Service] listVideoStorageObjects: resolve failed:", err);
    }
  }
  if (!settings) {
    return { ok: false, reason: "no-connection", keys: [] };
  }
  if (
    !(settings.accessKeyId || "").trim() ||
    !(settings.secretAccessKey || "").trim()
  ) {
    return { ok: false, reason: "storage-locked", keys: [] };
  }
  const bucket = (settings.bucket || "").trim();
  if (!bucket) {
    return { ok: false, reason: "missing-bucket", keys: [] };
  }
  let s3;
  try {
    const ensureSdk =
      typeof ctx.ensureS3SdkLoaded === "function"
        ? ctx.ensureS3SdkLoaded
        : ensureS3SdkLoaded;
    await ensureSdk();
    s3 = buildProviderClient(settings, {
      makeR2Client: ctx.makeR2Client,
      makeS3Client: ctx.makeS3Client,
    });
  } catch (err) {
    devLogger.warn("[R2Service] listVideoStorageObjects: client build failed:", err);
    return { ok: false, reason: "client-error", keys: [] };
  }
  try {
    const keys = await ctx.listObjects({
      s3,
      bucket,
      prefix: resolvedNpub ? `u/${resolvedNpub}/` : "",
    });
    return { ok: true, keys };
  } catch (err) {
    devLogger.warn("[R2Service] listVideoStorageObjects: list failed:", err);
    return { ok: false, reason: "list-error", keys: [] };
  }
}
