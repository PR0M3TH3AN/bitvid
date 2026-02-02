import { THEME_ACCENT_OVERRIDES } from "../../config/instance-config.js";

(() => {
  const VALID_THEMES = new Set(["light", "dark"]);
  const STORAGE_KEY = "bitvid:theme";
  const FALLBACK_THEME = "dark";
  const ACCENT_CSS_VARIABLES = Object.freeze({
    accent: "--color-accent",
    accentStrong: "--color-accent-strong",
    accentPressed: "--color-accent-pressed",
  });
  const ACCENT_TOKENS = Object.keys(ACCENT_CSS_VARIABLES);
  const { documentElement: root } = document;

  if (!(root instanceof HTMLElement)) {
    return;
  }

  const sanitizeConfigOverrides = (overrides) => {
    if (!overrides || typeof overrides !== "object") {
      return {};
    }

    const sanitized = {};

    Object.entries(overrides).forEach(([theme, themeOverrides]) => {
      if (!VALID_THEMES.has(theme) || typeof themeOverrides !== "object") {
        return;
      }

      const normalized = {};

      ACCENT_TOKENS.forEach((token) => {
        const value = themeOverrides[token];
        if (typeof value === "string") {
          const trimmed = value.trim();
          if (trimmed !== "") {
            normalized[token] = trimmed;
          }
        }
      });

      if (Object.keys(normalized).length > 0) {
        sanitized[theme] = normalized;
      }
    });

    return sanitized;
  };

  const CONFIG_ACCENT_OVERRIDES = sanitizeConfigOverrides(
    THEME_ACCENT_OVERRIDES
  );

  const normalizeTheme = (value) => {
    if (typeof value !== "string") {
      return null;
    }
    const normalized = value.trim().toLowerCase();
    if (normalized === "" || normalized === "default") {
      return FALLBACK_THEME;
    }
    return VALID_THEMES.has(normalized) ? normalized : null;
  };

  const getParentRoot = () => {
    try {
      if (window.parent && window.parent !== window) {
        const parentDocument = window.parent.document;
        const parentRoot = parentDocument?.documentElement;
        return parentRoot instanceof HTMLElement ? parentRoot : null;
      }
    } catch (error) {
      return null;
    }
    return null;
  };

  const readParentTheme = () => {
    const parentRoot = getParentRoot();
    if (!parentRoot) {
      return null;
    }
    return normalizeTheme(parentRoot.dataset?.theme);
  };

  const readStoredTheme = () => {
    try {
      return normalizeTheme(window.localStorage.getItem(STORAGE_KEY));
    } catch (error) {
      return null;
    }
  };

  const applyTheme = (theme) => {
    if (theme && VALID_THEMES.has(theme)) {
      root.dataset.theme = theme;
    } else {
      root.removeAttribute("data-theme");
    }
  };

  const readAccentValues = (element) => {
    if (!element) {
      return null;
    }

    let styles;

    try {
      styles = getComputedStyle(element);
    } catch (error) {
      return null;
    }

    const values = {};
    let hasValue = false;

    Object.values(ACCENT_CSS_VARIABLES).forEach((cssVariable) => {
      const rawValue = styles.getPropertyValue(cssVariable);
      if (typeof rawValue === "string") {
        const trimmed = rawValue.trim();
        values[cssVariable] = trimmed;
        if (trimmed !== "") {
          hasValue = true;
        }
      }
    });

    return hasValue ? values : null;
  };

  const readParentAccentOverrides = () => {
    const parentRoot = getParentRoot();
    if (!parentRoot) {
      return null;
    }
    return readAccentValues(parentRoot);
  };

  const readDefaultAccentValues = (theme) => {
    const previousAccent = root.dataset.themeAccent;
    const previousTheme = root.dataset.theme;

    root.removeAttribute("data-theme-accent");
    if (theme && VALID_THEMES.has(theme)) {
      root.dataset.theme = theme;
    }

    const values = readAccentValues(root);

    if (previousAccent) {
      root.dataset.themeAccent = previousAccent;
    } else {
      root.removeAttribute("data-theme-accent");
    }

    if (previousTheme) {
      root.dataset.theme = previousTheme;
    } else {
      root.removeAttribute("data-theme");
    }

    return values;
  };

  const hasConfiguredAccentOverrides = (theme) => {
    const configOverrides = CONFIG_ACCENT_OVERRIDES[theme];
    if (!configOverrides || typeof configOverrides !== "object") {
      return false;
    }

    return ACCENT_TOKENS.some((token) => {
      const value = configOverrides[token];
      return typeof value === "string" && value.trim() !== "";
    });
  };

  const hasAccentOverrides = (parentOverrides, defaultValues) => {
    if (!parentOverrides || !defaultValues) {
      return false;
    }

    return Object.values(ACCENT_CSS_VARIABLES).some((cssVariable) => {
      const parentValue = parentOverrides[cssVariable];
      const defaultValue = defaultValues[cssVariable];
      return parentValue && parentValue !== defaultValue;
    });
  };

  const applyAccentOverrides = (theme) => {
    const parentRoot = getParentRoot();
    const parentAccentState = parentRoot?.dataset?.themeAccent || "";
    const configOverrides = hasConfiguredAccentOverrides(theme);
    const parentOverrides =
      parentAccentState === "override"
        ? true
        : hasAccentOverrides(
            readParentAccentOverrides(),
            readDefaultAccentValues(theme)
          );

    if (parentOverrides || configOverrides) {
      root.dataset.themeAccent = "override";
    } else {
      root.removeAttribute("data-theme-accent");
    }
  };

  const syncTheme = () => {
    const resolvedTheme =
      readParentTheme() ?? readStoredTheme() ?? FALLBACK_THEME;
    applyTheme(resolvedTheme);
    applyAccentOverrides(resolvedTheme);
  };

  syncTheme();

  const parentRoot = getParentRoot();
  let observer;

  if (parentRoot && typeof MutationObserver !== "undefined") {
    observer = new MutationObserver(syncTheme);
    observer.observe(parentRoot, {
      attributes: true,
      attributeFilter: ["data-theme", "style"],
    });
  }

  window.addEventListener("storage", (event) => {
    if (event?.key === STORAGE_KEY) {
      syncTheme();
    }
  });

  window.addEventListener(
    "pageshow",
    () => {
      syncTheme();
    },
    { once: true }
  );

  window.addEventListener(
    "beforeunload",
    () => {
      if (observer) {
        observer.disconnect();
      }
    },
    { once: true }
  );
})();
