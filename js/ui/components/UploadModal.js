<<<<<<< HEAD
// components/UploadModal.js
import { createModalAccessibility } from "./modalAccessibility.js";
import { Nip71FormManager } from "./nip71FormManager.js";
import logger, { userLogger } from "../../utils/logger.js";
=======
// NOTE: Keep the Upload, Edit, and Revert modals in lockstep when updating NIP-71 form features.

import { createModalAccessibility } from "./modalAccessibility.js";
import { Nip71FormManager } from "./nip71FormManager.js";
import { userLogger } from "../../utils/logger.js";
>>>>>>> origin/main
import {
  getVideoNoteErrorMessage,
  normalizeVideoNotePayload,
  VIDEO_NOTE_ERROR_CODES,
} from "../../services/videoNotePayload.js";
<<<<<<< HEAD
import { createTorrentMetadata } from "../../utils/torrentHash.js";
import { sanitizeBucketName } from "../../storage/r2-mgmt.js";
import { buildR2Key, buildPublicUrl } from "../../r2.js";
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
=======
>>>>>>> origin/main

export class UploadModal {
  constructor({
    authService,
    r2Service,
<<<<<<< HEAD
    storageService,
=======
>>>>>>> origin/main
    publishVideoNote,
    removeTrackingScripts,
    setGlobalModalState,
    showError,
    showSuccess,
    getCurrentPubkey,
    safeEncodeNpub,
    eventTarget,
<<<<<<< HEAD
    container,
    onRequestStorageSettings,
  } = {}) {
    this.authService = authService || null;
    this.r2Service = r2Service || null;
    this.storageService = storageService || null;
=======
    container
  } = {}) {
    this.authService = authService || null;
    this.r2Service = r2Service || null;
>>>>>>> origin/main
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
<<<<<<< HEAD
    this.onRequestStorageSettings = typeof onRequestStorageSettings === "function" ? onRequestStorageSettings : null;

    this.root = null;
    this.isVisible = false;
    this.activeSource = "upload"; // 'upload' | 'external'
    this.cloudflareSettings = this.r2Service?.getSettings?.() || null;
    this.isStorageUnlocked = false;
    this.activeConnectionId = null;
    this.storageConfigured = false;

    // UI References
    this.form = null;
    this.modeButtons = {};
    this.sourceSections = {};
    this.inputs = {};
    this.toggles = {};
    this.submitButton = null;
    this.submitStatus = null;
    this.summaryView = {};

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
=======

    this.root = null;
    this.activeMode = "custom";
    this.isVisible = false;
    this.cloudflareSettings = this.r2Service?.getSettings?.() || null;
    this.cloudflareAdvancedVisible =
      this.r2Service?.getCloudflareAdvancedVisibility?.() || false;
    this.r2Unsubscribes = [];

    this.uploadModeButtons = [];
    this.customSection = null;
    this.cloudflareSection = null;

    this.customForm = null;
    this.customFormInputs = {};
    this.customSubmitButton = null;
    this.customSubmitButtonDefaultLabel = "";
    this.customSubmitBlockedUntil = 0;
    this.customSubmitCooldownTimer = null;
    this.customSubmitCooldownMs = 60000;

    this.cloudflareSettingsForm = null;
    this.cloudflareClearSettingsButton = null;
    this.cloudflareSettingsStatus = null;
    this.cloudflareBucketPreview = null;
    this.cloudflareUploadForm = null;
    this.cloudflareFileInput = null;
    this.cloudflareUploadButton = null;
    this.cloudflareUploadStatus = null;
    this.cloudflareProgress = null;
    this.cloudflareProgressStatus = null;
    this.cloudflareTitleInput = null;
    this.cloudflareDescriptionInput = null;
    this.cloudflareThumbnailInput = null;
    this.cloudflareMagnetInput = null;
    this.cloudflareWsInput = null;
    this.cloudflareXsInput = null;
    this.cloudflareEnableCommentsInput = null;
    this.cloudflareIsNsfwInput = null;
    this.cloudflareIsForKidsInput = null;
    this.cloudflareAdvancedToggle = null;
    this.cloudflareAdvancedToggleLabel = null;
    this.cloudflareAdvancedToggleIcon = null;
    this.cloudflareAdvancedFields = null;
    this.r2AccountIdInput = null;
    this.r2AccessKeyIdInput = null;
    this.r2SecretAccessKeyInput = null;
    this.r2ApiTokenInput = null;
    this.r2ZoneIdInput = null;
    this.r2BaseDomainInput = null;

    this.nip71FormManager = new Nip71FormManager();
    this.cleanupHandlers = [];
    this.modalAccessibility = null;
    this.modalBackdrop = null;
    this.modalPanel = null;
    this.loadPromise = null;
    this.eventsBound = false;
  }

  addEventListener(type, listener, options) {
    if (!this.eventTarget) {
      return;
    }
    this.eventTarget.addEventListener(type, listener, options);
  }

  removeEventListener(type, listener, options) {
    if (!this.eventTarget) {
      return;
    }
    this.eventTarget.removeEventListener(type, listener, options);
  }

  emit(type, detail) {
    if (!this.eventTarget) {
      return;
    }
    this.eventTarget.dispatchEvent(new CustomEvent(type, { detail }));
  }

  getRoot() {
    return this.root;
  }

  async load({ container } = {}) {
    if (this.root) {
      return this.root;
    }

    if (this.loadPromise) {
      return this.loadPromise;
    }
>>>>>>> origin/main

    this.loadPromise = (async () => {
      const targetContainer =
        container || this.container || document.getElementById("modalContainer");
<<<<<<< HEAD
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
      this.registerR2Subscriptions();

      // Initial State
      if (this.storageService) {
        const pubkey = this.getCurrentPubkey ? this.getCurrentPubkey() : null;
        this.isStorageUnlocked = pubkey ? this.storageService.isUnlocked(pubkey) : false;
        // Even if locked, we want to know if there's *potentially* a connection saved to show correct UI state (locked vs empty)
        await this.loadFromStorage();
      } else {
        await this.loadR2Settings();
      }
      this.updateLockUi();
      this.setSourceMode("upload");
=======
      if (!targetContainer) {
        throw new Error("Modal container element not found!");
      }

      const existingModals = targetContainer.querySelectorAll("#uploadModal");
      let modal = existingModals[0] || null;
      if (existingModals.length > 1) {
        existingModals.forEach((node, index) => {
          if (index > 0) {
            node.remove();
          }
        });
      }

      if (!modal) {
        const response = await fetch("components/upload-modal.html");
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const html = await response.text();

        const doc = targetContainer.ownerDocument || document;
        const wrapper = doc.createElement("div");
        wrapper.innerHTML = html;
        this.removeTrackingScripts(wrapper);

        const fragment = doc.createDocumentFragment();
        while (wrapper.firstChild) {
          fragment.appendChild(wrapper.firstChild);
        }
        targetContainer.appendChild(fragment);

        modal = targetContainer.querySelector("#uploadModal");
      }

      if (!modal) {
        throw new Error("Upload modal markup missing after load.");
      }

      this.container = targetContainer;
      this.root = modal;

      this.cacheElements(modal);
      this.setupModalAccessibility();
      if (!this.eventsBound) {
        this.bindEvents();
        this.eventsBound = true;
      }
      this.registerR2Subscriptions();

      this.renderCloudflareAdvancedVisibility(
        this.r2Service?.getCloudflareAdvancedVisibility?.()
      );

      try {
        await this.loadR2Settings();
      } catch (error) {
        // Errors already surfaced via the service listeners.
      }

      await this.refreshCloudflareBucketPreview();
      this.setMode(this.activeMode);
      this.updateCloudflareProgress(Number.NaN);
>>>>>>> origin/main

      return this.root;
    })();

    try {
      return await this.loadPromise;
    } finally {
      this.loadPromise = null;
    }
  }

<<<<<<< HEAD
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
        form: $("#storage-form-view"),
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

        // Settings
        r2BucketName: $("#input-r2-bucket-name"),
        r2Account: $("#input-r2-account"),
        r2Key: $("#input-r2-key"),
        r2Secret: $("#input-r2-secret"),
        r2Domain: $("#input-r2-domain"), // Public URL

        // Advanced (Manual or NIP71 managed)
        ws: $("#input-ws"),
        xs: $("#input-xs"),
        summary: $("#input-summary"),
        contentWarning: $("#input-content-warning"),
        duration: $("#input-duration"),

        // Progress
        progress: $("#input-progress"),
    };

    // Wizard Containers
    this.wizard = {
        step1: $("#step-credentials"),
        step2: $("#step-verification"),
        nextBtn: $("#btn-next-step"),
        backBtn: $("#btn-back-step"),
        errorContainer: $("#container-verification-error"),
        errorText: $("#text-verification-error"),
        guideLink: $("#link-cloudflare-guide"),
    };

    // Toggles/Buttons
    this.toggles = {
        nsfw: $("#check-nsfw"),
        kids: $("#check-kids"),
        comments: $("#check-comments"),
        summaryUnlock: $("#check-summary-unlock"),

        advanced: $("#btn-advanced-toggle"),
        storageSettings: $("#btn-storage-settings"),
        saveSettings: $("#btn-save-settings"), // Verify & Save
        browseThumbnail: $("#btn-thumbnail-file"),
        r2HelpLink: $("#link-r2-help"),
        copyBucket: $("#btn-copy-bucket"),
        storageUnlock: $("#btn-storage-unlock"),
        manageStorage: $("#btn-manage-storage"),
    };

    // Status text
    this.statusText = {
        storage: $("#storage-status"),
        storageLock: $("#storage-lock-status"),
        uploadMain: $("#upload-status-text"),
        uploadPercent: $("#upload-percent-text"),
        summaryProvider: $("#summary-provider"),
        summaryBucket: $("#summary-bucket"),
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

    // Wizard: Step 1 Next
    if (this.wizard.nextBtn) {
        this.wizard.nextBtn.addEventListener("click", () => this.goToVerificationStep());
    }

    // Wizard: Step 2 Back
    if (this.wizard.backBtn) {
        this.wizard.backBtn.addEventListener("click", () => this.goToCredentialsStep());
    }

    // Settings Save (Verify & Save)
    this.toggles.saveSettings.addEventListener("click", async () => {
        await this.handleVerifyAndSave();
    });

    // Help Link
    if (this.toggles.r2HelpLink) {
        this.toggles.r2HelpLink.addEventListener("click", () => {
            this.close();
        });
    }

    // Copy Bucket Name
    if (this.toggles.copyBucket && this.inputs.r2BucketName) {
        this.toggles.copyBucket.addEventListener("click", () => {
            const val = this.inputs.r2BucketName.value;
            if (val) {
                navigator.clipboard.writeText(val).then(() => {
                    const original = this.toggles.copyBucket.textContent;
                    this.toggles.copyBucket.textContent = "Copied!";
                    setTimeout(() => this.toggles.copyBucket.textContent = original, 1500);
                });
            }
        });
    }

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

        // Auto-show settings if missing or not configured
        if (!this.storageConfigured && !this.hasValidR2Settings() && this.sourceSections.settings.classList.contains("hidden")) {
            this.toggles.storageSettings.click(); // Expand
        } else if (this.storageConfigured) {
            // Keep collapsed if configured, per requirements
        }

        if (this.toggles.browseThumbnail) {
            this.toggles.browseThumbnail.classList.remove("hidden");
        }

        // Populate derived bucket name
        this.populateBucketName();

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

  populateBucketName() {
      const pubkey = this.getCurrentPubkey ? this.getCurrentPubkey() : null;
      if (pubkey && this.safeEncodeNpub && this.inputs.r2BucketName) {
          const npub = this.safeEncodeNpub(pubkey);
          const bucketName = sanitizeBucketName(npub);
          this.inputs.r2BucketName.value = bucketName;
      }
  }

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

  // --- R2 Integration ---

  async refreshState() {
    if (this.storageService) {
      const pubkey = this.getCurrentPubkey ? this.getCurrentPubkey() : null;
      this.isStorageUnlocked = pubkey ? this.storageService.isUnlocked(pubkey) : false;
      this.updateLockUi();

      await this.loadFromStorage();
    } else if (this.r2Service && typeof this.r2Service.loadSettings === "function") {
      await this.loadR2Settings();
    }
  }

  // Legacy fallback loader (renamed for clarity if desired, but keeping signature safe)
  async loadR2Settings() {
      // Fallback legacy load if storage service not used/available
      if (!this.r2Service?.loadSettings) return;
      const settings = await this.r2Service.loadSettings();
      this.cloudflareSettings = settings || {};
      this.fillSettingsForm(this.cloudflareSettings);
      this.updateStorageStatus(this.hasValidR2Settings());

      // Legacy mode implies no storage service or not used
      this.toggleStorageView("form");
      return settings;
  }

  async loadFromStorage() {
      if (!this.storageService) return;
      const pubkey = this.getCurrentPubkey ? this.getCurrentPubkey() : null;

      this.cloudflareSettings = null;
      this.activeConnectionId = null;
      this.storageConfigured = false;

      if (!pubkey) {
          this.toggleStorageView("form");
          return;
      }

      try {
        const connections = await this.storageService.listConnections(pubkey);
        // Prefer default connection, fallback to R2
        const defaultConn = connections.find(c => c.meta?.defaultForUploads);
        const targetConn = defaultConn || connections.find(c => c.provider === PROVIDERS.R2 || c.provider === "cloudflare_r2");

        if (targetConn) {
            this.storageConfigured = true;
            this.toggleStorageView("summary");

            // Populate Summary
            const providerName = targetConn.meta?.provider === "cloudflare_r2" ? "Cloudflare R2" : (targetConn.meta?.label || "S3 Storage");
            const bucketName = targetConn.meta?.bucket || "Unknown Bucket";

            if (this.statusText.summaryProvider) this.statusText.summaryProvider.textContent = providerName;
            if (this.statusText.summaryBucket) this.statusText.summaryBucket.textContent = bucketName;

            if (this.isStorageUnlocked) {
                const details = await this.storageService.getConnection(pubkey, targetConn.id);
                if (details) {
                    // Map generic S3 or R2 details to settings
                    // R2 settings struct: accountId, accessKeyId, secretAccessKey, baseDomain
                    this.cloudflareSettings = {
                        accountId: details.accountId, // Might be undefined for generic S3
                        accessKeyId: details.accessKeyId,
                        secretAccessKey: details.secretAccessKey,
                        baseDomain: details.meta?.baseDomain || "",
                        // Add generic endpoint for internal use if needed
                        endpoint: details.endpoint,
                        region: details.region,
                        bucket: details.bucket
                    };
                    this.fillSettingsForm(this.cloudflareSettings);
                    this.updateStorageStatus(true, providerName);
                    this.activeConnectionId = targetConn.id;
                }
            } else {
                // Locked state, can't get details yet
                this.updateStorageStatus(false);
            }
        } else {
            // No connections configured
            this.toggleStorageView("form");
        }
      } catch (err) {
          userLogger.error("Failed to load connection", err);
          this.toggleStorageView("form");
      }
  }

  toggleStorageView(viewName) {
      if (viewName === "summary") {
          this.storageViews.summary.classList.remove("hidden");
          this.storageViews.form.classList.add("hidden");
      } else {
          this.storageViews.summary.classList.add("hidden");
          this.storageViews.form.classList.remove("hidden");
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
      if (this.statusText.storage) {
          if (locked && this.storageConfigured) {
              this.statusText.storage.classList.add("hidden"); // Summary view has its own status area
          } else if (locked) {
              this.statusText.storage.classList.add("hidden");
              this.statusText.storage.textContent = "";
          } else {
              this.statusText.storage.classList.remove("hidden");
          }
      }
  }

  hasValidR2Settings() {
      const s = this.cloudflareSettings;
      return Boolean(s?.accountId && s?.accessKeyId && s?.secretAccessKey && s?.baseDomain);
  }

  fillSettingsForm(s) {
      if (this.inputs.r2Account) this.inputs.r2Account.value = s.accountId || "";
      if (this.inputs.r2Key) this.inputs.r2Key.value = s.accessKeyId || "";
      if (this.inputs.r2Secret) this.inputs.r2Secret.value = s.secretAccessKey || "";
      if (this.inputs.r2Domain) this.inputs.r2Domain.value = s.baseDomain || "";
  }

  collectSettingsForm() {
      return {
          accountId: this.inputs.r2Account?.value?.trim() || "",
          accessKeyId: this.inputs.r2Key?.value?.trim() || "",
          secretAccessKey: this.inputs.r2Secret?.value?.trim() || "",
          baseDomain: this.inputs.r2Domain?.value?.trim() || "", // Public URL
      };
  }

  goToVerificationStep() {
      // Validate Step 1
      const accountId = this.inputs.r2Account?.value?.trim();
      const keyId = this.inputs.r2Key?.value?.trim();
      const secret = this.inputs.r2Secret?.value?.trim();

      if (!accountId || !keyId || !secret) {
          alert("Please fill in Account ID/Endpoint, Access Key ID, and Secret Access Key.");
          return;
      }

      // Transition
      this.wizard.step1.classList.add("hidden");
      this.wizard.step2.classList.remove("hidden");

      // Auto-focus URL if empty
      if (!this.inputs.r2Domain.value) {
          this.inputs.r2Domain.focus();
      }
  }

  goToCredentialsStep() {
      this.wizard.step2.classList.add("hidden");
      this.wizard.step1.classList.remove("hidden");
      this.wizard.errorContainer.classList.add("hidden");
  }

  async handleVerifyAndSave() {
      const btn = this.toggles.saveSettings;
      const originalText = btn.textContent;

      // Clear previous error
      this.wizard.errorContainer.classList.add("hidden");

      const settings = this.collectSettingsForm();
      const pubkey = this.getCurrentPubkey ? this.getCurrentPubkey() : null;
      const npub = pubkey ? this.safeEncodeNpub(pubkey) : null;

      if (!settings.baseDomain) {
           this.wizard.errorText.textContent = "Public URL is required.";
           this.wizard.errorContainer.classList.remove("hidden");
           return;
      }

      // 1. Verify
      btn.disabled = true;
      btn.textContent = "Verifying...";

      try {
          const verification = await this.r2Service.verifyPublicAccess({ settings, npub });

          if (!verification.success) {
              btn.disabled = false;
              btn.textContent = originalText;

              this.wizard.errorText.textContent = verification.error || "Verification failed.";
              this.wizard.errorContainer.classList.remove("hidden");

              // Dynamic Cloudflare Link
              // https://dash.cloudflare.com/?to=/:account/r2/default/buckets/:bucket/settings
              if (settings.accountId && npub && !settings.accountId.includes("://")) {
                  const bucketName = this.inputs.r2BucketName?.value || "";
                  const cfLink = `https://dash.cloudflare.com/?to=/${settings.accountId}/r2/default/buckets/${bucketName}/settings`;
                  this.wizard.guideLink.href = cfLink;
              } else {
                  this.wizard.guideLink.href = "https://dash.cloudflare.com";
              }
              return;
          }

          // 2. Save on Success
          btn.textContent = "Saving...";

          if (this.storageService && this.isStorageUnlocked) {
              const pubkey = this.getCurrentPubkey ? this.getCurrentPubkey() : null;
              if (pubkey) {
                  // Save to secure storage
                  const connectionId = this.activeConnectionId || `r2-${Date.now()}`;

                  // Heuristic for provider type
                  let provider = PROVIDERS.GENERIC;
                  let payload = {
                      accessKeyId: settings.accessKeyId,
                      secretAccessKey: settings.secretAccessKey,
                  };

                  // If account ID doesn't look like a URL, assume R2/S3-account-based
                  if (settings.accountId && !settings.accountId.includes("://")) {
                      provider = PROVIDERS.R2;
                      payload.accountId = settings.accountId;
                  } else {
                      payload.endpoint = settings.accountId;
                  }

                  await this.storageService.saveConnection(pubkey, connectionId, {
                      provider,
                      ...payload,
                  }, {
                      provider,
                      label: provider === PROVIDERS.R2 ? "Default R2" : "Default S3",
                      baseDomain: settings.baseDomain,
                      defaultForUploads: true,
                      bucket: this.inputs.r2BucketName?.value || sanitizeBucketName(npub)
                  });
                  this.activeConnectionId = connectionId;
              }
          } else {
              // Legacy fallback
              await this.r2Service.saveSettings(settings);
          }

          this.cloudflareSettings = settings;
          this.updateStorageStatus(true);

          btn.disabled = false;
          btn.textContent = "Saved & Ready!";

          setTimeout(() => {
              btn.textContent = originalText;
              // Collapse
              this.sourceSections.settings.classList.add("hidden");
              this.toggles.storageSettings.setAttribute("aria-expanded", "false");
              // Reset wizard to start for next edit
              this.goToCredentialsStep();
              // Reload state to potentially switch to summary view
              this.loadFromStorage();
          }, 1500);
      } catch (err) {
          userLogger.error("Verification crashed:", err);
          btn.disabled = false;
          btn.textContent = originalText;
          this.wizard.errorText.textContent = "Unexpected error during verification.";
          this.wizard.errorContainer.classList.remove("hidden");
      }
  }

  updateStorageStatus(isValid, providerLabel) {
      if (this.statusText.storage) {
          const baseText = isValid ? "Ready" : "Missing Credentials";
          const label = providerLabel ? ` (${providerLabel})` : "";
          this.statusText.storage.textContent = baseText + label;
          this.statusText.storage.className = isValid ? "text-xs text-accent" : "text-xs text-critical";
      }
  }

  registerR2Subscriptions() {
      if (!this.r2Service?.on) return;

      // Clear old
      this.r2Unsubscribes.forEach(u => u && u());
      this.r2Unsubscribes = [];

      const sub = (evt, fn) => {
          const unsub = this.r2Service.on(evt, fn);
          if (unsub) this.r2Unsubscribes.push(unsub);
      };

      sub("uploadProgress", ({ fraction }) => this.updateProgress(fraction));
      sub("uploadStatus", ({ message, variant }) => this.updateUploadStatus(message, variant));
      sub("uploadStateChange", ({ isUploading }) => {
          this.isUploading = isUploading;
          this.submitButton.disabled = isUploading;
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
          // Could style based on variant (error/success)
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

      const thumbnailFile = this.inputs.thumbnailFile?.files?.[0];

      if (!this.hasValidR2Settings()) throw new Error("Please configure R2 storage credentials.");

      const pubkey = this.getCurrentPubkey ? this.getCurrentPubkey() : null;
      if (!pubkey) throw new Error("Please login to publish.");

      const npub = this.safeEncodeNpub(pubkey);

      // Pre-calculate Keys & URLs to support WebSeeding
      // We need the Public URL *before* we generate the torrent so we can embed it.
      let videoKey = "";
      let videoPublicUrl = "";
      let torrentKey = "";
      let torrentPublicUrl = "";

      try {
          // Temporarily grab current bucket settings to calculate URL
          const bucketName = this.inputs.r2BucketName?.value || sanitizeBucketName(npub);
          // Note: The actual upload might re-verify this, but we need a best-guess for the torrent.
          // We rely on r2Service using the *same* logic or accepting our forced keys.
          // Since we can't easily get the 'final' bucket config here without doing the 'ensureBucket' dance first,
          // we'll do a lightweight check of the settings form.
          const currentSettings = this.collectSettingsForm();
          if (!currentSettings.baseDomain) {
              throw new Error("Missing Public URL (Base Domain) in settings.");
          }

          videoKey = buildR2Key(npub, file);
          // 'buildPublicUrl' logic: ${baseDomain}/${key}
          videoPublicUrl = buildPublicUrl(currentSettings.baseDomain, videoKey);

          // For the torrent file, we swap extension
          const baseKey = videoKey.replace(/\.[^/.]+$/, "");
          torrentKey = (baseKey && baseKey !== videoKey) ? `${baseKey}.torrent` : `${videoKey}.torrent`;
          torrentPublicUrl = buildPublicUrl(currentSettings.baseDomain, torrentKey);

      } catch (prepErr) {
          userLogger.warn("Failed to pre-calculate R2 keys:", prepErr);
          // We continue, but WebSeed generation will fail or be skipped.
      }

      // 1. Calculate Torrent Info Hash (Client-side)
      this.isUploading = true;
      this.submitButton.disabled = true;
      this.updateUploadStatus("Calculating Info Hash...", "info");
      this.updateProgress(0); // Show bar at 0

      let infoHash = "";
      let torrentFile = null;
      try {
          // Pass the pre-calculated video URL as a WebSeed
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

      // 2. Upload
      let explicitCredentials = null;
      if (this.storageService && this.isStorageUnlocked && this.hasValidR2Settings()) {
          // If using secure storage, we pass the credentials explicitly so they aren't saved to legacy DB
          explicitCredentials = this.collectSettingsForm();
      }

      await this.r2Service.uploadVideo({
          npub,
          file,
          thumbnailFile,
          torrentFile,
          metadata,
          infoHash: hasValidInfoHash ? normalizedInfoHash : "",
          settingsInput: explicitCredentials ? null : this.collectSettingsForm(),
          explicitCredentials,
          publishVideoNote: this.publishVideoNote,
          onReset: () => this.resetForm(),
          // Pass forced keys/URLs to ensure what's in the torrent matches where we upload
          forcedVideoKey: videoKey,
          forcedVideoUrl: videoPublicUrl,
          forcedTorrentKey: torrentKey,
          forcedTorrentUrl: torrentPublicUrl,
      });
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
      this.populateBucketName(); // Re-populate if user logged in

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
    this.populateBucketName(); // Ensure bucket name is fresh on open

    // Refresh lock state on open
    if (this.storageService) {
        const pubkey = this.getCurrentPubkey ? this.getCurrentPubkey() : null;
        this.isStorageUnlocked = pubkey ? this.storageService.isUnlocked(pubkey) : false;
        this.updateLockUi();
        if (this.isStorageUnlocked) {
            this.loadFromStorage();
        }
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
=======
  cacheElements(context) {
    const scope = this.root || context;
    this.modalBackdrop = scope?.querySelector?.(".bv-modal-backdrop") || null;
    this.modalPanel =
      scope?.querySelector?.(".bv-modal__panel") || scope || null;

    this.uploadModeButtons = Array.from(
      context.querySelectorAll(".upload-mode-toggle[data-upload-mode]")
    );
    this.customSection = context.querySelector("#customUploadSection") || null;
    this.cloudflareSection =
      context.querySelector("#cloudflareUploadSection") || null;

    this.customForm = context.querySelector("#uploadForm") || null;
    this.customFormInputs = {
      title: context.querySelector("#uploadTitle") || null,
      url: context.querySelector("#uploadUrl") || null,
      magnet: context.querySelector("#uploadMagnet") || null,
      ws: context.querySelector("#uploadWs") || null,
      xs: context.querySelector("#uploadXs") || null,
      thumbnail: context.querySelector("#uploadThumbnail") || null,
      description: context.querySelector("#uploadDescription") || null,
      enableComments: context.querySelector("#uploadEnableComments") || null,
      isNsfw: context.querySelector("#uploadIsNsfw") || null,
      isForKids: context.querySelector("#uploadIsForKids") || null,
      isPrivate: context.querySelector("#uploadIsPrivate") || null
    };

    this.customSubmitButton =
      this.customForm?.querySelector?.('button[type="submit"]') || null;
    if (this.customSubmitButton && !this.customSubmitButtonDefaultLabel) {
      const defaultLabel = this.customSubmitButton.textContent || "";
      this.customSubmitButtonDefaultLabel =
        defaultLabel.trim() || defaultLabel || "Publish";
    }
    this.updateCustomSubmitButtonState();

    this.closeButton = context.querySelector("#closeUploadModal") || null;

    this.cloudflareSettingsForm =
      context.querySelector("#cloudflareSettingsForm") || null;
    this.cloudflareClearSettingsButton =
      context.querySelector("#cloudflareClearSettings") || null;
    this.cloudflareSettingsStatus =
      context.querySelector("#cloudflareSettingsStatus") || null;
    this.cloudflareBucketPreview =
      context.querySelector("#cloudflareBucketPreview") || null;
    this.cloudflareUploadForm =
      context.querySelector("#cloudflareUploadForm") || null;
    this.cloudflareFileInput = context.querySelector("#cloudflareFile") || null;
    this.cloudflareUploadButton =
      context.querySelector("#cloudflareUploadButton") || null;
    this.cloudflareUploadStatus =
      context.querySelector("#cloudflareUploadStatus") || null;
    this.cloudflareProgress =
      context.querySelector("#cloudflareProgress") || null;
    this.cloudflareProgressStatus =
      context.querySelector("#cloudflareProgressStatus") || null;
    this.cloudflareTitleInput =
      context.querySelector("#cloudflareTitle") || null;
    this.cloudflareDescriptionInput =
      context.querySelector("#cloudflareDescription") || null;
    this.cloudflareThumbnailInput =
      context.querySelector("#cloudflareThumbnail") || null;
    this.cloudflareMagnetInput =
      context.querySelector("#cloudflareMagnet") || null;
    this.cloudflareWsInput = context.querySelector("#cloudflareWs") || null;
    this.cloudflareXsInput = context.querySelector("#cloudflareXs") || null;
    this.cloudflareEnableCommentsInput =
      context.querySelector("#cloudflareEnableComments") || null;
    this.cloudflareIsNsfwInput =
      context.querySelector("#cloudflareIsNsfw") || null;
    this.cloudflareIsForKidsInput =
      context.querySelector("#cloudflareIsForKids") || null;
    this.cloudflareAdvancedToggle =
      context.querySelector("#cloudflareAdvancedToggle") || null;
    this.cloudflareAdvancedToggleLabel =
      context.querySelector("#cloudflareAdvancedToggleLabel") || null;
    this.cloudflareAdvancedToggleIcon =
      context.querySelector("#cloudflareAdvancedToggleIcon") || null;
    this.cloudflareAdvancedFields =
      context.querySelector("#cloudflareAdvancedFields") || null;
    this.r2AccountIdInput = context.querySelector("#r2AccountId") || null;
    this.r2AccessKeyIdInput = context.querySelector("#r2AccessKeyId") || null;
    this.r2SecretAccessKeyInput =
      context.querySelector("#r2SecretAccessKey") || null;
    this.r2ApiTokenInput = context.querySelector("#r2ApiToken") || null;
    this.r2ZoneIdInput = context.querySelector("#r2ZoneId") || null;
    this.r2BaseDomainInput = context.querySelector("#r2BaseDomain") || null;

    this.nip71FormManager.registerSection("custom", this.customSection);
    this.nip71FormManager.registerSection("cloudflare", this.cloudflareSection);
  }

  readCheckboxValue(input, defaultValue = false) {
    if (!input) {
      return Boolean(defaultValue);
    }
    return input.checked === true;
  }

  resetCheckbox(input, defaultValue = false) {
    if (!input) {
      return;
    }
    let fallback = Boolean(defaultValue);
    if (input.dataset && typeof input.dataset.defaultChecked === "string") {
      fallback = input.dataset.defaultChecked === "true";
    } else if (typeof input.defaultChecked === "boolean") {
      fallback = input.defaultChecked;
    }
    input.checked = fallback;
  }

  sanitizeAudienceFlags(flags = {}) {
    const isNsfw = flags?.isNsfw === true;
    const isForKids = flags?.isForKids === true && !isNsfw;
    return { isNsfw, isForKids };
  }

  setupMutuallyExclusiveCheckboxes(firstInput, secondInput) {
    if (!firstInput || !secondInput) {
      return;
    }

    const enforceExclusion = (primary, secondary) => {
      if (primary.checked) {
        secondary.checked = false;
      }
    };

    const handleFirstChange = () => enforceExclusion(firstInput, secondInput);
    const handleSecondChange = () => enforceExclusion(secondInput, firstInput);

    if (firstInput.checked && secondInput.checked) {
      secondInput.checked = false;
    }

    firstInput.addEventListener("change", handleFirstChange);
    secondInput.addEventListener("change", handleSecondChange);

    this.cleanupHandlers.push(() => {
      firstInput.removeEventListener("change", handleFirstChange);
      secondInput.removeEventListener("change", handleSecondChange);
    });
  }

  buildAutoGeneratedImetaVariant(file) {
    if (!file) {
      return null;
    }
    const mimeType = typeof file.type === "string" ? file.type.trim() : "";
    if (!mimeType) {
      return null;
    }
    return {
      m: mimeType,
      dim: "",
      url: "",
      x: "",
      image: [],
      fallback: [],
      service: [],
      autoGenerated: true
    };
  }

  bindEvents() {
    if (this.closeButton) {
      this.closeButton.addEventListener("click", () => {
        this.close();
      });
    }

    if (this.customForm) {
      this.customForm.addEventListener("submit", (event) => {
        event.preventDefault();
        if (this.isCustomSubmitOnCooldown()) {
          this.updateCustomSubmitButtonState();
          return;
        }
        this.handleCustomSubmit();
      });
    }

    if (Array.isArray(this.uploadModeButtons)) {
      this.uploadModeButtons.forEach((button) => {
        if (!button) return;
        button.addEventListener("click", () => {
          const mode = button.dataset.uploadMode || "custom";
          this.setMode(mode);
        });
      });
    }

    if (this.cloudflareSettingsForm) {
      this.cloudflareSettingsForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        await this.handleCloudflareSettingsSubmit();
      });
    }

    if (this.cloudflareClearSettingsButton) {
      this.cloudflareClearSettingsButton.addEventListener("click", async () => {
        await this.handleCloudflareClearSettings();
      });
    }

    if (this.cloudflareUploadForm) {
      this.cloudflareUploadForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        await this.handleCloudflareUploadSubmit();
      });
    }

    if (this.cloudflareAdvancedToggle) {
      this.cloudflareAdvancedToggle.addEventListener("click", () => {
        if (
          this.r2Service?.setCloudflareAdvancedVisibility &&
          this.r2Service?.getCloudflareAdvancedVisibility
        ) {
          const nextState = !this.r2Service.getCloudflareAdvancedVisibility();
          this.r2Service.setCloudflareAdvancedVisibility(nextState);
        } else {
          this.renderCloudflareAdvancedVisibility(
            !this.cloudflareAdvancedVisible
          );
        }
      });
    }

    if (this.customFormInputs?.isNsfw && this.customFormInputs?.isForKids) {
      this.setupMutuallyExclusiveCheckboxes(
        this.customFormInputs.isNsfw,
        this.customFormInputs.isForKids
      );
    }

    if (this.cloudflareIsNsfwInput && this.cloudflareIsForKidsInput) {
      this.setupMutuallyExclusiveCheckboxes(
        this.cloudflareIsNsfwInput,
        this.cloudflareIsForKidsInput
      );
    }

    this.nip71FormManager.bindSection("custom");
    this.nip71FormManager.bindSection("cloudflare");
  }

  clearCustomSubmitCooldownTimer() {
    if (this.customSubmitCooldownTimer) {
      clearInterval(this.customSubmitCooldownTimer);
      this.customSubmitCooldownTimer = null;
    }
  }

  isCustomSubmitOnCooldown() {
    if (!this.customSubmitBlockedUntil) {
      return false;
    }
    return Date.now() < this.customSubmitBlockedUntil;
  }

  updateCustomSubmitButtonState() {
    const button = this.customSubmitButton;
    if (!button) {
      return;
    }

    if (!this.customSubmitButtonDefaultLabel) {
      const label = button.textContent || "";
      this.customSubmitButtonDefaultLabel = label.trim() || label || "Publish";
    }

    if (this.isCustomSubmitOnCooldown()) {
      const remainingMs = Math.max(
        0,
        this.customSubmitBlockedUntil - Date.now()
      );
      const seconds = Math.max(1, Math.ceil(remainingMs / 1000));
      button.disabled = true;
      button.setAttribute("aria-disabled", "true");
      button.dataset.cooldown = "true";
      button.textContent = `${this.customSubmitButtonDefaultLabel} (${seconds})`;
      button.title = `Please wait ${seconds} seconds before sharing another video.`;
      return;
    }

    button.disabled = false;
    button.removeAttribute("aria-disabled");
    delete button.dataset.cooldown;
    button.textContent =
      this.customSubmitButtonDefaultLabel || button.textContent || "Publish";
    button.removeAttribute("title");
  }

  startCustomSubmitCooldown() {
    if (!this.customSubmitButton) {
      return;
    }
    const now = Date.now();
    this.customSubmitBlockedUntil = now + this.customSubmitCooldownMs;
    this.updateCustomSubmitButtonState();
    this.clearCustomSubmitCooldownTimer();
    this.customSubmitCooldownTimer = setInterval(() => {
      if (!this.isCustomSubmitOnCooldown()) {
        this.clearCustomSubmitCooldown();
        return;
      }
      this.updateCustomSubmitButtonState();
    }, 1000);
  }

  clearCustomSubmitCooldown() {
    this.clearCustomSubmitCooldownTimer();
    this.customSubmitBlockedUntil = 0;
    this.updateCustomSubmitButtonState();
  }

  cancelCustomSubmitCooldown() {
    this.clearCustomSubmitCooldown();
  }

  setupModalAccessibility() {
    if (!this.root) {
      return;
    }

    if (this.modalAccessibility?.destroy) {
      this.modalAccessibility.destroy();
    }

    this.modalAccessibility = createModalAccessibility({
      root: this.root,
      backdrop: this.modalBackdrop || this.root,
      panel: this.modalPanel || this.root,
      onRequestClose: () => this.close()
    });

    this.cleanupHandlers.push(() => {
      if (this.modalAccessibility?.destroy) {
        this.modalAccessibility.destroy();
      }
      this.modalAccessibility = null;
    });
  }

  registerR2Subscriptions() {
    if (!this.r2Service?.on) {
      return;
    }

    if (Array.isArray(this.r2Unsubscribes)) {
      this.r2Unsubscribes.forEach((unsubscribe) => {
        try {
          if (typeof unsubscribe === "function") {
            unsubscribe();
          }
        } catch (error) {
          userLogger.warn("[UploadModal] Failed to remove R2 listener", error);
        }
      });
    }
    this.r2Unsubscribes = [];

    const register = (unsubscribe) => {
      if (typeof unsubscribe === "function") {
        this.r2Unsubscribes.push(unsubscribe);
      }
    };

    register(
      this.r2Service.on("advancedVisibilityChange", ({ visible } = {}) => {
        this.renderCloudflareAdvancedVisibility(visible);
      })
    );

    register(
      this.r2Service.on("settingsStatus", ({ message, variant } = {}) => {
        this.applyCloudflareStatus(
          this.cloudflareSettingsStatus,
          message,
          variant
        );
      })
    );

    register(
      this.r2Service.on("uploadStatus", ({ message, variant } = {}) => {
        this.applyCloudflareStatus(
          this.cloudflareUploadStatus,
          message,
          variant
        );
      })
    );

    register(
      this.r2Service.on("uploadStateChange", ({ isUploading } = {}) => {
        this.renderCloudflareUploadingState(isUploading);
      })
    );

    register(
      this.r2Service.on("uploadProgress", ({ fraction } = {}) => {
        this.updateCloudflareProgress(fraction);
      })
    );

    register(
      this.r2Service.on("settingsPopulated", ({ settings } = {}) => {
        this.fillCloudflareSettingsInputs(settings);
      })
    );

    register(
      this.r2Service.on("settingsChanged", ({ settings } = {}) => {
        this.cloudflareSettings = settings || this.cloudflareSettings;
      })
    );

    register(
      this.r2Service.on("bucketPreview", (detail = {}) => {
        this.renderCloudflareBucketPreview(detail);
      })
    );
  }

  open({ triggerElement } = {}) {
    if (!this.root) {
      return;
    }
    const wasHidden = this.root.classList.contains("hidden");
    if (wasHidden) {
      this.root.classList.remove("hidden");
      this.setGlobalModalState("upload", true);
      this.emit("upload:open", { mode: this.activeMode });
    }
    this.isVisible = true;
    this.modalAccessibility?.activate({ triggerElement });
    this.updateCustomSubmitButtonState();
  }

  close() {
    if (!this.root) {
      return;
    }
    this.modalAccessibility?.deactivate();
    if (this.root.classList.contains("hidden")) {
      this.isVisible = false;
      return;
    }
    this.root.classList.add("hidden");
    this.isVisible = false;
    this.setGlobalModalState("upload", false);
    this.emit("upload:close", { mode: this.activeMode });
  }

  setMode(mode) {
    const normalized = mode === "cloudflare" ? "cloudflare" : "custom";
    this.activeMode = normalized;

    if (this.customSection) {
      if (normalized === "custom") {
        this.customSection.classList.remove("hidden");
      } else {
        this.customSection.classList.add("hidden");
      }
    }

    if (this.cloudflareSection) {
      if (normalized === "cloudflare") {
        this.cloudflareSection.classList.remove("hidden");
      } else {
        this.cloudflareSection.classList.add("hidden");
      }
    }

    if (Array.isArray(this.uploadModeButtons)) {
      this.uploadModeButtons.forEach((button) => {
        if (!button?.dataset) {
          return;
        }
        const isActive = button.dataset.uploadMode === normalized;
        if (isActive) {
          button.dataset.state = "active";
        } else {
          delete button.dataset.state;
        }
        button.setAttribute("aria-pressed", isActive ? "true" : "false");
      });
    }

    if (normalized === "cloudflare") {
      this.refreshCloudflareBucketPreview();
    } else {
      this.updateCustomSubmitButtonState();
    }
  }

  handleCustomSubmit() {
    const audienceFlags = this.sanitizeAudienceFlags({
      isNsfw: this.readCheckboxValue(this.customFormInputs.isNsfw, false),
      isForKids: this.readCheckboxValue(this.customFormInputs.isForKids, false)
    });

    const rawPayload = {
      title: this.customFormInputs.title?.value ?? "",
      url: this.customFormInputs.url?.value ?? "",
      magnet: this.customFormInputs.magnet?.value ?? "",
      ws: this.customFormInputs.ws?.value ?? "",
      xs: this.customFormInputs.xs?.value ?? "",
      thumbnail: this.customFormInputs.thumbnail?.value ?? "",
      description: this.customFormInputs.description?.value ?? "",
      enableComments: this.readCheckboxValue(
        this.customFormInputs.enableComments,
        true
      ),
      ...audienceFlags
    };

    if (this.customFormInputs.isPrivate) {
      rawPayload.isPrivate = this.readCheckboxValue(
        this.customFormInputs.isPrivate,
        false
      );
    }

    const nip71Metadata = this.nip71FormManager.collectSection("custom");
    if (nip71Metadata) {
      rawPayload.nip71 = nip71Metadata;
    }

    const { payload, errors } = normalizeVideoNotePayload(rawPayload);

    if (errors.length) {
      const message = getVideoNoteErrorMessage(errors[0]);
      this.showError(message);
      return;
    }

    this.startCustomSubmitCooldown();
    this.emit("upload:submit", { payload });
  }

  collectCloudflareSettingsFormValues() {
    return {
      accountId: this.r2AccountIdInput?.value?.trim() || "",
      accessKeyId: this.r2AccessKeyIdInput?.value?.trim() || "",
      secretAccessKey: this.r2SecretAccessKeyInput?.value?.trim() || "",
      apiToken: this.r2ApiTokenInput?.value?.trim() || "",
      zoneId: this.r2ZoneIdInput?.value?.trim() || "",
      baseDomain: this.r2BaseDomainInput?.value || ""
    };
  }

  applyCloudflareStatus(element, message = "", variant = "info") {
    if (!element) {
      return;
    }

    element.textContent = message || "";
    element.classList.remove(
      "text-info-strong",
      "text-critical",
      "text-warning-strong",
      "text-muted"
    );

    if (!message) {
      element.classList.add("text-muted");
      return;
    }

    let className = "text-muted";
    if (variant === "success") {
      className = "text-info-strong";
    } else if (variant === "error") {
      className = "text-critical";
    } else if (variant === "warning") {
      className = "text-warning-strong";
    }
    element.classList.add(className);
  }

  renderCloudflareAdvancedVisibility(visible) {
    const isVisible = Boolean(visible);
    this.cloudflareAdvancedVisible = isVisible;

    if (this.cloudflareAdvancedFields) {
      if (isVisible) {
        this.cloudflareAdvancedFields.classList.remove("hidden");
      } else {
        this.cloudflareAdvancedFields.classList.add("hidden");
      }
    }

    if (this.cloudflareAdvancedToggle) {
      this.cloudflareAdvancedToggle.setAttribute(
        "aria-expanded",
        isVisible ? "true" : "false"
      );
    }

    if (this.cloudflareAdvancedToggleLabel) {
      this.cloudflareAdvancedToggleLabel.textContent = isVisible
        ? "Hide advanced options"
        : "Show advanced options";
    }

    if (this.cloudflareAdvancedToggleIcon) {
      this.cloudflareAdvancedToggleIcon.classList.toggle(
        "rotate-90",
        isVisible
      );
    }
  }

  renderCloudflareUploadingState(isUploading) {
    if (this.cloudflareUploadButton) {
      this.cloudflareUploadButton.disabled = Boolean(isUploading);
      this.cloudflareUploadButton.textContent = isUploading
        ? "Uploading…"
        : "Upload to R2 & publish";
    }

    if (this.cloudflareFileInput) {
      this.cloudflareFileInput.disabled = Boolean(isUploading);
    }

    if (this.cloudflareEnableCommentsInput) {
      this.cloudflareEnableCommentsInput.disabled = Boolean(isUploading);
    }
  }

  fillCloudflareSettingsInputs(settings) {
    const data = settings || {};

    if (this.r2AccountIdInput) {
      this.r2AccountIdInput.value = data.accountId || "";
    }
    if (this.r2AccessKeyIdInput) {
      this.r2AccessKeyIdInput.value = data.accessKeyId || "";
    }
    if (this.r2SecretAccessKeyInput) {
      this.r2SecretAccessKeyInput.value = data.secretAccessKey || "";
    }
    if (this.r2ApiTokenInput) {
      this.r2ApiTokenInput.value = data.apiToken || "";
    }
    if (this.r2ZoneIdInput) {
      this.r2ZoneIdInput.value = data.zoneId || "";
    }
    if (this.r2BaseDomainInput) {
      this.r2BaseDomainInput.value = data.baseDomain || "";
    }
  }

  renderCloudflareBucketPreview({ text = "", title = "" } = {}) {
    if (!this.cloudflareBucketPreview) {
      return;
    }

    this.cloudflareBucketPreview.textContent = text || "";
    if (title) {
      this.cloudflareBucketPreview.setAttribute("title", title);
    } else {
      this.cloudflareBucketPreview.removeAttribute("title");
    }
  }

  async refreshCloudflareBucketPreview() {
    if (!this.r2Service?.updateCloudflareBucketPreview) {
      return;
    }

    const pubkey =
      (this.getCurrentPubkey && this.getCurrentPubkey()) ||
      (this.authService?.getActivePubkey?.() ?? null);
    const hasPubkey = Boolean(pubkey);
    const npub = hasPubkey ? this.safeEncodeNpub(pubkey) : "";

    await this.r2Service.updateCloudflareBucketPreview({ hasPubkey, npub });
  }

  updateCloudflareProgress(fraction) {
    if (!this.cloudflareProgress) {
      this.emit("upload:r2-progress", { fraction: null });
      return;
    }

    if (!Number.isFinite(fraction) || fraction < 0) {
      this.cloudflareProgress.value = 0;
      delete this.cloudflareProgress.dataset.progress;
      this.cloudflareProgress.dataset.state = "idle";
      this.cloudflareProgress.hidden = true;
      this.cloudflareProgress.setAttribute(
        "aria-valuetext",
        "Upload progress unavailable",
      );
      this.cloudflareProgress.setAttribute("aria-hidden", "true");
      if (this.cloudflareProgressStatus) {
        this.cloudflareProgressStatus.textContent = "";
      }
      this.emit("upload:r2-progress", { fraction: null });
      return;
    }

    const clamped = Math.max(0, Math.min(1, fraction));
    const percent = Math.round(clamped * 100);
    const state = percent >= 100 ? "complete" : "active";
    const valueText = `Upload ${percent}% complete`;

    this.cloudflareProgress.max = 100;
    this.cloudflareProgress.value = percent;
    this.cloudflareProgress.dataset.progress = String(percent);
    this.cloudflareProgress.dataset.state = state;
    this.cloudflareProgress.hidden = false;
    this.cloudflareProgress.setAttribute("aria-hidden", "false");
    this.cloudflareProgress.setAttribute("aria-valuetext", valueText);

    if (this.cloudflareProgressStatus) {
      this.cloudflareProgressStatus.textContent = valueText;
    }

    this.emit("upload:r2-progress", { fraction: clamped });
  }

  resetCloudflareUploadForm() {
    if (this.cloudflareTitleInput) this.cloudflareTitleInput.value = "";
    if (this.cloudflareDescriptionInput)
      this.cloudflareDescriptionInput.value = "";
    if (this.cloudflareThumbnailInput) this.cloudflareThumbnailInput.value = "";
    if (this.cloudflareMagnetInput) this.cloudflareMagnetInput.value = "";
    if (this.cloudflareWsInput) this.cloudflareWsInput.value = "";
    if (this.cloudflareXsInput) this.cloudflareXsInput.value = "";
    if (this.cloudflareEnableCommentsInput)
      this.resetCheckbox(this.cloudflareEnableCommentsInput, true);
    if (this.cloudflareIsNsfwInput)
      this.resetCheckbox(this.cloudflareIsNsfwInput, false);
    if (this.cloudflareIsForKidsInput)
      this.resetCheckbox(this.cloudflareIsForKidsInput, false);
    if (this.cloudflareFileInput) this.cloudflareFileInput.value = "";
    this.nip71FormManager.resetSection("cloudflare");
    this.updateCloudflareProgress(Number.NaN);
  }

  resetCustomForm() {
    if (this.customFormInputs.title) this.customFormInputs.title.value = "";
    if (this.customFormInputs.url) this.customFormInputs.url.value = "";
    if (this.customFormInputs.magnet) this.customFormInputs.magnet.value = "";
    if (this.customFormInputs.ws) this.customFormInputs.ws.value = "";
    if (this.customFormInputs.xs) this.customFormInputs.xs.value = "";
    if (this.customFormInputs.thumbnail)
      this.customFormInputs.thumbnail.value = "";
    if (this.customFormInputs.description)
      this.customFormInputs.description.value = "";
    if (this.customFormInputs.enableComments)
      this.resetCheckbox(this.customFormInputs.enableComments, true);
    if (this.customFormInputs.isNsfw)
      this.resetCheckbox(this.customFormInputs.isNsfw, false);
    if (this.customFormInputs.isForKids)
      this.resetCheckbox(this.customFormInputs.isForKids, false);
    if (this.customFormInputs.isPrivate)
      this.resetCheckbox(this.customFormInputs.isPrivate, false);
    this.nip71FormManager.resetSection("custom");
  }

  async loadR2Settings() {
    if (!this.r2Service?.loadSettings) {
      return null;
    }
    const settings = await this.r2Service.loadSettings();
    this.cloudflareSettings = settings;
    return settings;
  }

  async handleCloudflareSettingsSubmit() {
    if (!this.r2Service?.saveSettings) {
      return;
    }
    try {
      const formValues = this.collectCloudflareSettingsFormValues();
      const saved = await this.r2Service.saveSettings(formValues);
      if (saved) {
        await this.refreshCloudflareBucketPreview();
      }
    } catch (error) {
      userLogger.error("[UploadModal] Failed to save Cloudflare settings", error);
    }
  }

  async handleCloudflareClearSettings() {
    if (!this.r2Service?.clearSettings) {
      return;
    }
    try {
      const cleared = await this.r2Service.clearSettings();
      if (cleared) {
        await this.refreshCloudflareBucketPreview();
      }
    } catch (error) {
      userLogger.error("[UploadModal] Failed to clear Cloudflare settings", error);
    }
  }

  async handleCloudflareUploadSubmit() {
    if (!this.r2Service?.uploadVideo) {
      return;
    }

    const pubkey =
      (this.getCurrentPubkey && this.getCurrentPubkey()) ||
      (this.authService?.getActivePubkey?.() ?? null);
    if (!pubkey) {
      this.showError("Please login to post a video.");
      return;
    }

    const npub = this.safeEncodeNpub(pubkey) || "";
    const file = this.cloudflareFileInput?.files?.[0] || null;
    const audienceFlags = this.sanitizeAudienceFlags({
      isNsfw: this.readCheckboxValue(this.cloudflareIsNsfwInput, false),
      isForKids: this.readCheckboxValue(this.cloudflareIsForKidsInput, false)
    });
    const metadata = {
      title: this.cloudflareTitleInput?.value ?? "",
      description: this.cloudflareDescriptionInput?.value ?? "",
      thumbnail: this.cloudflareThumbnailInput?.value ?? "",
      magnet: this.cloudflareMagnetInput?.value ?? "",
      ws: this.cloudflareWsInput?.value ?? "",
      xs: this.cloudflareXsInput?.value ?? "",
      enableComments: this.readCheckboxValue(
        this.cloudflareEnableCommentsInput,
        true
      ),
      ...audienceFlags
    };

    metadata.title = metadata.title?.trim() || "";

    if (!metadata.title) {
      this.setCloudflareUploadStatus(
        getVideoNoteErrorMessage(VIDEO_NOTE_ERROR_CODES.MISSING_TITLE),
        "error"
      );
      return;
    }

    const nip71Metadata = this.nip71FormManager.collectSection("cloudflare");
    if (nip71Metadata) {
      const imetaList = Array.isArray(nip71Metadata.imeta)
        ? [...nip71Metadata.imeta]
        : [];
      const autoImeta = this.buildAutoGeneratedImetaVariant(file);
      if (autoImeta && !imetaList.some((variant) => variant?.autoGenerated)) {
        imetaList.push(autoImeta);
      }
      metadata.nip71 = {
        ...nip71Metadata,
        imeta: imetaList
      };
    }

    try {
      await this.r2Service.uploadVideo({
        npub,
        file,
        metadata,
        settingsInput: this.collectCloudflareSettingsFormValues(),
        publishVideoNote: (payload, options) =>
          this.publishVideoNote
            ? this.publishVideoNote(payload, options)
            : null,
        onReset: () => this.resetCloudflareUploadForm()
      });
    } catch (error) {
      userLogger.error("[UploadModal] Cloudflare upload failed", error);
    }
  }

  destroy() {
    this.clearCustomSubmitCooldown();

    if (this.modalAccessibility?.destroy) {
      this.modalAccessibility.destroy();
    }
    this.modalAccessibility = null;
    this.modalBackdrop = null;
    this.modalPanel = null;

    if (Array.isArray(this.cleanupHandlers)) {
      this.cleanupHandlers.forEach((cleanup) => {
        try {
          if (typeof cleanup === "function") {
            cleanup();
          }
        } catch (error) {
          userLogger.warn("[UploadModal] Failed to remove handler", error);
        }
      });
      this.cleanupHandlers = [];
    }

    if (Array.isArray(this.r2Unsubscribes)) {
      this.r2Unsubscribes.forEach((unsubscribe) => {
        try {
          if (typeof unsubscribe === "function") {
            unsubscribe();
          }
        } catch (error) {
          userLogger.warn("[UploadModal] Failed to cleanup R2 listener", error);
        }
      });
    }
    this.r2Unsubscribes = [];
    this.customSubmitButton = null;
    this.customSubmitButtonDefaultLabel = "";
    this.customSubmitBlockedUntil = 0;
    this.eventsBound = false;
    this.loadPromise = null;
>>>>>>> origin/main
    this.root = null;
    this.container = null;
  }
}
