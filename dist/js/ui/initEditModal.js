import { EditModal } from "./components/EditModal.js";

export function initEditModal({
  app = null,
  editModalOverride = null,
  container = null,
  services = {},
  utilities = {},
  callbacks = {},
  eventTarget = null,
} = {}) {
  const events = eventTarget instanceof EventTarget ? eventTarget : new EventTarget();

  const {
    getMode = null,
    sanitizers = {},
  } = services;

  const {
    removeTrackingScripts: removeTrackingScriptsFn = null,
    setGlobalModalState: setGlobalModalStateFn = null,
    escapeHtml = null,
  } = utilities;

  const {
    showError = null,
    onSubmit = null,
    onCancel = null,
  } = callbacks;

  const modal =
    (typeof editModalOverride === "function"
      ? editModalOverride({ app, eventTarget: events })
      : editModalOverride) ||
    new EditModal({
      removeTrackingScripts: removeTrackingScriptsFn,
      setGlobalModalState: setGlobalModalStateFn,
      showError,
      getMode,
      sanitizers,
      escapeHtml,
      eventTarget: events,
      container,
    });

  const boundSubmitHandler =
    typeof onSubmit === "function" ? (event) => onSubmit(event) : null;
  const boundCancelHandler = typeof onCancel === "function" ? () => onCancel() : null;

  if (boundSubmitHandler && typeof modal?.addEventListener === "function") {
    modal.addEventListener("video:edit-submit", boundSubmitHandler);
  }

  if (boundCancelHandler && typeof modal?.addEventListener === "function") {
    modal.addEventListener("video:edit-cancel", boundCancelHandler);
  }

  return {
    modal,
    events,
    handlers: {
      submit: boundSubmitHandler,
      cancel: boundCancelHandler,
    },
  };
}

export default initEditModal;
