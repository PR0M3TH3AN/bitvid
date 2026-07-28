// Per-video OpenGraph rendering for crawlers — see api/_lib/ogRenderer.mjs.
//
// Two things here are security-relevant and get the most attention:
//   1. Escaping. Titles/descriptions come from arbitrary nostr events, and this
//      HTML is served from bitvid's own origin.
//   2. Gating. A crawler never authenticates, so anything emitted is public
//      forever in third-party caches. Deleted/private/NSFW/non-whitelisted
//      videos must fall back to the generic site card.

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  CRAWLER_USER_AGENT_PATTERN,
  escapeHtmlAttribute,
  isCrawlerUserAgent,
  isPubliclyShareable,
  normalizeText,
  parseVideoEvent,
  renderOgHtml,
  sanitizeAbsoluteUrl,
} from "../api/_lib/ogRenderer.mjs";

const PUBKEY = "b7c6f6915cfa9a62fff6a1f02604de88c23c6c6c6d1b8f62c7cc10749f307e81";

const publicVideo = () => ({
  pubkey: PUBKEY,
  title: "Why I'm (sort of) not worried about AI",
  description: "A talk about creativity and machines.",
  thumbnail: "https://cdn.example/thumb.jpg",
  deleted: false,
  isPrivate: false,
  isNsfw: false,
  invalid: false,
});

const FALLBACK = {
  siteName: "bitvid",
  title: "bitvid - Decentralized Video Sharing",
  description: "Decentralized video sharing on Nostr.",
  image: "https://bitvid.network/assets/jpg/bitvid.jpg",
  url: "https://bitvid.network",
};

const render = (video, extra = {}) =>
  renderOgHtml({
    video,
    shareUrl: "https://bitvid.network/?v=nevent1abc",
    embedUrl: "https://bitvid.network/embed.html?pointer=nevent1abc",
    fallback: FALLBACK,
    gate: isPubliclyShareable(video, extra.gateOptions || {}),
    ...extra.render,
  });

// --- escaping -------------------------------------------------------------

test("escapeHtmlAttribute neutralizes attribute-breaking characters", () => {
  assert.equal(
    escapeHtmlAttribute(`"><script>alert(1)</script>`),
    "&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;"
  );
  assert.equal(escapeHtmlAttribute("a & b"), "a &amp; b");
  assert.equal(escapeHtmlAttribute("it's"), "it&#39;s");
  assert.equal(escapeHtmlAttribute(null), "");
  assert.equal(escapeHtmlAttribute(42), "");
});

test("a hostile title cannot break out of the meta tag", () => {
  const video = publicVideo();
  video.title = `"><script>alert(document.domain)</script><meta x="`;
  const html = render(video);

  assert.equal(html.includes("<script>"), false, "no raw script tag");
  assert.equal(html.includes(`"><script`), false, "no attribute breakout");
  assert.match(html, /&lt;script&gt;/);
});

test("a hostile description is escaped too", () => {
  const video = publicVideo();
  video.description = `" onload="alert(1)`;
  const html = render(video);
  assert.equal(html.includes(`onload="alert(1)`), false);
  assert.match(html, /&quot; onload=&quot;alert\(1\)/);
});

// --- URL sanitization -----------------------------------------------------

test("sanitizeAbsoluteUrl accepts only http(s)", () => {
  assert.equal(
    sanitizeAbsoluteUrl("https://cdn.example/a.jpg"),
    "https://cdn.example/a.jpg"
  );
  assert.equal(sanitizeAbsoluteUrl("http://cdn.example/a.jpg"), "http://cdn.example/a.jpg");
  assert.equal(sanitizeAbsoluteUrl("javascript:alert(1)"), "");
  assert.equal(sanitizeAbsoluteUrl("data:image/png;base64,AAAA"), "");
  assert.equal(sanitizeAbsoluteUrl("assets/jpg/local.jpg"), "");
  assert.equal(sanitizeAbsoluteUrl(""), "");
  assert.equal(sanitizeAbsoluteUrl(null), "");
});

test("a javascript: thumbnail never reaches og:image", () => {
  const video = publicVideo();
  video.thumbnail = "javascript:alert(1)";
  const html = render(video);
  assert.equal(html.includes("javascript:"), false);
  // Falls back to the site image rather than emitting nothing.
  assert.match(html, /og:image" content="https:\/\/bitvid\.network\/assets/);
});

// --- text normalization ---------------------------------------------------

test("normalizeText collapses whitespace and truncates with an ellipsis", () => {
  assert.equal(normalizeText("  a \n b \t c  ", 50), "a b c");
  const long = "x".repeat(300);
  const out = normalizeText(long, 120);
  assert.equal(out.length, 120);
  assert.equal(out.endsWith("…"), true);
  assert.equal(normalizeText(null, 10), "");
});

// --- gating ---------------------------------------------------------------

test("a clean public video is shareable", () => {
  assert.deepEqual(isPubliclyShareable(publicVideo()), {
    allowed: true,
    reason: "ok",
  });
});

test("deleted, private, NSFW and invalid videos are never described", () => {
  for (const [field, reason] of [
    ["deleted", "deleted"],
    ["isPrivate", "private"],
    ["isNsfw", "nsfw"],
    ["invalid", "invalid-video"],
  ]) {
    const video = publicVideo();
    video[field] = true;
    const result = isPubliclyShareable(video);
    assert.equal(result.allowed, false, `${field} must gate the preview`);
    assert.equal(result.reason, reason);
  }
});

test("a missing video or author is gated", () => {
  assert.equal(isPubliclyShareable(null).allowed, false);
  assert.equal(isPubliclyShareable(undefined).reason, "missing-video");
  const noAuthor = publicVideo();
  noAuthor.pubkey = "";
  assert.equal(isPubliclyShareable(noAuthor).reason, "missing-author");
});

test("a blacklisted author is gated regardless of whitelist mode", () => {
  const result = isPubliclyShareable(publicVideo(), {
    blacklist: new Set([PUBKEY]),
  });
  assert.equal(result.allowed, false);
  assert.equal(result.reason, "blacklisted");
});

test("whitelist mode fails CLOSED when the list is missing or empty", () => {
  // The dangerous case: relays timed out, so we cannot prove the author is
  // allowed. Emitting a rich card here would leak gated metadata.
  assert.equal(
    isPubliclyShareable(publicVideo(), { whitelistEnabled: true }).reason,
    "whitelist-unavailable"
  );
  assert.equal(
    isPubliclyShareable(publicVideo(), {
      whitelistEnabled: true,
      whitelist: new Set(),
    }).reason,
    "whitelist-unavailable"
  );
});

test("whitelist mode admits a listed author and rejects an unlisted one", () => {
  assert.equal(
    isPubliclyShareable(publicVideo(), {
      whitelistEnabled: true,
      whitelist: new Set([PUBKEY]),
    }).allowed,
    true
  );
  assert.equal(
    isPubliclyShareable(publicVideo(), {
      whitelistEnabled: true,
      whitelist: new Set(["a".repeat(64)]),
    }).reason,
    "not-whitelisted"
  );
});

test("gated videos render the generic site card, leaking no metadata", () => {
  const video = publicVideo();
  video.isPrivate = true;
  video.title = "Secret internal recording";
  video.thumbnail = "https://cdn.example/secret.jpg";
  const html = render(video);

  assert.equal(html.includes("Secret internal recording"), false);
  assert.equal(html.includes("secret.jpg"), false);
  assert.match(html, /og:title" content="bitvid - Decentralized Video Sharing"/);
  assert.match(html, /og:type" content="website"/);
  // No player card for a gated video.
  assert.equal(html.includes("twitter:player"), false);
});

// --- rendering ------------------------------------------------------------

test("a public video renders a player card pointing at the embed", () => {
  const html = render(publicVideo());

  assert.match(html, /og:type" content="video\.other"/);
  assert.match(html, /og:title" content="Why I&#39;m \(sort of\) not worried about AI"/);
  assert.match(html, /og:image" content="https:\/\/cdn\.example\/thumb\.jpg"/);
  assert.match(
    html,
    /og:video:url" content="https:\/\/bitvid\.network\/embed\.html\?pointer=nevent1abc"/
  );
  assert.match(html, /twitter:card" content="player"/);
  assert.match(
    html,
    /twitter:player" content="https:\/\/bitvid\.network\/embed\.html\?pointer=nevent1abc"/
  );
  assert.match(html, /twitter:player:width" content="1280"/);
  assert.match(html, /twitter:player:height" content="720"/);
  assert.match(html, /<link rel="canonical" href="https:\/\/bitvid\.network\/\?v=nevent1abc"/);
});

test("without an embed URL it degrades to a summary_large_image card", () => {
  const html = renderOgHtml({
    video: publicVideo(),
    shareUrl: "https://bitvid.network/?v=nevent1abc",
    fallback: FALLBACK,
    gate: { allowed: true, reason: "ok" },
  });
  assert.match(html, /twitter:card" content="summary_large_image"/);
  assert.equal(html.includes("twitter:player"), false);
});

test("the rendered document is well-formed and self-contained", () => {
  const html = render(publicVideo());
  assert.match(html, /^<!doctype html>/);
  assert.match(html, /<\/html>\n$/);
  // Crawler stub only — it must not pull in the app or any script.
  assert.equal(/<script/i.test(html), false);
});

// --- event parsing --------------------------------------------------------
// bitvid publishes kind 30078 with a v3 JSON body; nostube/slidestr and other
// NIP-71-native clients publish kind 21/22/34235/34236 with the metadata in
// TAGS. Parsing only the JSON shape made every NIP-71 video — including the
// real note this work started from — fall back to the generic card.

test("parseVideoEvent reads the bitvid v3 JSON shape", () => {
  const parsed = parseVideoEvent({
    kind: 30078,
    pubkey: PUBKEY,
    content: JSON.stringify({
      version: 3,
      title: "A bitvid upload",
      description: "Body text",
      thumbnail: "https://cdn.example/t.jpg",
      url: "https://cdn.example/v.mp4",
      isNsfw: false,
    }),
    tags: [],
  });

  assert.equal(parsed.title, "A bitvid upload");
  assert.equal(parsed.description, "Body text");
  assert.equal(parsed.thumbnail, "https://cdn.example/t.jpg");
  assert.equal(parsed.invalid, false);
  assert.equal(isPubliclyShareable(parsed).allowed, true);
});

test("parseVideoEvent reads the NIP-71 tag shape (the real nostube note)", () => {
  const parsed = parseVideoEvent({
    kind: 34235,
    pubkey: PUBKEY,
    content: "As a creator, and as a leader of a tech company…",
    tags: [
      ["d", "b52ab495-ac9c-4a29-a454-aff142a43691"],
      ["title", "Why I'm (sort of) not worried about AI"],
      [
        "imeta",
        "dim 1280x720",
        "url https://almond.example/video.m3u8",
        "m application/vnd.apple.mpegurl",
        "image https://almond.example/thumb.jpg",
        "image https://blossom.example/thumb.jpg",
      ],
      ["client", "nostube"],
    ],
  });

  assert.equal(parsed.title, "Why I'm (sort of) not worried about AI");
  assert.equal(parsed.thumbnail, "https://almond.example/thumb.jpg");
  assert.match(parsed.description, /^As a creator/);
  assert.equal(parsed.invalid, false);
});

test("parseVideoEvent treats a content-warning tag as NSFW", () => {
  const parsed = parseVideoEvent({
    kind: 34235,
    pubkey: PUBKEY,
    content: "desc",
    tags: [["title", "Sensitive"], ["content-warning", "nudity"]],
  });
  assert.equal(parsed.isNsfw, true);
  assert.equal(isPubliclyShareable(parsed).reason, "nsfw");
});

test("parseVideoEvent rejects untitled and non-video events", () => {
  assert.equal(
    parseVideoEvent({ kind: 34235, pubkey: PUBKEY, content: "", tags: [] }).invalid,
    true
  );
  // A plain kind-1 note is not a video.
  assert.equal(parseVideoEvent({ kind: 1, pubkey: PUBKEY, content: "hi", tags: [] }), null);
  assert.equal(parseVideoEvent(null), null);
  assert.equal(parseVideoEvent({}), null);
});

test("parseVideoEvent survives malformed JSON content", () => {
  // A kind-30078 whose content is truncated/corrupt must not throw.
  assert.equal(
    parseVideoEvent({ kind: 30078, pubkey: PUBKEY, content: "{not json", tags: [] }),
    null
  );
});

test("parseVideoEvent ignores non-http imeta image entries", () => {
  const parsed = parseVideoEvent({
    kind: 34235,
    pubkey: PUBKEY,
    content: "desc",
    tags: [
      ["title", "T"],
      ["imeta", "image javascript:alert(1)", "image https://ok.example/t.png"],
    ],
  });
  assert.equal(parsed.thumbnail, "https://ok.example/t.png");
});

// --- crawler detection ----------------------------------------------------

test("known preview crawlers are recognized", () => {
  for (const ua of [
    "facebookexternalhit/1.1",
    "Twitterbot/1.0",
    "Slackbot-LinkExpanding 1.0",
    "Mozilla/5.0 (compatible; Discordbot/2.0)",
    "TelegramBot (like TwitterBot)",
    "WhatsApp/2.19",
    "Mozilla/5.0 (compatible; Googlebot/2.1)",
  ]) {
    assert.equal(isCrawlerUserAgent(ua), true, `${ua} should match`);
  }
});

test("real browsers are NOT treated as crawlers", () => {
  for (const ua of [
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64; rv:146.0) Gecko/20100101 Firefox/146.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15",
    "",
  ]) {
    assert.equal(isCrawlerUserAgent(ua), false, `${ua} must not match`);
  }
  assert.equal(isCrawlerUserAgent(null), false);
  assert.equal(isCrawlerUserAgent(undefined), false);
});

test("the crawler pattern is not sticky/global (no lastIndex state)", () => {
  // A /g regex would alternate true/false across calls via lastIndex — a
  // classic bug that would randomly serve crawlers the wrong page.
  assert.equal(CRAWLER_USER_AGENT_PATTERN.global, false);
  const ua = "Twitterbot/1.0";
  assert.equal(isCrawlerUserAgent(ua), true);
  assert.equal(isCrawlerUserAgent(ua), true);
  assert.equal(isCrawlerUserAgent(ua), true);
});

// --- config drift ---------------------------------------------------------
// api/og.js imports the admin-list identity and relay set from the SAME modules
// the browser uses, rather than keeping its own copies. These assertions fail
// loudly if that ever regresses to duplicated constants, because the failure
// mode otherwise is silent: previews gated forever, or a stale whitelist.

test("api/og.js derives its config from the app, not from copies", async () => {
  const source = await readFile(new URL("../api/og.js", import.meta.url), "utf8");

  assert.match(source, /from "\.\.\/js\/config\.js"/);
  assert.match(source, /from "\.\.\/js\/nostr\/toolkit\.js"/);
  assert.match(source, /from "\.\.\/js\/nostrEventSchemas\.js"/);

  // No hardcoded npub or wss:// literal may reappear in the handler.
  assert.equal(
    /npub1[0-9a-z]{20,}/.test(source),
    false,
    "admin npub must come from js/config.js, not a literal"
  );
  assert.equal(
    /"wss:\/\//.test(source),
    false,
    "relay URLs must come from js/nostr/toolkit.js, not literals"
  );
});

test("the admin list d-tag matches what the browser store queries", async () => {
  const { ADMIN_LIST_NAMESPACE } = await import("../js/config.js");
  const { ADMIN_LIST_IDENTIFIERS } = await import("../js/nostrEventSchemas.js");

  // Pinned against the live list this instance actually publishes; a namespace
  // change without a matching relay migration would silently gate everything.
  assert.equal(
    `${ADMIN_LIST_NAMESPACE}:${ADMIN_LIST_IDENTIFIERS.whitelist}`,
    "bitvid:admin:whitelist"
  );
  assert.equal(
    `${ADMIN_LIST_NAMESPACE}:${ADMIN_LIST_IDENTIFIERS.blacklist}`,
    "bitvid:admin:blacklist"
  );
});
