export class CommentsController {
  constructor({ modal } = {}) {
    this.modal = modal;
    this.root = null;
  }

  initialize({ playerModal } = {}) {
    if (!this.modal) {
      return;
    }

    const root = playerModal?.querySelector("[data-comments-root]") || null;
    this.root = root;
    this.modal.commentsRoot = root;
    this.modal.commentsContainer = root;
    this.modal.commentsCountLabel =
      root?.querySelector("[data-comments-count]") || null;
    this.modal.commentsEmptyState =
      root?.querySelector("[data-comments-empty]") || null;
    this.modal.commentsList =
      root?.querySelector("[data-comments-list]") || null;
    this.modal.commentsLoadMoreButton =
      root?.querySelector("[data-comments-load-more]") || null;
    this.modal.commentsDisabledPlaceholder =
      playerModal?.querySelector("[data-comments-disabled-placeholder]") ||
      root?.querySelector("[data-comments-disabled]") ||
      null;
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
      const disabledText =
        this.modal.commentsDisabledPlaceholder.textContent || "";
      if (disabledText) {
        this.modal.commentsDisabledPlaceholderDefaultText = disabledText;
      }
      this.modal.commentsDisabledPlaceholder.setAttribute("hidden", "");
    }

    if (this.modal.commentsComposer) {
      this.modal.commentsComposer.removeAttribute("hidden");
    }

    this.modal.clearComments();
    this.modal.resetCommentComposer();
    this.modal.attachCommentEventHandlers();
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
    this.root = null;
  }
}

