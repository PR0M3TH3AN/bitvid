import { AppShell } from "../dm/index.js";
import { devLogger, userLogger } from "../../utils/logger.js";
import { extractAttachmentsFromMessage, formatAttachmentSize, describeAttachment } from "../../attachments/attachmentUtils.js";
import { downloadAttachment } from "../../services/attachmentService.js";
const DIRECT_MESSAGES_BATCH_DELAY_MS = 250;
export class ProfileDirectMessageRenderer {
  constructor(mainController, controller) {
    this.mainController = mainController;
    this.controller = controller;
    this.dmAppShellContainer = null;
    this.profileMessagesPane = null;
    this.profileMessagesList = null;
    this.profileMessagesEmpty = null;
    this.profileMessagesLoading = null;
    this.profileMessagesError = null;
    this.profileMessagesStatus = null;
    this.profileMessagesReloadButton = null;
    this.profileMessagesConversation = null;
    this.profileMessagesConversationEmpty = null;
    this.profileMessageInput = null;
    this.profileMessageSendButton = null;
    this.profileMessageAttachmentInput = null;
    this.profileMessageAttachmentButton = null;
    this.profileMessageAttachmentEncrypt = null;
    this.profileMessageAttachmentList = null;
    this.profileMessageAttachmentClearCache = null;
    this.profileMessagesComposerHelper = null;
    this.profileMessagesSendDmButton = null;
    this.profileMessagesOpenRelaysButton = null;
    this.profileMessagesPrivacyToggle = null;
    this.profileMessagesPrivacyMode = null;
    this.profileMessagesUnreadDot = null;
    this.profileLinkPreviewAutoToggle = null;
    this.profileMessagesRelayList = null;
    this.profileMessagesRelayInput = null;
    this.profileMessagesRelayAdd = null;
    this.directMessagesRenderTimeout = null;
    this.pendingDirectMessagesUpdate = null;
    this.pendingMessagesRender = null;
    this.messagesStatusClearTimeout = null;
    this.dmAppShell = null;
  }

  cacheDomReferences() {
    this.dmAppShellContainer = document.getElementById("dmAppShellMount") || null;
    this.profileMessagesPane = document.getElementById("profilePaneMessages") || null;
    this.profileMessagesList = document.getElementById("profileMessagesList") || null;
    this.profileMessagesEmpty = document.getElementById("profileMessagesEmpty") || null;
    this.profileMessagesLoading = document.getElementById("profileMessagesLoading") || null;
    this.profileMessagesError = document.getElementById("profileMessagesError") || null;
    this.profileMessagesStatus = document.getElementById("profileMessagesStatus") || null;
    this.profileMessagesReloadButton = document.getElementById("profileMessagesReload") || null;
    this.profileMessagesConversation = document.getElementById("profileMessagesConversation") || null;
    this.profileMessagesConversationEmpty = document.getElementById("profileMessagesConversationEmpty") || null;
    this.profileMessageInput = document.getElementById("profileMessageInput") || null;
    this.profileMessageSendButton = document.getElementById("profileMessageSendBtn") || null;
    this.profileMessageAttachmentInput = document.getElementById("profileMessageAttachmentInput") || null;
    this.profileMessageAttachmentButton = document.getElementById("profileMessageAttachmentButton") || null;
    this.profileMessageAttachmentEncrypt = document.getElementById("profileMessageAttachmentEncrypt") || null;
    this.profileMessageAttachmentList = document.getElementById("profileMessageAttachmentList") || null;
    this.profileMessageAttachmentClearCache = document.getElementById("profileMessageAttachmentClearCache") || null;
    this.profileMessagesComposerHelper = document.getElementById("profileMessagesComposerHelper") || null;
    this.profileMessagesSendDmButton = document.getElementById("profileMessagesSendDm") || null;
    this.profileMessagesOpenRelaysButton = document.getElementById("profileMessagesOpenRelays") || null;
    this.profileMessagesPrivacyToggle = document.getElementById("profileMessagesPrivacyToggle") || null;
    this.profileMessagesPrivacyMode = document.getElementById("profileMessagesPrivacyMode") || null;
    this.profileMessagesUnreadDot = document.getElementById("profileMessagesUnreadDot") || null;
    this.profileLinkPreviewAutoToggle = document.getElementById("profileLinkPreviewAutoToggle") || null;
    this.profileMessagesRelayList = document.getElementById("profileMessagesRelayList") || null;
    this.profileMessagesRelayInput = document.getElementById("profileMessagesRelayInput") || null;
    this.profileMessagesRelayAdd = document.getElementById("profileMessagesRelayAdd") || null;
  }

  updateMessagePrivacyModeDisplay() {
    if (!(this.profileMessagesPrivacyMode instanceof HTMLElement)) {
      return;
    }

    const isNip17 =
      this.profileMessagesPrivacyToggle instanceof HTMLInputElement
        ? this.profileMessagesPrivacyToggle.checked
        : false;
    const label = isNip17 ? "NIP-17" : "NIP-04";
    this.profileMessagesPrivacyMode.textContent = `Privacy: ${label}`;
    this.profileMessagesPrivacyMode.title = isNip17
      ? "NIP-17 gift-wraps your DM so relays only see the wrapper and relay hints."
      : "NIP-04 sends a direct encrypted DM; relays can still see sender and recipient metadata.";
  }

  setMessagesLoadingState(state, options = {}) {
    const normalized = typeof state === "string" ? state : "idle";
    const defaults = {
      idle: "",
      loading: "Fetching direct messages from relays…",
      ready: "",
      empty: "No direct messages yet.",
      unauthenticated: "Sign in to view your direct messages.",
      error: "Failed to load direct messages. Try again later.",
    };

    const providedMessage =
      typeof options.message === "string" && options.message.trim()
        ? options.message.trim()
        : "";
    const message = providedMessage || defaults[normalized] || "";

    this.controller.messagesLoadingState = normalized;

    if (this.profileMessagesPane instanceof HTMLElement) {
      this.profileMessagesPane.setAttribute("data-messages-state", normalized);
    }

    const toggleVisibility = (element, shouldShow) => {
      if (!(element instanceof HTMLElement)) {
        return;
      }
      if (shouldShow) {
        element.classList.remove("hidden");
        element.removeAttribute("hidden");
      } else {
        element.classList.add("hidden");
        element.setAttribute("hidden", "");
      }
    };

    toggleVisibility(
      this.profileMessagesLoading,
      normalized === "loading",
    );

    if (this.profileMessagesError instanceof HTMLElement) {
      if (normalized === "error") {
        this.profileMessagesError.textContent = message;
        toggleVisibility(this.profileMessagesError, true);
      } else {
        this.profileMessagesError.textContent = "";
        toggleVisibility(this.profileMessagesError, false);
      }
    }

    if (this.profileMessagesEmpty instanceof HTMLElement) {
      if (normalized === "empty" || normalized === "unauthenticated") {
        this.profileMessagesEmpty.textContent = message || defaults[normalized];
        toggleVisibility(this.profileMessagesEmpty, true);
      } else {
        toggleVisibility(this.profileMessagesEmpty, false);
      }
    }

    const hasMessages =
      Array.isArray(this.controller.directMessagesCache) &&
      this.controller.directMessagesCache.length > 0;

    if (this.profileMessagesList instanceof HTMLElement) {
      if (normalized === "loading" || normalized === "unauthenticated") {
        toggleVisibility(this.profileMessagesList, false);
      } else if (hasMessages) {
        toggleVisibility(this.profileMessagesList, true);
      }
    }

    if (this.profileMessagesStatus instanceof HTMLElement) {
      if (message && normalized !== "error") {
        this.profileMessagesStatus.textContent = message;
      } else if (normalized === "error") {
        this.profileMessagesStatus.textContent = "";
      } else if (providedMessage) {
        this.profileMessagesStatus.textContent = providedMessage;
      } else {
        this.profileMessagesStatus.textContent = "";
      }
    }

    this.updateMessagesReloadState();
    this.updateMessageComposerState();

    if (this.dmAppShellContainer instanceof HTMLElement) {
      void this.renderDmAppShell(this.controller.directMessagesCache, {
        actorPubkey: this.controller.helper.resolveActiveDmActor(),
      });
    }
  }

  updateMessagesReloadState() {
    const button = this.profileMessagesReloadButton;
    if (!(button instanceof HTMLElement)) {
      return;
    }

    const actor = this.controller.helper.resolveActiveDmActor();
    const disabled =
      !actor ||
      this.controller.messagesLoadingState === "loading" ||
      this.controller.activeMessagesRequest !== null;

    if ("disabled" in button) {
      button.disabled = disabled;
    }

    if (disabled) {
      button.setAttribute("aria-disabled", "true");
    } else {
      button.removeAttribute("aria-disabled");
    }
  }

  updateMessageComposerState() {
    const input = this.profileMessageInput;
    const button = this.profileMessageSendButton;
    const helper = this.profileMessagesComposerHelper;
    const attachmentInput = this.profileMessageAttachmentInput;
    const attachmentButton = this.profileMessageAttachmentButton;
    const attachmentEncrypt = this.profileMessageAttachmentEncrypt;
    const attachmentClearCache = this.profileMessageAttachmentClearCache;
    const shouldDisable = this.controller.messagesLoadingState === "unauthenticated";

    const applyDisabledState = (element) => {
      if (!(element instanceof HTMLElement) || !("disabled" in element)) {
        return;
      }

      element.disabled = shouldDisable;
      if (shouldDisable) {
        element.setAttribute("aria-disabled", "true");
      } else {
        element.removeAttribute("aria-disabled");
      }
    };

    applyDisabledState(input);
    applyDisabledState(button);
    applyDisabledState(attachmentInput);
    applyDisabledState(attachmentButton);
    applyDisabledState(attachmentEncrypt);
    applyDisabledState(attachmentClearCache);

    if (helper instanceof HTMLElement) {
      if (shouldDisable) {
        helper.textContent = "Sign in to send messages.";
        helper.classList.remove("hidden");
        helper.removeAttribute("hidden");
      } else {
        helper.classList.add("hidden");
        helper.setAttribute("hidden", "");
      }
    }

    this.updateMessagePrivacyModeDisplay();
  }

  setMessagesAnnouncement(message) {
    if (!(this.profileMessagesStatus instanceof HTMLElement)) {
      return;
    }

    const content = typeof message === "string" ? message.trim() : "";
    if (!content) {
      this.profileMessagesStatus.textContent = "";
      if (this.messagesStatusClearTimeout) {
        clearTimeout(this.messagesStatusClearTimeout);
        this.messagesStatusClearTimeout = null;
      }
      return;
    }

    this.profileMessagesStatus.textContent = content;

    if (typeof window !== "undefined" && window && window.setTimeout) {
      if (this.messagesStatusClearTimeout) {
        clearTimeout(this.messagesStatusClearTimeout);
      }
      this.messagesStatusClearTimeout = window.setTimeout(() => {
        if (this.profileMessagesStatus) {
          this.profileMessagesStatus.textContent = "";
        }
        this.messagesStatusClearTimeout = null;
      }, 2500);
    }
  }

  async renderDirectMessageConversation() {
    const container = this.profileMessagesConversation;
    const emptyState = this.profileMessagesConversationEmpty;
    const actor = this.controller.helper.resolveActiveDmActor();
    const recipient = this.controller.helper.resolveActiveDmRecipient();

    if (!(container instanceof HTMLElement)) {
      return;
    }

    container.textContent = "";

    if (!actor || !recipient || !this.controller.directMessagesCache.length) {
      container.classList.add("hidden");
      container.setAttribute("hidden", "");
      if (emptyState instanceof HTMLElement) {
        emptyState.classList.remove("hidden");
        emptyState.removeAttribute("hidden");
      }
      return;
    }

    const messages = this.controller.directMessagesCache
      .filter((entry) => this.controller.helper.resolveDirectMessageRemote(entry, actor) === recipient)
      .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

    if (!messages.length) {
      container.classList.add("hidden");
      container.setAttribute("hidden", "");
      if (emptyState instanceof HTMLElement) {
        emptyState.classList.remove("hidden");
        emptyState.removeAttribute("hidden");
      }
      return;
    }

    if (emptyState instanceof HTMLElement) {
      emptyState.classList.add("hidden");
      emptyState.setAttribute("hidden", "");
    }

    void this.controller.maybePublishReadReceipt(messages, {
      recipientPubkey: recipient,
    });

    messages.forEach((message) => {
      const item = document.createElement("div");
      item.className = "card flex flex-col gap-2 p-3";

      const body = document.createElement("div");
      body.className = "text-sm text-text whitespace-pre-line";
      const text = typeof message.plaintext === "string" ? message.plaintext.trim() : "";
      body.textContent = text || "Attachment";
      item.appendChild(body);

      const attachments = extractAttachmentsFromMessage(message);
      attachments.forEach((attachment) => {
        const attachmentCard = document.createElement("div");
        attachmentCard.className = "flex flex-col gap-2 rounded-lg border border-border/60 p-3";

        const title = document.createElement("div");
        title.className = "text-xs font-semibold text-text";
        title.textContent = describeAttachment(attachment);
        attachmentCard.appendChild(title);

        const meta = document.createElement("div");
        meta.className = "text-3xs text-muted";
        const sizeLabel = formatAttachmentSize(attachment.size);
        const typeLabel = attachment.type || "file";
        meta.textContent = sizeLabel ? `${typeLabel} · ${sizeLabel}` : typeLabel;
        attachmentCard.appendChild(meta);

        const progress = document.createElement("progress");
        progress.className = "progress";
        progress.value = 0;
        progress.max = 1;
        progress.dataset.variant = "surface";
        attachmentCard.appendChild(progress);

        const status = document.createElement("div");
        status.className = "text-3xs text-muted";
        status.textContent = attachment.encrypted
          ? "Decrypting attachment…"
          : "Downloading attachment…";
        attachmentCard.appendChild(status);

        item.appendChild(attachmentCard);

        downloadAttachment({
          url: attachment.url,
          expectedHash: attachment.x,
          key: attachment.key,
          mimeType: attachment.type,
          onProgress: (fraction) => {
            progress.value = Number.isFinite(fraction) ? fraction : progress.value;
          },
        })
          .then((result) => {
            progress.value = 1;
            progress.classList.add("hidden");
            progress.setAttribute("hidden", "");
            status.textContent = attachment.encrypted ? "Decrypted." : "Ready.";

            if (!result?.objectUrl) {
              return;
            }

            if (attachment.type?.startsWith("image/")) {
              const img = document.createElement("img");
              img.src = result.objectUrl;
              img.alt = attachment.name || "Attachment preview";
              img.className = "h-40 w-full rounded-lg object-cover";
              attachmentCard.appendChild(img);
            } else if (attachment.type?.startsWith("video/")) {
              const video = document.createElement("video");
              video.src = result.objectUrl;
              video.controls = true;
              video.className = "w-full rounded-lg";
              attachmentCard.appendChild(video);
            } else if (attachment.type?.startsWith("audio/")) {
              const audio = document.createElement("audio");
              audio.src = result.objectUrl;
              audio.controls = true;
              audio.className = "w-full";
              attachmentCard.appendChild(audio);
            } else {
              const link = document.createElement("a");
              link.href = result.objectUrl;
              link.textContent = "Download attachment";
              link.className = "text-xs text-accent underline-offset-2 hover:underline";
              link.download = attachment.name || "attachment";
              attachmentCard.appendChild(link);
            }
          })
          .catch((error) => {
            status.textContent =
              error && typeof error.message === "string"
                ? error.message
                : "Attachment download failed.";
            status.classList.add("text-critical");
          });
      });

      container.appendChild(item);
    });

    container.classList.remove("hidden");
    container.removeAttribute("hidden");
  }

  createDirectMessageThreadItem(thread) {
    if (!thread || !thread.remoteHex) {
      return null;
    }

    const item = document.createElement("li");
    item.className = "card flex flex-col gap-3 p-4";
    item.setAttribute("data-remote-pubkey", thread.remoteHex);
    item.dataset.state = "inactive";

    const header = document.createElement("div");
    header.className = "flex items-start justify-between gap-3";

    const summary = this.controller.helper.resolveProfileSummaryForPubkey(thread.remoteHex);
    const summaryNode = this.createCompactProfileSummary({
      displayName: summary.displayName,
      displayNpub: summary.displayNpub,
      avatarSrc: summary.avatarSrc,
      size: "sm",
    });
    header.appendChild(summaryNode);

    const timestampMeta = this.controller.helper.formatMessageTimestamp(thread.latestTimestamp);
    if (timestampMeta.display) {
      const timeEl = document.createElement("time");
      timeEl.className =
        "text-3xs font-semibold uppercase tracking-extra-wide text-muted";
      if (timestampMeta.iso) {
        timeEl.setAttribute("datetime", timestampMeta.iso);
      }
      timeEl.textContent = timestampMeta.display;
      header.appendChild(timeEl);
    }

    item.appendChild(header);

    const previewText = this.controller.helper.extractDirectMessagePreview(thread.latestMessage);
    const previewEl = document.createElement("p");
    previewEl.className = "text-sm text-text whitespace-pre-line";
    previewEl.textContent = previewText || "Encrypted message";
    item.appendChild(previewEl);

    const meta = document.createElement("div");
    meta.className = "flex flex-wrap items-center gap-2";

    const direction =
      typeof thread.latestMessage?.direction === "string"
        ? thread.latestMessage.direction.toLowerCase()
        : "";
    if (direction) {
      const directionPill = document.createElement("span");
      directionPill.className = "pill";
      directionPill.dataset.variant = direction === "incoming" ? "info" : "muted";
      directionPill.textContent =
        direction === "incoming"
          ? "Incoming message"
          : direction === "outgoing"
          ? "Sent message"
          : "Message";
      meta.appendChild(directionPill);
    }

    const countPill = document.createElement("span");
    countPill.className = "pill";
    countPill.dataset.variant = "muted";
    const messageCount = Array.isArray(thread.messages)
      ? thread.messages.length
      : 0;
    countPill.textContent =
      messageCount === 1 ? "1 message" : `${messageCount} messages`;
    meta.appendChild(countPill);

    const scheme =
      typeof thread.latestMessage?.scheme === "string"
        ? thread.latestMessage.scheme.toUpperCase()
        : "";
    if (scheme) {
      const schemePill = document.createElement("span");
      schemePill.className = "pill";
      schemePill.dataset.variant = "muted";
      schemePill.textContent = scheme;
      meta.appendChild(schemePill);
    }

    item.appendChild(meta);

    item.addEventListener("click", () => {
      this.controller.setDirectMessageRecipient(thread.remoteHex, {
        reason: "thread-select",
      });
      this.controller.focusMessageComposer();
    });

    return item;
  }

  async renderProfileMessages(messages, { actorPubkey = null } = {}) {
    if (this.dmAppShellContainer instanceof HTMLElement) {
      await this.renderDmAppShell(messages, { actorPubkey });
    }

    if (!(this.profileMessagesList instanceof HTMLElement)) {
      if (!(this.dmAppShellContainer instanceof HTMLElement)) {
        this.pendingMessagesRender = {
          messages: Array.isArray(messages) ? messages : [],
          actorPubkey,
        };
      }
      return;
    }

    this.pendingMessagesRender = null;

    const normalizedActor = actorPubkey
      ? this.mainController.normalizeHexPubkey(actorPubkey)
      : this.controller.helper.resolveActiveDmActor();

    const renderToken = (this.controller.profileMessagesRenderToken += 1);
    const renderThreads = (threadsToRender) => {
      this.profileMessagesList.textContent = "";

      if (!threadsToRender.length) {
        this.profileMessagesList.classList.add("hidden");
        this.profileMessagesList.setAttribute("hidden", "");
        void this.renderDirectMessageConversation();
        return;
      }

      for (const thread of threadsToRender) {
        const item = this.createDirectMessageThreadItem(thread);
        if (item) {
          this.profileMessagesList.appendChild(item);
        }
      }

      const activeRecipient = this.controller.helper.resolveActiveDmRecipient();
      const hasActiveRecipient =
        activeRecipient &&
        threadsToRender.some((thread) => thread.remoteHex === activeRecipient);

      if (threadsToRender.length && !hasActiveRecipient) {
        this.controller.setDirectMessageRecipient(threadsToRender[0].remoteHex, {
          reason: "thread-default",
        });
        const conversationId = this.controller.helper.buildDmConversationId(
          normalizedActor,
          threadsToRender[0].remoteHex,
        );
        this.controller.setFocusedDmConversation(conversationId);
      } else if (hasActiveRecipient) {
        this.updateMessageThreadSelection(activeRecipient);
      }

      this.profileMessagesList.classList.remove("hidden");
      this.profileMessagesList.removeAttribute("hidden");
      void this.renderDirectMessageConversation();
    };

    const threads = this.controller.helper.groupDirectMessages(messages, normalizedActor);
    renderThreads(threads);

    const remoteKeys = new Set();
    for (const thread of threads) {
      if (thread.remoteHex) {
        remoteKeys.add(thread.remoteHex);
      }
    }

    if (
      remoteKeys.size &&
      this.mainController.services.batchFetchProfiles &&
      typeof this.mainController.services.batchFetchProfiles === "function"
    ) {
      Promise.resolve(this.mainController.services.batchFetchProfiles(remoteKeys))
        .then(() => {
          if (this.controller.profileMessagesRenderToken !== renderToken) {
            return;
          }
          const latestMessages = Array.isArray(this.controller.directMessagesCache)
            ? this.controller.directMessagesCache
            : messages;
          const latestActor = this.controller.helper.resolveActiveDmActor() || normalizedActor;
          const refreshedThreads = this.controller.helper.groupDirectMessages(
            latestMessages,
            latestActor,
          );
          renderThreads(refreshedThreads);
        })
        .catch((error) => {
          devLogger.warn(
            "[profileModal] Failed to fetch DM profile metadata:",
            error,
          );
        });
    }
  }

  async renderDmAppShell(messages, { actorPubkey = null } = {}) {
    const container =
      this.dmAppShellContainer instanceof HTMLElement
        ? this.dmAppShellContainer
        : null;
    if (!container) {
      return;
    }

    const snapshot = Array.isArray(messages) ? messages : this.controller.directMessagesCache;
    const {
      actor,
      conversations,
      activeConversationId,
      activeThread,
      timeline,
    } = await this.controller.helper.buildDmConversationData(snapshot, { actorPubkey });

    this.controller.setFocusedDmConversation(activeConversationId);

    const currentRecipient = this.controller.helper.resolveActiveDmRecipient();
    if (!currentRecipient && activeThread?.remoteHex) {
      this.controller.setDirectMessageRecipient(activeThread.remoteHex, {
        reason: "thread-default",
      });
    }

    const loadingState = this.controller.messagesLoadingState || "idle";
    const conversationState =
      loadingState === "loading"
        ? "loading"
        : loadingState === "error"
        ? "error"
        : loadingState === "empty" || loadingState === "unauthenticated"
        ? "empty"
        : "idle";

    const hasActiveConversation = Boolean(activeConversationId);
    const threadState =
      conversationState === "loading"
        ? "loading"
        : !hasActiveConversation
        ? "empty"
        : timeline.length
        ? "idle"
        : "empty";

    const privacyMode = this.controller.helper.resolveConversationPrivacyMode(
      activeThread?.latestMessage,
    );

    const currentUserSummary = this.controller.helper.resolveProfileSummaryForPubkey(
      this.controller.helper.resolveActiveDmActor(),
    );
    const currentUserAvatarUrl = currentUserSummary?.avatarSrc || "";

    container.textContent = "";

    try {
      const dmPrivacySettings = this.getDmPrivacySettingsSnapshot();

      this.dmAppShell = new AppShell({
        document,
        currentUserAvatarUrl,
        conversations,
        activeConversationId,
        conversationState,
        messages: timeline,
        threadState,
        privacyMode,
        dmPrivacySettings,
        composerState: this.controller.dmComposerState || "idle",
        notifications: [],
        zapConfig: {
            signer: this.mainController.services.nostrClient,
        },
        mobileView: this.controller.dmMobileView || "list",
        onSelectConversation: (conversation) => {
          void this.controller.handleDmConversationSelect(conversation);
        },
        onRefreshConversations: () => {
          this.controller.populateProfileMessages({ force: true });
        },
        onBack: () => {
          this.controller.dmMobileView = "list";
          void this.renderDmAppShell(this.controller.directMessagesCache, {
            actorPubkey: this.controller.helper.resolveActiveDmActor(),
          });
        },
        onSendMessage: (messageText, payload) => {
          void this.controller.handleDmAppShellSendMessage(messageText, payload);
        },
        onMarkConversationRead: (conversation) => {
          void this.controller.handleDmConversationMarkRead(conversation);
        },
        onMarkAllRead: () => {
          void this.controller.handleDmMarkAllConversationsRead();
        },
        onToggleReadReceipts: (enabled) => {
          this.controller.handleReadReceiptsToggle(enabled);
        },
        onToggleTypingIndicators: (enabled) => {
          this.controller.handleTypingIndicatorsToggle(enabled);
        },
        onOpenSettings: () => {
          this.controller.openDmSettingsModal();
        },
      });
    } catch (error) {
      this.dmAppShell = null;
      devLogger.warn("[profileModal] Failed to render DM app shell:", error);
      return;
    }

    const root =
      this.dmAppShell &&
      typeof this.dmAppShell.getRoot === "function"
        ? this.dmAppShell.getRoot()
        : null;
    if (!(root instanceof HTMLElement)) {
      devLogger.warn("[profileModal] DM app shell root missing.");
      return;
    }

    root.classList.add("bg-transparent");
    container.appendChild(root);

    if (actor && activeConversationId) {
      const renderedUntil =
        this.controller.helper.getLatestDirectMessageTimestampForConversation(
          activeConversationId,
          actor,
        ) || Date.now() / 1000;
      void this.mainController.nostrService?.acknowledgeRenderedDirectMessages?.(
        activeConversationId,
        renderedUntil,
      );
    }
  }

  mountDmAppShell() {
    const container =
      this.dmAppShellContainer instanceof HTMLElement
        ? this.dmAppShellContainer
        : null;
    if (!container) {
      return;
    }
    void this.renderDmAppShell(this.controller.directMessagesCache, {
      actorPubkey: this.controller.directMessagesLastActor,
    });
  }

  unmountDmAppShell() {
    const container =
      this.dmAppShellContainer instanceof HTMLElement
        ? this.dmAppShellContainer
        : null;
    if (container) {
      container.textContent = "";
    }

    this.dmAppShell = null;
  }

  clearDirectMessagesUpdateQueue() {
    if (this.directMessagesRenderTimeout) {
      const clearTimeoutFn =
        typeof window !== "undefined" && typeof window.clearTimeout === "function"
          ? window.clearTimeout.bind(window)
          : clearTimeout;
      clearTimeoutFn(this.directMessagesRenderTimeout);
      this.directMessagesRenderTimeout = null;
    }
    this.pendingDirectMessagesUpdate = null;
  }

  scheduleDirectMessagesRender(payload = null) {
    if (!payload) {
      return;
    }

    this.pendingDirectMessagesUpdate = payload;

    if (this.directMessagesRenderTimeout) {
      return;
    }

    const scheduleTimeout =
      typeof window !== "undefined" && typeof window.setTimeout === "function"
        ? window.setTimeout.bind(window)
        : setTimeout;

    this.directMessagesRenderTimeout = scheduleTimeout(() => {
      this.directMessagesRenderTimeout = null;
      this.flushDirectMessagesRender();
    }, DIRECT_MESSAGES_BATCH_DELAY_MS);
  }

  flushDirectMessagesRender() {
    const pending = this.pendingDirectMessagesUpdate;
    this.pendingDirectMessagesUpdate = null;
    if (!pending) {
      return;
    }

    const { messages, actorPubkey, reason } = pending;
    void this.renderProfileMessages(messages, { actorPubkey })
      .then(() => {
        if (!messages.length) {
          this.setMessagesLoadingState("empty");
        } else {
          this.setMessagesLoadingState("ready");
        }

        if (reason === "subscription") {
          this.setMessagesAnnouncement("New direct message received.");
        } else if (reason === "load") {
          this.setMessagesAnnouncement(
            messages.length === 1
              ? "1 direct message thread synced."
              : `${messages.length} direct message threads synced.`,
          );
        }
      })
      .catch((error) => {
        devLogger.warn(
          "[profileModal] Failed to render direct messages after update:",
          error,
        );
      });
  }

  createCompactProfileSummary({
    displayName,
    displayNpub,
    avatarSrc,
    size = "sm",
  } = {}) {
    const sizeClassMap = {
      xs: "h-8 w-8",
      sm: "h-10 w-10",
      md: "h-12 w-12",
    };
    const avatarSize = sizeClassMap[size] || sizeClassMap.sm;
    const safeName = displayName?.trim() || "Unknown profile";
    const safeNpub = displayNpub?.trim() || "npub unavailable";
    const avatarUrl = avatarSrc || FALLBACK_PROFILE_AVATAR;

    const container = document.createElement("div");
    container.className = "min-w-0 flex flex-1 items-center gap-2";

    const avatarWrapper = document.createElement("span");
    avatarWrapper.className = `flex ${avatarSize} flex-shrink-0 items-center justify-center overflow-hidden rounded-full border border-overlay-strong bg-overlay-panel-soft`;

    const avatarImg = document.createElement("img");
    avatarImg.className = "h-full w-full object-cover";
    avatarImg.src = avatarUrl;
    avatarImg.alt = `${safeName} avatar`;
    avatarWrapper.appendChild(avatarImg);

    const textStack = document.createElement("div");
    textStack.className = "min-w-0 flex flex-col";

    const nameEl = document.createElement("p");
    nameEl.className = "truncate text-xs font-semibold text-primary";
    nameEl.textContent = safeName;

    const npubEl = document.createElement("p");
    npubEl.className = "break-all font-mono text-2xs text-muted";
    npubEl.textContent = safeNpub;

    textStack.append(nameEl, npubEl);

    container.append(avatarWrapper, textStack);

    return container;
  }

}
