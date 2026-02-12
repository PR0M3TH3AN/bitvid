import { devLogger, userLogger } from "../../utils/logger.js";
import { extractAttachmentsFromMessage, formatAttachmentSize, describeAttachment } from "../../attachments/attachmentUtils.js";
import { downloadAttachment, clearAttachmentCache, getAttachmentCacheStats } from "../../services/attachmentService.js";
import { getLinkPreviewSettings, setLinkPreviewAutoFetch } from "../../utils/linkPreviewSettings.js";
import { sanitizeRelayList } from "../../nostr/nip46Client.js";
import { SHORT_TIMEOUT_MS } from "../../constants.js";

const TYPING_INDICATOR_TTL_SECONDS = 15;
const TYPING_INDICATOR_COOLDOWN_MS = 4000;

export class ProfileDirectMessageActions {
  constructor(mainController, controller) {
    this.mainController = mainController;
    this.controller = controller;
  }

  handleReadReceiptsToggle(enabled) {
    this.persistDmPrivacySettings({
      readReceiptsEnabled: Boolean(enabled),
    });
    this.syncDmPrivacySettingsUi();
    this.mainController.showStatus(
      enabled
        ? "Read receipts enabled for direct messages."
        : "Read receipts disabled.",
    );
  }

  handleTypingIndicatorsToggle(enabled) {
    this.persistDmPrivacySettings({
      typingIndicatorsEnabled: Boolean(enabled),
    });
    this.syncDmPrivacySettingsUi();
    this.mainController.showStatus(
      enabled
        ? "Typing indicators enabled for direct messages."
        : "Typing indicators disabled.",
    );
  }

  handleLinkPreviewToggle(enabled) {
    setLinkPreviewAutoFetch(Boolean(enabled));
  }

  openDmSettingsModal() {
    const owner = this.controller.helper.resolveActiveDmRelayOwner();
    if (!owner) {
      this.mainController.showError("Please sign in to manage DM settings.");
      return;
    }

    const privacySettings = this.getDmPrivacySettingsSnapshot();
    const relayHints = this.controller.helper.getActiveDmRelayPreferences();

    this.controller.dmSettingsModalController.show({
      privacySettings,
      relayHints,
      onPrivacyChange: (key, value) => {
        this.persistDmPrivacySettings({ [key]: value });
        if (key === "readReceiptsEnabled") {
          this.mainController.showStatus(
            value ? "Read receipts enabled." : "Read receipts disabled.",
          );
        } else if (key === "typingIndicatorsEnabled") {
          this.mainController.showStatus(
            value ? "Typing indicators enabled." : "Typing indicators disabled.",
          );
        }
      },
      onPublishRelays: async (urls) => {
        return this.handleDmSettingsPublish(urls);
      },
    });
  }

  async handleSendDmRequest() {
    const recipient = this.controller.helper.resolveActiveDmRecipient();
    if (!recipient) {
      this.mainController.showError("Please select a message recipient.");
      return;
    }

    const context = await this.controller.helper.ensureDmRecipientData(recipient);
    this.focusMessageComposer();

    const callback = this.mainController.callbacks.onSendDm;
    if (callback && callback !== noop) {
      callback({
        actorPubkey: this.controller.helper.resolveActiveDmActor(),
        recipient: context,
        controller: this,
      });
    }
  }

  async handleOpenDmRelaysRequest() {
    const recipient = this.controller.helper.resolveActiveDmRecipient();
    if (!recipient) {
      this.mainController.showError("Please select a message recipient.");
      return;
    }

    const context = await this.controller.helper.ensureDmRecipientData(recipient);

    const callback = this.mainController.callbacks.onOpenRelays;
    if (callback && callback !== noop) {
      callback({ controller: this, recipient: context });
    }
  }

  handlePrivacyToggle(enabled) {
    const recipientContext = this.controller.helper.buildDmRecipientContext(
      this.controller.helper.resolveActiveDmRecipient(),
    );
    const relayHints = Array.isArray(recipientContext?.relayHints)
      ? recipientContext.relayHints
      : [];

    if (this.controller.enableNip17RelayWarning && enabled && !relayHints.length) {
      this.mainController.showStatus(
        "Privacy warning: this recipient has not shared NIP-17 relays, so we'll use your default relays.",
        { autoHideMs: SHORT_TIMEOUT_MS },
      );
    }

    this.dmPrivacyToggleTouched = true;
    this.controller.renderer.updateMessagePrivacyModeDisplay();
    const callback = this.mainController.callbacks.onTogglePrivacy;
    if (callback && callback !== noop) {
      callback({
        controller: this,
        enabled: Boolean(enabled),
        recipient: recipientContext,
      });
    }
  }

  handleAttachmentSelection() {
    const input = this.controller.renderer.profileMessageAttachmentInput;
    if (!(input instanceof HTMLInputElement) || !input.files) {
      return;
    }

    const files = Array.from(input.files);
    if (!files.length) {
      return;
    }

    files.forEach((file) => {
      const previewUrl =
        typeof URL !== "undefined" ? URL.createObjectURL(file) : "";
      this.controller.dmAttachmentQueue.push({
        id: this.generateAttachmentId(file),
        file,
        name: file.name,
        type: file.type || "application/octet-stream",
        size: file.size,
        previewUrl,
        status: "pending",
        progress: 0,
      });
    });

    input.value = "";
    this.renderAttachmentQueue();
  }

  async handleSendProfileMessage() {
    const input = this.controller.renderer.profileMessageInput;
    if (!(input instanceof HTMLTextAreaElement)) {
      return;
    }

    const message = typeof input.value === "string" ? input.value.trim() : "";
    const hasAttachments = this.controller.dmAttachmentQueue.length > 0;
    if (!message && !hasAttachments) {
      this.mainController.showError("Please enter a message or attach a file.");
      return;
    }

    const targetHex = this.controller.helper.resolveActiveDmRecipient();
    const target =
      typeof targetHex === "string" && typeof this.mainController.safeEncodeNpub === "function"
        ? this.mainController.safeEncodeNpub(targetHex)
        : "";
    if (!target) {
      this.mainController.showError("Please select a message recipient.");
      return;
    }

    const recipientContext = this.controller.helper.buildDmRecipientContext(targetHex);
    const recipientRelayHints = Array.isArray(recipientContext?.relayHints)
      ? recipientContext.relayHints
      : [];
    const useNip17 =
      this.controller.renderer.profileMessagesPrivacyToggle instanceof HTMLInputElement
        ? this.controller.renderer.profileMessagesPrivacyToggle.checked
        : false;
    const senderRelayHints = this.controller.helper.getActiveDmRelayPreferences();

    if (hasAttachments && !useNip17) {
      this.mainController.showError(
        "Attachments require NIP-17 delivery. Enable the privacy toggle to send files.",
      );
      return;
    }

    if (this.controller.enableNip17RelayWarning && useNip17 && !recipientRelayHints.length) {
      this.mainController.showStatus(
        "Privacy warning: this recipient has not shared NIP-17 relays, so we'll use your default relays.",
        { autoHideMs: SHORT_TIMEOUT_MS },
      );
    }

    if (
      !this.mainController.services.nostrClient ||
      typeof this.mainController.services.nostrClient.sendDirectMessage !== "function"
    ) {
      this.mainController.showError("Direct message service unavailable.");
      return;
    }

    const sendButton = this.controller.renderer.profileMessageSendButton;
    if (sendButton instanceof HTMLElement && "disabled" in sendButton) {
      sendButton.disabled = true;
      sendButton.setAttribute("aria-disabled", "true");
    }

    try {
      let attachmentPayloads = [];
      if (hasAttachments) {
        try {
          attachmentPayloads = await this.uploadAttachmentQueue(
            this.controller.helper.resolveActiveDmActor(),
          );
        } catch (error) {
          const messageText =
            error && typeof error.message === "string"
              ? error.message
              : "Attachment upload failed.";
          this.mainController.showError(messageText);
          return;
        }
      }

      const result = await this.mainController.services.nostrClient.sendDirectMessage(
        target,
        message,
        null,
        useNip17
          ? {
              useNip17: true,
              recipientRelayHints,
              senderRelayHints,
              attachments: attachmentPayloads,
            }
          : {},
      );

      if (result?.ok) {
        input.value = "";
        this.resetAttachmentQueue({ clearInput: true });
        this.mainController.showSuccess("Message sent.");
        if (this.controller.enableNip17RelayWarning && result?.warning === "dm-relays-fallback") {
          this.mainController.showStatus(
            "Privacy warning: this message used default relays because no NIP-17 relay list was found.",
            { autoHideMs: SHORT_TIMEOUT_MS },
          );
        }
        void this.populateProfileMessages({ force: true, reason: "send-message" });
        return;
      }

      const errorCode =
        typeof result?.error === "string" ? result.error : "unknown";
      userLogger.warn("[profileModal] Failed to send direct message:", errorCode);
      this.mainController.showError(this.describeDirectMessageSendError(errorCode));
    } catch (error) {
      userLogger.error("[profileModal] Unexpected DM send failure:", error);
      this.mainController.showError("Unable to send message. Please try again.");
    } finally {
      this.controller.renderer.updateMessageComposerState();
    }
  }

  async handleDmConversationSelect(conversation) {
    const conversationId =
      conversation && typeof conversation.id === "string"
        ? conversation.id.trim()
        : "";
    if (!conversationId) {
      return;
    }

    this.controller.dmMobileView = "thread";

    const actor = this.controller.helper.resolveActiveDmActor();
    const remote = this.controller.helper.resolveRemoteForConversationId(conversationId, actor);

    this.controller.activeDmConversationId = conversationId;
    if (remote) {
      this.setDirectMessageRecipient(remote, { reason: "thread-select" });
    }

    this.setFocusedDmConversation(conversationId);

    await this.controller.renderer.renderDmAppShell(this.controller.directMessagesCache, {
      actorPubkey: actor,
    });
  }

  async handleDmConversationMarkRead(conversation) {
    const conversationId =
      conversation && typeof conversation.id === "string"
        ? conversation.id.trim()
        : this.controller.activeDmConversationId;
    if (!conversationId) {
      return;
    }

    const actor = this.controller.helper.resolveActiveDmActor();
    if (
      !actor ||
      !this.mainController.nostrService ||
      typeof this.mainController.nostrService.acknowledgeRenderedDirectMessages !== "function"
    ) {
      return;
    }

    const renderedUntil = this.controller.helper.getLatestDirectMessageTimestampForConversation(
      conversationId,
      actor,
    );

    try {
      await this.mainController.nostrService.acknowledgeRenderedDirectMessages(
        conversationId,
        renderedUntil,
      );
    } catch (error) {
      devLogger.warn("[profileModal] Failed to mark conversation read:", error);
    }

    const recipient = this.controller.helper.resolveRemoteForConversationId(conversationId, actor);
    const messages = this.controller.helper.getDirectMessagesForConversation(conversationId, actor);
    if (recipient && messages.length) {
      void this.maybePublishReadReceipt(messages, {
        recipientPubkey: recipient,
      });
    }

    await this.controller.renderer.renderDmAppShell(this.controller.directMessagesCache, {
      actorPubkey: actor,
    });
  }

  async handleDmMarkAllConversationsRead() {
    if (
      !this.mainController.nostrService ||
      typeof this.mainController.nostrService.acknowledgeRenderedDirectMessages !== "function"
    ) {
      return;
    }

    const actor = this.controller.helper.resolveActiveDmActor();
    if (!actor) {
      return;
    }

    const summaries =
      typeof this.mainController.nostrService.listDirectMessageConversationSummaries === "function"
        ? await this.mainController.nostrService.listDirectMessageConversationSummaries()
        : [];
    const list = Array.isArray(summaries) ? summaries : [];

    for (const summary of list) {
      const conversationId =
        typeof summary?.conversation_id === "string"
          ? summary.conversation_id.trim()
          : typeof summary?.conversationId === "string"
            ? summary.conversationId.trim()
            : "";
      if (!conversationId) {
        continue;
      }

      const renderedUntil =
        Number(summary?.last_message_at) ||
        Number(summary?.downloaded_until) ||
        Number(summary?.opened_until) ||
        this.controller.helper.getLatestDirectMessageTimestampForConversation(conversationId, actor);

      try {
        await this.mainController.nostrService.acknowledgeRenderedDirectMessages(
          conversationId,
          renderedUntil,
        );
      } catch (error) {
        devLogger.warn(
          "[profileModal] Failed to mark conversation read:",
          error,
        );
      }

      const recipient = this.controller.helper.resolveRemoteForConversationId(conversationId, actor);
      const messages = this.controller.helper.getDirectMessagesForConversation(conversationId, actor);
      if (recipient && messages.length) {
        void this.maybePublishReadReceipt(messages, {
          recipientPubkey: recipient,
        });
      }
    }

    await this.controller.renderer.renderDmAppShell(this.controller.directMessagesCache, {
      actorPubkey: actor,
    });
  }

  async handleDmAppShellSendMessage(messageText, payload = {}) {
    const normalizedPayload =
      payload && typeof payload === "object" ? payload : {};
    const message =
      typeof messageText === "string" ? messageText.trim() : "";
    const attachments = Array.isArray(normalizedPayload.attachments)
      ? normalizedPayload.attachments
      : [];

    if (!message && !attachments.length) {
      this.mainController.showError("Please enter a message or attach a file.");
      this.controller.dmComposerState = "error";
      await this.controller.renderer.renderDmAppShell(this.controller.directMessagesCache, {
        actorPubkey: this.controller.helper.resolveActiveDmActor(),
      });
      return;
    }

    const actor = this.controller.helper.resolveActiveDmActor();
    const activeConversationId =
      this.controller.activeDmConversationId ||
      (actor && this.controller.helper.resolveActiveDmRecipient()
        ? this.controller.helper.buildDmConversationId(actor, this.controller.helper.resolveActiveDmRecipient())
        : "");
    const targetHex =
      this.controller.helper.resolveRemoteForConversationId(activeConversationId, actor) ||
      this.controller.helper.resolveActiveDmRecipient();

    const target =
      typeof targetHex === "string" && typeof this.mainController.safeEncodeNpub === "function"
        ? this.mainController.safeEncodeNpub(targetHex)
        : "";
    if (!target) {
      this.mainController.showError("Please select a message recipient.");
      this.controller.dmComposerState = "error";
      await this.controller.renderer.renderDmAppShell(this.controller.directMessagesCache, {
        actorPubkey: actor,
      });
      return;
    }

    if (
      !this.mainController.services.nostrClient ||
      typeof this.mainController.services.nostrClient.sendDirectMessage !== "function"
    ) {
      this.mainController.showError("Direct message service unavailable.");
      this.controller.dmComposerState = "error";
      await this.controller.renderer.renderDmAppShell(this.controller.directMessagesCache, {
        actorPubkey: actor,
      });
      return;
    }

    const privacyMode =
      typeof normalizedPayload.privacyMode === "string"
        ? normalizedPayload.privacyMode.trim().toLowerCase()
        : "nip04";
    const useNip17 = privacyMode === "nip17" || privacyMode === "private";

    if (attachments.length && !useNip17) {
      this.mainController.showError(
        "Attachments require NIP-17 delivery. Enable the privacy toggle to send files.",
      );
      this.controller.dmComposerState = "error";
      await this.controller.renderer.renderDmAppShell(this.controller.directMessagesCache, {
        actorPubkey: actor,
      });
      return;
    }

    const recipientContext = this.controller.helper.buildDmRecipientContext(targetHex);
    const recipientRelayHints = Array.isArray(recipientContext?.relayHints)
      ? recipientContext.relayHints
      : [];
    const senderRelayHints = this.controller.helper.getActiveDmRelayPreferences();

    if (useNip17 && !recipientRelayHints.length) {
      this.mainController.showStatus(
        "Privacy warning: this recipient has not shared NIP-17 relays, so we'll use your default relays.",
        { autoHideMs: SHORT_TIMEOUT_MS },
      );
    }

    this.controller.dmComposerState = "sending";
    await this.controller.renderer.renderDmAppShell(this.controller.directMessagesCache, {
      actorPubkey: actor,
    });

    try {
      const result = await this.mainController.services.nostrClient.sendDirectMessage(
        target,
        message,
        null,
        useNip17
          ? {
              useNip17: true,
              recipientRelayHints,
              senderRelayHints,
              attachments,
            }
          : {},
      );

      if (result?.ok) {
        this.mainController.showSuccess("Message sent.");
        if (result?.warning === "dm-relays-fallback") {
          this.mainController.showStatus(
            "Privacy warning: this message used default relays because no NIP-17 relay list was found.",
            { autoHideMs: SHORT_TIMEOUT_MS },
          );
        }
        if (
          this.mainController.nostrService &&
          typeof this.mainController.nostrService.loadDirectMessages === "function"
        ) {
          await this.mainController.nostrService.loadDirectMessages({
            actorPubkey: actor,
            initialLoad: false,
          });
        }
        this.controller.dmComposerState = "idle";
      } else {
        const errorCode =
          typeof result?.error === "string" ? result.error : "unknown";
        userLogger.warn("[profileModal] Failed to send direct message:", errorCode);
        this.mainController.showError(this.describeDirectMessageSendError(errorCode));
        this.controller.dmComposerState = "error";
      }
    } catch (error) {
      userLogger.error("[profileModal] Unexpected DM send failure:", error);
      this.mainController.showError("Unable to send message. Please try again.");
      this.controller.dmComposerState = "error";
    } finally {
      await this.controller.renderer.renderDmAppShell(this.controller.directMessagesCache, {
        actorPubkey: actor,
      });
    }
  }

  async populateProfileMessages(options = {}) {
    const settings =
      options && typeof options === "object" ? options : { force: false };
    const { force = false } = settings;

    const actor = this.controller.helper.resolveActiveDmActor();
    if (!actor) {
      this.clearProfileMessages();
      return;
    }

    if (
      !this.mainController.nostrService ||
      typeof this.mainController.nostrService.loadDirectMessages !== "function"
    ) {
      this.controller.renderer.setMessagesLoadingState("error", {
        message: "Direct message service unavailable.",
      });
      return;
    }

    if (
      !force &&
      !this.controller.messagesInitialLoadPending &&
      Array.isArray(this.controller.directMessagesCache) &&
      this.controller.directMessagesCache.length
    ) {
      await this.controller.renderer.renderProfileMessages(this.controller.directMessagesCache, {
        actorPubkey: actor,
      });
      this.controller.renderer.setMessagesLoadingState("ready");
      return;
    }

    const requestId = Symbol("messagesLoad");
    this.controller.activeMessagesRequest = requestId;
    this.controller.messagesInitialLoadPending = false;
    this.controller.renderer.setMessagesLoadingState("loading");

    if (
      this.controller.directMessagesLastActor &&
      this.controller.directMessagesLastActor !== actor
    ) {
      this.controller.resetDirectMessageSubscription();
      if (
        typeof this.mainController.nostrService.clearDirectMessages === "function"
      ) {
        try {
          this.mainController.nostrService.clearDirectMessages({ emit: true });
        } catch (error) {
          devLogger.warn(
            "[profileModal] Failed to clear direct messages cache before reload:",
            error,
          );
        }
      }
    }

    try {
      let snapshot = await this.mainController.nostrService.loadDirectMessages({
        actorPubkey: actor,
        initialLoad: true,
      });
      if (!Array.isArray(snapshot)) {
        snapshot = [];
      }

      if (this.controller.activeMessagesRequest !== requestId) {
        return;
      }

      this.controller.directMessagesCache = snapshot;
      this.controller.directMessagesLastActor = actor;

      await this.controller.renderer.renderProfileMessages(snapshot, { actorPubkey: actor });

      if (!snapshot.length) {
        this.controller.renderer.setMessagesLoadingState("empty");
      } else {
        this.controller.renderer.setMessagesLoadingState("ready", {
          message:
            snapshot.length === 1
              ? "1 direct message thread loaded."
              : `${snapshot.length} direct message threads loaded.`,
        });
      }
    } catch (error) {
      if (this.controller.activeMessagesRequest === requestId) {
        userLogger.error(
          "[profileModal] Failed to load direct messages:",
          error,
        );
        this.controller.renderer.setMessagesLoadingState("error", {
          message: "Failed to load direct messages. Try again later.",
        });
        this.controller.messagesInitialLoadPending = true;
      }
      return;
    } finally {
      if (this.controller.activeMessagesRequest === requestId) {
        this.controller.activeMessagesRequest = null;
        this.controller.renderer.updateMessagesReloadState();
      }
    }

    void this.controller.ensureDirectMessageSubscription(actor);
  }

  resumeProfileMessages() {
    this.controller.messagesViewActive = true;
    this.controller.renderer.mountDmAppShell();
    this.controller.renderer.updateMessagesReloadState();
  }

  pauseProfileMessages() {
    this.controller.messagesViewActive = false;
    this.controller.renderer.unmountDmAppShell();
    this.controller.renderer.updateMessagesReloadState();
  }

  handleDirectMessagesUpdated(detail = {}) {
    if (
      this.controller.activeMessagesRequest &&
      detail?.reason !== "load-incremental"
    ) {
      return;
    }

    const messages = Array.isArray(detail?.messages)
      ? detail.messages
      : [];
    this.controller.directMessagesCache = messages;

    const actor = this.controller.helper.resolveActiveDmActor();
    if (!actor) {
      this.controller.renderer.setMessagesLoadingState("unauthenticated");
      this.controller.renderer.clearDirectMessagesUpdateQueue();
      return;
    }

    this.controller.directMessagesLastActor = actor;
    this.controller.renderer.scheduleDirectMessagesRender({
      messages,
      actorPubkey: actor,
      reason: typeof detail?.reason === "string" ? detail.reason : "",
    });
  }

  handleDirectMessagesCleared() {
    if (this.controller.activeMessagesRequest) {
      return;
    }

    this.controller.renderer.clearDirectMessagesUpdateQueue();
    this.controller.directMessagesCache = [];
    this.setDirectMessageRecipient(null, { reason: "clear" });
    if (this.controller.renderer.profileMessagesList instanceof HTMLElement) {
      this.controller.renderer.profileMessagesList.textContent = "";
      this.controller.renderer.profileMessagesList.classList.add("hidden");
      this.controller.renderer.profileMessagesList.setAttribute("hidden", "");
    }

    const actor = this.controller.helper.resolveActiveDmActor();
    if (!actor) {
      this.controller.renderer.setMessagesLoadingState("unauthenticated");
    } else {
      this.controller.renderer.setMessagesLoadingState("empty");
    }

    if (this.controller.renderer.dmAppShellContainer instanceof HTMLElement) {
      void this.controller.renderer.renderDmAppShell(this.controller.directMessagesCache, {
        actorPubkey: actor,
      });
    }
  }

  handleDirectMessagesError(detail = {}) {
    const error = detail?.error || detail?.failure || detail;
    const reason = detail?.context?.reason || "";
    const errorCode = error?.code || "";
    const errorMessage =
      typeof error === "string"
        ? error
        : typeof error?.message === "string"
          ? error.message
          : "";
    const requiresNip44Decryptor =
      typeof errorMessage === "string" &&
      errorMessage.includes("Gift wrap events require a NIP-44 decryptor");

    const isBenign =
      reason === "no-decryptors" ||
      errorCode === "decryption-failed" ||
      (typeof error === "string" && error.includes("no-decryptors"));

    if (isBenign) {
      devLogger.info("[profileModal] Direct message sync info:", error);
    } else {
      userLogger.warn(
        "[profileModal] Direct message sync issue detected:",
        error,
      );
    }

    if (this.controller.activeMessagesRequest) {
      return;
    }

    if (requiresNip44Decryptor) {
      const nip44Message =
        "NIP-17 direct messages require a NIP-44-capable signer or extension. Unlock or update your extension to continue.";
      if (!this.controller.directMessagesCache.length) {
        this.controller.renderer.setMessagesLoadingState("error", {
          message: nip44Message,
        });
        return;
      }

      this.controller.renderer.setMessagesAnnouncement(nip44Message);
      this.controller.renderer.updateMessagesReloadState();
      return;
    }

    if (!this.controller.directMessagesCache.length) {
      this.controller.renderer.setMessagesLoadingState("error", {
        message: "Unable to sync direct messages right now.",
      });
      return;
    }

    this.controller.renderer.setMessagesAnnouncement("Unable to sync direct messages right now.");
    this.controller.renderer.updateMessagesReloadState();
  }

  handleDirectMessagesRelayWarning(detail = {}) {
    if (!this.controller.enableNip17RelayWarning) {
      return;
    }

    if (detail?.warning !== "dm-relays-fallback") {
      return;
    }

    if (this.controller.hasShownRelayWarning) {
      return;
    }
    this.controller.hasShownRelayWarning = true;

    this.mainController.showStatus(
      "Privacy warning: direct messages are using your default relays because no NIP-17 relay list is available.",
      { autoHideMs: SHORT_TIMEOUT_MS },
    );
  }

  setActiveDmRelayPreferences(relays = []) {
    const owner = this.controller.helper.resolveActiveDmRelayOwner();
    if (!owner || typeof this.mainController.state.setDmRelayPreferences !== "function") {
      return [];
    }

    return this.mainController.state.setDmRelayPreferences(owner, relays);
  }

  setDmRelayPreferencesStatus(message = "") {
    if (!(this.profileMessagesRelayStatus instanceof HTMLElement)) {
      return;
    }

    const text = typeof message === "string" ? message.trim() : "";
    this.profileMessagesRelayStatus.textContent = text;
  }

  populateDmRelayPreferences() {
    if (!(this.controller.renderer.profileMessagesRelayList instanceof HTMLElement)) {
      return;
    }

    const owner = this.controller.helper.resolveActiveDmRelayOwner();
    const relays = this.controller.helper.getActiveDmRelayPreferences();

    this.controller.renderer.profileMessagesRelayList.textContent = "";

    if (!owner) {
      const emptyState = document.createElement("li");
      emptyState.className =
        "card border border-dashed border-border/60 p-4 text-center text-xs text-muted";
      emptyState.textContent = "Sign in to add DM relay hints.";
      this.controller.renderer.profileMessagesRelayList.appendChild(emptyState);
      this.setDmRelayPreferencesStatus("");
      return;
    }

    if (!relays.length) {
      const emptyState = document.createElement("li");
      emptyState.className =
        "card border border-dashed border-border/60 p-4 text-center text-xs text-muted";
      emptyState.textContent = "No DM relay hints yet.";
      this.controller.renderer.profileMessagesRelayList.appendChild(emptyState);
      return;
    }

    relays.forEach((url) => {
      const item = document.createElement("li");
      item.className = "card flex items-center justify-between gap-3 p-3";

      const label = document.createElement("p");
      label.className = "text-xs font-medium text-text break-all";
      label.textContent = url;

      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "btn-ghost focus-ring text-xs";
      removeBtn.dataset.variant = "danger";
      removeBtn.textContent = "Remove";
      removeBtn.addEventListener("click", () => {
        void this.handleRemoveDmRelayPreference(url);
      });

      item.appendChild(label);
      item.appendChild(removeBtn);
      this.controller.renderer.profileMessagesRelayList.appendChild(item);
    });
  }

  async handleAddDmRelayPreference() {
    const input = this.controller.renderer.profileMessagesRelayInput;
    if (!(input instanceof HTMLInputElement)) {
      return;
    }

    const owner = this.controller.helper.resolveActiveDmRelayOwner();
    if (!owner) {
      this.mainController.showError("Please sign in to save DM relay hints.");
      return;
    }

    const rawValue = typeof input.value === "string" ? input.value.trim() : "";
    const sanitized = sanitizeRelayList([rawValue]);
    const relayUrl = sanitized[0];
    if (!relayUrl) {
      this.mainController.showError("Enter a valid WSS relay URL.");
      return;
    }

    const current = this.controller.helper.getActiveDmRelayPreferences();
    const next = sanitizeRelayList([...current, relayUrl]);
    this.setActiveDmRelayPreferences(next);
    input.value = "";
    this.populateDmRelayPreferences();
    this.setDmRelayPreferencesStatus("DM relay hint added.");
  }

  async handleRemoveDmRelayPreference(url) {
    const owner = this.controller.helper.resolveActiveDmRelayOwner();
    if (!owner) {
      this.mainController.showError("Please sign in to update DM relay hints.");
      return;
    }

    const target = typeof url === "string" ? url.trim() : "";
    if (!target) {
      return;
    }

    const current = this.controller.helper.getActiveDmRelayPreferences();
    const next = current.filter((entry) => entry !== target);
    this.setActiveDmRelayPreferences(next);
    this.populateDmRelayPreferences();
    this.setDmRelayPreferencesStatus("DM relay hint removed.");
  }

}
