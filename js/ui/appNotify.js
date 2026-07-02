// Single import surface for app notifications, so every alert/confirm goes through the
// site's notification system instead of native dialogs.
//
//   - notifyError / notifyStatus / notifySuccess → the app's toast banners
//     (NotificationController) for components/services without a local showError.
//   - showConfirm → the styled promise-based confirm dialog (replaces window.confirm).
//
// Components that already receive a showError/showSuccess callback should keep using it;
// this is for modules that don't (e.g. standalone controllers/services).

import { getApplication } from "../applicationContext.js";
import { showConfirm } from "./confirmDialog.js";

function app() {
  try {
    return getApplication();
  } catch (error) {
    return null;
  }
}

export function notifyError(message) {
  app()?.showError?.(message);
}

export function notifyStatus(message, options) {
  app()?.showStatus?.(message, options);
}

export function notifySuccess(message) {
  app()?.showSuccess?.(message);
}

export { showConfirm };
