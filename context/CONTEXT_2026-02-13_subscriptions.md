# Context

- **File:** `js/subscriptions.js`
- **Reason:** Migrating `innerHTML` assignments to safe DOM APIs as part of security hardening.
- **Date:** 2026-02-13
- **Commit:** (will be added)
- **Node:** v22.22.0
- **npm:** 11.7.0

## Plan

1.  Replace `innerHTML` assignments with `textContent` where possible.
2.  Implement `renderStatusMessage` helper for simple messages.
3.  Implement `renderLoadingIndicator` helper to replace `getSidebarLoadingMarkup`.
4.  Verify changes with lint and tests.
5.  Update `check-innerhtml` baseline.
