# storage-cors-4 registered lifecycle integrity

```yaml
test_integrity_note:
  change_type: ["new_tests"]
  scenarios:
    - id: SCN-storage4-registered-completion
      given: "Real registered Recent/Explore/For You pipelines and real JSDOM VideoListView/Card, with controlled moderation subscription IO"
      when: "Older success or rejection resolves after a newer refresh, deletion, empty result, feed replacement, or disposal"
      then: "Only eligible current request changes DOM, metadata, telemetry and presentation effects; stale caller still settles"
    - id: SCN-storage4-current-controls
      given: "A current registered pipeline or fallback and a live view"
      when: "History or moderation IO is delayed, engine fails, or engine is unavailable"
      then: "Live cards/fallback and metadata remain observable with natural completion"
    - id: SCN-storage4-obsolete-load
      given: "Retained onVideos callback or history preload belongs to replaced load"
      when: "Same-feed replacement or different-feed load wins"
      then: "Old callback starts no refresh; obsolete runtime starts no engine or presentation effects"
  observable_outcomes:
    - "Card DOM IDs, view container ownership, payloads, metadata identity, render/impression counts and telemetry calls"
  determinism_controls:
    - "Explicit deferred IO; synthetic offline events, fake subscription/storage adapters; no sleeps/retries/timeouts"
  anti_cheat_rationale:
    prevents:
      - "hard-coded empty output via delayed/current/fallback controls"
      - "decorator-only pipeline replacement via actual registered production stages"
      - "success-only guards via delayed rejected engine with telemetry assertions"
      - "per-feed counters ignoring view replacement via same-feed remount controls"
  relaxation:
    did_relax_any_assertion: false
    if_true_explain_spec_basis: ""
```

16 retained scenarios in tests/storage-feed-lifecycle.test.mjs. Auto-discovered by unchanged normal runner; no registration bypass. Uses existing actual client/buffer/service fixture, synthetic signatures and controlled adapters. Source, filters, moderation, timestamps, scoring/sorting and actual DOM rendering execute. First moderation setActiveEventIds containing original pauses; no custom decorator stage. Engine error tests wrap real run and reject after its production stages return. History preload exercises actual For You await.

Nine isolated runtime mutants all exit1 naturally, cancelled0; restored in finally. Original coordinator fails12/16; ignoring request order fails4; ignoring view eligibility fails2; ignoring stale errors fails2; ignoring stale runtime fails1; suppressing current rendering fails9; obsolete load callbacks enabled fails1; allowing orphan completion fails11; dropping fallback fails3. Each retained scenario rejects original or a relevant broken control variant. No assertion relaxation or existing-test edit.

Live network/signatures/moderation timing, full application router/auth teardown, native browser and manual release not verified. No new source/cache/deletion policy. Return choice and pre-engine supersession are documented in decisions/DECISIONS_2026-10-22_20-45-00_storage-cors-4.md.
