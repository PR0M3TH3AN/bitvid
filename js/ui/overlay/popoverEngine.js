import logger from "../../utils/logger.js";
import {
  getPopupOffsetPx,
  getPopupViewportPaddingPx,
  readDesignToken,
} from "../../designSystem/metrics.js";
import { ensureOverlayRoot } from "./overlayRoot.js";
import {
  arrow as arrowMiddleware,
  autoUpdate,
  computePosition,
  flip,
  offset,
  shift,
} from "../../../vendor/floating-ui.dom.bundle.min.js";

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

function applyArrowStyles({ arrowElement, placement, middlewareData }) {
  if (!arrowElement || typeof placement !== "string") {
    return;
  }

  const basePlacement = placement.split("-")[0];
  const arrowData = middlewareData?.arrow || null;

  arrowElement.style.left = "";
  arrowElement.style.right = "";
  arrowElement.style.top = "";
  arrowElement.style.bottom = "";

  if (!arrowData || !basePlacement) {
    delete arrowElement.dataset.popoverArrowSide;
    return;
  }

  const staticSideMap = {
    top: "bottom",
    right: "left",
    bottom: "top",
    left: "right",
  };

  if (Number.isFinite(arrowData.x)) {
    arrowElement.style.left = `${Math.round(arrowData.x)}px`;
  }

  if (Number.isFinite(arrowData.y)) {
    arrowElement.style.top = `${Math.round(arrowData.y)}px`;
  }

  const staticSide = staticSideMap[basePlacement] || null;

  if (staticSide) {
    const arrowRect =
      typeof arrowElement.getBoundingClientRect === "function"
        ? arrowElement.getBoundingClientRect()
        : null;
    const arrowWidth = arrowRect?.width ?? arrowElement.offsetWidth ?? 0;
    const arrowHeight = arrowRect?.height ?? arrowElement.offsetHeight ?? 0;
    const offsetValue =
      basePlacement === "top" || basePlacement === "bottom"
        ? arrowHeight
        : arrowWidth;
    arrowElement.style[staticSide] = `${-Math.round(offsetValue)}px`;
  }

  arrowElement.dataset.popoverArrowSide = basePlacement;
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

  function focusWithoutScroll(node) {
    if (!node || typeof node.focus !== "function") {
      return;
    }

    const view = getView();
    const scrollX = view?.scrollX ?? view?.pageXOffset ?? 0;
    const scrollY = view?.scrollY ?? view?.pageYOffset ?? 0;

    let preventScrollSupported = true;

    try {
      node.focus({ preventScroll: true });
    } catch (error) {
      preventScrollSupported = false;
      node.focus();
    }

    if (!view || typeof view.scrollTo !== "function") {
      return;
    }

    const restoreScroll = () => {
      try {
        view.scrollTo(scrollX, scrollY);
      } catch (error) {
        logger.dev?.warn?.("[popover] scroll restoration failed", error);
      }
    };

    restoreScroll();

    if (preventScrollSupported) {
      return;
    }

    if (typeof view.requestAnimationFrame === "function") {
      view.requestAnimationFrame(restoreScroll);
      return;
    }

    if (typeof view.setTimeout === "function") {
      view.setTimeout(restoreScroll, 0);
    }
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
      focusWithoutScroll(target);
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
      focusWithoutScroll(panelElement);
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

  function preload() {
    return Boolean(ensurePanel());
  }

  async function updatePosition() {
    if (!anchor || !panel) {
      return;
    }

    try {
      const effectiveGap = Number.isFinite(gap) ? gap : 0;
      const safePadding = Number.isFinite(viewportPadding) ? viewportPadding : 0;
      const middleware = [
        offset(effectiveGap),
        flip({ padding: safePadding }),
        shift({ padding: safePadding }),
      ];

      if (arrowElement) {
        middleware.push(
          arrowMiddleware({
            element: arrowElement,
          }),
        );
      }

      const {
        x,
        y,
        placement: resolvedPlacement,
        middlewareData,
        strategy: resolvedStrategy,
      } = await computePosition(anchor, panel, {
        placement,
        strategy,
        middleware,
      });

      const nextX = Number.isFinite(x) ? x : 0;
      const nextY = Number.isFinite(y) ? y : 0;
      const finalPlacement =
        typeof resolvedPlacement === "string" && resolvedPlacement
          ? resolvedPlacement
          : placement;

      panel.style.position = resolvedStrategy || strategy;
      panel.style.left = `${Math.round(nextX)}px`;
      panel.style.top = `${Math.round(nextY)}px`;
      panel.dataset.popoverPlacement = finalPlacement;

      if (arrowElement) {
        applyArrowStyles({
          arrowElement,
          placement: finalPlacement,
          middlewareData,
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
    panelElement.dataset.state = "open";
    setExpandedAttribute(anchor, true);

    bindGlobalHandlers();

    if (autoUpdateCleanup) {
      autoUpdateCleanup();
      autoUpdateCleanup = null;
    }

    autoUpdateCleanup = autoUpdate(
      anchor,
      panelElement,
      () => {
        void updatePosition();
      },
      {
        ancestorScroll: true,
        ancestorResize: true,
        elementResize: true,
        layoutShift: true,
      },
    );

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
      panel.dataset.state = "closed";
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
      focusWithoutScroll(anchor);
      return;
    }

    if (previousActiveElement && typeof previousActiveElement.focus === "function") {
      focusWithoutScroll(previousActiveElement);
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
    preload,
  };

  return api;
}

export default createPopover;
