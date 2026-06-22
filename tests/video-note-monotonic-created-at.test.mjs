// Video note edit/delete must produce a strictly-newer created_at than the
// version they replace, or a behind clock (or a same-second second edit) lets
// relays keep the OLD version under NIP-01's "highest created_at wins" rule —
// edits silently don't apply, and deletions don't actually remove the video for
// other clients.

import "./test-helpers/setup-localstorage.mjs";
import assert from "node:assert/strict";
import { test } from "node:test";
import { prepareVideoEditPayload } from "../js/nostr/videoPayloadBuilder.js";
import { buildRevertVideoPayload } from "../js/nostr/publishHelpers.js";

const PK = "a".repeat(64);
// Simulate clock skew: the existing version is timestamped in the future
// relative to the device performing the edit/delete.
const FUTURE_BASE = Math.floor(Date.now() / 1000) + 100000;

const resolveEventDTag = (evt, stub) =>
  (evt?.tags?.find((t) => t[0] === "d") || [])[1] ||
  (stub?.tags?.find((t) => t[0] === "d") || [])[1] ||
  "";

test("edit created_at is bumped above a future-dated base (clock-skew safe)", () => {
  const baseEvent = {
    id: "b".repeat(64),
    pubkey: PK,
    created_at: FUTURE_BASE,
    version: 3,
    title: "Original",
    url: "https://cdn.example.com/v.mp4",
    magnet: "",
    tags: [["d", "root-d"]],
    videoRootId: "root-d",
  };

  const ctx = prepareVideoEditPayload({
    baseEvent,
    originalEventStub: { id: baseEvent.id, tags: baseEvent.tags },
    updatedData: { title: "Edited" },
    userPubkey: PK,
    resolveEventDTag,
  });

  assert.equal(
    ctx.event.created_at,
    FUTURE_BASE + 1,
    "edit must be exactly base+1 when the wall clock is behind the base",
  );
  // d-tag preserved so the edit actually replaces the original.
  const dTag = ctx.event.tags.find((t) => t[0] === "d")?.[1];
  assert.equal(dTag, "root-d", "edit preserves the d-tag");
});

test("delete/revert tombstone created_at is bumped above a future-dated base", () => {
  const baseEvent = {
    id: "c".repeat(64),
    pubkey: PK,
    created_at: FUTURE_BASE,
    content: JSON.stringify({
      version: 3,
      videoRootId: "root-d",
      title: "Original",
      url: "https://cdn.example.com/v.mp4",
    }),
    tags: [["d", "root-d"]],
  };

  const event = buildRevertVideoPayload({
    baseEvent,
    originalEventId: baseEvent.id,
    pubkey: PK,
    existingD: "root-d",
    stableDTag: "root-d",
  });

  assert.equal(
    event.created_at,
    FUTURE_BASE + 1,
    "tombstone must be strictly newer than the version it deletes",
  );
  const content = JSON.parse(event.content);
  assert.equal(content.deleted, true, "tombstone marks the video deleted");
});

test("a normal (past-dated base) edit uses wall-clock time", () => {
  const now = Math.floor(Date.now() / 1000);
  const baseEvent = {
    id: "d".repeat(64),
    pubkey: PK,
    created_at: now - 10000,
    version: 3,
    title: "Original",
    tags: [["d", "root-d"]],
    videoRootId: "root-d",
  };

  const ctx = prepareVideoEditPayload({
    baseEvent,
    originalEventStub: { id: baseEvent.id, tags: baseEvent.tags },
    updatedData: { title: "Edited" },
    userPubkey: PK,
    resolveEventDTag,
  });

  assert.ok(
    ctx.event.created_at >= now,
    "with a past base, the edit uses current time",
  );
  assert.ok(
    ctx.event.created_at > baseEvent.created_at,
    "and is still strictly newer than the base",
  );
});
