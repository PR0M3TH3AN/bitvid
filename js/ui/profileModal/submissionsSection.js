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
  const editorHexes = (accessControl.getEditors?.() || [])
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
    const body = document.createElement("p");
    body.className = "submission-card__body";
    body.textContent = submission.content;
    li.appendChild(body);
  }

  const actions = document.createElement("div");
  actions.className = "submission-card__actions";
  // Approve (add to whitelist) only applies to whitelist applications.
  if (submission.type === "application" && submission.applicant) {
    const approve = document.createElement("button");
    approve.type = "button";
    approve.className = "btn focus-ring";
    approve.dataset.size = "sm";
    approve.dataset.submissionAction = "approve";
    approve.textContent = "Approve";
    actions.appendChild(approve);
  }
  const deny = document.createElement("button");
  deny.type = "button";
  deny.className = "btn-ghost focus-ring";
  deny.dataset.size = "sm";
  deny.dataset.submissionAction = "deny";
  deny.textContent = submission.type === "application" ? "Deny" : "Dismiss";
  actions.appendChild(deny);
  li.appendChild(actions);

  return li;
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
  if (button.dataset.submissionAction === "approve") {
    void approveSubmission(controller, submission);
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
  } catch (error) {
    devLogger.warn("[profileModal] Approve submission failed:", error);
    controller.mainController.showError?.("Couldn't approve — please try again.");
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
  } catch (error) {
    devLogger.warn("[profileModal] Deny submission failed:", error);
    controller.mainController.showError?.("Couldn't dismiss — please try again.");
    void populateSubmissions(controller);
  }
}
