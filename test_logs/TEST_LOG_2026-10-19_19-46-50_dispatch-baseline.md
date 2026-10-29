# Dispatch startup baseline — d9059116

- Initial `npm test`: exit 1, first file could not import nostr-tools (dependencies absent). No client correctness conclusion.
- Initial `npm run lint`: exit 127, stylelint absent.
- `npm ci --ignore-scripts --cache /tmp/bitvid-dispatch-npm-cache --no-audit --no-fund`: exit 0, installed 441 packages. No package/lockfile edits requested.
- `npm run lint` after install: exit 2, lint:css passed, lint:hex stopped at `spawnSync git EPERM`; sandbox restriction. Unrestricted rerun in progress.
- `UNIT_TEST_TIMEOUT_MS=60000 npm test`: running; retain per-file bound rather than wait indefinitely on a hanging suite.
- Public GitHub open PR list: 0. Local landing queue: 0, no drain running. Fleet backlog: 0 dispatch items.
- Not verified: browser behavior, real signers, production behavior, full baseline completion. No workers started.
