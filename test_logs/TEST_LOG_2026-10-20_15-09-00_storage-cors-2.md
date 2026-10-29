# storage-cors-2 pre-full checks
- Baseac99ae9a6bdbeae555a30f659b0720ae67e777e8; item2 claimed,git diff filedAt7f99c045→HEAD r2Service empty before implementation.
- `env -u NODE_TEST_CONTEXT NODE_ENV=test node tests/storage-delete-malformed-settings.test.mjs`:exit0,13/13 scenarios. Original HEAD method via scratch harness:exit1,9/13 failed.
- `python3 /tmp/storage-cors-delete-mutants.py`:exit0,all7 broken method variants rejected(exit1) and restored. Every retained scenario fails under at least one.
- `env -u NODE_TEST_CONTEXT node scripts/run-unit-tests.mjs storage-delete-malformed-settings r2-delete-video-storage delete-storage-locked storage-key-collision`:exit0,4/4 files,24scenarios.
- `env -u NODE_TEST_CONTEXT npm run lint`:exit0,11 checks(sandbox permission for read-only Git child as before).
- `env -u NODE_TEST_CONTEXT npm run build`:exit0 incl deploy-artifact verification.
- `git diff --check`:exit0. Full/browser not run; full/normal slot requested15:08:52UTC. No real delete/network/cloud/signer/private-data use.
