# Docs Alignment Agent Report

**Date:** 2026-02-16
**Agent:** docs-alignment-agent
**Status:** Completed

## Claims Map

### `docs/nostr-event-schemas.md` vs `js/nostrEventSchemas.js`

| Claim | Code Location | Status | Notes |
|---|---|---|---|
| `NOTE_TYPES.VIDEO_POST` (Kind 30078, `s` tag) | `js/nostrEventSchemas.js` | ✅ | Matches schema definition. |
| `NOTE_TYPES.HASHTAG_PREFERENCES` (Kind 30015, encrypted) | `js/nostrEventSchemas.js` | ✅ | Matches schema definition. |
| `NOTE_TYPES.VIEW_EVENT` (Kind 30079 default) | `js/nostrEventSchemas.js` | ✅ | Matches schema definition. |
| `NOTE_TYPES.DM_ATTACHMENT` (Kind 15, tags) | `js/nostrEventSchemas.js` | ✅ | Matches schema definition. |

### `docs/playback-fallback.md` vs `js/services/playbackService.js`

| Claim | Code Location | Status | Notes |
|---|---|---|---|
| `URL_FIRST_ENABLED` controls priority | `js/constants.js` | ✅ | Derived from `DEFAULT_PLAYBACK_SOURCE`. |
| `deriveTorrentPlaybackConfig` used | `js/playbackUtils.js` | ✅ | Used in session creation. |
| `normalizeAndAugmentMagnet` adds hints | `js/magnetUtils.js` | ✅ | Confirmed existence and usage. |

## Validation Notes

- **Verified Event Schemas**: The documentation accurately reflects the Runtime event definitions.
- **Verified Playback Logic**: The fallback documentation matches the implementation in `PlaybackService`.
- **Verified Logger**: `userLogger.warn`/`error` correctly pass arguments to console, matching documentation intent for operator warnings.

No discrepancies requiring action were found.
