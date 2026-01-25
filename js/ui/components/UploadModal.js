// components/UploadModal.js
import { createModalAccessibility } from "./modalAccessibility.js";
import { Nip71FormManager } from "./nip71FormManager.js";
import { userLogger } from "../../utils/logger.js";
import {
  getVideoNoteErrorMessage,
  normalizeVideoNotePayload,
} from "../../services/videoNotePayload.js";
import { createTorrentMetadata } from "../../utils/torrentHash.js";
import { sanitizeBucketName } from "../../storage/r2-mgmt.js";
import { buildR2Key, buildPublicUrl } from "../../r2.js";
import { buildS3ObjectUrl } from "../../services/s3Service.js";
import { PROVIDERS } from "../../services/storageService.js";
import {
  getActiveSigner,
  requestDefaultExtensionPermissions,
} from "../../nostrClientFacade.js";

const INFO_HASH_PATTERN = /^[a-f0-9]{40}$/;

function normalizeInfoHash(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function isValidInfoHash(value) {
  return INFO_HASH_PATTERN.test(value);
}

export class UploadModal {
  constructor({
    authService,
    r2Service,
    s3Service,
    storageService,
    publishVideoNote,
    removeTrackingScripts,
    setGlobalModalState,
    showError,
    showSuccess,
    getCurrentPubkey,
    safeEncodeNpub,
    eventTarget,
    container,
    onRequestStorageSettings,
  } = {}) {
    this.authService = authService || null;
    this.r2Service = r2Service || null;
    this.s3Service = s3Service || null;
    this.storageService = storageService || null;
    this.publishVideoNote =
      typeof publishVideoNote === "function" ? publishVideoNote : null;
    this.removeTrackingScripts =
      typeof removeTrackingScripts === "function"
        ? removeTrackingScripts
        : () => {};
    this.setGlobalModalState =
      typeof setGlobalModalState === "function"
        ? setGlobalModalState
        : () => {};
    this.showError = typeof showError === "function" ? showError : () => {};
    this.showSuccess =
      typeof showSuccess === "function" ? showSuccess : () => {};
    this.getCurrentPubkey =
      typeof getCurrentPubkey === "function" ? getCurrentPubkey : null;
    this.safeEncodeNpub =
      typeof safeEncodeNpub === "function" ? safeEncodeNpub : () => "";
    this.eventTarget =
      eventTarget instanceof EventTarget ? eventTarget : new EventTarget();
    this.container = container || null;
    this.onRequestStorageSettings = typeof onRequestStorageSettings === "function" ? onRequestStorageSettings : null;

    this.root = null;
    this.isVisible = false;
    this.activeSource = "upload"; // 'upload' | 'external'

    // Internal state for credentials
    this.activeCredentials = null;
    this.activeProvider = null;
    this.isStorageUnlocked = false;
    this.storageConfigured = false;

    // UI References
    this.form = null;
    this.modeButtons = {};
    this.sourceSections = {};
    this.inputs = {};
    this.toggles = {};
    this.submitButton = null;
    this.submitStatus = null;
    this.storageViews = {};

    // Logic/State
    this.nip71FormManager = new Nip71FormManager();
    this.r2Unsubscribes = [];
    this.cleanupHandlers = [];
    this.modalAccessibility = null;
    this.loadPromise = null;

    // Automation
    this.summaryLocked = true;
    this.isUploading = false;
  }

  // --- Core Lifecycle ---

  async load({ container } = {}) {
    if (this.root && this.root.isConnected) return this.root;
    if (this.loadPromise) return this.loadPromise;

    this.loadPromise = (async () => {
      const targetContainer =
        container || this.container || document.getElementById("modalContainer");
      if (!targetContainer) throw new Error("Modal container not found!");

      // Cleanup existing
      targetContainer.querySelectorAll("#uploadModal").forEach(n => n.remove());

      const response = await fetch("components/upload-modal.html");
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

      const html = await response.text();
      const doc = targetContainer.ownerDocument || document;
      const wrapper = doc.createElement("div");
      wrapper.innerHTML = html;
      this.removeTrackingScripts(wrapper);

      targetContainer.appendChild(wrapper.firstElementChild);
      this.root = targetContainer.querySelector("#uploadModal");
      this.container = targetContainer;

      this.cacheElements();
      this.bindEvents();
      this.setupModalAccessibility();
      this.registerStorageSubscriptions();

      // Initial State
      if (this.storageService) {
        const pubkey = this.getCurrentPubkey ? this.getCurrentPubkey() : null;
        this.isStorageUnlocked = pubkey ? this.storageService.isUnlocked(pubkey) : false;
        await this.loadFromStorage();
      }
      this.updateLockUi();
      this.setSourceMode("upload");

      return this.root;
    })();

    try {
      return await this.loadPromise;
    } finally {
      this.loadPromise = null;
    }
  }

  cacheElements() {
    const $ = (sel) => this.root.querySelector(sel);

    this.form = $("#unifiedUploadForm");
    this.submitButton = $("#btn-submit");
    this.submitStatus = $("#submit-status");
    this.closeButton = $("#closeUploadModal");

    // Mode Switchers
    this.modeButtons = {
        upload: $("#btn-mode-upload"),
        external: $("#btn-mode-external"),
    };

    // Sections
    this.sourceSections = {
        upload: $("#section-source-upload"),
        external: $("#section-source-external"),
        settings: $("#section-storage-settings"),
        advanced: $("#section-advanced"),
        progress: $("#upload-progress-container"),
    };

    this.storageViews = {
        summary: $("#storage-summary-view"),
        empty: $("#storage-empty-view"),
    };

    // Inputs (Common)
    this.inputs = {
        title: $("#input-title"),
        description: $("#input-description"),
        thumbnail: $("#input-thumbnail"),
        thumbnailFile: $("#input-thumbnail-file"),
        file: $("#input-file"),
        url: $("#input-url"),
        magnet: $("#input-magnet"),

        // Advanced (Manual or NIP71 managed)
        ws: $("#input-ws"),
        xs: $("#input-xs"),
        summary: $("#input-summary"),
        contentWarning: $("#input-content-warning"),
        duration: $("#input-duration"),

        // Progress
        progress: $("#input-progress"),
    };

    // Toggles/Buttons
    this.toggles = {
        nsfw: $("#check-nsfw"),
        kids: $("#check-kids"),
        comments: $("#check-comments"),
        summaryUnlock: $("#check-summary-unlock"),

        advanced: $("#btn-advanced-toggle"),
        storageSettings: $("#btn-storage-settings"),
        browseThumbnail: $("#btn-thumbnail-file"),
        storageUnlock: $("#btn-storage-unlock"),
        manageStorage: $("#btn-manage-storage"),
        configureStorage: $("#btn-configure-storage"),
    };

    // Status text
    this.statusText = {
        storageLock: $("#storage-lock-status"),
        uploadMain: $("#upload-status-text"),
        uploadPercent: $("#upload-percent-text"),
        summaryProvider: $("#summary-provider"),
        summaryBucket: $("#summary-bucket"),
        summaryUrlStyle: $("#summary-url-style"),
        summaryCopy: $("#summary-copy"),
    };

    this.nip71FormManager.registerSection("main", this.form);
  }

  bindEvents() {
    // Mode Switching
    this.modeButtons.upload.addEventListener("click", () => this.setSourceMode("upload"));
    this.modeButtons.external.addEventListener("click", () => this.setSourceMode("external"));

    // Toggles
    this.setupAccordion(this.toggles.advanced, this.sourceSections.advanced);
    this.setupAccordion(this.toggles.storageSettings, this.sourceSections.settings);

    // Form Submission
    this.form.addEventListener("submit", (e) => {
        e.preventDefault();
        this.handleSubmit();
    });

    // Storage Unlock
    if (this.toggles.storageUnlock) {
        this.toggles.storageUnlock.addEventListener("click", () => this.handleUnlock());
    }

    // Manage Storage (Summary View)
    if (this.toggles.manageStorage) {
        this.toggles.manageStorage.addEventListener("click", () => {
            if (this.onRequestStorageSettings) {
                this.close();
                this.onRequestStorageSettings();
            }
        });
    }

    // Configure Storage (Empty View)
    if (this.toggles.configureStorage) {
        this.toggles.configureStorage.addEventListener("click", (e) => {
            e.preventDefault(); // Prevent form submission
            if (this.onRequestStorageSettings) {
                this.close();
                this.onRequestStorageSettings();
            }
        });
    }

    // Automation
    this.setupDescriptionMirror();
    this.setupMutuallyExclusiveCheckboxes(this.toggles.nsfw, this.toggles.kids);
    this.setupNsfwToContentWarning();
    this.setupThumbnailInput();

    // Close
    this.closeButton.addEventListener("click", () => this.close());

    // NIP-71 Manager
    this.nip71FormManager.bindSection("main");
  }

  // --- Logic & State ---

  setSourceMode(mode) {
    this.activeSource = mode;

    // UI Updates
    const isUpload = mode === "upload";

    // Toggle Buttons
    this.modeButtons.upload.setAttribute("aria-pressed", isUpload);
    this.modeButtons.upload.classList.toggle("bg-surface", isUpload);
    this.modeButtons.upload.classList.toggle("text-text", isUpload);
    this.modeButtons.upload.classList.toggle("shadow-sm", isUpload);
    this.modeButtons.upload.classList.toggle("text-muted", !isUpload);

    this.modeButtons.external.setAttribute("aria-pressed", !isUpload);
    this.modeButtons.external.classList.toggle("bg-surface", !isUpload);
    this.modeButtons.external.classList.toggle("text-text", !isUpload);
    this.modeButtons.external.classList.toggle("shadow-sm", !isUpload);
    this.modeButtons.external.classList.toggle("text-muted", isUpload);

    // Sections
    if (isUpload) {
        this.sourceSections.upload.classList.remove("hidden");
        this.sourceSections.external.classList.add("hidden");

        if (this.toggles.browseThumbnail) {
            this.toggles.browseThumbnail.classList.remove("hidden");
        }
    } else {
        this.sourceSections.upload.classList.add("hidden");
        this.sourceSections.external.classList.remove("hidden");

        if (this.toggles.browseThumbnail) {
            this.toggles.browseThumbnail.classList.add("hidden");
        }
    }

    // Update Button Text
    this.submitButton.textContent = isUpload ? "Upload & Publish" : "Publish Video";
  }

  setupAccordion(btn, section) {
      if (!btn || !section) return;
      btn.addEventListener("click", () => {
          const isHidden = section.classList.contains("hidden");
          if (isHidden) {
              section.classList.remove("hidden");
              btn.setAttribute("aria-expanded", "true");
              // Rotate icon if exists
              const icon = btn.querySelector("svg");
              if (icon) icon.classList.add("rotate-90");
          } else {
              section.classList.add("hidden");
              btn.setAttribute("aria-expanded", "false");
              const icon = btn.querySelector("svg");
              if (icon) icon.classList.remove("rotate-90");
          }
      });
  }

  // --- Automation Helpers ---

  setupDescriptionMirror() {
      const { description, summary } = this.inputs;
      const { summaryUnlock } = this.toggles;

      if (!description || !summary) return;

      description.addEventListener("input", () => {
          if (this.summaryLocked) summary.value = description.value;
      });

      if (summaryUnlock) {
          summaryUnlock.addEventListener("change", () => {
              this.summaryLocked = !summaryUnlock.checked;
              summary.readOnly = this.summaryLocked;
              if (this.summaryLocked) {
                  summary.value = description.value;
                  summary.classList.add("text-muted");
              } else {
                   summary.classList.remove("text-muted");
              }
          });
      }
  }

  setupMutuallyExclusiveCheckboxes(a, b) {
      if (!a || !b) return;
      a.addEventListener("change", () => { if (a.checked) b.checked = false; });
      b.addEventListener("change", () => { if (b.checked) a.checked = false; });
  }

  setupNsfwToContentWarning() {
      const { nsfw } = this.toggles;
      const { contentWarning } = this.inputs;
      if (!nsfw || !contentWarning) return;

      nsfw.addEventListener("change", () => {
          if (nsfw.checked && !contentWarning.value) {
              contentWarning.value = "NSFW";
          } else if (!nsfw.checked && contentWarning.value === "NSFW") {
              contentWarning.value = "";
          }
      });
  }

  setupThumbnailInput() {
      const { thumbnailFile, thumbnail } = this.inputs;
      const { browseThumbnail } = this.toggles;

      if (!thumbnailFile || !browseThumbnail) return;

      browseThumbnail.addEventListener("click", () => thumbnailFile.click());

      thumbnailFile.addEventListener("change", () => {
          const file = thumbnailFile.files?.[0];
          if (file) {
              thumbnail.value = ""; // Clear explicit URL
              thumbnail.placeholder = `Selected: ${file.name}`;
              thumbnail.disabled = true;
          } else {
              thumbnail.placeholder = "https://example.com/thumbnail.jpg";
              thumbnail.disabled = false;
          }
      });
  }

  // --- R2/Storage Integration ---

  async refreshState() {
    if (this.storageService) {
      const pubkey = this.getCurrentPubkey ? this.getCurrentPubkey() : null;
      this.isStorageUnlocked = pubkey ? this.storageService.isUnlocked(pubkey) : false;
      this.updateLockUi();

      await this.loadFromStorage();
    }
  }

  async loadFromStorage() {
      if (!this.storageService) return;
      const pubkey = this.getCurrentPubkey ? this.getCurrentPubkey() : null;

      if (!pubkey) {
          this.activeCredentials = null;
          this.activeProvider = null;
          this.storageConfigured = false;
          this.toggleStorageView("empty");
          return;
      }

      try {
        const connections = await this.storageService.listConnections(pubkey);
        // Prefer default connection
        const defaultConn = connections.find(c => c.meta?.defaultForUploads);
        const targetConn = defaultConn || connections[0];

        if (targetConn) {
            this.storageConfigured = true;
            this.activeProvider = targetConn.provider;

            // UI Updates
            this.toggleStorageView("summary");
            const providerName = this.getProviderLabel(targetConn.provider || targetConn.meta?.provider);
            const bucketName = targetConn.meta?.bucket || "Unknown Bucket";
            const urlStyle = this.describeUrlStyle(targetConn.provider, targetConn.meta?.forcePathStyle);

            if (this.statusText.summaryProvider) this.statusText.summaryProvider.textContent = providerName;
            if (this.statusText.summaryBucket) this.statusText.summaryBucket.textContent = bucketName;
            if (this.statusText.summaryUrlStyle) this.statusText.summaryUrlStyle.textContent = urlStyle;
            if (this.statusText.summaryCopy) this.statusText.summaryCopy.textContent = this.getSummaryCopy(targetConn.provider);

            if (this.isStorageUnlocked) {
                const details = await this.storageService.getConnection(pubkey, targetConn.id);
                if (details) {
                    this.activeCredentials = details;
                } else {
                    this.activeCredentials = null; // Should not happen if unlocked
                }
            } else {
                this.activeCredentials = null; // Locked
            }
        } else {
            // No connections configured
            this.storageConfigured = false;
            this.activeCredentials = null;
            this.activeProvider = null;
            this.toggleStorageView("empty");
        }
        this.updateLockUi();

      } catch (err) {
          userLogger.error("Failed to load connection", err);
          this.toggleStorageView("empty");
          this.activeCredentials = null;
          this.storageConfigured = false;
          this.updateLockUi();
      }
  }

  toggleStorageView(viewName) {
      if (viewName === "summary") {
          this.storageViews.summary.classList.remove("hidden");
          this.storageViews.empty.classList.add("hidden");
      } else {
          this.storageViews.summary.classList.add("hidden");
          this.storageViews.empty.classList.remove("hidden");
      }
  }

  async handleUnlock() {
      if (!this.storageService) return;
      const pubkey = this.getCurrentPubkey ? this.getCurrentPubkey() : null;
      if (!pubkey) return;

      // We need a signer. Try active signer or authService
      let signer = getActiveSigner();
      if (!signer && this.authService?.signer) {
          signer = this.authService.signer;
      }

      const canSign = typeof signer?.canSign === "function"
        ? signer.canSign()
        : typeof signer?.signEvent === "function";
      if (!canSign) {
          alert("No signer available to unlock storage.");
          return;
      }

      try {
          if (signer?.type === "extension") {
              const permissionResult = await requestDefaultExtensionPermissions();
              if (!permissionResult?.ok) {
                  alert("Extension permissions are required to unlock storage.");
                  return;
              }
          }
          if (this.toggles.storageUnlock) {
            this.toggles.storageUnlock.textContent = "Unlocking...";
            this.toggles.storageUnlock.disabled = true;
          }
          await this.storageService.unlock(pubkey, { signer });
          this.isStorageUnlocked = true;
          this.updateLockUi();
          await this.loadFromStorage();
      } catch (err) {
          userLogger.error("Unlock failed", err);
          alert("Failed to unlock storage: " + err.message);
      } finally {
          if (this.toggles.storageUnlock) {
            this.toggles.storageUnlock.textContent = "Unlock";
            this.toggles.storageUnlock.disabled = false;
          }
      }
  }

  updateLockUi() {
      const locked = !this.isStorageUnlocked;
      if (this.statusText.storageLock) {
          this.statusText.storageLock.textContent = locked ? "Locked 🔒" : "Unlocked 🔓";
          this.statusText.storageLock.className = locked ? "text-xs text-critical" : "text-xs text-success";
      }
      if (this.toggles.storageUnlock) {
          // Show unlock button only if locked AND we have a configuration to unlock
          if (locked && this.storageConfigured) {
              this.toggles.storageUnlock.classList.remove("hidden");
          } else {
              this.toggles.storageUnlock.classList.add("hidden");
          }
      }
  }

  getProviderLabel(provider) {
      if (provider === PROVIDERS.R2 || provider === "cloudflare_r2") {
          return "Cloudflare R2";
      }
      if (provider === PROVIDERS.S3) {
          return "Amazon S3";
      }
      return "S3 Compatible";
  }

  describeUrlStyle(provider, forcePathStyle) {
      if (provider === PROVIDERS.R2 || provider === "cloudflare_r2") {
          return "Virtual-hosted";
      }
      return forcePathStyle ? "Path-style" : "Virtual-hosted";
  }

  getSummaryCopy(provider) {
      if (provider === PROVIDERS.R2 || provider === "cloudflare_r2") {
          return "Uploads will target your Cloudflare R2 bucket.";
      }
      return "Uploads will target your S3-compatible bucket.";
  }

  registerStorageSubscriptions() {
      const services = [this.r2Service, this.s3Service].filter(
          (service) => service && typeof service.on === "function"
      );

      // Clear old
      this.r2Unsubscribes.forEach(u => u && u());
      this.r2Unsubscribes = [];

      services.forEach((service) => {
          const sub = (evt, fn) => {
              const unsub = service.on(evt, fn);
              if (unsub) this.r2Unsubscribes.push(unsub);
          };

          sub("uploadProgress", ({ fraction }) => this.updateProgress(fraction));
          sub("uploadStatus", ({ message, variant }) => this.updateUploadStatus(message, variant));
          sub("uploadStateChange", ({ isUploading }) => {
              this.isUploading = isUploading;
              this.submitButton.disabled = isUploading;
          });
      });
  }

  updateProgress(fraction) {
      const container = this.sourceSections.progress;
      const bar = this.inputs.progress;
      const txt = this.statusText.uploadPercent;

      if (fraction === null || fraction < 0 || isNaN(fraction)) {
          container.classList.add("hidden");
          return;
      }

      container.classList.remove("hidden");
      const pct = Math.round(fraction * 100);
      bar.value = pct;
      txt.textContent = `${pct}%`;
  }

  updateUploadStatus(msg, variant) {
      if (this.statusText.uploadMain) {
          this.statusText.uploadMain.textContent = msg;
      }
  }

  // --- Submission ---

  async handleSubmit() {
      if (this.isUploading) return;

      const audienceFlags = {
          isNsfw: this.toggles.nsfw?.checked || false,
          isForKids: this.toggles.kids?.checked || false,
      };

      // Base Metadata
      const metadata = {
          title: this.inputs.title?.value?.trim() || "",
          description: this.inputs.description?.value?.trim() || "",
          thumbnail: this.inputs.thumbnail?.value?.trim() || "",
          enableComments: this.toggles.comments?.checked || true,
          ...audienceFlags,

          // These might be empty depending on mode, filled below
          url: "",
          magnet: "",
          ws: this.inputs.ws?.value?.trim() || "",
          xs: this.inputs.xs?.value?.trim() || "",
      };

      // NIP-71 Advanced Data
      const nip71 = this.nip71FormManager.collectSection("main");
      if (nip71) {
          metadata.nip71 = nip71;
      }

      try {
          if (this.activeSource === "upload") {
             await this.handleUploadFlow(metadata);
          } else {
             await this.handleExternalFlow(metadata);
          }
      } catch (err) {
          userLogger.error("Upload failed", err);
          this.showError(err.message || "An unexpected error occurred.");
      }
  }

  async handleUploadFlow(metadata) {
      const file = this.inputs.file?.files?.[0];
      if (!file) throw new Error("Please select a video file to upload.");

      if (!this.storageConfigured) throw new Error("Please configure storage first.");
      if (!this.activeCredentials) throw new Error("Storage is locked. Please unlock it to upload.");

      // Check if we have R2 or Generic S3 credentials
      const isR2 = this.activeProvider === PROVIDERS.R2 || this.activeProvider === "cloudflare_r2";

      return isR2
        ? this.handleR2UploadFlow(metadata, file)
        : this.handleS3UploadFlow(metadata, file);
  }

  async handleR2UploadFlow(metadata, file) {
      const thumbnailFile = this.inputs.thumbnailFile?.files?.[0];
      const settings = this.activeCredentials;

      const pubkey = this.getCurrentPubkey ? this.getCurrentPubkey() : null;
      if (!pubkey) throw new Error("Please login to publish.");

      const npub = this.safeEncodeNpub(pubkey);

      let videoKey = "";
      let videoPublicUrl = "";
      let torrentKey = "";
      let torrentPublicUrl = "";

      // Validate baseDomain
      const baseDomain = settings.baseDomain || settings.meta?.baseDomain;
      if (!baseDomain) {
          throw new Error("Missing Public URL (Base Domain) in settings.");
      }

      try {
          videoKey = buildR2Key(npub, file);
          videoPublicUrl = buildPublicUrl(baseDomain, videoKey);

          const baseKey = videoKey.replace(/\.[^/.]+$/, "");
          torrentKey = (baseKey && baseKey !== videoKey) ? `${baseKey}.torrent` : `${videoKey}.torrent`;
          torrentPublicUrl = buildPublicUrl(baseDomain, torrentKey);
      } catch (prepErr) {
          userLogger.warn("Failed to pre-calculate R2 keys:", prepErr);
      }

      const { infoHash, torrentFile, hasValidInfoHash } = await this.generateTorrentMetadata({
          file,
          videoPublicUrl,
      });

      if (!hasValidInfoHash) {
          const proceed = confirm(
            "We couldn't calculate a valid info hash. Publishing will continue with URL-first playback only, and WebTorrent fallback will be unavailable. Continue?"
          );
          if (!proceed) {
              this.updateUploadStatus(
                "Upload canceled. A valid info hash is required for WebTorrent fallback.",
                "warning"
              );
              this.isUploading = false;
              this.submitButton.disabled = false;
              this.updateProgress(null);
              return;
          }
          this.updateUploadStatus(
            "Continuing without WebTorrent fallback (info hash unavailable).",
            "warning"
          );
      }

      // Reconstruct simple settings object expected by r2Service if needed
      // r2Service expects: { accountId, accessKeyId, secretAccessKey, baseDomain }
      // Our stored credential object has flat properties for keys.
      const uploadSettings = {
          accountId: settings.accountId,
          accessKeyId: settings.accessKeyId,
          secretAccessKey: settings.secretAccessKey,
          baseDomain: baseDomain,
      };

      await this.r2Service.uploadVideo({
          npub,
          file,
          thumbnailFile,
          torrentFile,
          metadata,
          infoHash: hasValidInfoHash ? infoHash : "",
          settingsInput: null, // No manual input
          explicitCredentials: uploadSettings,
          publishVideoNote: this.publishVideoNote,
          onReset: () => this.resetForm(),
          forcedVideoKey: videoKey,
          forcedVideoUrl: videoPublicUrl,
          forcedTorrentKey: torrentKey,
          forcedTorrentUrl: torrentPublicUrl,
      });
  }

  async handleS3UploadFlow(metadata, file) {
      const thumbnailFile = this.inputs.thumbnailFile?.files?.[0];
      const settings = this.activeCredentials;

      if (!this.s3Service) throw new Error("S3 upload service is unavailable.");

      const pubkey = this.getCurrentPubkey ? this.getCurrentPubkey() : null;
      if (!pubkey) throw new Error("Please login to publish.");

      const npub = this.safeEncodeNpub(pubkey);

      // Reconstruct settings object for s3Service
      // s3Service expects: { endpoint, region, bucket, accessKeyId, secretAccessKey, publicBaseUrl, forcePathStyle }
      const uploadSettings = {
          endpoint: settings.endpoint || settings.meta?.endpoint,
          region: settings.region || settings.meta?.region || "auto",
          bucket: settings.bucket || settings.meta?.bucket,
          accessKeyId: settings.accessKeyId,
          secretAccessKey: settings.secretAccessKey,
          publicBaseUrl: settings.meta?.publicBaseUrl,
          forcePathStyle: settings.forcePathStyle, // might be boolean in root or meta?
      };

      // Ensure forcePathStyle is boolean
      if (typeof uploadSettings.forcePathStyle !== 'boolean') {
          uploadSettings.forcePathStyle = !!settings.meta?.forcePathStyle;
      }

      let videoKey = "";
      let videoPublicUrl = "";
      let torrentKey = "";
      let torrentPublicUrl = "";

      try {
          videoKey = buildR2Key(npub, file);
          videoPublicUrl = buildS3ObjectUrl({
              publicBaseUrl: uploadSettings.publicBaseUrl,
              endpoint: uploadSettings.endpoint,
              bucket: uploadSettings.bucket,
              key: videoKey,
              forcePathStyle: uploadSettings.forcePathStyle,
          });
          const baseKey = videoKey.replace(/\.[^/.]+$/, "");
          torrentKey = (baseKey && baseKey !== videoKey) ? `${baseKey}.torrent` : `${videoKey}.torrent`;
          torrentPublicUrl = buildS3ObjectUrl({
              publicBaseUrl: uploadSettings.publicBaseUrl,
              endpoint: uploadSettings.endpoint,
              bucket: uploadSettings.bucket,
              key: torrentKey,
              forcePathStyle: uploadSettings.forcePathStyle,
          });
      } catch (prepErr) {
          userLogger.warn("Failed to pre-calculate S3 keys:", prepErr);
      }

      const { infoHash, torrentFile, hasValidInfoHash } = await this.generateTorrentMetadata({
          file,
          videoPublicUrl,
      });

      if (!hasValidInfoHash) {
          const proceed = confirm(
            "We couldn't calculate a valid info hash. Publishing will continue with URL-first playback only, and WebTorrent fallback will be unavailable. Continue?"
          );
          if (!proceed) {
              this.updateUploadStatus(
                "Upload canceled. A valid info hash is required for WebTorrent fallback.",
                "warning"
              );
              this.isUploading = false;
              this.submitButton.disabled = false;
              this.updateProgress(null);
              return;
              }
          this.updateUploadStatus(
            "Continuing without WebTorrent fallback (info hash unavailable).",
            "warning"
          );
      }

      await this.s3Service.uploadVideo({
          npub,
          file,
          thumbnailFile,
          torrentFile,
          metadata,
          infoHash: hasValidInfoHash ? infoHash : "",
          settings: uploadSettings,
          createBucketIfMissing: !!settings.meta?.createBucketIfMissing, // Use meta flag if present
          publishVideoNote: this.publishVideoNote,
          onReset: () => this.resetForm(),
          forcedVideoKey: videoKey,
          forcedVideoUrl: videoPublicUrl,
          forcedTorrentKey: torrentKey,
          forcedTorrentUrl: torrentPublicUrl,
      });
  }

  async generateTorrentMetadata({ file, videoPublicUrl } = {}) {
      this.isUploading = true;
      this.submitButton.disabled = true;
      this.updateUploadStatus("Calculating Info Hash...", "info");
      this.updateProgress(0);

      let infoHash = "";
      let torrentFile = null;

      try {
          const urlList = videoPublicUrl ? [videoPublicUrl] : [];
          const torrentMetadata = await createTorrentMetadata(file, urlList);

          infoHash = torrentMetadata?.infoHash || "";
          if (torrentMetadata?.torrentFile) {
              const baseName = file.name.replace(/\.[^/.]+$/, "") || file.name;
              torrentFile = new File([torrentMetadata.torrentFile], `${baseName}.torrent`, {
                  type: "application/x-bittorrent",
              });
          }
      } catch (hashErr) {
          userLogger.warn("Failed to calculate info hash:", hashErr);
      }

      const normalizedInfoHash = normalizeInfoHash(infoHash);
      const hasValidInfoHash = isValidInfoHash(normalizedInfoHash);

      return {
          infoHash: normalizedInfoHash,
          torrentFile,
          hasValidInfoHash,
      };
  }

  async handleExternalFlow(metadata) {
      metadata.url = this.inputs.url?.value?.trim() || "";
      metadata.magnet = this.inputs.magnet?.value?.trim() || "";

      const hasUrl = metadata.url.length > 0;
      const hasMagnet = metadata.magnet.length > 0;
      const hasImeta = metadata.nip71?.imeta?.some(v => v.url);

      if (!hasUrl && !hasMagnet && !hasImeta) {
          throw new Error("Please provide at least a Video URL or Magnet Link.");
      }

      if (!hasUrl && !hasImeta && hasMagnet) {
         if (!confirm("Magnet-only uploads require active seeding. Proceed?")) return;
      }

      // Normalize & Publish
      const { payload, errors } = normalizeVideoNotePayload(metadata);
      if (errors.length) {
          throw new Error(getVideoNoteErrorMessage(errors[0]));
      }

      // Simulate async publish
      this.submitButton.disabled = true;
      this.submitButton.textContent = "Publishing...";

      try {
          if (this.publishVideoNote) {
              await this.publishVideoNote(payload);
              this.showSuccess("Video published successfully!");
              this.close();
              this.resetForm();
          }
      } finally {
          this.submitButton.disabled = false;
          this.submitButton.textContent = "Publish Video";
      }
  }

  resetForm() {
      this.form.reset();
      this.nip71FormManager.resetSection("main");
      // Restore defaults
      this.setSourceMode("upload");
      this.toggles.comments.checked = true;
      this.toggles.nsfw.checked = false;
      this.toggles.kids.checked = false;
      this.updateProgress(null);

      // Reset thumbnail UI
      if (this.inputs.thumbnail) {
          this.inputs.thumbnail.disabled = false;
          this.inputs.thumbnail.placeholder = "https://example.com/thumbnail.jpg";
      }
      if (this.inputs.thumbnailFile) {
          this.inputs.thumbnailFile.value = "";
      }
  }

  // --- Modal Control ---

  open({ triggerElement } = {}) {
    if (!this.root) return;
    this.root.classList.remove("hidden");
    this.setGlobalModalState("upload", true);
    this.isVisible = true;

    // Refresh lock state on open
    if (this.storageService) {
        const pubkey = this.getCurrentPubkey ? this.getCurrentPubkey() : null;
        this.isStorageUnlocked = pubkey ? this.storageService.isUnlocked(pubkey) : false;
        this.updateLockUi();
        // Always attempt load to refresh configuration status (even if locked)
        this.loadFromStorage().catch(err => {
            userLogger.warn("Failed to refresh storage state on open:", err);
        });
    }

    this.modalAccessibility?.activate({ triggerElement });
  }

  close() {
    if (!this.root) return;
    this.root.classList.add("hidden");
    this.setGlobalModalState("upload", false);
    this.isVisible = false;
    this.modalAccessibility?.deactivate();
  }

  addEventListener(type, listener) {
      this.eventTarget.addEventListener(type, listener);
  }

  emit(type, detail) {
      this.eventTarget.dispatchEvent(new CustomEvent(type, { detail }));
  }

  getRoot() {
      return this.root;
  }

  setupModalAccessibility() {
    if (!this.root) return;
    if (this.modalAccessibility?.destroy) this.modalAccessibility.destroy();

    this.modalAccessibility = createModalAccessibility({
      root: this.root,
      backdrop: this.root.querySelector(".bv-modal-backdrop") || this.root,
      panel: this.root.querySelector(".modal-sheet") || this.root,
      onRequestClose: () => this.close()
    });
  }

  destroy() {
    this.r2Unsubscribes.forEach(u => u && u());
    if (this.modalAccessibility?.destroy) this.modalAccessibility.destroy();
    this.root = null;
    this.container = null;
  }
}
