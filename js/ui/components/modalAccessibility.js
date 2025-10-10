const FOCUSABLE_SELECTORS = [
  "a[href]",
  "area[href]",
  "button:not([disabled])",
  'input:not([type="hidden"]):not([disabled])',
  "select:not([disabled])",
  "textarea:not([disabled])",
  "iframe",
  "object",
  "embed",
  '[contenteditable="true"]',
  "[tabindex]",
  "audio[controls]",
  "video[controls]",
].join(",");

const scheduleMicrotask =
  typeof queueMicrotask === "function"
    ? queueMicrotask
    : (callback) => Promise.resolve().then(callback);

function isFocusable(element) {
  if (!element) {
    return false;
  }
  if (element.hasAttribute('disabled')) {
    return false;
  }
  const tabindex = element.getAttribute('tabindex');
  if (tabindex && Number(tabindex) < 0) {
    return false;
  }
  if (element.getAttribute('aria-hidden') === 'true') {
    return false;
  }
  const rects = element.getClientRects();
  if (rects.length === 0) {
    return false;
  }
  return true;
}

export function createModalAccessibility({ root, panel, backdrop, document: providedDocument, onRequestClose } = {}) {
  const doc = providedDocument || root?.ownerDocument || (typeof document !== 'undefined' ? document : null);
  if (!root || !panel || !doc) {
    return {
      activate() {},
      deactivate() {},
      destroy() {},
      isActive() {
        return false;
      },
    };
  }

  let active = false;
  let previousFocus = null;

  const resolveDismissTarget = (target) => {
    if (!target) {
      return null;
    }
    if (
      backdrop &&
      (target === backdrop || backdrop.contains?.(target)) &&
      !backdrop.hasAttribute("data-dismiss")
    ) {
      return backdrop;
    }
    return target.closest?.("[data-dismiss]") || null;
  };

  const keydownListener = (event) => {
    if (!active) {
      return;
    }
    if (event.key === "Escape") {
      if (root.contains(event.target)) {
        event.preventDefault();
      }
      onRequestClose?.(event);
      return;
    }
    if (event.key !== "Tab" || !root.contains(event.target)) {
      return;
    }

    const focusable = Array.from(panel.querySelectorAll(FOCUSABLE_SELECTORS)).filter(isFocusable);
    const activeElement = doc.activeElement;
    const isPanelFocused = activeElement === panel;

    if (focusable.length === 0) {
      event.preventDefault();
      if (panel !== activeElement) {
        panel.focus({ preventScroll: true });
      }
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey) {
      if (activeElement === first || !panel.contains(activeElement) || isPanelFocused) {
        event.preventDefault();
        last.focus({ preventScroll: true });
      }
      return;
    }

    if (activeElement === last || isPanelFocused) {
      event.preventDefault();
      first.focus({ preventScroll: true });
    }
  };

  const clickListener = (event) => {
    if (!active) {
      return;
    }
    const dismissTarget = resolveDismissTarget(event.target);
    if (!dismissTarget) {
      return;
    }
    if (!root.contains(dismissTarget)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    onRequestClose?.(event);
  };

  const activate = () => {
    if (active) {
      return;
    }
    active = true;
    const activeElement = doc.activeElement;
    previousFocus = activeElement instanceof Element ? activeElement : null;
    doc.addEventListener("keydown", keydownListener, true);
    root.addEventListener("click", clickListener);
    if (backdrop && backdrop !== root) {
      backdrop.addEventListener("click", clickListener);
    }

    scheduleMicrotask(() => {
      if (!active) {
        return;
      }
      const focusTarget = Array.from(panel.querySelectorAll(FOCUSABLE_SELECTORS)).find(isFocusable) || panel;
      if (typeof focusTarget.focus === "function") {
        focusTarget.focus({ preventScroll: true });
      }
    });
  };

  const deactivate = () => {
    if (!active) {
      return;
    }
    doc.removeEventListener("keydown", keydownListener, true);
    root.removeEventListener("click", clickListener);
    if (backdrop && backdrop !== root) {
      backdrop.removeEventListener("click", clickListener);
    }
    active = false;

    if (previousFocus && typeof previousFocus.focus === "function") {
      if (
        !root.contains(previousFocus) &&
        typeof doc.contains === "function" &&
        doc.contains(previousFocus)
      ) {
        previousFocus.focus({ preventScroll: true });
      }
    }
    previousFocus = null;
  };

  const destroy = () => {
    deactivate();
  };

  return {
    activate,
    deactivate,
    destroy,
    isActive() {
      return active;
    },
  };
}
