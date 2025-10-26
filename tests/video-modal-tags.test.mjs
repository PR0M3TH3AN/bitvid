import test from "node:test";
import assert from "node:assert/strict";

import { setupModal } from "./video-modal-accessibility.test.mjs";

test("VideoModal renders tag metadata and toggles visibility", async (t) => {
  const { document, modal, cleanup } = await setupModal();
  t.after(() => {
    cleanup();
  });

  const tagsRoot = document.getElementById("videoTags");
  assert.ok(tagsRoot, "#videoTags element should exist");
  assert.strictEqual(tagsRoot.getAttribute("aria-hidden"), "true");
  assert.ok(tagsRoot.hasAttribute("hidden"));

  modal.updateMetadata({ tags: ["nostr", "Bitvid", "alpha"] });

  assert.strictEqual(tagsRoot.getAttribute("aria-hidden"), "false");
  assert.ok(!tagsRoot.hasAttribute("hidden"));
  assert.ok(!tagsRoot.classList.contains("hidden"));

  const tagButtons = Array.from(tagsRoot.querySelectorAll("button"));
  assert.strictEqual(tagButtons.length, 3, "tag strip should render all tags");
  assert.deepStrictEqual(
    tagButtons.map((button) => button.textContent),
    ["#alpha", "#Bitvid", "#nostr"],
    "tag labels should be normalized and sorted alphabetically",
  );

  modal.updateMetadata({ tags: [] });

  assert.strictEqual(tagsRoot.getAttribute("aria-hidden"), "true");
  assert.ok(tagsRoot.hasAttribute("hidden"));
  assert.ok(tagsRoot.classList.contains("hidden"));
  assert.strictEqual(
    tagsRoot.querySelectorAll("button").length,
    0,
    "tag strip should be cleared when metadata tags are empty",
  );
});
