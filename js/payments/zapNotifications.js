// js/payments/zapNotifications.js

import { getApplication } from "../applicationContext.js";
import { LOGIN_TO_ZAP_MESSAGE } from "./zapMessages.js";

const LOGIN_NOTIFICATION_AUTO_HIDE_MS = 5000;

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

function attemptStatusBanner(app, { autoHideMs, expectedText }) {
  if (!app || typeof app.showStatus !== "function") {
    return false;
  }

  app.showStatus(expectedText, { autoHideMs });

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

  if (attemptStatusBanner(app, { autoHideMs, expectedText })) {
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

  const statusContainer = doc.getElementById("statusContainer");

  if (statusContainer instanceof HTMLElementCtor) {
    const messageTarget =
      statusContainer.querySelector("[data-status-message]") || null;

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

  const errorContainer = doc.getElementById("errorContainer");

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

