import { LinkPreviewService } from "../../../services/linkPreviewService.js";
import {
  allowLinkPreviewDomain,
  getLinkPreviewSettings,
  isLinkPreviewDomainAllowed,
  subscribeToLinkPreviewSettings,
} from "../../../utils/linkPreviewSettings.js";
import { devLogger } from "../../../utils/logger.js";

export class LinkPreviewController {
  constructor({ modal }) {
    this.modal = modal;
    this.linkPreviewService = new LinkPreviewService();
    this.linkPreviewAbortControllers = new Map();
    this.linkPreviewSettingsUnsubscribe = null;
    this.currentDescriptionText = "";
    this.videoDescriptionPreviews = null;

    this.handleLinkPreviewSettingsChange =
      this.handleLinkPreviewSettingsChange.bind(this);
  }

  get document() {
    return this.modal?.document || null;
  }

  initialize({ playerModal }) {
    if (!playerModal) return;

    this.videoDescriptionPreviews =
      playerModal.querySelector("#videoDescriptionPreviews") || null;

    if (this.linkPreviewSettingsUnsubscribe) {
      this.linkPreviewSettingsUnsubscribe();
    }
    this.linkPreviewSettingsUnsubscribe = subscribeToLinkPreviewSettings(
      this.handleLinkPreviewSettingsChange,
    );
  }

  destroy() {
    this.clearLinkPreviews();
    if (this.linkPreviewSettingsUnsubscribe) {
      this.linkPreviewSettingsUnsubscribe();
      this.linkPreviewSettingsUnsubscribe = null;
    }
    this.videoDescriptionPreviews = null;
    this.linkPreviewAbortControllers.clear();
  }

  handleLinkPreviewSettingsChange(event) {
    const detail = event?.detail?.settings || null;
    if (!this.videoDescriptionPreviews) {
      return;
    }
    const nextText = this.currentDescriptionText || "";
    if (!nextText) {
      return;
    }
    if (detail && typeof detail.autoFetchUnknownDomains === "boolean") {
      this.renderLinkPreviews(nextText);
    }
  }

  clearLinkPreviewRequests() {
    if (!(this.linkPreviewAbortControllers instanceof Map)) {
      this.linkPreviewAbortControllers = new Map();
      return;
    }
    this.linkPreviewAbortControllers.forEach((controller) => {
      try {
        controller.abort();
      } catch {
        // noop
      }
    });
    this.linkPreviewAbortControllers.clear();
  }

  clearLinkPreviews() {
    this.clearLinkPreviewRequests();
    this.currentDescriptionText = "";
    if (this.videoDescriptionPreviews) {
      this.videoDescriptionPreviews.textContent = "";
      this.videoDescriptionPreviews.setAttribute("hidden", "");
    }
  }

  renderLinkPreviews(description) {
    const root = this.videoDescriptionPreviews;
    if (!root || !this.document) {
      return;
    }
    const text =
      typeof description === "string" ? description : String(description ?? "");
    this.currentDescriptionText = text;
    this.clearLinkPreviewRequests();
    root.textContent = "";

    const urls = this.extractDescriptionUrls(text);
    if (!urls.length) {
      root.setAttribute("hidden", "");
      return;
    }

    root.removeAttribute("hidden");
    const fragment = this.document.createDocumentFragment();
    urls.forEach((url) => {
      const domain = this.extractPreviewDomain(url);
      const card = this.createLinkPreviewCard({ url, domain });
      fragment.appendChild(card);
      void this.resolveLinkPreview(url, domain, card);
    });
    root.appendChild(fragment);
  }

  extractDescriptionUrls(text) {
    if (!text) {
      return [];
    }
    const urlPattern = /\bhttps?:\/\/[^\s<>"']+/gi;
    const urls = new Set();
    let match;
    while ((match = urlPattern.exec(text)) !== null) {
      const normalized = this.normalizePreviewUrl(match[0]);
      if (normalized) {
        urls.add(normalized);
      }
    }
    return Array.from(urls);
  }

  normalizePreviewUrl(candidate) {
    if (!candidate) {
      return "";
    }
    let href = typeof candidate === "string" ? candidate : String(candidate ?? "");
    let trailing = "";
    const trailingPattern = /[)\]\}>"',.;!?]+$/;
    while (href && trailingPattern.test(href)) {
      trailing = href.slice(-1) + trailing;
      href = href.slice(0, -1);
    }
    return href.trim();
  }

  extractPreviewDomain(url) {
    if (!url) {
      return "";
    }
    try {
      return new URL(url).hostname || "";
    } catch {
      return "";
    }
  }

  createLinkPreviewCard({ url, domain }) {
    const card = this.document.createElement("article");
    card.className = "card flex flex-col gap-2 p-3";
    card.dataset.linkPreviewUrl = url;

    const header = this.document.createElement("div");
    header.className = "flex items-start gap-3";

    const imageWrapper = this.document.createElement("div");
    imageWrapper.className =
      "flex h-16 w-16 flex-shrink-0 items-center justify-center overflow-hidden rounded-md border border-border/60 bg-surface-muted text-2xs text-muted";
    const image = this.document.createElement("img");
    image.hidden = true;
    image.loading = "lazy";
    image.decoding = "async";
    image.className = "h-full w-full object-cover";
    const imagePlaceholder = this.document.createElement("span");
    imagePlaceholder.textContent = "Preview";
    imageWrapper.appendChild(image);
    imageWrapper.appendChild(imagePlaceholder);

    const content = this.document.createElement("div");
    content.className = "flex min-w-0 flex-1 flex-col gap-1";

    const domainEl = this.document.createElement("p");
    domainEl.className = "text-3xs uppercase tracking-wide text-muted";
    domainEl.textContent = domain || "Link preview";

    const titleEl = this.document.createElement("a");
    titleEl.className =
      "text-sm font-semibold text-text break-words hover:underline focus-ring";
    titleEl.href = url;
    titleEl.target = "_blank";
    titleEl.rel = "noopener noreferrer";
    titleEl.textContent = url;

    const descEl = this.document.createElement("p");
    descEl.className = "text-xs text-muted";
    descEl.textContent = "";

    content.appendChild(domainEl);
    content.appendChild(titleEl);
    content.appendChild(descEl);

    header.appendChild(imageWrapper);
    header.appendChild(content);

    const statusEl = this.document.createElement("p");
    statusEl.className = "text-xs text-muted";

    const actions = this.document.createElement("div");
    actions.className = "flex flex-wrap gap-2";

    card.appendChild(header);
    card.appendChild(statusEl);
    card.appendChild(actions);

    card.__linkPreviewElements = {
      imageWrapper,
      image,
      imagePlaceholder,
      domainEl,
      titleEl,
      descEl,
      statusEl,
      actions,
    };

    return card;
  }

  setLinkPreviewStatus(card, { message = "", actionLabel = "", onAction } = {}) {
    const elements = card?.__linkPreviewElements;
    if (!elements) {
      return;
    }
    const statusText = typeof message === "string" ? message : "";
    elements.statusEl.textContent = statusText;
    elements.actions.textContent = "";

    if (actionLabel && typeof onAction === "function") {
      const button = this.document.createElement("button");
      button.type = "button";
      button.className = "btn-ghost focus-ring text-xs";
      button.textContent = actionLabel;
      button.addEventListener("click", onAction);
      elements.actions.appendChild(button);
    }
  }

  updateLinkPreviewCard(card, preview, { domain } = {}) {
    const elements = card?.__linkPreviewElements;
    if (!elements || !preview) {
      return;
    }
    const title = preview.title || preview.siteName || preview.url || "";
    elements.titleEl.textContent = title || preview.url;
    elements.descEl.textContent = preview.description || "";
    const label = preview.siteName || domain || "Link preview";
    elements.domainEl.textContent = label;

    if (preview.image) {
      elements.image.src = preview.image;
      elements.image.alt = title || "Link preview";
      elements.image.hidden = false;
      elements.imagePlaceholder.hidden = true;
    } else {
      elements.image.hidden = true;
      elements.imagePlaceholder.hidden = false;
    }

    this.setLinkPreviewStatus(card, { message: "" });
  }

  async resolveLinkPreview(url, domain, card) {
    const settings = getLinkPreviewSettings();
    const isAllowed =
      settings.autoFetchUnknownDomains ||
      isLinkPreviewDomainAllowed(domain, settings);

    if (!isAllowed) {
      this.setLinkPreviewStatus(card, {
        message: "Preview disabled for new domains.",
        actionLabel: domain ? `Allow previews for ${domain}` : "Allow previews",
        onAction: () => {
          if (domain) {
            allowLinkPreviewDomain(domain);
          }
        },
      });
      return;
    }

    this.setLinkPreviewStatus(card, { message: "Loading preview…" });
    const controller = new AbortController();
    this.linkPreviewAbortControllers.set(url, controller);
    const preview = await this.linkPreviewService.getPreview(url, {
      signal: controller.signal,
    });
    this.linkPreviewAbortControllers.delete(url);

    if (!preview) {
      this.setLinkPreviewStatus(card, { message: "Preview unavailable." });
      return;
    }

    this.updateLinkPreviewCard(card, preview, { domain });
    if (domain) {
      allowLinkPreviewDomain(domain, { silent: true });
    }
  }
}
