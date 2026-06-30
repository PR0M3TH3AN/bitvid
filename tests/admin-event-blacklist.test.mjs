// #25 per-event (per-video) admin block list: an admin can hide a SINGLE video without
// blocking its author. The published list is a kind-30000 NIP-51 event carrying the
// blocked event ids as `e` tags. These tests cover the pure record helpers and the
// ⋯-menu action handler (editor-gated add + grid refresh).

import test, { afterEach } from "node:test";
import { strict as assert } from "node:assert";
import {
  sanitizeEventIdList,
  extractEventIdsFromEvent,
  normalizeEventId,
  buildEventBlacklistEvent,
} from "../js/adminEventBlacklistHelpers.js";
import { handleBlacklistEventAction } from "../js/ui/moreMenu/blacklistEventAction.js";

const HEX_A = "a".repeat(64);
const HEX_B = "b".repeat(64);

afterEach(() => {
  delete globalThis.window;
  delete globalThis.NostrTools;
});

// --- record helpers ---

test("sanitizeEventIdList keeps valid hex ids, lowercased + deduped", () => {
  assert.deepEqual(
    sanitizeEventIdList([HEX_A.toUpperCase(), HEX_A, HEX_B, "nope", "", 123]),
    [HEX_A, HEX_B],
  );
});

test("extractEventIdsFromEvent reads `e` tags only", () => {
  const event = {
    tags: [
      ["d", "bitvid:admin:event-blacklist"],
      ["e", HEX_A],
      ["p", HEX_B], // a pubkey tag must NOT be treated as a blocked event
      ["e", HEX_B],
    ],
  };
  assert.deepEqual(extractEventIdsFromEvent(event), [HEX_A, HEX_B]);
});

test("normalizeEventId accepts hex and decodes nevent/note pointers", () => {
  assert.equal(normalizeEventId(HEX_A.toUpperCase()), HEX_A);
  assert.equal(normalizeEventId("not-an-id"), "");
  globalThis.NostrTools = {
    nip19: {
      decode: (v) =>
        v === "nevent1xyz"
          ? { type: "nevent", data: { id: HEX_B } }
          : { type: "note", data: HEX_A },
    },
  };
  assert.equal(normalizeEventId("nevent1xyz"), HEX_B);
  assert.equal(normalizeEventId("note1abc"), HEX_A);
});

test("buildEventBlacklistEvent builds a kind-30000 list with the event d-tag + `e` tags", () => {
  const event = buildEventBlacklistEvent(HEX_A, [HEX_A, HEX_B, "junk"]);
  assert.equal(event.kind, 30000);
  const dTag = event.tags.find((t) => t[0] === "d");
  assert.equal(dTag[1], "bitvid:admin:event-blacklist");
  const eTags = event.tags.filter((t) => t[0] === "e").map((t) => t[1]);
  assert.deepEqual(eTags, [HEX_A, HEX_B]); // junk dropped
  assert.ok(!event.tags.some((t) => t[0] === "p"), "no pubkey tags");
});

// --- ⋯-menu action handler ---

function makeDeps({ canEdit = true, npub = "npub1mod", addResult = { ok: true } } = {}) {
  const calls = { added: [], success: [], error: [], refresh: 0 };
  const accessControl = {
    ensureReady: async () => {},
    canEditAdminLists: () => canEdit,
    addToEventBlacklist: async (actor, id) => {
      calls.added.push({ actor, id });
      return addResult;
    },
  };
  const callbacks = {
    getCurrentUserNpub: () => npub,
    showError: (m) => calls.error.push(m),
    showSuccess: (m) => calls.success.push(m),
    refreshAllVideoGrids: async () => {
      calls.refresh += 1;
    },
  };
  return { accessControl, callbacks, calls };
}

test("blocks the video's event id (editor) and refreshes the grids", async () => {
  const { accessControl, callbacks, calls } = makeDeps();
  await handleBlacklistEventAction({
    accessControl,
    callbacks,
    dataset: { eventId: HEX_A },
    currentVideo: { id: HEX_B },
  });
  assert.deepEqual(calls.added, [{ actor: "npub1mod", id: HEX_A }], "uses dataset eventId");
  assert.equal(calls.success.length, 1);
  assert.equal(calls.refresh, 1);
  assert.equal(calls.error.length, 0);
});

test("falls back to the current video's id when the dataset has none", async () => {
  const { accessControl, callbacks, calls } = makeDeps();
  await handleBlacklistEventAction({
    accessControl,
    callbacks,
    dataset: {},
    currentVideo: { id: HEX_B },
  });
  assert.deepEqual(calls.added, [{ actor: "npub1mod", id: HEX_B }]);
});

test("a non-editor is refused and nothing is published", async () => {
  const { accessControl, callbacks, calls } = makeDeps({ canEdit: false });
  await handleBlacklistEventAction({
    accessControl,
    callbacks,
    dataset: { eventId: HEX_A },
  });
  assert.equal(calls.added.length, 0);
  assert.equal(calls.refresh, 0);
  assert.match(calls.error[0], /moderators/i);
});

test("a logged-out user is prompted to login, no publish", async () => {
  const { accessControl, callbacks, calls } = makeDeps({ npub: null });
  await handleBlacklistEventAction({ accessControl, callbacks, dataset: { eventId: HEX_A } });
  assert.equal(calls.added.length, 0);
  assert.match(calls.error[0], /login/i);
});

test("a publish failure surfaces an error and does not claim success", async () => {
  const { accessControl, callbacks, calls } = makeDeps({
    addResult: { ok: false, error: "storage-error" },
  });
  await handleBlacklistEventAction({
    accessControl,
    callbacks,
    dataset: { eventId: HEX_A },
  });
  assert.equal(calls.success.length, 0);
  assert.equal(calls.refresh, 0);
  assert.equal(calls.error.length, 1);
});
