# Client10 transient startup cleanup contract

Authority: exact dispatch ROUTING-2026-10-27-client10-animation-cleanup.md. Existing transient interface cleanup is intended after animation end/cancel; late initialization currently misses already-delivered events. Extend initialization to reconcile finished own-target interface CSS animations, while keeping current/future active animations, unrelated effects and thumbnail event rule. No existing tests/expectations changed. Reduced-motion animation:none does not acquire a new animation or timer.

```yaml
test_integrity_note:
  change_type: [new_tests]
  scenarios:
    - id: SCN-late-interface-cleanup
      given: interface CSS animation finished before initializer
      when: actual cleanup initializer or real index cleanup wiring executes
      then: fade-in and all fade-in-delay hooks removed, unrelated classes preserved
    - id: SCN-live-future-animation
      given: running pending paused or future entrance and unrelated animations
      when: initializer and genuine completion or cancellation events occur
      then: live effects preserved until completion, unrelated/pseudo effects do not trigger interface cleanup
    - id: SCN-thumbnail-and-registration
      given: loaded or unloaded thumbnail and repeated cleanup registration
      when: matching event, repeated init, disposal and reinstall occur
      then: existing thumbnail eligibility respected, single listener pair and deterministic teardown
  observable_outcomes: [DOM classes and dataset, listener lifecycle, actual bootstrap cleanup call]
  determinism_controls: [JSDOM DOM and events, explicit CSSAnimation-state boundary, no public IO or elapsed-time waits]
  anti_cheat_rationale:
    prevents: [unconditional class stripping, unrelated-animation cleanup, missing bootstrap call, duplicate listener retention]
  relaxation:
    did_relax_any_assertion: false
    if_true_explain_spec_basis: ''
```

Browser geometry/hit testing, real CSSAnimation state, original overflow and real-device qualification are not established by these controlled offline checks.

Validation:17/17newscenarios pass;19distinct isolated mutants naturally fail withcancelled0, all17cases covered. Exact maps/logs state/evidence/client10-animation-cleanup-20261027/mutants-summary.json and mutants-coverage.json. Existing tests unchanged. Full/browser/build/landing pending.
