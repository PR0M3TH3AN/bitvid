# Bitvid — AI Agent Guide (AGENTS.md)

This document tells AI agents how Bitvid works **now** and how to extend it going forward. It focuses on the newly adopted **URL‑first playback with WebTorrent fallback** strategy, minimal code touchpoints, and reliable interop with the Nostr ecosystem.

---

## 1) Mission & Product Direction

**Goal:** Stream videos reliably and cheaply.

* **Primary transport:** a **hosted video URL** (MP4/WebM/HLS/DASH) that plays directly in the browser.
* **Secondary transport (fallback & cost control):** a **WebTorrent magnet** enhanced with **`ws=` (web seed)** and **`xs=` (.torrent URL)**.
* **Behavior:** Try `url` first. If it’s missing or unreachable, **fallback to WebTorrent** using the same post’s magnet. If the magnet includes `ws`/`xs`, WebTorrent can bootstrap via HTTP and/or peers.
* **Nostr interop:** Keep existing kind `30078` events for Bitvid’s app data; optionally **mirror a NIP‑94 kind `1063`** event so other clients can discover the same hosted video URL.
* **Resilience:** Light link‑health probing to hide/flag dead URLs and avoid broken playback.

---

## 2) High‑Level Architecture

* **Frontend app** (vanilla JS + HTML/CSS)

  * **Upload modal** accepts: Title (required), **URL or Magnet** (at least one required), Thumbnail, Description. Optional fields for **`ws`** and **`xs`** help P2P bootstrap.
  * **Feed / Cards** render video posts, each carrying both `data-play-url` and `data-play-magnet` attributes.
  * **Player** uses `playVideoWithFallback({ url, magnet })`: probe `url`; if OK, play via `<video>`; else call `torrentClient.streamVideo(magnet, videoEl)`.
* **Nostr client**

  * Publishes Bitvid’s **kind `30078`** events with content `{ version, title, url?, magnet?, thumbnail?, description?, mode }`.
  * Subscribes to Bitvid video events and (optionally) **NIP‑94 `kind 1063`** to interop with external clients.
* **Optional Upload API** (future): If adding server‑side upload (NIP‑96/98), the client would POST to an uploader, receive an HTTPS URL, then publish events.

---

## 3) Data Contracts

### 3.1 Bitvid app event (kind `30078`)

**Content JSON** (superset; some fields optional):

```json
{
  "version": 2,
  "title": "<string>",
  "url": "https://cdn.example.com/video.mp4",     // optional but recommended
  "magnet": "magnet:?xt=urn:btih:...&tr=...",      // optional but recommended
  "thumbnail": "https://.../thumb.jpg",            // optional
  "description": "<string>",                       // optional
  "mode": "live" | "dev"                          // optional
}
```

**Validation:**

* `title` **required**; **at least one** of `url` **or** `magnet` **required**.
* If `magnet` present and uploader supplied `ws` and/or `xs`, append them to the magnet before publish.

### 3.2 NIP‑94 mirror (kind `1063`, optional but encouraged)

**Tags (typical):**

* `["url", "https://cdn.example.com/video.mp4"]`
* `["m", "video/mp4"]` (or `video/webm`, `application/x-mpegURL`, etc.)
* `["thumb", "https://.../thumb.jpg"]` (optional)
* `["alt", "<title or description>"]` (optional)
* `["size", "<bytes>"]` (optional)
* `["x", "<sha256-of-file>"]` (optional integrity)
* `["magnet", "magnet:?xt=...&ws=...&xs=..."]` (optional for P2P aware clients)

> Agents SHOULD keep Bitvid’s 30078 as the source of truth, and publish a **lossless mirror** into 1063 when possible.

---

## 4) UI & UX Flows

### 4.1 Upload Flow (author)

1. Author opens **Upload modal**.
2. Inputs **Title**, plus **either** Hosted URL **or** Magnet (or both). Optionally adds **Web seed base (ws)** and **.torrent URL (xs)**.
3. Client **augments magnet** with `ws`/`xs` and publishes a kind `30078` event (and optionally a NIP‑94 `1063`).

### 4.2 Consumption Flow (viewer)

1. Feed renders cards with `data-play-url` + `data-play-magnet`.
2. On click: `playVideoWithFallback()`

   * `probeUrl(url)` → If reachable, set `<video>.src = url` and play.
   * Else: `torrentClient.streamVideo(magnet, videoEl)`.
3. UI hides or badges items whose `probeUrl()` fails consistently (cached temporarily).

---

## 5) Key Client Functions (reference)

### 5.1 `augmentMagnet(raw, ws?, xs?)`

* Accepts a magnet URI and conditionally **appends** `ws` and `xs` query params.
* Returns the same magnet if not a `magnet:` scheme.

### 5.2 `probeUrl(url)`

* `HEAD` request to check availability; expects `2xx` and (ideally) `Accept-Ranges: bytes`.
* Fallback small `GET` with `Range: bytes=0-1023` can be used if certain hosts block `HEAD`.
* Returns boolean `ok`.

### 5.3 `playVideoWithFallback({ url, magnet })`

* Try `playHttp(url)` if `probeUrl(url)` passes.
* Else try `playViaWebTorrent(magnet)`.
* Show UI error if neither source available.

### 5.4 `playViaWebTorrent(magnet)`

* Uses existing `torrentClient.streamVideo(magnet, videoEl)` under the hood.
* Benefits if magnet contains `ws`/`xs` for bootstrap.

---

## 6) Markup Contracts

* **Cards:** add both attributes where applicable:

  * `data-play-url="<encoded URL or empty>"`
  * `data-play-magnet="<magnet or empty>"`
* **Click delegate:** look for a closest element bearing either attribute; decode `data-play-url` prior to use.

---

## 7) Server Requirements for Hosted URLs

* **CORS:** allow the app origin (or `*`).
* **Range requests:** ensure `Accept-Ranges: bytes`.
* **Correct MIME:** `video/mp4`, `video/webm`, `application/x-mpegURL`, etc.
* **Optional:** expose `Content-Length` for better UX/progress.

---

## 8) P2P Notes for Agents

* **`ws=` (web seed):** HTTP(S) base path where the file is fetchable; enables WebTorrent to download pieces even with zero peers.
* **`xs=`:** HTTP(S) URL of the `.torrent` metadata so the client can start promptly without DHT/peer discovery.
* **Trackers:** Keep WSS trackers for peer discovery; they reduce CDN load when peers exist.

---

## 9) Interop & Extensions

* **Live streams:** future option via HLS URLs (MIME `application/x-mpegURL`). For Nostr live presence, consider **NIP‑53** events alongside VOD 1063 entries.
* **Adaptive Bitrate + P2P:** if ABR is needed with P2P, consider a segment‑sharing overlay (e.g., p2p segment loaders) rather than WebTorrent.
* **Uploads (optional):** NIP‑96/NIP‑98 flow to obtain a hosted URL, then publish Bitvid/NIP‑94 events.

---

## 10) Testing Checklist (agents)

* **Form validation:** title present; ensure `(url || magnet)` is true; `ws` and `xs` appended only for magnet.
* **Probe:** healthy URL returns `ok=true`; dead URL hides/badges card; cache prevents re‑probing every render.
* **Playback:** URL path plays successfully; disconnect network to force WebTorrent path; verify video plays via magnet.
* **CORS & Range:** verify no console CORS errors; confirm seeking works.
* **Events:** verify kind `30078` contains `url` and/or `magnet`; optional 1063 mirror created correctly.
* **Cards:** both `data-play-url` and `data-play-magnet` present; click handler calls fallback player.

---

## 11) Guardrails & Do/Don’t

**Do**

* Fail soft: when URL fails, fall back to magnet without blocking UI.
* Prefer standards: URL + NIP‑94 mirror when possible.
* Degrade gracefully when `ws`/`xs` missing; torrent should still work with peers.

**Don’t**

* Don’t require magnet if URL is provided (and vice versa).
* Don’t assume CORS/Range are configured—probe and message helpfully.
* Don’t block the main thread with large HEAD/GETs; keep probes lightweight with timeouts.

---

## 12) Quick Reference (snippets)

**Bitvid content object (30078)**

```js
const content = {
  version: 2,
  title,
  url,            // optional but preferred
  magnet,         // optional but preferred
  thumbnail,      // optional
  description,    // optional
  mode            // "live" | "dev"
};
```

**Magnet augmentation**

```js
function augmentMagnet(raw, ws, xs) {
  if (!raw) return "";
  const u = new URL(raw);
  if (u.protocol !== "magnet:") return raw;
  if (ws) u.searchParams.append("ws", ws);
  if (xs) u.searchParams.append("xs", xs);
  return u.toString();
}
```

**Playback with fallback**

```js
async function playVideoWithFallback({ url, magnet }) {
  if (url && await probeUrl(url)) return playHttp(url);
  if (magnet) return playViaWebTorrent(magnet);
  throw new Error("No playable source");
}
```

---

## 13) Roadmap Hooks (where to extend)

* **Analytics:** Keep using your existing 30078 analytics/logging. Add fields for `play_source: "url"|"torrent"` to measure cost savings.
* **Integrity:** Optionally compute SHA‑256 of the hosted file (off‑thread) and publish as NIP‑94 `["x", hash]` tag.
* **Moderation:** Add a background task to periodically probe and mark dead links; publish a lightweight status event so other Bitvid clients learn from each other.

---

**End of AGENTS.md**
