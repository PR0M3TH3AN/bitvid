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
