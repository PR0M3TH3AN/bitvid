# Daily Performance Report - 2026-02-18

**Summary:** Bounded concurrency in `authService` profile hydration; verified upload docs.

## Findings & Fixes
- **P0 Fix:** `js/services/authService.js` was launching unbounded concurrent requests for profile hydration.
  - **Fix:** Implemented `pMap` with `RELAY_BACKGROUND_CONCURRENCY` (3) for background relays.
  - **Impact:** Prevents network saturation for users with many relays.
- **Docs Audit:** Verified `content/docs/guides/upload-content.md` correctly specifies port 3000 for CORS. No changes needed.

## Metrics
- **Tests:** `tests/authService.test.mjs` and `tests/auth-service.test.mjs` passed.

## Artifacts
- Updated `CONTEXT.md`, `TODO.md`, `DECISIONS.md`, `TEST_LOG.md`.
