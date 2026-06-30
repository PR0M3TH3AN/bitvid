// Per-event (per-video) admin block action (#25) for the ⋯ menu. Editor-gated; adds
// the video's event id to the published admin event-blacklist and refreshes the grids.
// Extracted from moreMenuController so that large file stays under its size cap.

import { userLogger } from "../../utils/logger.js";

export async function handleBlacklistEventAction({
  accessControl,
  callbacks,
  dataset = {},
  currentVideo = null,
} = {}) {
  const actorNpub = callbacks.getCurrentUserNpub?.();
  if (!actorNpub) {
    callbacks.showError?.("Please login as a moderator to block a video.");
    return;
  }
  try {
    await accessControl?.ensureReady?.();
  } catch (error) {
    userLogger.warn("Failed to refresh moderation state before event block:", error);
  }
  if (!accessControl?.canEditAdminLists?.(actorNpub)) {
    callbacks.showError?.("Only moderators can block a video.");
    return;
  }
  const eventId =
    (typeof dataset.eventId === "string" && dataset.eventId.trim()) ||
    currentVideo?.id ||
    "";
  if (!eventId) {
    callbacks.showError?.("Unable to determine which video to block.");
    return;
  }
  try {
    const result = await accessControl.addToEventBlacklist(actorNpub, eventId);
    if (result?.ok) {
      callbacks.showSuccess?.("Video added to the block list.");
      await callbacks
        .refreshAllVideoGrids?.({
          reason: "admin-event-blacklist-update",
          forceMainReload: true,
        })
        .catch(() => {});
    } else {
      callbacks.showError?.(
        result?.error === "forbidden"
          ? "Only moderators can block a video."
          : "Failed to block the video. Please try again.",
      );
    }
  } catch (error) {
    userLogger.error("Failed to add video to event blacklist:", error);
    callbacks.showError?.("Failed to block the video. Please try again.");
  }
}
