import { NOTE_TYPES } from "../nostrEventSchemas.js";
import { WATCH_HISTORY_LIST_IDENTIFIER } from "../config.js";

export const STORAGE_TIERS = Object.freeze({
  MEMORY: "memory",
  INDEXED_DB: "indexedDB",
  LOCAL_STORAGE: "localStorage",
});

export const MERGE_STRATEGIES = Object.freeze({
  REPLACEABLE: "replaceable",
  APPEND_ONLY: "append-only",
});

export const CACHE_POLICIES = Object.freeze({
  [NOTE_TYPES.VIDEO_POST]: {
    storage: STORAGE_TIERS.INDEXED_DB,
    ttl: 10 * 60 * 1000, // 10 minutes
    addressing: "kind:pubkey:d",
    merge: MERGE_STRATEGIES.REPLACEABLE,
  },
  [NOTE_TYPES.WATCH_HISTORY]: {
    storage: STORAGE_TIERS.LOCAL_STORAGE,
    ttl: 24 * 60 * 60 * 1000, // 24 hours
    addressing: "kind:pubkey:d",
    defaultDTag: WATCH_HISTORY_LIST_IDENTIFIER,
    merge: MERGE_STRATEGIES.APPEND_ONLY, // Bucketed append
  },
  [NOTE_TYPES.SUBSCRIPTION_LIST]: {
    storage: STORAGE_TIERS.LOCAL_STORAGE,
    ttl: Infinity, // Manual management
    addressing: "kind:pubkey:d",
    merge: MERGE_STRATEGIES.REPLACEABLE,
  },
  [NOTE_TYPES.USER_BLOCK_LIST]: {
    storage: STORAGE_TIERS.LOCAL_STORAGE,
    ttl: Infinity, // Manual management
    addressing: "kind:pubkey:d",
    merge: MERGE_STRATEGIES.REPLACEABLE,
  },
  [NOTE_TYPES.RELAY_LIST]: {
    storage: STORAGE_TIERS.LOCAL_STORAGE,
    ttl: Infinity, // Manual management
    addressing: "kind:pubkey",
    merge: MERGE_STRATEGIES.REPLACEABLE,
  },
  [NOTE_TYPES.ADMIN_MODERATION_LIST]: {
    storage: STORAGE_TIERS.LOCAL_STORAGE,
    ttl: Infinity,
    addressing: "kind:pubkey:d",
    merge: MERGE_STRATEGIES.REPLACEABLE,
  },
  [NOTE_TYPES.ADMIN_BLACKLIST]: {
    storage: STORAGE_TIERS.LOCAL_STORAGE,
    ttl: Infinity,
    addressing: "kind:pubkey:d",
    merge: MERGE_STRATEGIES.REPLACEABLE,
  },
  [NOTE_TYPES.ADMIN_WHITELIST]: {
    storage: STORAGE_TIERS.LOCAL_STORAGE,
    ttl: Infinity,
    addressing: "kind:pubkey:d",
    merge: MERGE_STRATEGIES.REPLACEABLE,
  },
  [NOTE_TYPES.VIDEO_COMMENT]: {
    storage: STORAGE_TIERS.MEMORY,
    ttl: 5 * 60 * 1000, // 5 minutes
    addressing: "id",
    merge: MERGE_STRATEGIES.APPEND_ONLY,
  },
  [NOTE_TYPES.VIDEO_REACTION]: {
    storage: STORAGE_TIERS.MEMORY,
    ttl: 5 * 60 * 1000, // 5 minutes
    addressing: "id",
    merge: MERGE_STRATEGIES.APPEND_ONLY,
  },
  [NOTE_TYPES.VIEW_EVENT]: {
    storage: STORAGE_TIERS.MEMORY,
    ttl: 0,
    addressing: "id",
    merge: MERGE_STRATEGIES.APPEND_ONLY,
  },
  [NOTE_TYPES.HASHTAG_PREFERENCES]: {
    storage: STORAGE_TIERS.LOCAL_STORAGE,
    ttl: Infinity,
    addressing: "kind:pubkey:d",
    merge: MERGE_STRATEGIES.REPLACEABLE,
  },
});
