import { THEME_ACCENT_OVERRIDES } from "../config/instance-config.js";
import { userLogger } from "./utils/logger.js";
const STORAGE_KEY = "bitvid:theme";
const FALLBACK_THEME = "dark";
const VALID_THEMES = new Set(["light", "dark"]);
const FALLBACK_META_COLORS = {
  dark: "#0f172a",
  light: "#f8fafc",
};
const TOGGLE_SELECTORS = [
  "[data-theme-toggle]",
  "[data-action=\"toggle-theme\"]",
  ".js-theme-toggle",
  "#themeToggle",
];

const ACCENT_CSS_VARIABLES = Object.freeze({
  accent: "--color-accent",
  accentStrong: "--color-accent-strong",
  accentPressed: "--color-accent-pressed",
});

const boundToggles = new WeakSet();
const registeredToggles = new Set();
let currentTheme = null;
let storageListenerBound = false;

const isBrowser = () =>
  typeof window !== "undefined" && typeof document !== "undefined";

const normalizeTheme = (value) => {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "default" || normalized === "") {
    return FALLBACK_THEME;
  }
  if (VALID_THEMES.has(normalized)) {
    return normalized;
  }
  return null;
};

const readStoredTheme = () => {
  if (!isBrowser()) {
    return null;
  }
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return normalizeTheme(stored);
  } catch (error) {
    userLogger.warn("Unable to read stored theme preference:", error);
    return null;
  }
};

const persistTheme = (theme) => {
  if (!isBrowser()) {
    return;
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, theme);
  } catch (error) {
    userLogger.warn("Unable to persist theme preference:", error);
  }
};

const getRootElement = () => {
  if (!isBrowser()) {
    return null;
  }
  const { documentElement } = document;
  if (documentElement instanceof HTMLElement) {
    return documentElement;
  }
  return null;
};

const normalizeAccentValue = (value) =>
  typeof value === "string" ? value.trim() : "";

const applyAccentOverrides = (root, theme) => {
  if (!root) {
    return;
  }

  const themeOverrides =
    THEME_ACCENT_OVERRIDES &&
    typeof THEME_ACCENT_OVERRIDES === "object" &&
    THEME_ACCENT_OVERRIDES[theme] &&
    typeof THEME_ACCENT_OVERRIDES[theme] === "object"
      ? THEME_ACCENT_OVERRIDES[theme]
      : null;

  Object.entries(ACCENT_CSS_VARIABLES).forEach(([token, cssVariable]) => {
    const overrideValue = themeOverrides ? themeOverrides[token] : null;
    const normalized = normalizeAccentValue(overrideValue);

    if (normalized) {
      root.style.setProperty(cssVariable, normalized);
    } else {
      root.style.removeProperty(cssVariable);
    }
  });
};

const updateThemeColorMeta = (theme) => {
  if (!isBrowser()) {
    return;
  }

  const themeMeta = document.querySelector('meta[name="theme-color"]');
  if (!themeMeta) {
    return;
  }

  const root = getRootElement();
  if (!root) {
    return;
  }

  let computedColor = "";
  try {
    if (typeof window.getComputedStyle === "function") {
      computedColor = getComputedStyle(root)
        .getPropertyValue("--color-page")
        .trim();
    }
  } catch (error) {
    userLogger.warn("Unable to compute theme color token:", error);
  }

  const fallback = FALLBACK_META_COLORS[theme] || FALLBACK_META_COLORS[FALLBACK_THEME];
  const nextColor = computedColor || fallback;
  if (nextColor) {
    themeMeta.setAttribute("content", nextColor);
  }
};

const syncTogglePresentation = (toggle, theme) => {
  if (!(toggle instanceof HTMLElement)) {
    return;
  }
  toggle.dataset.themeState = theme;
  toggle.setAttribute("aria-pressed", theme === "dark" ? "true" : "false");

  const actionLabel =
    theme === "dark" ? "Switch to light theme" : "Switch to dark theme";
  toggle.setAttribute("aria-label", actionLabel);
  toggle.setAttribute("title", actionLabel);

  const labelTarget =
    toggle.querySelector("[data-theme-toggle-label]") || toggle.querySelector(".sr-only");
  if (labelTarget) {
    labelTarget.textContent = actionLabel;
  }

  const iconTarget =
    toggle.querySelector("[data-theme-toggle-icon]") || toggle.querySelector('[aria-hidden="true"]');
  if (iconTarget) {
    const iconForLight = toggle.dataset.iconLight || "☀️";
    const iconForDark = toggle.dataset.iconDark || "🌙";
    iconTarget.textContent = theme === "dark" ? iconForLight : iconForDark;
  }
};

const cleanupRegisteredToggles = () => {
  if (!isBrowser()) {
    registeredToggles.clear();
    return;
  }
  registeredToggles.forEach((toggle) => {
    if (!(toggle instanceof HTMLElement) || !document.contains(toggle)) {
      registeredToggles.delete(toggle);
    }
  });
};

const syncRegisteredToggles = (theme) => {
  cleanupRegisteredToggles();
  registeredToggles.forEach((toggle) => {
    syncTogglePresentation(toggle, theme);
  });
};

const bindToggle = (toggle) => {
  if (!(toggle instanceof HTMLElement) || boundToggles.has(toggle)) {
    return;
  }

  toggle.addEventListener("click", (event) => {
    event.preventDefault();
    const nextTheme = currentTheme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
  });

  toggle.dataset.themeToggleBound = "true";
  boundToggles.add(toggle);
};

const collectToggleElements = (root = document) => {
  if (!isBrowser()) {
    return [];
  }

  const elements = new Set();
  const scope = root && typeof root.querySelectorAll === "function" ? root : document;

  TOGGLE_SELECTORS.forEach((selector) => {
    try {
      scope.querySelectorAll(selector).forEach((element) => {
        if (element instanceof HTMLElement) {
          elements.add(element);
        }
      });
    } catch (error) {
      userLogger.warn(`Invalid selector for theme toggle: ${selector}`, error);
    }
  });

  if (root instanceof HTMLElement) {
    TOGGLE_SELECTORS.forEach((selector) => {
      if (root.matches(selector)) {
        elements.add(root);
      }
    });
  }

  return Array.from(elements);
};

const applyTheme = (theme, { persist = true } = {}) => {
  const normalized = normalizeTheme(theme) || FALLBACK_THEME;
  currentTheme = normalized;

  const root = getRootElement();
  if (root) {
    root.dataset.theme = normalized;
    applyAccentOverrides(root, normalized);
  }

  if (persist) {
    persistTheme(normalized);
  }

  updateThemeColorMeta(normalized);
  syncRegisteredToggles(normalized);
  return normalized;
};

export const setTheme = (theme) => {
  if (!isBrowser()) {
    currentTheme = normalizeTheme(theme) || FALLBACK_THEME;
    return currentTheme;
  }

  return applyTheme(theme, { persist: true });
};

export const refreshThemeControls = (root = document) => {
  if (!isBrowser()) {
    return;
  }

  const toggles = collectToggleElements(root);
  toggles.forEach((toggle) => {
    registeredToggles.add(toggle);
    bindToggle(toggle);
    syncTogglePresentation(toggle, currentTheme || FALLBACK_THEME);
  });
};

const resolveInitialTheme = () => {
  if (!isBrowser()) {
    return FALLBACK_THEME;
  }
  const root = getRootElement();
  const datasetTheme = root ? normalizeTheme(root.dataset.theme) : null;
  return datasetTheme || readStoredTheme() || FALLBACK_THEME;
};

const handleStorageEvent = (event) => {
  if (!event || event.key !== STORAGE_KEY) {
    return;
  }
  const nextTheme = normalizeTheme(event.newValue) || FALLBACK_THEME;
  if (nextTheme === currentTheme) {
    return;
  }
  applyTheme(nextTheme, { persist: false });
};

export const initThemeController = () => {
  if (!isBrowser()) {
    currentTheme = FALLBACK_THEME;
    return;
  }

  if (!storageListenerBound) {
    window.addEventListener("storage", handleStorageEvent);
    storageListenerBound = true;
  }

  const initialTheme = resolveInitialTheme();
  applyTheme(initialTheme, { persist: true });
  refreshThemeControls(document);
};

