// js/storage/s3-client.js

const AWS_SDK_SPECIFIER = "https://esm.sh/@aws-sdk/client-s3@3.637.0?bundle";

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
    ListBucketsCommand: module.ListBucketsCommand,
    HeadBucketCommand: module.HeadBucketCommand,
    GetBucketCorsCommand: module.GetBucketCorsCommand,
    PutBucketCorsCommand: module.PutBucketCorsCommand,
    DeleteObjectCommand: module.DeleteObjectCommand,
    PutObjectCommand: module.PutObjectCommand,
    GetObjectCommand: module.GetObjectCommand,
  };
}

async function loadAwsSdkModule() {
  if (awsSdk || awsSdkLoadError) {
    return awsSdk;
  }

  if (!awsSdkLoadPromise) {
    if (disableNetworkImports) {
      awsSdkLoadError = new Error("S3 SDK network import has been disabled.");
      return null;
    }

    awsSdkLoadPromise = import(AWS_SDK_SPECIFIER)
      .then((module) => {
        assignAwsSdk(module);
        return awsSdk;
      })
      .catch((error) => {
        awsSdkLoadError = error || new Error("Failed to load S3 SDK module");
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

export function requireAwsSdk() {
  if (awsSdk) {
    return awsSdk;
  }

  if (awsSdkLoadError) {
    throw awsSdkLoadError;
  }

  throw new Error("S3 SDK has not finished loading. Call ensureS3SdkLoaded() first.");
}

export function ensureS3SdkLoaded() {
  return loadAwsSdkModule();
}

export function getS3SdkLoadError() {
  return awsSdkLoadError;
}

export function isS3SdkAvailable() {
  return Boolean(awsSdk);
}

export function makeS3Client({
  endpoint,
  region,
  accessKeyId,
  secretAccessKey,
  forcePathStyle,
}) {
  if (!accessKeyId || !secretAccessKey) {
    throw new Error("Missing S3 credentials");
  }

  const { S3Client } = requireAwsSdk();

  return new S3Client({
    region: region || "auto",
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: Boolean(forcePathStyle),
  });
}

if (!disableNetworkImports) {
  // Begin loading immediately in environments that support network imports.
  loadAwsSdkModule().catch(() => {
    // Errors are captured for later inspection by getS3SdkLoadError().
  });
}
