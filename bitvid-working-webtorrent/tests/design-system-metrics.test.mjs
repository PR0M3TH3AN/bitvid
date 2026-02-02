import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import {
  readDesignTokenAsPixels,
} from "../js/designSystem/metrics.js";

function getScopeRule(document, scopeId) {
  const styleEl = document.querySelector('style[data-ds-dynamic="true"]');
  const rules = [];
  if (styleEl?.sheet?.cssRules) {
    rules.push(...Array.from(styleEl.sheet.cssRules));
  }
  const adoptedSheets = document.adoptedStyleSheets;
  if (Array.isArray(adoptedSheets)) {
    for (const sheet of adoptedSheets) {
      if (sheet?.cssRules) {
        rules.push(...Array.from(sheet.cssRules));
      }
    }
  }
  return rules.find((cssRule) => cssRule.selectorText === `[data-ds-style-id="${scopeId}"]`) || null;
}

test("metric probe falls back to numeric parsing when measurement fails", () => {
  const dom = new JSDOM(`<!doctype html><html><head></head><body></body></html>`, {
    pretendToBeVisual: true,
  });
  const { document } = dom.window;

  Object.defineProperty(dom.window.HTMLDivElement.prototype, "offsetHeight", {
    configurable: true,
    get() {
      return Number.parseFloat(this.dataset.mockHeight || "0");
    },
  });

  const rootStyle = document.documentElement["style"];
  rootStyle?.setProperty("--probe-test", "12q");
  const fallback = readDesignTokenAsPixels("--probe-test", { documentRef: document });
  assert.equal(fallback, 12);

  const probe = document.querySelector(".ds-metric-probe");
  assert.ok(probe, "probe element should be created");
  const scopeId = probe.getAttribute("data-ds-style-id");
  assert.ok(scopeId, "probe should be registered with a dynamic scope");
  probe.dataset.mockHeight = "48";

  const initialRule = getScopeRule(document, scopeId);
  assert.ok(initialRule, "metric probe should have a dynamic rule");

  rootStyle?.setProperty("--probe-test", "3vh");
  const measured = readDesignTokenAsPixels("--probe-test", { documentRef: document });
  assert.equal(measured, 48);

  const rule = getScopeRule(document, scopeId);
  assert.ok(rule, "metric probe rule should persist");
  const ruleStyle = rule ? rule["style"] : null;
  assert.ok(ruleStyle, "probe rule should expose a CSSStyleDeclaration");
  assert.equal(ruleStyle.getPropertyValue("--ds-metric-probe-length"), "0");
});
