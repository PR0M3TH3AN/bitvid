import {
  ADMIN_LIST_NAMESPACE,
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
  WATCH_HISTORY_INDEX: "watchHistoryIndex",
  WATCH_HISTORY_CHUNK: "watchHistoryChunk",
  SUBSCRIPTION_LIST: "subscriptionList",
  USER_BLOCK_LIST: "userBlockList",
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
});

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
      if (isDevMode) {
        console.warn(
          "[nostrEventSchemas] Failed to serialize view event content:",
          error
        );
      }
      normalized = "";
    }
  } else {
    normalized = String(value);
  }

  if (!cachedUtf8Encoder && typeof TextEncoder !== "undefined") {
    cachedUtf8Encoder = new TextEncoder();
  }

  if (cachedUtf8Encoder) {
    try {
      cachedUtf8Encoder.encode(normalized);
    } catch (error) {
      if (isDevMode) {
        console.warn(
          "[nostrEventSchemas] Dropping invalid UTF-8 characters from event content",
          error
        );
      }
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
        if (isDevMode) {
          console.warn(
            "[nostrEventSchemas] Failed to normalize view event content; defaulting to empty string",
            encodeError
          );
        }
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
    encryptionTag: { name: "encrypted", value: "nip04" },
    snapshotTagName: "snapshot",
    chunkTagName: "chunk",
    headTag: { name: "head", value: "1" },
    headTagIndex: 2,
    appendTags: DEFAULT_APPEND_TAGS,
    content: {
      format: "nip04-json",
      description:
        "Encrypted JSON payload containing chunked watch history entries.",
    },
  },
  [NOTE_TYPES.SUBSCRIPTION_LIST]: {
    type: NOTE_TYPES.SUBSCRIPTION_LIST,
    label: "Subscription list",
    kind: 30002,
    identifierTag: {
      name: "d",
      value: SUBSCRIPTION_LIST_IDENTIFIER,
    },
    appendTags: DEFAULT_APPEND_TAGS,
    content: {
      format: "nip04-json",
      description: "Encrypted JSON: { subPubkeys: string[] }.",
    },
  },
  [NOTE_TYPES.USER_BLOCK_LIST]: {
    type: NOTE_TYPES.USER_BLOCK_LIST,
    label: "User block list",
    kind: 30002,
    identifierTag: {
      name: "d",
      value: BLOCK_LIST_IDENTIFIER,
    },
    appendTags: DEFAULT_APPEND_TAGS,
    content: {
      format: "nip04-json",
      description: "Encrypted JSON: { blockedPubkeys: string[] }.",
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
    const runtimeOverrides = window.BitVidNostrEventOverrides;
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
    window.BitVidNostrEventOverrides = schemaOverrides;
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
}) {
  const schema = getNostrEventSchema(NOTE_TYPES.REPOST);
  const tags = [];

  const normalizedEventId = typeof eventId === "string" ? eventId.trim() : "";
  const normalizedEventRelay = typeof eventRelay === "string" ? eventRelay.trim() : "";
  if (normalizedEventId) {
    if (normalizedEventRelay) {
      tags.push(["e", normalizedEventId, normalizedEventRelay]);
    } else {
      tags.push(["e", normalizedEventId]);
    }
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

  return {
    kind: schema?.kind ?? 6,
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

  const pointerTagName = schema?.pointerTagName;
  if (pointerValue && pointerTagName) {
    tags.push([pointerTagName, pointerValue]);
  }
  const normalizedPointerTags = [];
  if (Array.isArray(pointerTag) && pointerTag.length >= 2) {
    normalizedPointerTags.push(
      pointerTag.map((value) => (typeof value === "string" ? value : String(value)))
    );
  }
  if (Array.isArray(pointerTags)) {
    pointerTags.forEach((tag) => {
      if (Array.isArray(tag) && tag.length >= 2) {
        normalizedPointerTags.push(
          tag.map((value) => (typeof value === "string" ? value : String(value)))
        );
      }
    });
  }
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
}) {
  const schema = getNostrEventSchema(NOTE_TYPES.WATCH_HISTORY_CHUNK);
  const tags = [];
  const identifierName = schema?.identifierTag?.name || "d";
  const identifierValue = chunkIdentifier || schema?.identifierTag?.value;
  if (identifierName && identifierValue) {
    tags.push([identifierName, identifierValue]);
  }
  if (schema?.encryptionTag?.name && schema?.encryptionTag?.value) {
    tags.push([schema.encryptionTag.name, schema.encryptionTag.value]);
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
}) {
  const schema = getNostrEventSchema(NOTE_TYPES.SUBSCRIPTION_LIST);
  const tags = [];
  const identifierName = schema?.identifierTag?.name || "d";
  const identifierValue = schema?.identifierTag?.value || SUBSCRIPTION_LIST_IDENTIFIER;
  if (identifierName && identifierValue) {
    tags.push([identifierName, identifierValue]);
  }
  appendSchemaTags(tags, schema);
  return {
    kind: schema?.kind ?? 30002,
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
}) {
  const schema = getNostrEventSchema(NOTE_TYPES.USER_BLOCK_LIST);
  const tags = [];
  const identifierName = schema?.identifierTag?.name || "d";
  const identifierValue = schema?.identifierTag?.value || BLOCK_LIST_IDENTIFIER;
  if (identifierName && identifierValue) {
    tags.push([identifierName, identifierValue]);
  }
  appendSchemaTags(tags, schema);
  return {
    kind: schema?.kind ?? 30002,
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
    if (isDevMode) {
      console.warn(`[nostrEventSchemas] Unknown admin list key: ${listKey}`);
    }
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
  window.BitVidNostrEvents = {
    NOTE_TYPES,
    getSchema: getNostrEventSchema,
    getAllSchemas: getAllNostrEventSchemas,
    setOverrides: setNostrEventSchemaOverrides,
  };
}
