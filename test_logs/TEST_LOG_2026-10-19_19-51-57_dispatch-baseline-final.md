# Startup verification — d9059116

- `npm ci --ignore-scripts --cache /tmp/bitvid-dispatch-npm-cache --no-audit --no-fund`: exit 0; 441 packages installed.
- `npm run lint` outside sandbox: exit 0, all 11 lint checks. Earlier sandbox run stopped at git-grep EPERM (exit 2); pre-install runs lacked dependencies.
- `UNIT_TEST_TIMEOUT_MS=60000 npm test`: exit 1; 219 test files exited 0; tests/profile-modal-controller.test.mjs timed out at 60000ms as file 220 of 425; 205 untested. Count is files, not individual assertions.
- `UNIT_TEST_TIMEOUT_MS=60000 node scripts/run-unit-tests.mjs profile-modal-controller.test.mjs` outside sandbox: exit 1, same 60000ms timeout. No test code changed. Root cause not yet diagnosed.
- Actual ProbeQueue class, concurrency 1: 1 waiting job, 1 eventual start, no cancel method; exit 0. Isolated queue observation only, not navigation/CPU measurement.
- GitHub public API: 0 open PRs. Fleet initial landing queue: 0; no drain. Initial worker roster: dispatch only.
- `git diff --check`: exit 0 for tracked documentation changes.
- Not verified: 205 remaining unit files, browser QA, real signers, live-site behavior, build/release qualification. No product code or tests changed.
