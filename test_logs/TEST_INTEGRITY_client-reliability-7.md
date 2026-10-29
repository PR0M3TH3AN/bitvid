# Item7 live feed consumer notification

```yaml
test_integrity_note:
  change_type: ["new_tests"]
  scenarios:
    - id: SCN-cold-live-feed
      given: "actual service cold cache and controlled eligible/ineligible subscription arrivals"
      when: "two live batches arrive"
      then: "consumer,events and persisted cache expose same full ordered eligible snapshots"
    - id: SCN-latest-feed-consumer
      given: "one live relay subscription and successive loadVideos consumers"
      when: "consumer switches then becomes event-only"
      then: "only latest consumer receives live updates;event-only updates still emit and persist"
    - id: SCN-replaced-feed-subscription
      given: "live subscription is force-replaced then cleared"
      when: "old controlled callbacks arrive after unsubscribe"
      then: "no stale callback effects;current subscription notifies and persists normally"
    - id: SCN-live-deletion
      given: "two cached videos"
      when: "deletion-only,mixed deletion+addition,and final deletion arrive"
      then: "consumer gets reduced,updated and empty full snapshots;deleted metadata and persistence preserved"
    - id: SCN-live-consumer-throw
      given: "consumer throws on first live arrival"
      when: "two live batches arrive"
      then: "service events,persistence and later callback delivery remain intact"
    - id: SCN-warm-live-feed
      given: "persistent warm cache and empty in-memory input"
      when: "load then live arrival"
      then: "optimistic data survives without empty flash;live snapshot includes old and new entries"
    - id: SCN-event-only-filtered-feed
      given: "no onVideos consumer"
      when: "empty,ineligible,then eligible updates arrive"
      then: "empty/ineligible updates do not notify/cache;eligible update emits and persists without consumer"
  observable_outcomes:
    - "real loadVideos callback values,service events,shared map and localStorage snapshots"
    - "latest callback ownership,unsubscribe lifecycle and no stale effects"
  determinism_controls:
    - "controlled nostrClient.subscribeVideos boundary;actual service filter/cache/persistence/emitter"
    - "fixed videos/order,isolated shared state/storage;global network guards;no sleeps/retries/public traffic"
    - "teardown restores globals/map/subscription/storage and verifies owned subscriptions close"
  anti_cheat_rationale:
    prevents:
      - "event-only/source-string assertion mistaken for actual consumer delivery"
      - "notify delta or stale first consumer instead of current full-list consumer"
      - "lose deletion/event/persistence on callback exceptions or no consumer"
      - "filter bypass or optimistic cache flash"
  relaxation:
    did_relax_any_assertion: false
    if_true_explain_spec_basis: ""
```

Nine isolated runtime loader mutants all naturally exit1/0cancel and restore at process termination: missing-live kills scenarios1-6;delta-only kills1/4/5/6;ignore-deletions kills4;uncaught-consumer kills5;first-consumer kills2;late-callback kills3;event-only-drop kills2/7;retained-on-clear kills3;filter-bypass kills1/7. No source file changed during mutation runs; no arbitrary sleeps/retries/relaxed assertions. Outputs `/tmp/item7-mutant-*.log` and `/tmp/item7-mutants.json`.

Scope is service notification contract with controlled client IO;not real wire parser/signing/relay/bootstrap/DOM/mobile proof. QA measured actual app failure independently and owns postlanding qualification. Existing suites are unchanged.
