# QA4 causal A/B preparation blocker — 2026-10-26

Source HEAD and unstable `0ffd92a8d2072a19fe61ac6edcf5097a9538fddd` printed by git. QA4 reclaimed; source comparison from filedAt `e04549f816f6ec61f305e20df0ce2b59797c4651` for index.html, js/index.js and css/tailwind.source.css returned no delta. All four existing untracked evidence notes and dirty backlog preserved.

Interpreter mailbox `20261026T134112-interpreter-216b89.md` grants one separately saved360x800 causal A/B after health<75C/load<8/ampleRAM and no peer browser: reproduce failed native checkbox click first, then remove ONLY app.fade-in with unchanged geometry/points and native toggle. Stop on failure without retry. Independent reproduction/listener timing still precedes implementation routing.

Recovery plan: inspect pinned artifacts and dependency provenance; reconstruct missing scratch from verified cache only; syntax-check a distinct runner; launch only after qualifying fresh health; preserve A/B plus cleanup. No product/CSS/test/helper/config changes.

Preparation checks found `/tmp/playback-qa-4-cause-run.cjs` and `/tmp/playback-qa-4-cause-result.json` absent (ls/cat exit1). Prior runtime counts in earlier notes remain reported historical evidence; their raw temporary artifacts are unavailable after restart. Own node_modules is absent; dispatch Playwright/ws/esbuild paths exist, but no dependency was imported or executed.

Fresh health2026-10-26T13:42:06.538Z: max75.1C, load1.98, availableRAM72.7%; fails the grant's <75C prerequisite. Peer .task reads show client browser RELEASED and dispatch reserving QA next brief browser; no peer browser launch performed here.

Exact reconstruction command was an inline Python3 script reading docs/testing/playback-qa-3-buffer-provenance.json, decoding each recorded SHA512 SRI into the local npm-cache content path, requiring both SHA256/SHA512 before extraction. It exited1 on its FIRST archive read:

`FileNotFoundError: /home/user/.npm/_cacache/content-v2/sha512/15/38/82a4dc6dc226591c465b71b4c87198c44552029fdcaafe90c591397de7f031cc3d6768172d37b60eebcae233f80b48363bb1dacc6f2f21a1f00362ebaa38`

This is the recorded genuine buffer6.0.3 archive, expected SHA256555b6f49224afcf6b2c5a9aea7cd34a7f443f395b10532bc5580022d57aa51f5. No archive bytes read/hash checks passed; no package extraction, bundling, network download/install, substitute dependency or app launch. Stop at this preparation blocker as assigned. Need restored verified genuine mirror/cache provenance before an actual-app run; no new grant presumed after release.

Counts: browser0, contexts0, private servers0, readiness0, runtime assertions0, A/B comparisons0, tests/builds/submissions0. No performance or causal qualification. Empty owned scratch directory /tmp/playback-qa-4-ab-20261026 removed by literal rmdir. Preview3000/peer processes untouched; no runtime resources created requiring cleanup.

Original strict horizontal overflow362/360 and394/390 remains open; previous native checkbox failure1/1 remains historical. A/B sufficiency, startup listener timing, original overflow cause, Firefox CI-equivalent failure, real-device and AA remain unverified. No product fix proposed from this attempt.

RELEASE recorded UTC: 2026-10-26T13:43:26.712816+00:00
