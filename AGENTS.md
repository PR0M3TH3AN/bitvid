# Bitvid — AI Agent Guide

This guide tells AI agents how to keep Bitvid aligned with the current product direction. Follow it whenever you touch code, content, or documentation inside this repository.

---

## 1. Release Channels: Main vs. Unstable

* **Main** is the production track. Anything merged here must preserve today’s UX and magnet safety guarantees. Rollbacks should be painless: keep commits atomic, avoid destructive migrations, and leave feature flags in a known-good default (`false` unless product explicitly flips them).
* **Unstable** is our experimentation lane. Gate risky behavior behind feature flags defined in `js/constants.js` and document the toggle/rollback plan in PR descriptions.
* **Emergency response:** If a change regresses URL-first playback or breaks magnet parsing, revert immediately and annotate the AGENTS.md changelog with remediation tips so future agents do not repeat the mistake.

## 2. Mission: URL‑First Playback with WebTorrent Fallback

* **Goal:** Always deliver smooth playback while keeping hosting costs low.
* **Primary transport:** A hosted video URL (MP4/WebM/HLS/DASH) that the `<video>` element can stream directly.
* **Fallback transport:** A WebTorrent magnet that includes browser‑safe trackers plus optional HTTP hints.
* **Runtime behavior:** Call `playVideoWithFallback({ url, magnet })` (see `js/playbackUtils.js`). It probes the URL first; only when that fails should WebTorrent start.
* **Content contract:** Bitvid posts (Nostr kind `30078`) must include a `title` and at least one of `url` or `magnet`. Prefer to publish both along with optional `thumbnail`, `description`, and `mode` fields. When mirroring to NIP‑94 (`kind 1063`), copy the hosted URL and (optionally) the magnet so other clients can discover the same asset.

---

## 3. Magnet Handling — Do’s & Don’ts

* **Use the helpers every time:** Always run inbound values through `safeDecodeMagnet()` before playback or normalization, and call `normalizeAndAugmentMagnet()` (see `js/magnetUtils.js`) to append `ws=` / `xs=` hints without mutating hashes.
* **Keep magnets raw:** Persist the literal `magnet:?xt=urn:btih:...` string. Decode once, then feed that exact value to WebTorrent or storage. Never rely on re-encoding helpers that might alter casing.
* **Never call `new URL()` on magnets:** URL constructors/`URLSearchParams` percent-encode the `xt` payload and corrupt legacy hashes. Manipulate magnets with the helper utilities or string functions that respect the raw hash.
* **HTTP hints:** Encourage HTTPS `ws=` web seeds (file roots only) and HTTPS `xs=` pointers to `.torrent` files so fallback peers warm quickly.
* **Tracker policy:** Browser code must ship WSS trackers only. Pull the canonical list from `js/constants.js`; do not add UDP or plaintext HTTP trackers.

---

## 4. Upload Modal Troubleshooting

1. **Required fields:** Validation must ensure a title exists and that either a hosted URL or a magnet (or both) is supplied. Optional `ws` / `xs` inputs should be appended only when a magnet is present.
2. **Magnet parsing errors:** When a user pastes encoded magnets, run `safeDecodeMagnet()` before normalizing. Show inline errors if decoding fails and confirm the raw `magnet:?xt=` string survives the round trip.
3. **URL-first promise:** After submission, confirm the resulting feed item carries `data-play-url` and `data-play-magnet` attributes so playback utilities can attempt the URL first.
4. **Mixed-content warnings:** If the page is served over HTTPS, reject `ws=` or `xs=` hints that begin with `http://` and show guidance to upgrade to HTTPS. Document the copy in README/UX strings so operators can align messaging.
5. **Telemetry hooks:** Keep existing analytics/logging untouched unless instructed. If you add new modal states, annotate them clearly in code comments.
6. **Modal regressions:** If validation or helper wiring breaks in Main, disable new feature flags and ship a revert PR immediately. Note the rollback steps in AGENTS.md for posterity.

---

## 5. Manual QA Checklist

Run this script before shipping notable UI changes, especially around upload/playback flows. Automate when possible, but manual verification is required for releases.

1. **Smoke test the modal**
   * Launch the site, open the Upload modal, and confirm required-field validation (title + one of URL/magnet).
   * Submit with URL only, magnet only, and both; ensure success states are clear.
2. **URL-first playback**
   * Publish a post with both URL and magnet. Load the card and verify the player fetches the hosted URL first (check network tab or logs).
   * Temporarily block the URL (e.g., devtools throttling or offline). Confirm playback seamlessly falls back to the magnet.
3. **Magnet hygiene**
   * Paste an encoded magnet; ensure `safeDecodeMagnet()` returns the raw value and the final string still includes the original `xt` hash.
   * Confirm `normalizeAndAugmentMagnet()` appends `ws=`/`xs=` hints without corrupting parameters.
4. **P2P hints**
   * Verify magnets authored through the modal include HTTPS `ws=` and optional `xs=` values when provided.
   * Ensure tracker lists come from `js/constants.js` and remain WSS-only.
5. **Cross-browser sanity**
   * Spot-check playback in Chromium and Firefox (desktop) to ensure no console errors related to CORS, Range requests, or tracker connections.

Document the run in PR descriptions so QA can cross-reference results.

---

## 6. Additional Notes for Agents

* **Nostr interoperability:** Keep kind `30078` events as the source of truth and optionally mirror to kind `1063` so external clients see the hosted URL.
* **Probing:** Lightweight `HEAD`/`GET` requests should back `probeUrl()` so dead URLs can be hidden or flagged without blocking the UI.
* **Extensibility:** Future work (live streams, NIP-96 uploads, analytics) should preserve the URL-first strategy and magnet safety rules above.

---

## 7. Content Schema v3 & Playback Rules

* **Event payloads:** New video notes serialize as version `3` with the JSON shape:
  `{ "version": 3, "title": string, "url"?: string, "magnet"?: string, "thumbnail"?: string, "description"?: string, "mode": "live"|"dev", "isPrivate": boolean, "deleted": boolean, "videoRootId": string }`.
* **Validation:** Every note must include a non-empty `title` plus at least one playable source (`url` or `magnet`). URL-only and magnet-only posts are both valid. Legacy v2 magnet notes stay readable.
* **Upload UX:** The modal collects a hosted HTTPS URL and/or magnet. Enforce HTTPS for direct playback while keeping magnets optional when a URL is supplied.
* **Playback orchestration:** `playVideoWithFallback` probes and plays the HTTPS URL first, watches for stalls/errors, and then falls back to WebTorrent. When both sources exist, pass the hosted URL through to WebTorrent as a webseed hint.
* **Status messaging:** Update modal copy to reflect whether playback is direct or via P2P so regressions surface quickly during QA.

## Next

Please read these documents next. 

docs/nostr-event-schemas.md 
js/nostrEventSchemas.js

And if you need to create new nostr kinds please keep the logic centralized there in nostrEventSchemas.js and the nostr-event-schemas.md up to date. 

**End of AGENTS.md**
