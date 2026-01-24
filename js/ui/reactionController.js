import { devLogger } from "../utils/logger.js";
import { pointerArrayToKey } from "../utils/pointer.js";

export default class ReactionController {
  constructor({ services = {}, ui = {}, state = {}, callbacks = {} } = {}) {
    this.services = {
      reactionCounter: services.reactionCounter,
    };
    this.ui = {
      getVideoModal: ui.getVideoModal || (() => null),
      showError: ui.showError || (() => {}),
    };
    this.state = {
      getCurrentVideo: state.getCurrentVideo || (() => null),
      getCurrentVideoPointer: state.getCurrentVideoPointer || (() => null),
      getCurrentVideoPointerKey: state.getCurrentVideoPointerKey || (() => null),
    };
    this.callbacks = {
      isUserLoggedIn: callbacks.isUserLoggedIn || (() => false),
      normalizeHexPubkey: callbacks.normalizeHexPubkey || ((val) => val),
      getPubkey: callbacks.getPubkey || (() => null),
    };

    this.reactionState = {
      counts: { "+": 0, "-": 0 },
      total: 0,
      userReaction: "",
    };
    this.unsub = null;
    this.pointerKey = null;
  }

  normalizeReactionCount(value) {
    if (Number.isFinite(value)) {
      return Math.max(0, Math.round(Number(value)));
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
  }

  resetState() {
    this.reactionState = {
      counts: { "+": 0, "-": 0 },
      total: 0,
      userReaction: "",
    };
    const videoModal = this.ui.getVideoModal();
    if (videoModal?.updateReactionSummary) {
      videoModal.updateReactionSummary({
        total: 0,
        counts: { "+": 0, "-": 0 },
        userReaction: "",
      });
    }
  }

  unsubscribe() {
    if (typeof this.unsub === "function") {
      try {
        this.unsub();
      } catch (error) {
        devLogger.warn(
          "[reaction] Failed to tear down modal subscription:",
          error,
        );
      }
    }
    this.unsub = null;
    this.pointerKey = null;
    this.resetState();
  }

  subscribe(pointer, pointerKey) {
    const videoModal = this.ui.getVideoModal();
    if (!videoModal?.updateReactionSummary) {
      this.unsubscribe();
      return;
    }

    this.unsubscribe();

    if (!pointer || !pointerKey) {
      return;
    }

    try {
      const normalizedUser = this.callbacks.normalizeHexPubkey(this.callbacks.getPubkey());
      const unsubscribe = this.services.reactionCounter.subscribe(pointer, (snapshot) => {
        const counts = { ...this.reactionState.counts };
        if (snapshot?.counts && typeof snapshot.counts === "object") {
          for (const [key, value] of Object.entries(snapshot.counts)) {
            counts[key] = this.normalizeReactionCount(value);
          }
        }
        if (!Object.prototype.hasOwnProperty.call(counts, "+")) {
          counts["+"] = 0;
        }
        if (!Object.prototype.hasOwnProperty.call(counts, "-")) {
          counts["-"] = 0;
        }

        let total = Number.isFinite(snapshot?.total)
          ? Math.max(0, Number(snapshot.total))
          : 0;
        if (!Number.isFinite(total) || total === 0) {
          total = 0;
          for (const value of Object.values(counts)) {
            total += this.normalizeReactionCount(value);
          }
        }

        let userReaction = "";
        if (normalizedUser && snapshot?.reactions) {
          const record = snapshot.reactions[normalizedUser] || null;
          if (record && typeof record.content === "string") {
            userReaction =
              record.content === "+"
                ? "+"
                : record.content === "-"
                  ? "-"
                  : "";
          }
        }

        this.reactionState = {
          counts,
          total,
          userReaction,
        };

        const currentModal = this.ui.getVideoModal();
        if (currentModal?.updateReactionSummary) {
          currentModal.updateReactionSummary({
            total,
            counts,
            userReaction,
          });
        }
      });

      this.pointerKey = pointerKey;
      this.unsub = () => {
        try {
          unsubscribe?.();
        } catch (error) {
          devLogger.warn(
            "[reaction] Failed to tear down modal subscription:",
            error,
          );
        } finally {
          this.unsub = null;
          this.pointerKey = null;
        }
      };
    } catch (error) {
      devLogger.warn(
        "[reaction] Failed to subscribe modal reaction counter:",
        error,
      );
      this.resetState();
    }
  }

  applyOptimisticUpdate(nextReaction) {
    if (nextReaction !== "+" && nextReaction !== "-") {
      return null;
    }

    const previousCounts = {
      ...(this.reactionState?.counts || {}),
    };
    const previousTotalValue = Number.isFinite(this.reactionState?.total)
      ? Math.max(0, Number(this.reactionState.total))
      : null;
    const previousReaction = this.reactionState?.userReaction || "";

    const likeBefore = this.normalizeReactionCount(previousCounts["+"]);
    const dislikeBefore = this.normalizeReactionCount(previousCounts["-"]);
    const otherCounts = {};
    for (const [key, value] of Object.entries(previousCounts)) {
      if (key === "+" || key === "-") {
        continue;
      }
      otherCounts[key] = this.normalizeReactionCount(value);
    }

    let likeCount = likeBefore;
    let dislikeCount = dislikeBefore;

    if (previousReaction === "+") {
      likeCount = Math.max(0, likeCount - 1);
    } else if (previousReaction === "-") {
      dislikeCount = Math.max(0, dislikeCount - 1);
    }

    if (nextReaction === "+") {
      likeCount += 1;
    } else if (nextReaction === "-") {
      dislikeCount += 1;
    }

    const updatedCounts = {
      ...previousCounts,
      "+": likeCount,
      "-": dislikeCount,
    };

    let updatedTotal = likeCount + dislikeCount;
    for (const value of Object.values(otherCounts)) {
      updatedTotal += this.normalizeReactionCount(value);
    }

    this.reactionState = {
      counts: updatedCounts,
      total: updatedTotal,
      userReaction: nextReaction,
    };

    const videoModal = this.ui.getVideoModal();
    if (videoModal?.updateReactionSummary) {
      videoModal.updateReactionSummary({
        total: updatedTotal,
        counts: updatedCounts,
        userReaction: nextReaction,
      });
    }

    const fallbackPreviousTotal = Number.isFinite(previousTotalValue)
      ? previousTotalValue
      : likeBefore +
        dislikeBefore +
        Object.values(otherCounts).reduce(
          (sum, value) => sum + this.normalizeReactionCount(value),
          0
        );

    return {
      counts: previousCounts,
      total: fallbackPreviousTotal,
      userReaction: previousReaction,
    };
  }

  restoreSnapshot(snapshot) {
    if (!snapshot) {
      return;
    }

    const countsInput =
      snapshot.counts && typeof snapshot.counts === "object"
        ? snapshot.counts
        : {};
    const counts = { ...countsInput };
    for (const [key, value] of Object.entries(counts)) {
      counts[key] = this.normalizeReactionCount(value);
    }
    if (!Object.prototype.hasOwnProperty.call(counts, "+")) {
      counts["+"] = 0;
    }
    if (!Object.prototype.hasOwnProperty.call(counts, "-")) {
      counts["-"] = 0;
    }

    let total = Number.isFinite(snapshot.total)
      ? Math.max(0, Number(snapshot.total))
      : 0;
    if (!Number.isFinite(total) || total === 0) {
      total = 0;
      for (const value of Object.values(counts)) {
        total += this.normalizeReactionCount(value);
      }
    }

    const userReaction =
      snapshot.userReaction === "+"
        ? "+"
        : snapshot.userReaction === "-"
          ? "-"
          : "";

    this.reactionState = {
      counts,
      total,
      userReaction,
    };

    const videoModal = this.ui.getVideoModal();
    if (videoModal?.updateReactionSummary) {
      videoModal.updateReactionSummary({
        total,
        counts,
        userReaction,
      });
    }
  }

  async handleReaction(detail = {}) {
    const videoModal = this.ui.getVideoModal();
    if (!videoModal) {
      return;
    }

    const requestedReaction =
      typeof detail.reaction === "string" ? detail.reaction : "";
    const normalizedReaction =
      requestedReaction === "+"
        ? "+"
        : requestedReaction === "-"
          ? "-"
          : "";

    if (!normalizedReaction) {
      return;
    }

    const previousReaction = this.reactionState?.userReaction || "";
    const pointer = this.state.getCurrentVideoPointer();
    const pointerKey = this.state.getCurrentVideoPointerKey() || (pointer ? pointerArrayToKey(pointer) : null);

    if (!pointer || !pointerKey) {
      if (videoModal) {
        videoModal.setUserReaction(previousReaction);
      }
      devLogger.info(
        "[reaction] Ignoring reaction request until modal pointer is available.",
      );
      return;
    }
    if (normalizedReaction === previousReaction) {
      return;
    }

    if (!this.callbacks.isUserLoggedIn()) {
      this.ui.showError("Please login to react to videos.");
      videoModal.setUserReaction(previousReaction);
      return;
    }

    let rollbackSnapshot = null;
    try {
      rollbackSnapshot = this.applyOptimisticUpdate(
        normalizedReaction
      );
    } catch (error) {
      devLogger.warn("[reaction] Failed to apply optimistic reaction state:", error);
    }

    try {
      const currentVideo = this.state.getCurrentVideo();
      const result = await this.services.reactionCounter.publish(pointer, {
        content: normalizedReaction,
        video: currentVideo,
        currentVideoPubkey: currentVideo?.pubkey,
        pointerKey,
      });

      if (!result?.ok) {
        if (rollbackSnapshot) {
          this.restoreSnapshot(rollbackSnapshot);
        }
        this.ui.showError("Failed to send reaction. Please try again.");
      }
    } catch (error) {
      devLogger.warn("[reaction] Failed to publish reaction:", error);
      if (rollbackSnapshot) {
        this.restoreSnapshot(rollbackSnapshot);
      }
      this.ui.showError("Failed to send reaction. Please try again.");
    }
  }
}
