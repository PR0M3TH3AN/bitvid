// After publishing a video bitvid must tell the user how many relays actually
// accepted it, instead of an opaque "shared successfully" that hides a partial
// or total relay failure. describePublishOutcome maps the relay tally to a
// message + tone; attach/readRelayPublishSummary carry the tally from the
// signed event to the UI without polluting the serialized event.

import assert from "node:assert/strict";
import test from "node:test";
import {
  describePublishOutcome,
  attachRelayPublishSummary,
  readRelayPublishSummary,
  RELAY_PUBLISH_SUMMARY_KEY,
} from "../js/nostrPublish.js";

test("full acceptance reports the relay count as success", () => {
  const out = describePublishOutcome({ accepted: 4, total: 4 });
  assert.equal(out.tone, "success");
  assert.match(out.message, /4 relays/);
});

test("singular relay is not pluralized", () => {
  const out = describePublishOutcome({ accepted: 1, total: 1 });
  assert.equal(out.tone, "success");
  assert.match(out.message, /1 relay\b/);
  assert.doesNotMatch(out.message, /1 relays/);
});

test("partial acceptance is surfaced as a warning with both counts", () => {
  const out = describePublishOutcome({ accepted: 2, total: 8 });
  assert.equal(out.tone, "warning");
  assert.match(out.message, /2 of 8/);
});

test("zero acceptance is an error telling the user nothing landed", () => {
  const out = describePublishOutcome({ accepted: 0, total: 8 });
  assert.equal(out.tone, "error");
  assert.match(out.message, /any relay/i);
});

test("missing tally falls back to the generic success message", () => {
  const out = describePublishOutcome({});
  assert.equal(out.tone, "success");
  // No fabricated relay count when we don't actually know one.
  assert.doesNotMatch(out.message, /\d+ of \d+/);
});

test("attached tally round-trips and stays out of serialization", () => {
  const event = { id: "abc", kind: 30078, content: "{}" };
  attachRelayPublishSummary(event, {
    accepted: [{ url: "wss://a" }, { url: "wss://b" }],
    failed: [{ url: "wss://c" }],
  });

  const tally = readRelayPublishSummary(event);
  assert.deepEqual(tally, { accepted: 2, total: 3 });

  // The tally must never leak into the event the relays/JSON see.
  assert.ok(
    !Object.keys(event).includes(RELAY_PUBLISH_SUMMARY_KEY),
    "summary key must be non-enumerable",
  );
  assert.ok(
    !JSON.stringify(event).includes(RELAY_PUBLISH_SUMMARY_KEY),
    "summary must not appear in the serialized event",
  );
});

test("reading a summary off an event without one returns null", () => {
  assert.equal(readRelayPublishSummary({ id: "x" }), null);
  assert.equal(readRelayPublishSummary(null), null);
});
