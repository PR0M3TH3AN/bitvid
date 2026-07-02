// Admin pane "Blocked videos" sub-tab (#25 follow-up): the per-event admin block
// list is now viewable/removable in the UI. These cover the row-building (pure)
// and the list rendering + unblock wiring (jsdom).
//
// test_integrity_note:
//   change_type: ["new_tests"]
//   scenarios:
//     - id: SCN-blocked-videos-rows
//       given: "a raw blocked-id list and an optional cache resolver"
//       when: "buildBlockedVideoRows / renderBlockedVideosList run"
//       then: "rows dedupe + enrich, the list renders, and Unblock invokes the callback"
//   observable_outcomes:
//     - "id-only rows when the video isn't cached; title+id rows when it is"
//     - "empty list shows the empty state and hides the <ul>"
//     - "clicking Unblock calls onUnblock with the event id"
//   determinism_controls:
//     - "pure fn for row building; jsdom for render; no network/clock"
//   anti_cheat_rationale:
//     prevents: ["hard-coded return value", "snapshot rubber-stamping"]
//   relaxation:
//     did_relax_any_assertion: false

import test, { beforeEach, afterEach } from "node:test";
import { strict as assert } from "node:assert";
import { JSDOM } from "jsdom";
import {
  buildBlockedVideoRows,
  renderBlockedVideosList,
  shortenEventId,
} from "../js/ui/profileModal/blockedVideosSection.js";

const HEX = "a".repeat(64);
const HEX2 = "b".repeat(64);

test("buildBlockedVideoRows: id-only row when the video isn't cached", () => {
  const rows = buildBlockedVideoRows([HEX], () => null);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, HEX);
  assert.equal(rows[0].title, "");
  assert.equal(rows[0].label, shortenEventId(HEX), "label falls back to shortened id");
  assert.equal(rows[0].sublabel, "", "no sublabel without a title");
});

test("buildBlockedVideoRows: enriches with title + author when cached", () => {
  const rows = buildBlockedVideoRows([HEX], (id) =>
    id === HEX ? { title: "My Clip", pubkey: HEX2 } : null,
  );
  assert.equal(rows[0].title, "My Clip");
  assert.equal(rows[0].label, "My Clip", "title becomes the primary label");
  assert.equal(rows[0].sublabel, shortenEventId(HEX), "id demoted to sublabel");
  assert.equal(rows[0].author, HEX2);
});

test("buildBlockedVideoRows: dedupes, lowercases, and drops blanks", () => {
  const rows = buildBlockedVideoRows(
    [HEX, HEX.toUpperCase(), "", "   ", HEX2],
    () => null,
  );
  assert.deepEqual(
    rows.map((r) => r.id),
    [HEX, HEX2],
    "one row per distinct id, blanks removed",
  );
});

test("buildBlockedVideoRows: a throwing resolver degrades to an id-only row", () => {
  const rows = buildBlockedVideoRows([HEX], () => {
    throw new Error("cache miss");
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].label, shortenEventId(HEX));
});

describe_render();

function describe_render() {
  let dom;
  beforeEach(() => {
    dom = new JSDOM("<!doctype html><html><body></body></html>");
    globalThis.document = dom.window.document;
    globalThis.HTMLElement = dom.window.HTMLElement;
  });
  afterEach(() => {
    delete globalThis.document;
    delete globalThis.HTMLElement;
  });

  const mount = () => {
    const list = dom.window.document.createElement("ul");
    const empty = dom.window.document.createElement("div");
    dom.window.document.body.append(list, empty);
    return { list, empty };
  };

  test("renderBlockedVideosList: empty shows the empty state and hides the list", () => {
    const { list, empty } = mount();
    renderBlockedVideosList(list, empty, []);
    assert.equal(empty.classList.contains("hidden"), false, "empty state visible");
    assert.equal(list.classList.contains("hidden"), true, "list hidden");
    assert.equal(list.children.length, 0);
  });

  test("renderBlockedVideosList: renders one row per blocked video", () => {
    const { list, empty } = mount();
    const rows = buildBlockedVideoRows([HEX, HEX2], () => null);
    renderBlockedVideosList(list, empty, rows, { onUnblock: () => {} });
    assert.equal(empty.classList.contains("hidden"), true, "empty hidden");
    assert.equal(list.children.length, 2, "two rows rendered");
    assert.equal(list.children[0].dataset.eventId, HEX);
  });

  test("renderBlockedVideosList: clicking Unblock calls onUnblock with the id", () => {
    const { list, empty } = mount();
    const rows = buildBlockedVideoRows([HEX], () => null);
    const calls = [];
    renderBlockedVideosList(list, empty, rows, {
      onUnblock: (id) => calls.push(id),
    });
    const button = list.querySelector("button");
    assert.ok(button, "row has an Unblock button");
    button.click();
    assert.deepEqual(calls, [HEX], "onUnblock invoked with the blocked id");
  });
}
