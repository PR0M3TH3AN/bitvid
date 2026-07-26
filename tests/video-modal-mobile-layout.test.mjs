import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const playerStyles = await readFile(
  new URL("../css/tailwind.source.css", import.meta.url),
  "utf8"
);

test("mobile player modal uses the dynamic viewport and keeps the comment action above browser chrome", () => {
  assert.match(
    playerStyles,
    /#playerModal\s*\{[^}]*height:\s*100dvh;[^}]*min-height:\s*100dvh;[^}]*overflow:\s*hidden;/s,
    "the player root should use the dynamic viewport instead of scrolling beneath browser chrome"
  );
  assert.match(
    playerStyles,
    /#playerModal\s*>\s*\.bv-modal__panel\s*\{[^}]*overflow-y:\s*auto;/s,
    "the modal panel should remain the single scroll region used by sticky navigation"
  );
  assert.match(
    playerStyles,
    /#playerModal\s+\.comment-composer\s*\{[^}]*padding-bottom:\s*max\(var\(--space-lg\),\s*env\(safe-area-inset-bottom\)\);/s,
    "the comment action row should clear the mobile safe area"
  );
});
