import { createModalAccessibility } from "./modalAccessibility.js";
import { DEFAULT_RELAY_URLS } from "../../nostr/toolkit.js";
import logger from "../../utils/logger.js";
import { relayManager } from "../../relayManager.js";

function normalizeRelayList(relays) {
  if (!Array.isArray(relays)) {
    return [];
  }
  const seen = new Set();
  return relays
    .map((relay) => (typeof relay === "string" ? relay.trim() : ""))
    .filter((relay) => relay)
    .filter((relay) => {
      if (seen.has(relay)) {
        return false;
      }
      seen.add(relay);
      return true;
    });
}

export class ShareNostrModal {
  constructor({
    removeTrackingScripts,
    setGlobalModalState,
    eventTarget,
    container,
    fallbackThumbnailSrc,
    onPost,
    onCancel,
  } = {}) {
    this.removeTrackingScripts =
      typeof removeTrackingScripts === "function" ? removeTrackingScripts : () => {};
    this.setGlobalModalState =
      typeof setGlobalModalState === "function" ? setGlobalModalState : () => {};
    this.eventTarget = eventTarget instanceof EventTarget ? eventTarget : new EventTarget();
    this.container = container || document.getElementById("modalContainer") || null;
    this.fallbackThumbnailSrc =
      typeof fallbackThumbnailSrc === "string" ? fallbackThumbnailSrc : "";
    this.onPost = typeof onPost === "function" ? onPost : null;
    this.onCancel = typeof onCancel === "function" ? onCancel : null;

    this.modal = null;
    this.overlay = null;
    this.modalPanel = null;
    this.textarea = null;
    this.previewUrl = null;
    this.previewThumbnail = null;
    this.previewFallback = null;
    this.previewTitle = null;
    this.previewMeta = null;
    this.relayInput = null;
    this.relayPills = null;
    this.status = null;
    this.postButton = null;
    this.cancelButton = null;
    this.closeButton = null;
    this.modalAccessibility = null;

    this.activeVideo = null;
    this.currentRelays = [];
    this.busy = false;
    this.bound = false;

    this.boundHandlers = {
      post: (event) => this.handlePostClick(event),
      cancel: (event) => this.handleCancelInteraction(event),
      overlay: (event) => this.handleCancelInteraction(event),
      relayInput: (event) => this.handleRelayInput(event),
      relayPillClick: (event) => this.handleRelayPillClick(event),
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

    let modal = targetContainer.querySelector("#shareNostrModal");
    if (!modal) {
      const response = await fetch("components/share-nostr-modal.html");
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const html = await response.text();
      const wrapper = document.createElement("div");
      wrapper.innerHTML = html;
      this.removeTrackingScripts(wrapper);
      targetContainer.appendChild(wrapper);
      modal = wrapper.querySelector("#shareNostrModal");
    }

    if (!modal) {
      throw new Error("Share Nostr modal markup missing after load.");
    }

    this.cacheElements(modal);
    this.setupModalAccessibility();
    this.bindEvents();
    this.reset();

    return this.modal;
  }

  cacheElements(modal) {
    this.modal = modal;
    this.overlay = modal.querySelector(".bv-modal-backdrop") || null;
    this.modalPanel = modal.querySelector(".modal-sheet") || modal;
    this.textarea = modal.querySelector("#shareNostrContent") || null;
    this.previewUrl = modal.querySelector("#shareNostrPreviewUrl") || null;
    this.previewThumbnail = modal.querySelector("#shareNostrPreviewThumbnail") || null;
    this.previewFallback = modal.querySelector("#shareNostrPreviewFallback") || null;
    this.previewTitle = modal.querySelector("#shareNostrPreviewTitle") || null;
    this.previewMeta = modal.querySelector("#shareNostrPreviewMeta") || null;
    this.relayInput = modal.querySelector("#shareNostrRelays") || null;
    this.relayPills = modal.querySelector("#shareNostrRelayPills") || null;
    this.status = modal.querySelector("#shareNostrStatus") || null;
    this.postButton = modal.querySelector("#postShareNostr") || null;
    this.cancelButton = modal.querySelector("#cancelShareNostr") || null;
    this.closeButton = modal.querySelector("#closeShareNostrModal") || null;
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

    if (this.postButton) {
      this.postButton.addEventListener("click", this.boundHandlers.post);
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
    if (this.relayInput) {
      this.relayInput.addEventListener("input", this.boundHandlers.relayInput);
    }
    if (this.relayPills) {
      this.relayPills.addEventListener("click", this.boundHandlers.relayPillClick);
    }

    this.bound = true;
  }

  reset() {
    this.activeVideo = null;
    this.currentRelays = [];
    this.busy = false;
    this.setStatus("");
    this.setBusy(false);

    if (this.textarea) {
      this.textarea.value = "";
    }
    if (this.previewTitle) {
      this.previewTitle.textContent = "--";
    }
    if (this.previewMeta) {
      this.previewMeta.textContent = "--";
    }
    if (this.previewUrl) {
      this.previewUrl.textContent = "--";
      this.previewUrl.href = "#";
    }
    this.setThumbnail("");
    this.setRelayList([]);
  }

  setBusy(isBusy) {
    this.busy = isBusy;
    const actionButtons = [this.postButton, this.cancelButton, this.closeButton];
    actionButtons.forEach((button) => {
      if (!(button instanceof HTMLButtonElement)) {
        return;
      }
      button.disabled = isBusy;
    });
    if (this.postButton) {
      this.postButton.setAttribute("aria-busy", isBusy ? "true" : "false");
      const label = isBusy ? "Posting..." : "Post";
      if (this.postButton.textContent !== label) {
        this.postButton.textContent = label;
      }
    }
  }

  setStatus(message = "", tone = "muted") {
    if (!this.status) {
      return;
    }
    this.status.textContent = message;
    const toneClassMap = {
      muted: "text-muted",
      success: "text-success",
      warning: "text-warning",
      danger: "text-danger",
    };
    Object.values(toneClassMap).forEach((cls) => this.status.classList.remove(cls));
    const nextClass = toneClassMap[tone] || toneClassMap.muted;
    this.status.classList.add(nextClass);
  }

  resolveDefaultRelays() {
    const candidate =
      relayManager && typeof relayManager.getWriteRelayUrls === "function"
        ? relayManager.getWriteRelayUrls()
        : [];
    const normalized = normalizeRelayList(candidate);
    if (normalized.length) {
      return normalized;
    }
    return normalizeRelayList(DEFAULT_RELAY_URLS);
  }

  parseRelayInput(value) {
    if (typeof value !== "string") {
      return [];
    }
    return normalizeRelayList(value.split(","));
  }

  setRelayList(relays) {
    const normalized = normalizeRelayList(relays);
    this.currentRelays = normalized;
    if (this.relayInput) {
      this.relayInput.value = normalized.join(", ");
    }
    this.renderRelayPills();
  }

  renderRelayPills() {
    if (!this.relayPills) {
      return;
    }
    this.relayPills.innerHTML = "";
    if (!this.currentRelays.length) {
      const placeholder = document.createElement("span");
      placeholder.className = "text-xs text-muted";
      placeholder.textContent = "No relays selected.";
      this.relayPills.appendChild(placeholder);
      return;
    }

    this.currentRelays.forEach((relay) => {
      const pill = document.createElement("span");
      pill.className =
        "inline-flex items-center gap-2 rounded-full border border-border/70 bg-surface-alt px-3 py-1 text-xs text-text";

      const label = document.createElement("span");
      label.textContent = relay;
      label.className = "truncate max-w-[200px]";
      pill.appendChild(label);

      const removeButton = document.createElement("button");
      removeButton.type = "button";
      removeButton.className =
        "btn-ghost text-muted hover:text-text px-1 py-0.5 rounded-full";
      removeButton.setAttribute("aria-label", `Remove ${relay}`);
      removeButton.dataset.action = "remove-relay";
      removeButton.dataset.relay = relay;
      removeButton.innerHTML =
        '<svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      pill.appendChild(removeButton);

      this.relayPills.appendChild(pill);
    });
  }

  setThumbnail(url) {
    const sanitized = typeof url === "string" ? url.trim() : "";
    const resolved = sanitized || this.fallbackThumbnailSrc || "";
    if (this.previewThumbnail) {
      if (resolved) {
        this.previewThumbnail.src = resolved;
        this.previewThumbnail.classList.remove("hidden");
      } else {
        this.previewThumbnail.removeAttribute("src");
        this.previewThumbnail.classList.add("hidden");
      }
    }
    if (this.previewFallback) {
      this.previewFallback.classList.toggle(
        "hidden",
        Boolean(resolved)
      );
    }
  }

  buildShareContent(payload) {
    const title =
      typeof payload?.title === "string" && payload.title.trim()
        ? payload.title.trim()
        : "Untitled video";
    const shareUrl =
      typeof payload?.shareUrl === "string" ? payload.shareUrl.trim() : "";
    const thumbnail =
      typeof payload?.thumbnail === "string" ? payload.thumbnail.trim() : "";

    return `${title} — Check out this video on bitvid 👇\n\n${shareUrl}\n\n${thumbnail}`;
  }

  setVideo(payload) {
    this.activeVideo = payload || null;

    const title =
      typeof payload?.title === "string" && payload.title.trim()
        ? payload.title.trim()
        : "Untitled video";
    const shareUrl =
      typeof payload?.shareUrl === "string" ? payload.shareUrl.trim() : "";
    const thumbnail =
      typeof payload?.thumbnail === "string" ? payload.thumbnail.trim() : "";
    const pubkey =
      typeof payload?.pubkey === "string" && payload.pubkey.trim()
        ? payload.pubkey.trim()
        : "";
    const authorName =
      typeof payload?.authorName === "string" && payload.authorName.trim()
        ? payload.authorName.trim()
        : "";

    if (this.textarea) {
      this.textarea.value = this.buildShareContent({
        title,
        shareUrl,
        thumbnail,
      });
    }

    if (this.previewTitle) {
      this.previewTitle.textContent = title;
    }

    if (this.previewMeta) {
      const displayAuthor = authorName || pubkey;
      this.previewMeta.textContent = displayAuthor
        ? `Author: ${displayAuthor}`
        : "Author info unavailable";
    }

    if (this.previewUrl) {
      const displayUrl = shareUrl || "--";
      this.previewUrl.textContent = displayUrl;
      this.previewUrl.href = shareUrl || "#";
      this.previewUrl.classList.toggle("pointer-events-none", !shareUrl);
    }

    this.setThumbnail(thumbnail);
  }

  async open({ video, triggerElement } = {}) {
    await this.load();
    this.setVideo(video || {});
    this.setRelayList(this.resolveDefaultRelays());
    this.setStatus("");
    this.modal?.classList.remove("hidden");
    this.modalAccessibility?.activate({ triggerElement });
    this.setGlobalModalState("shareNostr", true);
    this.dispatch("share-nostr:open", { video: this.activeVideo });
  }

  close() {
    if (!this.modal) {
      return;
    }
    this.modal.classList.add("hidden");
    this.modalAccessibility?.deactivate();
    this.setGlobalModalState("shareNostr", false);
    this.dispatch("share-nostr:close", { video: this.activeVideo });
    this.reset();
  }

  handleRelayInput(event) {
    if (this.busy) {
      return;
    }
    const value = event?.target?.value || "";
    this.currentRelays = this.parseRelayInput(value);
    this.renderRelayPills();
  }

  handleRelayPillClick(event) {
    const trigger = event?.target?.closest?.("[data-action='remove-relay']");
    if (!trigger) {
      return;
    }
    const relay = trigger.dataset.relay;
    if (!relay) {
      return;
    }
    this.setRelayList(this.currentRelays.filter((entry) => entry !== relay));
  }

  async handlePostClick(event) {
    if (event?.preventDefault) {
      event.preventDefault();
    }
    if (this.busy) {
      return;
    }

    const content = this.textarea?.value || "";
    const relays = this.currentRelays.slice();
    const payload = {
      video: this.activeVideo,
      content,
      relays,
    };

    this.setBusy(true);
    this.setStatus("Posting to relays...", "muted");
    this.dispatch("share-nostr:post", payload);

    if (!this.onPost) {
      logger.user.warn("Share on Nostr is not configured yet.");
      this.setStatus("Posting is not configured yet.", "warning");
      this.setBusy(false);
      return;
    }

    try {
      await this.onPost(payload);
      this.setStatus("Posted to relays.", "success");
      this.close();
    } catch (error) {
      logger.user.error("Failed to post to relays.");
      logger.dev.warn("[ShareNostrModal] Post request failed:", error);
      this.setStatus("Failed to post. Please try again.", "danger");
      this.setBusy(false);
    }
  }

  handleCancelInteraction(event) {
    if (event?.preventDefault) {
      event.preventDefault();
    }
    if (this.busy) {
      return;
    }
    if (this.onCancel) {
      this.onCancel({ video: this.activeVideo });
    }
    this.close();
  }
}
