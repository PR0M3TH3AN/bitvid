import { devLogger } from "../../utils/logger.js";

const noop = () => {};

export function cacheDmRelayElements(controller) {
  controller.dmController.profileMessagesRelayList =
    document.getElementById("profileMessagesRelayList") || null;
  controller.dmController.profileMessagesRelayInput =
    document.getElementById("profileMessagesRelayInput") || null;
  controller.dmController.profileMessagesRelayAddButton =
    document.getElementById("profileMessagesRelayAdd") || null;
  controller.dmController.profileMessagesRelayPublishButton =
    document.getElementById("profileMessagesRelayPublish") || null;
  controller.dmController.profileMessagesRelayStatus =
    document.getElementById("profileMessagesRelayStatus") || null;
}

export function bindDmRelayControls(controller) {
  const bindOnce = (element, eventName, handler, key) => {
    if (!(element instanceof HTMLElement)) {
      return;
    }
    const datasetKey = key || "dmRelayBound";
    if (element.dataset[datasetKey] === "true") {
      return;
    }
    element.dataset[datasetKey] = "true";
    element.addEventListener(eventName, handler);
  };

  bindOnce(
    controller.dmController.profileMessagesRelayAddButton,
    "click",
    () => {
      void controller.dmController.handleAddDmRelayPreference();
    },
    "dmRelayAddBound",
  );

  bindOnce(
    controller.dmController.profileMessagesRelayInput,
    "keydown",
    (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        void controller.dmController.handleAddDmRelayPreference();
      }
    },
    "dmRelayInputBound",
  );

  bindOnce(
    controller.dmController.profileMessagesRelayPublishButton,
    "click",
    () => {
      void handlePublishDmRelayPreferences(controller);
    },
    "dmRelayPublishBound",
  );
}

export async function refreshDmRelayPreferences(
  controller,
  { force = false } = {},
) {
  const owner = controller.dmController.resolveActiveDmRelayOwner();
  if (!owner) {
    controller.dmController.populateDmRelayPreferences();
    return;
  }

  const existing = controller.dmController.getActiveDmRelayPreferences();
  if (!existing.length || force) {
    if (typeof controller.services.fetchDmRelayHints === "function") {
      try {
        const hints = await controller.services.fetchDmRelayHints(owner);
        if (typeof controller.state.setDmRelayPreferences === "function") {
          controller.state.setDmRelayPreferences(owner, hints);
        }
      } catch (error) {
        devLogger.warn(
          "[profileModal] Failed to refresh DM relay hints for profile:",
          error,
        );
      }
    }
  }

  controller.dmController.populateDmRelayPreferences();
}

export async function handlePublishDmRelayPreferences(controller) {
  const owner = controller.dmController.resolveActiveDmRelayOwner();
  if (!owner) {
    controller.showError("Please sign in to publish DM relay hints.");
    return;
  }

  const relays = controller.dmController.getActiveDmRelayPreferences();
  if (!relays.length) {
    controller.showError("Add at least one DM relay before publishing.");
    return;
  }

  const callback = controller.callbacks.onPublishDmRelayPreferences;
  if (!callback || callback === noop) {
    controller.showError("DM relay publishing is unavailable right now.");
    return;
  }

  controller.dmController.setDmRelayPreferencesStatus(
    "Publishing DM relay hints…",
  );

  try {
    const result = await callback({
      pubkey: owner,
      relays,
      controller: controller,
    });
    if (result?.ok) {
      const acceptedCount = Array.isArray(result.accepted)
        ? result.accepted.length
        : 0;
      const summary = acceptedCount
        ? `Published to ${acceptedCount} relay${acceptedCount === 1 ? "" : "s"}.`
        : "DM relay hints published.";
      controller.showSuccess("DM relay hints published.");
      controller.dmController.setDmRelayPreferencesStatus(summary);
      return;
    }
    controller.showError("Failed to publish DM relay hints.");
    controller.dmController.setDmRelayPreferencesStatus(
      "DM relay hints publish failed.",
    );
  } catch (error) {
    const message =
      error && typeof error.message === "string" && error.message.trim()
        ? error.message.trim()
        : "Failed to publish DM relay hints.";
    controller.showError(message);
    controller.dmController.setDmRelayPreferencesStatus(message);
  }
}

export function updateDmPrivacyToggleForRecipient(
  controller,
  recipientContext,
  { force = false } = {},
) {
  if (!recipientContext) {
    return;
  }

  const relayHints = Array.isArray(recipientContext.relayHints)
    ? recipientContext.relayHints
    : [];
  const hasHints = relayHints.length > 0;

  if (!controller.dmController.dmPrivacyToggleTouched || force) {
    setPrivacyToggleState(controller, hasHints);
  }
}

export function setPrivacyToggleState(controller, enabled) {
  if (
    controller.dmController.profileMessagesPrivacyToggle instanceof
    HTMLInputElement
  ) {
    controller.dmController.profileMessagesPrivacyToggle.checked = Boolean(enabled);
  }
  controller.dmController.updateMessagePrivacyModeDisplay();
}

export function handleActiveDmIdentityChanged(
  controller,
  actorPubkey = null,
) {
  const normalized = actorPubkey
    ? controller.normalizeHexPubkey(actorPubkey)
    : controller.dmController.resolveActiveDmActor();

  controller.dmController.hasShownRelayWarning = false;
  controller.dmController.setDirectMessageRecipient(null, { reason: "clear" });
  controller.resetAttachmentQueue({ clearInput: true });
  controller.dmController.dmReadReceiptCache.clear();
  controller.dmController.dmTypingLastSentAt = 0;
  controller.dmController.syncDmPrivacySettingsUi();

  if (
    controller.dmController.directMessagesSubscription &&
    controller.dmController.directMessagesSubscription.actor &&
    normalized !== controller.dmController.directMessagesSubscription.actor
  ) {
    controller.dmController.resetDirectMessageSubscription();
  }

  controller.dmController.directMessagesLastActor = normalized || null;
  controller.dmController.directMessagesCache = [];
  controller.dmController.messagesInitialLoadPending = true;
  controller.dmController.pendingMessagesRender = null;

  if (controller.dmController.profileMessagesList instanceof HTMLElement) {
    controller.dmController.profileMessagesList.textContent = "";
    controller.dmController.profileMessagesList.classList.add("hidden");
    controller.dmController.profileMessagesList.setAttribute("hidden", "");
  }
  if (controller.dmController.profileMessagesConversation instanceof HTMLElement) {
    controller.dmController.profileMessagesConversation.textContent = "";
    controller.dmController.profileMessagesConversation.classList.add("hidden");
    controller.dmController.profileMessagesConversation.setAttribute("hidden", "");
  }
  if (controller.dmController.profileMessagesConversationEmpty instanceof HTMLElement) {
    controller.dmController.profileMessagesConversationEmpty.classList.remove("hidden");
    controller.dmController.profileMessagesConversationEmpty.removeAttribute("hidden");
  }

  if (!normalized) {
    controller.dmController.setMessagesLoadingState("unauthenticated");
    controller.dmController.updateMessagesReloadState();
    controller.dmController.populateDmRelayPreferences();
    controller.dmController.setDmRelayPreferencesStatus("");
    return;
  }

  controller.dmController.setMessagesLoadingState("loading");
  void controller.dmController.ensureDirectMessageSubscription(normalized);
  controller.dmController.updateMessagesReloadState();

  if (controller.getActivePane() === "messages") {
    void controller.dmController.populateProfileMessages({
      force: true,
      reason: "identity-change",
    });
  }

  void refreshDmRelayPreferences(controller, { force: true });
}
