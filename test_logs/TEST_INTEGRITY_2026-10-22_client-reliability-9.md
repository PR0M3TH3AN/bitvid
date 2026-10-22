# HEAD lifecycle integrity

```yaml
test_integrity_note:
  change_type: ["new_tests", "spec_correction"]
  scenarios:
    - id: SCN-head-final-owner
      given: "actual observer/controller HEAD with abortable, ignoring-abort or missing AbortController transport"
      when: "final owner disposes, including duplicate disposal and already-completed HEAD boundary"
      then: "prompt null settlement, timer cleanup, no cache/media/mirror/stale badge; abort if supported"
    - id: SCN-head-replacement
      given: "same-turn or later rejoin after disposal"
      when: "obsolete success, error or timeout callback runs"
      then: "fresh HEAD and inflight identity preserved, fresh healthy result only reaches live badge"
    - id: SCN-head-sharing
      given: "same-controller, cross-controller or legacy live survivor"
      when: "other observer disposes then HEAD/media completes"
      then: "one un-aborted HEAD, survivor gets healthy cache/badge, disposed badge unchanged"
    - id: SCN-head-live-fallback
      given: "live HEAD success/error/timeout/opaque/405 or failing media and mirror"
      when: "controlled transport/media settles"
      then: "healthy fallback or honest offline cache, timers/media slots released"
    - id: SCN-head-handoff-fifo
      given: "HEAD transitioning to media or saturated real media queue"
      when: "owner leaves or live media releases slots"
      then: "new media cancellation hook works, live FIFO and cap3 remain intact"
    - id: SCN-head-before-start
      given: "lifecycle already cancelled or without owners"
      when: "real probeUrl entry is called"
      then: "cancelled result, no fetch/media/timer"
  observable_outcomes:
    - "fetch count/AbortSignal, settled value, timer/source/listener cleanup"
    - "real cache/inflight identity, live/disposed badges and media queue/FIFO"
  determinism_controls:
    - "controlled fetch with native AbortSignal and optional ignored abort"
    - "manually driven positive-delay timers, native zero-delay JSDOM tasks"
    - "actual observer/controller/cache/DOM media events; external network never used"
    - "cleanup completes controlled transports/media and restores globals before natural exit"
  anti_cheat_rationale:
    prevents:
      - "abort signal without prompt settlement"
      - "null-only fake fix retaining transport or timer"
      - "reuse of obsolete request or cache-on-cancel"
      - "dropping shared/legacy owners or fallback/FIFO behavior"
      - "stale inflight finalizer deleting fresh work"
      - "retry/sleep/assertion relaxation"
  relaxation:
    did_relax_any_assertion: false
    if_true_explain_spec_basis: ""
```

Spec scope extension: docs/spec_changes/2026-10-22-client-reliability-9-active-head.md. No existing test was changed. Original controller fails12/23 assertions and passes11 controls, cancelled0. Fixed controller23/23. All16 isolated mutants exit1 with actual failed assertions/cancelled0; production source never contains a mutant. Isolated cache-finalizer mutant changes a scratch copy only.

| Mutant | Failed scenarios | Pass | Exit |
|---|---:|---:|---:|
| baseline | 12 | 11 | 1 |
| no-head-hook | 10 | 13 | 1 |
| no-head-abort | 2 | 21 | 1 |
| no-prompt-settlement | 8 | 15 | 1 |
| no-sync-invalidation | 3 | 20 | 1 |
| retained-head-timer | 21 | 2 | 1 |
| no-prestart-guard | 2 | 21 | 1 |
| lost-shared-owner | 3 | 20 | 1 |
| cache-on-cancel | 12 | 11 | 1 |
| no-live-error-fallback | 1 | 22 | 1 |
| lost-media-hook | 1 | 22 | 1 |
| healthy-cache-corrupted | 14 | 9 | 1 |
| no-live-timeout-abort | 1 | 22 | 1 |
| no-mirror-fallback | 1 | 22 | 1 |
| fifo-reversed | 1 | 22 | 1 |
| stale-inflight-finalizer | 3 | 20 | 1 |

Mutant generation/reproduction: /tmp/client9-run-mutants.py; per-mutant source/test/TAP under /tmp/client9-mutant-*.mjs/.tap; structured /tmp/client9-mutants.json. Changes disable HEAD hook/abort/prompt settlement/synchronous marker/timer cleanup/prestart guard, lose shared owner, cache on cancellation, lose live error fallback/media hook/timeout abort/mirror fallback, corrupt healthy cache, reverse FIFO and remove cache finalizer identity guard. Baseline uses pre-change git controller. Every scenario is rejected by at least one mutant (grouped coverage); none survived. No forced termination, retries or waits for real timeout.
