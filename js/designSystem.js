import {
  DESIGN_SYSTEM_EVENT_NAME,
  getFeatureDesignSystemEnabled,
} from "./constants.js";

const LEGACY_MODE = "legacy";
const NEW_MODE = "new";

const FALLBACK_CONTEXT = Object.freeze({
  getMode: () => LEGACY_MODE,
  isNew: () => false,
});

function normalizeMode(mode) {
  return mode === NEW_MODE ? NEW_MODE : LEGACY_MODE;
}

export function getDesignSystemMode() {
  return normalizeMode(getFeatureDesignSystemEnabled() ? NEW_MODE : LEGACY_MODE);
}

export function isDesignSystemNew() {
  return getFeatureDesignSystemEnabled() === true;
}

export function normalizeDesignSystemContext(candidate) {
  if (!candidate || typeof candidate !== "object") {
    return FALLBACK_CONTEXT;
  }

  const resolvedGetMode =
    typeof candidate.getMode === "function"
      ? candidate.getMode
      : FALLBACK_CONTEXT.getMode;

  const resolvedIsNew =
    typeof candidate.isNew === "function"
      ? candidate.isNew
      : () => normalizeMode(resolvedGetMode()) === NEW_MODE;

  return {
    getMode: resolvedGetMode,
    isNew: resolvedIsNew,
  };
}

export function applyDesignSystemAttributes(root = null) {
  if (typeof document === "undefined" || !document) {
    return getDesignSystemMode();
  }

  const mode = getDesignSystemMode();

  const enqueueTargets = (source) => {
    const targets = [];
    if (!source) {
      return targets;
    }

    const pushIfEligible = (element) => {
      if (!element || element.nodeType !== 1) {
        return;
      }
      if (element === document.body || element.hasAttribute("data-ds")) {
        targets.push(element);
      }
    };

    if (source === document) {
      pushIfEligible(document.body);
      if (typeof document.querySelectorAll === "function") {
        document
          .querySelectorAll("[data-ds]")
          .forEach((element) => pushIfEligible(element));
      }
      return targets;
    }

    if (source.nodeType === 1) {
      pushIfEligible(source);
      if (typeof source.querySelectorAll === "function") {
        source
          .querySelectorAll("[data-ds]")
          .forEach((element) => pushIfEligible(element));
      }
      return targets;
    }

    if (source.nodeType === 11 && typeof source.querySelectorAll === "function") {
      source
        .querySelectorAll("[data-ds]")
        .forEach((element) => pushIfEligible(element));
    }

    return targets;
  };

  const targets = enqueueTargets(root || document);

  targets.forEach((element) => {
    try {
      element.setAttribute("data-ds", mode);
    } catch (error) {
      if (typeof console !== "undefined" && console && console.warn) {
        console.warn("[design-system] Failed to set data-ds attribute:", error);
      }
    }
  });

  return mode;
}

export function subscribeToDesignSystemChanges(listener) {
  if (typeof window !== "object" || window === null) {
    return () => {};
  }

  if (typeof listener !== "function") {
    return () => {};
  }

  const handler = (event) => {
    listener({
      mode: getDesignSystemMode(),
      event,
    });
  };

  window.addEventListener(DESIGN_SYSTEM_EVENT_NAME, handler);

  return () => {
    window.removeEventListener(DESIGN_SYSTEM_EVENT_NAME, handler);
  };
}

export { DESIGN_SYSTEM_EVENT_NAME };
