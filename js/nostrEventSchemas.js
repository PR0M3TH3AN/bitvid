import { devLogger } from "./utils/logger.js";
import { decodeNpubToHex } from "./nostr/nip46Client.js";
import {
  ADMIN_LIST_NAMESPACE,
  ADMIN_COMMUNITY_BLACKLIST_SOURCES,
  ADMIN_COMMUNITY_BLACKLIST_PREFIX,
  isDevMode,
  WATCH_HISTORY_KIND,
  WATCH_HISTORY_LIST_IDENTIFIER,
  WATCH_HISTORY_VERSION_TAG_VALUE,
} from "./config.js";

export const NOTE_TYPES = Object.freeze({
  VIDEO_POST: "videoPost",
  VIDEO_MIRROR: "videoMirror",
  NIP71_VIDEO: "nip71Video",
  NIP71_SHORT_VIDEO: "nip71ShortVideo",
  REPOST: "repost",
  RELAY_LIST: "relayList",
  VIEW_EVENT: "viewEvent",
  VIDEO_REACTION: "videoReaction",
  VIDEO_COMMENT: "videoComment",
  DM_ATTACHMENT: "dmAttachment",
  DM_READ_RECEIPT: "dmReadReceipt",
  DM_TYPING: "dmTypingIndicator",
  ZAP_REQUEST: "zapRequest",
  ZAP_RECEIPT: "zapReceipt",
  WATCH_HISTORY: "watchHistory",
  SUBSCRIPTION_LIST: "subscriptionList",
  USER_BLOCK_LIST: "userBlockList",
  HASHTAG_PREFERENCES: "hashtagPreferences",
  DM_RELAY_LIST: "dmRelayList",
  ADMIN_MODERATION_LIST: "adminModerationList",
  ADMIN_BLACKLIST: "adminBlacklist",
  ADMIN_WHITELIST: "adminWhitelist",
  PROFILE_METADATA: "profileMetadata",
  MUTE_LIST: "muteList",
});

export const SUBSCRIPTION_LIST_IDENTIFIER = "subscriptions";
export const BLOCK_LIST_IDENTIFIER = "user-blocks";
export const ADMIN_LIST_IDENTIFIERS = Object.freeze({
  moderation: "editors",
  editors: "editors",
  whitelist: "whitelist",
  blacklist: "blacklist",
  communityBlacklistSources: ADMIN_COMMUNITY_BLACKLIST_SOURCES,
});

export { ADMIN_COMMUNITY_BLACKLIST_SOURCES };
export { ADMIN_COMMUNITY_BLACKLIST_PREFIX };

const DEFAULT_APPEND_TAGS = [];

let cachedUtf8Encoder = null;

const ADDITIONAL_POINTER_TAGS = new Set(["p", "e"]);
const HEX_32_BYTE_REGEX = /^[0-9a-f]{64}$/i;

function normalizePointerIdentifier(value) {
  if (typeof value !== "string") {
    return "";
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  if (HEX_32_BYTE_REGEX.test(trimmed)) {
    return trimmed.toLowerCase();
  }

  const decoded = decodeNpubToHex(trimmed);
  if (decoded && HEX_32_BYTE_REGEX.test(decoded)) {
    return decoded.toLowerCase();
  }

  return "";
}

function normalizeTagSlotValue(value) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      return "";
    }
    return String(value);
  }

  if (value === null || value === undefined) {
    return "";
  }

  return "";
}

export function sanitizeAdditionalTags(additionalTags) {
  if (!Array.isArray(additionalTags) || !additionalTags.length) {
    return [];
  }

  const sanitized = [];

  additionalTags.forEach((tag) => {
    if (!Array.isArray(tag) || tag.length < 2) {
      return;
    }

    const rawName = tag[0];
    if (typeof rawName !== "string") {
      return;
    }

    const tagName = rawName.trim();
    if (!tagName) {
      return;
    }

    const lowerName = tagName.toLowerCase();
    let primaryValue = "";

    if (ADDITIONAL_POINTER_TAGS.has(lowerName)) {
      primaryValue = normalizePointerIdentifier(tag[1]);
    } else {
      primaryValue = normalizeTagSlotValue(tag[1]);
    }

    if (!primaryValue) {
      return;
    }

    const sanitizedTag = [tagName, primaryValue];

    for (let index = 2; index < tag.length; index += 1) {
      const extraValue = normalizeTagSlotValue(tag[index]);
      if (extraValue) {
        sanitizedTag.push(extraValue);
      }
    }

    sanitized.push(sanitizedTag);
  });

  return sanitized;
}

function ensureValidUtf8Content(value) {
  let normalized = "";
  if (typeof value === "string") {
    normalized = value;
  } else if (value === undefined || value === null) {
    normalized = "";
  } else if (typeof value === "object") {
    try {
      const stringified = JSON.stringify(value);
      normalized = typeof stringified === "string" ? stringified : "";
    } catch (error) {
      devLogger.warn(
        "[nostrEventSchemas] Failed to serialize view event content:",
        error
      );
      normalized = "";
    }
  } else {
    normalized = String(value);
  }

  if (normalized) {
    const builder = [];
    let mutated = false;
    for (let index = 0; index < normalized.length; index += 1) {
      const code = normalized.charCodeAt(index);
      if (code >= 0xd800 && code <= 0xdbff) {
        const nextCode = normalized.charCodeAt(index + 1);
        if (nextCode >= 0xdc00 && nextCode <= 0xdfff) {
          builder.push(normalized[index], normalized[index + 1]);
          index += 1;
        } else {
          mutated = true;
        }
      } else if (code >= 0xdc00 && code <= 0xdfff) {
        mutated = true;
      } else {
        builder.push(normalized[index]);
      }
    }
    if (mutated) {
      devLogger.warn(
        "[nostrEventSchemas] Dropping unmatched surrogate characters from event content"
      );
      normalized = builder.join("");
    }
  }

  if (!cachedUtf8Encoder && typeof TextEncoder !== "undefined") {
    cachedUtf8Encoder = new TextEncoder();
  }

  if (cachedUtf8Encoder) {
    try {
      cachedUtf8Encoder.encode(normalized);
    } catch (error) {
      devLogger.warn(
        "[nostrEventSchemas] Dropping invalid UTF-8 characters from event content",
        error
      );
      const sanitized = Array.from(normalized)
        .filter((char) => {
          const code = char.charCodeAt(0);
          return code < 0xd800 || code > 0xdfff;
        })
        .join("");
      try {
        cachedUtf8Encoder.encode(sanitized);
        normalized = sanitized;
      } catch (encodeError) {
        devLogger.warn(
                    "[nostrEventSchemas] Failed to normalize view event content; defaulting to empty string",
                    encodeError
                  );
        normalized = "";
      }
    }
  }

  return normalized;
}

const BASE_SCHEMAS = {
  [NOTE_TYPES.VIDEO_POST]: {
    type: NOTE_TYPES.VIDEO_POST,
    label: "Video post",
    kind: 30078,
    topicTag: { name: "t", value: "video" },
    identifierTag: { name: "d" },
    appendTags: DEFAULT_APPEND_TAGS,
    content: {
      format: "json",
      schemaVersion: 3,
      fields: [
        { key: "version", type: "number", required: true },
        { key: "title", type: "string", required: true },
        { key: "url", type: "string", required: false },
        { key: "magnet", type: "string", required: false },
        { key: "thumbnail", type: "string", required: false },
        { key: "description", type: "string", required: false },
        { key: "mode", type: "string", required: false },
        { key: "videoRootId", type: "string", required: true },
        { key: "deleted", type: "boolean", required: false },
        { key: "isPrivate", type: "boolean", required: false },
        { key: "isNsfw", type: "boolean", required: false },
        { key: "isForKids", type: "boolean", required: false },
        { key: "enableComments", type: "boolean", required: false },
        { key: "ws", type: "string", required: false },
        { key: "xs", type: "string", required: false },
      ],
    },
  },
  [NOTE_TYPES.VIDEO_MIRROR]: {
    type: NOTE_TYPES.VIDEO_MIRROR,
    label: "NIP-94 mirror",
    kind: 1063,
    appendTags: DEFAULT_APPEND_TAGS,
    content: {
      format: "text",
      description: "Optional alt text carried alongside hosted URL metadata.",
    },
  },
  [NOTE_TYPES.REPOST]: {
    type: NOTE_TYPES.REPOST,
    label: "NIP-18 repost",
    kind: 6,
    appendTags: DEFAULT_APPEND_TAGS,
    content: {
      format: "json",
      description: "Content field contains the JSON-serialized event being reposted.",
    },
  },
  [NOTE_TYPES.NIP71_VIDEO]: {
    type: NOTE_TYPES.NIP71_VIDEO,
    label: "NIP-71 video (normal)",
    kind: 21,
    featureFlag: "FEATURE_PUBLISH_NIP71",
    appendTags: DEFAULT_APPEND_TAGS,
    content: {
      format: "text",
      description:
        "Summary or description for the video body; tags carry structured metadata.",
    },
  },
  [NOTE_TYPES.NIP71_SHORT_VIDEO]: {
    type: NOTE_TYPES.NIP71_SHORT_VIDEO,
    label: "NIP-71 video (short)",
    kind: 22,
    featureFlag: "FEATURE_PUBLISH_NIP71",
    appendTags: DEFAULT_APPEND_TAGS,
    content: {
      format: "text",
      description:
        "Summary or description for the short-form video; structured fields live in tags.",
    },
  },
  [NOTE_TYPES.RELAY_LIST]: {
    type: NOTE_TYPES.RELAY_LIST,
    label: "Relay list metadata",
    kind: 10002,
    relayTagName: "r",
    readMarker: "read",
    writeMarker: "write",
    appendTags: DEFAULT_APPEND_TAGS,
    content: { format: "empty", description: "Content field unused." },
  },
  [NOTE_TYPES.DM_RELAY_LIST]: {
    type: NOTE_TYPES.DM_RELAY_LIST,
    label: "DM relay hints",
    kind: 10050,
    relayTagName: "relay",
    appendTags: DEFAULT_APPEND_TAGS,
    content: { format: "empty", description: "Content field unused." },
  },
  [NOTE_TYPES.VIEW_EVENT]: {
    type: NOTE_TYPES.VIEW_EVENT,
    label: "View counter",
    kind: WATCH_HISTORY_KIND,
    topicTag: { name: "t", value: "view" },
    identifierTag: { name: "d" },
    sessionTag: { name: "session", value: "true" },
    appendTags: DEFAULT_APPEND_TAGS,
    content: {
      format: "text",
      description: "Optional plaintext content used for diagnostics.",
    },
  },
  [NOTE_TYPES.VIDEO_REACTION]: {
    type: NOTE_TYPES.VIDEO_REACTION,
    label: "Reaction event",
    kind: 7,
    appendTags: DEFAULT_APPEND_TAGS,
    content: {
      format: "text",
      description:
        "Reaction payload for the referenced event (e.g., '+', '-', or emoji).",
    },
  },
  [NOTE_TYPES.VIDEO_COMMENT]: {
    type: NOTE_TYPES.VIDEO_COMMENT,
    label: "Video comment",
    kind: 1111,
    videoEventTagName: "E",
    videoDefinitionTagName: "A",
    parentCommentTagName: "E",
    parentAuthorTagName: "P",
    rootEventPointerTagName: "E",
    rootDefinitionPointerTagName: "A",
    rootIdentifierPointerTagName: "I",
    rootKindTagName: "K",
    rootAuthorTagName: "P",
    parentKindTagName: "K",
    appendTags: DEFAULT_APPEND_TAGS,
    content: {
      format: "text",
      description: "Plain text comment body sanitized for UTF-8 compatibility.",
    },
  },
  [NOTE_TYPES.DM_ATTACHMENT]: {
    type: NOTE_TYPES.DM_ATTACHMENT,
    label: "DM attachment (NIP-17 file rumor)",
    kind: 15,
    participantTagName: "p",
    hashTagName: "x",
    urlTagName: "url",
    nameTagName: "name",
    typeTagName: "type",
    sizeTagName: "size",
    keyTagName: "k",
    appendTags: DEFAULT_APPEND_TAGS,
    content: {
      format: "empty",
      description: "Attachment metadata is carried in tags; content is empty.",
    },
  },
  [NOTE_TYPES.DM_READ_RECEIPT]: {
    type: NOTE_TYPES.DM_READ_RECEIPT,
    label: "DM read receipt",
    kind: 20001,
    recipientTagName: "p",
    eventTagName: "e",
    kindTagName: "k",
    appendTags: DEFAULT_APPEND_TAGS,
    content: {
      format: "empty",
      description: "Ephemeral read receipt pointer for a DM event.",
    },
  },
  [NOTE_TYPES.DM_TYPING]: {
    type: NOTE_TYPES.DM_TYPING,
    label: "DM typing indicator",
    kind: 20002,
    recipientTagName: "p",
    eventTagName: "e",
    statusTagName: "t",
    statusTagValue: "typing",
    expirationTagName: "expiration",
    appendTags: DEFAULT_APPEND_TAGS,
    content: {
      format: "empty",
      description: "Ephemeral typing indicator with an expiration timestamp.",
    },
  },
  [NOTE_TYPES.ZAP_REQUEST]: {
    type: NOTE_TYPES.ZAP_REQUEST,
    label: "Zap request",
    kind: 9734,
    appendTags: DEFAULT_APPEND_TAGS,
    content: {
      format: "text",
      description:
        "Optional zap message included in the zap request sent to LNURL pay callbacks.",
    },
  },
  [NOTE_TYPES.ZAP_RECEIPT]: {
    type: NOTE_TYPES.ZAP_RECEIPT,
    label: "Zap receipt",
    kind: 9735,
    appendTags: DEFAULT_APPEND_TAGS,
    content: {
      format: "text",
      description:
        "Zap receipts are published by lightning wallets to confirm zap requests.",
    },
  },
  [NOTE_TYPES.WATCH_HISTORY]: {
    type: NOTE_TYPES.WATCH_HISTORY,
    label: "Watch history month",
    kind: WATCH_HISTORY_KIND,
    identifierTag: {
      name: "d",
    },
    monthTagName: "month",
    appendTags: [["v", WATCH_HISTORY_VERSION_TAG_VALUE]],
    content: {
      format: "json",
      description:
        "JSON payload containing a month's watched event identifiers with optional watchedAt metadata.",
    },
  },
  [NOTE_TYPES.SUBSCRIPTION_LIST]: {
    type: NOTE_TYPES.SUBSCRIPTION_LIST,
    label: "Subscription list",
    kind: 30000,
    identifierTag: {
      name: "d",
      value: SUBSCRIPTION_LIST_IDENTIFIER,
    },
    appendTags: DEFAULT_APPEND_TAGS,
    content: {
      format: "encrypted-tag-list",
      description:
        "NIP-04/NIP-44 encrypted JSON array of NIP-51 tag tuples (e.g., [['p', <hex>], …]).",
    },
  },
  [NOTE_TYPES.USER_BLOCK_LIST]: {
    type: NOTE_TYPES.USER_BLOCK_LIST,
    label: "User block list",
    kind: 10000,
    identifierTag: {
      name: "d",
      value: BLOCK_LIST_IDENTIFIER,
    },
    appendTags: DEFAULT_APPEND_TAGS,
    content: {
      format: "encrypted-tag-list",
      description:
        "NIP-04/NIP-44 encrypted JSON array of mute tags per NIP-51 (e.g., [['p', <hex>], …]).",
    },
  },
  [NOTE_TYPES.HASHTAG_PREFERENCES]: {
    type: NOTE_TYPES.HASHTAG_PREFERENCES,
    label: "Hashtag preferences",
    kind: 30015,
    identifierTag: {
      name: "d",
      value: "bitvid:tag-preferences",
    },
    appendTags: [["encrypted", "nip44_v2"]],
    content: {
      format: "nip44-json",
      description:
        "NIP-44 encrypted JSON: { version, interests: string[], disinterests: string[] }.",
    },
  },
  [NOTE_TYPES.ADMIN_MODERATION_LIST]: {
    type: NOTE_TYPES.ADMIN_MODERATION_LIST,
    label: "Admin moderation list",
    kind: 30000,
    identifierTag: {
      name: "d",
      value: `${ADMIN_LIST_NAMESPACE}:${ADMIN_LIST_IDENTIFIERS.moderation}`,
    },
    participantTagName: "p",
    appendTags: DEFAULT_APPEND_TAGS,
    content: { format: "empty", description: "Content field unused." },
  },
  [NOTE_TYPES.ADMIN_BLACKLIST]: {
    type: NOTE_TYPES.ADMIN_BLACKLIST,
    label: "Admin blacklist",
    kind: 30000,
    identifierTag: {
      name: "d",
      value: `${ADMIN_LIST_NAMESPACE}:${ADMIN_LIST_IDENTIFIERS.blacklist}`,
    },
    participantTagName: "p",
    appendTags: DEFAULT_APPEND_TAGS,
    content: { format: "empty", description: "Content field unused." },
  },
  [NOTE_TYPES.ADMIN_WHITELIST]: {
    type: NOTE_TYPES.ADMIN_WHITELIST,
    label: "Admin whitelist",
    kind: 30000,
    identifierTag: {
      name: "d",
      value: `${ADMIN_LIST_NAMESPACE}:${ADMIN_LIST_IDENTIFIERS.whitelist}`,
    },
    participantTagName: "p",
    appendTags: DEFAULT_APPEND_TAGS,
    content: { format: "empty", description: "Content field unused." },
  },
  [NOTE_TYPES.PROFILE_METADATA]: {
    type: NOTE_TYPES.PROFILE_METADATA,
    label: "Profile metadata",
    kind: 0,
    appendTags: DEFAULT_APPEND_TAGS,
    content: {
      format: "json",
      description: "Standard NIP-01 profile metadata (name, about, picture, etc.).",
    },
  },
  [NOTE_TYPES.MUTE_LIST]: {
    type: NOTE_TYPES.MUTE_LIST,
    label: "Mute list",
    kind: 10000,
    participantTagName: "p",
    appendTags: DEFAULT_APPEND_TAGS,
    content: {
      format: "text",
      description: "Optional content (often encrypted) with public p tags.",
    },
  },
};

let schemaOverrides = {};

function clone(value) {
  if (Array.isArray(value)) {
    return value.map(clone);
  }
  if (value && typeof value === "object") {
    const result = {};
    for (const [key, nested] of Object.entries(value)) {
      result[key] = clone(nested);
    }
    return result;
  }
  return value;
}

function mergeDeep(base, override) {
  const result = clone(base);
  if (!override || typeof override !== "object") {
    return result;
  }
  for (const [key, value] of Object.entries(override)) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      result[key] = mergeDeep(base?.[key] ?? {}, value);
    } else {
      result[key] = clone(value);
    }
  }
  return result;
}

function resolveOverride(type) {
  const local = schemaOverrides?.[type];
  if (local) {
    return local;
  }

  if (typeof window !== "undefined") {
    const runtimeOverrides = window.bitvidNostrEventOverrides;
    if (runtimeOverrides && runtimeOverrides[type]) {
      return runtimeOverrides[type];
    }
  }
  return null;
}

export function setNostrEventSchemaOverrides(overrides = {}) {
  if (overrides && typeof overrides === "object") {
    schemaOverrides = overrides;
  } else {
    schemaOverrides = {};
  }

  if (typeof window !== "undefined") {
    window.bitvidNostrEventOverrides = schemaOverrides;
  }
}

export function getNostrEventSchema(type) {
  const base = BASE_SCHEMAS[type];
  if (!base) {
    return null;
  }
  const override = resolveOverride(type);
  return mergeDeep(base, override);
}

export function getAllNostrEventSchemas() {
  const entries = {};
  for (const type of Object.keys(BASE_SCHEMAS)) {
    entries[type] = getNostrEventSchema(type);
  }
  return entries;
}

function appendSchemaTags(tags, schema) {
  if (!Array.isArray(schema?.appendTags)) {
    return tags;
  }
  schema.appendTags.forEach((tag) => {
    if (Array.isArray(tag) && tag.length >= 2) {
      tags.push(tag.map((value) => (typeof value === "string" ? value : String(value))));
    }
  });
  return tags;
}

function collectPointerTags(schema, {
  pointerValue,
  pointerTag,
  pointerTags = [],
} = {}) {
  const normalized = [];

  const pointerTagName = schema?.pointerTagName;
  if (pointerValue && pointerTagName) {
    const normalizedValue =
      typeof pointerValue === "string" ? pointerValue : String(pointerValue);
    if (normalizedValue) {
      normalized.push([pointerTagName, normalizedValue]);
    }
  }

  if (Array.isArray(pointerTag) && pointerTag.length >= 2) {
    normalized.push(
      pointerTag.map((value) => (typeof value === "string" ? value : String(value)))
    );
  }

  if (Array.isArray(pointerTags)) {
    pointerTags.forEach((tag) => {
      if (Array.isArray(tag) && tag.length >= 2) {
        normalized.push(
          tag.map((value) => (typeof value === "string" ? value : String(value)))
        );
      }
    });
  }

  return normalized;
}

function mergePointerTags(pointerTags = []) {
  if (!Array.isArray(pointerTags) || pointerTags.length === 0) {
    return [];
  }

  const merged = [];
  const pointerIndexByKey = new Map();

  const toTrimmedString = (value) => {
    if (typeof value === "string") {
      return value.trim();
    }
    if (value === undefined || value === null) {
      return "";
    }
    return String(value).trim();
  };

  pointerTags.forEach((tag) => {
    if (!Array.isArray(tag) || tag.length < 2) {
      return;
    }

    const normalizedType = toTrimmedString(tag[0]);
    if (!normalizedType) {
      return;
    }

    const canonicalType =
      normalizedType === "a" ? "a" : normalizedType === "e" ? "e" : normalizedType;

    const normalizedValue = toTrimmedString(tag[1]);
    if (!normalizedValue) {
      return;
    }

    const sanitizedTag = [canonicalType, normalizedValue];
    for (let index = 2; index < tag.length; index += 1) {
      const extra = toTrimmedString(tag[index]);
      if (extra) {
        sanitizedTag.push(extra);
      }
    }

    if (canonicalType !== "a" && canonicalType !== "e") {
      merged.push(sanitizedTag);
      return;
    }

    const dedupeKey = `${canonicalType}:${normalizedValue.toLowerCase()}`;
    const relayHint =
      sanitizedTag.length > 2 && typeof sanitizedTag[2] === "string"
        ? sanitizedTag[2].trim()
        : "";

    if (!pointerIndexByKey.has(dedupeKey)) {
      if (relayHint && sanitizedTag.length > 2) {
        sanitizedTag[2] = relayHint;
      }
      const index = merged.length;
      merged.push(sanitizedTag);
      pointerIndexByKey.set(dedupeKey, { index, relay: relayHint });
      return;
    }

    const existingEntry = pointerIndexByKey.get(dedupeKey);
    const existingTag = merged[existingEntry.index];
    const existingRelay =
      existingTag.length > 2 && typeof existingTag[2] === "string"
        ? existingTag[2].trim()
        : "";
    const hasExistingRelay = Boolean(existingRelay);
    const hasNewRelay = Boolean(relayHint);

    if (
      (!hasExistingRelay && hasNewRelay) ||
      (hasExistingRelay && hasNewRelay && existingRelay !== relayHint)
    ) {
      const replacement = sanitizedTag.slice();
      if (relayHint && replacement.length > 2) {
        replacement[2] = relayHint;
      }
      merged[existingEntry.index] = replacement;
      pointerIndexByKey.set(dedupeKey, {
        index: existingEntry.index,
        relay: relayHint,
      });
    }
  });

  return merged;
}

export function buildVideoPostEvent(params) {
  const {
    pubkey,
    created_at,
    dTagValue,
    content,
    additionalTags = [],
  } = params || {};
  const schema = getNostrEventSchema(NOTE_TYPES.VIDEO_POST);
  const tags = [];
  if (schema?.topicTag?.name && schema?.topicTag?.value) {
    tags.push([schema.topicTag.name, schema.topicTag.value]);
  }
  if (schema?.identifierTag?.name && dTagValue) {
    tags.push([schema.identifierTag.name, dTagValue]);
  }
  appendSchemaTags(tags, schema);
  const sanitizedAdditionalTags = sanitizeAdditionalTags(additionalTags);
  if (sanitizedAdditionalTags.length) {
    tags.push(...sanitizedAdditionalTags.map((tag) => tag.slice()));
  }

  let serializedContent = "";
  if (typeof content === "string") {
    serializedContent = content;
  } else {
    try {
      serializedContent = JSON.stringify(content ?? {});
    } catch (error) {
      serializedContent = "{}";
    }
  }

  const event = {
    kind: schema?.kind ?? 30078,
    pubkey,
    created_at,
    tags,
    content: serializedContent,
  };

  if (isDevMode) {
    validateEventAgainstSchema(NOTE_TYPES.VIDEO_POST, event);
  }

  return event;
}

export function buildVideoMirrorEvent(params) {
  const {
    pubkey,
    created_at,
    tags = [],
    content = "",
  } = params || {};
  const schema = getNostrEventSchema(NOTE_TYPES.VIDEO_MIRROR);
  const combinedTags = [];
  appendSchemaTags(combinedTags, schema);
  if (Array.isArray(tags)) {
    tags.forEach((tag) => {
      if (Array.isArray(tag) && tag.length >= 2) {
        combinedTags.push(tag.map((value) => (typeof value === "string" ? value : String(value))));
      }
    });
  }
  return {
    kind: schema?.kind ?? 1063,
    pubkey,
    created_at,
    tags: combinedTags,
    content: typeof content === "string" ? content : String(content ?? ""),
  };
}

export function buildRepostEvent(params) {
  const {
    pubkey,
    created_at,
    eventId = "",
    eventRelay = "",
    address = "",
    addressRelay = "",
    authorPubkey = "",
    additionalTags = [],
    repostKind,
    targetKind,
    targetEvent = null,
    serializedEvent = "",
  } = params || {};
  const schema = getNostrEventSchema(NOTE_TYPES.REPOST);
  const tags = [];

  const normalizedEventId = typeof eventId === "string" ? eventId.trim() : "";
  const normalizedEventRelay =
    typeof eventRelay === "string" ? eventRelay.trim() : "";

  if (normalizedEventId) {
    if (!normalizedEventRelay) {
      throw new Error("missing-event-relay");
    }
    tags.push(["e", normalizedEventId, normalizedEventRelay]);
  }

  const normalizedAddress = typeof address === "string" ? address.trim() : "";
  const normalizedAddressRelay = typeof addressRelay === "string" ? addressRelay.trim() : "";
  if (normalizedAddress) {
    if (normalizedAddressRelay) {
      tags.push(["a", normalizedAddress, normalizedAddressRelay]);
    } else {
      tags.push(["a", normalizedAddress]);
    }
  }

  const normalizedAuthorPubkey =
    typeof authorPubkey === "string" ? authorPubkey.trim().toLowerCase() : "";
  if (normalizedAuthorPubkey) {
    tags.push(["p", normalizedAuthorPubkey]);
  }

  appendSchemaTags(tags, schema);
  const sanitizedAdditionalTags = sanitizeAdditionalTags(additionalTags);
  if (sanitizedAdditionalTags.length) {
    tags.push(...sanitizedAdditionalTags.map((tag) => tag.slice()));
  }

  const normalizedRepostKind =
    Number.isFinite(repostKind) && repostKind !== null
      ? Math.floor(repostKind)
      : null;
  const normalizedTargetKind =
    Number.isFinite(targetKind) && targetKind !== null
      ? Math.floor(targetKind)
      : null;
  const resolvedKind = (() => {
    if (normalizedRepostKind) {
      return normalizedRepostKind;
    }
    if (normalizedTargetKind !== null) {
      return normalizedTargetKind === 1 ? schema?.kind ?? 6 : 16;
    }
    return schema?.kind ?? 6;
  })();

  if (resolvedKind === 16 && normalizedTargetKind !== null) {
    tags.push(["k", String(normalizedTargetKind)]);
  }

  const normalizedSerializedEvent =
    typeof serializedEvent === "string" ? serializedEvent : "";
  let normalizedTargetEvent =
    targetEvent && typeof targetEvent === "object" ? targetEvent : null;

  if (!normalizedTargetEvent && normalizedSerializedEvent) {
    try {
      normalizedTargetEvent = JSON.parse(normalizedSerializedEvent);
    } catch (error) {
      void error;
    }
  }

  const hasProtectedTag = Array.isArray(normalizedTargetEvent?.tags)
    ? normalizedTargetEvent.tags.some(
        (tag) => Array.isArray(tag) && tag.length && tag[0] === "-",
      )
    : false;

  let content = "";

  if (!hasProtectedTag) {
    if (normalizedSerializedEvent) {
      content = normalizedSerializedEvent;
    } else if (normalizedTargetEvent) {
      try {
        content = JSON.stringify(normalizedTargetEvent);
      } catch (error) {
        void error;
      }
    }
  }

  return {
    kind: resolvedKind,
    pubkey,
    created_at,
    tags,
    content,
  };
}

export function buildRelayListEvent(params) {
  const {
    pubkey,
    created_at,
    relays = [],
    additionalTags = [],
  } = params || {};
  const schema = getNostrEventSchema(NOTE_TYPES.RELAY_LIST);
  const tags = [];
  const relayTagName = schema?.relayTagName || "r";
  const readMarker = schema?.readMarker || "read";
  const writeMarker = schema?.writeMarker || "write";

  if (Array.isArray(relays)) {
    relays.forEach((entry) => {
      let url = "";
      let mode = "";
      if (typeof entry === "string") {
        url = entry;
      } else if (entry && typeof entry === "object") {
        if (typeof entry.url === "string") {
          url = entry.url;
        }
        if (typeof entry.mode === "string") {
          mode = entry.mode;
        } else if (typeof entry.marker === "string") {
          mode = entry.marker;
        } else if (entry.read === true && entry.write === false) {
          mode = "read";
        } else if (entry.write === true && entry.read === false) {
          mode = "write";
        }
      } else if (Array.isArray(entry) && entry.length >= 1) {
        url = typeof entry[0] === "string" ? entry[0] : String(entry[0]);
        if (entry.length > 1 && typeof entry[1] === "string") {
          mode = entry[1];
        }
      }

      const normalizedUrl = typeof url === "string" ? url.trim() : "";
      if (!normalizedUrl) {
        return;
      }

      const normalizedMode = typeof mode === "string" ? mode.trim().toLowerCase() : "";
      if (normalizedMode === "read") {
        tags.push([relayTagName, normalizedUrl, readMarker]);
      } else if (normalizedMode === "write") {
        tags.push([relayTagName, normalizedUrl, writeMarker]);
      } else {
        tags.push([relayTagName, normalizedUrl]);
      }
    });
  }

  appendSchemaTags(tags, schema);

  const sanitizedAdditionalTags = sanitizeAdditionalTags(additionalTags);
  if (sanitizedAdditionalTags.length) {
    tags.push(...sanitizedAdditionalTags.map((tag) => tag.slice()));
  }

  return {
    kind: schema?.kind ?? 10002,
    pubkey,
    created_at,
    tags,
    content: "",
  };
}

export function buildDmRelayListEvent(params) {
  const {
    pubkey,
    created_at,
    relays = [],
    additionalTags = [],
  } = params || {};
  const schema = getNostrEventSchema(NOTE_TYPES.DM_RELAY_LIST);
  const tags = [];
  const relayTagName = schema?.relayTagName || "relay";

  if (Array.isArray(relays)) {
    relays.forEach((relay) => {
      const normalized = typeof relay === "string" ? relay.trim() : "";
      if (normalized) {
        tags.push([relayTagName, normalized]);
      }
    });
  }

  appendSchemaTags(tags, schema);

  const sanitizedAdditionalTags = sanitizeAdditionalTags(additionalTags);
  if (sanitizedAdditionalTags.length) {
    tags.push(...sanitizedAdditionalTags.map((tag) => tag.slice()));
  }

  return {
    kind: schema?.kind ?? 10050,
    pubkey,
    created_at,
    tags,
    content: "",
  };
}

export function buildProfileMetadataEvent(params) {
  const {
    pubkey,
    created_at,
    metadata = {},
    content,
    additionalTags = [],
  } = params || {};
  const schema = getNostrEventSchema(NOTE_TYPES.PROFILE_METADATA);
  const tags = [];
  appendSchemaTags(tags, schema);
  const sanitizedAdditionalTags = sanitizeAdditionalTags(additionalTags);
  if (sanitizedAdditionalTags.length) {
    tags.push(...sanitizedAdditionalTags.map((tag) => tag.slice()));
  }

  let serializedContent = "";
  if (typeof content === "string") {
    serializedContent = content;
  } else {
    try {
      serializedContent = JSON.stringify(metadata || {});
    } catch (error) {
      serializedContent = "{}";
    }
  }

  return {
    kind: schema?.kind ?? 0,
    pubkey,
    created_at,
    tags,
    content: serializedContent,
  };
}

export function buildMuteListEvent(params) {
  const {
    pubkey,
    created_at,
    pTags = [],
    content = "",
    encrypted = false,
    encryptionTag = "",
    additionalTags = [],
  } = params || {};
  const schema = getNostrEventSchema(NOTE_TYPES.MUTE_LIST);
  const tags = [];

  const participantTagName = schema?.participantTagName || "p";
  if (Array.isArray(pTags)) {
    pTags.forEach((hex) => {
      if (typeof hex === "string" && hex.trim()) {
        tags.push([participantTagName, hex.trim()]);
      }
    });
  }

  if (encrypted && encryptionTag) {
    tags.push(["encrypted", encryptionTag]);
  }

  appendSchemaTags(tags, schema);
  const sanitizedAdditionalTags = sanitizeAdditionalTags(additionalTags);
  if (sanitizedAdditionalTags.length) {
    tags.push(...sanitizedAdditionalTags.map((tag) => tag.slice()));
  }

  return {
    kind: schema?.kind ?? 10000,
    pubkey,
    created_at,
    tags,
    content: typeof content === "string" ? content : "",
  };
}

export function buildDmAttachmentEvent(params) {
  const {
    pubkey,
    created_at,
    recipientPubkey,
    attachment = {},
    additionalTags = [],
  } = params || {};
  const schema = getNostrEventSchema(NOTE_TYPES.DM_ATTACHMENT);
  const tags = [];

  const participantTagName = schema?.participantTagName || "p";
  if (recipientPubkey && typeof recipientPubkey === "string") {
    tags.push([participantTagName, recipientPubkey.trim()]);
  }

  if (attachment?.x) {
    tags.push([schema?.hashTagName || "x", attachment.x]);
  }
  if (attachment?.url) {
    tags.push([schema?.urlTagName || "url", attachment.url]);
  }
  if (attachment?.name) {
    tags.push([schema?.nameTagName || "name", attachment.name]);
  }
  if (attachment?.type) {
    tags.push([schema?.typeTagName || "type", attachment.type]);
  }
  if (Number.isFinite(attachment?.size)) {
    tags.push([schema?.sizeTagName || "size", String(attachment.size)]);
  }
  if (attachment?.key) {
    tags.push([schema?.keyTagName || "k", attachment.key]);
  }

  appendSchemaTags(tags, schema);
  const sanitizedAdditionalTags = sanitizeAdditionalTags(additionalTags);
  if (sanitizedAdditionalTags.length) {
    tags.push(...sanitizedAdditionalTags.map((tag) => tag.slice()));
  }

  return {
    kind: schema?.kind ?? 15,
    pubkey,
    created_at,
    tags,
    content: "",
  };
}

export function buildDmReadReceiptEvent(params) {
  const {
    pubkey,
    created_at,
    recipientPubkey,
    eventId,
    messageKind,
    additionalTags = [],
  } = params || {};
  const schema = getNostrEventSchema(NOTE_TYPES.DM_READ_RECEIPT);
  const tags = [];

  const recipient = normalizePointerIdentifier(recipientPubkey);
  if (recipient) {
    tags.push([schema?.recipientTagName || "p", recipient]);
  }

  const normalizedEventId = normalizePointerIdentifier(eventId);
  if (normalizedEventId) {
    tags.push([schema?.eventTagName || "e", normalizedEventId]);
  }

  if (Number.isFinite(messageKind)) {
    tags.push([schema?.kindTagName || "k", String(Math.floor(messageKind))]);
  }

  appendSchemaTags(tags, schema);
  const sanitizedAdditionalTags = sanitizeAdditionalTags(additionalTags);
  if (sanitizedAdditionalTags.length) {
    tags.push(...sanitizedAdditionalTags.map((tag) => tag.slice()));
  }

  return {
    kind: schema?.kind ?? 20001,
    pubkey,
    created_at,
    tags,
    content: "",
  };
}

export function buildDmTypingIndicatorEvent(params) {
  const {
    pubkey,
    created_at,
    recipientPubkey,
    eventId,
    expiresAt,
    additionalTags = [],
  } = params || {};
  const schema = getNostrEventSchema(NOTE_TYPES.DM_TYPING);
  const tags = [];

  const recipient = normalizePointerIdentifier(recipientPubkey);
  if (recipient) {
    tags.push([schema?.recipientTagName || "p", recipient]);
  }

  const normalizedEventId = normalizePointerIdentifier(eventId);
  if (normalizedEventId) {
    tags.push([schema?.eventTagName || "e", normalizedEventId]);
  }

  if (schema?.statusTagName && schema?.statusTagValue) {
    tags.push([schema.statusTagName, schema.statusTagValue]);
  }

  if (Number.isFinite(expiresAt)) {
    tags.push([schema?.expirationTagName || "expiration", String(Math.floor(expiresAt))]);
  }

  appendSchemaTags(tags, schema);
  const sanitizedAdditionalTags = sanitizeAdditionalTags(additionalTags);
  if (sanitizedAdditionalTags.length) {
    tags.push(...sanitizedAdditionalTags.map((tag) => tag.slice()));
  }

  return {
    kind: schema?.kind ?? 20002,
    pubkey,
    created_at,
    tags,
    content: "",
  };
}

export function buildViewEvent(params) {
  const {
    pubkey,
    created_at,
    pointerValue,
    pointerTag,
    pointerTags = [],
    dedupeTag,
    includeSessionTag = false,
    additionalTags = [],
    content = "",
  } = params || {};
  const schema = getNostrEventSchema(NOTE_TYPES.VIEW_EVENT);
  const tags = [];
  if (schema?.topicTag?.name && schema?.topicTag?.value) {
    tags.push([schema.topicTag.name, schema.topicTag.value]);
  }

  const normalizedPointerTags = collectPointerTags(schema, {
    pointerValue,
    pointerTag,
    pointerTags,
  });
  normalizedPointerTags.forEach((tag) => {
    tags.push(tag);
  });
  const sanitizedAdditionalTags = sanitizeAdditionalTags(additionalTags);
  if (sanitizedAdditionalTags.length) {
    tags.push(...sanitizedAdditionalTags.map((tag) => tag.slice()));
  }

  if (dedupeTag && schema?.identifierTag?.name) {
    const identifierName = schema.identifierTag.name;
    const hasDedupe = tags.some(
      (tag) => tag[0] === identifierName && tag[1] === dedupeTag
    );
    if (!hasDedupe) {
      tags.push([identifierName, dedupeTag]);
    }
  }
  if (includeSessionTag && schema?.sessionTag?.name && schema?.sessionTag?.value) {
    const hasSession = tags.some(
      (tag) => tag[0] === schema.sessionTag.name && tag[1] === schema.sessionTag.value
    );
    if (!hasSession) {
      tags.push([schema.sessionTag.name, schema.sessionTag.value]);
    }
  }
  appendSchemaTags(tags, schema);

  const resolvedContent = ensureValidUtf8Content(content);

  return {
    kind: schema?.kind ?? WATCH_HISTORY_KIND,
    pubkey,
    created_at,
    tags,
    content: resolvedContent,
  };
}

export function buildZapRequestEvent(params) {
  const {
    pubkey,
    created_at,
    recipientPubkey,
    relays = [],
    amountSats,
    lnurl,
    eventId,
    coordinate,
    additionalTags = [],
    content = "",
  } = params || {};
  const schema = getNostrEventSchema(NOTE_TYPES.ZAP_REQUEST);
  const tags = [];

  const normalizedRecipient = normalizePointerIdentifier(recipientPubkey);
  if (normalizedRecipient) {
    tags.push(["p", normalizedRecipient]);
  }

  const normalizedEventId = normalizePointerIdentifier(eventId);
  if (normalizedEventId) {
    tags.push(["e", normalizedEventId]);
  }

  if (typeof coordinate === "string" && coordinate.trim()) {
    tags.push(["a", coordinate.trim()]);
  }

  if (typeof lnurl === "string" && lnurl.trim()) {
    tags.push(["lnurl", lnurl.trim()]);
  }

  if (Number.isFinite(amountSats)) {
    tags.push(["amount", String(Math.max(0, Math.round(amountSats)) * 1000)]);
  }

  const relayList = Array.isArray(relays) ? relays : [];
  const relaySeen = new Set();
  const normalizedRelays = [];
  relayList.forEach((relay) => {
    if (typeof relay !== "string") {
      return;
    }
    const trimmed = relay.trim();
    if (!trimmed || relaySeen.has(trimmed)) {
      return;
    }
    relaySeen.add(trimmed);
    normalizedRelays.push(trimmed);
  });
  if (normalizedRelays.length) {
    tags.push(["relays", ...normalizedRelays]);
  }

  const sanitizedAdditionalTags = sanitizeAdditionalTags(additionalTags);
  if (sanitizedAdditionalTags.length) {
    tags.push(...sanitizedAdditionalTags.map((tag) => tag.slice()));
  }

  appendSchemaTags(tags, schema);

  const resolvedContent = ensureValidUtf8Content(content);

  return {
    kind: schema?.kind ?? 9734,
    pubkey,
    created_at,
    tags,
    content: resolvedContent,
  };
}

export function buildReactionEvent(params) {
  const {
    pubkey,
    created_at,
    pointerValue,
    pointerTag,
    pointerTags = [],
    targetPointer = null,
    targetAuthorPubkey = "",
    additionalTags = [],
    content = "",
  } = params || {};
  const schema = getNostrEventSchema(NOTE_TYPES.VIDEO_REACTION);
  const tags = [];

  const normalizedPointerTags = collectPointerTags(schema, {
    pointerValue,
    pointerTag,
    pointerTags,
  });
  const mergedPointerTags = mergePointerTags(normalizedPointerTags);
  mergedPointerTags.forEach((tag) => {
    if (Array.isArray(tag) && tag.length >= 2) {
      tags.push(tag);
    }
  });

  const resolvePointerDetails = (pointerCandidate) => {
    if (!pointerCandidate) {
      return null;
    }

    if (Array.isArray(pointerCandidate) && pointerCandidate.length >= 2) {
      const [type, value, relay] = pointerCandidate;
      const normalizedType = type === "a" ? "a" : type === "e" ? "e" : "";
      const normalizedValue = typeof value === "string" ? value.trim() : "";
      if (!normalizedType || !normalizedValue) {
        return null;
      }
      const normalizedRelay =
        typeof relay === "string" && relay.trim() ? relay.trim() : "";
      return { type: normalizedType, value: normalizedValue, relay: normalizedRelay };
    }

    if (pointerCandidate && typeof pointerCandidate === "object") {
      const { type, value, relay } = pointerCandidate;
      const normalizedType = type === "a" ? "a" : type === "e" ? "e" : "";
      const normalizedValue = typeof value === "string" ? value.trim() : "";
      if (!normalizedType || !normalizedValue) {
        return null;
      }
      const normalizedRelay =
        typeof relay === "string" && relay.trim() ? relay.trim() : "";
      return { type: normalizedType, value: normalizedValue, relay: normalizedRelay };
    }

    return null;
  };

  const pointerDetails = (() => {
    const explicitPointer = resolvePointerDetails(targetPointer);
    if (explicitPointer) {
      return explicitPointer;
    }

    const pointerTagEntry = mergedPointerTags.find(
      (tag) => Array.isArray(tag) && tag.length >= 2 && (tag[0] === "a" || tag[0] === "e")
    );
    if (!pointerTagEntry) {
      return null;
    }

    return resolvePointerDetails(pointerTagEntry);
  })();

  const resolvedRelay = pointerDetails?.relay || "";

  const normalizedAuthorPubkey = (() => {
    if (typeof targetAuthorPubkey === "string" && targetAuthorPubkey.trim()) {
      return targetAuthorPubkey.trim();
    }

    if (pointerDetails?.type === "a" && pointerDetails.value) {
      const segments = pointerDetails.value.split(":");
      if (segments.length >= 2) {
        const candidate = segments[1]?.trim();
        if (candidate) {
          return candidate;
        }
      }
    }

    return "";
  })();

  if (normalizedAuthorPubkey) {
    const existingAuthorTag = tags.find(
      (tag) => Array.isArray(tag) && tag[0] === "p" && tag[1] === normalizedAuthorPubkey
    );
    if (!existingAuthorTag) {
      if (resolvedRelay) {
        tags.push(["p", normalizedAuthorPubkey, resolvedRelay]);
      } else {
        tags.push(["p", normalizedAuthorPubkey]);
      }
    } else if (resolvedRelay) {
      if (existingAuthorTag.length < 3) {
        existingAuthorTag.push(resolvedRelay);
      } else if (existingAuthorTag[2] !== resolvedRelay) {
        existingAuthorTag[2] = resolvedRelay;
      }
    }
  }

  const sanitizedAdditionalTags = sanitizeAdditionalTags(additionalTags);
  if (sanitizedAdditionalTags.length) {
    tags.push(...sanitizedAdditionalTags.map((tag) => tag.slice()));
  }

  appendSchemaTags(tags, schema);

  const resolvedContent = ensureValidUtf8Content(content);

  return {
    kind: schema?.kind ?? 7,
    pubkey,
    created_at,
    tags,
    content: resolvedContent,
  };
}

export function buildCommentEvent(params) {
  const {
    pubkey,
    created_at,
    videoEventId = "",
    videoEventRelay = "",
    videoDefinitionAddress = "",
    videoDefinitionRelay = "",
    rootIdentifier = "",
    rootIdentifierRelay = "",
    parentCommentId = "",
    parentCommentRelay = "",
    threadParticipantPubkey = "",
    threadParticipantRelay = "",
    rootKind,
    rootAuthorPubkey = "",
    rootAuthorRelay = "",
    parentKind,
    parentAuthorPubkey = "",
    parentAuthorRelay = "",
    parentIdentifier = "",
    parentIdentifierRelay = "",
    additionalTags = [],
    content = "",
  } = params || {};
  const schema = getNostrEventSchema(NOTE_TYPES.VIDEO_COMMENT);
  const tags = [];

  const normalizeString = (value) =>
    typeof value === "string" ? value.trim() : "";

  const normalizedVideoEventId = normalizeString(videoEventId);
  const normalizedVideoEventRelay = normalizeString(videoEventRelay);
  const normalizedVideoDefinitionAddress = normalizeString(videoDefinitionAddress);
  const normalizedVideoDefinitionRelay = normalizeString(videoDefinitionRelay);
  const normalizedRootIdentifier = normalizeString(rootIdentifier);
  const normalizedRootIdentifierRelay = normalizeString(rootIdentifierRelay);
  const normalizedParentCommentId = normalizeString(parentCommentId);
  const normalizedParentCommentRelay = normalizeString(parentCommentRelay);
  const normalizedParentIdentifier = normalizeString(parentIdentifier);
  const normalizedParentIdentifierRelay = normalizeString(parentIdentifierRelay);
  const normalizedThreadParticipantPubkey = normalizeString(
    threadParticipantPubkey,
  );
  const normalizedThreadParticipantRelay = normalizeString(
    threadParticipantRelay,
  );

  let resolvedRootKind = normalizeString(rootKind);
  let resolvedRootAuthorPubkey = normalizeString(rootAuthorPubkey);
  let resolvedRootAuthorRelay = normalizeString(rootAuthorRelay);

  if (normalizedVideoDefinitionAddress) {
    const definitionSegments = normalizedVideoDefinitionAddress.split(":");
    if (!resolvedRootKind && definitionSegments[0]) {
      resolvedRootKind = definitionSegments[0];
    }
    if (!resolvedRootAuthorPubkey && definitionSegments[1]) {
      resolvedRootAuthorPubkey = definitionSegments[1];
    }
    if (!resolvedRootAuthorRelay && normalizedVideoDefinitionRelay) {
      resolvedRootAuthorRelay = normalizedVideoDefinitionRelay;
    }
  }

  let resolvedParentAuthorPubkey = normalizeString(parentAuthorPubkey);
  if (!resolvedParentAuthorPubkey) {
    resolvedParentAuthorPubkey = normalizedThreadParticipantPubkey;
  }

  let resolvedParentAuthorRelay = normalizeString(parentAuthorRelay);
  if (!resolvedParentAuthorRelay) {
    resolvedParentAuthorRelay = normalizedThreadParticipantRelay;
  }

  if (!resolvedRootAuthorPubkey && !normalizedParentCommentId) {
    resolvedRootAuthorPubkey = resolvedParentAuthorPubkey;
  }
  if (!resolvedRootAuthorRelay && !normalizedParentCommentId) {
    resolvedRootAuthorRelay = resolvedParentAuthorRelay;
  }

  if (!resolvedParentAuthorPubkey && !normalizedParentCommentId) {
    resolvedParentAuthorPubkey = resolvedRootAuthorPubkey;
  }
  if (!resolvedParentAuthorRelay && !normalizedParentCommentId) {
    resolvedParentAuthorRelay = resolvedRootAuthorRelay;
  }

  let resolvedParentKind = normalizeString(parentKind);
  if (!resolvedParentKind) {
    if (normalizedParentCommentId) {
      resolvedParentKind = String(schema?.kind ?? 1111);
    } else if (resolvedRootKind) {
      resolvedParentKind = resolvedRootKind;
    }
  }

  if (!resolvedRootKind) {
    resolvedRootKind = resolvedParentKind;
  }

  const rootDefinitionPointerTagName = schema?.rootDefinitionPointerTagName || "A";
  const rootEventPointerTagName = schema?.rootEventPointerTagName || "E";
  const rootIdentifierPointerTagName = schema?.rootIdentifierPointerTagName || "I";
  const rootKindTagName = schema?.rootKindTagName || "K";
  const rootAuthorTagName = schema?.rootAuthorTagName || "P";
  const parentIdentifierTagName = schema?.parentIdentifierTagName || "I";
  const videoDefinitionTagName = schema?.videoDefinitionTagName || "A";
  const videoEventTagName = schema?.videoEventTagName || "E";
  const parentCommentTagName = schema?.parentCommentTagName || "E";
  const parentAuthorTagName = schema?.parentAuthorTagName || "P";
  const parentKindTagName = schema?.parentKindTagName || "K";

  const appendPointerTag = (tagName, value, relay, authorHint) => {
    if (!tagName || !value) {
      return;
    }
    const tag = [tagName, value];
    if (relay) {
      tag.push(relay);
    }
    if (authorHint) {
      tag.push(authorHint);
    }
    const isDuplicate = tags.some(
      (existing) =>
        existing.length === tag.length &&
        existing.every((val, index) => val === tag[index]),
    );
    if (!isDuplicate) {
      tags.push(tag);
    }
  };

  if (normalizedRootIdentifier) {
    appendPointerTag(
      rootIdentifierPointerTagName,
      normalizedRootIdentifier,
      normalizedRootIdentifierRelay,
    );
  } else if (normalizedVideoDefinitionAddress) {
    appendPointerTag(
      rootDefinitionPointerTagName,
      normalizedVideoDefinitionAddress,
      normalizedVideoDefinitionRelay,
    );
  } else if (normalizedVideoEventId) {
    appendPointerTag(
      rootEventPointerTagName,
      normalizedVideoEventId,
      normalizedVideoEventRelay,
      resolvedRootAuthorPubkey,
    );
  }

  if (rootKindTagName && resolvedRootKind) {
    tags.push([rootKindTagName, resolvedRootKind]);
  }

  if (rootAuthorTagName && resolvedRootAuthorPubkey) {
    if (resolvedRootAuthorRelay) {
      tags.push([rootAuthorTagName, resolvedRootAuthorPubkey, resolvedRootAuthorRelay]);
    } else {
      tags.push([rootAuthorTagName, resolvedRootAuthorPubkey]);
    }
  }

  const shouldAppendVideoEventTag =
    Boolean(videoEventTagName) && Boolean(normalizedVideoEventId);

  if (shouldAppendVideoEventTag) {
    appendPointerTag(
      videoEventTagName,
      normalizedVideoEventId,
      normalizedVideoEventRelay,
    );
  }

  if (videoDefinitionTagName && normalizedVideoDefinitionAddress) {
    appendPointerTag(
      videoDefinitionTagName,
      normalizedVideoDefinitionAddress,
      normalizedVideoDefinitionRelay,
    );
  }

  if (normalizedParentIdentifier) {
    appendPointerTag(
      parentIdentifierTagName,
      normalizedParentIdentifier,
      normalizedParentIdentifierRelay,
    );
  }

  if (parentCommentTagName && normalizedParentCommentId) {
    appendPointerTag(
      parentCommentTagName,
      normalizedParentCommentId,
      normalizedParentCommentRelay,
      resolvedParentAuthorPubkey,
    );
  }

  if (parentKindTagName && resolvedParentKind) {
    tags.push([parentKindTagName, resolvedParentKind]);
  }

  if (parentAuthorTagName && resolvedParentAuthorPubkey) {
    const existingParentAuthorTag = tags.find(
      (tag) => Array.isArray(tag) && tag[0] === parentAuthorTagName && tag[1] === resolvedParentAuthorPubkey,
    );
    if (!existingParentAuthorTag) {
      if (resolvedParentAuthorRelay) {
        tags.push([parentAuthorTagName, resolvedParentAuthorPubkey, resolvedParentAuthorRelay]);
      } else {
        tags.push([parentAuthorTagName, resolvedParentAuthorPubkey]);
      }
    } else if (resolvedParentAuthorRelay) {
      if (existingParentAuthorTag.length < 3) {
        existingParentAuthorTag.push(resolvedParentAuthorRelay);
      } else if (existingParentAuthorTag[2] !== resolvedParentAuthorRelay) {
        existingParentAuthorTag[2] = resolvedParentAuthorRelay;
      }
    }
  }

  const sanitizedAdditionalTags = sanitizeAdditionalTags(additionalTags);
  if (sanitizedAdditionalTags.length) {
    tags.push(...sanitizedAdditionalTags.map((tag) => tag.slice()));
  }

  appendSchemaTags(tags, schema);

  const resolvedContent = ensureValidUtf8Content(content);

  return {
    kind: schema?.kind ?? 1111,
    pubkey,
    created_at,
    tags,
    content: resolvedContent,
  };
}

export function buildWatchHistoryEvent(params) {
  const {
    pubkey,
    created_at,
    monthIdentifier,
    pointerTags = [],
    content,
  } = params || {};
  const schema = getNostrEventSchema(NOTE_TYPES.WATCH_HISTORY);
  const tags = [];
  const identifierName = schema?.identifierTag?.name || "d";

  const identifierValue =
    (typeof monthIdentifier === "string" && monthIdentifier.trim()) ||
    schema?.identifierTag?.value;

  if (identifierName && identifierValue) {
    tags.push([identifierName, identifierValue]);
  }
  const monthTagName = schema?.monthTagName || "month";
  if (monthTagName && identifierValue) {
    tags.push([monthTagName, identifierValue]);
  }
  pointerTags.forEach((tag) => {
    if (Array.isArray(tag) && tag.length >= 2) {
      tags.push(tag.map((value) => (typeof value === "string" ? value : String(value))));
    }
  });

  appendSchemaTags(tags, schema);

  return {
    kind: schema?.kind ?? WATCH_HISTORY_KIND,
    pubkey,
    created_at: Number.isFinite(created_at) ? created_at : Math.floor(Date.now() / 1000),
    tags,
    content: typeof content === "string" ? content : String(content ?? ""),
  };
}

export function buildSubscriptionListEvent(params) {
  const {
    pubkey,
    created_at,
    content,
    encryption,
  } = params || {};
  const schema = getNostrEventSchema(NOTE_TYPES.SUBSCRIPTION_LIST);
  const tags = [];
  const identifierName = schema?.identifierTag?.name || "d";
  const identifierValue = schema?.identifierTag?.value || SUBSCRIPTION_LIST_IDENTIFIER;
  if (identifierName && identifierValue) {
    tags.push([identifierName, identifierValue]);
  }
  const normalizedEncryption =
    typeof encryption === "string" ? encryption.trim() : "";
  if (normalizedEncryption) {
    tags.push(["encrypted", normalizedEncryption]);
  }
  appendSchemaTags(tags, schema);
  return {
    kind: schema?.kind ?? 30000,
    pubkey,
    created_at,
    tags,
    content: typeof content === "string" ? content : String(content ?? ""),
  };
}

export function buildBlockListEvent(params) {
  const {
    pubkey,
    created_at,
    content,
    encryption,
  } = params || {};
  const schema = getNostrEventSchema(NOTE_TYPES.USER_BLOCK_LIST);
  const tags = [];
  const identifierName = schema?.identifierTag?.name || "d";
  const identifierValue = schema?.identifierTag?.value || BLOCK_LIST_IDENTIFIER;
  if (identifierName && identifierValue) {
    tags.push([identifierName, identifierValue]);
  }
  const normalizedEncryption =
    typeof encryption === "string" ? encryption.trim() : "";
  if (normalizedEncryption) {
    tags.push(["encrypted", normalizedEncryption]);
  }
  appendSchemaTags(tags, schema);
  return {
    kind: schema?.kind ?? 10000,
    pubkey,
    created_at,
    tags,
    content: typeof content === "string" ? content : String(content ?? ""),
  };
}

export function buildHashtagPreferenceEvent(params) {
  const {
    pubkey,
    created_at,
    content,
  } = params || {};
  const schema = getNostrEventSchema(NOTE_TYPES.HASHTAG_PREFERENCES);
  const tags = [];
  const identifierName = schema?.identifierTag?.name || "d";
  const identifierValue = schema?.identifierTag?.value || "bitvid:tag-preferences";
  if (identifierName && identifierValue) {
    tags.push([identifierName, identifierValue]);
  }
  appendSchemaTags(tags, schema);
  return {
    kind: schema?.kind ?? 30015,
    pubkey,
    created_at,
    tags,
    content: typeof content === "string" ? content : String(content ?? ""),
  };
}

function resolveAdminNoteType(listKey) {
  switch (listKey) {
    case "moderation":
    case "editors":
      return NOTE_TYPES.ADMIN_MODERATION_LIST;
    case "whitelist":
      return NOTE_TYPES.ADMIN_WHITELIST;
    case "blacklist":
      return NOTE_TYPES.ADMIN_BLACKLIST;
    default:
      return null;
  }
}

export function buildAdminListEvent(listKey, params) {
  const {
    pubkey,
    created_at,
    hexPubkeys = []
  } = params || {};
  const schema = getNostrEventSchema(resolveAdminNoteType(listKey));
  if (!schema) {
    devLogger.warn(
      `[nostrEventSchemas] Unknown admin list key: ${listKey}`,
    );
    return {
      kind: 30000,
      pubkey,
      created_at,
      tags: [],
      content: "",
    };
  }

  const tags = [];
  if (schema?.identifierTag?.name && schema?.identifierTag?.value) {
    tags.push([schema.identifierTag.name, schema.identifierTag.value]);
  }
  const participantTagName = schema?.participantTagName || "p";
  hexPubkeys.forEach((hex) => {
    if (typeof hex === "string" && hex.trim()) {
      tags.push([participantTagName, hex.trim()]);
    }
  });
  appendSchemaTags(tags, schema);
  return {
    kind: schema?.kind ?? 30000,
    pubkey,
    created_at,
    tags,
    content: "",
  };
}

function hasTag(tags, tagName, tagValue = null) {
  if (!Array.isArray(tags)) return false;
  return tags.some(
    (tag) =>
      Array.isArray(tag) &&
      tag[0] === tagName &&
      (tagValue === null || tag[1] === tagValue)
  );
}

export function validateEventAgainstSchema(type, event) {
  if (!isDevMode || !event) return;

  const schema = getNostrEventSchema(type);
  if (!schema) return;

  if (event.kind !== schema.kind) {
    devLogger.warn(
      `[schema] Kind mismatch for ${type}: expected ${schema.kind}, got ${event.kind}`,
    );
  }

  if (schema.topicTag) {
    if (!hasTag(event.tags, schema.topicTag.name, schema.topicTag.value)) {
      devLogger.warn(
        `[schema] Missing topic tag for ${type}: ${schema.topicTag.name}=${schema.topicTag.value}`,
      );
    }
  }

  if (schema.identifierTag) {
    const expectedValue = schema.identifierTag.value;
    if (!hasTag(event.tags, schema.identifierTag.name, expectedValue)) {
      devLogger.warn(
        `[schema] Missing identifier tag for ${type}: ${schema.identifierTag.name}${
          expectedValue ? "=" + expectedValue : ""
        }`,
      );
    }
  }

  if (schema.appendTags) {
    schema.appendTags.forEach((appendTag) => {
      if (Array.isArray(appendTag) && appendTag.length >= 2) {
        const tagName = appendTag[0];
        const tagValue = appendTag[1];
        if (!hasTag(event.tags, tagName, tagValue)) {
          devLogger.warn(
            `[schema] Missing append tag for ${type}: ${tagName}=${tagValue}`,
          );
        }
      }
    });
  }

  if (schema.content) {
    if (schema.content.format === "json") {
      try {
        JSON.parse(event.content);
      } catch (e) {
        devLogger.warn(`[schema] Content is not valid JSON for ${type}`);
      }
    } else if (schema.content.format === "empty") {
      if (event.content !== "") {
        devLogger.warn(`[schema] Content should be empty for ${type}`);
      }
    }
  }
}

if (typeof window !== "undefined") {
  window.bitvidNostrEvents = {
    NOTE_TYPES,
    getSchema: getNostrEventSchema,
    getAllSchemas: getAllNostrEventSchemas,
    setOverrides: setNostrEventSchemaOverrides,
    validateEvent: validateEventAgainstSchema,
  };
}
