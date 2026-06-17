// Scenario (SCN-edit-storage-cleanup):
//   Editing a video with a genuinely replaced hosted URL should remove the OLD
//   R2/S3 object (now orphaned), but only when both old and new URLs are present
//   and different — never when the URL was merely cleared or only metadata
//   changed (so we don't delete an object the new note still references).

import "../test-helpers/setup-localstorage.mjs";
import test from "node:test";
import assert from "node:assert/strict";

globalThis.__BITVID_DISABLE_NETWORK_IMPORTS__ = true;
const { default: EditModalController } = await import(
  "../../js/ui/editModalController.js"
);
const r2Service = (await import("../../js/services/r2Service.js")).default;

const BASE = "https://pub.bitvid.network";

function makeController() {
  const calls = [];
  r2Service.deleteVideoStorage = async (args) => {
    calls.push(args);
    return { deleted: ["x"], failed: [], skipped: false, reason: "" };
  };
  const controller = new EditModalController({
    services: { nostrService: { handleEditVideoSubmit: async () => {} } },
    state: { getPubkey: () => "ownerhex", getVideosMap: () => null },
    ui: {
      getEditModal: () => ({ setSubmitState() {}, close() {} }),
      showError() {},
      showSuccess() {},
    },
    callbacks: { loadVideos: async () => {}, forceRefreshAllProfiles: () => {} },
    helpers: {},
  });
  return { controller, calls };
}

const submit = (controller, { oldUrl, newUrl, urlEdited }) =>
  controller.handleSubmit({
    detail: {
      originalEvent: { id: "1", pubkey: "ownerhex", videoRootId: "root" },
      updatedData: { url: newUrl, urlEdited },
      video: { url: oldUrl },
    },
  });

test("cleans the old object when the URL is genuinely replaced", async () => {
  const { controller, calls } = makeController();
  await submit(controller, {
    oldUrl: `${BASE}/u/np/OLD/clip.mp4`,
    newUrl: `${BASE}/u/np/NEW/clip.mp4`,
    urlEdited: true,
  });
  assert.equal(calls.length, 1, "should request cleanup once");
  assert.equal(calls[0].videos[0].url, `${BASE}/u/np/OLD/clip.mp4`);
  assert.equal(calls[0].pubkey, "ownerhex");
});

test("does NOT clean when only metadata changed (urlEdited false)", async () => {
  const { controller, calls } = makeController();
  await submit(controller, {
    oldUrl: `${BASE}/u/np/OLD/clip.mp4`,
    newUrl: `${BASE}/u/np/OLD/clip.mp4`,
    urlEdited: false,
  });
  assert.equal(calls.length, 0);
});

test("does NOT clean when the URL was cleared (new URL empty)", async () => {
  const { controller, calls } = makeController();
  await submit(controller, {
    oldUrl: `${BASE}/u/np/OLD/clip.mp4`,
    newUrl: "",
    urlEdited: true,
  });
  assert.equal(calls.length, 0, "clearing the URL must not delete the object (magnet web-seed may still use it)");
});
