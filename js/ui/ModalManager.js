import { devLogger } from "../utils/logger.js";
import { removeTrackingScripts, escapeHTML as escapeHtml } from "../utils/domUtils.js";
import { setModalState as setGlobalModalState } from "../state/appState.js";
import { truncateMiddle, formatShortNpub } from "../utils/formatters.js";
import { showLoginRequiredToZapNotification } from "../payments/zapNotifications.js";
import { VideoModal } from "./components/VideoModal.js";
import { RevertModal } from "./components/RevertModal.js";
import initUploadModal from "./initUploadModal.js";
import initEditModal from "./initEditModal.js";
import initDeleteModal from "./initDeleteModal.js";
import ZapController from "./zapController.js";
import { nostrClient } from "../nostrClientFacade.js";

export default class ModalManager {
  constructor({
    app,
    ui = {},
    documentRef = typeof document !== "undefined" ? document : null,
    assets = {},
  } = {}) {
    this.app = app;
    this.ui = ui;
    this.document = documentRef;
    this.assets = {
      fallbackThumbnailSrc: assets.fallbackThumbnailSrc || null,
    };

    this.uploadModal = null;
    this.uploadModalEvents = null;
    this.uploadSubmitHandler = null;

    this.editModal = null;
    this.editModalEvents = null;
    this.editSubmitHandler = null;
    this.editCancelHandler = null;

    this.revertModal = null;
    this.revertConfirmHandler = null;

    this.deleteModal = null;
    this.deleteModalEvents = null;
    this.deleteConfirmHandler = null;
    this.deleteCancelHandler = null;

    this.videoModal = null;
    this.videoModalHandlers = {};

    this.zapController = null;
  }

  initialize() {
    const app = this.app;
    const doc = this.document;
    const modalContainer = doc?.getElementById("modalContainer") || null;

    const uploadModalSetup = initUploadModal({
      app,
      uploadModalOverride: this.ui.uploadModal,
      container: modalContainer,
      services: {
        authService: app.authService,
        r2Service: app.r2Service,
      },
      utilities: {
        removeTrackingScripts,
        setGlobalModalState,
      },
      callbacks: {
        publishVideoNote: (payload, options) =>
          app.publishVideoNote(payload, options),
        showError: (message) => app.showError(message),
        showSuccess: (message) => app.showSuccess(message),
        getCurrentPubkey: () => app.pubkey,
        safeEncodeNpub: (pubkey) => app.safeEncodeNpub(pubkey),
        onSubmit: (event) => app.handleUploadSubmitEvent(event),
      },
    });
    this.uploadModal = uploadModalSetup.modal;
    this.uploadModalEvents = uploadModalSetup.events;
    this.uploadSubmitHandler = uploadModalSetup.handlers.submit;
    app.uploadModal = this.uploadModal;
    app.uploadModalEvents = this.uploadModalEvents;

    const editModalSetup = initEditModal({
      app,
      editModalOverride: this.ui.editModal,
      container: modalContainer,
      services: {
        getMode: ({ video } = {}) => {
          const candidate =
            typeof video?.mode === "string" ? video.mode.trim().toLowerCase() : "";
          return candidate === "dev" ? "dev" : "live";
        },
        sanitizers: {
          text: (value) => (typeof value === "string" ? value.trim() : ""),
          url: (value) => (typeof value === "string" ? value.trim() : ""),
          magnet: (value) => (typeof value === "string" ? value.trim() : ""),
          checkbox: (value) => !!value,
        },
      },
      utilities: {
        removeTrackingScripts,
        setGlobalModalState,
        escapeHtml: (value) => escapeHtml(value),
      },
      callbacks: {
        showError: (message) => app.showError(message),
        onSubmit: (event) => app.handleEditModalSubmit(event),
        onCancel: () => app.showError(""),
      },
    });

    this.editModal = editModalSetup.modal;
    this.editModalEvents = editModalSetup.events;
    this.editSubmitHandler = editModalSetup.handlers.submit;
    this.editCancelHandler = editModalSetup.handlers.cancel;
    app.editModal = this.editModal;
    app.editModalEvents = this.editModalEvents;

    this.revertModal =
      (typeof this.ui.revertModal === "function"
        ? this.ui.revertModal({ app })
        : this.ui.revertModal) ||
      new RevertModal({
        removeTrackingScripts,
        setGlobalModalState,
        formatAbsoluteTimestamp: (timestamp) => app.formatAbsoluteTimestamp(timestamp),
        formatTimeAgo: (timestamp) => app.formatTimeAgo(timestamp),
        escapeHTML: (value) => app.escapeHTML(value),
        truncateMiddle,
        formatShortNpub: (value) => formatShortNpub(value),
        fallbackThumbnailSrc: this.assets.fallbackThumbnailSrc,
        container: modalContainer,
      });

    this.revertConfirmHandler = (event) => {
      app.handleRevertModalConfirm(event);
    };
    this.revertModal.addEventListener(
      "video:revert-confirm",
      this.revertConfirmHandler,
    );
    app.revertModal = this.revertModal;

    const deleteModalSetup = initDeleteModal({
      app,
      deleteModalOverride: this.ui.deleteModal,
      container: modalContainer,
      utilities: {
        removeTrackingScripts,
        setGlobalModalState,
        truncateMiddle,
      },
      callbacks: {
        onConfirm: (event) => app.handleDeleteModalConfirm(event),
        onCancel: () => app.showError(""),
      },
    });

    this.deleteModal = deleteModalSetup.modal;
    this.deleteModalEvents = deleteModalSetup.events;
    this.deleteConfirmHandler = deleteModalSetup.handlers.confirm;
    this.deleteCancelHandler = deleteModalSetup.handlers.cancel;
    app.deleteModal = this.deleteModal;
    app.deleteModalEvents = this.deleteModalEvents;

    this.videoModal =
      (typeof this.ui.videoModal === "function"
        ? this.ui.videoModal({ app })
        : this.ui.videoModal) ||
      new VideoModal({
        removeTrackingScripts,
        setGlobalModalState,
        document: doc,
        logger: {
          log: (message, ...args) => app.log(message, ...args),
        },
        mediaLoader: app.mediaLoader,
        assets: {
          fallbackThumbnailSrc: this.assets.fallbackThumbnailSrc,
        },
        state: {
          loadedThumbnails: app.loadedThumbnails,
        },
        helpers: {
          safeEncodeNpub: (pubkey) => app.safeEncodeNpub(pubkey),
          formatShortNpub: (value) => formatShortNpub(value),
        },
      });

    if (
      this.videoModal &&
      typeof this.videoModal.setMediaLoader === "function"
    ) {
      this.videoModal.setMediaLoader(app.mediaLoader);
    }
    if (
      this.videoModal &&
      typeof this.videoModal.setTagPreferenceStateResolver === "function"
    ) {
      this.videoModal.setTagPreferenceStateResolver((tag) =>
        app.getTagPreferenceState(tag),
      );
    }

    this.zapController = new ZapController({
      videoModal: this.videoModal,
      getCurrentVideo: () => app.currentVideo,
      nwcSettings: app.nwcSettingsService,
      isUserLoggedIn: () => app.isUserLoggedIn(),
      hasSessionActor: () =>
        Boolean(
          typeof nostrClient?.sessionActor?.pubkey === "string" &&
            nostrClient.sessionActor.pubkey.trim(),
        ),
      notifyLoginRequired: () =>
        showLoginRequiredToZapNotification({
          app,
          document: app.statusContainer?.ownerDocument || doc,
        }),
      splitAndZap: (...args) => app.splitAndZap(...args),
      payments: app.payments,
      callbacks: {
        onSuccess: (message) => app.showSuccess(message),
        onError: (message) => app.showError(message),
      },
      requestWalletPane: () => app.openWalletPane(),
    });
    app.zapController = this.zapController;

    this.videoModalHandlers.close = () => {
      app.hideModal();
    };
    this.videoModal.addEventListener(
      "modal:close",
      this.videoModalHandlers.close,
    );

    this.videoModalHandlers.copy = () => {
      app.handleCopyMagnet();
    };
    this.videoModal.addEventListener(
      "video:copy-magnet",
      this.videoModalHandlers.copy,
    );

    this.videoModalHandlers.share = () => {
      app.shareActiveVideo();
    };
    this.videoModal.addEventListener(
      "video:share",
      this.videoModalHandlers.share,
    );

    this.videoModalHandlers.moderationOverride = (event) => {
      const detail = event?.detail || {};
      const targetVideo =
        detail && typeof detail.video === "object"
          ? detail.video
          : app.currentVideo || null;
      if (!targetVideo) {
        const trigger = detail?.trigger;
        if (trigger) {
          trigger.disabled = false;
          trigger.removeAttribute("aria-busy");
        }
        return;
      }

      const handled = app.handleModerationOverride({
        video: targetVideo,
        card: detail?.card || null,
      });

      if (handled === false) {
        const trigger = detail?.trigger;
        if (trigger) {
          trigger.disabled = false;
          trigger.removeAttribute("aria-busy");
        }
      }
    };
    this.videoModal.addEventListener(
      "video:moderation-override",
      this.videoModalHandlers.moderationOverride,
    );

    this.videoModalHandlers.moderationBlock = (event) => {
      const detail = event?.detail || {};
      const targetVideo =
        detail && typeof detail.video === "object"
          ? detail.video
          : app.currentVideo || null;
      const trigger = detail?.trigger || null;

      if (!targetVideo) {
        if (trigger) {
          trigger.disabled = false;
          trigger.removeAttribute("aria-busy");
        }
        return;
      }

      Promise.resolve(
        app.handleModerationBlock({
          video: targetVideo,
          card: detail?.card || null,
        }),
      )
        .then((handled) => {
          if (handled === false && trigger) {
            trigger.disabled = false;
            trigger.removeAttribute("aria-busy");
          }
        })
        .catch((error) => {
          devLogger.warn(
            "[Application] Failed to handle modal moderation block:",
            error,
          );
          if (trigger) {
            trigger.disabled = false;
            trigger.removeAttribute("aria-busy");
          }
        });
    };
    this.videoModal.addEventListener(
      "video:moderation-block",
      this.videoModalHandlers.moderationBlock,
    );

    this.videoModalHandlers.moderationHide = (event) => {
      const detail = event?.detail || {};
      const targetVideo =
        detail && typeof detail.video === "object"
          ? detail.video
          : app.currentVideo || null;
      const trigger = detail?.trigger || null;

      if (!targetVideo) {
        if (trigger) {
          trigger.disabled = false;
          trigger.removeAttribute("aria-busy");
        }
        return;
      }

      Promise.resolve(
        app.handleModerationHide({
          video: targetVideo,
          card: detail?.card || null,
        }),
      )
        .then((handled) => {
          if (handled === false && trigger) {
            trigger.disabled = false;
            trigger.removeAttribute("aria-busy");
          }
        })
        .catch((error) => {
          devLogger.warn(
            "[Application] Failed to handle modal moderation hide:",
            error,
          );
          if (trigger) {
            trigger.disabled = false;
            trigger.removeAttribute("aria-busy");
          }
        });
    };
    this.videoModal.addEventListener(
      "video:moderation-hide",
      this.videoModalHandlers.moderationHide,
    );

    this.videoModalHandlers.tagActivate = (event) => {
      const detail = event?.detail || {};
      const nativeEvent = detail?.nativeEvent || null;
      if (nativeEvent) {
        nativeEvent.preventDefault?.();
        nativeEvent.stopPropagation?.();
      }

      app.handleTagPreferenceActivation({
        tag: detail?.tag,
        trigger: detail?.trigger || null,
        context: "modal",
        video: detail?.video || app.currentVideo || null,
        event: nativeEvent,
      });
    };
    this.videoModal.addEventListener(
      "tag:activate",
      this.videoModalHandlers.tagActivate,
    );

    this.videoModalHandlers.similarSelect = (event) => {
      const detail = event?.detail || {};
      const selectedVideo =
        detail && typeof detail.video === "object" ? detail.video : null;
      const triggerCandidate =
        detail?.event?.currentTarget ||
        (detail?.card && typeof detail.card.getRoot === "function"
          ? detail.card.getRoot()
          : null);

      app.setLastModalTrigger(triggerCandidate || null);

      if (detail?.event) {
        detail.event.preventDefault?.();
        detail.event.stopPropagation?.();
      }

      if (!selectedVideo) {
        return;
      }

      const playbackOptions = {
        trigger: triggerCandidate || null,
      };

      const rawUrl =
        typeof selectedVideo.url === "string" ? selectedVideo.url.trim() : "";
      if (rawUrl) {
        playbackOptions.url = rawUrl;
      }

      const rawMagnet =
        typeof selectedVideo.magnet === "string"
          ? selectedVideo.magnet.trim()
          : "";
      if (rawMagnet) {
        playbackOptions.magnet = rawMagnet;
      }

      const hasPlayById = typeof app.playVideoByEventId === "function";
      const hasFallbackPlayback =
        typeof app.playVideoWithFallback === "function";

      const selectedId =
        typeof selectedVideo.id === "string" ? selectedVideo.id : "";

      if (selectedId && hasPlayById) {
        Promise.resolve(app.playVideoByEventId(selectedId, playbackOptions)).catch(
          (error) => {
            devLogger.error(
              "[ModalManager] Failed to play selected similar video:",
              error,
            );
          },
        );
        return;
      }

      if (!hasFallbackPlayback) {
        devLogger.warn(
          "[ModalManager] Unable to start playback for similar video; no playback handler is available.",
        );
        return;
      }

      Promise.resolve(app.playVideoWithFallback(playbackOptions)).catch(
        (error) => {
          devLogger.error(
            "[ModalManager] Failed to start playback for similar video:",
            error,
          );
        },
      );
    };
    this.videoModal.addEventListener(
      "similar:select",
      this.videoModalHandlers.similarSelect,
    );

    this.videoModalHandlers.reaction = (event) => {
      const detail = event?.detail || {};
      app.handleVideoReaction(detail);
    };
    this.videoModal.addEventListener(
      "video:reaction",
      this.videoModalHandlers.reaction,
    );

    this.videoModalHandlers.contextAction = (event) => {
      const detail = event?.detail || {};
      const action = typeof detail.action === "string" ? detail.action : "";
      if (!action) {
        return;
      }
      const dataset = {
        ...(detail.dataset || {}),
      };
      if (!dataset.context) {
        dataset.context = "modal";
      }
      app.handleMoreMenuAction(action, dataset);
    };
    this.videoModal.addEventListener(
      "video:context-action",
      this.videoModalHandlers.contextAction,
    );

    this.videoModalHandlers.creatorNavigate = () => {
      app.openCreatorChannel();
    };
    this.videoModal.addEventListener(
      "creator:navigate",
      this.videoModalHandlers.creatorNavigate,
    );

    this.videoModalHandlers.zap = (event) => {
      this.zapController?.sendZap(event?.detail || {});
    };
    this.videoModal.addEventListener(
      "video:zap",
      this.videoModalHandlers.zap,
    );

    this.videoModalHandlers.zapOpen = (event) => {
      const requiresLogin = Boolean(event?.detail?.requiresLogin);
      app.pendingModalZapOpen = requiresLogin;

      const openResult = this.zapController?.open({ requiresLogin });
      if (!openResult) {
        event?.preventDefault?.();
        if (!requiresLogin) {
          app.pendingModalZapOpen = false;
        }
        this.videoModal?.closeZapDialog?.({
          silent: true,
          restoreFocus: false,
        });
        return;
      }

      app.pendingModalZapOpen = false;
    };
    this.videoModal.addEventListener(
      "zap:open",
      this.videoModalHandlers.zapOpen,
    );

    this.videoModalHandlers.zapClose = () => {
      this.zapController?.close();
    };
    this.videoModal.addEventListener(
      "zap:close",
      this.videoModalHandlers.zapClose,
    );

    this.videoModalHandlers.zapAmount = (event) => {
      this.zapController?.setAmount(event?.detail?.amount);
    };
    this.videoModal.addEventListener(
      "zap:amount-change",
      this.videoModalHandlers.zapAmount,
    );

    this.videoModalHandlers.zapComment = (event) => {
      this.zapController?.setComment(event?.detail?.comment);
    };
    this.videoModal.addEventListener(
      "zap:comment-change",
      this.videoModalHandlers.zapComment,
    );

    this.videoModalHandlers.zapWallet = () => {
      this.zapController?.handleWalletLink();
    };
    this.videoModal.addEventListener(
      "zap:wallet-link",
      this.videoModalHandlers.zapWallet,
    );

    this.videoModalHandlers.commentSubmit = (event) => {
      app.handleVideoModalCommentSubmit(event?.detail || {});
    };
    this.videoModal.addEventListener(
      "comment:submit",
      this.videoModalHandlers.commentSubmit,
    );

    this.videoModalHandlers.commentRetry = (event) => {
      app.handleVideoModalCommentRetry(event?.detail || {});
    };
    this.videoModal.addEventListener(
      "comment:retry",
      this.videoModalHandlers.commentRetry,
    );

    this.videoModalHandlers.commentLoadMore = (event) => {
      app.handleVideoModalCommentLoadMore(event?.detail || {});
    };
    this.videoModal.addEventListener(
      "comment:load-more",
      this.videoModalHandlers.commentLoadMore,
    );

    this.videoModalHandlers.commentLogin = (event) => {
      app.handleVideoModalCommentLoginRequired(event?.detail || {});
    };
    this.videoModal.addEventListener(
      "comment:login-required",
      this.videoModalHandlers.commentLogin,
    );

    this.videoModalHandlers.commentMute = (event) => {
      app.handleVideoModalCommentMute(event?.detail || {});
    };
    this.videoModal.addEventListener(
      "comment:mute-author",
      this.videoModalHandlers.commentMute,
    );

    app.videoModal = this.videoModal;
  }

  teardown() {
    const app = this.app;

    if (this.uploadModal && this.uploadSubmitHandler) {
      try {
        this.uploadModal.removeEventListener(
          "upload:submit",
          this.uploadSubmitHandler,
        );
      } catch (error) {
        devLogger.warn("[ModalManager] Failed to remove upload submit handler:", error);
      }
    }
    if (typeof this.uploadModal?.destroy === "function") {
      try {
        this.uploadModal.destroy();
      } catch (error) {
        devLogger.warn("[ModalManager] Failed to destroy upload modal:", error);
      }
    }

    if (this.editModal) {
      if (this.editSubmitHandler) {
        try {
          this.editModal.removeEventListener(
            "video:edit-submit",
            this.editSubmitHandler,
          );
        } catch (error) {
          devLogger.warn(
            "[ModalManager] Failed to remove edit submit handler:",
            error,
          );
        }
      }
      if (this.editCancelHandler) {
        try {
          this.editModal.removeEventListener(
            "video:edit-cancel",
            this.editCancelHandler,
          );
        } catch (error) {
          devLogger.warn(
            "[ModalManager] Failed to remove edit cancel handler:",
            error,
          );
        }
      }
      if (typeof this.editModal.destroy === "function") {
        try {
          this.editModal.destroy();
        } catch (error) {
          devLogger.warn("[ModalManager] Failed to destroy edit modal:", error);
        }
      }
    }

    if (this.revertModal && this.revertConfirmHandler) {
      try {
        this.revertModal.removeEventListener(
          "video:revert-confirm",
          this.revertConfirmHandler,
        );
      } catch (error) {
        devLogger.warn("[ModalManager] Failed to remove revert handler:", error);
      }
      this.revertConfirmHandler = null;
    }
    if (typeof this.revertModal?.destroy === "function") {
      try {
        this.revertModal.destroy();
      } catch (error) {
        devLogger.warn("[ModalManager] Failed to destroy revert modal:", error);
      }
    }

    if (this.deleteModal) {
      if (this.deleteConfirmHandler) {
        try {
          this.deleteModal.removeEventListener(
            "video:delete-confirm",
            this.deleteConfirmHandler,
          );
        } catch (error) {
          devLogger.warn(
            "[ModalManager] Failed to remove delete confirm handler:",
            error,
          );
        }
      }
      if (this.deleteCancelHandler) {
        try {
          this.deleteModal.removeEventListener(
            "video:delete-cancel",
            this.deleteCancelHandler,
          );
        } catch (error) {
          devLogger.warn(
            "[ModalManager] Failed to remove delete cancel handler:",
            error,
          );
        }
      }
      if (typeof this.deleteModal.destroy === "function") {
        try {
          this.deleteModal.destroy();
        } catch (error) {
          devLogger.warn("[ModalManager] Failed to destroy delete modal:", error);
        }
      }
    }

    if (this.videoModal) {
      const entries = Object.entries(this.videoModalHandlers);
      for (const [key, handler] of entries) {
        if (!handler) {
          continue;
        }
        let eventName = null;
        switch (key) {
          case "close":
            eventName = "modal:close";
            break;
          case "copy":
            eventName = "video:copy-magnet";
            break;
          case "share":
            eventName = "video:share";
            break;
          case "moderationOverride":
            eventName = "video:moderation-override";
            break;
          case "moderationBlock":
            eventName = "video:moderation-block";
            break;
          case "moderationHide":
            eventName = "video:moderation-hide";
            break;
          case "tagActivate":
            eventName = "tag:activate";
            break;
          case "similarSelect":
            eventName = "similar:select";
            break;
          case "reaction":
            eventName = "video:reaction";
            break;
          case "contextAction":
            eventName = "video:context-action";
            break;
          case "creatorNavigate":
            eventName = "creator:navigate";
            break;
          case "zap":
            eventName = "video:zap";
            break;
          case "zapOpen":
            eventName = "zap:open";
            break;
          case "zapClose":
            eventName = "zap:close";
            break;
          case "zapAmount":
            eventName = "zap:amount-change";
            break;
          case "zapComment":
            eventName = "zap:comment-change";
            break;
          case "zapWallet":
            eventName = "zap:wallet-link";
            break;
          case "commentSubmit":
            eventName = "comment:submit";
            break;
          case "commentRetry":
            eventName = "comment:retry";
            break;
          case "commentLoadMore":
            eventName = "comment:load-more";
            break;
          case "commentLogin":
            eventName = "comment:login-required";
            break;
          case "commentMute":
            eventName = "comment:mute-author";
            break;
          default:
            break;
        }
        if (!eventName) {
          continue;
        }
        try {
          this.videoModal.removeEventListener(eventName, handler);
        } catch (error) {
          devLogger.warn(
            `[ModalManager] Failed to remove handler for ${eventName}:`,
            error,
          );
        }
        this.videoModalHandlers[key] = null;
      }

      if (typeof this.videoModal.destroy === "function") {
        try {
          this.videoModal.destroy();
        } catch (error) {
          devLogger.warn("[ModalManager] Failed to destroy video modal:", error);
        }
      }
    }

    app.uploadModal = null;
    app.uploadModalEvents = null;
    app.editModal = null;
    app.editModalEvents = null;
    app.revertModal = null;
    app.deleteModal = null;
    app.deleteModalEvents = null;
    app.videoModal = null;
    app.zapController = null;

    this.uploadModal = null;
    this.uploadModalEvents = null;
    this.uploadSubmitHandler = null;
    this.editModal = null;
    this.editModalEvents = null;
    this.editSubmitHandler = null;
    this.editCancelHandler = null;
    this.revertModal = null;
    this.deleteModal = null;
    this.deleteModalEvents = null;
    this.deleteConfirmHandler = null;
    this.deleteCancelHandler = null;
    this.videoModal = null;
    this.videoModalHandlers = {};
    this.zapController = null;
  }
}
