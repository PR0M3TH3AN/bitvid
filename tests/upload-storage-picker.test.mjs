// #44: the upload modal gets an in-modal "Upload destination" picker so users
// can target any configured storage connection (R2 / B2 / custom S3) without
// leaving the modal. Selection is per-modal and wins over the account default;
// a stale selection (connection deleted meanwhile) falls back to the default.
//
// test_integrity_note:
//   change_type: ["new_tests"]
//   scenarios:
//     - id: SCN-upload-destination-picker
//       given: "0..n configured connections, with/without a default and a per-modal selection"
//       when: "pickTargetConnection resolves the target and renderConnectionPicker renders the select"
//       then: "selection > default > first; stale selections reset; picker hidden under two connections; default labelled"
//   observable_outcomes:
//     - "resolved target connection object"
//     - "rendered <option> values/labels/selected state and wrapper visibility"
//   determinism_controls:
//     - "JSDOM document; plain data objects; no storage or network"
//   anti_cheat_rationale:
//     prevents: ["hard-coded return value", "over-mocking internal logic"]
//   relaxation:
//     did_relax_any_assertion: false

import test from "node:test";
import { strict as assert } from "node:assert";
import { JSDOM } from "jsdom";
import {
  pickTargetConnection,
  renderConnectionPicker,
} from "../js/ui/components/uploadModalStorageUnlock.js";

const r2 = { id: "c1", provider: "cloudflare_r2", meta: { bucket: "vids" } };
const b2 = {
  id: "c2",
  provider: "backblaze_b2",
  meta: { bucket: "backups", defaultForUploads: true },
};
const s3 = { id: "c3", provider: "s3", meta: { bucket: "archive" } };

test("target resolution: selection > default > first, stale selection resets", () => {
  const modal = { selectedConnectionId: null };

  assert.equal(
    pickTargetConnection(modal, [r2, b2, s3]).targetConn.id,
    "c2",
    "account default wins with no selection",
  );
  assert.equal(
    pickTargetConnection(modal, [r2, s3]).targetConn.id,
    "c1",
    "first connection when nothing is default",
  );

  modal.selectedConnectionId = "c3";
  const picked = pickTargetConnection(modal, [r2, b2, s3]);
  assert.equal(picked.targetConn.id, "c3", "per-modal selection wins");
  assert.equal(picked.defaultConn.id, "c2", "default still reported for labelling");

  modal.selectedConnectionId = "gone";
  assert.equal(
    pickTargetConnection(modal, [r2, b2, s3]).targetConn.id,
    "c2",
    "stale selection falls back to the default",
  );
  assert.equal(modal.selectedConnectionId, null, "stale selection is reset");

  assert.equal(pickTargetConnection(modal, []).targetConn, null, "no connections");
});

function makeModal() {
  const dom = new JSDOM(
    '<!DOCTYPE html><div id="wrap" class="hidden"><select id="sel"></select></div>',
  );
  const doc = dom.window.document;
  global.HTMLElement = dom.window.HTMLElement;
  return {
    modal: {
      selectedConnectionId: null,
      inputs: { storageConnection: doc.getElementById("sel") },
      sourceSections: { connectionPicker: doc.getElementById("wrap") },
      getProviderLabel(provider) {
        return provider === "cloudflare_r2" ? "Cloudflare R2" : provider;
      },
    },
    doc,
  };
}

test("picker renders options (default labelled, target selected); hidden under two connections", () => {
  const { modal } = makeModal();

  renderConnectionPicker(modal, [r2, b2, s3], b2, b2);
  const wrap = modal.sourceSections.connectionPicker;
  const options = Array.from(modal.inputs.storageConnection.options);
  assert.equal(wrap.classList.contains("hidden"), false, "picker shown");
  assert.deepEqual(
    options.map((o) => o.value),
    ["c1", "c2", "c3"],
  );
  assert.match(options[0].textContent, /Cloudflare R2 — vids/);
  assert.match(options[1].textContent, /\(default\)$/, "default is labelled");
  assert.equal(
    modal.inputs.storageConnection.value,
    "c2",
    "target connection pre-selected",
  );

  renderConnectionPicker(modal, [r2, b2, s3], s3, b2);
  assert.equal(modal.inputs.storageConnection.value, "c3", "re-render follows the target");

  renderConnectionPicker(modal, [r2], r2, null);
  assert.equal(
    wrap.classList.contains("hidden"),
    true,
    "hidden when there is nothing to choose",
  );
});
