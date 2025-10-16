import {
  computePosition,
  offset,
  flip,
  shift,
  autoUpdate,
  arrow as arrowMiddleware,
} from "@floating-ui/dom";
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
const STATIC_SIDE_MAP = Object.freeze({
  top: "bottom",
  right: "left",
  bottom: "top",
  left: "right",
});

let activePopoverInstance = null;

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

function applyArrowStyles(arrowElement, placement, middlewareData) {
  if (!arrowElement) {
    return;
  }

  const arrowData = middlewareData?.arrow || {};

  arrowElement.style.left =
    arrowData.x !== undefined && arrowData.x !== null ? `${arrowData.x}px` : "";
  arrowElement.style.top =
    arrowData.y !== undefined && arrowData.y !== null ? `${arrowData.y}px` : "";
  arrowElement.style.right = "";
  arrowElement.style.bottom = "";

  const [side] = placement.split("-");
  const staticSide = STATIC_SIDE_MAP[side];

  if (staticSide) {
    const size =
      staticSide === "top" || staticSide === "bottom"
        ? arrowElement.offsetHeight || 0
        : arrowElement.offsetWidth || 0;
    arrowElement.style[staticSide] = `${-Math.max(size, 0)}px`;
  }

  arrowElement.dataset.popoverArrowSide = side || "";
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

    arrowElement = resolveArrow(options.arrow, panel) || arrowElement;

    applyPanelTokens();

    return panel;
  }

  async function updatePosition() {
    if (!anchor || !panel) {
      return;
    }

    try {
      const middleware = [
        offset(gap),
        flip({ padding: viewportPadding }),
        shift({ padding: viewportPadding }),
      ];

      if (arrowElement) {
        middleware.push(arrowMiddleware({ element: arrowElement }));
      }

      const { x, y, placement: resolvedPlacement, middlewareData } =
        await computePosition(anchor, panel, {
          placement,
          strategy,
          middleware,
        });

      panel.style.position = strategy;
      panel.style.left = `${x}px`;
      panel.style.top = `${y}px`;
      panel.dataset.popoverPlacement = resolvedPlacement;

      if (arrowElement) {
        applyArrowStyles(arrowElement, resolvedPlacement, middlewareData);
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

    autoUpdateCleanup = autoUpdate(anchor, panelElement, updatePosition, {
      animationFrame: false,
    });

    await updatePosition();

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
    }

    setExpandedAttribute(anchor, false);

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

    if (panel && panel.parentNode === portal) {
      portal.removeChild(panel);
    }
    if (portal?.parentNode) {
      portal.parentNode.removeChild(portal);
    }

    panel = null;
    arrowElement = null;
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
