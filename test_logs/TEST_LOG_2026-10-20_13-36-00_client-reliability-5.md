# Item5 precommit evidence

- `env -u NODE_TEST_CONTEXT node tests/url-health-lifecycle.test.mjs` before guard: natural exit1,16pass/2fail/0cancelled, disposed active primary and later-mirror cases fail. After guard and formatting: natural exit0,18/18,0 failed/cancelled/skipped (`/tmp/item5-lifecycle-final.log`).
- `python3 /tmp/item5-mutants.py`: six/six reverted variants naturally exit1 with named assertion failures,0 cancelled; no timeouts or survivors. Unique integrity mapping test_logs/TEST_INTEGRITY_client-reliability-5.md.
- `env -u NODE_TEST_CONTEXT node scripts/run-unit-tests.mjs url-health health-disposal`: natural exit0,4 files/28 scenarios (lifecycle18,controller4,multisource4,view lifecycle2). `/tmp/item5-focused.log`.
- `env -u NODE_TEST_CONTEXT npm run lint` with approved git subprocess access: exit0,11 stages (`/tmp/item5-lint.log`).
- `env -u NODE_TEST_CONTEXT npm run build`: exit0 including artifact verification (`/tmp/item5-build.log`). No dependency/runner/gate changes.
- First mailbox_read tool review hit its deadline; accumulated visible tool waits at least57s, exact approval wall duration not separately instrumented. It was a tool/approval stall, not product failure or rejection. One permitted retry succeeded; pickup mailbox sent13:27:49 UTC.
- Full-suite/browser slots requested13:32:54 UTC. Dispatch queued local full slot behind administrative drain and reserves initial browser to QA; no full/browser launches made. Full-slot wait duration will be measured through grant, not inferred from silence.
- Current code/tests based on0c1dd7e8 plus notes-only140618f8; final verified unstable merge, full/browser grants/checks, unchanged normal landing/durable ancestry remain. Active abort,real decoding/playback/live peers/CPU and whole Stage3 unverified.
