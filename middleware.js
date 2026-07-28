// Routes crawler requests for `/?v=<nevent>` to the per-video OpenGraph
// renderer (api/og.js).
//
// This has to be middleware rather than a `rewrites` entry in vercel.json:
// rewrites are evaluated AFTER the filesystem, and `/` matches the static
// index.html, so the rewrite never fired and crawlers kept getting the
// site-wide card. Middleware runs before the filesystem check.
//
// Deliberately minimal. It matches only `/`, bails immediately when there is no
// `v` param or the visitor is not a known preview crawler, and never touches
// the response for a real viewer — they continue to the untouched SPA. If this
// file is removed the site keeps working, just with the generic card.

import { next, rewrite } from "@vercel/edge";
import { isCrawlerUserAgent } from "./api/_lib/ogRenderer.mjs";

export const config = {
  // Only the share-link path. Every other route skips middleware entirely.
  matcher: "/",
};

export default function middleware(request) {
  let url;
  try {
    url = new URL(request.url);
  } catch (err) {
    return next();
  }

  // A bare homepage visit is not a share link.
  if (!url.searchParams.get("v")) {
    return next();
  }

  const userAgent = request.headers?.get?.("user-agent") || "";
  if (!isCrawlerUserAgent(userAgent)) {
    return next();
  }

  const target = new URL(url.toString());
  target.pathname = "/api/og";
  return rewrite(target);
}
