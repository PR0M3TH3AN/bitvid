/**
 * js/services/r2Service.js
 *
 * Service responsible for managing Cloudflare R2 uploads and configuration.
 *
 * Key Responsibilities:
 * - Managing user R2 credentials and bucket settings.
 * - performing S3-compatible multipart uploads (via `js/storage/s3-multipart.js`).
 * - Orchestrating the "Hybrid" video hosting strategy:
 *   1. Videos are uploaded to R2 (S3) for reliable direct hosting.
 *   2. A `.torrent` file is generated and uploaded alongside the video.
 *   3. The final Magnet URI embeds the R2 URL as a "WebSeed" (`ws=`) and the
 *      torrent file as a metadata source (`xs=`).
 *
 * This allows clients to stream directly from R2 (fast, reliable) while simultaneously
 * joining the P2P swarm. If R2 bandwidth runs out or the link breaks, the swarm takes over.
 */

import {
  buildR2Key,
  buildPublicUrl,
  computeStorageContentHash,
} from "../r2.js";
import {
  sanitizeBucketName,
  ensureBucket,
  putCors,
  attachCustomDomainAndWait,
  setManagedDomain,
  deriveShortSubdomain,
} from "../storage/r2-mgmt.js";
import { makeR2Client } from "../storage/r2-s3.js";
import {
  multipartUpload,
  ensureBucketCors,
  ensureBucketExists,
  deleteObject,
} from "../storage/s3-multipart.js";
import { ensureS3SdkLoaded, makeS3Client } from "../storage/s3-client.js";
import { truncateMiddle } from "../utils/formatters.js";
import { userLogger, devLogger } from "../utils/logger.js";
import {
  buildStoragePointerValue,
  buildStoragePrefixFromKey,
  collectVideoStorageKeys,
} from "../utils/storagePointer.js";
import { safeEncodeNpub } from "../utils/nostrHelpers.js";
import { isLikelyCorsError } from "../utils/uploadErrorHints.js";
import {
  getVideoNoteErrorMessage,
  normalizeVideoNotePayload,
  VIDEO_NOTE_ERROR_CODES,
} from "./videoNotePayload.js";
import storageService from "./storageService.js";
import {
  normalizeInfoHash,
  isValidInfoHash,
  resolveUploadIdentifier,
  buildCorsGuidance,
  createDefaultSettings,
  safeDecodeNpub,
  verifyPublicAccess as verifyPublicAccessHelper,
} from "./r2ServiceHelpers.js";

const STATUS_VARIANTS = new Set(["info", "success", "error", "warning"]);

// Shared CORS-error classifier (also used by s3UploadService). Re-exported here
// for backward compatibility with existing imports/tests.
export { isLikelyCorsError };

export class R2Service {
  constructor({
    makeR2Client: makeR2ClientOverride,
    makeS3Client: makeS3ClientOverride,
    multipartUpload: multipartUploadOverride,
    ensureBucketExists: ensureBucketExistsOverride,
    ensureBucketCors: ensureBucketCorsOverride,
    deleteObject: deleteObjectOverride,
  } = {}) {
    this.listeners = new Map();
    this.cloudflareSettings = null;
    this.makeR2Client = makeR2ClientOverride || makeR2Client;
    this.makeS3Client = makeS3ClientOverride || makeS3Client;
    this.multipartUpload = multipartUploadOverride || multipartUpload;
    this.ensureBucketExists = ensureBucketExistsOverride || ensureBucketExists;
    this.ensureBucketCors = ensureBucketCorsOverride || ensureBucketCors;
    this.deleteObject = deleteObjectOverride || deleteObject;
  }

  /**
   * Best-effort deletion of the R2/S3 objects backing one or more video notes
   * (the video file, its sibling `.torrent`, and the thumbnail). Used so that
   * deleting/superseding a video also removes its bytes from storage instead of
   * leaving them publicly downloadable forever.
   *
   * Safety: only objects whose URL lives under the owner's configured bucket
   * public base URL are touched (external links are ignored), and the method
   * NEVER throws — storage cleanup must not block note deletion. Returns a
   * summary describing what happened.
   *
   * @param {object} params
   * @param {Array|object} params.videos - parsed video note(s) with url/thumbnail
   * @param {string} [params.npub] - owner npub (preferred)
   * @param {string} [params.pubkey] - owner hex pubkey (encoded to npub if npub absent)
   * @param {object} [params.credentials] - pre-resolved connection settings
   * @returns {Promise<{deleted:string[],failed:Array,skipped:boolean,reason:string}>}
   */
  async deleteVideoStorage({
    videos = [],
    npub = "",
    pubkey = "",
    credentials = null,
  } = {}) {
    const list = (Array.isArray(videos) ? videos : [videos]).filter(
      (entry) => entry && typeof entry === "object"
    );
    const summary = { deleted: [], failed: [], skipped: false, reason: "" };
    const skip = (reason) => {
      summary.skipped = true;
      summary.reason = reason;
      return summary;
    };

    if (!list.length) {
      return skip("no-videos");
    }

    let resolvedNpub = (npub || "").trim();
    if (!resolvedNpub && pubkey) {
      resolvedNpub = safeEncodeNpub(pubkey) || "";
    }

    let settings = credentials;
    if (!settings && resolvedNpub) {
      try {
        settings = await this.resolveConnection(resolvedNpub);
      } catch (err) {
        devLogger.warn(
          "[R2Service] deleteVideoStorage: failed to resolve connection:",
          err
        );
      }
    }
    if (!settings) {
      return skip("no-connection");
    }

    const accessKeyId = (settings.accessKeyId || "").trim();
    const secretAccessKey = (settings.secretAccessKey || "").trim();
    const bucket = (settings.bucket || "").trim();
    const publicBaseUrl = (
      settings.publicBaseUrl ||
      settings.baseDomain ||
      ""
    ).trim();

    if (!accessKeyId || !secretAccessKey) {
      // Storage is locked / keys unavailable — can't delete without them.
      return skip("storage-locked");
    }
    if (!bucket || !publicBaseUrl) {
      return skip("missing-bucket-or-base-url");
    }

    const keys = collectVideoStorageKeys({ videos: list, publicBaseUrl });
    if (!keys.length) {
      return skip("no-matching-objects");
    }

    let s3;
    try {
      await ensureS3SdkLoaded();
      // Provider-aware client: Cloudflare R2 is always path-style; a generic S3
      // bucket may be virtual-hosted-style, so honor the connection's
      // forcePathStyle (mirrors uploadFile). Using makeR2Client unconditionally
      // here forced path-style and broke cleanup for vhost-style S3 buckets.
      const useR2 =
        settings.provider === "cloudflare_r2" || Boolean(settings.accountId);
      if (useR2) {
        s3 = this.makeR2Client({
          accountId: settings.accountId,
          endpoint: settings.endpoint,
          accessKeyId,
          secretAccessKey,
          region: settings.region,
        });
      } else {
        s3 = this.makeS3Client({
          endpoint: settings.endpoint,
          region: settings.region,
          accessKeyId,
          secretAccessKey,
          forcePathStyle: Boolean(settings.forcePathStyle),
        });
      }
    } catch (err) {
      devLogger.warn(
        "[R2Service] deleteVideoStorage: failed to build storage client:",
        err
      );
      return skip("client-error");
    }

    for (const key of keys) {
      try {
        // deleteObject already treats 404/NoSuchKey as success.
        await this.deleteObject({ s3, bucket, key });
        summary.deleted.push(key);
      } catch (err) {
        summary.failed.push({ key, error: err?.message || String(err) });
        devLogger.warn(`[R2Service] Failed to delete storage object ${key}:`, err);
      }
    }
    return summary;
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
        userLogger.error("[r2Service] Listener error for", event, err);
      }
    }
  }

  getSettings() {
    return this.cloudflareSettings || createDefaultSettings();
  }

  setSettings(settings) {
    this.cloudflareSettings = settings ? { ...settings } : null;
    this.emit("settingsChanged", { settings: this.getSettings() });
  }

  normalizeStatusVariant(variant) {
    if (STATUS_VARIANTS.has(variant)) {
      return variant;
    }
    return "info";
  }

  setCloudflareSettingsStatus(message = "", variant = "info") {
    this.emit("settingsStatus", {
      message: message || "",
      variant: this.normalizeStatusVariant(variant),
    });
  }

  setCloudflareUploadStatus(message = "", variant = "info") {
    this.emit("uploadStatus", {
      message: message || "",
      variant: this.normalizeStatusVariant(variant),
    });
  }

  setCloudflareUploading(isUploading) {
    this.emit("uploadStateChange", { isUploading: Boolean(isUploading) });
  }

  updateCloudflareProgress(fraction) {
    this.emit("uploadProgress", { fraction });
  }

  buildNip71MetadataForUpload(
    existingMetadata,
    { publicUrl = "", file = null, infoHash = "" } = {},
  ) {
    const base =
      existingMetadata && typeof existingMetadata === "object"
        ? { ...existingMetadata }
        : {};

    const cloneImetaVariant = (variant) => {
      if (!variant || typeof variant !== "object") {
        return {
          m: "",
          dim: "",
          url: "",
          x: "",
          image: [],
          fallback: [],
          service: [],
          autoGenerated: true,
        };
      }
      return {
        ...variant,
        image: Array.isArray(variant.image) ? [...variant.image] : [],
        fallback: Array.isArray(variant.fallback) ? [...variant.fallback] : [],
        service: Array.isArray(variant.service) ? [...variant.service] : [],
      };
    };

    const imetaList = Array.isArray(base.imeta)
      ? base.imeta.map((variant) => cloneImetaVariant(variant))
      : [];

    if (!imetaList.length) {
      imetaList.push({
        m: "",
        dim: "",
        url: "",
        x: "",
        image: [],
        fallback: [],
        service: [],
        autoGenerated: true,
      });
    } else {
      const primary = imetaList[0];
      if (!Array.isArray(primary.image)) primary.image = [];
      if (!Array.isArray(primary.fallback)) primary.fallback = [];
      if (!Array.isArray(primary.service)) primary.service = [];
    }

    const primaryVariant = imetaList[0];
    const normalizedUrl =
      typeof publicUrl === "string"
        ? publicUrl.trim()
        : String(publicUrl || "").trim();
    if (
      normalizedUrl &&
      (!primaryVariant.url || !String(primaryVariant.url).trim())
    ) {
      primaryVariant.url = normalizedUrl;
    }

    const mimeType =
      file && typeof file.type === "string" ? file.type.trim() : "";
    if (mimeType && (!primaryVariant.m || !String(primaryVariant.m).trim())) {
      primaryVariant.m = mimeType;
    }

    const normalizedHash = normalizeInfoHash(infoHash);
    if (
      normalizedHash &&
      isValidInfoHash(normalizedHash) &&
      (!primaryVariant.x || !String(primaryVariant.x).trim())
    ) {
      primaryVariant.x = normalizedHash;
    }

    base.imeta = imetaList;

    return base;
  }

  populateCloudflareSettingsInputs(settings) {
    const data = {
      accountId: settings?.accountId || "",
      accessKeyId: settings?.accessKeyId || "",
      secretAccessKey: settings?.secretAccessKey || "",
      baseDomain: settings?.baseDomain || "",
    };

    this.setCloudflareSettingsStatus("");
    this.emit("settingsPopulated", { settings: data });
  }

  async loadSettings() {
    const settings = createDefaultSettings();
    this.setSettings(settings);
    this.populateCloudflareSettingsInputs(settings);
    this.setCloudflareSettingsStatus(
      "Legacy Cloudflare settings have been retired. Use the Storage tab.",
      "warning"
    );
    return settings;
  }

  async handleCloudflareSettingsSubmit(formValues = {}, { quiet = false } = {}) {
    if (!quiet) {
      this.setCloudflareSettingsStatus(
        "Legacy settings are disabled. Configure Cloudflare R2 in the Storage tab.",
        "error"
      );
    }
    return false;
  }

  async saveSettings(formValues = {}, options = {}) {
    return this.handleCloudflareSettingsSubmit(formValues, options);
  }

  /**
   * Resolves connection credentials for the given npub.
   * Priority:
   * 1. StorageService (Encrypted)
   * 2. Legacy Settings (Plaintext)
   */
  async resolveConnection(npub) {
    if (!npub) return null;

    // 1. Try StorageService
    const pubkey = safeDecodeNpub(npub);
    if (pubkey && storageService) {
      try {
        const connections = await storageService.listConnections(pubkey);
        if (Array.isArray(connections) && connections.length > 0) {
          let target = connections.find(
            (c) => c.meta && c.meta.defaultForUploads
          );
          if (!target) {
            // Prefer R2, else first
            target = connections.find(
              (c) => c.provider === "cloudflare_r2"
            );
          }
          if (!target) {
            target = connections[0];
          }

          if (target) {
            if (storageService.isUnlocked(pubkey)) {
              const details = await storageService.getConnection(
                pubkey,
                target.id
              );
              if (details) {
                const provider =
                  details.provider || details.meta?.provider || "";
                const publicBaseUrl =
                  details.meta?.publicBaseUrl ||
                  details.meta?.baseDomain ||
                  details.meta?.publicUrl ||
                  "";
                const forcePathStyle =
                  typeof details.forcePathStyle === "boolean"
                    ? details.forcePathStyle
                    : typeof details.meta?.forcePathStyle === "boolean"
                    ? details.meta.forcePathStyle
                    : undefined;
                // Map to R2 settings format
                return {
                  provider,
                  accountId: details.accountId || details.meta?.accountId || "",
                  endpoint: details.endpoint || details.meta?.endpoint || "",
                  bucket: details.bucket || details.meta?.bucket || "",
                  region: details.region || details.meta?.region || "auto",
                  accessKeyId: details.accessKeyId || "",
                  secretAccessKey: details.secretAccessKey || "",
                  baseDomain: publicBaseUrl,
                  publicBaseUrl,
                  forcePathStyle,
                  isLegacy: false,
                };
              }
            } else if (target.provider === "cloudflare_r2") {
              const meta = target.meta || {};
              const publicBaseUrl =
                meta.publicBaseUrl || meta.baseDomain || meta.publicUrl || "";
              const forcePathStyle =
                typeof meta.forcePathStyle === "boolean"
                  ? meta.forcePathStyle
                  : undefined;
              return {
                provider: target.provider,
                accountId: meta.accountId || "",
                endpoint: meta.endpoint || "",
                bucket: meta.bucket || "",
                region: meta.region || "auto",
                accessKeyId: "",
                secretAccessKey: "",
                baseDomain: publicBaseUrl,
                publicBaseUrl,
                forcePathStyle,
                isLegacy: false,
                storageLocked: true,
              };
            }
          }
        }
      } catch (err) {
        userLogger.warn("[R2Service] Failed to resolve from storage:", err);
      }
    }

    return null;
  }

  async handleCloudflareClearSettings() {
    this.setSettings(createDefaultSettings());
    this.populateCloudflareSettingsInputs(this.getSettings());
    this.setCloudflareSettingsStatus(
      "Legacy settings are no longer supported. Clear settings in the Storage tab.",
      "warning"
    );
    return false;
  }

  async clearSettings() {
    return this.handleCloudflareClearSettings();
  }

  getCorsOrigins() {
    const origins = new Set();
    if (typeof window !== "undefined" && window.location) {
      const origin = window.location.origin;
      if (origin && origin !== "null") {
        origins.add(origin);
      }
      if (origin && origin.startsWith("http://localhost")) {
        origins.add(origin.replace("http://", "https://"));
      }
    }
    return Array.from(origins);
  }

  /**
   * Ensures that the R2 bucket for the given user (npub) is properly configured.
   *
   * This method performs several critical setup steps:
   * 1. Derives a sanitized bucket name from the npub.
   * 2. Attempts to auto-create the bucket and apply CORS rules if the provided
   *    credentials allow it (requires Admin/Edit permissions).
   * 3. Syncs the bucket configuration with the local settings store, ensuring
   *    the `publicBaseUrl` matches the user's base domain setting.
   *
   * @param {string} npub - The user's Nostr public key (npub).
   * @returns {Promise<object>} The bucket configuration entry and status.
   */
  async ensureBucketConfigForNpub(npub, { credentials } = {}) {
    if (!npub) {
      return null;
    }

    // Resolve credentials if not provided
    let settings = credentials;
    if (!settings) {
      settings = await this.resolveConnection(npub);
    }
    if (!settings) {
      settings = this.cloudflareSettings || {};
    }

    const accountId = (settings.accountId || "").trim();
    const accessKeyId = (settings.accessKeyId || "").trim();
    const secretAccessKey = (settings.secretAccessKey || "").trim();
    const baseDomain = settings.baseDomain || "";
    const corsOrigins = this.getCorsOrigins();

    if (!accountId) {
      throw new Error("Cloudflare account ID is missing.");
    }
    if (!baseDomain) {
      throw new Error("Public Bucket URL is missing.");
    }

    // We no longer support automated bucket creation or domain management via API token.
    // We assume the user has created the bucket with the correct name and configured the public domain.
    const bucketName =
      settings.bucket || settings.meta?.bucket || sanitizeBucketName(npub);

    // We attempt to ensure the bucket exists and CORS is set up using the S3 keys if possible.
    if (accessKeyId && secretAccessKey) {
      try {
        const s3 = this.makeR2Client({
          accountId,
          accessKeyId,
          secretAccessKey,
          endpoint: settings.endpoint,
          region: settings.region,
        });

        // Attempt to auto-create the bucket (requires Admin keys, but harmless if fails)
        try {
          await this.ensureBucketExists({
            s3,
            bucket: bucketName,
            region: settings.region,
          });
        } catch (createErr) {
          // 403 Forbidden is expected if keys are "Object Read & Write" only.
          // We proceed assuming the user might have created it manually.
          devLogger.debug(
            "Auto-creation of bucket failed (likely permission issue), proceeding...",
            createErr
          );
        }

        if (corsOrigins.length > 0) {
          await this.ensureBucketCors({
            s3,
            bucket: bucketName,
            origins: corsOrigins,
            region: settings.region,
          });
        }
      } catch (corsErr) {
        const resolvedEndpoint =
          settings.endpoint ||
          (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : "");
        const corsContext = {
          bucketName,
          endpoint: resolvedEndpoint,
          region: settings.region || "",
          corsOrigins,
        };
        userLogger.warn(
          "Failed to ensure R2 bucket/CORS configuration via access keys. Ensure the bucket exists and you have permissions.",
          corsContext,
          corsErr
        );
        devLogger.warn("R2 bucket/CORS configuration details.", corsContext, corsErr);
      }
    }

    // Use the user-provided baseDomain as the public URL root.
    // Clean up trailing slash if present.
    const cleanBaseUrl = baseDomain.replace(/\/+$/, "");

    const manualEntry = {
      bucket: bucketName,
      publicBaseUrl: cleanBaseUrl,
      domainType: "manual",
      lastUpdated: Date.now(),
    };

    return {
      entry: manualEntry,
      usedManagedFallback: false,
      customDomainStatus: "manual",
    };
  }

  /**
   * Verifies that the configured R2 bucket is publicly accessible and supports CORS.
   *
   * Strategy: "Upload-then-Fetch"
   * 1. Uploads a small temporary text file to the bucket using the S3 API.
   * 2. Attempts to fetch that file via the configured Public URL using `fetch()`.
   *
   * Why this matters:
   * - Confirms the `publicBaseUrl` is correct and pointing to this bucket.
   * - Confirms the bucket allows public reads.
   * - Confirms CORS is configured to allow GET requests from this web origin.
   *
   * @param {object} params
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async verifyPublicAccess({ settings, npub }) {
    return verifyPublicAccessHelper(this, { settings, npub });
  }

  async updateCloudflareBucketPreview({ hasPubkey = false, npub = "" } = {}) {
     // No-op for now or just simplified text, since we rely on user input mostly.
     return;
  }

  /**
   * Prepares for an upload by resolving credentials and ensuring the bucket exists.
   * @param {string} npub
   * @param {object} options
   * @returns {Promise<{settings: object, bucketEntry: object}>}
   */
  async prepareUpload(npub, { credentials } = {}) {
    // Resolve settings from StorageService if explicitCredentials missing
    let effectiveSettings = credentials;
    if (!effectiveSettings) {
      effectiveSettings = await this.resolveConnection(npub);
    }
    if (!effectiveSettings) {
      effectiveSettings = this.cloudflareSettings || {};
    }

    const accountId = (effectiveSettings.accountId || "").trim();
    const accessKeyId = (effectiveSettings.accessKeyId || "").trim();
    const secretAccessKey = (effectiveSettings.secretAccessKey || "").trim();

    devLogger.debug("[R2] prepareUpload resolved settings", {
      provider: effectiveSettings.provider || "",
      accountId: accountId ? truncateMiddle(accountId, 6) : "",
      bucket: effectiveSettings.bucket || "",
      baseDomain: effectiveSettings.baseDomain || "",
      publicBaseUrl: effectiveSettings.publicBaseUrl || "",
      storageLocked: Boolean(effectiveSettings.storageLocked),
      legacyFallback: Boolean(effectiveSettings.isLegacy),
    });

    if (!accountId || !accessKeyId || !secretAccessKey) {
      if (effectiveSettings?.storageLocked) {
        throw new Error(
          "Storage is locked — unlock storage to use saved R2 bucket settings."
        );
      }
      throw new Error("Missing R2 credentials. Unlock your storage or save settings.");
    }

    let bucketResult = null;
    try {
      bucketResult = await this.ensureBucketConfigForNpub(npub, {
        credentials: effectiveSettings,
      });
    } catch (err) {
      userLogger.error("Failed to prepare R2 bucket:", err);
      throw new Error(err?.message ? `Bucket setup failed: ${err.message}` : "Bucket setup failed.");
    }

    const bucketEntry =
      bucketResult?.entry || this.cloudflareSettings?.buckets?.[npub];

    if (!bucketEntry || !bucketEntry.publicBaseUrl) {
      throw new Error("Bucket is missing a public URL. Check your settings.");
    }

    return { settings: effectiveSettings, bucketEntry };
  }

  /**
   * Orchestrates the entire video upload workflow.
   *
   * This is the "Grand Central Station" of the upload feature. It handles:
   * 1. **Validation**: Checks inputs, credentials, and file types.
   * 2. **Bucket Setup**: Ensures the destination R2 bucket exists and is configured.
   * 3. **Multipart Uploads**: Uploads the Thumbnail, Video File, and Torrent Metadata
   *    to R2 in parallel/sequence using the S3 Multipart API.
   * 4. **Magnet Construction**: Generates a specialized Magnet URI that includes:
   *    - `xt`: The Info Hash (standard).
   *    - `ws`: The WebSeed URL (direct HTTP link to the video on R2).
   *    - `xs`: The Exact Source URL (link to the .torrent file on R2).
   *    This `ws` + `xs` combo enables the "Hybrid" playback strategy (URL-first, P2P fallback).
   * 5. **Publishing**: Constructs and signs the Nostr video event (Kind 30078).
   *
   * @param {object} params - Upload parameters.
   * @returns {Promise<boolean>} True if successful.
   */
  async handleCloudflareUploadSubmit({
    npub = "",
    file = null,
    thumbnailFile = null,
    torrentFile = null,
    metadata = {},
    infoHash = "",
    settingsInput = null,
    explicitCredentials = null,
    publishVideoNote,
    onReset,
    forcedVideoKey = "",
    forcedVideoUrl = "",
    forcedTorrentKey = "",
    forcedTorrentUrl = "",
  } = {}) {
    if (settingsInput) {
      this.setCloudflareUploadStatus(
        "Legacy Cloudflare settings are disabled. Configure R2 in the Storage tab.",
        "error"
      );
      return false;
    }

    if (!npub) {
      this.setCloudflareUploadStatus("Unable to encode npub.", "error");
      return false;
    }

    const rawTitleCandidate =
      metadata && typeof metadata === "object" ? metadata.title : metadata;
    const title =
      typeof rawTitleCandidate === "string"
        ? rawTitleCandidate.trim()
        : String(rawTitleCandidate ?? "").trim();

    if (!title) {
      this.setCloudflareUploadStatus(
        getVideoNoteErrorMessage(VIDEO_NOTE_ERROR_CODES.MISSING_TITLE),
        "error"
      );
      return false;
    }

    if (!file) {
      this.setCloudflareUploadStatus(
        "Select a video or HLS file to upload.",
        "error"
      );
      return false;
    }

    // Resolve settings from StorageService if explicitCredentials missing
    let effectiveSettings = explicitCredentials;
    if (!effectiveSettings) {
      effectiveSettings = await this.resolveConnection(npub);
    }
    if (!effectiveSettings) {
      effectiveSettings = this.cloudflareSettings || {};
    }

    const accountId = (effectiveSettings.accountId || "").trim();
    const accessKeyId = (effectiveSettings.accessKeyId || "").trim();
    const secretAccessKey = (effectiveSettings.secretAccessKey || "").trim();

    if (!accountId || !accessKeyId || !secretAccessKey) {
      this.setCloudflareUploadStatus(
        "Missing R2 credentials. Unlock your storage or save settings.",
        "error"
      );
      return false;
    }

    this.setCloudflareUploadStatus("Preparing Cloudflare R2…", "info");
    this.updateCloudflareProgress(0);
    this.setCloudflareUploading(true);

    // Computing the torrent info-hash (and the content-hash fallback) reads the
    // ENTIRE file before the upload starts and before any progress is emitted —
    // on multi-GB videos that's a long, silent pause that looks like a freeze.
    // Surface a status so the user knows work is happening.
    const willHashFile = Boolean(file) && !isValidInfoHash(normalizeInfoHash(infoHash));
    if (willHashFile) {
      this.setCloudflareUploadStatus(
        "Analyzing video (large files can take a moment)…",
        "info",
      );
    }

    const keyIdentifier = await resolveUploadIdentifier({ infoHash, file });
    const normalizedInfoHash = normalizeInfoHash(infoHash || keyIdentifier);
    const hasValidInfoHash = isValidInfoHash(normalizedInfoHash);
    // When no info-hash is available, derive a content-based namespace so two
    // distinct URL-first uploads that share a filename can't overwrite each
    // other. Kept separate from keyIdentifier so magnet generation still keys
    // off the real info-hash only.
    const storageIdentifier =
      keyIdentifier || (file ? await computeStorageContentHash(file) : "");

    let bucketResult = null;
    try {
      bucketResult = await this.ensureBucketConfigForNpub(npub, {
        credentials: effectiveSettings,
      });
    } catch (err) {
      userLogger.error("Failed to prepare R2 bucket:", err);
      this.setCloudflareUploadStatus(
        err?.message
          ? `Bucket setup failed: ${err.message}`
          : "Bucket setup failed.",
        "error"
      );
      this.setCloudflareUploading(false);
      this.updateCloudflareProgress(Number.NaN);
      return false;
    }

    // Use returned entry first (correct for both legacy and generic), fallback to legacy map
    const bucketEntry =
      bucketResult?.entry || this.cloudflareSettings?.buckets?.[npub];

    if (!bucketEntry || !bucketEntry.publicBaseUrl) {
      this.setCloudflareUploadStatus(
        "Bucket is missing a public URL. Check your settings.",
        "error"
      );
      this.setCloudflareUploading(false);
      this.updateCloudflareProgress(Number.NaN);
      return false;
    }

    let statusMessage = `Uploading to ${bucketEntry.bucket}…`;
    this.setCloudflareUploadStatus(statusMessage, "info");

    // Use forced keys if provided, otherwise generate them
    const key = forcedVideoKey || buildR2Key(npub, file, storageIdentifier);
    const publicUrl = forcedVideoUrl || buildPublicUrl(bucketEntry.publicBaseUrl, key);

    const buildTorrentKey = () => {
      if (forcedTorrentKey) return forcedTorrentKey;
      const baseKey = key.replace(/\.[^/.]+$/, "");
      if (baseKey && baseKey !== key) {
        return `${baseKey}.torrent`;
      }
      return `${key}.torrent`;
    };

    try {
      const s3 = this.makeR2Client({
        accountId,
        accessKeyId,
        secretAccessKey,
        endpoint: effectiveSettings.endpoint,
        region: effectiveSettings.region,
      });

      // Track optional-asset failures so the user gets a visible signal instead
      // of a silently-missing thumbnail/torrent (Cloudflare-upload #5).
      let thumbnailFailed = false;
      let torrentFailed = false;

      if (thumbnailFile) {
        this.setCloudflareUploadStatus("Uploading thumbnail...", "info");
        const thumbExt = thumbnailFile.name.split('.').pop() || 'jpg';
        const thumbKey = key.replace(/\.[^/.]+$/, "") + `.thumb.${thumbExt}`;

        try {
          await this.multipartUpload({
            s3,
            bucket: bucketEntry.bucket,
            key: thumbKey,
            file: thumbnailFile,
            contentType: thumbnailFile.type || "image/jpeg",
            createBucketIfMissing: true,
            region: effectiveSettings.region,
          });
          const thumbUrl = buildPublicUrl(bucketEntry.publicBaseUrl, thumbKey);
          if (typeof metadata === "object") {
            metadata.thumbnail = thumbUrl;
          }
        } catch (err) {
          userLogger.warn("Thumbnail upload failed, continuing with video...", err);
          thumbnailFailed = true;
          this.setCloudflareUploadStatus(
            "Thumbnail upload failed — publishing without it.",
            "warning"
          );
        }
      }

      this.setCloudflareUploadStatus(statusMessage, "info");

      await this.multipartUpload({
        s3,
        bucket: bucketEntry.bucket,
        key,
        file,
        contentType: file.type,
        createBucketIfMissing: true,
        region: effectiveSettings.region,
        onProgress: (fraction) => {
          this.updateCloudflareProgress(fraction);
        },
      });

      let publishOutcome = true;
      let torrentUrl = forcedTorrentUrl || "";

      if (torrentFile) {
        this.setCloudflareUploadStatus("Uploading torrent metadata...", "info");
        const torrentKey = buildTorrentKey();
        try {
          await this.multipartUpload({
            s3,
            bucket: bucketEntry.bucket,
            key: torrentKey,
            file: torrentFile,
            contentType: "application/x-bittorrent",
            createBucketIfMissing: true,
            region: effectiveSettings.region,
          });
          if (!torrentUrl) {
             torrentUrl = buildPublicUrl(bucketEntry.publicBaseUrl, torrentKey);
          }
        } catch (err) {
          userLogger.warn("Torrent metadata upload failed, continuing...", err);
          torrentFailed = true;
          this.setCloudflareUploadStatus(
            "Torrent upload failed — publishing URL-first without the .torrent.",
            "warning"
          );
        }
      }

      if (typeof publishVideoNote !== "function") {
        userLogger.warn(
          "publishVideoNote handler missing; skipping publish step."
        );
        publishOutcome = false;
      } else {
        // Construct the Magnet Link
        // This is critical for the hybrid player:
        // - `xt`: The Info Hash, identifying the content in the DHT.
        // - `ws` (WebSeed): The direct R2 URL. WebTorrent clients use this to "seed"
        //   the download via HTTP, ensuring high speed and reliability even with 0 peers.
        // - `xs` (eXact Source): The URL to the .torrent file on R2. This allows
        //   clients to fetch metadata (file structure, piece hashes) instantly via HTTP
        //   instead of waiting to fetch it from the DHT (which can take minutes).
        let generatedMagnet = "";
        let generatedWs = "";

        if (hasValidInfoHash) {
          const encodedDn = encodeURIComponent(file.name);
          const encodedWs = encodeURIComponent(publicUrl);
          let magnet = `magnet:?xt=urn:btih:${normalizedInfoHash}&dn=${encodedDn}&ws=${encodedWs}`;

          // Append the xs (metadata) link if available. This significantly speeds up
          // the "time to first frame" for P2P clients.
          if (torrentUrl) {
            const encodedXs = encodeURIComponent(torrentUrl);
            magnet += `&xs=${encodedXs}`;
          }

          generatedMagnet = magnet;
          generatedWs = publicUrl;
        } else {
          if (infoHash) {
            userLogger.warn(
              "Invalid info hash provided. Skipping magnet and webseed generation.",
              infoHash
            );
          }
          this.setCloudflareUploadStatus(
            "Info hash missing or invalid. Publishing URL-first without WebTorrent fallback.",
            "warning"
          );
        }

        const storagePrefix = buildStoragePrefixFromKey({
          publicBaseUrl: bucketEntry.publicBaseUrl,
          key,
        });
        const storagePointer = buildStoragePointerValue({
          provider: "r2",
          prefix: storagePrefix,
        });

        const rawVideoPayload = {
          title,
          url: publicUrl, // Primary URL
          magnet: generatedMagnet || (metadata?.magnet ?? ""),
          thumbnail: metadata?.thumbnail ?? "",
          description: metadata?.description ?? "",
          storagePointer,
          ws: generatedWs || (metadata?.ws ?? ""),
          xs: torrentUrl || (metadata?.xs ?? ""),
          infoHash: hasValidInfoHash ? normalizedInfoHash : "",
          enableComments: metadata?.enableComments,
          isNsfw: metadata?.isNsfw,
          isForKids: metadata?.isForKids,
        };

        const mergedNip71 = this.buildNip71MetadataForUpload(metadata?.nip71, {
          publicUrl,
          file,
          infoHash: hasValidInfoHash ? normalizedInfoHash : "",
        });
        if (mergedNip71 && Object.keys(mergedNip71).length) {
          rawVideoPayload.nip71 = mergedNip71;
        }

        const { payload, errors } = normalizeVideoNotePayload(rawVideoPayload);

        if (errors.length) {
          const message = getVideoNoteErrorMessage(errors[0]);
          this.setCloudflareUploadStatus(message, "error");
          return false;
        }

        const published = await publishVideoNote(payload, {
          onSuccess: () => {
            if (typeof onReset === "function") {
              onReset();
            }
          },
        });

        publishOutcome = Boolean(published);
        if (publishOutcome) {
          const caveats = [];
          if (thumbnailFailed) caveats.push("thumbnail");
          if (torrentFailed) caveats.push("torrent");
          const suffix = caveats.length
            ? ` (note: ${caveats.join(" & ")} upload failed)`
            : "";
          this.setCloudflareUploadStatus(
            `Published ${publicUrl}${suffix}`,
            caveats.length ? "warning" : "success"
          );
        }
      }

      return publishOutcome;
    } catch (err) {
      userLogger.error("Cloudflare upload failed:", err);
      let message = err?.message
        ? `Upload failed: ${err.message}`
        : "Upload failed.";
      // A CORS rejection during the browser PUT/POST looks like an opaque
      // "Failed to fetch" — attach actionable guidance so users who skipped the
      // connection test still know what to fix (the #1 first-upload failure).
      if (isLikelyCorsError(err)) {
        message += ` ${buildCorsGuidance({ accountId })}`;
      }
      this.setCloudflareUploadStatus(message, "error");
      return false;
    } finally {
      this.setCloudflareUploading(false);
      this.updateCloudflareProgress(Number.NaN);
      await this.updateCloudflareBucketPreview({ hasPubkey: true, npub });
    }
  }

  async uploadVideo(params = {}) {
    return this.handleCloudflareUploadSubmit(params);
  }

  async uploadFile({
    file,
    provider,
    accountId,
    accessKeyId,
    secretAccessKey,
    endpoint,
    region,
    forcePathStyle,
    bucket,
    key,
    onProgress,
  } = {}) {
    devLogger.debug("r2Service.uploadFile validation inputs", {
      hasFile: Boolean(file),
      hasBucket: Boolean(bucket),
      hasKey: Boolean(key),
      hasAccountId: Boolean(accountId),
      hasEndpoint: Boolean(endpoint),
      hasAccessKeyId: Boolean(accessKeyId),
      hasSecretAccessKey: Boolean(secretAccessKey),
    });
    if (
      !file ||
      !bucket ||
      !key ||
      (!accountId && !endpoint) ||
      !accessKeyId ||
      !secretAccessKey
    ) {
      throw new Error("Missing required parameters for uploadFile");
    }

    let s3 = null;
    const useR2 = provider === "cloudflare_r2" || Boolean(accountId);

    if (useR2) {
      s3 = this.makeR2Client({
        accountId,
        accessKeyId,
        secretAccessKey,
        endpoint,
        region,
      });
    } else {
      await ensureS3SdkLoaded();
      s3 = makeS3Client({
        endpoint,
        region,
        accessKeyId,
        secretAccessKey,
        forcePathStyle: Boolean(forcePathStyle),
      });
    }

    await this.multipartUpload({
      s3,
      bucket,
      key,
      file,
      contentType: file.type || "application/octet-stream",
      createBucketIfMissing: true,
      region,
      onProgress: (fraction) => {
        if (typeof onProgress === "function") {
          onProgress(fraction);
        }
      },
    });

    return { bucket, key };
  }
}

const r2Service = new R2Service();

export default r2Service;
