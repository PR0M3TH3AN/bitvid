import {
  normalizeHashtag,
  formatHashtag,
} from "../../utils/hashtagNormalization.js";
import { devLogger } from "../../utils/logger.js";

const noop = () => {};

export class ProfileHashtagController {
  constructor(mainController) {
    this.mainController = mainController;
    this.hashtagStatusText = null;
    this.hashtagBackgroundLoading = false;
    this.hashtagInterestList = null;
    this.hashtagInterestEmpty = null;
    this.hashtagInterestInput = null;
    this.addHashtagInterestButton = null;
    this.profileHashtagInterestRefreshBtn = null;
    this.hashtagDisinterestList = null;
    this.hashtagDisinterestEmpty = null;
    this.hashtagDisinterestInput = null;
    this.addHashtagDisinterestButton = null;
    this.profileHashtagDisinterestRefreshBtn = null;

    this.hashtagPreferencesService = (this.mainController.services ? this.mainController.services.hashtagPreferences : null);
    this.describeHashtagPreferencesErrorService =
      (this.mainController.services ? this.mainController.services.describeHashtagPreferencesError : null);
    this.getHashtagPreferencesSnapshotService =
      (this.mainController.services ? this.mainController.services.getHashtagPreferences : null);
    this.hashtagPreferencesPublishInFlight = false;
    this.hashtagPreferencesPublishPromise = null;
    this.hashtagPreferencesUnsubscribe = null;
  }

  initialize() {
    if (
      this.hashtagPreferencesService &&
      typeof this.hashtagPreferencesService.on === "function"
    ) {
      this.hashtagPreferencesUnsubscribe = this.hashtagPreferencesService.on(
        "change",
        (detail) => {
          this.handleHashtagPreferencesChange({
            action:
              typeof detail?.action === "string" ? detail.action : "change",
            preferences: detail,
          });
        },
      );
    }
  }

  cacheDomReferences() {
    this.hashtagStatusText =
      document.getElementById("profileHashtagStatus") || null;
    this.hashtagInterestList =
      document.getElementById("profileHashtagInterestList") || null;
    this.hashtagInterestEmpty =
      document.getElementById("profileHashtagInterestEmpty") || null;
    this.hashtagInterestInput =
      document.getElementById("profileHashtagInterestInput") || null;
    this.addHashtagInterestButton =
      document.getElementById("profileAddHashtagInterestBtn") || null;
    this.profileHashtagInterestRefreshBtn =
      document.getElementById("profileHashtagInterestRefreshBtn") || null;

    this.hashtagDisinterestList =
      document.getElementById("profileHashtagDisinterestList") || null;
    this.hashtagDisinterestEmpty =
      document.getElementById("profileHashtagDisinterestEmpty") || null;
    this.hashtagDisinterestInput =
      document.getElementById("profileHashtagDisinterestInput") || null;
    this.addHashtagDisinterestButton =
      document.getElementById("profileAddHashtagDisinterestBtn") || null;
    this.profileHashtagDisinterestRefreshBtn =
      document.getElementById("profileHashtagDisinterestRefreshBtn") || null;
  }

  normalizeHashtagTag(value) {
    return normalizeHashtag(value);
  }

  formatHashtagTag(value) {
    return formatHashtag(value);
  }

  sanitizeHashtagList(list) {
    if (!Array.isArray(list)) {
      return [];
    }
    return list
      .map((entry) => {
        const tag = this.normalizeHashtagTag(entry);
        return tag ? tag : null;
      })
      .filter((tag) => typeof tag === "string");
  }

  getResolvedHashtagPreferences(preferences = null) {
    const fallback = {
      interests: [],
      disinterests: [],
      lastLoadError: null,
      dataReady: false,
      uiReady: false,
      loadedFromCache: false,
    };

    const getSnapshot = this.getHashtagPreferencesSnapshotService;

    if (typeof getSnapshot !== "function") {
      return fallback;
    }

    // Use passed preferences or get fresh snapshot
    const source =
      preferences && typeof preferences === "object"
        ? preferences
        : getSnapshot();

    if (!source || typeof source !== "object") {
      return fallback;
    }

    const interestsSource = Array.isArray(source.interests)
      ? source.interests
      : [];
    const disinterestsSource = Array.isArray(source.disinterests)
      ? source.disinterests
      : [];

    return {
      interests: this.sanitizeHashtagList(interestsSource),
      disinterests: this.sanitizeHashtagList(disinterestsSource),
      lastLoadError: source.lastLoadError || null,
      dataReady: source.dataReady === true,
      uiReady: source.uiReady === true,
      loadedFromCache: source.loadedFromCache === true,
    };
  }

  setHashtagStatus(message = "", tone = "muted") {
    if (!this.hashtagStatusText) {
      return;
    }

    this.hashtagStatusText.textContent = message;
    this.hashtagStatusText.className = "text-xs mt-2 empty:hidden";

    switch (tone) {
      case "info":
        this.hashtagStatusText.classList.add("text-accent");
        break;
      case "success":
        this.hashtagStatusText.classList.add("text-status-success");
        break;
      case "warning":
        this.hashtagStatusText.classList.add("text-status-warning");
        break;
      case "danger":
        this.hashtagStatusText.classList.add("text-status-danger");
        break;
      case "muted":
      default:
        this.hashtagStatusText.classList.add("text-muted");
        break;
    }
  }

  refreshHashtagBackgroundStatus() {
    if (!this.hashtagBackgroundLoading) {
      return;
    }

    const statusText = this.hashtagStatusText?.textContent?.trim?.() || "";
    if (!statusText) {
      this.setHashtagStatus("Loading in background…", "info");
      return;
    }

    if (statusText === "Loading in background…") {
      // already showing spinner message
      return;
    }
  }

  clearHashtagInputs() {
    if (this.hashtagInterestInput && typeof this.hashtagInterestInput.value === "string") {
      this.hashtagInterestInput.value = "";
    }
    if (this.hashtagDisinterestInput && typeof this.hashtagDisinterestInput.value === "string") {
      this.hashtagDisinterestInput.value = "";
    }
  }

  populateHashtagPreferences(preferences = null) {
    const snapshot = this.getResolvedHashtagPreferences(preferences);

    if (!snapshot.uiReady) {
      this.setHashtagStatus("Loading hashtag preferences…", "info");
      this.renderHashtagList("interest", []);
      this.renderHashtagList("disinterest", []);
      this.refreshHashtagBackgroundStatus();
      return;
    }

    if (!snapshot.dataReady) {
      const message = snapshot.lastLoadError
        ? "Couldn’t sync hashtag preferences. Retry to load your lists."
        : "Hashtag preferences are unavailable right now. Retry to sync.";
      this.setHashtagStatus(message, "warning");
      this.renderHashtagList("interest", []);
      this.renderHashtagList("disinterest", []);
      this.refreshHashtagBackgroundStatus();
      return;
    }

    this.renderHashtagList("interest", snapshot.interests);
    this.renderHashtagList("disinterest", snapshot.disinterests);

    if (!snapshot.interests.length && !snapshot.disinterests.length) {
      if (snapshot.loadedFromCache) {
        this.setHashtagStatus(
          "No hashtag preferences yet (showing cached state).",
          "info",
        );
      } else {
        this.setHashtagStatus("", "muted");
      }
    }
    this.refreshHashtagBackgroundStatus();
  }

  renderHashtagList(type, tags) {
    const list =
      type === "interest" ? this.hashtagInterestList : this.hashtagDisinterestList;
    const empty =
      type === "interest" ? this.hashtagInterestEmpty : this.hashtagDisinterestEmpty;

    if (!(list instanceof HTMLElement) || !(empty instanceof HTMLElement)) {
      return;
    }

    list.textContent = "";

    const normalized = this.sanitizeHashtagList(tags);
    if (!normalized.length) {
      empty.classList.remove("hidden");
      list.classList.add("hidden");
      return;
    }

    empty.classList.add("hidden");
    list.classList.remove("hidden");

    normalized.forEach((tag) => {
      const item = this.createHashtagListItem(type, tag);
      if (item) {
        list.appendChild(item);
      }
    });
  }

  createHashtagListItem(type, tag) {
    const normalized = this.normalizeHashtagTag(tag);
    if (!normalized) {
      return null;
    }

    const item = document.createElement("li");
    item.className = "profile-hashtag-item";
    item.dataset.hashtagType = type;
    item.dataset.tag = normalized;

    const label = document.createElement("span");
    label.className = "profile-hashtag-label";
    label.textContent = this.formatHashtagTag(normalized);
    item.appendChild(label);

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "profile-hashtag-remove focus-ring";
    removeButton.dataset.hashtagType = type;
    removeButton.dataset.tag = normalized;
    removeButton.setAttribute(
      "aria-label",
      type === "interest"
        ? `Remove ${this.formatHashtagTag(normalized)} from interests`
        : `Remove ${this.formatHashtagTag(normalized)} from disinterests`,
    );
    const icon = document.createElement("span");
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = "\u00D7";
    removeButton.appendChild(icon);
    removeButton.addEventListener("click", () => {
      void this.handleRemoveHashtagPreference(type, normalized);
    });

    item.appendChild(removeButton);

    return item;
  }

  async persistHashtagPreferences(options = {}) {
    const service = this.hashtagPreferencesService;
    const publish =
      service && typeof service.publish === "function" ? service.publish : null;

    if (!publish) {
      const message = this.describeHashtagPreferencesError(null, {
        fallbackMessage: "Hashtag preferences are unavailable right now.",
      });
      if (message) {
        this.mainController.showError(message);
        this.setHashtagStatus(message, "warning");
      }
      const error = new Error(
        message || "Hashtag preferences are unavailable right now.",
      );
      error.code = "service-unavailable";
      throw error;
    }

    if (this.hashtagPreferencesPublishInFlight) {
      return this.hashtagPreferencesPublishPromise;
    }

    const { successMessage, pubkey, progressMessage } =
      options && typeof options === "object" ? options : {};

    const resolvedPubkeyCandidate =
      typeof pubkey === "string" && pubkey.trim()
        ? pubkey
        : this.mainController.getActivePubkey();
    const normalizedPubkey = this.mainController.normalizeHexPubkey(resolvedPubkeyCandidate);

    const payload = normalizedPubkey ? { pubkey: normalizedPubkey } : {};

    const pendingMessage =
      typeof progressMessage === "string" && progressMessage.trim()
        ? progressMessage.trim()
        : "Saving hashtag preferences…";
    const finalMessage =
      typeof successMessage === "string" && successMessage.trim()
        ? successMessage.trim()
        : "Hashtag preferences saved.";

    this.hashtagPreferencesPublishInFlight = true;
    this.setHashtagStatus(pendingMessage, "info");

    const publishPromise = (async () => {
      try {
        const result = await publish.call(service, payload);
        this.setHashtagStatus(finalMessage, "success");
        return result;
      } catch (error) {
        const failure =
          error instanceof Error ? error : new Error(String(error || ""));
        if (!failure.code) {
          failure.code = "hashtag-preferences-publish-failed";
        }
        const message = this.describeHashtagPreferencesError(failure, {
          fallbackMessage:
            "Failed to update hashtag preferences. Please try again.",
        });
        if (message) {
          this.mainController.showError(message);
          this.setHashtagStatus(message, "warning");
        }
        throw failure;
      } finally {
        this.hashtagPreferencesPublishInFlight = false;
        this.hashtagPreferencesPublishPromise = null;
      }
    })();

    this.hashtagPreferencesPublishPromise = publishPromise;
    return publishPromise;
  }

  async handleAddHashtagPreference(type) {
    const isInterest = type === "interest";
    const input = isInterest
      ? this.hashtagInterestInput
      : this.hashtagDisinterestInput;

    const rawValue =
      input && typeof input.value === "string" ? input.value || "" : "";
    const normalized = this.normalizeHashtagTag(rawValue);

    if (!(input && typeof input.value === "string")) {
      return { success: false, reason: "missing-input" };
    }

    if (!normalized) {
      const message = "Enter a hashtag to add.";
      this.mainController.showError(message);
      this.setHashtagStatus(message, "warning");
      return { success: false, reason: "empty" };
    }

    const service = this.hashtagPreferencesService;
    const addMethod = isInterest
      ? service?.addInterest
      : service?.addDisinterest;

    if (typeof addMethod !== "function") {
      const message = "Hashtag preferences are unavailable right now.";
      this.mainController.showError(message);
      this.setHashtagStatus(message, "warning");
      return { success: false, reason: "service-unavailable" };
    }

    const snapshot = this.getResolvedHashtagPreferences();
    const alreadyInTarget = isInterest
      ? snapshot.interests.includes(normalized)
      : snapshot.disinterests.includes(normalized);
    const inOpposite = isInterest
      ? snapshot.disinterests.includes(normalized)
      : snapshot.interests.includes(normalized);

    let result = false;
    try {
      result = addMethod.call(service, normalized);
    } catch (error) {
      const message = this.describeHashtagPreferencesError(error, {
        fallbackMessage: "Failed to update hashtag preferences. Please try again.",
      });
      if (message) {
        this.mainController.showError(message);
        this.setHashtagStatus(message, "warning");
      }
      return { success: false, reason: error?.code || "service-error", error };
    } finally {
      if (input) {
        input.value = "";
      }
    }

    if (result) {
      const actionMessage = inOpposite
        ? `${this.formatHashtagTag(normalized)} moved to ${
            isInterest ? "interests" : "disinterests"
          }.`
        : `${this.formatHashtagTag(normalized)} added to ${
            isInterest ? "interests" : "disinterests"
          }.`;
      this.populateHashtagPreferences();
      try {
        await this.persistHashtagPreferences({
          successMessage: actionMessage,
        });
        this.mainController.showSuccess(actionMessage);
        return { success: true, reason: inOpposite ? "moved" : "added" };
      } catch (error) {
        return {
          success: false,
          reason: error?.code || "publish-failed",
          error,
        };
      } finally {
        this.populateHashtagPreferences();
      }
    }

    if (alreadyInTarget) {
      const message = `${this.formatHashtagTag(normalized)} is already in your ${
        isInterest ? "interests" : "disinterests"
      }.`;
      this.mainController.showStatus(message);
      this.setHashtagStatus(message, "info");
      this.populateHashtagPreferences();
      return { success: false, reason: "duplicate" };
    }

    const fallbackMessage = this.describeHashtagPreferencesError(null, {
      fallbackMessage: `Failed to add ${this.formatHashtagTag(normalized)}.`,
    });
    if (fallbackMessage) {
      this.mainController.showError(fallbackMessage);
      this.setHashtagStatus(fallbackMessage, "warning");
    }
    this.populateHashtagPreferences();
    return { success: false, reason: "no-change" };
  }

  async handleRemoveHashtagPreference(type, candidate) {
    const normalized = this.normalizeHashtagTag(candidate);
    if (!normalized) {
      return { success: false, reason: "invalid" };
    }

    const service = this.hashtagPreferencesService;
    const removeMethod =
      type === "interest"
        ? service?.removeInterest
        : service?.removeDisinterest;

    if (typeof removeMethod !== "function") {
      const message = "Hashtag preferences are unavailable right now.";
      this.mainController.showError(message);
      this.setHashtagStatus(message, "warning");
      return { success: false, reason: "service-unavailable" };
    }

    let removed = false;
    try {
      removed = removeMethod.call(service, normalized);
    } catch (error) {
      const message = this.describeHashtagPreferencesError(error, {
        fallbackMessage: `Failed to remove ${this.formatHashtagTag(normalized)}.`,
      });
      if (message) {
        this.mainController.showError(message);
        this.setHashtagStatus(message, "warning");
      }
      this.populateHashtagPreferences();
      return { success: false, reason: error?.code || "service-error", error };
    }

    if (removed) {
      const message = `${this.formatHashtagTag(normalized)} removed from ${
        type === "interest" ? "interests" : "disinterests"
      }.`;
      this.populateHashtagPreferences();
      try {
        await this.persistHashtagPreferences({ successMessage: message });
        this.mainController.showSuccess(message);
      } catch (error) {
        return {
          success: false,
          reason: error?.code || "publish-failed",
          error,
        };
      } finally {
        this.populateHashtagPreferences();
      }
    } else {
      const message = `${this.formatHashtagTag(normalized)} is already removed.`;
      this.mainController.showStatus(message);
      this.setHashtagStatus(message, "info");
    }

    this.populateHashtagPreferences();
    return { success: removed, reason: removed ? "removed" : "already-removed" };
  }

  handleHashtagPreferencesChange(detail = {}) {
    const preferences =
      detail && typeof detail.preferences === "object"
        ? detail.preferences
        : detail;
    const action = typeof detail?.action === "string" ? detail.action : "";

    if (action === "background-loading") {
      this.hashtagBackgroundLoading = true;
      this.setHashtagStatus("Loading in background…", "info");
    } else if (
      (action === "sync" || action === "background-loaded" || action === "reset") &&
      this.hashtagBackgroundLoading
    ) {
      const statusText = this.hashtagStatusText?.textContent?.trim?.() || "";
      if (statusText === "Loading in background…") {
        this.setHashtagStatus("", "muted");
      }
      this.hashtagBackgroundLoading = false;
    }

    this.populateHashtagPreferences(preferences);
    this.refreshHashtagBackgroundStatus();
  }

  describeHashtagPreferencesError(error, options = {}) {
    const describe = this.describeHashtagPreferencesErrorService;

    if (typeof describe !== "function") {
      const fallback =
        options && typeof options.fallbackMessage === "string"
          ? options.fallbackMessage
          : "An error occurred with hashtag preferences.";
      return fallback;
    }

    try {
      return describe(error, options);
    } catch (err) {
      devLogger.warn(
        "[ProfileModalController] describeHashtagPreferencesError service threw:",
        err,
      );
      return (
        options && typeof options.fallbackMessage === "string"
          ? options.fallbackMessage
          : "An error occurred."
      );
    }
  }
}
