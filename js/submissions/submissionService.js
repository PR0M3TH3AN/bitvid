// js/submissions/submissionService.js
//
// Structured bitvid submissions (#23) — pure core. A submission is a public,
// addressable kind-30083 event (SUBMISSION_KIND) published from an ephemeral key
// so a public form needs no login; the `applicant` tag carries the CLAIMED npub
// an admin vouches for. This module builds/parses those events with no relay or
// signer, so it's fully unit-testable. Fetch/publish/approve/deny live in the
// facade that wires this to the live client.

import { buildSubmissionEvent, SUBMISSION_KIND } from "../nostrEventSchemas.js";

export { SUBMISSION_KIND };

export const SUBMISSION_TYPES = Object.freeze({
  APPLICATION: "application",
  APPEAL: "appeal",
  BUG: "bug",
  FEATURE: "feature",
  FEEDBACK: "feedback",
});

const KNOWN_TYPES = new Set(Object.values(SUBMISSION_TYPES));

// Human labels for the admin UI.
export const SUBMISSION_TYPE_LABELS = Object.freeze({
  application: "Whitelist application",
  appeal: "Content appeal",
  bug: "Bug report",
  feature: "Feature request",
  feedback: "Feedback",
  other: "Submission",
});

function firstTagValue(tags, name) {
  const tag = tags.find(
    (t) => Array.isArray(t) && t[0] === name && typeof t[1] === "string",
  );
  return tag ? tag[1] : "";
}

const HEX_EVENT_ID_REGEX = /^[0-9a-f]{64}$/i;

// The `e` tag on an appeal points at the blocked video's event id. We only trust
// a well-formed 64-char hex id — the admin approve path feeds it straight into
// the event block list.
function firstEventTarget(tags) {
  for (const tag of tags) {
    if (Array.isArray(tag) && tag[0] === "e" && typeof tag[1] === "string") {
      const id = tag[1].trim().toLowerCase();
      if (HEX_EVENT_ID_REGEX.test(id)) {
        return id;
      }
    }
  }
  return "";
}

/**
 * Parse a kind-30083 event into a structured submission. Returns null for a
 * non-submission event or one missing a `d` identifier.
 * @param {Object} event
 * @returns {null | {
 *   id: string, eventId: string, type: string, applicant: string,
 *   targetEventId: string, recipient: string, content: string,
 *   createdAt: number, pubkey: string,
 * }}
 */
export function parseSubmissionEvent(event) {
  if (!event || typeof event !== "object" || !Array.isArray(event.tags)) {
    return null;
  }
  if (Number.isFinite(event.kind) && event.kind !== SUBMISSION_KIND) {
    return null;
  }
  const tags = event.tags;
  const id = firstTagValue(tags, "d").trim();
  if (!id) {
    return null;
  }
  const rawType = firstTagValue(tags, "k").trim() || "application";
  return {
    id,
    eventId: typeof event.id === "string" ? event.id : "",
    type: KNOWN_TYPES.has(rawType) ? rawType : "other",
    applicant: firstTagValue(tags, "applicant").trim(),
    targetEventId: firstEventTarget(tags),
    recipient: firstTagValue(tags, "p").trim(),
    content: typeof event.content === "string" ? event.content : "",
    createdAt: Number.isFinite(event.created_at) ? event.created_at : 0,
    pubkey:
      typeof event.pubkey === "string" ? event.pubkey.trim().toLowerCase() : "",
  };
}

/**
 * Build an unsigned, signable submission event.
 * @param {{
 *   pubkey: string, id: string, type?: string, applicantNpub?: string,
 *   recipientPubkey?: string, content?: string, created_at?: number,
 * }} submission
 * @returns {Object} unsigned kind-30083 event
 */
export function buildSubmission({
  pubkey,
  id,
  type = "application",
  applicantNpub = "",
  recipientPubkey = "",
  content = "",
  created_at,
} = {}) {
  return buildSubmissionEvent({
    pubkey,
    created_at: Number.isFinite(created_at)
      ? created_at
      : Math.floor(Date.now() / 1000),
    dTagValue: id,
    submissionType: type,
    applicantNpub,
    recipientPubkey,
    content,
  });
}

/** Generate a stable-ish submission id for the `d` tag. */
export function generateSubmissionId() {
  const time = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 10);
  return `sub-${time}-${rand}`;
}

export default {
  SUBMISSION_KIND,
  SUBMISSION_TYPES,
  SUBMISSION_TYPE_LABELS,
  parseSubmissionEvent,
  buildSubmission,
  generateSubmissionId,
};
