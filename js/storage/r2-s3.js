// js/storage/r2-s3.js

<<<<<<< HEAD
const AWS_SDK_SPECIFIER = "https://esm.sh/@aws-sdk/client-s3@3.637.0?bundle";
=======
const AWS_SDK_SPECIFIER =
  "https://esm.sh/@aws-sdk/client-s3@3.637.0?target=es2022&bundle";
>>>>>>> origin/main

const disableNetworkImports = Boolean(
  globalThis?.__BITVID_DISABLE_NETWORK_IMPORTS__
);

let awsSdk = null;
let awsSdkLoadError = null;
let awsSdkLoadPromise = null;

function assignAwsSdk(module) {
  if (!module) {
    return;
  }

  awsSdk = {
    S3Client: module.S3Client,
    CreateBucketCommand: module.CreateBucketCommand,
    CreateMultipartUploadCommand: module.CreateMultipartUploadCommand,
    UploadPartCommand: module.UploadPartCommand,
    CompleteMultipartUploadCommand: module.CompleteMultipartUploadCommand,
    AbortMultipartUploadCommand: module.AbortMultipartUploadCommand,
<<<<<<< HEAD
    ListBucketsCommand: module.ListBucketsCommand,
    HeadBucketCommand: module.HeadBucketCommand,
    PutBucketCorsCommand: module.PutBucketCorsCommand,
    DeleteObjectCommand: module.DeleteObjectCommand,
=======
    HeadBucketCommand: module.HeadBucketCommand,
    PutBucketCorsCommand: module.PutBucketCorsCommand,
>>>>>>> origin/main
  };
}

async function loadAwsSdkModule() {
  if (awsSdk || awsSdkLoadError) {
    return awsSdk;
  }

  if (!awsSdkLoadPromise) {
    if (disableNetworkImports) {
      awsSdkLoadError = new Error(
        "Cloudflare R2 SDK network import has been disabled."
      );
      return null;
    }

    awsSdkLoadPromise = import(AWS_SDK_SPECIFIER)
      .then((module) => {
        assignAwsSdk(module);
        return awsSdk;
      })
      .catch((error) => {
        awsSdkLoadError = error || new Error("Failed to load R2 SDK module");
        throw awsSdkLoadError;
      });
  }

  try {
    return await awsSdkLoadPromise;
  } catch (error) {
    awsSdkLoadError = error;
    throw error;
  }
}

<<<<<<< HEAD
export async function testS3Connection(config) {
  if (!config) {
    throw new Error("Configuration required for testing S3 connection.");
  }

  await ensureR2SdkLoaded();

  const { ListBucketsCommand, HeadBucketCommand } = requireAwsSdk();

  const s3 = makeR2Client({
    accountId: config.accountId,
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    endpoint: config.endpoint,
    region: config.region,
  });

  // If bucket is specified, we check that specific bucket (permissions + existence).
  if (config.bucket) {
    try {
      await s3.send(new HeadBucketCommand({ Bucket: config.bucket }));
      return { success: true, message: `Successfully connected to bucket "${config.bucket}".` };
    } catch (error) {
      const status = error?.$metadata?.httpStatusCode || 0;
      if (status === 403) {
        throw new Error(`Access denied to bucket "${config.bucket}". Check your permissions.`);
      } else if (status === 404) {
        throw new Error(`Bucket "${config.bucket}" does not exist.`);
      }
      throw error;
    }
  }

  // Otherwise, we just list buckets to verify credentials.
  try {
    const response = await s3.send(new ListBucketsCommand({}));
    const count = response.Buckets ? response.Buckets.length : 0;
    return { success: true, message: `Connection successful. Found ${count} buckets.` };
  } catch (error) {
    const status = error?.$metadata?.httpStatusCode || 0;
    if (status === 403) {
      throw new Error("Access denied. Check your Access Key ID and Secret Access Key.");
    }
    throw error;
  }
}

=======
>>>>>>> origin/main
function requireAwsSdk() {
  if (awsSdk) {
    return awsSdk;
  }

  if (awsSdkLoadError) {
    throw awsSdkLoadError;
  }

  throw new Error(
    "Cloudflare R2 SDK has not finished loading. Call ensureR2SdkLoaded() first."
  );
}

export function ensureR2SdkLoaded() {
  return loadAwsSdkModule();
}

export function getR2SdkLoadError() {
  return awsSdkLoadError;
}

export function isR2SdkAvailable() {
  return Boolean(awsSdk);
}

if (!disableNetworkImports) {
  // Begin loading immediately in environments that support network imports.
  loadAwsSdkModule().catch(() => {
    // Errors are captured for later inspection by getR2SdkLoadError().
  });
}

function computeCacheControl(key) {
  if (!key) {
    return "public, max-age=3600";
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

  return "public, max-age=3600";
}

<<<<<<< HEAD
export function makeR2Client({
  accountId,
  accessKeyId,
  secretAccessKey,
  endpoint,
  region,
}) {
  if ((!accountId && !endpoint) || !accessKeyId || !secretAccessKey) {
    throw new Error("Missing S3/R2 credentials");
  }

  const { S3Client } = requireAwsSdk();
  const finalEndpoint =
    endpoint || `https://${accountId}.r2.cloudflarestorage.com`;

  return new S3Client({
    region: region || "auto",
    endpoint: finalEndpoint,
=======
export function makeR2Client({ accountId, accessKeyId, secretAccessKey }) {
  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error("Missing Cloudflare R2 credentials");
  }

  const { S3Client } = requireAwsSdk();

  return new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
>>>>>>> origin/main
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: true,
  });
}

<<<<<<< HEAD
export async function ensureBucketExists({ s3, bucket }) {
=======
async function ensureBucketExists({ s3, bucket }) {
>>>>>>> origin/main
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
    await s3.send(new CreateBucketCommand({ Bucket: bucket }));
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

export async function ensureBucketCors({ s3, bucket, origins }) {
  if (!s3) {
    throw new Error("S3 client is required to configure CORS");
  }
  if (!bucket) {
    throw new Error("Bucket name is required to configure CORS");
  }

  const { PutBucketCorsCommand } = requireAwsSdk();

  const allowedOrigins = (origins || []).filter(Boolean);
  if (allowedOrigins.length === 0) {
    return;
  }

  await ensureBucketExists({ s3, bucket });

  const command = new PutBucketCorsCommand({
    Bucket: bucket,
    CORSConfiguration: {
      CORSRules: [
        {
          AllowedHeaders: ["*"],
          AllowedMethods: ["GET", "HEAD", "PUT", "POST", "DELETE", "OPTIONS"],
          AllowedOrigins: allowedOrigins,
          ExposeHeaders: [
            "ETag",
            "Content-Length",
            "Content-Range",
            "Accept-Ranges",
          ],
          MaxAgeSeconds: 3600,
        },
      ],
    },
  });

  await s3.send(command);
}

<<<<<<< HEAD
export async function deleteObject({ s3, bucket, key }) {
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

=======
>>>>>>> origin/main
export async function multipartUpload({
  s3,
  bucket,
  key,
  file,
  contentType,
  onProgress,
}) {
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

<<<<<<< HEAD
  console.debug("[R2] Starting multipart upload for:", key);

=======
>>>>>>> origin/main
  const createCommand = new CreateMultipartUploadCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType || file.type || "application/octet-stream",
    CacheControl: computeCacheControl(key),
  });

<<<<<<< HEAD
=======
  createCommand.middlewareStack.add(
    (next) => async (args) => {
      if (args?.request?.headers) {
        args.request.headers["cf-create-bucket-if-missing"] = "true";
      }
      return next(args);
    },
    { step: "build" }
  );

>>>>>>> origin/main
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
