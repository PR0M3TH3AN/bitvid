import { Nip71FormManager } from "./nip71FormManager.js";
import { createModalAccessibility } from "./modalAccessibility.js";

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
      wrapper.innerHTML = html;
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
      this.list.innerHTML = "";
    }

    if (this.details) {
      if (this.detailsDefaultHTML) {
        this.details.innerHTML = this.detailsDefaultHTML;
        this.placeholder = this.details.querySelector("#revertVersionPlaceholder");
      } else {
        this.details.innerHTML = "";
      }
    }

    if (this.confirmButton) {
      this.confirmButton.disabled = true;
      this.confirmButton.textContent = this.confirmDefaultLabel;
      this.confirmButton.classList.remove("cursor-wait");
    }

    const toggleDisabledStyles = (button) => {
      if (!button) {
        return;
      }
      button.disabled = false;
      button.classList.remove("opacity-60", "cursor-not-allowed");
    };

    toggleDisabledStyles(this.cancelButton);
    toggleDisabledStyles(this.closeButton);
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

    this.list.innerHTML = "";

    if (!this.revisions.length) {
      this.list.innerHTML =
        '<p class="text-xs text-gray-500">No revisions found.</p>';
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
        "focus:ring-offset-gray-900",
      ];

      if (isSelected) {
        classes.push(
          "border-blue-500",
          "bg-blue-500/20",
          "text-blue-100",
          "focus:ring-blue-500"
        );
      } else if (isCurrent) {
        classes.push(
          "border-green-500/60",
          "bg-green-500/10",
          "text-green-100",
          "focus:ring-green-500/80"
        );
      } else if (isDeleted) {
        classes.push(
          "border-red-800/70",
          "bg-red-900/30",
          "text-red-200/90",
          "hover:bg-red-900/40"
        );
      } else {
        classes.push(
          "border-gray-800",
          "bg-gray-800/60",
          "hover:bg-gray-700/70",
          "text-gray-200"
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
        ? "text-red-200/80"
        : "text-gray-400";

      const escape = (value) =>
        this.escapeHTML ? this.escapeHTML(String(value ?? "")) : String(value ?? "");

      button.innerHTML = `
        <div class="flex items-start justify-between gap-3">
          <div class="space-y-1">
            <p class="font-semibold">${escape(entry.title || "Untitled")}</p>
            <p class="text-xs text-gray-300">${escape(relative)} • ${escape(absolute)}</p>
            ${meta ? `<p class="text-xs ${metaClass}">${escape(meta)}</p>` : ""}
          </div>
          <div class="text-xs uppercase tracking-wide text-gray-400">
            ${escape(versionLabel)}
          </div>
        </div>
      `;

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

    if (!version) {
      if (this.detailsDefaultHTML) {
        this.details.innerHTML = this.detailsDefaultHTML;
        this.placeholder = this.details.querySelector("#revertVersionPlaceholder");
      } else {
        this.details.innerHTML = "";
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

    const escape = this.getEscapeFn();
    const nip71Metadata = this.buildNip71DisplayMetadata(version);

    const fallbackThumbnail = escape(this.fallbackThumbnailSrc);
    const thumbnailSrc = thumbnail ? escape(thumbnail) : fallbackThumbnail;
    const thumbnailAlt = thumbnail ? "Revision thumbnail" : "Fallback thumbnail";

    let urlHtml = this.renderPlaceholder("None");
    if (url) {
      urlHtml = this.buildLinkMarkup(url);
    }

    let magnetHtml = this.renderPlaceholder("None");
    if (displayMagnet) {
      const labelRaw = this.truncateMiddle
        ? this.truncateMiddle(displayMagnet, 72)
        : displayMagnet;
      const label = escape(labelRaw);
      const caption = isPrivate
        ? '<span class="block text-xs text-purple-200/90 mt-1">Magnet stays visible only to you — private notes keep the raw string local.</span>'
        : "";
      magnetHtml = `<div class="break-all">${label}${caption}</div>`;
    }

    const chips = [];
    const nsfwFlag = version.isNsfw === true;
    const forKidsFlag = version.isForKids === true;
    const conflictingAudienceFlags = nsfwFlag && forKidsFlag;
    if (version.deleted) {
      chips.push(
        '<span class="inline-flex items-center rounded-full border border-red-700/70 bg-red-900/40 px-2 py-0.5 text-xs text-red-200/90">Marked deleted</span>'
      );
    }
    if (isPrivate) {
      chips.push(
        '<span class="inline-flex items-center rounded-full border border-purple-600/60 bg-purple-900/40 px-2 py-0.5 text-xs text-purple-200/90">Private</span>'
      );
    }
    if (conflictingAudienceFlags) {
      chips.push(
        '<span class="inline-flex items-center rounded-full border border-amber-700/70 bg-amber-900/40 px-2 py-0.5 text-xs text-amber-200/90">NSFW + For kids conflict</span>'
      );
    } else {
      if (nsfwFlag) {
        chips.push(
          '<span class="inline-flex items-center rounded-full border border-red-700/70 bg-red-900/40 px-2 py-0.5 text-xs text-red-200/90">Marked NSFW</span>'
        );
      }
      if (forKidsFlag) {
        chips.push(
          '<span class="inline-flex items-center rounded-full border border-emerald-700/70 bg-emerald-900/40 px-2 py-0.5 text-xs text-emerald-200/90">For kids</span>'
        );
      }
    }
    if (version.version !== undefined) {
      chips.push(
        `<span class="inline-flex items-center rounded-full border border-gray-700 bg-gray-800/80 px-2 py-0.5 text-xs text-gray-200">Schema v${escape(
          String(version.version)
        )}</span>`
      );
    }

    const renderFlagStatus = (value, {
      yesLabel = "Yes",
      noLabel = "No",
      unspecifiedLabel = "Not specified",
    } = {}) => {
      if (value === true) {
        return `<span class="text-gray-200">${escape(yesLabel)}</span>`;
      }
      if (value === false) {
        return `<span class="text-gray-200">${escape(noLabel)}</span>`;
      }
      return this.renderPlaceholder(unspecifiedLabel);
    };

    const nsfwStatusHtml = renderFlagStatus(version.isNsfw, {
      yesLabel: "Yes — marked NSFW",
      noLabel: "No — not flagged as NSFW",
      unspecifiedLabel: "Not specified",
    });
    const kidsStatusHtml = renderFlagStatus(version.isForKids, {
      yesLabel: "Yes — marked for kids",
      noLabel: "No — not marked for kids",
      unspecifiedLabel: "Not specified",
    });

    const audienceConflictNotice = conflictingAudienceFlags
      ? '<p class="text-xs text-amber-300">Conflicting flags detected — this revision is marked both NSFW and for kids. Review before reverting.</p>'
      : "";

    const descriptionHtml = description
      ? `<p class="whitespace-pre-wrap text-gray-200">${escape(description)}</p>`
      : '<p class="text-gray-500">No description provided.</p>';

    const rootId =
      typeof version.videoRootId === "string" ? version.videoRootId : "";
    const rootDisplay = rootId
      ? this.truncateMiddle
        ? escape(this.truncateMiddle(rootId, 64))
        : escape(rootId)
      : "";
    const eventDisplay = version.id
      ? this.truncateMiddle
        ? escape(this.truncateMiddle(version.id, 64))
        : escape(version.id)
      : "";

    const timestampParts = [];
    if (absolute) {
      timestampParts.push(escape(absolute));
    }
    if (relative) {
      timestampParts.push(`(${escape(relative)})`);
    }
    const timestampHtml = timestampParts.length
      ? timestampParts.join(" ")
      : escape(absolute || relative || "");

    const formatTimestamp = (seconds, raw) => {
      if (Number.isFinite(seconds)) {
        const absoluteLabel = this.formatAbsoluteTimestamp
          ? this.formatAbsoluteTimestamp(seconds)
          : `${seconds}`;
        const relativeLabel = this.formatTimeAgo
          ? this.formatTimeAgo(seconds)
          : "";
        const parts = [];
        if (absoluteLabel) {
          parts.push(`<span class="text-gray-200">${escape(absoluteLabel)}</span>`);
        }
        if (relativeLabel) {
          parts.push(`<span class="text-gray-400">(${escape(relativeLabel)})</span>`);
        }
        if (parts.length) {
          return parts.join(" ");
        }
      }
      if (raw) {
        return `<span class="text-gray-200">${escape(raw)}</span>`;
      }
      return this.renderPlaceholder();
    };

    const formatDuration = (seconds, raw) => {
      if (Number.isFinite(seconds)) {
        const display = this.formatDurationSeconds(seconds);
        const suffix = seconds === 1 ? "second" : "seconds";
        return `<span class="text-gray-200">${escape(display)}</span> <span class="text-gray-500">(${escape(
          `${seconds} ${suffix}`
        )})</span>`;
      }
      if (raw) {
        return `<span class="text-gray-200">${escape(raw)}</span>`;
      }
      return this.renderPlaceholder();
    };

    const kindValue = nip71Metadata.kind;
    let kindHtml = this.renderPlaceholder();
    if (kindValue !== "" && kindValue !== null && kindValue !== undefined) {
      const label = typeof kindValue === "number" ? kindValue : `${kindValue}`;
      const numeric = Number(label);
      let suffix = "";
      if (Number.isFinite(numeric)) {
        if (numeric === 22) {
          suffix = "short";
        } else if (numeric === 21) {
          suffix = "video";
        }
      }
      const badge = `<code class="rounded bg-gray-800/80 px-1.5 py-0.5 text-gray-100">kind ${escape(
        label
      )}</code>`;
      kindHtml = suffix
        ? `${badge} <span class="text-gray-400">(${escape(suffix)})</span>`
        : badge;
    }

    const summaryHtml = nip71Metadata.summary
      ? `<p class="whitespace-pre-wrap text-gray-200">${escape(
          nip71Metadata.summary
        )}</p>`
      : this.renderPlaceholder("Not provided");
    const contentWarningHtml = nip71Metadata.contentWarning
      ? `<span class="inline-flex items-center rounded-full border border-amber-700/70 bg-amber-900/40 px-2 py-0.5 text-xs text-amber-200/90">${escape(
          nip71Metadata.contentWarning
        )}</span>`
      : this.renderPlaceholder("Not provided");
    const publishedAtHtml = formatTimestamp(
      nip71Metadata.publishedAtSeconds,
      nip71Metadata.publishedAtRaw
    );
    const durationHtml = formatDuration(
      nip71Metadata.durationSeconds,
      nip71Metadata.durationRaw
    );
    const altHtml = nip71Metadata.alt
      ? `<p class="whitespace-pre-wrap text-gray-200">${escape(nip71Metadata.alt)}</p>`
      : this.renderPlaceholder("Not provided");

    const definition = (label, valueHtml, { span = 1 } = {}) => {
      const colSpan = span > 1 ? "sm:col-span-2" : "";
      return `
        <div class="${colSpan}">
          <dt class="font-semibold text-gray-200">${escape(label)}</dt>
          <dd class="mt-1">${valueHtml}</dd>
        </div>
      `;
    };

    const eventMetadataRows = [
      definition("NIP-71 kind", kindHtml),
      definition("Summary", summaryHtml, { span: 2 }),
      definition("Content warning", contentWarningHtml, { span: 2 }),
      definition("Published timestamp", publishedAtHtml),
      definition("Duration", durationHtml),
      definition("Alt text", altHtml, { span: 2 }),
    ].join("");

    const audienceRows = [
      definition("NSFW flag", nsfwStatusHtml),
      definition("For kids flag", kidsStatusHtml),
    ].join("");

    this.details.innerHTML = `
      <div class="space-y-6">
        <div class="flex flex-col gap-4 lg:flex-row lg:items-start">
          <div class="overflow-hidden rounded-md border border-gray-800 bg-black/40 w-full max-w-sm">
            <img
              src="${thumbnailSrc}"
              alt="${escape(thumbnailAlt)}"
              class="w-full h-auto object-cover"
              loading="lazy"
            />
          </div>
          <div class="flex-1 space-y-3">
            <div class="space-y-1">
              <h3 class="text-lg font-semibold text-white">${escape(
                version.title || "Untitled"
              )}</h3>
              <p class="text-xs text-gray-400">${timestampHtml}</p>
            </div>
            ${
              chips.length
                ? `<div class="flex flex-wrap gap-2">${chips.join("")}</div>`
                : ""
            }
            <dl class="grid gap-3 sm:grid-cols-2 text-xs text-gray-300">
              <div>
                <dt class="font-semibold text-gray-200">Hosted URL</dt>
                <dd class="mt-1">${urlHtml}</dd>
              </div>
              <div>
                <dt class="font-semibold text-gray-200">Magnet</dt>
                <dd class="mt-1">${magnetHtml}</dd>
              </div>
            </dl>
          </div>
        </div>

        <section class="space-y-2">
          <h4 class="text-sm font-semibold text-gray-200">Description</h4>
          ${descriptionHtml}
        </section>

        <section class="space-y-2">
          <h4 class="text-sm font-semibold text-gray-200">Audience flags</h4>
          <dl class="grid gap-3 sm:grid-cols-2 text-xs text-gray-300">
            ${audienceRows}
          </dl>
          ${audienceConflictNotice}
        </section>

        <section class="space-y-2">
          <h4 class="text-sm font-semibold text-gray-200">NIP-71 event metadata</h4>
          <dl class="grid gap-3 sm:grid-cols-2 text-xs text-gray-300">
            ${eventMetadataRows}
          </dl>
        </section>

        <section class="space-y-2">
          <h4 class="text-sm font-semibold text-gray-200">Note pointers</h4>
          <dl class="grid gap-3 sm:grid-cols-2 text-xs text-gray-300">
            <div>
              <dt class="font-semibold text-gray-200">Mode</dt>
              <dd class="mt-1">${escape(version.mode || "live")}</dd>
            </div>
            <div>
              <dt class="font-semibold text-gray-200">d tag</dt>
              <dd class="mt-1">
                ${
                  dTagValue
                    ? `<code class="rounded bg-gray-800/80 px-1.5 py-0.5">${escape(
                        dTagValue
                      )}</code>`
                    : '<span class="text-gray-500">Not provided</span>'
                }
              </dd>
            </div>
            <div>
              <dt class="font-semibold text-gray-200">videoRootId</dt>
              <dd class="mt-1">
                ${
                  rootDisplay
                    ? `<code class="break-all rounded bg-gray-800/80 px-1.5 py-0.5" title="${escape(
                        rootId
                      )}">${rootDisplay}</code>`
                    : '<span class="text-gray-500">Not provided</span>'
                }
              </dd>
            </div>
            <div>
              <dt class="font-semibold text-gray-200">Event ID</dt>
              <dd class="mt-1">
                ${
                  eventDisplay
                    ? `<code class="break-all rounded bg-gray-800/80 px-1.5 py-0.5" title="${escape(
                        version.id || ""
                      )}">${eventDisplay}</code>`
                    : '<span class="text-gray-500">Unknown</span>'
                }
              </dd>
            </div>
          </dl>
        </section>

        <section class="space-y-4">
          <h4 class="text-sm font-semibold text-gray-200">NIP-71 media metadata</h4>
          <div class="space-y-4">
            <div class="space-y-2">
              <h5 class="text-xs font-semibold uppercase tracking-wide text-gray-400">Media variants (imeta)</h5>
              ${this.renderImetaVariants(nip71Metadata.imeta)}
            </div>
            <div class="space-y-2">
              <h5 class="text-xs font-semibold uppercase tracking-wide text-gray-400">Caption tracks</h5>
              ${this.renderTextTracks(nip71Metadata.textTracks)}
            </div>
            <div class="space-y-2">
              <h5 class="text-xs font-semibold uppercase tracking-wide text-gray-400">Chapters</h5>
              ${this.renderSegments(nip71Metadata.segments)}
            </div>
            <div class="space-y-2">
              <h5 class="text-xs font-semibold uppercase tracking-wide text-gray-400">Hashtags</h5>
              ${this.renderHashtags(nip71Metadata.hashtags)}
            </div>
            <div class="space-y-2">
              <h5 class="text-xs font-semibold uppercase tracking-wide text-gray-400">Participants</h5>
              ${this.renderParticipants(nip71Metadata.participants)}
            </div>
            <div class="space-y-2">
              <h5 class="text-xs font-semibold uppercase tracking-wide text-gray-400">References</h5>
              ${this.renderReferences(nip71Metadata.references)}
            </div>
          </div>
        </section>
      </div>
    `;
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

    const toggleDisabledStyles = (button) => {
      if (!button) {
        return;
      }
      button.disabled = this.busy;
      button.classList.toggle("opacity-60", this.busy);
      button.classList.toggle("cursor-not-allowed", this.busy);
    };

    toggleDisabledStyles(this.cancelButton);
    toggleDisabledStyles(this.closeButton);

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

  renderPlaceholder(text = "Not provided") {
    const escape = this.getEscapeFn();
    return `<span class="text-gray-500">${escape(text)}</span>`;
  }

  renderListEmpty(text) {
    const escape = this.getEscapeFn();
    return `<p class="text-xs text-gray-500">${escape(text)}</p>`;
  }

  buildLinkMarkup(value, { breakAll = true } = {}) {
    if (value == null) {
      return "";
    }

    const escape = this.getEscapeFn();
    const raw = typeof value === "string" ? value.trim() : String(value ?? "").trim();
    if (!raw) {
      return "";
    }

    const displayRaw = this.truncateMiddle
      ? this.truncateMiddle(raw, 96)
      : raw;
    const safeDisplay = escape(displayRaw);
    const safeValue = escape(raw);
    const breakClass = breakAll ? " break-all" : " break-words";

    if (/^https?:/i.test(raw)) {
      return `<a href="${safeValue}" target="_blank" rel="noopener noreferrer" class="text-blue-400 hover:text-blue-300${breakClass}">${safeDisplay}</a>`;
    }

    return `<code class="rounded bg-gray-800/70 px-1.5 py-0.5 text-[0.75rem] text-gray-200${breakClass}">${safeDisplay}</code>`;
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

  renderImetaVariants(variants) {
    if (!Array.isArray(variants) || variants.length === 0) {
      return this.renderListEmpty("No media variants provided.");
    }

    const escape = this.getEscapeFn();

    return `<ol class="space-y-3">${variants
      .map((variant, index) => {
        if (!variant) {
          return "";
        }

        const badges = [];
        if (variant.autoGenerated) {
          badges.push(
            '<span class="inline-flex items-center rounded-full border border-amber-600/70 bg-amber-900/30 px-2 py-0.5 text-[0.65rem] uppercase tracking-wide text-amber-200/90">Auto-generated</span>'
          );
        }

        const variantNumber = `Variant ${index + 1}`;

        const mimeHtml = variant.m
          ? `<code class="rounded bg-gray-800/80 px-1.5 py-0.5 text-gray-100">${escape(
              variant.m
            )}</code>`
          : this.renderPlaceholder();
        const dimHtml = variant.dim
          ? `<code class="rounded bg-gray-800/80 px-1.5 py-0.5 text-gray-100">${escape(
              variant.dim
            )}</code>`
          : this.renderPlaceholder();
        const urlHtml = variant.url
          ? this.buildLinkMarkup(variant.url)
          : this.renderPlaceholder("No URL");
        const hashHtml = variant.x
          ? `<code class="break-all rounded bg-gray-800/80 px-1.5 py-0.5 text-gray-100">${escape(
              variant.x
            )}</code>`
          : this.renderPlaceholder("Not provided");

        const renderNestedList = (label, values, emptyLabel) => {
          if (!Array.isArray(values) || values.length === 0) {
            return `<div><p class="text-[0.7rem] uppercase tracking-wide text-gray-500">${escape(
              label
            )}</p>${this.renderListEmpty(emptyLabel)}</div>`;
          }

          const items = values
            .map((entry) => this.buildLinkMarkup(entry))
            .filter(Boolean)
            .map((markup) => `<li>${markup}</li>`);

          if (!items.length) {
            return `<div><p class="text-[0.7rem] uppercase tracking-wide text-gray-500">${escape(
              label
            )}</p>${this.renderListEmpty(emptyLabel)}</div>`;
          }

          return `
            <div>
              <p class="text-[0.7rem] uppercase tracking-wide text-gray-500">${escape(
                label
              )}</p>
              <ul class="mt-1 space-y-1 text-xs text-gray-200">${items.join("")}</ul>
            </div>
          `;
        };

        const nestedSections = [
          renderNestedList("Images", variant.image, "No image URLs."),
          renderNestedList("Fallbacks", variant.fallback, "No fallback URLs."),
          renderNestedList("Services", variant.service, "No service hints."),
        ].join("");

        return `
          <li class="rounded-md border border-gray-800/70 bg-black/30 p-3 space-y-3">
            <div class="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-400">
              <span class="font-semibold text-gray-200">${escape(variantNumber)}</span>
              ${badges.length ? `<div class="flex flex-wrap gap-2">${badges.join("")}</div>` : ""}
            </div>
            <dl class="grid gap-3 sm:grid-cols-2 text-xs text-gray-300">
              <div>
                <dt class="font-semibold text-gray-200">MIME type</dt>
                <dd class="mt-1">${mimeHtml}</dd>
              </div>
              <div>
                <dt class="font-semibold text-gray-200">Dimensions</dt>
                <dd class="mt-1">${dimHtml}</dd>
              </div>
              <div class="sm:col-span-2">
                <dt class="font-semibold text-gray-200">URL</dt>
                <dd class="mt-1">${urlHtml}</dd>
              </div>
              <div class="sm:col-span-2">
                <dt class="font-semibold text-gray-200">Content hash</dt>
                <dd class="mt-1">${hashHtml}</dd>
              </div>
            </dl>
            <div class="grid gap-3 sm:grid-cols-3 text-xs text-gray-300">
              ${nestedSections}
            </div>
          </li>
        `;
      })
      .join("")}</ol>`;
  }

  renderTextTracks(tracks) {
    if (!Array.isArray(tracks) || tracks.length === 0) {
      return this.renderListEmpty("No caption tracks.");
    }

    const escape = this.getEscapeFn();

    return `<ol class="space-y-3">${tracks
      .map((track, index) => {
        const headerLabel = `Track ${index + 1}`;
        const urlHtml = track.url
          ? this.buildLinkMarkup(track.url)
          : this.renderPlaceholder("No URL");
        const typeHtml = track.type
          ? `<code class="rounded bg-gray-800/80 px-1.5 py-0.5 text-gray-100">${escape(
              track.type
            )}</code>`
          : this.renderPlaceholder();
        const languageHtml = track.language
          ? `<span class="inline-flex items-center rounded-full border border-gray-700 bg-gray-800/70 px-2 py-0.5 text-[0.7rem] uppercase tracking-wide text-gray-200">${escape(
              track.language
            )}</span>`
          : this.renderPlaceholder();

        return `
          <li class="rounded-md border border-gray-800/70 bg-black/30 p-3 space-y-3">
            <div class="flex items-center justify-between text-xs text-gray-400">
              <span class="font-semibold text-gray-200">${escape(headerLabel)}</span>
              ${track.language ? languageHtml : ""}
            </div>
            <dl class="grid gap-3 sm:grid-cols-2 text-xs text-gray-300">
              <div class="sm:col-span-2">
                <dt class="font-semibold text-gray-200">URL</dt>
                <dd class="mt-1">${urlHtml}</dd>
              </div>
              <div>
                <dt class="font-semibold text-gray-200">Type</dt>
                <dd class="mt-1">${typeHtml}</dd>
              </div>
              <div>
                <dt class="font-semibold text-gray-200">Language</dt>
                <dd class="mt-1">${track.language ? languageHtml : this.renderPlaceholder()}</dd>
              </div>
            </dl>
          </li>
        `;
      })
      .join("")}</ol>`;
  }

  renderSegments(segments) {
    if (!Array.isArray(segments) || segments.length === 0) {
      return this.renderListEmpty("No chapter segments.");
    }

    const escape = this.getEscapeFn();

    const formatTime = (seconds, raw) => {
      if (Number.isFinite(seconds)) {
        const display = this.formatDurationSeconds(seconds);
        const suffix = seconds === 1 ? "second" : "seconds";
        return `<span class="text-gray-200">${escape(display)}</span> <span class="text-gray-500">(${escape(
          `${seconds} ${suffix}`
        )})</span>`;
      }
      if (raw) {
        return `<span class="text-gray-200">${escape(raw)}</span>`;
      }
      return this.renderPlaceholder();
    };

    return `<ol class="space-y-3">${segments
      .map((segment, index) => {
        const headerLabel = `Chapter ${index + 1}`;
        const startHtml = formatTime(segment.startSeconds, segment.startRaw);
        const endHtml = formatTime(segment.endSeconds, segment.endRaw);
        const titleHtml = segment.title
          ? `<p class="whitespace-pre-wrap text-gray-200">${escape(segment.title)}</p>`
          : this.renderPlaceholder("No title");
        const thumbnailHtml = segment.thumbnail
          ? this.buildLinkMarkup(segment.thumbnail)
          : this.renderPlaceholder("No thumbnail");

        return `
          <li class="rounded-md border border-gray-800/70 bg-black/30 p-3 space-y-3">
            <div class="text-xs font-semibold text-gray-200">${escape(headerLabel)}</div>
            <dl class="grid gap-3 sm:grid-cols-2 text-xs text-gray-300">
              <div>
                <dt class="font-semibold text-gray-200">Start</dt>
                <dd class="mt-1">${startHtml}</dd>
              </div>
              <div>
                <dt class="font-semibold text-gray-200">End</dt>
                <dd class="mt-1">${endHtml}</dd>
              </div>
              <div class="sm:col-span-2">
                <dt class="font-semibold text-gray-200">Title</dt>
                <dd class="mt-1">${titleHtml}</dd>
              </div>
              <div class="sm:col-span-2">
                <dt class="font-semibold text-gray-200">Thumbnail</dt>
                <dd class="mt-1">${thumbnailHtml}</dd>
              </div>
            </dl>
          </li>
        `;
      })
      .join("")}</ol>`;
  }

  renderHashtags(hashtags) {
    if (!Array.isArray(hashtags) || hashtags.length === 0) {
      return this.renderListEmpty("No hashtags provided.");
    }

    const escape = this.getEscapeFn();

    const chips = hashtags.map((tag) => {
      const label = tag.startsWith("#") ? tag : `#${tag}`;
      return `<span class="inline-flex items-center rounded-full border border-gray-700 bg-gray-800/70 px-2 py-0.5 text-xs text-gray-200">${escape(
        label
      )}</span>`;
    });

    return `<div class="flex flex-wrap gap-2">${chips.join("")}</div>`;
  }

  renderParticipants(participants) {
    if (!Array.isArray(participants) || participants.length === 0) {
      return this.renderListEmpty("No participants listed.");
    }

    const escape = this.getEscapeFn();

    return `<ol class="space-y-3">${participants
      .map((participant, index) => {
        const label = `Participant ${index + 1}`;
        const displayPubkey = participant.pubkey
          ? this.truncateMiddle
            ? this.truncateMiddle(participant.pubkey, 48)
            : participant.pubkey
          : "";
        const pubkeyHtml = participant.pubkey
          ? `<code class="break-all rounded bg-gray-800/80 px-1.5 py-0.5 text-gray-100" title="${escape(
              participant.pubkey
            )}">${escape(displayPubkey)}</code>`
          : this.renderPlaceholder("No pubkey");
        const relayHtml = participant.relay
          ? this.buildLinkMarkup(participant.relay, { breakAll: false })
          : this.renderPlaceholder("No relay specified");

        return `
          <li class="rounded-md border border-gray-800/70 bg-black/30 p-3 space-y-2">
            <div class="text-xs font-semibold text-gray-200">${escape(label)}</div>
            <dl class="grid gap-3 sm:grid-cols-2 text-xs text-gray-300">
              <div class="sm:col-span-2">
                <dt class="font-semibold text-gray-200">Pubkey</dt>
                <dd class="mt-1">${pubkeyHtml}</dd>
              </div>
              <div class="sm:col-span-2">
                <dt class="font-semibold text-gray-200">Relay</dt>
                <dd class="mt-1">${relayHtml}</dd>
              </div>
            </dl>
          </li>
        `;
      })
      .join("")}</ol>`;
  }

  renderReferences(references) {
    if (!Array.isArray(references) || references.length === 0) {
      return this.renderListEmpty("No external references.");
    }

    const items = references
      .map((entry) => this.buildLinkMarkup(entry))
      .filter(Boolean)
      .map((markup) => `<li>${markup}</li>`);

    if (!items.length) {
      return this.renderListEmpty("No external references.");
    }

    return `<ul class="space-y-1 text-xs text-gray-200">${items.join("")}</ul>`;
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

