import { createFloatingPanelStyles } from "./floatingPanelStyles.js";

const DEFAULT_OPTIONS = {
  placement: "bottom",
  alignment: "start",
  offset: 8,
  flip: true,
  viewportPadding: 12,
  strategy: "auto",
  rtl: null,
  onUpdate: null,
  preferAnchors: false,
};

const OPPOSITE_PLACEMENT = {
  top: "bottom",
  bottom: "top",
  left: "right",
  right: "left",
};

function normalizeNumber(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function resolveDirection(anchor, documentRef, explicitRtl) {
  if (typeof explicitRtl === "boolean") {
    return explicitRtl;
  }
  const docDir =
    documentRef?.documentElement?.dir || documentRef?.body?.dir || "";
  if (docDir) {
    return docDir.toLowerCase() === "rtl";
  }
  if (anchor && documentRef?.defaultView?.getComputedStyle) {
    try {
      const direction = documentRef.defaultView.getComputedStyle(anchor).direction;
      return direction === "rtl";
    } catch (error) {
      // Ignore getComputedStyle failures (e.g., detached elements in jsdom).
    }
  }
  return false;
}

function clamp(value, min, max) {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}

function uniquePush(list, value) {
  if (!value || list.includes(value)) {
    return;
  }
  list.push(value);
}

function getAlignmentsToTry({ placement, preferred, fallback }) {
  const values = [];
  uniquePush(values, preferred);
  uniquePush(values, fallback);
  if (placement === "top" || placement === "bottom" || placement === "left" || placement === "right") {
    uniquePush(values, "center");
    uniquePush(values, "start");
    uniquePush(values, "end");
  }
  return values;
}

function measureViewportOverflow({
  top,
  left,
  panelWidth,
  panelHeight,
  viewport,
  padding,
}) {
  const inlineStart = Math.max(padding - left, 0);
  const inlineEnd = Math.max(left + panelWidth - (viewport.width - padding), 0);
  const blockStart = Math.max(padding - top, 0);
  const blockEnd = Math.max(top + panelHeight - (viewport.height - padding), 0);
  const total = inlineStart + inlineEnd + blockStart + blockEnd;
  return {
    inlineStart,
    inlineEnd,
    blockStart,
    blockEnd,
    total,
  };
}

function computeAlignmentX({
  alignment,
  anchorRect,
  panelWidth,
  rtl,
}) {
  switch (alignment) {
    case "center": {
      return anchorRect.left + anchorRect.width / 2 - panelWidth / 2;
    }
    case "end": {
      return rtl
        ? anchorRect.left
        : anchorRect.right - panelWidth;
    }
    case "start":
    default: {
      return rtl
        ? anchorRect.right - panelWidth
        : anchorRect.left;
    }
  }
}

function computeAlignmentY({ alignment, anchorRect, panelHeight }) {
  switch (alignment) {
    case "center": {
      return anchorRect.top + anchorRect.height / 2 - panelHeight / 2;
    }
    case "end": {
      return anchorRect.bottom - panelHeight;
    }
    case "start":
    default: {
      return anchorRect.top;
    }
  }
}

function computePosition({
  placement,
  alignment,
  anchorRect,
  panelSize,
  offset,
  rtl,
}) {
  const [panelWidth, panelHeight] = panelSize;
  switch (placement) {
    case "top": {
      return {
        top: anchorRect.top - panelHeight - offset,
        left: computeAlignmentX({ alignment, anchorRect, panelWidth, rtl }),
      };
    }
    case "left": {
      return {
        top: computeAlignmentY({ alignment, anchorRect, panelHeight }),
        left: anchorRect.left - panelWidth - offset,
      };
    }
    case "right": {
      return {
        top: computeAlignmentY({ alignment, anchorRect, panelHeight }),
        left: anchorRect.right + offset,
      };
    }
    case "bottom":
    default: {
      return {
        top: anchorRect.bottom + offset,
        left: computeAlignmentX({ alignment, anchorRect, panelWidth, rtl }),
      };
    }
  }
}

function normalizePlacement(value) {
  const normalized = typeof value === "string" ? value.toLowerCase() : "";
  if (normalized === "top" || normalized === "bottom") {
    return normalized;
  }
  if (normalized === "left" || normalized === "right") {
    return normalized;
  }
  return "bottom";
}

function normalizeAlignment(value) {
  const normalized = typeof value === "string" ? value.toLowerCase() : "";
  if (normalized === "center" || normalized === "end") {
    return normalized;
  }
  return "start";
}

function normalizeStrategy(value) {
  const normalized = typeof value === "string" ? value.toLowerCase() : "";
  if (normalized === "absolute" || normalized === "fixed") {
    return normalized;
  }
  return "auto";
}

function createsFixedContainingBlock(style) {
  if (!style) {
    return false;
  }

  const {
    transform,
    perspective,
    filter,
    backdropFilter,
    contain,
    willChange,
  } = style;

  if (transform && transform !== "none") {
    return true;
  }
  if (perspective && perspective !== "none") {
    return true;
  }
  if (filter && filter !== "none") {
    return true;
  }
  if (backdropFilter && backdropFilter !== "none") {
    return true;
  }
  if (contain && /(paint|layout|strict|content)/.test(contain)) {
    return true;
  }
  if (typeof willChange === "string") {
    const tokenized = willChange.split(",").map((token) => token.trim().toLowerCase());
    if (
      tokenized.includes("transform") ||
      tokenized.includes("perspective") ||
      tokenized.includes("filter") ||
      tokenized.includes("backdrop-filter")
    ) {
      return true;
    }
  }

  return false;
}

function resolveStrategy({ anchor, documentRef, windowRef, requested }) {
  if (requested === "absolute" || requested === "fixed") {
    return requested;
  }

  if (!anchor || !windowRef?.getComputedStyle) {
    return "fixed";
  }

  const root = documentRef?.documentElement || null;
  let current = anchor.parentElement;

  while (current && current !== root) {
    try {
      const style = windowRef.getComputedStyle(current);
      if (createsFixedContainingBlock(style)) {
        return "absolute";
      }
    } catch (error) {
      // Ignore getComputedStyle errors triggered by detached nodes.
    }
    current = current.parentElement;
  }

  return "fixed";
}

function getViewportSize(windowRef, documentRef) {
  const width = windowRef?.innerWidth || documentRef?.documentElement?.clientWidth || 0;
  const height = windowRef?.innerHeight || documentRef?.documentElement?.clientHeight || 0;
  return { width, height };
}

function resolvePanelSize(panel, previousSize) {
  const rect = typeof panel.getBoundingClientRect === "function"
    ? panel.getBoundingClientRect()
    : { width: 0, height: 0 };
  let width = rect.width || panel.offsetWidth || previousSize?.width || 0;
  let height = rect.height || panel.offsetHeight || previousSize?.height || 0;

  if (!width && previousSize?.width) {
    width = previousSize.width;
  }
  if (!height && previousSize?.height) {
    height = previousSize.height;
  }

  return { width, height };
}

function detectAnchorSupport(windowRef) {
  const css = windowRef?.CSS;
  if (!css || typeof css.supports !== "function") {
    return false;
  }
  try {
    return (
      css.supports("anchor-name: --floating-panel") &&
      css.supports("position-anchor: --floating-panel")
    );
  } catch (error) {
    return false;
  }
}

export function positionFloatingPanel(anchor, panel, options = {}) {
  const safeAnchor = anchor || null;
  const safePanel = panel || null;

  if (!safeAnchor || !safePanel) {
    return {
      update() {},
      destroy() {},
    };
  }

  const documentRef = safeAnchor.ownerDocument || safePanel.ownerDocument || globalThis.document;
  const windowRef = documentRef?.defaultView || globalThis;

  const { styles: providedStyles, ...optionOverrides } = options || {};
  const config = {
    ...DEFAULT_OPTIONS,
    ...optionOverrides,
  };
  config.placement = normalizePlacement(config.placement);
  config.alignment = normalizeAlignment(config.alignment);
  config.offset = clamp(normalizeNumber(config.offset, DEFAULT_OPTIONS.offset), 0, Number.MAX_SAFE_INTEGER);
  config.viewportPadding = clamp(
    normalizeNumber(config.viewportPadding, DEFAULT_OPTIONS.viewportPadding),
    0,
    Number.MAX_SAFE_INTEGER,
  );
  const requestedStrategy = normalizeStrategy(config.strategy);
  config.preferAnchors = optionOverrides.preferAnchors === true;
  const rtl = resolveDirection(safeAnchor, documentRef, config.rtl);

  const anchorSupported = config.preferAnchors && detectAnchorSupport(windowRef);

  config.strategy = resolveStrategy({
    anchor: safeAnchor,
    documentRef,
    windowRef,
    requested: requestedStrategy,
  });

  const state = {
    lastSize: { width: 0, height: 0 },
    lastPlacement: null,
    lastAlignment: null,
    cleanup: [],
    pendingFrame: null,
  };

  state.cleanup.push(() => {
    if (state.pendingFrame !== null && windowRef?.cancelAnimationFrame) {
      windowRef.cancelAnimationFrame(state.pendingFrame);
    }
    state.pendingFrame = null;
  });

  const styles =
    providedStyles && providedStyles.element === safePanel
      ? providedStyles
      : createFloatingPanelStyles(safePanel);

  safeAnchor.dataset.floatingAnchor = "true";
  styles.setAlignment(config.alignment);
  styles.setStrategy(config.strategy);
  styles.setDirection(rtl ? "rtl" : "ltr");
  styles.setMode(anchorSupported ? "anchor" : "fallback");
  styles.setPlacement(config.placement);
  state.lastPlacement = styles.getPlacement();
  state.lastAlignment = styles.getAlignment();

  const applyPosition = ({ top, left, placement, alignment }) => {
    const resolvedAlignment = alignment || config.alignment;
    styles.setPlacement(placement);
    styles.setAlignment(resolvedAlignment);
    styles.setFallbackPosition({ top, left });
    state.lastPlacement = placement;
    state.lastAlignment = resolvedAlignment;
    if (typeof config.onUpdate === "function") {
      config.onUpdate({
        top,
        left,
        placement,
        alignment: resolvedAlignment,
        rtl,
      });
    }
  };

  const scheduleNextFrame = () => {
    if (!windowRef?.requestAnimationFrame) {
      return false;
    }
    if (state.pendingFrame !== null) {
      return true;
    }
    state.pendingFrame = windowRef.requestAnimationFrame(() => {
      state.pendingFrame = null;
      update();
    });
    return true;
  };

  const update = () => {
    if (!safeAnchor.isConnected || !safePanel.isConnected) {
      return;
    }

    const anchorRect = safeAnchor.getBoundingClientRect();
    const { width: panelWidth, height: panelHeight } = resolvePanelSize(
      safePanel,
      state.lastSize,
    );

    if (!panelWidth && !panelHeight) {
      scheduleNextFrame();
      return;
    }

    state.lastSize = { width: panelWidth, height: panelHeight };

    const viewport = getViewportSize(windowRef, documentRef);

    const placementsToTry = [];
    const pushPlacement = (value) => {
      if (value && !placementsToTry.includes(value)) {
        placementsToTry.push(value);
      }
    };
    pushPlacement(state.lastPlacement || config.placement);
    if (config.flip !== false) {
      const initial = state.lastPlacement || config.placement;
      const opposite = OPPOSITE_PLACEMENT[initial];
      if (opposite) {
        pushPlacement(opposite);
      }
      if (initial === "bottom" || initial === "top") {
        pushPlacement("right");
        pushPlacement("left");
      } else {
        pushPlacement("bottom");
        pushPlacement("top");
      }
    }

    let chosenPlacement = state.lastPlacement || config.placement;
    let chosenAlignment = state.lastAlignment || config.alignment;
    let chosenPosition = computePosition({
      placement: chosenPlacement,
      alignment: chosenAlignment,
      anchorRect,
      panelSize: [panelWidth, panelHeight],
      offset: config.offset,
      rtl,
    });

    let bestOverflow = measureViewportOverflow({
      top: chosenPosition.top,
      left: chosenPosition.left,
      panelWidth,
      panelHeight,
      viewport,
      padding: config.viewportPadding,
    });

    outer: for (const placement of placementsToTry) {
      const alignmentsToTry = getAlignmentsToTry({
        placement,
        preferred: state.lastAlignment || config.alignment,
        fallback: config.alignment,
      });

      for (const alignment of alignmentsToTry) {
        const position = computePosition({
          placement,
          alignment,
          anchorRect,
          panelSize: [panelWidth, panelHeight],
          offset: config.offset,
          rtl,
        });

        const overflow = measureViewportOverflow({
          top: position.top,
          left: position.left,
          panelWidth,
          panelHeight,
          viewport,
          padding: config.viewportPadding,
        });

        if (overflow.total < bestOverflow.total) {
          bestOverflow = overflow;
          chosenPlacement = placement;
          chosenAlignment = alignment;
          chosenPosition = position;
        }

        if (overflow.total === 0) {
          break outer;
        }
      }
    }

    let { top, left } = chosenPosition;

    const maxTop = Math.max(
      config.viewportPadding,
      viewport.height - config.viewportPadding - panelHeight,
    );
    const maxLeft = Math.max(
      config.viewportPadding,
      viewport.width - config.viewportPadding - panelWidth,
    );

    top = clamp(top, config.viewportPadding, maxTop);
    left = clamp(left, config.viewportPadding, maxLeft);

    if (config.strategy === "absolute") {
      const offsetParent = safePanel.offsetParent || safePanel.parentElement || documentRef.body;
      const parentRect = offsetParent?.getBoundingClientRect
        ? offsetParent.getBoundingClientRect()
        : { top: 0, left: 0 };
      const scrollTop = offsetParent?.scrollTop || 0;
      const scrollLeft = offsetParent?.scrollLeft || 0;
      top = top - parentRect.top + scrollTop;
      left = left - parentRect.left + scrollLeft;
    }

    applyPosition({
      top,
      left,
      placement: chosenPlacement,
      alignment: chosenAlignment,
    });
  };

  const handleScroll = () => update();
  const handleResize = () => update();

  if (typeof windowRef?.addEventListener === "function") {
    windowRef.addEventListener("scroll", handleScroll, true);
    windowRef.addEventListener("resize", handleResize);
    state.cleanup.push(() => {
      windowRef.removeEventListener("scroll", handleScroll, true);
      windowRef.removeEventListener("resize", handleResize);
    });
  }

  if (typeof windowRef?.ResizeObserver === "function") {
    const resizeObserver = new windowRef.ResizeObserver(() => update());
    try {
      resizeObserver.observe(safeAnchor);
      resizeObserver.observe(safePanel);
    } catch (error) {
      // Ignore observation errors for detached elements.
    }
    state.cleanup.push(() => {
      resizeObserver.disconnect();
    });
  }

  // Schedule an initial measurement on the next frame to avoid layout thrash
  // when the caller opens the panel synchronously.
  if (typeof windowRef?.requestAnimationFrame === "function") {
    windowRef.requestAnimationFrame(() => update());
  } else {
    update();
  }

  return {
    update,
    destroy() {
      while (state.cleanup.length) {
        const fn = state.cleanup.pop();
        try {
          fn();
        } catch (error) {
          // Ignore cleanup errors to avoid breaking consumer teardown flows.
        }
      }
      styles.teardown();
      delete safeAnchor.dataset.floatingAnchor;
    },
    styles,
  };
}

export function destroyFloatingPanel(positioner) {
  if (positioner && typeof positioner.destroy === "function") {
    positioner.destroy();
  }
}

export function updateFloatingPanel(positioner) {
  if (positioner && typeof positioner.update === "function") {
    positioner.update();
  }
}

export default positionFloatingPanel;
