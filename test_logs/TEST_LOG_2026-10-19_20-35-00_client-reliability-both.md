# Both reliability fixes: final validation at181eae95d9bb9626cfbca9904652731fe7cd49aa

- `git merge unstable`: already up to date (contains dispatch routing and profile fix).
- `env -u NODE_TEST_CONTEXT NODE_ENV=test node --import ./tests/test-helpers/setup-localstorage.mjs --test-reporter=spec tests/race/nostr-client-init-race.test.mjs`: exit0 naturally; 1 passed/0 failed/cancelled/skipped, scenario10.32ms, total14.86ms.
- Same direct command for tests/profile-modal-controller.test.mjs: exit0 naturally;27 passed/0 failed/cancelled/skipped,2635.71ms.
- `npm run lint` unrestricted: exit0,11/11 stages. Sandbox git subprocess restrictions were the reason for unrestricted lint, not a code failure.
- `env -u NODE_TEST_CONTEXT UNIT_TEST_TIMEOUT_MS=60000 npm test`: exit0, all425/425 files completed,0 quarantined. Runner emits file outcomes, no aggregate scenario count. The previous profile file220 and race file227 both completed; all198 files beyond the prior blocker were reached.
- Profile mutants: product visibility exclusion removed ->1 failed; fixture hidden-attribute omission ->1 failed. Race mutants: historical early-return init ->1 failed; fixture connection failure ->1 failed. All exited1 and were reverted; no product Nostr files edited. See prior integrity/evidence entries.
- Scope: two test files plus notes/backlog only. No product changes, timeouts/retries/sleeps/forced exits/runner changes. No browser/build/real-signer/real-wallet/production or deploy verification claimed.
- Slowdown: baseline full-suite cutoffs hid the second resource leak; a scenario pass was insufficient to prove process completion. Improvement: a readable per-scenario reporter plus pending-resource diagnostics would distinguish style CPU cost from retained relay retries earlier.
- Normal landing queue submission follows; neither item is closed before durable landing plus unstable verification.
