import { devLogger } from "../utils/logger.js";
import { buildVideoAddressPointer } from "../utils/videoPointer.js";

const DEFAULT_LIMIT = 40;

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

export default class VideoModalCommentController {
  constructor({
    commentThreadService = null,
    videoModal = null,
    auth = {},
    callbacks = {},
    services = {},
    utils = {},
  } = {}) {
    this.commentThreadService = commentThreadService;
    this.videoModal = videoModal;

    this.auth = {
      isLoggedIn:
        typeof auth.isLoggedIn === "function" ? () => auth.isLoggedIn() : () => false,
      initializeLoginModalController:
        typeof auth.initializeLoginModalController === "function"
          ? (options) => auth.initializeLoginModalController(options)
          : () => {},
      getLoginModalController:
        typeof auth.getLoginModalController === "function"
          ? () => auth.getLoginModalController()
          : () => null,
      requestLogin:
        typeof auth.requestLogin === "function"
          ? (options) => auth.requestLogin(options)
          : () => Promise.resolve(false),
    };

    this.callbacks = {
      showError:
        typeof callbacks.showError === "function"
          ? (message) => callbacks.showError(message)
          : () => {},
      showStatus:
        typeof callbacks.showStatus === "function"
          ? (message, options) => callbacks.showStatus(message, options)
          : () => {},
      muteAuthor:
        typeof callbacks.muteAuthor === "function"
          ? (pubkey) => callbacks.muteAuthor(pubkey)
          : () => Promise.resolve(),
      shouldHideAuthor:
        typeof callbacks.shouldHideAuthor === "function"
          ? (pubkey) => callbacks.shouldHideAuthor(pubkey)
          : () => false,
    };

    this.services = {
      publishComment:
        typeof services.publishComment === "function"
          ? (payload, eventData) => services.publishComment(payload, eventData)
          : () => Promise.resolve(null),
    };

    this.utils = {
      normalizeHexPubkey:
        typeof utils.normalizeHexPubkey === "function"
          ? (value) => utils.normalizeHexPubkey(value)
          : () => null,
    };

    this.currentVideo = null;
    this.modalCommentState = {
      videoEventId: null,
      videoDefinitionAddress: null,
      parentCommentId: null,
    };
    this.modalCommentProfiles = new Map();
    this.modalCommentLimit = this.commentThreadService?.defaultLimit || DEFAULT_LIMIT;
    this.modalCommentLoadPromise = null;
    this.modalCommentPublishPromise = null;

    this.boundThreadReadyHandler = (snapshot) =>
      this.handleCommentThreadReady(snapshot);
    this.boundThreadAppendHandler = (payload) =>
      this.handleCommentThreadAppend(payload);
    this.boundThreadErrorHandler = (error) =>
      this.handleCommentThreadError(error);

    if (this.commentThreadService?.setCallbacks) {
      this.commentThreadService.setCallbacks({
        onThreadReady: this.boundThreadReadyHandler,
        onCommentsAppended: this.boundThreadAppendHandler,
        onError: this.boundThreadErrorHandler,
      });
    }
  }

  load(video) {
    if (!this.videoModal) {
      return;
    }

    if (!video) {
      this.dispose();
      return;
    }

    this.currentVideo = video;

    this.videoModal.setCommentSectionCallbacks?.({
      teardown: () => this.dispose(),
    });

    if (!this.commentThreadService) {
      this.resetModalCommentState();
      return;
    }

    this.dispose({ resetUi: false });

    this.videoModal.hideCommentsDisabledMessage?.();

    if (video.enableComments === false) {
      this.resetModalCommentState();
      this.videoModal.showCommentsDisabledMessage?.(
        "Comments have been turned off for this video.",
      );
      return;
    }

    const videoEventId = normalizeString(video.id);
    const videoDefinitionAddress = buildVideoAddressPointer(video);

    if (!videoEventId) {
      this.resetModalCommentState({ hide: false });
      this.videoModal.setCommentStatus?.(
        "Comments are unavailable for this video.",
      );
      return;
    }

    this.modalCommentState = {
      videoEventId,
      videoDefinitionAddress: videoDefinitionAddress || null,
      parentCommentId: null,
    };
    this.modalCommentProfiles = new Map();
    if (this.commentThreadService?.defaultLimit) {
      this.modalCommentLimit = this.commentThreadService.defaultLimit;
    }

    this.videoModal.setCommentsVisibility?.(true);
    this.videoModal.clearComments?.();
    this.videoModal.resetCommentComposer?.();
    this.videoModal.setCommentStatus?.("Loading comments…");
    this.applyCommentComposerAuthState();

    const loadPromise = this.commentThreadService.loadThread({
      video,
      parentCommentId: null,
      limit: this.modalCommentLimit,
    });

    if (!loadPromise || typeof loadPromise.then !== "function") {
      this.applyCommentComposerAuthState();
      return;
    }

    this.modalCommentLoadPromise = loadPromise;
    loadPromise
      .then(() => {
        if (this.modalCommentLoadPromise === loadPromise) {
          this.modalCommentLoadPromise = null;
        }
        this.applyCommentComposerAuthState();
      })
      .catch((error) => {
        if (this.modalCommentLoadPromise === loadPromise) {
          this.modalCommentLoadPromise = null;
        }
        this.handleCommentThreadError(error);
      });
  }

  submit(detail = {}) {
    this.handleVideoModalCommentSubmit(detail);
  }

  retry(detail = {}) {
    this.handleVideoModalCommentSubmit(detail);
  }

  loadMore() {
    this.handleVideoModalCommentLoadMore();
  }

  handleLoginRequired(detail = {}) {
    this.handleVideoModalCommentLoginRequired(detail);
  }

  async muteAuthor(detail = {}) {
    await this.handleVideoModalCommentMute(detail);
  }

  refreshAuthState() {
    this.applyCommentComposerAuthState();
  }

  dispose({ resetUi = true } = {}) {
    if (this.commentThreadService) {
      try {
        this.commentThreadService.teardown();
      } catch (error) {
        devLogger.warn("[comment] Failed to teardown modal comment thread:", error);
      }
    }

    this.modalCommentLoadPromise = null;
    this.modalCommentPublishPromise = null;
    this.modalCommentState = {
      videoEventId: null,
      videoDefinitionAddress: null,
      parentCommentId: null,
    };
    this.modalCommentProfiles = new Map();
    if (resetUi) {
      this.resetModalCommentState();
    }
    this.videoModal?.setCommentSectionCallbacks?.({ teardown: null });
    this.currentVideo = null;
  }

  destroy({ resetUi = true } = {}) {
    this.dispose({ resetUi });
    if (this.commentThreadService?.setCallbacks) {
      this.commentThreadService.setCallbacks({
        onThreadReady: null,
        onCommentsAppended: null,
        onError: null,
      });
    }
    this.commentThreadService = null;
    this.videoModal = null;
  }

  resetModalCommentState({ hide = true } = {}) {
    if (!this.videoModal) {
      return;
    }

    this.videoModal.clearComments?.();
    this.videoModal.resetCommentComposer?.();
    this.videoModal.setCommentComposerState?.({
      disabled: true,
      reason: "disabled",
    });
    if (hide) {
      this.videoModal.setCommentsVisibility?.(false);
    }
    this.videoModal.setCommentStatus?.("");
  }

  applyCommentComposerAuthState() {
    if (!this.videoModal) {
      return;
    }

    if (!this.modalCommentState.videoEventId) {
      return;
    }

    if (this.currentVideo?.enableComments === false) {
      this.videoModal.showCommentsDisabledMessage?.(
        "Comments have been turned off for this video.",
      );
      this.videoModal.setCommentComposerState?.({
        disabled: true,
        reason: "disabled",
      });
      return;
    }

    this.videoModal.hideCommentsDisabledMessage?.();

    if (!this.auth.isLoggedIn()) {
      this.videoModal.setCommentComposerState?.({
        disabled: true,
        reason: "login-required",
      });
      return;
    }

    this.videoModal.setCommentComposerState?.({
      disabled: false,
      reason: "",
    });
    this.videoModal.setCommentStatus?.("");
  }

  handleCommentThreadReady(snapshot) {
    if (!snapshot || !this.videoModal) {
      return;
    }

    if (snapshot.videoEventId !== this.modalCommentState.videoEventId) {
      return;
    }

    this.modalCommentProfiles = this.createMapFromInput(snapshot.profiles);
    this.modalCommentState.parentCommentId = normalizeString(
      snapshot.parentCommentId,
    ) || null;

    const sanitizedSnapshot = this.buildModalCommentSnapshot(snapshot);
    this.videoModal.renderComments?.(sanitizedSnapshot);
    this.videoModal.setCommentStatus?.("");
    this.applyCommentComposerAuthState();
  }

  handleCommentThreadAppend(payload) {
    if (!payload || !this.videoModal) {
      return;
    }

    if (payload.videoEventId !== this.modalCommentState.videoEventId) {
      return;
    }

    const comments = this.createMapFromInput(payload.commentsById);
    const profiles = this.createMapFromInput(payload.profiles);
    profiles.forEach((profile, pubkey) => {
      this.modalCommentProfiles.set(pubkey, profile);
    });

    const commentIds = Array.isArray(payload.commentIds)
      ? payload.commentIds
      : [];

    commentIds.forEach((commentId) => {
      if (!comments.has(commentId)) {
        return;
      }
      const event = comments.get(commentId);
      if (!event || this.shouldHideModalComment(event)) {
        return;
      }
      const enriched = this.enrichCommentEvent(event);
      this.videoModal.appendComment?.(enriched);
    });
  }

  handleCommentThreadError(error) {
    if (error) {
      devLogger.warn("[comment]", error);
    }
    if (!this.videoModal) {
      return;
    }
    this.videoModal.setCommentStatus?.(
      "Failed to load comments. Please try again later.",
    );
    if (!this.auth.isLoggedIn()) {
      this.videoModal.setCommentComposerState?.({
        disabled: true,
        reason: "login-required",
      });
    }
  }

  createMapFromInput(input) {
    if (input instanceof Map) {
      return new Map(input);
    }
    const map = new Map();
    if (Array.isArray(input)) {
      input.forEach((entry) => {
        if (Array.isArray(entry) && entry.length >= 2) {
          map.set(entry[0], entry[1]);
        }
      });
      return map;
    }
    if (input && typeof input === "object") {
      Object.entries(input).forEach(([key, value]) => {
        map.set(key, value);
      });
    }
    return map;
  }

  createChildrenMapFromInput(input) {
    const source =
      input instanceof Map ? input : this.createMapFromInput(input);
    const result = new Map();
    source.forEach((value, key) => {
      const list = Array.isArray(value) ? value.filter(Boolean) : [];
      result.set(key, list);
    });
    return result;
  }

  enrichCommentEvent(event) {
    const cloned = { ...(event || {}) };
    const normalized = this.utils.normalizeHexPubkey(cloned.pubkey);
    if (normalized && this.modalCommentProfiles.has(normalized)) {
      cloned.profile = this.modalCommentProfiles.get(normalized);
    }
    return cloned;
  }

  buildModalCommentSnapshot(snapshot) {
    const comments = this.createMapFromInput(snapshot?.commentsById);
    const children = this.createChildrenMapFromInput(
      snapshot?.childrenByParent,
    );
    const sanitizedComments = new Map();

    comments.forEach((event, key) => {
      if (!event || this.shouldHideModalComment(event)) {
        return;
      }
      sanitizedComments.set(key, this.enrichCommentEvent(event));
    });

    const sanitizedChildren = new Map();
    children.forEach((ids, parentId) => {
      const seen = new Set();
      const filtered = [];
      ids.forEach((id) => {
        if (!sanitizedComments.has(id) || seen.has(id)) {
          return;
        }
        seen.add(id);
        filtered.push(id);
      });
      sanitizedChildren.set(parentId, filtered);
    });

    return {
      videoEventId: snapshot.videoEventId,
      parentCommentId: snapshot.parentCommentId || null,
      commentsById: sanitizedComments,
      childrenByParent: sanitizedChildren,
      profiles: this.modalCommentProfiles,
    };
  }

  shouldHideModalComment(event) {
    const normalized = this.utils.normalizeHexPubkey(event?.pubkey);
    if (!normalized) {
      return false;
    }

    try {
      return Boolean(this.callbacks.shouldHideAuthor(normalized));
    } catch (error) {
      devLogger.warn("[comment] Failed to evaluate comment visibility:", error);
      return false;
    }
  }

  async handleVideoModalCommentSubmit(detail = {}) {
    if (this.modalCommentPublishPromise) {
      return;
    }

    const text = normalizeString(detail.text);
    if (!text) {
      return;
    }

    if (!this.auth.isLoggedIn()) {
      this.videoModal.setCommentComposerState?.({
        disabled: true,
        reason: "login-required",
      });
      this.handleVideoModalCommentLoginRequired(detail);
      return;
    }

    const video = this.currentVideo;
    if (!video || video.enableComments === false) {
      return;
    }

    const videoEventId = normalizeString(video.id);
    const videoDefinitionAddress = buildVideoAddressPointer(video);

    if (!videoEventId) {
      this.callbacks.showError("Comments are unavailable for this video.");
      return;
    }

    const parentCommentId = normalizeString(detail.parentId) || null;

    this.videoModal.setCommentComposerState?.({
      disabled: true,
      reason: "submitting",
    });

    const publishPayload = {
      videoEventId,
      parentCommentId,
    };

    if (videoDefinitionAddress) {
      publishPayload.videoDefinitionAddress = videoDefinitionAddress;
    }

    const publishPromise = Promise.resolve(
      this.services.publishComment(
        publishPayload,
        {
          content: text,
        },
      ),
    );

    this.modalCommentPublishPromise = publishPromise;

    try {
      const result = await publishPromise;
      if (!result?.ok || !result.event) {
        throw result?.error || new Error("publish-failed");
      }

      const event = this.enrichCommentEvent(result.event);
      if (this.commentThreadService) {
        try {
          this.commentThreadService.processIncomingEvent(event);
        } catch (error) {
          devLogger.warn(
            "[comment] Failed to process optimistic comment event:",
            error,
          );
          this.videoModal.appendComment?.(event);
        }
      } else {
        this.videoModal.appendComment?.(event);
      }

      this.videoModal.resetCommentComposer?.();
      this.applyCommentComposerAuthState();
      this.videoModal.setCommentStatus?.("Comment posted.");
    } catch (error) {
      devLogger.warn("[comment] Failed to publish comment:", error);
      this.videoModal.setCommentComposerState?.({
        disabled: false,
        reason: "error",
      });
      this.callbacks.showError("Failed to post comment. Please try again.");
    } finally {
      if (this.modalCommentPublishPromise === publishPromise) {
        this.modalCommentPublishPromise = null;
      }
    }
  }

  handleVideoModalCommentLoadMore() {
    if (!this.commentThreadService || !this.currentVideo) {
      return;
    }

    if (this.modalCommentLoadPromise) {
      return;
    }

    const increment = this.commentThreadService.defaultLimit || DEFAULT_LIMIT;
    this.modalCommentLimit = (this.modalCommentLimit || increment) + increment;

    const loadPromise = this.commentThreadService.loadThread({
      video: this.currentVideo,
      parentCommentId: this.modalCommentState.parentCommentId,
      limit: this.modalCommentLimit,
    });

    if (!loadPromise || typeof loadPromise.then !== "function") {
      return;
    }

    this.modalCommentLoadPromise = loadPromise;
    loadPromise
      .then(() => {
        if (this.modalCommentLoadPromise === loadPromise) {
          this.modalCommentLoadPromise = null;
        }
        this.applyCommentComposerAuthState();
      })
      .catch((error) => {
        if (this.modalCommentLoadPromise === loadPromise) {
          this.modalCommentLoadPromise = null;
        }
        devLogger.warn("[comment] Failed to load more comments:", error);
        this.callbacks.showError(
          "Failed to load more comments. Please try again.",
        );
      });
  }

  handleVideoModalCommentLoginRequired(detail = {}) {
    this.applyCommentComposerAuthState();
    try {
      this.auth.initializeLoginModalController({ logIfMissing: true });
    } catch (error) {
      devLogger.warn(
        "[comment] Failed to initialize login modal controller:",
        error,
      );
    }

    const triggerElement = detail?.triggerElement || null;
    try {
      const loginModalController = this.auth.getLoginModalController();
      if (
        loginModalController &&
        typeof loginModalController.openModal === "function"
      ) {
        const opened = loginModalController.openModal({ triggerElement });
        if (opened) {
          return;
        }
      }
    } catch (error) {
      devLogger.warn("[comment] Failed to open login modal:", error);
    }

    Promise.resolve(
      this.auth.requestLogin({ allowAccountSelection: true }),
    ).catch((error) => {
      devLogger.warn("[comment] Login request failed:", error);
    });
  }

  async handleVideoModalCommentMute(detail = {}) {
    const pubkey = normalizeString(detail?.pubkey);
    if (!pubkey) {
      return;
    }

    if (!this.auth.isLoggedIn()) {
      this.handleVideoModalCommentLoginRequired(detail);
      return;
    }

    try {
      await Promise.resolve(this.callbacks.muteAuthor(pubkey));
      const snapshot = this.commentThreadService?.getSnapshot?.();
      if (snapshot) {
        this.handleCommentThreadReady(snapshot);
      }
      this.callbacks.showStatus?.("Author muted.");
    } catch (error) {
      devLogger.warn("[comment] Failed to mute author:", error);
      this.callbacks.showError("Failed to mute this author. Please try again.");
    }
  }
}
