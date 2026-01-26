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
  // manifest: {
  //   bucket: string,
  //   key: string,
  //   uploadId: string,
  //   parts: { partNumber: number, url: string }[],
  //   completeUrl?: string,
  //   partSize?: number
  // }
  if (!manifest || !Array.isArray(manifest.parts) || manifest.parts.length === 0) {
    throw new Error("Invalid manifest: 'parts' array required.");
  }

  // Ensure parts are sorted
  const parts = [...manifest.parts].sort((a, b) => a.partNumber - b.partNumber);

  const fileSize = file.size;
  const partCount = parts.length;

  // Determine part size
  // If not provided, assume standard S3 splitting (equal parts except last)
  const partSize = manifest.partSize || Math.ceil(fileSize / partCount);

  const etags = [];
  let uploadedBytes = 0;

  for (let i = 0; i < partCount; i++) {
    const part = parts[i];
    const partNum = part.partNumber;
    const url = part.url;

    // Calculate byte range
    const index = i;
    const start = index * partSize;
    if (start >= fileSize) break;

    const end = Math.min(start + partSize, fileSize);
    const chunk = file.slice(start, end);

    try {
        const response = await fetch(url, {
          method: 'PUT',
          body: chunk
        });

        if (!response.ok) {
          throw new Error(`Failed to upload part ${partNum}: ${response.status} ${response.statusText}`);
        }

        const etag = response.headers.get('ETag');
        if (!etag) {
             userLogger.warn(`Part ${partNum} uploaded but no ETag header received.`);
        }

        etags.push({ PartNumber: partNum, ETag: etag });
        uploadedBytes += chunk.size;

        if (onProgress) {
          onProgress(uploadedBytes / fileSize);
        }
    } catch (err) {
        throw new Error(`Network error uploading part ${partNum}: ${err.message}`);
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
