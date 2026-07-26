// Auto-sync glue: keeps an opted-in NIP-71 mirror in lockstep on edit/delete,
// driven by nostrService's existing videos:edited/videos:deleted events (so the
// size-capped nostrService is untouched).

import "./test-helpers/setup-localstorage.mjs";
import assert from "node:assert/strict";
import test, { mock } from "node:test";
import {
  syncNip71MirrorAfterEdit,
  syncNip71MirrorAfterPublish,
  syncNip71MirrorAfterDelete,
  initNip71MirrorSync,
} from "../js/services/nip71MirrorSync.js";
import {
  isMirrorEnabled,
  setMirrorEnabled,
  setAutoShareEnabled,
} from "../js/services/nip71MirrorFlags.js";
import { nip71MirrorService } from "../js/services/nip71MirrorService.js";

const PK = "a".repeat(64);

test("deleting a SHARED video tears the mirror down and clears its opt-in flag", async () => {
  localStorage.clear();
  setMirrorEnabled(PK, "root-x", true);
  const removeSpy = mock.method(nip71MirrorService, "remove", async () => ({ ok: true }));
  try {
    await syncNip71MirrorAfterDelete({ videoRootId: "root-x", video: {}, pubkey: PK });
    assert.equal(removeSpy.mock.callCount(), 1, "mirror teardown attempted");
    assert.equal(isMirrorEnabled(PK, "root-x"), false, "flag cleared after delete");
  } finally {
    removeSpy.mock.restore();
  }
});

test("deleting an UNFLAGGED video still attempts teardown (cross-device / cleared cache)", async () => {
  // Regression: the per-video opt-in flag is browser-local, so a video shared on
  // one device and deleted from another (or after a cache clear) has no flag set
  // here. Teardown (NIP-09 + empty tombstone) is idempotent, so delete must still
  // attempt it — otherwise the NIP-71 mirror is orphaned on other apps.
  localStorage.clear();
  assert.equal(isMirrorEnabled(PK, "root-y"), false, "precondition: no local flag");
  const removeSpy = mock.method(nip71MirrorService, "remove", async () => ({ ok: true }));
  try {
    await syncNip71MirrorAfterDelete({ videoRootId: "root-y", video: {}, pubkey: PK });
    assert.equal(
      removeSpy.mock.callCount(),
      1,
      "teardown must be attempted even with no local opt-in flag",
    );
    const arg = removeSpy.mock.calls[0].arguments[0];
    assert.equal(arg.videoRootId, "root-y", "teardown targets the deleted root");
    assert.equal(arg.pubkey, PK, "teardown targets the author");
  } finally {
    removeSpy.mock.restore();
  }
});

test("delete sync never throws when teardown fails (best-effort)", async () => {
  localStorage.clear();
  const removeSpy = mock.method(nip71MirrorService, "remove", async () => {
    throw new Error("relay unreachable");
  });
  try {
    await syncNip71MirrorAfterDelete({ videoRootId: "root-z", video: {}, pubkey: PK });
    assert.equal(isMirrorEnabled(PK, "root-z"), false, "flag stays clear even on failure");
  } finally {
    removeSpy.mock.restore();
  }
});

test("editing a mirrored video uses the original root when the form omits it", async () => {
  localStorage.clear();
  setMirrorEnabled(PK, "root-edit", true);
  const canMirror = mock.method(nip71MirrorService, "canMirror", () => ({ ok: true }));
  const publishSpy = mock.method(nip71MirrorService, "publish", async () => ({ ok: true }));
  try {
    await syncNip71MirrorAfterEdit({
      updatedData: { title: "Edited", url: "https://cdn.example/video.mp4" },
      originalEvent: { videoRootId: "root-edit" },
      pubkey: PK,
    });
    assert.equal(publishSpy.mock.callCount(), 1, "mirror is republished after a normal edit");
    assert.equal(publishSpy.mock.calls[0].arguments[0].videoRootId, "root-edit");
  } finally {
    canMirror.mock.restore();
    publishSpy.mock.restore();
  }
});

test("failed edit-time unshare keeps the flag so a later edit retries cleanup", async () => {
  localStorage.clear();
  setMirrorEnabled(PK, "root-retry", true);
  const canMirror = mock.method(nip71MirrorService, "canMirror", () => ({ ok: false, reason: "private" }));
  const removeSpy = mock.method(nip71MirrorService, "remove", async () => ({ ok: false }));
  try {
    await syncNip71MirrorAfterEdit({
      updatedData: { isPrivate: true },
      originalEvent: { videoRootId: "root-retry" },
      pubkey: PK,
    });
    assert.equal(removeSpy.mock.callCount(), 1);
    assert.equal(isMirrorEnabled(PK, "root-retry"), true, "failed cleanup stays retryable");
  } finally {
    canMirror.mock.restore();
    removeSpy.mock.restore();
  }
});

test("a per-upload opt-out prevents the default NIP-71 mirror", async () => {
  localStorage.clear();
  setAutoShareEnabled(PK, true);
  const publishSpy = mock.method(nip71MirrorService, "publish", async () => ({ ok: true }));
  try {
    await syncNip71MirrorAfterPublish({
      pubkey: PK,
      payload: { mirrorNip71: false },
      result: {
        legacy: {
          id: "event-id",
          pubkey: PK,
          created_at: 1,
          tags: [["d", "root-opt-out"]],
          content: JSON.stringify({
            videoRootId: "root-opt-out",
            title: "No mirror",
            url: "https://cdn.example/video.mp4",
          }),
        },
      },
    });
    assert.equal(publishSpy.mock.callCount(), 0);
  } finally {
    publishSpy.mock.restore();
  }
});

test("a new eligible upload mirrors by default", async () => {
  localStorage.clear();
  const canMirror = mock.method(nip71MirrorService, "canMirror", () => ({ ok: true }));
  const publishSpy = mock.method(nip71MirrorService, "publish", async () => ({ ok: true }));
  try {
    await syncNip71MirrorAfterPublish({
      pubkey: PK,
      payload: { mirrorNip71: true },
      result: {
        legacy: {
          id: "event-id-default",
          pubkey: PK,
          created_at: 1,
          tags: [["d", "root-default"]],
          content: JSON.stringify({
            videoRootId: "root-default",
            title: "Default mirror",
            url: "https://cdn.example/video.mp4",
          }),
        },
      },
    });
    assert.equal(publishSpy.mock.callCount(), 1);
    assert.equal(isMirrorEnabled(PK, "root-default"), true);
  } finally {
    canMirror.mock.restore();
    publishSpy.mock.restore();
  }
});

test("initNip71MirrorSync subscribes to edit+delete events, idempotently", () => {
  const events = {};
  const svc = {
    on(name, handler) {
      (events[name] = events[name] || []).push(handler);
      return () => {};
    },
  };
  const off = initNip71MirrorSync(svc);
  assert.equal(events["videos:edited"]?.length, 1, "subscribes to videos:edited");
  assert.equal(events["videos:deleted"]?.length, 1, "subscribes to videos:deleted");
  assert.equal(events["videos:published"]?.length, 1, "subscribes to videos:published");

  initNip71MirrorSync(svc); // guard prevents double-registration
  assert.equal(events["videos:edited"].length, 1, "no double-register");

  off(); // resets the guard for other tests
});
