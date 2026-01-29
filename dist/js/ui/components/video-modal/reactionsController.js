export class ReactionsController {
  constructor({ modal } = {}) {
    this.modal = modal;
    this.boundHandler = (event) => {
      this.modal?.handleReactionClick?.(event);
    };
    this.buttons = [];
  }

  initialize({ playerModal } = {}) {
    if (!this.modal) {
      return;
    }

    const likeButton = playerModal?.querySelector("#modalLikeBtn") || null;
    const dislikeButton = playerModal?.querySelector("#modalDislikeBtn") || null;
    this.modal.reactionButtons = { "+": likeButton, "-": dislikeButton };
    this.modal.reactionMeter =
      playerModal?.querySelector("[data-reaction-meter]") || null;
    this.modal.reactionMeterFill =
      playerModal?.querySelector("[data-reaction-meter-fill]") || null;
    this.modal.reactionMeterLabel =
      playerModal?.querySelector("[data-reaction-meter-label]") || null;
    this.modal.reactionMeterAssistive =
      playerModal?.querySelector("[data-reaction-meter-sr]") || null;
    this.modal.reactionCountLabels = {
      "+": playerModal?.querySelector("[data-reaction-like-count]") || null,
      "-": playerModal?.querySelector("[data-reaction-dislike-count]") || null,
    };

    this.buttons = [likeButton, dislikeButton].filter(Boolean);
    this.buttons.forEach((button) => {
      button.removeEventListener("click", this.boundHandler);
      button.addEventListener("click", this.boundHandler);
    });

    this.modal.syncReactionButtons?.();
    this.modal.updateReactionMeterDisplay?.();
  }

  update(action = {}) {
    if (!this.modal) {
      return;
    }
    const { type } = action;
    switch (type) {
      case "set-summary":
        this.modal.updateReactionSummary?.(action.summary);
        break;
      case "set-user-reaction":
        this.modal.setUserReaction?.(action.reaction);
        break;
      case "reset":
        this.modal.resetReactions?.();
        break;
      default:
        break;
    }
  }

  destroy() {
    this.buttons.forEach((button) => {
      button.removeEventListener("click", this.boundHandler);
    });
    this.buttons = [];
    if (this.modal) {
      this.modal.reactionButtons = { "+": null, "-": null };
      this.modal.reactionMeter = null;
      this.modal.reactionMeterFill = null;
      this.modal.reactionMeterLabel = null;
      this.modal.reactionMeterAssistive = null;
      this.modal.reactionCountLabels = { "+": null, "-": null };
    }
  }
}
