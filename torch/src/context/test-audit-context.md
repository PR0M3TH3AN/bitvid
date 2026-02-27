# Test Audit Context

## 2026-02-26: Missing JSDOM Dependency

The `test-audit-agent` identified that the `jsdom` dependency is missing from the project root `node_modules`, causing failures in multiple unit tests that rely on it (e.g., `tests/app/channel-profile-moderation.test.mjs`).

This was detected during the daily audit run where `npm run test:unit` failed with `ERR_MODULE_NOT_FOUND`.

### Affected Files
Multiple test files import `jsdom` directly or via helpers. See `grep` output in task logs for full list.

### Action Taken
- Identified the missing dependency.
- Tests cannot be audited for flakiness reliably until they can run.
- Added this note to context.
- Will create a "Known Issue" entry.

### Next Steps
- The `deps-security-agent` or a developer needs to install `jsdom` as a dev dependency.
- `npm install --save-dev jsdom`
