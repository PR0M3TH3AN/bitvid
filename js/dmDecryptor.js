// js/dmDecryptor.js

import { normalizeActorKey } from "./nostr/watchHistory.js";

const HEX64_REGEX = /^[0-9a-f]{64}$/;

const SUPPORTED_KINDS = new Set([4, 1059]);

const GIFT_WRAP_KIND = 1059;

function cloneEvent(event) {
  if (!event || typeof event !== "object") {
    return null;
  }

  const cloned = { ...event };
  if (Array.isArray(event.tags)) {
    cloned.tags = event.tags.map((tag) =>
      Array.isArray(tag) ? [...tag] : tag,
    );
  }

  return cloned;
}

function normalizeHex(candidate) {
  if (typeof candidate !== "string") {
    return "";
  }

  const trimmed = candidate.trim().toLowerCase();
  if (!HEX64_REGEX.test(trimmed)) {
    return "";
  }

  return trimmed;
}

function normalizeScheme(scheme) {
  if (typeof scheme !== "string") {
    return "";
  }

  const normalized = scheme.trim().toLowerCase();
  if (!normalized) {
    return "";
  }

  if (normalized === "nip44_v2" || normalized === "nip44-v2") {
    return "nip44_v2";
  }
  if (normalized === "nip44" || normalized === "nip-44") {
    return "nip44";
  }
  if (normalized === "nip04" || normalized === "nip-04") {
    return "nip04";
  }
  return normalized;
}

function parseEncryptionHints(rawTags) {
  const tags = Array.isArray(rawTags) ? rawTags : [];
  const algorithms = [];

  for (const tag of tags) {
    if (!Array.isArray(tag) || tag.length < 2) {
      continue;
    }
    if (tag[0] !== "encrypted") {
      continue;
    }

    for (let index = 1; index < tag.length; index += 1) {
      const value = typeof tag[index] === "string" ? tag[index].trim() : "";
      if (!value) {
        continue;
      }

      const parts = value.split(/\s+/).filter(Boolean);
      for (const part of parts) {
        const normalized = normalizeScheme(part);
        if (normalized && !algorithms.includes(normalized)) {
          algorithms.push(normalized);
        }
      }
    }
  }

  return { algorithms };
}

function collectRelayHints(tag) {
  const hints = [];
  if (!Array.isArray(tag)) {
    return hints;
  }

  for (let index = 2; index < tag.length; index += 1) {
    const candidate = typeof tag[index] === "string" ? tag[index].trim() : "";
    if (candidate) {
      hints.push(candidate);
    }
  }

  return hints;
}

function collectRecipients(rawTags) {
  const tags = Array.isArray(rawTags) ? rawTags : [];
  const recipients = [];
  const seen = new Map();

  for (const tag of tags) {
    if (!Array.isArray(tag) || tag[0] !== "p") {
      continue;
    }

    const pubkey = normalizeHex(tag[1]);
    if (!pubkey) {
      continue;
    }

    const hints = collectRelayHints(tag);

    if (seen.has(pubkey)) {
      const existing = seen.get(pubkey);
      for (const hint of hints) {
        if (!existing.relayHints.includes(hint)) {
          existing.relayHints.push(hint);
        }
      }
      continue;
    }

    const recipient = {
      pubkey,
      relayHints: hints,
      role: "recipient",
    };
    seen.set(pubkey, recipient);
    recipients.push(recipient);
  }

  return recipients;
}

function ensureDecryptCandidates(rawCandidates) {
  if (!Array.isArray(rawCandidates)) {
    return [];
  }

  return rawCandidates
    .map((candidate) => {
      if (!candidate || typeof candidate !== "object") {
        return null;
      }

      const decrypt = candidate.decrypt;
      if (typeof decrypt !== "function") {
        return null;
      }

      const scheme = normalizeScheme(candidate.scheme) || "";
      const supportsGiftWrap = candidate.supportsGiftWrap === true || scheme.startsWith("nip44");
      const priority = Number.isFinite(candidate.priority) ? candidate.priority : 0;

      return {
        scheme: scheme || "",
        decrypt,
        priority,
        supportsGiftWrap,
        source: candidate.source || "",
      };
    })
    .filter(Boolean);
}

function orderDecryptors(candidates, hints, { preferGiftWrap = false } = {}) {
  if (!candidates.length) {
    return [];
  }

  const algorithms = Array.isArray(hints?.algorithms) ? hints.algorithms : [];
  const algorithmRanks = new Map();
  algorithms.forEach((algorithm, index) => {
    if (!algorithmRanks.has(algorithm)) {
      algorithmRanks.set(algorithm, index);
    }
  });

  const baseSchemeRank = (scheme) => {
    if (scheme === "nip44_v2" || scheme === "nip44") {
      return 0;
    }
    if (scheme === "nip04") {
      return 5;
    }
    return 10;
  };

  const desiredSchemeRank = (scheme) => {
    if (algorithmRanks.has(scheme)) {
      return algorithmRanks.get(scheme);
    }
    if (scheme === "nip44" && algorithmRanks.has("nip44_v2")) {
      return algorithmRanks.get("nip44_v2");
    }
    if (scheme === "nip44_v2" && algorithmRanks.has("nip44")) {
      return algorithmRanks.get("nip44");
    }
    return baseSchemeRank(scheme);
  };

  return [...candidates].sort((a, b) => {
    if (a.priority !== b.priority) {
      return a.priority - b.priority;
    }

    const aRank = desiredSchemeRank(a.scheme);
    const bRank = desiredSchemeRank(b.scheme);
    if (aRank !== bRank) {
      return aRank - bRank;
    }

    if (preferGiftWrap) {
      const aWrapScore = a.supportsGiftWrap ? 0 : 1;
      const bWrapScore = b.supportsGiftWrap ? 0 : 1;
      if (aWrapScore !== bWrapScore) {
        return aWrapScore - bWrapScore;
      }
    }

    return 0;
  });
}

function deriveDirection(actorPubkey, senderPubkey, recipients) {
  const normalizedActor = normalizeHex(actorPubkey);
  if (!normalizedActor) {
    return "unknown";
  }

  if (normalizedActor === normalizeHex(senderPubkey)) {
    return "outgoing";
  }

  if (Array.isArray(recipients)) {
    for (const recipient of recipients) {
      if (normalizeHex(recipient?.pubkey) === normalizedActor) {
        return "incoming";
      }
    }
  }

  return "unknown";
}

function buildDecryptResult({
  ok,
  event,
  message,
  plaintext,
  recipients,
  senderPubkey,
  actorPubkey,
  decryptor,
  scheme,
  envelope = null,
  errors = [],
}) {
  const timestampCandidates = [];
  if (message && Number.isFinite(message.created_at)) {
    timestampCandidates.push(message.created_at);
  }
  if (event && Number.isFinite(event.created_at)) {
    timestampCandidates.push(event.created_at);
  }
  const timestamp = timestampCandidates.length
    ? Math.max(...timestampCandidates)
    : Date.now() / 1000;

  return {
    ok,
    event: cloneEvent(event),
    message: message ? cloneEvent(message) : null,
    plaintext: typeof plaintext === "string" ? plaintext : null,
    recipients: Array.isArray(recipients) ? recipients : [],
    sender: senderPubkey
      ? {
          pubkey: senderPubkey,
          relayHints: [],
          role: "sender",
        }
      : null,
    actorPubkey: normalizeHex(actorPubkey),
    decryptor: decryptor
      ? {
          scheme: normalizeScheme(decryptor.scheme) || scheme || "",
          source: decryptor.source || "",
        }
      : { scheme: scheme || "", source: "" },
    scheme: normalizeScheme(scheme || decryptor?.scheme || ""),
    envelope,
    direction: deriveDirection(actorPubkey, senderPubkey, recipients),
    timestamp: Number.isFinite(timestamp) ? timestamp : Date.now() / 1000,
    errors,
  };
}

function parseEventJson(serialized, stage) {
  if (typeof serialized !== "string" || !serialized.trim()) {
    const error = new Error("Decrypted payload was empty.");
    error.code = "empty-payload";
    error.stage = stage;
    throw error;
  }

  try {
    const parsed = JSON.parse(serialized);
    if (!parsed || typeof parsed !== "object") {
      const error = new Error("Decrypted payload was not a valid JSON event.");
      error.code = "invalid-json";
      error.stage = stage;
      throw error;
    }
    return parsed;
  } catch (error) {
    const failure = new Error("Failed to parse decrypted payload as JSON.");
    failure.code = "json-parse-failed";
    failure.stage = stage;
    failure.cause = error;
    throw failure;
  }
}

async function decryptGiftWrap(event, decryptors, actorPubkey) {
  const ciphertext = typeof event?.content === "string" ? event.content : "";
  const wrapPubkey = normalizeHex(event?.pubkey);

  if (!ciphertext || !wrapPubkey) {
    return buildDecryptResult({
      ok: false,
      event,
      actorPubkey,
      errors: [
        {
          stage: "wrap",
          error: new Error("Gift wrap event is missing ciphertext or pubkey."),
        },
      ],
    });
  }

  const errors = [];

  for (const decryptor of decryptors) {
    try {
      const sealSerialized = await decryptor.decrypt(wrapPubkey, ciphertext, {
        event,
        stage: "wrap",
      });
      const seal = parseEventJson(sealSerialized, "wrap");

      const sealCiphertext = typeof seal?.content === "string" ? seal.content : "";
      const sealPubkey = normalizeHex(seal?.pubkey);
      if (!sealCiphertext || !sealPubkey) {
        const error = new Error(
          "Gift wrap seal is missing ciphertext or pubkey.",
        );
        error.code = "invalid-seal";
        error.stage = "seal";
        throw error;
      }

      const rumorSerialized = await decryptor.decrypt(sealPubkey, sealCiphertext, {
        event: seal,
        stage: "seal",
      });
      const rumor = parseEventJson(rumorSerialized, "rumor");

      const plaintext = typeof rumor?.content === "string" ? rumor.content : "";
      const senderPubkey = normalizeHex(rumor?.pubkey) || sealPubkey;
      const recipients = collectRecipients(rumor?.tags);

      return buildDecryptResult({
        ok: true,
        event,
        message: rumor,
        plaintext,
        recipients,
        senderPubkey,
        actorPubkey,
        decryptor,
        scheme: decryptor.scheme || "nip44",
        envelope: {
          wrap: cloneEvent(event),
          seal: cloneEvent(seal),
        },
      });
    } catch (error) {
      errors.push({
        scheme: decryptor.scheme || "",
        source: decryptor.source || "",
        stage: error?.stage || "wrap",
        error,
      });
    }
  }

  return buildDecryptResult({
    ok: false,
    event,
    actorPubkey,
    errors,
  });
}

async function decryptLegacyDm(event, decryptors, actorPubkey) {
  const ciphertext = typeof event?.content === "string" ? event.content : "";
  const senderPubkey = normalizeHex(event?.pubkey);
  const hints = parseEncryptionHints(event?.tags);

  if (!ciphertext || !senderPubkey) {
    return buildDecryptResult({
      ok: false,
      event,
      actorPubkey,
      errors: [
        {
          stage: "content",
          error: new Error("Direct message is missing ciphertext or pubkey."),
        },
      ],
    });
  }

  const ordered = orderDecryptors(decryptors, hints);
  const errors = [];

  for (const decryptor of ordered) {
    try {
      const plaintext = await decryptor.decrypt(senderPubkey, ciphertext, {
        event,
        stage: "content",
      });

      if (typeof plaintext === "string") {
        const recipients = collectRecipients(event?.tags);

        return buildDecryptResult({
          ok: true,
          event,
          message: {
            ...cloneEvent(event),
            content: plaintext,
          },
          plaintext,
          recipients,
          senderPubkey,
          actorPubkey,
          decryptor,
          scheme: decryptor.scheme || hints.algorithms?.[0] || "",
        });
      }
    } catch (error) {
      errors.push({
        scheme: decryptor.scheme || "",
        source: decryptor.source || "",
        stage: "content",
        error,
      });
    }
  }

  return buildDecryptResult({
    ok: false,
    event,
    actorPubkey,
    errors,
  });
}

export async function decryptDM(event, context = {}) {
  if (!event || typeof event !== "object") {
    return {
      ok: false,
      event: null,
      actorPubkey: normalizeHex(context?.actorPubkey),
      errors: [
        {
          stage: "input",
          error: new Error("A valid event is required for DM decryption."),
        },
      ],
    };
  }

  const kind = Number.isFinite(event.kind) ? event.kind : null;
  if (!SUPPORTED_KINDS.has(kind)) {
    return {
      ok: false,
      event: cloneEvent(event),
      actorPubkey: normalizeHex(context?.actorPubkey),
      errors: [
        {
          stage: "input",
          error: new Error("Unsupported DM event kind."),
        },
      ],
    };
  }

  const actorPubkey = normalizeActorKey(context?.actorPubkey);
  const decryptors = ensureDecryptCandidates(context?.decryptors);

  if (!decryptors.length) {
    return {
      ok: false,
      event: cloneEvent(event),
      actorPubkey,
      errors: [
        {
          stage: "decryptor",
          error: new Error("No decryptors are available for DM payloads."),
        },
      ],
    };
  }

  if (kind === GIFT_WRAP_KIND) {
    const giftWrapDecryptors = orderDecryptors(decryptors, null, {
      preferGiftWrap: true,
    }).filter((candidate) => candidate.supportsGiftWrap);

    if (!giftWrapDecryptors.length) {
      return {
        ok: false,
        event: cloneEvent(event),
        actorPubkey,
        errors: [
          {
            stage: "decryptor",
            error: new Error("Gift wrap events require a NIP-44 decryptor."),
          },
        ],
      };
    }

    return decryptGiftWrap(event, giftWrapDecryptors, actorPubkey);
  }

  return decryptLegacyDm(event, decryptors, actorPubkey);
}

export const __testUtils = {
  cloneEvent,
  normalizeHex,
  parseEncryptionHints,
  collectRecipients,
  orderDecryptors,
};

