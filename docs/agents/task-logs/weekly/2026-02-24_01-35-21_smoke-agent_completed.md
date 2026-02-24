# Smoke Agent Task - Completed

**Date:** 2026-02-24
**Agent:** smoke-agent
**Status:** Completed

## Summary
Implemented a new smoke test harness `scripts/agent/smoke-test.mjs` that orchestrates:
1. Local Nostr relay (via `scripts/agent/simple-relay.mjs`).
2. Local App Server (`npx serve`).
3. Headless Browser (Playwright).

The test verifies:
- Navigation to the app.
- Login via `loginWithNsec` (bypassing UI but exercising auth flow).
- Publishing a Video Event (Kind 30078) via `nostrClient` and verifying on relay.
- DM Roundtrip: Sending an encrypted DM (Kind 4) and verifying decryption using the app's `dmDecryptor.js` module.

## Artifacts
- `scripts/agent/smoke-test.mjs`
