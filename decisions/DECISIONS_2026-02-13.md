# Decisions 2026-02-13

## PlaybackService Documentation
- **Target File:** `js/services/playbackService.js` was selected due to its high complexity and criticality (core video playback).
- **Documentation Strategy:**
    - Created a separate `docs/playbackService-overview.md` to avoid cluttering the source file excessively (already grandfathered large).
    - Focused inline comments on the `execute()` flow to clarify the hybrid strategy (URL vs Torrent).
    - Trimmed JSDoc params to fit within the file size limit (grandfathered + 50 lines).
- **Test Failures:**
    - Unit tests `playbackService_*.test.mjs` failed significantly (12 failures).
    - **Confirmed Pre-Existing:** Reverted changes and ran the same tests, failures persisted.
    - **Decision:** Proceed with documentation changes as they are purely cosmetic (comments/JSDoc) and verified not to introduce runtime errors. The failing tests are out of scope for this documentation task.
