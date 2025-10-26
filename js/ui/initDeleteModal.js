import { DeleteModal } from "./components/DeleteModal.js";

export function initDeleteModal({
  app = null,
  deleteModalOverride = null,
  container = null,
  utilities = {},
  callbacks = {},
  eventTarget = null,
} = {}) {
  const events = eventTarget instanceof EventTarget ? eventTarget : new EventTarget();

  const {
    removeTrackingScripts: removeTrackingScriptsFn = null,
    setGlobalModalState: setGlobalModalStateFn = null,
    truncateMiddle = null,
  } = utilities;

  const {
    onConfirm = null,
    onCancel = null,
  } = callbacks;

  const modal =
    (typeof deleteModalOverride === "function"
      ? deleteModalOverride({ app, eventTarget: events })
      : deleteModalOverride) ||
    new DeleteModal({
      removeTrackingScripts: removeTrackingScriptsFn,
      setGlobalModalState: setGlobalModalStateFn,
      truncateMiddle,
      container,
      eventTarget: events,
    });

  const boundConfirmHandler =
    typeof onConfirm === "function" ? (event) => onConfirm(event) : null;
  const boundCancelHandler = typeof onCancel === "function" ? () => onCancel() : null;

  if (boundConfirmHandler && typeof modal?.addEventListener === "function") {
    modal.addEventListener("video:delete-confirm", boundConfirmHandler);
  }

  if (boundCancelHandler && typeof modal?.addEventListener === "function") {
    modal.addEventListener("video:delete-cancel", boundCancelHandler);
  }

  return {
    modal,
    events,
    handlers: {
      confirm: boundConfirmHandler,
      cancel: boundCancelHandler,
    },
  };
}

export default initDeleteModal;
