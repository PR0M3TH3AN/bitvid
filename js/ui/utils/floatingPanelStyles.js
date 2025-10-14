import {
  registerScope,
  setVariables,
  releaseScope,
  getScopeAttributeName,
} from "../../designSystem/dynamicStyles.js";

const DEFAULT_STATE = {
  placement: "bottom",
  alignment: "start",
  strategy: "fixed",
  direction: "ltr",
  mode: "fallback",
  fallbackTop: null,
  fallbackLeft: null,
};

const FALLBACK_TOP_VAR = "--floating-fallback-top";
const FALLBACK_LEFT_VAR = "--floating-fallback-left";
const SCOPE_BASE_ID = "floating-panel";
const SCOPE_SELECTORS = [":scope"];

function toCssPixel(value) {
  if (Number.isFinite(value)) {
    return `${value}px`;
  }
  if (typeof value === "string" && value.trim() !== "") {
    return value;
  }
  return "auto";
}

function normalizeDirection(value) {
  return value === "rtl" ? "rtl" : "ltr";
}

function ensureDatasetValue(element, key, value) {
  if (!element) {
    return;
  }
  if (value === undefined || value === null || value === "") {
    delete element.dataset[key];
    return;
  }
  element.dataset[key] = value;
}

function applyFallbackVariables(scopeId, variables) {
  if (!scopeId) {
    return;
  }
  setVariables(scopeId, variables);
}

export function createFloatingPanelStyles(panel) {
  const safePanel = panel || null;
  const state = { ...DEFAULT_STATE };

  const documentRef = safePanel?.ownerDocument || null;
  const scopeId = safePanel
    ? registerScope(SCOPE_BASE_ID, SCOPE_SELECTORS, { documentRef })
    : null;

  if (safePanel) {
    safePanel.dataset.floatingPanel = "true";
    if (scopeId) {
      safePanel.setAttribute(getScopeAttributeName(), scopeId);
      applyFallbackVariables(scopeId, {
        [FALLBACK_TOP_VAR]: "auto",
        [FALLBACK_LEFT_VAR]: "auto",
      });
    }
  }

  const api = {
    element: safePanel,
    scopeId,
    setPlacement(value) {
      state.placement = typeof value === "string" && value ? value : DEFAULT_STATE.placement;
      ensureDatasetValue(safePanel, "floatingPlacement", state.placement);
      return state.placement;
    },
    getPlacement() {
      return state.placement;
    },
    setAlignment(value) {
      state.alignment = typeof value === "string" && value ? value : DEFAULT_STATE.alignment;
      ensureDatasetValue(safePanel, "floatingAlignment", state.alignment);
      return state.alignment;
    },
    getAlignment() {
      return state.alignment;
    },
    setStrategy(value) {
      state.strategy = value === "absolute" ? "absolute" : DEFAULT_STATE.strategy;
      ensureDatasetValue(safePanel, "floatingStrategy", state.strategy);
      return state.strategy;
    },
    getStrategy() {
      return state.strategy;
    },
    setDirection(value) {
      state.direction = normalizeDirection(value);
      ensureDatasetValue(safePanel, "floatingDir", state.direction);
      return state.direction;
    },
    getDirection() {
      return state.direction;
    },
    setMode(value) {
      state.mode = value === "anchor" ? "anchor" : DEFAULT_STATE.mode;
      ensureDatasetValue(safePanel, "floatingMode", state.mode);
      return state.mode;
    },
    getMode() {
      return state.mode;
    },
    setFallbackPosition({ top, left }) {
      state.fallbackTop = Number.isFinite(top) ? Number(top) : null;
      state.fallbackLeft = Number.isFinite(left) ? Number(left) : null;
      if (scopeId) {
        applyFallbackVariables(scopeId, {
          [FALLBACK_TOP_VAR]: toCssPixel(state.fallbackTop),
          [FALLBACK_LEFT_VAR]: toCssPixel(state.fallbackLeft),
        });
      }
      return { ...api.getFallbackPosition() };
    },
    getFallbackPosition() {
      return {
        top: state.fallbackTop,
        left: state.fallbackLeft,
      };
    },
    teardown() {
      if (scopeId) {
        applyFallbackVariables(scopeId, {
          [FALLBACK_TOP_VAR]: "auto",
          [FALLBACK_LEFT_VAR]: "auto",
        });
        releaseScope(scopeId);
      }
      if (!safePanel) {
        return;
      }
      safePanel.removeAttribute(getScopeAttributeName());
      delete safePanel.dataset.floatingPanel;
      delete safePanel.dataset.floatingPlacement;
      delete safePanel.dataset.floatingAlignment;
      delete safePanel.dataset.floatingStrategy;
      delete safePanel.dataset.floatingDir;
      delete safePanel.dataset.floatingMode;
      state.placement = DEFAULT_STATE.placement;
      state.alignment = DEFAULT_STATE.alignment;
      state.strategy = DEFAULT_STATE.strategy;
      state.direction = DEFAULT_STATE.direction;
      state.mode = DEFAULT_STATE.mode;
      state.fallbackTop = DEFAULT_STATE.fallbackTop;
      state.fallbackLeft = DEFAULT_STATE.fallbackLeft;
    },
  };

  api.setPlacement(state.placement);
  api.setAlignment(state.alignment);
  api.setStrategy(state.strategy);
  api.setDirection(state.direction);
  api.setMode(state.mode);

  return api;
}

export default createFloatingPanelStyles;
