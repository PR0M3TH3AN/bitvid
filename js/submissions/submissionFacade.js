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
import { publishEventToRelays } from "../nostrPublish.js";
import { devLogger } from "../utils/logger.js";

export const RESOLVED_LIST_KIND = 30000;
export const SUBMISSIONS_RESOLVED_DTAG = "bitvid:admin:submissions-resolved";
const LIST_LIMIT = 500;
const LOCAL_RESOLVED_KEY = "bitvid:admin:submissions-resolved-ids";

function normHex(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function normNpub(value) {
  return typeof value === "string" ? value.trim() : "";
}

// A device-local, ever-growing set of resolved submission ids. It backs up the
// relay resolved-set two ways: (1) it hides handled items even if a cold-load
// relay read momentarily misses the list, and (2) it makes the read-modify-write
// in markSubmissionResolved loss-proof — a missed read can't republish a shrunk
// list. Cleared with site data (that's fine; the mirrored relay list restores).
function getLocalResolvedIds() {
  try {
    if (typeof localStorage === "undefined") {
      return new Set();
    }
    const raw = localStorage.getItem(LOCAL_RESOLVED_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set(
      Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string" && id) : [],
    );
  } catch (error) {
    return new Set();
  }
}

function addLocalResolvedIds(ids) {
  try {
    if (typeof localStorage === "undefined") {
      return;
    }
    const set = getLocalResolvedIds();
    let changed = false;
    for (const id of ids || []) {
      if (id && !set.has(id)) {
        set.add(id);
        changed = true;
      }
    }
    if (changed) {
      localStorage.setItem(LOCAL_RESOLVED_KEY, JSON.stringify([...set]));
    }
  } catch (error) {
    // best effort — local backup must never break the flow
  }
}

function getManagerAndRelays(client) {
  const manager =
    typeof client?.getSubscriptionManager === "function"
      ? client.getSubscriptionManager()
      : null;
  const relays = Array.isArray(client?.relays) ? client.relays : [];
  return { manager, relays };
}

// Re-broadcast signed events to our relays so aggressive relay pruning doesn't
// quietly drop them. Used for both pending submissions (ephemeral-authored, no
// social graph → pruned fast) and the admin resolved-set (so the "handled" list
// stays alive). A signed event can be re-published by anyone. Best-effort and
// fire-and-forget — never blocks or fails a fetch.
function mirrorEventsToRelays(rawEvents, client) {
  try {
    const pool = client?.pool;
    const relays = Array.isArray(client?.relays) ? client.relays : [];
    if (!pool || !relays.length || !Array.isArray(rawEvents) || !rawEvents.length) {
      return;
    }
    for (const event of rawEvents) {
      Promise.resolve()
        .then(() => publishEventToRelays(pool, relays, event))
        .catch(() => {});
    }
  } catch (error) {
    // best effort — mirroring must never break the submissions view
  }
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
 * applicant (newest wins), and excluding anything already handled — via the
 * relay resolved-set, the device-local resolved cache, OR (for applications) an
 * applicant already on the whitelist.
 * @param {{
 *   adminHex: string, editorHexes?: string[], whitelistNpubs?: string[], client?: any,
 * }} opts
 * @returns {Promise<Array>} pending submissions, newest-first
 */
export async function fetchPendingSubmissions({
  adminHex,
  editorHexes = [],
  whitelistNpubs = [],
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

  // Handled = union of (relay resolved-sets) + (device-local resolved cache).
  const resolvedEvents = await fetchResolvedSets({
    editorHexes: [admin, ...editorHexes],
    manager,
    relays,
  });
  const relayResolvedIds = collectResolvedIds(resolvedEvents);
  // Persist what the relays know into the local cache (so a later prune or a
  // cold read can't resurface them), then hide by the union of both.
  addLocalResolvedIds([...relayResolvedIds]);
  const resolvedIds = new Set([...relayResolvedIds, ...getLocalResolvedIds()]);
  // Keep the resolved-set alive on relays too — it prunes just like submissions.
  mirrorEventsToRelays(resolvedEvents, client);

  // Belt-and-suspenders: an application whose applicant is already whitelisted
  // is durably handled even if the resolved-set were lost entirely.
  const whitelisted = new Set(
    (Array.isArray(whitelistNpubs) ? whitelistNpubs : [])
      .map(normNpub)
      .filter(Boolean),
  );
  const isHandled = (submission) => {
    if (resolvedIds.has(submission.eventId)) {
      return true;
    }
    if (
      submission.type === "application" &&
      submission.applicant &&
      whitelisted.has(normNpub(submission.applicant))
    ) {
      return true;
    }
    return false;
  };

  const parsed = (Array.isArray(subEvents) ? subEvents : [])
    .map(parseSubmissionEvent)
    .filter((s) => s && s.eventId && !isHandled(s))
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  // Dedupe by claimed applicant (newest already first); fall back to id.
  const byApplicant = new Map();
  for (const submission of parsed) {
    const key = submission.applicant || submission.id;
    if (!byApplicant.has(key)) {
      byApplicant.set(key, submission);
    }
  }
  const pending = [...byApplicant.values()];

  // Refresh the still-pending events on our relays so they don't get pruned.
  const pendingIds = new Set(pending.map((submission) => submission.eventId));
  const rawPending = (Array.isArray(subEvents) ? subEvents : []).filter(
    (event) => event && pendingIds.has(event.id),
  );
  mirrorEventsToRelays(rawPending, client);

  return pending;
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

// Fetch every editor's resolved-set (raw events, so the caller can also mirror
// them to keep them alive).
async function fetchResolvedSets({ editorHexes, manager, relays }) {
  const authors = [...new Set(editorHexes.map(normHex).filter(Boolean))];
  if (!authors.length) {
    return [];
  }
  try {
    const events = await manager.list({
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
    return Array.isArray(events) ? events : [];
  } catch (error) {
    devLogger.warn("[submissions] Failed to list resolved-sets:", error);
    return [];
  }
}

// Union the `e`-tag ids across a set of resolved-set events.
function collectResolvedIds(events) {
  const ids = new Set();
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

  // Record locally FIRST so this id can never be lost, even if the read below
  // misses and the republish would otherwise shrink the list.
  addLocalResolvedIds([eventId]);

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
  // 1) Preserve existing entries (with their status/applicant audit tags).
  for (const tag of current?.tags || []) {
    if (Array.isArray(tag) && tag[0] === "e" && tag[1] && !seen.has(tag[1])) {
      seen.add(tag[1]);
      tags.push(["e", tag[1], tag[2] || "", tag[3] || ""]);
    }
  }
  // 2) The submission being resolved right now, with its audit metadata.
  if (!seen.has(eventId)) {
    seen.add(eventId);
    tags.push(["e", eventId, status, submission.applicant || ""]);
  }
  // 3) Loss-proofing: fold in every id this device knows was resolved, so a
  //    missed read can never republish a list smaller than what we've handled.
  for (const id of getLocalResolvedIds()) {
    if (id && !seen.has(id)) {
      seen.add(id);
      tags.push(["e", id]);
    }
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
