const FOCUSABLE_SELECTORS = [
  "a[href]:not([tabindex=\"-1\"])",
  "area[href]:not([tabindex=\"-1\"])",
  "button:not([disabled]):not([tabindex=\"-1\"])",
  "input:not([disabled]):not([type=\"hidden\"]):not([tabindex=\"-1\"])",
  "select:not([disabled]):not([tabindex=\"-1\"])",
  "textarea:not([disabled]):not([tabindex=\"-1\"])",
  "[tabindex]:not([tabindex=\"-1\"])",
];

function isElementVisible(element) {
  if (!element) {
    return false;
  }
  if (element.hasAttribute("hidden")) {
    return false;
  }
  const ownerDocument = element.ownerDocument;
  const computedStyle =
    ownerDocument?.defaultView?.getComputedStyle?.(element) || null;
  if (
    computedStyle &&
    (computedStyle.visibility === "hidden" || computedStyle.display === "none")
  ) {
    return false;
  }
  return (
    element.offsetParent !== null ||
    element.getClientRects().length > 0 ||
    element instanceof SVGElement
  );
}

function getFocusableElements(container) {
  if (!container) {
    return [];
  }
  const elements = Array.from(
    container.querySelectorAll(FOCUSABLE_SELECTORS.join(","))
  ).filter((element) => {
    if (!(element instanceof HTMLElement || element instanceof SVGElement)) {
      return false;
    }
    if (element.hasAttribute("disabled")) {
      return false;
    }
    if (element.getAttribute("aria-hidden") === "true") {
      return false;
    }
    return isElementVisible(element);
  });

  if (
    container.matches &&
    container.matches(FOCUSABLE_SELECTORS.join(",")) &&
    !elements.includes(container)
  ) {
    elements.unshift(container);
  }

  return elements;
}

function focusElement(element) {
  if (element && typeof element.focus === "function") {
    element.focus({ preventScroll: true });
  }
}

export function setupModalAccessibility({
  root,
  panel,
  backdrop,
  document: doc,
  onRequestClose,
} = {}) {
  const documentRef =
    doc || panel?.ownerDocument || root?.ownerDocument || globalThis.document;

  if (!panel || !(panel instanceof HTMLElement) || !documentRef) {
    return () => {};
  }

  const windowRef = documentRef.defaultView || globalThis;
  const previousFocus =
    documentRef.activeElement instanceof HTMLElement
      ? documentRef.activeElement
      : null;

  const requestClose = (origin, event) => {
    if (typeof onRequestClose === "function") {
      onRequestClose({ origin, event });
    }
  };

  const handleKeydown = (event) => {
    if (!event) {
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      requestClose("escape", event);
      return;
    }
    if (event.key !== "Tab") {
      return;
    }

    const focusable = getFocusableElements(panel);
    if (focusable.length === 0) {
      event.preventDefault();
      focusElement(panel);
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = documentRef.activeElement;

    if (event.shiftKey) {
      if (!panel.contains(active) || active === first) {
        event.preventDefault();
        focusElement(last);
      }
      return;
    }

    if (!panel.contains(active) || active === last) {
      event.preventDefault();
      focusElement(first);
    }
  };

  const handleFocusIn = (event) => {
    const target = event?.target;
    if (!target) {
      return;
    }
    if (panel.contains(target) || target === panel) {
      return;
    }
    focusElement(panel);
  };

  const handleClick = (event) => {
    const target = event?.target;
    if (!(target instanceof HTMLElement || target instanceof SVGElement)) {
      return;
    }

    if (backdrop && (target === backdrop || target.closest("[data-dismiss]") === backdrop)) {
      requestClose("backdrop", event);
      return;
    }

    const dismissTrigger = target.closest("[data-dismiss]");
    if (dismissTrigger && !panel.contains(dismissTrigger)) {
      requestClose("dismiss", event);
    }
  };

  documentRef.addEventListener("keydown", handleKeydown, true);
  documentRef.addEventListener("focusin", handleFocusIn, true);
  if (root) {
    root.addEventListener("click", handleClick);
  }

  const focusTimer = windowRef?.setTimeout
    ? windowRef.setTimeout(() => focusElement(panel), 0)
    : null;

  return () => {
    if (focusTimer && windowRef?.clearTimeout) {
      windowRef.clearTimeout(focusTimer);
    }
    documentRef.removeEventListener("keydown", handleKeydown, true);
    documentRef.removeEventListener("focusin", handleFocusIn, true);
    if (root) {
      root.removeEventListener("click", handleClick);
    }
    if (previousFocus && previousFocus.isConnected) {
      focusElement(previousFocus);
    }
  };
}
