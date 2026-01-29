export class SimilarContentController {
  constructor({ modal } = {}) {
    this.modal = modal;
  }

  initialize({ playerModal } = {}) {
    if (!this.modal) {
      return { container: null, heading: null, list: null };
    }

    this.modal.teardownSimilarContentMediaQuery?.();

    const heading =
      playerModal?.querySelector("#playerModalSimilarContentHeading") || null;
    const list =
      playerModal?.querySelector("#playerModalSimilarContentList") || null;
    const section =
      list?.closest("[aria-labelledby='playerModalSimilarContentHeading']") ||
      heading?.closest("[aria-labelledby='playerModalSimilarContentHeading']") ||
      null;
    const container =
      list?.closest(".watch-container") ||
      heading?.closest(".watch-container") ||
      section?.closest(".watch-container") ||
      section ||
      null;

    this.modal.similarContentHeading = heading;
    this.modal.similarContentList = list;
    this.modal.similarContentContainer = container;

    this.modal.setupSimilarContentMediaQuery?.();

    if (list && list.children.length) {
      this.modal.toggleSimilarContentVisibility?.(true);
    } else {
      this.modal.toggleSimilarContentVisibility?.(false);
    }

    return { container, heading, list };
  }

  update(action = {}) {
    if (!this.modal) {
      return;
    }
    const { type } = action;
    switch (type) {
      case "set-items":
        this.modal.setSimilarContent?.(action.items, action.options);
        break;
      case "set-visibility":
        this.modal.toggleSimilarContentVisibility?.(action.visible);
        break;
      case "clear":
        this.modal.clearSimilarContent?.(action.options);
        break;
      default:
        break;
    }
  }

  destroy() {
    if (!this.modal) {
      return;
    }
    this.modal.teardownSimilarContentMediaQuery?.();
    this.modal.similarContentHeading = null;
    this.modal.similarContentList = null;
    this.modal.similarContentContainer = null;
  }
}
