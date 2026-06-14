# Test Integrity Notes

Machine-readable record of test-expectation changes made under the Spec
Correction Protocol (see CLAUDE.md → Dark Factory rules). Each entry justifies
why a previous expectation was wrong relative to intended behavior and confirms
the replacement is equally strict (or stricter).

---

```yaml
test_integrity_note:
  date: 2026-06-14
  file: tests/app-batch-fetch-profiles.test.mjs
  change_type: ["spec_correction"]
  scenarios:
    - id: SCN-profiles-batched
      given: "Multiple relays configured (one fast, one failing) and uncached, valid pubkeys to fetch"
      when: "batchFetchProfiles runs after profile fetches were migrated to the L1 SubscriptionManager"
      then: "Profiles are fetched in ONE batched query across all relays (not one query per relay); the fast relay's newest profile still renders, cached profiles hydrate immediately, and a failing relay does not break the result"
  observable_outcomes:
    - "exactly one pool.list call, targeting all configured relays"
    - "query authors = only uncached/valid pubkeys"
    - "DOM updates: cached profile first, then newest fast-relay profile"
    - "cache set with the newest (Fast) profile only"
  determinism_controls:
    - "mock pool.list with deterministic per-relay responses; fixed createdAt ordering"
  anti_cheat_rationale:
    prevents:
      - "over-mocking internal logic"
      - "hard-coded return value"
    note: "Only the per-relay CALL-COUNT assertion changed (2 -> 1), because the
      refactor intentionally batches the fetch. All behavioral assertions
      (correct/newest profile rendered, cached hydration, failing relay
      tolerated) are unchanged, and a new assertion verifies the single batched
      query targets all relays — so coverage is equal or stronger."
  relaxation:
    did_relax_any_assertion: false
    if_true_explain_spec_basis: ""
```
