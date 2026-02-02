import { devLogger } from "../utils/logger.js";

export const ATTACHMENT_KIND = 15;

const HEX_64_REGEX = /^[0-9a-f]{64}$/i;

const TAG_NAMES = Object.freeze({
  hash: "x",
  url: "url",
  name: "name",
  type: "type",
  size: "size",
  key: "k",
});

function normalizeTagValue(value) {
  if (typeof value !== "string") {
    if (value === undefined || value === null) {
      return "";
    }
    return String(value);
  }
  return value.trim();
}

function normalizeHash(value) {
  const normalized = normalizeTagValue(value).toLowerCase();
  if (!normalized) {
    return "";
  }
  return HEX_64_REGEX.test(normalized) ? normalized : "";
}

function normalizeNumber(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return null;
  }
  return Math.floor(numeric);
}

export function parseAttachmentTags(tags) {
  if (!Array.isArray(tags)) {
    return null;
  }

  const fields = {
    x: "",
    url: "",
    name: "",
    type: "",
    size: null,
    key: "",
  };

  tags.forEach((tag) => {
    if (!Array.isArray(tag) || tag.length < 2) {
      return;
    }

    const name = normalizeTagValue(tag[0]).toLowerCase();
    const value = normalizeTagValue(tag[1]);

    switch (name) {
      case TAG_NAMES.hash:
        fields.x = normalizeHash(value);
        break;
      case TAG_NAMES.url:
        fields.url = value;
        break;
      case TAG_NAMES.name:
        fields.name = value;
        break;
      case TAG_NAMES.type:
        fields.type = value;
        break;
      case TAG_NAMES.size:
        fields.size = normalizeNumber(value);
        break;
      case TAG_NAMES.key:
        fields.key = value;
        break;
      default:
        break;
    }
  });

  if (!fields.x && !fields.url) {
    return null;
  }

  return {
    x: fields.x,
    url: fields.url,
    name: fields.name,
    type: fields.type,
    size: fields.size,
    key: fields.key,
    encrypted: Boolean(fields.key),
  };
}

export function extractAttachmentsFromMessage(message) {
  if (!message || typeof message !== "object") {
    return [];
  }

  const event =
    (message.message && typeof message.message === "object"
      ? message.message
      : null) ||
    (message.event && typeof message.event === "object" ? message.event : null);

  if (!event || Number(event.kind) !== ATTACHMENT_KIND) {
    return [];
  }

  const attachment = parseAttachmentTags(event.tags);
  if (!attachment) {
    devLogger.warn("[attachments] Attachment event missing tags.");
    return [];
  }

  return [attachment];
}

export function formatAttachmentSize(bytes) {
  if (!Number.isFinite(bytes)) {
    return "";
  }

  const units = ["B", "KB", "MB", "GB"];
  let size = Math.max(bytes, 0);
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  const rounded = size >= 10 || unitIndex === 0 ? Math.round(size) : size.toFixed(1);
  return `${rounded} ${units[unitIndex]}`;
}

export function describeAttachment(attachment) {
  if (!attachment || typeof attachment !== "object") {
    return "Attachment";
  }

  const name = typeof attachment.name === "string" ? attachment.name.trim() : "";
  if (name) {
    return `Attachment: ${name}`;
  }

  if (attachment.type) {
    return `Attachment (${attachment.type})`;
  }

  return "Attachment";
}

export { TAG_NAMES as ATTACHMENT_TAG_NAMES };
