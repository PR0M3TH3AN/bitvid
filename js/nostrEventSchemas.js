import { devLogger } from "./utils/logger.js";
import {
  ADMIN_LIST_NAMESPACE,
  ADMIN_COMMUNITY_BLACKLIST_SOURCES,
  ADMIN_COMMUNITY_BLACKLIST_PREFIX,
  isDevMode,
  WATCH_HISTORY_KIND,
  WATCH_HISTORY_LIST_IDENTIFIER,
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
  WATCH_HISTORY_INDEX: "watchHistoryIndex",
  WATCH_HISTORY_CHUNK: "watchHistoryChunk",
  SUBSCRIPTION_LIST: "subscriptionList",
  USER_BLOCK_LIST: "userBlockList",
  HASHTAG_PREFERENCES: "hashtagPreferences",
  ADMIN_MODERATION_LIST: "adminModerationList",
  ADMIN_BLACKLIST: "adminBlacklist",
  ADMIN_WHITELIST: "adminWhitelist",
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
      format: "empty",
      description: "Content field intentionally empty for pure repost events.",
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
    videoEventTagName: "e",
    videoDefinitionTagName: "a",
    parentCommentTagName: "e",
    parentAuthorTagName: "p",
    rootEventPointerTagName: "E",
    rootDefinitionPointerTagName: "A",
    rootIdentifierPointerTagName: "I",
    rootKindTagName: "K",
    rootAuthorTagName: "P",
    parentKindTagName: "k",
    appendTags: DEFAULT_APPEND_TAGS,
    content: {
      format: "text",
      description: "Plain text comment body sanitized for UTF-8 compatibility.",
    },
  },
  [NOTE_TYPES.WATCH_HISTORY_INDEX]: {
    type: NOTE_TYPES.WATCH_HISTORY_INDEX,
    label: "Watch history index",
    kind: WATCH_HISTORY_KIND,
    identifierTag: {
      name: "d",
      value: WATCH_HISTORY_LIST_IDENTIFIER,
    },
    snapshotTagName: "snapshot",
    totalTagName: "chunks",
    chunkPointerTagName: "a",
    appendTags: DEFAULT_APPEND_TAGS,
    content: {
      format: "json",
      description:
        "JSON payload describing the active snapshot and chunk count.",
    },
  },
  [NOTE_TYPES.WATCH_HISTORY_CHUNK]: {
    type: NOTE_TYPES.WATCH_HISTORY_CHUNK,
    label: "Watch history snapshot",
    kind: WATCH_HISTORY_KIND,
    identifierTag: {
      name: "d",
    },
    encryptionTag: { name: "encrypted", values: ["nip44_v2", "nip44", "nip04"] },
    snapshotTagName: "snapshot",
    chunkTagName: "chunk",
    headTag: { name: "head", value: "1" },
    headTagIndex: 2,
    appendTags: DEFAULT_APPEND_TAGS,
    content: {
      format: "encrypted-json",
      description:
        "Encrypted JSON payload containing chunked watch history entries.",
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
    kind: 30005,
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

export function buildVideoPostEvent({
  pubkey,
  created_at,
  dTagValue,
  content,
  additionalTags = [],
}) {
  const schema = getNostrEventSchema(NOTE_TYPES.VIDEO_POST);
  const tags = [];
  if (schema?.topicTag?.name && schema?.topicTag?.value) {
    tags.push([schema.topicTag.name, schema.topicTag.value]);
  }
  if (schema?.identifierTag?.name && dTagValue) {
    tags.push([schema.identifierTag.name, dTagValue]);
  }
  appendSchemaTags(tags, schema);
  if (Array.isArray(additionalTags)) {
    additionalTags.forEach((tag) => {
      if (Array.isArray(tag) && tag.length >= 2) {
        tags.push(tag.map((value) => (typeof value === "string" ? value : String(value))));
      }
    });
  }

  return {
    kind: schema?.kind ?? 30078,
    pubkey,
    created_at,
    tags,
    content: typeof content === "string" ? content : JSON.stringify(content ?? {}),
  };
}

export function buildVideoMirrorEvent({
  pubkey,
  created_at,
  tags = [],
  content = "",
}) {
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

export function buildRepostEvent({
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
}) {
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

  if (Array.isArray(additionalTags)) {
    additionalTags.forEach((tag) => {
      if (Array.isArray(tag) && tag.length >= 2) {
        tags.push(tag.map((value) => (typeof value === "string" ? value : String(value))));
      }
    });
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

  return {
    kind: resolvedKind,
    pubkey,
    created_at,
    tags,
    content: "",
  };
}

export function buildRelayListEvent({
  pubkey,
  created_at,
  relays = [],
  additionalTags = [],
}) {
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

  if (Array.isArray(additionalTags)) {
    additionalTags.forEach((tag) => {
      if (Array.isArray(tag) && tag.length >= 2) {
        tags.push(tag.map((value) => (typeof value === "string" ? value : String(value))));
      }
    });
  }

  return {
    kind: schema?.kind ?? 10002,
    pubkey,
    created_at,
    tags,
    content: "",
  };
}

export function buildViewEvent({
  pubkey,
  created_at,
  pointerValue,
  pointerTag,
  pointerTags = [],
  dedupeTag,
  includeSessionTag = false,
  additionalTags = [],
  content = "",
}) {
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
  if (Array.isArray(additionalTags)) {
    additionalTags.forEach((tag) => {
      if (Array.isArray(tag) && tag.length >= 2) {
        tags.push(tag.map((value) => (typeof value === "string" ? value : String(value))));
      }
    });
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

export function buildReactionEvent({
  pubkey,
  created_at,
  pointerValue,
  pointerTag,
  pointerTags = [],
  targetPointer = null,
  targetAuthorPubkey = "",
  additionalTags = [],
  content = "",
}) {
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

  if (Array.isArray(additionalTags)) {
    additionalTags.forEach((tag) => {
      if (Array.isArray(tag) && tag.length >= 2) {
        tags.push(tag.map((value) => (typeof value === "string" ? value : String(value))));
      }
    });
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

export function buildCommentEvent({
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
}) {
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
  const videoDefinitionTagName = schema?.videoDefinitionTagName || "a";
  const videoEventTagName = schema?.videoEventTagName || "e";
  const parentCommentTagName = schema?.parentCommentTagName || "e";
  const parentAuthorTagName = schema?.parentAuthorTagName || "p";
  const parentKindTagName = schema?.parentKindTagName || "k";

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
    tags.push(tag);
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

  const includeVideoEventTag =
    !normalizedVideoDefinitionAddress &&
    Boolean(videoEventTagName) &&
    Boolean(normalizedVideoEventId);

  if (includeVideoEventTag) {
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
    appendPointerTag("i", normalizedParentIdentifier, normalizedParentIdentifierRelay);
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

  if (Array.isArray(additionalTags)) {
    additionalTags.forEach((tag) => {
      if (Array.isArray(tag) && tag.length >= 2) {
        tags.push(tag.map((value) => (typeof value === "string" ? value : String(value))));
      }
    });
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

export function buildWatchHistoryIndexEvent({
  pubkey,
  created_at,
  snapshotId,
  totalChunks,
  chunkAddresses = [],
  additionalTags = [],
  content,
}) {
  const schema = getNostrEventSchema(NOTE_TYPES.WATCH_HISTORY_INDEX);
  const tags = [];
  const identifierName = schema?.identifierTag?.name || "d";
  const identifierValue = schema?.identifierTag?.value || WATCH_HISTORY_LIST_IDENTIFIER;
  if (identifierName && identifierValue) {
    tags.push([identifierName, identifierValue]);
  }
  const snapshotTagName = schema?.snapshotTagName || "snapshot";
  if (snapshotTagName && snapshotId) {
    tags.push([snapshotTagName, snapshotId]);
  }
  const totalTagName = schema?.totalTagName || "chunks";
  if (totalTagName && Number.isFinite(totalChunks)) {
    tags.push([totalTagName, String(Math.max(0, Math.floor(totalChunks)))]);
  }
  const pointerTagName = schema?.chunkPointerTagName || "a";
  chunkAddresses.forEach((address) => {
    if (typeof address === "string" && address) {
      tags.push([pointerTagName, address]);
    }
  });

  appendSchemaTags(tags, schema);

  if (Array.isArray(additionalTags)) {
    additionalTags.forEach((tag) => {
      if (Array.isArray(tag) && tag.length >= 2) {
        tags.push(tag.map((value) => (typeof value === "string" ? value : String(value))));
      }
    });
  }

  let resolvedContent = content;
  if (resolvedContent === undefined) {
    const payload = {};
    if (snapshotId) {
      payload.snapshot = snapshotId;
    }
    if (Number.isFinite(totalChunks)) {
      payload.totalChunks = Math.max(0, Math.floor(totalChunks));
    }
    resolvedContent = JSON.stringify(payload);
  } else if (typeof resolvedContent !== "string") {
    resolvedContent = JSON.stringify(resolvedContent ?? {});
  }

  return {
    kind: schema?.kind ?? WATCH_HISTORY_KIND,
    pubkey,
    created_at,
    tags,
    content:
      typeof resolvedContent === "string"
        ? resolvedContent
        : String(resolvedContent ?? ""),
  };
}

export function buildWatchHistoryChunkEvent({
  pubkey,
  created_at,
  chunkIdentifier,
  snapshotId,
  chunkIndex,
  totalChunks,
  pointerTags = [],
  chunkAddresses = [],
  content,
  encryption,
}) {
  const schema = getNostrEventSchema(NOTE_TYPES.WATCH_HISTORY_CHUNK);
  const tags = [];
  const identifierName = schema?.identifierTag?.name || "d";
  const identifierValue = chunkIdentifier || schema?.identifierTag?.value;
  if (identifierName && identifierValue) {
    tags.push([identifierName, identifierValue]);
  }
  const encryptionTagName = schema?.encryptionTag?.name;
  const normalizedOptions = Array.isArray(schema?.encryptionTag?.values)
    ? schema.encryptionTag.values
        .map((value) => (typeof value === "string" ? value.trim() : ""))
        .filter(Boolean)
    : [];
  const normalizedRequested = typeof encryption === "string" ? encryption.trim() : "";
  let resolvedEncryptionTag = "";
  if (normalizedRequested) {
    resolvedEncryptionTag = normalizedRequested;
  } else if (typeof schema?.encryptionTag?.value === "string") {
    resolvedEncryptionTag = schema.encryptionTag.value;
  } else if (normalizedOptions.length) {
    [resolvedEncryptionTag] = normalizedOptions;
  }
  if (encryptionTagName && resolvedEncryptionTag) {
    tags.push([encryptionTagName, resolvedEncryptionTag]);
  }
  const snapshotTagName = schema?.snapshotTagName;
  if (snapshotTagName && snapshotId) {
    tags.push([snapshotTagName, snapshotId]);
  }
  const chunkTagName = schema?.chunkTagName;
  if (chunkTagName && typeof chunkIndex === "number" && typeof totalChunks === "number") {
    tags.push([chunkTagName, String(chunkIndex), String(totalChunks)]);
  }
  pointerTags.forEach((tag) => {
    if (Array.isArray(tag) && tag.length >= 2) {
      tags.push(tag.map((value) => (typeof value === "string" ? value : String(value))));
    }
  });

  if (chunkIndex === 0 && schema?.headTag?.name && schema?.headTag?.value) {
    const insertionIndex = Number.isInteger(schema?.headTagIndex)
      ? Math.max(0, Math.min(tags.length, schema.headTagIndex))
      : Math.min(tags.length, 2);
    tags.splice(insertionIndex, 0, [schema.headTag.name, schema.headTag.value]);
    chunkAddresses.forEach((address) => {
      if (typeof address === "string" && address) {
        tags.push(["a", address]);
      }
    });
  }

  appendSchemaTags(tags, schema);

  return {
    kind: schema?.kind ?? WATCH_HISTORY_KIND,
    pubkey,
    created_at,
    tags,
    content: typeof content === "string" ? content : String(content ?? ""),
  };
}

export function buildSubscriptionListEvent({
  pubkey,
  created_at,
  content,
  encryption,
}) {
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

export function buildBlockListEvent({
  pubkey,
  created_at,
  content,
  encryption,
}) {
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

export function buildHashtagPreferenceEvent({
  pubkey,
  created_at,
  content,
}) {
  const schema = getNostrEventSchema(NOTE_TYPES.HASHTAG_PREFERENCES);
  const tags = [];
  const identifierName = schema?.identifierTag?.name || "d";
  const identifierValue = schema?.identifierTag?.value || "bitvid:tag-preferences";
  if (identifierName && identifierValue) {
    tags.push([identifierName, identifierValue]);
  }
  appendSchemaTags(tags, schema);
  return {
    kind: schema?.kind ?? 30005,
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

export function buildAdminListEvent(listKey, { pubkey, created_at, hexPubkeys = [] }) {
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

if (typeof window !== "undefined") {
  window.bitvidNostrEvents = {
    NOTE_TYPES,
    getSchema: getNostrEventSchema,
    getAllSchemas: getAllNostrEventSchemas,
    setOverrides: setNostrEventSchemaOverrides,
  };
}
