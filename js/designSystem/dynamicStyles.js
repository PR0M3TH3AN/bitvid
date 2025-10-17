const DATA_ATTRIBUTE = "data-ds-style-id";

const DEFAULT_SELECTOR = ":scope";

const SCOPE_REGISTRY = new Map();
const DOCUMENT_MANAGERS = new WeakMap();

function sanitizeScopeId(baseId) {
  if (typeof baseId !== "string") {
    return "ds-scope";
  }
  const trimmed = baseId.trim();
  if (!trimmed) {
    return "ds-scope";
  }
  const normalized = trimmed.replace(/[^a-zA-Z0-9_-]+/g, "-");
  return normalized || "ds-scope";
}

function resolveDocument(documentRef) {
  if (documentRef && typeof documentRef === "object" && documentRef.nodeType === 9) {
    return documentRef;
  }
  if (typeof globalThis.document === "object" && globalThis.document?.nodeType === 9) {
    return globalThis.document;
  }
  return null;
}

function supportsConstructableStylesheets(doc) {
  return (
    !!doc &&
    Array.isArray(doc.adoptedStyleSheets) &&
    typeof doc.adoptedStyleSheets.splice === "function" &&
    typeof globalThis.CSSStyleSheet === "function"
  );
}

function ensureManager(doc) {
  if (!doc) {
    return null;
  }
  let manager = DOCUMENT_MANAGERS.get(doc);
  if (manager) {
    return manager;
  }

  let sheet = null;
  let styleElement = null;
  const constructable = supportsConstructableStylesheets(doc);

  if (constructable) {
    sheet = new globalThis.CSSStyleSheet();
    try {
      doc.adoptedStyleSheets = [...doc.adoptedStyleSheets, sheet];
    } catch (error) {
      // Fall back to a <style> element if adoption fails at runtime.
      sheet = null;
    }
  }

  if (!sheet) {
    styleElement = doc.createElement("style");
    styleElement.setAttribute("data-ds-dynamic", "true");
    doc.head?.appendChild(styleElement);
    sheet = styleElement.sheet || null;
  }

  manager = {
    document: doc,
    sheet,
    styleElement,
    counter: 0,
    scopes: new Map(),
  };
  DOCUMENT_MANAGERS.set(doc, manager);
  return manager;
}

function generateScopeId(baseId, manager) {
  const prefix = sanitizeScopeId(baseId);
  if (!SCOPE_REGISTRY.has(prefix) && !manager.scopes.has(prefix)) {
    return prefix;
  }
  let suffix = 1;
  let candidate = `${prefix}-${suffix}`;
  while (SCOPE_REGISTRY.has(candidate) || manager.scopes.has(candidate)) {
    suffix += 1;
    candidate = `${prefix}-${suffix}`;
  }
  return candidate;
}

function buildSelector(scopeId, selector) {
  const token = `[${DATA_ATTRIBUTE}="${scopeId}"]`;
  if (typeof selector !== "string" || !selector.trim()) {
    return token;
  }
  if (selector.includes("&")) {
    return selector.replace(/&/g, token);
  }
  if (selector.includes(":scope")) {
    return selector.replace(/:scope/g, token);
  }
  const trimmed = selector.trim();
  if (/^[>+~]/.test(trimmed)) {
    return `${token}${trimmed}`;
  }
  return `${token} ${trimmed}`;
}

function insertEmptyRule(sheet, selectorText) {
  if (!sheet || typeof sheet.insertRule !== "function") {
    return null;
  }
  try {
    const index = sheet.insertRule(`${selectorText} {}`, sheet.cssRules.length);
    return sheet.cssRules[index] || null;
  } catch (error) {
    return null;
  }
}

function findRuleIndex(sheet, rule) {
  if (!sheet || !rule) {
    return -1;
  }
  const { cssRules } = sheet;
  for (let index = 0; index < cssRules.length; index += 1) {
    if (cssRules[index] === rule) {
      return index;
    }
  }
  return -1;
}

function normalizeSelectors(selectors) {
  if (!Array.isArray(selectors)) {
    return [DEFAULT_SELECTOR];
  }
  const filtered = selectors
    .map((selector) => (typeof selector === "string" ? selector.trim() : ""))
    .filter((selector) => selector !== "");
  if (filtered.length === 0) {
    return [DEFAULT_SELECTOR];
  }
  return filtered;
}

export function registerScope(baseId, selectors = [DEFAULT_SELECTOR], options = {}) {
  const doc = resolveDocument(options.documentRef);
  const manager = ensureManager(doc);
  if (!manager || !manager.sheet) {
    return null;
  }

  const scopeId = generateScopeId(baseId, manager);
  const normalizedSelectors = normalizeSelectors(selectors);
  const records = [];

  for (const selector of normalizedSelectors) {
    const selectorText = buildSelector(scopeId, selector);
    const rule = insertEmptyRule(manager.sheet, selectorText);
    if (rule) {
      records.push({ selector, rule });
    }
  }

  const scopeRecord = {
    id: scopeId,
    manager,
    rules: records,
  };

  manager.scopes.set(scopeId, scopeRecord);
  SCOPE_REGISTRY.set(scopeId, scopeRecord);

  return scopeId;
}

function normalizeVariableValue(value) {
  if (value === undefined || value === null) {
    return "";
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return `${value}`;
  }
  if (typeof value === "string") {
    return value.trim();
  }
  return "";
}

export function setVariables(scopeId, variables = {}, { selector = DEFAULT_SELECTOR } = {}) {
  if (!scopeId || typeof variables !== "object" || variables === null) {
    return false;
  }
  const scope = SCOPE_REGISTRY.get(scopeId);
  if (!scope || !scope.manager?.sheet) {
    return false;
  }

  const targetRecord = scope.rules.find((record) => record.selector === selector) ||
    scope.rules.find((record) => record.selector === DEFAULT_SELECTOR);

  if (!targetRecord) {
    return false;
  }

  const rule = targetRecord.rule;
  const ruleStyle = rule ? rule["style"] : null;
  if (!ruleStyle) {
    return false;
  }

  let didUpdate = false;
  for (const [name, rawValue] of Object.entries(variables)) {
    if (typeof name !== "string" || !name.trim().startsWith("--")) {
      continue;
    }
    const value = normalizeVariableValue(rawValue);
    if (value) {
      ruleStyle.setProperty(name.trim(), value);
    } else {
      ruleStyle.removeProperty(name.trim());
    }
    didUpdate = true;
  }

  return didUpdate;
}

export function releaseScope(scopeId) {
  if (!scopeId) {
    return false;
  }
  const scope = SCOPE_REGISTRY.get(scopeId);
  if (!scope || !scope.manager?.sheet) {
    return false;
  }

  const { sheet } = scope.manager;
  let removed = false;

  for (const record of scope.rules) {
    const rule = record.rule;
    if (!rule) {
      continue;
    }
    const index = findRuleIndex(sheet, rule);
    if (index >= 0) {
      try {
        sheet.deleteRule(index);
        removed = true;
      } catch (error) {
        // Ignore deletion failures.
      }
    }
  }

  scope.manager.scopes.delete(scopeId);
  SCOPE_REGISTRY.delete(scopeId);

  return removed;
}

export function getScopeAttributeName() {
  return DATA_ATTRIBUTE;
}

export default {
  registerScope,
  setVariables,
  releaseScope,
  getScopeAttributeName,
};
