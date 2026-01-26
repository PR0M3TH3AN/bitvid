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
import { userLogger } from "../utils/logger.js";

export async function testS3Connection(config) {
  if (!config) {
    throw new Error("Configuration required for testing S3 connection.");
  }

  await ensureS3SdkLoaded();

  const {
    ListBucketsCommand,
    HeadBucketCommand,
    PutObjectCommand,
    GetObjectCommand,
    DeleteObjectCommand,
  } = requireAwsSdk();

  const s3 = makeS3Client({
    endpoint: config.endpoint,
    region: config.region,
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    forcePathStyle: config.forcePathStyle,
  });

  // If bucket is specified, we perform a rigorous Read/Write/Delete test.
  if (config.bucket) {
    userLogger.info(`[Storage Test] Checking accessibility of bucket "${config.bucket}"...`);
    try {
      await s3.send(new HeadBucketCommand({ Bucket: config.bucket }));
      userLogger.info(`[Storage Test] Bucket "${config.bucket}" exists and is accessible.`);
    } catch (error) {
      const status = error?.$metadata?.httpStatusCode || 0;
      if (status === 403) {
        throw new Error(`Access denied to bucket "${config.bucket}". Check your permissions.`);
      } else if (status === 404) {
        throw new Error(`Bucket "${config.bucket}" does not exist.`);
      }
      throw error;
    }

    // Prepare temp file
    const timestamp = Date.now();
    const testKey = `bitvid-test-connection-${timestamp}.txt`;
    const fileContent = `bitvid storage test ${timestamp}`;

    try {
      // 1. Upload
      userLogger.info(`[Storage Test] Uploading temporary file "${testKey}"...`);
      await s3.send(
        new PutObjectCommand({
          Bucket: config.bucket,
          Key: testKey,
          Body: fileContent,
          ContentType: "text/plain",
        })
      );
      userLogger.info("[Storage Test] Upload successful.");

      // 2. Retrieve
      userLogger.info(`[Storage Test] Verifying file retrieval for "${testKey}"...`);
      await s3.send(
        new GetObjectCommand({
          Bucket: config.bucket,
          Key: testKey,
        })
      );
      userLogger.info("[Storage Test] File retrieval successful.");

      // 3. Delete
      userLogger.info(`[Storage Test] Cleaning up temporary file "${testKey}"...`);
      await s3.send(
        new DeleteObjectCommand({
          Bucket: config.bucket,
          Key: testKey,
        })
      );
      userLogger.info("[Storage Test] Cleanup successful.");

      return {
        success: true,
        message: `Connection verified! Successfully uploaded, retrieved, and deleted test file in "${config.bucket}".`,
      };
    } catch (error) {
      userLogger.error("[Storage Test] Operation failed:", error);

      // Attempt cleanup if upload succeeded but retrieval failed
      try {
        await s3.send(
          new DeleteObjectCommand({
            Bucket: config.bucket,
            Key: testKey,
          })
        ).catch(() => {});
      } catch (cleanupErr) {
        // ignore
      }

      throw error;
    }
  }

  // Otherwise, we just list buckets to verify credentials.
  userLogger.info("[Storage Test] No bucket specified. Listing buckets to verify credentials...");
  try {
    const response = await s3.send(new ListBucketsCommand({}));
    const count = response.Buckets ? response.Buckets.length : 0;
    userLogger.info(`[Storage Test] Connection successful. Found ${count} buckets.`);
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
