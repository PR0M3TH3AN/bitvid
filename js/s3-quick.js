import { multipartUpload, ensureBucketExists, ensureBucketCors } from "./storage/s3-multipart.js";
import { makeS3Client } from "./storage/s3-client.js";
import { userLogger } from "./utils/logger.js";

const STORAGE_KEY = "bitvid:quickS3Settings";

export function loadLocalSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (err) {
    userLogger.warn("Failed to load quick S3 settings:", err);
    return null;
  }
}

export function saveLocalSettings(settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (err) {
    userLogger.warn("Failed to save quick S3 settings:", err);
  }
}

export async function uploadWithKeys({
  file,
  key,
  settings, // { endpoint, region, bucket, accessKeyId, secretAccessKey, forcePathStyle, createBucketIfMissing }
  onProgress
}) {
  if (!settings.endpoint || !settings.bucket || !settings.accessKeyId || !settings.secretAccessKey) {
    throw new Error("Missing S3 credentials.");
  }

  if (!key) {
      throw new Error("Target object key is required.");
  }

  const s3 = makeS3Client({
    endpoint: settings.endpoint,
    region: settings.region,
    credentials: {
      accessKeyId: settings.accessKeyId,
      secretAccessKey: settings.secretAccessKey
    },
    forcePathStyle: settings.forcePathStyle
  });

  if (settings.createBucketIfMissing) {
    await ensureBucketExists({ s3, bucket: settings.bucket, region: settings.region });
  }

  // Ensure CORS only if we have keys
  try {
      const origins = [];
      if (typeof window !== "undefined" && window.location) {
          if (window.location.origin && window.location.origin !== "null") {
              origins.push(window.location.origin);
          }
      }
      // Add standard localdev origins just in case
      origins.push('http://localhost:8000');
      origins.push('http://127.0.0.1:8000');

      const uniqueOrigins = [...new Set(origins)];

      await ensureBucketCors({
          s3,
          bucket: settings.bucket,
          origins: uniqueOrigins,
          region: settings.region
      });
  } catch (err) {
      userLogger.warn("Failed to ensure CORS (ignoring):", err);
  }

  return multipartUpload({
    s3,
    bucket: settings.bucket,
    key,
    file,
    contentType: file.type,
    onProgress,
    createBucketIfMissing: false // Already handled
  });
}

export async function uploadWithManifest({
  file,
  manifest,
  onProgress
}) {
  // manifest: { uploadId, partUrls: string[], completeUrl?: string }
  if (!manifest || !Array.isArray(manifest.partUrls) || manifest.partUrls.length === 0) {
    throw new Error("Invalid manifest: partUrls required.");
  }

  const partUrls = manifest.partUrls;
  const partCount = partUrls.length;
  const fileSize = file.size;
  // Calculate part size. We assume the manifest was generated for this file size.
  // We divide equally, last part takes remainder.
  const partSize = Math.ceil(fileSize / partCount);

  const etags = [];
  let uploadedBytes = 0;

  for (let i = 0; i < partCount; i++) {
    const start = i * partSize;
    if (start >= fileSize) break; // Should not happen if calc is right
    const end = Math.min(start + partSize, fileSize);
    const chunk = file.slice(start, end);
    const url = partUrls[i];

    // Simple PUT to presigned URL
    const response = await fetch(url, {
      method: 'PUT',
      body: chunk
    });

    if (!response.ok) {
      throw new Error(`Failed to upload part ${i+1}: ${response.statusText}`);
    }

    const etag = response.headers.get('ETag');
    // ETag is often needed for completion.
    etags.push({ PartNumber: i + 1, ETag: etag });
    uploadedBytes += chunk.size;

    if (onProgress) {
      onProgress(uploadedBytes / fileSize);
    }
  }

  if (manifest.completeUrl) {
    const compRes = await fetch(manifest.completeUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ Parts: etags })
    });
    if (!compRes.ok) {
        throw new Error(`Failed to complete upload: ${compRes.statusText}`);
    }
  }

  return etags;
}
