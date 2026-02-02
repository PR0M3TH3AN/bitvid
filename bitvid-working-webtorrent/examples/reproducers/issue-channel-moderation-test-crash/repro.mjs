import { JSDOM } from "jsdom";
import "../../../tests/test-helpers/setup-localstorage.mjs";

// Mock globals for Application load
const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>", {
  url: "https://example.com",
});
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.HTMLElement = dom.window.HTMLElement;
// Override WebSocket if setup-localstorage didn't do it or if we need a close method
globalThis.WebSocket = class { close() {} };

// Import Application
const { Application } = await import("../../../js/app.js");

console.log("Creating Application instance bypassing constructor...");
// This replicates what createModerationAppHarness does in tests/helpers/moderation-test-helpers.mjs
const app = Object.create(Application.prototype);

// Attempt to call decorateVideoModeration which relies on this.moderationDecorator
// initialized in constructor.
try {
  console.log("Attempting to call decorateVideoModeration...");
  app.decorateVideoModeration({});
  console.log("FAIL: decorateVideoModeration did not throw.");
  process.exit(1);
} catch (error) {
  if (error instanceof TypeError && error.message.includes("decorateVideo")) {
    console.log("SUCCESS: Caught expected error:", error.message);
    process.exit(0); // Exit success
  } else {
    console.log("FAIL: Caught unexpected error:", error);
    process.exit(1);
  }
}
