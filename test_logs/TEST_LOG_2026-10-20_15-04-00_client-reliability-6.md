# Item6 profile history wiring audit

## State and scope

- Audit executed atd88716e3c6351468a53bc7fdb84fe912c01697b5; actual profile/history product files unchanged from filedAt7f99c045. Subsequently merged verified assignment/QA metadata tobbf57388cb4724ff915c2090cf29506bce2c69f7 and claimed item6. `git diff --exit-code d88716e3..HEAD -- js/ui/profileModalController.js js/historyView.js js/ui/watchHistoryController.js js/watchHistoryService.js tests/profile-modal-controller.test.mjs`: exit0. No unnecessary reruns after unchanged product merge.
- Initial claim returned no item while normal assignment metadata was behind QA gate. Dispatch explicitly authorized continued read-only evidence before prose landing; claim succeeded once metadata landed. QA expensive slot respected: no full/browser/build/normal-gate launch.
- No product or committed test edits; unique evidence/scratch only. NIP51/33 and Known Issues reviewed. No private data, real signer/relay/cloud/wallet activity.

## Coverage inventory

- `rg -n 'createWatchHistoryRenderer|onHistoryReady' tests/profile-modal-controller.test.mjs tests/watch-history.test.mjs`: profile test imports actual factory but injects fake renderer at1386; its history test checks lazy initialization/pause/resume. No removal is invoked and captured config's remove callback is not exercised. Other actual renderer construction is feed-registration/service-fallback case atwatch-history.test.mjs2306, not profile removal.
- `rg -l 'profileHistory|profilePaneHistory|handleRemove\(|remove-history' tests --glob '*.mjs' --glob '*.ts'`: profile file plus two menu markup test files. E2E search profileNavHistory/profileHistoryClear/profilePaneHistory has no matches; standalone history-view E2E clear is not this profile config path.
- Existing lower-layer removal/controller/snapshot suites exercise local persistence, synced replace options, last-item clear and disabled behavior independently of profile renderer wiring. Their coverage does not reject the historical profile override (confirmed behaviorally below).

## Real wiring diagnostic

Scratch `/tmp/bitvid-client-reliability-6-history-audit.mjs`, finalSHA256c9f7cc21426d930d37ecf7a5edc4dfff5c99fdc6b2bcceb5b637959730f6c812. Actual ProfileModalController constructor/ensureProfileHistoryRenderer config→actual createWatchHistoryRenderer→actual profile DOM remove click→default remove selecting actual WatchHistoryController→actual watchHistoryService. Wrapper only observes returned handleRemove promise for deterministic event completion; it calls the original method. Controlled actor/fetchHistory boundary uses actual local service and fake synced publish/read backend; required unrelated profile services are empty shims. Actual component markup is used. No modal.load/show, application bootstrap, live signer/relay or full reload claim.

Commands: `env -u NODE_TEST_CONTEXT NODE_ENV=test node /tmp/bitvid-client-reliability-6-history-audit.mjs <mode> [--historical-noop]`.

- `local`: natural exit0. Seed2 real local queue items,click remove first; renderer/service retain only audit-keep. Fake publish calls0,errors0,forbidden fetch/WebSocket0. Actual profile Clear local history button empties real local queue; renderer recreation reads empty. Logs `/tmp/item6-local.log`.
- `synced`: natural exit0. Actual removal leaves audit-keep in renderer/fake backend; exactly2 fake publish-boundary calls (service snapshot plus controller list update),both replace:true/actorPubkey actor/reducedlist; second source remove-item. Renderer recreation retains only audit-keep. No-op calls0/errors0/forbidden network0. Logs `/tmp/item6-synced-final.log`. Fake backend substitutes signing/relay/publish serialization; no real encrypted-event or all-relay acceptance proof.
- Local and synced `--historical-noop`: each naturally exits1 AFTER destroy/reset/DOM cleanup,deepStrictEqual actual[audit-first,audit-keep] expected[audit-keep]. Historical runtime config override routes remove to callbacks.onHistoryReady returning null: no-op1,publish0;removed item reappears after renderer's real refresh and remains in backing state. Logs `/tmp/item6-noop-local.log`,`/tmp/item6-noop-synced.log`. Earlier versions of diagnostic preceded extra synced actor/source assertions; those assertions only execute in non-mutant synced branch and final synced run verifies them.
- Initial scratch fixture failed controller's required-services contract before any audited action; supplied unrelated required service objects and reran. That fixture setup error is not a product failure.

## Existing suite mutant escape

Preloader `/tmp/item6-historical-noop-preload.mjs`,SHA2561d4209ef87dc9732876d12411999a2b7a232561f2ec1ab46bacdcad1db0cc890 injects same historical no-op into actual ProfileModalController prototype entirely at runtime. No source/test file edits.

- `env -u NODE_TEST_CONTEXT NODE_ENV=test node --import ./tests/test-helpers/setup-localstorage.mjs tests/profile-modal-controller.test.mjs`: natural exit0,27pass/0fail/0cancelled/0skip; duration7635.26ms (`/tmp/item6-existing-profile-baseline.log`).
- Same command plus `--import /tmp/item6-historical-noop-preload.mjs`: natural exit0,27pass/0fail/0cancelled/0skip; duration7085.08ms (`/tmp/item6-existing-profile-mutant.log`). This deliberately reintroduced bug escapes all existing profile assertions.
- `env -u NODE_TEST_CONTEXT node scripts/run-unit-tests.mjs watch-history-local-remove watch-history-controller-local-remove watch-history-remove-snapshot`: natural exit0,3files/8scenarios. These are lower-layer controls, not profile wiring qualification (`/tmp/item6-existing-history-layers.log`).

## Classification and proposed scope

Missing high-value regression, not a demonstrated current product failure: real local and fake-synced wiring currently works, but original no-op bug survives current profile suite. Proposed test-only `tests/profile-history-removal-wiring.test.mjs` plus unique integrity/evidence, using actual profile/factory/DOM/default remove/controller/local service; controlled synced read/publish only. Acceptance: local remove persists, local clear/recreation empty, synced reducedlist replacement options and recreation correct; historical no-op must fail after deterministic cleanup. Preserve assertions and reject source-string-only/fake-renderer substitutes. No app/history-service/cache/product edits needed.

Sent concrete evidence/proposed test scope to dispatch; awaiting retained-test routing before any committed test changes. Unverified: real Nostr/signing/encryption/relay persistence, full application/modal lifecycle/reload, synced Clear-local behavior versus encrypted-list clearing, manual user confirmation and other TODO2 feed/view coverage (separate area). No full/browser/build/routing/landing readiness claim.
