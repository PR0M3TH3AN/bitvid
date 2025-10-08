import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";

import { Nip71FormManager } from "../js/ui/components/nip71FormManager.js";

function createManagerWithSection(html) {
  const dom = new JSDOM(html);
  const document = dom.window.document;
  const manager = new Nip71FormManager();
  const sectionRoot = document.querySelector("#nip71-section-root");
  manager.registerSection("test", sectionRoot);
  return { manager, document };
}

test("collectSection sanitizes and deduplicates hashtags", () => {
  const { manager } = createManagerWithSection(`
    <form id="nip71-section-root">
      <section data-nip71-repeater="t">
        <div data-nip71-list="t">
          <div data-nip71-entry="t" data-nip71-primary="true">
            <input data-nip71-field="value" value="  #Nostr  " />
          </div>
          <div data-nip71-entry="t">
            <input data-nip71-field="value" value="#nostr" />
          </div>
          <div data-nip71-entry="t">
            <input data-nip71-field="value" value="  #Video  " />
          </div>
        </div>
        <template data-nip71-template="t">
          <div data-nip71-entry="t">
            <input data-nip71-field="value" />
          </div>
        </template>
      </section>
    </form>
  `);

  const collected = manager.collectSection("test");
  assert.deepEqual(collected.hashtags, ["nostr", "video"]);
});

test("hydrateSection renders sanitized hashtags with prefix", () => {
  const { manager, document } = createManagerWithSection(`
    <form id="nip71-section-root">
      <section data-nip71-repeater="t">
        <div data-nip71-list="t">
          <div data-nip71-entry="t" data-nip71-primary="true">
            <input data-nip71-field="value" value="" />
          </div>
        </div>
        <template data-nip71-template="t">
          <div data-nip71-entry="t">
            <input data-nip71-field="value" />
          </div>
        </template>
      </section>
    </form>
  `);

  manager.hydrateSection("test", {
    hashtags: ["  #Nostr  ", "#Nostr", "  #Video  " ],
  });

  const entries = Array.from(
    document.querySelectorAll('[data-nip71-entry="t"]')
  );
  assert.equal(entries.length, 2);
  const values = entries.map((entry) =>
    entry.querySelector('[data-nip71-field="value"]').value
  );
  assert.deepEqual(values, ["#nostr", "#video"]);
});
