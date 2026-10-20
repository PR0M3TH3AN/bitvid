# client-reliability-4 ready on ce1381f50011aa71986b53c27def1b4f5aa33a44

- `git merge unstable`: already up to date; product/tests unchanged after commit. No rebase.
- `env -u NODE_TEST_CONTEXT UNIT_TEST_TIMEOUT_MS=60000 npm test`: natural exit0, all427/427 unit files,0 quarantined. `/tmp/item4-full.log` contains427 Running entries and final all-pass. Aggregate scenario count is not exposed by runner.
- `npm run lint` on committed merged tree with approved git subprocess access: exit0, all11 stages (`/tmp/item4-lint-committed.log`). Original sandbox attempt failed EPERM, no gate relaxed.
- `npm run build` on committed merged tree: exit0 including deploy-artifact verification (`/tmp/item4-build-committed.log`).
- Focused4 files/22 scenarios pass; new lifecycle12/12,0 failed/cancelled/skipped.13 deliberately broken variants rejected/reverted; full mapping in TEST_INTEGRITY.md. Initial incorrect inherited --test-context invocation not counted.
- `node /tmp/item4-browser.mjs` with approved loopback/browser access: exit0, Chromium+Firefox built-dist/native IntersectionObserver and controlled external media/fetch boundary. Each0 obsolete starts,3 initial media and final active0/queued0; shared live badge healthy/disposed checking; hidden reveal and hosted/torrent source-health visibility pass;0 page errors/external requests. Browser cache is a service twin; unit uses actual state/cache. Closed owned resources, released reservation, preview3000 untouched.
- Baseline at4c54858c: queued obsolete starts1(expected0), independent dispatch reproduction confirmed. Regression fixed0; no CPU/RSS measurement/claim.
- Remaining before completion: normal landq/durable landed status/unstable ancestry, backlog close and dispatch events. Unverified/out of scope: active HEAD/media/HLS/torrent abort, native media decoding/playback fallback/live peers, full Stage3, production/signers/wallet/deploy.
