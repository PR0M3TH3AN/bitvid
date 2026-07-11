// components/UploadModal.js
import { createModalAccessibility } from "./modalAccessibility.js";
import { Nip71FormManager } from "./nip71FormManager.js";
import { probeVideoMetadata } from "../../utils/videoProbe.js";
import { MediaUploader } from "./mediaUploader.js";
import { devLogger, userLogger } from "../../utils/logger.js";
import {
  getVideoNoteErrorMessage,
  normalizeVideoNotePayload,
} from "../../services/videoNotePayload.js";
import {
  calculateTorrentInfoHash,
  createTorrentMetadata,
} from "../../utils/torrentHash.js";
import { sanitizeBucketName } from "../../storage/r2-mgmt.js";
import { buildR2Key, buildPublicUrl } from "../../r2.js";
import { buildS3ObjectUrl } from "../../services/s3Service.js";
import { PROVIDERS } from "../../services/storageService.js";
import {
  BLOSSOM_PROVIDER,
  isBlossomProvider,
} from "../../services/blossomService.js";
import {
  buildStoragePointerValue,
  buildStoragePrefixFromKey,
  deriveStoragePointerFromUrl,
} from "../../utils/storagePointer.js";
import {
  nostrClient,
  getActiveSigner,
  requestDefaultExtensionPermissions,
} from "../../nostrClientFacade.js";
import { UI_FEEDBACK_DELAY_MS } from "../../constants.js";
import { showConfirm } from "../confirmDialog.js";
import {
  ensureStorageUnlockedForUpload,
  resetThumbnailPicker,
  promptStoredNsecUnlock,
  pickTargetConnection,
  renderConnectionPicker,
} from "./uploadModalStorageUnlock.js";

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
    onRequestUnlock,
    ensureSigner,
    getHashtagSuggestions,
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
    this.getHashtagSuggestions =
      typeof getHashtagSuggestions === "function" ? getHashtagSuggestions : null;
    this.safeEncodeNpub =
      typeof safeEncodeNpub === "function" ? safeEncodeNpub : () => "";
    // Shared storage+torrent upload core (also used by the Edit modal).
    this.mediaUploader = new MediaUploader({
      r2Service: this.r2Service,
      s3Service: this.s3Service,
      storageService: this.storageService,
      getCurrentPubkey: () =>
        this.getCurrentPubkey ? this.getCurrentPubkey() : null,
      safeEncodeNpub: (pubkey) => this.safeEncodeNpub(pubkey),
      getSigner: () => getActiveSigner(),
      signAndPublishEvent: (event) => nostrClient.signAndPublishEvent(event),
    });
    this.eventTarget =
      eventTarget instanceof EventTarget ? eventTarget : new EventTarget();
    this.container = container || null;
    this.onRequestStorageSettings = typeof onRequestStorageSettings === "function" ? onRequestStorageSettings : null;
    // Opens the login modal's unlock-saved-key (passphrase) flow — used when a
    // persisted nsec session is locked after a reload.
    this.onRequestUnlock = typeof onRequestUnlock === "function" ? onRequestUnlock : null;
    // Shared signer gate (app.ensureEncryptionCapableSigner): silently restores a
    // kept-unlocked key or shows ONE passphrase prompt, so the file pickers can
    // unlock storage inline instead of dead-ending (#56).
    this.ensureSigner = typeof ensureSigner === "function" ? ensureSigner : null;

    this.root = null;
    this.isVisible = false;
    this.activeSource = "upload"; // 'upload' | 'external'

    // Internal state for credentials
    this.activeCredentials = null;
    this.activeProvider = null;
    this.isStorageUnlocked = false;
    this.storageConfigured = false;
    // Blossom connections have no encrypted secret, so they never need a PIN
    // unlock — the upload authorizes with the Nostr signer instead.
    this.activeProviderIsBlossom = false;
    // #44: per-modal upload-destination override (null = account default).
    this.selectedConnectionId = null;

    // Live-refresh the storage destination if connections change under an open
    // modal — e.g. credentials synced from Nostr — so the user doesn't have to
    // reopen. Scoped to the active user + open state.
    if (this.storageService?.onConnectionsChanged) {
      this.storageService.onConnectionsChanged(({ pubkey } = {}) => {
        if (!this.isVisible) return;
        const current = this.getCurrentPubkey ? this.getCurrentPubkey() : null;
        if (pubkey && current && pubkey !== current) return;
        void this.refreshStorageFromSync(current);
      });
    }

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

    // Upload Session IDs (to guard against zombie callbacks)
    this.videoUploadId = 0;
    this.thumbnailUploadId = 0;
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

      const modalRoot = wrapper.querySelector("#uploadModal");
      if (!modalRoot) throw new Error("UploadModal template must contain #uploadModal element");

      targetContainer.appendChild(modalRoot);
      this.root = modalRoot;
      this.container = targetContainer;

      this.cacheElements();
      this.bindEvents();
      this.setupModalAccessibility();
      // this.registerStorageSubscriptions(); // We handle progress locally per file now

      // Initial State
      if (this.storageService) {
        const pubkey = this.getCurrentPubkey ? this.getCurrentPubkey() : null;
        await this.maybeAutoUnlockStorage(pubkey);
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
    this.hashtagSuggestionsWrap = $("#hashtag-suggestions-wrap");
    this.hashtagSuggestionsList = $("#hashtag-suggestions");

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
        connectionPicker: $("#storage-connection-picker"),
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

        // #44: upload-destination picker
        storageConnection: $("#select-storage-connection"),
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

    if (this.inputs.storageConnection) {
        // #44: switching the destination re-resolves summary + credentials.
        this.inputs.storageConnection.addEventListener("change", () => {
            this.selectedConnectionId = this.inputs.storageConnection.value || null;
            void this.loadFromStorage();
        });
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

  // Best-effort: read the file's dimensions/duration so we can persist them
  // (orientation → 34236 short selection + a future "shorts" feed). Never blocks
  // upload; failures just leave the metadata unset.
  async captureVideoMetadata(file) {
      this.capturedMetadata = null;
      if (!file || typeof URL === "undefined" || typeof URL.createObjectURL !== "function") {
          return;
      }
      const objectUrl = URL.createObjectURL(file);
      try {
          this.capturedMetadata = await probeVideoMetadata(objectUrl);
      } catch (error) {
          this.capturedMetadata = null;
      } finally {
          try {
              URL.revokeObjectURL(objectUrl);
          } catch (revokeError) {
              // ignore
          }
      }
  }

  async handleVideoSelection(e) {
      const file = e.target.files?.[0];
      if (!file) return;

      // Probe dimensions/duration in the background while the upload proceeds.
      void this.captureVideoMetadata(file);

      if (!this.storageConfigured) {
          this.showError("Please configure storage before selecting a file.");
          e.target.value = ""; // Clear selection
          return;
      }
      if (!this.isStorageUnlocked && !this.activeProviderIsBlossom) {
          // #56: unlock inline (silent restore or one passphrase prompt) and
          // continue with this same file pick instead of erroring. Blossom has no
          // secret to unlock — it authorizes with the Nostr signer at upload time.
          const unlocked = await this.ensureStorageUnlockedForUpload();
          if (!unlocked) {
              e.target.value = "";
              return;
          }
      }

      // Start new session
      const currentUploadId = ++this.videoUploadId;

      // Reset UI classes
      if (this.statusText.uploadMain) {
          this.statusText.uploadMain.classList.remove("text-critical");
          this.statusText.uploadMain.classList.add("text-text");
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
      if (this.results.videoUrl) this.results.videoUrl.value = "Uploading...";
      if (this.results.magnet) this.results.magnet.value = "Pending...";
      if (this.results.torrentUrl) this.results.torrentUrl.value = "Pending...";

      this.updateVideoProgress(0, "Preparing upload...");

      try {
          const result = await this.mediaUploader.uploadVideo(file, {
              provider: this.activeProvider,
              credentials: this.activeCredentials,
              onProgress: ({ fraction, label }) => {
                  if (this.videoUploadId === currentUploadId) {
                      this.updateVideoProgress(fraction, label || undefined);
                  }
              },
          });

          if (this.videoUploadId !== currentUploadId) return; // Zombie guard

          // Video Complete
          this.videoUploadState.status = 'complete';
          this.videoUploadState.url = result.url;
          this.videoUploadState.key = result.key;
          this.videoUploadState.storagePointer = result.storagePointer;
          if (this.results.videoUrl) this.results.videoUrl.value = result.url;

          if (result.hasValidInfoHash) {
              this.torrentState.status = 'complete';
              this.torrentState.infoHash = result.infoHash;
              this.torrentState.url = result.torrentUrl;
              this.torrentState.file = result.torrentFile;
              this.torrentState.magnet = result.magnet;

              if (this.results.magnet) this.results.magnet.value = result.magnet;
              if (this.results.torrentUrl) this.results.torrentUrl.value = result.torrentUrl;
          } else {
              this.torrentState.status = 'skipped'; // Failed hash or invalid
              if (this.results.magnet) this.results.magnet.value = "Not available (Info Hash failed)";
              if (this.results.torrentUrl) this.results.torrentUrl.value = "Not available";
          }

      } catch (err) {
          if (this.videoUploadId !== currentUploadId) return; // Zombie guard

          userLogger.error("Video upload sequence failed:", err);
          this.videoUploadState.status = 'error';
          this.updateVideoProgress(null, "Upload failed.");

          if (this.statusText.uploadMain) {
              this.statusText.uploadMain.classList.remove("text-text");
              this.statusText.uploadMain.classList.add("text-critical");
          }

          if (this.results.videoUrl) this.results.videoUrl.value = "Upload Failed";
          if (this.results.magnet) this.results.magnet.value = "Upload Failed";
          if (this.results.torrentUrl) this.results.torrentUrl.value = "Upload Failed";

          this.showError(`Upload failed: ${err.message}`);

          if (this.inputs.file) this.inputs.file.value = ""; // Reset
      }
  }

  async handleThumbnailSelection(file) {
      if (!this.storageConfigured) {
          this.showError("Configure storage before uploading a thumbnail.");
          this.resetThumbnailPicker();
          return;
      }
      if (!this.isStorageUnlocked && !this.activeProviderIsBlossom) {
          // #56: prompt to unlock inline instead of silently dropping the pick.
          // Blossom needs no unlock (signer-authorized at upload time).
          const unlocked = await this.ensureStorageUnlockedForUpload();
          if (!unlocked) {
              this.resetThumbnailPicker();
              return;
          }
      }

      const currentUploadId = ++this.thumbnailUploadId;

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
          const { url: publicUrl } = await this.mediaUploader.uploadThumbnail(
              file,
              {
                  provider: this.activeProvider,
                  credentials: this.activeCredentials,
                  onProgress: (fraction) => {
                      if (this.thumbnailUploadId === currentUploadId) {
                          this.updateThumbnailProgress(fraction);
                      }
                  },
              },
          );

          if (this.thumbnailUploadId !== currentUploadId) return;

          this.thumbnailUploadState.status = 'complete';
          this.thumbnailUploadState.url = publicUrl;
          if (this.inputs.thumbnail) this.inputs.thumbnail.value = publicUrl;

          this.updateThumbnailProgress(1, "Thumbnail uploaded.");

          // Hide progress after a delay
          setTimeout(() => {
              if (this.thumbnailUploadId === currentUploadId) {
                  this.sourceSections.thumbnailProgress.classList.add("hidden");
              }
          }, UI_FEEDBACK_DELAY_MS);

      } catch (err) {
          if (this.thumbnailUploadId !== currentUploadId) return;

          userLogger.error("Thumbnail upload failed:", err);
          this.thumbnailUploadState.status = 'error';
          this.updateThumbnailProgress(null, "Failed.");
          this.showError("Thumbnail upload failed.");
      }
  }


  updateVideoProgress(fraction, text) {
      if (text && this.statusText?.uploadMain) {
          this.statusText.uploadMain.textContent = text;
      }

      if (fraction === null) {
           // Indeterminate or error
           return;
      }

      const pct = Math.round(fraction * 100);
      if (this.inputs.progress) this.inputs.progress.value = pct;
      if (this.statusText.uploadPercent) this.statusText.uploadPercent.textContent = `${pct}%`;
  }

  updateThumbnailProgress(fraction, text) {
      if (text && this.statusText.thumbnailMain) this.statusText.thumbnailMain.textContent = text;

      if (fraction === null) return;

      const pct = Math.round(fraction * 100);
      if (this.inputs.thumbnailProgress) this.inputs.thumbnailProgress.value = pct;
      if (this.statusText.thumbnailPercent) this.statusText.thumbnailPercent.textContent = `${pct}%`;
  }


  // --- R2/Storage Integration (View Only now) ---

  async refreshState() {
    if (this.storageService) {
      const pubkey = this.getCurrentPubkey ? this.getCurrentPubkey() : null;
      await this.maybeAutoUnlockStorage(pubkey);
      this.isStorageUnlocked = pubkey ? this.storageService.isUnlocked(pubkey) : false;
      this.updateLockUi();

      await this.loadFromStorage();
    }
  }

  // Silently unlock existing storage when a decrypt-capable signer is already
  // available (e.g. a kept-unlocked nsec restored on refresh, TODO #51) so the
  // upload modal opens Unlocked instead of Locked. Guarded on an EXISTING account
  // so it never creates storage for magnet/URL-only uploaders, and on the signer
  // already being present so it never triggers a fresh permission prompt.
  async maybeAutoUnlockStorage(pubkey) {
    if (!this.storageService || !pubkey) {
      return;
    }
    if (this.storageService.isUnlocked(pubkey)) {
      return;
    }
    const signer = getActiveSigner();
    if (
      !signer ||
      (typeof signer.nip44Decrypt !== "function" &&
        typeof signer.nip04Decrypt !== "function")
    ) {
      return;
    }
    try {
      const hasAccount =
        typeof this.storageService.hasStoredAccount === "function"
          ? await this.storageService.hasStoredAccount(pubkey)
          : false;
      if (!hasAccount) {
        return;
      }
      await this.storageService.unlock(pubkey, { signer });
    } catch (error) {
      devLogger?.log?.(
        "[UploadModal] Auto-unlock storage skipped:",
        error?.message || error,
      );
    }
  }

  // --- Hashtag suggestion chips (TODO #45) ---

  // The hashtags currently entered in the "t" repeater (normalized).
  getSelectedHashtags() {
    if (!this.nip71FormManager) {
      return [];
    }
    try {
      return this.nip71FormManager
        .collectRepeaterValues("main", "t", (entry) =>
          this.nip71FormManager.getFieldValue(entry, "value"),
        )
        .map((value) => this.nip71FormManager.sanitizeHashtagValue(value))
        .filter(Boolean);
    } catch (error) {
      return [];
    }
  }

  // Add a hashtag to the "t" repeater (skips duplicates). Returns true if added.
  addHashtagValue(rawValue) {
    if (!this.nip71FormManager) {
      return false;
    }
    const normalized = this.nip71FormManager.sanitizeHashtagValue(rawValue);
    if (!normalized) {
      return false;
    }
    if (new Set(this.getSelectedHashtags()).has(normalized)) {
      return false;
    }
    const entry = this.nip71FormManager.addRepeaterEntry("main", "t");
    if (!entry) {
      return false;
    }
    this.nip71FormManager.setFieldValue(entry, "value", normalized);
    return true;
  }

  // Render one-tap chips for the user's most-used past hashtags. Hidden when the
  // user has none (new/first upload).
  renderHashtagSuggestions() {
    const list = this.hashtagSuggestionsList;
    const wrap = this.hashtagSuggestionsWrap;
    if (!(list instanceof HTMLElement)) {
      return;
    }

    let suggestions = [];
    if (typeof this.getHashtagSuggestions === "function") {
      try {
        suggestions = this.getHashtagSuggestions({ limit: 12 }) || [];
      } catch (error) {
        suggestions = [];
      }
    }

    list.textContent = "";
    const usable = Array.isArray(suggestions) ? suggestions : [];
    if (!usable.length) {
      if (wrap instanceof HTMLElement) {
        wrap.classList.add("hidden");
      }
      return;
    }

    for (const item of usable) {
      const tag = this.nip71FormManager
        ? this.nip71FormManager.sanitizeHashtagValue(item?.tag)
        : typeof item?.tag === "string"
          ? item.tag
          : "";
      if (!tag) {
        continue;
      }
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className =
        "btn-ghost px-3 py-1 text-xs bg-surface border border-border/50 rounded-full";
      chip.dataset.tag = tag;
      chip.textContent = `#${tag}`;
      chip.addEventListener("click", () => {
        this.addHashtagValue(tag);
        this.refreshHashtagSuggestionStates();
      });
      list.appendChild(chip);
    }

    if (wrap instanceof HTMLElement) {
      wrap.classList.remove("hidden");
    }
    this.refreshHashtagSuggestionStates();
  }

  // Dim + disable chips whose tag is already in the current tag list.
  refreshHashtagSuggestionStates() {
    const list = this.hashtagSuggestionsList;
    if (!(list instanceof HTMLElement)) {
      return;
    }
    const selected = new Set(this.getSelectedHashtags());
    list.querySelectorAll("[data-tag]").forEach((chip) => {
      const isSelected = selected.has(chip.dataset.tag);
      chip.classList.toggle("opacity-40", isSelected);
      chip.setAttribute("aria-pressed", isSelected ? "true" : "false");
      if ("disabled" in chip) {
        chip.disabled = isSelected;
      }
    });
  }

  // Re-derive the storage destination after connections change under an open
  // modal (e.g. a Nostr sync import). Mirrors the open-time flow: a sync import
  // may re-lock storage with a new master-key envelope, so re-attempt auto-unlock
  // (Blossom stays keyless), recompute the unlocked state, then reload + repaint.
  async refreshStorageFromSync(pubkey) {
    if (!this.storageService || !this.isVisible) return;
    const key =
      pubkey || (this.getCurrentPubkey ? this.getCurrentPubkey() : null);
    try {
      await this.maybeAutoUnlockStorage(key);
      this.isStorageUnlocked = key
        ? this.storageService.isUnlocked(key)
        : false;
      await this.loadFromStorage();
      this.updateLockUi();
    } catch (error) {
      devLogger.warn?.("[UploadModal] storage-sync refresh failed:", error);
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
        // #44: a per-modal selection wins over the account default.
        const { targetConn, defaultConn } = pickTargetConnection(this, connections);
        renderConnectionPicker(this, connections, targetConn, defaultConn);

        if (targetConn) {
            this.storageConfigured = true;
            this.activeProvider = targetConn.provider;
            this.activeProviderIsBlossom = isBlossomProvider(targetConn.provider);

            // UI Updates
            this.toggleStorageView("summary");
            const providerName = this.getProviderLabel(targetConn.provider || targetConn.meta?.provider);
            const blossomServers = Array.isArray(targetConn.meta?.servers)
                ? targetConn.meta.servers
                : [];
            const bucketName = this.activeProviderIsBlossom
                ? `${blossomServers.length} server${blossomServers.length === 1 ? "" : "s"}`
                : targetConn.meta?.bucket || "Unknown Bucket";
            const urlStyle = this.activeProviderIsBlossom
                ? "Nostr-native (content-addressed)"
                : this.describeUrlStyle(targetConn.provider, targetConn.meta?.forcePathStyle);

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

            if (this.activeProviderIsBlossom) {
                // No secret to decrypt — servers live in the plaintext meta.
                this.activeCredentials = {
                    provider: BLOSSOM_PROVIDER,
                    servers: blossomServers,
                    meta: targetConn.meta || {},
                };
            } else if (this.isStorageUnlocked) {
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
            this.activeProviderIsBlossom = false;
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
      if (!this.storageViews?.summary || !this.storageViews?.empty) {
          return;
      }
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
          // A persisted ("remember this key") nsec session restores the logged-in
          // pubkey after a reload but NOT the in-memory signer (the key is passphrase-
          // encrypted). Prompt the user to re-unlock their saved key instead of dead-
          // ending — matches the storage pane's behavior (#36).
          if (this.promptStoredNsecUnlock(pubkey)) {
              return;
          }
          this.showError("No signer available to unlock storage.");
          return;
      }

      try {
          if (signer?.type === "extension" || signer?.type === "nip07") {
              const permissionResult = await requestDefaultExtensionPermissions();
              if (!permissionResult?.ok) {
                  this.showError("Extension permissions are required to unlock storage.");
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
          this.showError("Failed to unlock storage: " + err.message);
      } finally {
          if (this.toggles.storageUnlock) {
            this.toggles.storageUnlock.textContent = "Unlock";
            this.toggles.storageUnlock.disabled = false;
          }
      }
  }

  // #36 / #56 storage-unlock glue lives in uploadModalStorageUnlock.js (file-size
  // budget); these stay as instance methods so callers/tests are unchanged.
  async ensureStorageUnlockedForUpload() {
      return ensureStorageUnlockedForUpload(this);
  }

  resetThumbnailPicker() {
      resetThumbnailPicker(this);
  }

  promptStoredNsecUnlock(pubkey) {
      return promptStoredNsecUnlock(this, pubkey);
  }

  updateLockUi() {
      // Blossom has no secret to unlock — never show it as "locked".
      const locked = !this.isStorageUnlocked && !this.activeProviderIsBlossom;
      if (this.statusText?.storageLock) {
          this.statusText.storageLock.textContent = locked ? "Locked 🔒" : "Unlocked 🔓";
          this.statusText.storageLock.className = locked ? "text-xs text-critical" : "text-xs text-success";
      }
      if (this.toggles?.storageUnlock) {
          // Show unlock button only if locked AND we have a configuration to unlock
          if (locked && this.storageConfigured) {
              this.toggles.storageUnlock.classList.remove("hidden");
          } else {
              this.toggles.storageUnlock.classList.add("hidden");
          }
      }
  }

  getProviderLabel(provider) {
      if (isBlossomProvider(provider)) {
          return "Blossom";
      }
      if (provider === PROVIDERS.R2 || provider === "cloudflare_r2") {
          return "Cloudflare R2";
      }
      if (provider === PROVIDERS.S3) {
          return "Amazon S3";
      }
      if (provider === PROVIDERS.B2) {
          return "Backblaze B2";
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
      if (provider === PROVIDERS.B2) {
          return "Uploads will target your Backblaze B2 bucket.";
      }
      return "Uploads will target your S3-compatible bucket.";
  }


  // --- Submission ---

  async handleSubmit() {
      // Check upload state
      if (this.activeSource === "upload") {
          if (this.videoUploadState.status === 'uploading' || this.thumbnailUploadState.status === 'uploading') {
              this.showError("Please wait for uploads to complete.");
              return;
          }
          if (this.videoUploadState.status === 'error') {
              this.showError("Video upload failed. Please try again.");
              return;
          }
          if (this.videoUploadState.status !== 'complete') {
               // Fallback: If no file selected, maybe they want to submit without a new file?
               // (Not supported in this simplified modal, assume file required)
               this.showError("Please select a video file and wait for it to upload.");
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
          // Prefer an uploaded thumbnail's URL: selecting a thumbnail file
          // clears+disables the text input (see the file-picker handler), so
          // inputs.thumbnail.value is empty for file uploads. Fall back to a
          // pasted URL when no file was uploaded.
          thumbnail:
            this.thumbnailUploadState?.url ||
            this.inputs.thumbnail?.value?.trim() ||
            "",
          enableComments: this.toggles.comments?.checked || true,
          ...audienceFlags,

          // Auto-captured at file-select (best-effort; absent ⇒ omitted). Drives
          // 34236 short selection + a future "shorts" feed (height > width).
          width: this.capturedMetadata?.width || 0,
          height: this.capturedMetadata?.height || 0,
          duration: this.capturedMetadata?.duration || 0,

          // These might be empty depending on mode, filled below
          url: "",
          magnet: "",
          storagePointer: "",
          ws: this.inputs.ws?.value?.trim() || "",
          xs: this.inputs.xs?.value?.trim() || "",
          infoHash: this.torrentState.infoHash || "",
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
             const providerLabel =
                 this.activeProvider === PROVIDERS.R2 || this.activeProvider === "cloudflare_r2"
                   ? "r2"
                   : "s3";
             metadata.storagePointer =
                 this.videoUploadState.storagePointer ||
                 deriveStoragePointerFromUrl(metadata.url, providerLabel);
             // The R2/CDN url is the primary webseed; any additional backup
             // webseeds the uploader entered (one per line) follow it.
             // normalizeVideoNotePayload splits + dedupes this list.
             metadata.ws = [
               this.videoUploadState.url,
               this.inputs.ws?.value || "",
             ];
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

  async resolveUploadIdentifier(file) {
      try {
          const infoHash = await calculateTorrentInfoHash(file);
          const normalized = normalizeInfoHash(infoHash);
          if (isValidInfoHash(normalized)) {
              return normalized;
          }
      } catch (hashErr) {
          userLogger.warn("Failed to precompute info hash for storage key:", hashErr);
      }
      return "";
  }

  async handleExternalFlow(metadata) {
      metadata.url = this.inputs.url?.value?.trim() || "";
      metadata.magnet = this.inputs.magnet?.value?.trim() || "";
      metadata.storagePointer =
          metadata.storagePointer || deriveStoragePointerFromUrl(metadata.url, "url");

      const hasUrl = metadata.url.length > 0;
      const hasMagnet = metadata.magnet.length > 0;
      const hasImeta = metadata.nip71?.imeta?.some(v => v.url);

      if (!hasUrl && !hasMagnet && !hasImeta) {
          throw new Error("Please provide at least a Video URL or Magnet Link.");
      }

      // Auto-derive a webseed torrent from the external URL so the link keeps the
      // P2P benefit (fetch + hash the remote file → magnet with ws=url). Best-effort
      // and size-capped: on CORS / too-large / any error it silently degrades to
      // URL-only. Only runs when the user didn't already paste their own magnet.
      if (hasUrl && !hasMagnet) {
          const derived = await this.deriveExternalWebseed(metadata.url);
          if (derived?.magnet) {
              metadata.magnet = derived.magnet;
              metadata.infoHash = derived.infoHash || metadata.infoHash || "";
              metadata.ws = [metadata.url, this.inputs.ws?.value || ""];
              if (derived.torrentUrl) metadata.xs = derived.torrentUrl;
          }
      }

      if (!hasUrl && !hasImeta && metadata.magnet.length > 0) {
         if (!(await showConfirm("Magnet-only uploads require active seeding. Proceed?"))) return;
      }

      await this.publish(metadata);
  }

  // Best-effort webseed derivation for an external URL (TODO: external-URL P2P).
  // Hosts the tiny .torrent (xs=) only when storage is actually unlocked; otherwise
  // returns a ws=-only magnet. Never throws — returns null so the caller publishes
  // URL-only.
  async deriveExternalWebseed(url) {
      if (typeof this.mediaUploader?.deriveTorrentForExternalUrl !== "function") {
          return null;
      }
      const pubkey = this.getCurrentPubkey ? this.getCurrentPubkey() : null;
      const canHostTorrent = Boolean(
          this.activeProvider &&
          this.activeCredentials &&
          pubkey &&
          this.storageService?.isUnlocked?.(pubkey),
      );
      const previousLabel = this.submitButton?.textContent;
      if (this.submitButton) {
          this.submitButton.disabled = true;
          this.submitButton.textContent = "Computing torrent hash…";
      }
      try {
          return await this.mediaUploader.deriveTorrentForExternalUrl(url, {
              provider: canHostTorrent ? this.activeProvider : undefined,
              credentials: canHostTorrent ? this.activeCredentials : undefined,
              onProgress: ({ label }) => {
                  if (this.submitStatus && label) this.submitStatus.textContent = label;
              },
          });
      } catch (error) {
          userLogger.warn(
              "[UploadModal] External URL webseed derivation skipped:",
              error?.message || error,
          );
          return null;
      } finally {
          if (this.submitButton) {
              this.submitButton.disabled = false;
              if (previousLabel) this.submitButton.textContent = previousLabel;
          }
          if (this.submitStatus) this.submitStatus.textContent = "";
      }
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

  resetUploads() {
    // Invalidate active uploads
    this.videoUploadId++;
    this.thumbnailUploadId++;

    // Reset State
    this.videoUploadState = {
      status: 'idle',
      progress: 0,
      url: '',
      key: '',
      storagePointer: '',
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

    // Reset UI
    if (this.sourceSections.progress) {
        this.sourceSections.progress.classList.add("hidden");
    }
    if (this.sourceSections.thumbnailProgress) {
        this.sourceSections.thumbnailProgress.classList.add("hidden");
    }
    if (this.sourceSections.results) {
        this.sourceSections.results.classList.add("hidden");
    }

    // Clear Result Inputs
    if (this.results?.videoUrl) this.results.videoUrl.value = "";
    if (this.results?.magnet) this.results.magnet.value = "";
    if (this.results?.torrentUrl) this.results.torrentUrl.value = "";

    // Reset Inputs
    if (this.inputs?.file) {
        this.inputs.file.value = "";
    }
    if (this.inputs?.thumbnailFile) {
        this.inputs.thumbnailFile.value = "";
    }
    // Re-enable thumbnail input if it was disabled by an upload
    if (this.inputs?.thumbnail) {
        this.inputs.thumbnail.disabled = false;
        if (this.inputs.thumbnail.placeholder && this.inputs.thumbnail.placeholder.startsWith("Selected:")) {
             this.inputs.thumbnail.placeholder = "https://example.com/thumbnail.jpg";
        }
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

      this.resetUploads();
  }

  // --- Modal Control ---

  async open({ triggerElement } = {}) {
    try {
      await this.load();
    } catch (error) {
      devLogger.error("[UploadModal] Failed to load modal template:", error);
    }

    if (!this.root) return;

    this.root.classList.remove("hidden");
    this.setGlobalModalState("upload", true);
    this.isVisible = true;

    // Refresh lock state on open. Auto-unlock first so a kept-unlocked nsec
    // (restored on refresh) opens Unlocked instead of Locked (TODO #51).
    if (this.storageService) {
        const pubkey = this.getCurrentPubkey ? this.getCurrentPubkey() : null;
        await this.maybeAutoUnlockStorage(pubkey);
        this.isStorageUnlocked = pubkey ? this.storageService.isUnlocked(pubkey) : false;
        this.updateLockUi();
        // Always attempt load to refresh configuration status (even if locked)
        this.loadFromStorage().catch(err => {
            userLogger.warn("Failed to refresh storage state on open:", err);
        });
    }

    this.renderHashtagSuggestions();

    this.modalAccessibility?.activate({ triggerElement });
  }

  close() {
    if (!this.root) return;
    this.resetUploads();
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
