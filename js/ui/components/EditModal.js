import { extractMagnetHints, normalizeAndAugmentMagnet } from "../../magnet.js";

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
    this.getMode = typeof getMode === "function" ? getMode : () => "live";
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

    this.activeVideo = null;
    this.isVisible = false;
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
    this.bindEvents();
    this.reset();

    return this.root;
  }

  cacheElements(context) {
    this.overlay = context.querySelector("#editVideoModalOverlay") || null;
    this.form = context.querySelector("#editVideoForm") || null;
    this.closeButton = context.querySelector("#closeEditVideoModal") || null;
    this.cancelButton = context.querySelector("#cancelEditVideo") || null;
    this.submitButton = context.querySelector("#submitEditVideo") || null;

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
        button.addEventListener("click", (event) => {
          this.handleEditFieldToggle(event);
        });
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
  }

  reset() {
    if (!this.root) {
      this.activeVideo = null;
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
      } else {
        input.value = "";
        input.readOnly = false;
        input.classList.remove("locked-input");
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

    this.activeVideo = null;
  }

  async open(video) {
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

    const editContext = {
      ...video,
      ws: effectiveWs,
      xs: effectiveXs,
      enableComments: enableCommentsValue,
      isPrivate: isPrivateValue,
    };

    this.applyVideoToForm(editContext);
    this.activeVideo = editContext;

    if (this.root) {
      this.root.classList.remove("hidden");
      this.isVisible = true;
      this.setGlobalModalState("editVideo", true);
    }

    return true;
  }

  applyVideoToForm(editContext) {
    if (!editContext) {
      return;
    }

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
        input.dataset.originalValue = boolValue ? "true" : "false";
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
      if (hasValue) {
        input.readOnly = true;
        input.classList.add("locked-input");
      } else {
        input.readOnly = false;
        input.classList.remove("locked-input");
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
      default:
        return null;
    }
  }

  close({ emitCancel = false } = {}) {
    if (this.root) {
      this.root.classList.add("hidden");
    }
    this.isVisible = false;
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

    const mode = button.dataset.mode || "locked";
    const isCheckbox = input.type === "checkbox";

    if (mode === "locked") {
      if (isCheckbox) {
        input.disabled = false;
      } else {
        input.readOnly = false;
        input.classList.remove("locked-input");
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
      input.classList.add("locked-input");
      button.dataset.mode = "locked";
      button.textContent = "Edit field";
    } else {
      input.readOnly = false;
      input.classList.remove("locked-input");
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

  submit() {
    if (!this.activeVideo || !this.root) {
      this.showError("No video selected for editing.");
      return;
    }

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

    const original = this.activeVideo;

    const titleInput = this.fields.title;
    const urlInput = this.fields.url;
    const magnetInput = this.fields.magnet;
    const wsInput = this.fields.ws;
    const xsInput = this.fields.xs;
    const thumbnailInput = this.fields.thumbnail;
    const descriptionInput = this.fields.description;
    const commentsInput = this.fields.enableComments;
    const privateInput = this.fields.isPrivate;

    const newTitle = fieldValue("title");
    const newUrl = fieldValue("url");
    const newMagnet = fieldValue("magnet");
    const newWs = fieldValue("ws");
    const newXs = fieldValue("xs");
    const newThumbnail = fieldValue("thumbnail");
    const newDescription = fieldValue("description");

    const isEditing = (input) => !input || input.readOnly === false;

    const titleWasEdited = isEditing(titleInput);
    const urlWasEdited = isEditing(urlInput);
    const magnetWasEdited = isEditing(magnetInput);

    const finalTitle = titleWasEdited ? newTitle : original.title || "";
    const finalUrl = urlWasEdited ? newUrl : original.url || "";
    const shouldUseOriginalWs = wsInput ? wsInput.readOnly !== false : true;
    const shouldUseOriginalXs = xsInput ? xsInput.readOnly !== false : true;
    let finalWs = shouldUseOriginalWs ? original.ws || "" : newWs;
    let finalXs = shouldUseOriginalXs ? original.xs || "" : newXs;
    let finalMagnet = magnetWasEdited ? newMagnet : original.magnet || "";
    const finalThumbnail = isEditing(thumbnailInput)
      ? newThumbnail
      : original.thumbnail || "";
    const finalDescription = isEditing(descriptionInput)
      ? newDescription
      : original.description || "";
    const originalEnableComments =
      typeof original.enableComments === "boolean" ? original.enableComments : true;
    const originalIsPrivate = original.isPrivate === true;

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

    if (!finalTitle || (!finalUrl && !finalMagnet)) {
      this.showError("Title and at least one of URL or Magnet is required.");
      return;
    }

    if (finalUrl && !/^https:\/\//i.test(finalUrl)) {
      this.showError("Hosted video URLs must use HTTPS.");
      return;
    }

    if (finalMagnet) {
      const normalizedMagnet = normalizeAndAugmentMagnet(finalMagnet, {
        ws: finalWs,
        xs: finalXs,
      });
      finalMagnet = normalizedMagnet;
      const hints = extractMagnetHints(normalizedMagnet);
      finalWs = hints.ws;
      finalXs = hints.xs;
    } else {
      finalWs = "";
      finalXs = "";
    }

    const updatedData = {
      version: original.version || 2,
      title: finalTitle,
      magnet: finalMagnet,
      url: finalUrl,
      thumbnail: finalThumbnail,
      description: finalDescription,
      mode: this.getMode(),
      ws: finalWs,
      xs: finalXs,
      wsEdited: !shouldUseOriginalWs,
      xsEdited: !shouldUseOriginalXs,
      urlEdited: urlWasEdited,
      magnetEdited: magnetWasEdited,
      enableComments: finalEnableComments,
      isPrivate: finalIsPrivate,
    };

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
}
