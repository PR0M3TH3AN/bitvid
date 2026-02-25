# Protocol Research Report: 2026-02-25

**Agent:** protocol-research-agent
**Date:** 2026-02-25
**Scope:** Initial Protocol Inventory & Compliance Assessment

## Summary

This report documents the initial creation of the `PROTOCOL_INVENTORY.md` file, which tracks external protocol dependencies used by the codebase. It complements the existing `NIP_INVENTORY.md` by expanding the scope to include BitTorrent/WebTorrent, Media Streaming (HLS), Lightning Network (LNURL), and HTTP Auth (NIP-98/Kind 27235).

## Key Findings

### 1. Nostr Protocol (NIPs)
- **Status:** Largely Compliant.
- **Source:** `NIP_INVENTORY.md`
- **Gaps:**
  - **NIP-42 (Auth):** Identified as `Non-compliant`. No `AUTH` command handling found in `js/nostr/client.js` or `js/nostr/pool.js`. This prevents authenticated relay access.
  - **NIP-21 (`nostr:` URI):** Partial support. `js/utils/nostrHelpers.js` handles `npub` but lacks full `nprofile`/`nevent` parsing.

### 2. BitTorrent / WebTorrent
- **Status:** Compliant.
- **Implementation:** `js/magnetUtils.js` correctly handles magnet URI parsing and normalization (`xt`, `ws`, `xs`).
- **Dependencies:** Relies on `webtorrent` (via script tag or build process) and standard WebRTC APIs.

### 3. Media Streaming (HLS)
- **Status:** Dependent on Native Browser Support.
- **Observation:** The codebase accepts `.m3u8` inputs but does not appear to bundle `hls.js` explicitly for cross-browser compatibility on non-Safari platforms (e.g., Firefox/Chrome on Windows).
- **Recommendation:** Verify HLS playback consistency across browsers. If native support is insufficient, consider integrating `hls.js`.

### 4. Lightning Network (LNURL)
- **Status:** Compliant.
- **Implementation:** `js/payments/lnurl.js` implements LUD-06/LUD-16 resolution and Bech32 handling.
- **Validation:** `js/payments/zapReceiptValidator.js` ensures receipt integrity.

## Recommendations

1.  **Prioritize NIP-42:** Implement `AUTH` command handling in `js/nostr/client.js` to enable authenticated relay connections, which is critical for paid or private relays.
2.  **Verify HLS Support:** Conduct a cross-browser test for `.m3u8` playback. If inconsistent, add `hls.js` as a dependency.
3.  **Enhance NIP-21:** Update `js/utils/nostrHelpers.js` to support `nprofile` and `nevent` parsing for better deep linking.

## Artifacts Created

- `PROTOCOL_INVENTORY.md`: New inventory tracking non-NIP protocols.
- `reports/protocol/protocol-report-2026-02-25.md`: This report.
