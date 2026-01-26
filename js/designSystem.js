import { userLogger } from "./utils/logger.js";
const NEW_MODE = "new";

const FALLBACK_CONTEXT = Object.freeze({
  getMode: () => NEW_MODE,
  isNew: () => true,
});

export const BREAKPOINT_LG = 1024;

export function getDesignSystemMode() {
  return NEW_MODE;
}

export function isDesignSystemNew() {
  return true;
}

export function normalizeDesignSystemContext(candidate) {
  if (!candidate || typeof candidate !== "object") {
    return FALLBACK_CONTEXT;
  }

  return {
    getMode:
      typeof candidate.getMode === "function"
        ? candidate.getMode
        : FALLBACK_CONTEXT.getMode,
    isNew:
      typeof candidate.isNew === "function"
        ? candidate.isNew
        : FALLBACK_CONTEXT.isNew,
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
      userLogger.warn("[design-system] Failed to set data-ds attribute:", error);
    }
  });

  return mode;
}
