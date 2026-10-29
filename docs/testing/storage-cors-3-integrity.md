# storage-cors-3 test integrity

## Buffer boundary

```yaml
test_integrity_note:
  change_type: ["new_tests"]
  scenarios:
    - id: SCN-storage3-buffer-newer-orders
      given: "strictly newer same-root video and older deletion, in either order or one batch"
      when: "actual subscribeVideos buffer ingests and replays the deletion"
      then: "newer live version and unrelated content remain active; tombstone timestamp persists"
    - id: SCN-storage3-buffer-zombies
      given: "two versions and unrelated content"
      when: "equal/newer tombstone then late older content then strictly newer content arrive"
      then: "older versions stay deleted, unrelated stays active, strictly newer content may return"
    - id: SCN-storage3-buffer-author
      given: "legacy synthesized roots with equal d-tags from distinct authors"
      when: "one author's deletion and late older event arrive"
      then: "authoritative client tombstone keys suppress only the intended author's legacy series"
  observable_outcomes:
    - "real client active/history maps and tombstones after actual subscription transport callbacks"
  determinism_controls:
    - "synthetic events; explicit awaited EOSE; no sleeps, retries or real transport"
    - "fake signature acceptance, metadata hydration and IndexedDB IO only; filtered localStorage remains real"
    - "every fixture asserts zero network attempts and closed subscriptions"
  anti_cheat_rationale:
    prevents: ["unconditional deletion", "no-op deletion", "root-only legacy matching", "over-mocking ingest"]
  relaxation:
    did_relax_any_assertion: false
    if_true_explain_spec_basis: ""
```

Retained `tests/storage-tombstone-buffer.test.mjs`: old buffer baseline 2pass/3fail. The preliminary legacy fixture used empty roots, which real conversion replaces with distinct event IDs; it was corrected to actual synthesized `LEGACY:author:d` roots before recording baseline, preserving strict author-scoping expectations. Fixed buffer 5/5. Existing buffer6/6 and delete-flow4/4 pass naturally.

Restored mutants: unconditional deletion fails all3 ordering scenarios; omitted authoritative tombstone fails all5 scenarios. Commands/scripts/logs: `/tmp/storage3-buffer-mutants.py`, `/tmp/storage3-unconditional-marker-delete.log`, `/tmp/storage3-omit-authoritative-tombstone.log`, `/tmp/storage3-buffer-baseline.log`, `/tmp/storage3-buffer-focused.log`, `/tmp/storage3-buffer-existing.log`. No client policy changes: `recordTombstone` remains the sole timestamp-safe active deletion authority; the buffer keeps the guarded-event identity cleanup.

An initial focused command named nonexistent `tests/video-event-buffer.test.mjs` and failed before tests. Corrected to existing `tests/nostr/videoEventBuffer.test.mjs`; no registration/assertion changes.

No browser/full/build/live signer/cloud/relay qualification. Coordinator stale-render remains open, read-only and outside this change.

## Service snapshot/persistence boundary

```yaml
test_integrity_note:
  change_type: ["new_tests"]
  scenarios:
    - id: SCN-storage3-service-prune
      given: "multiple cached versions and unrelated content"
      when: "different-ID deletion marker and late older version arrive through actual subscription"
      then: "service map, callback, emitter and persisted snapshot contain only unrelated content"
    - id: SCN-storage3-service-empty
      given: "single live version or an all-ineligible persisted cache"
      when: "deletion empties feed or empty active cache loads"
      then: "empty persistence replaces stale cache and replacement consumer sees no resurrected entry"
    - id: SCN-storage3-service-persistent
      given: "deleted and invalid persisted objects for public or author viewer"
      when: "optimistic load filters the cache"
      then: "only live content is notified, cached and persisted before author bypass"
    - id: SCN-storage3-service-known-tombstone
      given: "stale nondeleted persisted copy covered by authoritative client tombstone"
      when: "reload or direct cache API encounters stale copy"
      then: "stale copy stays absent while newer valid and unrelated entries survive"
    - id: SCN-storage3-service-author
      given: "legacy synthesized roots sharing d-tag across distinct authors"
      when: "one author deletion then newer live content and replayed older deletion arrive"
      then: "unrelated author and strictly newer content remain in every service snapshot"
  observable_outcomes:
    - "actual service map, callback, videos:updated and filtered localStorage snapshots"
  determinism_controls:
    - "same actual subscription/client fixture as buffer cases, explicit EOSE and zero real network attempts"
  anti_cheat_rationale:
    prevents: ["ID-only removal", "flag-only filtering", "author bypass of deleted state", "empty-persistence skip", "overbroad author cleanup", "over-mocking ingest"]
  relaxation:
    did_relax_any_assertion: false
    if_true_explain_spec_basis: ""
```

New service tests: old service baseline 0pass/8fail; fixed8/8. Eight restored mutants all fail: old-service8; allow-deleted4; allow-invalid4; ignore-known-tombstone2; skip-map-prune5; skip-empty-persist1; skip-direct-cache-guard1; skip-optimistic-persist2. Every retained scenario rejects the old service and at least one selective mutant. Mutator `/tmp/storage3-service-mutants.py` restores product source in finally; logs `/tmp/storage3-service-mutant-results.log` and uniquely named `/tmp/storage3-<mutant>.log`.

Existing live-feed regression exposed that an update may carry the original event ID and a separate deleted object rather than a shared client object. Preserve explicit deletion-ID removal alongside authoritative client tombstone cleanup; the regression was not modified. No new root/address matching implementation: service calls client `isOlderThanTombstone`, including its existing legacy/author key derivation. Existing access/privacy/NSFW/consumer/subscription behavior is covered by unchanged focused suites.
