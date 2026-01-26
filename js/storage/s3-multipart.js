// js/storage/s3-multipart.js

import { requireAwsSdk } from "./s3-client.js";
import logger from "../utils/logger.js";

const DEFAULT_CACHE_CONTROL = "public, max-age=3600";

function normalizeRegion(region) {
  if (!region) {
    return "";
  }
  const trimmed = String(region).trim();
  if (!trimmed || trimmed.toLowerCase() === "auto") {
    return "";
  }
  return trimmed;
}

function getCreateBucketConfig(region) {
  const normalized = normalizeRegion(region);
  if (!normalized || normalized === "us-east-1") {
    return {};
  }
  return {
    CreateBucketConfiguration: {
      LocationConstraint: normalized,
    },
  };
}

function computeCacheControl(key) {
  if (!key) {
    return DEFAULT_CACHE_CONTROL;
  }

  const lower = String(key).toLowerCase();
  if (/(?:\.)(m3u8|mpd)$/.test(lower)) {
    return "public, max-age=60, must-revalidate";
  }

  if (
    /\.(m4s|ts|mp4|webm|mov|mkv|png|jpg|jpeg|gif|svg|vtt|srt|mpg|mpeg)$/.test(
      lower
    )
  ) {
    return "public, max-age=31536000, immutable";
  }

  return DEFAULT_CACHE_CONTROL;
}

export async function ensureBucketExists({ s3, bucket, region } = {}) {
  if (!s3) {
    throw new Error("S3 client is required to ensure buckets");
  }
  if (!bucket) {
    throw new Error("Bucket name is required to ensure buckets");
  }

  const { CreateBucketCommand, HeadBucketCommand } = requireAwsSdk();

  try {
    await s3.send(new HeadBucketCommand({ Bucket: bucket }));
    return;
  } catch (error) {
    const status = error?.$metadata?.httpStatusCode || 0;
    const code = error?.name || error?.Code || "";
    if (status !== 404 && code !== "NotFound" && code !== "NoSuchBucket") {
      throw error;
    }
  }

  try {
    await s3.send(
      new CreateBucketCommand({
        Bucket: bucket,
        ...getCreateBucketConfig(region),
      })
    );
  } catch (error) {
    const status = error?.$metadata?.httpStatusCode || 0;
    const code = error?.name || error?.Code || "";
    if (
      status === 409 ||
      code === "BucketAlreadyOwnedByYou" ||
      code === "BucketAlreadyExists"
    ) {
      return;
    }
    throw error;
  }
}

export async function ensureBucketCors({
  s3,
  bucket,
  origins,
  region,
  merge = true,
} = {}) {
  if (!s3) {
    throw new Error("S3 client is required to configure CORS");
  }
  if (!bucket) {
    throw new Error("Bucket name is required to configure CORS");
  }

  const { PutBucketCorsCommand, GetBucketCorsCommand } = requireAwsSdk();

  const allowedOrigins = (origins || []).filter(Boolean);
  if (allowedOrigins.length === 0) {
    return;
  }

  await ensureBucketExists({ s3, bucket, region });

  const desiredRule = {
    AllowedHeaders: ["*"],
    AllowedMethods: ["GET", "HEAD", "PUT", "POST", "DELETE", "OPTIONS"],
    ExposeHeaders: [
      "ETag",
      "Content-Length",
      "Content-Range",
      "Accept-Ranges",
    ],
    MaxAgeSeconds: 3600,
  };

  let rules = [];

  if (merge) {
    try {
      const current = await s3.send(
        new GetBucketCorsCommand({ Bucket: bucket })
      );
      if (current.CORSConfiguration?.CORSRules) {
        rules = current.CORSConfiguration.CORSRules;
      }
    } catch (err) {
      // Ignore 404 or other fetch errors, start fresh
    }
  }

  // Iterate over provided origins to ensure each is covered
  for (const origin of allowedOrigins) {
    const existingRule = rules.find(
      (r) =>
        (r.AllowedOrigins || []).includes(origin) ||
        (r.AllowedOrigins || []).includes("*")
    );

    if (existingRule) {
      // Update existing rule to be permissive enough
      if (!existingRule.AllowedHeaders?.includes("*")) {
        existingRule.AllowedHeaders = ["*"];
      }
      // Ensure methods
      const methods = new Set(existingRule.AllowedMethods || []);
      desiredRule.AllowedMethods.forEach((m) => methods.add(m));
      existingRule.AllowedMethods = Array.from(methods);

      // Ensure ExposeHeaders
      const exposed = new Set(existingRule.ExposeHeaders || []);
      desiredRule.ExposeHeaders.forEach((h) => exposed.add(h));
      existingRule.ExposeHeaders = Array.from(exposed);
    } else {
      // If no matching rule, add a new one for this origin.
      // We explicitly set AllowedOrigins to just this origin to be specific.
      rules.unshift({
        ...desiredRule,
        AllowedOrigins: [origin],
      });
    }
  }

  // Fallback if no rules exist yet (no merge, or merge found nothing)
  if (rules.length === 0) {
    rules.push({
      ...desiredRule,
      AllowedOrigins: allowedOrigins,
    });
  }

  const command = new PutBucketCorsCommand({
    Bucket: bucket,
    CORSConfiguration: {
      CORSRules: rules,
    },
  });

  await s3.send(command);
}

export async function deleteObject({ s3, bucket, key } = {}) {
  if (!s3 || !bucket || !key) {
    throw new Error("Missing required parameters for deleteObject");
  }

  const { DeleteObjectCommand } = requireAwsSdk();

  try {
    await s3.send(
      new DeleteObjectCommand({
        Bucket: bucket,
        Key: key,
      })
    );
  } catch (error) {
    // We treat 404 (NoSuchKey) as success since the object is gone.
    const status = error?.$metadata?.httpStatusCode || 0;
    const code = error?.name || error?.Code || "";
    if (status !== 404 && code !== "NoSuchKey") {
      throw error;
    }
  }
}

export async function multipartUpload({
  s3,
  bucket,
  key,
  file,
  contentType,
  onProgress,
  createBucketIfMissing = false,
  region,
} = {}) {
  if (!s3) {
    throw new Error("S3 client is required");
  }
  if (!bucket) {
    throw new Error("Bucket is required");
  }
  if (!key) {
    throw new Error("Object key is required");
  }
  if (!file) {
    throw new Error("File is required");
  }

  const {
    CreateMultipartUploadCommand,
    UploadPartCommand,
    CompleteMultipartUploadCommand,
    AbortMultipartUploadCommand,
  } = requireAwsSdk();

  if (createBucketIfMissing) {
    try {
      await ensureBucketExists({ s3, bucket, region });
    } catch (error) {
      logger.dev.warn(
        "[S3 multipart] Bucket creation check failed, continuing anyway.",
        error
      );
    }
  }

  logger.dev.debug("[S3 multipart] Starting multipart upload for:", key);

  const createCommand = new CreateMultipartUploadCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType || file.type || "application/octet-stream",
    CacheControl: computeCacheControl(key),
  });

  const { UploadId } = await s3.send(createCommand);

  if (!UploadId) {
    throw new Error("Failed to start multipart upload");
  }

  const MIN_PART = 5 * 1024 * 1024;
  const maxParts = 10000;
  const calculated = Math.ceil(file.size / maxParts);
  const partSize = Math.max(MIN_PART, calculated);
  const total = file.size;
  const parts = [];
  let uploadedBytes = 0;
  let partNumber = 1;

  if (typeof onProgress === "function") {
    onProgress(0);
  }

  try {
    while (uploadedBytes < total) {
      const start = uploadedBytes;
      const end = Math.min(start + partSize, total);
      const chunk = file.slice(start, end);

      const { ETag } = await s3.send(
        new UploadPartCommand({
          Bucket: bucket,
          Key: key,
          UploadId,
          PartNumber: partNumber,
          Body: chunk,
        })
      );

      parts.push({ ETag, PartNumber: partNumber });
      uploadedBytes = end;
      partNumber += 1;

      if (typeof onProgress === "function") {
        onProgress(uploadedBytes / total);
      }
    }

    await s3.send(
      new CompleteMultipartUploadCommand({
        Bucket: bucket,
        Key: key,
        UploadId,
        MultipartUpload: { Parts: parts },
      })
    );
  } catch (error) {
    await s3
      .send(
        new AbortMultipartUploadCommand({
          Bucket: bucket,
          Key: key,
          UploadId,
        })
      )
      .catch(() => {});
    throw error;
  }
}
