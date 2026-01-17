import {
  buildCommentEvent,
  getNostrEventSchema,
  NOTE_TYPES,
  sanitizeAdditionalTags,
} from "../nostrEventSchemas.js";
import { publishEventToRelay } from "../nostrPublish.js";
import { RELAY_URLS } from "./toolkit.js";
import { normalizePointerInput } from "./watchHistory.js";
import { devLogger, userLogger } from "../utils/logger.js";
import { LRUCache } from "../utils/lruCache.js";
import { CACHE_POLICIES } from "./cachePolicies.js";
import { isSessionActor } from "./sessionActor.js";

const COMMENT_EVENT_SCHEMA = getNostrEventSchema(NOTE_TYPES.VIDEO_COMMENT);
const CACHE_POLICY = CACHE_POLICIES[NOTE_TYPES.VIDEO_COMMENT];

const commentCache = new LRUCache({ maxSize: 100 });
export const COMMENT_EVENT_KIND = Number.isFinite(COMMENT_EVENT_SCHEMA?.kind)
  ? COMMENT_EVENT_SCHEMA.kind
  : 1111;
export const LEGACY_COMMENT_KIND = 1;
const ALLOWED_COMMENT_KINDS = Object.freeze(
  COMMENT_EVENT_KIND === LEGACY_COMMENT_KIND
    ? [COMMENT_EVENT_KIND]
    : [COMMENT_EVENT_KIND, LEGACY_COMMENT_KIND]
);

function getAllowedCommentKinds() {
  return ALLOWED_COMMENT_KINDS.slice();
}
function sanitizeRelayList(primary, fallback) {
  if (Array.isArray(primary) && primary.length) {
    return primary;
  }
  if (Array.isArray(fallback) && fallback.length) {
    return fallback;
  }
  return RELAY_URLS;
}

function normalizeRelay(candidate) {
  if (typeof candidate === "string" && candidate.trim()) {
    return candidate.trim();
  }
  if (Array.isArray(candidate)) {
    const relayCandidate = candidate[2];
    if (typeof relayCandidate === "string" && relayCandidate.trim()) {
      return relayCandidate.trim();
    }
  }
  if (candidate && typeof candidate === "object") {
    if (typeof candidate.relay === "string" && candidate.relay.trim()) {
      return candidate.relay.trim();
    }
    if (typeof candidate.url === "string" && candidate.url.trim()) {
      return candidate.url.trim();
    }
    if (Array.isArray(candidate.relays)) {
      for (const relayCandidate of candidate.relays) {
        if (typeof relayCandidate === "string" && relayCandidate.trim()) {
          return relayCandidate.trim();
        }
      }
    }
    if (candidate.tag) {
      return normalizeRelay(candidate.tag);
    }
    if (candidate.pointer) {
      return normalizeRelay(candidate.pointer);
    }
  }
  return "";
}

function normalizePointerCandidate(candidate, expectedType) {
  if (!candidate) {
    return null;
  }

  if (Array.isArray(candidate)) {
    const tagName =
      typeof candidate[0] === "string" ? candidate[0].trim().toLowerCase() : "";
    if (
      tagName === expectedType &&
      typeof candidate[1] === "string" &&
      candidate[1].trim()
    ) {
      return {
        value: candidate[1].trim(),
        relay: normalizeRelay(candidate),
      };
    }
    return null;
  }

  if (typeof candidate === "string") {
    const pointer = normalizePointerInput(candidate);
    if (pointer?.type === expectedType && pointer.value) {
      return {
        value: pointer.value.trim(),
        relay: normalizeRelay(pointer),
      };
    }
    if (expectedType === "e" && candidate.trim() && !candidate.includes(":")) {
      return { value: candidate.trim(), relay: "" };
    }
    if (expectedType === "a" && candidate.trim() && candidate.includes(":")) {
      return { value: candidate.trim(), relay: "" };
    }
    return null;
  }

  if (candidate && typeof candidate === "object") {
    if (
      typeof candidate.type === "string" &&
      candidate.type.toLowerCase() === expectedType &&
      typeof candidate.value === "string" &&
      candidate.value.trim()
    ) {
      return {
        value: candidate.value.trim(),
        relay: normalizeRelay(candidate),
      };
    }
    if (
      expectedType === "e" &&
      typeof candidate.id === "string" &&
      candidate.id.trim()
    ) {
      return {
        value: candidate.id.trim(),
        relay: normalizeRelay(candidate),
      };
    }
    if (
      expectedType === "a" &&
      typeof candidate.address === "string" &&
      candidate.address.trim()
    ) {
      return {
        value: candidate.address.trim(),
        relay: normalizeRelay(candidate),
      };
    }
    if (candidate.tag) {
      return normalizePointerCandidate(candidate.tag, expectedType);
    }
    if (candidate.pointer) {
      return normalizePointerCandidate(candidate.pointer, expectedType);
    }
  }

  return null;
}

function normalizeTagName(name) {
  return typeof name === "string" ? name.trim().toLowerCase() : "";
}

function normalizeTagValue(value) {
  if (value === null || value === undefined) {
    return "";
  }
  if (Number.isFinite(value)) {
    return String(Math.floor(value));
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed.toLowerCase() : "";
  }
  return "";
}

function normalizeDescriptorString(value) {
  if (value === null || value === undefined) {
    return "";
  }
  if (Number.isFinite(value)) {
    return String(Math.floor(value));
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed.toLowerCase() : "";
  }
  if (typeof value === "object" && typeof value.value !== "undefined") {
    return normalizeDescriptorString(value.value);
  }
  return "";
}

function normalizeDescriptorRelay(value) {
  if (typeof value === "string") {
    return value.trim();
  }
  return "";
}


function pickString(...candidates) {
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }
  return "";
}

function pickKind(...candidates) {
  for (const candidate of candidates) {
    if (Number.isFinite(candidate)) {
      return String(Math.floor(candidate));
    }
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }
  return "";
}

function isEventCandidate(candidate) {
  if (!candidate || typeof candidate !== "object") {
    return false;
  }
  if (Array.isArray(candidate.tags)) {
    return true;
  }
  if (typeof candidate.id === "string" && candidate.id.trim()) {
    return true;
  }
  if (typeof candidate.pubkey === "string" && candidate.pubkey.trim()) {
    return true;
  }
  return false;
}

function resolveEventCandidate(...candidates) {
  for (const candidate of candidates) {
    if (isEventCandidate(candidate)) {
      return candidate;
    }
  }
  return null;
}

function collectTagsFromEvent(event) {
  if (!event || typeof event !== "object") {
    return [];
  }
  const tags = Array.isArray(event.tags) ? event.tags : [];
  return tags.filter((tag) => Array.isArray(tag) && tag.length >= 2);
}

function findTagByName(tags, ...names) {
  const normalizedNames = names
    .flat()
    .map((name) => normalizeTagName(name))
    .filter(Boolean);
  if (!normalizedNames.length) {
    return null;
  }
  for (const tag of tags) {
    if (!Array.isArray(tag) || tag.length < 2) {
      continue;
    }
    const [name] = tag;
    if (typeof name !== "string") {
      continue;
    }
    if (normalizedNames.includes(normalizeTagName(name))) {
      return tag;
    }
  }
  return null;
}

function normalizeCommentTarget(targetInput = {}, overrides = {}) {
  const target = targetInput && typeof targetInput === "object" ? targetInput : {};
  const options = overrides && typeof overrides === "object" ? overrides : {};

  const videoEventPointer =
    normalizePointerCandidate(options.videoEventPointer, "e") ||
    normalizePointerCandidate(options.videoEvent, "e") ||
    normalizePointerCandidate(target.videoEventPointer, "e") ||
    normalizePointerCandidate(target.videoEvent, "e") ||
    normalizePointerCandidate(target.eventPointer, "e") ||
    normalizePointerCandidate(target.event, "e");

  const videoDefinitionPointer =
    normalizePointerCandidate(options.videoDefinitionPointer, "a") ||
    normalizePointerCandidate(options.videoDefinition, "a") ||
    normalizePointerCandidate(target.videoDefinitionPointer, "a") ||
    normalizePointerCandidate(target.videoDefinition, "a") ||
    normalizePointerCandidate(target.definitionPointer, "a") ||
    normalizePointerCandidate(target.definition, "a");

  const rootDefinitionPointer =
    normalizePointerCandidate(options.rootDefinitionPointer, "a") ||
    normalizePointerCandidate(options.rootPointer, "a") ||
    normalizePointerCandidate(target.rootDefinitionPointer, "a") ||
    normalizePointerCandidate(target.rootPointer, "a");

  const rootEventPointer =
    normalizePointerCandidate(options.rootEventPointer, "e") ||
    normalizePointerCandidate(options.rootPointer, "e") ||
    normalizePointerCandidate(target.rootEventPointer, "e") ||
    normalizePointerCandidate(target.rootPointer, "e");

  const parentCommentPointer =
    normalizePointerCandidate(options.parentCommentPointer, "e") ||
    normalizePointerCandidate(options.parentComment, "e") ||
    normalizePointerCandidate(target.parentCommentPointer, "e") ||
    normalizePointerCandidate(target.parentComment, "e") ||
    normalizePointerCandidate(target.parentPointer, "e");

  const videoEventObject = resolveEventCandidate(
    options.videoEvent,
    options.rootEvent,
    target.videoEvent,
    target.rootEvent,
  );

  const parentCommentEvent = resolveEventCandidate(
    options.parentCommentEvent,
    options.parentComment,
    target.parentCommentEvent,
    target.parentComment,
  );

  const rootEventTags = collectTagsFromEvent(videoEventObject);
  const parentEventTags = collectTagsFromEvent(parentCommentEvent);
  const combinedTags = [...parentEventTags, ...rootEventTags];
  const getTagField = (tag, index) =>
    Array.isArray(tag) && typeof tag[index] === "string"
      ? tag[index].trim()
      : "";

  const videoEventId = pickString(
    options.videoEventId,
    target.videoEventId,
    target.eventId,
    videoEventPointer?.value,
    rootEventPointer?.value,
  );
  const videoEventRelay = pickString(
    options.videoEventRelay,
    target.videoEventRelay,
    target.eventRelay,
    videoEventPointer?.relay,
    rootEventPointer?.relay,
  );

  const videoDefinitionAddress = pickString(
    options.videoDefinitionAddress,
    target.videoDefinitionAddress,
    target.definitionAddress,
    videoDefinitionPointer?.value,
    rootDefinitionPointer?.value,
  );
  const videoDefinitionRelay = pickString(
    options.videoDefinitionRelay,
    target.videoDefinitionRelay,
    target.definitionRelay,
    videoDefinitionPointer?.relay,
    rootDefinitionPointer?.relay,
  );

  const parentCommentId = pickString(
    options.parentCommentId,
    target.parentCommentId,
    target.parentId,
    parentCommentPointer?.value,
  );
  const parentCommentRelay = pickString(
    options.parentCommentRelay,
    target.parentCommentRelay,
    target.parentRelay,
    parentCommentPointer?.relay,
  );

  const threadParticipantPubkey = pickString(
    options.threadParticipantPubkey,
    target.threadParticipantPubkey,
    target.participantPubkey,
    target.authorPubkey,
  );
  const threadParticipantRelay = pickString(
    options.threadParticipantRelay,
    target.threadParticipantRelay,
    target.participantRelay,
  );

  let normalizedVideoEventId =
    typeof videoEventId === "string" ? videoEventId.trim() : "";
  let normalizedVideoDefinitionAddress =
    typeof videoDefinitionAddress === "string" ? videoDefinitionAddress.trim() : "";
  let normalizedVideoEventRelay =
    typeof videoEventRelay === "string" ? videoEventRelay.trim() : "";
  let normalizedVideoDefinitionRelay =
    typeof videoDefinitionRelay === "string" ? videoDefinitionRelay.trim() : "";
  let normalizedParentCommentId =
    typeof parentCommentId === "string" ? parentCommentId.trim() : "";
  let normalizedParentCommentRelay =
    typeof parentCommentRelay === "string" ? parentCommentRelay.trim() : "";
  const normalizedThreadParticipantPubkey =
    typeof threadParticipantPubkey === "string" ? threadParticipantPubkey.trim() : "";
  const normalizedThreadParticipantRelay =
    typeof threadParticipantRelay === "string"
      ? threadParticipantRelay.trim()
      : "";

  const rootIdentifier = pickString(
    options.rootIdentifier,
    target.rootIdentifier,
    options.rootPointer,
    target.rootPointer,
  );
  const rootIdentifierRelay = pickString(
    options.rootIdentifierRelay,
    target.rootIdentifierRelay,
  );

  const parentIdentifier = pickString(
    options.parentIdentifier,
    target.parentIdentifier,
  );
  const parentIdentifierRelay = pickString(
    options.parentIdentifierRelay,
    target.parentIdentifierRelay,
  );

  const normalizedRootIdentifier =
    typeof rootIdentifier === "string" ? rootIdentifier.trim() : "";
  let normalizedRootIdentifierRelay =
    typeof rootIdentifierRelay === "string" ? rootIdentifierRelay.trim() : "";
  const normalizedParentIdentifier =
    typeof parentIdentifier === "string" ? parentIdentifier.trim() : "";
  let normalizedParentIdentifierRelay =
    typeof parentIdentifierRelay === "string"
      ? parentIdentifierRelay.trim()
      : "";

  let normalizedVideoKind = pickKind(
    options.videoKind,
    target.videoKind,
    videoEventObject?.kind,
  );

  let normalizedVideoAuthorPubkey = pickString(
    options.videoAuthorPubkey,
    target.videoAuthorPubkey,
    videoEventObject?.pubkey,
  );

  const definitionSegments = normalizedVideoDefinitionAddress
    ? normalizedVideoDefinitionAddress.split(":")
    : [];
  const derivedDefinitionKind = definitionSegments[0] || "";
  const derivedDefinitionPubkey = definitionSegments[1] || "";

  const rootKindCandidate = pickString(
    options.rootKind,
    target.rootKind,
    options.videoKind,
    target.videoKind,
    normalizedVideoKind,
    derivedDefinitionKind,
  );
  let normalizedRootKind =
    typeof rootKindCandidate === "string" ? rootKindCandidate.trim() : "";

  const parentKindCandidate = pickString(
    options.parentKind,
    target.parentKind,
    options.parentCommentKind,
    target.parentCommentKind,
    pickKind(parentCommentEvent?.kind),
  );
  let normalizedParentKind =
    typeof parentKindCandidate === "string" ? parentKindCandidate.trim() : "";

  let normalizedRootAuthorPubkey = pickString(
    options.rootAuthorPubkey,
    target.rootAuthorPubkey,
    options.videoAuthorPubkey,
    target.videoAuthorPubkey,
    normalizedVideoAuthorPubkey,
    derivedDefinitionPubkey,
  );
  normalizedRootAuthorPubkey =
    typeof normalizedRootAuthorPubkey === "string"
      ? normalizedRootAuthorPubkey.trim()
      : "";

  let normalizedParentAuthorPubkey = pickString(
    options.parentAuthorPubkey,
    target.parentAuthorPubkey,
    options.parentCommentPubkey,
    target.parentCommentPubkey,
    parentCommentEvent?.pubkey,
  );
  normalizedParentAuthorPubkey =
    typeof normalizedParentAuthorPubkey === "string"
      ? normalizedParentAuthorPubkey.trim()
      : "";

  let normalizedRootAuthorRelay = pickString(
    options.rootAuthorRelay,
    target.rootAuthorRelay,
  );
  normalizedRootAuthorRelay =
    typeof normalizedRootAuthorRelay === "string"
      ? normalizedRootAuthorRelay.trim()
      : "";

  let normalizedParentAuthorRelay = pickString(
    options.parentAuthorRelay,
    target.parentAuthorRelay,
  );
  normalizedParentAuthorRelay =
    typeof normalizedParentAuthorRelay === "string"
      ? normalizedParentAuthorRelay.trim()
      : "";

  if (!normalizedRootIdentifier) {
    const tag = findTagByName(combinedTags, "I");
    const value = getTagField(tag, 1);
    if (value) {
      normalizedRootIdentifier = value;
      const relay = getTagField(tag, 2);
      if (relay) {
        normalizedRootIdentifierRelay = relay;
      }
    }
  } else if (!normalizedRootIdentifierRelay) {
    const tag = findTagByName(combinedTags, "I");
    const relay = getTagField(tag, 2);
    if (relay) {
      normalizedRootIdentifierRelay = relay;
    }
  }

  if (!normalizedVideoDefinitionAddress) {
    const tag = findTagByName(combinedTags, "A", "a");
    const value = getTagField(tag, 1);
    if (value) {
      normalizedVideoDefinitionAddress = value;
      const relay = getTagField(tag, 2);
      if (relay) {
        normalizedVideoDefinitionRelay = relay;
      }
    }
  } else if (!normalizedVideoDefinitionRelay) {
    const tag = findTagByName(combinedTags, "A", "a");
    const relay = getTagField(tag, 2);
    if (relay) {
      normalizedVideoDefinitionRelay = relay;
    }
  }

  const rootEventTag = findTagByName(combinedTags, "E");
  if (rootEventTag) {
    const value = getTagField(rootEventTag, 1);
    if (value && !normalizedVideoEventId) {
      normalizedVideoEventId = value;
    }
    const relay = getTagField(rootEventTag, 2);
    if (relay && !normalizedVideoEventRelay) {
      normalizedVideoEventRelay = relay;
    }
    const authorHint = getTagField(rootEventTag, 3);
    if (authorHint && !normalizedRootAuthorPubkey) {
      normalizedRootAuthorPubkey = authorHint;
    }
  }

  if (!normalizedVideoEventId || !normalizedParentCommentId) {
    const eventValues = [];
    for (const tag of combinedTags) {
      if (!Array.isArray(tag) || tag.length < 2) {
        continue;
      }
      if (typeof tag[0] === "string" && tag[0].trim().toLowerCase() === "e") {
        const value = getTagField(tag, 1);
        if (value) {
          eventValues.push({ tag, value });
        }
      }
    }
    if (!normalizedVideoEventId && eventValues.length) {
      normalizedVideoEventId = eventValues[0].value;
      const relay = getTagField(eventValues[0].tag, 2);
      if (relay && !normalizedVideoEventRelay) {
        normalizedVideoEventRelay = relay;
      }
    }
    if (!normalizedParentCommentId && eventValues.length) {
      for (let index = eventValues.length - 1; index >= 0; index -= 1) {
        const candidate = eventValues[index];
        if (
          candidate.value &&
          candidate.value !== normalizedVideoEventId
        ) {
          normalizedParentCommentId = candidate.value;
          const relay = getTagField(candidate.tag, 2);
          if (relay) {
            normalizedParentCommentRelay = relay;
          }
          const authorHint = getTagField(candidate.tag, 3);
          if (authorHint && !normalizedParentAuthorPubkey) {
            normalizedParentAuthorPubkey = authorHint;
          }
          break;
        }
      }
    }
  }

  if (normalizedParentCommentId && !normalizedParentCommentRelay) {
    const parentTag = parentEventTags.find(
      (tag) =>
        Array.isArray(tag) &&
        tag.length >= 2 &&
        typeof tag[0] === "string" &&
        tag[0].trim().toLowerCase() === "e" &&
        getTagField(tag, 1) === normalizedParentCommentId,
    );
    if (parentTag) {
      const relay = getTagField(parentTag, 2);
      if (relay) {
        normalizedParentCommentRelay = relay;
      }
      const authorHint = getTagField(parentTag, 3);
      if (authorHint && !normalizedParentAuthorPubkey) {
        normalizedParentAuthorPubkey = authorHint;
      }
    }
  }

  if (!normalizedParentIdentifierRelay) {
    const tag = findTagByName(parentEventTags, "i");
    const relay = getTagField(tag, 2);
    if (relay) {
      normalizedParentIdentifierRelay = relay;
    }
  }

  if (!normalizedRootKind) {
    const tag = findTagByName(combinedTags, "K");
    const value = getTagField(tag, 1);
    if (value) {
      normalizedRootKind = value;
    }
  }
  if (!normalizedVideoKind && normalizedRootKind) {
    normalizedVideoKind = normalizedRootKind;
  }

  if (!normalizedRootAuthorPubkey || !normalizedRootAuthorRelay) {
    const tag = findTagByName(combinedTags, "P");
    if (tag) {
      const value = getTagField(tag, 1);
      if (value && !normalizedRootAuthorPubkey) {
        normalizedRootAuthorPubkey = value;
      }
      const relay = getTagField(tag, 2);
      if (relay && !normalizedRootAuthorRelay) {
        normalizedRootAuthorRelay = relay;
      }
    }
  }
  if (!normalizedVideoAuthorPubkey && normalizedRootAuthorPubkey) {
    normalizedVideoAuthorPubkey = normalizedRootAuthorPubkey;
  }

  if (!normalizedParentKind) {
    const tag = findTagByName(parentEventTags, "k");
    const value = getTagField(tag, 1);
    if (value) {
      normalizedParentKind = value;
    }
  }

  if (!normalizedParentAuthorRelay && normalizedParentAuthorPubkey) {
    const parentTag = parentEventTags.find(
      (tag) =>
        Array.isArray(tag) &&
        tag.length >= 2 &&
        typeof tag[0] === "string" &&
        tag[0].trim().toLowerCase() === "p" &&
        normalizeTagValue(tag[1]) === normalizeTagValue(normalizedParentAuthorPubkey),
    );
    if (parentTag) {
      const relay = getTagField(parentTag, 2);
      if (relay) {
        normalizedParentAuthorRelay = relay;
      }
    }
  }

  if (!normalizedParentAuthorPubkey || !normalizedParentAuthorRelay) {
    const tag = findTagByName(parentEventTags, "p");
    if (tag) {
      const value = getTagField(tag, 1);
      if (value && !normalizedParentAuthorPubkey) {
        normalizedParentAuthorPubkey = value;
      }
      const relay = getTagField(tag, 2);
      if (relay && !normalizedParentAuthorRelay) {
        normalizedParentAuthorRelay = relay;
      }
    }
  }

  if (!normalizedParentKind) {
    if (normalizedParentCommentId) {
      normalizedParentKind = String(COMMENT_EVENT_KIND);
    } else if (normalizedRootKind) {
      normalizedParentKind = normalizedRootKind;
    } else if (derivedDefinitionKind) {
      normalizedParentKind = derivedDefinitionKind;
    }
  }

  if (!normalizedRootKind) {
    normalizedRootKind = normalizedParentKind;
  }

  if (!normalizedParentAuthorPubkey) {
    normalizedParentAuthorPubkey = normalizedThreadParticipantPubkey;
  }

  if (!normalizedRootAuthorPubkey) {
    if (!normalizedParentCommentId && normalizedParentAuthorPubkey) {
      normalizedRootAuthorPubkey = normalizedParentAuthorPubkey;
    }
  }

  if (!normalizedRootAuthorRelay && normalizedVideoDefinitionRelay) {
    normalizedRootAuthorRelay = normalizedVideoDefinitionRelay;
  }

  if (!normalizedParentAuthorRelay) {
    normalizedParentAuthorRelay = normalizedThreadParticipantRelay;
  }

  if (!normalizedRootAuthorRelay && !normalizedParentCommentId) {
    normalizedRootAuthorRelay = normalizedParentAuthorRelay;
  }

  if (!normalizedRootAuthorPubkey && derivedDefinitionPubkey) {
    normalizedRootAuthorPubkey = derivedDefinitionPubkey;
  }

  if (!normalizedParentAuthorPubkey && !normalizedParentCommentId) {
    normalizedParentAuthorPubkey = normalizedRootAuthorPubkey;
  }

  if (!normalizedParentAuthorRelay && !normalizedParentCommentId) {
    normalizedParentAuthorRelay = normalizedRootAuthorRelay;
  }

  const descriptor = {
    videoEventId: normalizeDescriptorString(normalizedVideoEventId),
    videoEventRelay: normalizeDescriptorRelay(normalizedVideoEventRelay),
    videoDefinitionAddress: normalizeDescriptorString(normalizedVideoDefinitionAddress),
    videoDefinitionRelay: normalizeDescriptorRelay(normalizedVideoDefinitionRelay),
    videoKind: normalizeDescriptorString(normalizedVideoKind),
    videoAuthorPubkey: normalizeDescriptorString(normalizedVideoAuthorPubkey),
    parentCommentId: normalizeDescriptorString(normalizedParentCommentId),
    parentCommentRelay: normalizeDescriptorRelay(normalizedParentCommentRelay),
    threadParticipantPubkey: normalizeDescriptorString(normalizedThreadParticipantPubkey),
    threadParticipantRelay: normalizeDescriptorRelay(normalizedThreadParticipantRelay),
    rootIdentifier: normalizeDescriptorString(normalizedRootIdentifier),
    rootIdentifierRelay: normalizeDescriptorRelay(normalizedRootIdentifierRelay),
    parentIdentifier: normalizeDescriptorString(normalizedParentIdentifier),
    parentIdentifierRelay: normalizeDescriptorRelay(normalizedParentIdentifierRelay),
    rootKind: normalizeDescriptorString(normalizedRootKind),
    rootAuthorPubkey: normalizeDescriptorString(normalizedRootAuthorPubkey),
    rootAuthorRelay: normalizeDescriptorRelay(normalizedRootAuthorRelay),
    parentKind: normalizeDescriptorString(normalizedParentKind),
    parentAuthorPubkey: normalizeDescriptorString(normalizedParentAuthorPubkey),
    parentAuthorRelay: normalizeDescriptorRelay(normalizedParentAuthorRelay),
  };

  if (!descriptor.videoEventId) {
    return null;
  }

  return descriptor;
}

function applyFilterOptions(filter, options = {}) {
  if (!filter || typeof filter !== "object") {
    return filter;
  }

  const result = { ...filter };

  if (
    typeof options.limit === "number" &&
    Number.isFinite(options.limit) &&
    options.limit > 0
  ) {
    result.limit = Math.floor(options.limit);
  }

  if (typeof options.since === "number" && Number.isFinite(options.since)) {
    result.since = Math.floor(options.since);
  }

  if (typeof options.until === "number" && Number.isFinite(options.until)) {
    result.until = Math.floor(options.until);
  }

  return result;
}

function createVideoCommentFilters(targetInput, options = {}) {
  const descriptor = normalizeCommentTarget(targetInput, options);
  if (!descriptor) {
    throw new Error("Invalid video comment target supplied.");
  }

  const filters = [];

  const eventFilter = {
    kinds: getAllowedCommentKinds(),
    "#E": [descriptor.videoEventId],
  };
  filters.push(applyFilterOptions(eventFilter, options));

  const uppercaseFilter = { kinds: getAllowedCommentKinds() };
  let hasUppercasePointer = false;

  if (typeof descriptor.rootIdentifier === "string" && descriptor.rootIdentifier) {
    uppercaseFilter["#I"] = [descriptor.rootIdentifier];
    hasUppercasePointer = true;

  } else if (
    typeof descriptor.videoDefinitionAddress === "string" &&
    descriptor.videoDefinitionAddress
  ) {
    uppercaseFilter["#A"] = [descriptor.videoDefinitionAddress];
    hasUppercasePointer = true;
  } else if (
    typeof descriptor.videoEventId === "string" &&
    descriptor.videoEventId
  ) {
    uppercaseFilter["#E"] = [descriptor.videoEventId];
    hasUppercasePointer = true;
  }

  const normalizedRootKind = normalizeDescriptorString(
    descriptor.rootKind || descriptor.videoKind,
  );
  if (normalizedRootKind) {
    uppercaseFilter["#K"] = [normalizedRootKind];
  }

  const normalizedRootAuthor = normalizeDescriptorString(
    descriptor.rootAuthorPubkey || descriptor.videoAuthorPubkey,
  );
  if (normalizedRootAuthor) {
    uppercaseFilter["#P"] = [normalizedRootAuthor];
  }

  if (hasUppercasePointer) {
    filters.push(applyFilterOptions(uppercaseFilter, options));
  }

  if (
    descriptor.parentCommentId &&
    descriptor.parentCommentId !== descriptor.videoEventId
  ) {
    const parentUppercaseFilter = {
      kinds: getAllowedCommentKinds(),
      "#E": [descriptor.parentCommentId],
    };
    filters.push(applyFilterOptions(parentUppercaseFilter, options));
  }

  if (descriptor.videoDefinitionAddress) {
    const definitionUppercaseFilter = {
      kinds: getAllowedCommentKinds(),
      "#A": [descriptor.videoDefinitionAddress],
    };

    if (descriptor.parentCommentId) {
      definitionUppercaseFilter["#E"] = [descriptor.parentCommentId];
    }

    filters.push(applyFilterOptions(definitionUppercaseFilter, options));
  }

  return { descriptor, filters };
}

function flattenListResults(input) {
  if (!Array.isArray(input)) {
    return [];
  }

  const flat = [];
  for (const chunk of input) {
    if (Array.isArray(chunk)) {
      for (const item of chunk) {
        if (item && typeof item === "object") {
          flat.push(item);
        }
      }
    } else if (chunk && typeof chunk === "object") {
      flat.push(chunk);
    }
  }
  return flat;
}

function isVideoCommentEvent(event, descriptor) {
  if (!event || typeof event !== "object") {
    return false;
  }

  if (!getAllowedCommentKinds().includes(Number(event.kind))) {
    return false;
  }

  const targetDescriptor =
    descriptor && typeof descriptor === "object" ? descriptor : {};

  const tags = Array.isArray(event.tags) ? event.tags : [];
  const normalizedRootIdentifier = normalizeTagValue(
    targetDescriptor.rootIdentifier,
  );
  const normalizedVideoDefinitionAddress = normalizeTagValue(
    targetDescriptor.videoDefinitionAddress,
  );
  const normalizedVideoEventId = normalizeTagValue(
    targetDescriptor.videoEventId,
  );
  const normalizedParentCommentId = normalizeTagValue(
    targetDescriptor.parentCommentId,
  );

  const requiresRootIdentifierMatch = Boolean(normalizedRootIdentifier);
  const requiresAddressMatch =
    !requiresRootIdentifierMatch && Boolean(normalizedVideoDefinitionAddress);
  const requiresEventMatch =
    !requiresRootIdentifierMatch &&
    !requiresAddressMatch &&
    Boolean(normalizedVideoEventId);
  const requiresParentTag = Boolean(normalizedParentCommentId);

  let hasIdentifierTag = !requiresRootIdentifierMatch;
  let hasDefinitionTag = !requiresAddressMatch;
  let hasEventTag = !requiresEventMatch;
  let hasParentTag = false;

  let matchedDefinitionPointer = false;
  let matchedEventPointer = false;

  const expectedRootKind = normalizeDescriptorString(
    targetDescriptor.rootKind || targetDescriptor.videoKind,
  );

  const expectedRootAuthor = normalizeDescriptorString(
    targetDescriptor.rootAuthorPubkey || targetDescriptor.videoAuthorPubkey,
  );

  const expectedParentKind = normalizeDescriptorString(targetDescriptor.parentKind);

  const expectedParentAuthor = normalizeDescriptorString(
    targetDescriptor.parentAuthorPubkey,
  );

  const kindTagValues = [];
  const authorTagValues = [];

  for (const tag of tags) {
    if (!Array.isArray(tag) || tag.length < 2) {
      continue;
    }
    const [rawName, rawValue] = tag;
    const trimmedName = typeof rawName === "string" ? rawName.trim() : "";
    const upperName = trimmedName.toUpperCase();
    const normalizedValue = normalizeTagValue(rawValue);
    if (!upperName || !normalizedValue) {
      continue;
    }

    if (upperName === "I") {
      if (
        normalizedRootIdentifier &&
        normalizedValue === normalizedRootIdentifier
      ) {
        hasIdentifierTag = true;
      }
    } else if (upperName === "A") {
      if (
        normalizedVideoDefinitionAddress &&
        normalizedValue === normalizedVideoDefinitionAddress
      ) {
        hasDefinitionTag = true;
        matchedDefinitionPointer = true;
      }
    } else if (upperName === "E") {
      if (
        normalizedVideoEventId &&
        normalizedValue === normalizedVideoEventId
      ) {
        hasEventTag = true;
        matchedEventPointer = true;
      }
      if (
        normalizedParentCommentId &&
        normalizedValue === normalizedParentCommentId
      ) {
        hasParentTag = true;
      }
    } else if (upperName === "K") {
      kindTagValues.push(normalizedValue);
    } else if (upperName === "P") {
      authorTagValues.push(normalizedValue);
    }
  }

  const sawRootKindTag = kindTagValues.length > 0 && Boolean(expectedRootKind);
  const sawRootAuthorTag = authorTagValues.length > 0 && Boolean(expectedRootAuthor);
  const sawParentKindTag = kindTagValues.length > 0 && Boolean(expectedParentKind);
  const sawParentAuthorTag =
    authorTagValues.length > 0 && Boolean(expectedParentAuthor);

  const rootKindMatches =
    !expectedRootKind || kindTagValues.includes(expectedRootKind);
  const rootAuthorMatches =
    !expectedRootAuthor || authorTagValues.includes(expectedRootAuthor);
  const parentKindMatches =
    !expectedParentKind || kindTagValues.includes(expectedParentKind);
  const parentAuthorMatches =
    !expectedParentAuthor || authorTagValues.includes(expectedParentAuthor);

  if (!hasDefinitionTag && requiresAddressMatch && matchedEventPointer) {
    hasDefinitionTag = true;
  }

  if (!hasIdentifierTag && requiresRootIdentifierMatch) {
    if (matchedDefinitionPointer || matchedEventPointer) {
      devLogger.debug(
        "[nostr] Comment accepted without explicit identifier tag due to pointer match",
        {
          eventId: event?.id,
          matchedDefinitionPointer,
          matchedEventPointer,
        },
      );
      hasIdentifierTag = true;
    }
  }

  if (!hasIdentifierTag || !hasDefinitionTag || !hasEventTag) {
    if (matchedEventPointer && (!requiresParentTag || hasParentTag)) {
      devLogger.debug(
        "[nostr] Comment accepted via legacy pointer fallback",
        {
          eventId: event?.id,
          hasIdentifierTag,
          hasDefinitionTag,
          hasEventTag,
          requiresParentTag,
          hasParentTag,
        },
      );
      hasIdentifierTag = true;
      hasDefinitionTag = true;
      hasEventTag = true;
    } else {
      return false;
    }
  }

  if (requiresParentTag && !hasParentTag) {
    return false;
  }

  if (sawRootKindTag && expectedRootKind && !rootKindMatches) {
    return false;
  }

  if (sawRootAuthorTag && expectedRootAuthor && !rootAuthorMatches) {
    return false;
  }

  if (sawParentKindTag && expectedParentKind && !parentKindMatches) {
    return false;
  }

  if (sawParentAuthorTag && expectedParentAuthor && !parentAuthorMatches) {
    return false;
  }

  return true;
}

export async function publishComment(
  client,
  targetInput,
  options = {},
  {
    resolveActiveSigner,
    shouldRequestExtensionPermissions,
    DEFAULT_NIP07_PERMISSION_METHODS,
  } = {},
) {
  if (!client?.pool) {
    return { ok: false, error: "nostr-uninitialized" };
  }

  if (isSessionActor(client)) {
    const error = new Error(
      "Publishing comments is not allowed for session actors."
    );
    error.code = "session-actor-publish-blocked";
    return { ok: false, error };
  }

  const descriptor = normalizeCommentTarget(targetInput, options);
  if (!descriptor) {
    return { ok: false, error: "invalid-target" };
  }

  const actorPubkey =
    typeof client?.pubkey === "string" && client.pubkey.trim()
      ? client.pubkey.trim()
      : "";
  if (!actorPubkey) {
    return { ok: false, error: "auth-required" };
  }

  const createdAt =
    typeof options.created_at === "number" && options.created_at > 0
      ? Math.floor(options.created_at)
      : Math.floor(Date.now() / 1000);

  const additionalTags = sanitizeAdditionalTags(options.additionalTags);

  let content = "";
  if (typeof options.content === "string") {
    content = options.content;
  } else if (
    options.content &&
    typeof options.content === "object" &&
    !Array.isArray(options.content)
  ) {
    try {
      content = JSON.stringify(options.content);
    } catch (error) {
      devLogger.warn("[nostr] Failed to serialize comment content:", error);
      content = "";
    }
  } else if (options.content !== undefined && options.content !== null) {
    content = String(options.content);
  }

  const event = buildCommentEvent({
    pubkey: actorPubkey,
    created_at: createdAt,
    videoEventId: descriptor.videoEventId,
    videoEventRelay: descriptor.videoEventRelay,
    videoDefinitionAddress: descriptor.videoDefinitionAddress,
    videoDefinitionRelay: descriptor.videoDefinitionRelay,
    rootIdentifier: descriptor.rootIdentifier,
    rootIdentifierRelay: descriptor.rootIdentifierRelay,
    parentCommentId: descriptor.parentCommentId,
    parentCommentRelay: descriptor.parentCommentRelay,
    threadParticipantPubkey: descriptor.threadParticipantPubkey,
    threadParticipantRelay: descriptor.threadParticipantRelay,
    rootKind: descriptor.rootKind,
    rootAuthorPubkey: descriptor.rootAuthorPubkey,
    rootAuthorRelay: descriptor.rootAuthorRelay,
    parentKind: descriptor.parentKind,
    parentAuthorPubkey: descriptor.parentAuthorPubkey,
    parentAuthorRelay: descriptor.parentAuthorRelay,
    parentIdentifier: descriptor.parentIdentifier,
    parentIdentifierRelay: descriptor.parentIdentifierRelay,
    additionalTags,
    content,
  });

  let signedEvent = null;

  const resolveSignerFn =
    typeof resolveActiveSigner === "function" ? resolveActiveSigner : null;
  const signer = resolveSignerFn ? resolveSignerFn(actorPubkey) : null;

  if (!signer || typeof signer.signEvent !== "function") {
    return { ok: false, error: "auth-required" };
  }

  let permissionResult = { ok: true };
  const shouldRequestPermissions =
    typeof shouldRequestExtensionPermissions === "function"
      ? shouldRequestExtensionPermissions(signer)
      : false;

  if (shouldRequestPermissions) {
    permissionResult = await client.ensureExtensionPermissions(
      DEFAULT_NIP07_PERMISSION_METHODS,
    );
  }

  if (!permissionResult.ok) {
    userLogger.warn(
      "[nostr] Active signer permissions missing; comment publish requires login.",
      permissionResult.error,
    );
    return {
      ok: false,
      error: "auth-required",
      details: permissionResult,
    };
  }

  try {
    signedEvent = await signer.signEvent(event);
  } catch (error) {
    userLogger.warn(
      "[nostr] Failed to sign comment event with active signer:",
      error,
    );
    return { ok: false, error: "signing-failed", details: error };
  }

  const relayList = sanitizeRelayList(options.relays, client.relays);

  const publishResults = await Promise.all(
    relayList.map((url) => publishEventToRelay(client.pool, url, signedEvent)),
  );

  const acceptedRelays = publishResults
    .filter((result) => result.success)
    .map((result) => result.url)
    .filter((url) => typeof url === "string" && url);

  const success = acceptedRelays.length > 0;

  if (success) {
    devLogger.info(
      `[nostr] Comment event accepted by ${acceptedRelays.length} relay(s):`,
      acceptedRelays.join(", "),
    );
  } else {
    userLogger.warn("[nostr] Comment event rejected by relays:", publishResults);
  }

  return {
    ok: success,
    event: signedEvent,
    results: publishResults,
    acceptedRelays,
  };
}

export async function listVideoComments(client, targetInput, options = {}) {
  let pool = client?.pool;
  const ensurePool =
    typeof client?.ensurePool === "function"
      ? client.ensurePool.bind(client)
      : null;

  if (!pool || typeof pool.list !== "function") {
    if (ensurePool) {
      try {
        pool = await ensurePool();
      } catch (error) {
        devLogger.warn(
          "[nostr] Unable to list video comments: pool init failed.",
          error,
        );
        return [];
      }
    }
  }

  if (!pool || typeof pool.list !== "function") {
    devLogger.warn("[nostr] Unable to list video comments: pool missing.");
    return [];
  }

  let descriptor;
  let filterTemplate;
  try {
    // createVideoCommentFilters returns { descriptor, filters: [...] }
    const result = createVideoCommentFilters(targetInput, options);
    descriptor = result.descriptor;
    // We assume the first filter is the primary one we want to augment with 'since'
    // or use in per-relay logic. For now, we use the full array.
    filterTemplate = result.filters;
  } catch (error) {
    devLogger.warn("[nostr] Failed to build comment filters:", error);
    return [];
  }

  const cacheKey = descriptor.videoEventId;
  const cached = commentCache.get(cacheKey);
  const ttl = CACHE_POLICY.ttl;
  const now = Date.now();
  const forceRefresh = options?.forceRefresh === true;

  if (cached && !forceRefresh && (now - cached.fetchedAt < ttl)) {
    devLogger.debug(`[nostr] Comments cache hit for ${cacheKey}`);
    return cached.items;
  }

  if (cached) {
    devLogger.debug(`[nostr] Comments cache stale for ${cacheKey}, refreshing...`);
  } else {
    devLogger.debug(`[nostr] Comments cache miss for ${cacheKey}`);
  }

  const relayList = sanitizeRelayList(options.relays, client.relays);
  const lastSeens = cached?.lastSeenPerRelay || {};
  const mergedLastSeens = { ...lastSeens };

  const rawResults = [];

  // Parallel fetch from relays with incremental logic
  await Promise.all(
    relayList.map(async (url) => {
      if (!url) return;
      const lastSeen = lastSeens[url] || 0;
      // Deep clone filters to apply 'since' safely per relay
      const relayFilters = filterTemplate.map(f => {
        const copy = { ...f };
        if (lastSeen > 0) {
          copy.since = lastSeen + 1;
        }
        return copy;
      });

      try {
        const events = await pool.list([url], relayFilters);
        let maxCreated = lastSeen;
        if (Array.isArray(events)) {
          for (const ev of events) {
            rawResults.push(ev);
            if (ev.created_at > maxCreated) {
              maxCreated = ev.created_at;
            }
          }
        }
        if (maxCreated > lastSeen) {
          mergedLastSeens[url] = maxCreated;
        }
      } catch (err) {
        devLogger.warn(`[nostr] Failed to fetch comments from ${url}:`, err);
      }
    })
  );

  // If we have cached items, add them to the raw list for deduplication/merging
  const combinedRaw = cached ? [...cached.items, ...rawResults] : rawResults;
  const flattened = flattenListResults(combinedRaw);
  const dedupe = new Map();
  const order = [];

  for (const event of flattened) {
    if (!isVideoCommentEvent(event, descriptor)) {
      continue;
    }

    const eventId = typeof event.id === "string" ? event.id : null;
    if (!eventId) {
      order.push({ type: "raw", event });
      continue;
    }

    const existing = dedupe.get(eventId);
    if (!existing) {
      dedupe.set(eventId, event);
      order.push({ type: "id", key: eventId });
      continue;
    }

    const existingCreated = Number.isFinite(existing?.created_at)
      ? existing.created_at
      : 0;
    const incomingCreated = Number.isFinite(event.created_at)
      ? event.created_at
      : 0;
    if (incomingCreated > existingCreated) {
      dedupe.set(eventId, event);
    }
  }

  const finalItems = order
    .map((entry) => {
      if (!entry) {
        return null;
      }
      if (entry.type === "raw") {
        return entry.event || null;
      }
      if (entry.type === "id") {
        return dedupe.get(entry.key) || null;
      }
      return null;
    })
    .filter(Boolean);

  // Update cache
  if (cacheKey) {
    commentCache.set(cacheKey, {
      items: finalItems,
      lastSeenPerRelay: mergedLastSeens,
      fetchedAt: Date.now()
    });
  }

  return finalItems;
}

export function subscribeVideoComments(client, targetInput, options = {}) {
  const ensurePool =
    typeof client?.ensurePool === "function"
      ? client.ensurePool.bind(client)
      : null;

  let descriptor;
  let filters;
  try {
    ({ descriptor, filters } = createVideoCommentFilters(targetInput, options));
  } catch (error) {
    devLogger.warn("[nostr] Failed to build comment subscription filters:", error);
    return () => {};
  }

  const relayList = sanitizeRelayList(options.relays, client.relays);
  const onEvent = typeof options.onEvent === "function" ? options.onEvent : null;

  let activeSubscription = null;
  let unsubscribed = false;

  const ensureSubscription = async () => {
    let pool = client?.pool;
    if (!pool || typeof pool.sub !== "function") {
      if (!ensurePool) {
        devLogger.warn(
          "[nostr] Unable to subscribe to video comments: pool missing.",
        );
        return null;
      }
      try {
        pool = await ensurePool();
      } catch (error) {
        devLogger.warn(
          "[nostr] Unable to subscribe to video comments: pool init failed.",
          error,
        );
        return null;
      }
    }

    if (!pool || typeof pool.sub !== "function") {
      devLogger.warn(
        "[nostr] Unable to subscribe to video comments: pool missing.",
      );
      return null;
    }

    try {
      const subscription = pool.sub(relayList, filters);
      if (unsubscribed) {
        try {
          subscription?.unsub?.();
        } catch (error) {
          devLogger.warn(
            "[nostr] Failed to unsubscribe from video comments:",
            error,
          );
        }
        return null;
      }

      if (onEvent && subscription && typeof subscription.on === "function") {
        try {
          subscription.on("event", (event) => {
            if (isVideoCommentEvent(event, descriptor)) {
              try {
                onEvent(event);
              } catch (handlerError) {
                devLogger.warn(
                  "[nostr] Comment subscription handler threw:",
                  handlerError,
                );
              }
            }
          });
        } catch (error) {
          devLogger.warn(
            "[nostr] Failed to attach comment subscription handler:",
            error,
          );
        }
      }

      return subscription;
    } catch (error) {
      devLogger.warn("[nostr] Failed to open video comment subscription:", error);
      return null;
    }
  };

  const subscriptionPromise = ensureSubscription().then((subscription) => {
    activeSubscription = subscription;
    return subscription;
  });

  return () => {
    if (unsubscribed) {
      return;
    }
    unsubscribed = true;

    const teardown = (subscription) => {
      if (subscription && typeof subscription.unsub === "function") {
        try {
          subscription.unsub();
        } catch (error) {
          devLogger.warn(
            "[nostr] Failed to unsubscribe from video comments:",
            error,
          );
        }
      }
    };

    if (activeSubscription) {
      teardown(activeSubscription);
    } else {
      subscriptionPromise.finally(() => {
        teardown(activeSubscription);
      });
    }
  };
}

export const __testExports = {
  normalizeCommentTarget,
  createVideoCommentFilters,
  isVideoCommentEvent,
};
