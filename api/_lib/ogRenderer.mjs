// Per-video OpenGraph / Twitter-player rendering for crawlers.
//
// bitvid is a static SPA: index.html carries one set of site-wide OG tags, so
// every `/?v=<nevent>` link previewed as the same generic bitvid card. Crawlers
// don't run JS, so the client can't fix that — this module renders the tags a
// crawler needs, and a thin host adapter (api/og.js on Vercel) feeds it.
//
// PURE by design: no network, no host globals. All I/O lives in the adapter so
// the escaping and gating rules below stay unit-testable.
//
// Rollback: remove the crawler rewrite from vercel.json. The static site keeps
// serving its existing tags and nothing else changes — this is never on the
// path of a real user's page load, and `npm run archive` (nsite) is unaffected.

// Player card dimensions. Twitter refuses a player card without explicit
// dimensions, and 16:9 matches bitvid's embed shell.
export const DEFAULT_PLAYER_WIDTH = 1280;
export const DEFAULT_PLAYER_HEIGHT = 720;

const MAX_TITLE_LENGTH = 120;
const MAX_DESCRIPTION_LENGTH = 200;

/**
 * Escape a value for use inside a double-quoted HTML attribute.
 *
 * Titles and descriptions come from arbitrary nostr events — treat every one as
 * hostile. A title of `"><script>…` would otherwise break out of the meta tag
 * and inject markup into a page we serve from our own origin.
 */
export function escapeHtmlAttribute(value) {
  if (typeof value !== "string") {
    return "";
  }
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Only http(s) URLs may reach a meta tag. Anything else (javascript:, data:,
 * relative paths) is dropped — a crawler resolving them is at best useless and
 * at worst a vector.
 */
export function sanitizeAbsoluteUrl(value) {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed) {
    return "";
  }
  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch (err) {
    return "";
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return "";
  }
  return parsed.toString();
}

/** Collapse whitespace and hard-truncate for preview surfaces. */
export function normalizeText(value, maxLength) {
  const collapsed =
    typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  if (!collapsed || !Number.isFinite(maxLength) || maxLength <= 0) {
    return collapsed;
  }
  if (collapsed.length <= maxLength) {
    return collapsed;
  }
  return `${collapsed.slice(0, maxLength - 1).trimEnd()}…`;
}

/**
 * Decide whether a video may be described in a link preview.
 *
 * A crawler never authenticates, so anything emitted here is fully public and
 * outlives us in third-party caches. The rule is fail-closed: only a video that
 * is affirmatively public gets a rich card; everything else — including the
 * "we couldn't determine it" case — falls back to the generic bitvid card.
 *
 * @returns {{allowed: boolean, reason: string}}
 */
export function isPubliclyShareable(video, options = {}) {
  if (!video || typeof video !== "object") {
    return { allowed: false, reason: "missing-video" };
  }
  if (video.invalid) {
    return { allowed: false, reason: "invalid-video" };
  }
  if (video.deleted === true) {
    return { allowed: false, reason: "deleted" };
  }
  if (video.isPrivate === true) {
    return { allowed: false, reason: "private" };
  }
  // NSFW thumbnails must never be injected into an unsuspecting timeline.
  if (video.isNsfw === true) {
    return { allowed: false, reason: "nsfw" };
  }

  const pubkey =
    typeof video.pubkey === "string" ? video.pubkey.trim().toLowerCase() : "";
  if (!pubkey) {
    return { allowed: false, reason: "missing-author" };
  }

  const blacklist = options.blacklist instanceof Set ? options.blacklist : null;
  if (blacklist && blacklist.has(pubkey)) {
    return { allowed: false, reason: "blacklisted" };
  }

  if (options.whitelistEnabled) {
    const whitelist =
      options.whitelist instanceof Set ? options.whitelist : null;
    // No usable whitelist while whitelist mode is on means we cannot prove the
    // author is allowed. Fail closed rather than leak a gated video's metadata.
    if (!whitelist || whitelist.size === 0) {
      return { allowed: false, reason: "whitelist-unavailable" };
    }
    if (!whitelist.has(pubkey)) {
      return { allowed: false, reason: "not-whitelisted" };
    }
  }

  return { allowed: true, reason: "ok" };
}

// bitvid's own notes are kind 30078 with a v3 JSON body. Other clients
// (nostube/slidestr and anything NIP-71 native) publish kind 21/22/34235/34236
// with the metadata in TAGS and the description in `content`. bitvid normalizes
// both in the browser, so the preview must understand both too — parsing only
// the JSON shape made every NIP-71 video fall back to the generic card.
export const NIP71_VIDEO_KINDS = Object.freeze([21, 22, 34235, 34236]);

function firstTagValue(tags, name) {
  if (!Array.isArray(tags)) {
    return "";
  }
  for (const tag of tags) {
    if (Array.isArray(tag) && tag[0] === name && typeof tag[1] === "string") {
      const value = tag[1].trim();
      if (value) {
        return value;
      }
    }
  }
  return "";
}

function hasTag(tags, name) {
  return (
    Array.isArray(tags) &&
    tags.some((tag) => Array.isArray(tag) && tag[0] === name)
  );
}

/** First `image <url>` entry inside any imeta tag. */
function imetaImageUrl(tags) {
  if (!Array.isArray(tags)) {
    return "";
  }
  for (const tag of tags) {
    if (!Array.isArray(tag) || tag[0] !== "imeta") {
      continue;
    }
    for (let i = 1; i < tag.length; i += 1) {
      const entry = typeof tag[i] === "string" ? tag[i].trim() : "";
      if (/^image\s+/i.test(entry)) {
        const url = sanitizeAbsoluteUrl(entry.replace(/^image\s+/i, ""));
        if (url) {
          return url;
        }
      }
    }
  }
  return "";
}

/**
 * Normalize a raw nostr event into the fields the preview needs, for both the
 * bitvid v3 JSON shape and the NIP-71 tag shape. Returns null when the event is
 * not a recognizable video note (caller renders the generic card).
 */
export function parseVideoEvent(event) {
  if (!event || typeof event !== "object") {
    return null;
  }

  const base = { pubkey: event.pubkey, deleted: false, isPrivate: false };

  // --- bitvid native (kind 30078, JSON content) ---
  if (typeof event.content === "string" && event.content.trim().startsWith("{")) {
    try {
      const content = JSON.parse(event.content);
      if (content && typeof content === "object") {
        return {
          ...base,
          title: content.title,
          description: content.description,
          thumbnail: content.thumbnail,
          deleted: content.deleted === true,
          isPrivate: content.isPrivate === true,
          isNsfw: content.isNsfw === true || hasTag(event.tags, "content-warning"),
          invalid: !content.title || (!content.url && !content.magnet),
        };
      }
    } catch (err) {
      // Not JSON after all — fall through to the NIP-71 reading.
    }
  }

  // --- NIP-71 (metadata in tags, description in content) ---
  if (NIP71_VIDEO_KINDS.includes(event.kind)) {
    const title = firstTagValue(event.tags, "title");
    const thumbnail =
      imetaImageUrl(event.tags) ||
      sanitizeAbsoluteUrl(firstTagValue(event.tags, "image")) ||
      sanitizeAbsoluteUrl(firstTagValue(event.tags, "thumb"));
    const description =
      (typeof event.content === "string" && event.content.trim()) ||
      firstTagValue(event.tags, "summary") ||
      firstTagValue(event.tags, "alt");
    return {
      ...base,
      title,
      description,
      thumbnail,
      // NIP-71 has no privacy flag; `content-warning` is the NSFW signal.
      isNsfw: hasTag(event.tags, "content-warning"),
      invalid: !title,
    };
  }

  return null;
}

function metaTag(attribute, name, content) {
  return `    <meta ${attribute}="${escapeHtmlAttribute(name)}" content="${escapeHtmlAttribute(content)}" />`;
}

/**
 * Render the crawler-facing HTML document.
 *
 * @param {object} params
 * @param {object|null} params.video      Normalized video object, or null.
 * @param {string} params.shareUrl        Canonical `/?v=<nevent>` URL.
 * @param {string} [params.embedUrl]      `/embed.html?pointer=<nevent>` player URL.
 * @param {object} params.fallback        Site-wide defaults (title/description/image/url).
 * @param {object} [params.gate]          Result of isPubliclyShareable().
 * @returns {string} A complete HTML document.
 */
export function renderOgHtml({
  video = null,
  shareUrl = "",
  embedUrl = "",
  fallback = {},
  gate = null,
} = {}) {
  const siteName = normalizeText(fallback.siteName || "bitvid", 60);
  const fallbackTitle = normalizeText(
    fallback.title || "bitvid - Decentralized Video Sharing",
    MAX_TITLE_LENGTH
  );
  const fallbackDescription = normalizeText(
    fallback.description || "Decentralized video sharing on Nostr.",
    MAX_DESCRIPTION_LENGTH
  );
  const fallbackImage = sanitizeAbsoluteUrl(fallback.image);
  const canonical = sanitizeAbsoluteUrl(shareUrl) || sanitizeAbsoluteUrl(fallback.url);

  const decision = gate || isPubliclyShareable(video);
  const useVideo = decision.allowed === true;

  const title = useVideo
    ? normalizeText(video.title, MAX_TITLE_LENGTH) || fallbackTitle
    : fallbackTitle;
  const description = useVideo
    ? normalizeText(video.description, MAX_DESCRIPTION_LENGTH) ||
      fallbackDescription
    : fallbackDescription;
  const image = useVideo
    ? sanitizeAbsoluteUrl(video.thumbnail) || fallbackImage
    : fallbackImage;
  const player = useVideo ? sanitizeAbsoluteUrl(embedUrl) : "";

  const lines = [
    "<!doctype html>",
    '<html lang="en">',
    "  <head>",
    '    <meta charset="utf-8" />',
    '    <meta name="viewport" content="width=device-width, initial-scale=1" />',
    `    <title>${escapeHtmlAttribute(title)}</title>`,
  ];

  if (canonical) {
    lines.push(`    <link rel="canonical" href="${escapeHtmlAttribute(canonical)}" />`);
  }

  lines.push(metaTag("name", "description", description));
  lines.push(metaTag("property", "og:site_name", siteName));
  lines.push(metaTag("property", "og:type", useVideo ? "video.other" : "website"));
  lines.push(metaTag("property", "og:title", title));
  lines.push(metaTag("property", "og:description", description));
  if (canonical) {
    lines.push(metaTag("property", "og:url", canonical));
  }
  if (image) {
    lines.push(metaTag("property", "og:image", image));
    lines.push(metaTag("property", "og:image:alt", title));
  }

  if (player) {
    // A player card is what makes a shared bitvid link behave like a YouTube
    // link: the video plays inline in the timeline instead of showing a still.
    lines.push(metaTag("property", "og:video:url", player));
    lines.push(metaTag("property", "og:video:secure_url", player));
    lines.push(metaTag("property", "og:video:type", "text/html"));
    lines.push(metaTag("property", "og:video:width", String(DEFAULT_PLAYER_WIDTH)));
    lines.push(metaTag("property", "og:video:height", String(DEFAULT_PLAYER_HEIGHT)));
    lines.push(metaTag("name", "twitter:card", "player"));
    lines.push(metaTag("name", "twitter:player", player));
    lines.push(metaTag("name", "twitter:player:width", String(DEFAULT_PLAYER_WIDTH)));
    lines.push(metaTag("name", "twitter:player:height", String(DEFAULT_PLAYER_HEIGHT)));
  } else {
    lines.push(metaTag("name", "twitter:card", image ? "summary_large_image" : "summary"));
  }

  lines.push(metaTag("name", "twitter:title", title));
  lines.push(metaTag("name", "twitter:description", description));
  if (image) {
    lines.push(metaTag("name", "twitter:image", image));
  }

  lines.push("  </head>");
  lines.push("  <body>");
  // A human should never land here (only crawler user-agents are rewritten),
  // but if one does, give them a real link rather than a blank page.
  lines.push(
    canonical
      ? `    <p><a href="${escapeHtmlAttribute(canonical)}">${escapeHtmlAttribute(title)}</a></p>`
      : `    <p>${escapeHtmlAttribute(title)}</p>`
  );
  lines.push("  </body>");
  lines.push("</html>");

  return `${lines.join("\n")}\n`;
}

// Conservative crawler match. Being wrong in the "not a bot" direction is free
// (the visitor gets the normal SPA); being wrong the other way would serve a
// human this stub page, so the pattern stays narrow and explicit.
export const CRAWLER_USER_AGENT_PATTERN =
  /(facebookexternalhit|twitterbot|slackbot|discordbot|telegrambot|whatsapp|linkedinbot|pinterest|redditbot|embedly|quora link preview|nostrbot|primal|iframely|opengraph|mastodon|bluesky|skypeuripreview|vkshare|googlebot|bingbot|applebot|yandexbot|duckduckbot|baiduspider|petalbot|semrushbot|ahrefsbot|developers\.google\.com\/\+\/web\/snippet)/i;

export function isCrawlerUserAgent(userAgent) {
  return typeof userAgent === "string"
    ? CRAWLER_USER_AGENT_PATTERN.test(userAgent)
    : false;
}
