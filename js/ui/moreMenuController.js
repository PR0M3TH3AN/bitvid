import { normalizeDesignSystemContext } from "../designSystem.js";
import { userLogger } from "../utils/logger.js";
import {
  createVideoMoreMenuPanel,
} from "./components/videoMenuRenderers.js";
import createPopover from "./overlay/popoverEngine.js";

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

  getHTMLElementConstructor(documentRef) {
    return (
      documentRef?.defaultView?.HTMLElement ||
      (typeof HTMLElement !== "undefined" ? HTMLElement : null)
    );
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
        this.callbacks.showSuccess("Reporting coming soon.");
        break;
      }
      default:
        break;
    }
  }
}
