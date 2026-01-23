import {
  prepareStaticModal,
  openStaticModal,
  closeStaticModal,
} from "./staticModalAccessibility.js";
import logger from "../../utils/logger.js";
import {
  resolveVideoPointer,
  buildVideoAddressPointer,
} from "../../utils/videoPointer.js";

const DEFAULT_WIDTH = 640;
const DEFAULT_HEIGHT = 360;

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function escapeAttribute(value) {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function resolveDimension(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  return fallback;
}

export class EmbedVideoModal {
  constructor({
    removeTrackingScripts,
    container,
    document: doc,
    getShareUrl,
    callbacks = {},
  } = {}) {
    this.document = doc || document;
    this.container = container || this.document.getElementById("modalContainer") || this.document.body;
    this.removeTrackingScripts =
      typeof removeTrackingScripts === "function" ? removeTrackingScripts : () => {};
    this.getShareUrl = typeof getShareUrl === "function" ? getShareUrl : null;
    this.callbacks = {
      showSuccess: callbacks.showSuccess || (() => {}),
      showError: callbacks.showError || (() => {}),
    };

    this.modal = null;
    this.overlay = null;
    this.panel = null;
    this.closeButton = null;
    this.cancelButton = null;
    this.copyButton = null;
    this.sourceCdn = null;
    this.sourceP2p = null;
    this.widthInput = null;
    this.heightInput = null;
    this.snippetTextarea = null;
    this.statusText = null;
    this.statusTextDefault = "";

    this.activeVideo = null;
    this.bound = false;

    this.boundHandlers = {
      close: () => this.close(),
      copy: () => this.handleCopy(),
      update: () => this.updateSnippet(),
    };
  }

  async load() {
    if (this.modal) {
      return this.modal;
    }

    if (!this.container) {
      throw new Error("Modal container element not found.");
    }

    let modal = this.container.querySelector("#embedVideoModal");
    if (!modal) {
      const response = await fetch("components/embed-video-modal.html");
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const html = await response.text();
      const wrapper = this.document.createElement("div");
      wrapper.innerHTML = html;
      this.removeTrackingScripts(wrapper);
      this.container.appendChild(wrapper);
      modal = wrapper.querySelector("#embedVideoModal");
    }

    if (!modal) {
      throw new Error("Embed video modal markup missing after load.");
    }

    this.cacheElements(modal);
    prepareStaticModal({ root: modal, document: this.document });
    this.bindEvents();

    return this.modal;
  }

  cacheElements(modal) {
    this.modal = modal;
    this.overlay = modal.querySelector(".bv-modal-backdrop");
    this.panel = modal.querySelector(".modal-sheet") || modal;
    this.closeButton = modal.querySelector("#closeEmbedVideoModal");
    this.cancelButton = modal.querySelector("#cancelEmbedVideo");
    this.copyButton = modal.querySelector("#copyEmbedVideo");
    this.sourceCdn = modal.querySelector("#embedVideoSourceCdn");
    this.sourceP2p = modal.querySelector("#embedVideoSourceP2p");
    this.widthInput = modal.querySelector("#embedVideoWidth");
    this.heightInput = modal.querySelector("#embedVideoHeight");
    this.snippetTextarea = modal.querySelector("#embedVideoSnippet");
    this.statusText = modal.querySelector("#embedVideoStatus");
    this.statusTextDefault =
      (this.statusText?.textContent && this.statusText.textContent.trim()) || "";
  }

  bindEvents() {
    if (this.bound || !this.modal) {
      return;
    }

    const closeTargets = [this.closeButton, this.cancelButton, this.overlay];
    closeTargets.forEach((target) => {
      if (target) {
        target.addEventListener("click", this.boundHandlers.close);
      }
    });

    if (this.copyButton) {
      this.copyButton.addEventListener("click", this.boundHandlers.copy);
    }

    const updateTargets = [this.sourceCdn, this.sourceP2p];
    updateTargets.forEach((target) => {
      if (target) {
        target.addEventListener("change", this.boundHandlers.update);
      }
    });

    const dimensionTargets = [this.widthInput, this.heightInput];
    dimensionTargets.forEach((target) => {
      if (target) {
        target.addEventListener("input", this.boundHandlers.update);
      }
    });

    this.bound = true;
  }

  setVideo(video) {
    this.activeVideo = video && typeof video === "object" ? video : null;
    if (!this.activeVideo) {
      return;
    }

    const hasUrl = isNonEmptyString(this.activeVideo.url);
    const hasMagnet = isNonEmptyString(this.activeVideo.magnet);

    if (this.sourceCdn) {
      this.sourceCdn.disabled = !hasUrl;
    }
    if (this.sourceP2p) {
      this.sourceP2p.disabled = !hasMagnet;
    }

    const shouldPreferCdn = hasUrl || !hasMagnet;
    if (this.sourceCdn && this.sourceP2p) {
      if (shouldPreferCdn) {
        this.sourceCdn.checked = true;
        this.sourceP2p.checked = false;
      } else {
        this.sourceCdn.checked = false;
        this.sourceP2p.checked = true;
      }
    }

    this.setStatus(this.statusTextDefault);
  }

  getSelectedSource() {
    if (this.sourceP2p?.checked) {
      return "torrent";
    }
    if (this.sourceCdn?.checked) {
      return "url";
    }
    return "";
  }

  setStatus(message, tone = "default") {
    if (!this.statusText) {
      return;
    }

    const toneClassMap = {
      default: "text-muted",
      error: "text-status-danger-on",
    };

    const normalizedMessage =
      typeof message === "string" ? message.trim() : "";
    this.statusText.textContent =
      normalizedMessage || this.statusTextDefault || "";

    Object.values(toneClassMap).forEach((cls) => {
      this.statusText.classList.remove(cls);
    });

    const nextClass = toneClassMap[tone] || toneClassMap.default;
    this.statusText.classList.add(nextClass);
  }

  resolvePointerEncoding() {
    if (!this.activeVideo) {
      return { encodedPointer: "", error: "No video available to embed." };
    }

    const addressPointer = buildVideoAddressPointer(this.activeVideo, {
      logger: logger.user,
    });
    const addressSegments = addressPointer.split(":");
    const identifier =
      addressSegments.length > 2 ? addressSegments.slice(2).join(":") : "";
    const pointerInfo = resolveVideoPointer({
      kind: this.activeVideo.kind,
      pubkey: this.activeVideo.pubkey,
      dTag: identifier,
      fallbackEventId: this.activeVideo.id,
      relay:
        (isNonEmptyString(this.activeVideo.relay) &&
          this.activeVideo.relay.trim()) ||
        "",
    });

    if (!pointerInfo?.pointer?.length) {
      return {
        encodedPointer: "",
        error: "Unable to determine a pointer for this video.",
      };
    }

    const nip19 = window?.NostrTools?.nip19;
    if (!nip19?.naddrEncode || !nip19?.neventEncode) {
      return {
        encodedPointer: "",
        error: "NostrTools is unavailable for encoding this embed pointer.",
      };
    }

    const [pointerType, pointerValue, pointerRelay] = pointerInfo.pointer;
    const relays =
      typeof pointerRelay === "string" && pointerRelay.trim()
        ? [pointerRelay.trim()]
        : undefined;

    if (pointerType === "a") {
      const segments = typeof pointerValue === "string" ? pointerValue.split(":") : [];
      const kind = segments[0] ? Number(segments[0]) : NaN;
      const pubkey = segments[1] ? segments[1].trim() : "";
      const pointerIdentifier = segments.length > 2 ? segments.slice(2).join(":") : "";

      if (!Number.isFinite(kind) || !pubkey || !pointerIdentifier) {
        return {
          encodedPointer: "",
          error: "Unable to encode the address pointer for this video.",
        };
      }

      return {
        encodedPointer: nip19.naddrEncode({
          kind,
          pubkey,
          identifier: pointerIdentifier,
          relays,
        }),
        error: "",
      };
    }

    if (pointerType === "e") {
      const eventId = typeof pointerValue === "string" ? pointerValue.trim() : "";
      if (!eventId) {
        return {
          encodedPointer: "",
          error: "Unable to encode the event pointer for this video.",
        };
      }

      return {
        encodedPointer: nip19.neventEncode({
          id: eventId,
          relays,
        }),
        error: "",
      };
    }

    return {
      encodedPointer: "",
      error: "Unable to determine a pointer for this video.",
    };
  }

  buildEmbedUrl(source) {
    const { encodedPointer, error } = this.resolvePointerEncoding();
    if (error) {
      return { url: "", error };
    }

    try {
      const url = new URL(
        "/embed.html",
        this.document?.location?.origin || window.location.origin
      );
      url.searchParams.set("pointer", encodedPointer);
      if (isNonEmptyString(source)) {
        url.searchParams.set("playback", source);
      }
      return { url: url.toString(), error: "" };
    } catch (error) {
      logger.user.warn("Embed modal could not build embed URL.", error);
      return {
        url: "",
        error: "Unable to build the embed URL for this video.",
      };
    }
  }

  buildEmbedSnippet() {
    if (!this.activeVideo) {
      return { snippet: "", error: "No video available to embed." };
    }

    const source = this.getSelectedSource();
    const { url: embedUrl, error } = this.buildEmbedUrl(source);
    if (!embedUrl) {
      return { snippet: "", error };
    }

    const width = resolveDimension(this.widthInput?.value, DEFAULT_WIDTH);
    const height = resolveDimension(this.heightInput?.value, DEFAULT_HEIGHT);
    const title =
      (isNonEmptyString(this.activeVideo.title) && this.activeVideo.title.trim()) ||
      "Bitvid video";

    return {
      snippet: `<iframe src="${escapeAttribute(embedUrl)}" width="${width}" height="${height}" loading="lazy" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen title="${escapeAttribute(title)}"></iframe>`,
      error: "",
    };
  }

  updateSnippet() {
    if (!this.snippetTextarea) {
      return;
    }

    const { snippet, error } = this.buildEmbedSnippet();
    this.snippetTextarea.value = snippet;
    if (this.copyButton) {
      this.copyButton.disabled = !snippet;
    }
    if (error) {
      this.setStatus(error, "error");
    } else {
      this.setStatus(this.statusTextDefault);
    }
  }

  async handleCopy() {
    if (!this.snippetTextarea) {
      return;
    }

    const snippet = this.snippetTextarea.value;
    if (!snippet) {
      this.callbacks.showError("No embed snippet to copy.");
      return;
    }

    if (navigator?.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(snippet);
        this.callbacks.showSuccess("Embed code copied to clipboard!");
        return;
      } catch (error) {
        logger.user.warn("Embed modal clipboard write failed.", error);
      }
    }

    const textarea = this.snippetTextarea;
    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);

    let succeeded = false;
    try {
      succeeded = this.document.execCommand("copy");
    } catch (error) {
      logger.user.warn("Embed modal copy fallback failed.", error);
      succeeded = false;
    }

    if (succeeded) {
      this.callbacks.showSuccess("Embed code copied to clipboard!");
    } else {
      this.callbacks.showError("Unable to copy embed code. Please copy it manually.");
    }
  }

  async open({ video, triggerElement } = {}) {
    const modal = await this.load();
    if (!video || typeof video !== "object") {
      this.callbacks.showError("No video available to embed.");
      return;
    }

    this.setVideo(video);
    this.updateSnippet();

    openStaticModal(modal, { triggerElement, document: this.document });
  }

  close() {
    if (this.modal) {
      closeStaticModal(this.modal, { document: this.document });
    }
    this.activeVideo = null;
  }
}
