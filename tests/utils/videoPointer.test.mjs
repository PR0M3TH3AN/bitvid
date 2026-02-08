import test from "node:test";
import assert from "node:assert/strict";
import { resolveVideoPointer, DEFAULT_VIDEO_KIND } from "../../js/utils/videoPointer.js";

test("resolveVideoPointer returns address pointer with dTag", () => {
  const result = resolveVideoPointer({
    kind: 30000,
    pubkey: "abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234",
    dTag: "test-video",
  });

  assert.ok(result);
  assert.equal(result.key, "a:30000:abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234:test-video");
  assert.deepEqual(result.pointer, [
    "a",
    "30000:abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234:test-video",
  ]);
  assert.equal(result.eventId, "");
});

test("resolveVideoPointer returns address pointer with videoRootId", () => {
  const result = resolveVideoPointer({
    kind: 30000,
    pubkey: "abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234",
    videoRootId: "root-id",
  });

  assert.ok(result);
  assert.equal(result.key, "a:30000:abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234:root-id");
  assert.deepEqual(result.pointer, [
    "a",
    "30000:abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234:root-id",
  ]);
  assert.equal(result.eventId, "");
});

test("resolveVideoPointer returns event pointer with fallbackEventId", () => {
  const eventId = "deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef";
  const result = resolveVideoPointer({
    fallbackEventId: eventId,
  });

  assert.ok(result);
  assert.equal(result.key, `e:${eventId}`);
  assert.deepEqual(result.pointer, ["e", eventId]);
  assert.equal(result.eventId, eventId);
});

test("resolveVideoPointer prioritizes dTag over videoRootId", () => {
  const result = resolveVideoPointer({
    kind: 30000,
    pubkey: "abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234",
    dTag: "priority-dtag",
    videoRootId: "ignored-root",
  });

  assert.ok(result);
  assert.equal(result.key, "a:30000:abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234:priority-dtag");
});

test("resolveVideoPointer prioritizes videoRootId over fallbackEventId", () => {
  const result = resolveVideoPointer({
    kind: 30000,
    pubkey: "abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234",
    videoRootId: "priority-root",
    fallbackEventId: "ignored-fallback",
  });

  assert.ok(result);
  assert.equal(result.key, "a:30000:abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234:priority-root");
});

test("resolveVideoPointer prioritizes dTag over fallbackEventId", () => {
  const result = resolveVideoPointer({
    kind: 30000,
    pubkey: "abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234",
    dTag: "priority-dtag",
    fallbackEventId: "ignored-fallback",
  });

  assert.ok(result);
  assert.equal(result.key, "a:30000:abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234:priority-dtag");
});

test("resolveVideoPointer includes relay in pointer", () => {
  const result = resolveVideoPointer({
    kind: 30000,
    pubkey: "abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234",
    dTag: "test-video",
    relay: "wss://relay.example.com",
  });

  assert.ok(result);
  // Note: pointerArrayToKey includes relay if present
  assert.equal(result.key, "a:30000:abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234:test-video:wss://relay.example.com");
  assert.deepEqual(result.pointer, [
    "a",
    "30000:abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234:test-video",
    "wss://relay.example.com",
  ]);
});

test("resolveVideoPointer normalizes inputs", () => {
  const result = resolveVideoPointer({
    kind: 30000,
    pubkey: "  ABCD1234ABCD1234ABCD1234ABCD1234ABCD1234ABCD1234ABCD1234ABCD1234  ",
    dTag: "  test-video  ",
    relay: "  wss://relay.example.com  ",
  });

  assert.ok(result);
  assert.equal(result.key, "a:30000:abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234:test-video:wss://relay.example.com");
});

test("resolveVideoPointer uses default kind when kind is missing or invalid", () => {
  const pubkey = "abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234";

  // Missing kind
  let result = resolveVideoPointer({
    pubkey,
    dTag: "test",
  });
  assert.equal(result.key, `a:${DEFAULT_VIDEO_KIND}:${pubkey}:test`);

  // Invalid kind (string)
  result = resolveVideoPointer({
    kind: "30000",
    pubkey,
    dTag: "test",
  });
  assert.equal(result.key, `a:${DEFAULT_VIDEO_KIND}:${pubkey}:test`);

  // Invalid kind (NaN)
  result = resolveVideoPointer({
    kind: NaN,
    pubkey,
    dTag: "test",
  });
  assert.equal(result.key, `a:${DEFAULT_VIDEO_KIND}:${pubkey}:test`);
});

test("resolveVideoPointer returns null for invalid inputs", () => {
  assert.equal(resolveVideoPointer(), null);
  assert.equal(resolveVideoPointer({}), null);

  // Missing pubkey for address pointer
  assert.equal(resolveVideoPointer({ dTag: "test" }), null);
  assert.equal(resolveVideoPointer({ videoRootId: "test" }), null);

  // Missing identifier for address pointer
  assert.equal(resolveVideoPointer({ pubkey: "abcd" }), null);
});
