# HLS cancellation independent reproduction

- Source under test: worker clean branch d04d501e (git log printed), actual observer/controller/cache/probeHlsManifest via /tmp/client9-hls-repro.mjs. Script inspected; controlled fetch/timers/JSDOM, no network.
- Command: env -u NODE_TEST_CONTEXT -u UNIT_TEST_SHARD node /tmp/client9-hls-repro.mjs
- Result: natural exit1,12 tests,7pass/5fail/0cancelled/0skipped,165.167587ms. Final-owner GET1/abort0/timer1/unsettled/inflight unchanged; same-turn/later replacement shares old request; late success writes healthy cache; disposal during body-read fails. Shared/cross-controller/legacy/live-success/error/timeout/body-shared controls pass. Media slots0/queue0, disposed badge checking.
- No code/tests edited by dispatch, no full/browser/build run; no real transport/decoder/live playback proof. Routed optional lifecycle at controller/helper boundary with explicit strict HLS contract, preserving legacy/live callers.
