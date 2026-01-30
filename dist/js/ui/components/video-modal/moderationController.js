export class ModerationController {
  constructor({ modal } = {}) {
    this.modal = modal;
  }

  initialize({ playerModal } = {}) {
    if (!this.modal) {
      return;
    }

    this.modal.videoStage =
      playerModal?.querySelector(".video-modal__video") || null;
    this.modal.moderationOverlay =
      playerModal?.querySelector("[data-moderation-bar]") || null;
    this.modal.moderationBadge =
      this.modal.moderationOverlay?.querySelector(
        "[data-moderation-badge='true']",
      ) || null;
    this.modal.moderationBadgeText =
      this.modal.moderationOverlay?.querySelector("[data-moderation-text]") ||
      null;

    this.teardownPrimaryButton();
    this.modal.moderationActionsContainer =
      this.modal.moderationOverlay?.querySelector("[data-moderation-actions]") ||
      this.modal.moderationBadge?.querySelector(".moderation-badge__actions") ||
      null;

    const overrideButton =
      this.modal.moderationActionsContainer?.querySelector(
        "[data-moderation-action='override']",
      ) || null;
    if (overrideButton) {
      overrideButton.addEventListener(
        "click",
        this.modal.handleModerationOverrideClick,
      );
      this.modal.moderationPrimaryButton = overrideButton;
      this.modal.moderationPrimaryMode = "override";
    } else {
      this.modal.moderationPrimaryButton = null;
      this.modal.moderationPrimaryMode = "";
    }

    this.teardownBlockButton();
    const blockButton =
      this.modal.moderationActionsContainer?.querySelector(
        "[data-moderation-action='block']",
      ) || null;
    if (blockButton) {
      blockButton.addEventListener(
        "click",
        this.modal.handleModerationBlockClick,
      );
      this.modal.moderationBlockButton = blockButton;
    } else {
      this.modal.moderationBlockButton = null;
    }
  }

  update(action = {}) {
    if (!this.modal) {
      return;
    }
    const { type } = action;
    switch (type) {
      case "set-context":
        this.modal.refreshActiveVideoModeration?.(action.context);
        break;
      case "set-overlay":
        this.modal.applyModerationOverlay?.(action.overlay);
        break;
      default:
        break;
    }
  }

  destroy() {
    if (!this.modal) {
      return;
    }
    this.teardownPrimaryButton();
    this.teardownBlockButton();
    this.modal.moderationOverlay = null;
    this.modal.moderationBadge = null;
    this.modal.moderationBadgeText = null;
    this.modal.moderationActionsContainer = null;
    this.modal.moderationPrimaryButton = null;
    this.modal.moderationPrimaryMode = "";
    this.modal.moderationBlockButton = null;
  }

  teardownPrimaryButton() {
    if (!this.modal?.moderationPrimaryButton) {
      return;
    }
    const button = this.modal.moderationPrimaryButton;
    if (this.modal.moderationPrimaryMode === "override") {
      button.removeEventListener(
        "click",
        this.modal.handleModerationOverrideClick,
      );
    } else if (this.modal.moderationPrimaryMode === "hide") {
      button.removeEventListener("click", this.modal.handleModerationHideClick);
    }
  }

  teardownBlockButton() {
    if (!this.modal?.moderationBlockButton) {
      return;
    }
    this.modal.moderationBlockButton.removeEventListener(
      "click",
      this.modal.handleModerationBlockClick,
    );
  }
}

