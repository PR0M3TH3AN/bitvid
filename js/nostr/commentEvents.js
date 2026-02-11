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
import { queueSignEvent } from "./signRequestQueue.js";
import { getActiveSigner } from "../nostrClientRegistry.js";
import { sanitizeRelayList as sanitizeRelayUrls } from "./nip46Client.js";

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
  const primaryList = sanitizeRelayUrls(Array.isArray(primary) ? primary : []);
  if (primaryList.length) {
    return primaryList;
  }
  const fallbackList = sanitizeRelayUrls(Array.isArray(fallback) ? fallback : []);
  if (fallbackList.length) {
    return fallbackList;
  }
  return sanitizeRelayUrls(RELAY_URLS);
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

class CommentTargetNormalizer {
  constructor(targetInput, overrides) {
    this.target = targetInput && typeof targetInput === "object" ? targetInput : {};
    this.options = overrides && typeof overrides === "object" ? overrides : {};

    // Pointers
    this.videoEventPointer = null;
    this.videoDefinitionPointer = null;
    this.rootDefinitionPointer = null;
    this.rootEventPointer = null;
    this.parentCommentPointer = null;

    // Events
    this.videoEventObject = null;
    this.parentCommentEvent = null;

    // Tags
    this.rootEventTags = [];
    this.parentEventTags = [];
    this.combinedTags = [];

    // Normalized Values
    this.normalizedVideoEventId = "";
    this.normalizedVideoEventRelay = "";
    this.normalizedVideoDefinitionAddress = "";
    this.normalizedVideoDefinitionRelay = "";
    this.normalizedParentCommentId = "";
    this.normalizedParentCommentRelay = "";
    this.normalizedThreadParticipantPubkey = "";
    this.normalizedThreadParticipantRelay = "";
    this.normalizedRootIdentifier = "";
    this.normalizedRootIdentifierRelay = "";
    this.normalizedParentIdentifier = "";
    this.normalizedParentIdentifierRelay = "";
    this.normalizedVideoKind = "";
    this.normalizedVideoAuthorPubkey = "";
    this.derivedDefinitionKind = "";
    this.derivedDefinitionPubkey = "";
    this.normalizedRootKind = "";
    this.normalizedParentKind = "";
    this.normalizedRootAuthorPubkey = "";
    this.normalizedParentAuthorPubkey = "";
    this.normalizedRootAuthorRelay = "";
    this.normalizedParentAuthorRelay = "";
  }

  normalize() {
    this.extractPointers();
    this.resolveEventsAndTags();
    this.extractInitialValues();
    this.enrichFromTags();
    this.applyDefaults();
    return this.getDescriptor();
  }

  extractPointers() {
    const { target, options } = this;
    this.videoEventPointer =
      normalizePointerCandidate(options.videoEventPointer, "e") ||
      normalizePointerCandidate(options.videoEvent, "e") ||
      normalizePointerCandidate(target.videoEventPointer, "e") ||
      normalizePointerCandidate(target.videoEvent, "e") ||
      normalizePointerCandidate(target.eventPointer, "e") ||
      normalizePointerCandidate(target.event, "e");

    this.videoDefinitionPointer =
      normalizePointerCandidate(options.videoDefinitionPointer, "a") ||
      normalizePointerCandidate(options.videoDefinition, "a") ||
      normalizePointerCandidate(target.videoDefinitionPointer, "a") ||
      normalizePointerCandidate(target.videoDefinition, "a") ||
      normalizePointerCandidate(target.definitionPointer, "a") ||
      normalizePointerCandidate(target.definition, "a");

    this.rootDefinitionPointer =
      normalizePointerCandidate(options.rootDefinitionPointer, "a") ||
      normalizePointerCandidate(options.rootPointer, "a") ||
      normalizePointerCandidate(target.rootDefinitionPointer, "a") ||
      normalizePointerCandidate(target.rootPointer, "a");

    this.rootEventPointer =
      normalizePointerCandidate(options.rootEventPointer, "e") ||
      normalizePointerCandidate(options.rootPointer, "e") ||
      normalizePointerCandidate(target.rootEventPointer, "e") ||
      normalizePointerCandidate(target.rootPointer, "e");

    this.parentCommentPointer =
      normalizePointerCandidate(options.parentCommentPointer, "e") ||
      normalizePointerCandidate(options.parentComment, "e") ||
      normalizePointerCandidate(target.parentCommentPointer, "e") ||
      normalizePointerCandidate(target.parentComment, "e") ||
      normalizePointerCandidate(target.parentPointer, "e");
  }

  resolveEventsAndTags() {
    const { target, options } = this;
    this.videoEventObject = resolveEventCandidate(
      options.videoEvent,
      options.rootEvent,
      target.videoEvent,
      target.rootEvent,
    );

    this.parentCommentEvent = resolveEventCandidate(
      options.parentCommentEvent,
      options.parentComment,
      target.parentCommentEvent,
      target.parentComment,
    );

    this.rootEventTags = collectTagsFromEvent(this.videoEventObject);
    this.parentEventTags = collectTagsFromEvent(this.parentCommentEvent);
    this.combinedTags = [...this.parentEventTags, ...this.rootEventTags];
  }

  extractInitialValues() {
    const { target, options } = this;

    const normalize = (val) => (typeof val === "string" ? val.trim() : "");

    this.normalizedVideoEventId = normalize(pickString(
      options.videoEventId,
      target.videoEventId,
      target.eventId,
      this.videoEventPointer?.value,
      this.rootEventPointer?.value,
    ));

    this.normalizedVideoEventRelay = normalize(pickString(
      options.videoEventRelay,
      target.videoEventRelay,
      target.eventRelay,
      this.videoEventPointer?.relay,
      this.rootEventPointer?.relay,
    ));

    this.normalizedVideoDefinitionAddress = normalize(pickString(
      options.videoDefinitionAddress,
      target.videoDefinitionAddress,
      target.definitionAddress,
      this.videoDefinitionPointer?.value,
      this.rootDefinitionPointer?.value,
    ));

    this.normalizedVideoDefinitionRelay = normalize(pickString(
      options.videoDefinitionRelay,
      target.videoDefinitionRelay,
      target.definitionRelay,
      this.videoDefinitionPointer?.relay,
      this.rootDefinitionPointer?.relay,
    ));

    this.normalizedParentCommentId = normalize(pickString(
      options.parentCommentId,
      target.parentCommentId,
      target.parentId,
      this.parentCommentPointer?.value,
    ));

    this.normalizedParentCommentRelay = normalize(pickString(
      options.parentCommentRelay,
      target.parentCommentRelay,
      target.parentRelay,
      this.parentCommentPointer?.relay,
    ));

    this.normalizedThreadParticipantPubkey = normalize(pickString(
      options.threadParticipantPubkey,
      target.threadParticipantPubkey,
      target.participantPubkey,
      target.authorPubkey,
    ));

    this.normalizedThreadParticipantRelay = normalize(pickString(
      options.threadParticipantRelay,
      target.threadParticipantRelay,
      target.participantRelay,
    ));

    this.normalizedRootIdentifier = normalize(pickString(
      options.rootIdentifier,
      target.rootIdentifier,
      options.rootPointer,
      target.rootPointer,
    ));

    this.normalizedRootIdentifierRelay = normalize(pickString(
      options.rootIdentifierRelay,
      target.rootIdentifierRelay,
    ));

    this.normalizedParentIdentifier = normalize(pickString(
      options.parentIdentifier,
      target.parentIdentifier,
    ));

    this.normalizedParentIdentifierRelay = normalize(pickString(
      options.parentIdentifierRelay,
      target.parentIdentifierRelay,
    ));

    this.normalizedVideoKind = pickKind(
      options.videoKind,
      target.videoKind,
      this.videoEventObject?.kind,
    );

    this.normalizedVideoAuthorPubkey = pickString(
      options.videoAuthorPubkey,
      target.videoAuthorPubkey,
      this.videoEventObject?.pubkey,
    );

    const definitionSegments = this.normalizedVideoDefinitionAddress
      ? this.normalizedVideoDefinitionAddress.split(":")
      : [];
    this.derivedDefinitionKind = definitionSegments[0] || "";
    this.derivedDefinitionPubkey = definitionSegments[1] || "";

    const rootKindCandidate = pickString(
      options.rootKind,
      target.rootKind,
      options.videoKind,
      target.videoKind,
      this.normalizedVideoKind,
      this.derivedDefinitionKind,
    );
    this.normalizedRootKind =
      typeof rootKindCandidate === "string" ? rootKindCandidate.trim() : "";

    const parentKindCandidate = pickString(
      options.parentKind,
      target.parentKind,
      options.parentCommentKind,
      target.parentCommentKind,
      pickKind(this.parentCommentEvent?.kind),
    );
    this.normalizedParentKind =
      typeof parentKindCandidate === "string" ? parentKindCandidate.trim() : "";

    let normalizedRootAuthorPubkey = pickString(
      options.rootAuthorPubkey,
      target.rootAuthorPubkey,
      options.videoAuthorPubkey,
      target.videoAuthorPubkey,
      this.normalizedVideoAuthorPubkey,
      this.derivedDefinitionPubkey,
    );
    this.normalizedRootAuthorPubkey =
      typeof normalizedRootAuthorPubkey === "string"
        ? normalizedRootAuthorPubkey.trim()
        : "";

    let normalizedParentAuthorPubkey = pickString(
      options.parentAuthorPubkey,
      target.parentAuthorPubkey,
      options.parentCommentPubkey,
      target.parentCommentPubkey,
      this.parentCommentEvent?.pubkey,
    );
    this.normalizedParentAuthorPubkey =
      typeof normalizedParentAuthorPubkey === "string"
        ? normalizedParentAuthorPubkey.trim()
        : "";

    let normalizedRootAuthorRelay = pickString(
      options.rootAuthorRelay,
      target.rootAuthorRelay,
    );
    this.normalizedRootAuthorRelay =
      typeof normalizedRootAuthorRelay === "string"
        ? normalizedRootAuthorRelay.trim()
        : "";

    let normalizedParentAuthorRelay = pickString(
      options.parentAuthorRelay,
      target.parentAuthorRelay,
    );
    this.normalizedParentAuthorRelay =
      typeof normalizedParentAuthorRelay === "string"
        ? normalizedParentAuthorRelay.trim()
        : "";
  }

  enrichFromTags() {
    const getTagField = (tag, index) =>
      Array.isArray(tag) && typeof tag[index] === "string"
        ? tag[index].trim()
        : "";

    if (!this.normalizedRootIdentifier) {
      const tag = findTagByName(this.combinedTags, "I");
      const value = getTagField(tag, 1);
      if (value) {
        this.normalizedRootIdentifier = value;
        const relay = getTagField(tag, 2);
        if (relay) {
          this.normalizedRootIdentifierRelay = relay;
        }
      }
    } else if (!this.normalizedRootIdentifierRelay) {
      const tag = findTagByName(this.combinedTags, "I");
      const relay = getTagField(tag, 2);
      if (relay) {
        this.normalizedRootIdentifierRelay = relay;
      }
    }

    if (!this.normalizedVideoDefinitionAddress) {
      const tag = findTagByName(this.combinedTags, "A", "a");
      const value = getTagField(tag, 1);
      if (value) {
        this.normalizedVideoDefinitionAddress = value;
        const relay = getTagField(tag, 2);
        if (relay) {
          this.normalizedVideoDefinitionRelay = relay;
        }
      }
    } else if (!this.normalizedVideoDefinitionRelay) {
      const tag = findTagByName(this.combinedTags, "A", "a");
      const relay = getTagField(tag, 2);
      if (relay) {
        this.normalizedVideoDefinitionRelay = relay;
      }
    }

    const rootEventTag = findTagByName(this.combinedTags, "E");
    if (rootEventTag) {
      const value = getTagField(rootEventTag, 1);
      if (value && !this.normalizedVideoEventId) {
        this.normalizedVideoEventId = value;
      }
      const relay = getTagField(rootEventTag, 2);
      if (relay && !this.normalizedVideoEventRelay) {
        this.normalizedVideoEventRelay = relay;
      }
      const authorHint = getTagField(rootEventTag, 3);
      if (authorHint && !this.normalizedRootAuthorPubkey) {
        this.normalizedRootAuthorPubkey = authorHint;
      }
    }

    if (!this.normalizedVideoEventId || !this.normalizedParentCommentId) {
      const eventValues = [];
      for (const tag of this.combinedTags) {
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
      if (!this.normalizedVideoEventId && eventValues.length) {
        this.normalizedVideoEventId = eventValues[0].value;
        const relay = getTagField(eventValues[0].tag, 2);
        if (relay && !this.normalizedVideoEventRelay) {
          this.normalizedVideoEventRelay = relay;
        }
      }
      if (!this.normalizedParentCommentId && eventValues.length) {
        for (let index = eventValues.length - 1; index >= 0; index -= 1) {
          const candidate = eventValues[index];
          if (
            candidate.value &&
            candidate.value !== this.normalizedVideoEventId
          ) {
            this.normalizedParentCommentId = candidate.value;
            const relay = getTagField(candidate.tag, 2);
            if (relay) {
              this.normalizedParentCommentRelay = relay;
            }
            const authorHint = getTagField(candidate.tag, 3);
            if (authorHint && !this.normalizedParentAuthorPubkey) {
              this.normalizedParentAuthorPubkey = authorHint;
            }
            break;
          }
        }
      }
    }

    if (this.normalizedParentCommentId && !this.normalizedParentCommentRelay) {
      const parentTag = this.parentEventTags.find(
        (tag) =>
          Array.isArray(tag) &&
          tag.length >= 2 &&
          typeof tag[0] === "string" &&
          tag[0].trim().toLowerCase() === "e" &&
          getTagField(tag, 1) === this.normalizedParentCommentId,
      );
      if (parentTag) {
        const relay = getTagField(parentTag, 2);
        if (relay) {
          this.normalizedParentCommentRelay = relay;
        }
        const authorHint = getTagField(parentTag, 3);
        if (authorHint && !this.normalizedParentAuthorPubkey) {
          this.normalizedParentAuthorPubkey = authorHint;
        }
      }
    }

    if (!this.normalizedParentIdentifierRelay) {
      const tag = findTagByName(this.parentEventTags, "i");
      const relay = getTagField(tag, 2);
      if (relay) {
        this.normalizedParentIdentifierRelay = relay;
      }
    }

    if (!this.normalizedRootKind) {
      const tag = findTagByName(this.combinedTags, "K");
      const value = getTagField(tag, 1);
      if (value) {
        this.normalizedRootKind = value;
      }
    }
    if (!this.normalizedVideoKind && this.normalizedRootKind) {
      this.normalizedVideoKind = this.normalizedRootKind;
    }

    if (!this.normalizedRootAuthorPubkey || !this.normalizedRootAuthorRelay) {
      const tag = findTagByName(this.combinedTags, "P");
      if (tag) {
        const value = getTagField(tag, 1);
        if (value && !this.normalizedRootAuthorPubkey) {
          this.normalizedRootAuthorPubkey = value;
        }
        const relay = getTagField(tag, 2);
        if (relay && !this.normalizedRootAuthorRelay) {
          this.normalizedRootAuthorRelay = relay;
        }
      }
    }
    if (!this.normalizedVideoAuthorPubkey && this.normalizedRootAuthorPubkey) {
      this.normalizedVideoAuthorPubkey = this.normalizedRootAuthorPubkey;
    }

    if (!this.normalizedParentKind) {
      const tag = findTagByName(this.parentEventTags, "k");
      const value = getTagField(tag, 1);
      if (value) {
        this.normalizedParentKind = value;
      }
    }

    if (!this.normalizedParentAuthorRelay && this.normalizedParentAuthorPubkey) {
      const parentTag = this.parentEventTags.find(
        (tag) =>
          Array.isArray(tag) &&
          tag.length >= 2 &&
          typeof tag[0] === "string" &&
          tag[0].trim().toLowerCase() === "p" &&
          normalizeTagValue(tag[1]) === normalizeTagValue(this.normalizedParentAuthorPubkey),
      );
      if (parentTag) {
        const relay = getTagField(parentTag, 2);
        if (relay) {
          this.normalizedParentAuthorRelay = relay;
        }
      }
    }

    if (!this.normalizedParentAuthorPubkey || !this.normalizedParentAuthorRelay) {
      const tag = findTagByName(this.parentEventTags, "p");
      if (tag) {
        const value = getTagField(tag, 1);
        if (value && !this.normalizedParentAuthorPubkey) {
          this.normalizedParentAuthorPubkey = value;
        }
        const relay = getTagField(tag, 2);
        if (relay && !this.normalizedParentAuthorRelay) {
          this.normalizedParentAuthorRelay = relay;
        }
      }
    }
  }

  applyDefaults() {
    if (!this.normalizedParentKind) {
      if (this.normalizedParentCommentId) {
        this.normalizedParentKind = String(COMMENT_EVENT_KIND);
      } else if (this.normalizedRootKind) {
        this.normalizedParentKind = this.normalizedRootKind;
      } else if (this.derivedDefinitionKind) {
        this.normalizedParentKind = this.derivedDefinitionKind;
      }
    }

    if (!this.normalizedRootKind) {
      this.normalizedRootKind = this.normalizedParentKind;
    }

    if (!this.normalizedParentAuthorPubkey) {
      this.normalizedParentAuthorPubkey = this.normalizedThreadParticipantPubkey;
    }

    if (!this.normalizedRootAuthorPubkey) {
      if (!this.normalizedParentCommentId && this.normalizedParentAuthorPubkey) {
        this.normalizedRootAuthorPubkey = this.normalizedParentAuthorPubkey;
      }
    }

    if (!this.normalizedRootAuthorRelay && this.normalizedVideoDefinitionRelay) {
      this.normalizedRootAuthorRelay = this.normalizedVideoDefinitionRelay;
    }

    if (!this.normalizedParentAuthorRelay) {
      this.normalizedParentAuthorRelay = this.normalizedThreadParticipantRelay;
    }

    if (!this.normalizedRootAuthorRelay && !this.normalizedParentCommentId) {
      this.normalizedRootAuthorRelay = this.normalizedParentAuthorRelay;
    }

    if (!this.normalizedRootAuthorPubkey && this.derivedDefinitionPubkey) {
      this.normalizedRootAuthorPubkey = this.derivedDefinitionPubkey;
    }

    if (!this.normalizedParentAuthorPubkey && !this.normalizedParentCommentId) {
      this.normalizedParentAuthorPubkey = this.normalizedRootAuthorPubkey;
    }

    if (!this.normalizedParentAuthorRelay && !this.normalizedParentCommentId) {
      this.normalizedParentAuthorRelay = this.normalizedRootAuthorRelay;
    }
  }

  getDescriptor() {
    const descriptor = {
      videoEventId: normalizeDescriptorString(this.normalizedVideoEventId),
      videoEventRelay: normalizeDescriptorRelay(this.normalizedVideoEventRelay),
      videoDefinitionAddress: normalizeDescriptorString(this.normalizedVideoDefinitionAddress),
      videoDefinitionRelay: normalizeDescriptorRelay(this.normalizedVideoDefinitionRelay),
      videoKind: normalizeDescriptorString(this.normalizedVideoKind),
      videoAuthorPubkey: normalizeDescriptorString(this.normalizedVideoAuthorPubkey),
      parentCommentId: normalizeDescriptorString(this.normalizedParentCommentId),
      parentCommentRelay: normalizeDescriptorRelay(this.normalizedParentCommentRelay),
      threadParticipantPubkey: normalizeDescriptorString(this.normalizedThreadParticipantPubkey),
      threadParticipantRelay: normalizeDescriptorRelay(this.normalizedThreadParticipantRelay),
      rootIdentifier: normalizeDescriptorString(this.normalizedRootIdentifier),
      rootIdentifierRelay: normalizeDescriptorRelay(this.normalizedRootIdentifierRelay),
      parentIdentifier: normalizeDescriptorString(this.normalizedParentIdentifier),
      parentIdentifierRelay: normalizeDescriptorRelay(this.normalizedParentIdentifierRelay),
      rootKind: normalizeDescriptorString(this.normalizedRootKind),
      rootAuthorPubkey: normalizeDescriptorString(this.normalizedRootAuthorPubkey),
      rootAuthorRelay: normalizeDescriptorRelay(this.normalizedRootAuthorRelay),
      parentKind: normalizeDescriptorString(this.normalizedParentKind),
      parentAuthorPubkey: normalizeDescriptorString(this.normalizedParentAuthorPubkey),
      parentAuthorRelay: normalizeDescriptorRelay(this.normalizedParentAuthorRelay),
    };

    if (!descriptor.videoEventId) {
      return null;
    }

    return descriptor;
  }
}

function normalizeCommentTarget(targetInput = {}, overrides = {}) {
  return new CommentTargetNormalizer(targetInput, overrides).normalize();
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
    shouldRequestExtensionPermissions,
    DEFAULT_NIP07_PERMISSION_METHODS,
    resolveActiveSigner,
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
    return { ok: false, error: "session-actor-publish-blocked", details: error };
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

  const signer = resolveActiveSigner
    ? resolveActiveSigner()
    : getActiveSigner();

  if (!signer || typeof signer.signEvent !== "function") {
    const error = new Error(
      "Login required: an active signer is needed to publish comments."
    );
    error.code = "auth-required";
    return {
      ok: false,
      error: "auth-required",
      message: error.message,
      details: error,
    };
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
    signedEvent = await queueSignEvent(signer, event, {
      timeoutMs: options?.timeoutMs,
    });
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
    return cached.items.filter((event) =>
      isVideoCommentEvent(event, descriptor),
    );
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
  commentCache,
};
