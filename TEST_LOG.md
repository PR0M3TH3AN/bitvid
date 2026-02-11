# Test Log

## Environment
- Branch: unstable
- Node version: v22.22.0

## Manual Verification

### Benchmark: Relay Concurrency
- Script: `benchmarks/relay_concurrency_repro.mjs`
- Before: Unbounded (20 requests)
- After: Bounded (3 requests)
- Result: PASS

### Unit Tests
- Command: `npm run test:unit`
- Result: PASS (13 tests passed in app-batch-fetch-profiles, etc., 12 tests passed in NostrClient)
- Note: `nostr-tools` warning in benchmark is expected in Node env.

## Docs Audit
- Page: `content/docs/guides/upload-content.md`
- Claims Verified:
  - File types: Matches HTML accept attribute.
  - Size limits: 2GB recommendation matches browser RAM constraints.
  - Upload methods: Direct, External, Magnet supported.
  - CORS: Automatic configuration verified in `js/services/s3Service.js`.
  - HTTPS: Enforced in `js/services/videoNotePayload.js` and docs.
- Result: No discrepancies found.
