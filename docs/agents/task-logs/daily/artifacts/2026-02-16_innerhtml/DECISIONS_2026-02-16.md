# Constant Refactoring Decisions

## 2026-02-16

- **5000 ms used for UI toast duration:**
  - Chosen canonical constant: `SHORT_TIMEOUT_MS` (from `js/constants.js`)
  - Location: `js/ui/videoModalController.js`
  - Reason: `SHORT_TIMEOUT_MS` is already 5000 and semantically fits "short timeout" for auto-hiding status.

- **5000 as MAX_BLOCKLIST_ENTRIES:**
  - Chosen canonical constant: `MAX_BLOCKLIST_ENTRIES`
  - Location: `js/constants.js`
  - Reason: `MAX_BLOCKLIST_ENTRIES` was defined locally in `js/userBlocks.js`. Extracted to `js/constants.js` to centralize limits.

## 2026-02-16 - deps-security-agent
- **jsdom**: Upgraded to `28.1.0` (Safe patch/minor upgrade verified by tests).
