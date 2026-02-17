import { devLogger, userLogger } from "../../utils/logger.js";
import { extractAttachmentsFromMessage, formatAttachmentSize, describeAttachment } from "../../attachments/attachmentUtils.js";
import { formatTimeAgo } from "../../utils/formatters.js";

const FALLBACK_PROFILE_AVATAR = "assets/svg/default-profile.svg";

export class ProfileDirectMessageHelper {
  constructor(mainController, controller) {
    this.mainController = mainController;
    this.controller = controller;
  }

  resolveActiveDmActor() {
    const active = this.mainController.normalizeHexPubkey(this.mainController.getActivePubkey());
    if (active) {
      return active;
    }

    const client = this.mainController.services.nostrClient || null;
    if (client) {
      if (typeof client.pubkey === "string" && client.pubkey.trim()) {
        const normalizedClient = this.mainController.normalizeHexPubkey(client.pubkey);
        if (normalizedClient) {
          return normalizedClient;
        }
      }

      if (
        client.sessionActor &&
        typeof client.sessionActor.pubkey === "string" &&
        client.sessionActor.pubkey.trim()
      ) {
        const session = this.mainController.normalizeHexPubkey(client.sessionActor.pubkey);
        if (session) {
          return session;
        }
      }
    }

    return null;
  }

  resolveActiveDmRecipient() {
    const candidate =
      typeof this.mainController.state.getDmRecipient === "function"
        ? this.mainController.state.getDmRecipient()
        : null;
    const normalized = this.mainController.normalizeHexPubkey(candidate);
    if (normalized) {
      return normalized;
    }
    return null;
  }

  resolveActiveDmRelayOwner() {
    const active = this.mainController.normalizeHexPubkey(this.mainController.getActivePubkey());
    if (active) {
      return active;
    }

    return this.resolveActiveDmActor();
  }

  getActiveDmRelayPreferences() {
    const owner = this.resolveActiveDmRelayOwner();
    if (!owner || typeof this.mainController.state.getDmRelayPreferences !== "function") {
      return [];
    }

    const relays = this.mainController.state.getDmRelayPreferences(owner);
    return Array.isArray(relays) ? relays.slice() : [];
  }

  buildDmRecipientContext(pubkey) {
    const normalized = this.mainController.normalizeHexPubkey(pubkey);
    if (!normalized) {
      return null;
    }

    const npub =
      typeof this.mainController.safeEncodeNpub === "function"
        ? this.mainController.safeEncodeNpub(normalized)
        : null;

    const cacheEntry =
      typeof this.mainController.services.getProfileCacheEntry === "function"
        ? this.mainController.services.getProfileCacheEntry(normalized)
        : null;
    const profile = cacheEntry?.profile || null;

    const displayName =
      profile?.display_name?.trim?.() ||
      profile?.name?.trim?.() ||
      (typeof this.mainController.formatShortNpub === "function"
        ? this.mainController.formatShortNpub(npub)
        : npub) ||
      npub ||
      "Unknown profile";

    const relayHints =
      typeof this.mainController.state.getDmRelayHints === "function"
        ? this.mainController.state.getDmRelayHints(normalized)
        : [];

    return {
      pubkey: normalized,
      npub,
      profile,
      displayName,
      relayHints: Array.isArray(relayHints) ? relayHints.slice() : [],
    };
  }

  async ensureDmRecipientData(pubkey) {
    const normalized = this.mainController.normalizeHexPubkey(pubkey);
    if (!normalized) {
      return null;
    }

    if (
      typeof this.mainController.services.batchFetchProfiles === "function"
    ) {
      try {
        await this.mainController.services.batchFetchProfiles([normalized]);
      } catch (error) {
        devLogger.warn(
          "[profileModal] Failed to fetch DM recipient metadata:",
          error,
        );
      }
    }

    if (typeof this.mainController.services.fetchDmRelayHints === "function") {
      try {
        const hints = await this.mainController.services.fetchDmRelayHints(normalized);
        if (typeof this.mainController.state.setDmRelayHints === "function") {
          this.mainController.state.setDmRelayHints(normalized, hints);
        }
      } catch (error) {
        devLogger.warn(
          "[profileModal] Failed to fetch DM relay hints:",
          error,
        );
      }
    }

    const context = this.buildDmRecipientContext(normalized);
    this.updateDmPrivacyToggleForRecipient(context);
    return context;
  }

  resolveDirectMessageEventId(message) {
    if (!message || typeof message !== "object") {
      return "";
    }

    const eventId =
      typeof message.event?.id === "string" ? message.event.id.trim() : "";
    if (eventId) {
      return eventId;
    }

    const innerId =
      typeof message.message?.id === "string" ? message.message.id.trim() : "";
    return innerId;
  }

  resolveDirectMessageKind(message) {
    if (!message || typeof message !== "object") {
      return null;
    }

    if (Number.isFinite(message?.event?.kind)) {
      return Number(message.event.kind);
    }

    if (Number.isFinite(message?.message?.kind)) {
      return Number(message.message.kind);
    }

    return null;
  }

  extractDirectMessagePreview(entry) {
    if (!entry || typeof entry !== "object") {
      return "";
    }

    const candidates = [];
    if (typeof entry.plaintext === "string") {
      candidates.push(entry.plaintext);
    }
    if (typeof entry.preview === "string") {
      candidates.push(entry.preview);
    }
    if (
      entry.snapshot &&
      typeof entry.snapshot.preview === "string" &&
      entry.snapshot.preview.trim()
    ) {
      candidates.push(entry.snapshot.preview);
    }
    if (entry.message && typeof entry.message.content === "string") {
      candidates.push(entry.message.content);
    }

    const preview = candidates.find((value) => value && value.trim());
    return preview ? preview.trim() : "";
  }

  resolveProfileSummaryForPubkey(pubkey) {
    const normalized = this.mainController.normalizeHexPubkey(pubkey);
    const fallbackNpub =
      normalized && typeof this.mainController.safeEncodeNpub === "function"
        ? this.mainController.safeEncodeNpub(normalized)
        : null;
    const formattedNpub =
      typeof this.mainController.formatShortNpub === "function"
        ? this.mainController.formatShortNpub(fallbackNpub)
        : fallbackNpub;

    let displayName = formattedNpub || fallbackNpub || "Unknown profile";
    let avatarSrc = FALLBACK_PROFILE_AVATAR;
    let lightningAddress = "";
    let status = "";

    if (normalized && typeof this.mainController.services.getProfileCacheEntry === "function") {
      const cacheEntry = this.mainController.services.getProfileCacheEntry(normalized);
      const profile = cacheEntry?.profile || null;
      if (profile) {
        if (typeof profile.display_name === "string" && profile.display_name.trim()) {
          displayName = profile.display_name.trim();
        } else if (typeof profile.name === "string" && profile.name.trim()) {
          displayName = profile.name.trim();
        }

        if (typeof profile.picture === "string" && profile.picture.trim()) {
          avatarSrc = profile.picture.trim();
        }

        if (typeof profile.lud16 === "string" && profile.lud16.trim()) {
          lightningAddress = profile.lud16.trim();
        } else if (typeof profile.lud06 === "string" && profile.lud06.trim()) {
          lightningAddress = profile.lud06.trim();
        }

        if (typeof profile.status === "string" && profile.status.trim()) {
          status = profile.status.trim();
        }
      }
    }

    return {
      displayName,
      displayNpub: formattedNpub || fallbackNpub || "npub unavailable",
      avatarSrc,
      lightningAddress,
      status,
    };
  }

  formatMessageTimestamp(timestamp) {
    const numeric = Number(timestamp);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      return { display: "", iso: "" };
    }

    try {
      const date = new Date(numeric * 1000);
      return {
        display: date.toLocaleString(undefined, {
          year: "numeric",
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        }),
        iso: date.toISOString(),
      };
    } catch (error) {
      return { display: "", iso: "" };
    }
  }

  buildDmConversationId(actorPubkey, remotePubkey) {
    const normalizedActor = this.mainController.normalizeHexPubkey(actorPubkey);
    const normalizedRemote = this.mainController.normalizeHexPubkey(remotePubkey);

    if (!normalizedActor || !normalizedRemote) {
      return "";
    }

    return `dm:${[normalizedActor, normalizedRemote].sort().join(":")}`;
  }

  formatConversationTimestamp(timestamp) {
    const numeric = Number(timestamp);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      return "";
    }

    try {
      return formatTimeAgo(numeric);
    } catch (error) {
      return "";
    }
  }

  formatMessageClockTime(timestamp) {
    const numeric = Number(timestamp);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      return "";
    }

    try {
      const date = new Date(numeric * 1000);
      return date.toLocaleTimeString(undefined, {
        hour: "numeric",
        minute: "2-digit",
      });
    } catch (error) {
      return "";
    }
  }

  formatMessageDayLabel(timestamp) {
    const numeric = Number(timestamp);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      return "";
    }

    try {
      const date = new Date(numeric * 1000);
      const today = new Date();
      const startOfToday = new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate(),
      );
      const startOfMessageDay = new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate(),
      );
      const diffDays = Math.round(
        (startOfToday - startOfMessageDay) / (1000 * 60 * 60 * 24),
      );

      if (diffDays === 0) {
        return "Today";
      }
      if (diffDays === 1) {
        return "Yesterday";
      }

      return date.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch (error) {
      return "";
    }
  }

  resolveDirectMessageStatus(message) {
    if (!message || typeof message !== "object") {
      return "sent";
    }

    const status =
      typeof message.status === "string"
        ? message.status
        : typeof message.deliveryStatus === "string"
        ? message.deliveryStatus
        : typeof message.state === "string"
        ? message.state
        : "";

    return status ? status.trim() : "sent";
  }

  resolveDirectMessageBody(message) {
    if (!message || typeof message !== "object") {
      return "";
    }

    if (typeof message.plaintext === "string" && message.plaintext.trim()) {
      return message.plaintext.trim();
    }

    const preview = this.extractDirectMessagePreview(message);
    if (preview) {
      return preview;
    }

    const attachments = extractAttachmentsFromMessage(message);
    if (attachments.length) {
      return describeAttachment(attachments[0]);
    }

    return "";
  }

  resolveDirectMessagePreviewForConversation(message) {
    if (!message || typeof message !== "object") {
      return "";
    }

    const preview = this.extractDirectMessagePreview(message);
    if (preview) {
      return preview;
    }

    const attachments = extractAttachmentsFromMessage(message);
    if (attachments.length) {
      return describeAttachment(attachments[0]);
    }

    return "";
  }

  resolveRemoteForConversationId(conversationId, actorPubkey) {
    const actor = this.mainController.normalizeHexPubkey(actorPubkey || this.resolveActiveDmActor());
    const normalizedConversationId =
      typeof conversationId === "string" ? conversationId.trim() : "";

    if (!actor || !normalizedConversationId) {
      return null;
    }

    for (const entry of Array.isArray(this.controller.directMessagesCache) ? this.controller.directMessagesCache : []) {
      const remote = this.resolveDirectMessageRemote(entry, actor);
      if (!remote) {
        continue;
      }
      const resolvedId = this.buildDmConversationId(actor, remote);
      if (resolvedId && resolvedId === normalizedConversationId) {
        return remote;
      }
    }

    return null;
  }

  resolveConversationPrivacyMode(latestMessage) {
    const scheme = this.resolveDirectMessageScheme(latestMessage);
    if (scheme.includes("nip17") || scheme.includes("nip44")) {
      return "nip17";
    }
    return "nip04";
  }

  getDirectMessagesForConversation(conversationId, actorPubkey = null) {
    const actor = this.mainController.normalizeHexPubkey(actorPubkey || this.resolveActiveDmActor());
    if (!actor || !conversationId) {
      return [];
    }

    const remote = this.resolveRemoteForConversationId(conversationId, actor);
    if (!remote) {
      return [];
    }

    return (Array.isArray(this.controller.directMessagesCache) ? this.controller.directMessagesCache : [])
      .filter(
        (entry) =>
          entry &&
          entry.ok === true &&
          this.resolveDirectMessageRemote(entry, actor) === remote,
      )
      .sort((a, b) => (a?.timestamp || 0) - (b?.timestamp || 0));
  }

  getLatestDirectMessageTimestampForConversation(conversationId, actorPubkey = null) {
    const messages = this.getDirectMessagesForConversation(
      conversationId,
      actorPubkey,
    );
    if (!messages.length) {
      return 0;
    }

    const last = messages[messages.length - 1];
    return Number(last?.timestamp) || 0;
  }

  buildDmMessageTimeline(messages, { actorPubkey, remotePubkey } = {}) {
    const actor = this.mainController.normalizeHexPubkey(actorPubkey);
    const remote = this.mainController.normalizeHexPubkey(remotePubkey);
    if (!actor || !remote) {
      return [];
    }

    const threadMessages = Array.isArray(messages)
      ? messages.filter((entry) => this.resolveDirectMessageRemote(entry, actor) === remote)
      : [];

    threadMessages.sort((a, b) => (a?.timestamp || 0) - (b?.timestamp || 0));

    const timeline = [];
    let lastDayLabel = "";

    threadMessages.forEach((message) => {
      const dayLabel = this.formatMessageDayLabel(message?.timestamp);
      if (dayLabel && dayLabel !== lastDayLabel) {
        timeline.push({ type: "day", label: dayLabel });
        lastDayLabel = dayLabel;
      }

      timeline.push({
        id: this.resolveDirectMessageEventId(message) || "",
        direction: message?.direction || "incoming",
        body: this.resolveDirectMessageBody(message) || "Encrypted message",
        timestamp: this.formatMessageClockTime(message?.timestamp),
        status: this.resolveDirectMessageStatus(message),
      });
    });

    return timeline;
  }

  async buildDmConversationData(messages, { actorPubkey } = {}) {
    const actor = this.mainController.normalizeHexPubkey(
      actorPubkey || this.resolveActiveDmActor(),
    );
    if (!actor) {
      return {
        actor: "",
        conversations: [],
        activeConversationId: "",
        activeThread: null,
        activeRemotePubkey: null,
        timeline: [],
      };
    }

    const allThreads = this.groupDirectMessages(messages, actor);
    const blocksService = this.mainController.services.userBlocks;
    const isRemoteBlocked =
      blocksService && typeof blocksService.isBlocked === "function"
        ? (pubkey) => blocksService.isBlocked(pubkey)
        : () => false;
    const threads = allThreads.filter(
      (thread) => !thread.remoteHex || !isRemoteBlocked(thread.remoteHex),
    );
    const remoteKeys = new Set();
    threads.forEach((thread) => {
      if (thread.remoteHex) {
        remoteKeys.add(thread.remoteHex);
      }
    });

    if (
      remoteKeys.size &&
      this.mainController.services.batchFetchProfiles &&
      typeof this.mainController.services.batchFetchProfiles === "function"
    ) {
      try {
        await this.mainController.services.batchFetchProfiles(remoteKeys);
      } catch (error) {
        devLogger.warn(
          "[profileModal] Failed to fetch DM profile metadata:",
          error,
        );
      }
    }

    const conversations = threads.map((thread) => {
      const conversationId = this.buildDmConversationId(actor, thread.remoteHex);
      const summary = this.resolveProfileSummaryForPubkey(thread.remoteHex);
      const preview = this.resolveDirectMessagePreviewForConversation(thread.latestMessage);
      const unreadCount =
        this.mainController.nostrService &&
        typeof this.mainController.nostrService.getDirectMessageUnseenCount === "function" &&
        conversationId
          ? this.mainController.nostrService.getDirectMessageUnseenCount(conversationId)
          : 0;
      const recipientContext = this.buildDmRecipientContext(thread.remoteHex);

      return {
        id: conversationId,
        name: summary.displayName,
        preview: preview || "Encrypted message",
        timestamp: this.formatConversationTimestamp(thread.latestTimestamp),
        unreadCount,
        avatarSrc: summary.avatarSrc,
        status: summary.status,
        pubkey: thread.remoteHex,
        lightningAddress: summary.lightningAddress,
        relayHints: Array.isArray(recipientContext?.relayHints)
          ? recipientContext.relayHints
          : [],
      };
    });

    const conversationMap = new Map();
    threads.forEach((thread) => {
      const conversationId = this.buildDmConversationId(actor, thread.remoteHex);
      if (conversationId) {
        conversationMap.set(conversationId, thread);
      }
    });

    const storedRecipient = this.resolveActiveDmRecipient();
    const storedConversationId =
      storedRecipient && actor
        ? this.buildDmConversationId(actor, storedRecipient)
        : "";
    const preferredConversationId =
      this.controller.activeDmConversationId || storedConversationId;
    const fallbackConversationId = conversations[0]?.id || "";
    const activeConversationId =
      preferredConversationId && conversationMap.has(preferredConversationId)
        ? preferredConversationId
        : fallbackConversationId;
    const activeThread = activeConversationId
      ? conversationMap.get(activeConversationId)
      : null;
    const activeRemotePubkey =
      activeThread?.remoteHex ||
      (activeConversationId
        ? this.resolveRemoteForConversationId(activeConversationId, actor)
        : storedRecipient) ||
      null;

    if (activeConversationId && this.controller.activeDmConversationId !== activeConversationId) {
      this.controller.activeDmConversationId = activeConversationId;
    }

    return {
      actor,
      conversations,
      activeConversationId,
      activeThread,
      activeRemotePubkey,
      timeline:
        activeRemotePubkey && actor
          ? this.buildDmMessageTimeline(messages, {
              actorPubkey: actor,
              remotePubkey: activeRemotePubkey,
            })
          : [],
    };
  }

  groupDirectMessages(messages, actorPubkey) {
    const normalizedActor = actorPubkey
      ? this.mainController.normalizeHexPubkey(actorPubkey)
      : this.resolveActiveDmActor();

    const threadMap = new Map();
    for (const entry of Array.isArray(messages) ? messages : []) {
      if (!entry || entry.ok !== true) {
        continue;
      }

      const remoteHex = this.resolveDirectMessageRemote(entry, normalizedActor);
      if (!remoteHex) {
        continue;
      }

      const thread = threadMap.get(remoteHex) || {
        remoteHex,
        messages: [],
        latestTimestamp: 0,
        latestMessage: null,
      };

      thread.messages.push(entry);

      const ts = Number(entry.timestamp) || 0;
      if (!thread.latestMessage || ts > thread.latestTimestamp) {
        thread.latestTimestamp = ts;
        thread.latestMessage = entry;
      }

      threadMap.set(remoteHex, thread);
    }

    const threads = Array.from(threadMap.values());
    threads.sort((a, b) => (b.latestTimestamp || 0) - (a.latestTimestamp || 0));
    return threads;
  }

  resolveDirectMessageRemote(entry, actorPubkey = null) {
    if (!entry || entry.ok !== true) {
      return null;
    }

    const normalizedActor = actorPubkey
      ? this.mainController.normalizeHexPubkey(actorPubkey)
      : this.resolveActiveDmActor();

    if (typeof entry.remotePubkey === "string") {
      const directRemote = this.mainController.normalizeHexPubkey(entry.remotePubkey);
      if (directRemote && directRemote !== normalizedActor) {
        return directRemote;
      }
    }

    if (entry.snapshot && typeof entry.snapshot.remotePubkey === "string") {
      const snapshotRemote = this.mainController.normalizeHexPubkey(entry.snapshot.remotePubkey);
      if (snapshotRemote && snapshotRemote !== normalizedActor) {
        return snapshotRemote;
      }
    }

    const direction =
      typeof entry.direction === "string" ? entry.direction.toLowerCase() : "";

    const senderHex =
      entry.sender && typeof entry.sender.pubkey === "string"
        ? this.mainController.normalizeHexPubkey(entry.sender.pubkey)
        : null;

    if (direction === "incoming" && senderHex && senderHex !== normalizedActor) {
      return senderHex;
    }

    if (Array.isArray(entry.recipients)) {
      for (const recipient of entry.recipients) {
        const candidate =
          recipient && typeof recipient.pubkey === "string"
            ? this.mainController.normalizeHexPubkey(recipient.pubkey)
            : null;
        if (candidate && candidate !== normalizedActor) {
          return candidate;
        }
      }
    }

    if (direction === "outgoing" && senderHex && senderHex !== normalizedActor) {
      return senderHex;
    }

    if (entry.message && typeof entry.message.pubkey === "string") {
      const messagePubkey = this.mainController.normalizeHexPubkey(entry.message.pubkey);
      if (messagePubkey && messagePubkey !== normalizedActor) {
        return messagePubkey;
      }
    }

    if (entry.event && typeof entry.event.pubkey === "string") {
      const eventPubkey = this.mainController.normalizeHexPubkey(entry.event.pubkey);
      if (eventPubkey && eventPubkey !== normalizedActor) {
        return eventPubkey;
      }
    }

    if (senderHex && senderHex !== normalizedActor) {
      return senderHex;
    }

    return null;
  }

}
