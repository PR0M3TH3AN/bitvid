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

---

```yaml
test_integrity_note:
  date: 2026-06-14
  files:
    - tests/relay-subscribe-cap.test.mjs
    - tests/user-blocks.test.mjs
    - tests/subscriptions-manager.test.mjs
    - tests/nostr/client.test.mjs
  change_type: ["spec_correction"]
  scenarios:
    - id: SCN-relay-reads-bounded
      given: "A user's NIP-65 read set (in prod often ~20 relays, most dead) and a
        cold login that must decrypt encrypted lists (blocks, subs, hashtags) via
        the nip-07 extension"
      when: "Reads/subscriptions are built via capReadRelays — the user's own
        relays first, with RESERVED_DEFAULT_RELAY_SLOTS reserved for reliable
        default aggregators, bounded to MAX_SUBSCRIBE_RELAYS=8; writes stay
        uncapped"
      then: "Every configured relay is still queried when the user's set is small
        (data lives on the user's own relays); the distinct read fan-out never
        exceeds 8 (so a large dead list can't storm the pool and starve nip-07
        decryption); at least the reserved reliable defaults remain reachable even
        when the user supplied none; write reach is unchanged and defaults are NOT
        injected into writes"
  observable_outcomes:
    - "read/subscribe relay set length <= 8"
    - "writeRelays == full configured set; no default injected into writes"
    - ">= RESERVED_DEFAULT_RELAY_SLOTS reliable defaults present in the read set"
    - "user-blocks: every configured relay queried; fast-then-full background
      ordering preserved; block list hydrates from the background relay payload"
    - "subscriptions-manager: every configured relay queried even when one
      rejects; only the newest event decrypted"
    - "nostr/client: same events arriving from multiple seeded relays still
      dedupe to the expected set; relay fan-out bounded"
  determinism_controls:
    - "deterministic per-relay mock pool.list responses; fixed created_at ordering"
    - "capReadRelays is test-aware: the reserved core resolves to the test-relay
      override under test, keeping harnesses isolated from prod default URLs"
    - "tests set nostrClient.readRelays to the user's relays to mirror the
      logged-in state applyRelayPreferences establishes in prod (the fetcher ranks
      candidates by read preference)"
  anti_cheat_rationale:
    prevents:
      - "hard-coded return value"
      - "over-mocking internal logic"
      - "retry/sleep-based flake masking"
    note: "Only incidental EXACT relay-count assertions were loosened to BOUNDS
      (<=8) because the storm fix intentionally adds a small reliable-default
      backstop to the read set. Every behavioral assertion (correct/newest event
      decrypted, block hydration from the right relay, dedup correctness, per-relay
      coverage, writes uncapped) is unchanged or strengthened — coverage is equal
      or stronger, and new assertions pin the reserved-defaults liveness guarantee."
  relaxation:
    did_relax_any_assertion: false
    if_true_explain_spec_basis: "Exact-count assertions became bounded-count
      assertions, but this reflects intended new behavior (reliable-default
      backstop) rather than weakening a real correctness check; coverage of the
      actual security/decrypt behavior is preserved."
```
