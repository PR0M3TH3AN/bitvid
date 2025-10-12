const STYLE_TAG_ID = "bitvid-style-system";

const sheetRegistry = new WeakMap();
const styleCache = new Map();
const elementClassRegistry = new WeakMap();
const classDefinitionRegistry = new Map();

let classSequence = 0;

function resolveHTMLElementConstructor(documentRef) {
  return (
    documentRef?.defaultView?.HTMLElement ||
    globalThis.HTMLElement ||
    null
  );
}

function isElementCandidate(element) {
  return element && typeof element === "object";
}

function isHTMLElement(element, documentRef) {
  const Constructor = resolveHTMLElementConstructor(documentRef);
  if (!Constructor) {
    return false;
  }
  return element instanceof Constructor;
}

function ensureDocument(element) {
  if (element && element.ownerDocument) {
    return element.ownerDocument;
  }
  if (typeof document !== "undefined") {
    return document;
  }
  return null;
}

function ensureStyleSheet(documentRef) {
  if (!documentRef) {
    return null;
  }

  if (sheetRegistry.has(documentRef)) {
    return sheetRegistry.get(documentRef);
  }

  const root = documentRef.documentElement || documentRef.body;
  const head = documentRef.head || documentRef.getElementsByTagName("head")[0];
  if (!head && root) {
    // If the document does not yet have a <head>, create one so styles attach cleanly.
    const createdHead = documentRef.createElement("head");
    documentRef.insertBefore(createdHead, root);
  }

  const container = documentRef.getElementById(STYLE_TAG_ID);
  const StyleElementConstructor =
    documentRef.defaultView?.HTMLStyleElement ||
    globalThis.HTMLStyleElement ||
    null;
  const isStyleElement =
    (StyleElementConstructor && container instanceof StyleElementConstructor) ||
    (!StyleElementConstructor && container?.tagName === "STYLE");
  const styleElement = isStyleElement
    ? container
    : documentRef.createElement("style");

  styleElement.type = "text/css";
  styleElement.id = STYLE_TAG_ID;

  if (!styleElement.parentNode) {
    (documentRef.head || documentRef.documentElement)?.appendChild(styleElement);
  }

  const sheet = styleElement.sheet;
  sheetRegistry.set(documentRef, sheet);
  return sheet;
}

function toCssPropertyName(property) {
  if (!property) {
    return "";
  }
  if (property.startsWith("--")) {
    return property;
  }
  return property
    .replace(/([A-Z])/g, "-$1")
    .replace(/_/g, "-")
    .toLowerCase();
}

function serializeStyleObject(styleObject) {
  return Object.keys(styleObject)
    .sort()
    .map((key) => `${key}:${String(styleObject[key])}`)
    .join(";");
}

function createCssRule(styleObject) {
  return Object.keys(styleObject)
    .sort()
    .map((key) => `${toCssPropertyName(key)}: ${styleObject[key]};`)
    .join(" ");
}

function getSlotKey(slot) {
  if (!slot) {
    return "default";
  }
  return String(slot);
}

export function applyDynamicStyles(element, styleObject = {}, options = {}) {
  if (!isElementCandidate(element)) {
    return null;
  }

  const doc = ensureDocument(element);
  if (!doc || !isHTMLElement(element, doc)) {
    return null;
  }

  const entries = Object.entries(styleObject).filter(([, value]) => value !== null && value !== undefined);
  if (!entries.length) {
    return null;
  }

  const normalized = entries.reduce((acc, [key, value]) => {
    acc[key] = value;
    return acc;
  }, {});

  const sheet = ensureStyleSheet(doc);
  if (!sheet) {
    return null;
  }

  const cacheKey = serializeStyleObject(normalized);
  let className = styleCache.get(cacheKey);
  if (!className) {
    classSequence += 1;
    className = `bvds-${classSequence.toString(36)}`;
    const cssRule = createCssRule(normalized);
    try {
      sheet.insertRule(`.${className} { ${cssRule} }`, sheet.cssRules.length);
    } catch (error) {
      console.warn("Failed to insert dynamic style", { cssRule, error });
      return null;
    }
    styleCache.set(cacheKey, className);
    classDefinitionRegistry.set(className, { ...normalized });
  }

  let slotRegistry = elementClassRegistry.get(element);
  if (!slotRegistry) {
    slotRegistry = new Map();
    elementClassRegistry.set(element, slotRegistry);
  }

  const slot = getSlotKey(options.slot);
  const previousClass = slotRegistry.get(slot);
  if (previousClass && previousClass !== className) {
    element.classList.remove(previousClass);
  }

  if (!element.classList.contains(className)) {
    element.classList.add(className);
  }

  slotRegistry.set(slot, className);
  return className;
}

export function removeDynamicStyles(element, options = {}) {
  if (!isElementCandidate(element)) {
    return;
  }

  const doc = ensureDocument(element);
  if (!doc || !isHTMLElement(element, doc)) {
    return;
  }

  const slot = getSlotKey(options.slot);
  const slotRegistry = elementClassRegistry.get(element);
  if (!slotRegistry) {
    return;
  }

  const className = slotRegistry.get(slot);
  if (className) {
    element.classList.remove(className);
    slotRegistry.delete(slot);
  }

  if (!slotRegistry.size) {
    elementClassRegistry.delete(element);
  }
}

export function clearAllDynamicStyles(element) {
  if (!isElementCandidate(element)) {
    return;
  }

  const doc = ensureDocument(element);
  if (!doc || !isHTMLElement(element, doc)) {
    return;
  }

  const slotRegistry = elementClassRegistry.get(element);
  if (!slotRegistry) {
    return;
  }

  for (const className of slotRegistry.values()) {
    element.classList.remove(className);
  }

  elementClassRegistry.delete(element);
}

export function getAppliedDynamicStyles(element, options = {}) {
  if (!isElementCandidate(element)) {
    return null;
  }

  const doc = ensureDocument(element);
  if (!doc || !isHTMLElement(element, doc)) {
    return null;
  }

  const slot = getSlotKey(options.slot);
  const slotRegistry = elementClassRegistry.get(element);
  if (!slotRegistry) {
    return null;
  }

  const className = slotRegistry.get(slot);
  if (!className) {
    return null;
  }

  const definition = classDefinitionRegistry.get(className);
  if (!definition) {
    return null;
  }

  return { ...definition };
}

