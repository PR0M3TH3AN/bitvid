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
    this.publishVideoNote = typeof publishVideoNote === "function" ? publishVideoNote : null;
    this.removeTrackingScripts =
      typeof removeTrackingScripts === "function" ? removeTrackingScripts : () => {};
    this.setGlobalModalState =
      typeof setGlobalModalState === "function" ? setGlobalModalState : () => {};
    this.showError = typeof showError === "function" ? showError : () => {};
    this.showSuccess = typeof showSuccess === "function" ? showSuccess : () => {};
    this.getCurrentPubkey = typeof getCurrentPubkey === "function" ? getCurrentPubkey : null;
    this.safeEncodeNpub = typeof safeEncodeNpub === "function" ? safeEncodeNpub : () => "";
    this.eventTarget = eventTarget instanceof EventTarget ? eventTarget : new EventTarget();
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

    this.nip71 = {
      custom: null,
      cloudflare: null,
    };
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
    this.uploadModeButtons = Array.from(
      context.querySelectorAll(".upload-mode-toggle[data-upload-mode]")
    );
    this.customSection = context.querySelector("#customUploadSection") || null;
    this.cloudflareSection = context.querySelector("#cloudflareUploadSection") || null;

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
      isPrivate: context.querySelector("#uploadIsPrivate") || null,
    };

    this.closeButton = context.querySelector("#closeUploadModal") || null;

    this.cloudflareSettingsForm = context.querySelector("#cloudflareSettingsForm") || null;
    this.cloudflareClearSettingsButton =
      context.querySelector("#cloudflareClearSettings") || null;
    this.cloudflareSettingsStatus =
      context.querySelector("#cloudflareSettingsStatus") || null;
    this.cloudflareBucketPreview =
      context.querySelector("#cloudflareBucketPreview") || null;
    this.cloudflareUploadForm = context.querySelector("#cloudflareUploadForm") || null;
    this.cloudflareFileInput = context.querySelector("#cloudflareFile") || null;
    this.cloudflareUploadButton = context.querySelector("#cloudflareUploadButton") || null;
    this.cloudflareUploadStatus =
      context.querySelector("#cloudflareUploadStatus") || null;
    this.cloudflareProgressBar = context.querySelector("#cloudflareProgressBar") || null;
    this.cloudflareProgressFill = context.querySelector("#cloudflareProgressFill") || null;
    this.cloudflareTitleInput = context.querySelector("#cloudflareTitle") || null;
    this.cloudflareDescriptionInput =
      context.querySelector("#cloudflareDescription") || null;
    this.cloudflareThumbnailInput =
      context.querySelector("#cloudflareThumbnail") || null;
    this.cloudflareMagnetInput = context.querySelector("#cloudflareMagnet") || null;
    this.cloudflareWsInput = context.querySelector("#cloudflareWs") || null;
    this.cloudflareXsInput = context.querySelector("#cloudflareXs") || null;
    this.cloudflareEnableCommentsInput =
      context.querySelector("#cloudflareEnableComments") || null;
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
    this.r2SecretAccessKeyInput = context.querySelector("#r2SecretAccessKey") || null;
    this.r2ApiTokenInput = context.querySelector("#r2ApiToken") || null;
    this.r2ZoneIdInput = context.querySelector("#r2ZoneId") || null;
    this.r2BaseDomainInput = context.querySelector("#r2BaseDomain") || null;

    this.nip71.custom = this.cacheNip71Section(this.customSection);
    this.nip71.cloudflare = this.cacheNip71Section(this.cloudflareSection);
  }

  cacheNip71Section(section) {
    if (!section) {
      return null;
    }

    const repeaters = {};
    ["imeta", "text-track", "segment", "t", "p", "r"].forEach((key) => {
      repeaters[key] = this.cacheNip71Repeater(section, key);
    });

    return {
      root: section,
      kindInputs: Array.from(section.querySelectorAll('[data-nip71-input="kind"]')),
      publishedAtInput:
        section.querySelector('[data-nip71-input="published_at"]') || null,
      altInput: section.querySelector('[data-nip71-input="alt"]') || null,
      durationInput:
        section.querySelector('[data-nip71-input="duration"]') || null,
      contentWarningInput:
        section.querySelector('[data-nip71-input="content-warning"]') || null,
      summaryInput: section.querySelector('[data-nip71-input="summary"]') || null,
      repeaters,
      handlers: {},
    };
  }

  cacheNip71Repeater(section, key) {
    if (!section || !key) {
      return null;
    }

    const repeaterRoot = section.querySelector(`[data-nip71-repeater="${key}"]`);
    if (!repeaterRoot) {
      return null;
    }

    return {
      root: repeaterRoot,
      list: repeaterRoot.querySelector(`[data-nip71-list="${key}"]`) || null,
      template:
        repeaterRoot.querySelector(`[data-nip71-template="${key}"]`) || null,
    };
  }

  getNip71Store(mode) {
    if (!mode || !this.nip71) {
      return null;
    }
    return this.nip71[mode] || null;
  }

  bindNip71Events(mode) {
    const store = this.getNip71Store(mode);
    if (!store?.root) {
      return;
    }

    if (store.handlers?.click) {
      try {
        store.root.removeEventListener("click", store.handlers.click);
      } catch (error) {
        console.warn("[UploadModal] Failed to detach previous NIP-71 handler", error);
      }
    }

    const handleClick = (event) => {
      const addTrigger = event.target?.closest?.("[data-nip71-add]");
      if (addTrigger && store.root.contains(addTrigger)) {
        event.preventDefault();
        this.handleNip71Add(mode, addTrigger.dataset?.nip71Add || "");
        return;
      }

      const nestedAddTrigger = event.target?.closest?.("[data-nip71-nested-add]");
      if (nestedAddTrigger && store.root.contains(nestedAddTrigger)) {
        event.preventDefault();
        this.handleNip71NestedAdd(nestedAddTrigger);
        return;
      }

      const removeTrigger = event.target?.closest?.("[data-nip71-remove]");
      if (removeTrigger && store.root.contains(removeTrigger)) {
        event.preventDefault();
        this.handleNip71Remove(mode, removeTrigger);
      }
    };

    store.root.addEventListener("click", handleClick);
    store.handlers = { ...(store.handlers || {}), click: handleClick };
  }

  handleNip71Add(mode, key) {
    if (!key) {
      return;
    }
    const entry = this.addNip71RepeaterEntry(mode, key);
    if (entry) {
      this.focusFirstField(entry, "[data-nip71-field], [data-nip71-nested-field]");
    }
  }

  handleNip71NestedAdd(trigger) {
    if (!trigger) {
      return;
    }
    const nestedKey = trigger.dataset?.nip71NestedAdd || "";
    if (!nestedKey) {
      return;
    }
    const container = trigger.closest(`[data-nip71-nested="${nestedKey}"]`);
    if (!container) {
      return;
    }
    const entry = this.addNip71NestedEntry(container, nestedKey);
    if (entry) {
      this.focusFirstField(
        entry,
        `[data-nip71-nested-field="${nestedKey}"]`
      );
    }
  }

  handleNip71Remove(mode, trigger) {
    if (!trigger) {
      return;
    }
    const targetKey = trigger.dataset?.nip71Remove || "";
    if (!targetKey) {
      return;
    }

    if (targetKey === "nested") {
      const nestedEntry = trigger.closest("[data-nip71-nested-entry]");
      this.removeNip71NestedEntry(nestedEntry);
      return;
    }

    this.removeNip71RepeaterEntry(mode, targetKey, trigger);
  }

  addNip71RepeaterEntry(mode, key) {
    const store = this.getNip71Store(mode);
    if (!store?.repeaters || !key) {
      return null;
    }

    const repeater = store.repeaters[key];
    if (!repeater?.list || !repeater?.template) {
      return null;
    }

    const templateNode = repeater.template;
    const fragment = templateNode.content
      ? templateNode.content.cloneNode(true)
      : templateNode.cloneNode(true);

    const entry =
      fragment.querySelector?.(`[data-nip71-entry="${key}"]`) ||
      fragment.firstElementChild ||
      null;

    repeater.list.appendChild(fragment);

    return entry;
  }

  removeNip71RepeaterEntry(mode, key, trigger) {
    if (!key || !trigger) {
      return;
    }

    const store = this.getNip71Store(mode);
    if (!store?.repeaters?.[key]?.list) {
      return;
    }

    const entry = trigger.closest(`[data-nip71-entry="${key}"]`);
    if (!entry) {
      return;
    }

    if (entry.dataset?.nip71Primary === "true") {
      this.resetNip71Entry(entry);
      return;
    }

    entry.remove();
  }

  addNip71NestedEntry(container, nestedKey) {
    if (!container || !nestedKey) {
      return null;
    }

    const list = container.querySelector(
      `[data-nip71-nested-list="${nestedKey}"]`
    );
    const template = container.querySelector(
      `[data-nip71-nested-template="${nestedKey}"]`
    );

    if (!list || !template) {
      return null;
    }

    const fragment = template.content
      ? template.content.cloneNode(true)
      : template.cloneNode(true);

    const entry =
      fragment.querySelector?.(`[data-nip71-nested-entry="${nestedKey}"]`) ||
      fragment.firstElementChild ||
      null;

    list.appendChild(fragment);

    return entry;
  }

  removeNip71NestedEntry(entry) {
    if (!entry) {
      return;
    }
    entry.remove();
  }

  focusFirstField(container, selector) {
    if (!container) {
      return;
    }
    const target = container.querySelector(selector);
    if (target?.focus) {
      target.focus();
    }
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
      autoGenerated: true,
    };
  }

  collectNip71Metadata(mode) {
    const store = this.getNip71Store(mode);
    if (!store) {
      return null;
    }

    const kindInput = Array.isArray(store.kindInputs)
      ? store.kindInputs.find((input) => input?.checked)
      : null;
    let kind = null;
    if (kindInput?.value != null) {
      const parsed = Number(kindInput.value);
      kind = Number.isFinite(parsed) ? parsed : String(kindInput.value).trim();
    }

    const summary = this.getTrimmedValue(store.summaryInput);
    const publishedAt = this.getTrimmedValue(store.publishedAtInput);
    const alt = this.getTrimmedValue(store.altInput);

    let duration = null;
    if (store.durationInput) {
      const value = store.durationInput.value;
      if (value !== "" && value != null) {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) {
          duration = parsed;
        }
      }
    }

    const contentWarning = this.getTrimmedValue(store.contentWarningInput);

    const imeta = this.collectNip71RepeaterValues(mode, "imeta", (entry) => {
      const variant = {
        m: this.getNip71FieldValue(entry, "m"),
        dim: this.getNip71FieldValue(entry, "dim"),
        url: this.getNip71FieldValue(entry, "url"),
        x: this.getNip71FieldValue(entry, "x"),
        image: this.collectNip71NestedValues(entry, "image"),
        fallback: this.collectNip71NestedValues(entry, "fallback"),
        service: this.collectNip71NestedValues(entry, "service"),
      };

      const hasContent =
        variant.m ||
        variant.dim ||
        variant.url ||
        variant.x ||
        variant.image.length > 0 ||
        variant.fallback.length > 0 ||
        variant.service.length > 0;

      return hasContent ? variant : null;
    });

    const textTracks = this.collectNip71RepeaterValues(
      mode,
      "text-track",
      (entry) => {
        const track = {
          url: this.getNip71FieldValue(entry, "url"),
          type: this.getNip71FieldValue(entry, "type"),
          language: this.getNip71FieldValue(entry, "language"),
        };

        const hasContent = track.url || track.type || track.language;
        return hasContent ? track : null;
      }
    );

    const segments = this.collectNip71RepeaterValues(mode, "segment", (entry) => {
      const segment = {
        start: this.getNip71FieldValue(entry, "start"),
        end: this.getNip71FieldValue(entry, "end"),
        title: this.getNip71FieldValue(entry, "title"),
        thumbnail: this.getNip71FieldValue(entry, "thumbnail"),
      };

      const hasContent =
        segment.start || segment.end || segment.title || segment.thumbnail;
      return hasContent ? segment : null;
    });

    const hashtags = this.collectNip71RepeaterValues(mode, "t", (entry) => {
      const value = this.getNip71FieldValue(entry, "value");
      return value || null;
    });

    const participants = this.collectNip71RepeaterValues(mode, "p", (entry) => {
      const participant = {
        pubkey: this.getNip71FieldValue(entry, "pubkey"),
        relay: this.getNip71FieldValue(entry, "relay"),
      };

      const hasContent = participant.pubkey || participant.relay;
      return hasContent ? participant : null;
    });

    const references = this.collectNip71RepeaterValues(mode, "r", (entry) => {
      const url = this.getNip71FieldValue(entry, "url");
      return url || null;
    });

    return {
      kind,
      summary,
      publishedAt,
      alt,
      duration,
      contentWarning,
      imeta,
      textTracks,
      segments,
      hashtags,
      participants,
      references,
    };
  }

  collectNip71RepeaterValues(mode, key, mapFn) {
    const store = this.getNip71Store(mode);
    const repeater = store?.repeaters?.[key];
    if (!repeater?.list) {
      return [];
    }

    const entries = Array.from(
      repeater.list.querySelectorAll(`[data-nip71-entry="${key}"]`)
    );

    const results = [];
    entries.forEach((entry) => {
      const value = typeof mapFn === "function" ? mapFn(entry) : null;
      if (value == null) {
        return;
      }
      if (typeof value === "string") {
        if (value.trim()) {
          results.push(value.trim());
        }
        return;
      }
      results.push(value);
    });

    return results;
  }

  collectNip71NestedValues(entry, nestedKey) {
    if (!entry || !nestedKey) {
      return [];
    }

    const container = entry.querySelector(`[data-nip71-nested="${nestedKey}"]`);
    if (!container) {
      return [];
    }

    const fields = Array.from(
      container.querySelectorAll(`[data-nip71-nested-field="${nestedKey}"]`)
    );

    return fields
      .map((field) => this.getTrimmedValue(field))
      .filter((value) => Boolean(value));
  }

  getNip71FieldValue(entry, field) {
    if (!entry || !field) {
      return "";
    }
    const element = entry.querySelector(`[data-nip71-field="${field}"]`);
    return this.getTrimmedValue(element);
  }

  getTrimmedValue(element) {
    if (!element) {
      return "";
    }
    const { value } = element;
    if (typeof value === "number") {
      return Number.isFinite(value) ? String(value).trim() : "";
    }
    if (typeof value === "string") {
      return value.trim();
    }
    return String(value ?? "").trim();
  }

  resetNip71Metadata(mode) {
    const store = this.getNip71Store(mode);
    if (!store) {
      return;
    }

    if (Array.isArray(store.kindInputs)) {
      store.kindInputs.forEach((input) => {
        if (!input) {
          return;
        }
        input.checked = Boolean(input.defaultChecked);
      });
    }

    if (store.summaryInput) {
      store.summaryInput.value = "";
    }
    if (store.publishedAtInput) {
      store.publishedAtInput.value = "";
    }
    if (store.altInput) {
      store.altInput.value = "";
    }
    if (store.durationInput) {
      store.durationInput.value = "";
    }
    if (store.contentWarningInput) {
      store.contentWarningInput.value = "";
    }

    if (store.repeaters) {
      Object.entries(store.repeaters).forEach(([key, repeater]) => {
        if (!repeater?.list) {
          return;
        }
        const entries = Array.from(
          repeater.list.querySelectorAll(`[data-nip71-entry="${key}"]`)
        );
        entries.forEach((entry) => {
          if (entry.dataset?.nip71Primary === "true") {
            this.resetNip71Entry(entry);
          } else {
            entry.remove();
          }
        });
      });
    }
  }

  resetNip71Entry(entry) {
    if (!entry) {
      return;
    }
    const fields = entry.querySelectorAll("[data-nip71-field]");
    fields.forEach((field) => {
      if (field) {
        field.value = "";
      }
    });

    const nestedContainers = entry.querySelectorAll("[data-nip71-nested]");
    nestedContainers.forEach((container) => {
      if (!container?.dataset?.nip71Nested) {
        return;
      }
      const list = container.querySelector(
        `[data-nip71-nested-list="${container.dataset.nip71Nested}"]`
      );
      if (list) {
        list.innerHTML = "";
      }
    });
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
        if (this.r2Service?.setCloudflareAdvancedVisibility &&
            this.r2Service?.getCloudflareAdvancedVisibility) {
          const nextState = !this.r2Service.getCloudflareAdvancedVisibility();
          this.r2Service.setCloudflareAdvancedVisibility(nextState);
        } else {
          this.renderCloudflareAdvancedVisibility(!this.cloudflareAdvancedVisible);
        }
      });
    }

    this.bindNip71Events("custom");
    this.bindNip71Events("cloudflare");
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
        this.applyCloudflareStatus(this.cloudflareSettingsStatus, message, variant);
      })
    );

    register(
      this.r2Service.on("uploadStatus", ({ message, variant } = {}) => {
        this.applyCloudflareStatus(this.cloudflareUploadStatus, message, variant);
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

  open() {
    if (!this.root) {
      return;
    }
    if (!this.root.classList.contains("hidden")) {
      this.isVisible = true;
      return;
    }
    this.root.classList.remove("hidden");
    this.isVisible = true;
    this.setGlobalModalState("upload", true);
    this.emit("upload:open", { mode: this.activeMode });
  }

  close() {
    if (!this.root) {
      return;
    }
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
        button.classList.toggle("bg-blue-500", isActive);
        button.classList.toggle("text-white", isActive);
        button.classList.toggle("shadow", isActive);
        button.classList.toggle("text-gray-300", !isActive);
        button.setAttribute("aria-pressed", isActive ? "true" : "false");
      });
    }

    if (normalized === "cloudflare") {
      this.refreshCloudflareBucketPreview();
    }
  }

  handleCustomSubmit() {
    const payload = {
      title: this.customFormInputs.title?.value?.trim() || "",
      url: this.customFormInputs.url?.value?.trim() || "",
      magnet: this.customFormInputs.magnet?.value?.trim() || "",
      ws: this.customFormInputs.ws?.value?.trim() || "",
      xs: this.customFormInputs.xs?.value?.trim() || "",
      thumbnail: this.customFormInputs.thumbnail?.value?.trim() || "",
      description: this.customFormInputs.description?.value?.trim() || "",
      enableComments: this.customFormInputs.enableComments
        ? !!this.customFormInputs.enableComments.checked
        : true,
    };

    if (this.customFormInputs.isPrivate) {
      payload.isPrivate = !!this.customFormInputs.isPrivate.checked;
    }

    const nip71Metadata = this.collectNip71Metadata("custom");
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
      baseDomain: this.r2BaseDomainInput?.value || "",
    };
  }

  applyCloudflareStatus(element, message = "", variant = "info") {
    if (!element) {
      return;
    }

    element.textContent = message || "";
    element.classList.remove(
      "text-green-400",
      "text-red-400",
      "text-yellow-400",
      "text-gray-400"
    );

    if (!message) {
      element.classList.add("text-gray-400");
      return;
    }

    let className = "text-gray-400";
    if (variant === "success") {
      className = "text-green-400";
    } else if (variant === "error") {
      className = "text-red-400";
    } else if (variant === "warning") {
      className = "text-yellow-400";
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
      this.cloudflareAdvancedToggleIcon.classList.toggle("rotate-90", isVisible);
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
    if (this.cloudflareDescriptionInput) this.cloudflareDescriptionInput.value = "";
    if (this.cloudflareThumbnailInput) this.cloudflareThumbnailInput.value = "";
    if (this.cloudflareMagnetInput) this.cloudflareMagnetInput.value = "";
    if (this.cloudflareWsInput) this.cloudflareWsInput.value = "";
    if (this.cloudflareXsInput) this.cloudflareXsInput.value = "";
    if (this.cloudflareEnableCommentsInput)
      this.cloudflareEnableCommentsInput.checked = true;
    if (this.cloudflareFileInput) this.cloudflareFileInput.value = "";
    this.resetNip71Metadata("cloudflare");
    this.updateCloudflareProgress(Number.NaN);
  }

  resetCustomForm() {
    if (this.customFormInputs.title) this.customFormInputs.title.value = "";
    if (this.customFormInputs.url) this.customFormInputs.url.value = "";
    if (this.customFormInputs.magnet) this.customFormInputs.magnet.value = "";
    if (this.customFormInputs.ws) this.customFormInputs.ws.value = "";
    if (this.customFormInputs.xs) this.customFormInputs.xs.value = "";
    if (this.customFormInputs.thumbnail) this.customFormInputs.thumbnail.value = "";
    if (this.customFormInputs.description)
      this.customFormInputs.description.value = "";
    if (this.customFormInputs.enableComments)
      this.customFormInputs.enableComments.checked = true;
    if (this.customFormInputs.isPrivate)
      this.customFormInputs.isPrivate.checked = false;
    this.resetNip71Metadata("custom");
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
    const metadata = {
      title: this.cloudflareTitleInput?.value?.trim() || "",
      description: this.cloudflareDescriptionInput?.value?.trim() || "",
      thumbnail: this.cloudflareThumbnailInput?.value?.trim() || "",
      magnet: this.cloudflareMagnetInput?.value?.trim() || "",
      ws: this.cloudflareWsInput?.value?.trim() || "",
      xs: this.cloudflareXsInput?.value?.trim() || "",
      enableComments: this.cloudflareEnableCommentsInput
        ? !!this.cloudflareEnableCommentsInput.checked
        : true,
    };

    const nip71Metadata = this.collectNip71Metadata("cloudflare");
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
        imeta: imetaList,
      };
    }

    try {
      await this.r2Service.uploadVideo({
        npub,
        file,
        metadata,
        settingsInput: this.collectCloudflareSettingsFormValues(),
        publishVideoNote: (payload, options) =>
          this.publishVideoNote ? this.publishVideoNote(payload, options) : null,
        onReset: () => this.resetCloudflareUploadForm(),
      });
    } catch (error) {
      console.error("[UploadModal] Cloudflare upload failed", error);
    }
  }

  destroy() {
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
