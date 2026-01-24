// js/storage/r2-s3.js

import {
  ensureS3SdkLoaded,
  getS3SdkLoadError,
  isS3SdkAvailable,
  makeS3Client,
  requireAwsSdk,
} from "./s3-client.js";
import {
  ensureBucketExists,
  ensureBucketCors,
  deleteObject,
  multipartUpload,
} from "./s3-multipart.js";

export async function testS3Connection(config) {
  if (!config) {
    throw new Error("Configuration required for testing S3 connection.");
  }

  await ensureS3SdkLoaded();

  const { ListBucketsCommand, HeadBucketCommand } = requireAwsSdk();

  const s3 = makeS3Client({
    endpoint: config.endpoint,
    region: config.region,
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    forcePathStyle: config.forcePathStyle,
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

  const finalEndpoint =
    endpoint || `https://${accountId}.r2.cloudflarestorage.com`;

  return makeS3Client({
    region: region || "auto",
    endpoint: finalEndpoint,
    accessKeyId,
    secretAccessKey,
    forcePathStyle: true,
  });
}

export { ensureBucketExists, ensureBucketCors, deleteObject, multipartUpload };
