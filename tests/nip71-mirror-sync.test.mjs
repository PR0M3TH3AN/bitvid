// Auto-sync glue: keeps an opted-in NIP-71 mirror in lockstep on edit/delete,
// driven by nostrService's existing videos:edited/videos:deleted events (so the
// size-capped nostrService is untouched).

import "./test-helpers/setup-localstorage.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import {
  syncNip71MirrorAfterDelete,
  initNip71MirrorSync,
} from "../js/services/nip71MirrorSync.js";
import { isMirrorEnabled, setMirrorEnabled } from "../js/services/nip71MirrorFlags.js";

const PK = "a".repeat(64);

test("deleting a SHARED video clears its opt-in flag (mirror torn down)", async () => {
  localStorage.clear();
  setMirrorEnabled(PK, "root-x", true);
  await syncNip71MirrorAfterDelete({ videoRootId: "root-x", video: {}, pubkey: PK });
  assert.equal(isMirrorEnabled(PK, "root-x"), false, "flag cleared after delete");
});

test("deleting a NON-shared video is a no-op (and never throws)", async () => {
  localStorage.clear();
  await syncNip71MirrorAfterDelete({ videoRootId: "root-y", video: {}, pubkey: PK });
  assert.equal(isMirrorEnabled(PK, "root-y"), false);
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

  initNip71MirrorSync(svc); // guard prevents double-registration
  assert.equal(events["videos:edited"].length, 1, "no double-register");

  off(); // resets the guard for other tests
});
