// js/storage/r2-s3.js
import {
  S3Client,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
} from "https://esm.sh/@aws-sdk/client-s3@3.637.0?target=es2022&bundle";

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

export function makeR2Client({ accountId, accessKeyId, secretAccessKey }) {
  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error("Missing Cloudflare R2 credentials");
  }

  return new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: true,
  });
}

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

  const createCommand = new CreateMultipartUploadCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType || file.type || "application/octet-stream",
    CacheControl: computeCacheControl(key),
  });

  createCommand.middlewareStack.add(
    (next) => async (args) => {
      if (args?.request?.headers) {
        args.request.headers["cf-create-bucket-if-missing"] = "true";
      }
      return next(args);
    },
    { step: "build" }
  );

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
