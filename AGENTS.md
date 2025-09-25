# Bitvid — AI Agent Guide

This guide tells AI agents how to keep Bitvid aligned with the current product direction. Follow it whenever you touch code, content, or documentation inside this repository.

---

## 1. Mission: URL‑First Playback with WebTorrent Fallback

* **Goal:** Always deliver smooth playback while keeping hosting costs low.
* **Primary transport:** A hosted video URL (MP4/WebM/HLS/DASH) that the `<video>` element can stream directly.
* **Fallback transport:** A WebTorrent magnet that includes browser‑safe trackers plus optional HTTP hints.
* **Runtime behavior:** Call `playVideoWithFallback({ url, magnet })` (see `js/playbackUtils.js`). It probes the URL first; only when that fails should WebTorrent start.
* **Content contract:** Bitvid posts (Nostr kind `30078`) must include a `title` and at least one of `url` or `magnet`. Prefer to publish both along with optional `thumbnail`, `description`, and `mode` fields. When mirroring to NIP‑94 (`kind 1063`), copy the hosted URL and (optionally) the magnet so other clients can discover the same asset.

---

## 2. Magnet Handling — Do’s & Don’ts

* **Use the helpers:** Always pass inbound values through `safeDecodeMagnet()` before playback, and use `normalizeAndAugmentMagnet()` (see `js/magnetUtils.js`) to append `ws=` or `xs=` hints.
* **Do keep magnets raw:** Store and reuse the literal `magnet:?xt=urn:btih:...` string. Decode once, then feed that exact value to WebTorrent.
* **Don’t call `new URL()` on magnets:** URL constructors/`URLSearchParams` percent‑encode the `xt` payload and can break legacy hashes. Manipulate magnets via the helper utilities or string concatenation.
* **Do encourage HTTP hints:** `ws=` (web seed) should point to an HTTPS file root; `xs=` points to a `.torrent`. They help the fallback path warm up quickly.
* **Don’t ship insecure trackers:** Stick to the WSS tracker list exported from `js/constants.js`. Avoid UDP or plaintext HTTP trackers in browser code.

---

## 3. Upload Modal Troubleshooting

1. **Required fields:** Validation must ensure a title exists and that either a hosted URL or a magnet (or both) is supplied. Optional `ws` / `xs` inputs should be appended only when a magnet is present.
2. **Magnet parsing errors:** When a user pastes encoded magnets, run `safeDecodeMagnet()` before normalizing. Show inline errors if decoding fails.
3. **URL-first promise:** After submission, confirm the resulting feed item carries `data-play-url` and `data-play-magnet` attributes so playback utilities can attempt the URL first.
4. **Mixed-content warnings:** If the page is served over HTTPS, reject `ws=` or `xs=` hints that begin with `http://` and show guidance to upgrade to HTTPS.
5. **Telemetry hooks:** Keep existing analytics/logging untouched unless instructed. If you add new modal states, annotate them clearly in code comments.

---

## 4. Manual QA Checklist

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

## 5. Additional Notes for Agents

* **Nostr interoperability:** Keep kind `30078` events as the source of truth and optionally mirror to kind `1063` so external clients see the hosted URL.
* **Probing:** Lightweight `HEAD`/`GET` requests should back `probeUrl()` so dead URLs can be hidden or flagged without blocking the UI.
* **Extensibility:** Future work (live streams, NIP-96 uploads, analytics) should preserve the URL-first strategy and magnet safety rules above.

**End of AGENTS.md**
