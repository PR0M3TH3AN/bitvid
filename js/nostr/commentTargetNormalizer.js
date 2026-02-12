import {
  getNostrEventSchema,
  NOTE_TYPES,
} from "../nostrEventSchemas.js";
import { normalizePointerInput } from "./watchHistory.js";
import { devLogger } from "../utils/logger.js";

const COMMENT_EVENT_SCHEMA = getNostrEventSchema(NOTE_TYPES.VIDEO_COMMENT);
export const COMMENT_EVENT_KIND = Number.isFinite(COMMENT_EVENT_SCHEMA?.kind)
  ? COMMENT_EVENT_SCHEMA.kind
  : 1111;
export const LEGACY_COMMENT_KIND = 1;
const ALLOWED_COMMENT_KINDS = Object.freeze(
  COMMENT_EVENT_KIND === LEGACY_COMMENT_KIND
    ? [COMMENT_EVENT_KIND]
    : [COMMENT_EVENT_KIND, LEGACY_COMMENT_KIND]
);

export function getAllowedCommentKinds() {
  return ALLOWED_COMMENT_KINDS.slice();
}

export function normalizeRelay(candidate) {
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

export function normalizePointerCandidate(candidate, expectedType) {
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

export function normalizeTagName(name) {
  return typeof name === "string" ? name.trim().toLowerCase() : "";
}

export function normalizeTagValue(value) {
  if (value == null) return "";
  if (Number.isFinite(value)) return String(Math.floor(value));
  return typeof value === "string" ? (value.trim().toLowerCase() || "") : "";
}

export function normalizeDescriptorString(value) {
  if (value == null) return "";
  if (Number.isFinite(value)) return String(Math.floor(value));
  if (typeof value === "string") return value.trim().toLowerCase() || "";
  if (typeof value === "object" && value.value !== undefined) {
    return normalizeDescriptorString(value.value);
  }
  return "";
}

export function normalizeDescriptorRelay(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function pickString(...candidates) {
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim();
  }
  return "";
}

export function pickKind(...candidates) {
  for (const c of candidates) {
    if (Number.isFinite(c)) return String(Math.floor(c));
    if (typeof c === "string" && c.trim()) return c.trim();
  }
  return "";
}

export function isEventCandidate(candidate) {
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

export function resolveEventCandidate(...candidates) {
  for (const candidate of candidates) {
    if (isEventCandidate(candidate)) {
      return candidate;
    }
  }
  return null;
}

export function collectTagsFromEvent(event) {
  if (!event || typeof event !== "object") {
    return [];
  }
  const tags = Array.isArray(event.tags) ? event.tags : [];
  return tags.filter((tag) => Array.isArray(tag) && tag.length >= 2);
}

export function findTagByName(tags, ...names) {
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

export class CommentTargetNormalizer {
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

export function normalizeCommentTarget(targetInput = {}, overrides = {}) {
  return new CommentTargetNormalizer(targetInput, overrides).normalize();
}

export function isVideoCommentEvent(event, descriptor) {
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
