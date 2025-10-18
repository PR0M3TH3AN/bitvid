import { normalizeDesignSystemContext } from "../designSystem.js";
import logger, { userLogger } from "../utils/logger.js";
import moderationService from "../services/moderationService.js";
import {
  createVideoMoreMenuPanel,
} from "./components/videoMenuRenderers.js";
import createPopover from "./overlay/popoverEngine.js";
import {
  prepareStaticModal,
  openStaticModal,
  closeStaticModal,
} from "./components/staticModalAccessibility.js";

const REPORT_CATEGORIES = Object.freeze([
  { value: "nudity", label: "Nudity or sexual content" },
  { value: "spam", label: "Spam or misleading" },
  { value: "illegal", label: "Illegal or dangerous content" },
  { value: "impersonation", label: "Impersonation or scam" },
  { value: "malware", label: "Malware or phishing" },
  { value: "profanity", label: "Profanity or hate speech" },
  { value: "other", label: "Other" },
]);

export default class MoreMenuController {
  constructor(options = {}) {
    const {
      document: doc = typeof document !== "undefined" ? document : null,
      accessControl = null,
      userBlocks = null,
      subscriptions = null,
      clipboard = typeof navigator !== "undefined" ? navigator.clipboard : null,
      isDevMode = false,
      callbacks = {},
      designSystem = null,
    } = options;

    this.document = doc;
    this.accessControl = accessControl;
    this.userBlocks = userBlocks;
    this.subscriptions = subscriptions;
    this.clipboard = clipboard;
    this.isDevMode = Boolean(isDevMode);
    this.designSystem = normalizeDesignSystemContext(designSystem);
    this.moderationService = options?.moderationService || moderationService;

    this.callbacks = {
      getCurrentVideo: callbacks.getCurrentVideo || (() => null),
      getCurrentUserNpub: callbacks.getCurrentUserNpub || (() => null),
      getCurrentUserPubkey: callbacks.getCurrentUserPubkey || (() => null),
      canCurrentUserManageBlacklist:
        callbacks.canCurrentUserManageBlacklist || (() => false),
      openCreatorChannel: callbacks.openCreatorChannel || (() => {}),
      goToProfile: callbacks.goToProfile || (() => {}),
      showError: callbacks.showError || (() => {}),
      showSuccess: callbacks.showSuccess || (() => {}),
      safeEncodeNpub: callbacks.safeEncodeNpub || (() => ""),
      safeDecodeNpub: callbacks.safeDecodeNpub || (() => ""),
      buildShareUrlFromEventId:
        callbacks.buildShareUrlFromEventId || (() => ""),
      handleRemoveHistoryAction:
        callbacks.handleRemoveHistoryAction || (() => Promise.resolve()),
      handleRepostAction:
        callbacks.handleRepostAction || (() => Promise.resolve()),
      handleMirrorAction:
        callbacks.handleMirrorAction || (() => Promise.resolve()),
      handleEnsurePresenceAction:
        callbacks.handleEnsurePresenceAction || (() => Promise.resolve()),
      loadVideos: callbacks.loadVideos || (() => Promise.resolve()),
      onUserBlocksUpdated: callbacks.onUserBlocksUpdated || (() => {}),
    };

    this.moreMenuGlobalHandlerBound = false;

    this.videoListView = null;
    this.videoModal = null;

    this.boundVideoListShareListener = null;
    this.boundVideoListContextListener = null;
    this.boundVideoListBlacklistHandler = null;
    this.popoversByTrigger = new Map();
    this.activePopover = null;
    this.activePopoverEntry = null;

    this.reportModal = null;
    this.reportModalPrepared = false;
    this.reportForm = null;
    this.reportStatusEl = null;
    this.reportSubmitButton = null;
    this.reportCancelButton = null;
    this.reportCategoryInputs = [];
    this.reportCleanupHandlers = [];
    this.activeReportContext = null;
    this.isReportSubmitting = false;
  }

  setVideoModal(videoModal) {
    this.videoModal = videoModal || null;
  }

  attachVideoListView(view) {
    if (view === this.videoListView) {
      return;
    }

    this.detachVideoListView();

    if (!view) {
      return;
    }

    this.videoListView = view;

    this.boundVideoListBlacklistHandler = ({ video, dataset }) => {
      const detail = {
        ...(dataset || {}),
        author: dataset?.author || video?.pubkey || "",
      };
      this.handleMoreMenuAction("blacklist-author", detail);
    };

    if (typeof view.setBlacklistHandler === "function") {
      view.setBlacklistHandler(this.boundVideoListBlacklistHandler);
    }

    this.boundVideoListShareListener = (event) => {
      const detail = event?.detail || {};
      const dataset = {
        ...(detail.dataset || {}),
        eventId:
          detail.eventId ||
          detail.dataset?.eventId ||
          detail.video?.id ||
          "",
        context: detail.dataset?.context || "card",
      };
      const action = detail.action || "copy-link";
      this.handleMoreMenuAction(action, dataset);
    };

    if (typeof view.addEventListener === "function") {
      view.addEventListener("video:share", this.boundVideoListShareListener);
    }

    this.boundVideoListContextListener = (event) => {
      const detail = event?.detail || {};
      const dataset = {
        ...(detail.dataset || {}),
        eventId: detail.dataset?.eventId || detail.video?.id || "",
      };
      this.handleMoreMenuAction(detail.action, dataset);
    };

    if (typeof view.addEventListener === "function") {
      view.addEventListener(
        "video:context-action",
        this.boundVideoListContextListener,
      );
    }
  }

  detachVideoListView() {
    if (!this.videoListView) {
      return;
    }

    if (
      this.boundVideoListShareListener &&
      typeof this.videoListView.removeEventListener === "function"
    ) {
      this.videoListView.removeEventListener(
        "video:share",
        this.boundVideoListShareListener,
      );
    }

    if (
      this.boundVideoListContextListener &&
      typeof this.videoListView.removeEventListener === "function"
    ) {
      this.videoListView.removeEventListener(
        "video:context-action",
        this.boundVideoListContextListener,
      );
    }

    if (typeof this.videoListView.setBlacklistHandler === "function") {
      this.videoListView.setBlacklistHandler(null);
    }

    this.boundVideoListShareListener = null;
    this.boundVideoListContextListener = null;
    this.boundVideoListBlacklistHandler = null;
    this.videoListView = null;
  }

  destroy() {
    this.detachVideoListView();
    this.setVideoModal(null);
    this.destroyReportModal();

    this.closeAllMoreMenus({ skipView: true });

    this.popoversByTrigger.forEach((entry) => {
      try {
        entry?.popover?.destroy?.();
      } catch (error) {
        if (this.isDevMode) {
          userLogger.warn("[MoreMenu] Failed to destroy popover:", error);
        }
      }
    });
    this.popoversByTrigger.clear();
    this.activePopover = null;
    this.moreMenuGlobalHandlerBound = false;
  }

  ensureGlobalMoreMenuHandlers() {
    this.moreMenuGlobalHandlerBound = true;
  }

  buildReportModalMarkup() {
    const options = REPORT_CATEGORIES.map((category, index) => {
      const inputId = `reportCategory-${category.value}`;
      const checkedAttr = index === 0 ? " checked" : "";
      const requiredAttr = index === 0 ? " required" : "";
      return `
        <label class="flex cursor-pointer items-center gap-3 rounded-lg border border-border/60 bg-panel/80 p-3 text-sm" for="${inputId}">
          <input
            id="${inputId}"
            type="radio"
            name="report-category"
            value="${category.value}"
            class="h-4 w-4"
            ${checkedAttr}${requiredAttr}
          />
          <span>${category.label}</span>
        </label>
      `;
    }).join("");

    return `
      <div class="bv-modal-backdrop" data-report-dismiss></div>
      <div class="modal-sheet w-full max-w-md space-y-4" role="document">
        <form data-report-form class="modal-body space-y-4">
          <header class="space-y-2">
            <h2 id="reportModalTitle" class="text-lg font-semibold text-text">Report video</h2>
            <p id="reportModalDescription" class="text-sm text-muted">
              Choose the category that best describes the issue. Reports from people you follow help improve recommendations.
            </p>
          </header>
          <fieldset class="space-y-2">
            <legend class="text-sm font-semibold text-text">Category</legend>
            <div class="space-y-2" role="radiogroup" aria-labelledby="reportModalTitle">
              ${options}
            </div>
          </fieldset>
          <p class="hidden text-sm" data-report-status role="status"></p>
          <div class="flex justify-end gap-3">
            <button type="button" class="btn-ghost focus-ring" data-report-cancel>Cancel</button>
            <button type="submit" class="btn focus-ring" data-report-submit>Submit report</button>
          </div>
        </form>
      </div>
    `;
  }

  ensureReportModal() {
    if (this.reportModal && this.reportModalPrepared) {
      return this.reportModal;
    }

    const doc = this.document;
    if (!doc) {
      return null;
    }

    const container = doc.getElementById("modalContainer") || doc.body || null;
    if (!container) {
      return null;
    }

    let modal = container.querySelector("#reportModal");
    if (!modal) {
      modal = doc.createElement("div");
      modal.id = "reportModal";
      modal.className = "bv-modal hidden items-center justify-center";
      modal.setAttribute("role", "dialog");
      modal.setAttribute("aria-modal", "true");
      modal.setAttribute("aria-labelledby", "reportModalTitle");
      modal.setAttribute("aria-describedby", "reportModalDescription");
      modal.innerHTML = this.buildReportModalMarkup();
      container.appendChild(modal);
    }

    this.reportModal = modal;
    this.reportForm = modal.querySelector("[data-report-form]");
    this.reportStatusEl = modal.querySelector("[data-report-status]");
    this.reportSubmitButton = modal.querySelector("[data-report-submit]");
    this.reportCancelButton = modal.querySelector("[data-report-cancel]");
    this.reportCategoryInputs = Array.from(
      modal.querySelectorAll("input[name='report-category']"),
    );

    if (!this.reportModalPrepared) {
      if (this.reportForm) {
        const submitHandler = (event) => this.handleReportSubmit(event);
        this.reportForm.addEventListener("submit", submitHandler);
        this.reportCleanupHandlers.push(() => {
          this.reportForm?.removeEventListener("submit", submitHandler);
        });
      }

      if (this.reportCancelButton) {
        const cancelHandler = (event) => {
          event?.preventDefault?.();
          this.closeReportModal();
        };
        this.reportCancelButton.addEventListener("click", cancelHandler);
        this.reportCleanupHandlers.push(() => {
          this.reportCancelButton?.removeEventListener("click", cancelHandler);
        });
      }

      const backdrop = modal.querySelector("[data-report-dismiss]");
      if (backdrop) {
        const backdropHandler = (event) => {
          event?.preventDefault?.();
          this.closeReportModal();
        };
        backdrop.addEventListener("click", backdropHandler);
        this.reportCleanupHandlers.push(() => {
          backdrop.removeEventListener("click", backdropHandler);
        });
      }

      prepareStaticModal({ root: modal, document: doc });
      this.reportModalPrepared = true;
    }

    return modal;
  }

  openReportModal({ eventId, authorPubkey = "", trigger = null } = {}) {
    const modal = this.ensureReportModal();
    if (!modal) {
      this.callbacks.showError(
        "Reporting is unavailable right now. Please try again later.",
      );
      return false;
    }

    this.activeReportContext = {
      eventId: typeof eventId === "string" ? eventId : "",
      authorPubkey: typeof authorPubkey === "string" ? authorPubkey : "",
    };
    this.isReportSubmitting = false;
    this.setReportModalBusy(false);
    this.showReportStatus("");

    if (Array.isArray(this.reportCategoryInputs) && this.reportCategoryInputs.length) {
      this.reportCategoryInputs.forEach((input, index) => {
        if (!input) {
          return;
        }
        try {
          input.checked = index === 0;
          input.disabled = false;
        } catch (_) {
          /* noop */
        }
      });
    }

    const opened = openStaticModal(modal, {
      triggerElement:
        trigger && typeof trigger.focus === "function" ? trigger : null,
      document: this.document,
    });

    if (opened && this.reportCategoryInputs.length > 0) {
      const firstInput = this.reportCategoryInputs[0];
      try {
        firstInput.focus();
      } catch (_) {
        /* noop */
      }
    }

    try {
      const service = this.moderationService || moderationService;
      if (service && typeof service.refreshViewerFromClient === "function") {
        service.refreshViewerFromClient();
      }
    } catch (error) {
      if (this.isDevMode) {
        userLogger.warn(
          "[MoreMenu] Failed to refresh moderation context before reporting:",
          error,
        );
      }
    }

    return opened;
  }

  closeReportModal() {
    if (!this.reportModal) {
      return false;
    }
    const result = closeStaticModal(this.reportModal, { document: this.document });
    this.activeReportContext = null;
    this.isReportSubmitting = false;
    this.showReportStatus("");
    return result;
  }

  setReportModalBusy(isBusy) {
    const disabled = Boolean(isBusy);
    this.isReportSubmitting = disabled;

    if (Array.isArray(this.reportCategoryInputs)) {
      this.reportCategoryInputs.forEach((input) => {
        if (input && typeof input.disabled === "boolean") {
          input.disabled = disabled;
        }
      });
    }

    if (this.reportSubmitButton && typeof this.reportSubmitButton.disabled === "boolean") {
      this.reportSubmitButton.disabled = disabled;
    }

    if (this.reportCancelButton && typeof this.reportCancelButton.disabled === "boolean") {
      this.reportCancelButton.disabled = disabled;
    }
  }

  showReportStatus(message, { variant = "info" } = {}) {
    if (!this.reportStatusEl) {
      return;
    }

    const trimmed = typeof message === "string" ? message.trim() : "";
    if (!trimmed) {
      this.reportStatusEl.classList.add("hidden");
      this.reportStatusEl.textContent = "";
      if (this.reportStatusEl.dataset.state) {
        delete this.reportStatusEl.dataset.state;
      }
      return;
    }

    this.reportStatusEl.classList.remove("hidden");
    this.reportStatusEl.textContent = trimmed;
    this.reportStatusEl.dataset.state = variant;
  }

  showReportError(message) {
    this.showReportStatus(message, { variant: "error" });
  }

  async handleReportSubmit(event) {
    if (event && typeof event.preventDefault === "function") {
      event.preventDefault();
    }

    if (this.isReportSubmitting) {
      return;
    }

    const context = this.activeReportContext || {};
    const eventId = typeof context.eventId === "string" ? context.eventId : "";
    if (!eventId) {
      this.showReportError("Unable to determine which video to report.");
      return;
    }

    let category = "";
    if (Array.isArray(this.reportCategoryInputs)) {
      const selected = this.reportCategoryInputs.find((input) => input && input.checked);
      if (selected && typeof selected.value === "string") {
        category = selected.value.trim().toLowerCase();
      }
    }

    if (!category) {
      this.showReportError("Please choose a category before submitting.");
      return;
    }

    const viewerPubkey = this.callbacks.getCurrentUserPubkey?.();
    if (!viewerPubkey) {
      this.closeReportModal();
      this.callbacks.showError("Connect a Nostr account before reporting videos.");
      return;
    }

    this.setReportModalBusy(true);
    this.showReportStatus("Sending report…", { variant: "info" });

    const service = this.moderationService || moderationService;

    try {
      if (!service || typeof service.submitReport !== "function") {
        const svcError = new Error("service-unavailable");
        svcError.code = "service-unavailable";
        throw svcError;
      }

      await service.submitReport({
        eventId,
        type: category,
        targetPubkey: context.authorPubkey || "",
      });

      this.callbacks.showSuccess(
        "Report submitted. Thank you for keeping bitvid safe.",
      );
      this.closeReportModal();
    } catch (error) {
      logger.user.error("[MoreMenu] Failed to publish report:", error);
      const code = error?.code || "unknown";
      let message = "Unable to send your report. Please try again.";
      if (code === "nostr-extension-missing") {
        message = "A Nostr extension is required to report videos.";
      } else if (code === "extension-permission-denied") {
        message = "Approve the permission request in your Nostr extension and try again.";
      } else if (code === "viewer-not-logged-in") {
        message = "Connect a Nostr account before reporting videos.";
      } else if (code === "service-unavailable") {
        message = "Reporting is unavailable right now. Please try again later.";
      }

      this.showReportError(message);
    } finally {
      this.setReportModalBusy(false);
    }
  }

  destroyReportModal() {
    if (Array.isArray(this.reportCleanupHandlers) && this.reportCleanupHandlers.length) {
      for (const cleanup of this.reportCleanupHandlers) {
        try {
          if (typeof cleanup === "function") {
            cleanup();
          }
        } catch (error) {
          if (this.isDevMode) {
            userLogger.warn(
              "[MoreMenu] Failed to teardown report modal listener:",
              error,
            );
          }
        }
      }
    }

    this.reportCleanupHandlers = [];
    this.reportModalPrepared = false;
    this.reportForm = null;
    this.reportStatusEl = null;
    this.reportSubmitButton = null;
    this.reportCancelButton = null;
    this.reportCategoryInputs = [];
    this.activeReportContext = null;
    this.isReportSubmitting = false;

    if (this.reportModal) {
      try {
        closeStaticModal(this.reportModal, { document: this.document });
      } catch (_) {
        /* noop */
      }
    }

    this.reportModal = null;
  }

  getHTMLElementConstructor(documentRef) {
    return (
      documentRef?.defaultView?.HTMLElement ||
      (typeof HTMLElement !== "undefined" ? HTMLElement : null)
    );
  }

  setButtonVisibility(button, visible) {
    if (!button) {
      return;
    }
    if (visible) {
      button.removeAttribute("hidden");
      button.setAttribute("aria-hidden", "false");
    } else {
      button.setAttribute("hidden", "");
      button.setAttribute("aria-hidden", "true");
    }
  }

  syncMuteMenuButtons(panel, entry = {}) {
    if (!panel || typeof panel.querySelector !== "function") {
      return;
    }

    const muteButton = panel.querySelector('button[data-action="mute-author"]');
    const unmuteButton = panel.querySelector('button[data-action="unmute-author"]');
    if (!muteButton && !unmuteButton) {
      return;
    }

    const contextVideo = entry?.context?.video || null;
    let authorCandidate = contextVideo?.pubkey || "";

    if (!authorCandidate) {
      if (muteButton?.dataset?.author) {
        authorCandidate = muteButton.dataset.author;
      } else if (unmuteButton?.dataset?.author) {
        authorCandidate = unmuteButton.dataset.author;
      }
    }

    const trimmed = typeof authorCandidate === "string" ? authorCandidate.trim() : "";
    let normalized = "";
    if (trimmed) {
      if (/^[0-9a-f]{64}$/i.test(trimmed)) {
        normalized = trimmed.toLowerCase();
      } else if (trimmed.startsWith("npub1")) {
        normalized = this.callbacks.safeDecodeNpub(trimmed) || "";
      }
    }

    if (normalized) {
      if (muteButton) {
        muteButton.dataset.author = normalized;
      }
      if (unmuteButton) {
        unmuteButton.dataset.author = normalized;
      }
    }

    let isMuted = false;
    if (normalized) {
      try {
        isMuted = this.moderationService.isAuthorMutedByViewer(normalized) === true;
      } catch (error) {
        if (this.isDevMode) {
          userLogger.warn("[MoreMenu] Failed to resolve viewer mute state", error);
        }
      }
    }

    const hasTarget = Boolean(normalized);
    this.setButtonVisibility(muteButton, hasTarget && !isMuted);
    this.setButtonVisibility(unmuteButton, hasTarget && isMuted);
  }

  refreshActiveMuteButtons({ author = "" } = {}) {
    if (!this.activePopoverEntry || !this.activePopover) {
      return;
    }
    const panel =
      typeof this.activePopover.getPanel === "function"
        ? this.activePopover.getPanel()
        : null;
    if (!panel) {
      return;
    }

    if (author) {
      const trimmed = author.trim();
      if (trimmed) {
        const muteButton = panel.querySelector('button[data-action="mute-author"]');
        const unmuteButton = panel.querySelector('button[data-action="unmute-author"]');
        if (muteButton) {
          muteButton.dataset.author = trimmed;
        }
        if (unmuteButton) {
          unmuteButton.dataset.author = trimmed;
        }
      }
    }

    this.syncMuteMenuButtons(panel, this.activePopoverEntry);
  }

  createPopoverRender(entry) {
    return ({ document: documentRef, close }) => {
      const panel = createVideoMoreMenuPanel({
        document: documentRef,
        video: entry.context.video,
        pointerInfo: entry.context.pointerInfo,
        playbackUrl: entry.context.playbackUrl,
        playbackMagnet: entry.context.playbackMagnet,
        canManageBlacklist: entry.context.canManageBlacklist,
        context: entry.context.context || "card",
        designSystem: entry.context.designSystem || this.designSystem,
      });

      if (!panel) {
        return null;
      }

      this.syncMuteMenuButtons(panel, entry);

      const buttons = panel.querySelectorAll("button[data-action]");
      buttons.forEach((button) => {
        const HTMLElementCtor = this.getHTMLElementConstructor(button?.ownerDocument);
        if (HTMLElementCtor && !(button instanceof HTMLElementCtor)) {
          return;
        }

        button.addEventListener("click", async (event) => {
          event.preventDefault();
          event.stopPropagation();

          const dataset = { ...button.dataset };
          const action = dataset.action || "";

          try {
            await this.handleMoreMenuAction(action, dataset);
          } catch (error) {
            userLogger.error("[MoreMenu] Failed to handle action:", error);
          }

          if (typeof entry.context.onAction === "function") {
            try {
              entry.context.onAction({ action, dataset, event });
            } catch (callbackError) {
              if (this.isDevMode) {
                userLogger.warn(
                  "[MoreMenu] onAction callback failed",
                  callbackError,
                );
              }
            }
          }

          if (typeof close === "function") {
            close();
          }
        });
      });

      return panel;
    };
  }

  decoratePopoverLifecycle(popover, trigger, entry) {
    if (!popover) {
      return null;
    }

    const originalOpen = popover.open?.bind(popover);
    const originalClose = popover.close?.bind(popover);
    const originalDestroy = popover.destroy?.bind(popover);

    if (typeof originalOpen === "function") {
      popover.open = async (...args) => {
        const result = await originalOpen(...args);
        if (result) {
          this.activePopover = popover;
          this.activePopoverEntry = entry;
          const panel =
            typeof popover.getPanel === "function" ? popover.getPanel() : null;
          if (panel) {
            this.syncMuteMenuButtons(panel, entry);
          }
        }
        return result;
      };
    }

    if (typeof originalClose === "function") {
      popover.close = (options = {}) => {
        const restoreFocus =
          options?.restoreFocus !== undefined
            ? options.restoreFocus
            : entry?.context?.restoreFocusOnClose !== false;
        const result = originalClose({ restoreFocus });
        if (result && this.activePopover === popover) {
          this.activePopover = null;
          this.activePopoverEntry = null;
        }
        if (result && typeof entry?.context?.onClose === "function") {
          try {
            entry.context.onClose({
              trigger,
              reason: options?.reason || "close",
              restoreFocus,
            });
          } catch (error) {
            if (this.isDevMode) {
              userLogger.warn("[MoreMenu] onClose callback failed", error);
            }
          }
        }
        return result;
      };
    }

    if (typeof originalDestroy === "function") {
      popover.destroy = (...args) => {
        if (this.activePopover === popover) {
          this.activePopover = null;
          this.activePopoverEntry = null;
        }
        originalDestroy(...args);
        if (trigger && this.popoversByTrigger.get(trigger) === entry) {
          this.popoversByTrigger.delete(trigger);
        }
      };
    }

    return popover;
  }

  ensurePopoverForTrigger({ trigger }) {
    if (!trigger) {
      return null;
    }

    if (this.popoversByTrigger.has(trigger)) {
      return this.popoversByTrigger.get(trigger);
    }

    const documentRef =
      trigger?.ownerDocument ||
      this.document ||
      (typeof document !== "undefined" ? document : null);

    const entry = {
      trigger,
      context: {
        video: null,
        pointerInfo: null,
        playbackUrl: "",
        playbackMagnet: "",
        canManageBlacklist: false,
        context: "card",
        designSystem: this.designSystem,
        onAction: null,
        onClose: null,
        restoreFocusOnClose: true,
      },
      popover: null,
    };

    const render = this.createPopoverRender(entry);

    const popover = createPopover(trigger, render, {
      document: documentRef,
      placement: "bottom-end",
    });

    const decorated = this.decoratePopoverLifecycle(popover, trigger, entry) || popover;
    entry.popover = decorated;
    this.popoversByTrigger.set(trigger, entry);
    return entry;
  }

  async toggleMoreMenu(detail = {}) {
    const {
      trigger = null,
      video = null,
      pointerInfo = null,
      playbackUrl = "",
      playbackMagnet = "",
      context = "card",
      canManageBlacklist = this.callbacks.canCurrentUserManageBlacklist(),
      designSystem = null,
      onAction = null,
      onClose = null,
      restoreFocusOnClose = true,
    } = detail;

    const entry = this.ensurePopoverForTrigger({ trigger });
    if (!entry?.popover) {
      return;
    }

    entry.context = {
      ...entry.context,
      video,
      pointerInfo,
      playbackUrl,
      playbackMagnet,
      canManageBlacklist,
      context,
      designSystem: designSystem || this.designSystem,
      onAction,
      onClose,
      restoreFocusOnClose: restoreFocusOnClose !== false,
    };

    if (typeof entry.popover.isOpen === "function" && entry.popover.isOpen()) {
      entry.popover.close({
        restoreFocus: entry.context.restoreFocusOnClose !== false,
      });
      return;
    }

    try {
      await entry.popover.open();
    } catch (error) {
      userLogger.error("[MoreMenu] Failed to open popover:", error);
    }
  }

  closePopoverForTrigger(trigger, options = {}) {
    const entry = trigger ? this.popoversByTrigger.get(trigger) : null;
    if (!entry?.popover || typeof entry.popover.close !== "function") {
      return false;
    }

    const restoreFocus =
      options?.restoreFocus !== undefined
        ? options.restoreFocus
        : entry.context?.restoreFocusOnClose !== false;

    return entry.popover.close({ restoreFocus });
  }

  closeAllMoreMenus(options = {}) {
    const skipView = options?.skipView === true;
    const restoreFocus = options?.restoreFocus !== false;
    const skipTrigger = options?.skipTrigger || null;

    if (
      !skipView &&
      this.videoListView &&
      typeof this.videoListView.closeAllMenus === "function"
    ) {
      const viewOptions = {
        skipController: true,
        restoreFocus,
      };
      if (skipTrigger) {
        viewOptions.skipTrigger = skipTrigger;
      }
      this.videoListView.closeAllMenus(viewOptions);
    }

    this.popoversByTrigger.forEach((entry) => {
      if (!entry?.popover || typeof entry.popover.close !== "function") {
        return;
      }
      if (skipTrigger && entry.trigger === skipTrigger) {
        return;
      }
      entry.popover.close({ restoreFocus });
    });
  }

  attachMoreMenuHandlers(container) {
    if (!container || typeof container.querySelectorAll !== "function") {
      return;
    }

    if (!this.document) {
      return;
    }

    const buttons = container.querySelectorAll("[data-more-dropdown]");
    if (!buttons.length) {
      return;
    }

    this.ensureGlobalMoreMenuHandlers();

    const HTMLElementCtor = this.getHTMLElementConstructor(this.document);

    buttons.forEach((button) => {
      if (HTMLElementCtor && !(button instanceof HTMLElementCtor)) {
        return;
      }
      if (button.dataset.moreMenuToggleBound === "true") {
        return;
      }
      button.dataset.moreMenuToggleBound = "true";
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();

        const context = button.getAttribute("data-context") || "card";

        let video = null;
        let pointerInfo = null;
        let playbackUrl = "";
        let playbackMagnet = "";

        if (context === "modal") {
          video = this.callbacks.getCurrentVideo();
          if (Array.isArray(video?.pointer) && video.pointer.length >= 2) {
            pointerInfo = { pointer: video.pointer };
          }
          playbackUrl = typeof video?.url === "string" ? video.url : "";
          playbackMagnet = (() => {
            if (typeof video?.magnet === "string" && video.magnet) {
              return video.magnet;
            }
            if (typeof video?.infoHash === "string" && video.infoHash) {
              return video.infoHash;
            }
            return "";
          })();
        }

        if (!pointerInfo) {
          const pointerType = button.getAttribute("data-pointer-type") || "";
          const pointerValue = button.getAttribute("data-pointer-value") || "";
          const pointerRelay = button.getAttribute("data-pointer-relay") || "";
          const pointerKey = button.getAttribute("data-pointer-key") || "";
          if (pointerType && pointerValue) {
            pointerInfo = {
              pointer: pointerRelay
                ? [pointerType, pointerValue, pointerRelay]
                : [pointerType, pointerValue],
              key: pointerKey,
            };
          }
        }

        this.toggleMoreMenu({
          trigger: button,
          video,
          pointerInfo,
          playbackUrl,
          playbackMagnet,
          context,
          canManageBlacklist: this.callbacks.canCurrentUserManageBlacklist(),
          designSystem: this.designSystem,
        });
      });
    });
  }

  syncModalMoreMenuData() {
    if (!this.videoModal || typeof this.videoModal.syncMoreMenuData !== "function") {
      return;
    }

    const currentVideo = this.callbacks.getCurrentVideo();
    const canManageBlacklist = this.callbacks.canCurrentUserManageBlacklist();

    this.videoModal.syncMoreMenuData({
      currentVideo,
      canManageBlacklist,
    });
  }

  async handleMoreMenuAction(action, dataset = {}) {
    const normalized = typeof action === "string" ? action.trim() : "";
    const context = dataset.context || "";
    const currentVideo = this.callbacks.getCurrentVideo();

    const resolveTargetAuthorHex = () => {
      const candidates = [
        dataset.author,
        dataset.npub,
        context === "modal" ? currentVideo?.pubkey : "",
        currentVideo?.pubkey,
      ];

      for (const candidate of candidates) {
        if (typeof candidate !== "string") {
          continue;
        }
        const trimmed = candidate.trim();
        if (!trimmed) {
          continue;
        }
        if (/^[0-9a-f]{64}$/i.test(trimmed)) {
          return trimmed.toLowerCase();
        }
        if (trimmed.startsWith("npub1")) {
          const decoded = this.callbacks.safeDecodeNpub(trimmed);
          if (decoded) {
            return decoded;
          }
        }
      }

      return "";
    };

    switch (normalized) {
      case "open-channel": {
        if (context === "modal") {
          this.callbacks.openCreatorChannel();
          break;
        }

        const author =
          dataset.author || (currentVideo ? currentVideo.pubkey : "");
        if (author) {
          this.callbacks.goToProfile(author);
        } else {
          this.callbacks.showError("No creator info available.");
        }
        break;
      }
      case "copy-link": {
        const eventId =
          dataset.eventId || (context === "modal" ? currentVideo?.id : "");
        if (!eventId) {
          this.callbacks.showError("Could not generate link.");
          break;
        }
        const shareUrl = this.callbacks.buildShareUrlFromEventId(eventId);
        if (!shareUrl) {
          this.callbacks.showError("Could not generate link.");
          break;
        }

        if (!this.clipboard || typeof this.clipboard.writeText !== "function") {
          this.callbacks.showError("Failed to copy the link.");
          break;
        }

        this.clipboard
          .writeText(shareUrl)
          .then(() =>
            this.callbacks.showSuccess("Video link copied to clipboard!"),
          )
          .catch(() => this.callbacks.showError("Failed to copy the link."));
        break;
      }
      case "remove-history": {
        await this.callbacks.handleRemoveHistoryAction(dataset);
        break;
      }
      case "repost-event": {
        await this.callbacks.handleRepostAction(dataset);
        break;
      }
      case "mirror-video": {
        await this.callbacks.handleMirrorAction(dataset);
        break;
      }
      case "ensure-presence": {
        await this.callbacks.handleEnsurePresenceAction(dataset);
        break;
      }
      case "copy-npub": {
        const explicitNpub =
          typeof dataset.npub === "string" && dataset.npub.trim()
            ? dataset.npub.trim()
            : "";
        const authorCandidate = dataset.author || "";
        const fallbackNpub = this.callbacks.safeEncodeNpub(authorCandidate);
        const valueToCopy = explicitNpub || fallbackNpub;

        if (!valueToCopy) {
          this.callbacks.showError("No npub available to copy.");
          break;
        }

        if (!this.clipboard || typeof this.clipboard.writeText !== "function") {
          this.callbacks.showError("Failed to copy the npub.");
          break;
        }

        try {
          await this.clipboard.writeText(valueToCopy);
          this.callbacks.showSuccess("Channel npub copied to clipboard!");
        } catch (error) {
          userLogger.error("Failed to copy npub:", error);
          this.callbacks.showError("Failed to copy the npub.");
        }
        break;
      }
      case "mute-author": {
        const viewerPubkey = this.callbacks.getCurrentUserPubkey();
        if (!viewerPubkey) {
          this.callbacks.showError("Please login to manage your mute list.");
          break;
        }

        const targetHex = resolveTargetAuthorHex();
        if (!targetHex) {
          this.callbacks.showError("Unable to determine the creator to mute.");
          break;
        }

        if (targetHex === viewerPubkey) {
          this.callbacks.showError("You cannot mute yourself.");
          break;
        }

        try {
          const result = await this.moderationService.addAuthorToViewerMuteList(
            targetHex,
          );
          if (result?.already) {
            this.callbacks.showSuccess("You already muted this creator.");
          } else {
            this.callbacks.showSuccess(
              "Creator muted. Their videos will be downranked in your feeds.",
            );
          }
          try {
            await this.callbacks.loadVideos();
          } catch (loadError) {
            if (this.isDevMode) {
              userLogger.warn("[MoreMenu] Failed to reload videos after muting", loadError);
            }
          }
          try {
            await this.subscriptions?.refreshActiveFeed?.({
              reason: "viewer-mute-update",
            });
          } catch (refreshError) {
            if (this.isDevMode) {
              userLogger.warn(
                "[Subscriptions] Failed to refresh after viewer mute update:",
                refreshError,
              );
            }
          }
          this.refreshActiveMuteButtons({ author: targetHex });
        } catch (error) {
          switch (error?.code) {
            case "viewer-not-logged-in":
              this.callbacks.showError("Please login to manage your mute list.");
              break;
            case "invalid-target":
              this.callbacks.showError("Unable to determine the creator to mute.");
              break;
            case "self":
              this.callbacks.showError("You cannot mute yourself.");
              break;
            case "nostr-extension-missing":
              this.callbacks.showError(
                "A Nostr extension is required to update your mute list.",
              );
              break;
            case "extension-permission-denied":
              this.callbacks.showError(
                "Allow your Nostr extension to sign events before muting creators.",
              );
              break;
            default:
              this.callbacks.showError(
                "Failed to update your mute list. Please try again.",
              );
              break;
          }
        }
        break;
      }
      case "unmute-author": {
        const viewerPubkey = this.callbacks.getCurrentUserPubkey();
        if (!viewerPubkey) {
          this.callbacks.showError("Please login to manage your mute list.");
          break;
        }

        const targetHex = resolveTargetAuthorHex();
        if (!targetHex) {
          this.callbacks.showError("Unable to determine the creator to unmute.");
          break;
        }

        try {
          const result = await this.moderationService.removeAuthorFromViewerMuteList(
            targetHex,
          );
          if (result?.already) {
            this.callbacks.showSuccess("This creator is not on your mute list.");
          } else {
            this.callbacks.showSuccess(
              "Creator removed from your mute list.",
            );
          }
          try {
            await this.callbacks.loadVideos();
          } catch (loadError) {
            if (this.isDevMode) {
              userLogger.warn(
                "[MoreMenu] Failed to reload videos after unmuting",
                loadError,
              );
            }
          }
          try {
            await this.subscriptions?.refreshActiveFeed?.({
              reason: "viewer-mute-update",
            });
          } catch (refreshError) {
            if (this.isDevMode) {
              userLogger.warn(
                "[Subscriptions] Failed to refresh after viewer mute removal:",
                refreshError,
              );
            }
          }
          this.refreshActiveMuteButtons({ author: targetHex });
        } catch (error) {
          switch (error?.code) {
            case "viewer-not-logged-in":
              this.callbacks.showError("Please login to manage your mute list.");
              break;
            case "nostr-extension-missing":
              this.callbacks.showError(
                "A Nostr extension is required to update your mute list.",
              );
              break;
            case "extension-permission-denied":
              this.callbacks.showError(
                "Allow your Nostr extension to sign events before updating your mute list.",
              );
              break;
            default:
              this.callbacks.showError(
                "Failed to update your mute list. Please try again.",
              );
              break;
          }
        }
        break;
      }
      case "blacklist-author": {
        const actorNpub = this.callbacks.getCurrentUserNpub();
        if (!actorNpub) {
          this.callbacks.showError(
            "Please login as a moderator to manage the blacklist.",
          );
          break;
        }

        try {
          await this.accessControl?.ensureReady?.();
        } catch (error) {
          userLogger.warn(
            "Failed to refresh moderation state before blacklisting:",
            error,
          );
        }

        if (!this.accessControl?.canEditAdminLists?.(actorNpub)) {
          this.callbacks.showError("Only moderators can manage the blacklist.");
          break;
        }

        let author = dataset.author || "";
        if (!author && context === "modal" && currentVideo?.pubkey) {
          author = currentVideo.pubkey;
        }
        if (!author && currentVideo?.pubkey) {
          author = currentVideo.pubkey;
        }

        const explicitNpub =
          typeof dataset.npub === "string" && dataset.npub.trim()
            ? dataset.npub.trim()
            : "";
        const targetNpub = explicitNpub || this.callbacks.safeEncodeNpub(author);

        if (!targetNpub) {
          this.callbacks.showError("Unable to determine the creator npub.");
          break;
        }

        try {
          const result = await this.accessControl.addToBlacklist(
            actorNpub,
            targetNpub,
          );

          if (result?.ok) {
            this.callbacks.showSuccess("Creator added to the blacklist.");
            try {
              await this.subscriptions?.refreshActiveFeed?.({
                reason: "admin-blacklist-update",
              });
            } catch (error) {
              if (this.isDevMode) {
                userLogger.warn(
                  "[Subscriptions] Failed to refresh after blacklist update:",
                  error,
                );
              }
            }
          } else {
            const code = result?.error || "unknown";
            switch (code) {
              case "self":
                this.callbacks.showError("You cannot blacklist yourself.");
                break;
              case "immutable":
                this.callbacks.showError(
                  "Moderators cannot blacklist the super admin or fellow moderators.",
                );
                break;
              case "invalid npub":
                this.callbacks.showError("Unable to blacklist this creator.");
                break;
              case "forbidden":
                this.callbacks.showError("Only moderators can manage the blacklist.");
                break;
              default:
                this.callbacks.showError(
                  "Failed to update the blacklist. Please try again.",
                );
                break;
            }
          }
        } catch (error) {
          userLogger.error("Failed to add creator to blacklist:", error);
          this.callbacks.showError(
            "Failed to update the blacklist. Please try again.",
          );
        }
        break;
      }
      case "block-author": {
        const currentUserPubkey = this.callbacks.getCurrentUserPubkey();
        if (!currentUserPubkey) {
          this.callbacks.showError("Please login to manage your block list.");
          break;
        }

        const authorCandidate =
          dataset.author || (currentVideo && currentVideo.pubkey) || "";

        const trimmed =
          typeof authorCandidate === "string" ? authorCandidate.trim() : "";
        if (!trimmed) {
          this.callbacks.showError("Unable to determine the creator to block.");
          break;
        }

        let normalizedHex = "";
        if (trimmed.startsWith("npub1")) {
          normalizedHex = this.callbacks.safeDecodeNpub(trimmed) || "";
        } else if (/^[0-9a-f]{64}$/i.test(trimmed)) {
          normalizedHex = trimmed.toLowerCase();
        }

        if (!normalizedHex) {
          this.callbacks.showError("Unable to determine the creator to block.");
          break;
        }

        if (normalizedHex === currentUserPubkey) {
          this.callbacks.showError("You cannot block yourself.");
          break;
        }

        try {
          await this.userBlocks?.ensureLoaded?.(currentUserPubkey);

          if (this.userBlocks?.isBlocked?.(normalizedHex)) {
            this.callbacks.showSuccess("You already blocked this creator.");
          } else {
            await this.userBlocks?.addBlock?.(normalizedHex, currentUserPubkey);
            this.callbacks.showSuccess(
              "Creator blocked. You won't see their videos anymore.",
            );
          }

          try {
            this.callbacks.onUserBlocksUpdated();
          } catch (error) {
            userLogger.warn(
              "[MoreMenu] Failed to refresh blocked list after update:",
              error,
            );
          }

          await this.callbacks.loadVideos();
          try {
            await this.subscriptions?.refreshActiveFeed?.({
              reason: "user-block-update",
            });
          } catch (error) {
            if (this.isDevMode) {
              userLogger.warn(
                "[Subscriptions] Failed to refresh after user block update:",
                error,
              );
            }
          }
        } catch (error) {
          userLogger.error("Failed to update personal block list:", error);
          const message =
            error?.code === "nip04-missing"
              ? "Your Nostr extension must support NIP-04 to manage private lists."
              : "Failed to update your block list. Please try again.";
          this.callbacks.showError(message);
        }
        break;
      }
      case "report": {
        const viewerPubkey = this.callbacks.getCurrentUserPubkey?.();
        if (!viewerPubkey) {
          this.callbacks.showError(
            "Connect a Nostr account before reporting videos.",
          );
          break;
        }

        const eventId =
          dataset.eventId ||
          (context === "modal" ? currentVideo?.id : "") ||
          currentVideo?.id || "";

        if (!eventId) {
          this.callbacks.showError(
            "Unable to determine which video to report.",
          );
          break;
        }

        const authorPubkey =
          dataset.author ||
          (context === "modal" && currentVideo?.pubkey
            ? currentVideo.pubkey
            : "") ||
          currentVideo?.pubkey || "";

        this.openReportModal({
          eventId,
          authorPubkey,
          trigger: dataset.triggerElement || null,
        });
        break;
      }
      default:
        break;
    }
  }
}
