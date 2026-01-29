// js/payments/zapNotifications.js

import { getApplication } from "../applicationContext.js";
import { LOGIN_TO_ZAP_MESSAGE } from "./zapMessages.js";

const LOGIN_NOTIFICATION_AUTO_HIDE_MS = 3000;

function getOwnerDocument(node) {
  return node?.ownerDocument || null;
}

function isNotificationBannerActive({
  container,
  messageTarget,
  expectedText,
}) {
  const doc = getOwnerDocument(container);
  const HTMLElementCtor = resolveHTMLElementCtor(doc);

  if (!HTMLElementCtor || !(container instanceof HTMLElementCtor)) {
    return false;
  }

  if (container.classList.contains("hidden")) {
    return false;
  }

  const resolvedTarget =
    messageTarget && messageTarget instanceof HTMLElementCtor
      ? messageTarget
      : container;

  const text =
    typeof resolvedTarget?.textContent === "string"
      ? resolvedTarget.textContent.trim()
      : "";

  return text === expectedText;
}

function attemptStatusBanner(app, { autoHideMs, expectedText, showSpinner }) {
  if (!app || typeof app.showStatus !== "function") {
    return false;
  }

  app.showStatus(expectedText, { autoHideMs, showSpinner });

  return isNotificationBannerActive({
    container: app.statusContainer,
    messageTarget: app.statusMessage,
    expectedText,
  });
}

function attemptErrorBanner(app, { expectedText }) {
  if (!app || typeof app.showError !== "function") {
    return false;
  }

  app.showError(expectedText);

  return isNotificationBannerActive({
    container: app.errorContainer,
    messageTarget: null,
    expectedText,
  });
}

function resolveDocument(candidate) {
  if (candidate && typeof candidate === "object") {
    return candidate;
  }
  if (typeof document !== "undefined") {
    return document;
  }
  return null;
}

function resolveHTMLElementCtor(doc) {
  if (!doc) {
    return null;
  }
  return (
    doc.defaultView?.HTMLElement ||
    (typeof HTMLElement !== "undefined" ? HTMLElement : null)
  );
}

function ensureNotificationPortal({ doc, HTMLElementCtor }) {
  if (!doc || !HTMLElementCtor) {
    return null;
  }

  let portal = doc.getElementById("notificationPortal");

  if (!(portal instanceof HTMLElementCtor)) {
    portal = doc.createElement("div");
    portal.id = "notificationPortal";
    portal.className = "notification-portal";
    portal.setAttribute("role", "region");
    portal.setAttribute("aria-live", "polite");
    portal.setAttribute("aria-label", "System notifications");

    const targetParent = doc.body || doc.documentElement || doc;
    targetParent.appendChild(portal);
  }

  return portal instanceof HTMLElementCtor ? portal : null;
}

function ensureStatusContainer({
  doc,
  portal,
  HTMLElementCtor,
  includeSpinner = true,
}) {
  if (!doc || !HTMLElementCtor) {
    return { container: null, messageTarget: null };
  }

  let statusContainer = doc.getElementById("statusContainer");

  if (!(statusContainer instanceof HTMLElementCtor)) {
    statusContainer = doc.createElement("div");
    statusContainer.id = "statusContainer";
    statusContainer.className =
      "notification-banner notification-banner--info status-banner hidden";
    statusContainer.setAttribute("role", "status");
    statusContainer.setAttribute("aria-live", "polite");

    if (includeSpinner) {
      const spinner = doc.createElement("span");
      spinner.className = "status-spinner";
      spinner.setAttribute("aria-hidden", "true");
      statusContainer.appendChild(spinner);
    }

    const message = doc.createElement("span");
    message.className = "status-message";
    message.dataset.statusMessage = "";
    statusContainer.appendChild(message);
  } else {
    const existingSpinner = statusContainer.querySelector(".status-spinner");
    if (includeSpinner) {
      if (!(existingSpinner instanceof HTMLElementCtor)) {
        const spinner = doc.createElement("span");
        spinner.className = "status-spinner";
        spinner.setAttribute("aria-hidden", "true");
        statusContainer.insertBefore(spinner, statusContainer.firstChild);
      }
    } else if (existingSpinner instanceof HTMLElementCtor) {
      existingSpinner.remove();
    }
  }

  let messageTarget = statusContainer.querySelector("[data-status-message]");

  if (!(messageTarget instanceof HTMLElementCtor)) {
    messageTarget = doc.createElement("span");
    messageTarget.className = "status-message";
    messageTarget.dataset.statusMessage = "";
    statusContainer.appendChild(messageTarget);
  }

  if (portal instanceof HTMLElementCtor && statusContainer.parentNode !== portal) {
    portal.appendChild(statusContainer);
  }

  return { container: statusContainer, messageTarget };
}

function ensureErrorContainer({ doc, portal, HTMLElementCtor }) {
  if (!doc || !HTMLElementCtor) {
    return null;
  }

  let errorContainer = doc.getElementById("errorContainer");

  if (!(errorContainer instanceof HTMLElementCtor)) {
    errorContainer = doc.createElement("div");
    errorContainer.id = "errorContainer";
    errorContainer.className =
      "notification-banner notification-banner--critical hidden";
  }

  if (portal instanceof HTMLElementCtor && errorContainer.parentNode !== portal) {
    portal.appendChild(errorContainer);
  }

  return errorContainer instanceof HTMLElementCtor ? errorContainer : null;
}

export function syncNotificationPortalVisibility(docCandidate) {
  const doc = resolveDocument(docCandidate);
  if (!doc) {
    return;
  }

  const HTMLElementCtor = resolveHTMLElementCtor(doc);
  if (!HTMLElementCtor) {
    return;
  }

  const portal = doc.getElementById("notificationPortal");
  if (!portal || !(portal instanceof HTMLElementCtor)) {
    return;
  }

  const banners = portal.querySelectorAll(".notification-banner");
  const hasVisibleBanner = Array.from(banners).some((banner) => {
    return (
      banner instanceof HTMLElementCtor && !banner.classList.contains("hidden")
    );
  });

  portal.classList.toggle("notification-portal--active", hasVisibleBanner);
}

function scheduleAutoHide({
  container,
  messageTarget,
  expectedText,
  doc,
  autoHideMs,
}) {
  if (!Number.isFinite(autoHideMs) || autoHideMs <= 0) {
    return;
  }

  const scheduler =
    doc?.defaultView?.setTimeout ||
    (typeof setTimeout === "function" ? setTimeout : null);

  if (typeof scheduler !== "function") {
    return;
  }

  scheduler(() => {
    if (!doc || typeof doc.contains !== "function") {
      return;
    }

    if (!doc.contains(container)) {
      return;
    }

    const HTMLElementCtor = resolveHTMLElementCtor(doc);
    if (!HTMLElementCtor) {
      return;
    }

    const activeTarget =
      container.querySelector("[data-status-message]") || messageTarget;
    const resolvedTarget =
      activeTarget && activeTarget instanceof HTMLElementCtor
        ? activeTarget
        : messageTarget && messageTarget instanceof HTMLElementCtor
          ? messageTarget
          : container;

    if (resolvedTarget.textContent !== expectedText) {
      return;
    }

    if (resolvedTarget !== container) {
      resolvedTarget.textContent = "";
    } else {
      container.textContent = "";
    }

    container.classList.add("hidden");
    syncNotificationPortalVisibility(doc);
  }, autoHideMs);
}

export function showLoginRequiredToZapNotification({
  app: appCandidate,
  document: docCandidate,
  autoHideMs = LOGIN_NOTIFICATION_AUTO_HIDE_MS,
} = {}) {
  const expectedText = LOGIN_TO_ZAP_MESSAGE;
  const app = appCandidate || getApplication();

  const resolvedDocCandidate =
    docCandidate ||
    getOwnerDocument(app?.statusContainer) ||
    getOwnerDocument(app?.errorContainer);

  if (attemptStatusBanner(app, { autoHideMs, expectedText, showSpinner: false })) {
    return true;
  }

  if (attemptErrorBanner(app, { expectedText })) {
    return true;
  }

  const doc = resolveDocument(resolvedDocCandidate);
  if (!doc) {
    return false;
  }

  const HTMLElementCtor = resolveHTMLElementCtor(doc);
  if (!HTMLElementCtor) {
    return false;
  }

  const portal = ensureNotificationPortal({ doc, HTMLElementCtor });

  const { container: statusContainer, messageTarget } = ensureStatusContainer({
    doc,
    portal,
    HTMLElementCtor,
    includeSpinner: false,
  });

  if (statusContainer instanceof HTMLElementCtor) {
    if (messageTarget && messageTarget instanceof HTMLElementCtor) {
      messageTarget.textContent = expectedText;
    } else {
      statusContainer.textContent = expectedText;
    }

    statusContainer.classList.remove("hidden");
    syncNotificationPortalVisibility(doc);

    const resolvedText =
      messageTarget && messageTarget instanceof HTMLElementCtor
        ? messageTarget.textContent
        : statusContainer.textContent;

    scheduleAutoHide({
      container: statusContainer,
      messageTarget,
      expectedText: resolvedText,
      doc,
      autoHideMs,
    });

    return true;
  }

  const errorContainer = ensureErrorContainer({
    doc,
    portal,
    HTMLElementCtor,
  });

  if (errorContainer instanceof HTMLElementCtor) {
    errorContainer.textContent = expectedText;
    errorContainer.classList.remove("hidden");
    syncNotificationPortalVisibility(doc);

    scheduleAutoHide({
      container: errorContainer,
      messageTarget: null,
      expectedText,
      doc,
      autoHideMs,
    });

    return true;
  }

  return false;
}
