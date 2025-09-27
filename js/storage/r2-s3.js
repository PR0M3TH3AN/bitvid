// js/storage/r2-s3.js
import {
  S3Client,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
} from "https://esm.sh/@aws-sdk/client-s3@3.614.0?target=es2022&bundle";

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
  concurrency = 4,
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

  const { UploadId } = await s3.send(
    new CreateMultipartUploadCommand({
      Bucket: bucket,
      Key: key,
      ContentType: contentType || file.type || "video/mp4",
      CacheControl: "public, max-age=31536000, immutable",
    })
  );

  if (!UploadId) {
    throw new Error("Failed to start multipart upload");
  }

  const PART = 8 * 1024 * 1024;
  const total = file.size;
  const parts = [];
  let sent = 0;
  let partNumber = 1;
  const totalParts = Math.ceil(total / PART);
  const errors = [];

  const uploadPart = async () => {
    const start = sent;
    if (start >= total) {
      return null;
    }
    const end = Math.min(start + PART, total);
    const body = file.slice(start, end);
    const currentPart = partNumber++;
    sent = end;

    return s3
      .send(
        new UploadPartCommand({
          Bucket: bucket,
          Key: key,
          UploadId,
          PartNumber: currentPart,
          Body: body,
        })
      )
      .then(({ ETag }) => {
        parts.push({ ETag, PartNumber: currentPart });
        if (typeof onProgress === "function") {
          onProgress(end / total);
        }
      });
  };

  const workers = Array.from({ length: Math.max(1, concurrency) }, () =>
    (async () => {
      try {
        while (parts.length < totalParts) {
          const task = uploadPart();
          if (!task) {
            break;
          }
          await task;
        }
      } catch (error) {
        errors.push(error);
      }
    })()
  );

  try {
    await Promise.all(workers);
    if (errors.length > 0) {
      throw errors[0];
    }

    parts.sort((a, b) => a.PartNumber - b.PartNumber);

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
