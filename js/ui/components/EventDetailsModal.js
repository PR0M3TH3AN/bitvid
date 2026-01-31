import { prepareStaticModal, openStaticModal, closeStaticModal } from "./staticModalAccessibility.js";
import { sanitizeProfileMediaUrl } from "../../utils/profileMedia.js";
import { userLogger } from "../../utils/logger.js";

const DEFAULT_PROFILE_AVATAR = "assets/svg/default-profile.svg";

export class EventDetailsModal {
  constructor({
    app,
    document: doc,
    helpers = {},
    callbacks = {},
  } = {}) {
    this.app = app;
    this.document = doc || document;
    this.helpers = {
      escapeHtml: helpers.escapeHtml || ((str) => str),
      formatAbsoluteTimestamp: helpers.formatAbsoluteTimestamp || ((ts) => new Date(ts * 1000).toLocaleString()),
      safeEncodeNpub: helpers.safeEncodeNpub || ((pk) => pk),
      ...helpers,
    };
    this.callbacks = {
      showError: callbacks.showError || (() => {}),
      showSuccess: callbacks.showSuccess || (() => {}),
      openCreatorChannel: callbacks.openCreatorChannel || (() => {}),
      ...callbacks,
    };

    this.root = null;
    this.history = [];
    this.currentIndex = 0;
    this.isLoadingHistory = false;
    this.currentVideo = null;
  }

  buildMarkup() {
    return `
      <div class="bv-modal-backdrop" data-dismiss></div>
      <div class="modal-sheet w-full max-w-2xl flex flex-col max-h-[90vh]" role="dialog" aria-modal="true" aria-labelledby="eventDetailsTitle">
        <header class="modal-header flex items-center justify-between p-4 border-b border-border">
          <h2 id="eventDetailsTitle" class="text-lg font-semibold text-text">Event Details</h2>
          <button type="button" class="btn-ghost p-2 rounded-full" data-dismiss aria-label="Close">
            <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 6L6 18M6 6l12 12" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
        </header>

        <div class="modal-body p-4 overflow-y-auto space-y-6 flex-1">
          <!-- Metadata Section -->
          <section class="space-y-4">
            <h3 class="text-sm font-semibold text-muted uppercase tracking-wider">Metadata</h3>

            <!-- Author -->
            <div class="flex items-start gap-3">
              <div class="w-10 h-10 rounded-full bg-panel overflow-hidden flex-shrink-0">
                <img data-author-pic src="${DEFAULT_PROFILE_AVATAR}" alt="Author" class="w-full h-full object-cover">
              </div>
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2">
                  <span data-author-name class="font-medium text-text truncate">Unknown</span>
                  <button type="button" data-action="open-channel" class="text-xs text-critical hover:underline">View Channel</button>
                </div>
                <div class="flex items-center gap-2 mt-1">
                  <code data-author-npub class="text-xs text-muted truncate bg-panel/50 px-1.5 py-0.5 rounded max-w-[200px]"></code>
                  <button type="button" data-action="copy-npub" class="text-xs text-muted hover:text-text" title="Copy Npub">
                    <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 4v12a2 2 0 002 2h8a2 2 0 002-2V7.242a2 2 0 00-.602-1.43L16.083 4.162A2 2 0 0014.661 4H10a2 2 0 00-2 2z"></path><path d="M16 4v3.5a.5.5 0 00.5.5H20"></path><path d="M4 8v12a2 2 0 002 2h8"></path></svg>
                  </button>
                </div>
              </div>
            </div>

            <!-- Timestamp & ID -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div class="bg-panel/50 rounded p-3">
                <span class="text-xs text-muted block mb-1">Posted At</span>
                <div class="flex items-center gap-2">
                  <span data-timestamp class="text-sm text-text font-mono"></span>
                  <button type="button" data-action="copy-timestamp" class="text-muted hover:text-text" title="Copy Unix Timestamp">
                    <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 4v12a2 2 0 002 2h8a2 2 0 002-2V7.242a2 2 0 00-.602-1.43L16.083 4.162A2 2 0 0014.661 4H10a2 2 0 00-2 2z"></path><path d="M16 4v3.5a.5.5 0 00.5.5H20"></path><path d="M4 8v12a2 2 0 002 2h8"></path></svg>
                  </button>
                </div>
              </div>

              <div class="bg-panel/50 rounded p-3">
                <span class="text-xs text-muted block mb-1">Event ID</span>
                <div class="flex items-center gap-2">
                  <code data-event-id class="text-xs text-text truncate block flex-1"></code>
                  <button type="button" data-action="copy-id" class="text-muted hover:text-text flex-shrink-0" title="Copy Event ID">
                    <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 4v12a2 2 0 002 2h8a2 2 0 002-2V7.242a2 2 0 00-.602-1.43L16.083 4.162A2 2 0 0014.661 4H10a2 2 0 00-2 2z"></path><path d="M16 4v3.5a.5.5 0 00.5.5H20"></path><path d="M4 8v12a2 2 0 002 2h8"></path></svg>
                  </button>
                </div>
              </div>
            </div>
          </section>

          <!-- Raw Data Section -->
          <section class="space-y-2 flex-1 flex flex-col min-h-0">
            <div class="flex items-center justify-between">
              <h3 class="text-sm font-semibold text-muted uppercase tracking-wider">Raw Data</h3>
              <button type="button" data-action="copy-json" class="text-xs btn-ghost px-2 py-1 rounded">
                Copy JSON
              </button>
            </div>
            <div class="relative flex-1 min-h-[200px] bg-black/80 rounded-lg border border-border overflow-hidden group">
              <pre class="absolute inset-0 p-4 overflow-auto text-xs font-mono text-white/80 scrollbar-thin"><code data-json-content></code></pre>
            </div>
          </section>
        </div>

        <footer class="modal-footer p-4 border-t border-border bg-panel/30 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div class="text-sm text-muted font-medium order-2 sm:order-1">
            <span data-version-indicator>Loading history...</span>
          </div>

          <div class="flex items-center gap-2 order-1 sm:order-2">
            <button type="button" data-action="view-older" class="btn-ghost flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed" title="View Older Version">
              <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg>
              <span>Older</span>
            </button>
            <button type="button" data-action="view-newer" class="btn-ghost flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed" title="View Newer Version">
              <span>Newer</span>
              <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>
            </button>
          </div>
        </footer>
      </div>
    `;
  }

  ensureModal() {
    if (this.root) {
      return this.root;
    }

    const container = this.document.getElementById("modalContainer") || this.document.body;
    const modal = this.document.createElement("div");
    modal.id = "eventDetailsModal";
    modal.className = "bv-modal modal-always-on-top hidden items-center justify-center p-4";
    modal.innerHTML = this.buildMarkup();

    this.root = modal;

    // Bind generic events
    const closeBtns = modal.querySelectorAll("[data-dismiss]");
    closeBtns.forEach(btn => {
      btn.addEventListener("click", () => this.close());
    });

    // Action delegation
    modal.addEventListener("click", (e) => {
      const trigger = e.target.closest("[data-action]");
      if (!trigger) return;

      const action = trigger.dataset.action;
      this.handleAction(action, trigger);
    });

    container.appendChild(modal);
    return modal;
  }

  handleAction(action, trigger) {
    if (!this.currentVideo) return;

    switch (action) {
      case "copy-npub": {
        const npub = this.helpers.safeEncodeNpub(this.currentVideo.pubkey);
        if (npub) {
          navigator.clipboard.writeText(npub)
            .then(() => this.callbacks.showSuccess("Npub copied"))
            .catch(() => this.callbacks.showError("Failed to copy Npub"));
        }
        break;
      }
      case "copy-timestamp": {
        const ts = this.currentVideo.created_at;
        if (ts) {
          navigator.clipboard.writeText(String(ts))
            .then(() => this.callbacks.showSuccess("Timestamp copied"))
            .catch(() => this.callbacks.showError("Failed to copy timestamp"));
        }
        break;
      }
      case "copy-id": {
        const id = this.currentVideo.id;
        if (id) {
          navigator.clipboard.writeText(id)
            .then(() => this.callbacks.showSuccess("Event ID copied"))
            .catch(() => this.callbacks.showError("Failed to copy ID"));
        }
        break;
      }
      case "copy-json": {
        const rawEvent = this.getRawEvent(this.currentVideo);
        const json = JSON.stringify(rawEvent, null, 2);
        navigator.clipboard.writeText(json)
          .then(() => this.callbacks.showSuccess("JSON copied"))
          .catch(() => this.callbacks.showError("Failed to copy JSON"));
        break;
      }
      case "open-channel": {
        const pubkey =
          this.currentVideo && typeof this.currentVideo.pubkey === "string"
            ? this.currentVideo.pubkey
            : "";
        if (pubkey) {
          this.close();
          this.callbacks.openCreatorChannel(pubkey);
        }
        break;
      }
      case "view-newer": {
        // Newer means lower index (since history is Descending/Newest-First)
        if (this.currentIndex > 0) {
          this.currentIndex--;
          this.renderVersion(this.history[this.currentIndex]);
          this.updateNavigationState();
        }
        break;
      }
      case "view-older": {
        // Older means higher index
        if (this.currentIndex < this.history.length - 1) {
          this.currentIndex++;
          this.renderVersion(this.history[this.currentIndex]);
          this.updateNavigationState();
        }
        break;
      }
    }
  }

  updateNavigationState() {
    if (!this.root) return;

    // History is Newest First (Index 0 = Latest)
    // Older = Index + 1
    // Newer = Index - 1

    const olderBtn = this.root.querySelector('[data-action="view-older"]');
    const newerBtn = this.root.querySelector('[data-action="view-newer"]');
    const indicator = this.root.querySelector('[data-version-indicator]');

    if (olderBtn) olderBtn.disabled = this.currentIndex >= this.history.length - 1;
    if (newerBtn) newerBtn.disabled = this.currentIndex <= 0;

    if (indicator) {
      if (this.isLoadingHistory) {
        indicator.textContent = "Loading history...";
      } else if (this.history.length > 0) {
        // Display logical version number (Oldest = 1, Newest = N)
        // index 0 (Newest) -> Version N
        // index N-1 (Oldest) -> Version 1
        const versionNumber = this.history.length - this.currentIndex;
        indicator.textContent = `Version ${versionNumber} of ${this.history.length}`;

        if (this.currentIndex === 0) {
           indicator.textContent += " (Latest)";
        }
      } else {
        indicator.textContent = "Version 1 of 1";
      }
    }
  }

  renderVersion(video) {
    if (!this.root || !video) return;

    this.currentVideo = video;

    // Metadata
    const authorNameEl = this.root.querySelector("[data-author-name]");
    const authorPicEl = this.root.querySelector("[data-author-pic]");
    const authorNpubEl = this.root.querySelector("[data-author-npub]");
    const timestampEl = this.root.querySelector("[data-timestamp]");
    const eventIdEl = this.root.querySelector("[data-event-id]");
    const jsonEl = this.root.querySelector("[data-json-content]");

    if (authorNameEl) {
      // If we have profile data attached to the video object (which NostrService usually does)
      const name = video.authorName || video.profile?.name || video.profile?.display_name || video.creatorName || video.creator?.name || "Unknown";
      authorNameEl.textContent = name;
    }

    if (authorPicEl) {
      const picCandidate = video.authorPicture || video.profile?.picture || video.creatorPicture || video.creator?.picture || "";
      const pic = sanitizeProfileMediaUrl(picCandidate) || DEFAULT_PROFILE_AVATAR;
      authorPicEl.src = pic;
    }

    if (authorNpubEl) {
      const npub = this.helpers.safeEncodeNpub(video.pubkey);
      authorNpubEl.textContent = npub ? `${npub.substring(0, 10)}...${npub.substring(npub.length - 10)}` : "Unknown";
      authorNpubEl.title = npub || "";
    }

    if (timestampEl) {
      timestampEl.textContent = this.helpers.formatAbsoluteTimestamp(video.created_at);
      timestampEl.title = `Unix: ${video.created_at}`;
    }

    if (eventIdEl) {
      eventIdEl.textContent = video.id;
    }

    if (jsonEl) {
      jsonEl.textContent = "Loading raw event...";
      this.currentRawEvent = null;

      if (this.app?.nostrService?.nostrClient?.getEventById) {
        this.app.nostrService.nostrClient
          .getEventById(video.id, { includeRaw: true })
          .then((result) => {
            if (this.currentVideo && this.currentVideo.id === video.id) {
              // Ensure we actually have a raw event (with signature)
              // If getEventById returns a wrapper { video, rawEvent: null }, we must handle null.
              const raw =
                result && typeof result.rawEvent === "object"
                  ? result.rawEvent
                  : null;

              if (raw) {
                this.currentRawEvent = raw;
                jsonEl.textContent = JSON.stringify(raw, null, 2);
              } else {
                // Fallback if fetch returned nothing usable
                // Do not set currentRawEvent so copy-json uses the reconstruction logic
                jsonEl.textContent = JSON.stringify(
                  this.getRawEvent(video),
                  null,
                  2,
                );
              }
            }
          })
          .catch((error) => {
            userLogger.warn(
              "[EventDetailsModal] Failed to fetch raw event:",
              error,
            );
            if (this.currentVideo && this.currentVideo.id === video.id) {
              jsonEl.textContent = `// Failed to load raw event.\n// Falling back to known data:\n${JSON.stringify(
                this.getRawEvent(video),
                null,
                2,
              )}`;
            }
          });
      } else {
        // Fallback if client or method missing
        const rawEvent = this.getRawEvent(video);
        jsonEl.textContent = JSON.stringify(rawEvent, null, 2);
      }
    }
  }

  getRawEvent(video) {
    if (!video) return {};

    let content = video.content;
    // If raw content is missing (e.g. video loaded from cache/parsed), reconstruct it
    // so the user can inspect the metadata fields (thumbnail, title, etc.)
    if (typeof content !== "string") {
      const payload = {
        videoRootId: video.videoRootId,
        version: video.version,
        deleted: video.deleted || false,
        isPrivate: video.isPrivate,
        isNsfw: video.isNsfw,
        isForKids: video.isForKids,
        title: video.title,
        url: video.url,
        magnet: video.magnet,
        thumbnail: video.thumbnail,
        description: video.description,
        mode: video.mode,
        enableComments: video.enableComments ?? true,
        ws: video.ws,
        xs: video.xs,
      };

      // Clean up undefined/empty fields to keep it tidy
      Object.keys(payload).forEach((key) => {
        if (payload[key] === undefined || payload[key] === null) {
          delete payload[key];
        }
      });

      content = JSON.stringify(payload);
    }

    return {
      id: video.id,
      pubkey: video.pubkey,
      created_at: video.created_at,
      kind: video.kind || 30078,
      tags: video.tags,
      content: content,
      sig: video.sig || "unavailable (cached)",
    };
  }

  async open(video) {
    if (!video) return;

    const modal = this.ensureModal();
    this.history = [video];
    this.currentIndex = 0;
    this.isLoadingHistory = true;

    this.renderVersion(video);
    this.updateNavigationState();

    openStaticModal(modal, { document: this.document });

    // Fetch history
    try {
      const history = await this.app.nostrService.fetchVideoHistory(video);
      if (history && history.length > 0) {
        // Hydrate profile info for history items if possible, using current video's author info
        // (Since author is same)
        const profile = video.profile || {};
        const enrichedHistory = history.map(h => ({
          ...h,
          profile,
          authorName: video.authorName || video.creatorName,
          authorPicture: video.authorPicture || video.creatorPicture,
          authorNpub: video.authorNpub || video.creatorNpub
        }));

        this.history = enrichedHistory;

        // Find the index of the video we opened with
        const idx = this.history.findIndex(h => h.id === video.id);
        if (idx !== -1) {
          this.currentIndex = idx;
        } else {
          // If not found (rare), maybe append? or just default to latest?
          // Default to latest (end of array)
          this.currentIndex = this.history.length - 1;
        }
      }
    } catch (e) {
      userLogger.warn("[EventDetailsModal] Failed to load history", e);
    } finally {
      this.isLoadingHistory = false;
      this.updateNavigationState();
    }
  }

  close() {
    if (this.root) {
      closeStaticModal(this.root, { document: this.document });
    }
    this.history = [];
    this.currentVideo = null;
  }
}
