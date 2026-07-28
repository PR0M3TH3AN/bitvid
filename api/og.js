// Vercel serverless handler: renders per-video OpenGraph / Twitter-player tags
// for crawlers hitting `/?v=<nevent>`.
//
// Nothing is pre-generated and nothing is persisted. This is a stateless
// function invoked per crawler request; `dist/` is byte-identical with or
// without it. The only caching is the CDN edge cache via Cache-Control below.
//
// This must never become load-bearing for the app: real users are not routed
// here (see the user-agent rewrite in vercel.json), and a static/nsite deploy
// without any functions keeps working exactly as it does today, just with the
// site-wide card.

import { nip19 } from "nostr-tools";
import { SimplePool, useWebSocketImplementation } from "nostr-tools/pool";
import WebSocket from "ws";

import {
  isCrawlerUserAgent,
  isPubliclyShareable,
  parseVideoEvent,
  renderOgHtml,
} from "./_lib/ogRenderer.mjs";

// Imported, not duplicated: these modules are plain ESM with no DOM access, so
// the function reads the SAME admin-list identity and relay set the browser
// does. A hardcoded copy would silently drift the moment an operator retunes
// the instance, and the failure mode (previews gated forever, or worse, a stale
// whitelist) would be invisible.
import {
  ADMIN_LIST_NAMESPACE,
  ADMIN_SUPER_NPUB,
} from "../js/config.js";
import { DEFAULT_RELAY_URLS } from "../js/nostr/toolkit.js";
import { ADMIN_LIST_IDENTIFIERS } from "../js/nostrEventSchemas.js";

useWebSocketImplementation(WebSocket);

const RELAYS = Array.from(DEFAULT_RELAY_URLS);

// Admin moderation lists are addressable kind-30000 sets published by the
// instance's super admin (js/adminListStore.js).
const ADMIN_LIST_KIND = 30000;

// Measured: a COLD pool's first read across these relays can take ~3s (WSS
// handshake + REQ round trip on four connections). 1.5s and 2.5s both cut it
// off and served the generic card every time. Twitter allows ~5s and Facebook
// ~10s, so 4s buys a correct card on a cold container while still leaving
// headroom under Vercel's function limit. Warm containers answer in <600ms.
const RELAY_TIMEOUT_MS = 4000;

// Admin lists are identical for every request, so re-reading them on each crawl
// is pure waste (and it was starving the video read of its budget). Memoized in
// module scope: warm invocations skip the relay round trip entirely. This is a
// per-container, in-memory cache of PUBLIC data that dies with the container —
// nothing is persisted anywhere.
const ADMIN_LIST_TTL_MS = 5 * 60 * 1000;
let adminListCache = { expiresAt: 0, whitelist: null, blacklist: null };

const SITE_ORIGIN = process.env.BITVID_SITE_ORIGIN || "https://bitvid.network";
const FALLBACK = Object.freeze({
  siteName: "bitvid",
  title: "bitvid - Decentralized Video Sharing",
  description:
    "bitvid is a decentralized video sharing platform built on Nostr and WebTorrent.",
  image: `${SITE_ORIGIN}/assets/jpg/bitvid.jpg`,
  url: SITE_ORIGIN,
});

function withTimeout(promise, ms, fallbackValue) {
  return Promise.race([
    promise.catch(() => fallbackValue),
    new Promise((resolve) => setTimeout(() => resolve(fallbackValue), ms)),
  ]);
}

/** Decode `?v=` (nevent/naddr/note/raw hex) into a relay filter. */
function pointerToFilter(pointer) {
  const trimmed = typeof pointer === "string" ? pointer.trim() : "";
  if (!trimmed) {
    return null;
  }
  if (/^[0-9a-f]{64}$/i.test(trimmed)) {
    return { ids: [trimmed.toLowerCase()] };
  }
  try {
    const decoded = nip19.decode(trimmed);
    if (decoded.type === "nevent" && decoded.data?.id) {
      return { ids: [decoded.data.id] };
    }
    if (decoded.type === "note" && typeof decoded.data === "string") {
      return { ids: [decoded.data] };
    }
    if (decoded.type === "naddr" && decoded.data?.identifier) {
      return {
        kinds: [decoded.data.kind],
        authors: [decoded.data.pubkey],
        "#d": [decoded.data.identifier],
      };
    }
  } catch (err) {
    // Unparseable pointer -> generic card.
  }
  return null;
}

function extractPubkeySet(event) {
  const out = new Set();
  if (!event || !Array.isArray(event.tags)) {
    return out;
  }
  for (const tag of event.tags) {
    if (!Array.isArray(tag) || tag[0] !== "p" || typeof tag[1] !== "string") {
      continue;
    }
    const value = tag[1].trim().toLowerCase();
    if (/^[0-9a-f]{64}$/.test(value)) {
      out.add(value);
      continue;
    }
    try {
      const decoded = nip19.decode(value);
      if (decoded.type === "npub" && typeof decoded.data === "string") {
        out.add(decoded.data.toLowerCase());
      }
    } catch (err) {
      // ignore malformed entries
    }
  }
  return out;
}

export default async function handler(req, res) {
  const host = req.headers?.host || new URL(SITE_ORIGIN).host;
  const proto = req.headers?.["x-forwarded-proto"] || "https";
  const requestUrl = new URL(req.url || "/", `${proto}://${host}`);
  const pointer = requestUrl.searchParams.get("v") || "";

  const shareUrl = pointer
    ? `${SITE_ORIGIN}/?v=${encodeURIComponent(pointer)}`
    : SITE_ORIGIN;
  const embedUrl = pointer
    ? `${SITE_ORIGIN}/embed.html?pointer=${encodeURIComponent(pointer)}`
    : "";

  const renderFallback = (reason) => {
    // Short TTL: a video may be published, edited or moderated at any time, and
    // we would rather re-ask the relays than pin a wrong card in someone's CDN.
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=600");
    res.setHeader("X-Bitvid-OG", reason);
    res.status(200).send(
      renderOgHtml({ video: null, shareUrl, fallback: FALLBACK })
    );
  };

  // Defensive: the rewrite should only send crawlers here, but never serve a
  // human this stub if the rule ever widens.
  if (!isCrawlerUserAgent(req.headers?.["user-agent"])) {
    res.setHeader("Cache-Control", "no-store");
    res.redirect(302, shareUrl);
    return;
  }

  const filter = pointerToFilter(pointer);
  if (!filter) {
    renderFallback("no-pointer");
    return;
  }

  const pool = new SimplePool();
  let superAdminHex = "";
  try {
    const decoded = nip19.decode(ADMIN_SUPER_NPUB);
    superAdminHex = decoded.type === "npub" ? decoded.data : "";
  } catch (err) {
    superAdminHex = "";
  }

  try {
    const listFilter = (identifier) => ({
      kinds: [ADMIN_LIST_KIND],
      "#d": [`${ADMIN_LIST_NAMESPACE}:${identifier}`],
      ...(superAdminHex ? { authors: [superAdminHex] } : {}),
    });

    // One shared deadline across all three reads.
    const now = Date.now();
    const adminListsFresh =
      adminListCache.expiresAt > now && adminListCache.whitelist instanceof Set;

    const [videoEvent, whitelistEvent, blacklistEvent] = await Promise.all([
      withTimeout(pool.get(RELAYS, filter), RELAY_TIMEOUT_MS, null),
      adminListsFresh
        ? Promise.resolve(null)
        : withTimeout(
            pool.get(RELAYS, listFilter(ADMIN_LIST_IDENTIFIERS.whitelist)),
            RELAY_TIMEOUT_MS,
            null
          ),
      adminListsFresh
        ? Promise.resolve(null)
        : withTimeout(
            pool.get(RELAYS, listFilter(ADMIN_LIST_IDENTIFIERS.blacklist)),
            RELAY_TIMEOUT_MS,
            null
          ),
    ]);

    let whitelist = adminListsFresh ? adminListCache.whitelist : null;
    let blacklist = adminListsFresh ? adminListCache.blacklist : null;
    if (!adminListsFresh) {
      whitelist = extractPubkeySet(whitelistEvent);
      blacklist = extractPubkeySet(blacklistEvent);
      // Only cache a whitelist we actually got. Caching an empty one would pin
      // "whitelist-unavailable" for the whole TTL after a single slow read.
      if (whitelist.size > 0) {
        adminListCache = {
          expiresAt: now + ADMIN_LIST_TTL_MS,
          whitelist,
          blacklist,
        };
      }
    }

    const video = parseVideoEvent(videoEvent);
    if (!video) {
      renderFallback("event-not-found");
      return;
    }

    const gate = isPubliclyShareable(video, {
      whitelistEnabled: true,
      whitelist,
      blacklist,
    });

    if (!gate.allowed) {
      renderFallback(`gated:${gate.reason}`);
      return;
    }

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=600");
    res.setHeader("X-Bitvid-OG", "video");
    res
      .status(200)
      .send(renderOgHtml({ video, shareUrl, embedUrl, fallback: FALLBACK, gate }));
  } catch (err) {
    renderFallback("error");
  } finally {
    try {
      pool.close(RELAYS);
    } catch (err) {
      // ignore
    }
  }
}
