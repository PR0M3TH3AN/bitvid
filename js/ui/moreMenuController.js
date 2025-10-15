import { normalizeDesignSystemContext } from "../designSystem.js";
import positionFloatingPanel from "./utils/positionFloatingPanel.js";
import { createFloatingPanelStyles } from "./utils/floatingPanelStyles.js";
import { userLogger } from "../utils/logger.js";
import {
  getPopupOffsetPx,
  getPopupViewportPaddingPx,
} from "../designSystem/metrics.js";

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
    this.boundDocumentClick = null;
    this.boundDocumentKeydown = null;

    this.videoListView = null;
    this.videoModal = null;

    this.boundVideoListShareListener = null;
    this.boundVideoListContextListener = null;
    this.boundVideoListBlacklistHandler = null;
    this.dropdownPositioners = new Map();
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

    if (this.document && this.boundDocumentClick) {
      this.document.removeEventListener("click", this.boundDocumentClick);
    }
    if (this.document && this.boundDocumentKeydown) {
      this.document.removeEventListener("keydown", this.boundDocumentKeydown);
    }

    this.boundDocumentClick = null;
    this.boundDocumentKeydown = null;
    this.moreMenuGlobalHandlerBound = false;
  }

  ensureGlobalMoreMenuHandlers() {
    if (this.moreMenuGlobalHandlerBound) {
      return;
    }

    if (!this.document) {
      return;
    }

    this.moreMenuGlobalHandlerBound = true;

    this.boundDocumentClick = (event) => {
      const target = event?.target;
      if (!target || typeof target.closest !== "function") {
        this.closeAllMoreMenus();
        return;
      }
      if (
        target.closest("[data-more-menu-wrapper]") ||
        target.closest("[data-more-menu]")
      ) {
        return;
      }
      this.closeAllMoreMenus();
    };

    this.boundDocumentKeydown = (event) => {
      if (event?.key === "Escape") {
        this.closeAllMoreMenus();
      }
    };

    this.document.addEventListener("click", this.boundDocumentClick);
    this.document.addEventListener("keydown", this.boundDocumentKeydown);
  }

  closeAllMoreMenus() {
    if (
      this.videoListView &&
      typeof this.videoListView.closeAllMenus === "function"
    ) {
      this.videoListView.closeAllMenus();
    }

    if (!this.document || typeof this.document.querySelectorAll !== "function") {
      return;
    }

    const HTMLElementCtor =
      this.document?.defaultView?.HTMLElement ||
      (typeof HTMLElement !== "undefined" ? HTMLElement : null);

    const menus = this.document.querySelectorAll("[data-more-menu]");
    menus.forEach((menu) => {
      if (!HTMLElementCtor || menu instanceof HTMLElementCtor) {
        menu.dataset.state = "closed";
        menu.setAttribute("aria-hidden", "true");
        menu.hidden = true;
      }
    });

    const buttons = this.document.querySelectorAll("[data-more-dropdown]");
    buttons.forEach((button) => {
      if (!HTMLElementCtor || button instanceof HTMLElementCtor) {
        button.setAttribute("aria-expanded", "false");
      }
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

    const HTMLElementCtor =
      this.document?.defaultView?.HTMLElement ||
      (typeof HTMLElement !== "undefined" ? HTMLElement : null);

    buttons.forEach((button) => {
      if (HTMLElementCtor && !(button instanceof HTMLElementCtor)) {
        return;
      }
      if (button.dataset.moreMenuToggleBound === "true") {
        return;
      }
      button.dataset.moreMenuToggleBound = "true";
      button.setAttribute("aria-expanded", "false");

      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();

        const key = button.getAttribute("data-more-dropdown") || "";
        const dropdown = this.document.getElementById(`moreDropdown-${key}`);
        if (HTMLElementCtor && !(dropdown instanceof HTMLElementCtor)) {
          return;
        }

        if (dropdown && !this.dropdownPositioners.has(dropdown)) {
          const styles = createFloatingPanelStyles(dropdown);
          const metricsDocument =
            dropdown?.ownerDocument ||
            button?.ownerDocument ||
            this.document ||
            (typeof document !== "undefined" ? document : null);
          const offset = getPopupOffsetPx({ documentRef: metricsDocument });
          const viewportPadding = getPopupViewportPaddingPx({
            documentRef: metricsDocument,
          });
          const positioner = positionFloatingPanel(button, dropdown, {
            placement: "bottom",
            alignment: "end",
            offset,
            viewportPadding,
            styles,
          });
          this.dropdownPositioners.set(dropdown, positioner);
        }

        if (dropdown && !dropdown.dataset.state) {
          const isHidden =
            dropdown.hasAttribute("hidden") ||
            dropdown.getAttribute("aria-hidden") === "true";
          dropdown.dataset.state = isHidden ? "closed" : "open";
        }

        if (dropdown && dropdown.dataset.state !== "open") {
          dropdown.hidden = true;
          dropdown.setAttribute("aria-hidden", "true");
        }

        const willOpen = dropdown?.dataset.state !== "open";
        this.closeAllMoreMenus();

        if (willOpen) {
          dropdown.hidden = false;
          dropdown.dataset.state = "open";
          dropdown.setAttribute("aria-hidden", "false");
          button.setAttribute("aria-expanded", "true");
          const positioner = this.dropdownPositioners.get(dropdown);
          positioner?.update();
        }
      });
    });

    const actionButtons = container.querySelectorAll(
      "[data-more-menu] button[data-action]",
    );
    actionButtons.forEach((button) => {
      if (HTMLElementCtor && !(button instanceof HTMLElementCtor)) {
        return;
      }
      if (button.dataset.moreMenuActionBound === "true") {
        return;
      }
      button.dataset.moreMenuActionBound = "true";

      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const { action } = button.dataset;
        this.handleMoreMenuAction(action, button.dataset);
        this.closeAllMoreMenus();
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
