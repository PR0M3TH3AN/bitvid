// js/ui/profileModal/submissionsSection.js
//
// The admin pane's "Submissions" sub-tab (#23) logic, extracted from
// ProfileAdminController to keep that file under the size cap (mirrors
// blockedVideosSection.js). Each function takes the ProfileAdminController as
// `controller` and uses its cached DOM refs + services. Gated by
// FEATURE_SUBMISSIONS.

import {
  fetchPendingSubmissions,
  markSubmissionResolved,
} from "../../submissions/submissionFacade.js";
import { SUBMISSION_TYPE_LABELS } from "../../submissions/submissionService.js";
import { FEATURE_SUBMISSIONS } from "../../constants.js";
import { safeDecodeNpub } from "../../utils/nostrHelpers.js";
import { showConfirm } from "../confirmDialog.js";
import { devLogger } from "../../utils/logger.js";

function setLoading(controller, value) {
  if (controller.submissionsLoading) {
    controller.submissionsLoading.classList.toggle("hidden", !value);
  }
}

// Let the app recompute the profile-button "pending submissions" dot after a
// moderator approves/denies one.
function emitSubmissionsChanged() {
  try {
    document.dispatchEvent(new CustomEvent("bitvid:submissions-changed"));
  } catch (error) {
    // best effort
  }
}

export async function populateSubmissions(controller) {
  if (!FEATURE_SUBMISSIONS || !controller.submissionsList) {
    return;
  }
  const services = controller.mainController.services;
  const accessControl = services?.accessControl;
  const actorNpub = services?.getCurrentUserNpub?.() || "";
  if (!actorNpub || !accessControl?.canEditAdminLists?.(actorNpub)) {
    controller.pendingSubmissions = [];
    renderSubmissions(controller);
    return;
  }

  const adminHex = safeDecodeNpub(controller.mainController.adminSuperNpub);
  // getEditors() may return a Set (or array) — coerce before mapping.
  const editorHexes = Array.from(accessControl.getEditors?.() || [])
    .map((npub) => safeDecodeNpub(npub))
    .filter(Boolean);

  setLoading(controller, true);
  let pending = [];
  try {
    pending = await fetchPendingSubmissions({ adminHex, editorHexes });
  } catch (error) {
    devLogger.warn("[profileModal] Failed to load submissions:", error);
  }
  controller.pendingSubmissions = pending;
  setLoading(controller, false);
  renderSubmissions(controller);
}

export function renderSubmissions(controller) {
  if (!controller.submissionsList) {
    return;
  }
  controller.submissionsList.replaceChildren();
  const list = Array.isArray(controller.pendingSubmissions)
    ? controller.pendingSubmissions
    : [];
  if (controller.submissionsEmpty) {
    controller.submissionsEmpty.classList.toggle("hidden", list.length > 0);
  }
  for (const submission of list) {
    controller.submissionsList.appendChild(renderSubmissionRow(submission));
  }
}

// Render `**bold**` segments as <strong>; everything else as plain text — never
// parse HTML from the content (submissions are untrusted public events).
function appendInline(el, text) {
  const parts = String(text).split("**");
  parts.forEach((part, i) => {
    if (!part) {
      return;
    }
    if (i % 2 === 1) {
      const strong = document.createElement("strong");
      strong.textContent = part;
      el.appendChild(strong);
    } else {
      el.appendChild(document.createTextNode(part));
    }
  });
}

// Tiny, SAFE markdown-lite renderer for the form-generated body: `#…###`
// headings become bold lines, leading `- `/`* ` bullet markers are stripped,
// `**bold**` is honored inline. No HTML is ever parsed from the content.
function renderSubmissionBody(container, content) {
  for (const raw of String(content).split("\n")) {
    const line = raw.replace(/\s+$/, "");
    if (!line.trim()) {
      continue;
    }
    if (/^#{1,6}\s/.test(line)) {
      const heading = document.createElement("p");
      heading.className = "submission-card__heading";
      appendInline(heading, line.replace(/^#{1,6}\s+/, ""));
      container.appendChild(heading);
    } else {
      const p = document.createElement("p");
      p.className = "submission-card__line";
      appendInline(p, line.replace(/^[-*]\s+/, ""));
      container.appendChild(p);
    }
  }
}

function renderSubmissionRow(submission) {
  const li = document.createElement("li");
  li.className = "submission-card";
  li.dataset.submissionId = submission.eventId;

  const head = document.createElement("div");
  head.className = "submission-card__head";
  const badge = document.createElement("span");
  badge.className = "submission-card__type";
  badge.textContent =
    SUBMISSION_TYPE_LABELS[submission.type] || SUBMISSION_TYPE_LABELS.other;
  head.appendChild(badge);
  if (submission.applicant) {
    const who = document.createElement("span");
    who.className = "submission-card__applicant";
    who.textContent = submission.applicant;
    head.appendChild(who);
  }
  li.appendChild(head);

  if (submission.content) {
    const body = document.createElement("div");
    body.className = "submission-card__body";
    renderSubmissionBody(body, submission.content);
    li.appendChild(body);
  }

  const actions = document.createElement("div");
  actions.className = "submission-card__actions";
  for (const action of actionsForSubmission(submission)) {
    actions.appendChild(renderAction(action));
  }
  li.appendChild(actions);

  return li;
}

// Build a labeled button + one-line description explaining what it does.
function renderAction({ action, label, hint, primary }) {
  const wrap = document.createElement("div");
  wrap.className = "submission-card__action";
  const button = document.createElement("button");
  button.type = "button";
  button.className = `${primary ? "btn" : "btn-ghost"} focus-ring`;
  button.dataset.size = "sm";
  button.dataset.submissionAction = action;
  button.textContent = label;
  wrap.appendChild(button);
  if (hint) {
    const caption = document.createElement("span");
    caption.className = "submission-card__action-hint";
    caption.textContent = hint;
    wrap.appendChild(caption);
  }
  return wrap;
}

// The action set depends on the submission type so each button's effect is
// explicit. Only whitelist applications add to the whitelist; only appeals that
// name a real event can unblock it; everything else is just "mark handled".
function actionsForSubmission(submission) {
  if (submission.type === "application" && submission.applicant) {
    return [
      {
        action: "approve",
        label: "Approve",
        hint: "Adds the applicant to the whitelist.",
        primary: true,
      },
      {
        action: "deny",
        label: "Deny",
        hint: "Rejects the application — nothing is whitelisted.",
      },
    ];
  }
  if (submission.type === "appeal") {
    const actions = [];
    if (submission.targetEventId) {
      actions.push({
        action: "approve-appeal",
        label: "Approve & unblock",
        hint: "Removes the video from the block list so it's visible again.",
        primary: true,
      });
    }
    actions.push({
      action: "deny",
      label: submission.targetEventId ? "Keep blocked" : "Dismiss",
      hint: submission.targetEventId
        ? "Dismisses the appeal — the video stays blocked."
        : "Marks the appeal as handled (no event linked to unblock).",
    });
    return actions;
  }
  return [
    {
      action: "deny",
      label: "Mark handled",
      hint: "Marks this submission as reviewed.",
    },
  ];
}

export function handleSubmissionsClick(controller, event) {
  const button =
    event.target instanceof Element
      ? event.target.closest("[data-submission-action]")
      : null;
  if (!button) {
    return;
  }
  const card = button.closest("[data-submission-id]");
  const id = card?.dataset?.submissionId || "";
  const submission = (controller.pendingSubmissions || []).find(
    (s) => s.eventId === id,
  );
  if (!submission) {
    return;
  }
  const action = button.dataset.submissionAction;
  if (action === "approve") {
    void approveSubmission(controller, submission);
  } else if (action === "approve-appeal") {
    void approveAppeal(controller, submission);
  } else {
    void denySubmission(controller, submission);
  }
}

async function approveSubmission(controller, submission) {
  const services = controller.mainController.services;
  const accessControl = services?.accessControl;
  const actorNpub = services?.getCurrentUserNpub?.() || "";
  const applicant = submission.applicant;
  if (!actorNpub || !accessControl || !applicant) {
    return;
  }
  const ok = await showConfirm(
    `Approve ${applicant}? They'll be added to the whitelist.`,
    { title: "Approve application", confirmLabel: "Approve" },
  );
  if (!ok) {
    return;
  }
  controller.pendingSubmissions = (controller.pendingSubmissions || []).filter(
    (s) => s.eventId !== submission.eventId,
  );
  renderSubmissions(controller);
  try {
    await accessControl.addToWhitelist(actorNpub, applicant);
    await markSubmissionResolved({
      submission,
      status: "approved",
      actingHex: safeDecodeNpub(actorNpub),
    });
    controller.mainController.showSuccess?.(
      `Approved — ${applicant} added to the whitelist.`,
    );
    controller.populateAdminLists();
    emitSubmissionsChanged();
  } catch (error) {
    devLogger.warn("[profileModal] Approve submission failed:", error);
    controller.mainController.showError?.("Couldn't approve — please try again.");
    void populateSubmissions(controller);
  }
}

// Approve a content appeal: actually remove the named video from the per-event
// block list, then mark the appeal resolved. Requires a well-formed target id
// (parsed from the submission's `e` tag) — the button isn't shown without one.
async function approveAppeal(controller, submission) {
  const services = controller.mainController.services;
  const accessControl = services?.accessControl;
  const actorNpub = services?.getCurrentUserNpub?.() || "";
  const targetEventId = submission.targetEventId;
  if (!actorNpub || !accessControl || !targetEventId) {
    return;
  }
  const ok = await showConfirm(
    "Unblock this video? It'll be removed from the block list and become visible again.",
    { title: "Approve appeal", confirmLabel: "Unblock" },
  );
  if (!ok) {
    return;
  }
  controller.pendingSubmissions = (controller.pendingSubmissions || []).filter(
    (s) => s.eventId !== submission.eventId,
  );
  renderSubmissions(controller);
  try {
    const result = await accessControl.removeFromEventBlacklist(
      actorNpub,
      targetEventId,
    );
    if (!result || result.ok === false) {
      throw new Error(result?.error || "unblock-failed");
    }
    await markSubmissionResolved({
      submission,
      status: "approved",
      actingHex: safeDecodeNpub(actorNpub),
    });
    controller.mainController.showSuccess?.(
      "Appeal approved — the video has been unblocked.",
    );
    emitSubmissionsChanged();
  } catch (error) {
    devLogger.warn("[profileModal] Approve appeal failed:", error);
    controller.mainController.showError?.(
      "Couldn't unblock — please try again.",
    );
    void populateSubmissions(controller);
  }
}

async function denySubmission(controller, submission) {
  const actorNpub =
    controller.mainController.services?.getCurrentUserNpub?.() || "";
  if (!actorNpub) {
    return;
  }
  controller.pendingSubmissions = (controller.pendingSubmissions || []).filter(
    (s) => s.eventId !== submission.eventId,
  );
  renderSubmissions(controller);
  try {
    await markSubmissionResolved({
      submission,
      status: "denied",
      actingHex: safeDecodeNpub(actorNpub),
    });
    controller.mainController.showSuccess?.("Submission dismissed.");
    emitSubmissionsChanged();
  } catch (error) {
    devLogger.warn("[profileModal] Deny submission failed:", error);
    controller.mainController.showError?.("Couldn't dismiss — please try again.");
    void populateSubmissions(controller);
  }
}
