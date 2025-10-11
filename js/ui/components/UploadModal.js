// NOTE: Keep the Upload, Edit, and Revert modals in lockstep when updating NIP-71 form features.

import { createModalAccessibility } from "./modalAccessibility.js";
import { Nip71FormManager } from "./nip71FormManager.js";

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
    container
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

    this.cloudflareSettingsForm = null;
    this.cloudflareClearSettingsButton = null;
    this.cloudflareSettingsStatus = null;
    this.cloudflareBucketPreview = null;
    this.cloudflareUploadForm = null;
    this.cloudflareFileInput = null;
    this.cloudflareUploadButton = null;
    this.cloudflareUploadStatus = null;
    this.cloudflareProgressBar = null;
    this.cloudflareProgressFill = null;
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

    const targetContainer =
      container || this.container || document.getElementById("modalContainer");
    if (!targetContainer) {
      throw new Error("Modal container element not found!");
    }

    const response = await fetch("components/upload-modal.html");
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const html = await response.text();

    const wrapper = document.createElement("div");
    wrapper.innerHTML = html;
    this.removeTrackingScripts(wrapper);
    targetContainer.appendChild(wrapper);

    this.container = targetContainer;
    this.root = wrapper.querySelector("#uploadModal");
    if (!this.root) {
      throw new Error("Upload modal markup missing after load.");
    }

    this.cacheElements(wrapper);
    this.setupModalAccessibility();
    this.bindEvents();
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

    return this.root;
  }

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
    this.cloudflareProgressBar =
      context.querySelector("#cloudflareProgressBar") || null;
    this.cloudflareProgressFill =
      context.querySelector("#cloudflareProgressFill") || null;
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
          console.warn("[UploadModal] Failed to remove R2 listener", error);
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
    }
  }

  handleCustomSubmit() {
    const audienceFlags = this.sanitizeAudienceFlags({
      isNsfw: this.readCheckboxValue(this.customFormInputs.isNsfw, false),
      isForKids: this.readCheckboxValue(this.customFormInputs.isForKids, false)
    });
    const payload = {
      title: this.customFormInputs.title?.value?.trim() || "",
      url: this.customFormInputs.url?.value?.trim() || "",
      magnet: this.customFormInputs.magnet?.value?.trim() || "",
      ws: this.customFormInputs.ws?.value?.trim() || "",
      xs: this.customFormInputs.xs?.value?.trim() || "",
      thumbnail: this.customFormInputs.thumbnail?.value?.trim() || "",
      description: this.customFormInputs.description?.value?.trim() || "",
      enableComments: this.readCheckboxValue(
        this.customFormInputs.enableComments,
        true
      ),
      ...audienceFlags
    };

    if (this.customFormInputs.isPrivate) {
      payload.isPrivate = this.readCheckboxValue(
        this.customFormInputs.isPrivate,
        false
      );
    }

    const nip71Metadata = this.nip71FormManager.collectSection("custom");
    if (nip71Metadata) {
      payload.nip71 = nip71Metadata;
    }

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
    if (!this.cloudflareProgressBar || !this.cloudflareProgressFill) {
      this.emit("upload:r2-progress", { fraction: null });
      return;
    }

    if (!Number.isFinite(fraction) || fraction < 0) {
      this.cloudflareProgressBar.classList.add("hidden");
      this.cloudflareProgressBar.setAttribute("aria-hidden", "true");
      this.cloudflareProgressFill.style.width = "0%";
      this.cloudflareProgressFill.setAttribute("aria-valuenow", "0");
      this.emit("upload:r2-progress", { fraction: null });
      return;
    }

    const clamped = Math.max(0, Math.min(1, fraction));
    const percent = Math.round(clamped * 100);

    this.cloudflareProgressBar.classList.remove("hidden");
    this.cloudflareProgressBar.setAttribute("aria-hidden", "false");
    this.cloudflareProgressFill.style.width = `${percent}%`;
    this.cloudflareProgressFill.setAttribute("aria-valuenow", `${percent}`);
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
      console.error("[UploadModal] Failed to save Cloudflare settings", error);
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
      console.error("[UploadModal] Failed to clear Cloudflare settings", error);
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
      title: this.cloudflareTitleInput?.value?.trim() || "",
      description: this.cloudflareDescriptionInput?.value?.trim() || "",
      thumbnail: this.cloudflareThumbnailInput?.value?.trim() || "",
      magnet: this.cloudflareMagnetInput?.value?.trim() || "",
      ws: this.cloudflareWsInput?.value?.trim() || "",
      xs: this.cloudflareXsInput?.value?.trim() || "",
      enableComments: this.readCheckboxValue(
        this.cloudflareEnableCommentsInput,
        true
      ),
      ...audienceFlags
    };

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
      console.error("[UploadModal] Cloudflare upload failed", error);
    }
  }

  destroy() {
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
          console.warn("[UploadModal] Failed to remove handler", error);
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
          console.warn("[UploadModal] Failed to cleanup R2 listener", error);
        }
      });
    }
    this.r2Unsubscribes = [];
  }
}
