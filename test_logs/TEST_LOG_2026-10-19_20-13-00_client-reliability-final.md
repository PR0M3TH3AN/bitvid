# client-reliability-1 final-tree validation: dbdac18df1a4957cf15f47afdb205e28d7cb1724

- Branch contains unstable e106a15e, merged at d0224078; final `git merge unstable` reported already up to date.
- `env -u NODE_TEST_CONTEXT NODE_ENV=test node --import ./tests/test-helpers/setup-localstorage.mjs --test-reporter=spec tests/profile-modal-controller.test.mjs`: exit 0 naturally; 27 tests passed, 0 failed/cancelled/skipped/todo; 2442.95ms.
- `npm run lint` (unrestricted because sandbox git subprocess EPERM): exit 0, all 11 lint stages passed.
- `env -u NODE_TEST_CONTEXT UNIT_TEST_TIMEOUT_MS=60000 npm test`: exit 1. 227/425 files started; first 226 exited 0 including tests/profile-modal-controller.test.mjs; file 227 tests/race/nostr-client-init-race.test.mjs aborted after 60000ms. 198 files not run. Full suite is NOT green. Runner reports file outcomes, not an aggregate scenario count.
- Product filtering mutant: exit 1, 1 failed/0 passed. Fixture hidden-attribute mutant: exit 1, 1 failed/0 passed. Both restored. No product source changes remain.
- Not verified: later 198 unit files, browser behavior, full application CSS/layout, signer/wallet/network behavior, build, release/deployment. Test-only change; no browser/build qualification claimed.
- No queue submission while full gate is blocked. Dispatch notified via mailbox 20261019T201304-client-reliability-a7c828.md of the newly exposed unowned race-suite timeout; waiting for routing/scope decision.
- Read-only isolated race diagnostic: `env -u NODE_TEST_CONTEXT NODE_ENV=test timeout 10s node --import ./tests/test-helpers/setup-localstorage.mjs --test-reporter=spec tests/race/nostr-client-init-race.test.mjs`: exit124; its single test reports PASS in60.91ms, then process retains background relay retries. This is a retained-resource/harness-cleanup boundary, distinct from the profile suite's synchronous style cost. No race or Nostr source changed.
