# Onboarding Audit Report

## Headline
⚠️ Onboarding failures found

## 1. Environment assumptions
- Node.js v22 (from package.json engines)
- NPM v10+ (from package.json engines)
- Fresh environment (dependencies installed via `npm ci`)

## 2. Steps executed
1. `npm ci`
2. `npm run build`
3. `npm run test:unit:shard1`
4. `npm run test:smoke`
5. `npm run format`
6. `npm run lint`

## 3. Results
- `npm ci`: ✅ Passed
- `npm run build`: ✅ Passed
- `npm run test:unit:shard1`: ✅ Passed
- `npm run test:smoke`: ❌ Failed
- `npm run format`: ✅ Passed
- `npm run lint`: ✅ Passed

## 4. Failures

### `npm run test:smoke`
**Cause:** Missing Playwright browsers (`browserType.launch: Executable doesn't exist`).
**Log Excerpt:**
```
[2026-02-15T03:46:43.327Z] --- Smoke Test FAILED: browserType.launch: Executable doesn't exist at /home/jules/.cache/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-linux64/chrome-headless-shell
╔═════════════════════════════════════════════════════════════════════════╗
║ Looks like Playwright Test or Playwright was just installed or updated. ║
║ Please run the following command to download new browsers:              ║
║                                                                         ║
║     npx playwright install                                              ║
║                                                                         ║
║ <3 Playwright Team                                                      ║
╚═════════════════════════════════════════════════════════════════════════╝
```
**Fix:** Added `npx playwright install` as a prerequisite step in documentation.

## 5. Docs changes made
- **README.md**: Added `npx playwright install` to the "Verify setup" code block.
- **CONTRIBUTING.md**: Added `npx playwright install` step before running tests.

## 6. Devcontainer/Docker recommendation
No changes needed. The devcontainer already handles this automatically, but local setup instructions were missing the explicit install step.

---

## Appendix: Full Execution Log

## Onboarding Audit Log
Date: Sun Feb 15 03:45:26 UTC 2026

### Command: `npm ci`

```

> bitvid@1.0.0 prepare
> npm run build:css


> bitvid@1.0.0 build:css
> postcss css/tailwind.source.css -o css/tailwind.generated.css


added 424 packages, and audited 425 packages in 12s

108 packages are looking for funding
  run `npm fund` for details

found 0 vulnerabilities
```

**Result:** ✅ Passed

### Command: `npm run build`

```

> bitvid@1.0.0 build
> node scripts/build-dist.mjs && npm run verify:dist:deploy-artifact

Validating service worker compatibility guard...

> bitvid@1.0.0 lint:sw-compat
> node scripts/check-sw-compat.mjs

[sw-compat] Skipping check: unable to determine HEAD^ or git history unavailable.
[sw-compat] No commit delta found; skipping compatibility check.
Cleaning dist...
Running build:css...

> bitvid@1.0.0 build:css
> postcss css/tailwind.source.css -o css/tailwind.generated.css

Copying files...
Copying directories...
Generating hashed asset manifest...
Rewriting HTML entry points with hashed assets...
Injecting version hash and date...
Injected version: ad7b61d1 • 2026-02-15
Build complete.

> bitvid@1.0.0 verify:dist:deploy-artifact
> node scripts/verify-dist-deploy-artifact.mjs

Deployment artifact verification passed: version markup and hashed asset references are present in dist/index.html.
```

**Result:** ✅ Passed

### Command: `npm run test:unit:shard1`

```

> bitvid@1.0.0 test:unit:shard1
> cross-env UNIT_TEST_SHARD=1/3 node scripts/run-unit-tests.mjs

Using shard 1/3 (67 of 201 files).

→ Running tests/app-batch-fetch-profiles.test.mjs
TAP version 13
# Subtest: batchFetchProfiles handles fast and failing relays
ok 1 - batchFetchProfiles handles fast and failing relays
  ---
  duration_ms: 3.841849
  type: 'test'
  ...
# Subtest: batchFetchProfiles respects forceRefresh
ok 2 - batchFetchProfiles respects forceRefresh
  ---
  duration_ms: 0.896804
  type: 'test'
  ...
1..2
# tests 2
# suites 0
# pass 2
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 15.948291

→ Running tests/app/feedCoordinator.test.mjs
TAP version 13
# Subtest: createFeedCoordinator - loadForYouVideos
    # Subtest: loadForYouVideos executes successfully
    ok 1 - loadForYouVideos executes successfully
      ---
      duration_ms: 2.615827
      type: 'test'
      ...
    1..1
ok 1 - createFeedCoordinator - loadForYouVideos
  ---
  duration_ms: 4.589507
  type: 'test'
  ...
1..1
# tests 2
# suites 0
# pass 2
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 15.461063

→ Running tests/app/is-user-logged-in.test.mjs
TAP version 13
# Subtest: isUserLoggedIn returns false when no user pubkey is set
ok 1 - isUserLoggedIn returns false when no user pubkey is set
  ---
  duration_ms: 1.413552
  type: 'test'
  ...
# Subtest: isUserLoggedIn treats extension logins as authenticated
ok 2 - isUserLoggedIn treats extension logins as authenticated
  ---
  duration_ms: 0.359584
  type: 'test'
  ...
# Subtest: isUserLoggedIn guards against mismatched nostrClient state
ok 3 - isUserLoggedIn guards against mismatched nostrClient state
  ---
  duration_ms: 0.239055
  type: 'test'
  ...
# Subtest: isUserLoggedIn ignores anonymous session actor mismatches
ok 4 - isUserLoggedIn ignores anonymous session actor mismatches
  ---
  duration_ms: 0.254188
  type: 'test'
  ...
# Subtest: isUserLoggedIn rejects mismatched managed session actors
ok 5 - isUserLoggedIn rejects mismatched managed session actors
  ---
  duration_ms: 0.388245
  type: 'test'
  ...
1..5
# tests 5
# suites 0
# pass 5
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 34.693896

→ Running tests/app/similar-content.test.mjs
TAP version 13
# Subtest: orders similar videos by shared tags then timestamp
ok 1 - orders similar videos by shared tags then timestamp
  ---
  duration_ms: 3.327997
  type: 'test'
  ...
# Subtest: returns no matches when the active video lacks tags
ok 2 - returns no matches when the active video lacks tags
  ---
  duration_ms: 0.457593
  type: 'test'
  ...
# Subtest: skips candidates without tag metadata
ok 3 - skips candidates without tag metadata
  ---
  duration_ms: 0.422256
  type: 'test'
  ...
# Subtest: filters NSFW and private videos when NSFW content is disabled
ok 4 - filters NSFW and private videos when NSFW content is disabled
  ---
  duration_ms: 0.514431
  type: 'test'
  ...
1..4
# tests 4
# suites 0
# pass 4
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 17.327108

→ Running tests/authService.test.mjs
TAP version 13
# Subtest: AuthService Coverage
    # Subtest: login
        # Subtest: successfully logs in with valid pubkey
        ok 1 - successfully logs in with valid pubkey
          ---
          duration_ms: 6.795695
          type: 'test'
          ...
        # Subtest: updates global state and calls post-login hooks
        ok 2 - updates global state and calls post-login hooks
          ---
          duration_ms: 1.515071
          type: 'test'
          ...
        # Subtest: throws if lockdown is active and user is not admin
        ok 3 - throws if lockdown is active and user is not admin
          ---
          duration_ms: 1.786007
          type: 'test'
          ...
        # Subtest: allows login if lockdown is active but user is admin
        ok 4 - allows login if lockdown is active but user is admin
          ---
          duration_ms: 1.145737
          type: 'test'
          ...
        1..4
    ok 1 - login
      ---
      duration_ms: 12.58275
      type: 'suite'
      ...
    # Subtest: logout
        # Subtest: clears state and calls reset on dependencies
        ok 1 - clears state and calls reset on dependencies
          ---
          duration_ms: 2.171027
          type: 'test'
          ...
        1..1
    ok 2 - logout
      ---
      duration_ms: 2.555277
      type: 'suite'
      ...
    # Subtest: requestLogin
        # Subtest: uses provider to login
        ok 1 - uses provider to login
          ---
          duration_ms: 1.39524
          type: 'test'
          ...
        # Subtest: does not call login if autoApply is false
        ok 2 - does not call login if autoApply is false
          ---
          duration_ms: 0.749635
          type: 'test'
          ...
        1..2
    ok 3 - requestLogin
      ---
      duration_ms: 2.424515
      type: 'suite'
      ...
    # Subtest: switchProfile
        # Subtest: switches to an existing profile
        ok 1 - switches to an existing profile
          ---
          duration_ms: 1.734632
          type: 'test'
          ...
        # Subtest: reorders saved profiles on switch
        ok 2 - reorders saved profiles on switch
          ---
          duration_ms: 4.177105
          type: 'test'
          ...
        1..2
    ok 4 - switchProfile
      ---
      duration_ms: 6.147662
      type: 'suite'
      ...
    1..4
ok 1 - AuthService Coverage
  ---
  duration_ms: 24.997047
  type: 'suite'
  ...
1..1
# tests 9
# suites 5
# pass 9
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 43.286311

→ Running tests/compliance/nip04_44_compliance.test.mjs
TAP version 13
# Subtest: NIP-04/44 Compliance: Encryption Preference
    # Subtest: createNip46Cipher prefers nip44.v2 when available
    ok 1 - createNip46Cipher prefers nip44.v2 when available
      ---
      duration_ms: 20.887426
      type: 'test'
      ...
    # Subtest: createNip46Cipher falls back to nip04 if nip44 is missing
    ok 2 - createNip46Cipher falls back to nip04 if nip44 is missing
      ---
      duration_ms: 9.256737
      type: 'test'
      ...
    1..2
ok 1 - NIP-04/44 Compliance: Encryption Preference
  ---
  duration_ms: 100.586586
  type: 'test'
  ...
# Subtest: NIP-04/44 Compliance: Decryption Fallback
    # Subtest: decryptNip46PayloadWithKeys handles nip44 (v2) payload
    ok 1 - decryptNip46PayloadWithKeys handles nip44 (v2) payload
      ---
      duration_ms: 24.579771
      type: 'test'
      ...
    # Subtest: decryptNip46PayloadWithKeys handles nip04 payload
    ok 2 - decryptNip46PayloadWithKeys handles nip04 payload
      ---
      duration_ms: 29.713391
      type: 'test'
      ...
    1..2
ok 2 - NIP-04/44 Compliance: Decryption Fallback
  ---
  duration_ms: 56.409027
  type: 'test'
  ...
1..2
# tests 6
# suites 0
# pass 6
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 170.873699

→ Running tests/compliance/video_note_compliance.test.mjs
TAP version 13
# Subtest: Video Note Compliance (Kind 30078 & NIP-71)
    # Subtest: prepareVideoPublishPayload creates Kind 30078 event
    ok 1 - prepareVideoPublishPayload creates Kind 30078 event
      ---
      duration_ms: 2.581463
      type: 'test'
      ...
    # Subtest: prepareVideoPublishPayload includes NIP-71 tags when provided
    ok 2 - prepareVideoPublishPayload includes NIP-71 tags when provided
      ---
      duration_ms: 1.038202
      type: 'test'
      ...
    1..2
ok 1 - Video Note Compliance (Kind 30078 & NIP-71)
  ---
  duration_ms: 36.594567
  type: 'test'
  ...
1..1
# tests 3
# suites 0
# pass 3
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 48.769166

→ Running tests/dm-block-filter.test.mjs
TAP version 13
# Subtest: DM block/mute filtering
    # Subtest: setDmBlockChecker
        # Subtest: should accept a function
        ok 1 - should accept a function
          ---
          duration_ms: 1.706094
          type: 'test'
          ...
        # Subtest: should clear checker when passed null
        ok 2 - should clear checker when passed null
          ---
          duration_ms: 0.428273
          type: 'test'
          ...
        # Subtest: should clear checker when passed non-function
        ok 3 - should clear checker when passed non-function
          ---
          duration_ms: 0.781986
          type: 'test'
          ...
        1..3
    ok 1 - setDmBlockChecker
      ---
      duration_ms: 4.149395
      type: 'suite'
      ...
    # Subtest: applyDirectMessage with block checker
        # Subtest: should drop messages from blocked senders
        ok 1 - should drop messages from blocked senders
          ---
          duration_ms: 1.239557
          type: 'test'
          ...
        # Subtest: should allow messages from non-blocked senders
        ok 2 - should allow messages from non-blocked senders
          ---
          duration_ms: 3.068734
          type: 'test'
          ...
        # Subtest: should allow all messages when no block checker is set
        ok 3 - should allow all messages when no block checker is set
          ---
          duration_ms: 0.815428
          type: 'test'
          ...
        # Subtest: should block outgoing messages to blocked recipients
        ok 4 - should block outgoing messages to blocked recipients
          ---
          duration_ms: 0.414342
          type: 'test'
          ...
        1..4
    ok 2 - applyDirectMessage with block checker
      ---
      duration_ms: 6.218
      type: 'suite'
      ...
    # Subtest: _isDmRemoteBlocked
        # Subtest: should return false when no checker is set
        ok 1 - should return false when no checker is set
          ---
          duration_ms: 0.492049
          type: 'test'
          ...
        # Subtest: should return true for blocked remote pubkey
        ok 2 - should return true for blocked remote pubkey
          ---
          duration_ms: 0.483361
          type: 'test'
          ...
        # Subtest: should return false for allowed remote pubkey
        ok 3 - should return false for allowed remote pubkey
          ---
          duration_ms: 0.471761
          type: 'test'
          ...
        # Subtest: should handle checker that throws
        ok 4 - should handle checker that throws
          ---
          duration_ms: 0.387594
          type: 'test'
          ...
        1..4
    ok 3 - _isDmRemoteBlocked
      ---
      duration_ms: 2.233969
      type: 'suite'
      ...
    1..3
ok 1 - DM block/mute filtering
  ---
  duration_ms: 13.634851
  type: 'suite'
  ...
1..1
# tests 11
# suites 4
# pass 11
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 33.923591

→ Running tests/dm-normalization.test.mjs
TAP version 13
# Subtest: direct message normalization hashes conversations consistently
ok 1 - direct message normalization hashes conversations consistently
  ---
  duration_ms: 17.479873
  type: 'test'
  ...
# Subtest: direct message list dedupes entries by event id
ok 2 - direct message list dedupes entries by event id
  ---
  duration_ms: 6.481717
  type: 'test'
  ...

→ Running tests/event-schemas.test.mjs
TAP version 13
# Subtest: Nostr Event Schemas
    # Subtest: should validate buildVideoPostEvent
    ok 1 - should validate buildVideoPostEvent
      ---
      duration_ms: 2.296503
      type: 'test'
      ...
    # Subtest: should validate buildVideoMirrorEvent
    ok 2 - should validate buildVideoMirrorEvent
      ---
      duration_ms: 0.428058
      type: 'test'
      ...
    # Subtest: should validate buildRepostEvent
    ok 3 - should validate buildRepostEvent
      ---
      duration_ms: 0.448628
      type: 'test'
      ...
    # Subtest: should validate buildShareEvent
    ok 4 - should validate buildShareEvent
      ---
      duration_ms: 0.687412
      type: 'test'
      ...
    # Subtest: should validate buildRelayListEvent
    ok 5 - should validate buildRelayListEvent
      ---
      duration_ms: 0.550941
      type: 'test'
      ...
    # Subtest: should validate buildDmRelayListEvent
    ok 6 - should validate buildDmRelayListEvent
      ---
      duration_ms: 0.397794
      type: 'test'
      ...
    # Subtest: should validate buildProfileMetadataEvent
    ok 7 - should validate buildProfileMetadataEvent
      ---
      duration_ms: 0.470909
      type: 'test'
      ...
    # Subtest: should validate buildMuteListEvent
    ok 8 - should validate buildMuteListEvent
      ---
      duration_ms: 0.494837
      type: 'test'
      ...
    # Subtest: should validate buildDeletionEvent
    ok 9 - should validate buildDeletionEvent
      ---
      duration_ms: 0.778881
      type: 'test'
      ...
    # Subtest: should validate buildLegacyDirectMessageEvent
    ok 10 - should validate buildLegacyDirectMessageEvent
      ---
      duration_ms: 0.506323
      type: 'test'
      ...
    # Subtest: should validate buildDmAttachmentEvent
    ok 11 - should validate buildDmAttachmentEvent
      ---
      duration_ms: 0.291516
      type: 'test'
      ...
    # Subtest: should validate buildDmReadReceiptEvent
    ok 12 - should validate buildDmReadReceiptEvent
      ---
      duration_ms: 0.252318
      type: 'test'
      ...
    # Subtest: should validate buildDmTypingIndicatorEvent
    ok 13 - should validate buildDmTypingIndicatorEvent
      ---
      duration_ms: 0.294519
      type: 'test'
      ...
    # Subtest: should validate buildViewEvent
    ok 14 - should validate buildViewEvent
      ---
      duration_ms: 0.426935
      type: 'test'
      ...
    # Subtest: should validate buildZapRequestEvent
    ok 15 - should validate buildZapRequestEvent
      ---
      duration_ms: 0.371887
      type: 'test'
      ...
    # Subtest: should validate buildReactionEvent
    ok 16 - should validate buildReactionEvent
      ---
      duration_ms: 0.926152
      type: 'test'
      ...
    # Subtest: should validate buildCommentEvent
    ok 17 - should validate buildCommentEvent
      ---
      duration_ms: 0.777169
      type: 'test'
      ...
    # Subtest: should validate buildWatchHistoryEvent
    ok 18 - should validate buildWatchHistoryEvent
      ---
      duration_ms: 0.631954
      type: 'test'
      ...
    # Subtest: should validate buildSubscriptionListEvent
    ok 19 - should validate buildSubscriptionListEvent
      ---
      duration_ms: 0.251728
      type: 'test'
      ...
    # Subtest: should validate buildBlockListEvent
    ok 20 - should validate buildBlockListEvent
      ---
      duration_ms: 0.246948
      type: 'test'
      ...
    # Subtest: should validate buildHashtagPreferenceEvent
    ok 21 - should validate buildHashtagPreferenceEvent
      ---
      duration_ms: 0.186257
      type: 'test'
      ...
    # Subtest: should validate buildAdminListEvent (moderation)
    ok 22 - should validate buildAdminListEvent (moderation)
      ---
      duration_ms: 0.297471
      type: 'test'
      ...
    1..22
ok 1 - Nostr Event Schemas
  ---
  duration_ms: 14.900639
  type: 'suite'
  ...
1..1
# tests 22
# suites 1
# pass 22
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 39.945042

→ Running tests/feed-engine/kids-scorer.test.mjs
TAP version 13
# Subtest: kids scorer correctly identifies dominant positive component
ok 1 - kids scorer correctly identifies dominant positive component
  ---
  duration_ms: 2.552747
  type: 'test'
  ...
# Subtest: kids scorer picks educational-boost when dominant
ok 2 - kids scorer picks educational-boost when dominant
  ---
  duration_ms: 0.557102
  type: 'test'
  ...
1..2
# tests 2
# suites 0
# pass 2
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 15.258451

→ Running tests/hashtag-preferences.test.mjs
[bitvid] [HashtagPreferences] Failed to decrypt hashtag preferences Error: Decrypt permissions are required to read hashtag preferences.
    at HashtagPreferencesService.decryptEvent (file:///app/js/services/hashtagPreferencesService.js:1011:23)
    at async HashtagPreferencesService.loadInternal (file:///app/js/services/hashtagPreferencesService.js:854:25)
    at async HashtagPreferencesService.load (file:///app/js/services/hashtagPreferencesService.js:566:7)
    at async TestContext.<anonymous> (file:///app/tests/hashtag-preferences.test.mjs:291:7)
    at async Test.run (node:internal/test_runner/test:1054:7)
    at async Test.processPendingSubtests (node:internal/test_runner/test:744:7) {
  code: 'hashtag-preferences-permission-required'
}
TAP version 13
# Subtest: load decrypts nip44 payloads and normalizes tags
ok 1 - load decrypts nip44 payloads and normalizes tags
  ---
  duration_ms: 23.963022
  type: 'test'
  ...
# Subtest: load falls back to nip04 decryption
ok 2 - load falls back to nip04 decryption
  ---
  duration_ms: 2.919182
  type: 'test'
  ...
# Subtest: load retries decryptors when hinted scheme fails
ok 3 - load retries decryptors when hinted scheme fails
  ---
  duration_ms: 2.535877
  type: 'test'
  ...
# Subtest: load defers permission-required decrypts until explicitly enabled
ok 4 - load defers permission-required decrypts until explicitly enabled
  ---
  duration_ms: 6.546291
  type: 'test'
  ...
# Subtest: interest and disinterest lists remain exclusive
ok 5 - interest and disinterest lists remain exclusive
  ---
  duration_ms: 14.614851
  type: 'test'
  ...
# Subtest: publish encrypts payload and builds event via builder
ok 6 - publish encrypts payload and builds event via builder
  ---
  duration_ms: 2.972284
  type: 'test'
  ...
# Subtest: publish falls back to window nostr encryptors
ok 7 - publish falls back to window nostr encryptors
  ---
  duration_ms: 2.971028
  type: 'test'
  ...
# Subtest: load prefers canonical kind when timestamps match while accepting legacy payload
ok 8 - load prefers canonical kind when timestamps match while accepting legacy payload
  ---
  duration_ms: 2.569444
  type: 'test'
  ...
# Subtest: load falls back to window.nostr when active signer is missing
ok 9 - load falls back to window.nostr when active signer is missing
  ---
  duration_ms: 2.139009
  type: 'test'
  ...
# Subtest: load falls back to window.nostr when active signer lacks decrypt capabilities
ok 10 - load falls back to window.nostr when active signer lacks decrypt capabilities
  ---
  duration_ms: 1.911429
  type: 'test'
  ...

→ Running tests/media-loader.test.mjs
TAP version 13
# Subtest: MediaLoader assigns image sources once intersecting
ok 1 - MediaLoader assigns image sources once intersecting
  ---
  duration_ms: 91.937274
  type: 'test'
  ...
# Subtest: MediaLoader loads video sources and poster fallbacks
ok 2 - MediaLoader loads video sources and poster fallbacks
  ---
  duration_ms: 19.235034
  type: 'test'
  ...
# Subtest: MediaLoader clears unsupported lazy targets without inline styles
ok 3 - MediaLoader clears unsupported lazy targets without inline styles
  ---
  duration_ms: 11.888975
  type: 'test'
  ...
1..3
# tests 3
# suites 0
# pass 3
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 135.431694

→ Running tests/modal-accessibility.test.mjs
TAP version 13
# Subtest: UploadModal closes on Escape and restores trigger focus
ok 1 - UploadModal closes on Escape and restores trigger focus
  ---
  duration_ms: 238.463524
  type: 'test'
  ...
# Subtest: UploadModal backdrop click closes and restores trigger focus
ok 2 - UploadModal backdrop click closes and restores trigger focus
  ---
  duration_ms: 82.99627
  type: 'test'
  ...
# Subtest: UploadModal mode toggle updates button states
ok 3 - UploadModal mode toggle updates button states
  ---
  duration_ms: 57.553892
  type: 'test'
  ...
# Subtest: EditModal Escape closes and restores trigger focus
ok 4 - EditModal Escape closes and restores trigger focus
  ---
  duration_ms: 99.861129
  type: 'test'
  ...
# Subtest: EditModal backdrop click closes and restores trigger focus
ok 5 - EditModal backdrop click closes and restores trigger focus
  ---
  duration_ms: 81.515444
  type: 'test'
  ...
# Subtest: EditModal visibility toggle updates button state
ok 6 - EditModal visibility toggle updates button state
  ---
  duration_ms: 77.033157
  type: 'test'
  ...
# Subtest: RevertModal Escape closes and restores trigger focus
ok 7 - RevertModal Escape closes and restores trigger focus
  ---
  duration_ms: 55.801713
  type: 'test'
  ...
# Subtest: static modal helper toggles accessibility hooks
ok 8 - static modal helper toggles accessibility hooks
  ---
  duration_ms: 12.46696
  type: 'test'
  ...
1..8
# tests 8
# suites 0
# pass 8
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 717.134031

→ Running tests/moderation/hide-thresholds.test.mjs
TAP version 13
# Subtest: moderation stage hides videos muted by trusted when threshold met
ok 1 - moderation stage hides videos muted by trusted when threshold met
  ---
  duration_ms: 4.165461
  type: 'test'
  ...
# Subtest: moderation stage hides videos when trusted reports exceed threshold
ok 2 - moderation stage hides videos when trusted reports exceed threshold
  ---
  duration_ms: 0.722975
  type: 'test'
  ...
# Subtest: moderation stage respects runtime hide threshold changes
ok 3 - moderation stage respects runtime hide threshold changes
  ---
  duration_ms: 1.05308
  type: 'test'
  ...
# Subtest: moderation stage supports trusted mute hide resolver functions
ok 4 - moderation stage supports trusted mute hide resolver functions
  ---
  duration_ms: 1.205381
  type: 'test'
  ...
# Subtest: moderation stage bypasses hard hides on home feed
ok 5 - moderation stage bypasses hard hides on home feed
  ---
  duration_ms: 0.719345
  type: 'test'
  ...
# Subtest: moderation stage hides admin-whitelisted videos once thresholds fire
ok 6 - moderation stage hides admin-whitelisted videos once thresholds fire
  ---
  duration_ms: 0.749519
  type: 'test'
  ...
1..6
# tests 6
# suites 0
# pass 6
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 24.780133

→ Running tests/moderation/trusted-mute-lists.test.mjs
TAP version 13
# Subtest: trusted mute lists from seeds hide authors for anonymous viewers
ok 1 - trusted mute lists from seeds hide authors for anonymous viewers
  ---
  duration_ms: 14.306244
  type: 'test'
  ...
1..1
# tests 1
# suites 0
# pass 1
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 2016.101732

→ Running tests/more-menu-controller.test.mjs
TAP version 13
# Subtest: copy-link action writes to clipboard and shows success
ok 1 - copy-link action writes to clipboard and shows success
  ---
  duration_ms: 3.107485
  type: 'test'
  ...
# Subtest: blacklist-author requires moderator access and refreshes subscriptions
ok 2 - blacklist-author requires moderator access and refreshes subscriptions
  ---
  duration_ms: 0.628518
  type: 'test'
  ...
# Subtest: blacklist-author shows error when no moderator session is available
ok 3 - blacklist-author shows error when no moderator session is available
  ---
  duration_ms: 0.383313
  type: 'test'
  ...
# Subtest: block-author updates user blocks, reloads videos, and refreshes feeds
ok 4 - block-author updates user blocks, reloads videos, and refreshes feeds
  ---
  duration_ms: 0.721602
  type: 'test'
  ...
# Subtest: mute-author updates viewer mute list and refreshes feeds
ok 5 - mute-author updates viewer mute list and refreshes feeds
  ---
  duration_ms: 0.687179
  type: 'test'
  ...
# Subtest: unmute-author removes creators from viewer mute list
ok 6 - unmute-author removes creators from viewer mute list
  ---
  duration_ms: 0.632077
  type: 'test'
  ...
1..6
# tests 6
# suites 0
# pass 6
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 21.549618

→ Running tests/nip71-builder.test.mjs
TAP version 13
# Subtest: buildNip71VideoEvent assembles rich metadata
ok 1 - buildNip71VideoEvent assembles rich metadata
  ---
  duration_ms: 4.19327
  type: 'test'
  ...
# Subtest: buildNip71VideoEvent falls back to summary and selects kind
ok 2 - buildNip71VideoEvent falls back to summary and selects kind
  ---
  duration_ms: 0.356021
  type: 'test'
  ...
# Subtest: buildNip71VideoEvent attaches pointer tags
ok 3 - buildNip71VideoEvent attaches pointer tags
  ---
  duration_ms: 0.5009
  type: 'test'
  ...
# Subtest: extractNip71MetadataFromTags parses metadata and pointers
ok 4 - extractNip71MetadataFromTags parses metadata and pointers
  ---
  duration_ms: 1.557275
  type: 'test'
  ...
1..4
# tests 4
# suites 0
# pass 4
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 21.660415

→ Running tests/nostr-nip46-queue.test.mjs
TAP version 13
# Subtest: Nip46RequestQueue: processes tasks in FIFO order for same priority
ok 1 - Nip46RequestQueue: processes tasks in FIFO order for same priority
  ---
  duration_ms: 2.338017
  type: 'test'
  ...
# Subtest: Nip46RequestQueue: respects priority levels
ok 2 - Nip46RequestQueue: respects priority levels
  ---
  duration_ms: 11.405619
  type: 'test'
  ...
# Subtest: Nip46RequestQueue: respects minDelayMs
ok 3 - Nip46RequestQueue: respects minDelayMs
  ---
  duration_ms: 102.828117
  type: 'test'
  ...
# Subtest: Nip46RequestQueue: clear() rejects pending tasks
ok 4 - Nip46RequestQueue: clear() rejects pending tasks
  ---
  duration_ms: 101.799664
  type: 'test'
  ...
1..4
# tests 4
# suites 0
# pass 4
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 225.790628

→ Running tests/nostr-service-access-control.test.mjs
TAP version 13
# Subtest: shouldIncludeVideo returns true for whitelist author when npubEncode throws
ok 1 - shouldIncludeVideo returns true for whitelist author when npubEncode throws
  ---
  duration_ms: 3.074599
  type: 'test'
  ...
# Subtest: shouldIncludeVideo rejects blacklisted authors provided as npub
ok 2 - shouldIncludeVideo rejects blacklisted authors provided as npub
  ---
  duration_ms: 2.447816
  type: 'test'
  ...
# Subtest: shouldIncludeVideo rejects blacklisted authors provided as hex when npubEncode throws
ok 3 - shouldIncludeVideo rejects blacklisted authors provided as hex when npubEncode throws
  ---
  duration_ms: 59.304371
  type: 'test'
  ...
# Subtest: shouldIncludeVideo always returns true for the viewer's own video
ok 4 - shouldIncludeVideo always returns true for the viewer's own video
  ---
  duration_ms: 0.500442
  type: 'test'
  ...
# Subtest: shouldIncludeVideo allows access when access control would deny the author
ok 5 - shouldIncludeVideo allows access when access control would deny the author
  ---
  duration_ms: 0.415913
  type: 'test'
  ...

→ Running tests/nostr-specs/kind30078.test.mjs
TAP version 13
# Subtest: Kind 30078 (Video Note) Compliance
    # Subtest: should have correct kind 30078
    ok 1 - should have correct kind 30078
      ---
      duration_ms: 1.53585
      type: 'test'
      ...
    # Subtest: should require version 3
    ok 2 - should require version 3
      ---
      duration_ms: 0.327219
      type: 'test'
      ...
    # Subtest: should build a valid event with required fields
    ok 3 - should build a valid event with required fields
      ---
      duration_ms: 1.253763
      type: 'test'
      ...
    # Subtest: should allow magnet links
    ok 4 - should allow magnet links
      ---
      duration_ms: 0.407579
      type: 'test'
      ...
    # Subtest: should include "s" tag for storage pointer
    ok 5 - should include "s" tag for storage pointer
      ---
      duration_ms: 0.585326
      type: 'test'
      ...
    # Subtest: should include "d" tag
    ok 6 - should include "d" tag
      ---
      duration_ms: 0.46556
      type: 'test'
      ...
    1..6
ok 1 - Kind 30078 (Video Note) Compliance
  ---
  duration_ms: 6.178282
  type: 'suite'
  ...
1..1
# tests 6
# suites 1
# pass 6
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 19.944572

→ Running tests/nostr/cachePolicies.test.mjs
TAP version 13
# Subtest: CACHE_POLICIES structure
ok 1 - CACHE_POLICIES structure
  ---
  duration_ms: 1.251613
  type: 'test'
  ...
# Subtest: VIDEO_POST policy
ok 2 - VIDEO_POST policy
  ---
  duration_ms: 0.288654
  type: 'test'
  ...
# Subtest: WATCH_HISTORY policy
ok 3 - WATCH_HISTORY policy
  ---
  duration_ms: 0.199883
  type: 'test'
  ...
# Subtest: SUBSCRIPTION_LIST policy
ok 4 - SUBSCRIPTION_LIST policy
  ---
  duration_ms: 0.20512
  type: 'test'
  ...
# Subtest: VIDEO_COMMENT policy
ok 5 - VIDEO_COMMENT policy
  ---
  duration_ms: 0.271671
  type: 'test'
  ...
1..5
# tests 5
# suites 0
# pass 5
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 15.31158

→ Running tests/nostr/countDiagnostics.test.mjs
TAP version 13
# Subtest: countDiagnostics
    # Subtest: isVerboseDiagnosticsEnabled
        # Subtest: should return true by default (due to override)
        ok 1 - should return true by default (due to override)
          ---
          duration_ms: 1.191754
          type: 'test'
          ...
        # Subtest: should return false if window.__BITVID_VERBOSE_DEV_MODE__ is false
        ok 2 - should return false if window.__BITVID_VERBOSE_DEV_MODE__ is false
          ---
          duration_ms: 0.449208
          type: 'test'
          ...
        # Subtest: should return true if window.__BITVID_VERBOSE_DEV_MODE__ is true
        ok 3 - should return true if window.__BITVID_VERBOSE_DEV_MODE__ is true
          ---
          duration_ms: 0.417906
          type: 'test'
          ...
        # Subtest: should fall back to isVerboseDevMode if window flag is not boolean
        ok 4 - should fall back to isVerboseDevMode if window flag is not boolean
          ---
          duration_ms: 0.540255
          type: 'test'
          ...
        1..4
    ok 1 - isVerboseDiagnosticsEnabled
      ---
      duration_ms: 3.610227
      type: 'suite'
      ...
    # Subtest: logRelayCountFailure
        # Subtest: should log warning for new relay URL
        ok 1 - should log warning for new relay URL
          ---
          duration_ms: 1.217884
          type: 'test'
          ...
        # Subtest: should suppress 'Failed to connect to relay' errors
        ok 2 - should suppress 'Failed to connect to relay' errors
          ---
          duration_ms: 0.257166
          type: 'test'
          ...
        # Subtest: should throttle duplicate warnings for the same relay
        ok 3 - should throttle duplicate warnings for the same relay
          ---
          duration_ms: 0.386655
          type: 'test'
          ...
        # Subtest: should handle empty or non-string relay URLs
        ok 4 - should handle empty or non-string relay URLs
          ---
          duration_ms: 0.528574
          type: 'test'
          ...
        1..4
    ok 2 - logRelayCountFailure
      ---
      duration_ms: 2.857697
      type: 'suite'
      ...
    # Subtest: Other Loggers
        # Subtest: should log timeout cleanup failure once
        ok 1 - should log timeout cleanup failure once
          ---
          duration_ms: 0.513037
          type: 'test'
          ...
        # Subtest: should log rebroadcast failure once
        ok 2 - should log rebroadcast failure once
          ---
          duration_ms: 0.326532
          type: 'test'
          ...
        # Subtest: should log view count failure once
        ok 3 - should log view count failure once
          ---
          duration_ms: 0.378444
          type: 'test'
          ...
        1..3
    ok 3 - Other Loggers
      ---
      duration_ms: 1.429519
      type: 'suite'
      ...
    # Subtest: Verbose Mode Disabled
        # Subtest: should not log even for new keys when disabled
        ok 1 - should not log even for new keys when disabled
          ---
          duration_ms: 0.324998
          type: 'test'
          ...
        # Subtest: should not consume throttle key when disabled
        ok 2 - should not consume throttle key when disabled
          ---
          duration_ms: 0.37997
          type: 'test'
          ...
        1..2
    ok 4 - Verbose Mode Disabled
      ---
      duration_ms: 0.856274
      type: 'suite'
      ...
    1..4
ok 1 - countDiagnostics
  ---
  duration_ms: 13.742429
  type: 'suite'
  ...
1..1
# tests 13
# suites 5
# pass 13
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 38.06713

→ Running tests/nostr/dm-direct-message-flow.test.mjs
TAP version 13
# Subtest: DM relay duplication is deduped
ok 1 - DM relay duplication is deduped
  ---
  duration_ms: 154.115061
  type: 'test'
  ...
# Subtest: out-of-order DM delivery keeps newest messages first
ok 2 - out-of-order DM delivery keeps newest messages first
  ---
  duration_ms: 88.467177
  type: 'test'
  ...
# Subtest: DM reconnect replays do not duplicate messages or reset seen state
ok 3 - DM reconnect replays do not duplicate messages or reset seen state
  ---
  duration_ms: 174.609346
  type: 'test'
  ...
1..3
# tests 3
# suites 0
# pass 3
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 425.568639

→ Running tests/nostr/dmDecryptWorkerClient.test.mjs
TAP version 13
# Subtest: dmDecryptWorkerClient
    # Subtest: should support worker environment
    ok 1 - should support worker environment
      ---
      duration_ms: 5.374374
      type: 'test'
      ...
    # Subtest: should reject if Worker is unavailable
    ok 2 - should reject if Worker is unavailable
      ---
      duration_ms: 2.95107
      type: 'test'
      ...
    # Subtest: should reject if inputs are invalid
    ok 3 - should reject if inputs are invalid
      ---
      duration_ms: 2.720202
      type: 'test'
      ...
    # Subtest: should successfully decrypt message
    ok 4 - should successfully decrypt message
      ---
      duration_ms: 9.059537
      type: 'test'
      ...
    # Subtest: should handle worker error response
    ok 5 - should handle worker error response
      ---
      duration_ms: 3.692516
      type: 'test'
      ...
    # Subtest: should handle worker error event
    ok 6 - should handle worker error event
      ---
      duration_ms: 4.255104
      type: 'test'
      ...
    # Subtest: should timeout if worker does not respond
    ok 7 - should timeout if worker does not respond
      ---
      duration_ms: 101.850183
      type: 'test'
      ...
    # Subtest: should initialize worker lazily and reuse instance
    ok 8 - should initialize worker lazily and reuse instance
      ---
      duration_ms: 3.154795
      type: 'test'
      ...
    # Subtest: should recreate worker if creation fails
    ok 9 - should recreate worker if creation fails
      ---
      duration_ms: 1.780904
      type: 'test'
      ...
    1..9
ok 1 - dmDecryptWorkerClient
  ---
  duration_ms: 137.677385
  type: 'suite'
  ...
1..1
# tests 9
# suites 1
# pass 9
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 146.784447

→ Running tests/nostr/eventsCacheStore.test.mjs
TAP version 13
# Subtest: EventsCacheStore
    # Subtest: persistSnapshot should store events and tombstones
    ok 1 - persistSnapshot should store events and tombstones
      ---
      duration_ms: 15.448183
      type: 'test'
      ...
    # Subtest: persistSnapshot should only update changed items
    ok 2 - persistSnapshot should only update changed items
      ---
      duration_ms: 3.734208
      type: 'test'
      ...
    # Subtest: persistSnapshot should delete removed items
    ok 3 - persistSnapshot should delete removed items
      ---
      duration_ms: 3.105603
      type: 'test'
      ...
    # Subtest: persistSnapshot should respect dirty keys optimization
    ok 4 - persistSnapshot should respect dirty keys optimization
      ---
      duration_ms: 2.443119
      type: 'test'
      ...
    1..4
ok 1 - EventsCacheStore
  ---
  duration_ms: 26.573291
  type: 'suite'
  ...
1..1
# tests 4
# suites 1
# pass 4
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 34.250108

→ Running tests/nostr/maxListenerDiagnostics.test.mjs
TAP version 13
# Subtest: maxListenerDiagnostics
    # Subtest: collectCandidateStrings
        # Subtest: should return empty array for null/undefined/falsy
        ok 1 - should return empty array for null/undefined/falsy
          ---
          duration_ms: 1.755901
          type: 'test'
          ...
        # Subtest: should return array with string for string input
        ok 2 - should return array with string for string input
          ---
          duration_ms: 0.54973
          type: 'test'
          ...
        # Subtest: should extract relevant fields from object
        ok 3 - should extract relevant fields from object
          ---
          duration_ms: 0.604648
          type: 'test'
          ...
        # Subtest: should ignore non-string fields in object
        ok 4 - should ignore non-string fields in object
          ---
          duration_ms: 0.570708
          type: 'test'
          ...
        1..4
    ok 1 - collectCandidateStrings
      ---
      duration_ms: 4.411108
      type: 'suite'
      ...
    # Subtest: shouldSuppressWarning
        # Subtest: should NOT suppress anything if verbose mode is enabled
        ok 1 - should NOT suppress anything if verbose mode is enabled
          ---
          duration_ms: 0.633823
          type: 'test'
          ...
        # Subtest: should suppress warning by code string
        ok 2 - should suppress warning by code string
          ---
          duration_ms: 0.234248
          type: 'test'
          ...
        # Subtest: should suppress warning by object code property
        ok 3 - should suppress warning by object code property
          ---
          duration_ms: 0.284711
          type: 'test'
          ...
        # Subtest: should suppress warning by message snippet
        ok 4 - should suppress warning by message snippet
          ---
          duration_ms: 0.376485
          type: 'test'
          ...
        # Subtest: should suppress warning by object message property snippet
        ok 5 - should suppress warning by object message property snippet
          ---
          duration_ms: 0.433506
          type: 'test'
          ...
        # Subtest: should NOT suppress unrelated warnings
        ok 6 - should NOT suppress unrelated warnings
          ---
          duration_ms: 0.462472
          type: 'test'
          ...
        # Subtest: should handle multiple arguments
        ok 7 - should handle multiple arguments
          ---
          duration_ms: 0.439738
          type: 'test'
          ...
        1..7
    ok 2 - shouldSuppressWarning
      ---
      duration_ms: 3.543761
      type: 'suite'
      ...
    # Subtest: process.emitWarning patch
        # Subtest: should have patched process.emitWarning
        ok 1 - should have patched process.emitWarning
          ---
          duration_ms: 0.255569
          type: 'test'
          ...
        1..1
    ok 3 - process.emitWarning patch
      ---
      duration_ms: 0.384431
      type: 'suite'
      ...
    1..3
ok 1 - maxListenerDiagnostics
  ---
  duration_ms: 10.123805
  type: 'suite'
  ...
1..1
# tests 12
# suites 4
# pass 12
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 30.979715

→ Running tests/nostr/nip07Permissions.test.js
TAP version 13
# Subtest: writeStoredNip07Permissions normalizes and persists granted methods
ok 1 - writeStoredNip07Permissions normalizes and persists granted methods
  ---
  duration_ms: 2.173318
  type: 'test'
  ...
# Subtest: clearStoredNip07Permissions removes persisted grants
ok 2 - clearStoredNip07Permissions removes persisted grants
  ---
  duration_ms: 0.292226
  type: 'test'
  ...
# Subtest: requestEnablePermissions retries explicit and fallback variants
ok 3 - requestEnablePermissions retries explicit and fallback variants
  ---
  duration_ms: 1.792873
  type: 'test'
  ...
# Subtest: requestEnablePermissions reports unavailable extension
ok 4 - requestEnablePermissions reports unavailable extension
  ---
  duration_ms: 0.21902
  type: 'test'
  ...
# Subtest: waitForNip07Extension resolves when extension is present
ok 5 - waitForNip07Extension resolves when extension is present
  ---
  duration_ms: 0.486451
  type: 'test'
  ...
# Subtest: waitForNip07Extension resolves when extension appears later
ok 6 - waitForNip07Extension resolves when extension appears later
  ---
  duration_ms: 50.709536
  type: 'test'
  ...
# Subtest: waitForNip07Extension rejects when extension never appears
ok 7 - waitForNip07Extension rejects when extension never appears
  ---
  duration_ms: 101.272522
  type: 'test'
  ...
1..7
# tests 7
# suites 0
# pass 7
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 164.949654

→ Running tests/nostr/nip71.test.js
TAP version 13
# Subtest: buildNip71MetadataTags normalizes structured fields
ok 1 - buildNip71MetadataTags normalizes structured fields
  ---
  duration_ms: 3.253825
  type: 'test'
  ...
# Subtest: collectNip71PointerRequests aggregates events and tags
ok 2 - collectNip71PointerRequests aggregates events and tags
  ---
  duration_ms: 0.578783
  type: 'test'
  ...
# Subtest: processNip71Events reconciles pointers and filters video hashtags
ok 3 - processNip71Events reconciles pointers and filters video hashtags
  ---
  duration_ms: 1.371637
  type: 'test'
  ...
# Subtest: populateNip71MetadataForVideos fetches missing records once
ok 4 - populateNip71MetadataForVideos fetches missing records once
  ---
  duration_ms: 0.905554
  type: 'test'
  ...
# Subtest: buildNip71VideoEvent composes pointer tags
ok 5 - buildNip71VideoEvent composes pointer tags
  ---
  duration_ms: 0.810467
  type: 'test'
  ...
1..5
# tests 5
# suites 0
# pass 5
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 20.261854

→ Running tests/nostr/publishHelpers.test.mjs
TAP version 13
# Subtest: mirrorVideoEvent lowercases provided MIME types
ok 1 - mirrorVideoEvent lowercases provided MIME types
  ---
  duration_ms: 4.452107
  type: 'test'
  ...
# Subtest: mirrorVideoEvent lowercases inferred MIME types
ok 2 - mirrorVideoEvent lowercases inferred MIME types
  ---
  duration_ms: 0.878048
  type: 'test'
  ...
# Subtest: mirrorVideoEvent includes hash tags when provided
ok 3 - mirrorVideoEvent includes hash tags when provided
  ---
  duration_ms: 1.521652
  type: 'test'
  ...
1..3
# tests 3
# suites 0
# pass 3
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 19.072876

→ Running tests/nostr/session-actor.test.mjs
TAP version 13
# Subtest: SessionActor
    # Subtest: encrypts and decrypts private key
    ok 1 - encrypts and decrypts private key
      ---
      duration_ms: 304.532976
      type: 'test'
      ...
    # Subtest: fails to decrypt with wrong passphrase
    ok 2 - fails to decrypt with wrong passphrase
      ---
      duration_ms: 294.542657
      type: 'test'
      ...
    # Subtest: persists and reads session actor
    ok 3 - persists and reads session actor
      ---
      duration_ms: 1.437758
      type: 'test'
      ...
    # Subtest: clears stored session actor
    ok 4 - clears stored session actor
      ---
      duration_ms: 0.374769
      type: 'test'
      ...
    1..4
ok 1 - SessionActor
  ---
  duration_ms: 602.949098
  type: 'test'
  ...
1..1
# tests 5
# suites 0
# pass 5
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 615.899874

→ Running tests/nostr/sign-request-queue.test.mjs
TAP version 13
# Subtest: queueSignEvent: processes requests sequentially
ok 1 - queueSignEvent: processes requests sequentially
  ---
  duration_ms: 104.408913
  type: 'test'
  ...
# Subtest: queueSignEvent: handles timeouts
ok 2 - queueSignEvent: handles timeouts
  ---
  duration_ms: 21.414134
  type: 'test'
  ...
# Subtest: queueSignEvent: handles permission denied errors
ok 3 - queueSignEvent: handles permission denied errors
  ---
  duration_ms: 0.621015
  type: 'test'
  ...
# Subtest: queueSignEvent: handles signer disconnected
ok 4 - queueSignEvent: handles signer disconnected
  ---
  duration_ms: 0.527632
  type: 'test'
  ...
# Subtest: queueSignEvent: fails if signer is missing or invalid
ok 5 - queueSignEvent: fails if signer is missing or invalid
  ---
  duration_ms: 0.520472
  type: 'test'
  ...
# Subtest: queueSignEvent: continues queue processing after failure
ok 6 - queueSignEvent: continues queue processing after failure
  ---
  duration_ms: 0.801907
  type: 'test'
  ...
1..6
# tests 6
# suites 0
# pass 6
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 211.158917

→ Running tests/nostr/toolkit.test.mjs
TAP version 13
# Subtest: toolkit: DEFAULT_RELAY_URLS is frozen and contains valid URLs
ok 1 - toolkit: DEFAULT_RELAY_URLS is frozen and contains valid URLs
  ---
  duration_ms: 1.171268
  type: 'test'
  ...
# Subtest: toolkit: resolveSimplePoolConstructor finds SimplePool
ok 2 - toolkit: resolveSimplePoolConstructor finds SimplePool
  ---
  duration_ms: 0.51039
  type: 'test'
  ...
# Subtest: toolkit: shimLegacySimplePoolMethods adds sub/list/map if missing
ok 3 - toolkit: shimLegacySimplePoolMethods adds sub/list/map if missing
  ---
  duration_ms: 0.742595
  type: 'test'
  ...
# Subtest: toolkit: readToolkitFromScope finds NostrTools in global scope
ok 4 - toolkit: readToolkitFromScope finds NostrTools in global scope
  ---
  duration_ms: 0.305169
  type: 'test'
  ...
# Subtest: toolkit: normalizeToolkitCandidate validation
ok 5 - toolkit: normalizeToolkitCandidate validation
  ---
  duration_ms: 0.663416
  type: 'test'
  ...
# Subtest: toolkit: shimLegacySimplePoolMethods handles simple list operation
ok 6 - toolkit: shimLegacySimplePoolMethods handles simple list operation
  ---
  duration_ms: 10.742613
  type: 'test'
  ...
1..6
# tests 6
# suites 0
# pass 6
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 21.58526

→ Running tests/nostr/watchHistory.test.js
[bitvid] [ProfileCache] Expired watchHistory for 2222222222222222222222222222222222222222222222222222222222222222
TAP version 13
# Subtest: buildWatchHistoryPayload enforces byte limits and records skipped entries
ok 1 - buildWatchHistoryPayload enforces byte limits and records skipped entries
  ---
  duration_ms: 3.020853
  type: 'test'
  ...
# Subtest: getWatchHistoryStorage prunes entries that exceed the configured TTL
ok 2 - getWatchHistoryStorage prunes entries that exceed the configured TTL
  ---
  duration_ms: 2.484765
  type: 'test'
  ...
# Subtest: fetchWatchHistory prefers decrypted chunk payloads when nip04 decrypt succeeds
ok 3 - fetchWatchHistory prefers decrypted chunk payloads when nip04 decrypt succeeds
  ---
  duration_ms: 9.542144
  type: 'test'
  ...
# Subtest: fetchWatchHistory falls back to pointer payload when nip04 decrypt fails
ok 4 - fetchWatchHistory falls back to pointer payload when nip04 decrypt fails
  ---
  duration_ms: 2.321171
  type: 'test'
  ...
# Subtest: publishWatchHistorySnapshot uses injected nostr-tools helpers when signer cannot encrypt
ok 5 - publishWatchHistorySnapshot uses injected nostr-tools helpers when signer cannot encrypt
  ---
  duration_ms: 5.145558
  type: 'test'
  ...
# Subtest: publishWatchHistorySnapshot caches successful snapshot results
ok 6 - publishWatchHistorySnapshot caches successful snapshot results
  ---
  duration_ms: 2.97558
  type: 'test'
  ...
1..6
# tests 6
# suites 0
# pass 6
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 33.328616

→ Running tests/performance/resolvePostedAt.test.mjs
pool.list calls: 2
pool.get calls: 0
TAP version 13
# Subtest: hydrateVideoHistoryBatch optimizes network calls
ok 1 - hydrateVideoHistoryBatch optimizes network calls
  ---
  duration_ms: 5.077898
  type: 'test'
  ...
# Subtest: resolveVideoPostedAtBatch uses batch hydration
ok 2 - resolveVideoPostedAtBatch uses batch hydration
  ---
  duration_ms: 0.762494
  type: 'test'
  ...
1..2
# tests 2
# suites 0
# pass 2
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 18.779541

→ Running tests/profile-modal-controller.test.mjs
TAP version 13
# Subtest: Profile modal Escape closes and restores trigger focus
ok 1 - Profile modal Escape closes and restores trigger focus
  ---
  duration_ms: 1469.7277
  type: 'test'
  ...
# Subtest: Add profile request suspends focus trap and elevates login modal
ok 2 - Add profile request suspends focus trap and elevates login modal
  ---
  duration_ms: 1323.568723
  type: 'test'
  ...
# Subtest: Profile modal navigation buttons toggle active state
ok 3 - Profile modal navigation buttons toggle active state
  ---
  duration_ms: 1453.20504
  type: 'test'
  ...
# Subtest: Profile modal toggles mobile menu and pane views
ok 4 - Profile modal toggles mobile menu and pane views
  ---
  duration_ms: 1442.70442
  type: 'test'
  ...
# Subtest: wallet URI input masks persisted values and restores on focus
ok 5 - wallet URI input masks persisted values and restores on focus
  ---
  duration_ms: 1044.304186
  type: 'test'
  ...
# Subtest: Profile modal uses abbreviated npub display
ok 6 - Profile modal uses abbreviated npub display
  ---
  duration_ms: 783.009092
  type: 'test'
  ...
# Subtest: renderSavedProfiles applies provider metadata
ok 7 - renderSavedProfiles applies provider metadata
  ---
  duration_ms: 782.447932
  type: 'test'
  ...
# Subtest: Hashtag pane shows empty states by default
ok 8 - Hashtag pane shows empty states by default
  ---
  duration_ms: 969.506899
  type: 'test'
  ...
# Subtest: Hashtag pane adds, moves, and removes tags
ok 9 - Hashtag pane adds, moves, and removes tags
  ---
  duration_ms: 968.954229
  type: 'test'
  ...
# Subtest: handleAddHashtagPreference publishes updates
ok 10 - handleAddHashtagPreference publishes updates
  ---
  duration_ms: 983.262356
  type: 'test'
  ...
# Subtest: Hashtag pane resets after logout when service clears tags
ok 11 - Hashtag pane resets after logout when service clears tags
  ---
  duration_ms: 1192.802164
  type: 'test'
  ...
# Subtest: load() injects markup and caches expected elements
ok 12 - load() injects markup and caches expected elements
  ---
  duration_ms: 513.149987
  type: 'test'
  ...
# Subtest: show()/hide() toggle panes, trap focus, and refresh the wallet pane
ok 13 - show()/hide() toggle panes, trap focus, and refresh the wallet pane
  ---
  duration_ms: 984.570203
  type: 'test'
  ...
# Subtest: populateProfileRelays renders entries and wires action buttons
ok 14 - populateProfileRelays renders entries and wires action buttons
  ---
  duration_ms: 535.202202
  type: 'test'
  ...
# Subtest: admin mutations invoke accessControl stubs and update admin DOM
ok 15 - admin mutations invoke accessControl stubs and update admin DOM
  ---
  duration_ms: 536.036364
  type: 'test'
  ...
# Subtest: history pane lazily initializes the watch history renderer
ok 16 - history pane lazily initializes the watch history renderer
  ---
  duration_ms: 1407.155808
  type: 'test'
  ...
# Subtest: handleDirectMessagesRelayWarning throttles status updates
ok 17 - handleDirectMessagesRelayWarning throttles status updates
  ---
  duration_ms: 516.386463
  type: 'test'
  ...
# Subtest: handleDirectMessagesRelayWarning suppresses status updates when disabled
ok 18 - handleDirectMessagesRelayWarning suppresses status updates when disabled
  ---
  duration_ms: 511.17663
  type: 'test'
  ...
1..18
# tests 18
# suites 0
# pass 18
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 17427.497349

→ Running tests/revert-modal-controller.test.mjs
TAP version 13
# Subtest: RevertModalController
    # Subtest: open() fetches history and opens modal
    ok 1 - open() fetches history and opens modal
      ---
      duration_ms: 1.450544
      type: 'test'
      ...
    # Subtest: open() shows error if not logged in
    ok 2 - open() shows error if not logged in
      ---
      duration_ms: 0.440968
      type: 'test'
      ...
    # Subtest: handleConfirm() calls revertVideo and refreshes
    ok 3 - handleConfirm() calls revertVideo and refreshes
      ---
      duration_ms: 0.48174
      type: 'test'
      ...
    1..3
ok 1 - RevertModalController
  ---
  duration_ms: 4.159724
  type: 'test'
  ...
1..1
# tests 4
# suites 0
# pass 4
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 15.959592

→ Running tests/services/authUtils.test.mjs
TAP version 13
# Subtest: authUtils
    # Subtest: normalizeProviderId
        # Subtest: returns trimmed string if valid
        ok 1 - returns trimmed string if valid
          ---
          duration_ms: 2.144222
          type: 'test'
          ...
        # Subtest: returns 'nip07' fallback if empty
        ok 2 - returns 'nip07' fallback if empty
          ---
          duration_ms: 0.201611
          type: 'test'
          ...
        # Subtest: returns 'nip07' fallback if null
        ok 3 - returns 'nip07' fallback if null
          ---
          duration_ms: 0.318762
          type: 'test'
          ...
        # Subtest: returns 'nip07' fallback if undefined
        ok 4 - returns 'nip07' fallback if undefined
          ---
          duration_ms: 0.243121
          type: 'test'
          ...
        # Subtest: returns 'nip07' fallback if not a string
        ok 5 - returns 'nip07' fallback if not a string
          ---
          duration_ms: 0.169876
          type: 'test'
          ...
        1..5
    ok 1 - normalizeProviderId
      ---
      duration_ms: 4.681913
      type: 'test'
      ...
    # Subtest: normalizeAuthType
        # Subtest: prioritizes authTypeCandidate
        ok 1 - prioritizes authTypeCandidate
          ---
          duration_ms: 0.466432
          type: 'test'
          ...
        # Subtest: falls back to providerResult.authType
        ok 2 - falls back to providerResult.authType
          ---
          duration_ms: 0.207213
          type: 'test'
          ...
        # Subtest: falls back to providerResult.providerId
        ok 3 - falls back to providerResult.providerId
          ---
          duration_ms: 0.395975
          type: 'test'
          ...
        # Subtest: falls back to providerId
        ok 4 - falls back to providerId
          ---
          duration_ms: 0.234249
          type: 'test'
          ...
        # Subtest: returns 'nip07' if all else fails
        ok 5 - returns 'nip07' if all else fails
          ---
          duration_ms: 0.127395
          type: 'test'
          ...
        # Subtest: trims whitespace from results
        ok 6 - trims whitespace from results
          ---
          duration_ms: 0.134673
          type: 'test'
          ...
        # Subtest: ignores empty strings in candidates
        ok 7 - ignores empty strings in candidates
          ---
          duration_ms: 0.155309
          type: 'test'
          ...
        1..7
    ok 2 - normalizeAuthType
      ---
      duration_ms: 3.084977
      type: 'test'
      ...
    1..2
ok 1 - authUtils
  ---
  duration_ms: 8.791832
  type: 'test'
  ...
1..1
# tests 15
# suites 0
# pass 15
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 27.600349

→ Running tests/services/exploreDataService.test.mjs
TAP version 13
# Subtest: exploreDataService - buildWatchHistoryTagCounts
    # Subtest: should return empty Map if watchHistoryService is missing
    ok 1 - should return empty Map if watchHistoryService is missing
      ---
      duration_ms: 1.259941
      type: 'test'
      ...
    # Subtest: should handle missing loadLatest method gracefully
    ok 2 - should handle missing loadLatest method gracefully
      ---
      duration_ms: 0.475673
      type: 'test'
      ...
    # Subtest: should handle loadLatest failure gracefully
    ok 3 - should handle loadLatest failure gracefully
      ---
      duration_ms: 7.966391
      type: 'test'
      ...
    # Subtest: should return counts from worker on success
    ok 4 - should return counts from worker on success
      ---
      duration_ms: 2.426911
      type: 'test'
      ...
    # Subtest: should handle worker error gracefully
    ok 5 - should handle worker error gracefully
      ---
      duration_ms: 1.556333
      type: 'test'
      ...
    1..5
ok 1 - exploreDataService - buildWatchHistoryTagCounts
  ---
  duration_ms: 23.175866
  type: 'suite'
  ...
1..1
# tests 5
# suites 1
# pass 5
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 30.86583

→ Running tests/services/nostr-service.test.mjs
TAP version 13
# Subtest: NostrService
    # Subtest: loadVideos
        # Subtest: should load cached videos and start subscription
        ok 1 - should load cached videos and start subscription
          ---
          duration_ms: 3.459953
          type: 'test'
          ...
        1..1
    ok 1 - loadVideos
      ---
      duration_ms: 4.557931
      type: 'suite'
      ...
    # Subtest: fetchVideosByAuthors
        # Subtest: should fetch videos from relays for specific authors
        ok 1 - should fetch videos from relays for specific authors
          ---
          duration_ms: 2.337507
          type: 'test'
          ...
        1..1
    ok 2 - fetchVideosByAuthors
      ---
      duration_ms: 2.581505
      type: 'suite'
      ...
    1..2
ok 1 - NostrService
  ---
  duration_ms: 7.98116
  type: 'suite'
  ...
1..1
# tests 2
# suites 3
# pass 2
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 23.777942

→ Running tests/services/playbackService.test.mjs
(node:2901) ExperimentalWarning: The MockTimers API is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
TAP version 13
# Subtest: PlaybackService
    # Subtest: Initialization sets defaults and dependencies
    ok 1 - Initialization sets defaults and dependencies
      ---
      duration_ms: 1.493747
      type: 'test'
      ...
    # Subtest: prepareVideoElement respects localStorage and binds listener
    ok 2 - prepareVideoElement respects localStorage and binds listener
      ---
      duration_ms: 4.785662
      type: 'test'
      ...
    # Subtest: registerUrlPlaybackWatchdogs triggers onFallback on error
    ok 3 - registerUrlPlaybackWatchdogs triggers onFallback on error
      ---
      duration_ms: 1.642048
      type: 'test'
      ...
    # Subtest: registerUrlPlaybackWatchdogs triggers onSuccess on playing
    ok 4 - registerUrlPlaybackWatchdogs triggers onSuccess on playing
      ---
      duration_ms: 0.726003
      type: 'test'
      ...
    # Subtest: createSession returns a PlaybackSession
    ok 5 - createSession returns a PlaybackSession
      ---
      duration_ms: 0.537659
      type: 'test'
      ...
    # Subtest: PlaybackSession Flow
        # Subtest: URL Probe Success starts playback
        ok 1 - URL Probe Success starts playback
          ---
          duration_ms: 8.917385
          type: 'test'
          ...
        # Subtest: URL Probe Failure triggers fallback
        ok 2 - URL Probe Failure triggers fallback
          ---
          duration_ms: 2.636913
          type: 'test'
          ...
        # Subtest: Watchdog Stall triggers fallback
        ok 3 - Watchdog Stall triggers fallback
          ---
          duration_ms: 3.045819
          type: 'test'
          ...
        1..3
    ok 6 - PlaybackSession Flow
      ---
      duration_ms: 15.229365
      type: 'suite'
      ...
    1..6
ok 1 - PlaybackService
  ---
  duration_ms: 108.524429
  type: 'suite'
  ...
1..1
# tests 8
# suites 2
# pass 8
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 122.895195

→ Running tests/services/relay-health-service.test.mjs
TAP version 13
# Subtest: RelayHealthService: initializes with default values
ok 1 - RelayHealthService: initializes with default values
  ---
  duration_ms: 1.641452
  type: 'test'
  ...
# Subtest: RelayHealthService: manages telemetry opt-in
ok 2 - RelayHealthService: manages telemetry opt-in
  ---
  duration_ms: 0.356629
  type: 'test'
  ...
# Subtest: RelayHealthService: getRelayUrls fetches from relayManager
ok 3 - RelayHealthService: getRelayUrls fetches from relayManager
  ---
  duration_ms: 1.02515
  type: 'test'
  ...
# Subtest: RelayHealthService: ensureRelayState creates default state
ok 4 - RelayHealthService: ensureRelayState creates default state
  ---
  duration_ms: 0.23577
  type: 'test'
  ...
# Subtest: RelayHealthService: checkRelay success flow
ok 5 - RelayHealthService: checkRelay success flow
  ---
  duration_ms: 1.054715
  type: 'test'
  ...
# Subtest: RelayHealthService: checkRelay failure flow
ok 6 - RelayHealthService: checkRelay failure flow
  ---
  duration_ms: 0.497958
  type: 'test'
  ...
# Subtest: RelayHealthService: checkRelay handles missing nostrClient
ok 7 - RelayHealthService: checkRelay handles missing nostrClient
  ---
  duration_ms: 0.332384
  type: 'test'
  ...
# Subtest: RelayHealthService: refresh checks all relays
ok 8 - RelayHealthService: refresh checks all relays
  ---
  duration_ms: 0.695152
  type: 'test'
  ...
# Subtest: RelayHealthService: emits telemetry if opted in
ok 9 - RelayHealthService: emits telemetry if opted in
  ---
  duration_ms: 1.016069
  type: 'test'
  ...
# Subtest: RelayHealthService: checkRelay times out after DEFAULT_TIMEOUT_MS
ok 10 - RelayHealthService: checkRelay times out after DEFAULT_TIMEOUT_MS
  ---
  duration_ms: 10.048085
  type: 'test'
  ...
# Subtest: RelayHealthService: failure threshold triggers user warning
ok 11 - RelayHealthService: failure threshold triggers user warning
  ---
  duration_ms: 0.888607
  type: 'test'
  ...
# Subtest: RelayHealthService: user warning respects cooldown
ok 12 - RelayHealthService: user warning respects cooldown
  ---
  duration_ms: 0.49601
  type: 'test'
  ...
# Subtest: RelayHealthService: relay disconnect/error events trigger failure
ok 13 - RelayHealthService: relay disconnect/error events trigger failure
  ---
  duration_ms: 0.337866
  type: 'test'
  ...
# Subtest: RelayHealthService: integrates with nostrClient.markRelayUnreachable
ok 14 - RelayHealthService: integrates with nostrClient.markRelayUnreachable
  ---
  duration_ms: 0.333207
  type: 'test'
  ...
1..14
# tests 14
# suites 0
# pass 14
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 5016.469349

→ Running tests/services/trustBootstrap.test.mjs
[bitvid] [bootstrap] Failed to hydrate admin lists for trusted seeds Error: accessControl ready check timed out
    at AccessControl.<anonymous> (file:///app/tests/services/trustBootstrap.test.mjs:147:13)
    at Object.apply (node:internal/test_runner/mock/mock:765:20)
    at waitForAccessControl (file:///app/js/services/trustBootstrap.js:80:39)
    at hydrate (file:///app/js/services/trustBootstrap.js:138:28)
    at bootstrapTrustedSeeds (file:///app/js/services/trustBootstrap.js:151:31)
    at TestContext.<anonymous> (file:///app/tests/services/trustBootstrap.test.mjs:150:11)
    at Test.runInAsyncScope (node:async_hooks:214:14)
    at Test.run (node:internal/test_runner/test:1047:25)
    at async Suite.processPendingSubtests (node:internal/test_runner/test:744:7)
[bitvid] [bootstrap] Failed to hydrate admin lists for trusted seeds Error: accessControl ready check timed out
    at AccessControl.<anonymous> (file:///app/tests/services/trustBootstrap.test.mjs:147:13)
    at Object.apply (node:internal/test_runner/mock/mock:765:20)
    at waitForAccessControl (file:///app/js/services/trustBootstrap.js:80:39)
    at hydrate (file:///app/js/services/trustBootstrap.js:138:28)
    at runAsyncRetry (file:///app/js/services/trustBootstrap.js:160:13)
[bitvid] [bootstrap] Failed to hydrate admin lists for trusted seeds Error: accessControl failed
    at AccessControl.<anonymous> (file:///app/tests/services/trustBootstrap.test.mjs:164:13)
    at Object.apply (node:internal/test_runner/mock/mock:765:20)
    at waitForAccessControl (file:///app/js/services/trustBootstrap.js:80:39)
    at hydrate (file:///app/js/services/trustBootstrap.js:138:28)
    at bootstrapTrustedSeeds (file:///app/js/services/trustBootstrap.js:151:31)
    at TestContext.<anonymous> (file:///app/tests/services/trustBootstrap.test.mjs:171:30)
    at Test.runInAsyncScope (node:async_hooks:214:14)
    at Test.run (node:internal/test_runner/test:1047:25)
    at async Suite.processPendingSubtests (node:internal/test_runner/test:744:7)
TAP version 13
# Subtest: trustBootstrap
    # Subtest: should return early if feature is disabled
    ok 1 - should return early if feature is disabled
      ---
      duration_ms: 2.490273
      type: 'test'
      ...
    # Subtest: should apply seeds when accessControl is ready
    ok 2 - should apply seeds when accessControl is ready
      ---
      duration_ms: 1.474724
      type: 'test'
      ...
    # Subtest: should subscribe to accessControl changes
    ok 3 - should subscribe to accessControl changes
      ---
      duration_ms: 1.076454
      type: 'test'
      ...
    # Subtest: should handle accessControl timeout and apply seeds anyway
    ok 4 - should handle accessControl timeout and apply seeds anyway
      ---
      duration_ms: 2.779063
      type: 'test'
      ...
    # Subtest: should recompute summaries after applying seeds
    ok 5 - should recompute summaries after applying seeds
      ---
      duration_ms: 0.534346
      type: 'test'
      ...
    # Subtest: should wait for relays if hydration fails initially
    ok 6 - should wait for relays if hydration fails initially
      ---
      duration_ms: 300.835822
      type: 'test'
      ...
    1..6
ok 1 - trustBootstrap
  ---
  duration_ms: 311.306473
  type: 'suite'
  ...
1..1
# tests 6
# suites 1
# pass 6
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 3767.382466

→ Running tests/sign-request-queue.test.mjs
TAP version 13
# Subtest: queueSignEvent executes successfully
ok 1 - queueSignEvent executes successfully
  ---
  duration_ms: 1.881206
  type: 'test'
  ...
# Subtest: queueSignEvent executes sequentially for same signer
ok 2 - queueSignEvent executes sequentially for same signer
  ---
  duration_ms: 101.461989
  type: 'test'
  ...
# Subtest: queueSignEvent executes concurrently for different signers
ok 3 - queueSignEvent executes concurrently for different signers
  ---
  duration_ms: 51.333849
  type: 'test'
  ...
# Subtest: queueSignEvent times out
ok 4 - queueSignEvent times out
  ---
  duration_ms: 51.980091
  type: 'test'
  ...
# Subtest: queueSignEvent normalizes errors
ok 5 - queueSignEvent normalizes errors
  ---
  duration_ms: 0.762469
  type: 'test'
  ...
# Subtest: queueSignEvent handles signer disconnect
ok 6 - queueSignEvent handles signer disconnect
  ---
  duration_ms: 0.663496
  type: 'test'
  ...
# Subtest: queueSignEvent handles missing signer
ok 7 - queueSignEvent handles missing signer
  ---
  duration_ms: 0.411497
  type: 'test'
  ...
1..7
# tests 7
# suites 0
# pass 7
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 363.601967

→ Running tests/state/cache.test.mjs
TAP version 13
# Subtest: js/state/cache.js
    # Subtest: Saved Profiles Persistence
    ok 1 - Saved Profiles Persistence
      ---
      duration_ms: 2.396226
      type: 'test'
      ...
    # Subtest: Active Profile Pubkey
    ok 2 - Active Profile Pubkey
      ---
      duration_ms: 0.579387
      type: 'test'
      ...
    # Subtest: URL Health Caching
    ok 3 - URL Health Caching
      ---
      duration_ms: 0.636598
      type: 'test'
      ...
    # Subtest: URL Health Expiration
    ok 4 - URL Health Expiration
      ---
      duration_ms: 11.280865
      type: 'test'
      ...
    # Subtest: Moderation Settings
    ok 5 - Moderation Settings
      ---
      duration_ms: 1.4103
      type: 'test'
      ...
    # Subtest: Legacy Moderation Overrides Support
        # Subtest: ignores legacy v1 overrides
        ok 1 - ignores legacy v1 overrides
          ---
          duration_ms: 0.483389
          type: 'test'
          ...
        # Subtest: loads v2 overrides
        ok 2 - loads v2 overrides
          ---
          duration_ms: 0.511395
          type: 'test'
          ...
        1..2
    ok 6 - Legacy Moderation Overrides Support
      ---
      duration_ms: 1.930102
      type: 'test'
      ...
    1..6
ok 1 - js/state/cache.js
  ---
  duration_ms: 21.415125
  type: 'test'
  ...
1..1
# tests 9
# suites 0
# pass 9
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 29.994156

→ Running tests/storage-service.test.mjs
TAP version 13
# Subtest: StorageService
    # Subtest: init() creates database and object store
    ok 1 - init() creates database and object store
      ---
      duration_ms: 11.515462
      type: 'test'
      ...
[bitvid] [StorageService] Unlocked storage for 00000000...
    # Subtest: unlock() generates and stores master key with NIP-44
    ok 2 - unlock() generates and stores master key with NIP-44
      ---
      duration_ms: 9.964094
      type: 'test'
      ...
[bitvid] [StorageService] Unlocked storage for 00000000...
[bitvid] [StorageService] Locked storage for 00000000...
[bitvid] [StorageService] Unlocked storage for 00000000...
    # Subtest: unlock() restores existing master key
    ok 3 - unlock() restores existing master key
      ---
      duration_ms: 4.639025
      type: 'test'
      ...
[bitvid] [StorageService] Unlocked storage for 00000000...
    # Subtest: unlock() falls back to NIP-04 if NIP-44 unavailable
    ok 4 - unlock() falls back to NIP-04 if NIP-44 unavailable
      ---
      duration_ms: 3.15478
      type: 'test'
      ...
[bitvid] [StorageService] Unlocked storage for 00000000...
[bitvid] [StorageService] Locked storage for 00000000...
    # Subtest: unlock() normalizes permission denied decrypt errors
    ok 5 - unlock() normalizes permission denied decrypt errors
      ---
      duration_ms: 4.078727
      type: 'test'
      ...
[bitvid] [StorageService] Unlocked storage for 00000000...
[bitvid] [StorageService] Locked storage for 00000000...
    # Subtest: unlock() normalizes missing decryptor errors
    ok 6 - unlock() normalizes missing decryptor errors
      ---
      duration_ms: 4.985059
      type: 'test'
      ...
[bitvid] [StorageService] Unlocked storage for 00000000...
[bitvid] [StorageService] Locked storage for 00000000...
    # Subtest: unlock() normalizes unknown decrypt errors
    ok 7 - unlock() normalizes unknown decrypt errors
      ---
      duration_ms: 2.563247
      type: 'test'
      ...
[bitvid] [StorageService] Unlocked storage for 00000000...
[bitvid] [StorageService] Saved connection conn_1
    # Subtest: saveConnection() encrypts and stores connection
    ok 8 - saveConnection() encrypts and stores connection
      ---
      duration_ms: 4.340388
      type: 'test'
      ...
[bitvid] [StorageService] Unlocked storage for 00000000...
[bitvid] [StorageService] Saved connection conn_1
    # Subtest: getConnection() decrypts and returns connection
    ok 9 - getConnection() decrypts and returns connection
      ---
      duration_ms: 4.236908
      type: 'test'
      ...
    # Subtest: getConnection() throws if locked
    ok 10 - getConnection() throws if locked
      ---
      duration_ms: 1.35787
      type: 'test'
      ...
[bitvid] [StorageService] Unlocked storage for 00000000...
[bitvid] [StorageService] Saved connection conn_1
[bitvid] [StorageService] Deleted connection conn_1
    # Subtest: deleteConnection() removes connection
    ok 11 - deleteConnection() removes connection
      ---
      duration_ms: 3.150325
      type: 'test'
      ...
[bitvid] [StorageService] Unlocked storage for 00000000...
[bitvid] [StorageService] Saved connection conn_1
[bitvid] [StorageService] Saved connection conn_2
    # Subtest: setDefaultConnection() updates metadata
    ok 12 - setDefaultConnection() updates metadata
      ---
      duration_ms: 3.808745
      type: 'test'
      ...
[bitvid] [StorageService] Unlocked storage for 00000000...
[bitvid] [StorageService] Saved connection conn_1
[bitvid] [StorageService] Saved connection conn_2
    # Subtest: saveConnection() with defaultForUploads=true clears other defaults
    ok 13 - saveConnection() with defaultForUploads=true clears other defaults
      ---
      duration_ms: 3.566813
      type: 'test'
      ...
    1..13
ok 1 - StorageService
  ---
  duration_ms: 64.212338
  type: 'suite'
  ...
1..1
# tests 13
# suites 1
# pass 13
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 72.820971

→ Running tests/torrent/style-helpers.test.mjs
TAP version 13
# Subtest: torrent/ui/styleHelpers
    # Subtest: returns null when no element is provided
    ok 1 - returns null when no element is provided
      ---
      duration_ms: 0.940898
      type: 'test'
      ...
    # Subtest: returns the original element without mutations
    ok 2 - returns the original element without mutations
      ---
      duration_ms: 76.998441
      type: 'test'
      ...
    # Subtest: provides an empty, frozen fallback map
    ok 3 - provides an empty, frozen fallback map
      ---
      duration_ms: 1.371952
      type: 'test'
      ...
    # Subtest: no-ops when removing styles
    ok 4 - no-ops when removing styles
      ---
      duration_ms: 10.133292
      type: 'test'
      ...
    1..4
ok 1 - torrent/ui/styleHelpers
  ---
  duration_ms: 91.147249
  type: 'suite'
  ...
1..1
# tests 4
# suites 1
# pass 4
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 104.59707

→ Running tests/ui/components/debug_hashtag_strip_helper.test.mjs
Global ResizeObserver type: function
Helper window ResizeObserver: undefined
TAP version 13
# Subtest: Debug HashtagStripHelper fallback
ok 1 - Debug HashtagStripHelper fallback
  ---
  duration_ms: 103.886988
  type: 'test'
  ...
1..1
# tests 1
# suites 0
# pass 1
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 114.385638

→ Running tests/ui/components/VideoModalSimilarHelpers.test.mjs
TAP version 13
# Subtest: derivePointerKeyFromInput
    # Subtest: derives key from string
    ok 1 - derives key from string
      ---
      duration_ms: 1.175664
      type: 'test'
      ...
    # Subtest: derives key from array
    ok 2 - derives key from array
      ---
      duration_ms: 0.230831
      type: 'test'
      ...
    # Subtest: derives key from object
    ok 3 - derives key from object
      ---
      duration_ms: 0.214485
      type: 'test'
      ...
    # Subtest: handles empty/invalid input
    ok 4 - handles empty/invalid input
      ---
      duration_ms: 0.212874
      type: 'test'
      ...
    1..4
ok 1 - derivePointerKeyFromInput
  ---
  duration_ms: 3.972707
  type: 'test'
  ...
# Subtest: formatViewCountLabel
    # Subtest: formats numbers
    ok 1 - formats numbers
      ---
      duration_ms: 41.721759
      type: 'test'
      ...
    1..1
ok 2 - formatViewCountLabel
  ---
  duration_ms: 42.0532
  type: 'test'
  ...
# Subtest: getViewCountLabel
    # Subtest: returns formatted count
    ok 1 - returns formatted count
      ---
      duration_ms: 0.610811
      type: 'test'
      ...
    # Subtest: handles partial
    ok 2 - handles partial
      ---
      duration_ms: 0.659836
      type: 'test'
      ...
    # Subtest: handles hydrating
    ok 3 - handles hydrating
      ---
      duration_ms: 0.341993
      type: 'test'
      ...
    1..3
ok 3 - getViewCountLabel
  ---
  duration_ms: 2.960498
  type: 'test'
  ...
# Subtest: buildSimilarCardIdentity
    # Subtest: uses overrides
    ok 1 - uses overrides
      ---
      duration_ms: 1.230005
      type: 'test'
      ...
    # Subtest: uses video author
    ok 2 - uses video author
      ---
      duration_ms: 0.496707
      type: 'test'
      ...
    # Subtest: derives npub from pubkey
    ok 3 - derives npub from pubkey
      ---
      duration_ms: 0.234671
      type: 'test'
      ...
    1..3
ok 4 - buildSimilarCardIdentity
  ---
  duration_ms: 2.53546
  type: 'test'
  ...
# Subtest: prepareSimilarVideoCard
    # Subtest: wires up onPlay
    ok 1 - wires up onPlay
      ---
      duration_ms: 0.348381
      type: 'test'
      ...
    1..1
ok 5 - prepareSimilarVideoCard
  ---
  duration_ms: 0.724345
  type: 'test'
  ...
1..5
# tests 17
# suites 0
# pass 17
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 73.521197

→ Running tests/ui/engagement-controller.test.mjs
TAP version 13
# Subtest: EngagementController
    # Subtest: handleRepostAction - should show error if no event ID is available
    ok 1 - handleRepostAction - should show error if no event ID is available
      ---
      duration_ms: 2.83818
      type: 'test'
      ...
    # Subtest: handleRepostAction - should call repostEvent with correct parameters
    ok 2 - handleRepostAction - should call repostEvent with correct parameters
      ---
      duration_ms: 0.801469
      type: 'test'
      ...
    # Subtest: handleRepostAction - should handle failure from repostEvent
    ok 3 - handleRepostAction - should handle failure from repostEvent
      ---
      duration_ms: 0.617609
      type: 'test'
      ...
    # Subtest: handleRepostAction - should use currentVideoPointer when in modal context
    ok 4 - handleRepostAction - should use currentVideoPointer when in modal context
      ---
      duration_ms: 0.659489
      type: 'test'
      ...
    # Subtest: handleMirrorAction - should show error if video has no URL
    ok 5 - handleMirrorAction - should show error if video has no URL
      ---
      duration_ms: 0.955105
      type: 'test'
      ...
    # Subtest: handleMirrorAction - should call mirrorVideoEvent when URL is provided
    ok 6 - handleMirrorAction - should call mirrorVideoEvent when URL is provided
      ---
      duration_ms: 0.605678
      type: 'test'
      ...
    # Subtest: handleMirrorAction - should prevent mirroring private videos
    ok 7 - handleMirrorAction - should prevent mirroring private videos
      ---
      duration_ms: 0.345144
      type: 'test'
      ...
    # Subtest: handleEnsurePresenceAction - should show error if no event ID
    ok 8 - handleEnsurePresenceAction - should show error if no event ID
      ---
      duration_ms: 0.637397
      type: 'test'
      ...
    # Subtest: handleEnsurePresenceAction - should handle throttled response
    ok 9 - handleEnsurePresenceAction - should handle throttled response
      ---
      duration_ms: 0.804655
      type: 'test'
      ...
    # Subtest: handleEnsurePresenceAction - should show success on successful rebroadcast
    ok 10 - handleEnsurePresenceAction - should show success on successful rebroadcast
      ---
      duration_ms: 0.584021
      type: 'test'
      ...
    1..10
ok 1 - EngagementController
  ---
  duration_ms: 12.71314
  type: 'test'
  ...
1..1
# tests 11
# suites 0
# pass 11
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 30.391049

→ Running tests/ui/profile-modal-moderation-settings.test.mjs
TAP version 13
# Subtest: moderation settings save updates service and disables control
ok 1 - moderation settings save updates service and disables control
  ---
  duration_ms: 147.620961
  type: 'test'
  ...
# Subtest: moderation reset restores defaults and clearing inputs uses defaults
ok 2 - moderation reset restores defaults and clearing inputs uses defaults
  ---
  duration_ms: 36.918342
  type: 'test'
  ...
# Subtest: guest fallback uses config moderation defaults
ok 3 - guest fallback uses config moderation defaults
  ---
  duration_ms: 20.98265
  type: 'test'
  ...
1..3
# tests 3
# suites 0
# pass 3
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 219.284121

→ Running tests/ui/similar-content-card.test.mjs
TAP version 13
# Subtest: cached thumbnails reuse existing src without lazy-loading
ok 1 - cached thumbnails reuse existing src without lazy-loading
  ---
  duration_ms: 239.782537
  type: 'test'
  ...
# Subtest: uncached thumbnails use fallback, cache on load, and retain blur state
ok 2 - uncached thumbnails use fallback, cache on load, and retain blur state
  ---
  duration_ms: 43.697704
  type: 'test'
  ...
# Subtest: primary clicks trigger onPlay while modifiers and right clicks do not
ok 3 - primary clicks trigger onPlay while modifiers and right clicks do not
  ---
  duration_ms: 20.24453
  type: 'test'
  ...
# Subtest: author identity fields render supplied values and datasets
ok 4 - author identity fields render supplied values and datasets
  ---
  duration_ms: 16.904346
  type: 'test'
  ...
# Subtest: view counter wiring exposes pointer datasets
ok 5 - view counter wiring exposes pointer datasets
  ---
  duration_ms: 15.674805
  type: 'test'
  ...
1..5
# tests 5
# suites 0
# pass 5
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 350.370667

→ Running tests/ui/tag-pill-list.test.mjs
TAP version 13
# Subtest: renderTagPillStrip builds buttons with labels and icons
ok 1 - renderTagPillStrip builds buttons with labels and icons
  ---
  duration_ms: 96.82217
  type: 'test'
  ...
# Subtest: renderTagPillStrip applies preference state styling
ok 2 - renderTagPillStrip applies preference state styling
  ---
  duration_ms: 12.92567
  type: 'test'
  ...
# Subtest: renderTagPillStrip wires the activation callback
ok 3 - renderTagPillStrip wires the activation callback
  ---
  duration_ms: 10.52196
  type: 'test'
  ...
1..3
# tests 3
# suites 0
# pass 3
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 133.170243

→ Running tests/ui/torrentStatusController.test.mjs
TAP version 13
# Subtest: TorrentStatusController throws if accessor is missing
ok 1 - TorrentStatusController throws if accessor is missing
  ---
  duration_ms: 1.487921
  type: 'test'
  ...
# Subtest: TorrentStatusController updates video modal and calls onRemovePoster
ok 2 - TorrentStatusController updates video modal and calls onRemovePoster
  ---
  duration_ms: 0.640655
  type: 'test'
  ...
# Subtest: TorrentStatusController handles missing modal gracefully
ok 3 - TorrentStatusController handles missing modal gracefully
  ---
  duration_ms: 0.346886
  type: 'test'
  ...
1..3
# tests 3
# suites 0
# pass 3
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 15.753871

→ Running tests/ui/url-health-controller.test.mjs
TAP version 13
# Subtest: UrlHealthController
    # Subtest: probeUrl returns ok for valid URL
    ok 1 - probeUrl returns ok for valid URL
      ---
      duration_ms: 100.787371
      type: 'test'
      ...
    # Subtest: probeUrl returns error for 404
    ok 2 - probeUrl returns error for 404
      ---
      duration_ms: 21.221713
      type: 'test'
      ...
    # Subtest: handleUrlHealthBadge updates badge
    ok 3 - handleUrlHealthBadge updates badge
      ---
      duration_ms: 75.855241
      type: 'test'
      ...
    # Subtest: getUrlHealthPlaceholderMarkup returns string
    ok 4 - getUrlHealthPlaceholderMarkup returns string
      ---
      duration_ms: 11.734257
      type: 'test'
      ...
    1..4
ok 1 - UrlHealthController
  ---
  duration_ms: 211.847
  type: 'suite'
  ...
1..1
# tests 4
# suites 1
# pass 4
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 220.023171

→ Running tests/unit/app_guard_logic.test.mjs
TAP version 13
# Subtest: Application.resetTorrentStats logic
    # Subtest: does not throw when videoModal is null
    ok 1 - does not throw when videoModal is null
      ---
      duration_ms: 0.948271
      type: 'test'
      ...
    # Subtest: does not throw when videoModal is undefined
    ok 2 - does not throw when videoModal is undefined
      ---
      duration_ms: 1.431554
      type: 'test'
      ...
    # Subtest: does not throw when videoModal lacks resetStats
    ok 3 - does not throw when videoModal lacks resetStats
      ---
      duration_ms: 0.253518
      type: 'test'
      ...
    # Subtest: calls resetStats when available
    ok 4 - calls resetStats when available
      ---
      duration_ms: 0.304177
      type: 'test'
      ...
    1..4
ok 1 - Application.resetTorrentStats logic
  ---
  duration_ms: 4.972786
  type: 'test'
  ...
1..1
# tests 5
# suites 0
# pass 5
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 18.915023

→ Running tests/unit/editModalController.test.mjs
TAP version 13
# Subtest: EditModalController
    # Subtest: open()
        # Subtest: should resolve target and open modal if authorized
        ok 1 - should resolve target and open modal if authorized
          ---
          duration_ms: 2.384748
          type: 'test'
          ...
        # Subtest: should show error if not logged in
        ok 2 - should show error if not logged in
          ---
          duration_ms: 0.876537
          type: 'test'
          ...
        # Subtest: should show error if user does not own video
        ok 3 - should show error if user does not own video
          ---
          duration_ms: 0.552771
          type: 'test'
          ...
        # Subtest: should handle modal load errors
        ok 4 - should handle modal load errors
          ---
          duration_ms: 0.980764
          type: 'test'
          ...
        1..4
    ok 1 - open()
      ---
      duration_ms: 6.014044
      type: 'suite'
      ...
    # Subtest: handleSubmit()
        # Subtest: should handle successful submission
        ok 1 - should handle successful submission
          ---
          duration_ms: 1.016892
          type: 'test'
          ...
        # Subtest: should show error if not logged in
        ok 2 - should show error if not logged in
          ---
          duration_ms: 0.488905
          type: 'test'
          ...
        # Subtest: should handle submission errors
        ok 3 - should handle submission errors
          ---
          duration_ms: 1.385083
          type: 'test'
          ...
        1..3
    ok 2 - handleSubmit()
      ---
      duration_ms: 3.607268
      type: 'suite'
      ...
    1..2
ok 1 - EditModalController
  ---
  duration_ms: 10.408835
  type: 'suite'
  ...
1..1
# tests 7
# suites 3
# pass 7
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 28.906156

→ Running tests/unit/hashChangeHandler.test.mjs
TAP version 13
# Subtest: createHashChangeHandler
    # Subtest: loads default view if hash is empty
    ok 1 - loads default view if hash is empty
      ---
      duration_ms: 1.188263
      type: 'test'
      ...
    # Subtest: redirects legacy view
    ok 2 - redirects legacy view
      ---
      duration_ms: 0.26584
      type: 'test'
      ...
    # Subtest: skips redundant reload
    ok 3 - skips redundant reload
      ---
      duration_ms: 0.284841
      type: 'test'
      ...
    1..3
ok 1 - createHashChangeHandler
  ---
  duration_ms: 3.618637
  type: 'test'
  ...
1..1
# tests 4
# suites 0
# pass 4
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 15.600244

→ Running tests/unit/security-config.test.mjs
TAP version 13
# Subtest: Security configuration: Development mode should be disabled in production
ok 1 - Security configuration: Development mode should be disabled in production
  ---
  duration_ms: 2.430889
  type: 'test'
  ...
# Subtest: Security configuration: Verbose diagnostics should be disabled in production
ok 2 - Security configuration: Verbose diagnostics should be disabled in production
  ---
  duration_ms: 0.198032
  type: 'test'
  ...
1..2
# tests 2
# suites 0
# pass 2
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 13.906388

→ Running tests/unit/ui/videoModalController.test.mjs
TAP version 13
# Subtest: VideoModalController bindEvents attaches listeners
ok 1 - VideoModalController bindEvents attaches listeners
  ---
  duration_ms: 1.543004
  type: 'test'
  ...
# Subtest: VideoModalController handleShareNostr triggers callback
ok 2 - VideoModalController handleShareNostr triggers callback
  ---
  duration_ms: 0.447022
  type: 'test'
  ...
# Subtest: VideoModalController handleCopyCdn triggers clipboard write
ok 3 - VideoModalController handleCopyCdn triggers clipboard write
  ---
  duration_ms: 6.194991
  type: 'test'
  ...
# Subtest: VideoModalController handleCopyMagnet triggers callback
ok 4 - VideoModalController handleCopyMagnet triggers callback
  ---
  duration_ms: 0.346044
  type: 'test'
  ...
# Subtest: VideoModalController handleSourceSwitch calls playVideoWithFallback
ok 5 - VideoModalController handleSourceSwitch calls playVideoWithFallback
  ---
  duration_ms: 2.184679
  type: 'test'
  ...
1..5
# tests 5
# suites 0
# pass 5
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 17.91256

→ Running tests/utils/hex.test.mjs
TAP version 13
# Subtest: hex utils
    # Subtest: normalizeHexString
        # Subtest: should return empty string for non-string inputs
        ok 1 - should return empty string for non-string inputs
          ---
          duration_ms: 0.949331
          type: 'test'
          ...
        # Subtest: should return empty string for empty or whitespace-only strings
        ok 2 - should return empty string for empty or whitespace-only strings
          ---
          duration_ms: 0.275501
          type: 'test'
          ...
        # Subtest: should trim and lowercase valid hex strings
        ok 3 - should trim and lowercase valid hex strings
          ---
          duration_ms: 0.178834
          type: 'test'
          ...
        1..3
    ok 1 - normalizeHexString
      ---
      duration_ms: 2.423874
      type: 'suite'
      ...
    # Subtest: aliases
        # Subtest: should export normalizeHexId as an alias
        ok 1 - should export normalizeHexId as an alias
          ---
          duration_ms: 0.228652
          type: 'test'
          ...
        # Subtest: should export normalizeHexPubkey as an alias
        ok 2 - should export normalizeHexPubkey as an alias
          ---
          duration_ms: 0.132261
          type: 'test'
          ...
        1..2
    ok 2 - aliases
      ---
      duration_ms: 0.62027
      type: 'suite'
      ...
    # Subtest: HEX64_REGEX
        # Subtest: should match valid 64-character hex strings
        ok 1 - should match valid 64-character hex strings
          ---
          duration_ms: 0.489978
          type: 'test'
          ...
        # Subtest: should not match strings with incorrect length
        ok 2 - should not match strings with incorrect length
          ---
          duration_ms: 0.471827
          type: 'test'
          ...
        # Subtest: should not match strings with non-hex characters
        ok 3 - should not match strings with non-hex characters
          ---
          duration_ms: 0.178185
          type: 'test'
          ...
        # Subtest: should not match empty strings
        ok 4 - should not match empty strings
          ---
          duration_ms: 0.234511
          type: 'test'
          ...
        1..4
    ok 3 - HEX64_REGEX
      ---
      duration_ms: 2.133813
      type: 'suite'
      ...
    # Subtest: normalizeHexHash
        # Subtest: should return empty string for non-string inputs
        ok 1 - should return empty string for non-string inputs
          ---
          duration_ms: 0.317789
          type: 'test'
          ...
        # Subtest: should return empty string for invalid hex
        ok 2 - should return empty string for invalid hex
          ---
          duration_ms: 0.127703
          type: 'test'
          ...
        # Subtest: should return normalized hex for valid inputs
        ok 3 - should return normalized hex for valid inputs
          ---
          duration_ms: 0.109855
          type: 'test'
          ...
        1..3
    ok 4 - normalizeHexHash
      ---
      duration_ms: 0.778391
      type: 'suite'
      ...
    1..4
ok 1 - hex utils
  ---
  duration_ms: 7.121221
  type: 'suite'
  ...
1..1
# tests 12
# suites 5
# pass 12
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 29.708245

→ Running tests/utils/profileMedia.test.mjs
TAP version 13
# Subtest: sanitizeProfileMediaUrl handles non-string inputs
ok 1 - sanitizeProfileMediaUrl handles non-string inputs
  ---
  duration_ms: 1.486125
  type: 'test'
  ...
# Subtest: sanitizeProfileMediaUrl handles empty or whitespace-only strings
ok 2 - sanitizeProfileMediaUrl handles empty or whitespace-only strings
  ---
  duration_ms: 0.259288
  type: 'test'
  ...
# Subtest: sanitizeProfileMediaUrl trims whitespace and removes quotes
ok 3 - sanitizeProfileMediaUrl trims whitespace and removes quotes
  ---
  duration_ms: 0.831109
  type: 'test'
  ...
# Subtest: sanitizeProfileMediaUrl allows data:image/ URLs
ok 4 - sanitizeProfileMediaUrl allows data:image/ URLs
  ---
  duration_ms: 0.173274
  type: 'test'
  ...
# Subtest: sanitizeProfileMediaUrl allows blob: URLs
ok 5 - sanitizeProfileMediaUrl allows blob: URLs
  ---
  duration_ms: 0.453106
  type: 'test'
  ...
# Subtest: sanitizeProfileMediaUrl rejects specific placeholder images
ok 6 - sanitizeProfileMediaUrl rejects specific placeholder images
  ---
  duration_ms: 0.176684
  type: 'test'
  ...
# Subtest: sanitizeProfileMediaUrl normalizes IPFS URLs
ok 7 - sanitizeProfileMediaUrl normalizes IPFS URLs
  ---
  duration_ms: 0.361848
  type: 'test'
  ...
# Subtest: sanitizeProfileMediaUrl handles protocol-relative URLs
ok 8 - sanitizeProfileMediaUrl handles protocol-relative URLs
  ---
  duration_ms: 0.233362
  type: 'test'
  ...
# Subtest: sanitizeProfileMediaUrl allows relative paths
ok 9 - sanitizeProfileMediaUrl allows relative paths
  ---
  duration_ms: 0.498777
  type: 'test'
  ...
# Subtest: sanitizeProfileMediaUrl adds protocol to domains and localhost
ok 10 - sanitizeProfileMediaUrl adds protocol to domains and localhost
  ---
  duration_ms: 1.011359
  type: 'test'
  ...
# Subtest: sanitizeProfileMediaUrl coerces http to https except for localhost
ok 11 - sanitizeProfileMediaUrl coerces http to https except for localhost
  ---
  duration_ms: 0.296965
  type: 'test'
  ...
# Subtest: sanitizeProfileMediaUrl rejects unsupported patterns
ok 12 - sanitizeProfileMediaUrl rejects unsupported patterns
  ---
  duration_ms: 0.176928
  type: 'test'
  ...
1..12
# tests 12
# suites 0
# pass 12
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 29.775616

→ Running tests/utils/videoPointer.test.mjs
TAP version 13
# Subtest: resolveVideoPointer returns address pointer with dTag
ok 1 - resolveVideoPointer returns address pointer with dTag
  ---
  duration_ms: 2.81294
  type: 'test'
  ...
# Subtest: resolveVideoPointer returns address pointer with videoRootId
ok 2 - resolveVideoPointer returns address pointer with videoRootId
  ---
  duration_ms: 0.371316
  type: 'test'
  ...
# Subtest: resolveVideoPointer returns event pointer with fallbackEventId
ok 3 - resolveVideoPointer returns event pointer with fallbackEventId
  ---
  duration_ms: 0.232669
  type: 'test'
  ...
# Subtest: resolveVideoPointer prioritizes dTag over videoRootId
ok 4 - resolveVideoPointer prioritizes dTag over videoRootId
  ---
  duration_ms: 0.185584
  type: 'test'
  ...
# Subtest: resolveVideoPointer prioritizes videoRootId over fallbackEventId
ok 5 - resolveVideoPointer prioritizes videoRootId over fallbackEventId
  ---
  duration_ms: 0.194959
  type: 'test'
  ...
# Subtest: resolveVideoPointer prioritizes dTag over fallbackEventId
ok 6 - resolveVideoPointer prioritizes dTag over fallbackEventId
  ---
  duration_ms: 0.261415
  type: 'test'
  ...
# Subtest: resolveVideoPointer includes relay in pointer
ok 7 - resolveVideoPointer includes relay in pointer
  ---
  duration_ms: 0.278699
  type: 'test'
  ...
# Subtest: resolveVideoPointer normalizes inputs
ok 8 - resolveVideoPointer normalizes inputs
  ---
  duration_ms: 0.181043
  type: 'test'
  ...
# Subtest: resolveVideoPointer uses default kind when kind is missing or invalid
ok 9 - resolveVideoPointer uses default kind when kind is missing or invalid
  ---
  duration_ms: 0.702891
  type: 'test'
  ...
# Subtest: resolveVideoPointer returns null for invalid inputs
ok 10 - resolveVideoPointer returns null for invalid inputs
  ---
  duration_ms: 0.80627
  type: 'test'
  ...
1..10
# tests 10
# suites 0
# pass 10
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 25.645203

→ Running tests/video-card-source-visibility.test.mjs
TAP version 13
# Subtest: updateVideoCardSourceVisibility hides non-owner cards without healthy sources and restores visibility
ok 1 - updateVideoCardSourceVisibility hides non-owner cards without healthy sources and restores visibility
  ---
  duration_ms: 92.256459
  type: 'test'
  ...
# Subtest: VideoCard hides cards without playable sources until a healthy CDN update arrives
ok 2 - VideoCard hides cards without playable sources until a healthy CDN update arrives
  ---
  duration_ms: 40.550504
  type: 'test'
  ...
# Subtest: VideoCard.closeMoreMenu only restores focus when the trigger was expanded
ok 3 - VideoCard.closeMoreMenu only restores focus when the trigger was expanded
  ---
  duration_ms: 20.016359
  type: 'test'
  ...
# Subtest: VideoCard.closeSettingsMenu only restores focus when the trigger was expanded
ok 4 - VideoCard.closeSettingsMenu only restores focus when the trigger was expanded
  ---
  duration_ms: 17.325929
  type: 'test'
  ...
1..4
# tests 4
# suites 0
# pass 4
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 184.021264

→ Running tests/video-modal-controller.test.mjs
TAP version 13
# Subtest: VideoModalController
    # Subtest: ensureVideoModalReady throws if modal is missing
    ok 1 - ensureVideoModalReady throws if modal is missing
      ---
      duration_ms: 1.681314
      type: 'test'
      ...
    # Subtest: ensureVideoModalReady loads modal if needs rehydrate
    ok 2 - ensureVideoModalReady loads modal if needs rehydrate
      ---
      duration_ms: 0.516535
      type: 'test'
      ...
    # Subtest: showModalWithPoster uses provided video
    ok 3 - showModalWithPoster uses provided video
      ---
      duration_ms: 0.817263
      type: 'test'
      ...
    # Subtest: showModalWithPoster falls back to current video
    ok 4 - showModalWithPoster falls back to current video
      ---
      duration_ms: 0.497957
      type: 'test'
      ...
    # Subtest: forceRemoveModalPoster calls modal method
    ok 5 - forceRemoveModalPoster calls modal method
      ---
      duration_ms: 0.278304
      type: 'test'
      ...
    1..5
ok 1 - VideoModalController
  ---
  duration_ms: 5.719221
  type: 'test'
  ...
1..1
# tests 6
# suites 0
# pass 6
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 19.203363

→ Running tests/video-modal-tags.test.mjs
TAP version 13
# Subtest: video modal rehydrates and plays through a connected element across views
ok 1 - video modal rehydrates and plays through a connected element across views
  ---
  duration_ms: 344.609439
  type: 'test'
  ...
# Subtest: torrent-only playback resets the modal video before the next hosted session
ok 2 - torrent-only playback resets the modal video before the next hosted session
  ---
  duration_ms: 24.708146
  type: 'test'
  ...
[VideoModal] Cleared loading poster (close).
[VideoModal] Cleared loading poster (close).
[VideoModal] Cleared loading poster (close).
[VideoModal] Cleared loading poster (close).
[VideoModal] Cleared loading poster (close).
# Subtest: backdrop data-dismiss closes the modal and restores focus
ok 3 - backdrop data-dismiss closes the modal and restores focus
  ---
  duration_ms: 323.341032
  type: 'test'
  ...
# Subtest: Escape key closes the modal and returns focus to the trigger
ok 4 - Escape key closes the modal and returns focus to the trigger
  ---
  duration_ms: 110.850796
  type: 'test'
  ...
# Subtest: video modal sticky navigation responds to scroll direction
ok 5 - video modal sticky navigation responds to scroll direction
  ---
  duration_ms: 117.972697
  type: 'test'
  ...
# Subtest: video modal video shell is not sticky at mobile breakpoints
ok 6 - video modal video shell is not sticky at mobile breakpoints
  ---
  duration_ms: 98.901188
  type: 'test'
  ...
# Subtest: video modal toggles document scroll locking on open/close
ok 7 - video modal toggles document scroll locking on open/close
  ---
  duration_ms: 87.029389
  type: 'test'
  ...
# Subtest: video modal comments region exposes aria landmarks and stays in the focus order
ok 8 - video modal comments region exposes aria landmarks and stays in the focus order
  ---
  duration_ms: 147.166832
  type: 'test'
  ...
# Subtest: video modal zap dialog updates aria state while toggling
ok 9 - video modal zap dialog updates aria state while toggling
  ---
  duration_ms: 248.293715
  type: 'test'
  ...
# Subtest: video modal inherits design system mode when loaded dynamically
ok 10 - video modal inherits design system mode when loaded dynamically
  ---
  duration_ms: 70.876445
  type: 'test'
  ...
# Subtest: VideoModal renders tag metadata and toggles visibility
ok 11 - VideoModal renders tag metadata and toggles visibility
  ---
  duration_ms: 79.99425
  type: 'test'
  ...
1..11
# tests 11
# suites 0
# pass 11
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 1669.862147

→ Running tests/video-settings-menu-controller.test.mjs
TAP version 13
# Subtest: VideoSettingsMenuController - requestMenu opens popover
ok 1 - VideoSettingsMenuController - requestMenu opens popover
  ---
  duration_ms: 1.535652
  type: 'test'
  ...
# Subtest: VideoSettingsMenuController - closeMenu closes popover
ok 2 - VideoSettingsMenuController - closeMenu closes popover
  ---
  duration_ms: 0.32641
  type: 'test'
  ...
# Subtest: VideoSettingsMenuController - requestMenu toggles if open
ok 3 - VideoSettingsMenuController - requestMenu toggles if open
  ---
  duration_ms: 0.404461
  type: 'test'
  ...
# Subtest: VideoSettingsMenuController - closeAll closes all popovers
ok 4 - VideoSettingsMenuController - closeAll closes all popovers
  ---
  duration_ms: 0.507031
  type: 'test'
  ...
1..4
# tests 4
# suites 0
# pass 4
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 15.514533

✔ All unit tests passed
```

**Result:** ✅ Passed

### Command: `npm run test:smoke`

```

> bitvid@1.0.0 test:smoke
> node scripts/agent/smoke-test.mjs

[2026-02-15T03:46:42.165Z] --- Smoke Test Started ---
[2026-02-15T03:46:42.166Z] Ephemeral Pubkey: d90a515374fb210fe1c82ac6b9415491e2b3e1bd3beb85cf97fdfa23e31cc183
Load Test Relay starting on port 8899
[2026-02-15T03:46:42.169Z] Starting HTTP Server...
[2026-02-15T03:46:43.257Z] HTTP Server is ready.
[2026-02-15T03:46:43.257Z] Initializing Node Client...
[2026-02-15T03:46:43.282Z] Node Client connected.
[2026-02-15T03:46:43.282Z] Node: Publishing Video Post...
[2026-02-15T03:46:43.296Z] Node: Published Video ID: 15c1fad90d9cf7f756a1fc255a8e1fb1d7be6d58ffc78206fd2e0c3904e79477
[2026-02-15T03:46:43.296Z] Node: Publishing Encrypted DM...
[2026-02-15T03:46:43.313Z] Node: Published DM ID: d97bac8d676e9b4b2e515082d3468a2879529bdef6a3f4f97beaf8484e45e6ae
[2026-02-15T03:46:43.313Z] Browser: Launching...
[2026-02-15T03:46:43.327Z] --- Smoke Test FAILED: browserType.launch: Executable doesn't exist at /home/jules/.cache/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-linux64/chrome-headless-shell
╔═════════════════════════════════════════════════════════════════════════╗
║ Looks like Playwright Test or Playwright was just installed or updated. ║
║ Please run the following command to download new browsers:              ║
║                                                                         ║
║     npx playwright install                                              ║
║                                                                         ║
║ <3 Playwright Team                                                      ║
╚═════════════════════════════════════════════════════════════════════════╝ ---
[2026-02-15T03:46:43.327Z] browserType.launch: Executable doesn't exist at /home/jules/.cache/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-linux64/chrome-headless-shell
╔═════════════════════════════════════════════════════════════════════════╗
║ Looks like Playwright Test or Playwright was just installed or updated. ║
║ Please run the following command to download new browsers:              ║
║                                                                         ║
║     npx playwright install                                              ║
║                                                                         ║
║ <3 Playwright Team                                                      ║
╚═════════════════════════════════════════════════════════════════════════╝
    at runSmokeTest (/app/scripts/agent/smoke-test.mjs:138:34)
[2026-02-15T03:46:43.327Z] Cleaning up...
```

**Result:** ❌ Failed (Exit Code: 1)

### Command: `npm run format`

```

> bitvid@1.0.0 format
> prettier --cache --write css/tailwind.source.css css/tokens.css css/docs.css "docs/**/*.html" tailwind.config.cjs README.md CONTRIBUTING.md

css/tailwind.source.css 1249ms (unchanged)
css/tokens.css 123ms (unchanged)
css/docs.css 14ms (unchanged)
docs/kitchen-sink.html 192ms (unchanged)
docs/moderation/fixtures/index.html 153ms (unchanged)
docs/popover-scenarios.html 39ms (unchanged)
tailwind.config.cjs 40ms (unchanged)
README.md 232ms (unchanged)
CONTRIBUTING.md 54ms (unchanged)
```

**Result:** ✅ Passed

### Command: `npm run lint`

```

> bitvid@1.0.0 lint
> npm run lint:css && npm run lint:hex && npm run lint:inline-styles && npm run lint:tokens && npm run lint:tailwind-brackets && npm run lint:tailwind-colors && npm run lint:file-size && npm run lint:innerhtml && npm run lint:assets && npm run lint:sw-compat


> bitvid@1.0.0 lint:css
> stylelint css/tailwind.source.css css/tokens.css css/docs.css


> bitvid@1.0.0 lint:hex
> node scripts/check-hex.js


> bitvid@1.0.0 lint:inline-styles
> node scripts/check-inline-styles.mjs

No inline style usage found.

> bitvid@1.0.0 lint:tokens
> node scripts/check-design-tokens.mjs --check=tokens


> bitvid@1.0.0 lint:tailwind-brackets
> node scripts/check-design-tokens.mjs --check=brackets


> bitvid@1.0.0 lint:tailwind-colors
> node scripts/check-tailwind-colors.mjs


> bitvid@1.0.0 lint:file-size
> node scripts/check-file-size.mjs


> bitvid@1.0.0 lint:innerhtml
> node scripts/check-innerhtml.mjs


> bitvid@1.0.0 lint:assets
> node scripts/check-asset-references.mjs

Asset reference lint passed: all local CSS/JS references are hashed or allowlisted, and no ?v= query cache-busting remains.

> bitvid@1.0.0 lint:sw-compat
> node scripts/check-sw-compat.mjs

[sw-compat] Skipping check: unable to determine HEAD^ or git history unavailable.
[sw-compat] No commit delta found; skipping compatibility check.
```

**Result:** ✅ Passed
