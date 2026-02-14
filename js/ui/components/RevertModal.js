import { Nip71FormManager } from "./nip71FormManager.js";
import { createModalAccessibility } from "./modalAccessibility.js";
import {
  createImetaVariants,
  createTextTracks,
  createSegments,
  createHashtags,
  createParticipants,
  createReferences,
} from "./revertModalRenderers.js";

// NOTE: Any metadata field added to the Upload or Edit modals must also be
// rendered inside the Revert modal to keep the experiences aligned.
export class RevertModal {
  constructor({
    removeTrackingScripts,
    setGlobalModalState,
    formatAbsoluteTimestamp,
    formatTimeAgo,
    escapeHTML,
    truncateMiddle,
    fallbackThumbnailSrc,
    container,
  }) {
    this.removeTrackingScripts = removeTrackingScripts;
    this.setGlobalModalState = setGlobalModalState;
    this.formatAbsoluteTimestamp = formatAbsoluteTimestamp;
    this.formatTimeAgo = formatTimeAgo;
    this.escapeHTML = escapeHTML;
    this.truncateMiddle = truncateMiddle;
    this.fallbackThumbnailSrc = fallbackThumbnailSrc || "";
    this.container = container || document.getElementById("modalContainer");

    this.nip71Formatter = new Nip71FormManager();

    this.eventTarget = new EventTarget();

    this.modal = null;
    this.overlay = null;
    this.list = null;
    this.details = null;
    this.placeholder = null;
    this.detailsDefaultHTML = "";
    this.historyCount = null;
    this.statusLabel = null;
    this.title = null;
    this.subtitle = null;
    this.closeButton = null;
    this.cancelButton = null;
    this.confirmButton = null;
    this.modalPanel = null;
    this.modalAccessibility = null;

    this.activeVideo = null;
    this.revisions = [];
    this.selectedRevision = null;
    this.pendingEntries = [];
    this.busy = false;
    this.context = null;

    this.confirmDefaultLabel = "Revert to selected version";

    this.bound = false;
    this.boundHandlers = {
      listClick: (event) => this.handleListClick(event),
      confirm: () => this.handleConfirmClick(),
      cancel: () => this.handleCancelInteraction(),
      overlay: () => this.handleCancelInteraction(),
      close: () => this.handleCloseInteraction(),
    };

    this.reset();
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
      return true;
    }

    let modal = document.getElementById("revertVideoModal");
    if (!modal) {
      const response = await fetch("components/revert-video-modal.html");
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const html = await response.text();
      const modalContainer = this.container;
      if (!modalContainer) {
        throw new Error("Modal container element not found!");
      }

      const wrapper = document.createElement("div");
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, "text/html");
      while (doc.body.firstChild) {
        wrapper.appendChild(doc.body.firstChild);
      }

      if (typeof this.removeTrackingScripts === "function") {
        this.removeTrackingScripts(wrapper);
      }
      modalContainer.appendChild(wrapper);

      modal = wrapper.querySelector("#revertVideoModal");
    }

    if (!modal) {
      throw new Error("Revert video modal markup missing after load.");
    }

    this.cacheElements(modal);
    this.setupModalAccessibility();
    this.bindEvents();
    this.reset();

    return true;
  }

  cacheElements(modal) {
    this.modal = modal;
    this.overlay = modal.querySelector("#revertVideoModalOverlay") || null;
    this.modalPanel = modal.querySelector(".bv-modal__panel") || modal;
    this.list = modal.querySelector("#revertVersionsList") || null;
    this.details = modal.querySelector("#revertVersionDetails") || null;
    this.placeholder = modal.querySelector("#revertVersionPlaceholder") || null;
    this.detailsDefaultHTML = this.details ? this.details.innerHTML : "";
    this.historyCount = modal.querySelector("#revertHistoryCount") || null;
    this.statusLabel = modal.querySelector("#revertSelectionStatus") || null;
    this.title = modal.querySelector("#revertModalTitle") || null;
    this.subtitle = modal.querySelector("#revertModalSubtitle") || null;
    this.closeButton = modal.querySelector("#closeRevertVideoModal") || null;
    this.cancelButton = modal.querySelector("#cancelRevertVideo") || null;
    this.confirmButton = modal.querySelector("#confirmRevertVideo") || null;

    if (this.confirmButton) {
      const text = this.confirmButton.textContent?.trim();
      if (text) {
        this.confirmDefaultLabel = text;
      }
    }
  }

  bindEvents() {
    if (this.bound || !this.modal) {
      return;
    }

    if (this.list) {
      this.list.addEventListener("click", this.boundHandlers.listClick);
    }
    if (this.confirmButton) {
      this.confirmButton.addEventListener("click", this.boundHandlers.confirm);
    }
    if (this.cancelButton) {
      this.cancelButton.addEventListener("click", this.boundHandlers.cancel);
    }
    if (this.overlay) {
      this.overlay.addEventListener("click", this.boundHandlers.overlay);
    }
    if (this.closeButton) {
      this.closeButton.addEventListener("click", this.boundHandlers.close);
    }

    this.bound = true;
  }

  reset() {
    this.activeVideo = null;
    this.revisions = [];
    this.selectedRevision = null;
    this.pendingEntries = [];
    this.busy = false;
    this.context = null;

    if (this.historyCount) {
      this.historyCount.textContent = "";
    }

    if (this.statusLabel) {
      this.statusLabel.textContent =
        "Select an older revision to inspect its metadata before reverting.";
    }

    if (this.title) {
      this.title.textContent = "Revert Video Note";
    }

    if (this.subtitle) {
      this.subtitle.textContent =
        "Review previous versions before restoring an older state.";
    }

    if (this.list) {
      this.list.replaceChildren();
    }

    if (this.details) {
      this.details.replaceChildren();
      if (this.detailsDefaultHTML) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(this.detailsDefaultHTML, "text/html");
        while (doc.body.firstChild) {
          this.details.appendChild(doc.body.firstChild);
        }
        this.placeholder = this.details.querySelector("#revertVersionPlaceholder");
      }
    }

    if (this.confirmButton) {
      this.confirmButton.disabled = true;
      this.confirmButton.textContent = this.confirmDefaultLabel;
      this.confirmButton.classList.remove("cursor-wait");
    }

    const enableButton = (button) => {
      if (!button) {
        return;
      }
      button.disabled = false;
    };

    enableButton(this.cancelButton);
    enableButton(this.closeButton);
  }

  setupModalAccessibility() {
    if (!this.modal) {
      return;
    }

    if (this.modalAccessibility?.destroy) {
      this.modalAccessibility.destroy();
    }

    this.modalAccessibility = createModalAccessibility({
      root: this.modal,
      panel: this.modalPanel || this.modal,
      backdrop: this.overlay || this.modal,
      onRequestClose: () => this.handleCancelInteraction(),
    });
  }

  open(context = {}, { triggerElement } = {}) {
    if (!this.modal) {
      throw new Error("Revert modal has not been loaded.");
    }

    this.context = context || {};
    this.modal.classList.remove("hidden");
    if (typeof this.setGlobalModalState === "function") {
      this.setGlobalModalState("revertVideo", true);
    }
    this.modalAccessibility?.activate({ triggerElement });
    this.dispatch("video:revert-open", {
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
    if (typeof this.setGlobalModalState === "function") {
      this.setGlobalModalState("revertVideo", false);
    }
    this.dispatch("video:revert-close", detail);
    this.reset();
  }

  setHistory(video, history = []) {
    if (!this.modal) {
      return;
    }

    this.reset();

    if (!video || typeof video !== "object") {
      if (this.statusLabel) {
        this.statusLabel.textContent =
          "Unable to load revision history for this note.";
      }
      return;
    }

    this.activeVideo = video;

    const merged = Array.isArray(history) ? history.slice() : [];
    if (video.id && !merged.some((entry) => entry && entry.id === video.id)) {
      merged.push(video);
    }

    const deduped = new Map();
    for (const entry of merged) {
      if (!entry || typeof entry !== "object" || !entry.id) {
        continue;
      }
      deduped.set(entry.id, entry);
    }

    this.revisions = Array.from(deduped.values()).sort(
      (a, b) => (b?.created_at || 0) - (a?.created_at || 0)
    );

    this.selectedRevision = null;
    if (this.revisions.length > 1 && video.created_at) {
      const firstOlder = this.revisions.find(
        (entry) =>
          entry &&
          entry.id !== video.id &&
          entry.deleted !== true &&
          typeof entry.created_at === "number" &&
          entry.created_at < video.created_at
      );
      if (firstOlder) {
        this.selectedRevision = firstOlder;
      }
    }

    if (this.historyCount) {
      this.historyCount.textContent = `${this.revisions.length}`;
    }

    if (this.title) {
      this.title.textContent = video.title
        ? `Revert “${video.title}”`
        : "Revert Video Note";
    }

    if (this.subtitle) {
      const subtitleParts = [];
      const dTagValue = this.extractDTagValue(video.tags);
      if (dTagValue) {
        subtitleParts.push(`d=${dTagValue}`);
      }
      if (video.videoRootId) {
        const truncated = this.truncateMiddle
          ? this.truncateMiddle(video.videoRootId, 40)
          : video.videoRootId;
        subtitleParts.push(`root=${truncated}`);
      }
      this.subtitle.textContent = subtitleParts.length
        ? `History grouped by ${subtitleParts.join(" • ")}`
        : "Review previous versions before restoring an older state.";
    }

    this.renderRevertVersionsList();

    if (this.selectedRevision) {
      this.renderRevertVersionDetails(this.selectedRevision);
    } else {
      this.renderRevertVersionDetails(null);
    }

    if (this.revisions.length <= 1) {
      if (this.statusLabel) {
        this.statusLabel.textContent =
          "No earlier revisions are available for this note.";
      }
      this.updateConfirmationState();
      return;
    }

    this.updateConfirmationState();
  }

  renderRevertVersionsList() {
    if (!this.list) {
      return;
    }

    const selectedId = this.selectedRevision?.id || "";
    const currentId = this.activeVideo?.id || "";

    this.list.replaceChildren();

    if (!this.revisions.length) {
      const p = document.createElement("p");
      p.className = "text-xs text-subtle";
      p.textContent = "No revisions found.";
      this.list.appendChild(p);
      return;
    }

    const fragment = document.createDocumentFragment();

    this.revisions.forEach((entry) => {
      if (!entry || !entry.id) {
        return;
      }

      const isCurrent = entry.id === currentId;
      const isSelected = entry.id === selectedId;
      const isDeleted = entry.deleted === true;

      const button = document.createElement("button");
      button.type = "button";
      button.dataset.revertVersionId = entry.id;

      const classes = [
        "w-full",
        "text-left",
        "rounded-md",
        "border",
        "px-3",
        "py-3",
        "text-sm",
        "transition",
        "duration-150",
        "focus:outline-none",
        "focus:ring-2",
        "focus:ring-offset-2",
        "focus:ring-offset-surface",
      ];

      if (isSelected) {
        classes.push(
          "border-status-info-border",
          "bg-status-info-surface",
          "text-status-info-on",
          "focus:ring-status-info"
        );
      } else if (isCurrent) {
        classes.push(
          "border-status-success-border",
          "bg-status-success-surface",
          "text-status-success-on",
          "focus:ring-status-success"
        );
      } else if (isDeleted) {
        classes.push(
          "border-status-danger-border",
          "bg-status-danger-surface",
          "text-status-danger-on",
          "hover:border-status-danger-border"
        );
      } else {
        classes.push(
          "border-overlay",
          "bg-overlay-panel-soft",
          "hover:bg-overlay-panel",
          "text-primary"
        );
      }

      button.className = classes.join(" ");
      button.setAttribute("aria-pressed", isSelected ? "true" : "false");
      if (isCurrent) {
        button.setAttribute("aria-current", "true");
      }

      const createdAt = typeof entry.created_at === "number" ? entry.created_at : 0;
      const relative = this.formatTimeAgo
        ? this.formatTimeAgo(createdAt)
        : "";
      const absolute = this.formatAbsoluteTimestamp
        ? this.formatAbsoluteTimestamp(createdAt)
        : "";
      const versionLabel =
        entry.version !== undefined ? `v${entry.version}` : "v?";

      const metaParts = [];
      if (isCurrent) {
        metaParts.push("Current version");
      }
      if (entry.deleted) {
        metaParts.push("Marked deleted");
      }
      if (entry.isPrivate) {
        metaParts.push("Private");
      }
      const meta = metaParts.join(" • ");
      const metaClass = entry.deleted
        ? "text-status-danger-on"
        : "text-muted";

      const container = document.createElement("div");
      container.className = "flex items-start justify-between gap-3";

      const leftCol = document.createElement("div");
      leftCol.className = "space-y-1";

      const titleP = document.createElement("p");
      titleP.className = "font-semibold";
      titleP.textContent = entry.title || "Untitled";
      leftCol.appendChild(titleP);

      const timeP = document.createElement("p");
      timeP.className = "text-xs text-subtle";
      timeP.textContent = `${relative} • ${absolute}`;
      leftCol.appendChild(timeP);

      if (meta) {
        const metaP = document.createElement("p");
        metaP.className = `text-xs ${metaClass}`;
        metaP.textContent = meta;
        leftCol.appendChild(metaP);
      }

      container.appendChild(leftCol);

      const rightCol = document.createElement("div");
      rightCol.className = "text-xs uppercase tracking-wide text-muted";
      rightCol.textContent = versionLabel;
      container.appendChild(rightCol);

      button.appendChild(container);
      fragment.appendChild(button);
    });

    this.list.appendChild(fragment);
  }

  handleListClick(event) {
    if (this.busy) {
      return;
    }

    const button = event?.target?.closest?.("[data-revert-version-id]");
    if (!button || !button.dataset) {
      return;
    }

    const versionId = button.dataset.revertVersionId;
    if (!versionId) {
      return;
    }

    const match = (this.revisions || []).find(
      (entry) => entry && entry.id === versionId
    );
    if (!match) {
      return;
    }

    this.selectedRevision = match;
    this.renderRevertVersionsList();
    this.renderRevertVersionDetails(match);
    this.updateConfirmationState();

    this.dispatch("video:revert-select", {
      revision: match,
      video: this.activeVideo,
    });
  }

  renderRevertVersionDetails(version) {
    if (!this.details) {
      return;
    }

    this.details.replaceChildren();

    if (!version) {
      if (this.detailsDefaultHTML) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(this.detailsDefaultHTML, "text/html");
        while (doc.body.firstChild) {
          this.details.appendChild(doc.body.firstChild);
        }
        this.placeholder = this.details.querySelector("#revertVersionPlaceholder");
      }
      return;
    }

    const createdAt = typeof version.created_at === "number" ? version.created_at : 0;
    const absolute = this.formatAbsoluteTimestamp
      ? this.formatAbsoluteTimestamp(createdAt)
      : "";
    const relative = this.formatTimeAgo ? this.formatTimeAgo(createdAt) : "";
    const description =
      typeof version.description === "string" ? version.description : "";
    const thumbnail =
      typeof version.thumbnail === "string" ? version.thumbnail.trim() : "";
    const url = typeof version.url === "string" ? version.url.trim() : "";
    const magnet =
      typeof version.magnet === "string" ? version.magnet.trim() : "";
    const rawMagnet =
      typeof version.rawMagnet === "string" ? version.rawMagnet.trim() : "";
    const displayMagnet = magnet || rawMagnet;
    const isPrivate = version.isPrivate === true;
    const dTagValue = this.extractDTagValue(version.tags);

    const nip71Metadata = this.buildNip71DisplayMetadata(version);

    const fallbackThumbnail = this.fallbackThumbnailSrc;
    const thumbnailSrc = thumbnail || fallbackThumbnail;
    const thumbnailAlt = thumbnail ? "Revision thumbnail" : "Fallback thumbnail";

    const urlNode = url ? this.createLinkMarkup(url) : this.createPlaceholder("None");

    const magnetNode = displayMagnet
      ? (() => {
          const div = document.createElement("div");
          div.className = "break-all";
          const label = this.truncateMiddle
             ? this.truncateMiddle(displayMagnet, 72)
             : displayMagnet;
          div.textContent = label;
          if (isPrivate) {
             const span = document.createElement("span");
             span.className = "block mt-1 text-xs text-status-private-on";
             span.textContent = "Magnet stays visible only to you — private notes keep the raw string local.";
             div.appendChild(span);
          }
          return div;
        })()
      : this.createPlaceholder("None");

    const chipsDiv = document.createElement("div");
    chipsDiv.className = "flex flex-wrap gap-2";

    const nsfwFlag = version.isNsfw === true;
    const forKidsFlag = version.isForKids === true;
    const conflictingAudienceFlags = nsfwFlag && forKidsFlag;

    if (version.deleted) {
      const s = document.createElement("span");
      s.className = "pill";
      s.dataset.size = "compact";
      s.dataset.variant = "critical";
      s.textContent = "Marked deleted";
      chipsDiv.appendChild(s);
    }
    if (isPrivate) {
      const s = document.createElement("span");
      s.className = "pill";
      s.dataset.size = "compact";
      s.dataset.variant = "private";
      s.textContent = "Private";
      chipsDiv.appendChild(s);
    }
    if (conflictingAudienceFlags) {
      const s = document.createElement("span");
      s.className = "pill";
      s.dataset.size = "compact";
      s.dataset.variant = "warning";
      s.textContent = "NSFW + For kids conflict";
      chipsDiv.appendChild(s);
    } else {
      if (nsfwFlag) {
        const s = document.createElement("span");
        s.className = "pill";
        s.dataset.size = "compact";
        s.dataset.variant = "critical";
        s.textContent = "Marked NSFW";
        chipsDiv.appendChild(s);
      }
      if (forKidsFlag) {
        const s = document.createElement("span");
        s.className = "pill";
        s.dataset.size = "compact";
        s.dataset.variant = "success";
        s.textContent = "For kids";
        chipsDiv.appendChild(s);
      }
    }
    if (version.version !== undefined) {
      const s = document.createElement("span");
      s.className = "pill";
      s.dataset.size = "compact";
      s.dataset.variant = "neutral";
      s.textContent = `Schema v${version.version}`;
      chipsDiv.appendChild(s);
    }

    const createFlagStatus = (value, {yes, no, unspecified}) => {
      if (value === true) {
        const s = document.createElement("span");
        s.className = "text-primary";
        s.textContent = yes;
        return s;
      }
      if (value === false) {
        const s = document.createElement("span");
        s.className = "text-primary";
        s.textContent = no;
        return s;
      }
      return this.createPlaceholder(unspecified);
    };

    const nsfwStatusNode = createFlagStatus(version.isNsfw, {
      yes: "Yes — marked NSFW",
      no: "No — not flagged as NSFW",
      unspecified: "Not specified",
    });
    const kidsStatusNode = createFlagStatus(version.isForKids, {
      yes: "Yes — marked for kids",
      no: "No — not marked for kids",
      unspecified: "Not specified",
    });

    const audienceConflictNotice = conflictingAudienceFlags
      ? (() => {
          const p = document.createElement("p");
          p.className = "text-xs text-status-warning-on";
          p.textContent = "Conflicting flags detected — this revision is marked both NSFW and for kids. Review before reverting.";
          return p;
        })()
      : null;

    const descriptionNode = description
      ? (() => {
          const p = document.createElement("p");
          p.className = "whitespace-pre-wrap text-primary";
          p.textContent = description;
          return p;
        })()
      : (() => {
          const p = document.createElement("p");
          p.className = "text-subtle";
          p.textContent = "No description provided.";
          return p;
        })();

    const rootId = typeof version.videoRootId === "string" ? version.videoRootId : "";
    const rootDisplay = rootId
      ? this.truncateMiddle
        ? this.truncateMiddle(rootId, 64)
        : rootId
      : "";
    const eventDisplay = version.id
      ? this.truncateMiddle
        ? this.truncateMiddle(version.id, 64)
        : version.id
      : "";

    const timestampText = [absolute, relative ? `(${relative})` : ""]
      .filter(Boolean)
      .join(" ");

    const createTimestampNode = (seconds, raw) => {
      if (Number.isFinite(seconds)) {
        const abs = this.formatAbsoluteTimestamp ? this.formatAbsoluteTimestamp(seconds) : `${seconds}`;
        const rel = this.formatTimeAgo ? this.formatTimeAgo(seconds) : "";
        const frag = document.createDocumentFragment();
        if (abs) {
          const s = document.createElement("span");
          s.className = "text-primary";
          s.textContent = abs;
          frag.appendChild(s);
          frag.appendChild(document.createTextNode(" "));
        }
        if (rel) {
           const s = document.createElement("span");
           s.className = "text-muted";
           s.textContent = `(${rel})`;
           frag.appendChild(s);
        }
        return frag;
      }
      if (raw) {
        const s = document.createElement("span");
        s.className = "text-primary";
        s.textContent = raw;
        return s;
      }
      return this.createPlaceholder();
    };

    const createDurationNode = (seconds, raw) => {
       if (Number.isFinite(seconds)) {
         const display = this.formatDurationSeconds(seconds);
         const suffix = seconds === 1 ? "second" : "seconds";
         const frag = document.createDocumentFragment();
         const s1 = document.createElement("span");
         s1.className = "text-primary";
         s1.textContent = display;
         frag.appendChild(s1);
         frag.appendChild(document.createTextNode(" "));
         const s2 = document.createElement("span");
         s2.className = "text-subtle";
         s2.textContent = `(${seconds} ${suffix})`;
         frag.appendChild(s2);
         return frag;
       }
       if (raw) {
         const s = document.createElement("span");
         s.className = "text-primary";
         s.textContent = raw;
         return s;
       }
       return this.createPlaceholder();
    };

    const kindValue = nip71Metadata.kind;
    const kindNode = (() => {
      if (kindValue !== "" && kindValue !== null && kindValue !== undefined) {
        const label = typeof kindValue === "number" ? kindValue : `${kindValue}`;
        const numeric = Number(label);
        let suffix = "";
        if (Number.isFinite(numeric)) {
          if (numeric === 22) suffix = "short";
          else if (numeric === 21) suffix = "video";
        }

        const frag = document.createDocumentFragment();
        const code = document.createElement("code");
        code.className = "rounded bg-overlay-panel-soft px-1.5 py-0.5 text-primary";
        code.textContent = `kind ${label}`;
        frag.appendChild(code);

        if (suffix) {
          frag.appendChild(document.createTextNode(" "));
          const s = document.createElement("span");
          s.className = "text-muted";
          s.textContent = `(${suffix})`;
          frag.appendChild(s);
        }
        return frag;
      }
      return this.createPlaceholder();
    })();

    const summaryNode = nip71Metadata.summary
      ? (() => {
          const p = document.createElement("p");
          p.className = "whitespace-pre-wrap text-primary";
          p.textContent = nip71Metadata.summary;
          return p;
        })()
      : this.createPlaceholder("Not provided");

    const contentWarningNode = nip71Metadata.contentWarning
      ? (() => {
          const s = document.createElement("span");
          s.className = "pill";
          s.dataset.size = "compact";
          s.dataset.variant = "warning";
          s.textContent = nip71Metadata.contentWarning;
          return s;
        })()
      : this.createPlaceholder("Not provided");

    const publishedAtNode = createTimestampNode(
      nip71Metadata.publishedAtSeconds,
      nip71Metadata.publishedAtRaw
    );
    const durationNode = createDurationNode(
      nip71Metadata.durationSeconds,
      nip71Metadata.durationRaw
    );
    const altNode = nip71Metadata.alt
      ? (() => {
          const p = document.createElement("p");
          p.className = "whitespace-pre-wrap text-primary";
          p.textContent = nip71Metadata.alt;
          return p;
        })()
      : this.createPlaceholder("Not provided");

    const createSection = (title) => {
      const s = document.createElement("section");
      s.className = "space-y-2";
      const h = document.createElement("h4");
      h.className = "text-sm font-semibold text-primary";
      h.textContent = title;
      s.appendChild(h);
      return s;
    };

    const createDl = () => {
       const dl = document.createElement("dl");
       dl.className = "grid gap-3 sm:grid-cols-2 text-xs text-subtle";
       return dl;
    };

    const createDtDd = (label, contentNode, colSpan = 1) => {
        const div = document.createElement("div");
        if (colSpan > 1) div.className = "sm:col-span-2";

        const dt = document.createElement("dt");
        dt.className = "font-semibold text-primary";
        dt.textContent = label;
        div.appendChild(dt);

        const dd = document.createElement("dd");
        dd.className = "mt-1";
        dd.appendChild(contentNode);
        div.appendChild(dd);
        return div;
    };

    const wrapper = document.createElement("div");
    wrapper.className = "space-y-6";

    // Header Area
    const headerRow = document.createElement("div");
    headerRow.className = "flex flex-col gap-4 lg:flex-row lg:items-start";

    const imgDiv = document.createElement("div");
    imgDiv.className = "overflow-hidden rounded-md border border-overlay bg-overlay-strong w-full max-w-sm";
    const img = document.createElement("img");
    img.src = thumbnailSrc;
    img.alt = thumbnailAlt;
    img.className = "w-full h-auto object-cover";
    img.loading = "lazy";
    imgDiv.appendChild(img);
    headerRow.appendChild(imgDiv);

    const headerContent = document.createElement("div");
    headerContent.className = "flex-1 space-y-3";

    const titleTimeDiv = document.createElement("div");
    titleTimeDiv.className = "space-y-1";
    const titleH3 = document.createElement("h3");
    titleH3.className = "text-lg font-semibold text-primary";
    titleH3.textContent = version.title || "Untitled";
    titleTimeDiv.appendChild(titleH3);
    const timeP = document.createElement("p");
    timeP.className = "text-xs text-muted";
    timeP.textContent = timestampText;
    titleTimeDiv.appendChild(timeP);
    headerContent.appendChild(titleTimeDiv);

    if (chipsDiv.hasChildNodes()) {
       headerContent.appendChild(chipsDiv);
    }

    const headerDl = createDl();
    headerDl.appendChild(createDtDd("Hosted URL", urlNode));
    headerDl.appendChild(createDtDd("Magnet", magnetNode));
    headerContent.appendChild(headerDl);

    headerRow.appendChild(headerContent);
    wrapper.appendChild(headerRow);

    // Description
    const descSection = createSection("Description");
    descSection.appendChild(descriptionNode);
    wrapper.appendChild(descSection);

    // Audience Flags
    const audSection = createSection("Audience flags");
    const audDl = createDl();
    audDl.appendChild(createDtDd("NSFW flag", nsfwStatusNode));
    audDl.appendChild(createDtDd("For kids flag", kidsStatusNode));
    audSection.appendChild(audDl);
    if (audienceConflictNotice) audSection.appendChild(audienceConflictNotice);
    wrapper.appendChild(audSection);

    // NIP-71 event metadata
    const eventSection = createSection("NIP-71 event metadata");
    const eventDl = createDl();
    eventDl.appendChild(createDtDd("NIP-71 kind", kindNode));
    eventDl.appendChild(createDtDd("Summary", summaryNode, 2));
    eventDl.appendChild(createDtDd("Content warning", contentWarningNode, 2));
    eventDl.appendChild(createDtDd("Published timestamp", publishedAtNode));
    eventDl.appendChild(createDtDd("Duration", durationNode));
    eventDl.appendChild(createDtDd("Alt text", altNode, 2));
    eventSection.appendChild(eventDl);
    wrapper.appendChild(eventSection);

    // Note pointers
    const ptrSection = createSection("Note pointers");
    const ptrDl = createDl();
    ptrDl.appendChild(createDtDd("Mode", document.createTextNode(version.mode || "live")));

    const dTagNode = dTagValue
       ? (() => {
           const c = document.createElement("code");
           c.className = "rounded bg-overlay-panel-soft px-1.5 py-0.5 text-primary";
           c.textContent = dTagValue;
           return c;
         })()
       : this.createPlaceholder("Not provided");
    ptrDl.appendChild(createDtDd("d tag", dTagNode));

    const rootIdNode = rootDisplay
       ? (() => {
           const c = document.createElement("code");
           c.className = "break-all rounded bg-overlay-panel-soft px-1.5 py-0.5 text-primary";
           c.title = rootId;
           c.textContent = rootDisplay;
           return c;
         })()
       : this.createPlaceholder("Not provided");
    ptrDl.appendChild(createDtDd("videoRootId", rootIdNode));

    const eventIdNode = eventDisplay
       ? (() => {
           const c = document.createElement("code");
           c.className = "break-all rounded bg-overlay-panel-soft px-1.5 py-0.5 text-primary";
           c.title = version.id || "";
           c.textContent = eventDisplay;
           return c;
         })()
       : (() => {
           const s = document.createElement("span");
           s.className = "text-subtle";
           s.textContent = "Unknown";
           return s;
         })();
    ptrDl.appendChild(createDtDd("Event ID", eventIdNode));

    ptrSection.appendChild(ptrDl);
    wrapper.appendChild(ptrSection);

    // NIP-71 media metadata
    const mediaSection = createSection("NIP-71 media metadata");
    const mediaDiv = document.createElement("div");
    mediaDiv.className = "space-y-4";

    const createMediaSub = (label, contentNode) => {
       const d = document.createElement("div");
       d.className = "space-y-2";
       const h = document.createElement("h5");
       h.className = "text-xs font-semibold uppercase tracking-wide text-muted";
       h.textContent = label;
       d.appendChild(h);
       d.appendChild(contentNode);
       return d;
    };

    const renderUtils = {
      createListEmpty: (t) => this.createListEmpty(t),
      createPlaceholder: (t) => this.createPlaceholder(t),
      createLinkMarkup: (v, o) => this.createLinkMarkup(v, o),
      formatDurationSeconds: (s) => this.formatDurationSeconds(s),
      truncateMiddle: this.truncateMiddle,
    };

    mediaDiv.appendChild(createMediaSub("Media variants (imeta)", createImetaVariants(nip71Metadata.imeta, renderUtils)));
    mediaDiv.appendChild(createMediaSub("Caption tracks", createTextTracks(nip71Metadata.textTracks, renderUtils)));
    mediaDiv.appendChild(createMediaSub("Chapters", createSegments(nip71Metadata.segments, renderUtils)));
    mediaDiv.appendChild(createMediaSub("Hashtags", createHashtags(nip71Metadata.hashtags, renderUtils)));
    mediaDiv.appendChild(createMediaSub("Participants", createParticipants(nip71Metadata.participants, renderUtils)));
    mediaDiv.appendChild(createMediaSub("References", createReferences(nip71Metadata.references, renderUtils)));

    mediaSection.appendChild(mediaDiv);
    wrapper.appendChild(mediaSection);

    this.details.appendChild(wrapper);
  }

  updateConfirmationState() {
    if (!this.confirmButton) {
      return;
    }

    if (!this.selectedRevision || !this.activeVideo) {
      this.pendingEntries = [];
      this.confirmButton.disabled = true;
      if (!this.busy) {
        this.confirmButton.textContent = this.confirmDefaultLabel;
      }
      if (this.statusLabel && (this.revisions || []).length > 1) {
        this.statusLabel.textContent =
          "Select an older revision to enable reverting.";
      }
      return;
    }

    const target = this.selectedRevision;
    const activePubkey =
      typeof this.activeVideo.pubkey === "string"
        ? this.activeVideo.pubkey.toLowerCase()
        : "";

    const revertCandidates = (this.revisions || []).filter((entry) => {
      if (!entry || entry.id === target.id) {
        return false;
      }
      if (entry.deleted) {
        return false;
      }
      if (typeof entry.created_at !== "number") {
        return false;
      }
      if (entry.created_at <= target.created_at) {
        return false;
      }
      if (!entry.pubkey) {
        return false;
      }
      const entryPubkey =
        typeof entry.pubkey === "string" ? entry.pubkey.toLowerCase() : "";
      if (activePubkey && entryPubkey !== activePubkey) {
        return false;
      }
      return true;
    });

    this.pendingEntries = revertCandidates;

    const disable =
      this.busy || target.deleted === true || revertCandidates.length === 0;

    this.confirmButton.disabled = disable;
    if (!this.busy) {
      this.confirmButton.textContent = this.confirmDefaultLabel;
    }

    if (!this.statusLabel) {
      return;
    }

    if (target.deleted) {
      this.statusLabel.textContent =
        "This revision was previously marked as deleted and cannot become active.";
      return;
    }

    if (revertCandidates.length === 0) {
      this.statusLabel.textContent =
        "The selected revision is already the latest active version.";
      return;
    }

    const suffix = revertCandidates.length === 1 ? "revision" : "revisions";
    this.statusLabel.textContent = `Reverting will mark ${revertCandidates.length} newer ${suffix} as reverted.`;
  }

  setBusy(isBusy, label) {
    this.busy = Boolean(isBusy);

    if (this.confirmButton) {
      const disableConfirm =
        this.busy ||
        !this.selectedRevision ||
        !this.pendingEntries ||
        this.pendingEntries.length === 0 ||
        (this.selectedRevision && this.selectedRevision.deleted === true);
      this.confirmButton.disabled = disableConfirm;
      this.confirmButton.textContent = this.busy
        ? label || "Reverting…"
        : this.confirmDefaultLabel;
      this.confirmButton.classList.toggle("cursor-wait", this.busy);
    }

    const toggleInteractionDisabled = (button) => {
      if (!button) {
        return;
      }
      button.disabled = this.busy;
    };

    toggleInteractionDisabled(this.cancelButton);
    toggleInteractionDisabled(this.closeButton);

    if (!this.busy) {
      this.updateConfirmationState();
    }
  }

  handleConfirmClick() {
    if (this.busy) {
      return;
    }

    if (!this.selectedRevision) {
      return;
    }

    const entries = Array.isArray(this.pendingEntries)
      ? this.pendingEntries.slice()
      : [];
    if (!entries.length) {
      this.updateConfirmationState();
      return;
    }

    this.dispatch("video:revert-confirm", {
      target: this.selectedRevision,
      entries,
      video: this.activeVideo,
      context: this.context,
    });
  }

  handleCancelInteraction() {
    if (this.busy) {
      return;
    }

    this.dispatch("video:revert-cancel", {
      context: this.context,
      video: this.activeVideo,
    });
    this.close();
  }

  handleCloseInteraction() {
    if (this.busy) {
      return;
    }
    this.close();
  }

  destroy() {
    if (this.bound) {
      if (this.list) {
        this.list.removeEventListener("click", this.boundHandlers.listClick);
      }
      if (this.confirmButton) {
        this.confirmButton.removeEventListener(
          "click",
          this.boundHandlers.confirm
        );
      }
      if (this.cancelButton) {
        this.cancelButton.removeEventListener(
          "click",
          this.boundHandlers.cancel
        );
      }
      if (this.overlay) {
        this.overlay.removeEventListener("click", this.boundHandlers.overlay);
      }
      if (this.closeButton) {
        this.closeButton.removeEventListener("click", this.boundHandlers.close);
      }
      this.bound = false;
    }

    if (this.modalAccessibility?.destroy) {
      this.modalAccessibility.destroy();
    }
    this.modalAccessibility = null;
    this.modalPanel = null;
  }

  getEscapeFn() {
    return (value) =>
      this.escapeHTML ? this.escapeHTML(String(value ?? "")) : String(value ?? "");
  }

  createPlaceholder(text = "Not provided") {
    const span = document.createElement("span");
    span.className = "text-subtle";
    span.textContent = text;
    return span;
  }

  createListEmpty(text) {
    const p = document.createElement("p");
    p.className = "text-xs text-subtle";
    p.textContent = text;
    return p;
  }

  createLinkMarkup(value, { breakAll = true } = {}) {
    if (value == null) {
      return document.createTextNode("");
    }

    const raw = typeof value === "string" ? value.trim() : String(value ?? "").trim();
    if (!raw) {
      return document.createTextNode("");
    }

    const displayRaw = this.truncateMiddle
      ? this.truncateMiddle(raw, 96)
      : raw;
    const breakClass = breakAll ? "break-all" : "break-words";

    if (/^https?:/i.test(raw)) {
      const a = document.createElement("a");
      a.href = raw;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.className = `text-info hover:text-info-strong ${breakClass}`;
      a.textContent = displayRaw;
      return a;
    }

    const code = document.createElement("code");
    code.className = `rounded bg-overlay-panel-soft px-1.5 py-0.5 text-[0.75rem] text-primary ${breakClass}`;
    code.textContent = displayRaw;
    return code;
  }

  formatDurationSeconds(seconds) {
    if (!Number.isFinite(seconds)) {
      return "";
    }

    const total = Math.max(0, Math.floor(seconds));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const secs = total % 60;

    if (hours > 0) {
      return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
    }

    return `${minutes}:${String(secs).padStart(2, "0")}`;
  }

  buildNip71DisplayMetadata(version) {
    const raw =
      version && typeof version === "object" && version.nip71 && typeof version.nip71 === "object"
        ? version.nip71
        : {};

    const { normalizeNumber, toInputValue } = this.nip71Formatter || {};

    const toString = (value) => {
      if (value == null) {
        return "";
      }
      if (typeof value === "string") {
        return value.trim();
      }
      if (typeof value === "number" || typeof value === "boolean") {
        const converted = toInputValue ? toInputValue(value) : `${value}`;
        return typeof converted === "string" ? converted.trim() : "";
      }
      return "";
    };

    const parseNumeric = (value) => {
      if (value == null) {
        return null;
      }
      if (typeof value === "string" && value.includes(":")) {
        return null;
      }
      if (normalizeNumber) {
        const parsed = normalizeNumber(value);
        if (typeof parsed === "number" && Number.isFinite(parsed)) {
          return parsed;
        }
      }
      if (typeof value === "number" && Number.isFinite(value)) {
        return value;
      }
      if (typeof value === "string") {
        const trimmed = value.trim();
        if (!trimmed) {
          return null;
        }
        const numeric = Number(trimmed);
        return Number.isFinite(numeric) ? numeric : null;
      }
      return null;
    };

    const parseTimestamp = (value) => {
      const rawValue = toString(value);
      if (!rawValue) {
        return { raw: "", seconds: null };
      }

      if (/^\d+(?:\.\d+)?$/.test(rawValue)) {
        const numeric = Number(rawValue);
        if (Number.isFinite(numeric)) {
          const normalized = numeric > 1e12 ? Math.floor(numeric / 1000) : Math.floor(numeric);
          return { raw: rawValue, seconds: normalized };
        }
      }

      const parsed = Date.parse(rawValue);
      if (!Number.isNaN(parsed)) {
        return { raw: rawValue, seconds: Math.floor(parsed / 1000) };
      }

      return { raw: rawValue, seconds: null };
    };

    const collectStrings = (values) => {
      if (!Array.isArray(values)) {
        return [];
      }
      return values
        .map((entry) => toString(entry))
        .map((entry) => entry.trim())
        .filter((entry) => Boolean(entry));
    };

    const collectObjects = (values, mapFn) => {
      if (!Array.isArray(values)) {
        return [];
      }
      return values
        .map((entry) => (entry && typeof entry === "object" ? mapFn(entry) : null))
        .filter((entry) => entry);
    };

    const kindValue = parseNumeric(raw.kind);
    const publishedAt = parseTimestamp(
      raw.publishedAt ?? raw.published_at ?? raw["published-at"]
    );

    const durationNumeric = parseNumeric(raw.duration);
    const durationRaw = durationNumeric != null ? `${durationNumeric}` : toString(raw.duration);

    const imeta = collectObjects(raw.imeta, (variant) => {
      const mapped = {
        m: toString(variant.m),
        dim: toString(variant.dim),
        url: toString(variant.url),
        x: toString(variant.x),
        image: collectStrings(variant.image),
        fallback: collectStrings(variant.fallback),
        service: collectStrings(variant.service),
        autoGenerated: variant.autoGenerated === true,
      };

      const hasContent =
        mapped.m ||
        mapped.dim ||
        mapped.url ||
        mapped.x ||
        mapped.image.length ||
        mapped.fallback.length ||
        mapped.service.length;

      return hasContent ? mapped : null;
    });

    const textTracks = collectObjects(raw.textTracks, (track) => {
      const mapped = {
        url: toString(track.url),
        type: toString(track.type),
        language: toString(track.language),
      };
      return mapped.url || mapped.type || mapped.language ? mapped : null;
    });

    const segments = collectObjects(raw.segments, (segment) => {
      const startNumeric = parseNumeric(segment.start);
      const endNumeric = parseNumeric(segment.end);
      const mapped = {
        startSeconds: startNumeric != null ? Math.max(0, startNumeric) : null,
        endSeconds: endNumeric != null ? Math.max(0, endNumeric) : null,
        startRaw: toString(segment.start),
        endRaw: toString(segment.end),
        title: toString(segment.title),
        thumbnail: toString(segment.thumbnail),
      };
      return mapped.startRaw || mapped.endRaw || mapped.title || mapped.thumbnail
        ? mapped
        : null;
    });

    const hashtags = collectStrings(raw.hashtags);
    const participants = collectObjects(raw.participants, (participant) => {
      const mapped = {
        pubkey: toString(participant.pubkey),
        relay: toString(participant.relay),
      };
      return mapped.pubkey || mapped.relay ? mapped : null;
    });
    const references = collectStrings(raw.references);

    return {
      kind: kindValue != null ? kindValue : toString(raw.kind),
      summary: toString(raw.summary),
      contentWarning:
        toString(raw.contentWarning ?? raw["content-warning"] ?? raw.content_warning),
      publishedAtSeconds: publishedAt.seconds,
      publishedAtRaw: publishedAt.raw,
      durationSeconds: durationNumeric != null ? Math.max(0, durationNumeric) : null,
      durationRaw,
      alt: toString(raw.alt),
      imeta,
      textTracks,
      segments,
      hashtags,
      participants,
      references,
    };
  }


  extractDTagValue(tags) {
    if (!Array.isArray(tags)) {
      return "";
    }
    for (const tag of tags) {
      if (!Array.isArray(tag) || tag.length < 2) {
        continue;
      }
      if (tag[0] === "d" && typeof tag[1] === "string") {
        return tag[1];
      }
    }
    return "";
  }
}

