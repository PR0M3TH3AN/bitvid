import logger from "../../utils/logger.js";
import {
  getPopupOffsetPx,
  getPopupViewportPaddingPx,
  readDesignToken,
} from "../../designSystem/metrics.js";
import { ensureOverlayRoot } from "./overlayRoot.js";

const DEFAULT_PLACEMENT = "bottom-start";
const DEFAULT_STRATEGY = "fixed";
const DEFAULT_MAX_WIDTH_TOKEN = "--popover-inline-safe-max";
const MENU_TYPEAHEAD_RESET_MS = 500;

let popoverPanelIdCounter = 0;

let activePopoverInstance = null;

function generatePanelId() {
  popoverPanelIdCounter += 1;
  return `popover-panel-${popoverPanelIdCounter}`;
}

function isDisabled(element) {
  if (!element) {
    return true;
  }
  if (element.hasAttribute("disabled")) {
    return true;
  }
  const ariaDisabled = element.getAttribute("aria-disabled");
  if (typeof ariaDisabled === "string" && ariaDisabled.toLowerCase() === "true") {
    return true;
  }
  if (element.hidden || element.getAttribute("aria-hidden") === "true") {
    return true;
  }
  return false;
}

function getItemLabel(element) {
  if (!element) {
    return "";
  }
  const ariaLabel = element.getAttribute("aria-label");
  if (ariaLabel) {
    return ariaLabel.trim();
  }
  if (typeof element.textContent === "string") {
    return element.textContent.trim();
  }
  return "";
}

function isElement(node) {
  return Boolean(node && typeof node === "object" && node.nodeType === 1);
}

function resolveDocument(trigger, explicitDocument) {
  if (explicitDocument && explicitDocument.nodeType === 9) {
    return explicitDocument;
  }
  if (trigger?.ownerDocument?.nodeType === 9) {
    return trigger.ownerDocument;
  }
  if (typeof document !== "undefined" && document?.nodeType === 9) {
    return document;
  }
  return null;
}

function resolveNumber(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function resolveTokenValue(tokenName, documentRef) {
  if (typeof tokenName !== "string" || tokenName.trim() === "") {
    return "";
  }
  return readDesignToken(tokenName, { documentRef }) || "";
}

function resolveArrow(option, panel) {
  if (!option) {
    return null;
  }

  if (typeof option === "function") {
    try {
      return resolveArrow(option(panel), panel);
    } catch (error) {
      logger.user.error("[popover] arrow resolver failed", error);
      return null;
    }
  }

  if (isElement(option)) {
    return option;
  }

  if (typeof option === "object") {
    if (option.element) {
      return resolveArrow(option.element, panel);
    }
  }

  return null;
}

function applyArrowStyles({
  arrowElement,
  side,
  panelLeft,
  panelTop,
  panelWidth,
  panelHeight,
  anchorRect,
}) {
  if (!arrowElement || !side || !anchorRect) {
    return;
  }

  const arrowRect =
    typeof arrowElement.getBoundingClientRect === "function"
      ? arrowElement.getBoundingClientRect()
      : null;
  const arrowWidth = arrowRect?.width ?? arrowElement.offsetWidth ?? 0;
  const arrowHeight = arrowRect?.height ?? arrowElement.offsetHeight ?? 0;

  const anchorCenterX = anchorRect.left + anchorRect.width / 2;
  const anchorCenterY = anchorRect.top + anchorRect.height / 2;

  arrowElement.style.left = "";
  arrowElement.style.right = "";
  arrowElement.style.top = "";
  arrowElement.style.bottom = "";

  if (side === "top" || side === "bottom") {
    let arrowLeft = anchorCenterX - panelLeft - arrowWidth / 2;
    arrowLeft = Math.min(
      Math.max(arrowLeft, 0),
      Math.max(panelWidth - arrowWidth, 0),
    );
    arrowElement.style.left = `${Math.round(arrowLeft)}px`;
    if (side === "bottom") {
      arrowElement.style.top = `${-Math.round(arrowHeight)}px`;
    } else {
      arrowElement.style.bottom = `${-Math.round(arrowHeight)}px`;
    }
  } else if (side === "left" || side === "right") {
    let arrowTop = anchorCenterY - panelTop - arrowHeight / 2;
    arrowTop = Math.min(
      Math.max(arrowTop, 0),
      Math.max(panelHeight - arrowHeight, 0),
    );
    arrowElement.style.top = `${Math.round(arrowTop)}px`;
    if (side === "right") {
      arrowElement.style.left = `${-Math.round(arrowWidth)}px`;
    } else {
      arrowElement.style.right = `${-Math.round(arrowWidth)}px`;
    }
  }

  arrowElement.dataset.popoverArrowSide = side;
}

function containsTarget(root, target) {
  if (!root || !target) {
    return false;
  }
  if (typeof root.contains === "function") {
    return root.contains(target);
  }
  return false;
}

function setExpandedAttribute(trigger, value) {
  if (!trigger || typeof trigger.setAttribute !== "function") {
    return;
  }
  trigger.setAttribute("aria-expanded", value ? "true" : "false");
}

function createAutoUpdate({ documentRef, anchor, panel, update }) {
  if (!documentRef || !anchor || !panel || typeof update !== "function") {
    return null;
  }

  const cleanupFns = [];
  const safeUpdate = () => {
    try {
      const result = update();
      if (result && typeof result.then === "function") {
        result.catch((error) => {
          logger.dev.warn("[popover] auto-update failed", error);
        });
      }
    } catch (error) {
      logger.dev.warn("[popover] auto-update failed", error);
    }
  };

  const view = documentRef.defaultView || globalThis;
  if (view && typeof view.addEventListener === "function") {
    const resizeHandler = () => safeUpdate();
    view.addEventListener("resize", resizeHandler);
    cleanupFns.push(() => view.removeEventListener("resize", resizeHandler));

    const scrollHandler = () => safeUpdate();
    view.addEventListener("scroll", scrollHandler, true);
    cleanupFns.push(() => view.removeEventListener("scroll", scrollHandler, true));
  }

  const scrollTarget = documentRef.scrollingElement || documentRef;
  if (scrollTarget && typeof scrollTarget.addEventListener === "function") {
    const docScrollHandler = () => safeUpdate();
    scrollTarget.addEventListener("scroll", docScrollHandler, true);
    cleanupFns.push(() =>
      scrollTarget.removeEventListener("scroll", docScrollHandler, true),
    );
  }

  const observers = [];
  if (typeof ResizeObserver === "function") {
    try {
      const anchorObserver = new ResizeObserver(safeUpdate);
      anchorObserver.observe(anchor);
      observers.push(anchorObserver);
    } catch (error) {
      logger.dev.warn("[popover] anchor resize observer failed", error);
    }

    if (panel !== anchor) {
      try {
        const panelObserver = new ResizeObserver(safeUpdate);
        panelObserver.observe(panel);
        observers.push(panelObserver);
      } catch (error) {
        logger.dev.warn("[popover] panel resize observer failed", error);
      }
    }
  }

  return () => {
    cleanupFns.forEach((cleanup) => {
      try {
        cleanup();
      } catch (error) {
        logger.dev.warn("[popover] auto-update cleanup failed", error);
      }
    });

    observers.forEach((observer) => {
      try {
        observer.disconnect();
      } catch (error) {
        logger.dev.warn("[popover] observer disconnect failed", error);
      }
    });
  };
}

export function createPopover(trigger, render, options = {}) {
  const anchor = isElement(trigger) ? trigger : null;
  const documentRef = resolveDocument(anchor, options.document);

  if (anchor && typeof anchor.setAttribute === "function") {
    anchor.setAttribute("aria-haspopup", "menu");
    anchor.setAttribute("aria-expanded", "false");
  }

  const portal = documentRef ? documentRef.createElement("div") : null;
  if (portal) {
    portal.dataset.popoverPortal = "true";
  }

  const placement =
    typeof options.placement === "string" && options.placement
      ? options.placement
      : DEFAULT_PLACEMENT;
  const strategy = DEFAULT_STRATEGY;
  const gap = resolveNumber(
    options.gap,
    getPopupOffsetPx({ documentRef }) || 0,
  );
  const viewportPadding = resolveNumber(
    options.viewportPadding,
    getPopupViewportPaddingPx({ documentRef }) || 0,
  );
  const maxWidthToken =
    typeof options.maxWidthToken === "string" && options.maxWidthToken
      ? options.maxWidthToken
      : DEFAULT_MAX_WIDTH_TOKEN;
  const maxHeightToken =
    typeof options.maxHeightToken === "string" && options.maxHeightToken
      ? options.maxHeightToken
      : null;
  const restoreFocusOnClose = options.restoreFocusOnClose !== false;

  let panel = null;
  let arrowElement = null;
  let autoUpdateCleanup = null;
  let isOpen = false;
  let previousActiveElement = null;
  let menuItemIdCounter = 0;
  const menuHandlers = {
    keydown: null,
    focusin: null,
  };
  const menuState = {
    panel: null,
    items: [],
    activeIndex: -1,
    typeaheadBuffer: "",
    typeaheadTimeout: null,
  };

  function getView() {
    return documentRef?.defaultView || globalThis;
  }

  function resetTypeaheadBuffer() {
    const view = getView();
    if (menuState.typeaheadTimeout) {
      view.clearTimeout(menuState.typeaheadTimeout);
    }
    menuState.typeaheadTimeout = null;
    menuState.typeaheadBuffer = "";
  }

  function scheduleTypeaheadReset() {
    const view = getView();
    if (!view || typeof view.setTimeout !== "function") {
      return;
    }
    if (menuState.typeaheadTimeout) {
      view.clearTimeout(menuState.typeaheadTimeout);
    }
    menuState.typeaheadTimeout = view.setTimeout(() => {
      menuState.typeaheadTimeout = null;
      menuState.typeaheadBuffer = "";
    }, MENU_TYPEAHEAD_RESET_MS);
  }

  function ensurePanelId(panelElement) {
    if (!panelElement.id) {
      panelElement.id = generatePanelId();
    }
    return panelElement.id;
  }

  function findMenuItems(panelElement) {
    if (!panelElement) {
      return [];
    }
    const candidates = Array.from(
      panelElement.querySelectorAll("[role=\"menuitem\"], .menu__item"),
    ).filter((node) => isElement(node));

    candidates.forEach((item) => {
      if (!item.hasAttribute("role")) {
        item.setAttribute("role", "menuitem");
      }
      if (!item.id) {
        menuItemIdCounter += 1;
        item.id = `${ensurePanelId(panelElement)}-item-${menuItemIdCounter}`;
      }
      item.setAttribute("tabindex", "-1");
    });

    return candidates;
  }

  function updateAriaActiveDescendant(panelElement, activeItem) {
    if (!panelElement) {
      return;
    }
    if (activeItem && activeItem.id) {
      panelElement.setAttribute("aria-activedescendant", activeItem.id);
    } else {
      panelElement.removeAttribute("aria-activedescendant");
    }
  }

  function setActiveItem(index, { focus = true } = {}) {
    const panelElement = menuState.panel;
    if (!panelElement || !menuState.items.length) {
      menuState.activeIndex = -1;
      updateAriaActiveDescendant(panelElement, null);
      return;
    }

    if (index < 0 || index >= menuState.items.length) {
      menuState.activeIndex = -1;
      menuState.items.forEach((item) => {
        item.setAttribute("tabindex", "-1");
      });
      updateAriaActiveDescendant(panelElement, null);
      return;
    }

    const target = menuState.items[index];
    if (!target || isDisabled(target)) {
      return;
    }

    menuState.items.forEach((item, itemIndex) => {
      const value = itemIndex === index ? "0" : "-1";
      item.setAttribute("tabindex", value);
    });

    menuState.activeIndex = index;
    updateAriaActiveDescendant(panelElement, target);

    if (focus) {
      try {
        target.focus({ preventScroll: true });
      } catch (error) {
        target.focus();
      }
    }
  }

  function focusFirstEnabledItem({ focusPanelFallback = true } = {}) {
    const panelElement = menuState.panel;
    if (!panelElement) {
      return;
    }

    const items = menuState.items;
    const index = items.findIndex((item) => !isDisabled(item));
    if (index >= 0) {
      setActiveItem(index);
      return;
    }

    menuState.activeIndex = -1;
    updateAriaActiveDescendant(panelElement, null);

    if (focusPanelFallback) {
      panelElement.setAttribute("tabindex", panelElement.getAttribute("tabindex") || "-1");
      try {
        panelElement.focus({ preventScroll: true });
      } catch (error) {
        panelElement.focus();
      }
    }
  }

  function findNextEnabled(currentIndex, direction) {
    const { items } = menuState;
    if (!items.length) {
      return -1;
    }

    const total = items.length;
    let steps = 0;
    let index = currentIndex;

    while (steps < total) {
      index = (index + direction + total) % total;
      const candidate = items[index];
      if (candidate && !isDisabled(candidate)) {
        return index;
      }
      steps += 1;
    }
    return -1;
  }

  function moveFocus(direction) {
    const startIndex = menuState.activeIndex >= 0 ? menuState.activeIndex : 0;
    const nextIndex = findNextEnabled(startIndex, direction);
    if (nextIndex >= 0) {
      setActiveItem(nextIndex);
    }
  }

  function focusEdge(direction) {
    const items = menuState.items;
    if (!items.length) {
      return;
    }
    const iterate = direction > 0 ? items : [...items].reverse();
    for (let idx = 0; idx < iterate.length; idx += 1) {
      const item = iterate[idx];
      if (!isDisabled(item)) {
        const originalIndex = items.indexOf(item);
        if (originalIndex >= 0) {
          setActiveItem(originalIndex);
        }
        return;
      }
    }
  }

  function findMatchFrom(query, startIndex) {
    const { items } = menuState;
    if (!items.length || !query) {
      return -1;
    }
    const total = items.length;
    for (let offset = 0; offset < total; offset += 1) {
      const index = (startIndex + offset) % total;
      const item = items[index];
      if (!item || isDisabled(item)) {
        continue;
      }
      const label = getItemLabel(item).toLowerCase();
      if (label && label.startsWith(query)) {
        return index;
      }
    }
    return -1;
  }

  function handleTypeahead(char) {
    if (!char) {
      return;
    }
    menuState.typeaheadBuffer += char;
    scheduleTypeaheadReset();

    const startIndex = menuState.activeIndex >= 0 ? menuState.activeIndex + 1 : 0;
    let matchIndex = findMatchFrom(menuState.typeaheadBuffer, startIndex);

    if (matchIndex < 0 && menuState.typeaheadBuffer.length > 1) {
      matchIndex = findMatchFrom(char, startIndex);
    }

    if (matchIndex >= 0) {
      setActiveItem(matchIndex);
    }
  }

  function handleMenuKeydown(event) {
    if (!menuState.panel || !containsTarget(menuState.panel, event.target)) {
      return;
    }

    menuState.items = findMenuItems(menuState.panel);

    switch (event.key) {
      case "ArrowDown":
      case "ArrowRight":
        event.preventDefault();
        moveFocus(1);
        return;
      case "ArrowUp":
      case "ArrowLeft":
        event.preventDefault();
        moveFocus(-1);
        return;
      case "Home":
        event.preventDefault();
        focusEdge(1);
        return;
      case "End":
        event.preventDefault();
        focusEdge(-1);
        return;
      default:
        break;
    }

    if (
      event.key &&
      event.key.length === 1 &&
      !event.altKey &&
      !event.ctrlKey &&
      !event.metaKey
    ) {
      const char = event.key.toLowerCase();
      if (char.trim()) {
        event.preventDefault();
        handleTypeahead(char);
      }
    }
  }

  function handleMenuFocusIn(event) {
    if (!menuState.panel || !containsTarget(menuState.panel, event.target)) {
      return;
    }
    menuState.items = findMenuItems(menuState.panel);
    const index = menuState.items.indexOf(event.target);
    if (index >= 0 && !isDisabled(event.target)) {
      setActiveItem(index, { focus: false });
    }
  }

  function ensureMenu(panelElement) {
    if (!panelElement) {
      return;
    }

    if (menuState.panel && menuState.panel !== panelElement) {
      if (menuHandlers.keydown) {
        menuState.panel.removeEventListener("keydown", menuHandlers.keydown);
      }
      if (menuHandlers.focusin) {
        menuState.panel.removeEventListener("focusin", menuHandlers.focusin);
      }
    }

    menuState.panel = panelElement;
    ensurePanelId(panelElement);

    panelElement.setAttribute("role", "menu");
    if (!panelElement.hasAttribute("tabindex")) {
      panelElement.setAttribute("tabindex", "-1");
    }

    menuState.items = findMenuItems(panelElement);
    menuState.activeIndex = -1;
    updateAriaActiveDescendant(panelElement, null);
    resetTypeaheadBuffer();

    if (!menuHandlers.keydown) {
      menuHandlers.keydown = (event) => handleMenuKeydown(event);
    }
    if (!menuHandlers.focusin) {
      menuHandlers.focusin = (event) => handleMenuFocusIn(event);
    }

    panelElement.addEventListener("keydown", menuHandlers.keydown);
    panelElement.addEventListener("focusin", menuHandlers.focusin);
  }

  function teardownMenu() {
    const panelElement = menuState.panel;
    if (panelElement && menuHandlers.keydown) {
      panelElement.removeEventListener("keydown", menuHandlers.keydown);
    }
    if (panelElement && menuHandlers.focusin) {
      panelElement.removeEventListener("focusin", menuHandlers.focusin);
    }
    resetTypeaheadBuffer();
    menuState.panel = null;
    menuState.items = [];
    menuState.activeIndex = -1;
  }

  function applyPanelTokens() {
    if (!panel) {
      return;
    }

    if (maxWidthToken) {
      const widthValue = resolveTokenValue(maxWidthToken, documentRef);
      panel.style.maxWidth = widthValue || "";
    }

    if (maxHeightToken) {
      const heightValue = resolveTokenValue(maxHeightToken, documentRef);
      panel.style.maxHeight = heightValue || "";
    }
  }

  function ensurePanel() {
    if (panel && isElement(panel)) {
      return panel;
    }
    if (!documentRef || typeof render !== "function" || !portal) {
      return null;
    }

    let result;
    try {
      result = render({
        container: portal,
        trigger: anchor,
        document: documentRef,
        close,
        update: () => updatePosition(),
      });
    } catch (error) {
      logger.user.error("[popover] render failed", error);
      return null;
    }

    if (isElement(result)) {
      panel = result;
    } else if (result && isElement(result.panel)) {
      panel = result.panel;
      if (!arrowElement) {
        arrowElement = resolveArrow(result.arrow, panel);
      }
    } else if (portal.firstElementChild && isElement(portal.firstElementChild)) {
      panel = portal.firstElementChild;
    }

    if (!panel) {
      logger.user.error("[popover] render did not return a panel element");
      return null;
    }

    if (!panel.isConnected) {
      portal.appendChild(panel);
    }

    ensurePanelId(panel);
    if (anchor && typeof anchor.setAttribute === "function") {
      anchor.setAttribute("aria-controls", panel.id);
    }

    ensureMenu(panel);

    arrowElement = resolveArrow(options.arrow, panel) || arrowElement;

    applyPanelTokens();

    return panel;
  }

  async function updatePosition() {
    if (!anchor || !panel || !documentRef) {
      return;
    }

    try {
      const anchorRect =
        typeof anchor.getBoundingClientRect === "function"
          ? anchor.getBoundingClientRect()
          : null;
      if (!anchorRect) {
        return;
      }

      const view = documentRef.defaultView || globalThis;
      const docEl = documentRef.documentElement || null;
      const viewportWidth =
        docEl?.clientWidth ?? view?.innerWidth ?? panel.offsetWidth ?? 0;
      const viewportHeight =
        docEl?.clientHeight ?? view?.innerHeight ?? panel.offsetHeight ?? 0;

      const panelRect =
        typeof panel.getBoundingClientRect === "function"
          ? panel.getBoundingClientRect()
          : null;
      const panelWidth = panelRect?.width ?? panel.offsetWidth ?? 0;
      const panelHeight = panelRect?.height ?? panel.offsetHeight ?? 0;

      let [side, alignment = "start"] = placement.split("-");
      if (!side || !["top", "bottom", "left", "right"].includes(side)) {
        side = "bottom";
      }
      if (!["start", "end", "center"].includes(alignment)) {
        alignment = "start";
      }

      const effectiveGap = Number.isFinite(gap) ? gap : 0;
      const safePadding = Number.isFinite(viewportPadding) ? viewportPadding : 0;

      function clamp(value, min, max, fallback) {
        if (!Number.isFinite(value)) {
          return fallback ?? min;
        }
        if (min > max) {
          return fallback ?? (min + max) / 2;
        }
        return Math.min(Math.max(value, min), max);
      }

      if (side === "bottom") {
        const fitsBelow =
          anchorRect.bottom + effectiveGap + panelHeight <=
          viewportHeight - safePadding;
        const fitsAbove =
          anchorRect.top - effectiveGap - panelHeight >= safePadding;
        if (!fitsBelow && fitsAbove) {
          side = "top";
        }
      } else if (side === "top") {
        const fitsAbove =
          anchorRect.top - effectiveGap - panelHeight >= safePadding;
        const fitsBelow =
          anchorRect.bottom + effectiveGap + panelHeight <=
          viewportHeight - safePadding;
        if (!fitsAbove && fitsBelow) {
          side = "bottom";
        }
      }

      let top = 0;
      let left = 0;

      if (side === "top") {
        top = anchorRect.top - panelHeight - effectiveGap;
      } else if (side === "bottom") {
        top = anchorRect.bottom + effectiveGap;
      } else if (side === "left") {
        top = anchorRect.top + anchorRect.height / 2 - panelHeight / 2;
      } else if (side === "right") {
        top = anchorRect.top + anchorRect.height / 2 - panelHeight / 2;
      }

      if (side === "left") {
        left = anchorRect.left - panelWidth - effectiveGap;
      } else if (side === "right") {
        left = anchorRect.right + effectiveGap;
      } else if (alignment === "end") {
        left = anchorRect.right - panelWidth;
      } else if (alignment === "center") {
        left = anchorRect.left + anchorRect.width / 2 - panelWidth / 2;
      } else {
        left = anchorRect.left;
      }

      const minTop = safePadding;
      const maxTop = viewportHeight - safePadding - panelHeight;
      const minLeft = safePadding;
      const maxLeft = viewportWidth - safePadding - panelWidth;

      const fallbackTop = viewportHeight / 2 - panelHeight / 2;
      const fallbackLeft = viewportWidth / 2 - panelWidth / 2;

      top = clamp(top, minTop, maxTop, fallbackTop);
      left = clamp(left, minLeft, maxLeft, fallbackLeft);

      panel.style.position = strategy;
      panel.style.left = `${Math.round(left)}px`;
      panel.style.top = `${Math.round(top)}px`;
      panel.dataset.popoverPlacement = `${side}-${alignment}`;

      if (arrowElement) {
        applyArrowStyles({
          arrowElement,
          side,
          panelLeft: left,
          panelTop: top,
          panelWidth,
          panelHeight,
          anchorRect,
        });
      }
    } catch (error) {
      logger.user.error("[popover] positioning failed", error);
    }
  }

  function handlePointerDown(event) {
    const target = event?.target || null;
    if (containsTarget(panel, target) || containsTarget(anchor, target)) {
      return;
    }
    close();
  }

  function handleKeydown(event) {
    if (event?.key === "Escape") {
      close();
    }
  }

  function bindGlobalHandlers() {
    if (!documentRef) {
      return;
    }
    documentRef.addEventListener("pointerdown", handlePointerDown, true);
    documentRef.addEventListener("keydown", handleKeydown, true);
  }

  function unbindGlobalHandlers() {
    if (!documentRef) {
      return;
    }
    documentRef.removeEventListener("pointerdown", handlePointerDown, true);
    documentRef.removeEventListener("keydown", handleKeydown, true);
  }

  async function open() {
    if (!anchor || !documentRef) {
      return false;
    }

    const overlayRoot = ensureOverlayRoot(documentRef);
    if (!overlayRoot) {
      logger.user.error("[popover] unable to resolve overlay root");
      return false;
    }

    const panelElement = ensurePanel();
    if (!panelElement) {
      return false;
    }

    if (!portal.isConnected) {
      overlayRoot.appendChild(portal);
    }

    if (activePopoverInstance && activePopoverInstance !== api) {
      activePopoverInstance.close({ restoreFocus: false });
    }

    previousActiveElement = documentRef.activeElement || null;

    applyPanelTokens();

    panelElement.hidden = false;
    panelElement.setAttribute("aria-hidden", "false");
    panelElement.dataset.popoverState = "open";
    setExpandedAttribute(anchor, true);

    bindGlobalHandlers();

    if (autoUpdateCleanup) {
      autoUpdateCleanup();
      autoUpdateCleanup = null;
    }

    autoUpdateCleanup = createAutoUpdate({
      documentRef,
      anchor,
      panel: panelElement,
      update: () => updatePosition(),
    });

    await updatePosition();

    ensureMenu(panelElement);
    focusFirstEnabledItem();

    isOpen = true;
    activePopoverInstance = api;
    return true;
  }

  function close({ restoreFocus = restoreFocusOnClose } = {}) {
    if (!isOpen) {
      if (restoreFocus && restoreFocusOnClose) {
        restoreTriggerFocus();
      }
      return false;
    }

    isOpen = false;
    unbindGlobalHandlers();

    if (autoUpdateCleanup) {
      autoUpdateCleanup();
      autoUpdateCleanup = null;
    }

    if (panel) {
      panel.setAttribute("aria-hidden", "true");
      panel.hidden = true;
      panel.dataset.popoverState = "closed";
      updateAriaActiveDescendant(panel, null);
      if (menuState.items.length) {
        menuState.items.forEach((item) => {
          item.setAttribute("tabindex", "-1");
        });
      }
    }

    setExpandedAttribute(anchor, false);
    resetTypeaheadBuffer();

    if (restoreFocus && restoreFocusOnClose) {
      restoreTriggerFocus();
    }

    if (activePopoverInstance === api) {
      activePopoverInstance = null;
    }

    previousActiveElement = null;

    return true;
  }

  function restoreTriggerFocus() {
    if (anchor && typeof anchor.focus === "function") {
      try {
        anchor.focus({ preventScroll: true });
        return;
      } catch (error) {
        anchor.focus();
      }
    }

    if (previousActiveElement && typeof previousActiveElement.focus === "function") {
      try {
        previousActiveElement.focus({ preventScroll: true });
      } catch (error) {
        previousActiveElement.focus();
      }
    }
  }

  function toggle() {
    if (isOpen) {
      close();
      return false;
    }
    return open();
  }

  function destroy() {
    close({ restoreFocus: false });

    teardownMenu();

    if (panel && panel.parentNode === portal) {
      portal.removeChild(panel);
    }
    if (portal?.parentNode) {
      portal.parentNode.removeChild(portal);
    }

    panel = null;
    arrowElement = null;

    if (anchor) {
      anchor.removeAttribute("aria-controls");
      anchor.removeAttribute("aria-expanded");
      anchor.removeAttribute("aria-haspopup");
    }
  }

  const api = {
    open,
    close,
    toggle,
    destroy,
    update: updatePosition,
    isOpen: () => isOpen,
    getPanel: () => panel,
  };

  return api;
}

export default createPopover;
