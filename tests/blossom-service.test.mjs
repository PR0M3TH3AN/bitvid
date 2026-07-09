// Phase 0 skeleton tests for blossomService: the availability gate and the
// input guards run without loading the vendored SDK (they throw first). Upload
// round-trips against a real Blossom server are exercised in Phase 1. See
// docs/blossom-plan.md / TODO #30.
import test from "node:test";
import assert from "node:assert/strict";

import blossomService, { BlossomService } from "../js/services/blossomService.js";

test("isAvailable reflects the FEATURE_BLOSSOM_STORAGE flag (off by default)", () => {
  assert.equal(blossomService.isAvailable(), false);
});

test("uploadFile rejects a missing file before touching the SDK", async () => {
  const svc = new BlossomService();
  await assert.rejects(
    () => svc.uploadFile({ servers: ["https://blossom.example"], signer: async () => ({}) }),
    /requires a file/,
  );
});

test("uploadFile rejects an empty server list", async () => {
  const svc = new BlossomService();
  await assert.rejects(
    () => svc.uploadFile({ file: new Blob(["x"]), servers: [], signer: async () => ({}) }),
    /at least one server/,
  );
});

test("uploadFile rejects a non-function signer", async () => {
  const svc = new BlossomService();
  await assert.rejects(
    () =>
      svc.uploadFile({
        file: new Blob(["x"]),
        servers: ["https://blossom.example"],
        signer: null,
      }),
    /requires a signer/,
  );
});

test("uploadFile de-dupes and trims the server list before requiring one", async () => {
  const svc = new BlossomService();
  // All-blank/dup servers collapse to empty → the "at least one server" guard.
  await assert.rejects(
    () =>
      svc.uploadFile({
        file: new Blob(["x"]),
        servers: ["  ", "", "  "],
        signer: async () => ({}),
      }),
    /at least one server/,
  );
});
