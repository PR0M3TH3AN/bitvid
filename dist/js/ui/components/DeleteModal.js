import { createModalAccessibility } from "./modalAccessibility.js";

function extractDTagValue(tags) {
  if (!Array.isArray(tags)) {
    return "";
  }
  for (const entry of tags) {
    if (!Array.isArray(entry) || entry.length < 2) {
      continue;
    }
    if (entry[0] === "d" && typeof entry[1] === "string") {
      return entry[1];
    }
  }
  return "";
}

export class DeleteModal {
  constructor({
    removeTrackingScripts,
    setGlobalModalState,
    truncateMiddle,
    eventTarget,
    container,
  } = {}) {
    this.removeTrackingScripts =
      typeof removeTrackingScripts === "function" ? removeTrackingScripts : () => {};
    this.setGlobalModalState =
      typeof setGlobalModalState === "function" ? setGlobalModalState : () => {};
    this.truncateMiddle =
      typeof truncateMiddle === "function" ? truncateMiddle : (value, maxLength = 48) => {
        if (typeof value !== "string") {
          return "";
        }
        if (value.length <= maxLength) {
          return value;
        }
        if (maxLength <= 1) {
          return value.slice(0, maxLength);
        }
        const ellipsis = "…";
        const charsToShow = maxLength - ellipsis.length;
        const front = Math.ceil(charsToShow / 2);
        const back = Math.floor(charsToShow / 2);
        return `${value.slice(0, front)}${ellipsis}${value.slice(value.length - back)}`;
      };
    this.eventTarget = eventTarget instanceof EventTarget ? eventTarget : new EventTarget();
    this.container = container || document.getElementById("modalContainer") || null;

    this.modal = null;
    this.overlay = null;
    this.modalPanel = null;
    this.title = null;
    this.subtitle = null;
    this.description = null;
    this.metadataList = null;
    this.confirmButton = null;
    this.cancelButton = null;
    this.closeButton = null;

    this.modalAccessibility = null;

    this.activeVideo = null;
    this.context = null;
    this.busy = false;
    this.bound = false;
    this.confirmDefaultLabel = "Delete all versions";

    this.boundHandlers = {
      confirm: (event) => this.handleConfirmClick(event),
      cancel: (event) => this.handleCancelInteraction(event),
      overlay: (event) => this.handleCancelInteraction(event),
    };
  }

  addEventListener(type, listener, options) {
    this.eventTarget.addEventListener(type, listener, options);
  }

  removeEventListener(type, listener, options) {
    this.eventTarget.removeEventListener(type, listener, options);
  }

  dispatch(type, detail) {
    this.eventTarget.dispatchEvent(
      new CustomEvent(type, {
        detail,
      })
    );
  }

  async load() {
    if (this.modal) {
      return this.modal;
    }

    const targetContainer = this.container || document.getElementById("modalContainer");
    if (!targetContainer) {
      throw new Error("Modal container element not found!");
    }

    let modal = targetContainer.querySelector("#deleteVideoModal");
    if (!modal) {
      const response = await fetch("components/delete-video-modal.html");
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const html = await response.text();
      const wrapper = document.createElement("div");
      wrapper.innerHTML = html;
      this.removeTrackingScripts(wrapper);
      targetContainer.appendChild(wrapper);
      modal = wrapper.querySelector("#deleteVideoModal");
    }

    if (!modal) {
      throw new Error("Delete video modal markup missing after load.");
    }

    this.cacheElements(modal);
    this.setupModalAccessibility();
    this.bindEvents();
    this.reset();

    return this.modal;
  }

  cacheElements(modal) {
    this.modal = modal;
    this.overlay = modal.querySelector("#deleteVideoModalOverlay") || null;
    this.modalPanel = modal.querySelector(".modal-sheet") || modal;
    this.title = modal.querySelector("#deleteModalTitle") || null;
    this.subtitle = modal.querySelector("#deleteModalSubtitle") || null;
    this.description = modal.querySelector("#deleteModalDescription") || null;
    this.metadataList = modal.querySelector("#deleteModalMetadata") || null;
    this.confirmButton = modal.querySelector("#confirmDeleteVideo") || null;
    this.cancelButton = modal.querySelector("#cancelDeleteVideo") || null;
    this.closeButton = modal.querySelector("#closeDeleteVideoModal") || null;

    if (this.confirmButton) {
      const text = this.confirmButton.textContent?.trim();
      if (text) {
        this.confirmDefaultLabel = text;
      }
    }
  }

  setupModalAccessibility() {
    if (!this.modal) {
      return;
    }

    this.modalAccessibility = createModalAccessibility({
      root: this.modal,
      panel: this.modalPanel || this.modal,
      backdrop: this.overlay,
      onRequestClose: () => this.handleCancelInteraction(),
    });
  }

  bindEvents() {
    if (this.bound || !this.modal) {
      return;
    }

    if (this.confirmButton) {
      this.confirmButton.addEventListener("click", this.boundHandlers.confirm);
    }
    if (this.cancelButton) {
      this.cancelButton.addEventListener("click", this.boundHandlers.cancel);
    }
    if (this.closeButton) {
      this.closeButton.addEventListener("click", this.boundHandlers.cancel);
    }
    if (this.overlay) {
      this.overlay.addEventListener("click", this.boundHandlers.overlay);
    }

    this.bound = true;
  }

  open(context = {}, { triggerElement } = {}) {
    if (!this.modal) {
      throw new Error("Delete modal has not been loaded.");
    }

    this.context = context || {};
    this.modal.classList.remove("hidden");
    this.modalAccessibility?.activate({ triggerElement });
    this.setGlobalModalState("deleteVideo", true);
    this.dispatch("video:delete-open", {
      context: this.context,
      video: this.activeVideo,
    });
  }

  close() {
    if (!this.modal) {
      return;
    }

    const detail = {
      context: this.context,
      video: this.activeVideo,
    };

    this.modal.classList.add("hidden");
    this.modalAccessibility?.deactivate();
    this.setGlobalModalState("deleteVideo", false);
    this.dispatch("video:delete-close", detail);
    this.reset();
  }

  setVideo(video) {
    this.activeVideo = video || null;

    if (!this.modal) {
      return;
    }

    const titleText =
      video && typeof video.title === "string" && video.title.trim().length
        ? `Delete “${video.title.trim()}”`
        : "Delete video";
    if (this.title) {
      this.title.textContent = titleText;
    }

    const rootId =
      video && typeof video.videoRootId === "string" && video.videoRootId.trim().length
        ? video.videoRootId.trim()
        : "";
    const dTagValue = extractDTagValue(video?.tags);

    if (this.subtitle) {
      const subtitleParts = [];
      if (rootId) {
        subtitleParts.push(`Root ${this.truncateMiddle(rootId, 48)}`);
      }
      if (dTagValue) {
        subtitleParts.push(`d=${this.truncateMiddle(dTagValue, 48)}`);
      }
      this.subtitle.textContent = subtitleParts.length
        ? `Marks ${subtitleParts.join(" • ")} as deleted across relays.`
        : "This action removes the note from every feed.";
    }

    if (this.description) {
      const hasTitle =
        video && typeof video.title === "string" && video.title.trim().length > 0;
      this.description.textContent = hasTitle
        ? `Deleting will mark every revision of “${video.title.trim()}” as deleted and hide it from viewers.`
        : "Deleting will mark every revision as deleted and hide it from viewers.";
    }

    this.renderMetadata(video, { rootId, dTagValue });
  }

  renderMetadata(video, { rootId, dTagValue } = {}) {
    if (!this.metadataList) {
      return;
    }

    const doc = this.metadataList.ownerDocument;
    this.metadataList.innerHTML = "";
    if (!doc) {
      return;
    }

    const entries = [];
    const scopeMessage = rootId
      ? "All revisions sharing this root will be tombstoned."
      : "All revisions linked to this note will be tombstoned.";
    entries.push({
      label: "Scope",
      value: scopeMessage,
      span: true,
    });

    if (rootId) {
      entries.push({
        label: "Video root",
        value: this.truncateMiddle(rootId, 60),
      });
    }

    if (dTagValue) {
      entries.push({
        label: "d tag",
        value: this.truncateMiddle(dTagValue, 60),
      });
    }

    const author =
      video && typeof video.pubkey === "string" && video.pubkey.trim().length
        ? video.pubkey.trim()
        : "";
    if (author) {
      entries.push({
        label: "Author",
        value: this.truncateMiddle(author, 60),
      });
    }

    const version = Number.isFinite(video?.version) ? video.version : null;
    if (version !== null) {
      entries.push({
        label: "Active version",
        value: `${version}`,
      });
    }

    const visibility = video?.isPrivate === true ? "Private" : "Public";
    entries.push({
      label: "Visibility",
      value: visibility,
    });

    for (const entry of entries) {
      const wrapper = doc.createElement("div");
      wrapper.className = entry.span === true ? "space-y-1 sm:col-span-2" : "space-y-1";

      const dt = doc.createElement("dt");
      dt.className = "text-2xs font-semibold uppercase tracking-wide text-muted-strong";
      dt.textContent = entry.label;

      const dd = doc.createElement("dd");
      dd.className = "text-xs text-muted";
      dd.textContent = entry.value;

      wrapper.appendChild(dt);
      wrapper.appendChild(dd);
      this.metadataList.appendChild(wrapper);
    }
  }

  setBusy(isBusy, label = "Deleting…") {
    this.busy = isBusy === true;
    if (this.confirmButton) {
      this.confirmButton.disabled = this.busy;
      if (this.busy) {
        this.confirmButton.textContent = label;
        this.confirmButton.dataset.state = "pending";
      } else {
        this.confirmButton.textContent = this.confirmDefaultLabel;
        this.confirmButton.dataset.state = "";
        delete this.confirmButton.dataset.state;
      }
    }
    if (this.cancelButton) {
      this.cancelButton.disabled = this.busy;
    }
    if (this.closeButton) {
      this.closeButton.disabled = this.busy;
    }
    if (this.modalPanel) {
      this.modalPanel.setAttribute("aria-busy", this.busy ? "true" : "false");
    }
  }

  handleConfirmClick(event) {
    if (event) {
      event.preventDefault();
    }
    if (this.busy) {
      return;
    }

    this.dispatch("video:delete-confirm", {
      video: this.activeVideo,
      context: this.context,
    });
  }

  handleCancelInteraction(event) {
    if (event) {
      event.preventDefault();
    }
    if (this.busy) {
      return;
    }

    this.dispatch("video:delete-cancel", {
      video: this.activeVideo,
      context: this.context,
    });
    this.close();
  }

  reset() {
    this.activeVideo = null;
    this.context = null;
    this.busy = false;

    if (this.confirmButton) {
      this.confirmButton.disabled = false;
      this.confirmButton.textContent = this.confirmDefaultLabel;
      delete this.confirmButton.dataset.state;
    }

    if (this.cancelButton) {
      this.cancelButton.disabled = false;
    }

    if (this.closeButton) {
      this.closeButton.disabled = false;
    }

    if (this.modalPanel) {
      this.modalPanel.setAttribute("aria-busy", "false");
    }

    if (this.subtitle) {
      this.subtitle.textContent = "This action removes the note from every feed.";
    }

    if (this.description) {
      this.description.textContent =
        "Are you sure you want to delete this video? Viewers will no longer see it in any grid.";
    }

    if (this.metadataList) {
      this.metadataList.innerHTML = "";
    }
  }

  destroy() {
    if (!this.modal) {
      return;
    }

    if (this.confirmButton) {
      this.confirmButton.removeEventListener("click", this.boundHandlers.confirm);
    }
    if (this.cancelButton) {
      this.cancelButton.removeEventListener("click", this.boundHandlers.cancel);
    }
    if (this.closeButton) {
      this.closeButton.removeEventListener("click", this.boundHandlers.cancel);
    }
    if (this.overlay) {
      this.overlay.removeEventListener("click", this.boundHandlers.overlay);
    }

    this.modalAccessibility?.destroy();
    this.modalAccessibility = null;
    this.bound = false;
    this.modal = null;
  }
}

export default DeleteModal;
