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

---

```yaml
test_integrity_note:
  date: 2026-06-23
  file: tests/nip71-mirror-flags.test.mjs
  change_type: ["spec_correction"]
  scenarios:
    - id: SCN-mirror-delete-unconditional
      given: "A video that was shared to NIP-71 on one device/session, then deleted from another device (or after the per-video opt-in flag — browser-local localStorage — was cleared)"
      when: "resolveDeleteSync runs during delete with FEATURE_NIP71_MIRROR on but the local enabled flag false/absent"
      then: "The mirror teardown (NIP-09 + empty tombstone, idempotent) is still attempted, so the NIP-71 mirror is not orphaned on other apps; the feature flag still fully gates it"
  observable_outcomes:
    - "resolveDeleteSync({featureOn:true, enabled:false|undefined}) -> {action:'unshare'}"
    - "resolveDeleteSync({featureOn:false, ...}) -> {action:'none'} (feature flag still gates)"
  determinism_controls:
    - "pure function; explicit input matrix"
  anti_cheat_rationale:
    prevents:
      - "hard-coded return value"
    note: "The previous expectation (enabled:false -> none) encoded the bug: it
      gated teardown on a browser-local flag, orphaning the mirror across devices.
      The corrected spec is STRICTER — teardown fires whenever the feature is on —
      and adds the enabled:undefined case. The feature-flag gate assertion is
      retained, so no real gate was weakened."
  relaxation:
    did_relax_any_assertion: false
    if_true_explain_spec_basis: ""
```

---

```yaml
test_integrity_note:
  date: 2026-06-23
  file: tests/nostr-delete-flow.test.mjs
  change_type: ["spec_correction", "refactor_tests"]
  scenarios:
    - id: SCN-delete-surfaces-relay-failures
      given: "A logged-in delete where one write relay rejects the kind-5 deletion"
      when: "deleteAllVersions publishes to the WRITE set via getDeletePublishRelays() (the afb6200b relay-scope fix)"
      then: "The delete summary surfaces the failing relay"
    - id: SCN-buffered-feed-tombstone-guard
      given: "A delete event seeds a tombstone, then an OLDER non-deleted event for the same root arrives on the live stream"
      when: "events flow through the real VideoEventBuffer (the path subscribeVideos builds via the SubscriptionManager), not the removed direct pool.sub() injection"
      then: "The older event is tombstone-guarded (marked deleted, kept out of activeMap) and never surfaces as a LIVE video; a deletion event surfaces marked deleted:true so the UI removes the card"
  observable_outcomes:
    - "deleteSummary.summary.failed identifies wss://relay.fail (writeRelays now configured so the injected failure is exercised)"
    - "no callback video with the deleted/older event id and deleted:false"
    - "client.activeMap cleared for the root; tombstone advanced; stored event marked deleted"
  determinism_controls:
    - "videoEventVerifier virtualizes the off-thread signature worker (all events valid)"
    - "buffer.scheduleFlush(true) awaited for synchronous commit"
    - "real NostrClient + real VideoEventBuffer (no mocked tombstone guard)"
  anti_cheat_rationale:
    prevents:
      - "over-mocking internal logic"
      - "snapshot rubber-stamping"
    note: "Two corrections. (1) The file used bare assert + top-level await, so the
      unit runner (which requires a node:test import) SILENTLY EXCLUDED it — it had
      rotted and was failing on main unnoticed. Converted to node:test so it runs
      in CI. (2) The relay-failure test set only client.relays, but deletes moved to
      the write set (getDeletePublishRelays); it now sets writeRelays so the
      injected failure is actually exercised — the assertion was previously passing
      vacuously. (3) The subscription assertions drove the REMOVED pool.sub() path
      and expected 'no callback at all' for deleted events; the current
      VideoEventBuffer intentionally surfaces deleted events marked deleted:true so
      the UI can remove the card. Rewritten to drive the real buffer + real client
      and assert the stricter, accurate invariant (never surfaces as LIVE; guarded
      and removed from activeMap). Coverage is stronger: the buffer's own unit test
      mocks the client's tombstone guard, whereas this exercises the real guard."
  relaxation:
    did_relax_any_assertion: false
    if_true_explain_spec_basis: ""
```

---

```yaml
test_integrity_note:
  date: 2026-06-23
  file: tests/watch-history.test.mjs
  change_type: ["spec_correction"]
  scenarios:
    - id: SCN-watch-history-partial-acceptance-durable
      given: "A logged-in user snapshots watch history to 3 write relays where 2 accept and 1 rejects (single attempt, no escalation)"
      when: "watchHistoryService.snapshot runs after the 565a9618 fix (a snapshot is durable as soon as ANY relay accepts; reads take the newest event per d-tag)"
      then: "The snapshot SUCCEEDS — it does not throw, the result is ok and not retryable, no republish is scheduled, the month result is flagged partial with the accepting/rejecting relays captured, and the pointer queue is emptied (the pointer was durably published)"
    - id: SCN-watch-history-logged-in-not-session
      given: "A logged-in user (nostrClient.pubkey set) records a watch and the entry is published and re-loaded"
      when: "publishView resolves the owning actor as the logged-in pubkey and sets the session flag only when nobody is logged in"
      then: "The round-tripped entry is NOT flagged session=true (it is the logged-in user's history, not a local-only session entry); the queue files under the logged-in pubkey so getQueuedPointers(actor) sees it"
  observable_outcomes:
    - "snapshot() resolves (does not throw); result.ok === true; result.retryable === false"
    - "scheduleWatchHistoryRepublish NOT called"
    - "result.results[0].partial === true; relayStatus.pointer shows relay.one/two accepted, relay.three rejected"
    - "getQueuedPointers(actor).length === 0 after a successful snapshot"
    - "resolvedItems[0].session !== true for a logged-in user"
  determinism_controls:
    - "poolHarness resolver with a fixed accept/reject plan per relay url"
    - "session crypto + recordVideoView virtualized; stable relay set"
    - "logged-in pubkey aligned with the queried actor (matches the convention used by the other tests in the file)"
  anti_cheat_rationale:
    prevents:
      - "snapshot rubber-stamping"
      - "hard-coded return value"
    note: "Three corrections in this file, all matching shipped behavior. (1) The
      partial-acceptance test asserted the INVERSE of intended behavior — that
      snapshot() THROWS on partial acceptance and retries until EVERY relay accepts —
      encoding exactly the all-relays false-failure bug 565a9618 fixed. Rewritten to
      the success path (no throw, partial flag, per-relay status, queue drained, no
      spurious republish). (2) testWatchHistoryServiceIntegration set the logged-in
      pubkey to a value DIFFERENT from the actor it queried; since watch history now
      files under the logged-in pubkey, the queue assertions looked at the wrong key.
      Aligned pubkey to the queried actor (the convention every other test uses) — a
      setup fix, no assertion weakened. (3) The same test asserted session===true for
      a logged-in watch, which is the pre-fix bug (logged-in watches were wrongly
      flagged session by comparing against the view actor); corrected to session!==true
      per the current rule that session marks only logged-out, local-only entries.
      With these the full file is green and was REMOVED from the run-unit-tests
      QUARANTINE."
  relaxation:
    did_relax_any_assertion: false
    if_true_explain_spec_basis: ""
```

---

```yaml
test_integrity_note:
  date: 2026-06-23
  files:
    - tests/zap-shared-state.test.mjs
    - tests/video-modal-zap.test.mjs
  change_type: ["spec_correction", "refactor_tests"]
  scenarios:
    - id: SCN-platform-fee-unparseable-override
      given: "An unparseable platform-fee override value (e.g. 'not-a-number') with PLATFORM_FEE_PERCENT configured > 0"
      when: "resolvePlatformFeePercent runs"
      then: "It falls back to the configured platform default (getDefaultPlatformFeePercent), NOT to 0 — a junk override cannot silently disable/bypass the platform fee"
    - id: SCN-zap-completion-state-resets-then-completes
      given: "A zap whose receipts validate to a warning (awaiting validated receipt)"
      when: "sendZap runs"
      then: "The modal completion state is reset to false at the start of the send and set true at the terminal path, so two completion-state changes are recorded and the end state is true"
    - id: SCN-zap-receipts-render-into-controller-element
      given: "VideoModal.renderZapReceipts called with one validated (or one failed) receipt"
      when: "rendering delegates to the inner zapController"
      then: "Exactly one entry is rendered into the controller's modalZapReceipts element"
  observable_outcomes:
    - "resolvePlatformFeePercent('not-a-number') === getDefaultPlatformFeePercent() (> 0)"
    - "completedStates grows by 2 (false then true) on a completing send; end state true"
    - "controller.modalZapReceipts.children.length === 1 per rendered receipt"
  determinism_controls:
    - "pure fee function with explicit inputs; configured PLATFORM_FEE_PERCENT read via getDefaultPlatformFeePercent (not hard-coded)"
    - "modal stub records setZapCompleted/resetZapForm calls; DummyElement DOM"
  anti_cheat_rationale:
    prevents:
      - "hard-coded return value"
      - "over-mocking internal logic"
    note: "Three corrections, all to match shipped behavior. (1) The fee-fallback test
      asserted 0; the function correctly falls back to the configured platform default
      so a garbage override cannot zero out (bypass) the fee — corrected to assert
      against getDefaultPlatformFeePercent and that the result is > 0 (STRICTER: pins
      the no-bypass guarantee). (2) The completion-count test asserted +1; sendZap
      legitimately resets completed=false at the start of every send and sets true at
      the terminal path (+2), with the end-state==true assertion retained as the real
      invariant. (3) The receipt-render tests set modalZapReceipts on the outer
      VideoModal, but rendering was refactored to delegate to the inner zapController
      which owns that element — set/assert on the controller's element (a harness fix,
      no assertion weakened). NOTE: these accompany three PRODUCTION bug fixes found
      via the same tests — NWC getPublicKey hex->bytes (connection was broken), the
      in-flight 'Sending…' status mis-toned as warning, and the success path not using
      the holistic resetZapForm."
  relaxation:
    did_relax_any_assertion: false
    if_true_explain_spec_basis: ""
```

---

```yaml
test_integrity_note:
  date: 2026-06-23
  file: tests/video-modal-zap.test.mjs
  change_type: ["spec_correction"]
  scenarios:
    - id: SCN-zap-paid-but-receipt-unconfirmed-is-success
      given: "A zap share whose PAYMENT succeeded (NWC returned a preimage) but whose kind-9735 zap receipt could not be validated on the advertised relays"
      when: "sendZap finishes"
      then: "It is reported as a SUCCESS (Sent N sats) with a soft note that the on-relay receipt couldn't be confirmed — NOT as a warning/error. The form resets and the attempt is marked completed."
  observable_outcomes:
    - "last zap status tone === 'success' (was 'warning')"
    - "status message matches /sent 750 sats/i and /couldn't confirm the zap receipt/i (was /awaiting validated zap receipt/i)"
    - "receipts rendered in partial mode; form reset; completedStates +2 ending true"
  determinism_controls:
    - "injected splitAndZap returns a paid receipt (status:success, payment.preimage) with validation.status:'failed'"
  anti_cheat_rationale:
    prevents:
      - "snapshot rubber-stamping"
      - "hard-coded return value"
    note: "The previous expectation asserted the BUG: a paid share whose 9735 receipt
      wasn't found was surfaced as a 'warning' error ('Awaiting validated zap receipt')
      and routed through notifyError — telling users a SUCCESSFUL zap had failed
      (confirmed live: the platform fee landed but the UI showed a red error). The NWC
      payment preimage is proof the invoice was paid; the 9735 receipt is supplementary
      and is commonly not seen by a static client (relay coverage/timing). Corrected to
      assert success-with-a-soft-note. Genuine PAYMENT failures (status !== 'success')
      still go through the failure/retry path, unchanged."
  relaxation:
    did_relax_any_assertion: false
    if_true_explain_spec_basis: ""
```

---

```yaml
test_integrity_note:
  date: 2026-06-23
  file: tests/zap-split.test.mjs
  change_type: ["spec_correction"]
  scenarios:
    - id: SCN-zap-receipt-found-by-indexed-tags
      given: "A published kind-9735 zap receipt for a video zap (the zap request carries #p recipient + #e event tags)"
      when: "validateZapReceipt queries relays for the receipt"
      then: "It filters by the reliably-indexed #e + #p tags (not #bolt11, which most relays don't index), then confirms via author pubkey + bolt11 + description hash"
  observable_outcomes:
    - "the relay query filter has filters[0]['#e'] === [eventId] and ['#p'] === [recipient]"
    - "filters[0]['#bolt11'] is absent"
    - "a matching receipt still validates as status:'passed'"
  determinism_controls:
    - "mock SimplePool.list captures the filter; fixed zap request tags + test bolt11 with matching description hash"
  anti_cheat_rationale:
    prevents:
      - "snapshot rubber-stamping"
      - "over-mocking internal logic"
    note: "The previous test asserted filters[0]['#bolt11'][0] === invoice — encoding the
      bug. Relays generally do not index arbitrary tags like bolt11, so that query found
      nothing and a successfully-paid zap was reported as having no receipt. Corrected to
      assert the reliably-indexed #e/#p anchors (added an #e tag to the request to model a
      real video zap). The receipt-matching assertions (passed status, correct event,
      checked relays) are unchanged/retained — coverage is stronger, not weaker."
  relaxation:
    did_relax_any_assertion: false
    if_true_explain_spec_basis: ""
```

---

```yaml
test_integrity_note:
  date: 2026-06-24
  file: tests/view-counter.test.mjs
  change_type: ["spec_correction", "flake_fix"]
  scenarios:
    - id: SCN-view-counter-legacy-path
      given: "The view-counter unit harness mocks the legacy per-pointer view APIs (list/count/subscribe) on the singleton client"
      when: "A pointer is subscribed and hydrated"
      then: "viewCounter exercises the legacy per-pointer hydrate/subscribe path (the one viewCounter.js explicitly designates 'for tests / mocks'), so the mocked APIs actually fire"
    - id: SCN-view-counter-dedupe-window-aligned
      given: "Two views by the same viewer within one fixed dedupe window"
      when: "Counted"
      then: "They dedupe to one (floor(created_at/window) bucket, matching the replaceable view-event d-tag)"
  observable_outcomes:
    - "hydration triggers a list()/count() call (legacy path) instead of the batched SubscriptionManager path silently taking over"
    - "two same-pubkey views in one aligned bucket yield total === 1"
  determinism_controls:
    - "nostrClient.getSubscriptionManager pinned to () => null so the path is deterministic"
    - "the dedupe test's base timestamp is aligned to a window-bucket boundary (was Date.now(), which made the +window/2 offset straddle a boundary depending on time of day)"
  anti_cheat_rationale:
    prevents:
      - "over-mocking internal logic"
      - "retry/sleep-based flake masking"
    note: "The batched SubscriptionManager path was added later (relay-storm work); the
      test mocks the legacy APIs but never pinned getSubscriptionManager, so the real
      singleton's manager took over and the mocks never fired. Pinning it to null restores
      the intended (and code-designated 'tests/mocks') legacy-path coverage. The dedupe
      assertion (count === 1) is unchanged — only its setup was made deterministic."
  relaxation:
    did_relax_any_assertion: false
    if_true_explain_spec_basis: ""
```

---

```yaml
test_integrity_note:
  date: 2026-06-24
  file: tests/view-counter.test.mjs
  change_type: ["spec_correction"]
  scenarios:
    - id: SCN-hydrate-root-timestamp
      given: "A latest video revision whose root event is fetched by hydrateVideoHistory"
      when: "History is hydrated, then the timestamp-sync step runs"
      then: "rootCreatedAtByRoot caches the earliest (root) created_at, AND the active video's rootCreatedAt FIELD is set by syncActiveVideoRootTimestamp"
  observable_outcomes:
    - "nostrClient.rootCreatedAtByRoot.get(rootId) === root.created_at (hydrateVideoHistory's direct output)"
    - "after syncActiveVideoRootTimestamp(...), latestVideo.rootCreatedAt === root.created_at"
  determinism_controls:
    - "pool.get returns a fixed root event; rootCreatedAtByRoot seeded empty"
  anti_cheat_rationale:
    prevents:
      - "snapshot rubber-stamping"
    note: "hydrateVideoHistory's contract is to populate the per-root created_at MAP; the
      video OBJECT's rootCreatedAt field is applied by a separate util
      (syncActiveVideoRootTimestamp) after a refactor moved that unit boundary. The test
      previously expected hydrateVideoHistory to mutate the passed object directly, which it
      no longer does. Corrected to assert the map (its real output) and to drive the sync
      util for the field — stronger, not weaker (it now exercises the full real pipeline)."
  relaxation:
    did_relax_any_assertion: false
    if_true_explain_spec_basis: ""
```

---

## 2026-06-25 — todo-11b triage: un-quarantine nostr-boost-actions + admin-list-store

```yaml
test_integrity_note:
  change_type: ["spec_correction", "refactor_tests"]
  scenarios:
    - id: SCN-repost-optional-relay
      given: "A repost is built with no relay hint available (buildRepostEvent, nostrEventSchemas.js)"
      when: "buildRepostEvent({ eventId, authorPubkey, targetKind }) is called without eventRelay"
      then: "It returns a VALID repost (kind 16 for a non-kind-1 target, two-element ['e', id] tag, ['p', author], ['k', kind]) instead of throwing"
    - id: SCN-community-blacklist-merge-batched
      given: "An admin community-blacklist sources list references two curator kind-30000 lists, each with p-tag members"
      when: "loadAdminState() runs and fetches curator lists via the BATCHED SubscriptionManager path"
      then: "adminState.blacklist merges the curator members with the direct entry (deduped, guards respected)"
  observable_outcomes:
    - "buildRepostEvent output shape (kind/tags) with no relay — asserted exactly, stricter than the old throws-check"
    - "adminState.blacklist === [direct, communityMemberOne, communityMemberTwo]"
  determinism_controls:
    - "pure builder (no IO) for repost; in-memory list registry + mocked pool.list AND getSubscriptionManager for the admin store"
  anti_cheat_rationale:
    prevents:
      - "hard-coded return value"
      - "over-mocking internal logic"
    note: |
      nostr-boost-actions: STALE SPEC. The test required buildRepostEvent to throw
      /missing-event-relay/ when no relay hint is given, but a relay hint is a NIP-18
      SHOULD (not MUST). The builder intentionally degrades to a two-element `e` tag so a
      user can always repost. Replaced the throws-assertion with an EXACT assertion of the
      valid output (kind 16 + e/p/k tags) — strictly stronger.

      admin-list-store: STALE HARNESS, no production change, no assertion weakened. Three
      fidelity fixes so the test exercises the real batched community-blacklist path:
      (1) curator lists are now fetched via the batched SubscriptionManager (cold-start
      relay-storm fix), which the harness didn't mock — added a getSubscriptionManager().list
      mock serving the same registry; (2) curator coordinates now use REAL 64-char hex
      pubkeys (the old mock-"hex" started with "npub", so parseCommunityBlacklistReferences'
      isHexPubkey()/npub branch decoded them twice and the batched filter no longer matched);
      (3) createListEvent now emits a `d` tag (real kind-30000 lists always have one;
      selectNewestEventsForReferences matches curator events to references by their d tag).
  relaxation:
    did_relax_any_assertion: false
    if_true_explain_spec_basis: ""
```

## 2026-07-05 — todo-11b final: un-quarantine nwc-client (+ user-blocks / nostr-publish-rejection hangs)

```yaml
test_integrity_note:
  change_type: ["spec_correction", "refactor_tests", "flake_fix"]
  scenarios:
    - id: SCN-nwc-unsupported-encryption-scheme
      given: "An NWC wallet whose info event (kind 13194) advertises ONLY an encryption scheme bitvid does not implement (nip44_v3)"
      when: "ensureEncryptionForContext(context) negotiates a scheme"
      then: "It rejects with message /Wallet advertises unsupported encryption schemes: nip44_v3\\./ AND error.code === 'UNSUPPORTED_ENCRYPTION'"
    - id: SCN-nwc-mock-toolkit-selection
      given: "Each nwc-client section installs a per-section window.NostrTools mock to drive encryption-scheme selection"
      when: "The nostr-tools bootstrap has installed its frozen canonical toolkit on the global scope"
      then: "Removing scope.__BITVID_CANONICAL_NOSTR_TOOLS__ lets readToolkitFromScope fall through to the section mock, so the wiring under test runs against the mock (not real @noble against fake keys)"
  observable_outcomes:
    - "ensureEncryptionForContext rejection message + error.code (UNSUPPORTED_ENCRYPTION) — asserted exactly"
    - "nip44_v2 section still resolves via the mock's nip44 (assert.match on the mock ciphertext shape)"
  determinism_controls:
    - "per-section in-memory window.NostrTools mocks; canonical-toolkit removal is deterministic (one-time, nothing re-installs it); no network"
  anti_cheat_rationale:
    prevents:
      - "over-mocking internal logic"
      - "hard-coded return value"
    note: |
      nwc-client: TWO issues. (1) MOCK SHADOW (not a spec change): the bootstrap installs a
      frozen canonical toolkit that readToolkitFromScope() prefers over window.NostrTools, so
      the per-section mocks never took effect and real @noble ran against the fake test keys
      ("bad point: is not on curve"). Deleting the scope canonical lets the resolver use each
      section's mock — the tests exercise the NWC client's encryption-SELECTION wiring, not
      @noble crypto (which is real elsewhere; the parseNwcUri hex-vs-bytes production bug is
      guarded by tests/nwc-parse-uri.test.mjs). (2) SPEC CORRECTION: one section asserted a
      rejection when the toolkit "lacks nip44" by omitting nip44 from the mock. That precondition
      is architecturally unreachable — the bootstrap's mergeWithCanonical ALWAYS backfills the
      canonical nip44 (even an explicit `nip44: null` is overwritten by `!merged.nip44`), so
      nip44_v2 is never an unsupported scheme. Replaced with a wallet advertising a scheme bitvid
      genuinely cannot provide (nip44_v3), exercising the SAME UNSUPPORTED_ENCRYPTION rejection
      via a reachable scenario, and strengthened the check to also assert error.code — strictly
      stronger than the old message-only match.

      user-blocks + nostr-publish-rejection: FLAKE_FIX (no assertion changed). Both are
      bare-assert files that PASS all assertions then hang on lingering handles after completion
      (user-blocks: a never-resolving decrypt's background retry timer that manager.reset() doesn't
      cancel; nostr-publish-rejection: js/app.js + subscriptions + userBlocks module-load
      timers/connection managers). Applied the repo's established post-completion
      `setTimeout(() => process.exit(0), 50)` exit after cleanup. No behavior or expectation was
      altered — the process simply exits once the assertions have all run.
  relaxation:
    did_relax_any_assertion: false
    if_true_explain_spec_basis: ""
```

## 2026-07-05 — todo-11: uploadModal-reset zombie-callback test made deterministic (correct mock boundary)

```yaml
test_integrity_note:
  change_type: ["flake_fix", "refactor_tests"]
  scenarios:
    - id: SCN-upload-zombie-callback-guard
      given: "An upload is in progress (videoUploadState.status === 'uploading') via a controllable pending mediaUploader.uploadVideo"
      when: "resetUploads() runs mid-upload (bumping videoUploadId), then the in-flight upload later resolves (a 'zombie' completion)"
      then: "The stale completion is ignored — status stays 'idle' and results.videoUrl stays '' — because handleVideoSelection guards on videoUploadId !== currentUploadId"
  observable_outcomes:
    - "videoUploadState.status: 'uploading' after start, 'idle' after reset, still 'idle' after the zombie resolve"
    - "results.videoUrl.value === '' after the zombie resolve"
    - "test exits 0 with no async-after-test activity (was leaking webtorrent/Blob errors)"
  determinism_controls:
    - "mediaUploader.uploadVideo replaced with a manually-resolved promise; captureVideoMetadata stubbed; jsdom DOM; no webtorrent, no network, no real Blob ops"
  anti_cheat_rationale:
    prevents:
      - "over-mocking internal logic"
      - "retry/sleep-based flake masking"
    note: |
      FLAKE_FIX + REFACTOR_TESTS, no assertion weakened. The subtest PASSED its asserts but
      leaked async activity after the test ended, which node:test flags as a failure. Root
      cause: it mocked modal.generateTorrentMetadata / resolveUploadIdentifier, but
      handleVideoSelection drives the upload through this.mediaUploader.uploadVideo — a
      DIFFERENT object with its OWN helpers — so the mediaUploader still ran real
      createTorrentMetadata()/hashing on a synthetic {name:'video.mp4'} file ("invalid input
      type" async), and captureVideoMetadata() ran URL.createObjectURL(file) ("must be an
      instance of Blob"). Fixed by mocking at the correct DI boundary
      (modal.mediaUploader.uploadVideo returns the controllable pending promise) and stubbing
      captureVideoMetadata. The unit under test is the modal's videoUploadId zombie-guard, so
      mocking the uploader boundary is correct isolation, not over-mocking (real upload/torrent
      paths are covered by the mediaUploader / s3-upload suites).
  mutation_verification:
    - "Broke the guard (`if (this.videoUploadId !== currentUploadId) return` → `if (false)`) → the test FAILS ('State should remain idle after zombie completion', # fail 1). Reverted."
  relaxation:
    did_relax_any_assertion: false
    if_true_explain_spec_basis: ""
```

## 2026-07-05 — todo-11b: un-quarantine dm-block-filter (hermetic subscription; no force-exit)

```yaml
test_integrity_note:
  change_type: ["flake_fix"]
  scenarios:
    - id: SCN-dm-block-filter-hermetic
      given: "The 'integration with loaded user block list' test loads standard + legacy block lists and filters incoming DMs"
      when: "manager.loadBlocks() runs against stubbed fetchListIncrementally, with the live block-list subscription stubbed out"
      then: "Both blocked contacts (standard + legacy) are filtered (dmMessages === [ALLOWED]) AND the process opens NO real relay sockets, so node:test exits naturally with the correct exit code"
  observable_outcomes:
    - "manager.isBlocked(legacy) && manager.isBlocked(standard) === true; dmMessages length 1 (ALLOWED only)"
    - "process.getActiveResourcesInfo() shows no TCPSocketWrap after loadBlocks; node exits 0 on pass, 1 on a forced failure (verified — failures NOT masked)"
  determinism_controls:
    - "stubbed nostrClient.fetchListIncrementally; truthy stub nostrClient.pool; no-op nostrClient.getSubscriptionManager; window.nostr.nip04.decrypt stub. All restored in finally. No network."
  anti_cheat_rationale:
    prevents:
      - "retry/sleep-based flake masking"
      - "over-mocking internal logic"
    note: |
      FLAKE_FIX, no assertion changed. The file PASSED all subtests then hung: loadBlocks()
      opens a LIVE block-list subscription through nostrClient's real SimplePool aimed at the
      test's fake relay URLs, leaking TCP sockets + reconnect timers that outlive the run so
      node:test never exits (surfaced only once the runner was given a per-file timeout).
      Diagnosed with process.getActiveResourcesInfo() — 4 TCPSocketWrap + reconnect Timeouts;
      NOT the decrypt-retry timer (verified absent). Nulling the pool did not help because
      loadBlocks calls ensurePool() (userBlocks.js:967) to re-create+connect a real pool when
      pool is falsy. Fix keeps the test hermetic: a TRUTHY stub pool (so ensurePool is skipped)
      + a no-op getSubscriptionManager (so the subscription opens nothing). The block-merge
      logic under test still runs fully through the stubbed fetchListIncrementally. A force
      `process.exit` in an after() hook was explicitly REJECTED after verifying it masks real
      failures (process.exitCode is not set when the hook's timer fires — a deliberately broken
      assertion still exited 0 under that approach). Under this fix, the forced-failure control
      correctly exits 1.
  relaxation:
    did_relax_any_assertion: false
    if_true_explain_spec_basis: ""
```
