# Protocol Inventory

This document tracks external protocol and specification dependencies used by the codebase. It complements `NIP_INVENTORY.md` which specifically tracks Nostr Implementation Possibilities.

## 1. Nostr (NIPs)

For a detailed inventory of supported NIPs (Nostr Implementation Possibilities), please refer to [NIP_INVENTORY.md](./NIP_INVENTORY.md).

**Summary of Key NIPs:**
- **NIP-01:** Basic Protocol Flow (Compliant)
- **NIP-71:** Video Events (Partial/Compliant)
- **NIP-94:** File Metadata (Compliant)
- **NIP-44:** Encrypted Payloads (Compliant)

## 2. BitTorrent / WebTorrent

| Protocol | Spec | Source URL | Implementation | Status |
|----------|------|------------|----------------|--------|
| **BitTorrent** | BEP-0003 | [bittorrent.org](http://www.bittorrent.org/beps/bep_0003.html) | `js/services/playbackService.js` | Compliant (via WebTorrent) |
| **Magnet URI** | BEP-0009 | [bittorrent.org](http://www.bittorrent.org/beps/bep_0009.html) | `js/magnetUtils.js` | Compliant |
| **WebSeed** | BEP-0019 | [bittorrent.org](http://www.bittorrent.org/beps/bep_0019.html) | `js/magnetUtils.js` | Compliant |
| **WebTorrent** | WebRTC-based BitTorrent | [webtorrent.io](https://webtorrent.io/docs) | `js/services/playbackService.js` | Compliant |

**Notes:**
- `js/magnetUtils.js` implements parsing and normalization of magnet links, ensuring `xt`, `ws`, and `xs` parameters are handled correctly.
- `js/services/playbackService.js` handles the fallback logic between HTTP and WebTorrent playback.

## 3. Media Streaming

| Protocol | Spec | Source URL | Implementation | Status |
|----------|------|------------|----------------|--------|
| **HLS** | RFC 8216 | [rfc-editor.org](https://datatracker.ietf.org/doc/html/rfc8216) | Native Browser / `video` tag | Compliant |

**Notes:**
- The application supports `.m3u8` (HLS) playback natively via the browser's video element (Safari) or via HLS.js if integrated (currently relies on browser/device native support or passthrough).
- Inputs in `components/upload-modal.html` accept `.m3u8` and `.ts` files.

## 4. Lightning Network (LNURL)

| Protocol | Spec | Source URL | Implementation | Status |
|----------|------|------------|----------------|--------|
| **LNURL** | LUD-01, LUD-06, LUD-16 | [github.com/lnurl](https://github.com/lnurl/luds) | `js/payments/lnurl.js` | Compliant |
| **Zap Requests** | NIP-57 | [nips.be](https://github.com/nostr-protocol/nips/blob/master/57.md) | `js/payments/zapRequests.js` | Compliant |

**Notes:**
- `js/payments/lnurl.js` implements Bech32 decoding/encoding and LNURL resolution.
- `js/payments/zapReceiptValidator.js` validates receipts against the LNURL server's public key.

## 5. HTTP & Authentication

| Protocol | Spec | Source URL | Implementation | Status |
|----------|------|------------|----------------|--------|
| **Nostr HTTP Auth** | NIP-98 / Kind 27235 | [nips.be](https://github.com/nostr-protocol/nips/blob/master/98.md) | `js/services/r2Service.js` | Compliant |
| **S3 / R2 API** | AWS S3 Compat | [aws.amazon.com](https://docs.aws.amazon.com/s3/) | `js/services/r2Service.js` | Compliant |

**Notes:**
- `js/services/r2Service.js` uses NIP-98 style authentication for uploads to compatible storage services (Cloudflare R2).

## Compliance & Remediation

- **NIP-42 (Auth):** Marked as `Non-compliant` in `NIP_INVENTORY.md`. Remediation involves implementing `AUTH` command handling in `js/nostr/client.js`.
- **HLS:** Reliance on native browser support might limit compatibility on some desktop browsers (Firefox/Chrome on Windows without extensions). Consider integrating `hls.js` if not already present.
