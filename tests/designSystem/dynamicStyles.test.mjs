import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import {
  registerScope,
  setVariables,
  releaseScope,
  getScopeAttributeName
} from '../../js/designSystem/dynamicStyles.js';

describe('js/designSystem/dynamicStyles.js', () => {
  let dom;
  let document;
  let window;
  let originalCSSStyleSheet;

  beforeEach(() => {
    dom = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>', {
      url: 'http://localhost/',
      pretendToBeVisual: true,
    });
    window = dom.window;
    document = window.document;

    originalCSSStyleSheet = globalThis.CSSStyleSheet;
    // Polyfill global CSSStyleSheet for constructable stylesheets support if needed
    // JSDOM supports it, but we need to expose it globally for the module to detect it
    if (!globalThis.CSSStyleSheet) {
        globalThis.CSSStyleSheet = window.CSSStyleSheet;
    }
  });

  afterEach(() => {
    // Clean up
    dom = null;
    document = null;
    window = null;
    globalThis.CSSStyleSheet = originalCSSStyleSheet;
  });

  describe('registerScope', () => {
    it('should register a scope and return a string ID', () => {
      const scopeId = registerScope('test-scope', [], { documentRef: document });
      assert.equal(typeof scopeId, 'string');
      assert.ok(scopeId.startsWith('test-scope'));
    });

    it('should create a style element or use adoptedStyleSheets', () => {
      const scopeId = registerScope('test-scope', [], { documentRef: document });

      // Check for style element fallback or adoptedStyleSheets
      const styleElement = document.querySelector('style[data-ds-dynamic="true"]');
      const adopted = document.adoptedStyleSheets && document.adoptedStyleSheets.length > 0;

      assert.ok(styleElement || adopted, 'Should use either <style> or adoptedStyleSheets');
    });

    it('should insert rules with the correct selector', () => {
      const scopeId = registerScope('test-scope', [':scope', '.child'], { documentRef: document });
      const attr = getScopeAttributeName();

      // Helper to find rule
      const findRule = (selectorPart) => {
        // Check style element
        const styleElement = document.querySelector('style[data-ds-dynamic="true"]');
        if (styleElement && styleElement.sheet) {
          for (const rule of styleElement.sheet.cssRules) {
            if (rule.selectorText.includes(selectorPart)) return rule;
          }
        }
        // Check adopted sheets
        if (document.adoptedStyleSheets) {
          for (const sheet of document.adoptedStyleSheets) {
            for (const rule of sheet.cssRules) {
              if (rule.selectorText.includes(selectorPart)) return rule;
            }
          }
        }
        return null;
      };

      const scopeSelector = `[${attr}="${scopeId}"]`;
      assert.ok(findRule(scopeSelector), 'Should have rule for :scope');
      assert.ok(findRule(`${scopeSelector} .child`), 'Should have rule for .child');
    });

    it('should handle "&" in selectors', () => {
      const scopeId = registerScope('amp-test', ['&.active'], { documentRef: document });
      const attr = getScopeAttributeName();
      const expectedSelector = `[${attr}="${scopeId}"].active`;

      // Verify rule existence
      let found = false;
      const checkSheet = (sheet) => {
        for (const rule of sheet.cssRules) {
            // Note: selectorText might be normalized by JSDOM/browser
            if (rule.selectorText === expectedSelector) found = true;
        }
      };

      const styleElement = document.querySelector('style[data-ds-dynamic="true"]');
      if (styleElement?.sheet) checkSheet(styleElement.sheet);
      if (document.adoptedStyleSheets) document.adoptedStyleSheets.forEach(checkSheet);

      assert.ok(found, `Rule for ${expectedSelector} should be found`);
    });
  });

  describe('setVariables', () => {
    it('should update CSS variables on the scope', () => {
      const scopeId = registerScope('var-test', [], { documentRef: document });
      const vars = { '--color': 'red', '--size': '10px' };

      const success = setVariables(scopeId, vars);
      assert.equal(success, true, 'setVariables should return true');

      // Verify style property
      // We need to access the rule.
      // Since we can't easily export the internal registry, we inspect the DOM/OM.

      let ruleStyle = null;
       const checkSheet = (sheet) => {
        for (const rule of sheet.cssRules) {
             if (rule.selectorText.includes(scopeId)) {
                 ruleStyle = rule['style'];
             }
        }
      };

      const styleElement = document.querySelector('style[data-ds-dynamic="true"]');
      if (styleElement?.sheet) checkSheet(styleElement.sheet);
      if (document.adoptedStyleSheets) document.adoptedStyleSheets.forEach(checkSheet);

      assert.ok(ruleStyle, 'Rule style should be accessible');
      assert.equal(ruleStyle.getPropertyValue('--color'), 'red');
      assert.equal(ruleStyle.getPropertyValue('--size'), '10px');
    });

    it('should handle removing variables', () => {
      const scopeId = registerScope('var-remove', [], { documentRef: document });
      setVariables(scopeId, { '--temp': '123' });

      setVariables(scopeId, { '--temp': null });

      let ruleStyle = null;
      // ... find rule style again (reuse helper logic ideally)
       const checkSheet = (sheet) => {
        for (const rule of sheet.cssRules) {
             if (rule.selectorText.includes(scopeId)) {
                 ruleStyle = rule['style'];
             }
        }
      };
      const styleElement = document.querySelector('style[data-ds-dynamic="true"]');
      if (styleElement?.sheet) checkSheet(styleElement.sheet);
      if (document.adoptedStyleSheets) document.adoptedStyleSheets.forEach(checkSheet);

      assert.equal(ruleStyle.getPropertyValue('--temp'), '');
    });
  });

  describe('releaseScope', () => {
    it('should remove rules and clean up', () => {
      const scopeId = registerScope('release-test', [], { documentRef: document });

      // Verify exists
      let foundBefore = false;
      const checkSheet = (sheet) => {
        for (const rule of sheet.cssRules) {
             if (rule.selectorText.includes(scopeId)) foundBefore = true;
        }
      };
      const styleElement = document.querySelector('style[data-ds-dynamic="true"]');
      if (styleElement?.sheet) checkSheet(styleElement.sheet);
      if (document.adoptedStyleSheets) document.adoptedStyleSheets.forEach(checkSheet);
      assert.ok(foundBefore, 'Rule should exist before release');

      const released = releaseScope(scopeId);
      assert.equal(released, true, 'releaseScope should return true');

      // Verify removed
      let foundAfter = false;
      const checkSheetAfter = (sheet) => {
        for (const rule of sheet.cssRules) {
             if (rule.selectorText.includes(scopeId)) foundAfter = true;
        }
      };
      if (styleElement?.sheet) checkSheetAfter(styleElement.sheet);
      if (document.adoptedStyleSheets) document.adoptedStyleSheets.forEach(checkSheetAfter);

      assert.equal(foundAfter, false, 'Rule should be removed after release');
    });

    it('should return false for non-existent scope', () => {
      const result = releaseScope('non-existent-scope');
      assert.equal(result, false);
    });
  });

  describe('Isolation', () => {
    it('should manage scopes independently for different documents', () => {
      const dom2 = new JSDOM('<!DOCTYPE html><html><body></body></html>');
      const doc2 = dom2.window.document;
      // Polyfill if needed for doc2 environment
      // But since we run in Node, global CSSStyleSheet is shared if we set it on globalThis.

      const id1 = registerScope('iso', [], { documentRef: document });
      const id2 = registerScope('iso', [], { documentRef: doc2 });

      // They might get different IDs because registerScope checks global SCOPE_REGISTRY.
      // But we just want to ensure they don't crash and rules are in respective docs.

      // Check doc1
      const style1 = document.querySelector('style[data-ds-dynamic="true"]');
      const adopted1 = document.adoptedStyleSheets?.length > 0;
      assert.ok(style1 || adopted1, 'Doc1 should have styles');

      // Check doc2
      const style2 = doc2.querySelector('style[data-ds-dynamic="true"]');
      const adopted2 = doc2.adoptedStyleSheets?.length > 0;
      assert.ok(style2 || adopted2, 'Doc2 should have styles');

      // Clean up
      releaseScope(id1);
      releaseScope(id2);
    });
  });

  describe('Edge cases', () => {
      it('should handle invalid selectors gracefully', () => {
          // It might just produce invalid CSS which insertRule might throw or ignore.
          // dynamicStyles.js catches errors in insertEmptyRule.
          const scopeId = registerScope('invalid', ['::::invalid'], { documentRef: document });
          assert.equal(typeof scopeId, 'string');
          // No crash
      });

      it('should handle missing document gracefully', () => {
         // Passing null documentRef, falls back to global document.
         // In test env, global document might be undefined unless set.
         // If undefined, ensureManager returns null.
         // registerScope returns null.

         // Temporarily hide global document if it exists
         const originalDoc = globalThis.document;
         delete globalThis.document;

         const result = registerScope('no-doc', [], { documentRef: null });
         assert.equal(result, null);

         globalThis.document = originalDoc;
      });

      it('should fallback to <style> element if CSSStyleSheet is missing', () => {
        // Unset CSSStyleSheet to force fallback
        globalThis.CSSStyleSheet = undefined;
        // Also ensure JSDOM instance simulates lack of support if possible?
        // dynamicStyles.js checks globalThis.CSSStyleSheet.

        // We need a fresh document because ensureManager caches the manager per document.
        const domFallback = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>');
        const docFallback = domFallback.window.document;

        const scopeId = registerScope('fallback', [], { documentRef: docFallback });
        assert.ok(scopeId);

        const styleElement = docFallback.querySelector('style[data-ds-dynamic="true"]');
        assert.ok(styleElement, 'Should use <style> element');
        assert.ok(styleElement.sheet, 'Style element should have a sheet');
        // adoptedStyleSheets should not be used (or empty/not modified by us)
        const adopted = docFallback.adoptedStyleSheets;
        // JSDOM might initialize it as empty array.
        // We just ensure we found the style element.
      });
  });
});
