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

    // Upload State
    this.videoUploadState = {
        status: 'idle', // idle, uploading, complete, error
        progress: 0,
        url: '',
        key: '',
        file: null,
    };
    this.thumbnailUploadState = {
        status: 'idle',
        progress: 0,
        url: '',
        key: '',
        file: null,
    };
    this.torrentState = {
        status: 'idle',
        infoHash: '',
        magnet: '',
        url: '', // xs (torrent file url)
        file: null,
    };

    // UI References
    this.form = null;
    this.modeButtons = {};
    this.sourceSections = {};
    this.inputs = {};
    this.results = {}; // New results section
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
    this.isUploading = false; // Global lock
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
      // this.registerStorageSubscriptions(); // We handle progress locally per file now

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
        thumbnailProgress: $("#thumbnail-progress-container"),
        results: $("#upload-results-container"),
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
        thumbnailProgress: $("#thumbnail-progress"),
    };

    // Results (Generated Links)
    this.results = {
        videoUrl: $("#result-video-url"),
        magnet: $("#result-magnet"),
        torrentUrl: $("#result-torrent-url"),
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
        thumbnailMain: $("#thumbnail-status-text"),
        thumbnailPercent: $("#thumbnail-percent-text"),
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

    // Manage Storage
    if (this.toggles.manageStorage) {
        this.toggles.manageStorage.addEventListener("click", () => {
            if (this.onRequestStorageSettings) {
                this.close();
                this.onRequestStorageSettings();
            }
        });
    }

    if (this.toggles.configureStorage) {
        this.toggles.configureStorage.addEventListener("click", (e) => {
            e.preventDefault();
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

    // File Selection (Triggers upload immediately)
    if (this.inputs.file) {
        this.inputs.file.addEventListener("change", (e) => this.handleVideoSelection(e));
    }

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
        // Show results if we have them
        if (this.videoUploadState.url || this.torrentState.magnet) {
             this.sourceSections.results.classList.remove("hidden");
        }

        if (this.toggles.browseThumbnail) {
            this.toggles.browseThumbnail.classList.remove("hidden");
        }
    } else {
        this.sourceSections.upload.classList.add("hidden");
        this.sourceSections.external.classList.remove("hidden");
        this.sourceSections.results.classList.add("hidden");

        if (this.toggles.browseThumbnail) {
            this.toggles.browseThumbnail.classList.add("hidden");
        }
    }

    this.submitButton.textContent = isUpload ? "Publish Video" : "Publish Video";
  }

  setupAccordion(btn, section) {
      if (!btn || !section) return;
      btn.addEventListener("click", () => {
          const isHidden = section.classList.contains("hidden");
          if (isHidden) {
              section.classList.remove("hidden");
              btn.setAttribute("aria-expanded", "true");
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
              thumbnail.value = "";
              thumbnail.placeholder = `Selected: ${file.name}`;
              thumbnail.disabled = true;
              this.handleThumbnailSelection(file); // Trigger upload immediately
          } else {
              thumbnail.placeholder = "https://example.com/thumbnail.jpg";
              thumbnail.disabled = false;
          }
      });
  }

  // --- Immediate Upload Handlers ---

  async handleVideoSelection(e) {
      const file = e.target.files?.[0];
      if (!file) return;

      if (!this.storageConfigured) {
          alert("Please configure storage before selecting a file.");
          e.target.value = ""; // Clear selection
          return;
      }
      if (!this.isStorageUnlocked) {
          alert("Please unlock storage before selecting a file.");
          e.target.value = "";
          return;
      }

      // Reset Video State
      this.videoUploadState = {
          status: 'uploading',
          progress: 0,
          url: '',
          key: '',
          file: file,
      };
      // Reset Torrent State
      this.torrentState = {
          status: 'pending',
          infoHash: '',
          magnet: '',
          url: '',
          file: null,
      };

      // Show UI
      this.sourceSections.progress.classList.remove("hidden");
      this.sourceSections.results.classList.remove("hidden");
      this.results.videoUrl.value = "Uploading...";
      this.results.magnet.value = "Pending...";
      this.results.torrentUrl.value = "Pending...";

      this.updateVideoProgress(0, "Preparing upload...");

      try {
          // 1. Prepare Upload (Get Creds & Bucket)
          const pubkey = this.getCurrentPubkey();
          const npub = this.safeEncodeNpub(pubkey);
          const service = this.activeProvider === PROVIDERS.R2 || this.activeProvider === "cloudflare_r2"
              ? this.r2Service
              : this.s3Service;

          const { settings, bucketEntry } = await service.prepareUpload(npub, { credentials: this.activeCredentials });

          // 2. Determine Keys
          const videoKey = buildR2Key(npub, file);
          const baseDomain = bucketEntry.publicBaseUrl;

          // Note: buildPublicUrl works for both if the base is clean
          // For S3, buildS3ObjectUrl might be safer if we have complex paths, but prepareUpload standardizes on publicBaseUrl
          let videoPublicUrl = "";
          if (this.activeProvider === PROVIDERS.R2 || this.activeProvider === "cloudflare_r2") {
               videoPublicUrl = buildPublicUrl(baseDomain, videoKey);
          } else {
               videoPublicUrl = buildS3ObjectUrl({
                   publicBaseUrl: baseDomain,
                   key: videoKey,
                   // For S3 we might need forcePathStyle if publicBaseUrl isn't set, but prepareUpload enforces it.
               });
          }

          // 3. Start Video Upload
          this.updateVideoProgress(0, "Uploading video...");
          const uploadPromise = service.uploadFile({
              file,
              bucket: bucketEntry.bucket,
              key: videoKey,
              // Spread settings carefully
              endpoint: settings.endpoint,
              region: settings.region,
              accessKeyId: settings.accessKeyId,
              secretAccessKey: settings.secretAccessKey,
              forcePathStyle: settings.forcePathStyle,
              createBucketIfMissing: true,
              onProgress: (fraction) => {
                  this.updateVideoProgress(fraction);
              }
          });

          // 4. Calculate Info Hash (Parallel if possible, but JS single thread limits this.
          // Since createTorrentMetadata reads the file, it might contend with upload read.
          // Let's do it concurrently and hope the browser handles file I/O well.
          this.updateVideoProgress(null, "Uploading & Calculating Hash...");

          const torrentPromise = this.generateTorrentMetadata({ file, videoPublicUrl });

          const [uploadResult, torrentResult] = await Promise.all([uploadPromise, torrentPromise]);

          // Video Complete
          this.videoUploadState.status = 'complete';
          this.videoUploadState.url = videoPublicUrl;
          this.videoUploadState.key = videoKey;
          this.results.videoUrl.value = videoPublicUrl;
          this.updateVideoProgress(1, "Video uploaded.");

          // 5. Handle Torrent Result & Upload .torrent file
          if (torrentResult.hasValidInfoHash && torrentResult.torrentFile) {
              const baseKey = videoKey.replace(/\.[^/.]+$/, "");
              const torrentKey = (baseKey && baseKey !== videoKey) ? `${baseKey}.torrent` : `${videoKey}.torrent`;

              let torrentPublicUrl = "";
              if (this.activeProvider === PROVIDERS.R2 || this.activeProvider === "cloudflare_r2") {
                   torrentPublicUrl = buildPublicUrl(baseDomain, torrentKey);
              } else {
                   torrentPublicUrl = buildS3ObjectUrl({ publicBaseUrl: baseDomain, key: torrentKey });
              }

              this.updateVideoProgress(1, "Uploading torrent metadata...");

              await service.uploadFile({
                  file: torrentResult.torrentFile,
                  bucket: bucketEntry.bucket,
                  key: torrentKey,
                  endpoint: settings.endpoint,
                  region: settings.region,
                  accessKeyId: settings.accessKeyId,
                  secretAccessKey: settings.secretAccessKey,
                  forcePathStyle: settings.forcePathStyle,
                  createBucketIfMissing: true,
              });

              this.torrentState.status = 'complete';
              this.torrentState.infoHash = torrentResult.infoHash;
              this.torrentState.url = torrentPublicUrl;
              this.torrentState.file = torrentResult.torrentFile;

              // Construct Magnet
              const encodedDn = encodeURIComponent(file.name);
              const encodedWs = encodeURIComponent(videoPublicUrl);
              const encodedXs = encodeURIComponent(torrentPublicUrl);
              const magnet = `magnet:?xt=urn:btih:${torrentResult.infoHash}&dn=${encodedDn}&ws=${encodedWs}&xs=${encodedXs}`;

              this.torrentState.magnet = magnet;

              this.results.magnet.value = magnet;
              this.results.torrentUrl.value = torrentPublicUrl;

              this.updateVideoProgress(1, "Ready to publish!");
          } else {
              this.torrentState.status = 'skipped'; // Failed hash or invalid
              this.updateVideoProgress(1, "Upload complete (No torrent fallback).");
              this.results.magnet.value = "Not available (Info Hash failed)";
              this.results.torrentUrl.value = "Not available";
          }

      } catch (err) {
          userLogger.error("Video upload sequence failed:", err);
          this.videoUploadState.status = 'error';
          this.updateVideoProgress(null, "Upload failed.");
          alert(`Upload failed: ${err.message}`);

          this.sourceSections.progress.classList.add("hidden");
          this.inputs.file.value = ""; // Reset
      }
  }

  async handleThumbnailSelection(file) {
      if (!this.storageConfigured || !this.isStorageUnlocked) {
          // We can't upload yet. Just hold it in state or warn?
          // Since UI disables the browse button until unlocked (mostly), we assume safe.
          // But if they just unlocked, we're good.
          return;
      }

      this.thumbnailUploadState = {
          status: 'uploading',
          progress: 0,
          url: '',
          key: '',
          file: file,
      };

      this.sourceSections.thumbnailProgress.classList.remove("hidden");
      this.updateThumbnailProgress(0, "Uploading thumbnail...");

      try {
          const pubkey = this.getCurrentPubkey();
          const npub = this.safeEncodeNpub(pubkey);
          const service = this.activeProvider === PROVIDERS.R2 || this.activeProvider === "cloudflare_r2"
              ? this.r2Service
              : this.s3Service;

          const { settings, bucketEntry } = await service.prepareUpload(npub, { credentials: this.activeCredentials });

          // Derive Key (randomish or based on file)
          // We don't have the video key here easily if video isn't selected yet.
          // Use a standalone key structure: npub/thumbnails/timestamp-name
          const timestamp = Date.now();
          const cleanName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
          const key = `${npub}/thumbnails/${timestamp}-${cleanName}`;

          const baseDomain = bucketEntry.publicBaseUrl;
          let publicUrl = "";
          if (this.activeProvider === PROVIDERS.R2 || this.activeProvider === "cloudflare_r2") {
              publicUrl = buildPublicUrl(baseDomain, key);
          } else {
              publicUrl = buildS3ObjectUrl({ publicBaseUrl: baseDomain, key });
          }

          await service.uploadFile({
              file,
              bucket: bucketEntry.bucket,
              key,
              endpoint: settings.endpoint,
              region: settings.region,
              accessKeyId: settings.accessKeyId,
              secretAccessKey: settings.secretAccessKey,
              forcePathStyle: settings.forcePathStyle,
              createBucketIfMissing: true,
              onProgress: (fraction) => this.updateThumbnailProgress(fraction)
          });

          this.thumbnailUploadState.status = 'complete';
          this.thumbnailUploadState.url = publicUrl;
          this.inputs.thumbnail.value = publicUrl;

          this.updateThumbnailProgress(1, "Thumbnail uploaded.");

          // Hide progress after a delay
          setTimeout(() => {
              this.sourceSections.thumbnailProgress.classList.add("hidden");
          }, 2000);

      } catch (err) {
          userLogger.error("Thumbnail upload failed:", err);
          this.thumbnailUploadState.status = 'error';
          this.updateThumbnailProgress(null, "Failed.");
          alert("Thumbnail upload failed.");
      }
  }


  updateVideoProgress(fraction, text) {
      if (text) this.statusText.uploadMain.textContent = text;

      if (fraction === null) {
           // Indeterminate or error
           return;
      }

      const pct = Math.round(fraction * 100);
      this.inputs.progress.value = pct;
      this.statusText.uploadPercent.textContent = `${pct}%`;
  }

  updateThumbnailProgress(fraction, text) {
      if (text) this.statusText.thumbnailMain.textContent = text;

      if (fraction === null) return;

      const pct = Math.round(fraction * 100);
      this.inputs.thumbnailProgress.value = pct;
      this.statusText.thumbnailPercent.textContent = `${pct}%`;
  }


  // --- R2/Storage Integration (View Only now) ---

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

            if (this.statusText.summaryProvider) {
                this.statusText.summaryProvider.textContent = providerName;
                this.statusText.summaryProvider.title = providerName;
            }
            if (this.statusText.summaryBucket) {
                this.statusText.summaryBucket.textContent = bucketName;
                this.statusText.summaryBucket.title = bucketName;
            }
            if (this.statusText.summaryUrlStyle) {
                this.statusText.summaryUrlStyle.textContent = urlStyle;
                this.statusText.summaryUrlStyle.title = urlStyle;
            }
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


  // --- Submission ---

  async handleSubmit() {
      // Check upload state
      if (this.activeSource === "upload") {
          if (this.videoUploadState.status === 'uploading' || this.thumbnailUploadState.status === 'uploading') {
              alert("Please wait for uploads to complete.");
              return;
          }
          if (this.videoUploadState.status === 'error') {
              alert("Video upload failed. Please try again.");
              return;
          }
          if (this.videoUploadState.status !== 'complete') {
               // Fallback: If no file selected, maybe they want to submit without a new file?
               // (Not supported in this simplified modal, assume file required)
               alert("Please select a video file and wait for it to upload.");
               return;
          }
      }

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
             // We already have the URLs in state
             metadata.url = this.videoUploadState.url;
             metadata.magnet = this.torrentState.magnet || "";
             metadata.ws = this.videoUploadState.url; // WebSeed is same as R2 URL
             metadata.xs = this.torrentState.url || "";

             // NIP-71 IMETA for the main video
             // We construct a primary imeta entry for the uploaded file
             const imeta = {
                 url: this.videoUploadState.url,
                 m: this.videoUploadState.file?.type || "video/mp4",
                 x: this.torrentState.infoHash || "",
             };

             // Merge with user provided imeta if any
             if (!metadata.nip71) metadata.nip71 = {};
             if (!metadata.nip71.imeta) metadata.nip71.imeta = [];
             metadata.nip71.imeta.unshift(imeta);

             await this.publish(metadata);

          } else {
             await this.handleExternalFlow(metadata);
          }
      } catch (err) {
          userLogger.error("Submission failed", err);
          this.showError(err.message || "An unexpected error occurred.");
      }
  }

  async generateTorrentMetadata({ file, videoPublicUrl } = {}) {
      // Helper used by immediate upload flow
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

      await this.publish(metadata);
  }

  async publish(metadata) {
      // Normalize & Publish
      const { payload, errors } = normalizeVideoNotePayload(metadata);
      if (errors.length) {
          throw new Error(getVideoNoteErrorMessage(errors[0]));
      }

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

      // Reset State
      this.videoUploadState = { status: 'idle', progress: 0, url: '', key: '', file: null };
      this.thumbnailUploadState = { status: 'idle', progress: 0, url: '', key: '', file: null };
      this.torrentState = { status: 'idle', infoHash: '', magnet: '', url: '', file: null };

      this.sourceSections.progress.classList.add("hidden");
      this.sourceSections.thumbnailProgress.classList.add("hidden");
      this.sourceSections.results.classList.add("hidden");

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
