// When the Edit modal re-uploads a thumbnail/video file, the new URL/magnet must
// be written into the field AND the field marked "edited" — otherwise
// EditModal.collect (which gates each field on isEditing: readOnly===false ||
// dataset.isEditing==="true") would keep the ORIGINAL value and the re-upload
// would silently not save. setFieldUnlocked encodes that contract.

import "./test-helpers/setup-localstorage.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { setFieldUnlocked } from "../js/ui/components/editModalUpload.js";

// Minimal input-element stand-in matching what setFieldUnlocked touches.
function makeInput() {
  return {
    value: "original",
    readOnly: true,
    dataset: {},
    removeAttribute(name) {
      this._removed = this._removed || [];
      this._removed.push(name);
    },
  };
}

// Mirror of EditModal.collect's isEditing() gate.
function isEditing(input) {
  if (!input) return true;
  if (input.dataset?.isEditing === "true") return true;
  return input.readOnly === false;
}

test("setFieldUnlocked sets the value and marks the field edited so it persists", () => {
  const input = makeInput();
  setFieldUnlocked(input, "https://cdn.example.com/new.mp4");

  assert.equal(input.value, "https://cdn.example.com/new.mp4", "value updated");
  assert.equal(input.readOnly, false, "field unlocked");
  assert.equal(input.dataset.isEditing, "true", "marked as user-edited");
  assert.equal(
    isEditing(input),
    true,
    "EditModal.collect would treat it as edited (so the upload persists)",
  );
});

test("setFieldUnlocked is a no-op on a missing field", () => {
  assert.doesNotThrow(() => setFieldUnlocked(null, "x"));
  assert.doesNotThrow(() => setFieldUnlocked(undefined, "x"));
});
