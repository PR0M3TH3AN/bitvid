# WebTorrent Architecture & Strategy

This document details the architecture of the WebTorrent implementation in bitvid, focusing on the client management, Service Worker integration, and the critical logic for handling webseeds.

## Core Principle: Webseeds Are Peers

**Crucial Logic (Regression Risk):**
A recurring regression in this codebase involves treating "Webseeds" (HTTP sources) as distinct from "Peers" (P2P sources) in a way that marks webseed-only videos as "unhealthy".

**The Correct Behavior:**
*   We **must** pass webseeds (`urlList`) directly to the WebTorrent client via `client.add(url, { urlList: [...] })`.
*   We **must** rely on the WebTorrent client to count that webseed as a connected peer.
*   **Health = Peers > 0**. If a webseed connects, `numPeers` becomes 1. This is "Healthy".

**Anti-Pattern (Do Not Implement):**
*   *Do not* attempt to manually check if `peers === 0 && hasWebseed` and label it as a special "healthy" state in the UI logic.
*   *Do not* fail to pass `urlList` to `client.add`. If you don't pass it, WebTorrent won't see the peer, `numPeers` stays 0, and the video is marked unhealthy.

## Architecture Components

### 1. The Singleton Client (`TorrentClient`)
`js/webtorrent.js` exports a singleton `torrentClient`. We do not instantiate multiple clients.
*   **Reason:** WebTorrent clients are expensive. They open many socket connections and maintain DHT state.
*   **Reuse:** The same client instance is used for both "Probing" (checking health) and "Streaming" (playback).

### 2. The Service Worker (`sw.min.js`)
Browser-based WebTorrent cannot write directly to the filesystem or stream directly to a `<video>` tag's `src` attribute efficiently.
*   **Solution:** We register a Service Worker that acts as a proxy.
*   **Flow:** `<video src="/webtorrent/...">` -> Browser Network Request -> Service Worker Intercept -> Fetch bytes from `TorrentClient` -> Return stream.

### 3. The "Claim" Dance (Critical Startup Logic)
A major source of "grey screen" bugs (video loading forever) occurs when the Service Worker is installed but **not controlling the page**.
*   **Scenario:** User loads page -> SW installs -> User plays video. If the SW hasn't "claimed" the client, the network request bypasses the SW and fails (404).
*   **Fix:** `TorrentClient.init()` explicitly waits for `navigator.serviceWorker.controller` to exist. It calls `clients.claim()` in the SW and waits for the `controllerchange` event.

## Probing Strategy (`probePeers`)

We probe videos before playing them to determine if they are available.
1.  **Input:** Magnet URI + optional Webseed URL.
2.  **Action:** Call `client.add` with `urlList` set to the webseed.
3.  **Wait:** Wait for `torrent.on('wire')` (connection established) or `peers > 0`.
4.  **Result:**
    *   **Healthy:** `peers > 0`. (Includes webseeds!)
    *   **Unhealthy:** Timeout with `peers === 0`.

## Browser Specifics

*   **Brave:** Requires aggressive Service Worker cleanup (`unregister` all) on startup due to lingering stale workers preventing new registrations.
*   **Firefox:** Uses a specific `highWaterMark` tuning and separate handler (`handleFirefoxTorrent`) to manage memory buffering differences.
*   **Chrome/Chromium:** Standard path (`handleChromeTorrent`), but includes logic to strip specific trackers/webseeds that trigger CORS warnings (e.g., specific demo trackers).
