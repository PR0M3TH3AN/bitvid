# Daily Known Issues Agent Report

- **Date:** 2026-02-14
- **Agent:** known-issues-agent
- **Status:** Completed

## Summary

Verified all entries in `KNOWN_ISSUES.md`.

## Actions

1. **Tests / Visual Regression Tests**:
   - Status: **Verified** (Passing)
   - Initial run failed with "Executable doesn't exist".
   - Executed `npx playwright install` successfully.
   - Re-run `npm run test:visual`: 44 passed.
   - Updated `KNOWN_ISSUES.md` with new status.

2. **Tests / Skipped Tests**:
   - Status: **Verified** (None skipped)
   - Ran `npm run test:unit`: All passed, 0 skipped.
   - Updated `KNOWN_ISSUES.md` last checked date.

3. **Environment / Playwright Browsers**:
   - Status: **Verified** (Issue persists without installation)
   - Confirmed that `npx playwright install` is required in a fresh environment.
   - Updated `KNOWN_ISSUES.md` last checked date.

## Linting

`npm run lint` passed.
