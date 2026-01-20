import { UploadModal } from "./components/UploadModal.js";

export function initUploadModal({
  app = null,
  uploadModalOverride = null,
  container = null,
  services = {},
  utilities = {},
  callbacks = {},
  eventTarget = null,
} = {}) {
  const events = eventTarget instanceof EventTarget ? eventTarget : new EventTarget();

  const {
    authService = null,
    r2Service = null,
<<<<<<< HEAD
    storageService = null,
=======
>>>>>>> origin/main
  } = services;

  const {
    removeTrackingScripts: removeTrackingScriptsFn = null,
    setGlobalModalState: setGlobalModalStateFn = null,
  } = utilities;

  const {
    publishVideoNote = null,
    showError = null,
    showSuccess = null,
    getCurrentPubkey = null,
    safeEncodeNpub = null,
    onSubmit = null,
  } = callbacks;

  const modal =
    (typeof uploadModalOverride === "function"
      ? uploadModalOverride({ app, eventTarget: events })
      : uploadModalOverride) ||
    new UploadModal({
      authService,
      r2Service,
<<<<<<< HEAD
      storageService,
=======
>>>>>>> origin/main
      publishVideoNote,
      removeTrackingScripts: removeTrackingScriptsFn,
      setGlobalModalState: setGlobalModalStateFn,
      showError,
      showSuccess,
      getCurrentPubkey,
      safeEncodeNpub,
      eventTarget: events,
      container,
<<<<<<< HEAD
      onRequestStorageSettings: () => {
        if (app && app.profileController && typeof app.profileController.show === "function") {
          app.profileController.show("storage");
        }
      },
=======
>>>>>>> origin/main
    });

  const boundSubmitHandler =
    typeof onSubmit === "function" ? (event) => onSubmit(event) : null;

  if (boundSubmitHandler && typeof modal?.addEventListener === "function") {
    modal.addEventListener("upload:submit", boundSubmitHandler);
  }

  return {
    modal,
    events,
    handlers: {
      submit: boundSubmitHandler,
    },
  };
}

export default initUploadModal;
