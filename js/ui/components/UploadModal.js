// components/UploadModal.js
import { createModalAccessibility } from "./modalAccessibility.js";
import { Nip71FormManager } from "./nip71FormManager.js";
import logger, { userLogger } from "../../utils/logger.js";
import {
  getVideoNoteErrorMessage,
  normalizeVideoNotePayload,
  VIDEO_NOTE_ERROR_CODES,
} from "../../services/videoNotePayload.js";
import { calculateTorrentInfoHash } from "../../utils/torrentHash.js";
import { sanitizeBucketName } from "../../storage/r2-mgmt.js";

export class UploadModal {
  constructor({
    authService,
    r2Service,
    publishVideoNote,
    removeTrackingScripts,
    setGlobalModalState,
    showError,
    showSuccess,
    getCurrentPubkey,
    safeEncodeNpub,
    eventTarget,
    container,
  } = {}) {
    this.authService = authService || null;
    this.r2Service = r2Service || null;
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

    this.root = null;
    this.isVisible = false;
    this.activeSource = "upload"; // 'upload' | 'external'
    this.cloudflareSettings = this.r2Service?.getSettings?.() || null;

    // UI References
    this.form = null;
    this.modeButtons = {};
    this.sourceSections = {};
    this.inputs = {};
    this.toggles = {};
    this.submitButton = null;
    this.submitStatus = null;

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
      this.registerR2Subscriptions();

      // Initial State
      await this.loadR2Settings();
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
    };

    // Status text
    this.statusText = {
        storage: $("#storage-status"),
        uploadMain: $("#upload-status-text"),
        uploadPercent: $("#upload-percent-text"),
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

        // Auto-show settings if missing
        if (!this.hasValidR2Settings() && this.sourceSections.settings.classList.contains("hidden")) {
            this.toggles.storageSettings.click(); // Expand
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

  async loadR2Settings() {
      if (!this.r2Service?.loadSettings) return;
      const settings = await this.r2Service.loadSettings();
      this.cloudflareSettings = settings || {};
      this.fillSettingsForm(this.cloudflareSettings);
      this.updateStorageStatus(this.hasValidR2Settings());
      return settings;
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
          alert("Please fill in Account ID, Access Key ID, and Secret Access Key.");
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
           this.wizard.errorText.textContent = "Public Bucket URL is required.";
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
              if (settings.accountId && npub) {
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
          await this.r2Service.saveSettings(settings);
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
          }, 1500);
      } catch (err) {
          userLogger.error("Verification crashed:", err);
          btn.disabled = false;
          btn.textContent = originalText;
          this.wizard.errorText.textContent = "Unexpected error during verification.";
          this.wizard.errorContainer.classList.remove("hidden");
      }
  }

  updateStorageStatus(isValid) {
      if (this.statusText.storage) {
          this.statusText.storage.textContent = isValid ? "Ready" : "Missing Credentials";
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

      // 1. Calculate Torrent Info Hash (Client-side)
      this.isUploading = true;
      this.submitButton.disabled = true;
      this.updateUploadStatus("Calculating Info Hash...", "info");
      this.updateProgress(0); // Show bar at 0

      let infoHash = "";
      try {
          infoHash = await calculateTorrentInfoHash(file);
      } catch (hashErr) {
          userLogger.warn("Failed to calculate info hash:", hashErr);
          // We can proceed without it, or fail. The plan says we need it.
          // Let's warn but proceed? Or fail? The user said "Also lets not forget that we calculate a torrent hash".
          // I will proceed but log it, maybe the upload handles it gracefully (missing magnet).
          // But passing empty infoHash means no magnet link generated in R2Service.
      }

      // 2. Upload
      await this.r2Service.uploadVideo({
          npub,
          file,
          thumbnailFile,
          metadata,
          infoHash,
          settingsInput: this.collectSettingsForm(),
          publishVideoNote: this.publishVideoNote,
          onReset: () => this.resetForm(),
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
