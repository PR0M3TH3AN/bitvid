# client-reliability-1 initial evidence (startup HEAD 9e6c310d)

- `npm ci --ignore-scripts --offline --cache /tmp/client-reliability-npm-cache`: exit 1, ENOTCACHED. Default-cache `npm ci --ignore-scripts --offline`: exit 0, 441 packages installed, zero audit vulnerabilities.
- GitHub PR-overlap API read: exit 6, DNS unavailable; no PR opened, fleet assignment reserves scope.
- Initial direct node run: exit 1, missing jsdom before install.
- `env -u NODE_TEST_CONTEXT UNIT_TEST_TIMEOUT_MS=60000 node scripts/run-unit-tests.mjs profile-modal-controller.test.mjs`: exit 1, timed out at 60000ms.
- Unbounded direct node baseline with temporary start/end tracing: exit 0 naturally, 26 tests passed, 0 failed/cancelled/skipped, 57041.55ms. Tracing removed. An earlier unbounded diagnostic was interrupted (130), no result claimed.
- CPU-profiled Escape scenario: exit 0, 1 test passed, 3703.35ms total. Largest sampled costs include CSS color serialization/border normalization; no client defect established.
- With final CSS fixture, direct node isolated suite: exit 0 naturally, 27 passed, 0 failed/cancelled/skipped, 2840.18ms.
- Deliberate product mutant removing display/visibility filtering: final regression exits 1, 1 failed/0 passed, hidden control IDs appear in actual focus list. Product restored byte-for-byte. Initial DOM-object diff diagnostic interrupted (130); replaced with control-ID diagnostics, no assertion relaxation.
- Initial sandbox lint: exit 2, git subprocess EPERM. Unrestricted lint then exposed forbidden direct style assignments in test fixture; corrected to fixture stylesheet classes. `npm run lint` unrestricted final run: exit 0, all 11 stages passed.
- Early full-unit diagnostic interrupted (130) before completion while final fixture was being prepared; no full pass claimed. Final committed/merged-tree checks follow in a separate log.
