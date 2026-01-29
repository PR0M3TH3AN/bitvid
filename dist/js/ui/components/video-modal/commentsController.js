import logger from "../../../utils/logger.js";

export class CommentsController {
  constructor({ modal } = {}) {
    this.modal = modal;
    this.root = null;
    this.playerModal = null;
  }

  initialize({ playerModal } = {}) {
    if (!this.modal) {
      return;
    }

    this.playerModal = playerModal || null;
    const root = playerModal?.querySelector("[data-comments-root]") || null;
    const commentsDisabledPlaceholder =
      playerModal?.querySelector("[data-comments-disabled-placeholder]") ||
      root?.querySelector("[data-comments-disabled]") ||
      this.ensureCommentsDisabledPlaceholder({ root }) ||
      null;

    this.root = root;
    this.modal.commentsRoot = root;
    this.modal.commentsContainer = root;
    this.modal.commentsDisabledPlaceholder = commentsDisabledPlaceholder;

    if (commentsDisabledPlaceholder) {
      const disabledText = commentsDisabledPlaceholder.textContent || "";
      if (disabledText) {
        this.modal.commentsDisabledPlaceholderDefaultText = disabledText;
      }
    }

    if (!root) {
      logger.user.warn(
        "[VideoModal:comments] Missing [data-comments-root]; disabling comments UI"
      );
      this.disableComments({
        reason: "missing-root",
        message: this.modal.commentsDisabledPlaceholderDefaultText ||
          "Comments are unavailable right now.",
      });
      return;
    }

    this.modal.commentsCountLabel =
      root?.querySelector("[data-comments-count]") || null;
    this.modal.commentsEmptyState =
      root?.querySelector("[data-comments-empty]") || null;
    this.modal.commentsList =
      root?.querySelector("[data-comments-list]") || null;
    this.modal.commentsLoadMoreButton =
      root?.querySelector("[data-comments-load-more]") || null;
    this.modal.commentsComposer =
      root?.querySelector("[data-comments-composer]") || null;
    this.modal.commentsInput =
      this.modal.commentsComposer?.querySelector("[data-comments-input]") || null;
    this.modal.commentsSubmitButton =
      this.modal.commentsComposer?.querySelector("[data-comments-submit]") || null;
    this.modal.commentsStatusMessage =
      this.modal.commentsComposer?.querySelector("[data-comments-status]") ||
      root?.querySelector("[data-comments-status]") ||
      null;
    this.modal.commentsCharCount =
      this.modal.commentsComposer?.querySelector("[data-comments-char-count]") ||
      null;
    this.modal.commentComposerHint =
      this.modal.commentsComposer?.querySelector("#commentComposerHelp") ||
      this.modal.commentsComposer?.querySelector(".comment-composer__hint") ||
      this.modal.commentComposerHint ||
      null;

    const missingSelectors = [
      { selector: "[data-comments-list]", element: this.modal.commentsList },
      {
        selector: "[data-comments-composer]",
        element: this.modal.commentsComposer,
      },
      {
        selector: "[data-comments-input]",
        element: this.modal.commentsInput,
      },
      {
        selector: "[data-comments-submit]",
        element: this.modal.commentsSubmitButton,
      },
    ]
      .filter(({ element }) => !element)
      .map(({ selector }) => selector);

    if (missingSelectors.length > 0) {
      logger.user.warn(
        `[VideoModal:comments] Missing required selectors: ${missingSelectors.join(", ")}; disabling comments UI`
      );
      this.disableComments({
        reason: "missing-selectors",
        message: this.modal.commentsDisabledPlaceholderDefaultText ||
          "Comments are unavailable right now.",
      });
      return;
    }

    if (this.playerModal) {
      this.playerModal.removeAttribute("data-comments-disabled");
      this.playerModal.classList?.remove("comments-disabled");
    }

    if (this.modal.commentComposerHint) {
      const hintText = this.modal.commentComposerHint.textContent || "";
      if (hintText) {
        this.modal.commentComposerDefaultHint = hintText;
      }
    }

    if (this.modal.commentsCharCount) {
      const countText = this.modal.commentsCharCount.textContent || "";
      if (countText) {
        this.modal.commentComposerDefaultCountText = countText;
      }
    }

    if (this.modal.commentsStatusMessage) {
      const statusText = this.modal.commentsStatusMessage.textContent || "";
      if (statusText) {
        this.modal.commentStatusDefaultText = statusText;
      }
    }

    if (this.modal.commentsInput) {
      const parsedMax = Number(this.modal.commentsInput.maxLength);
      if (Number.isFinite(parsedMax) && parsedMax > 0) {
        this.modal.commentComposerMaxLength = parsedMax;
      }
    }

    if (this.modal.commentsDisabledPlaceholder) {
      this.modal.commentsDisabledPlaceholder.setAttribute("hidden", "");
    }

    if (this.modal.commentsComposer) {
      this.modal.commentsComposer.removeAttribute("hidden");
    }

    this.modal.clearComments();
    this.modal.resetCommentComposer();
    this.modal.attachCommentEventHandlers();
  }

  disableComments({ message = "", reason = "" } = {}) {
    const placeholder =
      this.modal.commentsDisabledPlaceholder ||
      this.ensureCommentsDisabledPlaceholder({ root: this.root }) ||
      null;
    if (!this.modal.commentsDisabledPlaceholder && placeholder) {
      this.modal.commentsDisabledPlaceholder = placeholder;
      if (placeholder.textContent) {
        this.modal.commentsDisabledPlaceholderDefaultText = placeholder.textContent;
      }
    }

    if (this.playerModal) {
      this.playerModal.setAttribute("data-comments-disabled", "true");
      this.playerModal.classList?.add("comments-disabled");
    }

    if (this.modal.commentsList) {
      this.modal.commentsList.setAttribute("hidden", "");
      this.modal.commentsList.classList?.add("hidden");
    }

    if (this.modal.commentsComposer) {
      this.modal.commentsComposer.setAttribute("hidden", "");
      this.modal.commentsComposer.classList?.add("hidden");
    }

    const nextMessage =
      typeof message === "string" && message.trim()
        ? message.trim()
        : this.modal.commentsDisabledPlaceholderDefaultText ||
          "Comments are unavailable right now.";

    this.modal.showCommentsDisabledMessage(nextMessage);
    logger.dev?.info?.(
      "[VideoModal:comments] Disabled comments handling",
      { reason: reason || "unknown" }
    );
  }

  update(action = {}) {
    if (!this.modal) {
      return;
    }
    const { type } = action;
    switch (type) {
      case "set-visibility":
        this.modal.setCommentsVisibility(action.visible);
        break;
      case "render":
        this.modal.renderComments(action.snapshot);
        break;
      case "set-composer-state":
        this.modal.setCommentComposerState(action.state);
        break;
      case "set-thread-context":
        this.modal.setCommentThreadContext(action.context);
        break;
      case "clear":
        this.modal.clearComments();
        break;
      default:
        break;
    }
  }

  destroy() {
    if (!this.modal) {
      return;
    }
    this.modal.detachCommentEventHandlers();
    this.modal.removeCommentRetryButton();
    this.modal.commentsRoot = null;
    this.modal.commentsContainer = null;
    this.modal.commentsCountLabel = null;
    this.modal.commentsEmptyState = null;
    this.modal.commentsList = null;
    this.modal.commentsLoadMoreButton = null;
    this.modal.commentsDisabledPlaceholder = null;
    this.modal.commentsComposer = null;
    this.modal.commentsInput = null;
    this.modal.commentsSubmitButton = null;
    this.modal.commentsStatusMessage = null;
    this.modal.commentsCharCount = null;
    this.modal.commentComposerHint = null;
    if (this.playerModal) {
      this.playerModal.removeAttribute("data-comments-disabled");
      this.playerModal.classList?.remove("comments-disabled");
    }
    this.root = null;
  }

  getDocument() {
    if (this.modal?.document) {
      return this.modal.document;
    }
    if (this.playerModal?.ownerDocument) {
      return this.playerModal.ownerDocument;
    }
    if (typeof document !== "undefined") {
      return document;
    }
    return null;
  }

  ensureCommentsDisabledPlaceholder({ root } = {}) {
    const existing =
      this.modal?.commentsDisabledPlaceholder ||
      root?.querySelector?.("[data-comments-disabled-placeholder]") ||
      this.playerModal?.querySelector?.("[data-comments-disabled-placeholder]");
    if (existing) {
      return existing;
    }

    const doc = this.getDocument();
    const container = root?.parentElement || this.playerModal || null;
    if (!doc || !container) {
      return null;
    }

    const placeholder = doc.createElement("div");
    placeholder.setAttribute("data-comments-disabled-placeholder", "");
    placeholder.setAttribute("role", "status");
    placeholder.setAttribute("aria-live", "polite");
    placeholder.setAttribute("hidden", "");
    placeholder.classList.add("comment-thread__disabled");

    const defaultText =
      this.modal?.commentsDisabledPlaceholderDefaultText ||
      "Comments are unavailable right now.";
    placeholder.textContent = defaultText;

    if (root?.parentElement) {
      root.parentElement.insertBefore(placeholder, root);
    } else {
      container.insertBefore(placeholder, container.firstChild);
    }

    return placeholder;
  }
}
