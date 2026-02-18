
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

[lint:assets] Missing dist/asset-manifest.json. Skipping asset reference check (build required).

> bitvid@1.0.0 lint:sw-compat
> node scripts/check-sw-compat.mjs

[sw-compat] Skipping check: unable to determine HEAD^ or git history unavailable.
[sw-compat] No commit delta found; skipping compatibility check.

> bitvid@1.0.0 test:unit
> node scripts/run-unit-tests.mjs


→ Running tests/app-batch-fetch-profiles.test.mjs
TAP version 13
# Subtest: batchFetchProfiles handles fast and failing relays
ok 1 - batchFetchProfiles handles fast and failing relays
  ---
  duration_ms: 5.599762
  type: 'test'
  ...
# Subtest: batchFetchProfiles respects forceRefresh
ok 2 - batchFetchProfiles respects forceRefresh
  ---
  duration_ms: 1.709709
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
# duration_ms 25.107703

→ Running tests/app-state.test.mjs
TAP version 13
# Subtest: AppState
    # Subtest: Initial state is clean
    ok 1 - Initial state is clean
      ---
      duration_ms: 2.542587
      type: 'test'
      ...
    # Subtest: setPubkey() updates state and notifies subscribers
    ok 2 - setPubkey() updates state and notifies subscribers
      ---
      duration_ms: 1.005319
      type: 'test'
      ...
    # Subtest: setCurrentUserNpub() updates state
    ok 3 - setCurrentUserNpub() updates state
      ---
      duration_ms: 0.473161
      type: 'test'
      ...
    # Subtest: setCurrentVideo() updates state
    ok 4 - setCurrentVideo() updates state
      ---
      duration_ms: 0.567929
      type: 'test'
      ...
    # Subtest: setVideosMap() updates state
    ok 5 - setVideosMap() updates state
      ---
      duration_ms: 0.58441
      type: 'test'
      ...
    # Subtest: setVideoSubscription() updates state
    ok 6 - setVideoSubscription() updates state
      ---
      duration_ms: 0.406273
      type: 'test'
      ...
    # Subtest: setModalState() updates state and notifies modal subscribers
    ok 7 - setModalState() updates state and notifies modal subscribers
      ---
      duration_ms: 0.871853
      type: 'test'
      ...
    # Subtest: Global subscriber receives updates
    ok 8 - Global subscriber receives updates
      ---
      duration_ms: 0.613104
      type: 'test'
      ...
    # Subtest: resetAppState() clears all state and notifies
    ok 9 - resetAppState() clears all state and notifies
      ---
      duration_ms: 0.653591
      type: 'test'
      ...
    1..9
ok 1 - AppState
  ---
  duration_ms: 9.957826
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
# duration_ms 29.918032

→ Running tests/app/channel-profile-moderation.test.mjs
TAP version 13
# Subtest: renderChannelVideosFromList decorates videos before storing
ok 1 - renderChannelVideosFromList decorates videos before storing
  ---
  duration_ms: 175.953465
  type: 'test'
  ...
# Subtest: renderChannelVideosFromList applies moderation blur without existing metadata
ok 2 - renderChannelVideosFromList applies moderation blur without existing metadata
  ---
  duration_ms: 45.259718
  type: 'test'
  ...
# Subtest: applyChannelVisualBlur blurs banner and avatar when viewer mutes author
ok 3 - applyChannelVisualBlur blurs banner and avatar when viewer mutes author
  ---
  duration_ms: 15.122562
  type: 'test'
  ...
# Subtest: moderation override clears channel blur via event wiring
ok 4 - moderation override clears channel blur via event wiring
  ---
  duration_ms: 36.552364
  type: 'test'
  ...
# Subtest: channel header moderation badge reflects blur state and override actions
ok 5 - channel header moderation badge reflects blur state and override actions
  ---
  duration_ms: 34.582574
  type: 'test'
  ...
# Subtest: channel video cards update moderation state in place when summary changes
ok 6 - channel video cards update moderation state in place when summary changes
  ---
  duration_ms: 38.166172
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
# duration_ms 364.888742

→ Running tests/app/feedCoordinator.test.mjs
TAP version 13
# Subtest: createFeedCoordinator - loadForYouVideos
    # Subtest: loadForYouVideos executes successfully
    ok 1 - loadForYouVideos executes successfully
      ---
      duration_ms: 2.573244
      type: 'test'
      ...
    1..1
ok 1 - createFeedCoordinator - loadForYouVideos
  ---
  duration_ms: 4.801423
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
# duration_ms 18.066297

→ Running tests/app/hash-change-handler.test.mjs
TAP version 13
# Subtest: handleHashChange defaults to for-you when logged in
ok 1 - handleHashChange defaults to for-you when logged in
  ---
  duration_ms: 114.213706
  type: 'test'
  ...
# Subtest: handleHashChange defaults to most-recent-videos when logged out
ok 2 - handleHashChange defaults to most-recent-videos when logged out
  ---
  duration_ms: 20.261281
  type: 'test'
  ...
# Subtest: handleHashChange respects explicit view regardless of login state
ok 3 - handleHashChange respects explicit view regardless of login state
  ---
  duration_ms: 22.756792
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
# duration_ms 177.765195

→ Running tests/app/hydrate-sidebar-navigation.test.mjs
TAP version 13
# Subtest: hydrateSidebarNavigation reveals chrome controls for authenticated viewers
ok 1 - hydrateSidebarNavigation reveals chrome controls for authenticated viewers
  ---
  duration_ms: 115.904193
  type: 'test'
  ...
# Subtest: hydrateSidebarNavigation hides chrome controls for logged-out viewers
ok 2 - hydrateSidebarNavigation hides chrome controls for logged-out viewers
  ---
  duration_ms: 15.151587
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
# duration_ms 155.485183

→ Running tests/app/is-user-logged-in.test.mjs
TAP version 13
# Subtest: isUserLoggedIn returns false when no user pubkey is set
ok 1 - isUserLoggedIn returns false when no user pubkey is set
  ---
  duration_ms: 1.331739
  type: 'test'
  ...
# Subtest: isUserLoggedIn treats extension logins as authenticated
ok 2 - isUserLoggedIn treats extension logins as authenticated
  ---
  duration_ms: 0.342597
  type: 'test'
  ...
# Subtest: isUserLoggedIn guards against mismatched nostrClient state
ok 3 - isUserLoggedIn guards against mismatched nostrClient state
  ---
  duration_ms: 0.298143
  type: 'test'
  ...
# Subtest: isUserLoggedIn ignores anonymous session actor mismatches
ok 4 - isUserLoggedIn ignores anonymous session actor mismatches
  ---
  duration_ms: 0.257641
  type: 'test'
  ...
# Subtest: isUserLoggedIn rejects mismatched managed session actors
ok 5 - isUserLoggedIn rejects mismatched managed session actors
  ---
  duration_ms: 0.362806
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
# duration_ms 36.767785

→ Running tests/app/moderation-overrides.test.mjs
TAP version 13
# Subtest: handleModerationOverride decorates stored and current videos then refreshes UI
ok 1 - handleModerationOverride decorates stored and current videos then refreshes UI
  ---
  duration_ms: 6.015429
  type: 'test'
  ...
# Subtest: handleModerationOverride resumes deferred playback
ok 2 - handleModerationOverride resumes deferred playback
  ---
  duration_ms: 1.296011
  type: 'test'
  ...
# Subtest: handleModerationBlock requests a block, clears overrides, and refreshes hidden state
ok 3 - handleModerationBlock requests a block, clears overrides, and refreshes hidden state
  ---
  duration_ms: 3.638156
  type: 'test'
  ...
# Subtest: handleModerationBlock returns false when viewer is logged out
ok 4 - handleModerationBlock returns false when viewer is logged out
  ---
  duration_ms: 1.208986
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
# duration_ms 27.650975

→ Running tests/app/moderation-settings-refresh.test.mjs
TAP version 13
# Subtest: handleModerationSettingsChange refreshes feeds with updated thresholds
ok 1 - handleModerationSettingsChange refreshes feeds with updated thresholds
  ---
  duration_ms: 4.809263
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
# duration_ms 17.68268

→ Running tests/app/similar-content.test.mjs
TAP version 13
# Subtest: orders similar videos by shared tags then timestamp
ok 1 - orders similar videos by shared tags then timestamp
  ---
  duration_ms: 3.48486
  type: 'test'
  ...
# Subtest: returns no matches when the active video lacks tags
ok 2 - returns no matches when the active video lacks tags
  ---
  duration_ms: 0.61747
  type: 'test'
  ...
# Subtest: skips candidates without tag metadata
ok 3 - skips candidates without tag metadata
  ---
  duration_ms: 0.348437
  type: 'test'
  ...
# Subtest: filters NSFW and private videos when NSFW content is disabled
ok 4 - filters NSFW and private videos when NSFW content is disabled
  ---
  duration_ms: 0.578823
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
# duration_ms 18.885722

→ Running tests/auth-service.test.mjs
TAP version 13
# Subtest: AuthService
    # Subtest: applyPostLoginState success flow
    ok 1 - applyPostLoginState success flow
      ---
      duration_ms: 14.514342
      type: 'test'
      ...
    # Subtest: applyPostLoginState with deferBlocks: true
    ok 2 - applyPostLoginState with deferBlocks: true
      ---
      duration_ms: 12.070445
      type: 'test'
      ...
    # Subtest: applyPostLoginState partial failure
    ok 3 - applyPostLoginState partial failure
      ---
      duration_ms: 1.686286
      type: 'test'
      ...
    # Subtest: applyPostLoginState without pubkey
    ok 4 - applyPostLoginState without pubkey
      ---
      duration_ms: 0.602141
      type: 'test'
      ...
    # Subtest: login mocks postLogin flow
    ok 5 - login mocks postLogin flow
      ---
      duration_ms: 3.449489
      type: 'test'
      ...
    # Subtest: login fails on lockdown
    ok 6 - login fails on lockdown
      ---
      duration_ms: 1.092605
      type: 'test'
      ...
    # Subtest: login succeeds for admin on lockdown
    ok 7 - login succeeds for admin on lockdown
      ---
      duration_ms: 1.637314
      type: 'test'
      ...
    # Subtest: loadOwnProfile
        # Subtest: Fast Relay Success
        ok 1 - Fast Relay Success
          ---
          duration_ms: 1.328019
          type: 'test'
          ...
        # Subtest: All Relays Fail
        ok 2 - All Relays Fail
          ---
          duration_ms: 1.349507
          type: 'test'
          ...
        # Subtest: Timeout Fallback
        ok 3 - Timeout Fallback
          ---
          duration_ms: 2502.116278
          type: 'test'
          ...
        1..3
    ok 8 - loadOwnProfile
      ---
      duration_ms: 2505.612018
      type: 'suite'
      ...
    1..8
ok 1 - AuthService
  ---
  duration_ms: 2542.808758
  type: 'suite'
  ...
1..1
# tests 10
# suites 2
# pass 10
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 2552.328847

→ Running tests/auth/signingAdapter.test.mjs
TAP version 13
# Subtest: createNip07SigningAdapter
    # Subtest: uses explicit extension if provided
    ok 1 - uses explicit extension if provided
      ---
      duration_ms: 2.632348
      type: 'test'
      ...
    # Subtest: falls back to window.nostr if no extension provided
    ok 2 - falls back to window.nostr if no extension provided
      ---
      duration_ms: 0.623353
      type: 'test'
      ...
    # Subtest: throws error if no extension available
    ok 3 - throws error if no extension available
      ---
      duration_ms: 1.542387
      type: 'test'
      ...
    # Subtest: prioritizes explicit extension over window.nostr
    ok 4 - prioritizes explicit extension over window.nostr
      ---
      duration_ms: 0.882692
      type: 'test'
      ...
    1..4
ok 1 - createNip07SigningAdapter
  ---
  duration_ms: 7.388991
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
# duration_ms 25.220344

→ Running tests/authService.test.mjs
TAP version 13
# Subtest: AuthService Coverage
    # Subtest: login
        # Subtest: successfully logs in with valid pubkey
        ok 1 - successfully logs in with valid pubkey
          ---
          duration_ms: 8.020255
          type: 'test'
          ...
        # Subtest: updates global state and calls post-login hooks
        ok 2 - updates global state and calls post-login hooks
          ---
          duration_ms: 2.108253
          type: 'test'
          ...
        # Subtest: throws if lockdown is active and user is not admin
        ok 3 - throws if lockdown is active and user is not admin
          ---
          duration_ms: 1.95587
          type: 'test'
          ...
        # Subtest: allows login if lockdown is active but user is admin
        ok 4 - allows login if lockdown is active but user is admin
          ---
          duration_ms: 1.503181
          type: 'test'
          ...
        1..4
    ok 1 - login
      ---
      duration_ms: 15.11783
      type: 'suite'
      ...
    # Subtest: logout
        # Subtest: clears state and calls reset on dependencies
        ok 1 - clears state and calls reset on dependencies
          ---
          duration_ms: 3.354272
          type: 'test'
          ...
        1..1
    ok 2 - logout
      ---
      duration_ms: 4.025014
      type: 'suite'
      ...
    # Subtest: requestLogin
        # Subtest: uses provider to login
        ok 1 - uses provider to login
          ---
          duration_ms: 2.165276
          type: 'test'
          ...
        # Subtest: does not call login if autoApply is false
        ok 2 - does not call login if autoApply is false
          ---
          duration_ms: 1.098755
          type: 'test'
          ...
        1..2
    ok 3 - requestLogin
      ---
      duration_ms: 3.590097
      type: 'suite'
      ...
    # Subtest: switchProfile
        # Subtest: switches to an existing profile
        ok 1 - switches to an existing profile
          ---
          duration_ms: 4.15233
          type: 'test'
          ...
        # Subtest: reorders saved profiles on switch
        ok 2 - reorders saved profiles on switch
          ---
          duration_ms: 2.591215
          type: 'test'
          ...
        1..2
    ok 4 - switchProfile
      ---
      duration_ms: 7.122621
      type: 'suite'
      ...
    1..4
ok 1 - AuthService Coverage
  ---
  duration_ms: 31.312149
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
# duration_ms 57.090046

→ Running tests/comment-event-builder.test.mjs
TAP version 13
# Subtest: buildCommentEvent emits NIP-22 root metadata while keeping legacy fallbacks
ok 1 - buildCommentEvent emits NIP-22 root metadata while keeping legacy fallbacks
  ---
  duration_ms: 4.848172
  type: 'test'
  ...
# Subtest: buildCommentEvent includes parent pointers, kinds, and authors for replies
ok 2 - buildCommentEvent includes parent pointers, kinds, and authors for replies
  ---
  duration_ms: 0.623372
  type: 'test'
  ...
# Subtest: buildCommentEvent normalizes relays and preserves explicit overrides
ok 3 - buildCommentEvent normalizes relays and preserves explicit overrides
  ---
  duration_ms: 0.874901
  type: 'test'
  ...
# Subtest: buildCommentEvent falls back to event pointers when no address is supplied
ok 4 - buildCommentEvent falls back to event pointers when no address is supplied
  ---
  duration_ms: 0.286762
  type: 'test'
  ...
# Subtest: buildCommentEvent accepts partial metadata for parent overrides
ok 5 - buildCommentEvent accepts partial metadata for parent overrides
  ---
  duration_ms: 0.470847
  type: 'test'
  ...
# Subtest: buildCommentEvent sanitizes additional tags before signing
ok 6 - buildCommentEvent sanitizes additional tags before signing
  ---
  duration_ms: 0.890492
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
# duration_ms 23.087853

→ Running tests/comment-thread-service.test.mjs
TAP version 13
# Subtest: CommentThreadService caches mixed-case video ids consistently
ok 1 - CommentThreadService caches mixed-case video ids consistently
  ---
  duration_ms: 3.558545
  type: 'test'
  ...
# Subtest: CommentThreadService surfaces cache read failures
ok 2 - CommentThreadService surfaces cache read failures
  ---
  duration_ms: 0.799739
  type: 'test'
  ...
# Subtest: CommentThreadService surfaces cache write failures
ok 3 - CommentThreadService surfaces cache write failures
  ---
  duration_ms: 0.486774
  type: 'test'
  ...
# Subtest: CommentThreadService persists caches safely during teardown failures
ok 4 - CommentThreadService persists caches safely during teardown failures
  ---
  duration_ms: 2.119812
  type: 'test'
  ...
# Subtest: CommentThreadService logs cache usage and fallback decisions
ok 5 - CommentThreadService logs cache usage and fallback decisions
  ---
  duration_ms: 1.375215
  type: 'test'
  ...
# Subtest: CommentThreadService normalizes mixed-case event ids in thread state
ok 6 - CommentThreadService normalizes mixed-case event ids in thread state
  ---
  duration_ms: 2.30251
  type: 'test'
  ...
# Subtest: CommentThreadService normalizes mixed-case pubkeys during hydration
ok 7 - CommentThreadService normalizes mixed-case pubkeys during hydration
  ---
  duration_ms: 1.034793
  type: 'test'
  ...
# Subtest: CommentThreadService deduplicates mixed-case event ids and pubkeys
ok 8 - CommentThreadService deduplicates mixed-case event ids and pubkeys
  ---
  duration_ms: 0.963562
  type: 'test'
  ...
# Subtest: CommentThreadService retries profile hydration before succeeding
ok 9 - CommentThreadService retries profile hydration before succeeding
  ---
  duration_ms: 77.386464
  type: 'test'
  ...
# Subtest: CommentThreadService surfaces profile hydration failures after retries
ok 10 - CommentThreadService surfaces profile hydration failures after retries
  ---
  duration_ms: 201.372302
  type: 'test'
  ...
# Subtest: listVideoComments accepts builder events without parent ids and filters replies
ok 11 - listVideoComments accepts builder events without parent ids and filters replies
  ---
  duration_ms: 6.38033
  type: 'test'
  ...
# Subtest: CommentThreadService hydrates, subscribes, and dedupes incoming comment events
ok 12 - CommentThreadService hydrates, subscribes, and dedupes incoming comment events
  ---
  duration_ms: 34.130292
  type: 'test'
  ...
# Subtest: CommentThreadService loadThread falls back to event id when address is missing
ok 13 - CommentThreadService loadThread falls back to event id when address is missing
  ---
  duration_ms: 1.124067
  type: 'test'
  ...
# Subtest: CommentThreadService requests and snapshots comments by root identifier
ok 14 - CommentThreadService requests and snapshots comments by root identifier
  ---
  duration_ms: 0.807075
  type: 'test'
  ...
# Subtest: CommentThreadService falls back to pointerIdentifiers root id
ok 15 - CommentThreadService falls back to pointerIdentifiers root id
  ---
  duration_ms: 0.732062
  type: 'test'
  ...
# Subtest: CommentThreadService preserves raw video author pubkeys during hydration fetches
ok 16 - CommentThreadService preserves raw video author pubkeys during hydration fetches
  ---
  duration_ms: 3.726236
  type: 'test'
  ...
# Subtest: CommentThreadService teardown cancels hydration timers
ok 17 - CommentThreadService teardown cancels hydration timers
  ---
  duration_ms: 81.476646
  type: 'test'
  ...
1..17
# tests 17
# suites 0
# pass 17
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 430.014779

→ Running tests/compliance/nip04_44_compliance.test.mjs
TAP version 13
# Subtest: NIP-04/44 Compliance: Encryption Preference
    # Subtest: createNip46Cipher prefers nip44.v2 when available
    ok 1 - createNip46Cipher prefers nip44.v2 when available
      ---
      duration_ms: 21.985793
      type: 'test'
      ...
    # Subtest: createNip46Cipher falls back to nip04 if nip44 is missing
    ok 2 - createNip46Cipher falls back to nip04 if nip44 is missing
      ---
      duration_ms: 9.716431
      type: 'test'
      ...
    1..2
ok 1 - NIP-04/44 Compliance: Encryption Preference
  ---
  duration_ms: 108.760942
  type: 'test'
  ...
# Subtest: NIP-04/44 Compliance: Decryption Fallback
    # Subtest: decryptNip46PayloadWithKeys handles nip44 (v2) payload
    ok 1 - decryptNip46PayloadWithKeys handles nip44 (v2) payload
      ---
      duration_ms: 25.027841
      type: 'test'
      ...
    # Subtest: decryptNip46PayloadWithKeys handles nip04 payload
    ok 2 - decryptNip46PayloadWithKeys handles nip04 payload
      ---
      duration_ms: 29.030066
      type: 'test'
      ...
    1..2
ok 2 - NIP-04/44 Compliance: Decryption Fallback
  ---
  duration_ms: 56.275828
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
# duration_ms 178.614375

→ Running tests/compliance/nip07_compliance.test.mjs
TAP version 13
# Subtest: NIP-07 Compliance: Retry Logic
    # Subtest: runNip07WithRetry succeeds on first try
    ok 1 - runNip07WithRetry succeeds on first try
      ---
      duration_ms: 2.014889
      type: 'test'
      ...
    # Subtest: runNip07WithRetry retries on timeout error
    ok 2 - runNip07WithRetry retries on timeout error
      ---
      duration_ms: 21.306378
      type: 'test'
      ...
    # Subtest: runNip07WithRetry fails after max retries or if error is not timeout
    ok 3 - runNip07WithRetry fails after max retries or if error is not timeout
      ---
      duration_ms: 1.387836
      type: 'test'
      ...
    1..3
ok 1 - NIP-07 Compliance: Retry Logic
  ---
  duration_ms: 26.494513
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
# duration_ms 59.210423

→ Running tests/compliance/nip65_compliance.test.mjs
TAP version 13
# Subtest: NIP-65 Compliance: Relay List Loading
    # Subtest: loadRelayList requests Kind 10002
    ok 1 - loadRelayList requests Kind 10002
      ---
      duration_ms: 6.363397
      type: 'test'
      ...
    # Subtest: loadRelayList parses r tags correctly
    ok 2 - loadRelayList parses r tags correctly
      ---
      duration_ms: 0.614151
      type: 'test'
      ...
    1..2
ok 1 - NIP-65 Compliance: Relay List Loading
  ---
  duration_ms: 145.044266
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
# duration_ms 158.728634

→ Running tests/compliance/video_note_compliance.test.mjs
TAP version 13
# Subtest: Video Note Compliance (Kind 30078 & NIP-71)
    # Subtest: prepareVideoPublishPayload creates Kind 30078 event
    ok 1 - prepareVideoPublishPayload creates Kind 30078 event
      ---
      duration_ms: 2.88566
      type: 'test'
      ...
    # Subtest: prepareVideoPublishPayload includes NIP-71 tags when provided
    ok 2 - prepareVideoPublishPayload includes NIP-71 tags when provided
      ---
      duration_ms: 0.997305
      type: 'test'
      ...
    1..2
ok 1 - Video Note Compliance (Kind 30078 & NIP-71)
  ---
  duration_ms: 38.092292
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
# duration_ms 50.315729

→ Running tests/design-system-metrics.test.mjs
TAP version 13
# Subtest: metric probe falls back to numeric parsing when measurement fails
ok 1 - metric probe falls back to numeric parsing when measurement fails
  ---
  duration_ms: 294.449179
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
# duration_ms 306.255919

→ Running tests/designSystem/dynamicStyles.test.mjs
TAP version 13
# Subtest: js/designSystem/dynamicStyles.js
    # Subtest: registerScope
        # Subtest: should register a scope and return a string ID
        ok 1 - should register a scope and return a string ID
          ---
          duration_ms: 104.488793
          type: 'test'
          ...
        # Subtest: should create a style element or use adoptedStyleSheets
        ok 2 - should create a style element or use adoptedStyleSheets
          ---
          duration_ms: 17.804438
          type: 'test'
          ...
        # Subtest: should insert rules with the correct selector
        ok 3 - should insert rules with the correct selector
          ---
          duration_ms: 14.432385
          type: 'test'
          ...
        # Subtest: should handle "&" in selectors
        ok 4 - should handle "&" in selectors
          ---
          duration_ms: 11.724795
          type: 'test'
          ...
        1..4
    ok 1 - registerScope
      ---
      duration_ms: 149.827053
      type: 'suite'
      ...
    # Subtest: setVariables
        # Subtest: should update CSS variables on the scope
        ok 1 - should update CSS variables on the scope
          ---
          duration_ms: 12.924573
          type: 'test'
          ...
        # Subtest: should handle removing variables
        ok 2 - should handle removing variables
          ---
          duration_ms: 19.482751
          type: 'test'
          ...
        1..2
    ok 2 - setVariables
      ---
      duration_ms: 32.854182
      type: 'suite'
      ...
    # Subtest: releaseScope
        # Subtest: should remove rules and clean up
        ok 1 - should remove rules and clean up
          ---
          duration_ms: 13.296582
          type: 'test'
          ...
        # Subtest: should return false for non-existent scope
        ok 2 - should return false for non-existent scope
          ---
          duration_ms: 9.431358
          type: 'test'
          ...
        1..2
    ok 3 - releaseScope
      ---
      duration_ms: 23.379884
      type: 'suite'
      ...
    # Subtest: Isolation
        # Subtest: should manage scopes independently for different documents
        ok 1 - should manage scopes independently for different documents
          ---
          duration_ms: 34.85588
          type: 'test'
          ...
        1..1
    ok 4 - Isolation
      ---
      duration_ms: 35.043857
      type: 'suite'
      ...
    # Subtest: Edge cases
        # Subtest: should handle invalid selectors gracefully
        ok 1 - should handle invalid selectors gracefully
          ---
          duration_ms: 11.928165
          type: 'test'
          ...
        # Subtest: should handle missing document gracefully
        ok 2 - should handle missing document gracefully
          ---
          duration_ms: 9.633989
          type: 'test'
          ...
        # Subtest: should fallback to <style> element if CSSStyleSheet is missing
        ok 3 - should fallback to <style> element if CSSStyleSheet is missing
          ---
          duration_ms: 18.150498
          type: 'test'
          ...
        1..3
    ok 5 - Edge cases
      ---
      duration_ms: 40.311858
      type: 'suite'
      ...
    1..5
ok 1 - js/designSystem/dynamicStyles.js
  ---
  duration_ms: 282.789679
  type: 'suite'
  ...
1..1
# tests 12
# suites 6
# pass 12
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 314.361784

→ Running tests/dm-block-filter.test.mjs
TAP version 13
# Subtest: DM block/mute filtering
    # Subtest: setDmBlockChecker
        # Subtest: should accept a function
        ok 1 - should accept a function
          ---
          duration_ms: 1.736452
          type: 'test'
          ...
        # Subtest: should clear checker when passed null
        ok 2 - should clear checker when passed null
          ---
          duration_ms: 0.437606
          type: 'test'
          ...
        # Subtest: should clear checker when passed non-function
        ok 3 - should clear checker when passed non-function
          ---
          duration_ms: 0.783284
          type: 'test'
          ...
        1..3
    ok 1 - setDmBlockChecker
      ---
      duration_ms: 4.29618
      type: 'suite'
      ...
    # Subtest: applyDirectMessage with block checker
        # Subtest: should drop messages from blocked senders
        ok 1 - should drop messages from blocked senders
          ---
          duration_ms: 1.244885
          type: 'test'
          ...
        # Subtest: should allow messages from non-blocked senders
        ok 2 - should allow messages from non-blocked senders
          ---
          duration_ms: 3.213675
          type: 'test'
          ...
        # Subtest: should allow all messages when no block checker is set
        ok 3 - should allow all messages when no block checker is set
          ---
          duration_ms: 0.82826
          type: 'test'
          ...
        # Subtest: should block outgoing messages to blocked recipients
        ok 4 - should block outgoing messages to blocked recipients
          ---
          duration_ms: 0.437601
          type: 'test'
          ...
        1..4
    ok 2 - applyDirectMessage with block checker
      ---
      duration_ms: 6.33213
      type: 'suite'
      ...
    # Subtest: _isDmRemoteBlocked
        # Subtest: should return false when no checker is set
        ok 1 - should return false when no checker is set
          ---
          duration_ms: 2.531627
          type: 'test'
          ...
        # Subtest: should return true for blocked remote pubkey
        ok 2 - should return true for blocked remote pubkey
          ---
          duration_ms: 0.55136
          type: 'test'
          ...
        # Subtest: should return false for allowed remote pubkey
        ok 3 - should return false for allowed remote pubkey
          ---
          duration_ms: 0.440996
          type: 'test'
          ...
        # Subtest: should handle checker that throws
        ok 4 - should handle checker that throws
          ---
          duration_ms: 0.339989
          type: 'test'
          ...
        1..4
    ok 3 - _isDmRemoteBlocked
      ---
      duration_ms: 4.148399
      type: 'suite'
      ...
    1..3
ok 1 - DM block/mute filtering
  ---
  duration_ms: 15.677356
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
# duration_ms 34.688922

→ Running tests/dm-db.test.mjs
TAP version 13
# Subtest: writeMessages normalizes records before storing
ok 1 - writeMessages normalizes records before storing
  ---
  duration_ms: 17.107665
  type: 'test'
  ...
# Subtest: updateConversationFromMessage persists metadata updates
ok 2 - updateConversationFromMessage persists metadata updates
  ---
  duration_ms: 4.644544
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
# duration_ms 29.458027

→ Running tests/dm-decryptor.test.mjs
TAP version 13
# Subtest: decryptDM handles kind 4 events with nip04 ciphertext
ok 1 - decryptDM handles kind 4 events with nip04 ciphertext
  ---
  duration_ms: 82.690364
  type: 'test'
  ...
# Subtest: decryptDM prefers recipient pubkeys when actor is the sender
ok 2 - decryptDM prefers recipient pubkeys when actor is the sender
  ---
  duration_ms: 23.93873
  type: 'test'
  ...
# Subtest: decryptDM unwraps kind 1059 gift wraps with nip44
ok 3 - decryptDM unwraps kind 1059 gift wraps with nip44
  ---
  duration_ms: 60.462742
  type: 'test'
  ...
# Subtest: decryptDM returns failure when decryptors are unavailable
ok 4 - decryptDM returns failure when decryptors are unavailable
  ---
  duration_ms: 0.328073
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
# duration_ms 181.146279

→ Running tests/dm-normalization.test.mjs
TAP version 13
# Subtest: direct message normalization hashes conversations consistently
ok 1 - direct message normalization hashes conversations consistently
  ---
  duration_ms: 17.97616
  type: 'test'
  ...
# Subtest: direct message list dedupes entries by event id
ok 2 - direct message list dedupes entries by event id
  ---
  duration_ms: 6.671798
  type: 'test'
  ...

→ Running tests/docs/verify-upload-claims.test.mjs
TAP version 13
# Subtest: Documentation Accuracy Verification
    # Subtest: setup
    ok 1 - setup
      ---
      duration_ms: 7.858537
      type: 'test'
      ...
    # Subtest: should list accepted video file extensions in docs matching the HTML accept attribute
    ok 2 - should list accepted video file extensions in docs matching the HTML accept attribute
      ---
      duration_ms: 0.654205
      type: 'test'
      ...
    # Subtest: should state Title is required in docs and be required in HTML
    ok 3 - should state Title is required in docs and be required in HTML
      ---
      duration_ms: 0.435887
      type: 'test'
      ...
    # Subtest: should mention 2GB limit recommendation in docs and HTML
    ok 4 - should mention 2GB limit recommendation in docs and HTML
      ---
      duration_ms: 0.353616
      type: 'test'
      ...
    1..4
ok 1 - Documentation Accuracy Verification
  ---
  duration_ms: 11.053767
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
# duration_ms 20.246822

→ Running tests/edit-modal-submit-state.test.mjs
TAP version 13
# Subtest: ignores additional submissions while pending without spurious errors
ok 1 - ignores additional submissions while pending without spurious errors
  ---
  duration_ms: 291.542817
  type: 'test'
  ...
# Subtest: editing the magnet refreshes torrent hints when ws/xs remain locked
ok 2 - editing the magnet refreshes torrent hints when ws/xs remain locked
  ---
  duration_ms: 108.349439
  type: 'test'
  ...
# Subtest: does not show missing video error after modal closes
ok 3 - does not show missing video error after modal closes
  ---
  duration_ms: 95.285818
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
# duration_ms 509.900038

→ Running tests/event-schemas.test.mjs
TAP version 13
# Subtest: Nostr Event Schemas
    # Subtest: should validate buildVideoPostEvent
    ok 1 - should validate buildVideoPostEvent
      ---
      duration_ms: 2.285992
      type: 'test'
      ...
    # Subtest: should validate buildVideoMirrorEvent
    ok 2 - should validate buildVideoMirrorEvent
      ---
      duration_ms: 0.416666
      type: 'test'
      ...
    # Subtest: should validate buildRepostEvent
    ok 3 - should validate buildRepostEvent
      ---
      duration_ms: 0.429864
      type: 'test'
      ...
    # Subtest: should validate buildShareEvent
    ok 4 - should validate buildShareEvent
      ---
      duration_ms: 0.649842
      type: 'test'
      ...
    # Subtest: should validate buildRelayListEvent
    ok 5 - should validate buildRelayListEvent
      ---
      duration_ms: 0.683171
      type: 'test'
      ...
    # Subtest: should validate buildDmRelayListEvent
    ok 6 - should validate buildDmRelayListEvent
      ---
      duration_ms: 0.40369
      type: 'test'
      ...
    # Subtest: should validate buildProfileMetadataEvent
    ok 7 - should validate buildProfileMetadataEvent
      ---
      duration_ms: 0.448401
      type: 'test'
      ...
    # Subtest: should validate buildMuteListEvent
    ok 8 - should validate buildMuteListEvent
      ---
      duration_ms: 0.44659
      type: 'test'
      ...
    # Subtest: should validate buildDeletionEvent
    ok 9 - should validate buildDeletionEvent
      ---
      duration_ms: 0.733218
      type: 'test'
      ...
    # Subtest: should validate buildLegacyDirectMessageEvent
    ok 10 - should validate buildLegacyDirectMessageEvent
      ---
      duration_ms: 0.50933
      type: 'test'
      ...
    # Subtest: should validate buildDmAttachmentEvent
    ok 11 - should validate buildDmAttachmentEvent
      ---
      duration_ms: 0.295857
      type: 'test'
      ...
    # Subtest: should validate buildDmReadReceiptEvent
    ok 12 - should validate buildDmReadReceiptEvent
      ---
      duration_ms: 0.25454
      type: 'test'
      ...
    # Subtest: should validate buildDmTypingIndicatorEvent
    ok 13 - should validate buildDmTypingIndicatorEvent
      ---
      duration_ms: 0.336446
      type: 'test'
      ...
    # Subtest: should validate buildViewEvent
    ok 14 - should validate buildViewEvent
      ---
      duration_ms: 0.426662
      type: 'test'
      ...
    # Subtest: should validate buildZapRequestEvent
    ok 15 - should validate buildZapRequestEvent
      ---
      duration_ms: 0.324609
      type: 'test'
      ...
    # Subtest: should validate buildReactionEvent
    ok 16 - should validate buildReactionEvent
      ---
      duration_ms: 0.795931
      type: 'test'
      ...
    # Subtest: should validate buildCommentEvent
    ok 17 - should validate buildCommentEvent
      ---
      duration_ms: 0.796824
      type: 'test'
      ...
    # Subtest: should validate buildWatchHistoryEvent
    ok 18 - should validate buildWatchHistoryEvent
      ---
      duration_ms: 0.63155
      type: 'test'
      ...
    # Subtest: should validate buildSubscriptionListEvent
    ok 19 - should validate buildSubscriptionListEvent
      ---
      duration_ms: 0.234147
      type: 'test'
      ...
    # Subtest: should validate buildBlockListEvent
    ok 20 - should validate buildBlockListEvent
      ---
      duration_ms: 0.20421
      type: 'test'
      ...
    # Subtest: should validate buildHashtagPreferenceEvent
    ok 21 - should validate buildHashtagPreferenceEvent
      ---
      duration_ms: 0.296754
      type: 'test'
      ...
    # Subtest: should validate buildAdminListEvent (moderation)
    ok 22 - should validate buildAdminListEvent (moderation)
      ---
      duration_ms: 0.293056
      type: 'test'
      ...
    1..22
ok 1 - Nostr Event Schemas
  ---
  duration_ms: 14.674313
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
# duration_ms 40.532884

→ Running tests/feed-engine/explore-diversity.test.mjs
TAP version 13
# Subtest: explore diversity sorter increases tag diversity in the top results
ok 1 - explore diversity sorter increases tag diversity in the top results
  ---
  duration_ms: 2.425975
  type: 'test'
  ...
# Subtest: explore diversity sorter logs why when MMR re-orders similar candidates
ok 2 - explore diversity sorter logs why when MMR re-orders similar candidates
  ---
  duration_ms: 1.022706
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
# duration_ms 15.345544

→ Running tests/feed-engine/explore-scorer.test.mjs
TAP version 13
# Subtest: explore disinterest filter drops videos with disinterested tags
ok 1 - explore disinterest filter drops videos with disinterested tags
  ---
  duration_ms: 1.897835
  type: 'test'
  ...
# Subtest: explore scorer penalizes disinterest overlap and logs why metadata
ok 2 - explore scorer penalizes disinterest overlap and logs why metadata
  ---
  duration_ms: 1.858304
  type: 'test'
  ...
# Subtest: explore scorer rewards novelty and new tag fraction
ok 3 - explore scorer rewards novelty and new tag fraction
  ---
  duration_ms: 0.567811
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
# duration_ms 17.112852

→ Running tests/feed-engine/kids-scorer.test.mjs
TAP version 13
# Subtest: kids scorer correctly identifies dominant positive component
ok 1 - kids scorer correctly identifies dominant positive component
  ---
  duration_ms: 2.732612
  type: 'test'
  ...
# Subtest: kids scorer picks educational-boost when dominant
ok 2 - kids scorer picks educational-boost when dominant
  ---
  duration_ms: 0.538381
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
# duration_ms 15.995396

→ Running tests/feed-engine/tag-preference-filter.test.mjs
TAP version 13
# Subtest: tag preference stage filters by interests and excludes disinterests
ok 1 - tag preference stage filters by interests and excludes disinterests
  ---
  duration_ms: 2.812278
  type: 'test'
  ...
# Subtest: tag preference stage accepts interests from nip71 hashtags
ok 2 - tag preference stage accepts interests from nip71 hashtags
  ---
  duration_ms: 0.413819
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
# duration_ms 16.619717

→ Running tests/grid-health.test.mjs
TAP version 13
# Subtest: prioritizeEntries input validation
ok 1 - prioritizeEntries input validation
  ---
  duration_ms: 88.278414
  type: 'test'
  ...
# Subtest: prioritizeEntries filtering
ok 2 - prioritizeEntries filtering
  ---
  duration_ms: 13.338571
  type: 'test'
  ...
# Subtest: prioritizeEntries without viewport center
ok 3 - prioritizeEntries without viewport center
  ---
  duration_ms: 10.801396
  type: 'test'
  ...
# Subtest: prioritizeEntries with viewport center
ok 4 - prioritizeEntries with viewport center
  ---
  duration_ms: 10.672001
  type: 'test'
  ...
# Subtest: prioritizeEntries ratio prioritization when distances are similar
ok 5 - prioritizeEntries ratio prioritization when distances are similar
  ---
  duration_ms: 11.377442
  type: 'test'
  ...
# Subtest: prioritizeEntries uses boundingClientRect fallback
ok 6 - prioritizeEntries uses boundingClientRect fallback
  ---
  duration_ms: 10.283788
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
# duration_ms 169.135744

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
  duration_ms: 22.759746
  type: 'test'
  ...
# Subtest: load falls back to nip04 decryption
ok 2 - load falls back to nip04 decryption
  ---
  duration_ms: 2.873818
  type: 'test'
  ...
# Subtest: load retries decryptors when hinted scheme fails
ok 3 - load retries decryptors when hinted scheme fails
  ---
  duration_ms: 2.556223
  type: 'test'
  ...
# Subtest: load defers permission-required decrypts until explicitly enabled
ok 4 - load defers permission-required decrypts until explicitly enabled
  ---
  duration_ms: 6.48101
  type: 'test'
  ...
# Subtest: interest and disinterest lists remain exclusive
ok 5 - interest and disinterest lists remain exclusive
  ---
  duration_ms: 16.444558
  type: 'test'
  ...
# Subtest: publish encrypts payload and builds event via builder
ok 6 - publish encrypts payload and builds event via builder
  ---
  duration_ms: 2.768541
  type: 'test'
  ...
# Subtest: publish falls back to window nostr encryptors
ok 7 - publish falls back to window nostr encryptors
  ---
  duration_ms: 2.818101
  type: 'test'
  ...
# Subtest: load prefers canonical kind when timestamps match while accepting legacy payload
ok 8 - load prefers canonical kind when timestamps match while accepting legacy payload
  ---
  duration_ms: 2.605224
  type: 'test'
  ...
# Subtest: load falls back to window.nostr when active signer is missing
ok 9 - load falls back to window.nostr when active signer is missing
  ---
  duration_ms: 2.028667
  type: 'test'
  ...
# Subtest: load falls back to window.nostr when active signer lacks decrypt capabilities
ok 10 - load falls back to window.nostr when active signer lacks decrypt capabilities
  ---
  duration_ms: 1.684282
  type: 'test'
  ...

→ Running tests/login-modal-controller.test.mjs
TAP version 13
# Subtest: LoginModalController shows custom error for empty nsec input
ok 1 - LoginModalController shows custom error for empty nsec input
  ---
  duration_ms: 220.4348
  type: 'test'
  ...
# Subtest: LoginModalController does not set required attribute when toggling modes
ok 2 - LoginModalController does not set required attribute when toggling modes
  ---
  duration_ms: 67.265021
  type: 'test'
  ...
# Subtest: LoginModalController shows NIP-46 handshake panel
ok 3 - LoginModalController shows NIP-46 handshake panel
  ---
  duration_ms: 56.129777
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
# duration_ms 359.892898

→ Running tests/magnet-utils.test.mjs
TAP version 13
# Subtest: safeDecodeMagnet handles encoded values
ok 1 - safeDecodeMagnet handles encoded values
  ---
  duration_ms: 1.626999
  type: 'test'
  ...
# Subtest: safeDecodeMagnet leaves plain strings untouched
ok 2 - safeDecodeMagnet leaves plain strings untouched
  ---
  duration_ms: 0.331846
  type: 'test'
  ...
# Subtest: bare hashes normalize consistently
ok 3 - bare hashes normalize consistently
  ---
  duration_ms: 3.082462
  type: 'test'
  ...
# Subtest: legacy %3A payloads decode
ok 4 - legacy %3A payloads decode
  ---
  duration_ms: 0.689444
  type: 'test'
  ...
# Subtest: duplicate trackers and hints stay in sync
ok 5 - duplicate trackers and hints stay in sync
  ---
  duration_ms: 0.878132
  type: 'test'
  ...
# Subtest: object helper enforces HTTPS web seeds when on HTTPS
ok 6 - object helper enforces HTTPS web seeds when on HTTPS
  ---
  duration_ms: 0.474575
  type: 'test'
  ...
# Subtest: object helper allows HTTP seeds on HTTP origins
ok 7 - object helper allows HTTP seeds on HTTP origins
  ---
  duration_ms: 0.480869
  type: 'test'
  ...
# Subtest: extractMagnetHints returns first ws/xs pair
ok 8 - extractMagnetHints returns first ws/xs pair
  ---
  duration_ms: 0.46988
  type: 'test'
  ...
# Subtest: object helper reports didChange when output differs
ok 9 - object helper reports didChange when output differs
  ---
  duration_ms: 0.737983
  type: 'test'
  ...
# Subtest: helpers trim fragments from non-magnet values
ok 10 - helpers trim fragments from non-magnet values
  ---
  duration_ms: 0.675918
  type: 'test'
  ...
# Subtest: normalizeAndAugmentMagnet filters out known broken trackers
ok 11 - normalizeAndAugmentMagnet filters out known broken trackers
  ---
  duration_ms: 0.676781
  type: 'test'
  ...
# Subtest: normalizeMagnetInput parses each inbound parameter exactly once
ok 12 - normalizeMagnetInput parses each inbound parameter exactly once
  ---
  duration_ms: 0.283043
  type: 'test'
  ...
# Subtest: normalizeAndAugmentMagnet keeps unchanged xt/tr/ws/xs params singular
ok 13 - normalizeAndAugmentMagnet keeps unchanged xt/tr/ws/xs params singular
  ---
  duration_ms: 0.593414
  type: 'test'
  ...
# Subtest: normalizeMagnetInput preserves parameter values containing additional equals signs
ok 14 - normalizeMagnetInput preserves parameter values containing additional equals signs
  ---
  duration_ms: 0.355327
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
# duration_ms 33.056849

→ Running tests/media-loader.test.mjs
TAP version 13
# Subtest: MediaLoader assigns image sources once intersecting
ok 1 - MediaLoader assigns image sources once intersecting
  ---
  duration_ms: 142.211308
  type: 'test'
  ...
# Subtest: MediaLoader loads video sources and poster fallbacks
ok 2 - MediaLoader loads video sources and poster fallbacks
  ---
  duration_ms: 40.199091
  type: 'test'
  ...
# Subtest: MediaLoader clears unsupported lazy targets without inline styles
ok 3 - MediaLoader clears unsupported lazy targets without inline styles
  ---
  duration_ms: 25.430311
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
# duration_ms 225.642234

→ Running tests/minimal-channel-profile.test.mjs
TAP version 13
# Subtest: can import channelProfile
ok 1 - can import channelProfile
  ---
  duration_ms: 1.03129
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
# duration_ms 24.116128

→ Running tests/minimal-webtorrent.test.mjs
TAP version 13
# Subtest: can import WebTorrent
ok 1 - can import WebTorrent
  ---
  duration_ms: 1.446841
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
# duration_ms 12.017495

→ Running tests/modal-accessibility.test.mjs
TAP version 13
# Subtest: UploadModal closes on Escape and restores trigger focus
ok 1 - UploadModal closes on Escape and restores trigger focus
  ---
  duration_ms: 285.458175
  type: 'test'
  ...
# Subtest: UploadModal backdrop click closes and restores trigger focus
ok 2 - UploadModal backdrop click closes and restores trigger focus
  ---
  duration_ms: 85.796693
  type: 'test'
  ...
# Subtest: UploadModal mode toggle updates button states
ok 3 - UploadModal mode toggle updates button states
  ---
  duration_ms: 62.160906
  type: 'test'
  ...
# Subtest: EditModal Escape closes and restores trigger focus
ok 4 - EditModal Escape closes and restores trigger focus
  ---
  duration_ms: 92.780635
  type: 'test'
  ...
# Subtest: EditModal backdrop click closes and restores trigger focus
ok 5 - EditModal backdrop click closes and restores trigger focus
  ---
  duration_ms: 80.595764
  type: 'test'
  ...
# Subtest: EditModal visibility toggle updates button state
ok 6 - EditModal visibility toggle updates button state
  ---
  duration_ms: 76.389552
  type: 'test'
  ...
# Subtest: RevertModal Escape closes and restores trigger focus
ok 7 - RevertModal Escape closes and restores trigger focus
  ---
  duration_ms: 51.862884
  type: 'test'
  ...
# Subtest: static modal helper toggles accessibility hooks
ok 8 - static modal helper toggles accessibility hooks
  ---
  duration_ms: 12.984974
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
# duration_ms 759.714413

→ Running tests/moderation-service.test.mjs
TAP version 13
# Subtest: trusted report summaries respect personal blocks and admin lists
ok 1 - trusted report summaries respect personal blocks and admin lists
  ---
  duration_ms: 5.783476
  type: 'test'
  ...
# Subtest: user block updates recompute summaries and emit notifications
ok 2 - user block updates recompute summaries and emit notifications
  ---
  duration_ms: 5.447555
  type: 'test'
  ...
# Subtest: moderation thresholds emit logger hooks only when crossing
ok 3 - moderation thresholds emit logger hooks only when crossing
  ---
  duration_ms: 1.961213
  type: 'test'
  ...
# Subtest: trusted mute aggregation tracks F1 mute lists
ok 4 - trusted mute aggregation tracks F1 mute lists
  ---
  duration_ms: 1.968843
  type: 'test'
  ...
# Subtest: viewer mute list publishes and updates aggregation
ok 5 - viewer mute list publishes and updates aggregation
  ---
  duration_ms: 2.997321
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
# duration_ms 2026.973968

→ Running tests/moderation-stage.test.mjs
TAP version 13
# Subtest: moderation stage enforces admin lists without whitelist bypass
ok 1 - moderation stage enforces admin lists without whitelist bypass
  ---
  duration_ms: 4.719924
  type: 'test'
  ...
# Subtest: moderation stage annotates trusted mute metadata
ok 2 - moderation stage annotates trusted mute metadata
  ---
  duration_ms: 1.021427
  type: 'test'
  ...
# Subtest: moderation stage applies provided thresholds
ok 3 - moderation stage applies provided thresholds
  ---
  duration_ms: 1.062548
  type: 'test'
  ...
# Subtest: moderation stage respects runtime threshold changes
ok 4 - moderation stage respects runtime threshold changes
  ---
  duration_ms: 0.881822
  type: 'test'
  ...
# Subtest: moderation stage supports function-based threshold resolvers
ok 5 - moderation stage supports function-based threshold resolvers
  ---
  duration_ms: 0.996903
  type: 'test'
  ...
# Subtest: moderation stage propagates whitelist, muters, and threshold updates
ok 6 - moderation stage propagates whitelist, muters, and threshold updates
  ---
  duration_ms: 3.108136
  type: 'test'
  ...
# Subtest: moderation stage blurs viewer-muted authors
ok 7 - moderation stage blurs viewer-muted authors
  ---
  duration_ms: 0.745465
  type: 'test'
  ...
# Subtest: moderation stage clears cached reporters and muters after service signals
ok 8 - moderation stage clears cached reporters and muters after service signals
  ---
  duration_ms: 1.046327
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
# duration_ms 30.189133

→ Running tests/moderation/hide-thresholds.test.mjs
TAP version 13
# Subtest: moderation stage hides videos muted by trusted when threshold met
ok 1 - moderation stage hides videos muted by trusted when threshold met
  ---
  duration_ms: 4.577272
  type: 'test'
  ...
# Subtest: moderation stage hides videos when trusted reports exceed threshold
ok 2 - moderation stage hides videos when trusted reports exceed threshold
  ---
  duration_ms: 0.969511
  type: 'test'
  ...
# Subtest: moderation stage respects runtime hide threshold changes
ok 3 - moderation stage respects runtime hide threshold changes
  ---
  duration_ms: 1.011342
  type: 'test'
  ...
# Subtest: moderation stage supports trusted mute hide resolver functions
ok 4 - moderation stage supports trusted mute hide resolver functions
  ---
  duration_ms: 1.197483
  type: 'test'
  ...
# Subtest: moderation stage bypasses hard hides on home feed
ok 5 - moderation stage bypasses hard hides on home feed
  ---
  duration_ms: 0.726703
  type: 'test'
  ...
# Subtest: moderation stage hides admin-whitelisted videos once thresholds fire
ok 6 - moderation stage hides admin-whitelisted videos once thresholds fire
  ---
  duration_ms: 0.803917
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
# duration_ms 26.778039

→ Running tests/moderation/submit-report.test.mjs
TAP version 13
# Subtest: submitReport emits NIP-56 compliant report tags
ok 1 - submitReport emits NIP-56 compliant report tags
  ---
  duration_ms: 11.433121
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
# duration_ms 19.528214

→ Running tests/moderation/trust-seeds.test.mjs
[bitvid] [moderationService] moderation threshold crossed
[bitvid] [moderationService] moderation threshold crossed
[bitvid] [moderationService] moderation threshold crossed
[bitvid] [moderationService] moderation threshold crossed
TAP version 13
# Subtest: default trust seeds derive from config
ok 1 - default trust seeds derive from config
  ---
  duration_ms: 2.098565
  type: 'test'
  ...
# Subtest: trusted seeds contribute to trusted mute counts
ok 2 - trusted seeds contribute to trusted mute counts
  ---
  duration_ms: 4.165929
  type: 'test'
  ...
# Subtest: trusted seeds contribute to trusted report counts
ok 3 - trusted seeds contribute to trusted report counts
  ---
  duration_ms: 3.638892
  type: 'test'
  ...
# Subtest: trusted seed updates recompute guest report summaries
ok 4 - trusted seed updates recompute guest report summaries
  ---
  duration_ms: 1.296662
  type: 'test'
  ...
# Subtest: moderator seeds populate trusted contacts
ok 5 - moderator seeds populate trusted contacts
  ---
  duration_ms: 0.900073
  type: 'test'
  ...
# Subtest: bootstrap seeds track editor roster and ignore whitelist-only changes
ok 6 - bootstrap seeds track editor roster and ignore whitelist-only changes
  ---
  duration_ms: 120.49465
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
# duration_ms 3639.907067

→ Running tests/moderation/trusted-mute-lists.test.mjs
TAP version 13
# Subtest: trusted mute lists from seeds hide authors for anonymous viewers
ok 1 - trusted mute lists from seeds hide authors for anonymous viewers
  ---
  duration_ms: 12.898971
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
# duration_ms 2016.424688

→ Running tests/moderation/trusted-report-count.test.mjs
[bitvid] [moderationService] moderation threshold crossed
[bitvid] [moderationService] moderation threshold crossed
[bitvid] [moderationService] moderation threshold crossed
[bitvid] [moderationService] moderation threshold crossed
[bitvid] [moderationService] moderation threshold crossed
[bitvid] [moderationService] moderation threshold crossed
[bitvid] [moderationService] moderation threshold crossed
[bitvid] [moderationService] moderation threshold crossed
[bitvid] [moderationService] moderation threshold crossed
[bitvid] [moderationService] moderation threshold crossed
[bitvid] [moderationService] moderation threshold crossed
[bitvid] [moderationService] moderation threshold crossed
TAP version 13
# Subtest: trustedReportCount dedupes multiple reports from the same trusted reporter
ok 1 - trustedReportCount dedupes multiple reports from the same trusted reporter
  ---
  duration_ms: 5.813527
  type: 'test'
  ...
# Subtest: trustedReportCount ignores reports from muted or blocked reporters
ok 2 - trustedReportCount ignores reports from muted or blocked reporters
  ---
  duration_ms: 2.50093
  type: 'test'
  ...
# Subtest: blocking and unblocking reporters recomputes trusted summaries
ok 3 - blocking and unblocking reporters recomputes trusted summaries
  ---
  duration_ms: 3.511579
  type: 'test'
  ...
# Subtest: trustedReportCount only counts eligible F1 reporters and admin whitelist
ok 4 - trustedReportCount only counts eligible F1 reporters and admin whitelist
  ---
  duration_ms: 2.069502
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
# duration_ms 2019.897908

→ Running tests/moderation/video-card.test.mjs
TAP version 13
# Subtest: VideoCard renders moderation badges and respects viewer override
ok 1 - VideoCard renders moderation badges and respects viewer override
  ---
  duration_ms: 143.212952
  type: 'test'
  ...
# Subtest: VideoCard hides content when hide metadata is present and override unmasks it
ok 2 - VideoCard hides content when hide metadata is present and override unmasks it
  ---
  duration_ms: 43.558244
  type: 'test'
  ...
# Subtest: VideoCard blurs viewer-muted creators
ok 3 - VideoCard blurs viewer-muted creators
  ---
  duration_ms: 34.512111
  type: 'test'
  ...
# Subtest: VideoCard blurs thumbnails when trusted mute triggers without reports
ok 4 - VideoCard blurs thumbnails when trusted mute triggers without reports
  ---
  duration_ms: 27.769198
  type: 'test'
  ...
# Subtest: VideoCard block action restores trusted mute hide state after override
ok 5 - VideoCard block action restores trusted mute hide state after override
  ---
  duration_ms: 35.585407
  type: 'test'
  ...
# Subtest: applyModerationContextDatasets clears blur when overrides are active
ok 6 - applyModerationContextDatasets clears blur when overrides are active
  ---
  duration_ms: 10.430222
  type: 'test'
  ...
# Subtest: buildModerationBadgeText returns trusted contact block copy when autoplay block and trusted mute combine
ok 7 - buildModerationBadgeText returns trusted contact block copy when autoplay block and trusted mute combine
  ---
  duration_ms: 0.288797
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
# duration_ms 313.206749

→ Running tests/more-menu-controller.test.mjs
TAP version 13
# Subtest: copy-link action writes to clipboard and shows success
ok 1 - copy-link action writes to clipboard and shows success
  ---
  duration_ms: 3.338849
  type: 'test'
  ...
# Subtest: blacklist-author requires moderator access and refreshes subscriptions
ok 2 - blacklist-author requires moderator access and refreshes subscriptions
  ---
  duration_ms: 0.635524
  type: 'test'
  ...
# Subtest: blacklist-author shows error when no moderator session is available
ok 3 - blacklist-author shows error when no moderator session is available
  ---
  duration_ms: 0.393957
  type: 'test'
  ...
# Subtest: block-author updates user blocks, reloads videos, and refreshes feeds
ok 4 - block-author updates user blocks, reloads videos, and refreshes feeds
  ---
  duration_ms: 0.837527
  type: 'test'
  ...
# Subtest: mute-author updates viewer mute list and refreshes feeds
ok 5 - mute-author updates viewer mute list and refreshes feeds
  ---
  duration_ms: 0.661399
  type: 'test'
  ...
# Subtest: unmute-author removes creators from viewer mute list
ok 6 - unmute-author removes creators from viewer mute list
  ---
  duration_ms: 0.595319
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
# duration_ms 23.390313

→ Running tests/nip07-concurrency.test.mjs
TAP version 13
# Subtest: NIP-07 Concurrency Queue
    # Subtest: runs up to 5 tasks concurrently
    ok 1 - runs up to 5 tasks concurrently
      ---
      duration_ms: 305.412968
      type: 'test'
      ...
    # Subtest: respects priority
    ok 2 - respects priority
      ---
      duration_ms: 151.996513
      type: 'test'
      ...
    1..2
ok 1 - NIP-07 Concurrency Queue
  ---
  duration_ms: 459.538637
  type: 'suite'
  ...
1..1
# tests 2
# suites 1
# pass 2
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 467.342767

→ Running tests/nip71-base-event-tags.test.mjs
TAP version 13
# Subtest: 30078 events carry nip71 metadata tags and hydrate fallback metadata
ok 1 - 30078 events carry nip71 metadata tags and hydrate fallback metadata
  ---
  duration_ms: 6.046089
  type: 'test'
  ...
# Subtest: imeta tags lower-case mime values
ok 2 - imeta tags lower-case mime values
  ---
  duration_ms: 0.582417
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
# duration_ms 18.09479

→ Running tests/nip71-builder.test.mjs
TAP version 13
# Subtest: buildNip71VideoEvent assembles rich metadata
ok 1 - buildNip71VideoEvent assembles rich metadata
  ---
  duration_ms: 3.961423
  type: 'test'
  ...
# Subtest: buildNip71VideoEvent falls back to summary and selects kind
ok 2 - buildNip71VideoEvent falls back to summary and selects kind
  ---
  duration_ms: 0.352781
  type: 'test'
  ...
# Subtest: buildNip71VideoEvent attaches pointer tags
ok 3 - buildNip71VideoEvent attaches pointer tags
  ---
  duration_ms: 0.450085
  type: 'test'
  ...
# Subtest: extractNip71MetadataFromTags parses metadata and pointers
ok 4 - extractNip71MetadataFromTags parses metadata and pointers
  ---
  duration_ms: 1.323767
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
# duration_ms 20.137199

→ Running tests/nip71-form-manager.test.mjs
TAP version 13
# Subtest: collectSection sanitizes and deduplicates hashtags
ok 1 - collectSection sanitizes and deduplicates hashtags
  ---
  duration_ms: 124.669578
  type: 'test'
  ...
# Subtest: hydrateSection renders sanitized hashtags with prefix
ok 2 - hydrateSection renders sanitized hashtags with prefix
  ---
  duration_ms: 24.816538
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
# duration_ms 161.735471

→ Running tests/nostr-login-permissions.test.mjs
TAP version 13
# Subtest: NIP-07 Login Permissions
    # Subtest: NIP-07 login requests decrypt permissions upfront
    ok 1 - NIP-07 login requests decrypt permissions upfront
      ---
      duration_ms: 5.701702
      type: 'test'
      ...
    # Subtest: NIP-07 decrypt reuses cached extension permissions
    ok 2 - NIP-07 decrypt reuses cached extension permissions
      ---
      duration_ms: 2.045642
      type: 'test'
      ...
    # Subtest: NIP-07 login falls back when structured permissions fail
    ok 3 - NIP-07 login falls back when structured permissions fail
      ---
      duration_ms: 1.479913
      type: 'test'
      ...
    # Subtest: NIP-07 login supports extensions that only allow enable() without payload
    ok 4 - NIP-07 login supports extensions that only allow enable() without payload
      ---
      duration_ms: 1.593635
      type: 'test'
      ...
    # Subtest: NIP-07 login quickly retries when a permission payload stalls
    ok 5 - NIP-07 login quickly retries when a permission payload stalls
      ---
      duration_ms: 83.055455
      type: 'test'
      ...
    # Subtest: NIP-07 login does not wait for deferred permission grants
    ok 6 - NIP-07 login does not wait for deferred permission grants
      ---
      duration_ms: 302.602119
      type: 'test'
      ...
    # Subtest: NIP-07 login surfaces enable permission errors
    ok 7 - NIP-07 login surfaces enable permission errors
      ---
      duration_ms: 1.693996
      type: 'test'
      ...
    # Subtest: runNip07WithRetry respects timeout without retry multiplier
    ok 8 - runNip07WithRetry respects timeout without retry multiplier
      ---
      duration_ms: 61.043717
      type: 'test'
      ...
    1..8
ok 1 - NIP-07 Login Permissions
  ---
  duration_ms: 461.5371
  type: 'suite'
  ...
1..1
# tests 8
# suites 1
# pass 8
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 470.172598

→ Running tests/nostr-nip46-queue.test.mjs
TAP version 13
# Subtest: Nip46RequestQueue: processes tasks in FIFO order for same priority
ok 1 - Nip46RequestQueue: processes tasks in FIFO order for same priority
  ---
  duration_ms: 2.452315
  type: 'test'
  ...
# Subtest: Nip46RequestQueue: respects priority levels
ok 2 - Nip46RequestQueue: respects priority levels
  ---
  duration_ms: 10.798598
  type: 'test'
  ...
# Subtest: Nip46RequestQueue: respects minDelayMs
ok 3 - Nip46RequestQueue: respects minDelayMs
  ---
  duration_ms: 100.687535
  type: 'test'
  ...
# Subtest: Nip46RequestQueue: clear() rejects pending tasks
ok 4 - Nip46RequestQueue: clear() rejects pending tasks
  ---
  duration_ms: 101.642883
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
# duration_ms 224.408351

→ Running tests/nostr-private-key-signer.test.mjs
TAP version 13
# Subtest: Nostr Private Key Signer
    # Subtest: registerPrivateKeySigner exposes nip04 helpers
    ok 1 - registerPrivateKeySigner exposes nip04 helpers
      ---
      duration_ms: 190.439476
      type: 'test'
      ...
    1..1
ok 1 - Nostr Private Key Signer
  ---
  duration_ms: 193.921155
  type: 'suite'
  ...

→ Running tests/nostr-send-direct-message.test.mjs
TAP version 13
# Subtest: sendDirectMessage succeeds with private key signer and no extension
ok 1 - sendDirectMessage succeeds with private key signer and no extension
  ---
  duration_ms: 232.573299
  type: 'test'
  ...

→ Running tests/nostr-service-access-control.test.mjs
TAP version 13
# Subtest: shouldIncludeVideo returns true for whitelist author when npubEncode throws
ok 1 - shouldIncludeVideo returns true for whitelist author when npubEncode throws
  ---
  duration_ms: 2.979801
  type: 'test'
  ...
# Subtest: shouldIncludeVideo rejects blacklisted authors provided as npub
ok 2 - shouldIncludeVideo rejects blacklisted authors provided as npub
  ---
  duration_ms: 2.696225
  type: 'test'
  ...
# Subtest: shouldIncludeVideo rejects blacklisted authors provided as hex when npubEncode throws
ok 3 - shouldIncludeVideo rejects blacklisted authors provided as hex when npubEncode throws
  ---
  duration_ms: 61.770148
  type: 'test'
  ...
# Subtest: shouldIncludeVideo always returns true for the viewer's own video
ok 4 - shouldIncludeVideo always returns true for the viewer's own video
  ---
  duration_ms: 0.447928
  type: 'test'
  ...
# Subtest: shouldIncludeVideo allows access when access control would deny the author
ok 5 - shouldIncludeVideo allows access when access control would deny the author
  ---
  duration_ms: 0.427305
  type: 'test'
  ...

→ Running tests/nostr-session-actor.test.mjs
TAP version 13
# Subtest: isSubtleCryptoAvailable returns true in test env
ok 1 - isSubtleCryptoAvailable returns true in test env
  ---
  duration_ms: 2.101494
  type: 'test'
  ...
# Subtest: generateRandomBytes returns correct length
ok 2 - generateRandomBytes returns correct length
  ---
  duration_ms: 1.807612
  type: 'test'
  ...
# Subtest: encryptSessionPrivateKey and decryptSessionPrivateKey roundtrip
ok 3 - encryptSessionPrivateKey and decryptSessionPrivateKey roundtrip
  ---
  duration_ms: 300.584395
  type: 'test'
  ...
# Subtest: decryptSessionPrivateKey fails with wrong passphrase
ok 4 - decryptSessionPrivateKey fails with wrong passphrase
  ---
  duration_ms: 299.915614
  type: 'test'
  ...
# Subtest: persistSessionActor writes to localStorage and IndexedDB
ok 5 - persistSessionActor writes to localStorage and IndexedDB
  ---
  duration_ms: 148.501829
  type: 'test'
  ...
# Subtest: readStoredSessionActorEntry retrieves from localStorage
ok 6 - readStoredSessionActorEntry retrieves from localStorage
  ---
  duration_ms: 151.342769
  type: 'test'
  ...
# Subtest: clearStoredSessionActor removes from localStorage
ok 7 - clearStoredSessionActor removes from localStorage
  ---
  duration_ms: 0.87003
  type: 'test'
  ...
# Subtest: helper: arrayBufferToBase64 and base64ToUint8Array roundtrip
ok 8 - helper: arrayBufferToBase64 and base64ToUint8Array roundtrip
  ---
  duration_ms: 2.528783
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
# duration_ms 917.196869

→ Running tests/nostr-signer-race.test.mjs
TAP version 13
# Subtest: ensureActiveSignerForPubkey prefers concurrent login over late extension injection
ok 1 - ensureActiveSignerForPubkey prefers concurrent login over late extension injection
  ---
  duration_ms: 104.916693
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
# duration_ms 112.584914

→ Running tests/nostr-specs/kind30078.test.mjs
TAP version 13
# Subtest: Kind 30078 (Video Note) Compliance
    # Subtest: should have correct kind 30078
    ok 1 - should have correct kind 30078
      ---
      duration_ms: 1.522245
      type: 'test'
      ...
    # Subtest: should require version 3
    ok 2 - should require version 3
      ---
      duration_ms: 0.330035
      type: 'test'
      ...
    # Subtest: should build a valid event with required fields
    ok 3 - should build a valid event with required fields
      ---
      duration_ms: 1.253527
      type: 'test'
      ...
    # Subtest: should allow magnet links
    ok 4 - should allow magnet links
      ---
      duration_ms: 0.359387
      type: 'test'
      ...
    # Subtest: should include "s" tag for storage pointer
    ok 5 - should include "s" tag for storage pointer
      ---
      duration_ms: 0.647274
      type: 'test'
      ...
    # Subtest: should include "d" tag
    ok 6 - should include "d" tag
      ---
      duration_ms: 0.396931
      type: 'test'
      ...
    1..6
ok 1 - Kind 30078 (Video Note) Compliance
  ---
  duration_ms: 6.168126
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
# duration_ms 21.855586

→ Running tests/nostr-specs/nip04-nip44.test.mjs
TAP version 13
# Subtest: NIP-04 / NIP-44 Compliance (dmDecryptWorker)
    # Subtest: should decrypt NIP-04 messages
    ok 1 - should decrypt NIP-04 messages
      ---
      duration_ms: 32.957385
      type: 'test'
      ...
    # Subtest: should decrypt NIP-44 v2 messages
    ok 2 - should decrypt NIP-44 v2 messages
      ---
      duration_ms: 51.977416
      type: 'test'
      ...
    # Subtest: should fail NIP-44 decryption with invalid signature
    ok 3 - should fail NIP-44 decryption with invalid signature
      ---
      duration_ms: 8.709418
      type: 'test'
      ...
    # Subtest: should prioritize NIP-44 v2
    ok 4 - should prioritize NIP-44 v2
      ---
      duration_ms: 0.331963
      type: 'test'
      ...
    1..4
ok 1 - NIP-04 / NIP-44 Compliance (dmDecryptWorker)
  ---
  duration_ms: 169.196955
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
# duration_ms 183.460069

→ Running tests/nostr/adapters.test.mjs
TAP version 13
# Subtest: createNsecAdapter wires signing and cipher capabilities
ok 1 - createNsecAdapter wires signing and cipher capabilities
  ---
  duration_ms: 64.464123
  type: 'test'
  ...
# Subtest: createNip07Adapter maps extension methods and permissions
ok 2 - createNip07Adapter maps extension methods and permissions
  ---
  duration_ms: 3.068856
  type: 'test'
  ...
# Subtest: createNip46Adapter wraps the remote signer client
ok 3 - createNip46Adapter wraps the remote signer client
  ---
  duration_ms: 0.825217
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
# duration_ms 80.857878

→ Running tests/nostr/cachePolicies.test.mjs
TAP version 13
# Subtest: CACHE_POLICIES structure
ok 1 - CACHE_POLICIES structure
  ---
  duration_ms: 1.241625
  type: 'test'
  ...
# Subtest: VIDEO_POST policy
ok 2 - VIDEO_POST policy
  ---
  duration_ms: 0.265253
  type: 'test'
  ...
# Subtest: WATCH_HISTORY policy
ok 3 - WATCH_HISTORY policy
  ---
  duration_ms: 0.167058
  type: 'test'
  ...
# Subtest: SUBSCRIPTION_LIST policy
ok 4 - SUBSCRIPTION_LIST policy
  ---
  duration_ms: 0.285631
  type: 'test'
  ...
# Subtest: VIDEO_COMMENT policy
ok 5 - VIDEO_COMMENT policy
  ---
  duration_ms: 0.277217
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
# duration_ms 15.571372

→ Running tests/nostr/client.test.mjs
TAP version 13
# Subtest: NostrClient
    # Subtest: Initialization
        # Subtest: should initialize with default state
        ok 1 - should initialize with default state
          ---
          duration_ms: 3.374046
          type: 'test'
          ...
        1..1
    ok 1 - Initialization
      ---
      duration_ms: 4.325697
      type: 'suite'
      ...
    # Subtest: fetchListIncrementally
        # Subtest: should fetch events and deduplicate results
        ok 1 - should fetch events and deduplicate results
          ---
          duration_ms: 3.207847
          type: 'test'
          ...
        # Subtest: should handle incremental updates using lastSeen
        ok 2 - should handle incremental updates using lastSeen
          ---
          duration_ms: 1.271155
          type: 'test'
          ...
        # Subtest: should override lastSeen with explicit since parameter
        ok 3 - should override lastSeen with explicit since parameter
          ---
          duration_ms: 1.134585
          type: 'test'
          ...
        # Subtest: should force full fetch if since is 0
        ok 4 - should force full fetch if since is 0
          ---
          duration_ms: 0.892774
          type: 'test'
          ...
        1..4
    ok 2 - fetchListIncrementally
      ---
      duration_ms: 7.02259
      type: 'suite'
      ...
    # Subtest: subscribeVideos
        # Subtest: should subscribe to video events and buffer them
        ok 1 - should subscribe to video events and buffer them
          ---
          duration_ms: 302.867845
          type: 'test'
          ...
        1..1
    ok 3 - subscribeVideos
      ---
      duration_ms: 303.583009
      type: 'suite'
      ...
    # Subtest: fetchVideos
        # Subtest: should delegate to subscribeVideos and return result on eose
        ok 1 - should delegate to subscribeVideos and return result on eose
          ---
          duration_ms: 6.352204
          type: 'test'
          ...
        # Subtest: should respect since parameter if provided
        ok 2 - should respect since parameter if provided
          ---
          duration_ms: 3.066547
          type: 'test'
          ...
        1..2
    ok 4 - fetchVideos
      ---
      duration_ms: 9.985348
      type: 'suite'
      ...
    # Subtest: publishVideo
        # Subtest: should throw if not logged in
        ok 1 - should throw if not logged in
          ---
          duration_ms: 2.551876
          type: 'test'
          ...
        # Subtest: should sign and publish a valid video
        ok 2 - should sign and publish a valid video
          ---
          duration_ms: 4.398138
          type: 'test'
          ...
        1..2
    ok 5 - publishVideo
      ---
      duration_ms: 7.130838
      type: 'suite'
      ...
    # Subtest: editVideo
        # Subtest: should throw if not owner
        ok 1 - should throw if not owner
          ---
          duration_ms: 1.031008
          type: 'test'
          ...
        1..1
    ok 6 - editVideo
      ---
      duration_ms: 1.149803
      type: 'suite'
      ...
    # Subtest: revertVideo
        # Subtest: should publish a deletion marker event
        ok 1 - should publish a deletion marker event
          ---
          duration_ms: 0.644788
          type: 'test'
          ...
        1..1
    ok 7 - revertVideo
      ---
      duration_ms: 0.743673
      type: 'suite'
      ...
    1..7
ok 1 - NostrClient
  ---
  duration_ms: 335.183867
  type: 'suite'
  ...
1..1
# tests 12
# suites 8
# pass 12
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 551.186424

→ Running tests/nostr/comment-events.test.mjs
TAP version 13
# Subtest: publishComment prefers active signer when available
ok 1 - publishComment prefers active signer when available
  ---
  duration_ms: 7.620921
  type: 'test'
  ...
# Subtest: publishComment rejects when active signer is unavailable
ok 2 - publishComment rejects when active signer is unavailable
  ---
  duration_ms: 0.405548
  type: 'test'
  ...
# Subtest: publishComment accepts legacy targets with only an event id
ok 3 - publishComment accepts legacy targets with only an event id
  ---
  duration_ms: 1.326199
  type: 'test'
  ...
# Subtest: publishComment derives root and parent metadata from parent comment tags
ok 4 - publishComment derives root and parent metadata from parent comment tags
  ---
  duration_ms: 1.382518
  type: 'test'
  ...
# Subtest: listVideoComments matches comments even when tag casing and whitespace differ
ok 5 - listVideoComments matches comments even when tag casing and whitespace differ
  ---
  duration_ms: 2.469486
  type: 'test'
  ...
# Subtest: listVideoComments matches uppercase definition addresses without lowering
ok 6 - listVideoComments matches uppercase definition addresses without lowering
  ---
  duration_ms: 1.068206
  type: 'test'
  ...
# Subtest: publishComment emits only uppercase video event pointer when address and parent are absent
ok 7 - publishComment emits only uppercase video event pointer when address and parent are absent
  ---
  duration_ms: 1.057137
  type: 'test'
  ...
# Subtest: listVideoComments builds filters with uppercase roots plus legacy fallbacks
ok 8 - listVideoComments builds filters with uppercase roots plus legacy fallbacks
  ---
  duration_ms: 1.219809
  type: 'test'
  ...
# Subtest: listVideoComments emits uppercase root filters when only the identifier is known
ok 9 - listVideoComments emits uppercase root filters when only the identifier is known
  ---
  duration_ms: 1.231796
  type: 'test'
  ...
# Subtest: listVideoComments supports legacy targets without a definition address
ok 10 - listVideoComments supports legacy targets without a definition address
  ---
  duration_ms: 1.155515
  type: 'test'
  ...
# Subtest: subscribeVideoComments forwards matching events and cleans up unsubscribe
ok 11 - subscribeVideoComments forwards matching events and cleans up unsubscribe
  ---
  duration_ms: 9.976412
  type: 'test'
  ...
# Subtest: subscribeVideoComments supports video targets without a definition address
ok 12 - subscribeVideoComments supports video targets without a definition address
  ---
  duration_ms: 0.876124
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
# duration_ms 39.835277

→ Running tests/nostr/commentTargetNormalizer.test.mjs
TAP version 13
# Subtest: CommentTargetNormalizer Utilities
    # Subtest: normalizeRelay
    ok 1 - normalizeRelay
      ---
      duration_ms: 1.445372
      type: 'test'
      ...
    # Subtest: normalizePointerCandidate
    ok 2 - normalizePointerCandidate
      ---
      duration_ms: 1.451815
      type: 'test'
      ...
    # Subtest: normalizeTagName
    ok 3 - normalizeTagName
      ---
      duration_ms: 0.192823
      type: 'test'
      ...
    # Subtest: normalizeTagValue
    ok 4 - normalizeTagValue
      ---
      duration_ms: 0.193599
      type: 'test'
      ...
    # Subtest: normalizeDescriptorString
    ok 5 - normalizeDescriptorString
      ---
      duration_ms: 0.491425
      type: 'test'
      ...
    # Subtest: pickString
    ok 6 - pickString
      ---
      duration_ms: 0.219223
      type: 'test'
      ...
    # Subtest: pickKind
    ok 7 - pickKind
      ---
      duration_ms: 0.218155
      type: 'test'
      ...
    # Subtest: isEventCandidate
    ok 8 - isEventCandidate
      ---
      duration_ms: 0.436104
      type: 'test'
      ...
    # Subtest: resolveEventCandidate
    ok 9 - resolveEventCandidate
      ---
      duration_ms: 0.420721
      type: 'test'
      ...
    # Subtest: collectTagsFromEvent
    ok 10 - collectTagsFromEvent
      ---
      duration_ms: 0.635455
      type: 'test'
      ...
    # Subtest: findTagByName
    ok 11 - findTagByName
      ---
      duration_ms: 0.344709
      type: 'test'
      ...
    1..11
ok 1 - CommentTargetNormalizer Utilities
  ---
  duration_ms: 7.993274
  type: 'suite'
  ...
# Subtest: CommentTargetNormalizer Class
    # Subtest: normalize with full explicit descriptor
    ok 1 - normalize with full explicit descriptor
      ---
      duration_ms: 1.536785
      type: 'test'
      ...
    # Subtest: normalize extracts from tags if missing in descriptor
    ok 2 - normalize extracts from tags if missing in descriptor
      ---
      duration_ms: 0.297235
      type: 'test'
      ...
    # Subtest: normalize prioritizes overrides over target
    ok 3 - normalize prioritizes overrides over target
      ---
      duration_ms: 0.207907
      type: 'test'
      ...
    # Subtest: normalize derives defaults correctly
    ok 4 - normalize derives defaults correctly
      ---
      duration_ms: 0.392257
      type: 'test'
      ...
    # Subtest: returns null if videoEventId is missing
    ok 5 - returns null if videoEventId is missing
      ---
      duration_ms: 0.178626
      type: 'test'
      ...
    1..5
ok 2 - CommentTargetNormalizer Class
  ---
  duration_ms: 2.864791
  type: 'suite'
  ...
1..2
# tests 16
# suites 2
# pass 16
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 30.571668

→ Running tests/nostr/countDiagnostics.test.mjs
TAP version 13
# Subtest: countDiagnostics
    # Subtest: isVerboseDiagnosticsEnabled
        # Subtest: should return true by default (due to override)
        ok 1 - should return true by default (due to override)
          ---
          duration_ms: 1.180903
          type: 'test'
          ...
        # Subtest: should return false if window.__BITVID_VERBOSE_DEV_MODE__ is false
        ok 2 - should return false if window.__BITVID_VERBOSE_DEV_MODE__ is false
          ---
          duration_ms: 0.4116
          type: 'test'
          ...
        # Subtest: should return true if window.__BITVID_VERBOSE_DEV_MODE__ is true
        ok 3 - should return true if window.__BITVID_VERBOSE_DEV_MODE__ is true
          ---
          duration_ms: 0.436268
          type: 'test'
          ...
        # Subtest: should fall back to isVerboseDevMode if window flag is not boolean
        ok 4 - should fall back to isVerboseDevMode if window flag is not boolean
          ---
          duration_ms: 0.633169
          type: 'test'
          ...
        1..4
    ok 1 - isVerboseDiagnosticsEnabled
      ---
      duration_ms: 3.671001
      type: 'suite'
      ...
    # Subtest: logRelayCountFailure
        # Subtest: should log warning for new relay URL
        ok 1 - should log warning for new relay URL
          ---
          duration_ms: 1.237456
          type: 'test'
          ...
        # Subtest: should suppress 'Failed to connect to relay' errors
        ok 2 - should suppress 'Failed to connect to relay' errors
          ---
          duration_ms: 0.282416
          type: 'test'
          ...
        # Subtest: should throttle duplicate warnings for the same relay
        ok 3 - should throttle duplicate warnings for the same relay
          ---
          duration_ms: 0.54082
          type: 'test'
          ...
        # Subtest: should handle empty or non-string relay URLs
        ok 4 - should handle empty or non-string relay URLs
          ---
          duration_ms: 0.478568
          type: 'test'
          ...
        1..4
    ok 2 - logRelayCountFailure
      ---
      duration_ms: 3.099865
      type: 'suite'
      ...
    # Subtest: Other Loggers
        # Subtest: should log timeout cleanup failure once
        ok 1 - should log timeout cleanup failure once
          ---
          duration_ms: 0.559754
          type: 'test'
          ...
        # Subtest: should log rebroadcast failure once
        ok 2 - should log rebroadcast failure once
          ---
          duration_ms: 0.42039
          type: 'test'
          ...
        # Subtest: should log view count failure once
        ok 3 - should log view count failure once
          ---
          duration_ms: 0.378791
          type: 'test'
          ...
        1..3
    ok 3 - Other Loggers
      ---
      duration_ms: 1.605353
      type: 'suite'
      ...
    # Subtest: Verbose Mode Disabled
        # Subtest: should not log even for new keys when disabled
        ok 1 - should not log even for new keys when disabled
          ---
          duration_ms: 0.440194
          type: 'test'
          ...
        # Subtest: should not consume throttle key when disabled
        ok 2 - should not consume throttle key when disabled
          ---
          duration_ms: 0.403964
          type: 'test'
          ...
        1..2
    ok 4 - Verbose Mode Disabled
      ---
      duration_ms: 1.015713
      type: 'suite'
      ...
    1..4
ok 1 - countDiagnostics
  ---
  duration_ms: 15.193927
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
# duration_ms 40.176146

→ Running tests/nostr/decryptionSchemeCache.test.mjs
TAP version 13
# Subtest: decryptionSchemeCache
    # Subtest: stores and retrieves a scheme
    ok 1 - stores and retrieves a scheme
      ---
      duration_ms: 1.94647
      type: 'test'
      ...
    # Subtest: returns null for unknown pubkey
    ok 2 - returns null for unknown pubkey
      ---
      duration_ms: 0.560285
      type: 'test'
      ...
    # Subtest: handles invalid inputs gracefully
    ok 3 - handles invalid inputs gracefully
      ---
      duration_ms: 0.661275
      type: 'test'
      ...
    # Subtest: expires entries after TTL (2 hours)
    ok 4 - expires entries after TTL (2 hours)
      ---
      duration_ms: 0.707574
      type: 'test'
      ...
    # Subtest: does not expire entries before TTL
    ok 5 - does not expire entries before TTL
      ---
      duration_ms: 0.286868
      type: 'test'
      ...
    # Subtest: clears cache
    ok 6 - clears cache
      ---
      duration_ms: 0.264121
      type: 'test'
      ...
    1..6
ok 1 - decryptionSchemeCache
  ---
  duration_ms: 6.286588
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
# duration_ms 24.989339

→ Running tests/nostr/defaultClient.test.mjs
TAP version 13
# Subtest: Default NostrClient
    # Subtest: should be an instance of NostrClient
    ok 1 - should be an instance of NostrClient
      ---
      duration_ms: 1.164796
      type: 'test'
      ...
    # Subtest: should be configured with default relays
    ok 2 - should be configured with default relays
      ---
      duration_ms: 1.054336
      type: 'test'
      ...
    # Subtest: should be initialized with default read relays
    ok 3 - should be initialized with default read relays
      ---
      duration_ms: 0.255184
      type: 'test'
      ...
    # Subtest: should be initialized with default write relays
    ok 4 - should be initialized with default write relays
      ---
      duration_ms: 0.338192
      type: 'test'
      ...
    # Subtest: should be registered as the default client
    ok 5 - should be registered as the default client
      ---
      duration_ms: 0.234646
      type: 'test'
      ...
    1..5
ok 1 - Default NostrClient
  ---
  duration_ms: 4.820393
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
# duration_ms 18.490828

→ Running tests/nostr/dm-direct-message-flow.test.mjs
TAP version 13
# Subtest: DM relay duplication is deduped
ok 1 - DM relay duplication is deduped
  ---
  duration_ms: 159.770673
  type: 'test'
  ...
# Subtest: out-of-order DM delivery keeps newest messages first
ok 2 - out-of-order DM delivery keeps newest messages first
  ---
  duration_ms: 90.685113
  type: 'test'
  ...
# Subtest: DM reconnect replays do not duplicate messages or reset seen state
ok 3 - DM reconnect replays do not duplicate messages or reset seen state
  ---
  duration_ms: 174.932155
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
# duration_ms 435.318472

→ Running tests/nostr/dmDecryptDiagnostics.test.mjs
TAP version 13
# Subtest: dmDecryptDiagnostics
    # Subtest: summarizeDmEventForLog
        # Subtest: should return a default object when event is null or undefined
        ok 1 - should return a default object when event is null or undefined
          ---
          duration_ms: 1.998046
          type: 'test'
          ...
        # Subtest: should return a default object when event is not an object
        ok 2 - should return a default object when event is not an object
          ---
          duration_ms: 0.222678
          type: 'test'
          ...
        # Subtest: should summarize a valid event correctly
        ok 3 - should summarize a valid event correctly
          ---
          duration_ms: 0.301036
          type: 'test'
          ...
        # Subtest: should handle non-finite created_at
        ok 4 - should handle non-finite created_at
          ---
          duration_ms: 0.227386
          type: 'test'
          ...
        # Subtest: should handle non-finite kind
        ok 5 - should handle non-finite kind
          ---
          duration_ms: 0.210722
          type: 'test'
          ...
        # Subtest: should handle missing or invalid content
        ok 6 - should handle missing or invalid content
          ---
          duration_ms: 0.191663
          type: 'test'
          ...
        # Subtest: should handle missing or invalid tags
        ok 7 - should handle missing or invalid tags
          ---
          duration_ms: 0.349815
          type: 'test'
          ...
        1..7
    ok 1 - summarizeDmEventForLog
      ---
      duration_ms: 4.835439
      type: 'suite'
      ...
    # Subtest: sanitizeDecryptError
        # Subtest: should return null when error is null or undefined
        ok 1 - should return null when error is null or undefined
          ---
          duration_ms: 0.493806
          type: 'test'
          ...
        # Subtest: should handle string errors
        ok 2 - should handle string errors
          ---
          duration_ms: 0.377634
          type: 'test'
          ...
        # Subtest: should handle Error objects with standard properties
        ok 3 - should handle Error objects with standard properties
          ---
          duration_ms: 0.359328
          type: 'test'
          ...
        # Subtest: should handle Error objects with missing properties
        ok 4 - should handle Error objects with missing properties
          ---
          duration_ms: 0.214587
          type: 'test'
          ...
        # Subtest: should handle Error objects with non-string properties
        ok 5 - should handle Error objects with non-string properties
          ---
          duration_ms: 0.205023
          type: 'test'
          ...
        1..5
    ok 2 - sanitizeDecryptError
      ---
      duration_ms: 2.119895
      type: 'suite'
      ...
    1..2
ok 1 - dmDecryptDiagnostics
  ---
  duration_ms: 7.825307
  type: 'suite'
  ...
1..1
# tests 12
# suites 3
# pass 12
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 29.795217

→ Running tests/nostr/dmDecryptorPreference.test.mjs
TAP version 13
# Subtest: decryptDM prefers nip44 decryptors when available
ok 1 - decryptDM prefers nip44 decryptors when available
  ---
  duration_ms: 2.796983
  type: 'test'
  ...
# Subtest: decryptDM falls back to nip04 when nip44 fails
ok 2 - decryptDM falls back to nip04 when nip44 fails
  ---
  duration_ms: 0.491805
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
# duration_ms 14.559578

→ Running tests/nostr/dmDecryptWorkerClient.test.mjs
TAP version 13
# Subtest: dmDecryptWorkerClient
    # Subtest: should support worker environment
    ok 1 - should support worker environment
      ---
      duration_ms: 6.693421
      type: 'test'
      ...
    # Subtest: should reject if Worker is unavailable
    ok 2 - should reject if Worker is unavailable
      ---
      duration_ms: 3.178653
      type: 'test'
      ...
    # Subtest: should reject if inputs are invalid
    ok 3 - should reject if inputs are invalid
      ---
      duration_ms: 3.032822
      type: 'test'
      ...
    # Subtest: should successfully decrypt message
    ok 4 - should successfully decrypt message
      ---
      duration_ms: 10.502725
      type: 'test'
      ...
    # Subtest: should handle worker error response
    ok 5 - should handle worker error response
      ---
      duration_ms: 4.574271
      type: 'test'
      ...
    # Subtest: should handle worker error event
    ok 6 - should handle worker error event
      ---
      duration_ms: 5.098219
      type: 'test'
      ...
    # Subtest: should timeout if worker does not respond
    ok 7 - should timeout if worker does not respond
      ---
      duration_ms: 103.337316
      type: 'test'
      ...
    # Subtest: should initialize worker lazily and reuse instance
    ok 8 - should initialize worker lazily and reuse instance
      ---
      duration_ms: 3.135263
      type: 'test'
      ...
    # Subtest: should recreate worker if creation fails
    ok 9 - should recreate worker if creation fails
      ---
      duration_ms: 1.942987
      type: 'test'
      ...
    1..9
ok 1 - dmDecryptWorkerClient
  ---
  duration_ms: 144.772011
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
# duration_ms 155.980107

→ Running tests/nostr/dmSignalEvents.test.mjs
TAP version 13
# Subtest: dmSignalEvents
    # Subtest: publishDmReadReceipt should succeed
    ok 1 - publishDmReadReceipt should succeed
      ---
      duration_ms: 7.27386
      type: 'test'
      ...
    # Subtest: publishDmReadReceipt should fail if session actor
    ok 2 - publishDmReadReceipt should fail if session actor
      ---
      duration_ms: 0.977538
      type: 'test'
      ...
    # Subtest: publishDmTypingIndicator should succeed
    ok 3 - publishDmTypingIndicator should succeed
      ---
      duration_ms: 9.226496
      type: 'test'
      ...
    # Subtest: should fail if no signer
    ok 4 - should fail if no signer
      ---
      duration_ms: 1.572068
      type: 'test'
      ...
    1..4
ok 1 - dmSignalEvents
  ---
  duration_ms: 140.073095
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
# duration_ms 158.289597

→ Running tests/nostr/edit-video-dtag.test.mjs
TAP version 13
# Subtest: editVideo preserves existing d tag
ok 1 - editVideo preserves existing d tag
  ---
  duration_ms: 12.541379
  type: 'test'
  ...
# Subtest: editVideo falls back to base event id when d tag missing
ok 2 - editVideo falls back to base event id when d tag missing
  ---
  duration_ms: 2.561397
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
# duration_ms 26.563062

→ Running tests/nostr/eventsCacheStore.test.mjs
TAP version 13
# Subtest: EventsCacheStore
    # Subtest: persistSnapshot should store events and tombstones
    ok 1 - persistSnapshot should store events and tombstones
      ---
      duration_ms: 19.035083
      type: 'test'
      ...
    # Subtest: persistSnapshot should only update changed items
    ok 2 - persistSnapshot should only update changed items
      ---
      duration_ms: 4.191117
      type: 'test'
      ...
    # Subtest: persistSnapshot should delete removed items
    ok 3 - persistSnapshot should delete removed items
      ---
      duration_ms: 3.423532
      type: 'test'
      ...
    # Subtest: persistSnapshot should respect dirty keys optimization
    ok 4 - persistSnapshot should respect dirty keys optimization
      ---
      duration_ms: 2.883518
      type: 'test'
      ...
    1..4
ok 1 - EventsCacheStore
  ---
  duration_ms: 31.579379
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
# duration_ms 40.976413

→ Running tests/nostr/eventsMap.test.mjs
TAP version 13
# Subtest: EventsMap functionality
    # Subtest: indexes events by author on set
    ok 1 - indexes events by author on set
      ---
      duration_ms: 1.173142
      type: 'test'
      ...
    # Subtest: updates index on delete
    ok 2 - updates index on delete
      ---
      duration_ms: 0.328512
      type: 'test'
      ...
    # Subtest: updates index on overwrite with different object
    ok 3 - updates index on overwrite with different object
      ---
      duration_ms: 0.325039
      type: 'test'
      ...
    # Subtest: clears index on clear
    ok 4 - clears index on clear
      ---
      duration_ms: 0.395254
      type: 'test'
      ...
    # Subtest: normalizes pubkeys
    ok 5 - normalizes pubkeys
      ---
      duration_ms: 0.332539
      type: 'test'
      ...
    # Subtest: handles non-event objects gracefully
    ok 6 - handles non-event objects gracefully
      ---
      duration_ms: 0.26377
      type: 'test'
      ...
    1..6
ok 1 - EventsMap functionality
  ---
  duration_ms: 6.111671
  type: 'test'
  ...
1..1
# tests 7
# suites 0
# pass 7
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 18.907128

→ Running tests/nostr/integration-remote-flow.test.mjs
TAP version 13
# Subtest: nostr login + remote signing + publish + watch history integration
ok 1 - nostr login + remote signing + publish + watch history integration
  ---
  duration_ms: 149.485404
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
# duration_ms 606.408152

→ Running tests/nostr/maxListenerDiagnostics.test.mjs
TAP version 13
# Subtest: maxListenerDiagnostics
    # Subtest: collectCandidateStrings
        # Subtest: should return empty array for null/undefined/falsy
        ok 1 - should return empty array for null/undefined/falsy
          ---
          duration_ms: 2.73873
          type: 'test'
          ...
        # Subtest: should return array with string for string input
        ok 2 - should return array with string for string input
          ---
          duration_ms: 0.622632
          type: 'test'
          ...
        # Subtest: should extract relevant fields from object
        ok 3 - should extract relevant fields from object
          ---
          duration_ms: 0.806965
          type: 'test'
          ...
        # Subtest: should ignore non-string fields in object
        ok 4 - should ignore non-string fields in object
          ---
          duration_ms: 0.795318
          type: 'test'
          ...
        1..4
    ok 1 - collectCandidateStrings
      ---
      duration_ms: 6.250865
      type: 'suite'
      ...
    # Subtest: shouldSuppressWarning
        # Subtest: should NOT suppress anything if verbose mode is enabled
        ok 1 - should NOT suppress anything if verbose mode is enabled
          ---
          duration_ms: 0.983082
          type: 'test'
          ...
        # Subtest: should suppress warning by code string
        ok 2 - should suppress warning by code string
          ---
          duration_ms: 0.357926
          type: 'test'
          ...
        # Subtest: should suppress warning by object code property
        ok 3 - should suppress warning by object code property
          ---
          duration_ms: 0.394946
          type: 'test'
          ...
        # Subtest: should suppress warning by message snippet
        ok 4 - should suppress warning by message snippet
          ---
          duration_ms: 0.535245
          type: 'test'
          ...
        # Subtest: should suppress warning by object message property snippet
        ok 5 - should suppress warning by object message property snippet
          ---
          duration_ms: 0.650556
          type: 'test'
          ...
        # Subtest: should NOT suppress unrelated warnings
        ok 6 - should NOT suppress unrelated warnings
          ---
          duration_ms: 0.440572
          type: 'test'
          ...
        # Subtest: should handle multiple arguments
        ok 7 - should handle multiple arguments
          ---
          duration_ms: 0.462306
          type: 'test'
          ...
        1..7
    ok 2 - shouldSuppressWarning
      ---
      duration_ms: 4.81288
      type: 'suite'
      ...
    # Subtest: process.emitWarning patch
        # Subtest: should have patched process.emitWarning
        ok 1 - should have patched process.emitWarning
          ---
          duration_ms: 0.243557
          type: 'test'
          ...
        1..1
    ok 3 - process.emitWarning patch
      ---
      duration_ms: 0.427177
      type: 'suite'
      ...
    1..3
ok 1 - maxListenerDiagnostics
  ---
  duration_ms: 13.874481
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
# duration_ms 37.825451

→ Running tests/nostr/nip04WorkerClient.test.mjs
TAP version 13
# Subtest: nip04WorkerClient
    # Subtest: should encrypt message successfully via worker
    ok 1 - should encrypt message successfully via worker
      ---
      duration_ms: 9.702536
      type: 'test'
      ...
    # Subtest: should reject when worker returns error
    ok 2 - should reject when worker returns error
      ---
      duration_ms: 4.78399
      type: 'test'
      ...
    # Subtest: should reject when worker emits error event
    ok 3 - should reject when worker emits error event
      ---
      duration_ms: 3.030157
      type: 'test'
      ...
    # Subtest: should timeout if worker does not respond
    ok 4 - should timeout if worker does not respond
      ---
      duration_ms: 102.871415
      type: 'test'
      ...
    # Subtest: should reject immediately if inputs are missing
    ok 5 - should reject immediately if inputs are missing
      ---
      duration_ms: 3.688938
      type: 'test'
      ...
    # Subtest: should reject if Worker API is unavailable
    ok 6 - should reject if Worker API is unavailable
      ---
      duration_ms: 2.259647
      type: 'test'
      ...
    # Subtest: should handle worker creation failure
    ok 7 - should handle worker creation failure
      ---
      duration_ms: 2.101277
      type: 'test'
      ...
    1..7
ok 1 - nip04WorkerClient
  ---
  duration_ms: 131.297645
  type: 'suite'
  ...
1..1
# tests 7
# suites 1
# pass 7
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 143.575724

→ Running tests/nostr/nip07Adapter-race-condition.test.mjs
TAP version 13
# Subtest: Nip07Adapter Race Condition
    # Subtest: should detect capabilities dynamically even if injected late
    ok 1 - should detect capabilities dynamically even if injected late
      ---
      duration_ms: 2.702328
      type: 'test'
      ...
    # Subtest: should call the injected method even if added late
    ok 2 - should call the injected method even if added late
      ---
      duration_ms: 2.298618
      type: 'test'
      ...
    1..2
ok 1 - Nip07Adapter Race Condition
  ---
  duration_ms: 6.665859
  type: 'suite'
  ...
1..1
# tests 2
# suites 1
# pass 2
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 20.001227

→ Running tests/nostr/nip07Permissions.test.js
TAP version 13
# Subtest: writeStoredNip07Permissions normalizes and persists granted methods
ok 1 - writeStoredNip07Permissions normalizes and persists granted methods
  ---
  duration_ms: 2.349504
  type: 'test'
  ...
# Subtest: clearStoredNip07Permissions removes persisted grants
ok 2 - clearStoredNip07Permissions removes persisted grants
  ---
  duration_ms: 0.284731
  type: 'test'
  ...
# Subtest: requestEnablePermissions retries explicit and fallback variants
ok 3 - requestEnablePermissions retries explicit and fallback variants
  ---
  duration_ms: 1.851272
  type: 'test'
  ...
# Subtest: requestEnablePermissions reports unavailable extension
ok 4 - requestEnablePermissions reports unavailable extension
  ---
  duration_ms: 0.232295
  type: 'test'
  ...
# Subtest: waitForNip07Extension resolves when extension is present
ok 5 - waitForNip07Extension resolves when extension is present
  ---
  duration_ms: 0.5263
  type: 'test'
  ...
# Subtest: waitForNip07Extension resolves when extension appears later
ok 6 - waitForNip07Extension resolves when extension appears later
  ---
  duration_ms: 50.253331
  type: 'test'
  ...
# Subtest: waitForNip07Extension rejects when extension never appears
ok 7 - waitForNip07Extension rejects when extension never appears
  ---
  duration_ms: 150.86255
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
# duration_ms 214.392137

→ Running tests/nostr/nip46Client.test.js
TAP version 13
# Subtest: Nip46RpcClient encrypts payloads with nip44 conversation keys
ok 1 - Nip46RpcClient encrypts payloads with nip44 conversation keys
  ---
  duration_ms: 168.264552
  type: 'test'
  ...
# Subtest: decryptNip46PayloadWithKeys handles nip44.v2 ciphertext
ok 2 - decryptNip46PayloadWithKeys handles nip44.v2 ciphertext
  ---
  duration_ms: 26.769883
  type: 'test'
  ...
# Subtest: decryptNip46PayloadWithKeys coerces structured handshake payloads
ok 3 - decryptNip46PayloadWithKeys coerces structured handshake payloads
  ---
  duration_ms: 24.176477
  type: 'test'
  ...
# Subtest: decryptNip46PayloadWithKeys decodes buffer-based handshake payloads
ok 4 - decryptNip46PayloadWithKeys decodes buffer-based handshake payloads
  ---
  duration_ms: 22.603341
  type: 'test'
  ...
# Subtest: decryptNip46PayloadWithKeys supports nip04-style ciphertext wrappers
ok 5 - decryptNip46PayloadWithKeys supports nip04-style ciphertext wrappers
  ---
  duration_ms: 30.755873
  type: 'test'
  ...
# Subtest: parseNip46ConnectionString handles remote signer key hints
ok 6 - parseNip46ConnectionString handles remote signer key hints
  ---
  duration_ms: 6.954373
  type: 'test'
  ...
# Subtest: attemptDecryptNip46HandshakePayload falls back to expected remote signer key
ok 7 - attemptDecryptNip46HandshakePayload falls back to expected remote signer key
  ---
  duration_ms: 44.011161
  type: 'test'
  ...
# Subtest: attemptDecryptNip46HandshakePayload handles array-encoded nip04 payloads
ok 8 - attemptDecryptNip46HandshakePayload handles array-encoded nip04 payloads
  ---
  duration_ms: 29.179004
  type: 'test'
  ...
# Subtest: Nip46RpcClient sendRpc publishes events and resolves responses
ok 9 - Nip46RpcClient sendRpc publishes events and resolves responses
  ---
  duration_ms: 15.468849
  type: 'test'
  ...
1..9
# tests 9
# suites 0
# pass 9
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 378.427089

→ Running tests/nostr/nip46Connector.test.mjs
TAP version 13
# Subtest: Nip46Connector
    # Subtest: createKeyPair
        # Subtest: should generate a new key pair if none provided
        ok 1 - should generate a new key pair if none provided
          ---
          duration_ms: 2.857678
          type: 'test'
          ...
        # Subtest: should use existing keys if provided
        ok 2 - should use existing keys if provided
          ---
          duration_ms: 0.532891
          type: 'test'
          ...
        1..2
    ok 1 - createKeyPair
      ---
      duration_ms: 4.625889
      type: 'suite'
      ...
    # Subtest: prepareHandshake
        # Subtest: should parse connection string and return details
        ok 1 - should parse connection string and return details
          ---
          duration_ms: 1.23099
          type: 'test'
          ...
        1..1
    ok 2 - prepareHandshake
      ---
      duration_ms: 1.591094
      type: 'suite'
      ...
    # Subtest: connect
        # Subtest: should connect directly if remote pubkey is known
        ok 1 - should connect directly if remote pubkey is known
          ---
          duration_ms: 2.485021
          type: 'test'
          ...
        1..1
    ok 3 - connect
      ---
      duration_ms: 2.739701
      type: 'suite'
      ...
    # Subtest: reconnectStored
        # Subtest: should throw if no stored session
        ok 1 - should throw if no stored session
          ---
          duration_ms: 1.507132
          type: 'test'
          ...
        # Subtest: should reconnect using stored session
        ok 2 - should reconnect using stored session
          ---
          duration_ms: 0.790239
          type: 'test'
          ...
        1..2
    ok 4 - reconnectStored
      ---
      duration_ms: 2.628516
      type: 'suite'
      ...
    # Subtest: disconnect
        # Subtest: should clear stored session and emit change
        ok 1 - should clear stored session and emit change
          ---
          duration_ms: 0.544683
          type: 'test'
          ...
        1..1
    ok 5 - disconnect
      ---
      duration_ms: 0.69419
      type: 'suite'
      ...
    1..5
ok 1 - Nip46Connector
  ---
  duration_ms: 13.363877
  type: 'suite'
  ...
1..1
# tests 7
# suites 6
# pass 7
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 36.169765

→ Running tests/nostr/nip71.test.js
TAP version 13
# Subtest: buildNip71MetadataTags normalizes structured fields
ok 1 - buildNip71MetadataTags normalizes structured fields
  ---
  duration_ms: 3.434565
  type: 'test'
  ...
# Subtest: collectNip71PointerRequests aggregates events and tags
ok 2 - collectNip71PointerRequests aggregates events and tags
  ---
  duration_ms: 0.647728
  type: 'test'
  ...
# Subtest: processNip71Events reconciles pointers and filters video hashtags
ok 3 - processNip71Events reconciles pointers and filters video hashtags
  ---
  duration_ms: 1.488375
  type: 'test'
  ...
# Subtest: populateNip71MetadataForVideos fetches missing records once
ok 4 - populateNip71MetadataForVideos fetches missing records once
  ---
  duration_ms: 0.850946
  type: 'test'
  ...
# Subtest: buildNip71VideoEvent composes pointer tags
ok 5 - buildNip71VideoEvent composes pointer tags
  ---
  duration_ms: 0.691755
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
# duration_ms 22.306636

→ Running tests/nostr/nostrClientFacade.test.js
TAP version 13
# Subtest: nostrClientFacade forwards the default client instance
ok 1 - nostrClientFacade forwards the default client instance
  ---
  duration_ms: 1.598959
  type: 'test'
  ...
# Subtest: nostrClientFacade forwards the default permission helper
ok 2 - nostrClientFacade forwards the default permission helper
  ---
  duration_ms: 0.316587
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
# duration_ms 14.842297

→ Running tests/nostr/nostrClientRegistry.test.mjs
TAP version 13
# Subtest: registerSigner stores and resolves signer entries
ok 1 - registerSigner stores and resolves signer entries
  ---
  duration_ms: 1.394203
  type: 'test'
  ...
# Subtest: setActiveSigner notifies listeners and resolves by pubkey
ok 2 - setActiveSigner notifies listeners and resolves by pubkey
  ---
  duration_ms: 1.696642
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
# duration_ms 14.669621

→ Running tests/nostr/publishHelpers.test.mjs
TAP version 13
# Subtest: mirrorVideoEvent lowercases provided MIME types
ok 1 - mirrorVideoEvent lowercases provided MIME types
  ---
  duration_ms: 4.401337
  type: 'test'
  ...
# Subtest: mirrorVideoEvent lowercases inferred MIME types
ok 2 - mirrorVideoEvent lowercases inferred MIME types
  ---
  duration_ms: 0.80558
  type: 'test'
  ...
# Subtest: mirrorVideoEvent includes hash tags when provided
ok 3 - mirrorVideoEvent includes hash tags when provided
  ---
  duration_ms: 1.656668
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
# duration_ms 19.006775

→ Running tests/nostr/reaction-events.test.mjs
TAP version 13
# Subtest: publishVideoReaction includes both address and event tags when reacting to addressable content
ok 1 - publishVideoReaction includes both address and event tags when reacting to addressable content
  ---
  duration_ms: 5.699156
  type: 'test'
  ...
# Subtest: publishVideoReaction aborts when address pointer is missing a resolvable event id
ok 2 - publishVideoReaction aborts when address pointer is missing a resolvable event id
  ---
  duration_ms: 0.492252
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
# duration_ms 17.613879

→ Running tests/nostr/revert-video-dtag.test.mjs
TAP version 13
# Subtest: revertVideo preserves existing d tag
ok 1 - revertVideo preserves existing d tag
  ---
  duration_ms: 7.206597
  type: 'test'
  ...
# Subtest: revertVideo falls back to original event id when d tag missing
ok 2 - revertVideo falls back to original event id when d tag missing
  ---
  duration_ms: 1.459793
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
# duration_ms 19.970851

→ Running tests/nostr/session-actor.test.mjs
TAP version 13
# Subtest: SessionActor
    # Subtest: encrypts and decrypts private key
    ok 1 - encrypts and decrypts private key
      ---
      duration_ms: 299.097109
      type: 'test'
      ...
    # Subtest: fails to decrypt with wrong passphrase
    ok 2 - fails to decrypt with wrong passphrase
      ---
      duration_ms: 293.731052
      type: 'test'
      ...
    # Subtest: persists and reads session actor
    ok 3 - persists and reads session actor
      ---
      duration_ms: 1.526717
      type: 'test'
      ...
    # Subtest: clears stored session actor
    ok 4 - clears stored session actor
      ---
      duration_ms: 0.308116
      type: 'test'
      ...
    1..4
ok 1 - SessionActor
  ---
  duration_ms: 596.774391
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
# duration_ms 610.11532

→ Running tests/nostr/sessionActor.test.js
TAP version 13
# Subtest: encryptSessionPrivateKey + decryptSessionPrivateKey roundtrip
ok 1 - encryptSessionPrivateKey + decryptSessionPrivateKey roundtrip
  ---
  duration_ms: 298.577103
  type: 'test'
  ...
# Subtest: persistSessionActor stores encrypted payload metadata
ok 2 - persistSessionActor stores encrypted payload metadata
  ---
  duration_ms: 147.196112
  type: 'test'
  ...
# Subtest: clearStoredSessionActor removes persisted payload
ok 3 - clearStoredSessionActor removes persisted payload
  ---
  duration_ms: 145.040834
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
# duration_ms 599.426977

→ Running tests/nostr/sessionActor.test.mjs
TAP version 13
# Subtest: js/nostr/sessionActor.js
    # Subtest: Encryption and Decryption Roundtrip
    ok 1 - Encryption and Decryption Roundtrip
      ---
      duration_ms: 318.587299
      type: 'test'
      ...
    # Subtest: Decryption fails with wrong passphrase
    ok 2 - Decryption fails with wrong passphrase
      ---
      duration_ms: 419.56845
      type: 'test'
      ...
    # Subtest: Persistence and Retrieval
    ok 3 - Persistence and Retrieval
      ---
      duration_ms: 421.776979
      type: 'test'
      ...
    # Subtest: Clear Stored Session Actor
    ok 4 - Clear Stored Session Actor
      ---
      duration_ms: 1.670614
      type: 'test'
      ...
    1..4
ok 1 - js/nostr/sessionActor.js
  ---
  duration_ms: 1166.114394
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
# duration_ms 1176.916025

→ Running tests/nostr/sign-request-queue.test.mjs
TAP version 13
# Subtest: queueSignEvent: processes requests sequentially
ok 1 - queueSignEvent: processes requests sequentially
  ---
  duration_ms: 105.703814
  type: 'test'
  ...
# Subtest: queueSignEvent: handles timeouts
ok 2 - queueSignEvent: handles timeouts
  ---
  duration_ms: 22.818541
  type: 'test'
  ...
# Subtest: queueSignEvent: handles permission denied errors
ok 3 - queueSignEvent: handles permission denied errors
  ---
  duration_ms: 1.089909
  type: 'test'
  ...
# Subtest: queueSignEvent: handles signer disconnected
ok 4 - queueSignEvent: handles signer disconnected
  ---
  duration_ms: 0.878553
  type: 'test'
  ...
# Subtest: queueSignEvent: fails if signer is missing or invalid
ok 5 - queueSignEvent: fails if signer is missing or invalid
  ---
  duration_ms: 0.82637
  type: 'test'
  ...
# Subtest: queueSignEvent: continues queue processing after failure
ok 6 - queueSignEvent: continues queue processing after failure
  ---
  duration_ms: 1.400322
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
# duration_ms 220.460369

→ Running tests/nostr/signers.test.mjs
TAP version 13
# Subtest: setActiveSigner hydrates extension capabilities from window.nostr
ok 1 - setActiveSigner hydrates extension capabilities from window.nostr
  ---
  duration_ms: 1.99867
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
# duration_ms 18.197142

→ Running tests/nostr/syncMetadataStore.test.mjs
TAP version 13
# Subtest: SyncMetadataStore
    # Subtest: should load from localStorage on initialization
    ok 1 - should load from localStorage on initialization
      ---
      duration_ms: 3.172258
      type: 'test'
      ...
    # Subtest: should update last seen and save to localStorage
    ok 2 - should update last seen and save to localStorage
      ---
      duration_ms: 1.185444
      type: 'test'
      ...
    # Subtest: should only update if timestamp is newer
    ok 3 - should only update if timestamp is newer
      ---
      duration_ms: 1.477946
      type: 'test'
      ...
    # Subtest: should get per-relay last seen
    ok 4 - should get per-relay last seen
      ---
      duration_ms: 2.8482
      type: 'test'
      ...
    # Subtest: should handle missing localStorage gracefully
    ok 5 - should handle missing localStorage gracefully
      ---
      duration_ms: 0.57677
      type: 'test'
      ...
    1..5
ok 1 - SyncMetadataStore
  ---
  duration_ms: 12.547052
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
# duration_ms 40.12461

→ Running tests/nostr/toolkit.test.mjs
TAP version 13
# Subtest: toolkit: DEFAULT_RELAY_URLS is frozen and contains valid URLs
ok 1 - toolkit: DEFAULT_RELAY_URLS is frozen and contains valid URLs
  ---
  duration_ms: 2.121157
  type: 'test'
  ...
# Subtest: toolkit: resolveSimplePoolConstructor finds SimplePool
ok 2 - toolkit: resolveSimplePoolConstructor finds SimplePool
  ---
  duration_ms: 0.726462
  type: 'test'
  ...
# Subtest: toolkit: shimLegacySimplePoolMethods adds sub/list/map if missing
ok 3 - toolkit: shimLegacySimplePoolMethods adds sub/list/map if missing
  ---
  duration_ms: 1.164421
  type: 'test'
  ...
# Subtest: toolkit: readToolkitFromScope finds NostrTools in global scope
ok 4 - toolkit: readToolkitFromScope finds NostrTools in global scope
  ---
  duration_ms: 0.640403
  type: 'test'
  ...
# Subtest: toolkit: normalizeToolkitCandidate validation
ok 5 - toolkit: normalizeToolkitCandidate validation
  ---
  duration_ms: 1.075157
  type: 'test'
  ...
# Subtest: toolkit: shimLegacySimplePoolMethods handles simple list operation
ok 6 - toolkit: shimLegacySimplePoolMethods handles simple list operation
  ---
  duration_ms: 16.681433
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
# duration_ms 36.387626

→ Running tests/nostr/videoEventBuffer.test.mjs
TAP version 13
# Subtest: VideoEventBuffer
    # Subtest: Push and Flush
    ok 1 - Push and Flush
      ---
      duration_ms: 6.066666
      type: 'test'
      ...
    # Subtest: Latest Wins
    ok 2 - Latest Wins
      ---
      duration_ms: 1.338753
      type: 'test'
      ...
    # Subtest: Tombstone Handling
    ok 3 - Tombstone Handling
      ---
      duration_ms: 1.63396
      type: 'test'
      ...
    # Subtest: Cleanup
    ok 4 - Cleanup
      ---
      duration_ms: 1.269065
      type: 'test'
      ...
    # Subtest: Visibility Gating
    ok 5 - Visibility Gating
      ---
      duration_ms: 2.269454
      type: 'test'
      ...
    1..5
ok 1 - VideoEventBuffer
  ---
  duration_ms: 16.789148
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
# duration_ms 47.523453

→ Running tests/nostr/videoPayloadBuilder.test.mjs
TAP version 13
# Subtest: videoPayloadBuilder
    # Subtest: extractVideoPublishPayload
        # Subtest: extracts videoData and nip71Metadata
        ok 1 - extracts videoData and nip71Metadata
          ---
          duration_ms: 1.965858
          type: 'test'
          ...
        # Subtest: handles legacyFormData structure
        ok 2 - handles legacyFormData structure
          ---
          duration_ms: 0.226384
          type: 'test'
          ...
        # Subtest: normalizes boolean flags
        ok 3 - normalizes boolean flags
          ---
          duration_ms: 0.238388
          type: 'test'
          ...
        # Subtest: normalizes boolean flags (kids only)
        ok 4 - normalizes boolean flags (kids only)
          ---
          duration_ms: 0.279034
          type: 'test'
          ...
        1..4
    ok 1 - extractVideoPublishPayload
      ---
      duration_ms: 3.986097
      type: 'suite'
      ...
    # Subtest: prepareVideoPublishPayload
        # Subtest: throws if pubkey is missing
        ok 1 - throws if pubkey is missing
          ---
          duration_ms: 1.300549
          type: 'test'
          ...
        # Subtest: generates a valid event structure
        ok 2 - generates a valid event structure
          ---
          duration_ms: 2.757616
          type: 'test'
          ...
        # Subtest: generates unique d tag and videoRootId if not provided
        ok 3 - generates unique d tag and videoRootId if not provided
          ---
          duration_ms: 0.476831
          type: 'test'
          ...
        # Subtest: uses provided seriesIdentifier as d tag
        ok 4 - uses provided seriesIdentifier as d tag
          ---
          duration_ms: 0.630023
          type: 'test'
          ...
        # Subtest: resolves infoHash from magnet
        ok 5 - resolves infoHash from magnet
          ---
          duration_ms: 0.634775
          type: 'test'
          ...
        # Subtest: includes NIP-71 tags
        ok 6 - includes NIP-71 tags
          ---
          duration_ms: 0.88748
          type: 'test'
          ...
        1..6
    ok 2 - prepareVideoPublishPayload
      ---
      duration_ms: 7.38372
      type: 'suite'
      ...
    1..2
ok 1 - videoPayloadBuilder
  ---
  duration_ms: 12.254549
  type: 'suite'
  ...
1..1
# tests 10
# suites 3
# pass 10
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 29.429367

→ Running tests/nostr/watchHistory.test.js
[bitvid] [ProfileCache] Expired watchHistory for 2222222222222222222222222222222222222222222222222222222222222222
TAP version 13
# Subtest: buildWatchHistoryPayload enforces byte limits and records skipped entries
ok 1 - buildWatchHistoryPayload enforces byte limits and records skipped entries
  ---
  duration_ms: 3.276481
  type: 'test'
  ...
# Subtest: getWatchHistoryStorage prunes entries that exceed the configured TTL
ok 2 - getWatchHistoryStorage prunes entries that exceed the configured TTL
  ---
  duration_ms: 2.689975
  type: 'test'
  ...
# Subtest: fetchWatchHistory prefers decrypted chunk payloads when nip04 decrypt succeeds
ok 3 - fetchWatchHistory prefers decrypted chunk payloads when nip04 decrypt succeeds
  ---
  duration_ms: 10.400797
  type: 'test'
  ...
# Subtest: fetchWatchHistory falls back to pointer payload when nip04 decrypt fails
ok 4 - fetchWatchHistory falls back to pointer payload when nip04 decrypt fails
  ---
  duration_ms: 2.826808
  type: 'test'
  ...
# Subtest: publishWatchHistorySnapshot uses injected nostr-tools helpers when signer cannot encrypt
ok 5 - publishWatchHistorySnapshot uses injected nostr-tools helpers when signer cannot encrypt
  ---
  duration_ms: 5.261624
  type: 'test'
  ...
# Subtest: publishWatchHistorySnapshot caches successful snapshot results
ok 6 - publishWatchHistorySnapshot caches successful snapshot results
  ---
  duration_ms: 4.385171
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
# duration_ms 37.335402

→ Running tests/nostr/watchHistoryBindings.test.js
TAP version 13
# Subtest: updateWatchHistoryList delegates to the client's manager
ok 1 - updateWatchHistoryList delegates to the client's manager
  ---
  duration_ms: 2.393837
  type: 'test'
  ...
# Subtest: removeWatchHistoryItem delegates to the client's manager
ok 2 - removeWatchHistoryItem delegates to the client's manager
  ---
  duration_ms: 0.492773
  type: 'test'
  ...
# Subtest: watch history bindings throw when the manager is unavailable
ok 3 - watch history bindings throw when the manager is unavailable
  ---
  duration_ms: 0.851572
  type: 'test'
  ...
# Subtest: watch history bindings throw when a required method is missing
ok 4 - watch history bindings throw when a required method is missing
  ---
  duration_ms: 0.401413
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
# duration_ms 18.165642

→ Running tests/nwc-settings-service.test.mjs
TAP version 13
# Subtest: nwc settings service preserves settings across profile switches
ok 1 - nwc settings service preserves settings across profile switches
  ---
  duration_ms: 2.015748
  type: 'test'
  ...
# Subtest: updateActiveNwcSettings returns cloned values
ok 2 - updateActiveNwcSettings returns cloned values
  ---
  duration_ms: 0.491147
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
# duration_ms 13.755124

→ Running tests/performance/resolvePostedAt.test.mjs
pool.list calls: 2
pool.get calls: 0
TAP version 13
# Subtest: hydrateVideoHistoryBatch optimizes network calls
ok 1 - hydrateVideoHistoryBatch optimizes network calls
  ---
  duration_ms: 4.955241
  type: 'test'
  ...
# Subtest: resolveVideoPostedAtBatch uses batch hydration
ok 2 - resolveVideoPostedAtBatch uses batch hydration
  ---
  duration_ms: 0.764656
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
# duration_ms 17.721441

→ Running tests/position-floating-panel.test.mjs
TAP version 13
# Subtest: flips placement when bottom placement would collide with viewport
ok 1 - flips placement when bottom placement would collide with viewport
  ---
  duration_ms: 417.34391
  type: 'test'
  ...
# Subtest: closes previously open popovers without restoring focus
ok 2 - closes previously open popovers without restoring focus
  ---
  duration_ms: 78.816839
  type: 'test'
  ...
# Subtest: restores focus to the trigger when closed
ok 3 - restores focus to the trigger when closed
  ---
  duration_ms: 42.677474
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
# duration_ms 558.061653

→ Running tests/profile-cache.test.mjs
TAP version 13
# Subtest: ProfileCache: setActiveProfile and getActiveProfile
ok 1 - ProfileCache: setActiveProfile and getActiveProfile
  ---
  duration_ms: 2.055738
  type: 'test'
  ...
# Subtest: ProfileCache: resolveAddressKey
ok 2 - ProfileCache: resolveAddressKey
  ---
  duration_ms: 0.592154
  type: 'test'
  ...
# Subtest: ProfileCache: set and get (memory and persistence)
ok 3 - ProfileCache: set and get (memory and persistence)
  ---
  duration_ms: 22.317169
  type: 'test'
  ...
[bitvid] [ProfileCache] Expired watchHistory for eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee
# Subtest: ProfileCache: setProfile normalization and storage
ok 4 - ProfileCache: setProfile normalization and storage
  ---
  duration_ms: 22.0999
  type: 'test'
  ...
# Subtest: ProfileCache: TTL expiration
ok 5 - ProfileCache: TTL expiration
  ---
  duration_ms: 1.841569
  type: 'test'
  ...
# Subtest: ProfileCache: clearMemoryCache and clearSignerRuntime
ok 6 - ProfileCache: clearMemoryCache and clearSignerRuntime
  ---
  duration_ms: 0.754851
  type: 'test'
  ...
# Subtest: ProfileCache: listeners
ok 7 - ProfileCache: listeners
  ---
  duration_ms: 0.579979
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
# duration_ms 61.453845

→ Running tests/profile-modal-controller.test.mjs
TAP version 13
# Subtest: Profile modal Escape closes and restores trigger focus
ok 1 - Profile modal Escape closes and restores trigger focus
  ---
  duration_ms: 4137.022384
  type: 'test'
  ...
# Subtest: Add profile request suspends focus trap and elevates login modal
ok 2 - Add profile request suspends focus trap and elevates login modal
  ---
  duration_ms: 4052.47981
  type: 'test'
  ...
# Subtest: Profile modal navigation buttons toggle active state
ok 3 - Profile modal navigation buttons toggle active state
  ---
  duration_ms: 4833.17827
  type: 'test'
  ...
# Subtest: Profile modal toggles mobile menu and pane views
ok 4 - Profile modal toggles mobile menu and pane views
  ---
  duration_ms: 4579.886772
  type: 'test'
  ...
# Subtest: wallet URI input masks persisted values and restores on focus
ok 5 - wallet URI input masks persisted values and restores on focus
  ---
  duration_ms: 3120.712309
  type: 'test'
  ...
# Subtest: Profile modal uses abbreviated npub display
ok 6 - Profile modal uses abbreviated npub display
  ---
  duration_ms: 2396.008103
  type: 'test'
  ...
# Subtest: renderSavedProfiles applies provider metadata
ok 7 - renderSavedProfiles applies provider metadata
  ---
  duration_ms: 3493.269893
  type: 'test'
  ...
# Subtest: Hashtag pane shows empty states by default
ok 8 - Hashtag pane shows empty states by default
  ---
  duration_ms: 3060.965667
  type: 'test'
  ...
# Subtest: Hashtag pane adds, moves, and removes tags
ok 9 - Hashtag pane adds, moves, and removes tags
  ---
  duration_ms: 3037.358296
  type: 'test'
  ...
# Subtest: handleAddHashtagPreference publishes updates
ok 10 - handleAddHashtagPreference publishes updates
  ---
  duration_ms: 3084.900419
  type: 'test'
  ...
# Subtest: Hashtag pane resets after logout when service clears tags
ok 11 - Hashtag pane resets after logout when service clears tags
  ---
  duration_ms: 3833.358708
  type: 'test'
  ...
# Subtest: load() injects markup and caches expected elements
ok 12 - load() injects markup and caches expected elements
  ---
  duration_ms: 1554.501689
  type: 'test'
  ...
# Subtest: show()/hide() toggle panes, trap focus, and refresh the wallet pane
ok 13 - show()/hide() toggle panes, trap focus, and refresh the wallet pane
  ---
  duration_ms: 3197.49695
  type: 'test'
  ...
# Subtest: populateProfileRelays renders entries and wires action buttons
ok 14 - populateProfileRelays renders entries and wires action buttons
  ---
  duration_ms: 1666.375143
  type: 'test'
  ...
# Subtest: admin mutations invoke accessControl stubs and update admin DOM
ok 15 - admin mutations invoke accessControl stubs and update admin DOM
  ---
  duration_ms: 1614.715366
  type: 'test'
  ...
# Subtest: history pane lazily initializes the watch history renderer
ok 16 - history pane lazily initializes the watch history renderer
  ---
  duration_ms: 4741.829651
  type: 'test'
  ...
# Subtest: handleDirectMessagesRelayWarning throttles status updates
ok 17 - handleDirectMessagesRelayWarning throttles status updates
  ---
  duration_ms: 1596.846567
  type: 'test'
  ...
# Subtest: handleDirectMessagesRelayWarning suppresses status updates when disabled
ok 18 - handleDirectMessagesRelayWarning suppresses status updates when disabled
  ---
  duration_ms: 1531.856131
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
# duration_ms 55631.174345

→ Running tests/race/nostr-client-init-race.test.mjs
TAP version 13
[bitvid] [nostr] No relays connected during init. Retrying in the background.
# Subtest: NostrClient initialization race condition: concurrent init() calls
ok 1 - NostrClient initialization race condition: concurrent init() calls
  ---
  duration_ms: 55.29666
  type: 'test'
  ...
[bitvid] [nostr] Relay backoff applied. {
  relay: 'wss://relay.damus.io',
  backoffMs: 1000,
  failureCount: 1,
  retryAt: 1771267125096,
  reason: 'connect-timeout'
}
[bitvid] [nostr] Relay backoff applied. {
  relay: 'wss://nos.lol',
  backoffMs: 1000,
  failureCount: 1,
  retryAt: 1771267125097,
  reason: 'connect-timeout'
}
[bitvid] [nostr] Relay backoff applied. {
  relay: 'wss://relay.snort.social',
  backoffMs: 1000,
  failureCount: 1,
  retryAt: 1771267125097,
  reason: 'connect-timeout'
}
[bitvid] [nostr] Relay backoff applied. {
  relay: 'wss://relay.primal.net',
  backoffMs: 1000,
  failureCount: 1,
  retryAt: 1771267125097,
  reason: 'connect-timeout'
}
[bitvid] [nostr] Relay backoff expired.
[bitvid] [nostr] Relay backoff expired.
[bitvid] [nostr] Relay backoff expired.
[bitvid] [nostr] Relay backoff expired.
[bitvid] [nostr] Relay backoff expired.
[bitvid] [nostr] Relay backoff expired.
[bitvid] [nostr] Relay backoff expired.
[bitvid] [nostr] Relay backoff expired.
[bitvid] [nostr] Relay backoff applied. {
  relay: 'wss://relay.damus.io',
  backoffMs: 1000,
  failureCount: 1,
  retryAt: 1771267168144,
  reason: 'connect-timeout'
}
[bitvid] [nostr] Relay backoff applied. {
  relay: 'wss://nos.lol',
  backoffMs: 1000,
  failureCount: 1,
  retryAt: 1771267168145,
  reason: 'connect-timeout'
}
[bitvid] [nostr] Relay backoff applied. {
  relay: 'wss://relay.snort.social',
  backoffMs: 1000,
  failureCount: 1,
  retryAt: 1771267168145,
  reason: 'connect-timeout'
}
[bitvid] [nostr] Relay backoff applied. {
  relay: 'wss://relay.primal.net',
  backoffMs: 1000,
  failureCount: 1,
  retryAt: 1771267168145,
  reason: 'connect-timeout'
}
[bitvid] [nostr] Relay backoff expired.
[bitvid] [nostr] Relay backoff expired.
[bitvid] [nostr] Relay backoff expired.
[bitvid] [nostr] Relay backoff expired.
[bitvid] [nostr] Relay backoff applied. {
  relay: 'wss://relay.damus.io',
  backoffMs: 1000,
  failureCount: 1,
  retryAt: 1771267205185,
  reason: 'connect-timeout'
}
[bitvid] [nostr] Relay backoff applied. {
  relay: 'wss://nos.lol',
  backoffMs: 1000,
  failureCount: 1,
  retryAt: 1771267205185,
  reason: 'connect-timeout'
}
[bitvid] [nostr] Relay backoff applied. {
  relay: 'wss://relay.snort.social',
  backoffMs: 1000,
  failureCount: 1,
  retryAt: 1771267205185,
  reason: 'connect-timeout'
}
[bitvid] [nostr] Relay backoff applied. {
  relay: 'wss://relay.primal.net',
  backoffMs: 1000,
  failureCount: 1,
  retryAt: 1771267205185,
  reason: 'connect-timeout'
}
1..1
# tests 1
# suites 0
# pass 1
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 87158.224883

→ Running tests/reaction-event-builder.test.mjs
TAP version 13
# Subtest: buildReactionEvent includes pointer and author tags when pubkey provided
ok 1 - buildReactionEvent includes pointer and author tags when pubkey provided
  ---
  duration_ms: 3.116026
  type: 'test'
  ...
# Subtest: buildReactionEvent merges address and event pointers for addressable targets
ok 2 - buildReactionEvent merges address and event pointers for addressable targets
  ---
  duration_ms: 0.698897
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
# duration_ms 15.786393

→ Running tests/revert-modal-controller.test.mjs
TAP version 13
# Subtest: RevertModalController
    # Subtest: open() fetches history and opens modal
    ok 1 - open() fetches history and opens modal
      ---
      duration_ms: 1.522994
      type: 'test'
      ...
    # Subtest: open() shows error if not logged in
    ok 2 - open() shows error if not logged in
      ---
      duration_ms: 0.509598
      type: 'test'
      ...
    # Subtest: handleConfirm() calls revertVideo and refreshes
    ok 3 - handleConfirm() calls revertVideo and refreshes
      ---
      duration_ms: 0.481514
      type: 'test'
      ...
    1..3
ok 1 - RevertModalController
  ---
  duration_ms: 4.238912
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
# duration_ms 17.502212

→ Running tests/safe-decode.test.mjs
TAP version 13
# Subtest: safeDecodeURIComponent returns original value on malformed sequences
ok 1 - safeDecodeURIComponent returns original value on malformed sequences
  ---
  duration_ms: 1.275064
  type: 'test'
  ...
# Subtest: safeDecode helpers handle double-encoded values when applied repeatedly
ok 2 - safeDecode helpers handle double-encoded values when applied repeatedly
  ---
  duration_ms: 0.264915
  type: 'test'
  ...
# Subtest: safeDecodeURIComponentLoose trims inputs by default
ok 3 - safeDecodeURIComponentLoose trims inputs by default
  ---
  duration_ms: 0.198417
  type: 'test'
  ...
# Subtest: safeDecodeURIComponentLoose preserves whitespace when trim is false
ok 4 - safeDecodeURIComponentLoose preserves whitespace when trim is false
  ---
  duration_ms: 0.237584
  type: 'test'
  ...
# Subtest: safeDecodeURIComponent handles empty strings consistently
ok 5 - safeDecodeURIComponent handles empty strings consistently
  ---
  duration_ms: 0.273398
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
# duration_ms 15.842583

→ Running tests/services/attachmentService.test.mjs
TAP version 13
# Subtest: attachmentService
    # Subtest: prepareAttachmentUpload
        # Subtest: should prepare upload without encryption
        ok 1 - should prepare upload without encryption
          ---
          duration_ms: 3.295369
          type: 'test'
          ...
        # Subtest: should prepare upload with encryption
        ok 2 - should prepare upload with encryption
          ---
          duration_ms: 10.268919
          type: 'test'
          ...
        1..2
    ok 1 - prepareAttachmentUpload
      ---
      duration_ms: 14.418634
      type: 'suite'
      ...
    # Subtest: downloadAttachment
        # Subtest: should download attachment
        ok 1 - should download attachment
          ---
          duration_ms: 1.822342
          type: 'test'
          ...
        # Subtest: should verify hash
        ok 2 - should verify hash
          ---
          duration_ms: 1.144279
          type: 'test'
          ...
        # Subtest: should throw on hash mismatch
        ok 3 - should throw on hash mismatch
          ---
          duration_ms: 1.368984
          type: 'test'
          ...
        1..3
    ok 2 - downloadAttachment
      ---
      duration_ms: 4.984421
      type: 'suite'
      ...
    # Subtest: caching
        # Subtest: should cache downloaded attachments
        ok 1 - should cache downloaded attachments
          ---
          duration_ms: 1.081802
          type: 'test'
          ...
        # Subtest: should clear cache
        ok 2 - should clear cache
          ---
          duration_ms: 1.66609
          type: 'test'
          ...
        1..2
    ok 3 - caching
      ---
      duration_ms: 3.244906
      type: 'suite'
      ...
    1..3
ok 1 - attachmentService
  ---
  duration_ms: 24.789891
  type: 'suite'
  ...
1..1
# tests 7
# suites 4
# pass 7
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 41.655142

→ Running tests/services/authUtils.test.mjs
TAP version 13
# Subtest: authUtils
    # Subtest: normalizeProviderId
        # Subtest: returns trimmed string if valid
        ok 1 - returns trimmed string if valid
          ---
          duration_ms: 0.934656
          type: 'test'
          ...
        # Subtest: returns 'nip07' fallback if empty
        ok 2 - returns 'nip07' fallback if empty
          ---
          duration_ms: 1.453168
          type: 'test'
          ...
        # Subtest: returns 'nip07' fallback if null
        ok 3 - returns 'nip07' fallback if null
          ---
          duration_ms: 0.256484
          type: 'test'
          ...
        # Subtest: returns 'nip07' fallback if undefined
        ok 4 - returns 'nip07' fallback if undefined
          ---
          duration_ms: 0.299254
          type: 'test'
          ...
        # Subtest: returns 'nip07' fallback if not a string
        ok 5 - returns 'nip07' fallback if not a string
          ---
          duration_ms: 0.160192
          type: 'test'
          ...
        1..5
    ok 1 - normalizeProviderId
      ---
      duration_ms: 4.745419
      type: 'test'
      ...
    # Subtest: normalizeAuthType
        # Subtest: prioritizes authTypeCandidate
        ok 1 - prioritizes authTypeCandidate
          ---
          duration_ms: 0.430783
          type: 'test'
          ...
        # Subtest: falls back to providerResult.authType
        ok 2 - falls back to providerResult.authType
          ---
          duration_ms: 0.252886
          type: 'test'
          ...
        # Subtest: falls back to providerResult.providerId
        ok 3 - falls back to providerResult.providerId
          ---
          duration_ms: 0.352849
          type: 'test'
          ...
        # Subtest: falls back to providerId
        ok 4 - falls back to providerId
          ---
          duration_ms: 0.231507
          type: 'test'
          ...
        # Subtest: returns 'nip07' if all else fails
        ok 5 - returns 'nip07' if all else fails
          ---
          duration_ms: 0.138943
          type: 'test'
          ...
        # Subtest: trims whitespace from results
        ok 6 - trims whitespace from results
          ---
          duration_ms: 0.116669
          type: 'test'
          ...
        # Subtest: ignores empty strings in candidates
        ok 7 - ignores empty strings in candidates
          ---
          duration_ms: 0.115588
          type: 'test'
          ...
        1..7
    ok 2 - normalizeAuthType
      ---
      duration_ms: 3.02337
      type: 'test'
      ...
    1..2
ok 1 - authUtils
  ---
  duration_ms: 8.769776
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
# duration_ms 27.01789

→ Running tests/services/discussionCountService.test.mjs
TAP version 13
# Subtest: DiscussionCountService
    # Subtest: initialization sets defaults
    ok 1 - initialization sets defaults
      ---
      duration_ms: 1.34927
      type: 'test'
      ...
    # Subtest: refreshCounts returns early if videos array is empty or invalid
    ok 2 - refreshCounts returns early if videos array is empty or invalid
      ---
      duration_ms: 0.660581
      type: 'test'
      ...
    # Subtest: refreshCounts returns early if dependencies are missing
    ok 3 - refreshCounts returns early if dependencies are missing
      ---
      duration_ms: 1.296304
      type: 'test'
      ...
    # Subtest: refreshCounts handles happy path (fetches and updates DOM)
    ok 4 - refreshCounts handles happy path (fetches and updates DOM)
      ---
      duration_ms: 81.923837
      type: 'test'
      ...
    # Subtest: refreshCounts uses cached count if available
    ok 5 - refreshCounts uses cached count if available
      ---
      duration_ms: 2.351664
      type: 'test'
      ...
    # Subtest: refreshCounts handles API errors gracefully
    ok 6 - refreshCounts handles API errors gracefully
      ---
      duration_ms: 4.36982
      type: 'test'
      ...
    # Subtest: refreshCounts handles partial results
    ok 7 - refreshCounts handles partial results
      ---
      duration_ms: 3.573432
      type: 'test'
      ...
    # Subtest: refreshCounts handles unsupported relays (empty perRelay)
    ok 8 - refreshCounts handles unsupported relays (empty perRelay)
      ---
      duration_ms: 2.239017
      type: 'test'
      ...
    1..8
ok 1 - DiscussionCountService
  ---
  duration_ms: 192.062864
  type: 'suite'
  ...
1..1
# tests 8
# suites 1
# pass 8
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 212.304776

→ Running tests/services/exploreDataService.optimization.test.mjs
TAP version 13
# Subtest: exploreDataService optimization
    # Subtest: toLightweightVideo extracts necessary fields
    ok 1 - toLightweightVideo extracts necessary fields
      ---
      duration_ms: 1.830935
      type: 'test'
      ...
    # Subtest: collectVideoTags works with lightweight object
    ok 2 - collectVideoTags works with lightweight object
      ---
      duration_ms: 14.190234
      type: 'test'
      ...
    # Subtest: buildVideoAddressPointer works with lightweight object
    ok 3 - buildVideoAddressPointer works with lightweight object
      ---
      duration_ms: 0.552401
      type: 'test'
      ...
    # Subtest: toLightweightVideo handles invalid input
    ok 4 - toLightweightVideo handles invalid input
      ---
      duration_ms: 0.203105
      type: 'test'
      ...
    1..4
ok 1 - exploreDataService optimization
  ---
  duration_ms: 18.572072
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
# duration_ms 31.535969

→ Running tests/services/exploreDataService.test.mjs
TAP version 13
# Subtest: exploreDataService - buildWatchHistoryTagCounts
    # Subtest: should return empty Map if watchHistoryService is missing
    ok 1 - should return empty Map if watchHistoryService is missing
      ---
      duration_ms: 1.358906
      type: 'test'
      ...
    # Subtest: should handle missing loadLatest method gracefully
    ok 2 - should handle missing loadLatest method gracefully
      ---
      duration_ms: 0.495223
      type: 'test'
      ...
    # Subtest: should handle loadLatest failure gracefully
    ok 3 - should handle loadLatest failure gracefully
      ---
      duration_ms: 8.154657
      type: 'test'
      ...
    # Subtest: should return counts from worker on success
    ok 4 - should return counts from worker on success
      ---
      duration_ms: 2.399776
      type: 'test'
      ...
    # Subtest: should handle worker error gracefully
    ok 5 - should handle worker error gracefully
      ---
      duration_ms: 1.59103
      type: 'test'
      ...
    1..5
ok 1 - exploreDataService - buildWatchHistoryTagCounts
  ---
  duration_ms: 24.267535
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
# duration_ms 32.164416

→ Running tests/services/link-preview-service.test.mjs
TAP version 13
# Subtest: LinkPreviewService
    # Subtest: initializes IndexedDB
    ok 1 - initializes IndexedDB
      ---
      duration_ms: 15.926482
      type: 'test'
      ...
    # Subtest: fetches and caches preview
    ok 2 - fetches and caches preview
      ---
      duration_ms: 28.035725
      type: 'test'
      ...
    # Subtest: returns null on fetch failure
    ok 3 - returns null on fetch failure
      ---
      duration_ms: 2.481702
      type: 'test'
      ...
    # Subtest: respects TTL
    ok 4 - respects TTL
      ---
      duration_ms: 13.898504
      type: 'test'
      ...
    # Subtest: deletePreview removes from cache
    ok 5 - deletePreview removes from cache
      ---
      duration_ms: 2.287657
      type: 'test'
      ...
    1..5
ok 1 - LinkPreviewService
  ---
  duration_ms: 66.265623
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
# duration_ms 74.74134

→ Running tests/services/moderation-action-controller.test.mjs
TAP version 13
# Subtest: ModerationActionController: handles moderation override
ok 1 - ModerationActionController: handles moderation override
  ---
  duration_ms: 1.896756
  type: 'test'
  ...
# Subtest: ModerationActionController: blocks user and updates state
ok 2 - ModerationActionController: blocks user and updates state
  ---
  duration_ms: 1.032467
  type: 'test'
  ...
# Subtest: ModerationActionController: prevents blocking self
ok 3 - ModerationActionController: prevents blocking self
  ---
  duration_ms: 0.424347
  type: 'test'
  ...
# Subtest: ModerationActionController: requires login to block
ok 4 - ModerationActionController: requires login to block
  ---
  duration_ms: 0.423407
  type: 'test'
  ...
# Subtest: ModerationActionController: handles hide action
ok 5 - ModerationActionController: handles hide action
  ---
  duration_ms: 0.396743
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
# duration_ms 18.208657

→ Running tests/services/nostr-service.test.mjs
TAP version 13
# Subtest: NostrService
    # Subtest: loadVideos
        # Subtest: should load cached videos and start subscription
        ok 1 - should load cached videos and start subscription
          ---
          duration_ms: 3.424299
          type: 'test'
          ...
        1..1
    ok 1 - loadVideos
      ---
      duration_ms: 4.435681
      type: 'suite'
      ...
    # Subtest: fetchVideosByAuthors
        # Subtest: should fetch videos from relays for specific authors
        ok 1 - should fetch videos from relays for specific authors
          ---
          duration_ms: 2.344036
          type: 'test'
          ...
        1..1
    ok 2 - fetchVideosByAuthors
      ---
      duration_ms: 2.592462
      type: 'suite'
      ...
    1..2
ok 1 - NostrService
  ---
  duration_ms: 7.936591
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
# duration_ms 24.173538

→ Running tests/services/playbackService_forcedSource.test.mjs
(node:4085) ExperimentalWarning: The MockTimers API is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
TAP version 13
# Subtest: PlaybackService Forced Source Logic
    # Subtest: Normal flow: Timeout triggers fallback to Torrent if URL stalls
    ok 1 - Normal flow: Timeout triggers fallback to Torrent if URL stalls
      ---
      duration_ms: 12.455675
      type: 'test'
      ...
    # Subtest: Forced Source 'url': Ignores playbackStartTimeout and does NOT fallback to Torrent
    ok 2 - Forced Source 'url': Ignores playbackStartTimeout and does NOT fallback to Torrent
      ---
      duration_ms: 4.180464
      type: 'test'
      ...
    # Subtest: Forced Source 'url': Does NOT fallback to Torrent even if URL fails (probe bad)
    ok 3 - Forced Source 'url': Does NOT fallback to Torrent even if URL fails (probe bad)
      ---
      duration_ms: 2.126729
      type: 'test'
      ...
    # Subtest: Forced Source 'torrent': Ignores playbackStartTimeout and does NOT fallback to URL
    ok 4 - Forced Source 'torrent': Ignores playbackStartTimeout and does NOT fallback to URL
      ---
      duration_ms: 1.722458
      type: 'test'
      ...
    # Subtest: Forced Source 'torrent': Does NOT fallback to URL even if Torrent fails
    ok 5 - Forced Source 'torrent': Does NOT fallback to URL even if Torrent fails
      ---
      duration_ms: 2.068248
      type: 'test'
      ...
    1..5
ok 1 - PlaybackService Forced Source Logic
  ---
  duration_ms: 108.58296
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
# duration_ms 122.229696

→ Running tests/services/playbackService_order.test.mjs
(node:4092) ExperimentalWarning: The MockTimers API is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
TAP version 13
# Subtest: PlaybackService Ordering
    # Subtest: Playback Execution Order
        # Subtest: urlFirstEnabled=true: Tries URL first, succeeds
        ok 1 - urlFirstEnabled=true: Tries URL first, succeeds
          ---
          duration_ms: 8.684238
          type: 'test'
          ...
        # Subtest: urlFirstEnabled=true: Tries URL first, fails, falls back to Torrent
        ok 2 - urlFirstEnabled=true: Tries URL first, fails, falls back to Torrent
          ---
          duration_ms: 1.756704
          type: 'test'
          ...
        # Subtest: urlFirstEnabled=false: Tries Torrent first, succeeds
        ok 3 - urlFirstEnabled=false: Tries Torrent first, succeeds
          ---
          duration_ms: 1.389337
          type: 'test'
          ...
        # Subtest: urlFirstEnabled=false: Tries Torrent first, fails (throws), falls back to URL
        ok 4 - urlFirstEnabled=false: Tries Torrent first, fails (throws), falls back to URL
          ---
          duration_ms: 2.103952
          type: 'test'
          ...
        # Subtest: forcedSource=torrent overrides urlFirstEnabled=true
        ok 5 - forcedSource=torrent overrides urlFirstEnabled=true
          ---
          duration_ms: 1.035311
          type: 'test'
          ...
        1..5
    ok 1 - Playback Execution Order
      ---
      duration_ms: 16.074481
      type: 'suite'
      ...
    1..1
ok 1 - PlaybackService Ordering
  ---
  duration_ms: 17.665675
  type: 'suite'
  ...
1..1
# tests 5
# suites 2
# pass 5
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 33.521809

→ Running tests/services/playbackService.test.mjs
(node:4099) ExperimentalWarning: The MockTimers API is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
TAP version 13
# Subtest: PlaybackService
    # Subtest: Initialization sets defaults and dependencies
    ok 1 - Initialization sets defaults and dependencies
      ---
      duration_ms: 1.698307
      type: 'test'
      ...
    # Subtest: prepareVideoElement respects localStorage and binds listener
    ok 2 - prepareVideoElement respects localStorage and binds listener
      ---
      duration_ms: 4.48473
      type: 'test'
      ...
    # Subtest: registerUrlPlaybackWatchdogs triggers onFallback on error
    ok 3 - registerUrlPlaybackWatchdogs triggers onFallback on error
      ---
      duration_ms: 1.605889
      type: 'test'
      ...
    # Subtest: registerUrlPlaybackWatchdogs triggers onSuccess on playing
    ok 4 - registerUrlPlaybackWatchdogs triggers onSuccess on playing
      ---
      duration_ms: 0.718797
      type: 'test'
      ...
    # Subtest: createSession returns a PlaybackSession
    ok 5 - createSession returns a PlaybackSession
      ---
      duration_ms: 0.501538
      type: 'test'
      ...
    # Subtest: PlaybackSession Flow
        # Subtest: URL Probe Success starts playback
        ok 1 - URL Probe Success starts playback
          ---
          duration_ms: 8.74219
          type: 'test'
          ...
        # Subtest: URL Probe Failure triggers fallback
        ok 2 - URL Probe Failure triggers fallback
          ---
          duration_ms: 2.509846
          type: 'test'
          ...
        # Subtest: Watchdog Stall triggers fallback
        ok 3 - Watchdog Stall triggers fallback
          ---
          duration_ms: 3.410584
          type: 'test'
          ...
        1..3
    ok 6 - PlaybackSession Flow
      ---
      duration_ms: 15.101415
      type: 'suite'
      ...
    1..6
ok 1 - PlaybackService
  ---
  duration_ms: 113.417847
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
# duration_ms 128.248823

→ Running tests/services/profileMetadataService.test.mjs
TAP version 13
# Subtest: profileMetadataService
    # Subtest: fetchProfileMetadataBatch
        # Subtest: should return empty map if no pubkeys provided
        ok 1 - should return empty map if no pubkeys provided
          ---
          duration_ms: 2.025883
          type: 'test'
          ...
        # Subtest: should fetch profiles for provided pubkeys
        ok 2 - should fetch profiles for provided pubkeys
          ---
          duration_ms: 2.653166
          type: 'test'
          ...
        # Subtest: should handle relay failures gracefully
        ok 3 - should handle relay failures gracefully
          ---
          duration_ms: 0.745331
          type: 'test'
          ...
        # Subtest: should parse profile content correctly
        ok 4 - should parse profile content correctly
          ---
          duration_ms: 0.807972
          type: 'test'
          ...
        # Subtest: should deduplicate concurrent requests (inflight)
        ok 5 - should deduplicate concurrent requests (inflight)
          ---
          duration_ms: 7.788644
          type: 'test'
          ...
        1..5
    ok 1 - fetchProfileMetadataBatch
      ---
      duration_ms: 15.295811
      type: 'suite'
      ...
    # Subtest: fetchProfileMetadata
        # Subtest: should return null for invalid pubkey
        ok 1 - should return null for invalid pubkey
          ---
          duration_ms: 0.47242
          type: 'test'
          ...
        # Subtest: should return single profile result
        ok 2 - should return single profile result
          ---
          duration_ms: 0.541504
          type: 'test'
          ...
        1..2
    ok 2 - fetchProfileMetadata
      ---
      duration_ms: 1.518583
      type: 'suite'
      ...
    # Subtest: ensureProfileMetadataSubscription
        # Subtest: should return null if nostr pool is missing
        ok 1 - should return null if nostr pool is missing
          ---
          duration_ms: 0.498956
          type: 'test'
          ...
        # Subtest: should create a subscription via relaySubscriptionService
        ok 2 - should create a subscription via relaySubscriptionService
          ---
          duration_ms: 14.514733
          type: 'test'
          ...
        # Subtest: should handle onProfile callback
        ok 3 - should handle onProfile callback
          ---
          duration_ms: 1.14265
          type: 'test'
          ...
        1..3
    ok 3 - ensureProfileMetadataSubscription
      ---
      duration_ms: 16.524874
      type: 'suite'
      ...
    1..3
ok 1 - profileMetadataService
  ---
  duration_ms: 34.216668
  type: 'suite'
  ...
1..1
# tests 10
# suites 4
# pass 10
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 49.414965

→ Running tests/services/r2Service.test.mjs
TAP version 13
# Subtest: js/services/r2Service.js
    # Subtest: Default Settings
    ok 1 - Default Settings
      ---
      duration_ms: 2.558424
      type: 'test'
      ...
    # Subtest: handleCloudflareSettingsSubmit - Valid Input
    ok 2 - handleCloudflareSettingsSubmit - Valid Input
      ---
      duration_ms: 0.690655
      type: 'test'
      ...
    # Subtest: handleCloudflareSettingsSubmit - Invalid S3 URL
    ok 3 - handleCloudflareSettingsSubmit - Invalid S3 URL
      ---
      duration_ms: 1.138398
      type: 'test'
      ...
    # Subtest: handleCloudflareSettingsSubmit - Missing Fields
    ok 4 - handleCloudflareSettingsSubmit - Missing Fields
      ---
      duration_ms: 0.748591
      type: 'test'
      ...
    # Subtest: ensureBucketConfigForNpub - Uses Explicit Credentials
    ok 5 - ensureBucketConfigForNpub - Uses Explicit Credentials
      ---
      duration_ms: 0.793458
      type: 'test'
      ...
    # Subtest: ensureBucketConfigForNpub - Uses Meta Bucket when Missing
    ok 6 - ensureBucketConfigForNpub - Uses Meta Bucket when Missing
      ---
      duration_ms: 1.928119
      type: 'test'
      ...
    # Subtest: resolveConnection - Maps meta bucket into settings
    ok 7 - resolveConnection - Maps meta bucket into settings
      ---
      duration_ms: 0.916432
      type: 'test'
      ...
    # Subtest: resolveConnection - Returns null without StorageService entries
    ok 8 - resolveConnection - Returns null without StorageService entries
      ---
      duration_ms: 0.403531
      type: 'test'
      ...
    1..8
ok 1 - js/services/r2Service.js
  ---
  duration_ms: 12.626339
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
# duration_ms 27.925061

→ Running tests/services/relay-health-service.test.mjs
TAP version 13
# Subtest: RelayHealthService: initializes with default values
ok 1 - RelayHealthService: initializes with default values
  ---
  duration_ms: 1.693485
  type: 'test'
  ...
# Subtest: RelayHealthService: manages telemetry opt-in
ok 2 - RelayHealthService: manages telemetry opt-in
  ---
  duration_ms: 0.395545
  type: 'test'
  ...
# Subtest: RelayHealthService: getRelayUrls fetches from relayManager
ok 3 - RelayHealthService: getRelayUrls fetches from relayManager
  ---
  duration_ms: 1.049188
  type: 'test'
  ...
# Subtest: RelayHealthService: ensureRelayState creates default state
ok 4 - RelayHealthService: ensureRelayState creates default state
  ---
  duration_ms: 0.266593
  type: 'test'
  ...
# Subtest: RelayHealthService: checkRelay success flow
ok 5 - RelayHealthService: checkRelay success flow
  ---
  duration_ms: 1.033166
  type: 'test'
  ...
# Subtest: RelayHealthService: checkRelay failure flow
ok 6 - RelayHealthService: checkRelay failure flow
  ---
  duration_ms: 0.554146
  type: 'test'
  ...
# Subtest: RelayHealthService: checkRelay handles missing nostrClient
ok 7 - RelayHealthService: checkRelay handles missing nostrClient
  ---
  duration_ms: 0.285677
  type: 'test'
  ...
# Subtest: RelayHealthService: refresh checks all relays
ok 8 - RelayHealthService: refresh checks all relays
  ---
  duration_ms: 0.695875
  type: 'test'
  ...
# Subtest: RelayHealthService: emits telemetry if opted in
ok 9 - RelayHealthService: emits telemetry if opted in
  ---
  duration_ms: 1.012082
  type: 'test'
  ...
# Subtest: RelayHealthService: checkRelay times out after DEFAULT_TIMEOUT_MS
ok 10 - RelayHealthService: checkRelay times out after DEFAULT_TIMEOUT_MS
  ---
  duration_ms: 10.082416
  type: 'test'
  ...
# Subtest: RelayHealthService: failure threshold triggers user warning
ok 11 - RelayHealthService: failure threshold triggers user warning
  ---
  duration_ms: 0.936595
  type: 'test'
  ...
# Subtest: RelayHealthService: user warning respects cooldown
ok 12 - RelayHealthService: user warning respects cooldown
  ---
  duration_ms: 0.600303
  type: 'test'
  ...
# Subtest: RelayHealthService: relay disconnect/error events trigger failure
ok 13 - RelayHealthService: relay disconnect/error events trigger failure
  ---
  duration_ms: 0.274996
  type: 'test'
  ...
# Subtest: RelayHealthService: integrates with nostrClient.markRelayUnreachable
ok 14 - RelayHealthService: integrates with nostrClient.markRelayUnreachable
  ---
  duration_ms: 0.336169
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
# duration_ms 5016.050924

→ Running tests/services/s3Service.test.mjs
TAP version 13
# Subtest: s3Service
    # Subtest: validateS3Connection
        # Subtest: should validate correct configuration
        ok 1 - should validate correct configuration
          ---
          duration_ms: 1.640288
          type: 'test'
          ...
        # Subtest: should throw on missing required fields
        ok 2 - should throw on missing required fields
          ---
          duration_ms: 0.640819
          type: 'test'
          ...
        1..2
    ok 1 - validateS3Connection
      ---
      duration_ms: 3.522865
      type: 'suite'
      ...
    # Subtest: getCorsOrigins
        # Subtest: should return current origin
        ok 1 - should return current origin
          ---
          duration_ms: 86.857789
          type: 'test'
          ...
        # Subtest: should handle localhost
        ok 2 - should handle localhost
          ---
          duration_ms: 13.400605
          type: 'test'
          ...
        1..2
    ok 2 - getCorsOrigins
      ---
      duration_ms: 100.636106
      type: 'suite'
      ...
    1..2
ok 1 - s3Service
  ---
  duration_ms: 104.989919
  type: 'suite'
  ...
1..1
# tests 4
# suites 3
# pass 4
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 120.150439

→ Running tests/services/s3UploadService.test.mjs
TAP version 13
# Subtest: S3UploadService
    # Subtest: constructor initializes listeners
    ok 1 - constructor initializes listeners
      ---
      duration_ms: 1.37098
      type: 'test'
      ...
    # Subtest: Event Emitter Logic
    ok 2 - Event Emitter Logic
      ---
      duration_ms: 1.511157
      type: 'test'
      ...
    # Subtest: emit handles listener errors safely
    ok 3 - emit handles listener errors safely
      ---
      duration_ms: 0.635785
      type: 'test'
      ...
    # Subtest: verifyConnection
    ok 4 - verifyConnection
      ---
      duration_ms: 0.500311
      type: 'test'
      ...
    # Subtest: prepareUpload
    ok 5 - prepareUpload
      ---
      duration_ms: 0.456281
      type: 'test'
      ...
    # Subtest: uploadFile
        # Subtest: validates parameters
        ok 1 - validates parameters
          ---
          duration_ms: 0.986473
          type: 'test'
          ...
        # Subtest: uploads successfully
        ok 2 - uploads successfully
          ---
          duration_ms: 1.046869
          type: 'test'
          ...
        1..2
    ok 6 - uploadFile
      ---
      duration_ms: 2.773617
      type: 'test'
      ...
    # Subtest: uploadVideo
        # Subtest: fails if npub missing
        ok 1 - fails if npub missing
          ---
          duration_ms: 1.11902
          type: 'test'
          ...
        # Subtest: fails if title missing
        ok 2 - fails if title missing
          ---
          duration_ms: 0.604887
          type: 'test'
          ...
        # Subtest: fails if file missing
        ok 3 - fails if file missing
          ---
          duration_ms: 0.300561
          type: 'test'
          ...
        # Subtest: successful upload flow
        ok 4 - successful upload flow
          ---
          duration_ms: 0.967438
          type: 'test'
          ...
        # Subtest: uploads thumbnail if provided
        ok 5 - uploads thumbnail if provided
          ---
          duration_ms: 0.731242
          type: 'test'
          ...
        # Subtest: handles validation errors from normalizeVideoNotePayload
        ok 6 - handles validation errors from normalizeVideoNotePayload
          ---
          duration_ms: 0.376372
          type: 'test'
          ...
        # Subtest: handles upload exception
        ok 7 - handles upload exception
          ---
          duration_ms: 0.420808
          type: 'test'
          ...
        1..7
    ok 7 - uploadVideo
      ---
      duration_ms: 7.419324
      type: 'test'
      ...
    1..7
ok 1 - S3UploadService
  ---
  duration_ms: 17.281174
  type: 'test'
  ...
1..1
# tests 17
# suites 0
# pass 17
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 39.1023

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
      duration_ms: 2.419518
      type: 'test'
      ...
    # Subtest: should apply seeds when accessControl is ready
    ok 2 - should apply seeds when accessControl is ready
      ---
      duration_ms: 1.551678
      type: 'test'
      ...
    # Subtest: should subscribe to accessControl changes
    ok 3 - should subscribe to accessControl changes
      ---
      duration_ms: 1.315401
      type: 'test'
      ...
    # Subtest: should handle accessControl timeout and apply seeds anyway
    ok 4 - should handle accessControl timeout and apply seeds anyway
      ---
      duration_ms: 2.992562
      type: 'test'
      ...
    # Subtest: should recompute summaries after applying seeds
    ok 5 - should recompute summaries after applying seeds
      ---
      duration_ms: 0.592982
      type: 'test'
      ...
    # Subtest: should wait for relays if hydration fails initially
    ok 6 - should wait for relays if hydration fails initially
      ---
      duration_ms: 300.975217
      type: 'test'
      ...
    1..6
ok 1 - trustBootstrap
  ---
  duration_ms: 311.847039
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
# duration_ms 3770.924047

→ Running tests/share-event-builder.test.mjs
TAP version 13
# Subtest: buildShareEvent preserves share content
ok 1 - buildShareEvent preserves share content
  ---
  duration_ms: 2.032172
  type: 'test'
  ...
# Subtest: buildShareEvent normalizes hex identifiers for e and p tags
ok 2 - buildShareEvent normalizes hex identifiers for e and p tags
  ---
  duration_ms: 1.837042
  type: 'test'
  ...
# Subtest: buildShareEvent includes sanitized relay hints
ok 3 - buildShareEvent includes sanitized relay hints
  ---
  duration_ms: 0.541217
  type: 'test'
  ...
# Subtest: buildShareEvent tolerates missing optional fields
ok 4 - buildShareEvent tolerates missing optional fields
  ---
  duration_ms: 0.295701
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
# duration_ms 17.774287

→ Running tests/shareNostrController.test.mjs
TAP version 13
# Subtest: ShareNostrController
    # Subtest: handleShare shares video successfully
    ok 1 - handleShare shares video successfully
      ---
      duration_ms: 2.158978
      type: 'test'
      ...
    # Subtest: handleShare throws error if missing video details
    ok 2 - handleShare throws error if missing video details
      ---
      duration_ms: 0.931876
      type: 'test'
      ...
    # Subtest: openModal shows error if no video
    ok 3 - openModal shows error if no video
      ---
      duration_ms: 0.586965
      type: 'test'
      ...
    # Subtest: openModal opens modal with correct payload
    ok 4 - openModal opens modal with correct payload
      ---
      duration_ms: 0.391507
      type: 'test'
      ...
    1..4
ok 1 - ShareNostrController
  ---
  duration_ms: 6.506569
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
# duration_ms 20.055894

→ Running tests/sign-request-queue.test.mjs
TAP version 13
# Subtest: queueSignEvent executes successfully
ok 1 - queueSignEvent executes successfully
  ---
  duration_ms: 1.788131
  type: 'test'
  ...
# Subtest: queueSignEvent executes sequentially for same signer
ok 2 - queueSignEvent executes sequentially for same signer
  ---
  duration_ms: 101.573983
  type: 'test'
  ...
# Subtest: queueSignEvent executes concurrently for different signers
ok 3 - queueSignEvent executes concurrently for different signers
  ---
  duration_ms: 51.229546
  type: 'test'
  ...
# Subtest: queueSignEvent times out
ok 4 - queueSignEvent times out
  ---
  duration_ms: 52.04506
  type: 'test'
  ...
# Subtest: queueSignEvent normalizes errors
ok 5 - queueSignEvent normalizes errors
  ---
  duration_ms: 0.670526
  type: 'test'
  ...
# Subtest: queueSignEvent handles signer disconnect
ok 6 - queueSignEvent handles signer disconnect
  ---
  duration_ms: 0.63223
  type: 'test'
  ...
# Subtest: queueSignEvent handles missing signer
ok 7 - queueSignEvent handles missing signer
  ---
  duration_ms: 0.565181
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
# duration_ms 363.711695

→ Running tests/state/appState.test.mjs
TAP version 13
# Subtest: AppState
    # Subtest: getters and setters work for simple values
    ok 1 - getters and setters work for simple values
      ---
      duration_ms: 1.65978
      type: 'test'
      ...
    # Subtest: subscribeToAppStateKey fires on change
    ok 2 - subscribeToAppStateKey fires on change
      ---
      duration_ms: 0.724113
      type: 'test'
      ...
    # Subtest: subscribeToAppState fires on any change
    ok 3 - subscribeToAppState fires on any change
      ---
      duration_ms: 0.423234
      type: 'test'
      ...
    # Subtest: setModalState updates state and notifies
    ok 4 - setModalState updates state and notifies
      ---
      duration_ms: 0.865378
      type: 'test'
      ...
    # Subtest: resetAppState clears everything
    ok 5 - resetAppState clears everything
      ---
      duration_ms: 0.752561
      type: 'test'
      ...
    # Subtest: setVideosMap only accepts Maps or null
    ok 6 - setVideosMap only accepts Maps or null
      ---
      duration_ms: 0.427256
      type: 'test'
      ...
    1..6
ok 1 - AppState
  ---
  duration_ms: 6.624592
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
# duration_ms 23.50539

→ Running tests/state/cache-saved-profiles.test.mjs
TAP version 13
# Subtest: persistSavedProfiles preserves custom authType strings
ok 1 - persistSavedProfiles preserves custom authType strings
  ---
  duration_ms: 2.117391
  type: 'test'
  ...
# Subtest: loadSavedProfilesFromStorage retains custom provider authType
ok 2 - loadSavedProfilesFromStorage retains custom provider authType
  ---
  duration_ms: 0.595393
  type: 'test'
  ...
# Subtest: loadSavedProfilesFromStorage migrates missing authType to nip07
ok 3 - loadSavedProfilesFromStorage migrates missing authType to nip07
  ---
  duration_ms: 0.430451
  type: 'test'
  ...
# Subtest: loadSavedProfilesFromStorage trims stored authType values
ok 4 - loadSavedProfilesFromStorage trims stored authType values
  ---
  duration_ms: 0.350552
  type: 'test'
  ...
# Subtest: loadSavedProfilesFromStorage ignores legacy userPubKey
ok 5 - loadSavedProfilesFromStorage ignores legacy userPubKey
  ---
  duration_ms: 0.22583
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
# duration_ms 17.377685

→ Running tests/state/cache.test.mjs
TAP version 13
# Subtest: js/state/cache.js
    # Subtest: Saved Profiles Persistence
    ok 1 - Saved Profiles Persistence
      ---
      duration_ms: 2.392209
      type: 'test'
      ...
    # Subtest: Active Profile Pubkey
    ok 2 - Active Profile Pubkey
      ---
      duration_ms: 0.593134
      type: 'test'
      ...
    # Subtest: URL Health Caching
    ok 3 - URL Health Caching
      ---
      duration_ms: 0.682062
      type: 'test'
      ...
    # Subtest: URL Health Expiration
    ok 4 - URL Health Expiration
      ---
      duration_ms: 11.083802
      type: 'test'
      ...
    # Subtest: Moderation Settings
    ok 5 - Moderation Settings
      ---
      duration_ms: 1.45883
      type: 'test'
      ...
    # Subtest: Legacy Moderation Overrides Support
        # Subtest: ignores legacy v1 overrides
        ok 1 - ignores legacy v1 overrides
          ---
          duration_ms: 0.514105
          type: 'test'
          ...
        # Subtest: loads v2 overrides
        ok 2 - loads v2 overrides
          ---
          duration_ms: 0.586104
          type: 'test'
          ...
        1..2
    ok 6 - Legacy Moderation Overrides Support
      ---
      duration_ms: 2.136593
      type: 'test'
      ...
    1..6
ok 1 - js/state/cache.js
  ---
  duration_ms: 21.863252
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
# duration_ms 31.129615

→ Running tests/state/profile-cache.test.mjs
[bitvid] [ProfileCache] Expired watchHistory for 1111111111111111111111111111111111111111111111111111111111111111
TAP version 13
# Subtest: ProfileCache: normalizeHexPubkey validates and cleans inputs
ok 1 - ProfileCache: normalizeHexPubkey validates and cleans inputs
  ---
  duration_ms: 1.930351
  type: 'test'
  ...
# Subtest: ProfileCache: resolves storage keys correctly
ok 2 - ProfileCache: resolves storage keys correctly
  ---
  duration_ms: 0.691831
  type: 'test'
  ...
# Subtest: ProfileCache: persists data to localStorage and memory
ok 3 - ProfileCache: persists data to localStorage and memory
  ---
  duration_ms: 1.619203
  type: 'test'
  ...
# Subtest: ProfileCache: loads from localStorage if memory miss
ok 4 - ProfileCache: loads from localStorage if memory miss
  ---
  duration_ms: 0.413946
  type: 'test'
  ...
# Subtest: ProfileCache: handles active profile switching
ok 5 - ProfileCache: handles active profile switching
  ---
  duration_ms: 0.983033
  type: 'test'
  ...
# Subtest: ProfileCache: setProfile normalizes and saves
ok 6 - ProfileCache: setProfile normalizes and saves
  ---
  duration_ms: 1.223617
  type: 'test'
  ...
# Subtest: ProfileCache: emits events on active profile change
ok 7 - ProfileCache: emits events on active profile change
  ---
  duration_ms: 0.483692
  type: 'test'
  ...
# Subtest: ProfileCache: respects TTL expiration
ok 8 - ProfileCache: respects TTL expiration
  ---
  duration_ms: 1.259325
  type: 'test'
  ...
# Subtest: ProfileCache: setProfile sanitizes XSS in media URLs
ok 9 - ProfileCache: setProfile sanitizes XSS in media URLs
  ---
  duration_ms: 1.472191
  type: 'test'
  ...
1..9
# tests 9
# suites 0
# pass 9
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 25.768901

→ Running tests/state/profile-settings-store.test.mjs
TAP version 13
# Subtest: profile settings store clones values and tracks entries
ok 1 - profile settings store clones values and tracks entries
  ---
  duration_ms: 2.549043
  type: 'test'
  ...
# Subtest: profile settings store ignores falsy keys and survives clone failures
ok 2 - profile settings store ignores falsy keys and survives clone failures
  ---
  duration_ms: 0.391452
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
# duration_ms 14.240382

→ Running tests/storage-service.test.mjs
TAP version 13
# Subtest: StorageService
    # Subtest: init() creates database and object store
    ok 1 - init() creates database and object store
      ---
      duration_ms: 16.762036
      type: 'test'
      ...
[bitvid] [StorageService] Unlocked storage for 00000000...
    # Subtest: unlock() generates and stores master key with NIP-44
    ok 2 - unlock() generates and stores master key with NIP-44
      ---
      duration_ms: 14.546412
      type: 'test'
      ...
[bitvid] [StorageService] Unlocked storage for 00000000...
[bitvid] [StorageService] Locked storage for 00000000...
[bitvid] [StorageService] Unlocked storage for 00000000...
    # Subtest: unlock() restores existing master key
    ok 3 - unlock() restores existing master key
      ---
      duration_ms: 6.666483
      type: 'test'
      ...
[bitvid] [StorageService] Unlocked storage for 00000000...
    # Subtest: unlock() falls back to NIP-04 if NIP-44 unavailable
    ok 4 - unlock() falls back to NIP-04 if NIP-44 unavailable
      ---
      duration_ms: 3.78815
      type: 'test'
      ...
[bitvid] [StorageService] Unlocked storage for 00000000...
[bitvid] [StorageService] Locked storage for 00000000...
    # Subtest: unlock() normalizes permission denied decrypt errors
    ok 5 - unlock() normalizes permission denied decrypt errors
      ---
      duration_ms: 4.270256
      type: 'test'
      ...
[bitvid] [StorageService] Unlocked storage for 00000000...
[bitvid] [StorageService] Locked storage for 00000000...
    # Subtest: unlock() normalizes missing decryptor errors
    ok 6 - unlock() normalizes missing decryptor errors
      ---
      duration_ms: 5.55688
      type: 'test'
      ...
[bitvid] [StorageService] Unlocked storage for 00000000...
[bitvid] [StorageService] Locked storage for 00000000...
    # Subtest: unlock() normalizes unknown decrypt errors
    ok 7 - unlock() normalizes unknown decrypt errors
      ---
      duration_ms: 3.552878
      type: 'test'
      ...
[bitvid] [StorageService] Unlocked storage for 00000000...
[bitvid] [StorageService] Saved connection conn_1
    # Subtest: saveConnection() encrypts and stores connection
    ok 8 - saveConnection() encrypts and stores connection
      ---
      duration_ms: 6.295337
      type: 'test'
      ...
[bitvid] [StorageService] Unlocked storage for 00000000...
[bitvid] [StorageService] Saved connection conn_1
    # Subtest: getConnection() decrypts and returns connection
    ok 9 - getConnection() decrypts and returns connection
      ---
      duration_ms: 6.292369
      type: 'test'
      ...
    # Subtest: getConnection() throws if locked
    ok 10 - getConnection() throws if locked
      ---
      duration_ms: 1.998623
      type: 'test'
      ...
[bitvid] [StorageService] Unlocked storage for 00000000...
[bitvid] [StorageService] Saved connection conn_1
[bitvid] [StorageService] Deleted connection conn_1
    # Subtest: deleteConnection() removes connection
    ok 11 - deleteConnection() removes connection
      ---
      duration_ms: 4.923969
      type: 'test'
      ...
[bitvid] [StorageService] Unlocked storage for 00000000...
[bitvid] [StorageService] Saved connection conn_1
[bitvid] [StorageService] Saved connection conn_2
    # Subtest: setDefaultConnection() updates metadata
    ok 12 - setDefaultConnection() updates metadata
      ---
      duration_ms: 5.454128
      type: 'test'
      ...
[bitvid] [StorageService] Unlocked storage for 00000000...
[bitvid] [StorageService] Saved connection conn_1
[bitvid] [StorageService] Saved connection conn_2
    # Subtest: saveConnection() with defaultForUploads=true clears other defaults
    ok 13 - saveConnection() with defaultForUploads=true clears other defaults
      ---
      duration_ms: 4.59763
      type: 'test'
      ...
    1..13
ok 1 - StorageService
  ---
  duration_ms: 88.427816
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
# duration_ms 99.973162

→ Running tests/subscriptions-manager.test.mjs
[bitvid] [nostr] Relay backoff applied. {
  relay: 'wss://relay-b.example',
  backoffMs: 1000,
  failureCount: 1,
  retryAt: 1771267223988,
  reason: null
}
TAP version 13
# Subtest: loadSubscriptions aggregates relay results when one rejects
ok 1 - loadSubscriptions aggregates relay results when one rejects
  ---
  duration_ms: 11.488363
  type: 'test'
  ...
# Subtest: loadSubscriptions queries the correct subscription list kind
ok 2 - loadSubscriptions queries the correct subscription list kind
  ---
  duration_ms: 1.013056
  type: 'test'
  ...
# Subtest: loadSubscriptions falls back to nip44 when hinted
ok 3 - loadSubscriptions falls back to nip44 when hinted
  ---
  duration_ms: 1.854887
  type: 'test'
  ...
# Subtest: loadSubscriptions handles nip44.v2 decryptors
ok 4 - loadSubscriptions handles nip44.v2 decryptors
  ---
  duration_ms: 1.569049
  type: 'test'
  ...
# Subtest: loadSubscriptions prefers nip44 decryptors when both are available
ok 5 - loadSubscriptions prefers nip44 decryptors when both are available
  ---
  duration_ms: 1.379587
  type: 'test'
  ...
# Subtest: loadSubscriptions uses active signer decryptors without requesting extension permissions
ok 6 - loadSubscriptions uses active signer decryptors without requesting extension permissions
  ---
  duration_ms: 1.267493
  type: 'test'
  ...
# Subtest: loadSubscriptions retries permission-required decrypts only when enabled
ok 7 - loadSubscriptions retries permission-required decrypts only when enabled
  ---
  duration_ms: 1.472124
  type: 'test'
  ...
# Subtest: showSubscriptionVideos waits for nostrService warm-up and refreshes after updates
ok 8 - showSubscriptionVideos waits for nostrService warm-up and refreshes after updates
  ---
  duration_ms: 91.809851
  type: 'test'
  ...
# Subtest: ensureLoaded memoizes concurrent loads
ok 9 - ensureLoaded memoizes concurrent loads
  ---
  duration_ms: 8.402729
  type: 'test'
  ...
# Subtest: publishSubscriptionList succeeds with direct signer without requesting extension permissions
ok 10 - publishSubscriptionList succeeds with direct signer without requesting extension permissions
  ---
  duration_ms: 2.764561
  type: 'test'
  ...
# Subtest: publishSubscriptionList prefers nip44 encryption when available
ok 11 - publishSubscriptionList prefers nip44 encryption when available
  ---
  duration_ms: 1.002779
  type: 'test'
  ...
# Subtest: publishSubscriptionList falls back to nip04 when nip44 fails
ok 12 - publishSubscriptionList falls back to nip04 when nip44 fails
  ---
  duration_ms: 0.882208
  type: 'test'
  ...
# Subtest: renderSameGridStyle shows empty state message
ok 13 - renderSameGridStyle shows empty state message
  ---
  duration_ms: 13.265736
  type: 'test'
  ...
# Subtest: renderSameGridStyle forwards moderation badge actions to the application
ok 14 - renderSameGridStyle forwards moderation badge actions to the application
  ---
  duration_ms: 66.887698
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
# duration_ms 6026.868625

→ Running tests/torrent/service-worker-fallback-message.test.mjs
TAP version 13
# Subtest: returns generic message when error missing
ok 1 - returns generic message when error missing
  ---
  duration_ms: 3.348855
  type: 'test'
  ...
# Subtest: identifies HTTPS requirement errors
ok 2 - identifies HTTPS requirement errors
  ---
  duration_ms: 0.222508
  type: 'test'
  ...
# Subtest: identifies disabled service worker errors
ok 3 - identifies disabled service worker errors
  ---
  duration_ms: 0.260632
  type: 'test'
  ...
# Subtest: identifies Brave specific guidance
ok 4 - identifies Brave specific guidance
  ---
  duration_ms: 0.1813
  type: 'test'
  ...
# Subtest: identifies blocked script errors
ok 5 - identifies blocked script errors
  ---
  duration_ms: 0.19026
  type: 'test'
  ...
# Subtest: identifies controller claim timeout
ok 6 - identifies controller claim timeout
  ---
  duration_ms: 0.227078
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
# duration_ms 19.07764

→ Running tests/torrent/style-helpers.test.mjs
TAP version 13
# Subtest: torrent/ui/styleHelpers
    # Subtest: returns null when no element is provided
    ok 1 - returns null when no element is provided
      ---
      duration_ms: 0.969121
      type: 'test'
      ...
    # Subtest: returns the original element without mutations
    ok 2 - returns the original element without mutations
      ---
      duration_ms: 76.44228
      type: 'test'
      ...
    # Subtest: provides an empty, frozen fallback map
    ok 3 - provides an empty, frozen fallback map
      ---
      duration_ms: 1.509997
      type: 'test'
      ...
    # Subtest: no-ops when removing styles
    ok 4 - no-ops when removing styles
      ---
      duration_ms: 10.584063
      type: 'test'
      ...
    1..4
ok 1 - torrent/ui/styleHelpers
  ---
  duration_ms: 91.099078
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
# duration_ms 104.969288

→ Running tests/torrent/toast-service.test.mjs
TAP version 13
# Subtest: torrent/ui/toastService
    # Subtest: renders a toast with Tailwind token classes and removes it on dismiss
    ok 1 - renders a toast with Tailwind token classes and removes it on dismiss
      ---
      duration_ms: 352.922995
      type: 'test'
      ...
    1..1
ok 1 - torrent/ui/toastService
  ---
  duration_ms: 354.566392
  type: 'suite'
  ...
1..1
# tests 1
# suites 1
# pass 1
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 363.514825

→ Running tests/ui/app-chrome-controller.test.mjs
TAP version 13
# Subtest: AppChromeController binds upload button when elements hydrate later
ok 1 - AppChromeController binds upload button when elements hydrate later
  ---
  duration_ms: 88.064284
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
# duration_ms 98.718954

→ Running tests/ui/components/debug_hashtag_strip_helper.test.mjs
Global ResizeObserver type: function
Helper window ResizeObserver: undefined
TAP version 13
# Subtest: Debug HashtagStripHelper fallback
ok 1 - Debug HashtagStripHelper fallback
  ---
  duration_ms: 103.828769
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
# duration_ms 114.43373

→ Running tests/ui/components/hashtagStripHelper.test.mjs
TAP version 13
# Subtest: HashtagStripHelper uses ResizeObserver when available
ok 1 - HashtagStripHelper uses ResizeObserver when available
  ---
  duration_ms: 104.0902
  type: 'test'
  ...
# Subtest: HashtagStripHelper falls back to window resize with RAF
ok 2 - HashtagStripHelper falls back to window resize with RAF
  ---
  duration_ms: 17.106554
  type: 'test'
  ...
# Subtest: HashtagStripHelper falls back to window resize with setTimeout when RAF is missing
ok 3 - HashtagStripHelper falls back to window resize with setTimeout when RAF is missing
  ---
  duration_ms: 13.051942
  type: 'test'
  ...
# Subtest: HashtagStripHelper handles teardown correctly
ok 4 - HashtagStripHelper handles teardown correctly
  ---
  duration_ms: 11.596506
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
# duration_ms 167.943559

→ Running tests/ui/components/videoMenuRenderers.test.mjs
TAP version 13
# Subtest: createVideoMoreMenuPanel - basic rendering
ok 1 - createVideoMoreMenuPanel - basic rendering
  ---
  duration_ms: 114.959302
  type: 'test'
  ...
# Subtest: createVideoMoreMenuPanel - pointer info rendering
ok 2 - createVideoMoreMenuPanel - pointer info rendering
  ---
  duration_ms: 16.151035
  type: 'test'
  ...
# Subtest: createVideoMoreMenuPanel - mirror logic
ok 3 - createVideoMoreMenuPanel - mirror logic
  ---
  duration_ms: 14.49284
  type: 'test'
  ...
# Subtest: createVideoMoreMenuPanel - blacklist logic
ok 4 - createVideoMoreMenuPanel - blacklist logic
  ---
  duration_ms: 21.456495
  type: 'test'
  ...
# Subtest: createVideoShareMenuPanel - permission logic
ok 5 - createVideoShareMenuPanel - permission logic
  ---
  duration_ms: 15.086897
  type: 'test'
  ...
# Subtest: createVideoShareMenuPanel - magnet/cdn logic
ok 6 - createVideoShareMenuPanel - magnet/cdn logic
  ---
  duration_ms: 10.321262
  type: 'test'
  ...
# Subtest: createChannelProfileMenuPanel - basic actions
ok 7 - createChannelProfileMenuPanel - basic actions
  ---
  duration_ms: 10.453641
  type: 'test'
  ...
# Subtest: createVideoSettingsMenuPanel - capabilities
ok 8 - createVideoSettingsMenuPanel - capabilities
  ---
  duration_ms: 10.800196
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
# duration_ms 230.206334

→ Running tests/ui/components/VideoModalSimilarHelpers.test.mjs
TAP version 13
# Subtest: derivePointerKeyFromInput
    # Subtest: derives key from string
    ok 1 - derives key from string
      ---
      duration_ms: 1.300384
      type: 'test'
      ...
    # Subtest: derives key from array
    ok 2 - derives key from array
      ---
      duration_ms: 0.233145
      type: 'test'
      ...
    # Subtest: derives key from object
    ok 3 - derives key from object
      ---
      duration_ms: 0.275066
      type: 'test'
      ...
    # Subtest: handles empty/invalid input
    ok 4 - handles empty/invalid input
      ---
      duration_ms: 0.237816
      type: 'test'
      ...
    1..4
ok 1 - derivePointerKeyFromInput
  ---
  duration_ms: 4.384227
  type: 'test'
  ...
# Subtest: formatViewCountLabel
    # Subtest: formats numbers
    ok 1 - formats numbers
      ---
      duration_ms: 0.50948
      type: 'test'
      ...
    1..1
ok 2 - formatViewCountLabel
  ---
  duration_ms: 0.911721
  type: 'test'
  ...
# Subtest: getViewCountLabel
    # Subtest: returns formatted count
    ok 1 - returns formatted count
      ---
      duration_ms: 0.666136
      type: 'test'
      ...
    # Subtest: handles partial
    ok 2 - handles partial
      ---
      duration_ms: 0.55961
      type: 'test'
      ...
    # Subtest: handles hydrating
    ok 3 - handles hydrating
      ---
      duration_ms: 0.311475
      type: 'test'
      ...
    1..3
ok 3 - getViewCountLabel
  ---
  duration_ms: 2.726709
  type: 'test'
  ...
# Subtest: buildSimilarCardIdentity
    # Subtest: uses overrides
    ok 1 - uses overrides
      ---
      duration_ms: 1.279381
      type: 'test'
      ...
    # Subtest: uses video author
    ok 2 - uses video author
      ---
      duration_ms: 0.59969
      type: 'test'
      ...
    # Subtest: derives npub from pubkey
    ok 3 - derives npub from pubkey
      ---
      duration_ms: 0.222976
      type: 'test'
      ...
    1..3
ok 4 - buildSimilarCardIdentity
  ---
  duration_ms: 2.604357
  type: 'test'
  ...
# Subtest: prepareSimilarVideoCard
    # Subtest: wires up onPlay
    ok 1 - wires up onPlay
      ---
      duration_ms: 0.350923
      type: 'test'
      ...
    1..1
ok 5 - prepareSimilarVideoCard
  ---
  duration_ms: 0.6141
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
# duration_ms 42.886752

→ Running tests/ui/creatorProfileController.test.mjs
TAP version 13
# Subtest: CreatorProfileController
    # Subtest: resolveCreatorProfileFromSources prioritizes cached profile
    ok 1 - resolveCreatorProfileFromSources prioritizes cached profile
      ---
      duration_ms: 1.367746
      type: 'test'
      ...
    # Subtest: resolveCreatorProfileFromSources falls back to fetched profile
    ok 2 - resolveCreatorProfileFromSources falls back to fetched profile
      ---
      duration_ms: 0.358164
      type: 'test'
      ...
    # Subtest: decorateVideoCreatorIdentity modifies video object
    ok 3 - decorateVideoCreatorIdentity modifies video object
      ---
      duration_ms: 0.523907
      type: 'test'
      ...
    # Subtest: fetchModalCreatorProfile fetches profile and updates modal
    ok 4 - fetchModalCreatorProfile fetches profile and updates modal
      ---
      duration_ms: 1.218897
      type: 'test'
      ...
    1..4
ok 1 - CreatorProfileController
  ---
  duration_ms: 5.249233
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
# duration_ms 18.889818

→ Running tests/ui/dm/zapHelpers.test.mjs
TAP version 13
# Subtest: formatZapAmount
    # Subtest: formats standard amounts correctly
    ok 1 - formats standard amounts correctly
      ---
      duration_ms: 24.895499
      type: 'test'
      ...
    # Subtest: formats compact amounts correctly
    ok 2 - formats compact amounts correctly
      ---
      duration_ms: 0.790575
      type: 'test'
      ...
    # Subtest: handles zero and small numbers
    ok 3 - handles zero and small numbers
      ---
      duration_ms: 0.612416
      type: 'test'
      ...
    # Subtest: handles invalid inputs gracefully
    ok 4 - handles invalid inputs gracefully
      ---
      duration_ms: 0.44814
      type: 'test'
      ...
    # Subtest: handles string number inputs
    ok 5 - handles string number inputs
      ---
      duration_ms: 0.330935
      type: 'test'
      ...
    1..5
ok 1 - formatZapAmount
  ---
  duration_ms: 28.739159
  type: 'suite'
  ...
# Subtest: aggregateZapTotals
    # Subtest: aggregates totals correctly
    ok 1 - aggregates totals correctly
      ---
      duration_ms: 0.473532
      type: 'test'
      ...
    # Subtest: handles empty input
    ok 2 - handles empty input
      ---
      duration_ms: 0.276598
      type: 'test'
      ...
    # Subtest: handles non-array input
    ok 3 - handles non-array input
      ---
      duration_ms: 0.497089
      type: 'test'
      ...
    # Subtest: handles missing or invalid amounts
    ok 4 - handles missing or invalid amounts
      ---
      duration_ms: 0.363831
      type: 'test'
      ...
    # Subtest: handles missing IDs
    ok 5 - handles missing IDs
      ---
      duration_ms: 0.53743
      type: 'test'
      ...
    1..5
ok 2 - aggregateZapTotals
  ---
  duration_ms: 2.686649
  type: 'suite'
  ...
# Subtest: normalizeZapReceipt
    # Subtest: normalizes valid receipt
    ok 1 - normalizes valid receipt
      ---
      duration_ms: 0.291736
      type: 'test'
      ...
    # Subtest: normalizes receipt with amount fallback
    ok 2 - normalizes receipt with amount fallback
      ---
      duration_ms: 0.16137
      type: 'test'
      ...
    # Subtest: normalizes empty receipt
    ok 3 - normalizes empty receipt
      ---
      duration_ms: 0.168028
      type: 'test'
      ...
    # Subtest: normalizes undefined receipt
    ok 4 - normalizes undefined receipt
      ---
      duration_ms: 0.10228
      type: 'test'
      ...
    # Subtest: normalizes invalid amount
    ok 5 - normalizes invalid amount
      ---
      duration_ms: 0.133192
      type: 'test'
      ...
    1..5
ok 3 - normalizeZapReceipt
  ---
  duration_ms: 1.099703
  type: 'suite'
  ...
1..3
# tests 15
# suites 3
# pass 15
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 55.515607

→ Running tests/ui/engagement-controller.test.mjs
TAP version 13
# Subtest: EngagementController
    # Subtest: handleRepostAction - should show error if no event ID is available
    ok 1 - handleRepostAction - should show error if no event ID is available
      ---
      duration_ms: 2.778729
      type: 'test'
      ...
    # Subtest: handleRepostAction - should call repostEvent with correct parameters
    ok 2 - handleRepostAction - should call repostEvent with correct parameters
      ---
      duration_ms: 0.918679
      type: 'test'
      ...
    # Subtest: handleRepostAction - should handle failure from repostEvent
    ok 3 - handleRepostAction - should handle failure from repostEvent
      ---
      duration_ms: 0.754155
      type: 'test'
      ...
    # Subtest: handleRepostAction - should use currentVideoPointer when in modal context
    ok 4 - handleRepostAction - should use currentVideoPointer when in modal context
      ---
      duration_ms: 0.649922
      type: 'test'
      ...
    # Subtest: handleMirrorAction - should show error if video has no URL
    ok 5 - handleMirrorAction - should show error if video has no URL
      ---
      duration_ms: 1.083868
      type: 'test'
      ...
    # Subtest: handleMirrorAction - should call mirrorVideoEvent when URL is provided
    ok 6 - handleMirrorAction - should call mirrorVideoEvent when URL is provided
      ---
      duration_ms: 0.593223
      type: 'test'
      ...
    # Subtest: handleMirrorAction - should prevent mirroring private videos
    ok 7 - handleMirrorAction - should prevent mirroring private videos
      ---
      duration_ms: 0.356032
      type: 'test'
      ...
    # Subtest: handleEnsurePresenceAction - should show error if no event ID
    ok 8 - handleEnsurePresenceAction - should show error if no event ID
      ---
      duration_ms: 0.710286
      type: 'test'
      ...
    # Subtest: handleEnsurePresenceAction - should handle throttled response
    ok 9 - handleEnsurePresenceAction - should handle throttled response
      ---
      duration_ms: 0.797812
      type: 'test'
      ...
    # Subtest: handleEnsurePresenceAction - should show success on successful rebroadcast
    ok 10 - handleEnsurePresenceAction - should show success on successful rebroadcast
      ---
      duration_ms: 0.467713
      type: 'test'
      ...
    1..10
ok 1 - EngagementController
  ---
  duration_ms: 12.993787
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
# duration_ms 30.316311

→ Running tests/ui/hashtag-strip-helper-bounce.test.mjs
TAP version 13
# Subtest: HashtagStripHelper triggers scroll hint when content overflows
ok 1 - HashtagStripHelper triggers scroll hint when content overflows
  ---
  duration_ms: 103.578514
  type: 'test'
  ...
# Subtest: HashtagStripHelper does not trigger scroll hint when no overflow
ok 2 - HashtagStripHelper does not trigger scroll hint when no overflow
  ---
  duration_ms: 14.763398
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
# duration_ms 130.286714

→ Running tests/ui/popoverEngine.test.mjs
TAP version 13
# Subtest: opens a popover in the overlay root and positions the panel
ok 1 - opens a popover in the overlay root and positions the panel
  ---
  duration_ms: 417.867805
  type: 'test'
  ...
# Subtest: positions bottom-end panels flush with the trigger's right edge
ok 2 - positions bottom-end panels flush with the trigger's right edge
  ---
  duration_ms: 81.10438
  type: 'test'
  ...
# Subtest: closes on outside pointer events and restores focus
ok 3 - closes on outside pointer events and restores focus
  ---
  duration_ms: 41.01378
  type: 'test'
  ...
# Subtest: supports roving focus, home/end navigation, and typeahead
ok 4 - supports roving focus, home/end navigation, and typeahead
  ---
  duration_ms: 53.918321
  type: 'test'
  ...
# Subtest: escape closes the popover and restores trigger focus
ok 5 - escape closes the popover and restores trigger focus
  ---
  duration_ms: 41.989719
  type: 'test'
  ...
# Subtest: close respects restoreFocus option for contextual menus
ok 6 - close respects restoreFocus option for contextual menus
  ---
  duration_ms: 34.472922
  type: 'test'
  ...
# Subtest: ensures only one popover is open at a time
ok 7 - ensures only one popover is open at a time
  ---
  duration_ms: 80.683696
  type: 'test'
  ...
# Subtest: applies token-based sizing and arrow positioning
ok 8 - applies token-based sizing and arrow positioning
  ---
  duration_ms: 66.400448
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
# duration_ms 828.746575

→ Running tests/ui/profile-modal-moderation-settings.test.mjs
TAP version 13
# Subtest: moderation settings save updates service and disables control
ok 1 - moderation settings save updates service and disables control
  ---
  duration_ms: 157.154479
  type: 'test'
  ...
# Subtest: moderation reset restores defaults and clearing inputs uses defaults
ok 2 - moderation reset restores defaults and clearing inputs uses defaults
  ---
  duration_ms: 29.991982
  type: 'test'
  ...
# Subtest: guest fallback uses config moderation defaults
ok 3 - guest fallback uses config moderation defaults
  ---
  duration_ms: 23.06637
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
# duration_ms 224.492881

→ Running tests/ui/profileModalController-addProfile.test.mjs
Success: Profile added. Select it when you're ready to switch.
Success: That profile is already saved on this device.
TAP version 13
# Subtest: handleAddProfile adds a new profile correctly
ok 1 - handleAddProfile adds a new profile correctly
  ---
  duration_ms: 147.939074
  type: 'test'
  ...
# Subtest: handleAddProfile prevents duplicates
ok 2 - handleAddProfile prevents duplicates
  ---
  duration_ms: 27.863215
  type: 'test'
  ...
# Subtest: handleAddProfile handles missing login result
ok 3 - handleAddProfile handles missing login result
  ---
  duration_ms: 17.939016
  type: 'test'
  ...
# Subtest: handleAddProfile handles errors gracefully
ok 4 - handleAddProfile handles errors gracefully
  ---
  duration_ms: 18.194302
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
# duration_ms 225.830871

→ Running tests/ui/reactionController.test.mjs
TAP version 13
# Subtest: ReactionController
    # Subtest: should subscribe to reactions
    ok 1 - should subscribe to reactions
      ---
      duration_ms: 2.992598
      type: 'test'
      ...
    # Subtest: should handle reaction update from subscription
    ok 2 - should handle reaction update from subscription
      ---
      duration_ms: 0.730934
      type: 'test'
      ...
    # Subtest: should apply optimistic update on handleReaction
    ok 3 - should apply optimistic update on handleReaction
      ---
      duration_ms: 0.98777
      type: 'test'
      ...
    # Subtest: should rollback optimistic update on publish failure
    ok 4 - should rollback optimistic update on publish failure
      ---
      duration_ms: 0.814073
      type: 'test'
      ...
    # Subtest: should not react if user not logged in
    ok 5 - should not react if user not logged in
      ---
      duration_ms: 0.816535
      type: 'test'
      ...
    1..5
ok 1 - ReactionController
  ---
  duration_ms: 8.236784
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
# duration_ms 24.006668

→ Running tests/ui/similar-content-card.test.mjs
TAP version 13
# Subtest: cached thumbnails reuse existing src without lazy-loading
ok 1 - cached thumbnails reuse existing src without lazy-loading
  ---
  duration_ms: 264.235864
  type: 'test'
  ...
# Subtest: uncached thumbnails use fallback, cache on load, and retain blur state
ok 2 - uncached thumbnails use fallback, cache on load, and retain blur state
  ---
  duration_ms: 35.440819
  type: 'test'
  ...
# Subtest: primary clicks trigger onPlay while modifiers and right clicks do not
ok 3 - primary clicks trigger onPlay while modifiers and right clicks do not
  ---
  duration_ms: 18.790251
  type: 'test'
  ...
# Subtest: author identity fields render supplied values and datasets
ok 4 - author identity fields render supplied values and datasets
  ---
  duration_ms: 14.900749
  type: 'test'
  ...
# Subtest: view counter wiring exposes pointer datasets
ok 5 - view counter wiring exposes pointer datasets
  ---
  duration_ms: 16.756298
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
# duration_ms 369.808396

→ Running tests/ui/similarContentController.test.mjs
TAP version 13
# Subtest: SimilarContentController
    # Subtest: extractDTagValue
        # Subtest: should return the 'd' tag value
        ok 1 - should return the 'd' tag value
          ---
          duration_ms: 1.761005
          type: 'test'
          ...
        # Subtest: should return empty string if no 'd' tag
        ok 2 - should return empty string if no 'd' tag
          ---
          duration_ms: 0.498913
          type: 'test'
          ...
        1..2
    ok 1 - extractDTagValue
      ---
      duration_ms: 3.287384
      type: 'suite'
      ...
    # Subtest: computeCandidates
        # Subtest: should return empty array if no active video
        ok 1 - should return empty array if no active video
          ---
          duration_ms: 1.957238
          type: 'test'
          ...
        # Subtest: should compute similar candidates based on tags
        ok 2 - should compute similar candidates based on tags
          ---
          duration_ms: 1.514724
          type: 'test'
          ...
        # Subtest: should exclude blocked authors
        ok 3 - should exclude blocked authors
          ---
          duration_ms: 1.008136
          type: 'test'
          ...
        # Subtest: should prioritize higher shared tag count
        ok 4 - should prioritize higher shared tag count
          ---
          duration_ms: 0.860453
          type: 'test'
          ...
        1..4
    ok 2 - computeCandidates
      ---
      duration_ms: 5.910228
      type: 'suite'
      ...
    # Subtest: updateModal
        # Subtest: should clear similar content if no active video
        ok 1 - should clear similar content if no active video
          ---
          duration_ms: 0.45273
          type: 'test'
          ...
        # Subtest: should set similar content if matches found
        ok 2 - should set similar content if matches found
          ---
          duration_ms: 0.802168
          type: 'test'
          ...
        # Subtest: should clear similar content if no matches found
        ok 3 - should clear similar content if no matches found
          ---
          duration_ms: 0.721398
          type: 'test'
          ...
        1..3
    ok 3 - updateModal
      ---
      duration_ms: 2.365935
      type: 'suite'
      ...
    1..3
ok 1 - SimilarContentController
  ---
  duration_ms: 12.616708
  type: 'suite'
  ...
1..1
# tests 9
# suites 4
# pass 9
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 33.764582

→ Running tests/ui/storageService.test.mjs
TAP version 13
[bitvid] [StorageService] Unlocked storage for 00000000...
# Subtest: StorageService
    # Subtest: should unlock storage with a valid signer
    ok 1 - should unlock storage with a valid signer
      ---
      duration_ms: 22.317991
      type: 'test'
      ...
[bitvid] [StorageService] Unlocked storage for 00000000...
[bitvid] [StorageService] Saved connection r2-test-1
    # Subtest: should save and retrieve an R2 connection
    ok 2 - should save and retrieve an R2 connection
      ---
      duration_ms: 7.908484
      type: 'test'
      ...
[bitvid] [StorageService] Unlocked storage for 00000000...
[bitvid] [StorageService] Saved connection s3-generic-1
    # Subtest: should save and retrieve a Generic S3 connection with extra fields
    ok 3 - should save and retrieve a Generic S3 connection with extra fields
      ---
      duration_ms: 4.032346
      type: 'test'
      ...
    # Subtest: should fail to get connection if locked
    ok 4 - should fail to get connection if locked
      ---
      duration_ms: 1.339109
      type: 'test'
      ...
    1..4
ok 1 - StorageService
  ---
  duration_ms: 164.530122
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
# duration_ms 172.778146

→ Running tests/ui/tag-pill-list.test.mjs
TAP version 13
# Subtest: renderTagPillStrip builds buttons with labels and icons
ok 1 - renderTagPillStrip builds buttons with labels and icons
  ---
  duration_ms: 99.009387
  type: 'test'
  ...
# Subtest: renderTagPillStrip applies preference state styling
ok 2 - renderTagPillStrip applies preference state styling
  ---
  duration_ms: 12.716758
  type: 'test'
  ...
# Subtest: renderTagPillStrip wires the activation callback
ok 3 - renderTagPillStrip wires the activation callback
  ---
  duration_ms: 12.160115
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
# duration_ms 142.519691

→ Running tests/ui/tag-preference-menu.test.mjs
TAP version 13
# Subtest: createTagPreferenceMenu renders heading and actions
ok 1 - createTagPreferenceMenu renders heading and actions
  ---
  duration_ms: 93.258603
  type: 'test'
  ...
# Subtest: createTagPreferenceMenu disables actions based on membership and login
ok 2 - createTagPreferenceMenu disables actions based on membership and login
  ---
  duration_ms: 14.412429
  type: 'test'
  ...
# Subtest: createTagPreferenceMenu forwards actions to callback
ok 3 - createTagPreferenceMenu forwards actions to callback
  ---
  duration_ms: 11.988284
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
# duration_ms 136.951496

→ Running tests/ui/tagPreferenceMenuController.test.mjs
TAP version 13
# Subtest: TagPreferenceMenuController
    # Subtest: ensurePopover
        # Subtest: should create a new popover entry if one does not exist
        ok 1 - should create a new popover entry if one does not exist
          ---
          duration_ms: 2.472343
          type: 'test'
          ...
        # Subtest: should return existing entry if one exists
        ok 2 - should return existing entry if one exists
          ---
          duration_ms: 0.503622
          type: 'test'
          ...
        # Subtest: should return null if trigger or tag is missing
        ok 3 - should return null if trigger or tag is missing
          ---
          duration_ms: 0.925381
          type: 'test'
          ...
        1..3
    ok 1 - ensurePopover
      ---
      duration_ms: 5.225392
      type: 'suite'
      ...
    # Subtest: requestMenu
        # Subtest: should ensure popover, close others, and open the requested one
        ok 1 - should ensure popover, close others, and open the requested one
          ---
          duration_ms: 1.280502
          type: 'test'
          ...
        # Subtest: should close the popover if it is already open
        ok 2 - should close the popover if it is already open
          ---
          duration_ms: 0.653208
          type: 'test'
          ...
        1..2
    ok 2 - requestMenu
      ---
      duration_ms: 2.17847
      type: 'suite'
      ...
    # Subtest: handleMenuAction
        # Subtest: should call service method and notify update
        ok 1 - should call service method and notify update
          ---
          duration_ms: 0.685233
          type: 'test'
          ...
        # Subtest: should handle error and call showError
        ok 2 - should handle error and call showError
          ---
          duration_ms: 0.922618
          type: 'test'
          ...
        1..2
    ok 3 - handleMenuAction
      ---
      duration_ms: 1.996507
      type: 'suite'
      ...
    # Subtest: persistPreferencesFromMenu
        # Subtest: should call service.publish
        ok 1 - should call service.publish
          ---
          duration_ms: 0.67313
          type: 'test'
          ...
        # Subtest: should reuse in-flight promise
        ok 2 - should reuse in-flight promise
          ---
          duration_ms: 0.634809
          type: 'test'
          ...
        1..2
    ok 4 - persistPreferencesFromMenu
      ---
      duration_ms: 1.497466
      type: 'suite'
      ...
    1..4
ok 1 - TagPreferenceMenuController
  ---
  duration_ms: 12.014772
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
# duration_ms 32.524777

→ Running tests/ui/torrentStatusController.test.mjs
TAP version 13
# Subtest: TorrentStatusController throws if accessor is missing
ok 1 - TorrentStatusController throws if accessor is missing
  ---
  duration_ms: 1.53475
  type: 'test'
  ...
# Subtest: TorrentStatusController updates video modal and calls onRemovePoster
ok 2 - TorrentStatusController updates video modal and calls onRemovePoster
  ---
  duration_ms: 0.68553
  type: 'test'
  ...
# Subtest: TorrentStatusController handles missing modal gracefully
ok 3 - TorrentStatusController handles missing modal gracefully
  ---
  duration_ms: 0.362287
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
# duration_ms 16.006354

→ Running tests/ui/uploadModal-integration.test.mjs
TAP version 13
# Subtest: UploadModal Integration
    # Subtest: should detect default R2 connection and show summary when loaded and unlocked
    ok 1 - should detect default R2 connection and show summary when loaded and unlocked
      ---
      duration_ms: 69.381263
      type: 'test'
      ...
    # Subtest: should handle locked state and unlock flow
    ok 2 - should handle locked state and unlock flow
      ---
      duration_ms: 39.183695
      type: 'test'
      ...
    1..2
ok 1 - UploadModal Integration
  ---
  duration_ms: 12321.053908
  type: 'suite'
  ...
1..1
# tests 2
# suites 1
# pass 2
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 12329.956997

→ Running tests/ui/uploadModal-reset.test.mjs
TAP version 13
# Subtest: UploadModal Reset Logic
    # Subtest: should reset upload state and inputs when resetUploads is called
    ok 1 - should reset upload state and inputs when resetUploads is called
      ---
      duration_ms: 105.661212
      type: 'test'
      ...
    # Subtest: should guard against zombie callbacks when upload is reset during process
    ok 2 - should guard against zombie callbacks when upload is reset during process
      ---
      duration_ms: 43.911799
      type: 'test'
      ...
    # Subtest: should call resetUploads when close is called
    ok 3 - should call resetUploads when close is called
      ---
      duration_ms: 33.280917
      type: 'test'
      ...
    1..3
ok 1 - UploadModal Reset Logic
  ---
  duration_ms: 12404.656887
  type: 'suite'
  ...
1..1
# tests 3
# suites 1
# pass 3
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 12417.258483

→ Running tests/ui/url-health-controller.test.mjs
TAP version 13
# Subtest: UrlHealthController
    # Subtest: probeUrl returns ok for valid URL
    ok 1 - probeUrl returns ok for valid URL
      ---
      duration_ms: 96.390218
      type: 'test'
      ...
    # Subtest: probeUrl returns error for 404
    ok 2 - probeUrl returns error for 404
      ---
      duration_ms: 24.435106
      type: 'test'
      ...
    # Subtest: handleUrlHealthBadge updates badge
    ok 3 - handleUrlHealthBadge updates badge
      ---
      duration_ms: 75.420018
      type: 'test'
      ...
    # Subtest: getUrlHealthPlaceholderMarkup returns string
    ok 4 - getUrlHealthPlaceholderMarkup returns string
      ---
      duration_ms: 10.391231
      type: 'test'
      ...
    1..4
ok 1 - UrlHealthController
  ---
  duration_ms: 208.689587
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
# duration_ms 223.70488

→ Running tests/ui/video-list-view-popular-tags.test.mjs
TAP version 13
# Subtest: VideoListView renders sorted popular tag pills
ok 1 - VideoListView renders sorted popular tag pills
  ---
  duration_ms: 145.74392
  type: 'test'
  ...
# Subtest: VideoListView applies tag preference variants to popular tags
ok 2 - VideoListView applies tag preference variants to popular tags
  ---
  duration_ms: 30.563817
  type: 'test'
  ...
# Subtest: VideoListView hides popular tags when no tags are available
ok 3 - VideoListView hides popular tags when no tags are available
  ---
  duration_ms: 17.345594
  type: 'test'
  ...
# Subtest: VideoListView setModerationBlockHandler stores callable
ok 4 - VideoListView setModerationBlockHandler stores callable
  ---
  duration_ms: 10.565169
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
# duration_ms 218.441975

→ Running tests/ui/video-list-view-sorting.test.mjs
TAP version 13
# Subtest: VideoListView sorts cards by original posted timestamp
ok 1 - VideoListView sorts cards by original posted timestamp
  ---
  duration_ms: 145.88348
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
# duration_ms 162.489601

→ Running tests/unit/app_guard_logic.test.mjs
TAP version 13
# Subtest: Application.resetTorrentStats logic
    # Subtest: does not throw when videoModal is null
    ok 1 - does not throw when videoModal is null
      ---
      duration_ms: 0.964953
      type: 'test'
      ...
    # Subtest: does not throw when videoModal is undefined
    ok 2 - does not throw when videoModal is undefined
      ---
      duration_ms: 0.214329
      type: 'test'
      ...
    # Subtest: does not throw when videoModal lacks resetStats
    ok 3 - does not throw when videoModal lacks resetStats
      ---
      duration_ms: 0.268005
      type: 'test'
      ...
    # Subtest: calls resetStats when available
    ok 4 - calls resetStats when available
      ---
      duration_ms: 0.308196
      type: 'test'
      ...
    1..4
ok 1 - Application.resetTorrentStats logic
  ---
  duration_ms: 5.020718
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
# duration_ms 17.48564

→ Running tests/unit/client-count-resilience.test.mjs
TAP version 13
# Subtest: NostrClient resilience to COUNT timeouts
ok 1 - NostrClient resilience to COUNT timeouts
  ---
  duration_ms: 3408.067807
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
# duration_ms 3415.691649

→ Running tests/unit/comment-avatar.test.mjs
TAP version 13
# Subtest: normalizeCommentAvatarKey handles inputs correctly
ok 1 - normalizeCommentAvatarKey handles inputs correctly
  ---
  duration_ms: 1.19086
  type: 'test'
  ...
# Subtest: resolveCommentAvatarAsset resolves avatars correctly
ok 2 - resolveCommentAvatarAsset resolves avatars correctly
  ---
  duration_ms: 1.405711
  type: 'test'
  ...
# Subtest: registerCommentAvatarFailure registers failures correctly
ok 3 - registerCommentAvatarFailure registers failures correctly
  ---
  duration_ms: 0.44746
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
# duration_ms 16.519601

→ Running tests/unit/editModalController.test.mjs
TAP version 13
# Subtest: EditModalController
    # Subtest: open()
        # Subtest: should resolve target and open modal if authorized
        ok 1 - should resolve target and open modal if authorized
          ---
          duration_ms: 2.76556
          type: 'test'
          ...
        # Subtest: should show error if not logged in
        ok 2 - should show error if not logged in
          ---
          duration_ms: 1.177144
          type: 'test'
          ...
        # Subtest: should show error if user does not own video
        ok 3 - should show error if user does not own video
          ---
          duration_ms: 0.672099
          type: 'test'
          ...
        # Subtest: should handle modal load errors
        ok 4 - should handle modal load errors
          ---
          duration_ms: 1.049596
          type: 'test'
          ...
        1..4
    ok 1 - open()
      ---
      duration_ms: 7.112693
      type: 'suite'
      ...
    # Subtest: handleSubmit()
        # Subtest: should handle successful submission
        ok 1 - should handle successful submission
          ---
          duration_ms: 1.173174
          type: 'test'
          ...
        # Subtest: should show error if not logged in
        ok 2 - should show error if not logged in
          ---
          duration_ms: 0.44987
          type: 'test'
          ...
        # Subtest: should handle submission errors
        ok 3 - should handle submission errors
          ---
          duration_ms: 1.52175
          type: 'test'
          ...
        1..3
    ok 2 - handleSubmit()
      ---
      duration_ms: 3.837385
      type: 'suite'
      ...
    1..2
ok 1 - EditModalController
  ---
  duration_ms: 11.876344
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
# duration_ms 35.027829

→ Running tests/unit/embed_player_modal.test.mjs
TAP version 13
# Subtest: EmbedPlayerModal interface
    # Subtest: has expected methods
    ok 1 - has expected methods
      ---
      duration_ms: 2.395398
      type: 'test'
      ...
    # Subtest: resetStats is no-op and does not throw
    ok 2 - resetStats is no-op and does not throw
      ---
      duration_ms: 0.376021
      type: 'test'
      ...
    1..2
ok 1 - EmbedPlayerModal interface
  ---
  duration_ms: 4.202006
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
# duration_ms 15.9963

→ Running tests/unit/embed-accent.test.mjs
TAP version 13
# Subtest: embed accent color configuration
ok 1 - embed accent color configuration
  ---
  duration_ms: 2.478982
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
# duration_ms 12.475386

→ Running tests/unit/hashChangeHandler.test.mjs
TAP version 13
# Subtest: createHashChangeHandler
    # Subtest: loads default view if hash is empty
    ok 1 - loads default view if hash is empty
      ---
      duration_ms: 1.23342
      type: 'test'
      ...
    # Subtest: redirects legacy view
    ok 2 - redirects legacy view
      ---
      duration_ms: 0.262385
      type: 'test'
      ...
    # Subtest: skips redundant reload
    ok 3 - skips redundant reload
      ---
      duration_ms: 0.254096
      type: 'test'
      ...
    1..3
ok 1 - createHashChangeHandler
  ---
  duration_ms: 3.614111
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
# duration_ms 15.496541

→ Running tests/unit/notificationController.test.mjs
TAP version 13
# Subtest: NotificationController
    # Subtest: should instantiate correctly
    ok 1 - should instantiate correctly
      ---
      duration_ms: 2.418414
      type: 'test'
      ...
    # Subtest: showError should update text content and show container
    ok 2 - showError should update text content and show container
      ---
      duration_ms: 1.01971
      type: 'test'
      ...
    # Subtest: showError should hide container when msg is empty
    ok 3 - showError should hide container when msg is empty
      ---
      duration_ms: 1.089818
      type: 'test'
      ...
    # Subtest: updateNotificationPortalVisibility should toggle active class on portal
    ok 4 - updateNotificationPortalVisibility should toggle active class on portal
      ---
      duration_ms: 0.969252
      type: 'test'
      ...
    # Subtest: showSuccess should update text content and show container
    ok 5 - showSuccess should update text content and show container
      ---
      duration_ms: 0.886806
      type: 'test'
      ...
    # Subtest: showStatus should update text content and show container
    ok 6 - showStatus should update text content and show container
      ---
      duration_ms: 0.818661
      type: 'test'
      ...
    # Subtest: showStatus should handle spinner option
    ok 7 - showStatus should handle spinner option
      ---
      duration_ms: 0.664987
      type: 'test'
      ...
    1..7
ok 1 - NotificationController
  ---
  duration_ms: 9.761434
  type: 'suite'
  ...
1..1
# tests 7
# suites 1
# pass 7
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 29.488758

→ Running tests/unit/searchFilters.test.mjs
TAP version 13
# Subtest: parseFilterQuery collects filters and text tokens
ok 1 - parseFilterQuery collects filters and text tokens
  ---
  duration_ms: 3.157776
  type: 'test'
  ...
# Subtest: serializeFiltersToQuery emits filter tokens in order
ok 2 - serializeFiltersToQuery emits filter tokens in order
  ---
  duration_ms: 0.385362
  type: 'test'
  ...
# Subtest: video search filter matcher enforces tags, duration, and nsfw when allowed
ok 3 - video search filter matcher enforces tags, duration, and nsfw when allowed
  ---
  duration_ms: 0.598117
  type: 'test'
  ...
# Subtest: video search filter matcher blocks nsfw when disallowed and requires url
ok 4 - video search filter matcher blocks nsfw when disallowed and requires url
  ---
  duration_ms: 0.262898
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
# duration_ms 17.256646

→ Running tests/unit/security-config.test.mjs
TAP version 13
# Subtest: Security configuration: Development mode should be disabled in production
ok 1 - Security configuration: Development mode should be disabled in production
  ---
  duration_ms: 2.439171
  type: 'test'
  ...
# Subtest: Security configuration: Verbose diagnostics should be disabled in production
ok 2 - Security configuration: Verbose diagnostics should be disabled in production
  ---
  duration_ms: 0.19805
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
# duration_ms 13.854429

→ Running tests/unit/services/moderationDecorator.test.mjs
TAP version 13
# Subtest: ModerationDecorator
    # Subtest: deriveModerationReportType
        # Subtest: should return empty string for null summary
        ok 1 - should return empty string for null summary
          ---
          duration_ms: 1.163264
          type: 'test'
          ...
        # Subtest: should return empty string for empty types
        ok 2 - should return empty string for empty types
          ---
          duration_ms: 0.227039
          type: 'test'
          ...
        # Subtest: should return the type with highest trusted count
        ok 3 - should return the type with highest trusted count
          ---
          duration_ms: 0.218868
          type: 'test'
          ...
        1..3
    ok 1 - deriveModerationReportType
      ---
      duration_ms: 2.687552
      type: 'suite'
      ...
    # Subtest: deriveModerationTrustedCount
        # Subtest: should return trusted count for specific type
        ok 1 - should return trusted count for specific type
          ---
          duration_ms: 0.424899
          type: 'test'
          ...
        # Subtest: should fall back to totalTrusted if type not found
        ok 2 - should fall back to totalTrusted if type not found
          ---
          duration_ms: 0.194328
          type: 'test'
          ...
        1..2
    ok 2 - deriveModerationTrustedCount
      ---
      duration_ms: 0.862175
      type: 'suite'
      ...
    # Subtest: getReporterDisplayName
        # Subtest: should return name from cache if available
        ok 1 - should return name from cache if available
          ---
          duration_ms: 0.407382
          type: 'test'
          ...
        # Subtest: should return short formatted string if not in cache
        ok 2 - should return short formatted string if not in cache
          ---
          duration_ms: 1.622465
          type: 'test'
          ...
        1..2
    ok 3 - getReporterDisplayName
      ---
      duration_ms: 2.465473
      type: 'suite'
      ...
    # Subtest: decorateVideo
        # Subtest: should return the video object if input is invalid
        ok 1 - should return the video object if input is invalid
          ---
          duration_ms: 0.706978
          type: 'test'
          ...
        # Subtest: should decorate video with basic moderation
        ok 2 - should decorate video with basic moderation
          ---
          duration_ms: 0.634856
          type: 'test'
          ...
        # Subtest: should flag video as hidden if trusted mute count exceeds threshold
        ok 3 - should flag video as hidden if trusted mute count exceeds threshold
          ---
          duration_ms: 0.579276
          type: 'test'
          ...
        1..3
    ok 4 - decorateVideo
      ---
      duration_ms: 2.157165
      type: 'suite'
      ...
    # Subtest: updateSettings
        # Subtest: should update moderation settings and affect decoration
        ok 1 - should update moderation settings and affect decoration
          ---
          duration_ms: 0.59731
          type: 'test'
          ...
        1..1
    ok 5 - updateSettings
      ---
      duration_ms: 0.699422
      type: 'suite'
      ...
    1..5
ok 1 - ModerationDecorator
  ---
  duration_ms: 9.948464
  type: 'suite'
  ...
1..1
# tests 11
# suites 6
# pass 11
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 34.844942

→ Running tests/unit/services/r2Service.storage-config.test.mjs
TAP version 13
[bitvid] [R2] Verifying access for Bucket: 'r2-meta-bucket' in Account: 'acc…23'
# Subtest: R2Service bucket selection
    # Subtest: uses meta.bucket for ensureBucketExists and multipartUpload
    ok 1 - uses meta.bucket for ensureBucketExists and multipartUpload
      ---
      duration_ms: 31.097087
      type: 'test'
      ...
    # Subtest: uses configured meta.bucket when verifying public access
    ok 2 - uses configured meta.bucket when verifying public access
      ---
      duration_ms: 2.243997
      type: 'test'
      ...
    1..2
ok 1 - R2Service bucket selection
  ---
  duration_ms: 34.841002
  type: 'suite'
  ...
1..1
# tests 2
# suites 1
# pass 2
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 46.573893

→ Running tests/unit/ui/videoModalController.test.mjs
TAP version 13
# Subtest: VideoModalController bindEvents attaches listeners
ok 1 - VideoModalController bindEvents attaches listeners
  ---
  duration_ms: 1.409823
  type: 'test'
  ...
# Subtest: VideoModalController handleShareNostr triggers callback
ok 2 - VideoModalController handleShareNostr triggers callback
  ---
  duration_ms: 0.455467
  type: 'test'
  ...
# Subtest: VideoModalController handleCopyCdn triggers clipboard write
ok 3 - VideoModalController handleCopyCdn triggers clipboard write
  ---
  duration_ms: 6.57861
  type: 'test'
  ...
# Subtest: VideoModalController handleCopyMagnet triggers callback
ok 4 - VideoModalController handleCopyMagnet triggers callback
  ---
  duration_ms: 0.3534
  type: 'test'
  ...
# Subtest: VideoModalController handleSourceSwitch calls playVideoWithFallback
ok 5 - VideoModalController handleSourceSwitch calls playVideoWithFallback
  ---
  duration_ms: 2.326082
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
# duration_ms 18.50282

→ Running tests/utils/cardSourceVisibility.test.mjs
TAP version 13
# Subtest: cardSourceVisibility
    # Subtest: updateVideoCardSourceVisibility
        # Subtest: should handle null or undefined input gracefully
        ok 1 - should handle null or undefined input gracefully
          ---
          duration_ms: 5.19572
          type: 'test'
          ...
        # Subtest: should resolve card from object with .card property
        ok 2 - should resolve card from object with .card property
          ---
          duration_ms: 2.657891
          type: 'test'
          ...
        # Subtest: should always show card if owner is viewer
        ok 3 - should always show card if owner is viewer
          ---
          duration_ms: 1.612743
          type: 'test'
          ...
        # Subtest: should show card if at least one source is healthy
        ok 4 - should show card if at least one source is healthy
          ---
          duration_ms: 1.626474
          type: 'test'
          ...
        # Subtest: should show card if at least one source is checking/pending
        ok 5 - should show card if at least one source is checking/pending
          ---
          duration_ms: 1.736124
          type: 'test'
          ...
        # Subtest: should hide card ONLY if both sources are failed (not healthy and not pending)
        ok 6 - should hide card ONLY if both sources are failed (not healthy and not pending)
          ---
          duration_ms: 1.106965
          type: 'test'
          ...
        # Subtest: should recover from hidden state when source becomes healthy
        ok 7 - should recover from hidden state when source becomes healthy
          ---
          duration_ms: 1.079671
          type: 'test'
          ...
        # Subtest: should check closest .card if element is not .card itself
        ok 8 - should check closest .card if element is not .card itself
          ---
          duration_ms: 7.904189
          type: 'test'
          ...
        1..8
    ok 1 - updateVideoCardSourceVisibility
      ---
      duration_ms: 24.43969
      type: 'suite'
      ...
    1..1
ok 1 - cardSourceVisibility
  ---
  duration_ms: 25.390233
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
# duration_ms 44.462654

→ Running tests/utils/domUtils.test.mjs
TAP version 13
# Subtest: domUtils
    # Subtest: escapeHTML
        # Subtest: should return empty string for null or undefined
        ok 1 - should return empty string for null or undefined
          ---
          duration_ms: 1.166924
          type: 'test'
          ...
        # Subtest: should return the string as is if no special characters are present
        ok 2 - should return the string as is if no special characters are present
          ---
          duration_ms: 0.240031
          type: 'test'
          ...
        # Subtest: should escape special characters
        ok 3 - should escape special characters
          ---
          duration_ms: 0.372206
          type: 'test'
          ...
        # Subtest: should escape multiple occurrences of special characters
        ok 4 - should escape multiple occurrences of special characters
          ---
          duration_ms: 0.389133
          type: 'test'
          ...
        # Subtest: should handle mixed content correctly
        ok 5 - should handle mixed content correctly
          ---
          duration_ms: 0.247428
          type: 'test'
          ...
        # Subtest: should convert non-string inputs to string and escape
        ok 6 - should convert non-string inputs to string and escape
          ---
          duration_ms: 0.172881
          type: 'test'
          ...
        1..6
    ok 1 - escapeHTML
      ---
      duration_ms: 3.854485
      type: 'suite'
      ...
    # Subtest: removeTrackingScripts
        # Subtest: should do nothing if root is null or undefined
        ok 1 - should do nothing if root is null or undefined
          ---
          duration_ms: 0.442022
          type: 'test'
          ...
        # Subtest: should do nothing if root has no querySelectorAll
        ok 2 - should do nothing if root has no querySelectorAll
          ---
          duration_ms: 0.419101
          type: 'test'
          ...
        # Subtest: should remove scripts matching the tracking pattern
        ok 3 - should remove scripts matching the tracking pattern
          ---
          duration_ms: 22.489694
          type: 'test'
          ...
        # Subtest: should not remove inline scripts (no src)
        ok 4 - should not remove inline scripts (no src)
          ---
          duration_ms: 2.549202
          type: 'test'
          ...
        # Subtest: should remove scripts where src ends with tracking.js
        ok 5 - should remove scripts where src ends with tracking.js
          ---
          duration_ms: 1.228595
          type: 'test'
          ...
        # Subtest: should remove scripts where src contains /tracking.js
        ok 6 - should remove scripts where src contains /tracking.js
          ---
          duration_ms: 0.860376
          type: 'test'
          ...
        1..6
    ok 2 - removeTrackingScripts
      ---
      duration_ms: 28.622938
      type: 'suite'
      ...
    1..2
ok 1 - domUtils
  ---
  duration_ms: 33.36893
  type: 'suite'
  ...
1..1
# tests 12
# suites 3
# pass 12
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 54.16741

→ Running tests/utils/hex.test.mjs
TAP version 13
# Subtest: hex utils
    # Subtest: normalizeHexString
        # Subtest: should return empty string for non-string inputs
        ok 1 - should return empty string for non-string inputs
          ---
          duration_ms: 0.93267
          type: 'test'
          ...
        # Subtest: should return empty string for empty or whitespace-only strings
        ok 2 - should return empty string for empty or whitespace-only strings
          ---
          duration_ms: 0.328249
          type: 'test'
          ...
        # Subtest: should trim and lowercase valid hex strings
        ok 3 - should trim and lowercase valid hex strings
          ---
          duration_ms: 0.182855
          type: 'test'
          ...
        1..3
    ok 1 - normalizeHexString
      ---
      duration_ms: 2.387932
      type: 'suite'
      ...
    # Subtest: aliases
        # Subtest: should export normalizeHexId as an alias
        ok 1 - should export normalizeHexId as an alias
          ---
          duration_ms: 0.264545
          type: 'test'
          ...
        # Subtest: should export normalizeHexPubkey as an alias
        ok 2 - should export normalizeHexPubkey as an alias
          ---
          duration_ms: 0.136884
          type: 'test'
          ...
        1..2
    ok 2 - aliases
      ---
      duration_ms: 0.696826
      type: 'suite'
      ...
    # Subtest: HEX64_REGEX
        # Subtest: should match valid 64-character hex strings
        ok 1 - should match valid 64-character hex strings
          ---
          duration_ms: 0.538974
          type: 'test'
          ...
        # Subtest: should not match strings with incorrect length
        ok 2 - should not match strings with incorrect length
          ---
          duration_ms: 0.417713
          type: 'test'
          ...
        # Subtest: should not match strings with non-hex characters
        ok 3 - should not match strings with non-hex characters
          ---
          duration_ms: 0.225677
          type: 'test'
          ...
        # Subtest: should not match empty strings
        ok 4 - should not match empty strings
          ---
          duration_ms: 0.244762
          type: 'test'
          ...
        1..4
    ok 3 - HEX64_REGEX
      ---
      duration_ms: 2.136514
      type: 'suite'
      ...
    # Subtest: normalizeHexHash
        # Subtest: should return empty string for non-string inputs
        ok 1 - should return empty string for non-string inputs
          ---
          duration_ms: 0.342444
          type: 'test'
          ...
        # Subtest: should return empty string for invalid hex
        ok 2 - should return empty string for invalid hex
          ---
          duration_ms: 0.127174
          type: 'test'
          ...
        # Subtest: should return normalized hex for valid inputs
        ok 3 - should return normalized hex for valid inputs
          ---
          duration_ms: 0.11406
          type: 'test'
          ...
        1..3
    ok 4 - normalizeHexHash
      ---
      duration_ms: 0.81094
      type: 'suite'
      ...
    1..4
ok 1 - hex utils
  ---
  duration_ms: 7.105404
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
# duration_ms 29.900817

→ Running tests/utils/linkPreviewSettings.test.mjs
TAP version 13
# Subtest: linkPreviewSettings
    # Subtest: getLinkPreviewSettings
        # Subtest: returns defaults when storage is empty
        ok 1 - returns defaults when storage is empty
          ---
          duration_ms: 2.633505
          type: 'test'
          ...
        # Subtest: returns stored settings
        ok 2 - returns stored settings
          ---
          duration_ms: 1.168046
          type: 'test'
          ...
        # Subtest: returns defaults when storage is invalid
        ok 3 - returns defaults when storage is invalid
          ---
          duration_ms: 0.97152
          type: 'test'
          ...
        # Subtest: sanitizes settings from storage
        ok 4 - sanitizes settings from storage
          ---
          duration_ms: 0.795127
          type: 'test'
          ...
        1..4
    ok 1 - getLinkPreviewSettings
      ---
      duration_ms: 6.907792
      type: 'suite'
      ...
    # Subtest: setLinkPreviewAutoFetch
        # Subtest: updates settings and persists to storage
        ok 1 - updates settings and persists to storage
          ---
          duration_ms: 1.292858
          type: 'test'
          ...
        # Subtest: emits an event on change
        ok 2 - emits an event on change
          ---
          duration_ms: 1.513974
          type: 'test'
          ...
        1..2
    ok 2 - setLinkPreviewAutoFetch
      ---
      duration_ms: 3.140789
      type: 'suite'
      ...
    # Subtest: allowLinkPreviewDomain
        # Subtest: adds a domain and persists to storage
        ok 1 - adds a domain and persists to storage
          ---
          duration_ms: 0.853624
          type: 'test'
          ...
        # Subtest: handles duplicates
        ok 2 - handles duplicates
          ---
          duration_ms: 0.705548
          type: 'test'
          ...
        # Subtest: normalizes domains
        ok 3 - normalizes domains
          ---
          duration_ms: 0.584915
          type: 'test'
          ...
        # Subtest: emits an event on change
        ok 4 - emits an event on change
          ---
          duration_ms: 0.730948
          type: 'test'
          ...
        # Subtest: respects silent option
        ok 5 - respects silent option
          ---
          duration_ms: 0.402804
          type: 'test'
          ...
        1..5
    ok 3 - allowLinkPreviewDomain
      ---
      duration_ms: 3.837636
      type: 'suite'
      ...
    # Subtest: isLinkPreviewDomainAllowed
        # Subtest: returns true for allowed domains
        ok 1 - returns true for allowed domains
          ---
          duration_ms: 0.547708
          type: 'test'
          ...
        # Subtest: returns false for disallowed domains
        ok 2 - returns false for disallowed domains
          ---
          duration_ms: 0.312223
          type: 'test'
          ...
        # Subtest: handles normalization
        ok 3 - handles normalization
          ---
          duration_ms: 0.716226
          type: 'test'
          ...
        # Subtest: accepts settings object as second argument
        ok 4 - accepts settings object as second argument
          ---
          duration_ms: 0.383931
          type: 'test'
          ...
        1..4
    ok 4 - isLinkPreviewDomainAllowed
      ---
      duration_ms: 2.197064
      type: 'suite'
      ...
    # Subtest: subscribeToLinkPreviewSettings
        # Subtest: calls callback on event emission
        ok 1 - calls callback on event emission
          ---
          duration_ms: 0.761762
          type: 'test'
          ...
        # Subtest: unsubscribes correctly
        ok 2 - unsubscribes correctly
          ---
          duration_ms: 0.672496
          type: 'test'
          ...
        1..2
    ok 5 - subscribeToLinkPreviewSettings
      ---
      duration_ms: 1.58242
      type: 'suite'
      ...
    1..5
ok 1 - linkPreviewSettings
  ---
  duration_ms: 19.037316
  type: 'suite'
  ...
1..1
# tests 17
# suites 6
# pass 17
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 45.340348

→ Running tests/utils/lruCache.test.mjs
TAP version 13
# Subtest: LRUCache
    # Subtest: should initialize with default options
    ok 1 - should initialize with default options
      ---
      duration_ms: 1.525584
      type: 'test'
      ...
    # Subtest: should store and retrieve values
    ok 2 - should store and retrieve values
      ---
      duration_ms: 0.417885
      type: 'test'
      ...
    # Subtest: should evict oldest item when limit is reached
    ok 3 - should evict oldest item when limit is reached
      ---
      duration_ms: 0.272055
      type: 'test'
      ...
    # Subtest: should refresh recency on access
    ok 4 - should refresh recency on access
      ---
      duration_ms: 0.428196
      type: 'test'
      ...
    # Subtest: should update value and refresh recency on set
    ok 5 - should update value and refresh recency on set
      ---
      duration_ms: 0.672976
      type: 'test'
      ...
    # Subtest: should track stats
    ok 6 - should track stats
      ---
      duration_ms: 0.439803
      type: 'test'
      ...
    # Subtest: should clear cache
    ok 7 - should clear cache
      ---
      duration_ms: 0.20817
      type: 'test'
      ...
    1..7
ok 1 - LRUCache
  ---
  duration_ms: 5.697998
  type: 'suite'
  ...
1..1
# tests 7
# suites 1
# pass 7
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 21.523483

→ Running tests/utils/profileMedia.test.mjs
TAP version 13
# Subtest: sanitizeProfileMediaUrl handles non-string inputs
ok 1 - sanitizeProfileMediaUrl handles non-string inputs
  ---
  duration_ms: 1.621537
  type: 'test'
  ...
# Subtest: sanitizeProfileMediaUrl handles empty or whitespace-only strings
ok 2 - sanitizeProfileMediaUrl handles empty or whitespace-only strings
  ---
  duration_ms: 0.258215
  type: 'test'
  ...
# Subtest: sanitizeProfileMediaUrl trims whitespace and removes quotes
ok 3 - sanitizeProfileMediaUrl trims whitespace and removes quotes
  ---
  duration_ms: 0.827743
  type: 'test'
  ...
# Subtest: sanitizeProfileMediaUrl allows data:image/ URLs
ok 4 - sanitizeProfileMediaUrl allows data:image/ URLs
  ---
  duration_ms: 0.171841
  type: 'test'
  ...
# Subtest: sanitizeProfileMediaUrl allows blob: URLs
ok 5 - sanitizeProfileMediaUrl allows blob: URLs
  ---
  duration_ms: 0.331282
  type: 'test'
  ...
# Subtest: sanitizeProfileMediaUrl rejects specific placeholder images
ok 6 - sanitizeProfileMediaUrl rejects specific placeholder images
  ---
  duration_ms: 0.200311
  type: 'test'
  ...
# Subtest: sanitizeProfileMediaUrl normalizes IPFS URLs
ok 7 - sanitizeProfileMediaUrl normalizes IPFS URLs
  ---
  duration_ms: 0.364186
  type: 'test'
  ...
# Subtest: sanitizeProfileMediaUrl handles protocol-relative URLs
ok 8 - sanitizeProfileMediaUrl handles protocol-relative URLs
  ---
  duration_ms: 0.172713
  type: 'test'
  ...
# Subtest: sanitizeProfileMediaUrl allows relative paths
ok 9 - sanitizeProfileMediaUrl allows relative paths
  ---
  duration_ms: 0.52208
  type: 'test'
  ...
# Subtest: sanitizeProfileMediaUrl adds protocol to domains and localhost
ok 10 - sanitizeProfileMediaUrl adds protocol to domains and localhost
  ---
  duration_ms: 0.98588
  type: 'test'
  ...
# Subtest: sanitizeProfileMediaUrl coerces http to https except for localhost
ok 11 - sanitizeProfileMediaUrl coerces http to https except for localhost
  ---
  duration_ms: 0.253596
  type: 'test'
  ...
# Subtest: sanitizeProfileMediaUrl rejects unsupported patterns
ok 12 - sanitizeProfileMediaUrl rejects unsupported patterns
  ---
  duration_ms: 0.147366
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
# duration_ms 24.51129

→ Running tests/utils/video-deduper.test.mjs
TAP version 13
# Subtest: dedupeToNewestByRoot replaces entries with missing timestamps
ok 1 - dedupeToNewestByRoot replaces entries with missing timestamps
  ---
  duration_ms: 1.210448
  type: 'test'
  ...
# Subtest: dedupeToNewestByRoot replaces entries with non-numeric timestamps
ok 2 - dedupeToNewestByRoot replaces entries with non-numeric timestamps
  ---
  duration_ms: 1.535924
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
# duration_ms 13.613934

→ Running tests/utils/video-tags.test.mjs
TAP version 13
# Subtest: collectVideoTags dedupes across metadata sources and respects casing
ok 1 - collectVideoTags dedupes across metadata sources and respects casing
  ---
  duration_ms: 15.697753
  type: 'test'
  ...
# Subtest: collectVideoTags sorts case-insensitively and adds hashes when requested
ok 2 - collectVideoTags sorts case-insensitively and adds hashes when requested
  ---
  duration_ms: 0.431485
  type: 'test'
  ...
# Subtest: collectVideoTags handles malformed inputs safely
ok 3 - collectVideoTags handles malformed inputs safely
  ---
  duration_ms: 0.307011
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
# duration_ms 29.915768

→ Running tests/utils/videoPointer.test.mjs
TAP version 13
# Subtest: resolveVideoPointer returns address pointer with dTag
ok 1 - resolveVideoPointer returns address pointer with dTag
  ---
  duration_ms: 2.404843
  type: 'test'
  ...
# Subtest: resolveVideoPointer returns address pointer with videoRootId
ok 2 - resolveVideoPointer returns address pointer with videoRootId
  ---
  duration_ms: 0.333832
  type: 'test'
  ...
# Subtest: resolveVideoPointer returns event pointer with fallbackEventId
ok 3 - resolveVideoPointer returns event pointer with fallbackEventId
  ---
  duration_ms: 0.213035
  type: 'test'
  ...
# Subtest: resolveVideoPointer prioritizes dTag over videoRootId
ok 4 - resolveVideoPointer prioritizes dTag over videoRootId
  ---
  duration_ms: 0.321797
  type: 'test'
  ...
# Subtest: resolveVideoPointer prioritizes videoRootId over fallbackEventId
ok 5 - resolveVideoPointer prioritizes videoRootId over fallbackEventId
  ---
  duration_ms: 0.205076
  type: 'test'
  ...
# Subtest: resolveVideoPointer prioritizes dTag over fallbackEventId
ok 6 - resolveVideoPointer prioritizes dTag over fallbackEventId
  ---
  duration_ms: 0.26257
  type: 'test'
  ...
# Subtest: resolveVideoPointer includes relay in pointer
ok 7 - resolveVideoPointer includes relay in pointer
  ---
  duration_ms: 0.27396
  type: 'test'
  ...
# Subtest: resolveVideoPointer normalizes inputs
ok 8 - resolveVideoPointer normalizes inputs
  ---
  duration_ms: 0.213886
  type: 'test'
  ...
# Subtest: resolveVideoPointer uses default kind when kind is missing or invalid
ok 9 - resolveVideoPointer uses default kind when kind is missing or invalid
  ---
  duration_ms: 0.649148
  type: 'test'
  ...
# Subtest: resolveVideoPointer returns null for invalid inputs
ok 10 - resolveVideoPointer returns null for invalid inputs
  ---
  duration_ms: 0.602384
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
# duration_ms 23.27218

→ Running tests/utils/videoTimestamps.test.mjs
TAP version 13
# Subtest: getVideoRootIdentifier
    # Subtest: returns empty string for invalid inputs
    ok 1 - returns empty string for invalid inputs
      ---
      duration_ms: 2.244693
      type: 'test'
      ...
    # Subtest: returns videoRootId when present
    ok 2 - returns videoRootId when present
      ---
      duration_ms: 0.195533
      type: 'test'
      ...
    # Subtest: returns id when videoRootId is missing
    ok 3 - returns id when videoRootId is missing
      ---
      duration_ms: 0.259892
      type: 'test'
      ...
    # Subtest: returns id when videoRootId is not a string
    ok 4 - returns id when videoRootId is not a string
      ---
      duration_ms: 0.186003
      type: 'test'
      ...
    1..4
ok 1 - getVideoRootIdentifier
  ---
  duration_ms: 4.557608
  type: 'test'
  ...
# Subtest: applyRootTimestampToVideosMap
    # Subtest: returns early if videosMap is not a Map
    ok 1 - returns early if videosMap is not a Map
      ---
      duration_ms: 0.327077
      type: 'test'
      ...
    # Subtest: updates rootCreatedAt for matching video ID
    ok 2 - updates rootCreatedAt for matching video ID
      ---
      duration_ms: 0.208407
      type: 'test'
      ...
    # Subtest: updates rootCreatedAt for other videos with same rootId
    ok 3 - updates rootCreatedAt for other videos with same rootId
      ---
      duration_ms: 0.37208
      type: 'test'
      ...
    # Subtest: skips invalid stored objects in map
    ok 4 - skips invalid stored objects in map
      ---
      duration_ms: 0.344661
      type: 'test'
      ...
    1..4
ok 2 - applyRootTimestampToVideosMap
  ---
  duration_ms: 2.71108
  type: 'test'
  ...
# Subtest: syncActiveVideoRootTimestamp
    # Subtest: returns false for invalid timestamp
    ok 1 - returns false for invalid timestamp
      ---
      duration_ms: 0.277243
      type: 'test'
      ...
    # Subtest: returns false for invalid activeVideo
    ok 2 - returns false for invalid activeVideo
      ---
      duration_ms: 0.147798
      type: 'test'
      ...
    # Subtest: returns false if activeVideo has no root identifier
    ok 3 - returns false if activeVideo has no root identifier
      ---
      duration_ms: 0.117903
      type: 'test'
      ...
    # Subtest: returns false if rootId mismatch
    ok 4 - returns false if rootId mismatch
      ---
      duration_ms: 0.134688
      type: 'test'
      ...
    # Subtest: returns false if timestamp already matches
    ok 5 - returns false if timestamp already matches
      ---
      duration_ms: 0.116274
      type: 'test'
      ...
    # Subtest: updates activeVideo and displayTags
    ok 6 - updates activeVideo and displayTags
      ---
      duration_ms: 0.511264
      type: 'test'
      ...
    # Subtest: calls videoModal.updateMetadata if provided
    ok 7 - calls videoModal.updateMetadata if provided
      ---
      duration_ms: 0.276056
      type: 'test'
      ...
    1..7
ok 3 - syncActiveVideoRootTimestamp
  ---
  duration_ms: 2.526289
  type: 'test'
  ...
1..3
# tests 18
# suites 0
# pass 18
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 30.25167

→ Running tests/validate-config.test.mjs
TAP version 13
# Subtest: validateInstanceConfig succeeds with valid configuration
ok 1 - validateInstanceConfig succeeds with valid configuration
  ---
  duration_ms: 1.986019
  type: 'test'
  ...
# Subtest: validateInstanceConfig throws when platform fee is positive without a platform override
ok 2 - validateInstanceConfig throws when platform fee is positive without a platform override
  ---
  duration_ms: 1.064738
  type: 'test'
  ...
# Subtest: validateInstanceConfig throws when ADMIN_SUPER_NPUB is empty
ok 3 - validateInstanceConfig throws when ADMIN_SUPER_NPUB is empty
  ---
  duration_ms: 0.245016
  type: 'test'
  ...
# Subtest: validateInstanceConfig throws when ADMIN_SUPER_NPUB does not start with npub
ok 4 - validateInstanceConfig throws when ADMIN_SUPER_NPUB does not start with npub
  ---
  duration_ms: 0.215322
  type: 'test'
  ...
# Subtest: validateInstanceConfig throws when PLATFORM_FEE_PERCENT is negative
ok 5 - validateInstanceConfig throws when PLATFORM_FEE_PERCENT is negative
  ---
  duration_ms: 0.266404
  type: 'test'
  ...
# Subtest: validateInstanceConfig throws when PLATFORM_FEE_PERCENT is greater than 100
ok 6 - validateInstanceConfig throws when PLATFORM_FEE_PERCENT is greater than 100
  ---
  duration_ms: 0.231194
  type: 'test'
  ...
# Subtest: validateInstanceConfig throws when PLATFORM_FEE_PERCENT is not finite
ok 7 - validateInstanceConfig throws when PLATFORM_FEE_PERCENT is not finite
  ---
  duration_ms: 0.207109
  type: 'test'
  ...
# Subtest: validateInstanceConfig throws when THEME_ACCENT_OVERRIDES has invalid hex color
ok 8 - validateInstanceConfig throws when THEME_ACCENT_OVERRIDES has invalid hex color
  ---
  duration_ms: 0.241594
  type: 'test'
  ...
# Subtest: validateInstanceConfig throws when THEME_ACCENT_OVERRIDES structure is invalid
ok 9 - validateInstanceConfig throws when THEME_ACCENT_OVERRIDES structure is invalid
  ---
  duration_ms: 0.519578
  type: 'test'
  ...
# Subtest: validateInstanceConfig throws when optional URL is invalid
ok 10 - validateInstanceConfig throws when optional URL is invalid
  ---
  duration_ms: 0.710047
  type: 'test'
  ...
# Subtest: validateInstanceConfig throws when optional URL has invalid protocol
ok 11 - validateInstanceConfig throws when optional URL has invalid protocol
  ---
  duration_ms: 0.430976
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
# duration_ms 24.358471

→ Running tests/video-card-source-visibility.test.mjs
TAP version 13
# Subtest: updateVideoCardSourceVisibility hides non-owner cards without healthy sources and restores visibility
ok 1 - updateVideoCardSourceVisibility hides non-owner cards without healthy sources and restores visibility
  ---
  duration_ms: 95.550356
  type: 'test'
  ...
# Subtest: VideoCard hides cards without playable sources until a healthy CDN update arrives
ok 2 - VideoCard hides cards without playable sources until a healthy CDN update arrives
  ---
  duration_ms: 46.960895
  type: 'test'
  ...
# Subtest: VideoCard.closeMoreMenu only restores focus when the trigger was expanded
ok 3 - VideoCard.closeMoreMenu only restores focus when the trigger was expanded
  ---
  duration_ms: 21.068959
  type: 'test'
  ...
# Subtest: VideoCard.closeSettingsMenu only restores focus when the trigger was expanded
ok 4 - VideoCard.closeSettingsMenu only restores focus when the trigger was expanded
  ---
  duration_ms: 24.388328
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
# duration_ms 201.982386

→ Running tests/video-modal-accessibility.test.mjs
TAP version 13
# Subtest: video modal rehydrates and plays through a connected element across views
ok 1 - video modal rehydrates and plays through a connected element across views
  ---
  duration_ms: 354.059401
  type: 'test'
  ...
# Subtest: torrent-only playback resets the modal video before the next hosted session
ok 2 - torrent-only playback resets the modal video before the next hosted session
  ---
  duration_ms: 24.404871
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
  duration_ms: 332.89453
  type: 'test'
  ...
# Subtest: Escape key closes the modal and returns focus to the trigger
ok 4 - Escape key closes the modal and returns focus to the trigger
  ---
  duration_ms: 120.726213
  type: 'test'
  ...
# Subtest: video modal sticky navigation responds to scroll direction
ok 5 - video modal sticky navigation responds to scroll direction
  ---
  duration_ms: 104.461717
  type: 'test'
  ...
# Subtest: video modal video shell is not sticky at mobile breakpoints
ok 6 - video modal video shell is not sticky at mobile breakpoints
  ---
  duration_ms: 90.775239
  type: 'test'
  ...
# Subtest: video modal toggles document scroll locking on open/close
ok 7 - video modal toggles document scroll locking on open/close
  ---
  duration_ms: 90.140658
  type: 'test'
  ...
# Subtest: video modal comments region exposes aria landmarks and stays in the focus order
ok 8 - video modal comments region exposes aria landmarks and stays in the focus order
  ---
  duration_ms: 92.17013
  type: 'test'
  ...
# Subtest: video modal zap dialog updates aria state while toggling
ok 9 - video modal zap dialog updates aria state while toggling
  ---
  duration_ms: 390.198222
  type: 'test'
  ...
# Subtest: video modal inherits design system mode when loaded dynamically
ok 10 - video modal inherits design system mode when loaded dynamically
  ---
  duration_ms: 76.091827
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
# duration_ms 1687.092027

→ Running tests/video-modal-comments.test.mjs
TAP version 13
# Subtest: video modal rehydrates and plays through a connected element across views
ok 1 - video modal rehydrates and plays through a connected element across views
  ---
  duration_ms: 338.490038
  type: 'test'
  ...
# Subtest: torrent-only playback resets the modal video before the next hosted session
ok 2 - torrent-only playback resets the modal video before the next hosted session
  ---
  duration_ms: 25.044861
  type: 'test'
  ...
[VideoModal] Cleared loading poster (close).
[VideoModal] Cleared loading poster (close).
[VideoModal] Cleared loading poster (close).
[VideoModal] Cleared loading poster (close).
[VideoModal] Cleared loading poster (close).
[VideoModal] Cleared loading poster (close).
# Subtest: backdrop data-dismiss closes the modal and restores focus
ok 3 - backdrop data-dismiss closes the modal and restores focus
  ---
  duration_ms: 333.102548
  type: 'test'
  ...
# Subtest: Escape key closes the modal and returns focus to the trigger
ok 4 - Escape key closes the modal and returns focus to the trigger
  ---
  duration_ms: 125.98333
  type: 'test'
  ...
# Subtest: video modal sticky navigation responds to scroll direction
ok 5 - video modal sticky navigation responds to scroll direction
  ---
  duration_ms: 98.519826
  type: 'test'
  ...
# Subtest: video modal video shell is not sticky at mobile breakpoints
ok 6 - video modal video shell is not sticky at mobile breakpoints
  ---
  duration_ms: 97.663749
  type: 'test'
  ...
# Subtest: video modal toggles document scroll locking on open/close
ok 7 - video modal toggles document scroll locking on open/close
  ---
  duration_ms: 89.915135
  type: 'test'
  ...
# Subtest: video modal comments region exposes aria landmarks and stays in the focus order
ok 8 - video modal comments region exposes aria landmarks and stays in the focus order
  ---
  duration_ms: 96.917366
  type: 'test'
  ...
# Subtest: video modal zap dialog updates aria state while toggling
ok 9 - video modal zap dialog updates aria state while toggling
  ---
  duration_ms: 397.693503
  type: 'test'
  ...
# Subtest: video modal inherits design system mode when loaded dynamically
ok 10 - video modal inherits design system mode when loaded dynamically
  ---
  duration_ms: 77.476606
  type: 'test'
  ...
# Subtest: VideoModal comment section toggles visibility and renders hydrated comments
ok 11 - VideoModal comment section toggles visibility and renders hydrated comments
  ---
  duration_ms: 96.087176
  type: 'test'
  ...
# Subtest: Unauthenticated users can read comments while the composer stays disabled
ok 12 - Unauthenticated users can read comments while the composer stays disabled
  ---
  duration_ms: 90.906209
  type: 'test'
  ...
# Subtest: Guest users render loaded thread snapshots before composer auth enforcement
ok 13 - Guest users render loaded thread snapshots before composer auth enforcement
  ---
  duration_ms: 75.819714
  type: 'test'
  ...
# Subtest: Thread ready snapshots force comments visible before composer gating
ok 14 - Thread ready snapshots force comments visible before composer gating
  ---
  duration_ms: 69.848855
  type: 'test'
  ...
# Subtest: Controller renders synchronous loadThread snapshots immediately
ok 15 - Controller renders synchronous loadThread snapshots immediately
  ---
  duration_ms: 73.16848
  type: 'test'
  ...
# Subtest: VideoModalCommentController attaches profiles using normalized pubkeys
ok 16 - VideoModalCommentController attaches profiles using normalized pubkeys
  ---
  duration_ms: 1.810197
  type: 'test'
  ...
# Subtest: VideoModalCommentController accepts mixed-case videoEventIds for snapshots
ok 17 - VideoModalCommentController accepts mixed-case videoEventIds for snapshots
  ---
  duration_ms: 0.572101
  type: 'test'
  ...
# Subtest: VideoModal comment composer updates messaging and dispatches events
ok 18 - VideoModal comment composer updates messaging and dispatches events
  ---
  duration_ms: 68.44942
  type: 'test'
  ...
# Subtest: VideoModalCommentController load preserves current video for submissions
ok 19 - VideoModalCommentController load preserves current video for submissions
  ---
  duration_ms: 1.120099
  type: 'test'
  ...
# Subtest: VideoModalCommentController falls back to thread pointer when video tags are absent
ok 20 - VideoModalCommentController falls back to thread pointer when video tags are absent
  ---
  duration_ms: 0.522182
  type: 'test'
  ...
# Subtest: VideoModalCommentController preserves videoRootId when only root pointer is provided
ok 21 - VideoModalCommentController preserves videoRootId when only root pointer is provided
  ---
  duration_ms: 0.73426
  type: 'test'
  ...
# Subtest: VideoModalCommentController uses pointerIdentifiers root id fallback
ok 22 - VideoModalCommentController uses pointerIdentifiers root id fallback
  ---
  duration_ms: 0.653641
  type: 'test'
  ...
# Subtest: VideoModalCommentController publishes comment using event id fallback
ok 23 - VideoModalCommentController publishes comment using event id fallback
  ---
  duration_ms: 0.577844
  type: 'test'
  ...
# Subtest: VideoModalCommentController disposes safely during in-flight comment loads
ok 24 - VideoModalCommentController disposes safely during in-flight comment loads
  ---
  duration_ms: 0.641091
  type: 'test'
  ...
# Subtest: VideoModalCommentController prompts login when publish requires authentication
ok 25 - VideoModalCommentController prompts login when publish requires authentication
  ---
  duration_ms: 0.675151
  type: 'test'
  ...
# Subtest: VideoModalCommentController includes parent metadata when replying
ok 26 - VideoModalCommentController includes parent metadata when replying
  ---
  duration_ms: 0.398594
  type: 'test'
  ...
# Subtest: VideoModal comment section exposes aria landmarks and participates in focus trap
ok 27 - VideoModal comment section exposes aria landmarks and participates in focus trap
  ---
  duration_ms: 75.169224
  type: 'test'
  ...
1..27
# tests 27
# suites 0
# pass 27
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 2309.401081

→ Running tests/video-modal-controller.test.mjs
TAP version 13
# Subtest: VideoModalController
    # Subtest: ensureVideoModalReady throws if modal is missing
    ok 1 - ensureVideoModalReady throws if modal is missing
      ---
      duration_ms: 1.545416
      type: 'test'
      ...
    # Subtest: ensureVideoModalReady loads modal if needs rehydrate
    ok 2 - ensureVideoModalReady loads modal if needs rehydrate
      ---
      duration_ms: 0.430761
      type: 'test'
      ...
    # Subtest: showModalWithPoster uses provided video
    ok 3 - showModalWithPoster uses provided video
      ---
      duration_ms: 0.807164
      type: 'test'
      ...
    # Subtest: showModalWithPoster falls back to current video
    ok 4 - showModalWithPoster falls back to current video
      ---
      duration_ms: 0.485592
      type: 'test'
      ...
    # Subtest: forceRemoveModalPoster calls modal method
    ok 5 - forceRemoveModalPoster calls modal method
      ---
      duration_ms: 0.32404
      type: 'test'
      ...
    1..5
ok 1 - VideoModalController
  ---
  duration_ms: 5.577751
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
# duration_ms 18.392248

→ Running tests/video-modal-controllers.test.mjs
TAP version 13
# Subtest: video modal rehydrates and plays through a connected element across views
ok 1 - video modal rehydrates and plays through a connected element across views
  ---
  duration_ms: 633.579189
  type: 'test'
  ...
# Subtest: torrent-only playback resets the modal video before the next hosted session
ok 2 - torrent-only playback resets the modal video before the next hosted session
  ---
  duration_ms: 47.136025
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
  duration_ms: 660.788555
  type: 'test'
  ...
# Subtest: Escape key closes the modal and returns focus to the trigger
ok 4 - Escape key closes the modal and returns focus to the trigger
  ---
  duration_ms: 289.511926
  type: 'test'
  ...
# Subtest: video modal sticky navigation responds to scroll direction
ok 5 - video modal sticky navigation responds to scroll direction
  ---
  duration_ms: 163.277921
  type: 'test'
  ...
# Subtest: video modal video shell is not sticky at mobile breakpoints
ok 6 - video modal video shell is not sticky at mobile breakpoints
  ---
  duration_ms: 173.368043
  type: 'test'
  ...
# Subtest: video modal toggles document scroll locking on open/close
ok 7 - video modal toggles document scroll locking on open/close
  ---
  duration_ms: 176.182524
  type: 'test'
  ...
# Subtest: video modal comments region exposes aria landmarks and stays in the focus order
ok 8 - video modal comments region exposes aria landmarks and stays in the focus order
  ---
  duration_ms: 190.079739
  type: 'test'
  ...
# Subtest: video modal zap dialog updates aria state while toggling
ok 9 - video modal zap dialog updates aria state while toggling
  ---
  duration_ms: 997.001471
  type: 'test'
  ...
# Subtest: video modal inherits design system mode when loaded dynamically
ok 10 - video modal inherits design system mode when loaded dynamically
  ---
  duration_ms: 162.47788
  type: 'test'
  ...
# Subtest: CommentsController lifecycle manages comment references
ok 11 - CommentsController lifecycle manages comment references
  ---
  duration_ms: 315.798546
  type: 'test'
  ...
# Subtest: ReactionsController delegates reaction updates
ok 12 - ReactionsController delegates reaction updates
  ---
  duration_ms: 146.704404
  type: 'test'
  ...
# Subtest: SimilarContentController toggles section visibility
ok 13 - SimilarContentController toggles section visibility
  ---
  duration_ms: 122.082335
  type: 'test'
  ...
# Subtest: ModerationController reset clears moderation overlay references
ok 14 - ModerationController reset clears moderation overlay references
  ---
  duration_ms: 64.973137
  type: 'test'
  ...
# Subtest: VideoModal trims tag strip to fit modal width
ok 15 - VideoModal trims tag strip to fit modal width
  ---
  duration_ms: 77.283838
  type: 'test'
  ...
1..15
# tests 15
# suites 0
# pass 15
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 4296.467592

→ Running tests/video-modal-moderation.test.mjs
TAP version 13
# Subtest: video modal rehydrates and plays through a connected element across views
ok 1 - video modal rehydrates and plays through a connected element across views
  ---
  duration_ms: 263.474283
  type: 'test'
  ...
# Subtest: torrent-only playback resets the modal video before the next hosted session
ok 2 - torrent-only playback resets the modal video before the next hosted session
  ---
  duration_ms: 23.438727
  type: 'test'
  ...
[VideoModal] Cleared loading poster (close).
[VideoModal] Cleared loading poster (close).
[VideoModal] Cleared loading poster (close).
[VideoModal] Cleared loading poster (close).
[VideoModal] Cleared loading poster (close).
[VideoModal] Cleared loading poster (close).
[VideoModal] Cleared loading poster (close).
# Subtest: backdrop data-dismiss closes the modal and restores focus
ok 3 - backdrop data-dismiss closes the modal and restores focus
  ---
  duration_ms: 331.193397
  type: 'test'
  ...
# Subtest: Escape key closes the modal and returns focus to the trigger
ok 4 - Escape key closes the modal and returns focus to the trigger
  ---
  duration_ms: 127.921532
  type: 'test'
  ...
# Subtest: video modal sticky navigation responds to scroll direction
ok 5 - video modal sticky navigation responds to scroll direction
  ---
  duration_ms: 98.345177
  type: 'test'
  ...
# Subtest: video modal video shell is not sticky at mobile breakpoints
ok 6 - video modal video shell is not sticky at mobile breakpoints
  ---
  duration_ms: 92.644322
  type: 'test'
  ...
# Subtest: video modal toggles document scroll locking on open/close
ok 7 - video modal toggles document scroll locking on open/close
  ---
  duration_ms: 90.923035
  type: 'test'
  ...
# Subtest: video modal comments region exposes aria landmarks and stays in the focus order
ok 8 - video modal comments region exposes aria landmarks and stays in the focus order
  ---
  duration_ms: 110.212494
  type: 'test'
  ...
# Subtest: video modal zap dialog updates aria state while toggling
ok 9 - video modal zap dialog updates aria state while toggling
  ---
  duration_ms: 380.252961
  type: 'test'
  ...
# Subtest: video modal inherits design system mode when loaded dynamically
ok 10 - video modal inherits design system mode when loaded dynamically
  ---
  duration_ms: 76.837508
  type: 'test'
  ...
# Subtest: VideoModal blurs and restores playback when moderation overlay toggles
    # Subtest: trusted reports blur the active video
    ok 1 - trusted reports blur the active video
      ---
      duration_ms: 13.921702
      type: 'test'
      ...
    # Subtest: trusted mute blur state matches moderation context
    ok 2 - trusted mute blur state matches moderation context
      ---
      duration_ms: 4.380443
      type: 'test'
      ...
    1..2
ok 11 - VideoModal blurs and restores playback when moderation overlay toggles
  ---
  duration_ms: 93.20324
  type: 'test'
  ...
1..11
# tests 13
# suites 0
# pass 13
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 1700.816123

→ Running tests/video-modal-tags.test.mjs
TAP version 13
# Subtest: video modal rehydrates and plays through a connected element across views
ok 1 - video modal rehydrates and plays through a connected element across views
  ---
  duration_ms: 353.899396
  type: 'test'
  ...
# Subtest: torrent-only playback resets the modal video before the next hosted session
ok 2 - torrent-only playback resets the modal video before the next hosted session
  ---
  duration_ms: 25.083422
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
  duration_ms: 335.284019
  type: 'test'
  ...
# Subtest: Escape key closes the modal and returns focus to the trigger
ok 4 - Escape key closes the modal and returns focus to the trigger
  ---
  duration_ms: 129.007078
  type: 'test'
  ...
# Subtest: video modal sticky navigation responds to scroll direction
ok 5 - video modal sticky navigation responds to scroll direction
  ---
  duration_ms: 99.044076
  type: 'test'
  ...
# Subtest: video modal video shell is not sticky at mobile breakpoints
ok 6 - video modal video shell is not sticky at mobile breakpoints
  ---
  duration_ms: 99.820999
  type: 'test'
  ...
# Subtest: video modal toggles document scroll locking on open/close
ok 7 - video modal toggles document scroll locking on open/close
  ---
  duration_ms: 91.606508
  type: 'test'
  ...
# Subtest: video modal comments region exposes aria landmarks and stays in the focus order
ok 8 - video modal comments region exposes aria landmarks and stays in the focus order
  ---
  duration_ms: 102.199045
  type: 'test'
  ...
# Subtest: video modal zap dialog updates aria state while toggling
ok 9 - video modal zap dialog updates aria state while toggling
  ---
  duration_ms: 405.567413
  type: 'test'
  ...
# Subtest: video modal inherits design system mode when loaded dynamically
ok 10 - video modal inherits design system mode when loaded dynamically
  ---
  duration_ms: 77.870193
  type: 'test'
  ...
# Subtest: VideoModal renders tag metadata and toggles visibility
ok 11 - VideoModal renders tag metadata and toggles visibility
  ---
  duration_ms: 83.219612
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
# duration_ms 1814.296248

→ Running tests/video-note-payload.test.mjs
TAP version 13
# Subtest: normalizes minimal payload with hosted URL
ok 1 - normalizes minimal payload with hosted URL
  ---
  duration_ms: 3.415109
  type: 'test'
  ...
# Subtest: normalizes mode and boolean flags
ok 2 - normalizes mode and boolean flags
  ---
  duration_ms: 0.477537
  type: 'test'
  ...
# Subtest: augments magnets with ws/xs hints
ok 3 - augments magnets with ws/xs hints
  ---
  duration_ms: 2.184992
  type: 'test'
  ...
# Subtest: normalizes nip71 metadata collections
ok 4 - normalizes nip71 metadata collections
  ---
  duration_ms: 1.354448
  type: 'test'
  ...
# Subtest: derives legacy duration fallback from imeta variants
ok 5 - derives legacy duration fallback from imeta variants
  ---
  duration_ms: 0.3959
  type: 'test'
  ...
# Subtest: reports validation errors for missing fields
ok 6 - reports validation errors for missing fields
  ---
  duration_ms: 0.236257
  type: 'test'
  ...
# Subtest: rejects insecure hosted URLs
ok 7 - rejects insecure hosted URLs
  ---
  duration_ms: 0.378604
  type: 'test'
  ...
# Subtest: allows publishing with only imeta variants
ok 8 - allows publishing with only imeta variants
  ---
  duration_ms: 0.230436
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
# duration_ms 24.388827

→ Running tests/video-schema-and-conversion.test.mjs
TAP version 13
# Subtest: video post schema documents nsfw and kids flags
ok 1 - video post schema documents nsfw and kids flags
  ---
  duration_ms: 1.498511
  type: 'test'
  ...
# Subtest: convertEventToVideo normalizes nsfw and kids booleans
ok 2 - convertEventToVideo normalizes nsfw and kids booleans
  ---
  duration_ms: 0.975872
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
# duration_ms 13.419554

→ Running tests/video-settings-menu-controller.test.mjs
TAP version 13
# Subtest: VideoSettingsMenuController - requestMenu opens popover
ok 1 - VideoSettingsMenuController - requestMenu opens popover
  ---
  duration_ms: 1.573657
  type: 'test'
  ...
# Subtest: VideoSettingsMenuController - closeMenu closes popover
ok 2 - VideoSettingsMenuController - closeMenu closes popover
  ---
  duration_ms: 0.351149
  type: 'test'
  ...
# Subtest: VideoSettingsMenuController - requestMenu toggles if open
ok 3 - VideoSettingsMenuController - requestMenu toggles if open
  ---
  duration_ms: 0.325587
  type: 'test'
  ...
# Subtest: VideoSettingsMenuController - closeAll closes all popovers
ok 4 - VideoSettingsMenuController - closeAll closes all popovers
  ---
  duration_ms: 0.439369
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
# duration_ms 16.300596

→ Running tests/webtorrent-handlers.test.mjs
TAP version 13
# Subtest: TorrentClient Handlers
    # Subtest: handleTorrentStream (chrome) should set up video correctly
    ok 1 - handleTorrentStream (chrome) should set up video correctly
      ---
      duration_ms: 21.635406
      type: 'test'
      ...
[bitvid] CORS warning detected. Attempting to remove the failing webseed/tracker.
[bitvid] Cleaned up webseeds => [ 'http://good.com/video.mp4' ]
[bitvid] Cleaned up trackers => [ 'ws://good.com' ]
    # Subtest: handleTorrentStream (firefox) should set up video correctly with highWaterMark
    ok 2 - handleTorrentStream (firefox) should set up video correctly with highWaterMark
      ---
      duration_ms: 20.815416
      type: 'test'
      ...
    # Subtest: handleTorrentStream (chrome) should handle CORS warning logic
    ok 3 - handleTorrentStream (chrome) should handle CORS warning logic
      ---
      duration_ms: 1.619474
      type: 'test'
      ...
    1..3
ok 1 - TorrentClient Handlers
  ---
  duration_ms: 46.332802
  type: 'suite'
  ...
1..1
# tests 3
# suites 1
# pass 3
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 62.068914

→ Running tests/webtorrent-regression.test.mjs
TAP version 13
# Subtest: WebTorrent Regression Tests
    # Subtest: probePeers should report healthy if webseed is present even with 0 peers
    ok 1 - probePeers should report healthy if webseed is present even with 0 peers
      ---
      duration_ms: 7.775698
      type: 'test'
      ...
    # Subtest: probePeers should report unhealthy if no webseed and 0 peers
    ok 2 - probePeers should report unhealthy if no webseed and 0 peers
      ---
      duration_ms: 51.552755
      type: 'test'
      ...
    1..2
ok 1 - WebTorrent Regression Tests
  ---
  duration_ms: 61.926428
  type: 'suite'
  ...
1..1
# tests 2
# suites 1
# pass 2
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 69.894038

✔ All unit tests passed
innerHTML usage: 54 assignments across 31 files

  js/docsView.js: 8
  js/historyView.js: 4
  js/ui/components/DeleteModal.js: 3
  js/ui/components/ShareNostrModal.js: 3
  js/ui/dm/DMSettingsModalController.js: 3
  js/ui/loginModalController.js: 3
  js/ui/views/VideoListView.js: 3
  js/viewManager.js: 3
  js/utils/qrcode.js: 2
  js/app/feedCoordinator.js: 1
  js/app.js: 1
  js/exploreView.js: 1
  js/forYouView.js: 1
  js/index.js: 1
  js/kidsView.js: 1
  js/ui/components/EditModal.js: 1
  js/ui/components/EmbedVideoModal.js: 1
  js/ui/components/EventDetailsModal.js: 1
  js/ui/components/UploadModal.js: 1
  js/ui/components/VideoModal.js: 1
  js/ui/components/nip71FormManager.js: 1
  js/ui/dm/AppShell.js: 1
  js/ui/dm/Composer.js: 1
  js/ui/dm/ConversationList.js: 1
  js/ui/dm/DMRelaySettings.js: 1
  js/ui/dm/MessageThread.js: 1
  js/ui/dm/NotificationCenter.js: 1
  js/ui/moreMenuController.js: 1
  js/ui/profileModalController.js: 1
  js/ui/subscriptionHistoryController.js: 1
  js/ui/videoListViewController.js: 1
