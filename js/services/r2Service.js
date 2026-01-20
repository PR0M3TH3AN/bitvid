<<<<<<< HEAD
/**
 * js/services/r2Service.js
 *
 * Service responsible for managing Cloudflare R2 uploads and configuration.
 *
 * Key Responsibilities:
 * - Managing user R2 credentials and bucket settings.
 * - performing S3-compatible multipart uploads (via `js/storage/r2-s3.js`).
 * - Orchestrating the "Hybrid" video hosting strategy:
 *   1. Videos are uploaded to R2 (S3) for reliable direct hosting.
 *   2. A `.torrent` file is generated and uploaded alongside the video.
 *   3. The final Magnet URI embeds the R2 URL as a "WebSeed" (`ws=`) and the
 *      torrent file as a metadata source (`xs=`).
 *
 * This allows clients to stream directly from R2 (fast, reliable) while simultaneously
 * joining the P2P swarm. If R2 bandwidth runs out or the link breaks, the swarm takes over.
 */

=======
>>>>>>> origin/main
import {
  loadR2Settings,
  saveR2Settings,
  clearR2Settings,
  buildR2Key,
  buildPublicUrl,
  mergeBucketEntry,
  sanitizeBaseDomain,
} from "../r2.js";
import {
  sanitizeBucketName,
  ensureBucket,
  putCors,
  attachCustomDomainAndWait,
  setManagedDomain,
  deriveShortSubdomain,
} from "../storage/r2-mgmt.js";
import {
  makeR2Client,
  multipartUpload,
  ensureBucketCors,
<<<<<<< HEAD
  ensureBucketExists,
  deleteObject,
=======
>>>>>>> origin/main
} from "../storage/r2-s3.js";
import { truncateMiddle } from "../utils/formatters.js";
import { userLogger } from "../utils/logger.js";
import {
  getVideoNoteErrorMessage,
  normalizeVideoNotePayload,
  VIDEO_NOTE_ERROR_CODES,
} from "./videoNotePayload.js";
<<<<<<< HEAD
import storageService from "./storageService.js";

const STATUS_VARIANTS = new Set(["info", "success", "error", "warning"]);
const INFO_HASH_PATTERN = /^[a-f0-9]{40}$/;

function normalizeInfoHash(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function isValidInfoHash(value) {
  return INFO_HASH_PATTERN.test(value);
}
=======

const STATUS_VARIANTS = new Set(["info", "success", "error", "warning"]);
>>>>>>> origin/main

function createDefaultSettings() {
  return {
    accountId: "",
    accessKeyId: "",
    secretAccessKey: "",
<<<<<<< HEAD
    baseDomain: "", // Now interpreted as the public URL base
=======
    apiToken: "",
    zoneId: "",
    baseDomain: "",
>>>>>>> origin/main
    buckets: {},
  };
}

<<<<<<< HEAD
function safeDecodeNpub(npub) {
  if (typeof npub !== "string") {
    return null;
  }
  const trimmed = npub.trim();
  if (!trimmed) {
    return null;
  }
  if (!trimmed.startsWith("npub1")) {
    return null;
  }
  try {
    if (
      typeof window !== "undefined" &&
      window.NostrTools &&
      window.NostrTools.nip19
    ) {
      const { type, data } = window.NostrTools.nip19.decode(trimmed);
      if (type === "npub") {
        return data;
      }
    }
  } catch (err) {
    // Ignore decode errors
  }
  return null;
}

=======
>>>>>>> origin/main
class R2Service {
  constructor() {
    this.listeners = new Map();
    this.cloudflareSettings = null;
<<<<<<< HEAD
=======
    this.cloudflareAdvancedVisible = false;
>>>>>>> origin/main
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

<<<<<<< HEAD
=======
  getCloudflareAdvancedVisibility() {
    return Boolean(this.cloudflareAdvancedVisible);
  }

  setCloudflareAdvancedVisibility(visible) {
    const isVisible = Boolean(visible);
    if (this.cloudflareAdvancedVisible === isVisible) {
      return;
    }
    this.cloudflareAdvancedVisible = isVisible;
    this.emit("advancedVisibilityChange", { visible: isVisible });
  }

>>>>>>> origin/main
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

<<<<<<< HEAD
  buildNip71MetadataForUpload(
    existingMetadata,
    { publicUrl = "", file = null, infoHash = "" } = {},
  ) {
=======
  buildNip71MetadataForUpload(existingMetadata, { publicUrl = "", file = null } = {}) {
>>>>>>> origin/main
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
<<<<<<< HEAD
      typeof publicUrl === "string"
        ? publicUrl.trim()
        : String(publicUrl || "").trim();
    if (
      normalizedUrl &&
      (!primaryVariant.url || !String(primaryVariant.url).trim())
    ) {
=======
      typeof publicUrl === "string" ? publicUrl.trim() : String(publicUrl || "").trim();
    if (normalizedUrl && (!primaryVariant.url || !String(primaryVariant.url).trim())) {
>>>>>>> origin/main
      primaryVariant.url = normalizedUrl;
    }

    const mimeType =
      file && typeof file.type === "string" ? file.type.trim() : "";
    if (mimeType && (!primaryVariant.m || !String(primaryVariant.m).trim())) {
      primaryVariant.m = mimeType;
    }

<<<<<<< HEAD
    const normalizedHash = normalizeInfoHash(infoHash);
    if (
      normalizedHash &&
      isValidInfoHash(normalizedHash) &&
      (!primaryVariant.x || !String(primaryVariant.x).trim())
    ) {
      primaryVariant.x = normalizedHash;
    }

=======
>>>>>>> origin/main
    base.imeta = imetaList;

    return base;
  }

  populateCloudflareSettingsInputs(settings) {
    const data = {
      accountId: settings?.accountId || "",
      accessKeyId: settings?.accessKeyId || "",
      secretAccessKey: settings?.secretAccessKey || "",
<<<<<<< HEAD
      baseDomain: settings?.baseDomain || "",
    };

=======
      apiToken: settings?.apiToken || "",
      zoneId: settings?.zoneId || "",
      baseDomain: settings?.baseDomain || "",
    };

    const hasAdvancedValues = Boolean(
      (data.apiToken && data.apiToken.length > 0) ||
        (data.zoneId && data.zoneId.length > 0) ||
        (data.baseDomain && data.baseDomain.length > 0)
    );

    if (hasAdvancedValues) {
      this.setCloudflareAdvancedVisibility(true);
    } else if (!this.cloudflareAdvancedVisible) {
      this.setCloudflareAdvancedVisibility(false);
    }

>>>>>>> origin/main
    this.setCloudflareSettingsStatus("");
    this.emit("settingsPopulated", { settings: data });
  }

  async loadSettings() {
    try {
      const settings = await loadR2Settings();
      this.setSettings(settings);
      this.populateCloudflareSettingsInputs(settings);
      return settings;
    } catch (err) {
      userLogger.error("Failed to load Cloudflare settings:", err);
      this.setSettings(createDefaultSettings());
      this.populateCloudflareSettingsInputs(this.getSettings());
      this.setCloudflareSettingsStatus(
        "Failed to load saved settings.",
        "error"
      );
      throw err;
    }
  }

  async handleCloudflareSettingsSubmit(formValues = {}, { quiet = false } = {}) {
<<<<<<< HEAD
    // Legacy support wrapper: redirects to storageService if possible, or warns.
    // For now, we allow saving to legacy for backward compatibility if explicit flow isn't used,
    // but we prefer to use storageService.

    const accountId = String(formValues.accountId || "").trim();
    const accessKeyId = String(formValues.accessKeyId || "").trim();
    const secretAccessKey = String(formValues.secretAccessKey || "").trim();
    const baseDomain = sanitizeBaseDomain(formValues.baseDomain || ""); // This is the Public Bucket URL

    if (baseDomain.includes(".r2.cloudflarestorage.com")) {
      if (!quiet) {
        this.setCloudflareSettingsStatus(
          "It looks like you entered the S3 API URL. Please use your Public Bucket URL (e.g. https://pub-xxx.r2.dev or your custom domain).",
          "error"
        );
      }
      return false;
    }
=======
    const accountId = String(formValues.accountId || "").trim();
    const accessKeyId = String(formValues.accessKeyId || "").trim();
    const secretAccessKey = String(formValues.secretAccessKey || "").trim();
    const apiToken = String(formValues.apiToken || "").trim();
    const zoneId = String(formValues.zoneId || "").trim();
    const baseDomain = sanitizeBaseDomain(formValues.baseDomain || "");
>>>>>>> origin/main

    if (!accountId || !accessKeyId || !secretAccessKey) {
      if (!quiet) {
        this.setCloudflareSettingsStatus(
          "Account ID, Access Key ID, and Secret are required.",
          "error"
        );
      }
      return false;
    }

<<<<<<< HEAD
    if (!baseDomain) {
      if (!quiet) {
        this.setCloudflareSettingsStatus(
          "Public Bucket URL is required (e.g., https://pub-xxx.r2.dev).",
          "error"
        );
      }
      return false;
    }

    // Try to save to StorageService if available and unlocked
    // We can't easily know the active pubkey here unless passed or inferred from context.
    // Since this method is legacy, we'll default to legacy behavior but warn.

    let buckets = { ...(this.getSettings().buckets || {}) };
    const previousAccount = this.getSettings().accountId || "";
    const previousBaseDomain = this.getSettings().baseDomain || "";

    if (previousAccount !== accountId || previousBaseDomain !== baseDomain) {
=======
    let buckets = { ...(this.getSettings().buckets || {}) };
    const previousAccount = this.getSettings().accountId || "";
    const previousBaseDomain = this.getSettings().baseDomain || "";
    const previousZoneId = this.getSettings().zoneId || "";
    if (
      previousAccount !== accountId ||
      previousBaseDomain !== baseDomain ||
      previousZoneId !== zoneId
    ) {
>>>>>>> origin/main
      buckets = {};
    }

    const updatedSettings = {
      accountId,
      accessKeyId,
      secretAccessKey,
<<<<<<< HEAD
=======
      apiToken,
      zoneId,
>>>>>>> origin/main
      baseDomain,
      buckets,
    };

    try {
      const saved = await saveR2Settings(updatedSettings);
      this.setSettings(saved);
      this.populateCloudflareSettingsInputs(saved);
      if (!quiet) {
        this.setCloudflareSettingsStatus("Settings saved locally.", "success");
      }
      return true;
    } catch (err) {
      userLogger.error("Failed to save Cloudflare settings:", err);
      if (!quiet) {
        this.setCloudflareSettingsStatus(
          "Failed to save settings. Check console for details.",
          "error"
        );
      }
      return false;
    }
  }

  async saveSettings(formValues = {}, options = {}) {
    return this.handleCloudflareSettingsSubmit(formValues, options);
  }

<<<<<<< HEAD
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
        if (storageService.isUnlocked(pubkey)) {
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
              const details = await storageService.getConnection(
                pubkey,
                target.id
              );
              if (details) {
                // Map to R2 settings format
                return {
                  accountId: details.accountId || details.meta?.accountId || "",
                  endpoint: details.endpoint || details.meta?.endpoint || "",
                  bucket: details.bucket || details.meta?.bucket || "",
                  region: details.region || details.meta?.region || "auto",
                  accessKeyId: details.accessKeyId || "",
                  secretAccessKey: details.secretAccessKey || "",
                  baseDomain:
                    details.meta?.baseDomain || details.meta?.publicUrl || "",
                  isLegacy: false,
                };
              }
            }
          }
        }
      } catch (err) {
        userLogger.warn("[R2Service] Failed to resolve from storage:", err);
      }
    }

    // 2. Fallback to legacy
    const legacy = this.cloudflareSettings;
    if (
      legacy &&
      legacy.accountId &&
      legacy.accessKeyId &&
      legacy.secretAccessKey
    ) {
      return { ...legacy, isLegacy: true };
    }

    return null;
  }

=======
>>>>>>> origin/main
  async handleCloudflareClearSettings() {
    try {
      await clearR2Settings();
      const refreshed = await loadR2Settings();
      this.setSettings(refreshed);
      this.populateCloudflareSettingsInputs(refreshed);
<<<<<<< HEAD
=======
      this.setCloudflareAdvancedVisibility(false);
>>>>>>> origin/main
      this.setCloudflareSettingsStatus("Settings cleared.", "success");
      return true;
    } catch (err) {
      userLogger.error("Failed to clear Cloudflare settings:", err);
      this.setCloudflareSettingsStatus("Failed to clear settings.", "error");
      return false;
    }
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

<<<<<<< HEAD
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
=======
  deriveSubdomainForNpub(npub) {
    try {
      return deriveShortSubdomain(npub);
    } catch (err) {
      userLogger.warn("Failed to derive short subdomain, falling back:", err);
    }

    const base = String(npub || "user")
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "")
      .replace(/^-+|[-]+$/g, "");
    return base.slice(0, 32) || "user";
  }

  async ensureBucketConfigForNpub(npub) {
    if (!npub || !this.cloudflareSettings) {
      return null;
    }

    const accountId = (this.cloudflareSettings.accountId || "").trim();
    const apiToken = (this.cloudflareSettings.apiToken || "").trim();
    const zoneId = (this.cloudflareSettings.zoneId || "").trim();
    const accessKeyId = (this.cloudflareSettings.accessKeyId || "").trim();
    const secretAccessKey = (this.cloudflareSettings.secretAccessKey || "").trim();
    const corsOrigins = this.getCorsOrigins();
    const baseDomain = this.cloudflareSettings.baseDomain || "";
>>>>>>> origin/main

    if (!accountId) {
      throw new Error("Cloudflare account ID is missing.");
    }
<<<<<<< HEAD
    if (!baseDomain) {
      throw new Error("Public Bucket URL is missing.");
    }

    // We no longer support automated bucket creation or domain management via API token.
    // We assume the user has created the bucket with the correct name and configured the public domain.
    const bucketName = settings.bucket || sanitizeBucketName(npub);

    // We attempt to ensure the bucket exists and CORS is set up using the S3 keys if possible.
    if (accessKeyId && secretAccessKey) {
      try {
        const s3 = makeR2Client({
          accountId,
          accessKeyId,
          secretAccessKey,
          endpoint: settings.endpoint,
          region: settings.region,
        });

        // Attempt to auto-create the bucket (requires Admin keys, but harmless if fails)
        try {
          await ensureBucketExists({ s3, bucket: bucketName });
        } catch (createErr) {
          // 403 Forbidden is expected if keys are "Object Read & Write" only.
          // We proceed assuming the user might have created it manually.
          userLogger.debug(
            "Auto-creation of bucket failed (likely permission issue), proceeding...",
            createErr
          );
        }

        if (corsOrigins.length > 0) {
=======

    let entry = this.cloudflareSettings.buckets?.[npub] || null;

    if (entry && entry.publicBaseUrl) {
      if (apiToken) {
        try {
          await ensureBucket({
            accountId,
            bucket: entry.bucket,
            token: apiToken,
          });
          await putCors({
            accountId,
            bucket: entry.bucket,
            token: apiToken,
            origins: corsOrigins,
          });
        } catch (err) {
          userLogger.warn("Failed to refresh bucket configuration:", err);
        }
      } else if (accessKeyId && secretAccessKey && corsOrigins.length > 0) {
        try {
          const s3 = makeR2Client({
            accountId,
            accessKeyId,
            secretAccessKey,
          });
          await ensureBucketCors({
            s3,
            bucket: entry.bucket,
            origins: corsOrigins,
          });
        } catch (err) {
          userLogger.warn("Failed to refresh bucket CORS via access keys:", err);
        }
      }
      return {
        entry,
        usedManagedFallback: entry.domainType !== "custom",
        customDomainStatus: entry.domainType === "custom" ? "active" : "skipped",
      };
    }

    if (!apiToken) {
      const bucketName = entry?.bucket || sanitizeBucketName(npub);
      const manualCustomDomain = baseDomain
        ? `https://${this.deriveSubdomainForNpub(npub)}.${baseDomain}`
        : "";

      let publicBaseUrl = entry?.publicBaseUrl || manualCustomDomain;
      if (!publicBaseUrl) {
        publicBaseUrl = `https://${bucketName}.${accountId}.r2.dev`;
      }

      if (!publicBaseUrl) {
        throw new Error(
          "No public bucket domain configured. Add an API token or configure the domain manually."
        );
      }

      const manualEntry = {
        bucket: bucketName,
        publicBaseUrl,
        domainType: publicBaseUrl.includes(".r2.dev") ? "managed" : "custom",
        lastUpdated: Date.now(),
      };

      if (accessKeyId && secretAccessKey && corsOrigins.length > 0) {
        try {
          const s3 = makeR2Client({
            accountId,
            accessKeyId,
            secretAccessKey,
          });
>>>>>>> origin/main
          await ensureBucketCors({
            s3,
            bucket: bucketName,
            origins: corsOrigins,
          });
<<<<<<< HEAD
        }
      } catch (corsErr) {
        userLogger.warn(
          "Failed to ensure R2 bucket/CORS configuration via access keys. Ensure the bucket exists and you have permissions.",
          corsErr
        );
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

    // If using legacy settings, we save the bucket mapping.
    // If using StorageService (settings.isLegacy === false), we do NOT save to legacy store
    // to avoid partial state or overwriting. We just return the manual entry.
    if (settings.isLegacy !== false) {
      let entry = this.cloudflareSettings.buckets?.[npub];
      let savedEntry = entry;

      if (
        !entry ||
        entry.bucket !== manualEntry.bucket ||
        entry.publicBaseUrl !== manualEntry.publicBaseUrl
=======
        } catch (corsErr) {
          userLogger.warn(
            "Failed to ensure R2 CORS rules via access keys. Configure the bucket's CORS policy manually if uploads continue to fail.",
            corsErr
          );
        }
      }

      let savedEntry = entry;
      if (
        !entry ||
        entry.bucket !== manualEntry.bucket ||
        entry.publicBaseUrl !== manualEntry.publicBaseUrl ||
        entry.domainType !== manualEntry.domainType
>>>>>>> origin/main
      ) {
        const updatedSettings = await saveR2Settings(
          mergeBucketEntry(this.getSettings(), npub, manualEntry)
        );
        this.setSettings(updatedSettings);
        savedEntry = updatedSettings.buckets?.[npub] || manualEntry;
      }
<<<<<<< HEAD
      return {
        entry: savedEntry,
        usedManagedFallback: false,
        customDomainStatus: "manual",
      };
    }

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
    if (!settings || !npub) {
      return { success: false, error: "Missing settings or npub." };
    }

    const { accountId, accessKeyId, secretAccessKey, baseDomain } = settings;
    if (!accountId || !accessKeyId || !secretAccessKey || !baseDomain) {
      return { success: false, error: "Incomplete credentials or missing public URL." };
    }

    const bucketName = sanitizeBucketName(npub);
    const verifyKey = `.verify-${Date.now()}-${Math.random().toString(36).substring(7)}.txt`;
    const verifyContent = "bitvid-verification";
    const publicUrl = buildPublicUrl(baseDomain, verifyKey);

    userLogger.info(
      `[R2] Verifying access for Bucket: '${bucketName}' in Account: '${truncateMiddle(accountId, 6)}'`
    );

    try {
      // 1. Initialize S3
      const s3 = makeR2Client({
        accountId,
        accessKeyId,
        secretAccessKey,
        endpoint: settings.endpoint,
        region: settings.region,
      });

      // 2. Ensure bucket (best effort)
      try {
        await ensureBucketExists({ s3, bucket: bucketName });
      } catch (setupErr) {
        userLogger.warn("Bucket creation/check warning during verification:", setupErr);
        // Continue, assuming bucket might already exist and be configured
      }

      // 3. Ensure CORS (best effort)
      try {
        const corsOrigins = this.getCorsOrigins();
        if (corsOrigins.length > 0) {
          await ensureBucketCors({
            s3,
            bucket: bucketName,
            origins: corsOrigins,
          });
        }
      } catch (corsErr) {
        userLogger.warn("CORS setup warning during verification:", corsErr);
      }

      // 4. Upload Test File
      const file = new File([verifyContent], "verify.txt", { type: "text/plain" });
      await multipartUpload({
        s3,
        bucket: bucketName,
        key: verifyKey,
        file,
        contentType: "text/plain",
      });

      // 4. Verify Public Access (Fetch)
      // Wait a moment for propagation (R2 is usually instant-ish but helpful to wait)
      await new Promise((r) => setTimeout(r, 500));

      const response = await fetch(publicUrl, { method: "GET", cache: "no-cache" });

      if (!response.ok) {
        // Cleanup attempt
        try { await deleteObject({ s3, bucket: bucketName, key: verifyKey }); } catch (e) {}

        if (response.status === 404) {
           return { success: false, error: "File not found. Check your Public Bucket URL." };
        }
        return { success: false, error: `Public access failed (HTTP ${response.status}). Is the bucket public?` };
      }

      const text = await response.text();

      // Cleanup
      try { await deleteObject({ s3, bucket: bucketName, key: verifyKey }); } catch (e) {}

      if (text.trim() !== verifyContent) {
        return { success: false, error: "Content mismatch. URL might be pointing elsewhere." };
      }

      return { success: true };

    } catch (err) {
      userLogger.error("Verification failed:", err);
      let errorMessage = err.message || "Unknown error during verification.";
      if (
        errorMessage.includes("Failed to fetch") ||
        errorMessage.includes("NetworkError")
      ) {
        errorMessage +=
          " This is likely a CORS issue. Please enable CORS in your Cloudflare R2 bucket settings. Also verify that the Bucket Name exists and your API Token has 'Object Read & Write' permissions.";
      }
      return { success: false, error: errorMessage };
    }
  }

  async updateCloudflareBucketPreview({ hasPubkey = false, npub = "" } = {}) {
     // No-op for now or just simplified text, since we rely on user input mostly.
     return;
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
    // If no explicit credentials, we might save settingsInput to legacy DB.
    // If explicitCredentials ARE provided, we skip saving and use them directly.
    if (!explicitCredentials && settingsInput) {
=======

      return {
        entry: savedEntry,
        usedManagedFallback: manualEntry.domainType !== "custom",
        customDomainStatus:
          manualEntry.domainType === "custom" ? "manual" : "managed",
      };
    }

    const bucketName = entry?.bucket || sanitizeBucketName(npub);

    await ensureBucket({ accountId, bucket: bucketName, token: apiToken });

    try {
      await putCors({
        accountId,
        bucket: bucketName,
        token: apiToken,
        origins: corsOrigins,
      });
    } catch (err) {
      userLogger.warn("Failed to apply R2 CORS rules:", err);
    }

    let publicBaseUrl = entry?.publicBaseUrl || "";
    let domainType = entry?.domainType || "managed";
    let usedManagedFallback = false;
    let customDomainStatus = "skipped";

    if (baseDomain && zoneId) {
      const domain = `${this.deriveSubdomainForNpub(npub)}.${baseDomain}`;
      try {
        const custom = await attachCustomDomainAndWait({
          accountId,
          bucket: bucketName,
          token: apiToken,
          zoneId,
          domain,
          pollInterval: 2500,
          timeoutMs: 120000,
        });
        customDomainStatus = custom?.status || "unknown";
        if (custom?.active && custom?.url) {
          publicBaseUrl = custom.url;
          domainType = "custom";
          try {
            await setManagedDomain({
              accountId,
              bucket: bucketName,
              token: apiToken,
              enabled: false,
            });
          } catch (disableErr) {
            userLogger.warn("Failed to disable managed domain:", disableErr);
          }
        } else {
          usedManagedFallback = true;
        }
      } catch (err) {
        if (/already exists/i.test(err.message || "")) {
          publicBaseUrl = `https://${domain}`;
          domainType = "custom";
          customDomainStatus = "active";
          try {
            await setManagedDomain({
              accountId,
              bucket: bucketName,
              token: apiToken,
              enabled: false,
            });
          } catch (disableErr) {
            userLogger.warn("Failed to disable managed domain:", disableErr);
          }
        } else {
          userLogger.warn("Failed to attach custom domain, falling back:", err);
          usedManagedFallback = true;
          customDomainStatus = "error";
        }
      }
    }

    if (!publicBaseUrl) {
      const managed = await setManagedDomain({
        accountId,
        bucket: bucketName,
        token: apiToken,
        enabled: true,
      });
      publicBaseUrl = managed?.url || `https://${bucketName}.${accountId}.r2.dev`;
      domainType = "managed";
      usedManagedFallback = true;
      customDomainStatus =
        customDomainStatus === "skipped" ? "managed" : customDomainStatus;
    }

    const mergedEntry = {
      bucket: bucketName,
      publicBaseUrl,
      domainType,
      lastUpdated: Date.now(),
    };
    const updatedSettings = await saveR2Settings(
      mergeBucketEntry(this.getSettings(), npub, mergedEntry)
    );
    this.setSettings(updatedSettings);
    return { entry: mergedEntry, usedManagedFallback, customDomainStatus };
  }

  async updateCloudflareBucketPreview({ hasPubkey = false, npub = "" } = {}) {
    if (!this.cloudflareSettings) {
      const detail = {
        text: "Save your credentials to configure R2.",
        title: "",
      };
      this.emit("bucketPreview", detail);
      return detail;
    }

    if (!hasPubkey) {
      const detail = { text: "Login to preview your R2 bucket.", title: "" };
      this.emit("bucketPreview", detail);
      return detail;
    }

    if (!npub) {
      const detail = { text: "Unable to encode npub.", title: "" };
      this.emit("bucketPreview", detail);
      return detail;
    }

    const entry = this.cloudflareSettings.buckets?.[npub];
    if (!entry || !entry.publicBaseUrl) {
      const detail = {
        text: "Bucket will be auto-created on your next upload.",
        title: "",
      };
      this.emit("bucketPreview", detail);
      return detail;
    }

    const sampleKey = buildR2Key(npub, { name: "sample.mp4" });
    const publicUrl = buildPublicUrl(entry.publicBaseUrl, sampleKey);
    const fullPreview = `${entry.bucket} • ${publicUrl}`;

    let displayHostAndPath = truncateMiddle(publicUrl, 72);
    try {
      const parsed = new URL(publicUrl);
      const cleanPath = parsed.pathname.replace(/^\//, "");
      const truncatedPath = truncateMiddle(cleanPath || sampleKey, 32);
      displayHostAndPath = `${truncateMiddle(parsed.host, 32)}/${truncatedPath}`;
    } catch (err) {
      // ignore URL parse issues and fall back to the raw string
    }

    const truncatedBucket = truncateMiddle(entry.bucket, 28);
    const detail = {
      text: `${truncatedBucket} • ${displayHostAndPath}`,
      title: fullPreview,
    };
    this.emit("bucketPreview", detail);
    return detail;
  }

  async handleCloudflareUploadSubmit({
    npub = "",
    file = null,
    metadata = {},
    settingsInput = null,
    publishVideoNote,
    onReset,
  } = {}) {
    if (settingsInput) {
>>>>>>> origin/main
      const saved = await this.handleCloudflareSettingsSubmit(settingsInput, {
        quiet: true,
      });
      if (!saved) {
        this.setCloudflareUploadStatus(
          "Fix your R2 settings before uploading.",
          "error"
        );
        return false;
      }
    }

    if (!npub) {
      this.setCloudflareUploadStatus("Unable to encode npub.", "error");
      return false;
    }

    const rawTitleCandidate =
      metadata && typeof metadata === "object" ? metadata.title : metadata;
<<<<<<< HEAD
    const title =
      typeof rawTitleCandidate === "string"
        ? rawTitleCandidate.trim()
        : String(rawTitleCandidate ?? "").trim();
=======
    const title = typeof rawTitleCandidate === "string"
      ? rawTitleCandidate.trim()
      : String(rawTitleCandidate ?? "").trim();
>>>>>>> origin/main

    if (!title) {
      this.setCloudflareUploadStatus(
        getVideoNoteErrorMessage(VIDEO_NOTE_ERROR_CODES.MISSING_TITLE),
<<<<<<< HEAD
        "error"
=======
        "error",
>>>>>>> origin/main
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

<<<<<<< HEAD
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
=======
    const accountId = (this.cloudflareSettings?.accountId || "").trim();
    const accessKeyId = (this.cloudflareSettings?.accessKeyId || "").trim();
    const secretAccessKey = (this.cloudflareSettings?.secretAccessKey || "").trim();

    if (!accountId || !accessKeyId || !secretAccessKey) {
      this.setCloudflareUploadStatus(
        "Missing R2 credentials. Save them before uploading.",
>>>>>>> origin/main
        "error"
      );
      return false;
    }

    this.setCloudflareUploadStatus("Preparing Cloudflare R2…", "info");
    this.updateCloudflareProgress(0);
    this.setCloudflareUploading(true);

    let bucketResult = null;
    try {
<<<<<<< HEAD
      bucketResult = await this.ensureBucketConfigForNpub(npub, {
        credentials: effectiveSettings,
      });
    } catch (err) {
      userLogger.error("Failed to prepare R2 bucket:", err);
      this.setCloudflareUploadStatus(
        err?.message
          ? `Bucket setup failed: ${err.message}`
          : "Bucket setup failed.",
=======
      bucketResult = await this.ensureBucketConfigForNpub(npub);
    } catch (err) {
      userLogger.error("Failed to prepare R2 bucket:", err);
      this.setCloudflareUploadStatus(
        err?.message ? `Bucket setup failed: ${err.message}` : "Bucket setup failed.",
>>>>>>> origin/main
        "error"
      );
      this.setCloudflareUploading(false);
      this.updateCloudflareProgress(Number.NaN);
      return false;
    }

<<<<<<< HEAD
    // Use returned entry first (correct for both legacy and generic), fallback to legacy map
=======
>>>>>>> origin/main
    const bucketEntry =
      bucketResult?.entry || this.cloudflareSettings?.buckets?.[npub];

    if (!bucketEntry || !bucketEntry.publicBaseUrl) {
      this.setCloudflareUploadStatus(
<<<<<<< HEAD
        "Bucket is missing a public URL. Check your settings.",
=======
        "Bucket is missing a public domain. Check your Cloudflare settings.",
>>>>>>> origin/main
        "error"
      );
      this.setCloudflareUploading(false);
      this.updateCloudflareProgress(Number.NaN);
      return false;
    }

    let statusMessage = `Uploading to ${bucketEntry.bucket}…`;
<<<<<<< HEAD
    this.setCloudflareUploadStatus(statusMessage, "info");

    // Use forced keys if provided, otherwise generate them
    const key = forcedVideoKey || buildR2Key(npub, file);
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
      const s3 = makeR2Client({
        accountId,
        accessKeyId,
        secretAccessKey,
        endpoint: effectiveSettings.endpoint,
        region: effectiveSettings.region,
      });

      if (thumbnailFile) {
        this.setCloudflareUploadStatus("Uploading thumbnail...", "info");
        const thumbExt = thumbnailFile.name.split('.').pop() || 'jpg';
        const thumbKey = key.replace(/\.[^/.]+$/, "") + `.thumb.${thumbExt}`;

        try {
            await multipartUpload({
                s3,
                bucket: bucketEntry.bucket,
                key: thumbKey,
                file: thumbnailFile,
                contentType: thumbnailFile.type || "image/jpeg",
            });
            const thumbUrl = buildPublicUrl(bucketEntry.publicBaseUrl, thumbKey);
            if (typeof metadata === "object") {
                metadata.thumbnail = thumbUrl;
            }
        } catch (err) {
            userLogger.warn("Thumbnail upload failed, continuing with video...", err);
        }
      }

      this.setCloudflareUploadStatus(statusMessage, "info");
=======
    if (bucketResult?.usedManagedFallback) {
      const baseDomain = this.cloudflareSettings?.baseDomain || "";
      if (baseDomain) {
        const customStatus = bucketResult?.customDomainStatus
          ? ` (custom domain status: ${bucketResult.customDomainStatus})`
          : "";
        statusMessage = `Using managed r2.dev domain for ${bucketEntry.bucket}. Verify your Cloudflare zone${customStatus}. Uploading…`;
      } else {
        statusMessage = `Using managed r2.dev domain for ${bucketEntry.bucket}. Uploading…`;
      }
    }

    this.setCloudflareUploadStatus(
      statusMessage,
      bucketResult?.usedManagedFallback ? "warning" : "info"
    );

    const key = buildR2Key(npub, file);
    const publicUrl = buildPublicUrl(bucketEntry.publicBaseUrl, key);

    try {
      const s3 = makeR2Client({ accountId, accessKeyId, secretAccessKey });
>>>>>>> origin/main

      await multipartUpload({
        s3,
        bucket: bucketEntry.bucket,
        key,
        file,
        contentType: file.type,
        onProgress: (fraction) => {
          this.updateCloudflareProgress(fraction);
        },
      });

      let publishOutcome = true;
<<<<<<< HEAD
      let torrentUrl = forcedTorrentUrl || "";

      if (torrentFile) {
        this.setCloudflareUploadStatus("Uploading torrent metadata...", "info");
        const torrentKey = buildTorrentKey();
        try {
          await multipartUpload({
            s3,
            bucket: bucketEntry.bucket,
            key: torrentKey,
            file: torrentFile,
            contentType: "application/x-bittorrent",
          });
          if (!torrentUrl) {
             torrentUrl = buildPublicUrl(bucketEntry.publicBaseUrl, torrentKey);
          }
        } catch (err) {
          userLogger.warn("Torrent metadata upload failed, continuing...", err);
        }
      }
=======
>>>>>>> origin/main

      if (typeof publishVideoNote !== "function") {
        userLogger.warn(
          "publishVideoNote handler missing; skipping publish step."
        );
        publishOutcome = false;
      } else {
<<<<<<< HEAD
        // Construct the Magnet Link
        // This is critical for the hybrid player:
        // - `xt`: The Info Hash, identifying the content in the DHT.
        // - `ws` (WebSeed): The direct R2 URL. WebTorrent clients use this to "seed"
        //   the download via HTTP, ensuring high speed and reliability even with 0 peers.
        // - `xs` (eXact Source): The URL to the .torrent file on R2. This allows
        //   clients to fetch metadata (file structure, piece hashes) instantly via HTTP
        //   instead of waiting to fetch it from the DHT (which can take minutes).
        const normalizedInfoHash = normalizeInfoHash(infoHash);
        const hasValidInfoHash = isValidInfoHash(normalizedInfoHash);
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

        const rawVideoPayload = {
          title,
          url: publicUrl, // Primary URL
          magnet: generatedMagnet || (metadata?.magnet ?? ""),
          thumbnail: metadata?.thumbnail ?? "",
          description: metadata?.description ?? "",
          ws: generatedWs || (metadata?.ws ?? ""),
          xs: torrentUrl || (metadata?.xs ?? ""),
=======
        const rawVideoPayload = {
          title,
          url: publicUrl,
          magnet: metadata?.magnet ?? "",
          thumbnail: metadata?.thumbnail ?? "",
          description: metadata?.description ?? "",
          ws: metadata?.ws ?? "",
          xs: metadata?.xs ?? "",
>>>>>>> origin/main
          enableComments: metadata?.enableComments,
          isNsfw: metadata?.isNsfw,
          isForKids: metadata?.isForKids,
        };

        const mergedNip71 = this.buildNip71MetadataForUpload(metadata?.nip71, {
          publicUrl,
          file,
<<<<<<< HEAD
          infoHash: hasValidInfoHash ? normalizedInfoHash : "",
=======
>>>>>>> origin/main
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
          this.setCloudflareUploadStatus(
            `Published ${publicUrl}`,
            "success"
          );
        }
      }

      return publishOutcome;
    } catch (err) {
      userLogger.error("Cloudflare upload failed:", err);
      this.setCloudflareUploadStatus(
        err?.message ? `Upload failed: ${err.message}` : "Upload failed.",
        "error"
      );
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
<<<<<<< HEAD

  async uploadFile({
    file,
    accountId,
    accessKeyId,
    secretAccessKey,
    endpoint,
    region,
    bucket,
    key,
    onProgress,
  } = {}) {
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

    const s3 = makeR2Client({
      accountId,
      accessKeyId,
      secretAccessKey,
      endpoint,
      region,
    });

    await multipartUpload({
      s3,
      bucket,
      key,
      file,
      contentType: file.type || "application/octet-stream",
      onProgress: (fraction) => {
        if (typeof onProgress === "function") {
          onProgress(fraction);
        }
      },
    });

    return { bucket, key };
  }
=======
>>>>>>> origin/main
}

const r2Service = new R2Service();

export default r2Service;
