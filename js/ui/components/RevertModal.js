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
    this.bindEvents();
    this.reset();

    return true;
  }

  cacheElements(modal) {
    this.modal = modal;
    this.overlay = modal.querySelector("#revertVideoModalOverlay") || null;
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

  open(context = {}) {
    if (!this.modal) {
      throw new Error("Revert modal has not been loaded.");
    }

    this.context = context || {};
    this.modal.classList.remove("hidden");
    if (typeof this.setGlobalModalState === "function") {
      this.setGlobalModalState("revertVideo", true);
    }
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

    const escape = (value) =>
      this.escapeHTML ? this.escapeHTML(String(value ?? "")) : String(value ?? "");

    const fallbackThumbnail = escape(this.fallbackThumbnailSrc);
    const thumbnailSrc = thumbnail ? escape(thumbnail) : fallbackThumbnail;
    const thumbnailAlt = thumbnail ? "Revision thumbnail" : "Fallback thumbnail";

    let urlHtml = '<span class="text-gray-500">None</span>';
    if (url) {
      const safeUrl = escape(url);
      const displayUrl = this.truncateMiddle
        ? escape(this.truncateMiddle(url, 72))
        : safeUrl;
      urlHtml = `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer" class="text-blue-400 hover:text-blue-300 break-all">${displayUrl}</a>`;
    }

    let magnetHtml = '<span class="text-gray-500">None</span>';
    if (displayMagnet) {
      const label = this.truncateMiddle
        ? escape(this.truncateMiddle(displayMagnet, 72))
        : escape(displayMagnet);
      const caption = isPrivate
        ? '<span class="block text-xs text-purple-200/90 mt-1">Magnet stays visible only to you — private notes keep the raw string local.</span>'
        : "";
      magnetHtml = `<div class="break-all">${label}${caption}</div>`;
    }

    const chips = [];
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
    if (version.version !== undefined) {
      chips.push(
        `<span class="inline-flex items-center rounded-full border border-gray-700 bg-gray-800/80 px-2 py-0.5 text-xs text-gray-200">Schema v${escape(
          String(version.version)
        )}</span>`
      );
    }

    const descriptionHtml = description
      ? `<p class="whitespace-pre-wrap text-gray-200">${escape(
          description
        )}</p>`
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

    this.details.innerHTML = `
      <div class="space-y-4">
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
              <p class="text-xs text-gray-400">${escape(absolute)} (${escape(
      relative
    )})</p>
            </div>
            ${
              chips.length
                ? `<div class="flex flex-wrap gap-2">${chips.join("")}</div>`
                : ""
            }
            <div class="space-y-2 text-sm text-gray-200">
              <div>
                <span class="font-medium text-gray-300">Hosted URL:</span>
                <div class="mt-1">${urlHtml}</div>
              </div>
              <div>
                <span class="font-medium text-gray-300">Magnet:</span>
                <div class="mt-1">${magnetHtml}</div>
              </div>
            </div>
          </div>
        </div>

        <div class="space-y-2">
          <h4 class="text-sm font-semibold text-gray-200">Description</h4>
          ${descriptionHtml}
        </div>

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

