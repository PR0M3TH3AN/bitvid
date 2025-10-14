const TOKEN_FALLBACKS = {
  "--grid-card-min-width": "20rem",
  "--popover-backdrop-blur": "12px",
  "--toast-translate": "0.75rem",
  "--sidebar-mobile-gutter": "3rem",
  "--popup-padding-inline": "1rem",
  "--popup-padding-block": "0.75rem",
};

function resolveDocument(documentRef) {
  if (documentRef && typeof documentRef === "object") {
    return documentRef;
  }
  return typeof globalThis.document === "object" ? globalThis.document : null;
}

function readComputedStyle(documentRef) {
  const doc = resolveDocument(documentRef);
  if (!doc || !doc.documentElement) {
    return null;
  }
  const view = doc.defaultView || globalThis;
  if (!view || typeof view.getComputedStyle !== "function") {
    return null;
  }
  try {
    return view.getComputedStyle(doc.documentElement);
  } catch (error) {
    return null;
  }
}

function readTokenFallback(tokenName) {
  const fallback = TOKEN_FALLBACKS[tokenName];
  return typeof fallback === "string" ? fallback : "";
}

function sanitizeTokenName(tokenName) {
  return typeof tokenName === "string" && tokenName.trim().startsWith("--")
    ? tokenName.trim()
    : "";
}

function normalizeTokenValue(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function readDesignToken(tokenName, { documentRef } = {}) {
  const token = sanitizeTokenName(tokenName);
  if (!token) {
    return "";
  }

  const doc = resolveDocument(documentRef);
  const computed = readComputedStyle(doc);
  if (computed) {
    const computedValue = normalizeTokenValue(computed.getPropertyValue(token));
    if (computedValue) {
      return computedValue;
    }
  }

  if (doc?.documentElement?.style) {
    const inlineValue = normalizeTokenValue(
      doc.documentElement.style.getPropertyValue(token),
    );
    if (inlineValue) {
      return inlineValue;
    }
  }

  return readTokenFallback(token);
}

function parsePixelValue(value) {
  const numeric = Number.parseFloat(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function convertLengthToPixels(value, documentRef) {
  const raw = normalizeTokenValue(value);
  if (!raw) {
    return 0;
  }

  if (/^-?\d*\.?\d+px$/i.test(raw)) {
    return parsePixelValue(raw);
  }

  if (/^-?\d*\.?\d+rem$/i.test(raw)) {
    const rem = parsePixelValue(raw);
    const doc = resolveDocument(documentRef);
    let base = 16;
    const view = doc?.defaultView || globalThis;
    if (doc?.documentElement && view && typeof view.getComputedStyle === "function") {
      try {
        const computed = view.getComputedStyle(doc.documentElement);
        const fontSize = normalizeTokenValue(computed?.fontSize || "");
        const parsed = parsePixelValue(fontSize);
        if (parsed > 0) {
          base = parsed;
        }
      } catch (error) {
        // Ignore computed style errors and fall back to defaults.
      }
    }
    return rem * base;
  }

  const doc = resolveDocument(documentRef);
  if (doc?.createElement && doc?.body) {
    try {
      const probe = doc.createElement("div");
      probe.style.position = "absolute";
      probe.style.visibility = "hidden";
      probe.style.width = "0";
      probe.style.height = raw;
      doc.body.appendChild(probe);
      const measured = probe.offsetHeight;
      doc.body.removeChild(probe);
      if (Number.isFinite(measured)) {
        return measured;
      }
    } catch (error) {
      // Ignore measurement errors and fall through to numeric parsing.
    }
  }

  return parsePixelValue(raw);
}

export function readDesignTokenAsPixels(tokenName, options = {}) {
  const raw = readDesignToken(tokenName, options);
  return convertLengthToPixels(raw, options.documentRef);
}

export function getGridCardMinWidth(options = {}) {
  return readDesignToken("--grid-card-min-width", options);
}

export function getGridCardMinWidthPx(options = {}) {
  return readDesignTokenAsPixels("--grid-card-min-width", options);
}

export function getPopoverBackdropBlur(options = {}) {
  return readDesignToken("--popover-backdrop-blur", options);
}

export function getToastTranslate(options = {}) {
  return readDesignToken("--toast-translate", options);
}

export function getToastTranslatePx(options = {}) {
  return readDesignTokenAsPixels("--toast-translate", options);
}

export function getSidebarMobileGutter(options = {}) {
  return readDesignToken("--sidebar-mobile-gutter", options);
}

export function getSidebarMobileGutterPx(options = {}) {
  return readDesignTokenAsPixels("--sidebar-mobile-gutter", options);
}

export function getPopupPaddingInline(options = {}) {
  return readDesignToken("--popup-padding-inline", options);
}

export function getPopupPaddingInlinePx(options = {}) {
  return readDesignTokenAsPixels("--popup-padding-inline", options);
}

export function getPopupPaddingBlock(options = {}) {
  return readDesignToken("--popup-padding-block", options);
}

export function getPopupPaddingBlockPx(options = {}) {
  return readDesignTokenAsPixels("--popup-padding-block", options);
}

export function getPopupOffsetPx(options = {}) {
  const inlinePadding = getPopupPaddingInlinePx(options);
  return inlinePadding > 0 ? inlinePadding / 2 : 0;
}

export function getPopupViewportPaddingPx(options = {}) {
  return getPopupPaddingInlinePx(options);
}

export const designMetrics = {
  readDesignToken,
  readDesignTokenAsPixels,
  getGridCardMinWidth,
  getGridCardMinWidthPx,
  getPopoverBackdropBlur,
  getToastTranslate,
  getToastTranslatePx,
  getSidebarMobileGutter,
  getSidebarMobileGutterPx,
  getPopupPaddingInline,
  getPopupPaddingInlinePx,
  getPopupPaddingBlock,
  getPopupPaddingBlockPx,
  getPopupOffsetPx,
  getPopupViewportPaddingPx,
};

export default designMetrics;
