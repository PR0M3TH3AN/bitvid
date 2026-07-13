import { test } from "node:test";
import assert from "node:assert/strict";

import {
  SUBMISSION_KIND,
  SUBMISSION_TYPES,
  parseSubmissionEvent,
  buildSubmission,
  generateSubmissionId,
} from "../js/submissions/submissionService.js";
import { buildSubmissionEvent } from "../js/nostrEventSchemas.js";

const EPHEMERAL = "e".repeat(64);
const ADMIN = "a".repeat(64);
const APPLICANT = "npub1exampleapplicant";

test("buildSubmissionEvent emits kind, d, type, applicant, recipient, topic", () => {
  const event = buildSubmissionEvent({
    pubkey: EPHEMERAL,
    created_at: 1000,
    dTagValue: "sub-1",
    submissionType: "application",
    applicantNpub: APPLICANT,
    recipientPubkey: ADMIN,
    content: "Please whitelist me, I make Blender tutorials.",
  });

  assert.equal(event.kind, SUBMISSION_KIND);
  assert.equal(event.tags.find((t) => t[0] === "d")?.[1], "sub-1");
  assert.equal(event.tags.find((t) => t[0] === "t")?.[1], "bitvid-submission");
  assert.equal(event.tags.find((t) => t[0] === "k")?.[1], "application");
  assert.equal(event.tags.find((t) => t[0] === "applicant")?.[1], APPLICANT);
  assert.equal(event.tags.find((t) => t[0] === "p")?.[1], ADMIN);
  assert.equal(event.content, "Please whitelist me, I make Blender tutorials.");
});

test("buildSubmissionEvent requires a d-tag", () => {
  assert.throws(
    () => buildSubmissionEvent({ pubkey: EPHEMERAL, created_at: 1, dTagValue: " " }),
    /requires a d-tag/i,
  );
});

test("buildSubmissionEvent defaults type to application", () => {
  const event = buildSubmissionEvent({
    pubkey: EPHEMERAL,
    created_at: 1,
    dTagValue: "d",
  });
  assert.equal(event.tags.find((t) => t[0] === "k")?.[1], "application");
});

test("parseSubmissionEvent structures a submission", () => {
  const event = buildSubmissionEvent({
    pubkey: EPHEMERAL,
    created_at: 4242,
    dTagValue: "sub-7",
    submissionType: "bug",
    applicantNpub: APPLICANT,
    recipientPubkey: ADMIN,
    content: "the zap button is off-center",
  });
  event.id = "event-id-9";

  const parsed = parseSubmissionEvent(event);
  assert.equal(parsed.id, "sub-7");
  assert.equal(parsed.eventId, "event-id-9");
  assert.equal(parsed.type, "bug");
  assert.equal(parsed.applicant, APPLICANT);
  assert.equal(parsed.recipient, ADMIN);
  assert.equal(parsed.content, "the zap button is off-center");
  assert.equal(parsed.createdAt, 4242);
  assert.equal(parsed.pubkey, EPHEMERAL);
});

test("parseSubmissionEvent surfaces an appeal's blocked-event target from the e tag", () => {
  const target = "b".repeat(64);
  const parsed = parseSubmissionEvent({
    kind: SUBMISSION_KIND,
    pubkey: EPHEMERAL,
    created_at: 10,
    tags: [
      ["d", "appeal-1"],
      ["k", "appeal"],
      ["p", ADMIN],
      ["e", target.toUpperCase()],
    ],
  });
  assert.equal(parsed.type, "appeal");
  // lowercased, ready to feed straight into the event block list
  assert.equal(parsed.targetEventId, target);
});

test("parseSubmissionEvent ignores a malformed e tag and defaults target to ''", () => {
  const parsed = parseSubmissionEvent({
    kind: SUBMISSION_KIND,
    pubkey: EPHEMERAL,
    created_at: 10,
    tags: [
      ["d", "appeal-2"],
      ["k", "appeal"],
      ["e", "not-a-real-event-id"],
    ],
  });
  assert.equal(parsed.targetEventId, "");
});

test("parseSubmissionEvent leaves targetEventId empty when no e tag is present", () => {
  const parsed = parseSubmissionEvent({
    kind: SUBMISSION_KIND,
    pubkey: EPHEMERAL,
    created_at: 10,
    tags: [["d", "x"], ["k", "application"]],
  });
  assert.equal(parsed.targetEventId, "");
});

test("parseSubmissionEvent normalizes an unknown type to 'other'", () => {
  const parsed = parseSubmissionEvent({
    kind: SUBMISSION_KIND,
    pubkey: EPHEMERAL,
    created_at: 1,
    tags: [["d", "x"], ["k", "totally-made-up"]],
  });
  assert.equal(parsed.type, "other");
});

test("parseSubmissionEvent rejects the wrong kind and a missing d", () => {
  assert.equal(parseSubmissionEvent({ kind: 1, tags: [["d", "x"]] }), null);
  assert.equal(
    parseSubmissionEvent({ kind: SUBMISSION_KIND, tags: [["k", "application"]] }),
    null,
  );
  assert.equal(parseSubmissionEvent(null), null);
});

test("build → parse round-trips every known type", () => {
  for (const type of Object.values(SUBMISSION_TYPES)) {
    const event = buildSubmission({
      pubkey: EPHEMERAL,
      id: `rt-${type}`,
      type,
      applicantNpub: APPLICANT,
      recipientPubkey: ADMIN,
      content: `body for ${type}`,
      created_at: 5,
    });
    const parsed = parseSubmissionEvent({ ...event, id: `signed-${type}` });
    assert.equal(parsed.type, type);
    assert.equal(parsed.content, `body for ${type}`);
    assert.equal(parsed.applicant, APPLICANT);
  }
});

test("generateSubmissionId produces distinct, tag-safe ids", () => {
  const a = generateSubmissionId();
  const b = generateSubmissionId();
  assert.notEqual(a, b);
  assert.match(a, /^sub-[0-9a-z]+-[0-9a-z]+$/);
});
