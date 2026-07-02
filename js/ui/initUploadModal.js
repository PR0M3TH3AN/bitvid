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
    s3Service = null,
    storageService = null,
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
      s3Service,
      storageService,
      publishVideoNote,
      removeTrackingScripts: removeTrackingScriptsFn,
      setGlobalModalState: setGlobalModalStateFn,
      showError,
      showSuccess,
      getCurrentPubkey,
      safeEncodeNpub,
      // Frequency-ranked hashtags from the user's own past uploads → one-tap
      // suggestion chips in the upload modal (TODO #45).
      getHashtagSuggestions: (options) =>
        typeof app?.getUserHashtagSuggestions === "function"
          ? app.getUserHashtagSuggestions(options)
          : [],
      eventTarget: events,
      container,
      onRequestStorageSettings: () => {
        if (app && app.profileController && typeof app.profileController.show === "function") {
          app.profileController.show("storage");
        }
      },
      // Open the login modal's unlock-saved-key (passphrase) flow when a persisted
      // nsec session is locked after a reload.
      onRequestUnlock: () => {
        try {
          if (typeof app?.initializeLoginModalController === "function") {
            app.initializeLoginModalController();
          }
          const controller = app?.loginModalController;
          if (controller && typeof controller.openModal === "function") {
            return controller.openModal({}) !== false;
          }
        } catch (error) {
          /* best-effort */
        }
        return false;
      },
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
