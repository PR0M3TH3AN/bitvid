import {
  getConversation,
  listConversations,
  updateConversationFromMessage,
  updateConversationOpenState,
} from "../storage/dmDb.js";
import { userLogger } from "../utils/logger.js";

function sanitizeTimestamp(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return 0;
  }
  return Math.floor(numeric);
}

function normalizeConversationState(conversation) {
  if (!conversation || typeof conversation !== "object") {
    return {
      conversation_id: "",
      opened_until: 0,
      downloaded_until: 0,
      unseen_count: 0,
    };
  }

  return {
    conversation_id: conversation.conversation_id || "",
    opened_until: sanitizeTimestamp(conversation.opened_until),
    downloaded_until: sanitizeTimestamp(conversation.downloaded_until),
    unseen_count: Number.isFinite(Number(conversation.unseen_count))
      ? Number(conversation.unseen_count)
      : 0,
  };
}

export class DmNotificationManager {
  constructor({ logger } = {}) {
    this.logger = logger || userLogger;
    this.conversationCache = new Map();
    this.focusedConversationId = "";
  }

  getFocusedConversationId() {
    return this.focusedConversationId;
  }

  setFocusedConversation(conversationId, isFocused = true) {
    if (typeof conversationId !== "string") {
      return;
    }

    const normalized = conversationId.trim();
    if (!normalized) {
      return;
    }

    if (isFocused) {
      this.focusedConversationId = normalized;
      return;
    }

    if (this.focusedConversationId === normalized) {
      this.focusedConversationId = "";
    }
  }

  async ensureConversationState(conversationId) {
    if (typeof conversationId !== "string" || !conversationId.trim()) {
      return null;
    }

    const normalized = conversationId.trim();
    if (this.conversationCache.has(normalized)) {
      return this.conversationCache.get(normalized);
    }

    try {
      const stored = await getConversation(normalized);
      const normalizedState = normalizeConversationState({
        conversation_id: normalized,
        ...stored,
      });
      this.conversationCache.set(normalized, normalizedState);
      return normalizedState;
    } catch (error) {
      this.logger.warn("[dmNotifications] Failed to hydrate conversation", error);
      const fallback = normalizeConversationState({ conversation_id: normalized });
      this.conversationCache.set(normalized, fallback);
      return fallback;
    }
  }

  async recordMessage({ record, preview = "", direction = "" } = {}) {
    if (!record || typeof record !== "object") {
      return null;
    }

    const conversationId =
      typeof record.conversation_id === "string"
        ? record.conversation_id.trim()
        : "";
    if (!conversationId) {
      return null;
    }

    const createdAt = sanitizeTimestamp(record.created_at);
    const conversationState = await this.ensureConversationState(conversationId);
    if (!conversationState) {
      return null;
    }

    const isIncoming = direction === "incoming";
    const isFocused = this.focusedConversationId === conversationId;
    const shouldNotify =
      isIncoming && !isFocused && createdAt > conversationState.opened_until;
    const unseenDelta =
      isIncoming && createdAt > conversationState.opened_until ? 1 : 0;

    let updated = null;
    try {
      updated = await updateConversationFromMessage(record, {
        preview,
        unseenDelta,
        downloadedUntil: createdAt,
      });
    } catch (error) {
      this.logger.warn("[dmNotifications] Failed to update conversation", error);
    }

    const normalizedUpdate = normalizeConversationState({
      conversation_id: conversationId,
      ...updated,
      opened_until: conversationState.opened_until,
    });

    this.conversationCache.set(conversationId, normalizedUpdate);

    return {
      conversation: normalizedUpdate,
      shouldNotify,
      isFocused,
    };
  }

  async acknowledgeRenderedMessages({ conversationId, renderedUntil } = {}) {
    if (typeof conversationId !== "string" || !conversationId.trim()) {
      return null;
    }

    const normalized = conversationId.trim();
    const conversationState = await this.ensureConversationState(normalized);
    if (!conversationState) {
      return null;
    }

    const nextOpenedUntil = Math.max(
      conversationState.opened_until || 0,
      sanitizeTimestamp(renderedUntil),
    );

    let updated = null;
    try {
      updated = await updateConversationOpenState(normalized, {
        openedUntil: nextOpenedUntil,
        unseenCount: 0,
      });
    } catch (error) {
      this.logger.warn("[dmNotifications] Failed to update opened_until", error);
    }

    const normalizedUpdate = normalizeConversationState({
      conversation_id: normalized,
      ...conversationState,
      ...updated,
      opened_until: nextOpenedUntil,
      unseen_count: 0,
    });

    this.conversationCache.set(normalized, normalizedUpdate);
    return normalizedUpdate;
  }

  async listConversationSummaries() {
    try {
      const stored = await listConversations();
      const summaries = stored.map((conversation) =>
        normalizeConversationState(conversation),
      );

      for (const summary of summaries) {
        if (summary.conversation_id) {
          this.conversationCache.set(summary.conversation_id, summary);
        }
      }

      return summaries;
    } catch (error) {
      this.logger.warn("[dmNotifications] Failed to list conversations", error);
      return [];
    }
  }

  getUnseenCount(conversationId) {
    if (typeof conversationId !== "string" || !conversationId.trim()) {
      return 0;
    }

    const cached = this.conversationCache.get(conversationId.trim());
    return cached && Number.isFinite(Number(cached.unseen_count))
      ? Number(cached.unseen_count)
      : 0;
  }
}
