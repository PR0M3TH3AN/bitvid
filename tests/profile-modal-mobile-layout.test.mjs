import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const styles = await readFile(
  new URL("../css/tailwind.source.css", import.meta.url),
  "utf8",
);

test("mobile modal sheets use the dynamic viewport instead of extending behind browser chrome", () => {
  assert.match(
    styles,
    /\.bv-modal__panel,\s*\.modal-sheet\s*\{[^}]*block-size:\s*100dvh;[^}]*min-block-size:\s*100dvh;/s,
  );
  assert.match(
    styles,
    /#profileModal\s*\{[^}]*height:\s*100dvh;[^}]*min-height:\s*100dvh;/s,
  );
});

test("mobile profile session actions and menu scrolling clear the bottom safe area", () => {
  assert.match(
    styles,
    /\.profile-modal__menu\s*\{[^}]*padding-block-end:\s*max\(var\(--space-lg\),\s*env\(safe-area-inset-bottom\)\);[^}]*scroll-padding-block-end:/s,
  );
  assert.match(
    styles,
    /\.profile-modal__mobile-actions\s*\{[^}]*padding-block-end:\s*max\(\s*var\(--space-sm\),\s*env\(safe-area-inset-bottom\)\s*\);/s,
  );
  assert.match(
    styles,
    /\.mobile-safe-bottom\s*\{[^}]*bottom:\s*calc\(var\(--space-lg\)\s*\+\s*env\(safe-area-inset-bottom\)\);/s,
  );
});
