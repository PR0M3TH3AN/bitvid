import { extractMagnetHints } from "../../magnetShared.js";
import { normalizeAndAugmentMagnet } from "../../magnetUtils.js";
import { createModalAccessibility } from "./modalAccessibility.js";
import { Nip71FormManager } from "./nip71FormManager.js";

export class EditModal {
  constructor({
    removeTrackingScripts,
    setGlobalModalState,
    sanitizers = {},
    escapeHtml,
    showError,
    getMode,
    eventTarget,
    container,
  } = {}) {
    this.removeTrackingScripts =
      typeof removeTrackingScripts === "function" ? removeTrackingScripts : () => {};
    this.setGlobalModalState =
      typeof setGlobalModalState === "function" ? setGlobalModalState : () => {};
    this.escapeHtml = typeof escapeHtml === "function" ? escapeHtml : (value) => `${value ?? ""}`;
    this.showError = typeof showError === "function" ? showError : () => {};
    this.getMode =
      typeof getMode === "function"
        ? getMode
        : () => (this.activeVideo?.mode ?? "live");
    this.eventTarget = eventTarget instanceof EventTarget ? eventTarget : new EventTarget();
    this.container = container || null;

    this.sanitizers = {
      text:
        typeof sanitizers.text === "function"
          ? sanitizers.text
          : (value) => (typeof value === "string" ? value.trim() : ""),
      url:
        typeof sanitizers.url === "function"
          ? sanitizers.url
          : (value) => (typeof value === "string" ? value.trim() : ""),
      magnet:
        typeof sanitizers.magnet === "function"
          ? sanitizers.magnet
          : (value) => (typeof value === "string" ? value.trim() : ""),
      checkbox:
        typeof sanitizers.checkbox === "function"
          ? sanitizers.checkbox
          : (value) => !!value,
    };

    this.root = null;
    this.overlay = null;
    this.panel = null;
    this.form = null;
    this.closeButton = null;
    this.cancelButton = null;
    this.submitButton = null;
    this.fieldButtons = [];
    this.fields = {};
    this.visibility = {
      container: null,
      buttons: [],
    };
    this.modalAccessibility = null;

    this.activeVideo = null;
    this.isVisible = false;
    this.eventsBound = false;
    this.loadPromise = null;

    this.pendingSubmit = false;
    this.pendingSubmitVideo = null;

    this.nip71FormManager = new Nip71FormManager();
    this.nip71SectionKey = "edit";
    this.originalNip71Metadata = null;
    this.originalNip71MetadataJson = null;
  }

  addEventListener(type, listener, options) {
    this.eventTarget.addEventListener(type, listener, options);
  }

  removeEventListener(type, listener, options) {
    this.eventTarget.removeEventListener(type, listener, options);
  }

  emit(type, detail) {
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

      let modal = targetContainer.querySelector("#editVideoModal");
      if (!modal) {
        const response = await fetch("components/edit-video-modal.html");
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const html = await response.text();
        const wrapper = document.createElement("div");
        wrapper.innerHTML = html;
        this.removeTrackingScripts(wrapper);
        targetContainer.appendChild(wrapper);
        modal = wrapper.querySelector("#editVideoModal");
      }

      if (!modal) {
        throw new Error("Edit video modal markup missing after load.");
      }

      this.container = targetContainer;
      this.root = modal;

      this.cacheElements(modal);
      this.setupModalAccessibility();
      if (!this.eventsBound) {
        this.bindEvents();
        this.eventsBound = true;
      }
      this.reset();

      return this.root;
    })();

    try {
      return await this.loadPromise;
    } finally {
      this.loadPromise = null;
    }
  }

  cacheElements(context) {
    this.overlay =
      context.querySelector("#editVideoModalOverlay") ||
      context.querySelector(".bv-modal-backdrop") ||
      null;
    this.panel = context.querySelector(".bv-modal__panel") || null;
    this.form = context.querySelector("#editVideoForm") || null;
    this.closeButton = context.querySelector("#closeEditVideoModal") || null;
    this.cancelButton = context.querySelector("#cancelEditVideo") || null;
    this.submitButton = context.querySelector("#submitEditVideo") || null;

    this.updateSubmitButtonState();

    this.fieldButtons = Array.from(context.querySelectorAll("[data-edit-target]"));

    this.fields = {
      title: context.querySelector("#editVideoTitle") || null,
      url: context.querySelector("#editVideoUrl") || null,
      magnet: context.querySelector("#editVideoMagnet") || null,
      ws: context.querySelector("#editVideoWs") || null,
      xs: context.querySelector("#editVideoXs") || null,
      thumbnail: context.querySelector("#editVideoThumbnail") || null,
      description: context.querySelector("#editVideoDescription") || null,
      isPrivate: context.querySelector("#editVideoIsPrivate") || null,
      enableComments: context.querySelector("#editEnableComments") || null,
      isNsfw: context.querySelector("#editVideoIsNsfw") || null,
      isForKids: context.querySelector("#editVideoIsForKids") || null,
    };

    this.visibility = {
      container: context.querySelector("[data-visibility-toggle]") || null,
      buttons: Array.from(
        context.querySelectorAll("[data-visibility-option]") || []
      ),
      helper: context.querySelector("[data-visibility-helper]") || null,
      helperDefault: "",
    };

    if (this.visibility.helper) {
      this.visibility.helperDefault = this.visibility.helper.textContent || "";
    }

    const nip71Context = this.form || context;
    this.nip71FormManager.registerSection(this.nip71SectionKey, nip71Context);
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
      panel: this.panel || this.root,
      backdrop: this.overlay || this.root,
      onRequestClose: () => this.close({ emitCancel: true }),
    });
  }

  bindEvents() {
    if (this.form) {
      this.form.addEventListener("submit", (event) => {
        event.preventDefault();
        this.submit();
      });
    }

    const cancelHandler = (event) => {
      event?.preventDefault?.();
      this.close({ emitCancel: true });
    };

    if (this.overlay) {
      this.overlay.addEventListener("click", cancelHandler);
    }

    if (this.closeButton) {
      this.closeButton.addEventListener("click", cancelHandler);
    }

    if (this.cancelButton) {
      this.cancelButton.addEventListener("click", cancelHandler);
    }

    if (Array.isArray(this.fieldButtons)) {
      this.fieldButtons.forEach((button) => {
        if (!button || button.dataset.editListenerAttached === "true") {
          return;
        }
        button.addEventListener("click", (event) => {
          this.handleEditFieldToggle(event);
        });
        button.dataset.editListenerAttached = "true";
      });
    }

    if (Array.isArray(this.visibility?.buttons)) {
      this.visibility.buttons.forEach((button) => {
        button.addEventListener("click", (event) => {
          const option = event?.currentTarget?.dataset?.visibilityOption;
          if (!option) {
            return;
          }
          this.setVisibility(option);
        });
      });
    }

    if (this.fields.isPrivate) {
      this.fields.isPrivate.addEventListener("change", () => {
        this.handleIsPrivateChange({ emit: true });
      });
    }

    if (this.fields.enableComments) {
      this.fields.enableComments.addEventListener("change", (event) => {
        const target = event.currentTarget;
        const value = this.sanitizers.checkbox(target?.checked);
        const detail = {
          field: "enableComments",
          value,
          videoId: this.escapeHtml(this.activeVideo?.id || ""),
        };
        this.emit("video:edit-visibility-change", detail);
      });
    }

    if (this.fields.isNsfw && this.fields.isForKids) {
      this.setupMutuallyExclusiveCheckboxes(
        this.fields.isNsfw,
        this.fields.isForKids
      );
    }

    this.nip71FormManager.bindSection(this.nip71SectionKey);
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
  }

  sanitizeAudienceFlags(flags = {}) {
    const isNsfw = flags?.isNsfw === true;
    const isForKids = flags?.isForKids === true && !isNsfw;
    return { isNsfw, isForKids };
  }

  normalizeMode(value) {
    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      if (normalized === "dev") {
        return "dev";
      }
    }
    return "live";
  }

  resolveModeForSubmit() {
    let candidate = null;
    if (typeof this.getMode === "function") {
      try {
        candidate = this.getMode({ video: this.activeVideo });
      } catch (_error) {
        candidate = null;
      }
    }

    if (typeof candidate === "string" && candidate.trim()) {
      return this.normalizeMode(candidate);
    }

    if (this.activeVideo && typeof this.activeVideo.mode === "string") {
      return this.normalizeMode(this.activeVideo.mode);
    }

    return "live";
  }

  reset() {
    if (!this.root) {
      this.activeVideo = null;
      this.nip71FormManager.resetSection(this.nip71SectionKey);
      this.originalNip71Metadata = null;
      this.originalNip71MetadataJson = null;
      this.setSubmitState({ pending: false });
      return;
    }

    const inputs = Object.values(this.fields);
    inputs.forEach((input) => {
      if (!input) {
        return;
      }
      if (input.type === "checkbox") {
        const defaultAttr = input.dataset?.defaultChecked;
        const defaultChecked =
          defaultAttr === "true"
            ? true
            : defaultAttr === "false"
            ? false
            : input.defaultChecked;
        input.checked = defaultChecked;
        input.disabled = false;
        input.removeAttribute("disabled");
        delete input.dataset.isEditing;
        delete input.dataset.state;
      } else {
        input.value = "";
        input.readOnly = false;
        input.removeAttribute("readonly");
        delete input.dataset.isEditing;
        delete input.dataset.state;
      }
      delete input.dataset.originalValue;
    });

    if (Array.isArray(this.fieldButtons)) {
      this.fieldButtons.forEach((button) => {
        button.classList.add("hidden");
        button.dataset.mode = "locked";
        button.textContent = "Edit field";
      });
    }

    this.handleIsPrivateChange({ emit: false });

    this.nip71FormManager.resetSection(this.nip71SectionKey);
    this.originalNip71Metadata = null;
    this.originalNip71MetadataJson = null;
    this.activeVideo = null;
    this.setSubmitState({ pending: false });
  }

  async open(video, { triggerElement } = {}) {
    await this.load();

    if (!video) {
      throw new Error("No video provided for editing.");
    }

    this.reset();

    const magnetSource = video.magnet || video.rawMagnet || "";
    const magnetHints = extractMagnetHints(magnetSource);
    const effectiveWs = video.ws || magnetHints.ws || "";
    const effectiveXs = video.xs || magnetHints.xs || "";
    const enableCommentsValue =
      typeof video.enableComments === "boolean" ? video.enableComments : true;
    const isPrivateValue = video.isPrivate === true;
    const rawIsNsfw = typeof video.isNsfw === "boolean" ? video.isNsfw : false;
    const rawIsForKids =
      typeof video.isForKids === "boolean" ? video.isForKids : false;
    const { isNsfw: isNsfwValue, isForKids: isForKidsValue } =
      this.sanitizeAudienceFlags({
        isNsfw: rawIsNsfw,
        isForKids: rawIsForKids,
      });

    const editContext = {
      ...video,
      ws: effectiveWs,
      xs: effectiveXs,
      enableComments: enableCommentsValue,
      isPrivate: isPrivateValue,
      isNsfw: isNsfwValue,
      isForKids: isForKidsValue,
    };

    this.applyVideoToForm(editContext);
    this.nip71FormManager.resetSection(this.nip71SectionKey);

    let nip71Data = video.nip71 && typeof video.nip71 === "object" ? { ...video.nip71 } : {};

    // Backfill published_at if missing, using the original root creation time
    if (
      !nip71Data.publishedAt &&
      !nip71Data.published_at &&
      !nip71Data["published-at"]
    ) {
      const rootCreated = video.rootCreatedAt || video.created_at;
      if (rootCreated) {
        nip71Data.publishedAt = rootCreated;
      }
    }

    // Format publishedAt for datetime-local input (YYYY-MM-DDThh:mm)
    const rawPublishedAt =
      nip71Data.publishedAt || nip71Data.published_at || nip71Data["published-at"];
    if (rawPublishedAt) {
      const numeric = Number(rawPublishedAt);
      if (Number.isFinite(numeric)) {
        const dt = new Date(numeric * 1000);
        const pad = (n) => String(n).padStart(2, "0");
        const formatted = `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(
          dt.getDate()
        )}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
        nip71Data.publishedAt = formatted;
      }
    }

    this.nip71FormManager.hydrateSection(this.nip71SectionKey, nip71Data);

    const initialNip71 = this.nip71FormManager.collectSection(this.nip71SectionKey);
    this.originalNip71Metadata = this.cloneNip71Metadata(initialNip71);
    this.originalNip71MetadataJson = JSON.stringify(this.originalNip71Metadata);
    this.activeVideo = editContext;

    if (this.root) {
      const wasHidden = this.root.classList.contains("hidden");
      if (wasHidden) {
        this.root.classList.remove("hidden");
        this.root.setAttribute("aria-hidden", "false");
        this.setGlobalModalState("editVideo", true);
        const focusTarget =
          this.form?.querySelector("[data-initial-focus]") ||
          this.panel ||
          this.root;
        window.requestAnimationFrame(() => {
          if (typeof focusTarget?.focus === "function") {
            focusTarget.focus();
          }
        });
      }
      this.isVisible = true;
      this.modalAccessibility?.activate({ triggerElement });
    }

    return true;
  }

  applyVideoToForm(editContext) {
    if (!editContext) {
      return;
    }

    const sanitizedFlags = this.sanitizeAudienceFlags({
      isNsfw: editContext.isNsfw,
      isForKids: editContext.isForKids,
    });
    editContext.isNsfw = sanitizedFlags.isNsfw;
    editContext.isForKids = sanitizedFlags.isForKids;

    const fieldMap = {
      title: editContext.title || "",
      url: editContext.url || "",
      magnet: editContext.magnet || "",
      ws: editContext.ws || "",
      xs: editContext.xs || "",
      thumbnail: editContext.thumbnail || "",
      description: editContext.description || "",
      isPrivate: editContext.isPrivate,
      enableComments: editContext.enableComments,
      isNsfw: editContext.isNsfw,
      isForKids: editContext.isForKids,
    };

    Object.entries(fieldMap).forEach(([key, rawValue]) => {
      const input = this.fields[key];
      const targetId = this.fieldIdForKey(key);
      const button = this.fieldButtons.find(
        (item) => item?.dataset?.editTarget === targetId
      );

      if (!input) {
        if (button) {
          button.classList.add("hidden");
          button.dataset.mode = "locked";
          button.textContent = "Edit field";
        }
        return;
      }

      if (targetId) {
        input.id = targetId;
      }

      const isCheckbox = input.type === "checkbox";
      if (isCheckbox) {
        const hasValue = rawValue !== undefined;
        const boolValue = rawValue === true;
        input.checked = boolValue;
        input.disabled = hasValue;
        if (hasValue) {
          input.setAttribute("disabled", "disabled");
        } else {
          input.removeAttribute("disabled");
        }
        input.dataset.originalValue = boolValue ? "true" : "false";
        input.dataset.isEditing = hasValue ? "false" : "true";
        if (button) {
          if (hasValue) {
            button.classList.remove("hidden");
            button.dataset.mode = "locked";
            button.textContent = "Edit field";
          } else {
            button.classList.add("hidden");
            button.dataset.mode = "locked";
            button.textContent = "Edit field";
          }
        }
        return;
      }

      const value = typeof rawValue === "string" ? rawValue : "";
      const hasValue = value.trim().length > 0;

      input.value = value;
      input.dataset.originalValue = value;
      input.dataset.isEditing = hasValue ? "false" : "true";
      if (hasValue) {
        input.readOnly = true;
        input.setAttribute("readonly", "readonly");
        input.dataset.state = "locked";
      } else {
        input.readOnly = false;
        input.removeAttribute("readonly");
        delete input.dataset.state;
      }

      if (button) {
        if (hasValue) {
          button.classList.remove("hidden");
          button.dataset.mode = "locked";
          button.textContent = "Edit field";
        } else {
          button.classList.add("hidden");
          button.dataset.mode = "locked";
          button.textContent = "Edit field";
        }
      }
    });

    this.handleIsPrivateChange({ emit: false });
  }

  fieldIdForKey(key) {
    switch (key) {
      case "title":
        return "editVideoTitle";
      case "url":
        return "editVideoUrl";
      case "magnet":
        return "editVideoMagnet";
      case "ws":
        return "editVideoWs";
      case "xs":
        return "editVideoXs";
      case "thumbnail":
        return "editVideoThumbnail";
      case "description":
        return "editVideoDescription";
      case "isPrivate":
        return "editVideoIsPrivate";
      case "enableComments":
        return "editEnableComments";
      case "isNsfw":
        return "editVideoIsNsfw";
      case "isForKids":
        return "editVideoIsForKids";
      default:
        return null;
    }
  }

  close({ emitCancel = false } = {}) {
    if (this.root) {
      this.root.classList.add("hidden");
      this.root.setAttribute("aria-hidden", "true");
    }
    this.isVisible = false;
    this.modalAccessibility?.deactivate();
    this.setGlobalModalState("editVideo", false);
    const cancelledVideo = this.activeVideo;
    this.reset();

    if (emitCancel) {
      this.emit("video:edit-cancel", {
        videoId: this.escapeHtml(cancelledVideo?.id || ""),
        pubkey: this.escapeHtml(cancelledVideo?.pubkey || ""),
      });
    }
  }

  handleEditFieldToggle(event) {
    const button = event?.currentTarget;
    if (!button) {
      return;
    }

    const targetId = button.dataset?.editTarget;
    if (!targetId) {
      return;
    }

    const input = this.root?.querySelector(`#${targetId}`);
    if (!input) {
      return;
    }

    const isCheckbox = input.type === "checkbox";
    const isLocked = isCheckbox
      ? input.disabled === true
      : input.readOnly === true;

    if (isLocked) {
      if (isCheckbox) {
        input.disabled = false;
        input.removeAttribute("disabled");
        input.dataset.isEditing = "true";
        delete input.dataset.state;
      } else {
        input.disabled = false;
        input.readOnly = false;
        input.removeAttribute("readonly");
        delete input.dataset.state;
        input.dataset.isEditing = "true";
      }
      button.dataset.mode = "editing";
      button.textContent = "Restore original";
      if (!isCheckbox && typeof input.focus === "function") {
        input.focus();
        if (typeof input.setSelectionRange === "function") {
          const length = input.value.length;
          try {
            input.setSelectionRange(length, length);
          } catch (error) {
            // Ignore selection errors (e.g. unsupported input types)
          }
        }
      }
      if (input === this.fields.isPrivate) {
        this.updateVisibilityToggleUI();
      }
      return;
    }

    const originalValue = input.dataset?.originalValue || "";

    if (isCheckbox) {
      input.checked = originalValue === "true";
      input.disabled = true;
      input.setAttribute("disabled", "disabled");
      input.dataset.isEditing = "false";
      button.dataset.mode = "locked";
      button.textContent = "Edit field";
      if (input === this.fields.isPrivate) {
        this.updateVisibilityToggleUI();
      }
      return;
    }

    input.value = originalValue;

    if (originalValue) {
      input.readOnly = true;
      input.setAttribute("readonly", "readonly");
      input.dataset.state = "locked";
      input.dataset.isEditing = "false";
      button.dataset.mode = "locked";
      button.textContent = "Edit field";
    } else {
      input.readOnly = false;
      input.removeAttribute("readonly");
      delete input.dataset.state;
      input.dataset.isEditing = "true";
      button.classList.add("hidden");
      button.dataset.mode = "locked";
      button.textContent = "Edit field";
    }
  }

  setVisibility(option, { emit = true } = {}) {
    const checkbox = this.fields.isPrivate;
    if (!checkbox) {
      return;
    }

    const normalized = typeof option === "string" ? option.toLowerCase() : "";
    if (normalized !== "public" && normalized !== "private") {
      return;
    }

    if (checkbox.disabled) {
      this.updateVisibilityToggleUI();
      return;
    }

    const wantPrivate = normalized === "private";
    if (checkbox.checked === wantPrivate) {
      this.updateVisibilityToggleUI();
      return;
    }

    checkbox.checked = wantPrivate;
    this.handleIsPrivateChange({ emit });
  }

  updateVisibilityToggleUI() {
    const checkbox = this.fields.isPrivate;
    const buttons = Array.isArray(this.visibility?.buttons)
      ? this.visibility.buttons
      : [];
    if (!checkbox) {
      return;
    }

    const isPrivate = checkbox.checked === true;
    const disabled = checkbox.disabled === true;

    buttons.forEach((button) => {
      if (!button) {
        return;
      }
      const option = button.dataset?.visibilityOption || "";
      const normalized = option.toLowerCase();
      const isActive =
        (normalized === "private" && isPrivate) ||
        (normalized === "public" && !isPrivate);
      button.dataset.active = isActive ? "true" : "false";
      button.setAttribute("aria-pressed", isActive ? "true" : "false");
      if (disabled) {
        button.classList.add("is-disabled");
        button.setAttribute("aria-disabled", "true");
        button.tabIndex = -1;
      } else {
        button.classList.remove("is-disabled");
        button.removeAttribute("aria-disabled");
        button.tabIndex = 0;
      }
    });

    if (this.visibility?.container) {
      this.visibility.container.dataset.state = isPrivate ? "private" : "public";
      if (disabled) {
        this.visibility.container.dataset.disabled = "true";
      } else {
        delete this.visibility.container.dataset.disabled;
      }
    }

    const helper = this.visibility?.helper;
    if (helper) {
      const privateCopy = this.visibility.helperDefault || helper.textContent;
      const publicCopy =
        "Public notes appear in feeds for everyone who can view your channel.";
      helper.textContent = isPrivate ? privateCopy : publicCopy;
    }
  }

  handleIsPrivateChange({ emit = true } = {}) {
    const checkbox = this.fields.isPrivate;
    if (!checkbox) {
      return;
    }

    this.updateVisibilityToggleUI();

    if (!emit) {
      return;
    }

    const value = this.sanitizers.checkbox(checkbox.checked);
    const detail = {
      field: "isPrivate",
      value,
      videoId: this.escapeHtml(this.activeVideo?.id || ""),
    };
    this.emit("video:edit-visibility-change", detail);
  }

  cloneNip71Metadata(metadata) {
    if (metadata == null) {
      return null;
    }
    try {
      return JSON.parse(JSON.stringify(metadata));
    } catch (error) {
      return metadata;
    }
  }

  submit() {
    if (this.pendingSubmit) {
      return;
    }

    const contextVideo = this.activeVideo || this.pendingSubmitVideo || null;

    if (!contextVideo || !this.root) {
      if (this.isVisible) {
        this.showError("No video selected for editing.");
      }
      return;
    }

    this.setSubmitState({ pending: true, video: contextVideo });

    const fieldValue = (key) => {
      const input = this.fields[key];
      if (!input || typeof input.value !== "string") {
        return "";
      }
      if (key === "url" || key === "ws" || key === "xs") {
        return this.sanitizers.url(input.value);
      }
      if (key === "magnet") {
        return this.sanitizers.magnet(input.value);
      }
      return this.sanitizers.text(input.value);
    };

    const original = this.pendingSubmitVideo || this.activeVideo;

    const titleInput = this.fields.title;
    const urlInput = this.fields.url;
    const magnetInput = this.fields.magnet;
    const wsInput = this.fields.ws;
    const xsInput = this.fields.xs;
    const thumbnailInput = this.fields.thumbnail;
    const descriptionInput = this.fields.description;
    const commentsInput = this.fields.enableComments;
    const privateInput = this.fields.isPrivate;
    const nsfwInput = this.fields.isNsfw;
    const forKidsInput = this.fields.isForKids;

    const newTitle = fieldValue("title");
    const newUrl = fieldValue("url");
    const newMagnet = fieldValue("magnet");
    const newWs = fieldValue("ws");
    const newXs = fieldValue("xs");
    const newThumbnail = fieldValue("thumbnail");
    const newDescription = fieldValue("description");

    const isEditing = (input) => {
      if (!input) {
        return true;
      }
      if (input.dataset?.isEditing === "true") {
        return true;
      }
      if (input.type === "checkbox") {
        return input.disabled === false;
      }
      return input.readOnly === false;
    };

    const titleWasEdited = isEditing(titleInput);
    const urlWasEdited = isEditing(urlInput);
    const magnetWasEdited = isEditing(magnetInput);

    const finalTitle = titleWasEdited ? newTitle : original.title || "";
    const finalUrl = urlWasEdited ? newUrl : original.url || "";
    const originalMagnetValue =
      typeof original.magnet === "string" ? original.magnet.trim() : "";
    const originalWsValue =
      typeof original.ws === "string" ? original.ws.trim() : "";
    const originalXsValue =
      typeof original.xs === "string" ? original.xs.trim() : "";

    const wsWasManuallyEdited = wsInput ? wsInput.readOnly === false : false;
    const xsWasManuallyEdited = xsInput ? xsInput.readOnly === false : false;

    let finalMagnet = magnetWasEdited ? newMagnet : originalMagnetValue;
    let finalWs = wsWasManuallyEdited ? newWs : originalWsValue;
    let finalXs = xsWasManuallyEdited ? newXs : originalXsValue;

    if (magnetWasEdited) {
      const magnetHintCandidates = extractMagnetHints(finalMagnet);
      if (!wsWasManuallyEdited) {
        finalWs = magnetHintCandidates.ws || "";
      }
      if (!xsWasManuallyEdited) {
        finalXs = magnetHintCandidates.xs || "";
      }
    }
    const finalThumbnail = isEditing(thumbnailInput)
      ? newThumbnail
      : original.thumbnail || "";
    const finalDescription = isEditing(descriptionInput)
      ? newDescription
      : original.description || "";
    const originalEnableComments =
      typeof original.enableComments === "boolean" ? original.enableComments : true;
    const originalIsPrivate = original.isPrivate === true;
    const originalIsNsfw = original.isNsfw === true;
    const originalIsForKids = original.isForKids === true;

    const rawNip71 = this.nip71FormManager.collectSection(this.nip71SectionKey);
    const currentNip71 = this.cloneNip71Metadata(rawNip71);

    // Convert publishedAt back to Unix timestamp (seconds)
    if (currentNip71 && typeof currentNip71.publishedAt === "string") {
      const dateStr = currentNip71.publishedAt;
      if (dateStr) {
        const dt = new Date(dateStr);
        if (!isNaN(dt.getTime())) {
          currentNip71.publishedAt = Math.floor(dt.getTime() / 1000);
        } else {
          delete currentNip71.publishedAt;
        }
      } else {
        delete currentNip71.publishedAt;
      }
    }
    const hasImetaSource = Array.isArray(currentNip71?.imeta)
      ? currentNip71.imeta.some((variant) => {
          if (!variant || typeof variant !== "object") {
            return false;
          }
          const hasUrl = typeof variant.url === "string" && variant.url.trim();
          const hasMagnet = typeof variant.x === "string" && variant.x.trim();
          return Boolean(hasUrl || hasMagnet);
        })
      : false;

    let finalEnableComments = originalEnableComments;
    if (commentsInput) {
      if (commentsInput.disabled) {
        finalEnableComments = commentsInput.dataset.originalValue === "true";
      } else {
        finalEnableComments = this.sanitizers.checkbox(commentsInput.checked);
      }
    }

    let finalIsPrivate = originalIsPrivate;
    if (privateInput) {
      if (privateInput.disabled) {
        finalIsPrivate = privateInput.dataset.originalValue === "true";
      } else {
        finalIsPrivate = this.sanitizers.checkbox(privateInput.checked);
      }
    }

    let finalIsNsfw = originalIsNsfw;
    if (nsfwInput) {
      if (nsfwInput.disabled) {
        finalIsNsfw = nsfwInput.dataset.originalValue === "true";
      } else {
        finalIsNsfw = this.sanitizers.checkbox(nsfwInput.checked);
      }
    }

    let finalIsForKids = originalIsForKids;
    if (forKidsInput) {
      if (forKidsInput.disabled) {
        finalIsForKids = forKidsInput.dataset.originalValue === "true";
      } else {
        finalIsForKids = this.sanitizers.checkbox(forKidsInput.checked);
      }
    }

    ({ isNsfw: finalIsNsfw, isForKids: finalIsForKids } =
      this.sanitizeAudienceFlags({
        isNsfw: finalIsNsfw,
        isForKids: finalIsForKids,
      }));

    if (!finalTitle || (!finalUrl && !finalMagnet && !hasImetaSource)) {
      this.showError(
        "Title and at least one of URL, Magnet, or a NIP-71 media variant is required."
      );
      return;
    }

    if (finalUrl && !/^https:\/\//i.test(finalUrl)) {
      this.showError("Hosted video URLs must use HTTPS.");
      return;
    }

    if (finalMagnet) {
      const result = normalizeAndAugmentMagnet(finalMagnet, {
        webSeed: finalWs,
        xs: finalXs,
      });
      finalMagnet = result.magnet;
      const hints = extractMagnetHints(finalMagnet);
      finalWs = hints.ws;
      finalXs = hints.xs;
    } else {
      finalWs = "";
      finalXs = "";
    }

    const magnetChanged = magnetWasEdited && finalMagnet !== originalMagnetValue;
    const wsEditedFlag = wsWasManuallyEdited || magnetChanged;
    const xsEditedFlag = xsWasManuallyEdited || magnetChanged;

    const updatedData = {
      version: original.version || 2,
      title: finalTitle,
      magnet: finalMagnet,
      url: finalUrl,
      thumbnail: finalThumbnail,
      description: finalDescription,
      mode: this.resolveModeForSubmit(),
      ws: finalWs,
      xs: finalXs,
      wsEdited: wsEditedFlag,
      xsEdited: xsEditedFlag,
      urlEdited: urlWasEdited,
      magnetEdited: magnetWasEdited,
      enableComments: finalEnableComments,
      isPrivate: finalIsPrivate,
      isNsfw: finalIsNsfw,
      isForKids: finalIsForKids,
    };

    const currentNip71Json = JSON.stringify(currentNip71);
    const nip71Edited = currentNip71Json !== this.originalNip71MetadataJson;
    updatedData.nip71 = currentNip71;
    updatedData.nip71Edited = nip71Edited;

    const originalEvent = {
      id: this.sanitizers.text(original.id || ""),
      pubkey: this.sanitizers.text(original.pubkey || ""),
      videoRootId: this.sanitizers.text(original.videoRootId || ""),
    };

    this.emit("video:edit-submit", {
      originalEvent,
      updatedData,
      video: { ...original },
    });
  }

  setSubmitState({ pending = false, video } = {}) {
    const nextPending = Boolean(pending);
    if (nextPending) {
      this.pendingSubmitVideo = video || this.activeVideo || this.pendingSubmitVideo;
    } else {
      this.pendingSubmitVideo = null;
    }

    this.pendingSubmit = nextPending;
    this.updateSubmitButtonState();
  }

  updateSubmitButtonState() {
    if (!this.submitButton) {
      return;
    }

    if (this.pendingSubmit) {
      this.submitButton.disabled = true;
      this.submitButton.setAttribute("disabled", "disabled");
    } else {
      this.submitButton.disabled = false;
      this.submitButton.removeAttribute("disabled");
    }
  }

  destroy() {
    if (this.modalAccessibility?.destroy) {
      this.modalAccessibility.destroy();
    }
    this.modalAccessibility = null;
  }
}
