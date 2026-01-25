import { ensureS3SdkLoaded, makeS3Client } from "../storage/s3-client.js";
import { multipartUpload } from "../storage/s3-multipart.js";
import { buildR2Key } from "../r2.js";
import {
  buildS3ObjectUrl,
  getCorsOrigins,
  prepareS3Connection,
  validateS3Connection,
} from "./s3Service.js";
import { userLogger } from "../utils/logger.js";
import {
  getVideoNoteErrorMessage,
  normalizeVideoNotePayload,
  VIDEO_NOTE_ERROR_CODES,
} from "./videoNotePayload.js";

const STATUS_VARIANTS = new Set(["info", "success", "error", "warning"]);
const INFO_HASH_PATTERN = /^[a-f0-9]{40}$/;

function normalizeInfoHash(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function isValidInfoHash(value) {
  return INFO_HASH_PATTERN.test(value);
}

class S3UploadService {
  constructor() {
    this.listeners = new Map();
  }

  on(event, handler) {
    if (typeof handler !== "function") {
      return () => {};
    }
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    const handlers = this.listeners.get(event);
    handlers.add(handler);
    return () => {
      handlers.delete(handler);
      if (!handlers.size) {
        this.listeners.delete(event);
      }
    };
  }

  emit(event, detail) {
    const handlers = this.listeners.get(event);
    if (!handlers) {
      return;
    }
    for (const handler of handlers) {
      try {
        handler(detail);
      } catch (err) {
        userLogger.error("[s3UploadService] Listener error for", event, err);
      }
    }
  }

  normalizeStatusVariant(variant) {
    if (STATUS_VARIANTS.has(variant)) {
      return variant;
    }
    return "info";
  }

  setUploadStatus(message = "", variant = "info") {
    this.emit("uploadStatus", {
      message: message || "",
      variant: this.normalizeStatusVariant(variant),
    });
  }

  setUploading(isUploading) {
    this.emit("uploadStateChange", { isUploading: Boolean(isUploading) });
  }

  updateProgress(fraction) {
    this.emit("uploadProgress", { fraction });
  }

  async verifyConnection({
    settings = {},
    createBucketIfMissing = true,
    origins = null,
  } = {}) {
    const normalized = validateS3Connection(settings);
    const allowedOrigins = Array.isArray(origins) ? origins : getCorsOrigins();
    const prepared = await prepareS3Connection({
      ...normalized,
      origins: allowedOrigins,
      createBucketIfMissing,
    });
    return prepared;
  }

  async prepareUpload(settings = {}, { createBucketIfMissing = true } = {}) {
    const prepared = await this.verifyConnection({ settings, createBucketIfMissing });
    return {
      settings: prepared,
      bucketEntry: {
        bucket: prepared.bucket,
        publicBaseUrl: prepared.publicBaseUrl,
      },
    };
  }

  async uploadFile({
    file,
    endpoint,
    region,
    accessKeyId,
    secretAccessKey,
    forcePathStyle,
    bucket,
    key,
    onProgress,
    createBucketIfMissing = true,
  } = {}) {
    if (
      !file ||
      !bucket ||
      !key ||
      !endpoint ||
      !accessKeyId ||
      !secretAccessKey
    ) {
      throw new Error("Missing required parameters for uploadFile");
    }

    await ensureS3SdkLoaded();

    const s3 = makeS3Client({
      endpoint,
      region,
      accessKeyId,
      secretAccessKey,
      forcePathStyle: Boolean(forcePathStyle),
    });

    await multipartUpload({
      s3,
      bucket,
      key,
      file,
      contentType: file.type || "application/octet-stream",
      createBucketIfMissing,
      region,
      onProgress: (fraction) => {
        if (typeof onProgress === "function") {
          onProgress(fraction);
        }
      },
    });

    return { bucket, key };
  }

  async uploadVideo({
    npub = "",
    file = null,
    thumbnailFile = null,
    torrentFile = null,
    metadata = {},
    infoHash = "",
    settings = {},
    createBucketIfMissing = true,
    publishVideoNote,
    onReset,
    forcedVideoKey = "",
    forcedVideoUrl = "",
    forcedTorrentKey = "",
    forcedTorrentUrl = "",
  } = {}) {
    if (!npub) {
      this.setUploadStatus("Unable to encode npub.", "error");
      return false;
    }

    const rawTitleCandidate =
      metadata && typeof metadata === "object" ? metadata.title : metadata;
    const title =
      typeof rawTitleCandidate === "string"
        ? rawTitleCandidate.trim()
        : String(rawTitleCandidate ?? "").trim();

    if (!title) {
      this.setUploadStatus(
        getVideoNoteErrorMessage(VIDEO_NOTE_ERROR_CODES.MISSING_TITLE),
        "error"
      );
      return false;
    }

    if (!file) {
      this.setUploadStatus("Select a video or HLS file to upload.", "error");
      return false;
    }

    let normalized = null;
    try {
      normalized = validateS3Connection(settings);
    } catch (err) {
      this.setUploadStatus(err?.message || "Invalid S3 settings.", "error");
      return false;
    }

    this.setUploading(true);
    this.updateProgress(0);

    try {
      await ensureS3SdkLoaded();

      const s3 = makeS3Client({
        endpoint: normalized.endpoint,
        region: normalized.region,
        accessKeyId: normalized.accessKeyId,
        secretAccessKey: normalized.secretAccessKey,
        forcePathStyle: Boolean(normalized.forcePathStyle),
      });

      const key = forcedVideoKey || buildR2Key(npub, file);
      const publicUrl =
        forcedVideoUrl ||
        buildS3ObjectUrl({
          publicBaseUrl: normalized.publicBaseUrl,
          endpoint: normalized.endpoint,
          bucket: normalized.bucket,
          key,
          forcePathStyle: normalized.forcePathStyle,
        });

      let statusMessage = `Uploading to ${normalized.bucket}…`;
      this.setUploadStatus(statusMessage, "info");

      if (thumbnailFile) {
        this.setUploadStatus("Uploading thumbnail...", "info");
        const thumbExt = thumbnailFile.name.split(".").pop() || "jpg";
        const thumbKey = key.replace(/\.[^/.]+$/, "") + `.thumb.${thumbExt}`;
        try {
          await multipartUpload({
            s3,
            bucket: normalized.bucket,
            key: thumbKey,
            file: thumbnailFile,
            contentType: thumbnailFile.type || "image/jpeg",
            createBucketIfMissing,
            region: normalized.region,
          });
          const thumbUrl = buildS3ObjectUrl({
            publicBaseUrl: normalized.publicBaseUrl,
            endpoint: normalized.endpoint,
            bucket: normalized.bucket,
            key: thumbKey,
            forcePathStyle: normalized.forcePathStyle,
          });
          if (typeof metadata === "object") {
            metadata.thumbnail = thumbUrl;
          }
        } catch (err) {
          userLogger.warn("Thumbnail upload failed, continuing with video...", err);
        }
      }

      this.setUploadStatus(statusMessage, "info");

      await multipartUpload({
        s3,
        bucket: normalized.bucket,
        key,
        file,
        contentType: file.type || "application/octet-stream",
        createBucketIfMissing,
        region: normalized.region,
        onProgress: (fraction) => {
          this.updateProgress(fraction);
        },
      });

      let torrentUrl = forcedTorrentUrl || "";
      if (torrentFile) {
        this.setUploadStatus("Uploading torrent metadata...", "info");
        const torrentKey =
          forcedTorrentKey ||
          (() => {
            const baseKey = key.replace(/\.[^/.]+$/, "");
            if (baseKey && baseKey !== key) {
              return `${baseKey}.torrent`;
            }
            return `${key}.torrent`;
          })();
        try {
          await multipartUpload({
            s3,
            bucket: normalized.bucket,
            key: torrentKey,
            file: torrentFile,
            contentType: "application/x-bittorrent",
            createBucketIfMissing,
            region: normalized.region,
          });
          if (!torrentUrl) {
            torrentUrl = buildS3ObjectUrl({
              publicBaseUrl: normalized.publicBaseUrl,
              endpoint: normalized.endpoint,
              bucket: normalized.bucket,
              key: torrentKey,
              forcePathStyle: normalized.forcePathStyle,
            });
          }
        } catch (err) {
          userLogger.warn("Torrent metadata upload failed, continuing...", err);
        }
      }

      if (typeof publishVideoNote !== "function") {
        userLogger.warn("publishVideoNote handler missing; skipping publish step.");
        return false;
      }

      const normalizedInfoHash = normalizeInfoHash(infoHash);
      const hasValidInfoHash = isValidInfoHash(normalizedInfoHash);
      let generatedMagnet = "";
      let generatedWs = "";

      if (hasValidInfoHash) {
        const encodedDn = encodeURIComponent(file.name);
        const encodedWs = encodeURIComponent(publicUrl);
        let magnet = `magnet:?xt=urn:btih:${normalizedInfoHash}&dn=${encodedDn}&ws=${encodedWs}`;
        if (torrentUrl) {
          const encodedXs = encodeURIComponent(torrentUrl);
          magnet += `&xs=${encodedXs}`;
        }
        generatedMagnet = magnet;
        generatedWs = publicUrl;
      } else {
        if (infoHash) {
          userLogger.warn("Invalid info hash provided. Skipping magnet generation.", infoHash);
        }
        this.setUploadStatus(
          "Info hash missing or invalid. Publishing URL-first without WebTorrent fallback.",
          "warning"
        );
      }

      const rawVideoPayload = {
        title,
        url: publicUrl,
        magnet: generatedMagnet || (metadata?.magnet ?? ""),
        thumbnail: metadata?.thumbnail ?? "",
        description: metadata?.description ?? "",
        ws: generatedWs || (metadata?.ws ?? ""),
        xs: torrentUrl || (metadata?.xs ?? ""),
        enableComments: metadata?.enableComments,
        isNsfw: metadata?.isNsfw,
        isForKids: metadata?.isForKids,
      };

      const { payload, errors } = normalizeVideoNotePayload(rawVideoPayload);
      if (errors.length) {
        const message = getVideoNoteErrorMessage(errors[0]);
        this.setUploadStatus(message, "error");
        return false;
      }

      const published = await publishVideoNote(payload, {
        onSuccess: () => {
          if (typeof onReset === "function") {
            onReset();
          }
        },
      });

      if (published) {
        this.setUploadStatus(`Published ${publicUrl}`, "success");
      }
      return Boolean(published);
    } catch (err) {
      userLogger.error("S3 upload failed:", err);
      this.setUploadStatus(
        err?.message ? `Upload failed: ${err.message}` : "Upload failed.",
        "error"
      );
      return false;
    } finally {
      this.setUploading(false);
      this.updateProgress(Number.NaN);
    }
  }
}

const s3UploadService = new S3UploadService();

export default s3UploadService;
