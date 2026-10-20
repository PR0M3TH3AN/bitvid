# storage-cors-1 final pre-submit checks
- Product2fb6a536568eeb5b4cc04257255f98cde34b7f66; newest unstable merge bfa36a3f350d6a9751a1a43c83fc890c855091fc.
- Slot granted13:58:27UTC; requested13:42:38UTC; resource wait949s. Start acknowledgement13:58:42UTC. Full completed14:03:49UTC.
- `env -u NODE_TEST_CONTEXT UNIT_TEST_TIMEOUT_MS=60000 npm test`: exit0,428/428 files, no failed/cancelled files (normal runner,60s/file diagnostic).
- `env -u NODE_TEST_CONTEXT node scripts/run-unit-tests.mjs storage-cors-preservation storage-cache-control multipart-empty-file-guard`:exit0,3/3 files,13 scenarios.
- `env -u NODE_TEST_CONTEXT npm run lint`:exit0,11 checks, read-only git subprocess permission as before.
- `env -u NODE_TEST_CONTEXT npm run build`:exit0 including deploy-artifact verifier.
- No new product changes since10 rejected/restored mutants/9 CORS scenarios. No weakened assertions/retries/sleeps.
- Pending normal queue/durable status+ancestry before closure. No cloud/browser/concurrent-writer qualification; preserve preview3000. IAM/read permission and lost updates from concurrent non-CAS policy writes remain limitations.
