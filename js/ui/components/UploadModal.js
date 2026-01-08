// NOTE: Keep the Upload, Edit, and Revert modals in lockstep when updating NIP-71 form features.

import { createModalAccessibility } from "./modalAccessibility.js";
import { Nip71FormManager } from "./nip71FormManager.js";
import { userLogger } from "../../utils/logger.js";
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
    this.customSubmitButton = null;
    this.customSubmitButtonDefaultLabel = "";
    this.customSubmitBlockedUntil = 0;
    this.customSubmitCooldownTimer = null;
    this.customSubmitCooldownMs = 60000;

    this.customAdvancedToggle = null;
    this.customAdvancedFields = null;

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
    this.cloudflareUploadAdvancedToggle = null;
    this.cloudflareUploadAdvancedFields = null;
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

    // Automation State
    this.customSummaryLocked = true;
    this.cloudflareSummaryLocked = true;
    this.customWsDirty = false;
    this.cloudflareWsDirty = false;
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

    this.loadPromise = (async () => {
      const targetContainer =
        container || this.container || document.getElementById("modalContainer");
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

      return this.root;
    })();

    try {
      return await this.loadPromise;
    } finally {
      this.loadPromise = null;
    }
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
      isPrivate: context.querySelector("#uploadIsPrivate") || null,
      // NIP-71 specific inputs located by form manager usually, but we need direct access for automation
      summary: this.customSection?.querySelector("#nip71Summary") || null,
      summaryUnlock: this.customSection?.querySelector("#nip71SummaryUnlock") || null,
      contentWarning: this.customSection?.querySelector("#nip71ContentWarning") || null,
    };

    this.customAdvancedToggle = this.customSection?.querySelector("#customAdvancedToggle") || null;
    this.customAdvancedFields = this.customSection?.querySelector("#customAdvancedFields") || null;

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
    this.cloudflareSummaryInput =
        this.cloudflareSection?.querySelector("#cloudflareNip71Summary") || null;
    this.cloudflareSummaryUnlock =
        this.cloudflareSection?.querySelector("#cloudflareNip71SummaryUnlock") || null;
    this.cloudflareContentWarningInput =
        this.cloudflareSection?.querySelector("#cloudflareNip71ContentWarning") || null;

    this.cloudflareAdvancedToggle =
      context.querySelector("#cloudflareAdvancedToggle") || null;
    this.cloudflareAdvancedToggleLabel =
      context.querySelector("#cloudflareAdvancedToggleLabel") || null;
    this.cloudflareAdvancedToggleIcon =
      context.querySelector("#cloudflareAdvancedToggleIcon") || null;
    this.cloudflareAdvancedFields =
      context.querySelector("#cloudflareAdvancedFields") || null;

    this.cloudflareUploadAdvancedToggle =
      context.querySelector("#cloudflareUploadAdvancedToggle") || null;
    this.cloudflareUploadAdvancedFields =
      context.querySelector("#cloudflareUploadAdvancedFields") || null;

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

  // New Automation Helpers
  setupDescriptionToSummaryMirror(descriptionInput, summaryInput, unlockCheckbox, isCustom) {
      if (!descriptionInput || !summaryInput) return;

      const handleDescriptionInput = () => {
          const locked = isCustom ? this.customSummaryLocked : this.cloudflareSummaryLocked;
          if (locked) {
              summaryInput.value = descriptionInput.value;
          }
      };

      descriptionInput.addEventListener('input', handleDescriptionInput);
      this.cleanupHandlers.push(() => descriptionInput.removeEventListener('input', handleDescriptionInput));

      if (unlockCheckbox) {
          unlockCheckbox.addEventListener('change', () => {
             const unlocked = unlockCheckbox.checked;
             if (isCustom) {
                 this.customSummaryLocked = !unlocked;
             } else {
                 this.cloudflareSummaryLocked = !unlocked;
             }

             summaryInput.readOnly = !unlocked;
             if (unlocked) {
                 summaryInput.classList.remove('text-muted-strong');
                 summaryInput.classList.remove('bg-surface-alt'); // if applicable
             } else {
                 summaryInput.classList.add('text-muted-strong');
                 // re-sync if locking back
                 summaryInput.value = descriptionInput.value;
             }
          });
      }
  }

  setupUrlToWsMirror(urlInput, wsInput, isCustom) {
      if (!urlInput || !wsInput) return;

      const handleUrlInput = () => {
          const dirty = isCustom ? this.customWsDirty : this.cloudflareWsDirty;
          if (!dirty) {
              wsInput.value = urlInput.value;
          }
      };

      const handleWsInput = () => {
          if (isCustom) this.customWsDirty = true;
          else this.cloudflareWsDirty = true;
      };

      urlInput.addEventListener('input', handleUrlInput);
      wsInput.addEventListener('input', handleWsInput);

      this.cleanupHandlers.push(() => {
          urlInput.removeEventListener('input', handleUrlInput);
          wsInput.removeEventListener('input', handleWsInput);
      });
  }

  setupNsfwToContentWarning(nsfwInput, contentWarningInput) {
      if (!nsfwInput || !contentWarningInput) return;

      const handleNsfwChange = () => {
          if (nsfwInput.checked) {
              if (!contentWarningInput.value.trim()) {
                  contentWarningInput.value = "NSFW";
              }
          } else {
              if (contentWarningInput.value.trim().toUpperCase() === "NSFW") {
                  contentWarningInput.value = "";
              }
          }
      };

      nsfwInput.addEventListener('change', handleNsfwChange);
      this.cleanupHandlers.push(() => nsfwInput.removeEventListener('change', handleNsfwChange));
  }

  setupAdvancedToggle(toggleButton, container, icon) {
      if (!toggleButton || !container) return;

      const handleToggle = () => {
         const isHidden = container.classList.contains('hidden');
         if (isHidden) {
             container.classList.remove('hidden');
             toggleButton.setAttribute('aria-expanded', 'true');
             if (toggleButton.querySelector('span')) toggleButton.querySelector('span').textContent = "Hide advanced options";
             if (icon) icon.classList.add('rotate-90');
         } else {
             container.classList.add('hidden');
             toggleButton.setAttribute('aria-expanded', 'false');
             if (toggleButton.querySelector('span')) toggleButton.querySelector('span').textContent = "Show advanced options";
             if (icon) icon.classList.remove('rotate-90');
         }
      };

      toggleButton.addEventListener('click', handleToggle);
      this.cleanupHandlers.push(() => toggleButton.removeEventListener('click', handleToggle));
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

    // Bind Automation Logic - Custom
    this.setupDescriptionToSummaryMirror(
        this.customFormInputs.description,
        this.customFormInputs.summary,
        this.customFormInputs.summaryUnlock,
        true
    );
    this.setupUrlToWsMirror(
        this.customFormInputs.url,
        this.customFormInputs.ws,
        true
    );
    this.setupNsfwToContentWarning(
        this.customFormInputs.isNsfw,
        this.customFormInputs.contentWarning
    );
    this.setupAdvancedToggle(
        this.customAdvancedToggle,
        this.customAdvancedFields,
        this.customSection?.querySelector("#customAdvancedToggleIcon")
    );

    // Bind Automation Logic - Cloudflare
    this.setupDescriptionToSummaryMirror(
        this.cloudflareDescriptionInput,
        this.cloudflareSummaryInput,
        this.cloudflareSummaryUnlock,
        false
    );
    // Cloudflare WS is mainly for manual entry or populated via upload logic,
    // but if user types a URL (unlikely in CF mode as it uploads), we could mirror.
    // However, in CF mode the URL is usually auto-filled after upload.
    // If user manually types it, we can mirror.
    // Actually, Cloudflare form doesn't have a "Hosted URL" input that the user types before upload?
    // Wait, let's check HTML.
    // The "Cloudflare" form has a file input. It does NOT have a "Hosted video URL" input for the user to type.
    // The "Hosted URL" in IMETA is auto-filled.
    // So setupUrlToWsMirror is irrelevant for Cloudflare mode's main flow,
    // BUT there is a `cloudflareWs` input in advanced settings.
    // If the user *manually* fills the WS, they can. But there's no source URL input to mirror *from*.
    // So we skip setupUrlToWsMirror for Cloudflare mode.

    this.setupNsfwToContentWarning(
        this.cloudflareIsNsfwInput,
        this.cloudflareContentWarningInput
    );
    this.setupAdvancedToggle(
        this.cloudflareUploadAdvancedToggle,
        this.cloudflareUploadAdvancedFields,
        this.cloudflareSection?.querySelector("#cloudflareUploadAdvancedToggleIcon")
    );


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

    const hasDirectUrl = typeof rawPayload.url === "string" && rawPayload.url.trim().length > 0;
    const hasMagnet = typeof rawPayload.magnet === "string" && rawPayload.magnet.trim().length > 0;
    const hasImetaUrl = nip71Metadata?.imeta?.some((v) => v.url && v.url.trim().length > 0);

    if (!hasDirectUrl && !hasImetaUrl && hasMagnet) {
      const confirmed = typeof window !== "undefined" && window.confirm
        ? window.confirm("You are uploading with a magnet link only.\n\nSince this video is not hosted on a server, it will only be playable as long as you (or others) continue seeding it.\n\nDo you want to proceed?")
        : true;

      if (!confirmed) {
        this.updateCustomSubmitButtonState();
        return;
      }
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

    // Reset Automation State
    this.cloudflareSummaryLocked = true;
    this.cloudflareWsDirty = false;

    // Reset inputs we automated or tracked
    if (this.cloudflareSummaryInput) {
        this.cloudflareSummaryInput.value = "";
        this.cloudflareSummaryInput.readOnly = true;
        this.cloudflareSummaryInput.classList.add('text-muted-strong');
    }
    if (this.cloudflareSummaryUnlock) this.cloudflareSummaryUnlock.checked = false;
    if (this.cloudflareContentWarningInput) this.cloudflareContentWarningInput.value = "";

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

    // Reset Automation State
    this.customSummaryLocked = true;
    this.customWsDirty = false;

    // Reset automated inputs
    if (this.customFormInputs.summary) {
        this.customFormInputs.summary.value = "";
        this.customFormInputs.summary.readOnly = true;
        this.customFormInputs.summary.classList.add('text-muted-strong');
    }
    if (this.customFormInputs.summaryUnlock) this.customFormInputs.summaryUnlock.checked = false;
    if (this.customFormInputs.contentWarning) this.customFormInputs.contentWarning.value = "";

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
    this.root = null;
    this.container = null;
  }
}
