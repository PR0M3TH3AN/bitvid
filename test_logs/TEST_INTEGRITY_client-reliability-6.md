# Item6 retained profile history wiring

```yaml
test_integrity_note:
  change_type: ["new_tests"]
  scenarios:
    - id: SCN-profile-local-remove-real-wiring
      given: "local-only actor has two real service queue entries rendered by the actual profile history factory"
      when: "actual profile DOM remove controls delete one item then the last item, recreating the renderer between steps"
      then: "backing queue and DOM remain reduced then empty, no publish IO or historical onHistoryReady callback runs"
    - id: SCN-profile-local-clear-real-wiring
      given: "actual profile history contains two local entries"
      when: "actual Clear local history button is clicked and renderer recreated"
      then: "real local queue and DOM remain empty with zero publish IO"
    - id: SCN-profile-synced-remove-real-wiring
      given: "synced actor renders two entries through real profile/default removal/controller/service with fake read/publish IO"
      when: "profile DOM removes an item then the last, with renderer recreation"
      then: "publish IO receives reduced then empty replacements with correct actor; recreation never resurrects removed entries"
  observable_outcomes:
    - "actual DOM removal controls and card state, service loadLatest/queue persistence, renderer recreation"
    - "fake external publish payload, replace and actor options; zero local publishes and network attempts"
  determinism_controls:
    - "actual component markup, ProfileModalController config/factory, renderer, removal controller and local service"
    - "fixed fake pointers, unique actors, isolated jsdom localStorage, controlled synced read/publish twin honoring merge vs replace"
    - "task-turn drain and actual removal promise observation; no arbitrary sleeps/retries, real signer/relay/network"
    - "teardown destroys renderer/subscriptions, resets actor service state, restores application/client/globals and closes DOM, even on failure"
  anti_cheat_rationale:
    prevents:
      - "historical no-op removal hidden by optimistic DOM changes"
      - "fake renderer or source-string-only configuration assertion"
      - "local clear without backing persistence or missing synced replace/actor options"
      - "last-item no-op and publish twin that always replaces regardless of options"
  relaxation:
    did_relax_any_assertion: false
    if_true_explain_spec_basis: ""
```

Only a new test file is retained; no existing suite/product assertions changed. Publish boundary assertions require at least one appropriate publication and verify every emitted payload/options, preserving behavior without locking in today's duplicate publication count. Clear coverage is local-only; no synced Clear-local/relay-list-clear equivalence claim.

Fault injections operate only in isolated CLI process memory, never edit product files. `python3 /tmp/item6-retention-mutants.py`: all five naturally exit1 with named assertion failures,zero cancelled; process exit restores injected prototypes and fixture after-hooks release queue/app/client/globals on failed assertions. Historical-noop kills local+synced real wiring; clear-noop (one dropped reset then cleanup forwards normally) kills local Clear; drop-replace kills local+synced; wrong-actor kills synced and explicitly releases injected actor state; ignore-last kills local+synced final removal. Logs `/tmp/item6-retained-mutant-*.log`,summary `/tmp/item6-retained-mutants.json`.

Independent audit showed existing profile27/27 survive the historical no-op while both actual wiring scratch variants fail after cleanup. New retained local+synced tests reject that same injected override. Actual application load/show/reload,real signing/encryption/relay persistence and manual user confirmation remain unverified.
