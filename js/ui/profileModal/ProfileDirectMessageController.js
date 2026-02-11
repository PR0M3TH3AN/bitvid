import { AppShell } from "../dm/index.js";
import { devLogger, userLogger } from "../../utils/logger.js";
import { extractAttachmentsFromMessage, formatAttachmentSize, describeAttachment } from "../../attachments/attachmentUtils.js";
import { downloadAttachment } from "../../services/attachmentService.js";
import { formatTimeAgo } from "../../utils/formatters.js";
import { createInternalDefaultDmPrivacySettings } from "../profileModalContract.js";
import { sanitizeRelayList } from "../../nostr/nip46Client.js";
import { DMSettingsModalController } from "../dm/DMSettingsModalController.js";
import { ProfileDirectMessageHelper } from "./ProfileDirectMessageHelper.js";
import { ProfileDirectMessageRenderer } from "./ProfileDirectMessageRenderer.js";
import { ProfileDirectMessageActions } from "./ProfileDirectMessageActions.js";

const DIRECT_MESSAGES_BATCH_DELAY_MS = 250;
const FALLBACK_PROFILE_AVATAR = "assets/svg/default-profile.svg";
const noop = () => {};

export class ProfileDirectMessageController {
  constructor(mainController) {
    this.mainController = mainController;
    this.directMessagesCache = [];
    this.directMessagesLastActor = null;
    this.directMessagesSubscription = null;
    this.directMessagesUnsubscribes = [];
    this.profileMessagesRenderToken = 0;
    this.messagesLoadingState = "idle";
    this.dmComposerState = "idle";
    this.dmMobileView = "list";
    this.activeDmConversationId = "";
    this.focusedDmConversationId = "";
    this.dmPrivacyToggleTouched = false;
    this.activeMessagesRequest = false;
    this.hasShownRelayWarning = false;
    this.enableNip17RelayWarning = false;
    this.dmReadReceiptCache = new Set();
    this.dmSettingsModalController = new DMSettingsModalController();
    this.helper = new ProfileDirectMessageHelper(mainController, this);
    this.renderer = new ProfileDirectMessageRenderer(mainController, this);
    this.actions = new ProfileDirectMessageActions(mainController, this);
    this.dmTypingLastSentAt = 0;
    this.dmAttachmentQueue = [];
    this.dmAttachmentUploads = new Map();
    this.messagesInitialLoadPending = true;
    this.messagesViewActive = false;
  }


  initializeDirectMessagesService() {
    this.teardownDirectMessagesService();

    if (!this.mainController.nostrService || typeof this.mainController.nostrService.on !== "function") {
      return;
    }

    const unsubscribes = [];
    const subscribe = (eventName, handler) => {
      try {
        const unsubscribe = this.mainController.nostrService.on(eventName, handler);
        if (typeof unsubscribe === "function") {
          unsubscribes.push(unsubscribe);
        }
      } catch (error) {
        devLogger.warn(
          `[profileModal] Failed to subscribe to ${eventName} direct message events:`,
          error,
        );
      }
    };

    subscribe("directMessages:updated", (detail) => {
      this.actions.handleDirectMessagesUpdated(detail);
    });
    subscribe("directMessages:cleared", () => {
      this.actions.handleDirectMessagesCleared();
    });
    subscribe("directMessages:error", (detail) => {
      this.actions.handleDirectMessagesError(detail);
    });
    subscribe("directMessages:failure", (detail) => {
      this.actions.handleDirectMessagesError(detail);
    });
    subscribe("directMessages:relayWarning", (detail) => {
      this.actions.handleDirectMessagesRelayWarning(detail);
    });

    this.directMessagesUnsubscribes = unsubscribes;

    const actor = this.helper.resolveActiveDmActor();
    if (actor) {
      this.directMessagesLastActor = actor;
    }

    if (
      this.mainController.nostrService &&
      typeof this.mainController.nostrService.hydrateDirectMessagesFromStore === "function"
    ) {
      void this.mainController.nostrService
        .hydrateDirectMessagesFromStore({ emit: true })
        .then((messages) => {
          if (Array.isArray(messages)) {
            this.directMessagesCache = messages;
            const active = this.helper.resolveActiveDmActor();
            if (active) {
              this.directMessagesLastActor = active;
            }
          }
        })
        .catch((error) => {
          devLogger.warn(
            "[profileModal] Failed to hydrate cached direct messages:",
            error,
          );
        });
    }
  }

  teardownDirectMessagesService() {
    if (!Array.isArray(this.directMessagesUnsubscribes)) {
      this.directMessagesUnsubscribes = [];
      return;
    }

    while (this.directMessagesUnsubscribes.length) {
      const unsubscribe = this.directMessagesUnsubscribes.pop();
      if (typeof unsubscribe === "function") {
        try {
          unsubscribe();
        } catch (error) {
          devLogger.warn(
            "[profileModal] Failed to remove direct message event listener:",
            error,
          );
        }
      }
    }
  }








  getDmPrivacySettingsSnapshot() {
    const fallback = createInternalDefaultDmPrivacySettings();
    if (typeof this.mainController.state.getDmPrivacySettings !== "function") {
      return { ...fallback };
    }

    const settings = this.mainController.state.getDmPrivacySettings();
    return {
      readReceiptsEnabled:
        typeof settings?.readReceiptsEnabled === "boolean"
          ? settings.readReceiptsEnabled
          : fallback.readReceiptsEnabled,
      typingIndicatorsEnabled:
        typeof settings?.typingIndicatorsEnabled === "boolean"
          ? settings.typingIndicatorsEnabled
          : fallback.typingIndicatorsEnabled,
    };
  }

  persistDmPrivacySettings(partial = {}) {
    if (typeof this.mainController.state.setDmPrivacySettings !== "function") {
      return this.getDmPrivacySettingsSnapshot();
    }

    const resolved =
      partial && typeof partial === "object" ? partial : {};

    const current = this.getDmPrivacySettingsSnapshot();
    const merged = {
      readReceiptsEnabled:
        typeof resolved.readReceiptsEnabled === "boolean"
          ? resolved.readReceiptsEnabled
          : current.readReceiptsEnabled,
      typingIndicatorsEnabled:
        typeof resolved.typingIndicatorsEnabled === "boolean"
          ? resolved.typingIndicatorsEnabled
          : current.typingIndicatorsEnabled,
    };

    return this.mainController.state.setDmPrivacySettings(merged);
  }

  syncDmPrivacySettingsUi() {
    // Legacy UI toggles removed.
    // This method is kept for backwards compatibility with call sites that might expect it,
    // though the settings are now managed via AppShell.
  }








  async handleDmSettingsPublish(relays) {
    const owner = this.helper.resolveActiveDmRelayOwner();
    if (!owner) {
      return { ok: false, error: "not-logged-in" };
    }

    // Update local state first
    this.setActiveDmRelayPreferences(relays);

    // Publish using existing logic
    const callback = this.mainController.callbacks.onPublishDmRelayPreferences;
    if (!callback || callback === noop) {
      return { ok: false, error: "unavailable" };
    }

    try {
      const result = await callback({
        pubkey: owner,
        relays,
        controller: this,
      });

      if (result?.ok) {
        this.populateDmRelayPreferences(); // Refresh old UI just in case
        return result;
      }
      return { ok: false, error: result?.error || "failed" };
    } catch (error) {
      return { ok: false, error: error };
    }
  }



  setDirectMessageRecipient(pubkey, { reason = "manual" } = {}) {
    const normalized = this.mainController.normalizeHexPubkey(pubkey);
    const nextRecipient = normalized || null;

    if (typeof this.mainController.state.setDmRecipient === "function") {
      this.mainController.state.setDmRecipient(nextRecipient);
    }

    this.dmPrivacyToggleTouched = false;
    this.updateMessageThreadSelection(nextRecipient);

    if (nextRecipient) {
      void this.helper.ensureDmRecipientData(nextRecipient);
      this.renderer.setMessagesAnnouncement("Ready to message this recipient.");
    } else if (reason === "clear") {
      this.renderer.setMessagesAnnouncement("Message recipient cleared.");
      this.setFocusedDmConversation("");
    }

    void this.renderer.renderDirectMessageConversation();
    if (this.renderer.dmAppShellContainer instanceof HTMLElement) {
      void this.renderer.renderDmAppShell(this.directMessagesCache, {
        actorPubkey: this.helper.resolveActiveDmActor(),
      });
    }
    return nextRecipient;
  }

  updateMessageThreadSelection(activeRecipient) {
    if (!(this.renderer.profileMessagesList instanceof HTMLElement)) {
      return;
    }

    const normalized = this.mainController.normalizeHexPubkey(activeRecipient);
    const items = Array.from(
      this.renderer.profileMessagesList.querySelectorAll("[data-remote-pubkey]"),
    );

    items.forEach((item) => {
      if (!(item instanceof HTMLElement)) {
        return;
      }
      const remote = this.mainController.normalizeHexPubkey(item.dataset.remotePubkey);
      const isActive = normalized && remote === normalized;
      item.dataset.state = isActive ? "active" : "inactive";
    });
  }

  focusMessageComposer() {
    const input = this.renderer.profileMessageInput;
    if (input instanceof HTMLTextAreaElement) {
      input.focus();
      input.select();
    }
  }

  async ensureDirectMessageSubscription(actorPubkey = null) {
    if (
      !this.mainController.nostrService ||
      typeof this.mainController.nostrService.ensureDirectMessageSubscription !== "function"
    ) {
      return null;
    }

    const normalizedActor = actorPubkey
      ? this.mainController.normalizeHexPubkey(actorPubkey)
      : this.helper.resolveActiveDmActor();

    if (!normalizedActor) {
      return null;
    }

    if (
      this.directMessagesSubscription &&
      this.directMessagesSubscription.actor === normalizedActor
    ) {
      return this.directMessagesSubscription.subscription || null;
    }

    if (
      this.directMessagesSubscription &&
      this.directMessagesSubscription.actor &&
      this.directMessagesSubscription.actor !== normalizedActor
    ) {
      this.resetDirectMessageSubscription();
    }

    let subscription = null;
    try {
      subscription = await this.mainController.nostrService.ensureDirectMessageSubscription({
        actorPubkey: normalizedActor,
      });
    } catch (error) {
      userLogger.warn(
        "[profileModal] Failed to subscribe to direct messages:",
        error,
      );
      return null;
    }

    this.directMessagesSubscription = {
      actor: normalizedActor,
      subscription,
    };

    return subscription;
  }

  resetDirectMessageSubscription() {
    if (
      this.directMessagesSubscription &&
      this.mainController.nostrService &&
      typeof this.mainController.nostrService.stopDirectMessageSubscription === "function"
    ) {
      try {
        this.mainController.nostrService.stopDirectMessageSubscription();
      } catch (error) {
        devLogger.warn(
          "[profileModal] Failed to stop direct message subscription:",
          error,
        );
      }
    }

    this.directMessagesSubscription = null;
  }












  async maybePublishReadReceipt(messages, { recipientPubkey } = {}) {
    if (!Array.isArray(messages) || !messages.length) {
      return;
    }

    const settings = this.getDmPrivacySettingsSnapshot();
    if (!settings.readReceiptsEnabled) {
      return;
    }

    if (
      !this.mainController.services.nostrClient ||
      typeof this.mainController.services.nostrClient.publishDmReadReceipt !== "function"
    ) {
      return;
    }

    const normalizedRecipient =
      typeof recipientPubkey === "string"
        ? this.mainController.normalizeHexPubkey(recipientPubkey)
        : "";
    if (!normalizedRecipient) {
      return;
    }

    let latestMessage = null;
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const entry = messages[index];
      if (
        entry &&
        typeof entry === "object" &&
        entry.direction === "incoming"
      ) {
        const eventId = this.helper.resolveDirectMessageEventId(entry);
        if (eventId) {
          latestMessage = entry;
          break;
        }
      }
    }

    if (!latestMessage) {
      return;
    }

    const eventId = this.helper.resolveDirectMessageEventId(latestMessage);
    if (!eventId) {
      return;
    }

    const cacheKey = `${normalizedRecipient}:${eventId}`;
    if (this.dmReadReceiptCache.has(cacheKey)) {
      return;
    }

    const relayHints = this.helper.buildDmRecipientContext(normalizedRecipient)?.relayHints || [];
    const messageKind = this.helper.resolveDirectMessageKind(latestMessage);

    try {
      const result = await this.mainController.services.nostrClient.publishDmReadReceipt({
        eventId,
        recipientPubkey: normalizedRecipient,
        messageKind,
        relays: relayHints,
      });

      if (result?.ok) {
        this.dmReadReceiptCache.add(cacheKey);
      }
    } catch (error) {
      devLogger.warn("[profileModal] Failed to publish read receipt:", error);
    }
  }

  describeDirectMessageSendError(code) {
    switch (code) {
      case "sign-event-unavailable":
        return "Connect a Nostr signer to send messages.";
      case "encryption-unsupported":
        return "Your signer does not support NIP-04 encryption.";
      case "nip44-unsupported":
        return "Your signer does not support NIP-44 encryption required for NIP-17.";
      case "nip17-relays-missing":
        return "Recipient has not shared NIP-17 relay hints yet.";
      case "nip17-relays-unavailable":
        return "No DM relays are available to deliver this message.";
      case "nip17-keygen-failed":
        return "We couldn’t create secure wrapper keys for NIP-17 delivery.";
      case "extension-permission-denied":
        return "Please grant your Nostr extension permission to send messages.";
      case "extension-encryption-permission-denied":
        return "Please grant your Nostr extension encryption permission to send messages.";
      case "missing-actor-pubkey":
        return "We couldn’t determine your public key to send this message.";
      case "nostr-uninitialized":
        return "Direct messages are still connecting to relays. Please try again.";
      case "signature-failed":
        return "We couldn’t sign the message. Please reconnect your signer and try again.";
      case "encryption-failed":
        return "We couldn’t encrypt the message. Please try again.";
      case "publish-failed":
        return "Failed to deliver this message to any relay. Please try again.";
      case "invalid-target":
        return "Select a valid recipient before sending.";
      case "empty-message":
        return "Please enter a message or attach a file.";
      case "attachments-unsupported":
        return "Attachments require NIP-17 delivery. Enable the privacy toggle to send files.";
      default:
        return "Unable to send message. Please try again.";
    }
  }























  setFocusedDmConversation(conversationId) {
    if (
      !this.mainController.nostrService ||
      typeof this.mainController.nostrService.setFocusedDirectMessageConversation !== "function"
    ) {
      return;
    }

    if (
      this.focusedDmConversationId &&
      this.focusedDmConversationId !== conversationId
    ) {
      this.mainController.nostrService.setFocusedDirectMessageConversation(
        this.focusedDmConversationId,
        false,
      );
    }

    if (conversationId) {
      this.mainController.nostrService.setFocusedDirectMessageConversation(conversationId, true);
      this.focusedDmConversationId = conversationId;
    } else {
      this.focusedDmConversationId = "";
    }
  }



















  setMessagesLoadingState(...args) {
    return this.renderer.setMessagesLoadingState(...args);
  }

  updateMessagePrivacyModeDisplay(...args) {
    return this.renderer.updateMessagePrivacyModeDisplay(...args);
  }

  updateMessagesReloadState(...args) {
    return this.renderer.updateMessagesReloadState(...args);
  }

  updateMessageComposerState(...args) {
    return this.renderer.updateMessageComposerState(...args);
  }

  setMessagesAnnouncement(...args) {
    return this.renderer.setMessagesAnnouncement(...args);
  }

  renderProfileMessages(...args) {
    return this.renderer.renderProfileMessages(...args);
  }

  renderDmAppShell(...args) {
    return this.renderer.renderDmAppShell(...args);
  }

  mountDmAppShell(...args) {
    return this.renderer.mountDmAppShell(...args);
  }

  unmountDmAppShell(...args) {
    return this.renderer.unmountDmAppShell(...args);
  }

  populateDmRelayPreferences(...args) {
    return this.actions.populateDmRelayPreferences(...args);
  }

  populateProfileMessages(...args) {
    return this.actions.populateProfileMessages(...args);
  }

  resumeProfileMessages(...args) {
    return this.actions.resumeProfileMessages(...args);
  }

  pauseProfileMessages(...args) {
    return this.actions.pauseProfileMessages(...args);
  }

  handleSendDmRequest(...args) {
    return this.actions.handleSendDmRequest(...args);
  }

  handleOpenDmRelaysRequest(...args) {
    return this.actions.handleOpenDmRelaysRequest(...args);
  }

  handlePrivacyToggle(...args) {
    return this.actions.handlePrivacyToggle(...args);
  }

  handleLinkPreviewToggle(...args) {
    return this.actions.handleLinkPreviewToggle(...args);
  }

  handleSendProfileMessage(...args) {
    return this.actions.handleSendProfileMessage(...args);
  }

  handleAttachmentSelection(...args) {
    return this.actions.handleAttachmentSelection(...args);
  }

  handleDirectMessagesUpdated(...args) {
    return this.actions.handleDirectMessagesUpdated(...args);
  }

  handleDirectMessagesCleared(...args) {
    return this.actions.handleDirectMessagesCleared(...args);
  }

  handleDirectMessagesError(...args) {
    return this.actions.handleDirectMessagesError(...args);
  }

  handleDirectMessagesRelayWarning(...args) {
    return this.actions.handleDirectMessagesRelayWarning(...args);
  }



  resolveActiveDmActor(...args) {
    return this.helper.resolveActiveDmActor(...args);
  }

  resolveActiveDmRecipient(...args) {
    return this.helper.resolveActiveDmRecipient(...args);
  }

  createCompactProfileSummary(...args) {
    return this.renderer.createCompactProfileSummary(...args);
  }

  setDmRelayPreferencesStatus(...args) {
    return this.actions.setDmRelayPreferencesStatus(...args);
  }

  setActiveDmRelayPreferences(...args) {
    return this.actions.setActiveDmRelayPreferences(...args);
  }

  handleAddDmRelayPreference(...args) {
    return this.actions.handleAddDmRelayPreference(...args);
  }

  handleRemoveDmRelayPreference(...args) {
    return this.actions.handleRemoveDmRelayPreference(...args);
  }

  resolveActiveDmRelayOwner(...args) {
    return this.helper.resolveActiveDmRelayOwner(...args);
  }

  getActiveDmRelayPreferences(...args) {
    return this.helper.getActiveDmRelayPreferences(...args);
  }
}
