import {
  buildCommentEvent,
  getNostrEventSchema,
  NOTE_TYPES,
} from "../nostrEventSchemas.js";
import { publishEventToRelay } from "../nostrPublish.js";
import { RELAY_URLS } from "./toolkit.js";
import { normalizePointerInput } from "./watchHistory.js";
import { devLogger, userLogger } from "../utils/logger.js";

const COMMENT_EVENT_SCHEMA = getNostrEventSchema(NOTE_TYPES.VIDEO_COMMENT);
export const COMMENT_EVENT_KIND = Number.isFinite(COMMENT_EVENT_SCHEMA?.kind)
  ? COMMENT_EVENT_SCHEMA.kind
  : 1111;

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
    .map((name) => (typeof name === "string" ? name.trim() : ""))
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
    if (normalizedNames.includes(name.trim())) {
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

  if (!normalizedVideoEventId) {
    return null;
  }

  return {
    videoEventId: normalizedVideoEventId,
    videoEventRelay: normalizedVideoEventRelay,
    videoDefinitionAddress: normalizedVideoDefinitionAddress,
    videoDefinitionRelay: normalizedVideoDefinitionRelay,
    videoKind: normalizedVideoKind,
    videoAuthorPubkey: normalizedVideoAuthorPubkey,
    parentCommentId: normalizedParentCommentId,
    parentCommentRelay: normalizedParentCommentRelay,
    threadParticipantPubkey: normalizedThreadParticipantPubkey,
    threadParticipantRelay: normalizedThreadParticipantRelay,
    rootIdentifier: normalizedRootIdentifier,
    rootIdentifierRelay: normalizedRootIdentifierRelay,
    parentIdentifier: normalizedParentIdentifier,
    parentIdentifierRelay: normalizedParentIdentifierRelay,
    rootKind: normalizedRootKind,
    rootAuthorPubkey: normalizedRootAuthorPubkey,
    rootAuthorRelay: normalizedRootAuthorRelay,
    parentKind: normalizedParentKind,
    parentAuthorPubkey: normalizedParentAuthorPubkey,
    parentAuthorRelay: normalizedParentAuthorRelay,
  };
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
    kinds: [COMMENT_EVENT_KIND],
    "#e": [descriptor.videoEventId],
  };
  filters.push(applyFilterOptions(eventFilter, options));

  const uppercaseFilter = { kinds: [COMMENT_EVENT_KIND] };
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

  const normalizedRootKind =
    typeof descriptor.rootKind === "string"
      ? descriptor.rootKind
      : Number.isFinite(descriptor.rootKind)
      ? String(Math.floor(descriptor.rootKind))
      : "";
  if (normalizedRootKind) {
    uppercaseFilter["#K"] = [normalizedRootKind];
  }

  const normalizedRootAuthor =
    typeof descriptor.rootAuthorPubkey === "string"
      ? descriptor.rootAuthorPubkey.trim()
      : "";
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
    const parentFilter = {
      kinds: [COMMENT_EVENT_KIND],
      "#e": [descriptor.parentCommentId],
    };
    filters.push(applyFilterOptions(parentFilter, options));
  }

  if (descriptor.videoDefinitionAddress) {
    const definitionFilter = {
      kinds: [COMMENT_EVENT_KIND],
      "#a": [descriptor.videoDefinitionAddress],
    };

    if (descriptor.parentCommentId) {
      definitionFilter["#e"] = [descriptor.parentCommentId];
    }

    filters.push(applyFilterOptions(definitionFilter, options));
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

  if (Number(event.kind) !== COMMENT_EVENT_KIND) {
    return false;
  }

  const targetDescriptor =
    descriptor && typeof descriptor === "object" ? descriptor : {};

  const tags = Array.isArray(event.tags) ? event.tags : [];
  const requiresRootIdentifierMatch = Boolean(targetDescriptor.rootIdentifier);
  const requiresAddressMatch =
    !requiresRootIdentifierMatch && Boolean(targetDescriptor.videoDefinitionAddress);
  const requiresEventMatch =
    !requiresRootIdentifierMatch && !requiresAddressMatch &&
    Boolean(targetDescriptor.videoEventId);
  const requiresParentTag = Boolean(targetDescriptor.parentCommentId);

  let hasIdentifierTag = !requiresRootIdentifierMatch;
  let hasDefinitionTag = !requiresAddressMatch;
  let hasEventTag = !requiresEventMatch;
  let hasParentTag = !requiresParentTag;

  const expectedRootKind = (() => {
    if (typeof targetDescriptor.rootKind === "string") {
      return targetDescriptor.rootKind;
    }
    if (Number.isFinite(targetDescriptor.rootKind)) {
      return String(Math.floor(targetDescriptor.rootKind));
    }
    if (typeof targetDescriptor.videoKind === "string") {
      return targetDescriptor.videoKind;
    }
    if (Number.isFinite(targetDescriptor.videoKind)) {
      return String(Math.floor(targetDescriptor.videoKind));
    }
    return "";
  })();

  const expectedRootAuthor =
    typeof targetDescriptor.rootAuthorPubkey === "string"
      ? targetDescriptor.rootAuthorPubkey
      : typeof targetDescriptor.videoAuthorPubkey === "string"
      ? targetDescriptor.videoAuthorPubkey
      : "";

  const expectedParentKind = (() => {
    if (typeof targetDescriptor.parentKind === "string") {
      return targetDescriptor.parentKind;
    }
    if (Number.isFinite(targetDescriptor.parentKind)) {
      return String(Math.floor(targetDescriptor.parentKind));
    }
    return "";
  })();

  const expectedParentAuthor =
    typeof targetDescriptor.parentAuthorPubkey === "string"
      ? targetDescriptor.parentAuthorPubkey
      : "";

  let sawRootKindTag = false;
  let rootKindMatches = !expectedRootKind;
  let rootKindMismatch = false;

  let sawRootAuthorTag = false;
  let rootAuthorMatches = !expectedRootAuthor;
  let rootAuthorMismatch = false;

  let sawParentKindTag = false;
  let parentKindMatches = !expectedParentKind;
  let parentKindMismatch = false;

  let sawParentAuthorTag = false;
  let parentAuthorMatches = !expectedParentAuthor;
  let parentAuthorMismatch = false;

  for (const tag of tags) {
    if (!Array.isArray(tag) || tag.length < 2) {
      continue;
    }
    const [name, value] = tag;
    if (typeof value !== "string") {
      continue;
    }

    if (name === "I") {
      if (value === targetDescriptor.rootIdentifier) {
        hasIdentifierTag = true;
      }
    } else if (name === "A") {
      if (value === targetDescriptor.videoDefinitionAddress) {
        hasDefinitionTag = true;
      }
    } else if (name === "a") {
      if (value === targetDescriptor.videoDefinitionAddress) {
        hasDefinitionTag = true;
      }
    } else if (name === "E") {
      if (value === targetDescriptor.videoEventId) {
        hasEventTag = true;
      }
    } else if (name === "e") {
      if (value === targetDescriptor.videoEventId) {
        hasEventTag = true;
      }
      if (
        targetDescriptor.parentCommentId &&
        value === targetDescriptor.parentCommentId
      ) {
        hasParentTag = true;
      }
    } else if (name === "K") {
      sawRootKindTag = true;
      if (!expectedRootKind || value === expectedRootKind) {
        rootKindMatches = true;
      } else {
        rootKindMismatch = true;
      }
    } else if (name === "P") {
      sawRootAuthorTag = true;
      if (!expectedRootAuthor || value === expectedRootAuthor) {
        rootAuthorMatches = true;
      } else {
        rootAuthorMismatch = true;
      }
    } else if (name === "k") {
      sawParentKindTag = true;
      if (!expectedParentKind || value === expectedParentKind) {
        parentKindMatches = true;
      } else {
        parentKindMismatch = true;
      }
    } else if (name === "p") {
      sawParentAuthorTag = true;
      if (!expectedParentAuthor || value === expectedParentAuthor) {
        parentAuthorMatches = true;
      } else {
        parentAuthorMismatch = true;
      }
    }
  }

  if (!hasIdentifierTag || !hasDefinitionTag || !hasEventTag || !hasParentTag) {
    return false;
  }

  if ((sawRootKindTag && rootKindMismatch) || (sawRootAuthorTag && rootAuthorMismatch)) {
    return false;
  }

  if ((sawParentKindTag && parentKindMismatch) || (sawParentAuthorTag && parentAuthorMismatch)) {
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
    signEventWithPrivateKey,
    DEFAULT_NIP07_PERMISSION_METHODS,
  } = {},
) {
  if (!client?.pool) {
    return { ok: false, error: "nostr-uninitialized" };
  }

  const descriptor = normalizeCommentTarget(targetInput, options);
  if (!descriptor) {
    return { ok: false, error: "invalid-target" };
  }

  const actorPubkey = await client.ensureSessionActor();
  if (!actorPubkey) {
    return { ok: false, error: "missing-actor" };
  }

  const createdAt =
    typeof options.created_at === "number" && options.created_at > 0
      ? Math.floor(options.created_at)
      : Math.floor(Date.now() / 1000);

  const additionalTags = Array.isArray(options.additionalTags)
    ? options.additionalTags.filter(
        (tag) => Array.isArray(tag) && typeof tag[0] === "string",
      )
    : [];

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

  const normalizedActor =
    typeof actorPubkey === "string" ? actorPubkey.toLowerCase() : "";
  const normalizedLogged =
    typeof client.pubkey === "string" ? client.pubkey.toLowerCase() : "";

  const resolveSignerFn =
    typeof resolveActiveSigner === "function" ? resolveActiveSigner : null;
  const signer = resolveSignerFn ? resolveSignerFn(actorPubkey) : null;

  const canUseActiveSigner =
    normalizedActor &&
    normalizedActor === normalizedLogged &&
    signer &&
    typeof signer.signEvent === "function";

  if (canUseActiveSigner) {
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

    if (permissionResult.ok) {
      try {
        signedEvent = await signer.signEvent(event);
      } catch (error) {
        userLogger.warn(
          "[nostr] Failed to sign comment event with active signer:",
          error,
        );
        return { ok: false, error: "signing-failed", details: error };
      }
    } else {
      userLogger.warn(
        "[nostr] Active signer permissions missing; signing comment with session key.",
        permissionResult.error,
      );
    }
  }

  if (!signedEvent) {
    if (typeof signEventWithPrivateKey !== "function") {
      return { ok: false, error: "signing-unavailable" };
    }
    try {
      if (!client.sessionActor || client.sessionActor.pubkey !== actorPubkey) {
        await client.ensureSessionActor(true);
      }
      if (!client.sessionActor || client.sessionActor.pubkey !== actorPubkey) {
        throw new Error("session-actor-mismatch");
      }
      signedEvent = signEventWithPrivateKey(
        event,
        client.sessionActor.privateKey,
      );
    } catch (error) {
      userLogger.warn("[nostr] Failed to sign comment event with session key:", error);
      return { ok: false, error: "signing-failed", details: error };
    }
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
  const pool = client?.pool;
  const canQueryPool = pool && typeof pool.list === "function";

  if (!canQueryPool) {
    devLogger.warn("[nostr] Unable to list video comments: pool missing.");
    return [];
  }

  let descriptor;
  let filters;
  try {
    ({ descriptor, filters } = createVideoCommentFilters(targetInput, options));
  } catch (error) {
    devLogger.warn("[nostr] Failed to build comment filters:", error);
    return [];
  }

  const relayList = sanitizeRelayList(options.relays, client.relays);

  let rawResults;
  try {
    rawResults = await pool.list(relayList, filters);
  } catch (error) {
    devLogger.warn("[nostr] Failed to list video comments:", error);
    return [];
  }

  const flattened = flattenListResults(rawResults);
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

  return order
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
}

export function subscribeVideoComments(client, targetInput, options = {}) {
  const pool = client?.pool;
  const canSubscribe = pool && typeof pool.sub === "function";

  if (!canSubscribe) {
    devLogger.warn("[nostr] Unable to subscribe to video comments: pool missing.");
    return () => {};
  }

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

  let subscription;
  try {
    subscription = pool.sub(relayList, filters);
  } catch (error) {
    devLogger.warn("[nostr] Failed to open video comment subscription:", error);
    return () => {};
  }

  if (onEvent && subscription && typeof subscription.on === "function") {
    try {
      subscription.on("event", (event) => {
        if (isVideoCommentEvent(event, descriptor)) {
          try {
            onEvent(event);
          } catch (handlerError) {
            devLogger.warn("[nostr] Comment subscription handler threw:", handlerError);
          }
        }
      });
    } catch (error) {
      devLogger.warn("[nostr] Failed to attach comment subscription handler:", error);
    }
  }

  const originalUnsub =
    subscription && typeof subscription.unsub === "function"
      ? subscription.unsub.bind(subscription)
      : null;

  let unsubscribed = false;
  return () => {
    if (unsubscribed) {
      return;
    }
    unsubscribed = true;
    if (originalUnsub) {
      try {
        originalUnsub();
      } catch (error) {
        devLogger.warn("[nostr] Failed to unsubscribe from video comments:", error);
      }
    }
  };
}

export const __testExports = {
  normalizeCommentTarget,
  createVideoCommentFilters,
  isVideoCommentEvent,
};
