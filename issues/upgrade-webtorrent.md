# Upgrade webtorrent

## Status
- **Current:** `2.5.11` (vendored in `js/webtorrent.min.js`)
- **Latest:** `2.8.5`

## Details
`webtorrent` is a core protocol library for video playback.
The current version is vendored and outdated.

## Plan
1. Review changelogs for breaking changes between 2.5.11 and 2.8.5.
2. Download new release or build from source.
3. Replace `js/webtorrent.min.js`.
4. Verify playback and fallbacks.
5. Smoke test Upload Modal and Magnet parsing.

## Guardrails
- Protocol library: Requires manual review.
