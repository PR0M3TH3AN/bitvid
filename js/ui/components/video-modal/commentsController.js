import logger from "../../../utils/logger.js";
import { UI_FEEDBACK_DELAY_MS } from "../../../constants.js";
import { CommentsListRenderer } from "./commentsListRenderer.js";

export class CommentsController {
  constructor({ modal } = {}) {
    this.modal = modal;
    this.playerModal = null;
    this.renderer = new CommentsListRenderer({ controller: this });

    this.commentsRoot = null;
    this.commentsContainer = null;

    // Composer elements
    this.commentsComposer = null;
    this.commentsInput = null;
    this.commentsSubmitButton = null;
    this.commentsStatusMessage = null;
    this.commentsCharCount = null;
    this.commentComposerHint = null;
    this.commentRetryButton = null;
    this.commentsDisabledPlaceholder = null;
    this.commentsDisabledPlaceholderDefaultText = "";

    // Composer state
    this.commentComposerDefaultHint = "";
    this.commentComposerDefaultCountText = "";
    this.commentStatusDefaultText = "";
    this.commentComposerMaxLength = 0;
    this.commentComposerState = {
      disabled: true,
      reason: "",
      parentCommentId: null,
    };

    this.commentCallbacks = {
      teardown: null,
    };

    this.boundCommentSubmitHandler =
      this.handleCommentComposerSubmit.bind(this);
    this.boundCommentInputHandler =
      this.handleCommentComposerInput.bind(this);
    this.boundCommentRetryHandler = this.handleCommentRetry.bind(this);
  }

  get document() {
    return this.modal?.document || this.playerModal?.ownerDocument || (typeof document !== 'undefined' ? document : null);
  }

  get window() {
    return this.modal?.window || this.document?.defaultView || (typeof window !== 'undefined' ? window : null);
  }

  get logger() {
    return this.modal?.logger || logger;
  }

  get commentsList() {
      return this.renderer?.listRoot;
  }

  dispatch(type, detail, options) {
      return this.modal?.dispatch(type, detail, options);
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

    this.commentsRoot = root;
    this.commentsContainer = root;
    this.commentsDisabledPlaceholder = commentsDisabledPlaceholder;

    if (commentsDisabledPlaceholder) {
      const disabledText = commentsDisabledPlaceholder.textContent || "";
      if (disabledText) {
        this.commentsDisabledPlaceholderDefaultText = disabledText;
      }
    }

    if (!root) {
      logger.user.warn(
        "[VideoModal:comments] Missing [data-comments-root]; disabling comments UI"
      );
      this.disableComments({
        reason: "missing-root",
        message: this.commentsDisabledPlaceholderDefaultText ||
          "Comments are unavailable right now.",
      });
      return;
    }

    // Initialize Renderer
    const commentsList = root?.querySelector("[data-comments-list]") || null;
    const loadMoreButton = root?.querySelector("[data-comments-load-more]") || null;
    const countLabel = root?.querySelector("[data-comments-count]") || null;
    const emptyState = root?.querySelector("[data-comments-empty]") || null;

    this.renderer.initialize({
        list: commentsList,
        loadMoreButton,
        countLabel,
        emptyState
    });

    this.commentsComposer =
      root?.querySelector("[data-comments-composer]") || null;
    this.commentsInput =
      this.commentsComposer?.querySelector("[data-comments-input]") || null;
    this.commentsSubmitButton =
      this.commentsComposer?.querySelector("[data-comments-submit]") || null;
    this.commentsStatusMessage =
      this.commentsComposer?.querySelector("[data-comments-status]") ||
      root?.querySelector("[data-comments-status]") ||
      null;
    this.commentsCharCount =
      this.commentsComposer?.querySelector("[data-comments-char-count]") ||
      null;
    this.commentComposerHint =
      this.commentsComposer?.querySelector("#commentComposerHelp") ||
      this.commentsComposer?.querySelector(".comment-composer__hint") ||
      this.commentComposerHint ||
      null;

    const missingSelectors = [
      { selector: "[data-comments-list]", element: commentsList },
      {
        selector: "[data-comments-composer]",
        element: this.commentsComposer,
      },
      {
        selector: "[data-comments-input]",
        element: this.commentsInput,
      },
      {
        selector: "[data-comments-submit]",
        element: this.commentsSubmitButton,
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
        message: this.commentsDisabledPlaceholderDefaultText ||
          "Comments are unavailable right now.",
      });
      return;
    }

    if (this.playerModal) {
      this.playerModal.removeAttribute("data-comments-disabled");
      this.playerModal.classList?.remove("comments-disabled");
    }

    if (this.commentComposerHint) {
      const hintText = this.commentComposerHint.textContent || "";
      if (hintText) {
        this.commentComposerDefaultHint = hintText;
      }
    }

    if (this.commentsCharCount) {
      const countText = this.commentsCharCount.textContent || "";
      if (countText) {
        this.commentComposerDefaultCountText = countText;
      }
    }

    if (this.commentsStatusMessage) {
      const statusText = this.commentsStatusMessage.textContent || "";
      if (statusText) {
        this.commentStatusDefaultText = statusText;
      }
    }

    if (this.commentsInput) {
      const parsedMax = Number(this.commentsInput.maxLength);
      if (Number.isFinite(parsedMax) && parsedMax > 0) {
        this.commentComposerMaxLength = parsedMax;
      }
    }

    if (this.commentsDisabledPlaceholder) {
      this.commentsDisabledPlaceholder.setAttribute("hidden", "");
    }

    if (this.commentsComposer) {
      this.commentsComposer.removeAttribute("hidden");
    }

    this.clearComments();
    this.resetCommentComposer();
    this.attachCommentEventHandlers();
  }

  attachCommentEventHandlers() {
    if (this.commentsComposer && this.boundCommentSubmitHandler) {
      this.commentsComposer.addEventListener(
        "submit",
        this.boundCommentSubmitHandler
      );
    }
    if (this.commentsInput && this.boundCommentInputHandler) {
      this.commentsInput.addEventListener(
        "input",
        this.boundCommentInputHandler
      );
    }
    if (this.commentRetryButton && this.boundCommentRetryHandler) {
      this.commentRetryButton.addEventListener(
        "click",
        this.boundCommentRetryHandler
      );
    }
  }

  detachCommentEventHandlers() {
    if (this.commentsComposer && this.boundCommentSubmitHandler) {
      this.commentsComposer.removeEventListener(
        "submit",
        this.boundCommentSubmitHandler
      );
    }
    if (this.commentsInput && this.boundCommentInputHandler) {
      this.commentsInput.removeEventListener(
        "input",
        this.boundCommentInputHandler
      );
    }
    if (this.commentRetryButton && this.boundCommentRetryHandler) {
      this.commentRetryButton.removeEventListener(
        "click",
        this.boundCommentRetryHandler
      );
    }
  }

  handleCommentComposerSubmit(event) {
    if (event && typeof event.preventDefault === "function") {
      event.preventDefault();
    }

    const triggerElement =
      (event && event.submitter) || this.commentsSubmitButton || null;

    if (this.commentComposerState.reason === "login-required") {
      this.modal.dispatch("comment:login-required", { triggerElement });
      return;
    }

    if (this.commentComposerState.disabled) {
      return;
    }

    const text = this.getCommentInputValue();
    if (!text) {
      return;
    }

    this.modal.dispatch("comment:submit", {
      text,
      parentId: this.commentComposerState.parentCommentId || null,
      triggerElement,
    });
  }

  handleCommentComposerInput() {
    this.updateCommentCharCount();
    this.updateCommentSubmitState();
  }

  handleCommentRetry(event) {
    if (event && typeof event.preventDefault === "function") {
      event.preventDefault();
    }
    const triggerElement =
      (event && event.currentTarget) || this.commentRetryButton || null;
    this.modal.dispatch("comment:retry", {
      text: this.getCommentInputValue(),
      parentId: this.commentComposerState.parentCommentId || null,
      triggerElement,
    });
  }

  getCommentInputValue({ trimmed = true } = {}) {
    const value = this.commentsInput ? this.commentsInput.value || "" : "";
    return trimmed ? value.trim() : value;
  }

  updateCommentSubmitState() {
    if (!this.commentsSubmitButton) {
      return;
    }
    const hasText = !!this.getCommentInputValue();
    const shouldDisable = this.commentComposerState.disabled || !hasText;
    this.commentsSubmitButton.disabled = shouldDisable;
  }

  updateCommentCharCount() {
    if (!this.commentsCharCount) {
      return;
    }
    const length = this.commentsInput ? this.commentsInput.value.length : 0;
    const safeLength = Number.isFinite(length) ? Math.max(0, length) : 0;
    const max = Number.isFinite(this.commentComposerMaxLength)
      ? Math.max(0, this.commentComposerMaxLength)
      : 0;
    const label = max > 0 ? `${safeLength} / ${max}` : `${safeLength}`;
    this.commentsCharCount.textContent = label;
  }

  setCommentHintText(text) {
    if (!this.commentComposerHint) {
      return;
    }
    const message =
      typeof text === "string" && text
        ? text
        : this.commentComposerDefaultHint || "";
    this.commentComposerHint.textContent = message;
  }

  removeCommentRetryButton() {
    if (!this.commentRetryButton) {
      return;
    }
    this.commentRetryButton.removeEventListener(
      "click",
      this.boundCommentRetryHandler
    );
    if (this.commentRetryButton.parentNode) {
      this.commentRetryButton.parentNode.removeChild(this.commentRetryButton);
    }
    this.commentRetryButton = null;
  }

  setCommentStatus(message, { showRetry = false } = {}) {
    if (!this.commentsStatusMessage) {
      return;
    }

    this.removeCommentRetryButton();

    while (this.commentsStatusMessage.firstChild) {
      this.commentsStatusMessage.removeChild(
        this.commentsStatusMessage.firstChild
      );
    }

    const text =
      typeof message === "string" && message
        ? message
        : this.commentStatusDefaultText || "";
    if (text) {
      this.commentsStatusMessage.appendChild(
        this.document.createTextNode(text)
      );
    }

    if (showRetry) {
      const spacer = this.document.createTextNode(" ");
      const retryButton = this.document.createElement("button");
      retryButton.type = "button";
      retryButton.classList.add("comment-thread__retry", "focus-ring");
      retryButton.appendChild(this.document.createTextNode("Retry"));
      retryButton.addEventListener("click", this.boundCommentRetryHandler);
      this.commentsStatusMessage.appendChild(spacer);
      this.commentsStatusMessage.appendChild(retryButton);
      this.commentRetryButton = retryButton;
    }
  }

  setCommentsVisibility(isVisible) {
    const root = this.commentsContainer || this.commentsRoot;
    if (!root) {
      return;
    }
    const shouldShow = Boolean(isVisible);
    if (shouldShow) {
      root.removeAttribute("hidden");
      root.classList?.remove("hidden");
    } else {
      root.setAttribute("hidden", "");
      root.classList?.add("hidden");
    }
  }

  showCommentsDisabledMessage(message) {
    const placeholder = this.commentsDisabledPlaceholder;
    if (placeholder) {
      const fallbackText = this.commentsDisabledPlaceholderDefaultText || "";
      const nextText =
        typeof message === "string" && message.trim()
          ? message.trim()
          : fallbackText;
      if (nextText) {
        placeholder.textContent = nextText;
      } else if (fallbackText) {
        placeholder.textContent = fallbackText;
      }
      placeholder.removeAttribute("hidden");
      placeholder.classList?.remove("hidden");
    }
    this.setCommentsVisibility(false);
  }

  hideCommentsDisabledMessage() {
    const placeholder = this.commentsDisabledPlaceholder;
    if (placeholder) {
      if (this.commentsDisabledPlaceholderDefaultText) {
        placeholder.textContent = this.commentsDisabledPlaceholderDefaultText;
      }
      placeholder.setAttribute("hidden", "");
      placeholder.classList?.add("hidden");
    }
  }

  setCommentComposerState({ disabled = false, reason = "" } = {}) {
    const normalizedReason = typeof reason === "string" ? reason : "";

    let shouldDisable = !!disabled;
    switch (normalizedReason) {
      case "login-required":
      case "submitting":
      case "disabled":
        shouldDisable = true;
        break;
      case "error":
        shouldDisable = false;
        break;
      default:
        break;
    }

    this.commentComposerState.disabled = shouldDisable;
    this.commentComposerState.reason = normalizedReason;

    if (this.commentsInput) {
      this.commentsInput.disabled = shouldDisable;
    }

    if (normalizedReason !== "disabled") {
      this.hideCommentsDisabledMessage();
    }

    if (this.commentsComposer) {
      if (normalizedReason === "disabled") {
        this.commentsComposer.setAttribute("hidden", "");
      } else {
        this.commentsComposer.removeAttribute("hidden");
      }
    }

    if (normalizedReason === "login-required") {
      this.setCommentHintText("Log in to add a comment.");
      this.setCommentStatus("");
      this.setCommentsVisibility(true);
    } else if (normalizedReason === "submitting") {
      this.setCommentHintText(this.commentComposerDefaultHint);
      this.setCommentStatus("Posting comment…");
    } else if (normalizedReason === "error") {
      this.setCommentHintText(this.commentComposerDefaultHint);
      this.setCommentStatus("We couldn't post your comment. Try again?", {
        showRetry: true,
      });
    } else if (normalizedReason === "disabled") {
      this.setCommentHintText(this.commentComposerDefaultHint);
      this.setCommentStatus("");
    } else {
      this.setCommentHintText(this.commentComposerDefaultHint);
      this.setCommentStatus("");
    }

    this.updateCommentSubmitState();
  }

  resetCommentComposer() {
    if (this.commentsInput) {
      this.commentsInput.disabled = false;
      this.commentsInput.value = "";
    }
    this.hideCommentsDisabledMessage();
    this.commentComposerState = {
      disabled: false,
      reason: "",
      parentCommentId: null,
    };
    this.setCommentHintText(this.commentComposerDefaultHint);
    this.setCommentStatus("");
    this.updateCommentCharCount();
    this.updateCommentSubmitState();
  }

  setCommentSectionCallbacks({ teardown = null } = {}) {
    this.commentCallbacks.teardown =
      typeof teardown === "function" ? teardown : null;
  }

  invokeCommentTeardown() {
    const teardown = this.commentCallbacks.teardown;
    if (typeof teardown !== "function") {
      return;
    }
    this.commentCallbacks.teardown = null;
    try {
      teardown();
    } catch (error) {
      this.logger.log("[VideoModal] Failed to teardown comment services", error);
    }
  }

  renderComments(snapshot) {
    this.renderer.render(snapshot);
  }

  appendComment(event) {
    this.renderer.append(event);
  }

  clearComments() {
    this.renderer.clear();
  }

  disableComments({ message = "", reason = "" } = {}) {
    const placeholder =
      this.commentsDisabledPlaceholder ||
      this.ensureCommentsDisabledPlaceholder({ root: this.commentsRoot }) ||
      null;
    if (!this.commentsDisabledPlaceholder && placeholder) {
      this.commentsDisabledPlaceholder = placeholder;
      if (placeholder.textContent) {
        this.commentsDisabledPlaceholderDefaultText = placeholder.textContent;
      }
    }

    if (this.playerModal) {
      this.playerModal.setAttribute("data-comments-disabled", "true");
      this.playerModal.classList?.add("comments-disabled");
    }

    // Hide list via renderer?
    // The renderer manages list content, but visibility of the container might be controller concern?
    // In old code: this.commentsList.setAttribute("hidden", "");
    // Renderer has listRoot.
    if (this.renderer.listRoot) {
      this.renderer.listRoot.setAttribute("hidden", "");
      this.renderer.listRoot.classList?.add("hidden");
    }

    if (this.commentsComposer) {
      this.commentsComposer.setAttribute("hidden", "");
      this.commentsComposer.classList?.add("hidden");
    }

    const nextMessage =
      typeof message === "string" && message.trim()
        ? message.trim()
        : this.commentsDisabledPlaceholderDefaultText ||
          "Comments are unavailable right now.";

    this.showCommentsDisabledMessage(nextMessage);
    logger.dev?.info?.(
      "[VideoModal:comments] Disabled comments handling",
      { reason: reason || "unknown" }
    );
  }

  update(action = {}) {
    const { type } = action;
    switch (type) {
      case "set-visibility":
        this.setCommentsVisibility(action.visible);
        break;
      case "render":
        this.renderComments(action.snapshot);
        break;
      case "set-composer-state":
        this.setCommentComposerState(action.state);
        break;
      case "set-thread-context":
        this.setCommentThreadContext(action.context);
        break;
      case "clear":
        this.clearComments();
        break;
      default:
        break;
    }
  }

  setCommentThreadContext(context) {
    if (context) {
      this.commentThreadContext = { ...context };
    }
  }

  destroy() {
    this.detachCommentEventHandlers();
    this.removeCommentRetryButton();
    this.invokeCommentTeardown();

    this.renderer.destroy();

    this.commentsRoot = null;
    this.commentsContainer = null;

    this.commentsDisabledPlaceholder = null;
    this.commentsComposer = null;
    this.commentsInput = null;
    this.commentsSubmitButton = null;
    this.commentsStatusMessage = null;
    this.commentsCharCount = null;
    this.commentComposerHint = null;
    if (this.playerModal) {
      this.playerModal.removeAttribute("data-comments-disabled");
      this.playerModal.classList?.remove("comments-disabled");
    }
    this.playerModal = null;
  }

  ensureCommentsDisabledPlaceholder({ root } = {}) {
    const existing =
      this.commentsDisabledPlaceholder ||
      root?.querySelector?.("[data-comments-disabled-placeholder]") ||
      this.playerModal?.querySelector?.("[data-comments-disabled-placeholder]");
    if (existing) {
      return existing;
    }

    const doc = this.document;
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
      this.commentsDisabledPlaceholderDefaultText ||
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
