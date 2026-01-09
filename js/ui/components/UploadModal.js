// components/UploadModal.js
import { createModalAccessibility } from "./modalAccessibility.js";
import { Nip71FormManager } from "./nip71FormManager.js";
import logger, { userLogger } from "../../utils/logger.js";
import {
  getVideoNoteErrorMessage,
  normalizeVideoNotePayload,
  VIDEO_NOTE_ERROR_CODES,
} from "../../services/videoNotePayload.js";

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
        r2Advanced: $("#section-r2-advanced"),
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
        r2Account: $("#input-r2-account"),
        r2Key: $("#input-r2-key"),
        r2Secret: $("#input-r2-secret"),
        r2Token: $("#input-r2-token"),
        r2Zone: $("#input-r2-zone"),
        r2Domain: $("#input-r2-domain"),

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
        r2Advanced: $("#btn-r2-advanced"),
        saveSettings: $("#btn-save-settings"),
        browseThumbnail: $("#btn-thumbnail-file"),
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
    this.setupAccordion(this.toggles.r2Advanced, this.sourceSections.r2Advanced);

    // Form Submission
    this.form.addEventListener("submit", (e) => {
        e.preventDefault();
        this.handleSubmit();
    });

    // Settings Save
    this.toggles.saveSettings.addEventListener("click", async () => {
        await this.handleSaveSettings();
    });

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
    } else {
        this.sourceSections.upload.classList.add("hidden");
        this.sourceSections.external.classList.remove("hidden");
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
      return Boolean(s?.accountId && s?.accessKeyId && s?.secretAccessKey);
  }

  fillSettingsForm(s) {
      if (this.inputs.r2Account) this.inputs.r2Account.value = s.accountId || "";
      if (this.inputs.r2Key) this.inputs.r2Key.value = s.accessKeyId || "";
      if (this.inputs.r2Secret) this.inputs.r2Secret.value = s.secretAccessKey || "";
      if (this.inputs.r2Token) this.inputs.r2Token.value = s.apiToken || "";
      if (this.inputs.r2Zone) this.inputs.r2Zone.value = s.zoneId || "";
      if (this.inputs.r2Domain) this.inputs.r2Domain.value = s.baseDomain || "";
  }

  collectSettingsForm() {
      return {
          accountId: this.inputs.r2Account?.value?.trim() || "",
          accessKeyId: this.inputs.r2Key?.value?.trim() || "",
          secretAccessKey: this.inputs.r2Secret?.value?.trim() || "",
          apiToken: this.inputs.r2Token?.value?.trim() || "",
          zoneId: this.inputs.r2Zone?.value?.trim() || "",
          baseDomain: this.inputs.r2Domain?.value?.trim() || "",
      };
  }

  async handleSaveSettings() {
      const settings = this.collectSettingsForm();
      await this.r2Service.saveSettings(settings);
      this.cloudflareSettings = settings;
      this.updateStorageStatus(this.hasValidR2Settings());

      // Visual feedback
      const btn = this.toggles.saveSettings;
      const originalText = btn.textContent;
      btn.textContent = "Saved!";
      setTimeout(() => btn.textContent = originalText, 2000);

      // Collapse if valid
      if (this.hasValidR2Settings()) {
           this.sourceSections.settings.classList.add("hidden");
           this.toggles.storageSettings.setAttribute("aria-expanded", "false");
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

      if (fraction === null || fraction < 0) {
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

      await this.r2Service.uploadVideo({
          npub,
          file,
          thumbnailFile,
          metadata,
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
