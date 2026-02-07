import { describe, it } from "node:test";
import assert from "node:assert/strict";
import "../test-setup.mjs"; // Setup JSDOM
import { escapeHTML, removeTrackingScripts } from "../../js/utils/domUtils.js";

describe("domUtils", () => {
  describe("escapeHTML", () => {
    it("should return empty string for null or undefined", () => {
      assert.equal(escapeHTML(null), "");
      assert.equal(escapeHTML(undefined), "");
    });

    it("should return the string as is if no special characters are present", () => {
      assert.equal(escapeHTML("hello world"), "hello world");
      assert.equal(escapeHTML("12345"), "12345");
    });

    it("should escape special characters", () => {
      assert.equal(escapeHTML("&"), "&amp;");
      assert.equal(escapeHTML("<"), "&lt;");
      assert.equal(escapeHTML(">"), "&gt;");
      assert.equal(escapeHTML('"'), "&quot;");
      assert.equal(escapeHTML("'"), "&#039;");
    });

    it("should escape multiple occurrences of special characters", () => {
      assert.equal(escapeHTML("<script>alert('xss')</script>"), "&lt;script&gt;alert(&#039;xss&#039;)&lt;/script&gt;");
      assert.equal(escapeHTML("foo & bar & baz"), "foo &amp; bar &amp; baz");
    });

    it("should handle mixed content correctly", () => {
      const input = '<div class="test">It\'s me & you</div>';
      const expected = '&lt;div class=&quot;test&quot;&gt;It&#039;s me &amp; you&lt;/div&gt;';
      assert.equal(escapeHTML(input), expected);
    });

    it("should convert non-string inputs to string and escape", () => {
      assert.equal(escapeHTML(123), "123");
      // This behavior depends on String(obj), but let's test a simple object if needed.
      // Ideally escapeHTML expects a string, but the implementation does String(unsafe).
      assert.equal(escapeHTML(true), "true");
    });
  });

  describe("removeTrackingScripts", () => {
    it("should do nothing if root is null or undefined", () => {
      // Should not throw
      removeTrackingScripts(null);
      removeTrackingScripts(undefined);
    });

    it("should do nothing if root has no querySelectorAll", () => {
      removeTrackingScripts({});
    });

    it("should remove scripts matching the tracking pattern", () => {
      const container = document.createElement("div");

      const trackScript = document.createElement("script");
      trackScript.src = "https://example.com/tracking.js";
      container.appendChild(trackScript);

      const trackScript2 = document.createElement("script");
      trackScript2.src = "/tracking.js?id=123";
      container.appendChild(trackScript2);

      const safeScript = document.createElement("script");
      safeScript.src = "https://example.com/app.js";
      container.appendChild(safeScript);

      removeTrackingScripts(container);

      assert.equal(container.querySelectorAll("script").length, 1);
      assert.equal(container.querySelector("script").src, "https://example.com/app.js");
    });

    it("should not remove inline scripts (no src)", () => {
      const container = document.createElement("div");
      const inlineScript = document.createElement("script");
      inlineScript.textContent = "console.log('hello')";
      container.appendChild(inlineScript);

      removeTrackingScripts(container);

      assert.equal(container.querySelectorAll("script").length, 1);
      assert.equal(container.querySelector("script").textContent, "console.log('hello')");
    });

    it("should remove scripts where src ends with tracking.js", () => {
      const container = document.createElement("div");
      const script = document.createElement("script");
      script.src = "http://bad.com/tracking.js";
      container.appendChild(script);

      removeTrackingScripts(container);
      assert.equal(container.querySelectorAll("script").length, 0);
    });

    it("should remove scripts where src contains /tracking.js", () => {
      const container = document.createElement("div");
      const script = document.createElement("script");
      script.src = "http://bad.com/js/tracking.js?v=1";
      container.appendChild(script);

      removeTrackingScripts(container);
      assert.equal(container.querySelectorAll("script").length, 0);
    });
  });
});
