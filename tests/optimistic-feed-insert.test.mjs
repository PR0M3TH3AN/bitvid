// Optimistic feed insert after publishing (#46): a just-published video is
// added to the client's active-video cache immediately so it shows in the feed
// without waiting for the relays to echo it back — while still obeying the same
// dedupe / active-key rules as live ingestion, so a relay copy of the same
// event can't duplicate it and an older revision can't overwrite a newer one.
//
// test_integrity_note:
//   change_type: ["new_tests"]
//   scenarios:
//     - id: SCN-optimistic-feed-insert
//       given: "a freshly signed video event"
//       when: "ingestLocalVideoEvent is called with it"
//       then: "getActiveVideos includes it exactly once, newest-revision-wins"
//   observable_outcomes:
//     - "getActiveVideos() surfaces the ingested video"
//     - "re-ingesting the same event does not create a duplicate active entry"
//     - "an older revision of the same root does not replace a newer active one"
//     - "an invalid event returns null and inserts nothing"
//   determinism_controls:
//     - "in-memory NostrClient + localStorage polyfill; explicit created_at values"
//   anti_cheat_rationale:
//     prevents: ["hard-coded return value", "over-mocking internal logic"]
//   relaxation:
//     did_relax_any_assertion: false

import "./test-helpers/setup-localstorage.mjs";
import test from "node:test";
import { strict as assert } from "node:assert";
import { NostrClient } from "../js/nostr/client.js";

const PUB = "f".repeat(64);

function videoEvent({ id, root, title, createdAt }) {
  return {
    id,
    pubkey: PUB,
    kind: 30078,
    created_at: createdAt,
    content: JSON.stringify({
      version: 3,
      title,
      url: "https://cdn.example/v.mp4",
      videoRootId: root,
    }),
    tags: [["d", root]],
  };
}

test("a published event is surfaced in the active feed immediately", () => {
  const client = new NostrClient();
  const video = client.ingestLocalVideoEvent(
    videoEvent({ id: "evt-1", root: "root-1", title: "Hello", createdAt: 1000 }),
  );

  assert.ok(video, "returns the ingested video");
  const active = client.getActiveVideos();
  assert.equal(active.length, 1);
  assert.equal(active[0].id, "evt-1");
  assert.equal(active[0].title, "Hello");
});

test("re-ingesting the same event does not duplicate it in the feed", () => {
  const client = new NostrClient();
  const evt = videoEvent({ id: "evt-1", root: "root-1", title: "Hello", createdAt: 1000 });
  client.ingestLocalVideoEvent(evt);
  client.ingestLocalVideoEvent(evt);

  assert.equal(client.getActiveVideos().length, 1, "same event stays a single active entry");
});

test("a newer revision of the same root replaces the active entry", () => {
  const client = new NostrClient();
  client.ingestLocalVideoEvent(
    videoEvent({ id: "evt-old", root: "root-1", title: "Old", createdAt: 1000 }),
  );
  client.ingestLocalVideoEvent(
    videoEvent({ id: "evt-new", root: "root-1", title: "New", createdAt: 2000 }),
  );

  const active = client.getActiveVideos();
  assert.equal(active.length, 1, "one active entry per root");
  assert.equal(active[0].title, "New", "newest revision wins");
});

test("an older revision does NOT overwrite a newer active entry", () => {
  const client = new NostrClient();
  client.ingestLocalVideoEvent(
    videoEvent({ id: "evt-new", root: "root-1", title: "New", createdAt: 2000 }),
  );
  // A late-arriving older copy (e.g. a stale relay echo) must not clobber it.
  client.ingestLocalVideoEvent(
    videoEvent({ id: "evt-old", root: "root-1", title: "Old", createdAt: 1000 }),
  );

  const active = client.getActiveVideos();
  assert.equal(active.length, 1);
  assert.equal(active[0].title, "New", "older revision must not displace the newer active entry");
});

test("an invalid event returns null and inserts nothing", () => {
  const client = new NostrClient();
  const result = client.ingestLocalVideoEvent({ id: "bad", content: "not-json", tags: [] });
  assert.equal(result, null);
  assert.equal(client.getActiveVideos().length, 0);
});

test("a null/garbage argument is handled without throwing", () => {
  const client = new NostrClient();
  assert.equal(client.ingestLocalVideoEvent(null), null);
  assert.equal(client.ingestLocalVideoEvent({}), null);
  assert.equal(client.getActiveVideos().length, 0);
});
