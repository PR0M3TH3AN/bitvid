# Item5 integrity note

```yaml
test_integrity_note:
  change_type: ["new_tests"]
  scenarios:
    - id: SCN-active-primary-disposed-mirror
      given: "primary media is active, with an alternate mirror"
      when: "the last owner disposes then primary media errors"
      then: "no mirror HEAD starts; chain settles null without cache or stale UI, later fresh request succeeds"
    - id: SCN-active-shared-mirror
      given: "two registrations share active media"
      when: "one owner disposes and primary errors"
      then: "ordered mirror serves live owner, healthy cache avoids later requests, disposed badge stays unchanged"
    - id: SCN-active-rejoin-mirror
      given: "primary active media survives last-owner disposal"
      when: "same-source live owner rejoins before primary error"
      then: "dedup survives and ordered mirror serves new owner without duplicate primary IO"
    - id: SCN-active-later-mirror-disposal
      given: "first mirror media is active and another mirror exists"
      when: "last owner disposes then first mirror errors"
      then: "next mirror HEAD does not start, cancellation settles without cache or stale UI"
    - id: SCN-active-timeout-cleanup-retry
      given: "media is active with real configured initial and longer retry deadlines"
      when: "last owner disposes and controlled clock reaches initial timeout"
      then: "slot/source clear, no new retry resources or cache, later fresh request is healthy"
    - id: SCN-completed-active-final-error-cache
      given: "active primary has no further candidate"
      when: "last owner disposes then media errors"
      then: "completed active failure keeps existing offline cache result without stale UI"
  observable_outcomes:
    - "fetch/media starts, source cleanup, slot release, promise settlement and actual cache/inflight records"
    - "live/disposed connected badge state and ordered mirror requests"
  determinism_controls:
    - "Real observer/controller/cache with controlled IntersectionObserver, jsdom native media event APIs and stubbed external fetch/media IO"
    - "node:test mock clock advances configured4000ms timeout; no sleeps, retries, public network or forced exit"
  anti_cheat_rationale:
    prevents:
      - "returning cancelled for live shared/rejoining owners"
      - "guarding only first mirror or discarding completed active results"
      - "caching cancellation as offline or starting obsolete retry resources"
      - "over-mocking queue/controller instead of service boundaries"
  relaxation:
    did_relax_any_assertion: false
    if_true_explain_spec_basis: ""
```

Existing assertions unchanged; six new scenarios (18 total lifecycle scenarios). Baseline before guard naturally exits1 with new primary/later-mirror failures (16pass/2fail/0cancelled). Fixed18pass/0fail/0cancelled. Unique note avoids shared integrity-file writes during parallel trial.

`python3 /tmp/item5-mutants.py`: six deliberately broken variants each naturally exit1 with named assertion failures,0 cancelled, restored in finally before gates. Missing candidate guard kills primary/later-mirror scenarios; cancelling live mirrors kills shared+rejoin controls; checking only first mirror kills later-mirror case; caching cancellation kills null/cache expectations; discarding final active errors kills existing-offline-cache scenario; removing both media no-owner checks kills timeout cleanup/retry. Results `/tmp/item5-mutants.json` and `/tmp/item5-mutant-*.log`. No gate/test-registration changes or timed-out mutants counted.
