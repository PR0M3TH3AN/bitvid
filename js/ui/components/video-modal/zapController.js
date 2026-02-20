import createPopover from "../../overlay/popoverEngine.js";
import { devLogger } from "../../../utils/logger.js";

export class ZapController {
  constructor({ modal }) {
    this.modal = modal;

    // DOM Elements
    this.modalZapDialog = null;
    this.modalZapForm = null;
    this.modalZapAmountInput = null;
    this.modalZapCommentInput = null;
    this.modalZapSplitSummary = null;
    this.modalZapStatusEl = null;
    this.modalZapReceipts = null;
    this.modalZapSendBtn = null;
    this.modalZapCloseBtn = null;
    this.modalZapWalletPrompt = null;
    this.modalZapWalletLink = null;
    this.modalZapBtn = null;

    // State
    this.modalZapDialogOpen = false;
    this.modalZapPending = false;
    this.modalZapRequiresLogin = false;
    this.modalZapPopover = null;
    this.modalZapOpenPromise = null;
    this.modalZapPendingToggle = null;
  }

  get document() {
    return this.modal?.document || null;
  }

  get window() {
    return this.modal?.window || null;
  }

  initialize({ playerModal }) {
    if (!playerModal) return;

    this.modalZapDialog = playerModal.querySelector("#modalZapDialog") || null;
    this.modalZapForm = playerModal.querySelector("#modalZapForm") || null;
    this.modalZapAmountInput =
      playerModal.querySelector("#modalZapAmountInput") || null;
    this.modalZapCommentInput =
      playerModal.querySelector("#modalZapCommentInput") || null;
    this.modalZapSplitSummary =
      playerModal.querySelector("#modalZapSplitSummary") || null;
    this.modalZapStatusEl =
      playerModal.querySelector("#modalZapStatus") || null;
    this.modalZapReceipts =
      playerModal.querySelector("#modalZapReceipts") || null;
    this.modalZapSendBtn =
      playerModal.querySelector("#modalZapSendBtn") || null;
    this.modalZapCloseBtn =
      playerModal.querySelector("#modalZapCloseBtn") || null;
    this.modalZapWalletPrompt =
      playerModal.querySelector("#modalZapWalletPrompt") || null;
    this.modalZapWalletLink =
      playerModal.querySelector("#modalZapWalletLink") || null;
    this.modalZapBtn = playerModal.querySelector("#modalZapBtn") || null;

    this.modalZapDialogOpen = false;
    this.setupModalZapPopover();

    this.bindEvents();
    this.setZapVisibility(false);
  }

  destroy() {
    if (this.modalZapPopover?.destroy) {
      this.modalZapPopover.destroy();
    }
    this.modalZapPopover = null;
    this.modalZapOpenPromise = null;
    this.modalZapPendingToggle = null;

    // Clear references
    this.modalZapDialog = null;
    this.modalZapForm = null;
    this.modalZapAmountInput = null;
    this.modalZapCommentInput = null;
    this.modalZapSplitSummary = null;
    this.modalZapStatusEl = null;
    this.modalZapReceipts = null;
    this.modalZapSendBtn = null;
    this.modalZapCloseBtn = null;
    this.modalZapWalletPrompt = null;
    this.modalZapWalletLink = null;
    this.modalZapBtn = null;
  }

  bindEvents() {
    if (this.modalZapBtn) {
      this.modalZapBtn.addEventListener("click", (event) => {
        event?.preventDefault?.();
        event?.stopPropagation?.();

        if (this.modalZapBtn?.disabled) {
          return;
        }

        if (this.modalZapRequiresLogin) {
          this.modal.dispatch(
            "zap:open",
            {
              video: this.modal.activeVideo,
              requiresLogin: true,
            },
            { cancelable: false },
          );
          return;
        }

        const popoverIsOpen = this.isZapDialogOpen();

        if (this.modalZapOpenPromise) {
          this.modalZapPendingToggle = "close";
          this.closeZapDialog({ silent: true, restoreFocus: false });
          return;
        }

        if (popoverIsOpen) {
          if (this.modalZapPending) {
            return;
          }

          this.closeZapDialog();
          return;
        }

        const allowed = this.modal.dispatch(
          "zap:open",
          { video: this.modal.activeVideo },
          { cancelable: true },
        );
        if (allowed === false) {
          return;
        }

        this.modalZapPendingToggle = null;
        this.openZapDialog();
      });
    }

    if (this.modalZapCloseBtn) {
      this.modalZapCloseBtn.addEventListener("click", (event) => {
        event?.preventDefault?.();
        this.closeZapDialog();
      });
    }

    if (this.modalZapWalletLink) {
      this.modalZapWalletLink.addEventListener("click", (event) => {
        event?.preventDefault?.();
        this.modal.dispatch("zap:wallet-link", { video: this.modal.activeVideo });
      });
    }

    if (this.modalZapForm) {
      this.modalZapForm.addEventListener("submit", (event) => {
        event?.preventDefault?.();
        if (this.modalZapSendBtn?.dataset.completed === "true") {
          this.closeZapDialog();
          return;
        }
        if (this.modalZapSendBtn?.disabled) {
          return;
        }
        this.modal.dispatch("video:zap", {
          video: this.modal.activeVideo,
          amount: this.getZapAmountValue(),
          comment: this.getZapCommentValue()
        });
      });
    }

    if (this.modalZapSendBtn) {
      this.modalZapSendBtn.addEventListener("click", (event) => {
        if (this.modalZapSendBtn?.dataset.completed === "true") {
          event?.preventDefault?.();
          this.closeZapDialog();
        }
      });
    }

    if (this.modalZapAmountInput) {
      const amountHandler = () => {
        this.modal.dispatch("zap:amount-change", {
          video: this.modal.activeVideo,
          amount: this.getZapAmountValue()
        });
      };
      this.modalZapAmountInput.addEventListener("input", amountHandler);
      this.modalZapAmountInput.addEventListener("change", amountHandler);
    }

    if (this.modalZapCommentInput) {
      const commentHandler = () => {
        this.modal.dispatch("zap:comment-change", {
          video: this.modal.activeVideo,
          comment: this.getZapCommentValue()
        });
      };
      this.modalZapCommentInput.addEventListener("input", commentHandler);
    }
  }

  setupModalZapPopover() {
    if (!this.modalZapDialog) {
      this.modalZapPopover = null;
      return;
    }

    if (!this.modalZapDialog.dataset.state) {
      const isHidden =
        this.modalZapDialog.hasAttribute("hidden") ||
        this.modalZapDialog.getAttribute("aria-hidden") === "true";
      this.modalZapDialog.dataset.state = isHidden ? "closed" : "open";
    }

    if (this.modalZapDialog.dataset.state !== "open") {
      this.modalZapDialog.hidden = true;
      this.modalZapDialog.setAttribute("aria-hidden", "true");
      this.modalZapDialogOpen = false;
    }

    if (!this.modalZapBtn) {
      this.modalZapPopover = null;
      return;
    }

    const documentRef =
      this.modalZapDialog.ownerDocument ||
      this.modalZapBtn.ownerDocument ||
      this.document ||
      (typeof document !== "undefined" ? document : null);

    const popover = createPopover(
      this.modalZapBtn,
      () => this.modalZapDialog,
      {
        document: documentRef,
        placement: "bottom-end",
        restoreFocusOnClose: true,
      },
    );

    if (!popover) {
      this.modalZapPopover = null;
      return;
    }

    const originalOpen = popover.open?.bind(popover);
    if (originalOpen) {
      popover.open = async (...args) => {
        const result = await originalOpen(...args);
        if (result) {
          this.modalZapDialog.dataset.state = "open";
          this.modalZapDialog.hidden = false;
          this.modalZapDialog.setAttribute("aria-hidden", "false");
          this.modalZapDialogOpen = true;
          if (this.modalZapBtn) {
            this.modalZapBtn.setAttribute("aria-expanded", "true");
          }
          this.focusZapAmount();
        }
        return result;
      };
    }

    const originalClose = popover.close?.bind(popover);
    if (originalClose) {
      popover.close = (options = {}) => {
        const { silent = false, ...rest } = options;
        const wasOpen = popover.isOpen?.() === true;
        const result = originalClose(rest);
        const wasDialogMarkedOpen =
          this.modalZapDialogOpen === true ||
          this.modalZapDialog?.dataset?.state === "open";
        if (wasOpen || wasDialogMarkedOpen) {
          this.modalZapPendingToggle = null;
          this.modalZapOpenPromise = null;
          this.modalZapDialog.dataset.state = "closed";
          this.modalZapDialog.setAttribute("aria-hidden", "true");
          this.modalZapDialog.hidden = true;
          this.modalZapDialogOpen = false;
          if (this.modalZapBtn) {
            this.modalZapBtn.setAttribute("aria-expanded", "false");
          }
          if (!silent && (wasOpen || wasDialogMarkedOpen)) {
            this.modal.dispatch("zap:close", { video: this.modal.activeVideo });
          }
        }
        return result;
      };
    }

    const originalDestroy = popover.destroy?.bind(popover);
    if (originalDestroy) {
      popover.destroy = (...args) => {
        originalDestroy(...args);
        if (this.modalZapPopover === popover) {
          this.modalZapPopover = null;
        }
      };
    }

    this.modalZapPopover = popover;
  }

  setZapVisibility(visible, options = {}) {
    let config;
    if (typeof visible === "object" && visible !== null) {
      config = { ...visible };
    } else {
      config = {
        visible,
        ...(options && typeof options === "object" ? options : {}),
      };
    }

    const shouldShow = !!config.visible;
    const requiresLogin = shouldShow && !!config.requiresLogin;
    this.modalZapRequiresLogin = requiresLogin;

    if (this.modalZapBtn) {
      this.modalZapBtn.toggleAttribute("hidden", !shouldShow);
      const disableButton =
        !shouldShow || (this.modalZapPending && !requiresLogin);
      this.modalZapBtn.disabled = disableButton;
      const ariaDisabledValue =
        requiresLogin || !shouldShow ? "true" : "false";
      this.modalZapBtn.setAttribute("aria-disabled", ariaDisabledValue);
      this.modalZapBtn.setAttribute("aria-hidden", (!shouldShow).toString());
      this.modalZapBtn.setAttribute("aria-expanded", "false");
      if (shouldShow) {
        this.modalZapBtn.removeAttribute("tabindex");
      } else {
        this.modalZapBtn.setAttribute("tabindex", "-1");
      }
      if (requiresLogin) {
        this.modalZapBtn.dataset.requiresLogin = "true";
        this.modalZapBtn.removeAttribute("aria-busy");
        this.modalZapBtn.classList.remove("opacity-50", "pointer-events-none");
      } else {
        delete this.modalZapBtn.dataset.requiresLogin;
        if (this.modalZapPending) {
          this.modalZapBtn.setAttribute("aria-busy", "true");
          this.modalZapBtn.classList.add("opacity-50", "pointer-events-none");
        } else {
          this.modalZapBtn.removeAttribute("aria-busy");
          this.modalZapBtn.classList.remove(
            "opacity-50",
            "pointer-events-none",
          );
        }
      }
    }

    if (!shouldShow || requiresLogin) {
      this.closeZapDialog({ silent: true, restoreFocus: false });
    }
  }

  setWalletPromptVisible(visible) {
    if (!this.modalZapWalletPrompt) {
      return;
    }
    const shouldShow = !!visible;
    this.modalZapWalletPrompt.toggleAttribute("hidden", !shouldShow);
    this.modalZapWalletPrompt.setAttribute(
      "aria-hidden",
      (!shouldShow).toString()
    );
  }

  async openZapDialog() {
    if (this.modalZapRequiresLogin) {
      return Promise.resolve(false);
    }

    if (this.modalZapOpenPromise) {
      return this.modalZapOpenPromise;
    }

    const runOpen = async () => {
      if (this.modalZapPopover?.open) {
        const opened = await this.modalZapPopover.open();
        if (opened) {
          this.modalZapDialogOpen = true;
          if (this.modalZapDialog) {
            this.modalZapDialog.dataset.state = "open";
            this.modalZapDialog.hidden = false;
            this.modalZapDialog.setAttribute("aria-hidden", "false");
          }
          this.focusZapAmount();
          return true;
        }

        if (this.modalZapDialog) {
          this.modalZapDialog.hidden = false;
          this.modalZapDialog.dataset.state = "open";
          this.modalZapDialog.setAttribute("aria-hidden", "false");
          this.modalZapDialogOpen = true;
          if (this.modalZapBtn) {
            this.modalZapBtn.setAttribute("aria-expanded", "true");
          }
          this.focusZapAmount();
          return true;
        }

        return opened;
      }

      if (!this.modalZapDialog) {
        return false;
      }

      this.modalZapDialog.hidden = false;
      this.modalZapDialog.dataset.state = "open";
      this.modalZapDialog.setAttribute("aria-hidden", "false");
      this.modalZapDialogOpen = true;
      if (this.modalZapBtn) {
        this.modalZapBtn.setAttribute("aria-expanded", "true");
      }
      this.focusZapAmount();
      return true;
    };

    const promise = runOpen().catch((error) => {
      this.log("[ZapController] Failed to open zap popover", error);
      return false;
    });

    this.modalZapOpenPromise = promise.finally(() => {
      const shouldClose = this.modalZapPendingToggle === "close";
      this.modalZapOpenPromise = null;
      this.modalZapPendingToggle = null;
      if (shouldClose && !this.modalZapPending) {
        this.closeZapDialog();
      }
    });

    return this.modalZapOpenPromise;
  }

  closeZapDialog({ silent = false, restoreFocus } = {}) {
    const dialogAppearsOpen = this.isZapDialogOpen();

    if (this.modalZapOpenPromise && !dialogAppearsOpen) {
      this.modalZapPendingToggle = "close";
      return;
    }

    this.modalZapPendingToggle = null;
    if (this.modalZapPopover?.close) {
      const options = { silent };
      if (restoreFocus !== undefined) {
        options.restoreFocus = restoreFocus;
      }
      const closeResult = this.modalZapPopover.close(options);

      if (
        closeResult !== true &&
        this.modalZapDialog &&
        this.modalZapDialogOpen
      ) {
        this.modalZapDialog.dataset.state = "closed";
        this.modalZapDialog.setAttribute("aria-hidden", "true");
        this.modalZapDialog.hidden = true;
        this.modalZapDialogOpen = false;
        if (this.modalZapBtn) {
          this.modalZapBtn.setAttribute("aria-expanded", "false");
        }
        if (!silent) {
          this.modal.dispatch("zap:close", { video: this.modal.activeVideo });
        }
      }

      return;
    }

    if (!this.modalZapDialog) {
      return;
    }
    if (this.modalZapDialogOpen) {
      this.modalZapDialog.dataset.state = "closed";
      this.modalZapDialog.setAttribute("aria-hidden", "true");
      this.modalZapDialog.hidden = true;
      this.modalZapDialogOpen = false;
      if (this.modalZapBtn) {
        this.modalZapBtn.setAttribute("aria-expanded", "false");
      }
      if (!silent) {
        this.modal.dispatch("zap:close", { video: this.modal.activeVideo });
      }
    }
  }

  isZapDialogOpen() {
    const popoverIsOpen =
      typeof this.modalZapPopover?.isOpen === "function"
        ? this.modalZapPopover.isOpen()
        : null;

    if (popoverIsOpen === true) {
      return true;
    }

    if (popoverIsOpen === false && this.modalZapDialogOpen) {
      return true;
    }

    if (this.modalZapDialog?.dataset?.state === "open") {
      return true;
    }

    if (this.modalZapDialog && this.modalZapDialog.hidden === false) {
      return true;
    }

    return !!this.modalZapDialogOpen;
  }

  focusZapAmount() {
    if (
      this.modalZapAmountInput &&
      typeof this.modalZapAmountInput.focus === "function"
    ) {
      this.modalZapAmountInput.focus();
    }
  }

  getZapAmountValue() {
    if (!this.modalZapAmountInput) {
      return 0;
    }
    const numeric = Number(this.modalZapAmountInput.value);
    if (!Number.isFinite(numeric)) {
      return 0;
    }
    return Math.max(0, Math.round(numeric));
  }

  setZapAmount(value) {
    if (!this.modalZapAmountInput) {
      return;
    }
    if (value === null || value === undefined || value === "") {
      this.modalZapAmountInput.value = "";
      return;
    }
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      this.modalZapAmountInput.value = Math.max(0, Math.round(numeric));
      return;
    }
    this.modalZapAmountInput.value = value;
  }

  getZapCommentValue() {
    if (!this.modalZapCommentInput) {
      return "";
    }
    return (this.modalZapCommentInput.value || "").trim();
  }

  setZapComment(value) {
    if (!this.modalZapCommentInput) {
      return;
    }
    this.modalZapCommentInput.value = typeof value === "string" ? value : "";
  }

  resetZapForm({ amount = "", comment = "" } = {}) {
    this.setZapAmount(amount);
    this.setZapComment(comment);
    this.setZapStatus("", "neutral");
    this.clearZapReceipts();
    this.setZapRetryPending(false);
    this.setZapCompleted(false);
  }

  setZapSplitSummary(text) {
    if (!this.modalZapSplitSummary) {
      return;
    }
    const message = typeof text === "string" ? text : "";
    this.modalZapSplitSummary.textContent =
      message || "Enter an amount to view the split.";
  }

  setZapStatus(message, tone = "neutral") {
    if (!this.modalZapStatusEl) {
      return;
    }

    const normalizedTone = typeof tone === "string" ? tone : "neutral";
    const text = typeof message === "string" ? message : "";
    this.modalZapStatusEl.textContent = text;
    this.modalZapStatusEl.classList.remove(
      "text-text",
      "text-muted",
      "text-info",
      "text-critical",
      "text-warning-strong"
    );

    if (!text) {
      this.modalZapStatusEl.classList.add("text-muted");
      return;
    }

    if (normalizedTone === "success") {
      this.modalZapStatusEl.classList.add("text-info");
    } else if (normalizedTone === "error") {
      this.modalZapStatusEl.classList.add("text-critical");
    } else if (normalizedTone === "warning") {
      this.modalZapStatusEl.classList.add("text-warning-strong");
    } else {
      this.modalZapStatusEl.classList.add("text-text");
    }
  }

  clearZapReceipts() {
    if (!this.modalZapReceipts) {
      return;
    }
    while (this.modalZapReceipts.firstChild) {
      this.modalZapReceipts.removeChild(this.modalZapReceipts.firstChild);
    }
  }

  renderZapReceipts(receipts = [], { partial = false } = {}) {
    if (!this.modalZapReceipts || !this.document) {
      return;
    }

    this.clearZapReceipts();

    if (!Array.isArray(receipts) || receipts.length === 0) {
      if (partial) {
        const empty = this.document.createElement("li");
        empty.className = "text-sm text-text";
        empty.textContent = "No zap receipts available.";
        this.modalZapReceipts.appendChild(empty);
      }
      return;
    }

    const normalized = receipts.filter(
      (receipt) => receipt && typeof receipt === "object"
    );

    const validatedReceipts = normalized.filter(
      (receipt) => receipt?.validation?.status === "passed" && receipt.validation.event
    );

    const paymentFailures = normalized.filter((receipt) => {
      if (!receipt) {
        return false;
      }
      const status =
        typeof receipt.status === "string" ? receipt.status.toLowerCase() : "";
      return status && status !== "success";
    });

    const unvalidatedReceipts = normalized.filter((receipt) => {
      if (!receipt) {
        return false;
      }
      const status =
        typeof receipt.status === "string" ? receipt.status.toLowerCase() : "success";
      if (status !== "success" && status !== "") {
        return false;
      }
      const validationStatus =
        typeof receipt.validation?.status === "string"
          ? receipt.validation.status.toLowerCase()
          : "";
      if (!validationStatus || validationStatus === "skipped") {
        return false;
      }
      return validationStatus !== "passed";
    });

    const renderReceiptItem = ({ receipt, tone }) => {
      const li = this.document.createElement("li");
      li.className = "rounded border border-border p-3 bg-overlay-panel-soft";

      const header = this.document.createElement("div");
      header.className =
        "flex items-center justify-between gap-2 text-xs text-text";

      const shareType = receipt.recipientType || receipt.type || "creator";
      const shareLabel = this.document.createElement("span");
      const isPlatformShare = shareType === "platform";
      const label = isPlatformShare
        ? "Platform fee"
        : shareType === "creator"
          ? "Creator"
          : "Lightning";
      shareLabel.textContent = `${label} • ${Math.max(
        0,
        Math.round(Number(receipt.amount || 0))
      )} sats`;

      const status = this.document.createElement("span");
      if (tone === "validated") {
        status.textContent = "Validated";
        status.className = "text-info";
      } else if (tone === "failed") {
        status.textContent = "Failed";
        status.className = "text-critical";
      } else {
        status.textContent = "Pending";
        status.className = "text-muted";
      }

      header.appendChild(shareLabel);
      header.appendChild(status);
      li.appendChild(header);

      const address = this.document.createElement("p");
      address.className = "mt-1 text-xs text-text break-all";
      if (receipt.address && !isPlatformShare) {
        address.textContent = receipt.address;
        li.appendChild(address);
      }

      const detail = this.document.createElement("p");
      detail.className = "mt-2 text-xs text-muted";
      if (tone === "failed") {
        const errorMessage =
          (receipt.error && receipt.error.message) ||
          (typeof receipt.error === "string"
            ? receipt.error
            : "Payment failed.");
        detail.textContent = errorMessage;
      } else {
        let detailMessage = "Invoice settled.";
        const preimage = receipt.payment?.result?.preimage;
        if (typeof preimage === "string" && preimage) {
          detailMessage = `Preimage: ${preimage.slice(0, 18)}${
            preimage.length > 18 ? "…" : ""
          }`;
        }
        detail.textContent = detailMessage;
      }
      li.appendChild(detail);

      this.modalZapReceipts.appendChild(li);
    };

    validatedReceipts.forEach((receipt) => {
      renderReceiptItem({ receipt, tone: "validated" });
    });

    paymentFailures.forEach((receipt) => {
      renderReceiptItem({ receipt, tone: "failed" });
    });

    if (!validatedReceipts.length && !paymentFailures.length && !unvalidatedReceipts.length) {
      const empty = this.document.createElement("li");
      empty.className = "text-sm text-text";
      empty.textContent = partial
        ? "No zap receipts available."
        : "No zap receipts published yet.";
      this.modalZapReceipts.appendChild(empty);
      return;
    }

    if (unvalidatedReceipts.length) {
      const warning = this.document.createElement("li");
      warning.className =
        "rounded border border-border p-3 bg-overlay-panel-soft text-xs text-warning-strong";
      const summaries = unvalidatedReceipts.map((receipt) => {
        const shareType = receipt.recipientType || receipt.type || "creator";
        const label =
          shareType === "platform"
            ? "Platform"
            : shareType === "creator"
              ? "Creator"
              : "Lightning";
        const address =
          typeof receipt.address === "string" && receipt.address
            ? ` (${receipt.address})`
            : "";
        const reason =
          typeof receipt.validation?.reason === "string" && receipt.validation.reason
            ? ` — ${receipt.validation.reason}`
            : " — Awaiting compliant receipt.";
        return `${label}${address}${reason}`;
      });

      const intro = validatedReceipts.length
        ? "Awaiting validated zap receipt for remaining share(s)."
        : "No validated zap receipts yet.";
      warning.textContent = `${intro} ${summaries.join(" ")}`.trim();
      this.modalZapReceipts.appendChild(warning);
    }
  }

  setZapPending(pending) {
    const isPending = !!pending;
    this.modalZapPending = isPending;

    if (this.modalZapSendBtn) {
      this.modalZapSendBtn.disabled = isPending;
      this.modalZapSendBtn.setAttribute(
        "aria-busy",
        isPending ? "true" : "false"
      );
      this.modalZapSendBtn.classList.toggle("opacity-50", isPending);
      this.modalZapSendBtn.classList.toggle("pointer-events-none", isPending);
    }

    if (this.modalZapAmountInput) {
      this.modalZapAmountInput.disabled = isPending;
    }

    if (this.modalZapCommentInput) {
      this.modalZapCommentInput.disabled = isPending;
    }

    if (this.modalZapCloseBtn) {
      this.modalZapCloseBtn.disabled = isPending;
      this.modalZapCloseBtn.classList.toggle("opacity-50", isPending);
      this.modalZapCloseBtn.classList.toggle("pointer-events-none", isPending);
    }

    if (this.modalZapBtn) {
      const buttonHidden = this.modalZapBtn.hasAttribute("hidden");
      if (isPending && !this.modalZapRequiresLogin) {
        this.modalZapBtn.disabled = true;
        this.modalZapBtn.setAttribute("aria-busy", "true");
        this.modalZapBtn.classList.add("opacity-50", "pointer-events-none");
      } else if (!buttonHidden) {
        this.modalZapBtn.disabled = false;
        this.modalZapBtn.removeAttribute("aria-busy");
        this.modalZapBtn.classList.remove("opacity-50", "pointer-events-none");
      } else {
        this.modalZapBtn.removeAttribute("aria-busy");
        this.modalZapBtn.classList.remove("opacity-50", "pointer-events-none");
        this.modalZapBtn.disabled = true;
      }
    }
  }

  setZapRetryPending(pending, { summary = "" } = {}) {
    if (!this.modalZapSendBtn) {
      return;
    }

    if (pending) {
      delete this.modalZapSendBtn.dataset.completed;
      this.modalZapSendBtn.dataset.retryPending = "true";
      if (summary) {
        this.modalZapSendBtn.dataset.retrySummary = summary;
      } else {
        delete this.modalZapSendBtn.dataset.retrySummary;
      }
    } else {
      delete this.modalZapSendBtn.dataset.retryPending;
      delete this.modalZapSendBtn.dataset.retrySummary;
    }

    this.applyZapSendButtonState();
  }

  setZapCompleted(completed) {
    if (!this.modalZapSendBtn) {
      return;
    }

    if (completed) {
      delete this.modalZapSendBtn.dataset.retryPending;
      delete this.modalZapSendBtn.dataset.retrySummary;
      this.modalZapSendBtn.dataset.completed = "true";
    } else {
      delete this.modalZapSendBtn.dataset.completed;
    }

    this.applyZapSendButtonState();
  }

  applyZapSendButtonState() {
    if (!this.modalZapSendBtn) {
      return;
    }

    if (this.modalZapSendBtn.dataset.completed === "true") {
      this.modalZapSendBtn.textContent = "Done";
      this.modalZapSendBtn.setAttribute("aria-label", "Close zap dialog");
      this.modalZapSendBtn.title = "Close zap dialog";
      return;
    }

    if (this.modalZapSendBtn.dataset.retryPending === "true") {
      this.modalZapSendBtn.textContent = "Retry";
      this.modalZapSendBtn.setAttribute(
        "aria-label",
        "Retry failed zap shares"
      );
      const summary = this.modalZapSendBtn.dataset.retrySummary;
      if (summary) {
        this.modalZapSendBtn.title = summary;
      } else {
        this.modalZapSendBtn.removeAttribute("title");
      }
      return;
    }

    this.modalZapSendBtn.textContent = "Send";
    this.modalZapSendBtn.setAttribute("aria-label", "Send a zap");
    this.modalZapSendBtn.removeAttribute("title");
  }

  log(message, ...args) {
    if (this.modal.logger && typeof this.modal.logger.log === "function") {
      this.modal.logger.log(message, ...args);
      return;
    }
    devLogger.log(message, ...args);
  }
}
