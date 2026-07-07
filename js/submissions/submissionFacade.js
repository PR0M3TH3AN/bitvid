// js/submissions/submissionFacade.js
//
// Network wiring for structured submissions (#23). Submissions are authored by a
// throwaway EPHEMERAL key, so an admin can't NIP-09-delete them (relays only
// honor same-author deletions). "Handled" state therefore lives in an
// admin-authored RESOLVED-SET: an addressable kind-30000 list (one per acting
// moderator, d = bitvid:admin:submissions-resolved) whose `e` tags are the
// resolved submission event ids. Pending = submissions to the admin minus the
// union of every editor's resolved-set — so any moderator's action clears it for
// all. All entry points take an injectable client for testing.

import { nostrClient } from "../nostrClientFacade.js";
import {
  SUBMISSION_KIND,
  parseSubmissionEvent,
} from "./submissionService.js";
import { devLogger } from "../utils/logger.js";

export const RESOLVED_LIST_KIND = 30000;
export const SUBMISSIONS_RESOLVED_DTAG = "bitvid:admin:submissions-resolved";
const LIST_LIMIT = 500;

function normHex(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function getManagerAndRelays(client) {
  const manager =
    typeof client?.getSubscriptionManager === "function"
      ? client.getSubscriptionManager()
      : null;
  const relays = Array.isArray(client?.relays) ? client.relays : [];
  return { manager, relays };
}

function newestByCreatedAt(events) {
  let newest = null;
  for (const event of Array.isArray(events) ? events : []) {
    if (!newest || (Number(event?.created_at) || 0) > (Number(newest.created_at) || 0)) {
      newest = event;
    }
  }
  return newest;
}

/**
 * Fetch the PENDING submissions addressed to an admin: parsed, deduped by
 * applicant (newest wins), and excluding any already in an editor's resolved-set.
 * @param {{ adminHex: string, editorHexes?: string[], client?: any }} opts
 * @returns {Promise<Array>} pending submissions, newest-first
 */
export async function fetchPendingSubmissions({
  adminHex,
  editorHexes = [],
  client = nostrClient,
} = {}) {
  const admin = normHex(adminHex);
  if (!admin) {
    return [];
  }
  const { manager, relays } = getManagerAndRelays(client);
  if (!manager || typeof manager.list !== "function" || !relays.length) {
    return [];
  }

  let subEvents = [];
  try {
    subEvents = await manager.list({
      relays,
      filters: [{ kinds: [SUBMISSION_KIND], "#p": [admin], limit: LIST_LIMIT }],
    });
  } catch (error) {
    devLogger.warn("[submissions] Failed to list submissions:", error);
    return [];
  }

  const resolvedIds = await fetchResolvedIds({
    editorHexes: [admin, ...editorHexes],
    manager,
    relays,
  });

  const parsed = (Array.isArray(subEvents) ? subEvents : [])
    .map(parseSubmissionEvent)
    .filter((s) => s && s.eventId && !resolvedIds.has(s.eventId))
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  // Dedupe by claimed applicant (newest already first); fall back to id.
  const byApplicant = new Map();
  for (const submission of parsed) {
    const key = submission.applicant || submission.id;
    if (!byApplicant.has(key)) {
      byApplicant.set(key, submission);
    }
  }
  return [...byApplicant.values()];
}

/**
 * Look up a single event by id and return its author's hex pubkey (or "").
 * The appeal-approval flow uses this to discover WHY a video is hidden — the
 * event's own pubkey is the authoritative author, so we don't rely on the
 * appellant to supply it.
 * @param {{ eventId: string, client?: any }} opts
 * @returns {Promise<string>} lowercased author hex, or "" if not found
 */
export async function resolveEventAuthorHex({ eventId, client = nostrClient } = {}) {
  const id = normHex(eventId);
  if (!id) {
    return "";
  }
  const { manager, relays } = getManagerAndRelays(client);
  if (!manager || typeof manager.list !== "function" || !relays.length) {
    return "";
  }
  try {
    const events = await manager.list({
      relays,
      filters: [{ ids: [id], limit: 1 }],
    });
    const found = (Array.isArray(events) ? events : []).find(
      (event) => normHex(event?.id) === id,
    );
    return found && typeof found.pubkey === "string"
      ? found.pubkey.trim().toLowerCase()
      : "";
  } catch (error) {
    devLogger.warn("[submissions] Failed to resolve event author:", error);
    return "";
  }
}

async function fetchResolvedIds({ editorHexes, manager, relays }) {
  const authors = [...new Set(editorHexes.map(normHex).filter(Boolean))];
  const ids = new Set();
  if (!authors.length) {
    return ids;
  }
  let events = [];
  try {
    events = await manager.list({
      relays,
      filters: [
        {
          kinds: [RESOLVED_LIST_KIND],
          authors,
          "#d": [SUBMISSIONS_RESOLVED_DTAG],
          limit: 200,
        },
      ],
    });
  } catch (error) {
    devLogger.warn("[submissions] Failed to list resolved-sets:", error);
    return ids;
  }
  for (const event of Array.isArray(events) ? events : []) {
    for (const tag of event?.tags || []) {
      if (Array.isArray(tag) && tag[0] === "e" && tag[1]) {
        ids.add(tag[1]);
      }
    }
  }
  return ids;
}

/**
 * Mark a submission handled by adding its event id to the ACTING moderator's
 * resolved-set (read-modify-write the addressable list, then republish). Records
 * the status (approved/denied) and applicant in the tag for a light audit trail.
 * @param {{ submission: Object, status?: "approved"|"denied", actingHex: string, client?: any }} opts
 * @returns {Promise<Object|null>} the signed resolved-set event
 */
export async function markSubmissionResolved({
  submission,
  status = "approved",
  actingHex,
  client = nostrClient,
} = {}) {
  const acting = normHex(actingHex);
  const eventId =
    typeof submission?.eventId === "string" ? submission.eventId : "";
  if (!acting || !eventId) {
    return null;
  }

  const { manager, relays } = getManagerAndRelays(client);
  let current = null;
  if (manager && typeof manager.list === "function" && relays.length) {
    try {
      const events = await manager.list({
        relays,
        filters: [
          {
            kinds: [RESOLVED_LIST_KIND],
            authors: [acting],
            "#d": [SUBMISSIONS_RESOLVED_DTAG],
            limit: 5,
          },
        ],
      });
      current = newestByCreatedAt(events);
    } catch (error) {
      // best effort — start a fresh list
    }
  }

  const tags = [["d", SUBMISSIONS_RESOLVED_DTAG]];
  const seen = new Set();
  for (const tag of current?.tags || []) {
    if (Array.isArray(tag) && tag[0] === "e" && tag[1] && !seen.has(tag[1])) {
      seen.add(tag[1]);
      tags.push(["e", tag[1], tag[2] || "", tag[3] || ""]);
    }
  }
  if (!seen.has(eventId)) {
    tags.push(["e", eventId, status, submission.applicant || ""]);
  }
  tags.push(["client", "bitvid"]);

  const event = {
    kind: RESOLVED_LIST_KIND,
    pubkey: acting,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content: "",
  };
  const result = await client.signAndPublishEvent(event, {
    context: "submission-resolved",
  });
  return result?.signedEvent || null;
}

export default {
  RESOLVED_LIST_KIND,
  SUBMISSIONS_RESOLVED_DTAG,
  fetchPendingSubmissions,
  markSubmissionResolved,
  resolveEventAuthorHex,
};
