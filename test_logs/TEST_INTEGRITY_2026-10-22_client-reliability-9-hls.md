# HLS health lifecycle integrity

```yaml
test_integrity_note:
  change_type: [new_tests, spec_correction]
  scenarios:
    - id: SCN-hls-owner-cancel
      given: "Actual observer/controller/helper with pending manifest fetch or body read"
      when: "Final owner disposes, including duplicate disposal and ignored/missing abort"
      then: "Prompt null, aborted when supported, timer cleanup once, no obsolete cache or mirror or badge"
    - id: SCN-hls-replacement
      given: "Cancelled HLS work and new same-source observer in same turn or later"
      when: "Old success, error or timer fires"
      then: "Fresh request/inflight survives; only current owner receives healthy cache and badge"
    - id: SCN-hls-shared-legacy
      given: "Two owners, cross-controller owners or ownerless legacy consumer in fetch/body phase"
      when: "One registered owner disposes"
      then: "One live GET, no abort, live healthy cache/badge and no disposed badge write"
    - id: SCN-hls-live-contract
      given: "Live HLS card with controlled response or timeout"
      when: "Good manifest, HTTP error, invalid body or timeout completes"
      then: "Existing healthy/offline/timeout and cleanup semantics preserved"
    - id: SCN-hls-boundary
      given: "Cancellation at HEAD handoff, native-support check or helper prestart"
      when: "Ownership disappears"
      then: "No manifest starts; native preference retains existing cancellable media behavior"
    - id: SCN-hls-hook-cleanup
      given: "Helper hook active or superseded by successor"
      when: "Cancellation or completion finalizes"
      then: "Own timer/hook removed once; successor hook preserved"
  observable_outcomes:
    - "Fetch count, abort signal, promise settlement, timers, cache, inflight identity and visible badges"
    - "No obsolete mirror/media start; active media slots and queue return to zero"
  determinism_controls:
    - "Real observer/controller/cache/helper with JSDOM; controlled external fetch/body/viewport/timers"
    - "Microtask/event-loop continuation drain only, no arbitrary sleeps, retries, force exits or public network"
  anti_cheat_rationale:
    prevents:
      - "Abort signal without prompt settlement"
      - "Fetch-only cancellation that leaves body reader pending"
      - "Same-source fresh observer inheriting obsolete work"
      - "Cancelling shared or legacy live owners"
      - "Late cache or badge writes and replacement deletion"
      - "Unconditional healthy response and lost live timeout/native branch"
  relaxation:
    did_relax_any_assertion: false
    if_true_explain_spec_basis: ""
```

Spec extension documented in docs/spec_changes/2026-10-22-client-reliability-9-active-hls.md. No existing tests/expectations changed. Original actual12mode baseline and initial fixture corrections are retained in20-54 investigation note; new35case suite against original isolated modules produces13pass/22fail/cancelled0.

Grouped mutant coverage: six final-owner cases reject hook/abort/prompt/timer/cache failures; twelve replacement cases reject sync invalidation and stale cache finalizer; six shared/cross/legacy cases reject lost shared owner; four live controls reject corrupted success/status/body/timeout; handoff/native/prestart cases reject missing handoff/guard/native branch; hook cases reject absent cleanup and deleting successor. Each group has failing mutants; all35 cases covered without changing expectations.

Final19 isolated variants below naturally exit1 with assertion failures and0cancelled. Source copies live in/tmp; actual worktree modules never mutated. Initial timer mutant accidentally targeted engine cleanup, survived, corrected to manifest-helper suffix; final result rejects timer retention. Baseline variant includes absent API TypeErrors in direct-hook cases as well as22 total failures; primary lifecycle cases fail assertions.

- baseline: exit1, fail22, cancelled0
- no-handoff: exit1, fail19, cancelled0
- no-helper-hook: exit1, fail19, cancelled0
- no-cancel-abort: exit1, fail5, cancelled0
- no-prompt-settlement: exit1, fail18, cancelled0
- no-sync-invalidation: exit1, fail7, cancelled0
- retained-timer: exit1, fail30, cancelled0
- no-hook-cleanup: exit1, fail1, cancelled0
- successor-hook-deleted: exit1, fail1, cancelled0
- body-hook-lost: exit1, fail10, cancelled0
- no-prestart-guard: exit1, fail3, cancelled0
- cache-on-cancel: exit1, fail21, cancelled0
- lost-shared-owner: exit1, fail6, cancelled0
- native-branch-lost: exit1, fail2, cancelled0
- healthy-cache-corrupted: exit1, fail19, cancelled0
- bad-status-healthy: exit1, fail1, cancelled0
- bad-body-healthy: exit1, fail1, cancelled0
- no-timeout-abort: exit1, fail1, cancelled0
- stale-inflight-finalizer: exit1, fail6, cancelled0
