# Client9 active torrent test integrity

Written before editing prior367/417 expectations. Exact authority and old/new contract: docs/spec_changes/2026-10-26-client-reliability-9-active-torrent.md. Prior failed baseline and original queued-only suite preserved in investigation evidence; production files and old assertions are in ab1ea6de parent history.

```yaml
test_integrity_note:
  change_type: [new_tests, spec_correction]
  scenarios:
    - id: SCN-active-torrent-last-owner
      given: real grid observer and active probe with one card owner
      when: the final owner unregisters
      then: cancelled work settles null, clears timers/hooks and destroys temporary torrent after event unwind before slot release, without cache or stale badge writes
    - id: SCN-active-torrent-shared-and-replacement
      given: shared live owners or a same-source replacement after final-owner loss
      when: one owner leaves or old callbacks and finalizer run
      then: live shared work is preserved and cancelled identity cannot affect fresh work
    - id: SCN-active-torrent-live-standalone
      given: a live owner or standalone probe caller
      when: wire, error or normal timeout occurs
      then: existing results, cache TTL, shared probe client and bounded queue ordering remain
  observable_outcomes:
    - temporary torrent lifetime, destroy ordering/count, timers/listeners/hook, returned results
    - actual card badge and persisted cache values, new work count, FIFO progress and resource cap
  determinism_controls:
    - fake WebTorrent IO, controlled clock and observer delivery, map-backed persistence IO
    - isolated mutant copies, no public fetch/WebSocket, no sleeps or retries
  anti_cheat_rationale:
    prevents:
      - cached obsolete results or stale identity mutation
      - cancelling a still shared live owner
      - immediate unsafe destroy or premature queue-slot release
      - mocked probe implementation bypassing real resource cleanup
  relaxation:
    did_relax_any_assertion: false
    if_true_explain_spec_basis: ''
```

Contract correction changes outcomes, not assertion strength: original last-owner-gap reuse/cache expectations become fresh-work/no-obsolete-cache/resource assertions, while separate live-owner/shared/cache/timeout controls remain. Mutant mappings and exact validation results will be recorded before handoff; no passing or mutant-kill counts claimed yet.

Final focused27new+11corrected+22adjacent=60/60;19unique mutants all killed,20variant executions with added extended run; all27newscenarios covered. Full per-scenario mappings and failures: state/evidence/client9-torrent-impl-20261026/new-scenario-mutant-map.json and mutants/coverage.json. No mutants survived; all mutated suite runs cancelled0, natural failure exits. Restored state is automatic because only isolated copies were changed. Full/build/browser/landing pending separately.
