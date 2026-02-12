Node: v22.22.0
NPM: 11.7.0

added 424 packages, and audited 425 packages in 13s

108 packages are looking for funding
  run `npm fund` for details

found 0 vulnerabilities
npm notice
npm notice New minor version of npm available! 11.7.0 -> 11.10.0
npm notice Changelog: https://github.com/npm/cli/releases/tag/v11.10.0
npm notice To update run: npm install -g npm@11.10.0
npm notice

changed 2 packages, and audited 425 packages in 3s

108 packages are looking for funding
  run `npm fund` for details

found 0 vulnerabilities
Running build...

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
Injected version: 6bb2d251 • 2026-02-12
Build complete.

> bitvid@1.0.0 verify:dist:deploy-artifact
> node scripts/verify-dist-deploy-artifact.mjs

Deployment artifact verification passed: version markup and hashed asset references are present in dist/index.html.
Build exit code: 0
Running lint...

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
Lint exit code: 0
Running unit tests...

> bitvid@1.0.0 test:unit
> node scripts/run-unit-tests.mjs


→ Running tests/app-batch-fetch-profiles.test.mjs
TAP version 13
# Subtest: batchFetchProfiles handles fast and failing relays
ok 1 - batchFetchProfiles handles fast and failing relays
  ---
  duration_ms: 13.99331
  type: 'test'
  ...
# Subtest: batchFetchProfiles respects forceRefresh
ok 2 - batchFetchProfiles respects forceRefresh
  ---
  duration_ms: 302.053628
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
# duration_ms 365.991806

→ Running tests/app-state.test.mjs
TAP version 13
# Subtest: AppState
    # Subtest: Initial state is clean
    ok 1 - Initial state is clean
      ---
      duration_ms: 2.312659
      type: 'test'
      ...
    # Subtest: setPubkey() updates state and notifies subscribers
    ok 2 - setPubkey() updates state and notifies subscribers
      ---
      duration_ms: 0.944413
      type: 'test'
      ...
    # Subtest: setCurrentUserNpub() updates state
    ok 3 - setCurrentUserNpub() updates state
      ---
      duration_ms: 0.396352
      type: 'test'
      ...
    # Subtest: setCurrentVideo() updates state
    ok 4 - setCurrentVideo() updates state
      ---
      duration_ms: 0.571016
      type: 'test'
      ...
    # Subtest: setVideosMap() updates state
    ok 5 - setVideosMap() updates state
      ---
      duration_ms: 0.585743
      type: 'test'
      ...
    # Subtest: setVideoSubscription() updates state
    ok 6 - setVideoSubscription() updates state
      ---
      duration_ms: 0.330109
      type: 'test'
      ...
    # Subtest: setModalState() updates state and notifies modal subscribers
    ok 7 - setModalState() updates state and notifies modal subscribers
      ---
      duration_ms: 0.894319
      type: 'test'
      ...
    # Subtest: Global subscriber receives updates
    ok 8 - Global subscriber receives updates
      ---
      duration_ms: 0.626902
      type: 'test'
      ...
    # Subtest: resetAppState() clears all state and notifies
    ok 9 - resetAppState() clears all state and notifies
      ---
      duration_ms: 0.838283
      type: 'test'
      ...
    1..9
ok 1 - AppState
  ---
  duration_ms: 9.802838
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
# duration_ms 31.18024

→ Running tests/app/channel-profile-moderation.test.mjs
TAP version 13
# Subtest: renderChannelVideosFromList decorates videos before storing
ok 1 - renderChannelVideosFromList decorates videos before storing
  ---
  duration_ms: 185.777956
  type: 'test'
  ...
# Subtest: renderChannelVideosFromList applies moderation blur without existing metadata
ok 2 - renderChannelVideosFromList applies moderation blur without existing metadata
  ---
  duration_ms: 58.613302
  type: 'test'
  ...
# Subtest: applyChannelVisualBlur blurs banner and avatar when viewer mutes author
ok 3 - applyChannelVisualBlur blurs banner and avatar when viewer mutes author
  ---
  duration_ms: 15.849535
  type: 'test'
  ...
# Subtest: moderation override clears channel blur via event wiring
ok 4 - moderation override clears channel blur via event wiring
  ---
  duration_ms: 36.515733
  type: 'test'
  ...
# Subtest: channel header moderation badge reflects blur state and override actions
ok 5 - channel header moderation badge reflects blur state and override actions
  ---
  duration_ms: 47.930491
  type: 'test'
  ...
# Subtest: channel video cards update moderation state in place when summary changes
ok 6 - channel video cards update moderation state in place when summary changes
  ---
  duration_ms: 48.058873
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
# duration_ms 413.300296

→ Running tests/app/feedCoordinator.test.mjs
TAP version 13
# Subtest: createFeedCoordinator - loadForYouVideos
    # Subtest: loadForYouVideos executes successfully
    ok 1 - loadForYouVideos executes successfully
      ---
      duration_ms: 2.465866
      type: 'test'
      ...
    1..1
ok 1 - createFeedCoordinator - loadForYouVideos
  ---
  duration_ms: 4.55921
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
# duration_ms 15.21591

→ Running tests/app/hash-change-handler.test.mjs
TAP version 13
# Subtest: handleHashChange defaults to for-you when logged in
ok 1 - handleHashChange defaults to for-you when logged in
  ---
  duration_ms: 240.819883
  type: 'test'
  ...
# Subtest: handleHashChange defaults to most-recent-videos when logged out
ok 2 - handleHashChange defaults to most-recent-videos when logged out
  ---
  duration_ms: 20.042627
  type: 'test'
  ...
# Subtest: handleHashChange respects explicit view regardless of login state
ok 3 - handleHashChange respects explicit view regardless of login state
  ---
  duration_ms: 12.440924
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
# duration_ms 286.861711

→ Running tests/app/hydrate-sidebar-navigation.test.mjs
TAP version 13
# Subtest: hydrateSidebarNavigation reveals chrome controls for authenticated viewers
ok 1 - hydrateSidebarNavigation reveals chrome controls for authenticated viewers
  ---
  duration_ms: 107.904014
  type: 'test'
  ...
# Subtest: hydrateSidebarNavigation hides chrome controls for logged-out viewers
ok 2 - hydrateSidebarNavigation hides chrome controls for logged-out viewers
  ---
  duration_ms: 14.819112
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
# duration_ms 135.542735

→ Running tests/app/is-user-logged-in.test.mjs
TAP version 13
# Subtest: isUserLoggedIn returns false when no user pubkey is set
ok 1 - isUserLoggedIn returns false when no user pubkey is set
  ---
  duration_ms: 1.40207
  type: 'test'
  ...
# Subtest: isUserLoggedIn treats extension logins as authenticated
ok 2 - isUserLoggedIn treats extension logins as authenticated
  ---
  duration_ms: 0.332666
  type: 'test'
  ...
# Subtest: isUserLoggedIn guards against mismatched nostrClient state
ok 3 - isUserLoggedIn guards against mismatched nostrClient state
  ---
  duration_ms: 0.222126
  type: 'test'
  ...
# Subtest: isUserLoggedIn ignores anonymous session actor mismatches
ok 4 - isUserLoggedIn ignores anonymous session actor mismatches
  ---
  duration_ms: 0.300322
  type: 'test'
  ...
# Subtest: isUserLoggedIn rejects mismatched managed session actors
ok 5 - isUserLoggedIn rejects mismatched managed session actors
  ---
  duration_ms: 0.330816
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
# duration_ms 32.161274

→ Running tests/app/moderation-overrides.test.mjs
TAP version 13
# Subtest: handleModerationOverride decorates stored and current videos then refreshes UI
ok 1 - handleModerationOverride decorates stored and current videos then refreshes UI
  ---
  duration_ms: 5.979729
  type: 'test'
  ...
# Subtest: handleModerationOverride resumes deferred playback
ok 2 - handleModerationOverride resumes deferred playback
  ---
  duration_ms: 1.337565
  type: 'test'
  ...
# Subtest: handleModerationBlock requests a block, clears overrides, and refreshes hidden state
ok 3 - handleModerationBlock requests a block, clears overrides, and refreshes hidden state
  ---
  duration_ms: 4.307154
  type: 'test'
  ...
# Subtest: handleModerationBlock returns false when viewer is logged out
ok 4 - handleModerationBlock returns false when viewer is logged out
  ---
  duration_ms: 1.098202
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
# duration_ms 28.643321

→ Running tests/app/moderation-settings-refresh.test.mjs
TAP version 13
# Subtest: handleModerationSettingsChange refreshes feeds with updated thresholds
ok 1 - handleModerationSettingsChange refreshes feeds with updated thresholds
  ---
  duration_ms: 5.049885
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
# duration_ms 16.905125

→ Running tests/app/similar-content.test.mjs
TAP version 13
# Subtest: orders similar videos by shared tags then timestamp
ok 1 - orders similar videos by shared tags then timestamp
  ---
  duration_ms: 3.272602
  type: 'test'
  ...
# Subtest: returns no matches when the active video lacks tags
ok 2 - returns no matches when the active video lacks tags
  ---
  duration_ms: 0.456058
  type: 'test'
  ...
# Subtest: skips candidates without tag metadata
ok 3 - skips candidates without tag metadata
  ---
  duration_ms: 0.408095
  type: 'test'
  ...
# Subtest: filters NSFW and private videos when NSFW content is disabled
ok 4 - filters NSFW and private videos when NSFW content is disabled
  ---
  duration_ms: 0.535901
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
# duration_ms 17.522938

→ Running tests/auth/signingAdapter.test.mjs
TAP version 13
# Subtest: createNip07SigningAdapter
    # Subtest: uses explicit extension if provided
    ok 1 - uses explicit extension if provided
      ---
      duration_ms: 3.540537
      type: 'test'
      ...
    # Subtest: falls back to window.nostr if no extension provided
    ok 2 - falls back to window.nostr if no extension provided
      ---
      duration_ms: 0.588977
      type: 'test'
      ...
    # Subtest: throws error if no extension available
    ok 3 - throws error if no extension available
      ---
      duration_ms: 1.377312
      type: 'test'
      ...
    # Subtest: prioritizes explicit extension over window.nostr
    ok 4 - prioritizes explicit extension over window.nostr
      ---
      duration_ms: 0.857442
      type: 'test'
      ...
    1..4
ok 1 - createNip07SigningAdapter
  ---
  duration_ms: 7.997828
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
# duration_ms 21.053227

→ Running tests/comment-event-builder.test.mjs
TAP version 13
# Subtest: buildCommentEvent emits NIP-22 root metadata while keeping legacy fallbacks
ok 1 - buildCommentEvent emits NIP-22 root metadata while keeping legacy fallbacks
  ---
  duration_ms: 2.793912
  type: 'test'
  ...
# Subtest: buildCommentEvent includes parent pointers, kinds, and authors for replies
ok 2 - buildCommentEvent includes parent pointers, kinds, and authors for replies
  ---
  duration_ms: 0.594595
  type: 'test'
  ...
# Subtest: buildCommentEvent normalizes relays and preserves explicit overrides
ok 3 - buildCommentEvent normalizes relays and preserves explicit overrides
  ---
  duration_ms: 0.820781
  type: 'test'
  ...
# Subtest: buildCommentEvent falls back to event pointers when no address is supplied
ok 4 - buildCommentEvent falls back to event pointers when no address is supplied
  ---
  duration_ms: 0.289549
  type: 'test'
  ...
# Subtest: buildCommentEvent accepts partial metadata for parent overrides
ok 5 - buildCommentEvent accepts partial metadata for parent overrides
  ---
  duration_ms: 0.365041
  type: 'test'
  ...
# Subtest: buildCommentEvent sanitizes additional tags before signing
ok 6 - buildCommentEvent sanitizes additional tags before signing
  ---
  duration_ms: 0.873079
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
# duration_ms 19.584239

→ Running tests/comment-thread-service.test.mjs
TAP version 13
# Subtest: CommentThreadService caches mixed-case video ids consistently
ok 1 - CommentThreadService caches mixed-case video ids consistently
  ---
  duration_ms: 3.501828
  type: 'test'
  ...
# Subtest: CommentThreadService surfaces cache read failures
ok 2 - CommentThreadService surfaces cache read failures
  ---
  duration_ms: 0.878062
  type: 'test'
  ...
# Subtest: CommentThreadService surfaces cache write failures
ok 3 - CommentThreadService surfaces cache write failures
  ---
  duration_ms: 0.540859
  type: 'test'
  ...
# Subtest: CommentThreadService persists caches safely during teardown failures
ok 4 - CommentThreadService persists caches safely during teardown failures
  ---
  duration_ms: 2.005017
  type: 'test'
  ...
# Subtest: CommentThreadService logs cache usage and fallback decisions
ok 5 - CommentThreadService logs cache usage and fallback decisions
  ---
  duration_ms: 1.21468
  type: 'test'
  ...
# Subtest: CommentThreadService normalizes mixed-case event ids in thread state
ok 6 - CommentThreadService normalizes mixed-case event ids in thread state
  ---
  duration_ms: 2.198276
  type: 'test'
  ...
# Subtest: CommentThreadService normalizes mixed-case pubkeys during hydration
ok 7 - CommentThreadService normalizes mixed-case pubkeys during hydration
  ---
  duration_ms: 1.038858
  type: 'test'
  ...
# Subtest: CommentThreadService deduplicates mixed-case event ids and pubkeys
ok 8 - CommentThreadService deduplicates mixed-case event ids and pubkeys
  ---
  duration_ms: 0.927499
  type: 'test'
  ...
# Subtest: CommentThreadService retries profile hydration before succeeding
ok 9 - CommentThreadService retries profile hydration before succeeding
  ---
  duration_ms: 76.060413
  type: 'test'
  ...
# Subtest: CommentThreadService surfaces profile hydration failures after retries
ok 10 - CommentThreadService surfaces profile hydration failures after retries
  ---
  duration_ms: 201.425935
  type: 'test'
  ...
# Subtest: listVideoComments accepts builder events without parent ids and filters replies
ok 11 - listVideoComments accepts builder events without parent ids and filters replies
  ---
  duration_ms: 6.1484
  type: 'test'
  ...
# Subtest: CommentThreadService hydrates, subscribes, and dedupes incoming comment events
ok 12 - CommentThreadService hydrates, subscribes, and dedupes incoming comment events
  ---
  duration_ms: 34.199346
  type: 'test'
  ...
# Subtest: CommentThreadService loadThread falls back to event id when address is missing
ok 13 - CommentThreadService loadThread falls back to event id when address is missing
  ---
  duration_ms: 0.966091
  type: 'test'
  ...
# Subtest: CommentThreadService requests and snapshots comments by root identifier
ok 14 - CommentThreadService requests and snapshots comments by root identifier
  ---
  duration_ms: 0.803819
  type: 'test'
  ...
# Subtest: CommentThreadService falls back to pointerIdentifiers root id
ok 15 - CommentThreadService falls back to pointerIdentifiers root id
  ---
  duration_ms: 0.784538
  type: 'test'
  ...
# Subtest: CommentThreadService preserves raw video author pubkeys during hydration fetches
ok 16 - CommentThreadService preserves raw video author pubkeys during hydration fetches
  ---
  duration_ms: 5.31487
  type: 'test'
  ...
# Subtest: CommentThreadService teardown cancels hydration timers
ok 17 - CommentThreadService teardown cancels hydration timers
  ---
  duration_ms: 81.386057
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
# duration_ms 428.967471

→ Running tests/compliance/nip04_44_compliance.test.mjs
TAP version 13
# Subtest: NIP-04/44 Compliance: Encryption Preference
    # Subtest: createNip46Cipher prefers nip44.v2 when available
    ok 1 - createNip46Cipher prefers nip44.v2 when available
      ---
      duration_ms: 21.960504
      type: 'test'
      ...
    # Subtest: createNip46Cipher falls back to nip04 if nip44 is missing
    ok 2 - createNip46Cipher falls back to nip04 if nip44 is missing
      ---
      duration_ms: 9.44152
      type: 'test'
      ...
    1..2
ok 1 - NIP-04/44 Compliance: Encryption Preference
  ---
  duration_ms: 105.292078
  type: 'test'
  ...
# Subtest: NIP-04/44 Compliance: Decryption Fallback
    # Subtest: decryptNip46PayloadWithKeys handles nip44 (v2) payload
    ok 1 - decryptNip46PayloadWithKeys handles nip44 (v2) payload
      ---
      duration_ms: 24.872325
      type: 'test'
      ...
    # Subtest: decryptNip46PayloadWithKeys handles nip04 payload
    ok 2 - decryptNip46PayloadWithKeys handles nip04 payload
      ---
      duration_ms: 29.550968
      type: 'test'
      ...
    1..2
ok 2 - NIP-04/44 Compliance: Decryption Fallback
  ---
  duration_ms: 56.656775
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
# duration_ms 178.623688

→ Running tests/compliance/nip07_compliance.test.mjs
TAP version 13
# Subtest: NIP-07 Compliance: Retry Logic
    # Subtest: runNip07WithRetry succeeds on first try
    ok 1 - runNip07WithRetry succeeds on first try
      ---
      duration_ms: 2.056754
      type: 'test'
      ...
    # Subtest: runNip07WithRetry retries on timeout error
    ok 2 - runNip07WithRetry retries on timeout error
      ---
      duration_ms: 21.14576
      type: 'test'
      ...
    # Subtest: runNip07WithRetry fails after max retries or if error is not timeout
    ok 3 - runNip07WithRetry fails after max retries or if error is not timeout
      ---
      duration_ms: 1.443995
      type: 'test'
      ...
    1..3
ok 1 - NIP-07 Compliance: Retry Logic
  ---
  duration_ms: 26.423272
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
# duration_ms 60.90597

→ Running tests/compliance/nip65_compliance.test.mjs
TAP version 13
# Subtest: NIP-65 Compliance: Relay List Loading
    # Subtest: loadRelayList requests Kind 10002
    ok 1 - loadRelayList requests Kind 10002
      ---
      duration_ms: 4.689822
      type: 'test'
      ...
    # Subtest: loadRelayList parses r tags correctly
    ok 2 - loadRelayList parses r tags correctly
      ---
      duration_ms: 0.42635
      type: 'test'
      ...
    1..2
ok 1 - NIP-65 Compliance: Relay List Loading
  ---
  duration_ms: 153.095055
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
# duration_ms 167.16601

→ Running tests/compliance/video_note_compliance.test.mjs
TAP version 13
# Subtest: Video Note Compliance (Kind 30078 & NIP-71)
    # Subtest: prepareVideoPublishPayload creates Kind 30078 event
    ok 1 - prepareVideoPublishPayload creates Kind 30078 event
      ---
      duration_ms: 2.510144
      type: 'test'
      ...
    # Subtest: prepareVideoPublishPayload includes NIP-71 tags when provided
    ok 2 - prepareVideoPublishPayload includes NIP-71 tags when provided
      ---
      duration_ms: 1.061775
      type: 'test'
      ...
    1..2
ok 1 - Video Note Compliance (Kind 30078 & NIP-71)
  ---
  duration_ms: 36.920137
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
# duration_ms 48.6723

→ Running tests/design-system-metrics.test.mjs
TAP version 13
# Subtest: metric probe falls back to numeric parsing when measurement fails
ok 1 - metric probe falls back to numeric parsing when measurement fails
  ---
  duration_ms: 262.474863
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
# duration_ms 273.524634

→ Running tests/designSystem/dynamicStyles.test.mjs
TAP version 13
# Subtest: js/designSystem/dynamicStyles.js
    # Subtest: registerScope
        # Subtest: should register a scope and return a string ID
        ok 1 - should register a scope and return a string ID
          ---
          duration_ms: 94.693189
          type: 'test'
          ...
        # Subtest: should create a style element or use adoptedStyleSheets
        ok 2 - should create a style element or use adoptedStyleSheets
          ---
          duration_ms: 14.939194
          type: 'test'
          ...
        # Subtest: should insert rules with the correct selector
        ok 3 - should insert rules with the correct selector
          ---
          duration_ms: 13.524579
          type: 'test'
          ...
        # Subtest: should handle "&" in selectors
        ok 4 - should handle "&" in selectors
          ---
          duration_ms: 11.046488
          type: 'test'
          ...
        1..4
    ok 1 - registerScope
      ---
      duration_ms: 135.426176
      type: 'suite'
      ...
    # Subtest: setVariables
        # Subtest: should update CSS variables on the scope
        ok 1 - should update CSS variables on the scope
          ---
          duration_ms: 12.693568
          type: 'test'
          ...
        # Subtest: should handle removing variables
        ok 2 - should handle removing variables
          ---
          duration_ms: 9.815112
          type: 'test'
          ...
        1..2
    ok 2 - setVariables
      ---
      duration_ms: 22.885703
      type: 'suite'
      ...
    # Subtest: releaseScope
        # Subtest: should remove rules and clean up
        ok 1 - should remove rules and clean up
          ---
          duration_ms: 10.257187
          type: 'test'
          ...
        # Subtest: should return false for non-existent scope
        ok 2 - should return false for non-existent scope
          ---
          duration_ms: 13.536061
          type: 'test'
          ...
        1..2
    ok 3 - releaseScope
      ---
      duration_ms: 24.195856
      type: 'suite'
      ...
    # Subtest: Isolation
        # Subtest: should manage scopes independently for different documents
        ok 1 - should manage scopes independently for different documents
          ---
          duration_ms: 27.669183
          type: 'test'
          ...
        1..1
    ok 4 - Isolation
      ---
      duration_ms: 27.795493
      type: 'suite'
      ...
    # Subtest: Edge cases
        # Subtest: should handle invalid selectors gracefully
        ok 1 - should handle invalid selectors gracefully
          ---
          duration_ms: 9.567256
          type: 'test'
          ...
        # Subtest: should handle missing document gracefully
        ok 2 - should handle missing document gracefully
          ---
          duration_ms: 6.555677
          type: 'test'
          ...
        # Subtest: should fallback to <style> element if CSSStyleSheet is missing
        ok 3 - should fallback to <style> element if CSSStyleSheet is missing
          ---
          duration_ms: 13.983164
          type: 'test'
          ...
        1..3
    ok 5 - Edge cases
      ---
      duration_ms: 30.574232
      type: 'suite'
      ...
    1..5
ok 1 - js/designSystem/dynamicStyles.js
  ---
  duration_ms: 241.993348
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
# duration_ms 271.805236

→ Running tests/dm-block-filter.test.mjs
TAP version 13
# Subtest: DM block/mute filtering
    # Subtest: setDmBlockChecker
        # Subtest: should accept a function
        ok 1 - should accept a function
          ---
          duration_ms: 1.600973
          type: 'test'
          ...
        # Subtest: should clear checker when passed null
        ok 2 - should clear checker when passed null
          ---
          duration_ms: 0.479151
          type: 'test'
          ...
        # Subtest: should clear checker when passed non-function
        ok 3 - should clear checker when passed non-function
          ---
          duration_ms: 0.712494
          type: 'test'
          ...
        1..3
    ok 1 - setDmBlockChecker
      ---
      duration_ms: 4.355373
      type: 'suite'
      ...
    # Subtest: applyDirectMessage with block checker
        # Subtest: should drop messages from blocked senders
        ok 1 - should drop messages from blocked senders
          ---
          duration_ms: 1.157129
          type: 'test'
          ...
        # Subtest: should allow messages from non-blocked senders
        ok 2 - should allow messages from non-blocked senders
          ---
          duration_ms: 3.397513
          type: 'test'
          ...
        # Subtest: should allow all messages when no block checker is set
        ok 3 - should allow all messages when no block checker is set
          ---
          duration_ms: 0.681846
          type: 'test'
          ...
        # Subtest: should block outgoing messages to blocked recipients
        ok 4 - should block outgoing messages to blocked recipients
          ---
          duration_ms: 0.502305
          type: 'test'
          ...
        1..4
    ok 2 - applyDirectMessage with block checker
      ---
      duration_ms: 6.401836
      type: 'suite'
      ...
    # Subtest: _isDmRemoteBlocked
        # Subtest: should return false when no checker is set
        ok 1 - should return false when no checker is set
          ---
          duration_ms: 0.533343
          type: 'test'
          ...
        # Subtest: should return true for blocked remote pubkey
        ok 2 - should return true for blocked remote pubkey
          ---
          duration_ms: 0.615485
          type: 'test'
          ...
        # Subtest: should return false for allowed remote pubkey
        ok 3 - should return false for allowed remote pubkey
          ---
          duration_ms: 0.453136
          type: 'test'
          ...
        # Subtest: should handle checker that throws
        ok 4 - should handle checker that throws
          ---
          duration_ms: 0.429247
          type: 'test'
          ...
        1..4
    ok 3 - _isDmRemoteBlocked
      ---
      duration_ms: 2.355257
      type: 'suite'
      ...
    1..3
ok 1 - DM block/mute filtering
  ---
  duration_ms: 14.009526
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
# duration_ms 34.60944

→ Running tests/dm-db.test.mjs
TAP version 13
# Subtest: writeMessages normalizes records before storing
ok 1 - writeMessages normalizes records before storing
  ---
  duration_ms: 19.066028
  type: 'test'
  ...
# Subtest: updateConversationFromMessage persists metadata updates
ok 2 - updateConversationFromMessage persists metadata updates
  ---
  duration_ms: 6.80147
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
# duration_ms 34.854219

→ Running tests/dm-decryptor.test.mjs
TAP version 13
# Subtest: decryptDM handles kind 4 events with nip04 ciphertext
ok 1 - decryptDM handles kind 4 events with nip04 ciphertext
  ---
  duration_ms: 82.944295
  type: 'test'
  ...
# Subtest: decryptDM prefers recipient pubkeys when actor is the sender
ok 2 - decryptDM prefers recipient pubkeys when actor is the sender
  ---
  duration_ms: 26.96047
  type: 'test'
  ...
# Subtest: decryptDM unwraps kind 1059 gift wraps with nip44
ok 3 - decryptDM unwraps kind 1059 gift wraps with nip44
  ---
  duration_ms: 58.695332
  type: 'test'
  ...
# Subtest: decryptDM returns failure when decryptors are unavailable
ok 4 - decryptDM returns failure when decryptors are unavailable
  ---
  duration_ms: 0.368181
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
# duration_ms 182.31751

→ Running tests/dm-normalization.test.mjs
TAP version 13
# Subtest: direct message normalization hashes conversations consistently
ok 1 - direct message normalization hashes conversations consistently
  ---
  duration_ms: 17.675794
  type: 'test'
  ...
# Subtest: direct message list dedupes entries by event id
ok 2 - direct message list dedupes entries by event id
  ---
  duration_ms: 6.486956
  type: 'test'
  ...

→ Running tests/docs/verify-upload-claims.test.mjs
TAP version 13
# Subtest: Documentation Accuracy Verification
    # Subtest: setup
    ok 1 - setup
      ---
      duration_ms: 8.134501
      type: 'test'
      ...
    # Subtest: should list accepted video file extensions in docs matching the HTML accept attribute
    ok 2 - should list accepted video file extensions in docs matching the HTML accept attribute
      ---
      duration_ms: 0.676435
      type: 'test'
      ...
    # Subtest: should state Title is required in docs and be required in HTML
    ok 3 - should state Title is required in docs and be required in HTML
      ---
      duration_ms: 0.388567
      type: 'test'
      ...
    # Subtest: should mention 2GB limit recommendation in docs and HTML
    ok 4 - should mention 2GB limit recommendation in docs and HTML
      ---
      duration_ms: 0.381846
      type: 'test'
      ...
    1..4
ok 1 - Documentation Accuracy Verification
  ---
  duration_ms: 11.307883
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
# duration_ms 20.603302

→ Running tests/edit-modal-submit-state.test.mjs
TAP version 13
# Subtest: ignores additional submissions while pending without spurious errors
ok 1 - ignores additional submissions while pending without spurious errors
  ---
  duration_ms: 281.57233
  type: 'test'
  ...
# Subtest: editing the magnet refreshes torrent hints when ws/xs remain locked
ok 2 - editing the magnet refreshes torrent hints when ws/xs remain locked
  ---
  duration_ms: 105.743501
  type: 'test'
  ...
# Subtest: does not show missing video error after modal closes
ok 3 - does not show missing video error after modal closes
  ---
  duration_ms: 93.119821
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
# duration_ms 493.900317

→ Running tests/event-schemas.test.mjs
TAP version 13
# Subtest: Nostr Event Schemas
    # Subtest: should validate buildVideoPostEvent
    ok 1 - should validate buildVideoPostEvent
      ---
      duration_ms: 2.366086
      type: 'test'
      ...
    # Subtest: should validate buildVideoMirrorEvent
    ok 2 - should validate buildVideoMirrorEvent
      ---
      duration_ms: 0.412911
      type: 'test'
      ...
    # Subtest: should validate buildRepostEvent
    ok 3 - should validate buildRepostEvent
      ---
      duration_ms: 0.496216
      type: 'test'
      ...
    # Subtest: should validate buildShareEvent
    ok 4 - should validate buildShareEvent
      ---
      duration_ms: 0.752307
      type: 'test'
      ...
    # Subtest: should validate buildRelayListEvent
    ok 5 - should validate buildRelayListEvent
      ---
      duration_ms: 0.547462
      type: 'test'
      ...
    # Subtest: should validate buildDmRelayListEvent
    ok 6 - should validate buildDmRelayListEvent
      ---
      duration_ms: 0.494933
      type: 'test'
      ...
    # Subtest: should validate buildProfileMetadataEvent
    ok 7 - should validate buildProfileMetadataEvent
      ---
      duration_ms: 0.479381
      type: 'test'
      ...
    # Subtest: should validate buildMuteListEvent
    ok 8 - should validate buildMuteListEvent
      ---
      duration_ms: 0.414225
      type: 'test'
      ...
    # Subtest: should validate buildDeletionEvent
    ok 9 - should validate buildDeletionEvent
      ---
      duration_ms: 0.847797
      type: 'test'
      ...
    # Subtest: should validate buildLegacyDirectMessageEvent
    ok 10 - should validate buildLegacyDirectMessageEvent
      ---
      duration_ms: 0.504699
      type: 'test'
      ...
    # Subtest: should validate buildDmAttachmentEvent
    ok 11 - should validate buildDmAttachmentEvent
      ---
      duration_ms: 0.271428
      type: 'test'
      ...
    # Subtest: should validate buildDmReadReceiptEvent
    ok 12 - should validate buildDmReadReceiptEvent
      ---
      duration_ms: 0.246756
      type: 'test'
      ...
    # Subtest: should validate buildDmTypingIndicatorEvent
    ok 13 - should validate buildDmTypingIndicatorEvent
      ---
      duration_ms: 0.304958
      type: 'test'
      ...
    # Subtest: should validate buildViewEvent
    ok 14 - should validate buildViewEvent
      ---
      duration_ms: 0.533127
      type: 'test'
      ...
    # Subtest: should validate buildZapRequestEvent
    ok 15 - should validate buildZapRequestEvent
      ---
      duration_ms: 0.397321
      type: 'test'
      ...
    # Subtest: should validate buildReactionEvent
    ok 16 - should validate buildReactionEvent
      ---
      duration_ms: 0.720611
      type: 'test'
      ...
    # Subtest: should validate buildCommentEvent
    ok 17 - should validate buildCommentEvent
      ---
      duration_ms: 0.814599
      type: 'test'
      ...
    # Subtest: should validate buildWatchHistoryEvent
    ok 18 - should validate buildWatchHistoryEvent
      ---
      duration_ms: 0.36468
      type: 'test'
      ...
    # Subtest: should validate buildSubscriptionListEvent
    ok 19 - should validate buildSubscriptionListEvent
      ---
      duration_ms: 0.234519
      type: 'test'
      ...
    # Subtest: should validate buildBlockListEvent
    ok 20 - should validate buildBlockListEvent
      ---
      duration_ms: 0.18215
      type: 'test'
      ...
    # Subtest: should validate buildHashtagPreferenceEvent
    ok 21 - should validate buildHashtagPreferenceEvent
      ---
      duration_ms: 0.160192
      type: 'test'
      ...
    # Subtest: should validate buildAdminListEvent (moderation)
    ok 22 - should validate buildAdminListEvent (moderation)
      ---
      duration_ms: 0.336382
      type: 'test'
      ...
    1..22
ok 1 - Nostr Event Schemas
  ---
  duration_ms: 14.763646
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
# duration_ms 39.008293

→ Running tests/feed-engine/explore-diversity.test.mjs
TAP version 13
# Subtest: explore diversity sorter increases tag diversity in the top results
ok 1 - explore diversity sorter increases tag diversity in the top results
  ---
  duration_ms: 2.740235
  type: 'test'
  ...
# Subtest: explore diversity sorter logs why when MMR re-orders similar candidates
ok 2 - explore diversity sorter logs why when MMR re-orders similar candidates
  ---
  duration_ms: 1.246067
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
# duration_ms 17.125799

→ Running tests/feed-engine/explore-scorer.test.mjs
TAP version 13
# Subtest: explore disinterest filter drops videos with disinterested tags
ok 1 - explore disinterest filter drops videos with disinterested tags
  ---
  duration_ms: 1.835217
  type: 'test'
  ...
# Subtest: explore scorer penalizes disinterest overlap and logs why metadata
ok 2 - explore scorer penalizes disinterest overlap and logs why metadata
  ---
  duration_ms: 1.846634
  type: 'test'
  ...
# Subtest: explore scorer rewards novelty and new tag fraction
ok 3 - explore scorer rewards novelty and new tag fraction
  ---
  duration_ms: 0.550562
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
# duration_ms 17.784106

→ Running tests/feed-engine/kids-scorer.test.mjs
TAP version 13
# Subtest: kids scorer correctly identifies dominant positive component
ok 1 - kids scorer correctly identifies dominant positive component
  ---
  duration_ms: 2.685583
  type: 'test'
  ...
# Subtest: kids scorer picks educational-boost when dominant
ok 2 - kids scorer picks educational-boost when dominant
  ---
  duration_ms: 0.482839
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
# duration_ms 15.715563

→ Running tests/feed-engine/tag-preference-filter.test.mjs
TAP version 13
# Subtest: tag preference stage filters by interests and excludes disinterests
ok 1 - tag preference stage filters by interests and excludes disinterests
  ---
  duration_ms: 2.86039
  type: 'test'
  ...
# Subtest: tag preference stage accepts interests from nip71 hashtags
ok 2 - tag preference stage accepts interests from nip71 hashtags
  ---
  duration_ms: 0.411438
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
# duration_ms 16.497135

→ Running tests/grid-health.test.mjs
TAP version 13
# Subtest: prioritizeEntries input validation
ok 1 - prioritizeEntries input validation
  ---
  duration_ms: 85.707893
  type: 'test'
  ...
# Subtest: prioritizeEntries filtering
ok 2 - prioritizeEntries filtering
  ---
  duration_ms: 12.942524
  type: 'test'
  ...
# Subtest: prioritizeEntries without viewport center
ok 3 - prioritizeEntries without viewport center
  ---
  duration_ms: 9.9473
  type: 'test'
  ...
# Subtest: prioritizeEntries with viewport center
ok 4 - prioritizeEntries with viewport center
  ---
  duration_ms: 9.807917
  type: 'test'
  ...
# Subtest: prioritizeEntries ratio prioritization when distances are similar
ok 5 - prioritizeEntries ratio prioritization when distances are similar
  ---
  duration_ms: 10.32661
  type: 'test'
  ...
# Subtest: prioritizeEntries uses boundingClientRect fallback
ok 6 - prioritizeEntries uses boundingClientRect fallback
  ---
  duration_ms: 10.271787
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
# duration_ms 158.35628

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
  duration_ms: 22.734977
  type: 'test'
  ...
# Subtest: load falls back to nip04 decryption
ok 2 - load falls back to nip04 decryption
  ---
  duration_ms: 2.826757
  type: 'test'
  ...
# Subtest: load retries decryptors when hinted scheme fails
ok 3 - load retries decryptors when hinted scheme fails
  ---
  duration_ms: 2.729368
  type: 'test'
  ...
# Subtest: load defers permission-required decrypts until explicitly enabled
ok 4 - load defers permission-required decrypts until explicitly enabled
  ---
  duration_ms: 6.634545
  type: 'test'
  ...
# Subtest: interest and disinterest lists remain exclusive
ok 5 - interest and disinterest lists remain exclusive
  ---
  duration_ms: 14.254661
  type: 'test'
  ...
# Subtest: publish encrypts payload and builds event via builder
ok 6 - publish encrypts payload and builds event via builder
  ---
  duration_ms: 2.908514
  type: 'test'
  ...
# Subtest: publish falls back to window nostr encryptors
ok 7 - publish falls back to window nostr encryptors
  ---
  duration_ms: 2.950692
  type: 'test'
  ...
# Subtest: load prefers canonical kind when timestamps match while accepting legacy payload
ok 8 - load prefers canonical kind when timestamps match while accepting legacy payload
  ---
  duration_ms: 2.379647
  type: 'test'
  ...
# Subtest: load falls back to window.nostr when active signer is missing
ok 9 - load falls back to window.nostr when active signer is missing
  ---
  duration_ms: 2.099082
  type: 'test'
  ...
# Subtest: load falls back to window.nostr when active signer lacks decrypt capabilities
ok 10 - load falls back to window.nostr when active signer lacks decrypt capabilities
  ---
  duration_ms: 1.726472
  type: 'test'
  ...

→ Running tests/login-modal-controller.test.mjs
TAP version 13
# Subtest: LoginModalController shows custom error for empty nsec input
ok 1 - LoginModalController shows custom error for empty nsec input
  ---
  duration_ms: 212.73985
  type: 'test'
  ...
# Subtest: LoginModalController does not set required attribute when toggling modes
ok 2 - LoginModalController does not set required attribute when toggling modes
  ---
  duration_ms: 60.904058
  type: 'test'
  ...
# Subtest: LoginModalController shows NIP-46 handshake panel
ok 3 - LoginModalController shows NIP-46 handshake panel
  ---
  duration_ms: 54.632717
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
# duration_ms 341.431434

→ Running tests/magnet-utils.test.mjs
TAP version 13
# Subtest: safeDecodeMagnet handles encoded values
ok 1 - safeDecodeMagnet handles encoded values
  ---
  duration_ms: 1.830381
  type: 'test'
  ...
# Subtest: safeDecodeMagnet leaves plain strings untouched
ok 2 - safeDecodeMagnet leaves plain strings untouched
  ---
  duration_ms: 0.257354
  type: 'test'
  ...
# Subtest: bare hashes normalize consistently
ok 3 - bare hashes normalize consistently
  ---
  duration_ms: 2.815832
  type: 'test'
  ...
# Subtest: legacy %3A payloads decode
ok 4 - legacy %3A payloads decode
  ---
  duration_ms: 0.614362
  type: 'test'
  ...
# Subtest: duplicate trackers and hints stay in sync
ok 5 - duplicate trackers and hints stay in sync
  ---
  duration_ms: 0.775455
  type: 'test'
  ...
# Subtest: object helper enforces HTTPS web seeds when on HTTPS
ok 6 - object helper enforces HTTPS web seeds when on HTTPS
  ---
  duration_ms: 0.439018
  type: 'test'
  ...
# Subtest: object helper allows HTTP seeds on HTTP origins
ok 7 - object helper allows HTTP seeds on HTTP origins
  ---
  duration_ms: 0.456636
  type: 'test'
  ...
# Subtest: extractMagnetHints returns first ws/xs pair
ok 8 - extractMagnetHints returns first ws/xs pair
  ---
  duration_ms: 0.536883
  type: 'test'
  ...
# Subtest: object helper reports didChange when output differs
ok 9 - object helper reports didChange when output differs
  ---
  duration_ms: 0.753644
  type: 'test'
  ...
# Subtest: helpers trim fragments from non-magnet values
ok 10 - helpers trim fragments from non-magnet values
  ---
  duration_ms: 0.605723
  type: 'test'
  ...
# Subtest: normalizeAndAugmentMagnet filters out known broken trackers
ok 11 - normalizeAndAugmentMagnet filters out known broken trackers
  ---
  duration_ms: 0.595131
  type: 'test'
  ...
# Subtest: normalizeMagnetInput parses each inbound parameter exactly once
ok 12 - normalizeMagnetInput parses each inbound parameter exactly once
  ---
  duration_ms: 0.346684
  type: 'test'
  ...
# Subtest: normalizeAndAugmentMagnet keeps unchanged xt/tr/ws/xs params singular
ok 13 - normalizeAndAugmentMagnet keeps unchanged xt/tr/ws/xs params singular
  ---
  duration_ms: 0.556752
  type: 'test'
  ...
# Subtest: normalizeMagnetInput preserves parameter values containing additional equals signs
ok 14 - normalizeMagnetInput preserves parameter values containing additional equals signs
  ---
  duration_ms: 0.413061
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
# duration_ms 32.632838

→ Running tests/media-loader.test.mjs
TAP version 13
# Subtest: MediaLoader assigns image sources once intersecting
ok 1 - MediaLoader assigns image sources once intersecting
  ---
  duration_ms: 94.328746
  type: 'test'
  ...
# Subtest: MediaLoader loads video sources and poster fallbacks
ok 2 - MediaLoader loads video sources and poster fallbacks
  ---
  duration_ms: 19.682415
  type: 'test'
  ...
# Subtest: MediaLoader clears unsupported lazy targets without inline styles
ok 3 - MediaLoader clears unsupported lazy targets without inline styles
  ---
  duration_ms: 11.90463
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
# duration_ms 140.751529

→ Running tests/minimal-channel-profile.test.mjs
TAP version 13
# Subtest: can import channelProfile
ok 1 - can import channelProfile
  ---
  duration_ms: 0.947132
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
# duration_ms 26.218447

→ Running tests/minimal-webtorrent.test.mjs
TAP version 13
# Subtest: can import WebTorrent
ok 1 - can import WebTorrent
  ---
  duration_ms: 0.98591
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
# duration_ms 10.966084

→ Running tests/modal-accessibility.test.mjs
TAP version 13
# Subtest: UploadModal closes on Escape and restores trigger focus
ok 1 - UploadModal closes on Escape and restores trigger focus
  ---
  duration_ms: 320.735225
  type: 'test'
  ...
# Subtest: UploadModal backdrop click closes and restores trigger focus
ok 2 - UploadModal backdrop click closes and restores trigger focus
  ---
  duration_ms: 84.805821
  type: 'test'
  ...
# Subtest: UploadModal mode toggle updates button states
ok 3 - UploadModal mode toggle updates button states
  ---
  duration_ms: 72.765336
  type: 'test'
  ...
# Subtest: EditModal Escape closes and restores trigger focus
ok 4 - EditModal Escape closes and restores trigger focus
  ---
  duration_ms: 95.217634
  type: 'test'
  ...
# Subtest: EditModal backdrop click closes and restores trigger focus
ok 5 - EditModal backdrop click closes and restores trigger focus
  ---
  duration_ms: 88.289785
  type: 'test'
  ...
# Subtest: EditModal visibility toggle updates button state
ok 6 - EditModal visibility toggle updates button state
  ---
  duration_ms: 80.063657
  type: 'test'
  ...
# Subtest: RevertModal Escape closes and restores trigger focus
ok 7 - RevertModal Escape closes and restores trigger focus
  ---
  duration_ms: 59.22594
  type: 'test'
  ...
# Subtest: static modal helper toggles accessibility hooks
ok 8 - static modal helper toggles accessibility hooks
  ---
  duration_ms: 13.01931
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
# duration_ms 822.823162

→ Running tests/moderation-service.test.mjs
TAP version 13
# Subtest: trusted report summaries respect personal blocks and admin lists
ok 1 - trusted report summaries respect personal blocks and admin lists
  ---
  duration_ms: 5.111963
  type: 'test'
  ...
# Subtest: user block updates recompute summaries and emit notifications
ok 2 - user block updates recompute summaries and emit notifications
  ---
  duration_ms: 4.383673
  type: 'test'
  ...
# Subtest: moderation thresholds emit logger hooks only when crossing
ok 3 - moderation thresholds emit logger hooks only when crossing
  ---
  duration_ms: 1.677059
  type: 'test'
  ...
# Subtest: trusted mute aggregation tracks F1 mute lists
ok 4 - trusted mute aggregation tracks F1 mute lists
  ---
  duration_ms: 1.674698
  type: 'test'
  ...
# Subtest: viewer mute list publishes and updates aggregation
ok 5 - viewer mute list publishes and updates aggregation
  ---
  duration_ms: 2.485103
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
# duration_ms 2022.619582

→ Running tests/moderation-stage.test.mjs
TAP version 13
# Subtest: moderation stage enforces admin lists without whitelist bypass
ok 1 - moderation stage enforces admin lists without whitelist bypass
  ---
  duration_ms: 5.179233
  type: 'test'
  ...
# Subtest: moderation stage annotates trusted mute metadata
ok 2 - moderation stage annotates trusted mute metadata
  ---
  duration_ms: 1.195483
  type: 'test'
  ...
# Subtest: moderation stage applies provided thresholds
ok 3 - moderation stage applies provided thresholds
  ---
  duration_ms: 1.475407
  type: 'test'
  ...
# Subtest: moderation stage respects runtime threshold changes
ok 4 - moderation stage respects runtime threshold changes
  ---
  duration_ms: 0.940511
  type: 'test'
  ...
# Subtest: moderation stage supports function-based threshold resolvers
ok 5 - moderation stage supports function-based threshold resolvers
  ---
  duration_ms: 0.830756
  type: 'test'
  ...
# Subtest: moderation stage propagates whitelist, muters, and threshold updates
ok 6 - moderation stage propagates whitelist, muters, and threshold updates
  ---
  duration_ms: 1.19115
  type: 'test'
  ...
# Subtest: moderation stage blurs viewer-muted authors
ok 7 - moderation stage blurs viewer-muted authors
  ---
  duration_ms: 0.557561
  type: 'test'
  ...
# Subtest: moderation stage clears cached reporters and muters after service signals
ok 8 - moderation stage clears cached reporters and muters after service signals
  ---
  duration_ms: 0.855191
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
# duration_ms 36.940286

→ Running tests/moderation/hide-thresholds.test.mjs
TAP version 13
# Subtest: moderation stage hides videos muted by trusted when threshold met
ok 1 - moderation stage hides videos muted by trusted when threshold met
  ---
  duration_ms: 4.518875
  type: 'test'
  ...
# Subtest: moderation stage hides videos when trusted reports exceed threshold
ok 2 - moderation stage hides videos when trusted reports exceed threshold
  ---
  duration_ms: 0.717525
  type: 'test'
  ...
# Subtest: moderation stage respects runtime hide threshold changes
ok 3 - moderation stage respects runtime hide threshold changes
  ---
  duration_ms: 1.097001
  type: 'test'
  ...
# Subtest: moderation stage supports trusted mute hide resolver functions
ok 4 - moderation stage supports trusted mute hide resolver functions
  ---
  duration_ms: 1.162414
  type: 'test'
  ...
# Subtest: moderation stage bypasses hard hides on home feed
ok 5 - moderation stage bypasses hard hides on home feed
  ---
  duration_ms: 0.66634
  type: 'test'
  ...
# Subtest: moderation stage hides admin-whitelisted videos once thresholds fire
ok 6 - moderation stage hides admin-whitelisted videos once thresholds fire
  ---
  duration_ms: 0.721653
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
# duration_ms 26.358557

→ Running tests/moderation/submit-report.test.mjs
TAP version 13
# Subtest: submitReport emits NIP-56 compliant report tags
ok 1 - submitReport emits NIP-56 compliant report tags
  ---
  duration_ms: 11.180256
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
# duration_ms 19.106344

→ Running tests/moderation/trust-seeds.test.mjs
[bitvid] [moderationService] moderation threshold crossed
[bitvid] [moderationService] moderation threshold crossed
[bitvid] [moderationService] moderation threshold crossed
[bitvid] [moderationService] moderation threshold crossed
TAP version 13
# Subtest: default trust seeds derive from config
ok 1 - default trust seeds derive from config
  ---
  duration_ms: 2.201595
  type: 'test'
  ...
# Subtest: trusted seeds contribute to trusted mute counts
ok 2 - trusted seeds contribute to trusted mute counts
  ---
  duration_ms: 4.244108
  type: 'test'
  ...
# Subtest: trusted seeds contribute to trusted report counts
ok 3 - trusted seeds contribute to trusted report counts
  ---
  duration_ms: 3.80645
  type: 'test'
  ...
# Subtest: trusted seed updates recompute guest report summaries
ok 4 - trusted seed updates recompute guest report summaries
  ---
  duration_ms: 1.226695
  type: 'test'
  ...
# Subtest: moderator seeds populate trusted contacts
ok 5 - moderator seeds populate trusted contacts
  ---
  duration_ms: 0.945059
  type: 'test'
  ...
# Subtest: bootstrap seeds track editor roster and ignore whitelist-only changes
ok 6 - bootstrap seeds track editor roster and ignore whitelist-only changes
  ---
  duration_ms: 100.078365
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
# duration_ms 3620.078395

→ Running tests/moderation/trusted-mute-lists.test.mjs
TAP version 13
# Subtest: trusted mute lists from seeds hide authors for anonymous viewers
ok 1 - trusted mute lists from seeds hide authors for anonymous viewers
  ---
  duration_ms: 15.996734
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
# duration_ms 2018.495766

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
  duration_ms: 5.849074
  type: 'test'
  ...
# Subtest: trustedReportCount ignores reports from muted or blocked reporters
ok 2 - trustedReportCount ignores reports from muted or blocked reporters
  ---
  duration_ms: 2.464226
  type: 'test'
  ...
# Subtest: blocking and unblocking reporters recomputes trusted summaries
ok 3 - blocking and unblocking reporters recomputes trusted summaries
  ---
  duration_ms: 3.151037
  type: 'test'
  ...
# Subtest: trustedReportCount only counts eligible F1 reporters and admin whitelist
ok 4 - trustedReportCount only counts eligible F1 reporters and admin whitelist
  ---
  duration_ms: 2.141379
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
# duration_ms 2019.16829

→ Running tests/moderation/video-card.test.mjs
TAP version 13
# Subtest: VideoCard renders moderation badges and respects viewer override
ok 1 - VideoCard renders moderation badges and respects viewer override
  ---
  duration_ms: 139.596585
  type: 'test'
  ...
# Subtest: VideoCard hides content when hide metadata is present and override unmasks it
ok 2 - VideoCard hides content when hide metadata is present and override unmasks it
  ---
  duration_ms: 34.510215
  type: 'test'
  ...
# Subtest: VideoCard blurs viewer-muted creators
ok 3 - VideoCard blurs viewer-muted creators
  ---
  duration_ms: 19.793226
  type: 'test'
  ...
# Subtest: VideoCard blurs thumbnails when trusted mute triggers without reports
ok 4 - VideoCard blurs thumbnails when trusted mute triggers without reports
  ---
  duration_ms: 17.103429
  type: 'test'
  ...
# Subtest: VideoCard block action restores trusted mute hide state after override
ok 5 - VideoCard block action restores trusted mute hide state after override
  ---
  duration_ms: 31.874427
  type: 'test'
  ...
# Subtest: applyModerationContextDatasets clears blur when overrides are active
ok 6 - applyModerationContextDatasets clears blur when overrides are active
  ---
  duration_ms: 9.328694
  type: 'test'
  ...
# Subtest: buildModerationBadgeText returns trusted contact block copy when autoplay block and trusted mute combine
ok 7 - buildModerationBadgeText returns trusted contact block copy when autoplay block and trusted mute combine
  ---
  duration_ms: 0.266767
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
# duration_ms 269.269176

→ Running tests/more-menu-controller.test.mjs
TAP version 13
# Subtest: copy-link action writes to clipboard and shows success
ok 1 - copy-link action writes to clipboard and shows success
  ---
  duration_ms: 3.095662
  type: 'test'
  ...
# Subtest: blacklist-author requires moderator access and refreshes subscriptions
ok 2 - blacklist-author requires moderator access and refreshes subscriptions
  ---
  duration_ms: 0.676319
  type: 'test'
  ...
# Subtest: blacklist-author shows error when no moderator session is available
ok 3 - blacklist-author shows error when no moderator session is available
  ---
  duration_ms: 0.36867
  type: 'test'
  ...
# Subtest: block-author updates user blocks, reloads videos, and refreshes feeds
ok 4 - block-author updates user blocks, reloads videos, and refreshes feeds
  ---
  duration_ms: 0.661365
  type: 'test'
  ...
# Subtest: mute-author updates viewer mute list and refreshes feeds
ok 5 - mute-author updates viewer mute list and refreshes feeds
  ---
  duration_ms: 0.666003
  type: 'test'
  ...
# Subtest: unmute-author removes creators from viewer mute list
ok 6 - unmute-author removes creators from viewer mute list
  ---
  duration_ms: 0.607944
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
# duration_ms 21.398834

→ Running tests/nip07-concurrency.test.mjs
TAP version 13
# Subtest: NIP-07 Concurrency Queue
    # Subtest: runs up to 5 tasks concurrently
    ok 1 - runs up to 5 tasks concurrently
      ---
      duration_ms: 304.272785
      type: 'test'
      ...
    # Subtest: respects priority
    ok 2 - respects priority
      ---
      duration_ms: 153.423962
      type: 'test'
      ...
    1..2
ok 1 - NIP-07 Concurrency Queue
  ---
  duration_ms: 459.795455
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
# duration_ms 467.779844

→ Running tests/nip71-base-event-tags.test.mjs
TAP version 13
# Subtest: 30078 events carry nip71 metadata tags and hydrate fallback metadata
ok 1 - 30078 events carry nip71 metadata tags and hydrate fallback metadata
  ---
  duration_ms: 5.946745
  type: 'test'
  ...
# Subtest: imeta tags lower-case mime values
ok 2 - imeta tags lower-case mime values
  ---
  duration_ms: 0.446174
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
# duration_ms 17.964068

→ Running tests/nip71-builder.test.mjs
TAP version 13
# Subtest: buildNip71VideoEvent assembles rich metadata
ok 1 - buildNip71VideoEvent assembles rich metadata
  ---
  duration_ms: 3.778872
  type: 'test'
  ...
# Subtest: buildNip71VideoEvent falls back to summary and selects kind
ok 2 - buildNip71VideoEvent falls back to summary and selects kind
  ---
  duration_ms: 0.399633
  type: 'test'
  ...
# Subtest: buildNip71VideoEvent attaches pointer tags
ok 3 - buildNip71VideoEvent attaches pointer tags
  ---
  duration_ms: 0.404645
  type: 'test'
  ...
# Subtest: extractNip71MetadataFromTags parses metadata and pointers
ok 4 - extractNip71MetadataFromTags parses metadata and pointers
  ---
  duration_ms: 1.193632
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
# duration_ms 19.218498

→ Running tests/nip71-form-manager.test.mjs
TAP version 13
# Subtest: collectSection sanitizes and deduplicates hashtags
ok 1 - collectSection sanitizes and deduplicates hashtags
  ---
  duration_ms: 119.227299
  type: 'test'
  ...
# Subtest: hydrateSection renders sanitized hashtags with prefix
ok 2 - hydrateSection renders sanitized hashtags with prefix
  ---
  duration_ms: 24.051715
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
# duration_ms 160.203219

→ Running tests/nostr-login-permissions.test.mjs
TAP version 13
# Subtest: NIP-07 Login Permissions
    # Subtest: NIP-07 login requests decrypt permissions upfront
    ok 1 - NIP-07 login requests decrypt permissions upfront
      ---
      duration_ms: 5.74107
      type: 'test'
      ...
    # Subtest: NIP-07 decrypt reuses cached extension permissions
    ok 2 - NIP-07 decrypt reuses cached extension permissions
      ---
      duration_ms: 1.703473
      type: 'test'
      ...
    # Subtest: NIP-07 login falls back when structured permissions fail
    ok 3 - NIP-07 login falls back when structured permissions fail
      ---
      duration_ms: 1.548918
      type: 'test'
      ...
    # Subtest: NIP-07 login supports extensions that only allow enable() without payload
    ok 4 - NIP-07 login supports extensions that only allow enable() without payload
      ---
      duration_ms: 1.453856
      type: 'test'
      ...
    # Subtest: NIP-07 login quickly retries when a permission payload stalls
    ok 5 - NIP-07 login quickly retries when a permission payload stalls
      ---
      duration_ms: 82.700552
      type: 'test'
      ...
    # Subtest: NIP-07 login does not wait for deferred permission grants
    ok 6 - NIP-07 login does not wait for deferred permission grants
      ---
      duration_ms: 302.345147
      type: 'test'
      ...
    # Subtest: NIP-07 login surfaces enable permission errors
    ok 7 - NIP-07 login surfaces enable permission errors
      ---
      duration_ms: 1.709508
      type: 'test'
      ...
    # Subtest: runNip07WithRetry respects timeout without retry multiplier
    ok 8 - runNip07WithRetry respects timeout without retry multiplier
      ---
      duration_ms: 60.666658
      type: 'test'
      ...
    1..8
ok 1 - NIP-07 Login Permissions
  ---
  duration_ms: 460.039633
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
# duration_ms 468.81276

→ Running tests/nostr-nip46-queue.test.mjs
TAP version 13
# Subtest: Nip46RequestQueue: processes tasks in FIFO order for same priority
ok 1 - Nip46RequestQueue: processes tasks in FIFO order for same priority
  ---
  duration_ms: 2.352689
  type: 'test'
  ...
# Subtest: Nip46RequestQueue: respects priority levels
ok 2 - Nip46RequestQueue: respects priority levels
  ---
  duration_ms: 10.56416
  type: 'test'
  ...
# Subtest: Nip46RequestQueue: respects minDelayMs
ok 3 - Nip46RequestQueue: respects minDelayMs
  ---
  duration_ms: 101.61828
  type: 'test'
  ...
# Subtest: Nip46RequestQueue: clear() rejects pending tasks
ok 4 - Nip46RequestQueue: clear() rejects pending tasks
  ---
  duration_ms: 101.564683
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
# duration_ms 224.639682

→ Running tests/nostr-private-key-signer.test.mjs
TAP version 13
# Subtest: Nostr Private Key Signer
    # Subtest: registerPrivateKeySigner exposes nip04 helpers
    ok 1 - registerPrivateKeySigner exposes nip04 helpers
      ---
      duration_ms: 150.613689
      type: 'test'
      ...
    1..1
ok 1 - Nostr Private Key Signer
  ---
  duration_ms: 152.22873
  type: 'suite'
  ...

→ Running tests/nostr-send-direct-message.test.mjs
TAP version 13
# Subtest: sendDirectMessage succeeds with private key signer and no extension
ok 1 - sendDirectMessage succeeds with private key signer and no extension
  ---
  duration_ms: 228.703559
  type: 'test'
  ...

→ Running tests/nostr-service-access-control.test.mjs
TAP version 13
# Subtest: shouldIncludeVideo returns true for whitelist author when npubEncode throws
ok 1 - shouldIncludeVideo returns true for whitelist author when npubEncode throws
  ---
  duration_ms: 2.87947
  type: 'test'
  ...
# Subtest: shouldIncludeVideo rejects blacklisted authors provided as npub
ok 2 - shouldIncludeVideo rejects blacklisted authors provided as npub
  ---
  duration_ms: 2.518078
  type: 'test'
  ...
# Subtest: shouldIncludeVideo rejects blacklisted authors provided as hex when npubEncode throws
ok 3 - shouldIncludeVideo rejects blacklisted authors provided as hex when npubEncode throws
  ---
  duration_ms: 63.943386
  type: 'test'
  ...
# Subtest: shouldIncludeVideo always returns true for the viewer's own video
ok 4 - shouldIncludeVideo always returns true for the viewer's own video
  ---
  duration_ms: 0.386115
  type: 'test'
  ...
# Subtest: shouldIncludeVideo allows access when access control would deny the author
ok 5 - shouldIncludeVideo allows access when access control would deny the author
  ---
  duration_ms: 0.387781
  type: 'test'
  ...

→ Running tests/nostr-session-actor.test.mjs
TAP version 13
# Subtest: isSubtleCryptoAvailable returns true in test env
ok 1 - isSubtleCryptoAvailable returns true in test env
  ---
  duration_ms: 2.057977
  type: 'test'
  ...
# Subtest: generateRandomBytes returns correct length
ok 2 - generateRandomBytes returns correct length
  ---
  duration_ms: 1.688036
  type: 'test'
  ...
# Subtest: encryptSessionPrivateKey and decryptSessionPrivateKey roundtrip
ok 3 - encryptSessionPrivateKey and decryptSessionPrivateKey roundtrip
  ---
  duration_ms: 300.323252
  type: 'test'
  ...
# Subtest: decryptSessionPrivateKey fails with wrong passphrase
ok 4 - decryptSessionPrivateKey fails with wrong passphrase
  ---
  duration_ms: 311.777993
  type: 'test'
  ...
# Subtest: persistSessionActor writes to localStorage and IndexedDB
ok 5 - persistSessionActor writes to localStorage and IndexedDB
  ---
  duration_ms: 153.639971
  type: 'test'
  ...
# Subtest: readStoredSessionActorEntry retrieves from localStorage
ok 6 - readStoredSessionActorEntry retrieves from localStorage
  ---
  duration_ms: 152.07417
  type: 'test'
  ...
# Subtest: clearStoredSessionActor removes from localStorage
ok 7 - clearStoredSessionActor removes from localStorage
  ---
  duration_ms: 1.510781
  type: 'test'
  ...
# Subtest: helper: arrayBufferToBase64 and base64ToUint8Array roundtrip
ok 8 - helper: arrayBufferToBase64 and base64ToUint8Array roundtrip
  ---
  duration_ms: 2.535837
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
# duration_ms 935.39355

→ Running tests/nostr-signer-race.test.mjs
TAP version 13
# Subtest: ensureActiveSignerForPubkey prefers concurrent login over late extension injection
ok 1 - ensureActiveSignerForPubkey prefers concurrent login over late extension injection
  ---
  duration_ms: 104.059105
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
# duration_ms 113.492578

→ Running tests/nostr/adapters.test.mjs
TAP version 13
# Subtest: createNsecAdapter wires signing and cipher capabilities
ok 1 - createNsecAdapter wires signing and cipher capabilities
  ---
  duration_ms: 68.343867
  type: 'test'
  ...
# Subtest: createNip07Adapter maps extension methods and permissions
ok 2 - createNip07Adapter maps extension methods and permissions
  ---
  duration_ms: 3.244983
  type: 'test'
  ...
# Subtest: createNip46Adapter wraps the remote signer client
ok 3 - createNip46Adapter wraps the remote signer client
  ---
  duration_ms: 0.682493
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
# duration_ms 84.807491

→ Running tests/nostr/cachePolicies.test.mjs
TAP version 13
# Subtest: CACHE_POLICIES structure
ok 1 - CACHE_POLICIES structure
  ---
  duration_ms: 1.262135
  type: 'test'
  ...
# Subtest: VIDEO_POST policy
ok 2 - VIDEO_POST policy
  ---
  duration_ms: 0.242378
  type: 'test'
  ...
# Subtest: WATCH_HISTORY policy
ok 3 - WATCH_HISTORY policy
  ---
  duration_ms: 0.166041
  type: 'test'
  ...
# Subtest: SUBSCRIPTION_LIST policy
ok 4 - SUBSCRIPTION_LIST policy
  ---
  duration_ms: 0.161223
  type: 'test'
  ...
# Subtest: VIDEO_COMMENT policy
ok 5 - VIDEO_COMMENT policy
  ---
  duration_ms: 0.355614
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
# duration_ms 16.144914

→ Running tests/nostr/client.test.mjs
TAP version 13
# Subtest: NostrClient
    # Subtest: Initialization
        # Subtest: should initialize with default state
        ok 1 - should initialize with default state
          ---
          duration_ms: 3.575119
          type: 'test'
          ...
        1..1
    ok 1 - Initialization
      ---
      duration_ms: 4.508835
      type: 'suite'
      ...
    # Subtest: fetchListIncrementally
        # Subtest: should fetch events and deduplicate results
        ok 1 - should fetch events and deduplicate results
          ---
          duration_ms: 3.77674
          type: 'test'
          ...
        # Subtest: should handle incremental updates using lastSeen
        ok 2 - should handle incremental updates using lastSeen
          ---
          duration_ms: 1.752432
          type: 'test'
          ...
        # Subtest: should override lastSeen with explicit since parameter
        ok 3 - should override lastSeen with explicit since parameter
          ---
          duration_ms: 1.288862
          type: 'test'
          ...
        # Subtest: should force full fetch if since is 0
        ok 4 - should force full fetch if since is 0
          ---
          duration_ms: 1.398367
          type: 'test'
          ...
        1..4
    ok 2 - fetchListIncrementally
      ---
      duration_ms: 8.6615
      type: 'suite'
      ...
    # Subtest: subscribeVideos
        # Subtest: should subscribe to video events and buffer them
        ok 1 - should subscribe to video events and buffer them
          ---
          duration_ms: 301.700089
          type: 'test'
          ...
        1..1
    ok 3 - subscribeVideos
      ---
      duration_ms: 302.327207
      type: 'suite'
      ...
    # Subtest: fetchVideos
        # Subtest: should delegate to subscribeVideos and return result on eose
        ok 1 - should delegate to subscribeVideos and return result on eose
          ---
          duration_ms: 3.04366
          type: 'test'
          ...
        # Subtest: should respect since parameter if provided
        ok 2 - should respect since parameter if provided
          ---
          duration_ms: 2.159426
          type: 'test'
          ...
        1..2
    ok 4 - fetchVideos
      ---
      duration_ms: 5.780961
      type: 'suite'
      ...
    # Subtest: publishVideo
        # Subtest: should throw if not logged in
        ok 1 - should throw if not logged in
          ---
          duration_ms: 2.510983
          type: 'test'
          ...
        # Subtest: should sign and publish a valid video
        ok 2 - should sign and publish a valid video
          ---
          duration_ms: 3.822075
          type: 'test'
          ...
        1..2
    ok 5 - publishVideo
      ---
      duration_ms: 6.565471
      type: 'suite'
      ...
    # Subtest: editVideo
        # Subtest: should throw if not owner
        ok 1 - should throw if not owner
          ---
          duration_ms: 0.90559
          type: 'test'
          ...
        1..1
    ok 6 - editVideo
      ---
      duration_ms: 1.042389
      type: 'suite'
      ...
    # Subtest: revertVideo
        # Subtest: should publish a deletion marker event
        ok 1 - should publish a deletion marker event
          ---
          duration_ms: 0.555098
          type: 'test'
          ...
        1..1
    ok 7 - revertVideo
      ---
      duration_ms: 0.660186
      type: 'suite'
      ...
    1..7
ok 1 - NostrClient
  ---
  duration_ms: 331.162109
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
# duration_ms 556.29149

→ Running tests/nostr/comment-events.test.mjs
TAP version 13
# Subtest: publishComment prefers active signer when available
ok 1 - publishComment prefers active signer when available
  ---
  duration_ms: 7.319363
  type: 'test'
  ...
# Subtest: publishComment rejects when active signer is unavailable
ok 2 - publishComment rejects when active signer is unavailable
  ---
  duration_ms: 0.384717
  type: 'test'
  ...
# Subtest: publishComment accepts legacy targets with only an event id
ok 3 - publishComment accepts legacy targets with only an event id
  ---
  duration_ms: 1.459577
  type: 'test'
  ...
# Subtest: publishComment derives root and parent metadata from parent comment tags
ok 4 - publishComment derives root and parent metadata from parent comment tags
  ---
  duration_ms: 1.223592
  type: 'test'
  ...
# Subtest: listVideoComments matches comments even when tag casing and whitespace differ
ok 5 - listVideoComments matches comments even when tag casing and whitespace differ
  ---
  duration_ms: 2.409046
  type: 'test'
  ...
# Subtest: listVideoComments matches uppercase definition addresses without lowering
ok 6 - listVideoComments matches uppercase definition addresses without lowering
  ---
  duration_ms: 1.046232
  type: 'test'
  ...
# Subtest: publishComment emits only uppercase video event pointer when address and parent are absent
ok 7 - publishComment emits only uppercase video event pointer when address and parent are absent
  ---
  duration_ms: 1.03781
  type: 'test'
  ...
# Subtest: listVideoComments builds filters with uppercase roots plus legacy fallbacks
ok 8 - listVideoComments builds filters with uppercase roots plus legacy fallbacks
  ---
  duration_ms: 1.366667
  type: 'test'
  ...
# Subtest: listVideoComments emits uppercase root filters when only the identifier is known
ok 9 - listVideoComments emits uppercase root filters when only the identifier is known
  ---
  duration_ms: 1.26279
  type: 'test'
  ...
# Subtest: listVideoComments supports legacy targets without a definition address
ok 10 - listVideoComments supports legacy targets without a definition address
  ---
  duration_ms: 1.086719
  type: 'test'
  ...
# Subtest: subscribeVideoComments forwards matching events and cleans up unsubscribe
ok 11 - subscribeVideoComments forwards matching events and cleans up unsubscribe
  ---
  duration_ms: 9.832623
  type: 'test'
  ...
# Subtest: subscribeVideoComments supports video targets without a definition address
ok 12 - subscribeVideoComments supports video targets without a definition address
  ---
  duration_ms: 0.652357
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
# duration_ms 38.897108

→ Running tests/nostr/countDiagnostics.test.mjs
TAP version 13
# Subtest: countDiagnostics
    # Subtest: isVerboseDiagnosticsEnabled
        # Subtest: should return true by default (due to override)
        ok 1 - should return true by default (due to override)
          ---
          duration_ms: 1.168012
          type: 'test'
          ...
        # Subtest: should return false if window.__BITVID_VERBOSE_DEV_MODE__ is false
        ok 2 - should return false if window.__BITVID_VERBOSE_DEV_MODE__ is false
          ---
          duration_ms: 0.488579
          type: 'test'
          ...
        # Subtest: should return true if window.__BITVID_VERBOSE_DEV_MODE__ is true
        ok 3 - should return true if window.__BITVID_VERBOSE_DEV_MODE__ is true
          ---
          duration_ms: 0.403398
          type: 'test'
          ...
        # Subtest: should fall back to isVerboseDevMode if window flag is not boolean
        ok 4 - should fall back to isVerboseDevMode if window flag is not boolean
          ---
          duration_ms: 0.513134
          type: 'test'
          ...
        1..4
    ok 1 - isVerboseDiagnosticsEnabled
      ---
      duration_ms: 3.521242
      type: 'suite'
      ...
    # Subtest: logRelayCountFailure
        # Subtest: should log warning for new relay URL
        ok 1 - should log warning for new relay URL
          ---
          duration_ms: 1.11886
          type: 'test'
          ...
        # Subtest: should suppress 'Failed to connect to relay' errors
        ok 2 - should suppress 'Failed to connect to relay' errors
          ---
          duration_ms: 0.274437
          type: 'test'
          ...
        # Subtest: should throttle duplicate warnings for the same relay
        ok 3 - should throttle duplicate warnings for the same relay
          ---
          duration_ms: 0.384495
          type: 'test'
          ...
        # Subtest: should handle empty or non-string relay URLs
        ok 4 - should handle empty or non-string relay URLs
          ---
          duration_ms: 0.566046
          type: 'test'
          ...
        1..4
    ok 2 - logRelayCountFailure
      ---
      duration_ms: 2.810149
      type: 'suite'
      ...
    # Subtest: Other Loggers
        # Subtest: should log timeout cleanup failure once
        ok 1 - should log timeout cleanup failure once
          ---
          duration_ms: 0.481863
          type: 'test'
          ...
        # Subtest: should log rebroadcast failure once
        ok 2 - should log rebroadcast failure once
          ---
          duration_ms: 0.327733
          type: 'test'
          ...
        # Subtest: should log view count failure once
        ok 3 - should log view count failure once
          ---
          duration_ms: 0.354964
          type: 'test'
          ...
        1..3
    ok 3 - Other Loggers
      ---
      duration_ms: 1.416107
      type: 'suite'
      ...
    # Subtest: Verbose Mode Disabled
        # Subtest: should not log even for new keys when disabled
        ok 1 - should not log even for new keys when disabled
          ---
          duration_ms: 0.325848
          type: 'test'
          ...
        # Subtest: should not consume throttle key when disabled
        ok 2 - should not consume throttle key when disabled
          ---
          duration_ms: 0.342744
          type: 'test'
          ...
        1..2
    ok 4 - Verbose Mode Disabled
      ---
      duration_ms: 0.819976
      type: 'suite'
      ...
    1..4
ok 1 - countDiagnostics
  ---
  duration_ms: 13.44901
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
# duration_ms 36.63032

→ Running tests/nostr/decryptionSchemeCache.test.mjs
TAP version 13
# Subtest: decryptionSchemeCache
    # Subtest: stores and retrieves a scheme
    ok 1 - stores and retrieves a scheme
      ---
      duration_ms: 1.873392
      type: 'test'
      ...
    # Subtest: returns null for unknown pubkey
    ok 2 - returns null for unknown pubkey
      ---
      duration_ms: 0.368194
      type: 'test'
      ...
    # Subtest: handles invalid inputs gracefully
    ok 3 - handles invalid inputs gracefully
      ---
      duration_ms: 0.788329
      type: 'test'
      ...
    # Subtest: expires entries after TTL (2 hours)
    ok 4 - expires entries after TTL (2 hours)
      ---
      duration_ms: 0.656172
      type: 'test'
      ...
    # Subtest: does not expire entries before TTL
    ok 5 - does not expire entries before TTL
      ---
      duration_ms: 0.278652
      type: 'test'
      ...
    # Subtest: clears cache
    ok 6 - clears cache
      ---
      duration_ms: 0.255322
      type: 'test'
      ...
    1..6
ok 1 - decryptionSchemeCache
  ---
  duration_ms: 5.944987
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
# duration_ms 21.742247

→ Running tests/nostr/defaultClient.test.mjs
TAP version 13
# Subtest: Default NostrClient
    # Subtest: should be an instance of NostrClient
    ok 1 - should be an instance of NostrClient
      ---
      duration_ms: 1.121722
      type: 'test'
      ...
    # Subtest: should be configured with default relays
    ok 2 - should be configured with default relays
      ---
      duration_ms: 1.296162
      type: 'test'
      ...
    # Subtest: should be initialized with default read relays
    ok 3 - should be initialized with default read relays
      ---
      duration_ms: 0.209721
      type: 'test'
      ...
    # Subtest: should be initialized with default write relays
    ok 4 - should be initialized with default write relays
      ---
      duration_ms: 0.280539
      type: 'test'
      ...
    # Subtest: should be registered as the default client
    ok 5 - should be registered as the default client
      ---
      duration_ms: 0.261514
      type: 'test'
      ...
    1..5
ok 1 - Default NostrClient
  ---
  duration_ms: 4.925751
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
# duration_ms 17.990091

→ Running tests/nostr/dm-direct-message-flow.test.mjs
TAP version 13
# Subtest: DM relay duplication is deduped
ok 1 - DM relay duplication is deduped
  ---
  duration_ms: 151.055871
  type: 'test'
  ...
# Subtest: out-of-order DM delivery keeps newest messages first
ok 2 - out-of-order DM delivery keeps newest messages first
  ---
  duration_ms: 88.15987
  type: 'test'
  ...
# Subtest: DM reconnect replays do not duplicate messages or reset seen state
ok 3 - DM reconnect replays do not duplicate messages or reset seen state
  ---
  duration_ms: 177.706281
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
# duration_ms 424.729686

→ Running tests/nostr/dmDecryptDiagnostics.test.mjs
TAP version 13
# Subtest: dmDecryptDiagnostics
    # Subtest: summarizeDmEventForLog
        # Subtest: should return a default object when event is null or undefined
        ok 1 - should return a default object when event is null or undefined
          ---
          duration_ms: 2.014438
          type: 'test'
          ...
        # Subtest: should return a default object when event is not an object
        ok 2 - should return a default object when event is not an object
          ---
          duration_ms: 0.22789
          type: 'test'
          ...
        # Subtest: should summarize a valid event correctly
        ok 3 - should summarize a valid event correctly
          ---
          duration_ms: 0.389114
          type: 'test'
          ...
        # Subtest: should handle non-finite created_at
        ok 4 - should handle non-finite created_at
          ---
          duration_ms: 0.326087
          type: 'test'
          ...
        # Subtest: should handle non-finite kind
        ok 5 - should handle non-finite kind
          ---
          duration_ms: 0.245771
          type: 'test'
          ...
        # Subtest: should handle missing or invalid content
        ok 6 - should handle missing or invalid content
          ---
          duration_ms: 0.26281
          type: 'test'
          ...
        # Subtest: should handle missing or invalid tags
        ok 7 - should handle missing or invalid tags
          ---
          duration_ms: 0.322686
          type: 'test'
          ...
        1..7
    ok 1 - summarizeDmEventForLog
      ---
      duration_ms: 5.200182
      type: 'suite'
      ...
    # Subtest: sanitizeDecryptError
        # Subtest: should return null when error is null or undefined
        ok 1 - should return null when error is null or undefined
          ---
          duration_ms: 0.515575
          type: 'test'
          ...
        # Subtest: should handle string errors
        ok 2 - should handle string errors
          ---
          duration_ms: 0.365066
          type: 'test'
          ...
        # Subtest: should handle Error objects with standard properties
        ok 3 - should handle Error objects with standard properties
          ---
          duration_ms: 0.356169
          type: 'test'
          ...
        # Subtest: should handle Error objects with missing properties
        ok 4 - should handle Error objects with missing properties
          ---
          duration_ms: 0.173116
          type: 'test'
          ...
        # Subtest: should handle Error objects with non-string properties
        ok 5 - should handle Error objects with non-string properties
          ---
          duration_ms: 0.258411
          type: 'test'
          ...
        1..5
    ok 2 - sanitizeDecryptError
      ---
      duration_ms: 2.154015
      type: 'suite'
      ...
    1..2
ok 1 - dmDecryptDiagnostics
  ---
  duration_ms: 8.259791
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
# duration_ms 30.630347

→ Running tests/nostr/dmDecryptorPreference.test.mjs
TAP version 13
# Subtest: decryptDM prefers nip44 decryptors when available
ok 1 - decryptDM prefers nip44 decryptors when available
  ---
  duration_ms: 3.418369
  type: 'test'
  ...
# Subtest: decryptDM falls back to nip04 when nip44 fails
ok 2 - decryptDM falls back to nip04 when nip44 fails
  ---
  duration_ms: 0.656212
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
# duration_ms 17.584712

→ Running tests/nostr/dmDecryptWorkerClient.test.mjs
TAP version 13
# Subtest: dmDecryptWorkerClient
    # Subtest: should support worker environment
    ok 1 - should support worker environment
      ---
      duration_ms: 5.39924
      type: 'test'
      ...
    # Subtest: should reject if Worker is unavailable
    ok 2 - should reject if Worker is unavailable
      ---
      duration_ms: 3.103819
      type: 'test'
      ...
    # Subtest: should reject if inputs are invalid
    ok 3 - should reject if inputs are invalid
      ---
      duration_ms: 3.389702
      type: 'test'
      ...
    # Subtest: should successfully decrypt message
    ok 4 - should successfully decrypt message
      ---
      duration_ms: 9.179674
      type: 'test'
      ...
    # Subtest: should handle worker error response
    ok 5 - should handle worker error response
      ---
      duration_ms: 3.496063
      type: 'test'
      ...
    # Subtest: should handle worker error event
    ok 6 - should handle worker error event
      ---
      duration_ms: 4.482559
      type: 'test'
      ...
    # Subtest: should timeout if worker does not respond
    ok 7 - should timeout if worker does not respond
      ---
      duration_ms: 102.335948
      type: 'test'
      ...
    # Subtest: should initialize worker lazily and reuse instance
    ok 8 - should initialize worker lazily and reuse instance
      ---
      duration_ms: 3.421463
      type: 'test'
      ...
    # Subtest: should recreate worker if creation fails
    ok 9 - should recreate worker if creation fails
      ---
      duration_ms: 2.08817
      type: 'test'
      ...
    1..9
ok 1 - dmDecryptWorkerClient
  ---
  duration_ms: 139.933496
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
# duration_ms 149.469617

→ Running tests/nostr/dmSignalEvents.test.mjs
TAP version 13
# Subtest: dmSignalEvents
    # Subtest: publishDmReadReceipt should succeed
    ok 1 - publishDmReadReceipt should succeed
      ---
      duration_ms: 7.135022
      type: 'test'
      ...
    # Subtest: publishDmReadReceipt should fail if session actor
    ok 2 - publishDmReadReceipt should fail if session actor
      ---
      duration_ms: 0.933986
      type: 'test'
      ...
    # Subtest: publishDmTypingIndicator should succeed
    ok 3 - publishDmTypingIndicator should succeed
      ---
      duration_ms: 9.237561
      type: 'test'
      ...
    # Subtest: should fail if no signer
    ok 4 - should fail if no signer
      ---
      duration_ms: 1.628676
      type: 'test'
      ...
    1..4
ok 1 - dmSignalEvents
  ---
  duration_ms: 149.061919
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
# duration_ms 168.773427

→ Running tests/nostr/edit-video-dtag.test.mjs
TAP version 13
# Subtest: editVideo preserves existing d tag
ok 1 - editVideo preserves existing d tag
  ---
  duration_ms: 13.325562
  type: 'test'
  ...
# Subtest: editVideo falls back to base event id when d tag missing
ok 2 - editVideo falls back to base event id when d tag missing
  ---
  duration_ms: 2.850257
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
# duration_ms 28.40184

→ Running tests/nostr/eventsCacheStore.test.mjs
TAP version 13
# Subtest: EventsCacheStore
    # Subtest: persistSnapshot should store events and tombstones
    ok 1 - persistSnapshot should store events and tombstones
      ---
      duration_ms: 17.397941
      type: 'test'
      ...
    # Subtest: persistSnapshot should only update changed items
    ok 2 - persistSnapshot should only update changed items
      ---
      duration_ms: 4.151788
      type: 'test'
      ...
    # Subtest: persistSnapshot should delete removed items
    ok 3 - persistSnapshot should delete removed items
      ---
      duration_ms: 3.366376
      type: 'test'
      ...
    # Subtest: persistSnapshot should respect dirty keys optimization
    ok 4 - persistSnapshot should respect dirty keys optimization
      ---
      duration_ms: 2.718408
      type: 'test'
      ...
    1..4
ok 1 - EventsCacheStore
  ---
  duration_ms: 29.628467
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
# duration_ms 37.830764

→ Running tests/nostr/eventsMap.test.mjs
TAP version 13
# Subtest: EventsMap functionality
    # Subtest: indexes events by author on set
    ok 1 - indexes events by author on set
      ---
      duration_ms: 2.672036
      type: 'test'
      ...
    # Subtest: updates index on delete
    ok 2 - updates index on delete
      ---
      duration_ms: 0.282166
      type: 'test'
      ...
    # Subtest: updates index on overwrite with different object
    ok 3 - updates index on overwrite with different object
      ---
      duration_ms: 0.375378
      type: 'test'
      ...
    # Subtest: clears index on clear
    ok 4 - clears index on clear
      ---
      duration_ms: 0.300675
      type: 'test'
      ...
    # Subtest: normalizes pubkeys
    ok 5 - normalizes pubkeys
      ---
      duration_ms: 0.407646
      type: 'test'
      ...
    # Subtest: handles non-event objects gracefully
    ok 6 - handles non-event objects gracefully
      ---
      duration_ms: 0.277375
      type: 'test'
      ...
    1..6
ok 1 - EventsMap functionality
  ---
  duration_ms: 6.427545
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
# duration_ms 20.349195

→ Running tests/nostr/integration-remote-flow.test.mjs
TAP version 13
# Subtest: nostr login + remote signing + publish + watch history integration
ok 1 - nostr login + remote signing + publish + watch history integration
  ---
  duration_ms: 158.565459
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
# duration_ms 613.938647

→ Running tests/nostr/maxListenerDiagnostics.test.mjs
TAP version 13
# Subtest: maxListenerDiagnostics
    # Subtest: collectCandidateStrings
        # Subtest: should return empty array for null/undefined/falsy
        ok 1 - should return empty array for null/undefined/falsy
          ---
          duration_ms: 1.914573
          type: 'test'
          ...
        # Subtest: should return array with string for string input
        ok 2 - should return array with string for string input
          ---
          duration_ms: 0.567949
          type: 'test'
          ...
        # Subtest: should extract relevant fields from object
        ok 3 - should extract relevant fields from object
          ---
          duration_ms: 0.547929
          type: 'test'
          ...
        # Subtest: should ignore non-string fields in object
        ok 4 - should ignore non-string fields in object
          ---
          duration_ms: 0.605939
          type: 'test'
          ...
        1..4
    ok 1 - collectCandidateStrings
      ---
      duration_ms: 4.763154
      type: 'suite'
      ...
    # Subtest: shouldSuppressWarning
        # Subtest: should NOT suppress anything if verbose mode is enabled
        ok 1 - should NOT suppress anything if verbose mode is enabled
          ---
          duration_ms: 0.630238
          type: 'test'
          ...
        # Subtest: should suppress warning by code string
        ok 2 - should suppress warning by code string
          ---
          duration_ms: 0.289896
          type: 'test'
          ...
        # Subtest: should suppress warning by object code property
        ok 3 - should suppress warning by object code property
          ---
          duration_ms: 0.295202
          type: 'test'
          ...
        # Subtest: should suppress warning by message snippet
        ok 4 - should suppress warning by message snippet
          ---
          duration_ms: 0.401594
          type: 'test'
          ...
        # Subtest: should suppress warning by object message property snippet
        ok 5 - should suppress warning by object message property snippet
          ---
          duration_ms: 0.407051
          type: 'test'
          ...
        # Subtest: should NOT suppress unrelated warnings
        ok 6 - should NOT suppress unrelated warnings
          ---
          duration_ms: 0.413593
          type: 'test'
          ...
        # Subtest: should handle multiple arguments
        ok 7 - should handle multiple arguments
          ---
          duration_ms: 0.450801
          type: 'test'
          ...
        1..7
    ok 2 - shouldSuppressWarning
      ---
      duration_ms: 3.73471
      type: 'suite'
      ...
    # Subtest: process.emitWarning patch
        # Subtest: should have patched process.emitWarning
        ok 1 - should have patched process.emitWarning
          ---
          duration_ms: 0.249089
          type: 'test'
          ...
        1..1
    ok 3 - process.emitWarning patch
      ---
      duration_ms: 0.40108
      type: 'suite'
      ...
    1..3
ok 1 - maxListenerDiagnostics
  ---
  duration_ms: 10.636091
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
# duration_ms 33.692444

→ Running tests/nostr/nip04WorkerClient.test.mjs
TAP version 13
# Subtest: nip04WorkerClient
    # Subtest: should encrypt message successfully via worker
    ok 1 - should encrypt message successfully via worker
      ---
      duration_ms: 9.92942
      type: 'test'
      ...
    # Subtest: should reject when worker returns error
    ok 2 - should reject when worker returns error
      ---
      duration_ms: 5.283488
      type: 'test'
      ...
    # Subtest: should reject when worker emits error event
    ok 3 - should reject when worker emits error event
      ---
      duration_ms: 3.41695
      type: 'test'
      ...
    # Subtest: should timeout if worker does not respond
    ok 4 - should timeout if worker does not respond
      ---
      duration_ms: 103.090286
      type: 'test'
      ...
    # Subtest: should reject immediately if inputs are missing
    ok 5 - should reject immediately if inputs are missing
      ---
      duration_ms: 2.868873
      type: 'test'
      ...
    # Subtest: should reject if Worker API is unavailable
    ok 6 - should reject if Worker API is unavailable
      ---
      duration_ms: 2.331141
      type: 'test'
      ...
    # Subtest: should handle worker creation failure
    ok 7 - should handle worker creation failure
      ---
      duration_ms: 1.952128
      type: 'test'
      ...
    1..7
ok 1 - nip04WorkerClient
  ---
  duration_ms: 133.624689
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
# duration_ms 145.559987

→ Running tests/nostr/nip07Adapter-race-condition.test.mjs
TAP version 13
# Subtest: Nip07Adapter Race Condition
    # Subtest: should detect capabilities dynamically even if injected late
    ok 1 - should detect capabilities dynamically even if injected late
      ---
      duration_ms: 2.612791
      type: 'test'
      ...
    # Subtest: should call the injected method even if added late
    ok 2 - should call the injected method even if added late
      ---
      duration_ms: 2.126322
      type: 'test'
      ...
    1..2
ok 1 - Nip07Adapter Race Condition
  ---
  duration_ms: 6.325305
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
# duration_ms 19.439307

→ Running tests/nostr/nip07Permissions.test.js
TAP version 13
# Subtest: writeStoredNip07Permissions normalizes and persists granted methods
ok 1 - writeStoredNip07Permissions normalizes and persists granted methods
  ---
  duration_ms: 2.310298
  type: 'test'
  ...
# Subtest: clearStoredNip07Permissions removes persisted grants
ok 2 - clearStoredNip07Permissions removes persisted grants
  ---
  duration_ms: 0.359566
  type: 'test'
  ...
# Subtest: requestEnablePermissions retries explicit and fallback variants
ok 3 - requestEnablePermissions retries explicit and fallback variants
  ---
  duration_ms: 1.81248
  type: 'test'
  ...
# Subtest: requestEnablePermissions reports unavailable extension
ok 4 - requestEnablePermissions reports unavailable extension
  ---
  duration_ms: 0.246126
  type: 'test'
  ...
# Subtest: waitForNip07Extension resolves when extension is present
ok 5 - waitForNip07Extension resolves when extension is present
  ---
  duration_ms: 0.543371
  type: 'test'
  ...
# Subtest: waitForNip07Extension resolves when extension appears later
ok 6 - waitForNip07Extension resolves when extension appears later
  ---
  duration_ms: 51.370786
  type: 'test'
  ...
# Subtest: waitForNip07Extension rejects when extension never appears
ok 7 - waitForNip07Extension rejects when extension never appears
  ---
  duration_ms: 101.178344
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
# duration_ms 165.690383

→ Running tests/nostr/nip46Client.test.js
TAP version 13
# Subtest: Nip46RpcClient encrypts payloads with nip44 conversation keys
ok 1 - Nip46RpcClient encrypts payloads with nip44 conversation keys
  ---
  duration_ms: 174.0129
  type: 'test'
  ...
# Subtest: decryptNip46PayloadWithKeys handles nip44.v2 ciphertext
ok 2 - decryptNip46PayloadWithKeys handles nip44.v2 ciphertext
  ---
  duration_ms: 24.188594
  type: 'test'
  ...
# Subtest: decryptNip46PayloadWithKeys coerces structured handshake payloads
ok 3 - decryptNip46PayloadWithKeys coerces structured handshake payloads
  ---
  duration_ms: 24.790975
  type: 'test'
  ...
# Subtest: decryptNip46PayloadWithKeys decodes buffer-based handshake payloads
ok 4 - decryptNip46PayloadWithKeys decodes buffer-based handshake payloads
  ---
  duration_ms: 23.249964
  type: 'test'
  ...
# Subtest: decryptNip46PayloadWithKeys supports nip04-style ciphertext wrappers
ok 5 - decryptNip46PayloadWithKeys supports nip04-style ciphertext wrappers
  ---
  duration_ms: 31.44197
  type: 'test'
  ...
# Subtest: parseNip46ConnectionString handles remote signer key hints
ok 6 - parseNip46ConnectionString handles remote signer key hints
  ---
  duration_ms: 5.240141
  type: 'test'
  ...
# Subtest: attemptDecryptNip46HandshakePayload falls back to expected remote signer key
ok 7 - attemptDecryptNip46HandshakePayload falls back to expected remote signer key
  ---
  duration_ms: 42.495497
  type: 'test'
  ...
# Subtest: attemptDecryptNip46HandshakePayload handles array-encoded nip04 payloads
ok 8 - attemptDecryptNip46HandshakePayload handles array-encoded nip04 payloads
  ---
  duration_ms: 28.851907
  type: 'test'
  ...
# Subtest: Nip46RpcClient sendRpc publishes events and resolves responses
ok 9 - Nip46RpcClient sendRpc publishes events and resolves responses
  ---
  duration_ms: 13.42111
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
# duration_ms 377.297388

→ Running tests/nostr/nip46Connector.test.mjs
TAP version 13
# Subtest: Nip46Connector
    # Subtest: createKeyPair
        # Subtest: should generate a new key pair if none provided
        ok 1 - should generate a new key pair if none provided
          ---
          duration_ms: 3.051931
          type: 'test'
          ...
        # Subtest: should use existing keys if provided
        ok 2 - should use existing keys if provided
          ---
          duration_ms: 0.523107
          type: 'test'
          ...
        1..2
    ok 1 - createKeyPair
      ---
      duration_ms: 4.770072
      type: 'suite'
      ...
    # Subtest: prepareHandshake
        # Subtest: should parse connection string and return details
        ok 1 - should parse connection string and return details
          ---
          duration_ms: 1.393802
          type: 'test'
          ...
        1..1
    ok 2 - prepareHandshake
      ---
      duration_ms: 1.763239
      type: 'suite'
      ...
    # Subtest: connect
        # Subtest: should connect directly if remote pubkey is known
        ok 1 - should connect directly if remote pubkey is known
          ---
          duration_ms: 2.292343
          type: 'test'
          ...
        1..1
    ok 3 - connect
      ---
      duration_ms: 2.476376
      type: 'suite'
      ...
    # Subtest: reconnectStored
        # Subtest: should throw if no stored session
        ok 1 - should throw if no stored session
          ---
          duration_ms: 1.477646
          type: 'test'
          ...
        # Subtest: should reconnect using stored session
        ok 2 - should reconnect using stored session
          ---
          duration_ms: 0.706461
          type: 'test'
          ...
        1..2
    ok 4 - reconnectStored
      ---
      duration_ms: 2.498341
      type: 'suite'
      ...
    # Subtest: disconnect
        # Subtest: should clear stored session and emit change
        ok 1 - should clear stored session and emit change
          ---
          duration_ms: 0.550517
          type: 'test'
          ...
        1..1
    ok 5 - disconnect
      ---
      duration_ms: 0.801318
      type: 'suite'
      ...
    1..5
ok 1 - Nip46Connector
  ---
  duration_ms: 13.490795
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
# duration_ms 33.326639

→ Running tests/nostr/nip71.test.js
TAP version 13
# Subtest: buildNip71MetadataTags normalizes structured fields
ok 1 - buildNip71MetadataTags normalizes structured fields
  ---
  duration_ms: 3.767914
  type: 'test'
  ...
# Subtest: collectNip71PointerRequests aggregates events and tags
ok 2 - collectNip71PointerRequests aggregates events and tags
  ---
  duration_ms: 0.639782
  type: 'test'
  ...
# Subtest: processNip71Events reconciles pointers and filters video hashtags
ok 3 - processNip71Events reconciles pointers and filters video hashtags
  ---
  duration_ms: 1.377345
  type: 'test'
  ...
# Subtest: populateNip71MetadataForVideos fetches missing records once
ok 4 - populateNip71MetadataForVideos fetches missing records once
  ---
  duration_ms: 1.155945
  type: 'test'
  ...
# Subtest: buildNip71VideoEvent composes pointer tags
ok 5 - buildNip71VideoEvent composes pointer tags
  ---
  duration_ms: 0.934609
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
# duration_ms 23.271275

→ Running tests/nostr/nostrClientFacade.test.js
TAP version 13
# Subtest: nostrClientFacade forwards the default client instance
ok 1 - nostrClientFacade forwards the default client instance
  ---
  duration_ms: 1.869688
  type: 'test'
  ...
# Subtest: nostrClientFacade forwards the default permission helper
ok 2 - nostrClientFacade forwards the default permission helper
  ---
  duration_ms: 0.214681
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
# duration_ms 14.992122

→ Running tests/nostr/nostrClientRegistry.test.mjs
TAP version 13
# Subtest: registerSigner stores and resolves signer entries
ok 1 - registerSigner stores and resolves signer entries
  ---
  duration_ms: 1.476966
  type: 'test'
  ...
# Subtest: setActiveSigner notifies listeners and resolves by pubkey
ok 2 - setActiveSigner notifies listeners and resolves by pubkey
  ---
  duration_ms: 2.182125
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
# duration_ms 15.866674

→ Running tests/nostr/publishHelpers.test.mjs
TAP version 13
# Subtest: mirrorVideoEvent lowercases provided MIME types
ok 1 - mirrorVideoEvent lowercases provided MIME types
  ---
  duration_ms: 4.517636
  type: 'test'
  ...
# Subtest: mirrorVideoEvent lowercases inferred MIME types
ok 2 - mirrorVideoEvent lowercases inferred MIME types
  ---
  duration_ms: 0.936961
  type: 'test'
  ...
# Subtest: mirrorVideoEvent includes hash tags when provided
ok 3 - mirrorVideoEvent includes hash tags when provided
  ---
  duration_ms: 1.586358
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
# duration_ms 19.585596

→ Running tests/nostr/reaction-events.test.mjs
TAP version 13
# Subtest: publishVideoReaction includes both address and event tags when reacting to addressable content
ok 1 - publishVideoReaction includes both address and event tags when reacting to addressable content
  ---
  duration_ms: 5.763362
  type: 'test'
  ...
# Subtest: publishVideoReaction aborts when address pointer is missing a resolvable event id
ok 2 - publishVideoReaction aborts when address pointer is missing a resolvable event id
  ---
  duration_ms: 0.545375
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
# duration_ms 18.320598

→ Running tests/nostr/revert-video-dtag.test.mjs
TAP version 13
# Subtest: revertVideo preserves existing d tag
ok 1 - revertVideo preserves existing d tag
  ---
  duration_ms: 7.463716
  type: 'test'
  ...
# Subtest: revertVideo falls back to original event id when d tag missing
ok 2 - revertVideo falls back to original event id when d tag missing
  ---
  duration_ms: 1.319994
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
# duration_ms 22.410576

→ Running tests/nostr/session-actor.test.mjs
TAP version 13
# Subtest: SessionActor
    # Subtest: encrypts and decrypts private key
    ok 1 - encrypts and decrypts private key
      ---
      duration_ms: 409.934358
      type: 'test'
      ...
    # Subtest: fails to decrypt with wrong passphrase
    ok 2 - fails to decrypt with wrong passphrase
      ---
      duration_ms: 416.542219
      type: 'test'
      ...
    # Subtest: persists and reads session actor
    ok 3 - persists and reads session actor
      ---
      duration_ms: 2.174525
      type: 'test'
      ...
    # Subtest: clears stored session actor
    ok 4 - clears stored session actor
      ---
      duration_ms: 0.366542
      type: 'test'
      ...
    1..4
ok 1 - SessionActor
  ---
  duration_ms: 832.740383
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
# duration_ms 857.042777

→ Running tests/nostr/sessionActor.test.js
TAP version 13
# Subtest: encryptSessionPrivateKey + decryptSessionPrivateKey roundtrip
ok 1 - encryptSessionPrivateKey + decryptSessionPrivateKey roundtrip
  ---
  duration_ms: 539.844552
  type: 'test'
  ...
# Subtest: persistSessionActor stores encrypted payload metadata
ok 2 - persistSessionActor stores encrypted payload metadata
  ---
  duration_ms: 252.339477
  type: 'test'
  ...
# Subtest: clearStoredSessionActor removes persisted payload
ok 3 - clearStoredSessionActor removes persisted payload
  ---
  duration_ms: 287.333512
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
# duration_ms 1093.82099

→ Running tests/nostr/sessionActor.test.mjs
TAP version 13
# Subtest: js/nostr/sessionActor.js
    # Subtest: Encryption and Decryption Roundtrip
    ok 1 - Encryption and Decryption Roundtrip
      ---
      duration_ms: 482.660662
      type: 'test'
      ...
    # Subtest: Decryption fails with wrong passphrase
    ok 2 - Decryption fails with wrong passphrase
      ---
      duration_ms: 521.761641
      type: 'test'
      ...
    # Subtest: Persistence and Retrieval
    ok 3 - Persistence and Retrieval
      ---
      duration_ms: 525.506893
      type: 'test'
      ...
    # Subtest: Clear Stored Session Actor
    ok 4 - Clear Stored Session Actor
      ---
      duration_ms: 1.644658
      type: 'test'
      ...
    1..4
ok 1 - js/nostr/sessionActor.js
  ---
  duration_ms: 1537.396557
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
# duration_ms 1551.376802

→ Running tests/nostr/sign-request-queue.test.mjs
TAP version 13
# Subtest: queueSignEvent: processes requests sequentially
ok 1 - queueSignEvent: processes requests sequentially
  ---
  duration_ms: 107.366515
  type: 'test'
  ...
# Subtest: queueSignEvent: handles timeouts
ok 2 - queueSignEvent: handles timeouts
  ---
  duration_ms: 22.591139
  type: 'test'
  ...
# Subtest: queueSignEvent: handles permission denied errors
ok 3 - queueSignEvent: handles permission denied errors
  ---
  duration_ms: 1.173829
  type: 'test'
  ...
# Subtest: queueSignEvent: handles signer disconnected
ok 4 - queueSignEvent: handles signer disconnected
  ---
  duration_ms: 0.759919
  type: 'test'
  ...
# Subtest: queueSignEvent: fails if signer is missing or invalid
ok 5 - queueSignEvent: fails if signer is missing or invalid
  ---
  duration_ms: 0.867814
  type: 'test'
  ...
# Subtest: queueSignEvent: continues queue processing after failure
ok 6 - queueSignEvent: continues queue processing after failure
  ---
  duration_ms: 1.290872
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
# duration_ms 220.754417

→ Running tests/nostr/signers.test.mjs
TAP version 13
# Subtest: setActiveSigner hydrates extension capabilities from window.nostr
ok 1 - setActiveSigner hydrates extension capabilities from window.nostr
  ---
  duration_ms: 2.663659
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
# duration_ms 19.168044

→ Running tests/nostr/syncMetadataStore.test.mjs
TAP version 13
# Subtest: SyncMetadataStore
    # Subtest: should load from localStorage on initialization
    ok 1 - should load from localStorage on initialization
      ---
      duration_ms: 3.413922
      type: 'test'
      ...
    # Subtest: should update last seen and save to localStorage
    ok 2 - should update last seen and save to localStorage
      ---
      duration_ms: 1.37428
      type: 'test'
      ...
    # Subtest: should only update if timestamp is newer
    ok 3 - should only update if timestamp is newer
      ---
      duration_ms: 1.38929
      type: 'test'
      ...
    # Subtest: should get per-relay last seen
    ok 4 - should get per-relay last seen
      ---
      duration_ms: 3.091977
      type: 'test'
      ...
    # Subtest: should handle missing localStorage gracefully
    ok 5 - should handle missing localStorage gracefully
      ---
      duration_ms: 0.889796
      type: 'test'
      ...
    1..5
ok 1 - SyncMetadataStore
  ---
  duration_ms: 13.713714
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
# duration_ms 38.198465

→ Running tests/nostr/toolkit.test.mjs
TAP version 13
# Subtest: toolkit: DEFAULT_RELAY_URLS is frozen and contains valid URLs
ok 1 - toolkit: DEFAULT_RELAY_URLS is frozen and contains valid URLs
  ---
  duration_ms: 1.87849
  type: 'test'
  ...
# Subtest: toolkit: resolveSimplePoolConstructor finds SimplePool
ok 2 - toolkit: resolveSimplePoolConstructor finds SimplePool
  ---
  duration_ms: 0.59075
  type: 'test'
  ...
# Subtest: toolkit: shimLegacySimplePoolMethods adds sub/list/map if missing
ok 3 - toolkit: shimLegacySimplePoolMethods adds sub/list/map if missing
  ---
  duration_ms: 0.962749
  type: 'test'
  ...
# Subtest: toolkit: readToolkitFromScope finds NostrTools in global scope
ok 4 - toolkit: readToolkitFromScope finds NostrTools in global scope
  ---
  duration_ms: 0.387512
  type: 'test'
  ...
# Subtest: toolkit: normalizeToolkitCandidate validation
ok 5 - toolkit: normalizeToolkitCandidate validation
  ---
  duration_ms: 0.805267
  type: 'test'
  ...
# Subtest: toolkit: shimLegacySimplePoolMethods handles simple list operation
ok 6 - toolkit: shimLegacySimplePoolMethods handles simple list operation
  ---
  duration_ms: 14.148584
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
# duration_ms 30.341676

→ Running tests/nostr/videoEventBuffer.test.mjs
TAP version 13
# Subtest: VideoEventBuffer
    # Subtest: Push and Flush
    ok 1 - Push and Flush
      ---
      duration_ms: 4.408451
      type: 'test'
      ...
    # Subtest: Latest Wins
    ok 2 - Latest Wins
      ---
      duration_ms: 0.992749
      type: 'test'
      ...
    # Subtest: Tombstone Handling
    ok 3 - Tombstone Handling
      ---
      duration_ms: 1.136251
      type: 'test'
      ...
    # Subtest: Cleanup
    ok 4 - Cleanup
      ---
      duration_ms: 0.849845
      type: 'test'
      ...
    1..4
ok 1 - VideoEventBuffer
  ---
  duration_ms: 9.696652
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
# duration_ms 26.870226

→ Running tests/nostr/videoPayloadBuilder.test.mjs
TAP version 13
# Subtest: videoPayloadBuilder
    # Subtest: extractVideoPublishPayload
        # Subtest: extracts videoData and nip71Metadata
        ok 1 - extracts videoData and nip71Metadata
          ---
          duration_ms: 2.726957
          type: 'test'
          ...
        # Subtest: handles legacyFormData structure
        ok 2 - handles legacyFormData structure
          ---
          duration_ms: 0.296958
          type: 'test'
          ...
        # Subtest: normalizes boolean flags
        ok 3 - normalizes boolean flags
          ---
          duration_ms: 0.371506
          type: 'test'
          ...
        # Subtest: normalizes boolean flags (kids only)
        ok 4 - normalizes boolean flags (kids only)
          ---
          duration_ms: 0.396707
          type: 'test'
          ...
        1..4
    ok 1 - extractVideoPublishPayload
      ---
      duration_ms: 5.699925
      type: 'suite'
      ...
    # Subtest: prepareVideoPublishPayload
        # Subtest: throws if pubkey is missing
        ok 1 - throws if pubkey is missing
          ---
          duration_ms: 2.015139
          type: 'test'
          ...
        # Subtest: generates a valid event structure
        ok 2 - generates a valid event structure
          ---
          duration_ms: 3.741369
          type: 'test'
          ...
        # Subtest: generates unique d tag and videoRootId if not provided
        ok 3 - generates unique d tag and videoRootId if not provided
          ---
          duration_ms: 0.526627
          type: 'test'
          ...
        # Subtest: uses provided seriesIdentifier as d tag
        ok 4 - uses provided seriesIdentifier as d tag
          ---
          duration_ms: 0.823857
          type: 'test'
          ...
        # Subtest: resolves infoHash from magnet
        ok 5 - resolves infoHash from magnet
          ---
          duration_ms: 0.866422
          type: 'test'
          ...
        # Subtest: includes NIP-71 tags
        ok 6 - includes NIP-71 tags
          ---
          duration_ms: 1.142591
          type: 'test'
          ...
        1..6
    ok 2 - prepareVideoPublishPayload
      ---
      duration_ms: 10.409734
      type: 'suite'
      ...
    1..2
ok 1 - videoPayloadBuilder
  ---
  duration_ms: 17.310986
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
# duration_ms 43.414694

→ Running tests/nostr/watchHistory.test.js
[bitvid] [ProfileCache] Expired watchHistory for 2222222222222222222222222222222222222222222222222222222222222222
TAP version 13
# Subtest: buildWatchHistoryPayload enforces byte limits and records skipped entries
ok 1 - buildWatchHistoryPayload enforces byte limits and records skipped entries
  ---
  duration_ms: 5.096543
  type: 'test'
  ...
# Subtest: getWatchHistoryStorage prunes entries that exceed the configured TTL
ok 2 - getWatchHistoryStorage prunes entries that exceed the configured TTL
  ---
  duration_ms: 4.654526
  type: 'test'
  ...
# Subtest: fetchWatchHistory prefers decrypted chunk payloads when nip04 decrypt succeeds
ok 3 - fetchWatchHistory prefers decrypted chunk payloads when nip04 decrypt succeeds
  ---
  duration_ms: 17.627579
  type: 'test'
  ...
# Subtest: fetchWatchHistory falls back to pointer payload when nip04 decrypt fails
ok 4 - fetchWatchHistory falls back to pointer payload when nip04 decrypt fails
  ---
  duration_ms: 4.276682
  type: 'test'
  ...
# Subtest: publishWatchHistorySnapshot uses injected nostr-tools helpers when signer cannot encrypt
ok 5 - publishWatchHistorySnapshot uses injected nostr-tools helpers when signer cannot encrypt
  ---
  duration_ms: 7.383379
  type: 'test'
  ...
# Subtest: publishWatchHistorySnapshot caches successful snapshot results
ok 6 - publishWatchHistorySnapshot caches successful snapshot results
  ---
  duration_ms: 5.099036
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
# duration_ms 57.439594

→ Running tests/nostr/watchHistoryBindings.test.js
TAP version 13
# Subtest: updateWatchHistoryList delegates to the client's manager
ok 1 - updateWatchHistoryList delegates to the client's manager
  ---
  duration_ms: 5.508378
  type: 'test'
  ...
# Subtest: removeWatchHistoryItem delegates to the client's manager
ok 2 - removeWatchHistoryItem delegates to the client's manager
  ---
  duration_ms: 1.11203
  type: 'test'
  ...
# Subtest: watch history bindings throw when the manager is unavailable
ok 3 - watch history bindings throw when the manager is unavailable
  ---
  duration_ms: 1.59531
  type: 'test'
  ...
# Subtest: watch history bindings throw when a required method is missing
ok 4 - watch history bindings throw when a required method is missing
  ---
  duration_ms: 0.811027
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
# duration_ms 35.472458

→ Running tests/nwc-settings-service.test.mjs
TAP version 13
# Subtest: nwc settings service preserves settings across profile switches
ok 1 - nwc settings service preserves settings across profile switches
  ---
  duration_ms: 4.001264
  type: 'test'
  ...
# Subtest: updateActiveNwcSettings returns cloned values
ok 2 - updateActiveNwcSettings returns cloned values
  ---
  duration_ms: 0.526396
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
# duration_ms 20.163985

→ Running tests/performance/resolvePostedAt.test.mjs
pool.list calls: 2
pool.get calls: 0
TAP version 13
# Subtest: hydrateVideoHistoryBatch optimizes network calls
ok 1 - hydrateVideoHistoryBatch optimizes network calls
  ---
  duration_ms: 8.268974
  type: 'test'
  ...
# Subtest: resolveVideoPostedAtBatch uses batch hydration
ok 2 - resolveVideoPostedAtBatch uses batch hydration
  ---
  duration_ms: 1.538193
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
# duration_ms 29.78749

→ Running tests/position-floating-panel.test.mjs
TAP version 13
# Subtest: flips placement when bottom placement would collide with viewport
ok 1 - flips placement when bottom placement would collide with viewport
  ---
  duration_ms: 637.073555
  type: 'test'
  ...
# Subtest: closes previously open popovers without restoring focus
ok 2 - closes previously open popovers without restoring focus
  ---
  duration_ms: 97.175419
  type: 'test'
  ...
# Subtest: restores focus to the trigger when closed
ok 3 - restores focus to the trigger when closed
  ---
  duration_ms: 53.995652
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
# duration_ms 807.299402

→ Running tests/profile-cache.test.mjs
TAP version 13
# Subtest: ProfileCache: setActiveProfile and getActiveProfile
ok 1 - ProfileCache: setActiveProfile and getActiveProfile
  ---
  duration_ms: 3.46887
  type: 'test'
  ...
# Subtest: ProfileCache: resolveAddressKey
ok 2 - ProfileCache: resolveAddressKey
  ---
  duration_ms: 0.863969
  type: 'test'
  ...
# Subtest: ProfileCache: set and get (memory and persistence)
ok 3 - ProfileCache: set and get (memory and persistence)
  ---
  duration_ms: 23.969505
  type: 'test'
  ...
[bitvid] [ProfileCache] Expired watchHistory for eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee
# Subtest: ProfileCache: setProfile normalization and storage
ok 4 - ProfileCache: setProfile normalization and storage
  ---
  duration_ms: 21.884498
  type: 'test'
  ...
# Subtest: ProfileCache: TTL expiration
ok 5 - ProfileCache: TTL expiration
  ---
  duration_ms: 2.296499
  type: 'test'
  ...
# Subtest: ProfileCache: clearMemoryCache and clearSignerRuntime
ok 6 - ProfileCache: clearMemoryCache and clearSignerRuntime
  ---
  duration_ms: 0.61554
  type: 'test'
  ...
# Subtest: ProfileCache: listeners
ok 7 - ProfileCache: listeners
  ---
  duration_ms: 0.519412
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
# duration_ms 77.784796

→ Running tests/profile-modal-controller.test.mjs
TAP version 13
# Subtest: Profile modal Escape closes and restores trigger focus
ok 1 - Profile modal Escape closes and restores trigger focus
  ---
  duration_ms: 1500.616887
  type: 'test'
  ...
# Subtest: Add profile request suspends focus trap and elevates login modal
ok 2 - Add profile request suspends focus trap and elevates login modal
  ---
  duration_ms: 1326.171196
  type: 'test'
  ...
# Subtest: Profile modal navigation buttons toggle active state
ok 3 - Profile modal navigation buttons toggle active state
  ---
  duration_ms: 1453.059773
  type: 'test'
  ...
# Subtest: Profile modal toggles mobile menu and pane views
ok 4 - Profile modal toggles mobile menu and pane views
  ---
  duration_ms: 1439.686972
  type: 'test'
  ...
# Subtest: wallet URI input masks persisted values and restores on focus
ok 5 - wallet URI input masks persisted values and restores on focus
  ---
  duration_ms: 1035.150346
  type: 'test'
  ...
# Subtest: Profile modal uses abbreviated npub display
ok 6 - Profile modal uses abbreviated npub display
  ---
  duration_ms: 789.772078
  type: 'test'
  ...
# Subtest: renderSavedProfiles applies provider metadata
ok 7 - renderSavedProfiles applies provider metadata
  ---
  duration_ms: 762.319034
  type: 'test'
  ...
# Subtest: Hashtag pane shows empty states by default
ok 8 - Hashtag pane shows empty states by default
  ---
  duration_ms: 1001.250344
  type: 'test'
  ...
# Subtest: Hashtag pane adds, moves, and removes tags
ok 9 - Hashtag pane adds, moves, and removes tags
  ---
  duration_ms: 1041.784106
  type: 'test'
  ...
# Subtest: handleAddHashtagPreference publishes updates
ok 10 - handleAddHashtagPreference publishes updates
  ---
  duration_ms: 1040.044709
  type: 'test'
  ...
# Subtest: Hashtag pane resets after logout when service clears tags
ok 11 - Hashtag pane resets after logout when service clears tags
  ---
  duration_ms: 1219.892404
  type: 'test'
  ...
# Subtest: load() injects markup and caches expected elements
ok 12 - load() injects markup and caches expected elements
  ---
  duration_ms: 531.146263
  type: 'test'
  ...
# Subtest: show()/hide() toggle panes, trap focus, and refresh the wallet pane
ok 13 - show()/hide() toggle panes, trap focus, and refresh the wallet pane
  ---
  duration_ms: 1029.69887
  type: 'test'
  ...
# Subtest: populateProfileRelays renders entries and wires action buttons
ok 14 - populateProfileRelays renders entries and wires action buttons
  ---
  duration_ms: 540.617865
  type: 'test'
  ...
# Subtest: admin mutations invoke accessControl stubs and update admin DOM
ok 15 - admin mutations invoke accessControl stubs and update admin DOM
  ---
  duration_ms: 526.169799
  type: 'test'
  ...
# Subtest: history pane lazily initializes the watch history renderer
ok 16 - history pane lazily initializes the watch history renderer
  ---
  duration_ms: 1408.55367
  type: 'test'
  ...
# Subtest: handleDirectMessagesRelayWarning throttles status updates
ok 17 - handleDirectMessagesRelayWarning throttles status updates
  ---
  duration_ms: 529.342692
  type: 'test'
  ...
# Subtest: handleDirectMessagesRelayWarning suppresses status updates when disabled
ok 18 - handleDirectMessagesRelayWarning suppresses status updates when disabled
  ---
  duration_ms: 550.713243
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
# duration_ms 17736.661003

→ Running tests/reaction-event-builder.test.mjs
TAP version 13
# Subtest: buildReactionEvent includes pointer and author tags when pubkey provided
ok 1 - buildReactionEvent includes pointer and author tags when pubkey provided
  ---
  duration_ms: 2.980966
  type: 'test'
  ...
# Subtest: buildReactionEvent merges address and event pointers for addressable targets
ok 2 - buildReactionEvent merges address and event pointers for addressable targets
  ---
  duration_ms: 0.674101
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
# duration_ms 14.997188

→ Running tests/revert-modal-controller.test.mjs
TAP version 13
# Subtest: RevertModalController
    # Subtest: open() fetches history and opens modal
    ok 1 - open() fetches history and opens modal
      ---
      duration_ms: 1.60841
      type: 'test'
      ...
    # Subtest: open() shows error if not logged in
    ok 2 - open() shows error if not logged in
      ---
      duration_ms: 0.449122
      type: 'test'
      ...
    # Subtest: handleConfirm() calls revertVideo and refreshes
    ok 3 - handleConfirm() calls revertVideo and refreshes
      ---
      duration_ms: 0.473784
      type: 'test'
      ...
    1..3
ok 1 - RevertModalController
  ---
  duration_ms: 4.346042
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
# duration_ms 16.570157

→ Running tests/safe-decode.test.mjs
TAP version 13
# Subtest: safeDecodeURIComponent returns original value on malformed sequences
ok 1 - safeDecodeURIComponent returns original value on malformed sequences
  ---
  duration_ms: 1.239909
  type: 'test'
  ...
# Subtest: safeDecode helpers handle double-encoded values when applied repeatedly
ok 2 - safeDecode helpers handle double-encoded values when applied repeatedly
  ---
  duration_ms: 0.355086
  type: 'test'
  ...
# Subtest: safeDecodeURIComponentLoose trims inputs by default
ok 3 - safeDecodeURIComponentLoose trims inputs by default
  ---
  duration_ms: 0.208207
  type: 'test'
  ...
# Subtest: safeDecodeURIComponentLoose preserves whitespace when trim is false
ok 4 - safeDecodeURIComponentLoose preserves whitespace when trim is false
  ---
  duration_ms: 0.226964
  type: 'test'
  ...
# Subtest: safeDecodeURIComponent handles empty strings consistently
ok 5 - safeDecodeURIComponent handles empty strings consistently
  ---
  duration_ms: 0.268766
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
# duration_ms 15.567949

→ Running tests/services/attachmentService.test.mjs
TAP version 13
# Subtest: attachmentService
    # Subtest: prepareAttachmentUpload
        # Subtest: should prepare upload without encryption
        ok 1 - should prepare upload without encryption
          ---
          duration_ms: 3.362794
          type: 'test'
          ...
        # Subtest: should prepare upload with encryption
        ok 2 - should prepare upload with encryption
          ---
          duration_ms: 9.906031
          type: 'test'
          ...
        1..2
    ok 1 - prepareAttachmentUpload
      ---
      duration_ms: 14.01471
      type: 'suite'
      ...
    # Subtest: downloadAttachment
        # Subtest: should download attachment
        ok 1 - should download attachment
          ---
          duration_ms: 1.840594
          type: 'test'
          ...
        # Subtest: should verify hash
        ok 2 - should verify hash
          ---
          duration_ms: 1.150711
          type: 'test'
          ...
        # Subtest: should throw on hash mismatch
        ok 3 - should throw on hash mismatch
          ---
          duration_ms: 1.32109
          type: 'test'
          ...
        1..3
    ok 2 - downloadAttachment
      ---
      duration_ms: 4.789144
      type: 'suite'
      ...
    # Subtest: caching
        # Subtest: should cache downloaded attachments
        ok 1 - should cache downloaded attachments
          ---
          duration_ms: 1.073527
          type: 'test'
          ...
        # Subtest: should clear cache
        ok 2 - should clear cache
          ---
          duration_ms: 1.347308
          type: 'test'
          ...
        1..2
    ok 3 - caching
      ---
      duration_ms: 2.864331
      type: 'suite'
      ...
    1..3
ok 1 - attachmentService
  ---
  duration_ms: 23.554167
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
# duration_ms 38.457113

→ Running tests/services/authUtils.test.mjs
TAP version 13
# Subtest: authUtils
    # Subtest: normalizeProviderId
        # Subtest: returns trimmed string if valid
        ok 1 - returns trimmed string if valid
          ---
          duration_ms: 1.034059
          type: 'test'
          ...
        # Subtest: returns 'nip07' fallback if empty
        ok 2 - returns 'nip07' fallback if empty
          ---
          duration_ms: 0.303688
          type: 'test'
          ...
        # Subtest: returns 'nip07' fallback if null
        ok 3 - returns 'nip07' fallback if null
          ---
          duration_ms: 0.280621
          type: 'test'
          ...
        # Subtest: returns 'nip07' fallback if undefined
        ok 4 - returns 'nip07' fallback if undefined
          ---
          duration_ms: 0.332145
          type: 'test'
          ...
        # Subtest: returns 'nip07' fallback if not a string
        ok 5 - returns 'nip07' fallback if not a string
          ---
          duration_ms: 0.192731
          type: 'test'
          ...
        1..5
    ok 1 - normalizeProviderId
      ---
      duration_ms: 5.155046
      type: 'test'
      ...
    # Subtest: normalizeAuthType
        # Subtest: prioritizes authTypeCandidate
        ok 1 - prioritizes authTypeCandidate
          ---
          duration_ms: 0.521007
          type: 'test'
          ...
        # Subtest: falls back to providerResult.authType
        ok 2 - falls back to providerResult.authType
          ---
          duration_ms: 0.219588
          type: 'test'
          ...
        # Subtest: falls back to providerResult.providerId
        ok 3 - falls back to providerResult.providerId
          ---
          duration_ms: 0.378634
          type: 'test'
          ...
        # Subtest: falls back to providerId
        ok 4 - falls back to providerId
          ---
          duration_ms: 0.222754
          type: 'test'
          ...
        # Subtest: returns 'nip07' if all else fails
        ok 5 - returns 'nip07' if all else fails
          ---
          duration_ms: 0.138216
          type: 'test'
          ...
        # Subtest: trims whitespace from results
        ok 6 - trims whitespace from results
          ---
          duration_ms: 0.222428
          type: 'test'
          ...
        # Subtest: ignores empty strings in candidates
        ok 7 - ignores empty strings in candidates
          ---
          duration_ms: 0.119294
          type: 'test'
          ...
        1..7
    ok 2 - normalizeAuthType
      ---
      duration_ms: 3.302014
      type: 'test'
      ...
    1..2
ok 1 - authUtils
  ---
  duration_ms: 9.638616
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
# duration_ms 29.810803

→ Running tests/services/discussionCountService.test.mjs
TAP version 13
# Subtest: DiscussionCountService
    # Subtest: initialization sets defaults
    ok 1 - initialization sets defaults
      ---
      duration_ms: 1.212347
      type: 'test'
      ...
    # Subtest: refreshCounts returns early if videos array is empty or invalid
    ok 2 - refreshCounts returns early if videos array is empty or invalid
      ---
      duration_ms: 0.608515
      type: 'test'
      ...
    # Subtest: refreshCounts returns early if dependencies are missing
    ok 3 - refreshCounts returns early if dependencies are missing
      ---
      duration_ms: 1.087824
      type: 'test'
      ...
    # Subtest: refreshCounts handles happy path (fetches and updates DOM)
    ok 4 - refreshCounts handles happy path (fetches and updates DOM)
      ---
      duration_ms: 91.764224
      type: 'test'
      ...
    # Subtest: refreshCounts uses cached count if available
    ok 5 - refreshCounts uses cached count if available
      ---
      duration_ms: 2.571245
      type: 'test'
      ...
    # Subtest: refreshCounts handles API errors gracefully
    ok 6 - refreshCounts handles API errors gracefully
      ---
      duration_ms: 5.189165
      type: 'test'
      ...
    # Subtest: refreshCounts handles partial results
    ok 7 - refreshCounts handles partial results
      ---
      duration_ms: 4.680934
      type: 'test'
      ...
    # Subtest: refreshCounts handles unsupported relays (empty perRelay)
    ok 8 - refreshCounts handles unsupported relays (empty perRelay)
      ---
      duration_ms: 2.560865
      type: 'test'
      ...
    1..8
ok 1 - DiscussionCountService
  ---
  duration_ms: 196.109775
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
# duration_ms 216.095412

→ Running tests/services/exploreDataService.optimization.test.mjs
TAP version 13
# Subtest: exploreDataService optimization
    # Subtest: toLightweightVideo extracts necessary fields
    ok 1 - toLightweightVideo extracts necessary fields
      ---
      duration_ms: 1.826282
      type: 'test'
      ...
    # Subtest: collectVideoTags works with lightweight object
    ok 2 - collectVideoTags works with lightweight object
      ---
      duration_ms: 14.254201
      type: 'test'
      ...
    # Subtest: buildVideoAddressPointer works with lightweight object
    ok 3 - buildVideoAddressPointer works with lightweight object
      ---
      duration_ms: 0.445341
      type: 'test'
      ...
    # Subtest: toLightweightVideo handles invalid input
    ok 4 - toLightweightVideo handles invalid input
      ---
      duration_ms: 0.229855
      type: 'test'
      ...
    1..4
ok 1 - exploreDataService optimization
  ---
  duration_ms: 18.50437
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
# duration_ms 32.985117

→ Running tests/services/exploreDataService.test.mjs
TAP version 13
# Subtest: exploreDataService - buildWatchHistoryTagCounts
    # Subtest: should return empty Map if watchHistoryService is missing
    ok 1 - should return empty Map if watchHistoryService is missing
      ---
      duration_ms: 1.726532
      type: 'test'
      ...
    # Subtest: should handle missing loadLatest method gracefully
    ok 2 - should handle missing loadLatest method gracefully
      ---
      duration_ms: 0.489723
      type: 'test'
      ...
    # Subtest: should handle loadLatest failure gracefully
    ok 3 - should handle loadLatest failure gracefully
      ---
      duration_ms: 11.417518
      type: 'test'
      ...
    # Subtest: should return counts from worker on success
    ok 4 - should return counts from worker on success
      ---
      duration_ms: 3.006298
      type: 'test'
      ...
    # Subtest: should handle worker error gracefully
    ok 5 - should handle worker error gracefully
      ---
      duration_ms: 2.016664
      type: 'test'
      ...
    1..5
ok 1 - exploreDataService - buildWatchHistoryTagCounts
  ---
  duration_ms: 32.671386
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
# duration_ms 43.565515

→ Running tests/services/link-preview-service.test.mjs
TAP version 13
# Subtest: LinkPreviewService
    # Subtest: initializes IndexedDB
    ok 1 - initializes IndexedDB
      ---
      duration_ms: 35.280446
      type: 'test'
      ...
    # Subtest: fetches and caches preview
    ok 2 - fetches and caches preview
      ---
      duration_ms: 74.721747
      type: 'test'
      ...
    # Subtest: returns null on fetch failure
    ok 3 - returns null on fetch failure
      ---
      duration_ms: 4.880252
      type: 'test'
      ...
    # Subtest: respects TTL
    ok 4 - respects TTL
      ---
      duration_ms: 20.820233
      type: 'test'
      ...
    # Subtest: deletePreview removes from cache
    ok 5 - deletePreview removes from cache
      ---
      duration_ms: 6.868775
      type: 'test'
      ...
    1..5
ok 1 - LinkPreviewService
  ---
  duration_ms: 151.644954
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
# duration_ms 169.581732

→ Running tests/services/moderation-action-controller.test.mjs
TAP version 13
# Subtest: ModerationActionController: handles moderation override
ok 1 - ModerationActionController: handles moderation override
  ---
  duration_ms: 1.903965
  type: 'test'
  ...
# Subtest: ModerationActionController: blocks user and updates state
ok 2 - ModerationActionController: blocks user and updates state
  ---
  duration_ms: 0.944082
  type: 'test'
  ...
# Subtest: ModerationActionController: prevents blocking self
ok 3 - ModerationActionController: prevents blocking self
  ---
  duration_ms: 0.321023
  type: 'test'
  ...
# Subtest: ModerationActionController: requires login to block
ok 4 - ModerationActionController: requires login to block
  ---
  duration_ms: 0.417539
  type: 'test'
  ...
# Subtest: ModerationActionController: handles hide action
ok 5 - ModerationActionController: handles hide action
  ---
  duration_ms: 0.370571
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
# duration_ms 21.103027

→ Running tests/services/nostr-service.test.mjs
TAP version 13
# Subtest: NostrService
    # Subtest: loadVideos
        # Subtest: should load cached videos and start subscription
        ok 1 - should load cached videos and start subscription
          ---
          duration_ms: 3.462622
          type: 'test'
          ...
        1..1
    ok 1 - loadVideos
      ---
      duration_ms: 4.491034
      type: 'suite'
      ...
    # Subtest: fetchVideosByAuthors
        # Subtest: should fetch videos from relays for specific authors
        ok 1 - should fetch videos from relays for specific authors
          ---
          duration_ms: 2.353627
          type: 'test'
          ...
        1..1
    ok 2 - fetchVideosByAuthors
      ---
      duration_ms: 2.598233
      type: 'suite'
      ...
    1..2
ok 1 - NostrService
  ---
  duration_ms: 8.07044
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
# duration_ms 28.086994

→ Running tests/services/playbackService_forcedSource.test.mjs
(node:5060) ExperimentalWarning: The MockTimers API is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
TAP version 13
# Subtest: PlaybackService Forced Source Logic
    # Subtest: Normal flow: Timeout triggers fallback to Torrent if URL stalls
    ok 1 - Normal flow: Timeout triggers fallback to Torrent if URL stalls
      ---
      duration_ms: 12.225684
      type: 'test'
      ...
    # Subtest: Forced Source 'url': Ignores playbackStartTimeout and does NOT fallback to Torrent
    ok 2 - Forced Source 'url': Ignores playbackStartTimeout and does NOT fallback to Torrent
      ---
      duration_ms: 4.099116
      type: 'test'
      ...
    # Subtest: Forced Source 'url': Does NOT fallback to Torrent even if URL fails (probe bad)
    ok 3 - Forced Source 'url': Does NOT fallback to Torrent even if URL fails (probe bad)
      ---
      duration_ms: 2.015267
      type: 'test'
      ...
    # Subtest: Forced Source 'torrent': Ignores playbackStartTimeout and does NOT fallback to URL
    ok 4 - Forced Source 'torrent': Ignores playbackStartTimeout and does NOT fallback to URL
      ---
      duration_ms: 1.769446
      type: 'test'
      ...
    # Subtest: Forced Source 'torrent': Does NOT fallback to URL even if Torrent fails
    ok 5 - Forced Source 'torrent': Does NOT fallback to URL even if Torrent fails
      ---
      duration_ms: 1.971403
      type: 'test'
      ...
    1..5
ok 1 - PlaybackService Forced Source Logic
  ---
  duration_ms: 131.505549
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
# duration_ms 145.041728

→ Running tests/services/playbackService_order.test.mjs
(node:5067) ExperimentalWarning: The MockTimers API is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
TAP version 13
# Subtest: PlaybackService Ordering
    # Subtest: Playback Execution Order
        # Subtest: urlFirstEnabled=true: Tries URL first, succeeds
        ok 1 - urlFirstEnabled=true: Tries URL first, succeeds
          ---
          duration_ms: 12.279202
          type: 'test'
          ...
        # Subtest: urlFirstEnabled=true: Tries URL first, fails, falls back to Torrent
        ok 2 - urlFirstEnabled=true: Tries URL first, fails, falls back to Torrent
          ---
          duration_ms: 2.955248
          type: 'test'
          ...
        # Subtest: urlFirstEnabled=false: Tries Torrent first, succeeds
        ok 3 - urlFirstEnabled=false: Tries Torrent first, succeeds
          ---
          duration_ms: 2.284428
          type: 'test'
          ...
        # Subtest: urlFirstEnabled=false: Tries Torrent first, fails (throws), falls back to URL
        ok 4 - urlFirstEnabled=false: Tries Torrent first, fails (throws), falls back to URL
          ---
          duration_ms: 3.460671
          type: 'test'
          ...
        # Subtest: forcedSource=torrent overrides urlFirstEnabled=true
        ok 5 - forcedSource=torrent overrides urlFirstEnabled=true
          ---
          duration_ms: 1.668455
          type: 'test'
          ...
        1..5
    ok 1 - Playback Execution Order
      ---
      duration_ms: 24.378743
      type: 'suite'
      ...
    1..1
ok 1 - PlaybackService Ordering
  ---
  duration_ms: 27.048602
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
# duration_ms 51.203335

→ Running tests/services/playbackService.test.mjs
(node:5074) ExperimentalWarning: The MockTimers API is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
TAP version 13
# Subtest: PlaybackService
    # Subtest: Initialization sets defaults and dependencies
    ok 1 - Initialization sets defaults and dependencies
      ---
      duration_ms: 1.469963
      type: 'test'
      ...
    # Subtest: prepareVideoElement respects localStorage and binds listener
    ok 2 - prepareVideoElement respects localStorage and binds listener
      ---
      duration_ms: 4.522254
      type: 'test'
      ...
    # Subtest: registerUrlPlaybackWatchdogs triggers onFallback on error
    ok 3 - registerUrlPlaybackWatchdogs triggers onFallback on error
      ---
      duration_ms: 1.906049
      type: 'test'
      ...
    # Subtest: registerUrlPlaybackWatchdogs triggers onSuccess on playing
    ok 4 - registerUrlPlaybackWatchdogs triggers onSuccess on playing
      ---
      duration_ms: 0.767934
      type: 'test'
      ...
    # Subtest: createSession returns a PlaybackSession
    ok 5 - createSession returns a PlaybackSession
      ---
      duration_ms: 0.499394
      type: 'test'
      ...
    # Subtest: PlaybackSession Flow
        # Subtest: URL Probe Success starts playback
        ok 1 - URL Probe Success starts playback
          ---
          duration_ms: 9.198202
          type: 'test'
          ...
        # Subtest: URL Probe Failure triggers fallback
        ok 2 - URL Probe Failure triggers fallback
          ---
          duration_ms: 2.646247
          type: 'test'
          ...
        # Subtest: Watchdog Stall triggers fallback
        ok 3 - Watchdog Stall triggers fallback
          ---
          duration_ms: 3.217408
          type: 'test'
          ...
        1..3
    ok 6 - PlaybackSession Flow
      ---
      duration_ms: 15.478137
      type: 'suite'
      ...
    1..6
ok 1 - PlaybackService
  ---
  duration_ms: 109.036125
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
# duration_ms 123.764701

→ Running tests/services/profileMetadataService.test.mjs
TAP version 13
# Subtest: profileMetadataService
    # Subtest: fetchProfileMetadataBatch
        # Subtest: should return empty map if no pubkeys provided
        ok 1 - should return empty map if no pubkeys provided
          ---
          duration_ms: 1.945091
          type: 'test'
          ...
        # Subtest: should fetch profiles for provided pubkeys
        ok 2 - should fetch profiles for provided pubkeys
          ---
          duration_ms: 3.478159
          type: 'test'
          ...
        # Subtest: should handle relay failures gracefully
        ok 3 - should handle relay failures gracefully
          ---
          duration_ms: 1.253257
          type: 'test'
          ...
        # Subtest: should parse profile content correctly
        ok 4 - should parse profile content correctly
          ---
          duration_ms: 1.157444
          type: 'test'
          ...
        # Subtest: should deduplicate concurrent requests (inflight)
        ok 5 - should deduplicate concurrent requests (inflight)
          ---
          duration_ms: 8.326434
          type: 'test'
          ...
        1..5
    ok 1 - fetchProfileMetadataBatch
      ---
      duration_ms: 17.660711
      type: 'suite'
      ...
    # Subtest: fetchProfileMetadata
        # Subtest: should return null for invalid pubkey
        ok 1 - should return null for invalid pubkey
          ---
          duration_ms: 0.498664
          type: 'test'
          ...
        # Subtest: should return single profile result
        ok 2 - should return single profile result
          ---
          duration_ms: 0.564533
          type: 'test'
          ...
        1..2
    ok 2 - fetchProfileMetadata
      ---
      duration_ms: 1.778129
      type: 'suite'
      ...
    # Subtest: ensureProfileMetadataSubscription
        # Subtest: should return null if nostr pool is missing
        ok 1 - should return null if nostr pool is missing
          ---
          duration_ms: 0.432118
          type: 'test'
          ...
        # Subtest: should create a subscription via relaySubscriptionService
        ok 2 - should create a subscription via relaySubscriptionService
          ---
          duration_ms: 18.537333
          type: 'test'
          ...
        # Subtest: should handle onProfile callback
        ok 3 - should handle onProfile callback
          ---
          duration_ms: 3.09037
          type: 'test'
          ...
        1..3
    ok 3 - ensureProfileMetadataSubscription
      ---
      duration_ms: 22.721305
      type: 'suite'
      ...
    1..3
ok 1 - profileMetadataService
  ---
  duration_ms: 43.355511
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
# duration_ms 62.523622

→ Running tests/services/r2Service.test.mjs
TAP version 13
# Subtest: js/services/r2Service.js
    # Subtest: Default Settings
    ok 1 - Default Settings
      ---
      duration_ms: 2.657645
      type: 'test'
      ...
    # Subtest: handleCloudflareSettingsSubmit - Valid Input
    ok 2 - handleCloudflareSettingsSubmit - Valid Input
      ---
      duration_ms: 0.617742
      type: 'test'
      ...
    # Subtest: handleCloudflareSettingsSubmit - Invalid S3 URL
    ok 3 - handleCloudflareSettingsSubmit - Invalid S3 URL
      ---
      duration_ms: 1.021612
      type: 'test'
      ...
    # Subtest: handleCloudflareSettingsSubmit - Missing Fields
    ok 4 - handleCloudflareSettingsSubmit - Missing Fields
      ---
      duration_ms: 0.654581
      type: 'test'
      ...
    # Subtest: ensureBucketConfigForNpub - Uses Explicit Credentials
    ok 5 - ensureBucketConfigForNpub - Uses Explicit Credentials
      ---
      duration_ms: 0.75692
      type: 'test'
      ...
    # Subtest: ensureBucketConfigForNpub - Uses Meta Bucket when Missing
    ok 6 - ensureBucketConfigForNpub - Uses Meta Bucket when Missing
      ---
      duration_ms: 0.433604
      type: 'test'
      ...
    # Subtest: resolveConnection - Maps meta bucket into settings
    ok 7 - resolveConnection - Maps meta bucket into settings
      ---
      duration_ms: 0.853941
      type: 'test'
      ...
    # Subtest: resolveConnection - Returns null without StorageService entries
    ok 8 - resolveConnection - Returns null without StorageService entries
      ---
      duration_ms: 0.34575
      type: 'test'
      ...
    1..8
ok 1 - js/services/r2Service.js
  ---
  duration_ms: 13.083306
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
# duration_ms 35.516605

→ Running tests/services/relay-health-service.test.mjs
TAP version 13
# Subtest: RelayHealthService: initializes with default values
ok 1 - RelayHealthService: initializes with default values
  ---
  duration_ms: 1.683338
  type: 'test'
  ...
# Subtest: RelayHealthService: manages telemetry opt-in
ok 2 - RelayHealthService: manages telemetry opt-in
  ---
  duration_ms: 0.392362
  type: 'test'
  ...
# Subtest: RelayHealthService: getRelayUrls fetches from relayManager
ok 3 - RelayHealthService: getRelayUrls fetches from relayManager
  ---
  duration_ms: 1.020949
  type: 'test'
  ...
# Subtest: RelayHealthService: ensureRelayState creates default state
ok 4 - RelayHealthService: ensureRelayState creates default state
  ---
  duration_ms: 0.255692
  type: 'test'
  ...
# Subtest: RelayHealthService: checkRelay success flow
ok 5 - RelayHealthService: checkRelay success flow
  ---
  duration_ms: 0.975682
  type: 'test'
  ...
# Subtest: RelayHealthService: checkRelay failure flow
ok 6 - RelayHealthService: checkRelay failure flow
  ---
  duration_ms: 0.540331
  type: 'test'
  ...
# Subtest: RelayHealthService: checkRelay handles missing nostrClient
ok 7 - RelayHealthService: checkRelay handles missing nostrClient
  ---
  duration_ms: 0.351776
  type: 'test'
  ...
# Subtest: RelayHealthService: refresh checks all relays
ok 8 - RelayHealthService: refresh checks all relays
  ---
  duration_ms: 0.729955
  type: 'test'
  ...
# Subtest: RelayHealthService: emits telemetry if opted in
ok 9 - RelayHealthService: emits telemetry if opted in
  ---
  duration_ms: 0.891403
  type: 'test'
  ...
# Subtest: RelayHealthService: checkRelay times out after DEFAULT_TIMEOUT_MS
ok 10 - RelayHealthService: checkRelay times out after DEFAULT_TIMEOUT_MS
  ---
  duration_ms: 13.566519
  type: 'test'
  ...
# Subtest: RelayHealthService: failure threshold triggers user warning
ok 11 - RelayHealthService: failure threshold triggers user warning
  ---
  duration_ms: 0.931311
  type: 'test'
  ...
# Subtest: RelayHealthService: user warning respects cooldown
ok 12 - RelayHealthService: user warning respects cooldown
  ---
  duration_ms: 0.542878
  type: 'test'
  ...
# Subtest: RelayHealthService: relay disconnect/error events trigger failure
ok 13 - RelayHealthService: relay disconnect/error events trigger failure
  ---
  duration_ms: 0.270736
  type: 'test'
  ...
# Subtest: RelayHealthService: integrates with nostrClient.markRelayUnreachable
ok 14 - RelayHealthService: integrates with nostrClient.markRelayUnreachable
  ---
  duration_ms: 0.225733
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
# duration_ms 5018.076569

→ Running tests/services/s3Service.test.mjs
TAP version 13
# Subtest: s3Service
    # Subtest: validateS3Connection
        # Subtest: should validate correct configuration
        ok 1 - should validate correct configuration
          ---
          duration_ms: 1.65883
          type: 'test'
          ...
        # Subtest: should throw on missing required fields
        ok 2 - should throw on missing required fields
          ---
          duration_ms: 1.031357
          type: 'test'
          ...
        1..2
    ok 1 - validateS3Connection
      ---
      duration_ms: 3.889259
      type: 'suite'
      ...
    # Subtest: getCorsOrigins
        # Subtest: should return current origin
        ok 1 - should return current origin
          ---
          duration_ms: 89.803989
          type: 'test'
          ...
        # Subtest: should handle localhost
        ok 2 - should handle localhost
          ---
          duration_ms: 11.388104
          type: 'test'
          ...
        1..2
    ok 2 - getCorsOrigins
      ---
      duration_ms: 101.557047
      type: 'suite'
      ...
    1..2
ok 1 - s3Service
  ---
  duration_ms: 106.254062
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
# duration_ms 121.356731

→ Running tests/services/s3UploadService.test.mjs
TAP version 13
# Subtest: S3UploadService
    # Subtest: constructor initializes listeners
    ok 1 - constructor initializes listeners
      ---
      duration_ms: 1.381446
      type: 'test'
      ...
    # Subtest: Event Emitter Logic
    ok 2 - Event Emitter Logic
      ---
      duration_ms: 1.439466
      type: 'test'
      ...
    # Subtest: emit handles listener errors safely
    ok 3 - emit handles listener errors safely
      ---
      duration_ms: 0.67914
      type: 'test'
      ...
    # Subtest: verifyConnection
    ok 4 - verifyConnection
      ---
      duration_ms: 0.494785
      type: 'test'
      ...
    # Subtest: prepareUpload
    ok 5 - prepareUpload
      ---
      duration_ms: 0.491849
      type: 'test'
      ...
    # Subtest: uploadFile
        # Subtest: validates parameters
        ok 1 - validates parameters
          ---
          duration_ms: 0.935359
          type: 'test'
          ...
        # Subtest: uploads successfully
        ok 2 - uploads successfully
          ---
          duration_ms: 1.120859
          type: 'test'
          ...
        1..2
    ok 6 - uploadFile
      ---
      duration_ms: 2.86831
      type: 'test'
      ...
    # Subtest: uploadVideo
        # Subtest: fails if npub missing
        ok 1 - fails if npub missing
          ---
          duration_ms: 1.025931
          type: 'test'
          ...
        # Subtest: fails if title missing
        ok 2 - fails if title missing
          ---
          duration_ms: 0.57371
          type: 'test'
          ...
        # Subtest: fails if file missing
        ok 3 - fails if file missing
          ---
          duration_ms: 0.363521
          type: 'test'
          ...
        # Subtest: successful upload flow
        ok 4 - successful upload flow
          ---
          duration_ms: 2.832303
          type: 'test'
          ...
        # Subtest: uploads thumbnail if provided
        ok 5 - uploads thumbnail if provided
          ---
          duration_ms: 0.654839
          type: 'test'
          ...
        # Subtest: handles validation errors from normalizeVideoNotePayload
        ok 6 - handles validation errors from normalizeVideoNotePayload
          ---
          duration_ms: 0.371578
          type: 'test'
          ...
        # Subtest: handles upload exception
        ok 7 - handles upload exception
          ---
          duration_ms: 0.481769
          type: 'test'
          ...
        1..7
    ok 7 - uploadVideo
      ---
      duration_ms: 7.80044
      type: 'test'
      ...
    1..7
ok 1 - S3UploadService
  ---
  duration_ms: 17.785446
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
# duration_ms 38.923114

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
      duration_ms: 2.540401
      type: 'test'
      ...
    # Subtest: should apply seeds when accessControl is ready
    ok 2 - should apply seeds when accessControl is ready
      ---
      duration_ms: 1.494098
      type: 'test'
      ...
    # Subtest: should subscribe to accessControl changes
    ok 3 - should subscribe to accessControl changes
      ---
      duration_ms: 1.342136
      type: 'test'
      ...
    # Subtest: should handle accessControl timeout and apply seeds anyway
    ok 4 - should handle accessControl timeout and apply seeds anyway
      ---
      duration_ms: 3.521526
      type: 'test'
      ...
    # Subtest: should recompute summaries after applying seeds
    ok 5 - should recompute summaries after applying seeds
      ---
      duration_ms: 0.561153
      type: 'test'
      ...
    # Subtest: should wait for relays if hydration fails initially
    ok 6 - should wait for relays if hydration fails initially
      ---
      duration_ms: 300.643181
      type: 'test'
      ...
    1..6
ok 1 - trustBootstrap
  ---
  duration_ms: 312.119411
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
# duration_ms 3770.74428

→ Running tests/share-event-builder.test.mjs
TAP version 13
# Subtest: buildShareEvent preserves share content
ok 1 - buildShareEvent preserves share content
  ---
  duration_ms: 2.039232
  type: 'test'
  ...
# Subtest: buildShareEvent normalizes hex identifiers for e and p tags
ok 2 - buildShareEvent normalizes hex identifiers for e and p tags
  ---
  duration_ms: 1.881342
  type: 'test'
  ...
# Subtest: buildShareEvent includes sanitized relay hints
ok 3 - buildShareEvent includes sanitized relay hints
  ---
  duration_ms: 0.634989
  type: 'test'
  ...
# Subtest: buildShareEvent tolerates missing optional fields
ok 4 - buildShareEvent tolerates missing optional fields
  ---
  duration_ms: 0.241794
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
# duration_ms 17.902788

→ Running tests/shareNostrController.test.mjs
TAP version 13
# Subtest: ShareNostrController
    # Subtest: handleShare shares video successfully
    ok 1 - handleShare shares video successfully
      ---
      duration_ms: 2.137035
      type: 'test'
      ...
    # Subtest: handleShare throws error if missing video details
    ok 2 - handleShare throws error if missing video details
      ---
      duration_ms: 0.945184
      type: 'test'
      ...
    # Subtest: openModal shows error if no video
    ok 3 - openModal shows error if no video
      ---
      duration_ms: 0.651259
      type: 'test'
      ...
    # Subtest: openModal opens modal with correct payload
    ok 4 - openModal opens modal with correct payload
      ---
      duration_ms: 0.444001
      type: 'test'
      ...
    1..4
ok 1 - ShareNostrController
  ---
  duration_ms: 6.41618
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
# duration_ms 19.373207

→ Running tests/sign-request-queue.test.mjs
TAP version 13
# Subtest: queueSignEvent executes successfully
ok 1 - queueSignEvent executes successfully
  ---
  duration_ms: 1.740314
  type: 'test'
  ...
# Subtest: queueSignEvent executes sequentially for same signer
ok 2 - queueSignEvent executes sequentially for same signer
  ---
  duration_ms: 102.673369
  type: 'test'
  ...
# Subtest: queueSignEvent executes concurrently for different signers
ok 3 - queueSignEvent executes concurrently for different signers
  ---
  duration_ms: 51.504366
  type: 'test'
  ...
# Subtest: queueSignEvent times out
ok 4 - queueSignEvent times out
  ---
  duration_ms: 52.054321
  type: 'test'
  ...
# Subtest: queueSignEvent normalizes errors
ok 5 - queueSignEvent normalizes errors
  ---
  duration_ms: 0.676425
  type: 'test'
  ...
# Subtest: queueSignEvent handles signer disconnect
ok 6 - queueSignEvent handles signer disconnect
  ---
  duration_ms: 0.756971
  type: 'test'
  ...
# Subtest: queueSignEvent handles missing signer
ok 7 - queueSignEvent handles missing signer
  ---
  duration_ms: 0.381858
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
# duration_ms 365.086746

→ Running tests/state/appState.test.mjs
TAP version 13
# Subtest: AppState
    # Subtest: getters and setters work for simple values
    ok 1 - getters and setters work for simple values
      ---
      duration_ms: 1.557779
      type: 'test'
      ...
    # Subtest: subscribeToAppStateKey fires on change
    ok 2 - subscribeToAppStateKey fires on change
      ---
      duration_ms: 0.822179
      type: 'test'
      ...
    # Subtest: subscribeToAppState fires on any change
    ok 3 - subscribeToAppState fires on any change
      ---
      duration_ms: 0.39326
      type: 'test'
      ...
    # Subtest: setModalState updates state and notifies
    ok 4 - setModalState updates state and notifies
      ---
      duration_ms: 0.722145
      type: 'test'
      ...
    # Subtest: resetAppState clears everything
    ok 5 - resetAppState clears everything
      ---
      duration_ms: 0.687728
      type: 'test'
      ...
    # Subtest: setVideosMap only accepts Maps or null
    ok 6 - setVideosMap only accepts Maps or null
      ---
      duration_ms: 0.297692
      type: 'test'
      ...
    1..6
ok 1 - AppState
  ---
  duration_ms: 6.155243
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
# duration_ms 22.085925

→ Running tests/state/cache-saved-profiles.test.mjs
TAP version 13
# Subtest: persistSavedProfiles preserves custom authType strings
ok 1 - persistSavedProfiles preserves custom authType strings
  ---
  duration_ms: 2.082291
  type: 'test'
  ...
# Subtest: loadSavedProfilesFromStorage retains custom provider authType
ok 2 - loadSavedProfilesFromStorage retains custom provider authType
  ---
  duration_ms: 0.603431
  type: 'test'
  ...
# Subtest: loadSavedProfilesFromStorage migrates missing authType to nip07
ok 3 - loadSavedProfilesFromStorage migrates missing authType to nip07
  ---
  duration_ms: 0.341296
  type: 'test'
  ...
# Subtest: loadSavedProfilesFromStorage trims stored authType values
ok 4 - loadSavedProfilesFromStorage trims stored authType values
  ---
  duration_ms: 0.297243
  type: 'test'
  ...
# Subtest: loadSavedProfilesFromStorage ignores legacy userPubKey
ok 5 - loadSavedProfilesFromStorage ignores legacy userPubKey
  ---
  duration_ms: 0.291711
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
# duration_ms 17.144004

→ Running tests/state/cache.test.mjs
TAP version 13
# Subtest: js/state/cache.js
    # Subtest: Saved Profiles Persistence
    ok 1 - Saved Profiles Persistence
      ---
      duration_ms: 2.373525
      type: 'test'
      ...
    # Subtest: Active Profile Pubkey
    ok 2 - Active Profile Pubkey
      ---
      duration_ms: 0.616286
      type: 'test'
      ...
    # Subtest: URL Health Caching
    ok 3 - URL Health Caching
      ---
      duration_ms: 0.763765
      type: 'test'
      ...
    # Subtest: URL Health Expiration
    ok 4 - URL Health Expiration
      ---
      duration_ms: 11.37508
      type: 'test'
      ...
    # Subtest: Moderation Settings
    ok 5 - Moderation Settings
      ---
      duration_ms: 1.334348
      type: 'test'
      ...
    # Subtest: Legacy Moderation Overrides Support
        # Subtest: ignores legacy v1 overrides
        ok 1 - ignores legacy v1 overrides
          ---
          duration_ms: 0.440285
          type: 'test'
          ...
        # Subtest: loads v2 overrides
        ok 2 - loads v2 overrides
          ---
          duration_ms: 0.504354
          type: 'test'
          ...
        1..2
    ok 6 - Legacy Moderation Overrides Support
      ---
      duration_ms: 1.974586
      type: 'test'
      ...
    1..6
ok 1 - js/state/cache.js
  ---
  duration_ms: 21.67553
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
# duration_ms 29.867924

→ Running tests/state/profile-cache.test.mjs
[bitvid] [ProfileCache] Expired watchHistory for 1111111111111111111111111111111111111111111111111111111111111111
TAP version 13
# Subtest: ProfileCache: normalizeHexPubkey validates and cleans inputs
ok 1 - ProfileCache: normalizeHexPubkey validates and cleans inputs
  ---
  duration_ms: 1.966552
  type: 'test'
  ...
# Subtest: ProfileCache: resolves storage keys correctly
ok 2 - ProfileCache: resolves storage keys correctly
  ---
  duration_ms: 0.581421
  type: 'test'
  ...
# Subtest: ProfileCache: persists data to localStorage and memory
ok 3 - ProfileCache: persists data to localStorage and memory
  ---
  duration_ms: 1.7957
  type: 'test'
  ...
# Subtest: ProfileCache: loads from localStorage if memory miss
ok 4 - ProfileCache: loads from localStorage if memory miss
  ---
  duration_ms: 0.35803
  type: 'test'
  ...
# Subtest: ProfileCache: handles active profile switching
ok 5 - ProfileCache: handles active profile switching
  ---
  duration_ms: 1.004937
  type: 'test'
  ...
# Subtest: ProfileCache: setProfile normalizes and saves
ok 6 - ProfileCache: setProfile normalizes and saves
  ---
  duration_ms: 1.08414
  type: 'test'
  ...
# Subtest: ProfileCache: emits events on active profile change
ok 7 - ProfileCache: emits events on active profile change
  ---
  duration_ms: 0.431529
  type: 'test'
  ...
# Subtest: ProfileCache: respects TTL expiration
ok 8 - ProfileCache: respects TTL expiration
  ---
  duration_ms: 1.35058
  type: 'test'
  ...
# Subtest: ProfileCache: setProfile sanitizes XSS in media URLs
ok 9 - ProfileCache: setProfile sanitizes XSS in media URLs
  ---
  duration_ms: 1.413938
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
# duration_ms 26.042

→ Running tests/state/profile-settings-store.test.mjs
TAP version 13
# Subtest: profile settings store clones values and tracks entries
ok 1 - profile settings store clones values and tracks entries
  ---
  duration_ms: 2.480315
  type: 'test'
  ...
# Subtest: profile settings store ignores falsy keys and survives clone failures
ok 2 - profile settings store ignores falsy keys and survives clone failures
  ---
  duration_ms: 0.344008
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
# duration_ms 15.708361

→ Running tests/storage-service.test.mjs
TAP version 13
# Subtest: StorageService
    # Subtest: init() creates database and object store
    ok 1 - init() creates database and object store
      ---
      duration_ms: 11.546101
      type: 'test'
      ...
[bitvid] [StorageService] Unlocked storage for 00000000...
    # Subtest: unlock() generates and stores master key with NIP-44
    ok 2 - unlock() generates and stores master key with NIP-44
      ---
      duration_ms: 10.462536
      type: 'test'
      ...
[bitvid] [StorageService] Unlocked storage for 00000000...
[bitvid] [StorageService] Locked storage for 00000000...
[bitvid] [StorageService] Unlocked storage for 00000000...
    # Subtest: unlock() restores existing master key
    ok 3 - unlock() restores existing master key
      ---
      duration_ms: 4.850841
      type: 'test'
      ...
[bitvid] [StorageService] Unlocked storage for 00000000...
    # Subtest: unlock() falls back to NIP-04 if NIP-44 unavailable
    ok 4 - unlock() falls back to NIP-04 if NIP-44 unavailable
      ---
      duration_ms: 3.114711
      type: 'test'
      ...
[bitvid] [StorageService] Unlocked storage for 00000000...
[bitvid] [StorageService] Locked storage for 00000000...
    # Subtest: unlock() normalizes permission denied decrypt errors
    ok 5 - unlock() normalizes permission denied decrypt errors
      ---
      duration_ms: 4.204469
      type: 'test'
      ...
[bitvid] [StorageService] Unlocked storage for 00000000...
[bitvid] [StorageService] Locked storage for 00000000...
    # Subtest: unlock() normalizes missing decryptor errors
    ok 6 - unlock() normalizes missing decryptor errors
      ---
      duration_ms: 4.992837
      type: 'test'
      ...
[bitvid] [StorageService] Unlocked storage for 00000000...
[bitvid] [StorageService] Locked storage for 00000000...
    # Subtest: unlock() normalizes unknown decrypt errors
    ok 7 - unlock() normalizes unknown decrypt errors
      ---
      duration_ms: 2.623833
      type: 'test'
      ...
[bitvid] [StorageService] Unlocked storage for 00000000...
[bitvid] [StorageService] Saved connection conn_1
    # Subtest: saveConnection() encrypts and stores connection
    ok 8 - saveConnection() encrypts and stores connection
      ---
      duration_ms: 4.644506
      type: 'test'
      ...
[bitvid] [StorageService] Unlocked storage for 00000000...
[bitvid] [StorageService] Saved connection conn_1
    # Subtest: getConnection() decrypts and returns connection
    ok 9 - getConnection() decrypts and returns connection
      ---
      duration_ms: 4.789868
      type: 'test'
      ...
    # Subtest: getConnection() throws if locked
    ok 10 - getConnection() throws if locked
      ---
      duration_ms: 1.320676
      type: 'test'
      ...
[bitvid] [StorageService] Unlocked storage for 00000000...
[bitvid] [StorageService] Saved connection conn_1
[bitvid] [StorageService] Deleted connection conn_1
    # Subtest: deleteConnection() removes connection
    ok 11 - deleteConnection() removes connection
      ---
      duration_ms: 3.30144
      type: 'test'
      ...
[bitvid] [StorageService] Unlocked storage for 00000000...
[bitvid] [StorageService] Saved connection conn_1
[bitvid] [StorageService] Saved connection conn_2
    # Subtest: setDefaultConnection() updates metadata
    ok 12 - setDefaultConnection() updates metadata
      ---
      duration_ms: 3.674334
      type: 'test'
      ...
[bitvid] [StorageService] Unlocked storage for 00000000...
[bitvid] [StorageService] Saved connection conn_1
[bitvid] [StorageService] Saved connection conn_2
    # Subtest: saveConnection() with defaultForUploads=true clears other defaults
    ok 13 - saveConnection() with defaultForUploads=true clears other defaults
      ---
      duration_ms: 3.432341
      type: 'test'
      ...
    1..13
ok 1 - StorageService
  ---
  duration_ms: 65.481881
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
# duration_ms 74.17559

→ Running tests/subscriptions-manager.test.mjs
[bitvid] [nostr] Relay backoff applied. {
  relay: 'wss://relay-b.example',
  backoffMs: 1000,
  failureCount: 1,
  retryAt: 1770906701691,
  reason: null
}
TAP version 13
# Subtest: loadSubscriptions aggregates relay results when one rejects
ok 1 - loadSubscriptions aggregates relay results when one rejects
  ---
  duration_ms: 11.109054
  type: 'test'
  ...
# Subtest: loadSubscriptions queries the correct subscription list kind
ok 2 - loadSubscriptions queries the correct subscription list kind
  ---
  duration_ms: 1.08623
  type: 'test'
  ...
# Subtest: loadSubscriptions falls back to nip44 when hinted
ok 3 - loadSubscriptions falls back to nip44 when hinted
  ---
  duration_ms: 1.871997
  type: 'test'
  ...
# Subtest: loadSubscriptions handles nip44.v2 decryptors
ok 4 - loadSubscriptions handles nip44.v2 decryptors
  ---
  duration_ms: 1.290028
  type: 'test'
  ...
# Subtest: loadSubscriptions prefers nip44 decryptors when both are available
ok 5 - loadSubscriptions prefers nip44 decryptors when both are available
  ---
  duration_ms: 1.549437
  type: 'test'
  ...
# Subtest: loadSubscriptions uses active signer decryptors without requesting extension permissions
ok 6 - loadSubscriptions uses active signer decryptors without requesting extension permissions
  ---
  duration_ms: 1.259428
  type: 'test'
  ...
# Subtest: loadSubscriptions retries permission-required decrypts only when enabled
ok 7 - loadSubscriptions retries permission-required decrypts only when enabled
  ---
  duration_ms: 1.60768
  type: 'test'
  ...
# Subtest: showSubscriptionVideos waits for nostrService warm-up and refreshes after updates
ok 8 - showSubscriptionVideos waits for nostrService warm-up and refreshes after updates
  ---
  duration_ms: 93.994821
  type: 'test'
  ...
# Subtest: ensureLoaded memoizes concurrent loads
ok 9 - ensureLoaded memoizes concurrent loads
  ---
  duration_ms: 8.609618
  type: 'test'
  ...
# Subtest: publishSubscriptionList succeeds with direct signer without requesting extension permissions
ok 10 - publishSubscriptionList succeeds with direct signer without requesting extension permissions
  ---
  duration_ms: 2.813544
  type: 'test'
  ...
# Subtest: publishSubscriptionList prefers nip44 encryption when available
ok 11 - publishSubscriptionList prefers nip44 encryption when available
  ---
  duration_ms: 1.022212
  type: 'test'
  ...
# Subtest: publishSubscriptionList falls back to nip04 when nip44 fails
ok 12 - publishSubscriptionList falls back to nip04 when nip44 fails
  ---
  duration_ms: 0.963122
  type: 'test'
  ...
# Subtest: renderSameGridStyle shows empty state message
ok 13 - renderSameGridStyle shows empty state message
  ---
  duration_ms: 14.485016
  type: 'test'
  ...
# Subtest: renderSameGridStyle forwards moderation badge actions to the application
ok 14 - renderSameGridStyle forwards moderation badge actions to the application
  ---
  duration_ms: 68.811433
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
# duration_ms 6026.127887

→ Running tests/torrent/service-worker-fallback-message.test.mjs
TAP version 13
# Subtest: returns generic message when error missing
ok 1 - returns generic message when error missing
  ---
  duration_ms: 2.657707
  type: 'test'
  ...
# Subtest: identifies HTTPS requirement errors
ok 2 - identifies HTTPS requirement errors
  ---
  duration_ms: 0.249178
  type: 'test'
  ...
# Subtest: identifies disabled service worker errors
ok 3 - identifies disabled service worker errors
  ---
  duration_ms: 0.314304
  type: 'test'
  ...
# Subtest: identifies Brave specific guidance
ok 4 - identifies Brave specific guidance
  ---
  duration_ms: 0.289999
  type: 'test'
  ...
# Subtest: identifies blocked script errors
ok 5 - identifies blocked script errors
  ---
  duration_ms: 0.204548
  type: 'test'
  ...
# Subtest: identifies controller claim timeout
ok 6 - identifies controller claim timeout
  ---
  duration_ms: 0.299904
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
# duration_ms 18.806459

→ Running tests/torrent/style-helpers.test.mjs
TAP version 13
# Subtest: torrent/ui/styleHelpers
    # Subtest: returns null when no element is provided
    ok 1 - returns null when no element is provided
      ---
      duration_ms: 1.049147
      type: 'test'
      ...
    # Subtest: returns the original element without mutations
    ok 2 - returns the original element without mutations
      ---
      duration_ms: 79.455069
      type: 'test'
      ...
    # Subtest: provides an empty, frozen fallback map
    ok 3 - provides an empty, frozen fallback map
      ---
      duration_ms: 1.526197
      type: 'test'
      ...
    # Subtest: no-ops when removing styles
    ok 4 - no-ops when removing styles
      ---
      duration_ms: 10.486536
      type: 'test'
      ...
    1..4
ok 1 - torrent/ui/styleHelpers
  ---
  duration_ms: 94.370685
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
# duration_ms 108.077501

→ Running tests/torrent/toast-service.test.mjs
TAP version 13
# Subtest: torrent/ui/toastService
    # Subtest: renders a toast with Tailwind token classes and removes it on dismiss
    ok 1 - renders a toast with Tailwind token classes and removes it on dismiss
      ---
      duration_ms: 353.762186
      type: 'test'
      ...
    1..1
ok 1 - torrent/ui/toastService
  ---
  duration_ms: 355.418585
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
# duration_ms 364.951077

→ Running tests/ui/app-chrome-controller.test.mjs
TAP version 13
# Subtest: AppChromeController binds upload button when elements hydrate later
ok 1 - AppChromeController binds upload button when elements hydrate later
  ---
  duration_ms: 93.139901
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
# duration_ms 104.774309

→ Running tests/ui/components/debug_hashtag_strip_helper.test.mjs
Global ResizeObserver type: function
Helper window ResizeObserver: undefined
TAP version 13
# Subtest: Debug HashtagStripHelper fallback
ok 1 - Debug HashtagStripHelper fallback
  ---
  duration_ms: 107.701352
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
# duration_ms 120.494856

→ Running tests/ui/components/hashtagStripHelper.test.mjs
TAP version 13
# Subtest: HashtagStripHelper uses ResizeObserver when available
ok 1 - HashtagStripHelper uses ResizeObserver when available
  ---
  duration_ms: 118.276907
  type: 'test'
  ...
# Subtest: HashtagStripHelper falls back to window resize with RAF
ok 2 - HashtagStripHelper falls back to window resize with RAF
  ---
  duration_ms: 18.745276
  type: 'test'
  ...
# Subtest: HashtagStripHelper falls back to window resize with setTimeout when RAF is missing
ok 3 - HashtagStripHelper falls back to window resize with setTimeout when RAF is missing
  ---
  duration_ms: 14.617613
  type: 'test'
  ...
# Subtest: HashtagStripHelper handles teardown correctly
ok 4 - HashtagStripHelper handles teardown correctly
  ---
  duration_ms: 12.421468
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
# duration_ms 184.89381

→ Running tests/ui/components/videoMenuRenderers.test.mjs
TAP version 13
# Subtest: createVideoMoreMenuPanel - basic rendering
ok 1 - createVideoMoreMenuPanel - basic rendering
  ---
  duration_ms: 119.75182
  type: 'test'
  ...
# Subtest: createVideoMoreMenuPanel - pointer info rendering
ok 2 - createVideoMoreMenuPanel - pointer info rendering
  ---
  duration_ms: 16.005172
  type: 'test'
  ...
# Subtest: createVideoMoreMenuPanel - mirror logic
ok 3 - createVideoMoreMenuPanel - mirror logic
  ---
  duration_ms: 15.088246
  type: 'test'
  ...
# Subtest: createVideoMoreMenuPanel - blacklist logic
ok 4 - createVideoMoreMenuPanel - blacklist logic
  ---
  duration_ms: 21.363019
  type: 'test'
  ...
# Subtest: createVideoShareMenuPanel - permission logic
ok 5 - createVideoShareMenuPanel - permission logic
  ---
  duration_ms: 16.292098
  type: 'test'
  ...
# Subtest: createVideoShareMenuPanel - magnet/cdn logic
ok 6 - createVideoShareMenuPanel - magnet/cdn logic
  ---
  duration_ms: 11.256125
  type: 'test'
  ...
# Subtest: createChannelProfileMenuPanel - basic actions
ok 7 - createChannelProfileMenuPanel - basic actions
  ---
  duration_ms: 11.791044
  type: 'test'
  ...
# Subtest: createVideoSettingsMenuPanel - capabilities
ok 8 - createVideoSettingsMenuPanel - capabilities
  ---
  duration_ms: 11.764419
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
# duration_ms 240.508633

→ Running tests/ui/creatorProfileController.test.mjs
TAP version 13
# Subtest: CreatorProfileController
    # Subtest: resolveCreatorProfileFromSources prioritizes cached profile
    ok 1 - resolveCreatorProfileFromSources prioritizes cached profile
      ---
      duration_ms: 3.123473
      type: 'test'
      ...
    # Subtest: resolveCreatorProfileFromSources falls back to fetched profile
    ok 2 - resolveCreatorProfileFromSources falls back to fetched profile
      ---
      duration_ms: 0.531566
      type: 'test'
      ...
    # Subtest: decorateVideoCreatorIdentity modifies video object
    ok 3 - decorateVideoCreatorIdentity modifies video object
      ---
      duration_ms: 0.557586
      type: 'test'
      ...
    # Subtest: fetchModalCreatorProfile fetches profile and updates modal
    ok 4 - fetchModalCreatorProfile fetches profile and updates modal
      ---
      duration_ms: 1.270371
      type: 'test'
      ...
    1..4
ok 1 - CreatorProfileController
  ---
  duration_ms: 7.711661
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
# duration_ms 20.560241

→ Running tests/ui/dm/zapHelpers.test.mjs
TAP version 13
# Subtest: formatZapAmount
    # Subtest: formats standard amounts correctly
    ok 1 - formats standard amounts correctly
      ---
      duration_ms: 64.473712
      type: 'test'
      ...
    # Subtest: formats compact amounts correctly
    ok 2 - formats compact amounts correctly
      ---
      duration_ms: 4.96222
      type: 'test'
      ...
    # Subtest: handles zero and small numbers
    ok 3 - handles zero and small numbers
      ---
      duration_ms: 1.110916
      type: 'test'
      ...
    # Subtest: handles invalid inputs gracefully
    ok 4 - handles invalid inputs gracefully
      ---
      duration_ms: 0.972329
      type: 'test'
      ...
    # Subtest: handles string number inputs
    ok 5 - handles string number inputs
      ---
      duration_ms: 0.642319
      type: 'test'
      ...
    1..5
ok 1 - formatZapAmount
  ---
  duration_ms: 74.483436
  type: 'suite'
  ...
# Subtest: aggregateZapTotals
    # Subtest: aggregates totals correctly
    ok 1 - aggregates totals correctly
      ---
      duration_ms: 0.883157
      type: 'test'
      ...
    # Subtest: handles empty input
    ok 2 - handles empty input
      ---
      duration_ms: 0.557232
      type: 'test'
      ...
    # Subtest: handles non-array input
    ok 3 - handles non-array input
      ---
      duration_ms: 0.749339
      type: 'test'
      ...
    # Subtest: handles missing or invalid amounts
    ok 4 - handles missing or invalid amounts
      ---
      duration_ms: 0.754467
      type: 'test'
      ...
    # Subtest: handles missing IDs
    ok 5 - handles missing IDs
      ---
      duration_ms: 0.80905
      type: 'test'
      ...
    1..5
ok 2 - aggregateZapTotals
  ---
  duration_ms: 4.904585
  type: 'suite'
  ...
# Subtest: normalizeZapReceipt
    # Subtest: normalizes valid receipt
    ok 1 - normalizes valid receipt
      ---
      duration_ms: 0.426092
      type: 'test'
      ...
    # Subtest: normalizes receipt with amount fallback
    ok 2 - normalizes receipt with amount fallback
      ---
      duration_ms: 0.244159
      type: 'test'
      ...
    # Subtest: normalizes empty receipt
    ok 3 - normalizes empty receipt
      ---
      duration_ms: 0.140634
      type: 'test'
      ...
    # Subtest: normalizes undefined receipt
    ok 4 - normalizes undefined receipt
      ---
      duration_ms: 0.156874
      type: 'test'
      ...
    # Subtest: normalizes invalid amount
    ok 5 - normalizes invalid amount
      ---
      duration_ms: 0.116081
      type: 'test'
      ...
    1..5
ok 3 - normalizeZapReceipt
  ---
  duration_ms: 1.421011
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
# duration_ms 111.714112

→ Running tests/ui/engagement-controller.test.mjs
TAP version 13
# Subtest: EngagementController
    # Subtest: handleRepostAction - should show error if no event ID is available
    ok 1 - handleRepostAction - should show error if no event ID is available
      ---
      duration_ms: 3.036047
      type: 'test'
      ...
    # Subtest: handleRepostAction - should call repostEvent with correct parameters
    ok 2 - handleRepostAction - should call repostEvent with correct parameters
      ---
      duration_ms: 0.758029
      type: 'test'
      ...
    # Subtest: handleRepostAction - should handle failure from repostEvent
    ok 3 - handleRepostAction - should handle failure from repostEvent
      ---
      duration_ms: 0.662871
      type: 'test'
      ...
    # Subtest: handleRepostAction - should use currentVideoPointer when in modal context
    ok 4 - handleRepostAction - should use currentVideoPointer when in modal context
      ---
      duration_ms: 0.652319
      type: 'test'
      ...
    # Subtest: handleMirrorAction - should show error if video has no URL
    ok 5 - handleMirrorAction - should show error if video has no URL
      ---
      duration_ms: 1.433176
      type: 'test'
      ...
    # Subtest: handleMirrorAction - should call mirrorVideoEvent when URL is provided
    ok 6 - handleMirrorAction - should call mirrorVideoEvent when URL is provided
      ---
      duration_ms: 0.6405
      type: 'test'
      ...
    # Subtest: handleMirrorAction - should prevent mirroring private videos
    ok 7 - handleMirrorAction - should prevent mirroring private videos
      ---
      duration_ms: 0.379491
      type: 'test'
      ...
    # Subtest: handleEnsurePresenceAction - should show error if no event ID
    ok 8 - handleEnsurePresenceAction - should show error if no event ID
      ---
      duration_ms: 0.76987
      type: 'test'
      ...
    # Subtest: handleEnsurePresenceAction - should handle throttled response
    ok 9 - handleEnsurePresenceAction - should handle throttled response
      ---
      duration_ms: 0.864371
      type: 'test'
      ...
    # Subtest: handleEnsurePresenceAction - should show success on successful rebroadcast
    ok 10 - handleEnsurePresenceAction - should show success on successful rebroadcast
      ---
      duration_ms: 0.531484
      type: 'test'
      ...
    1..10
ok 1 - EngagementController
  ---
  duration_ms: 13.705479
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
# duration_ms 33.276106

→ Running tests/ui/hashtag-strip-helper-bounce.test.mjs
TAP version 13
# Subtest: HashtagStripHelper triggers scroll hint when content overflows
ok 1 - HashtagStripHelper triggers scroll hint when content overflows
  ---
  duration_ms: 114.603262
  type: 'test'
  ...
# Subtest: HashtagStripHelper does not trigger scroll hint when no overflow
ok 2 - HashtagStripHelper does not trigger scroll hint when no overflow
  ---
  duration_ms: 15.48275
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
# duration_ms 148.982561

→ Running tests/ui/popoverEngine.test.mjs
TAP version 13
# Subtest: opens a popover in the overlay root and positions the panel
ok 1 - opens a popover in the overlay root and positions the panel
  ---
  duration_ms: 601.447854
  type: 'test'
  ...
# Subtest: positions bottom-end panels flush with the trigger's right edge
ok 2 - positions bottom-end panels flush with the trigger's right edge
  ---
  duration_ms: 89.12484
  type: 'test'
  ...
# Subtest: closes on outside pointer events and restores focus
ok 3 - closes on outside pointer events and restores focus
  ---
  duration_ms: 49.846079
  type: 'test'
  ...
# Subtest: supports roving focus, home/end navigation, and typeahead
ok 4 - supports roving focus, home/end navigation, and typeahead
  ---
  duration_ms: 64.461464
  type: 'test'
  ...
# Subtest: escape closes the popover and restores trigger focus
ok 5 - escape closes the popover and restores trigger focus
  ---
  duration_ms: 53.28361
  type: 'test'
  ...
# Subtest: close respects restoreFocus option for contextual menus
ok 6 - close respects restoreFocus option for contextual menus
  ---
  duration_ms: 189.956602
  type: 'test'
  ...
# Subtest: ensures only one popover is open at a time
ok 7 - ensures only one popover is open at a time
  ---
  duration_ms: 247.004756
  type: 'test'
  ...
# Subtest: applies token-based sizing and arrow positioning
ok 8 - applies token-based sizing and arrow positioning
  ---
  duration_ms: 61.751322
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
# duration_ms 1367.765244

→ Running tests/ui/profile-modal-moderation-settings.test.mjs
TAP version 13
# Subtest: moderation settings save updates service and disables control
ok 1 - moderation settings save updates service and disables control
  ---
  duration_ms: 203.602178
  type: 'test'
  ...
# Subtest: moderation reset restores defaults and clearing inputs uses defaults
ok 2 - moderation reset restores defaults and clearing inputs uses defaults
  ---
  duration_ms: 38.419132
  type: 'test'
  ...
# Subtest: guest fallback uses config moderation defaults
ok 3 - guest fallback uses config moderation defaults
  ---
  duration_ms: 31.003594
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
# duration_ms 290.282227

→ Running tests/ui/profileModalController-addProfile.test.mjs
Success: Profile added. Select it when you're ready to switch.
Success: That profile is already saved on this device.
TAP version 13
# Subtest: handleAddProfile adds a new profile correctly
ok 1 - handleAddProfile adds a new profile correctly
  ---
  duration_ms: 201.386743
  type: 'test'
  ...
# Subtest: handleAddProfile prevents duplicates
ok 2 - handleAddProfile prevents duplicates
  ---
  duration_ms: 35.947527
  type: 'test'
  ...
# Subtest: handleAddProfile handles missing login result
ok 3 - handleAddProfile handles missing login result
  ---
  duration_ms: 30.708539
  type: 'test'
  ...
# Subtest: handleAddProfile handles errors gracefully
ok 4 - handleAddProfile handles errors gracefully
  ---
  duration_ms: 33.882274
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
# duration_ms 318.570721

→ Running tests/ui/reactionController.test.mjs
TAP version 13
# Subtest: ReactionController
    # Subtest: should subscribe to reactions
    ok 1 - should subscribe to reactions
      ---
      duration_ms: 3.581947
      type: 'test'
      ...
    # Subtest: should handle reaction update from subscription
    ok 2 - should handle reaction update from subscription
      ---
      duration_ms: 0.830409
      type: 'test'
      ...
    # Subtest: should apply optimistic update on handleReaction
    ok 3 - should apply optimistic update on handleReaction
      ---
      duration_ms: 1.430876
      type: 'test'
      ...
    # Subtest: should rollback optimistic update on publish failure
    ok 4 - should rollback optimistic update on publish failure
      ---
      duration_ms: 1.118191
      type: 'test'
      ...
    # Subtest: should not react if user not logged in
    ok 5 - should not react if user not logged in
      ---
      duration_ms: 1.328988
      type: 'test'
      ...
    1..5
ok 1 - ReactionController
  ---
  duration_ms: 10.867654
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
# duration_ms 30.869231

→ Running tests/ui/similar-content-card.test.mjs
TAP version 13
# Subtest: cached thumbnails reuse existing src without lazy-loading
ok 1 - cached thumbnails reuse existing src without lazy-loading
  ---
  duration_ms: 374.168713
  type: 'test'
  ...
# Subtest: uncached thumbnails use fallback, cache on load, and retain blur state
ok 2 - uncached thumbnails use fallback, cache on load, and retain blur state
  ---
  duration_ms: 41.107898
  type: 'test'
  ...
# Subtest: primary clicks trigger onPlay while modifiers and right clicks do not
ok 3 - primary clicks trigger onPlay while modifiers and right clicks do not
  ---
  duration_ms: 27.309751
  type: 'test'
  ...
# Subtest: author identity fields render supplied values and datasets
ok 4 - author identity fields render supplied values and datasets
  ---
  duration_ms: 21.781994
  type: 'test'
  ...
# Subtest: view counter wiring exposes pointer datasets
ok 5 - view counter wiring exposes pointer datasets
  ---
  duration_ms: 22.911012
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
# duration_ms 507.285564

→ Running tests/ui/similarContentController.test.mjs
TAP version 13
# Subtest: SimilarContentController
    # Subtest: extractDTagValue
        # Subtest: should return the 'd' tag value
        ok 1 - should return the 'd' tag value
          ---
          duration_ms: 1.824223
          type: 'test'
          ...
        # Subtest: should return empty string if no 'd' tag
        ok 2 - should return empty string if no 'd' tag
          ---
          duration_ms: 0.477778
          type: 'test'
          ...
        1..2
    ok 1 - extractDTagValue
      ---
      duration_ms: 3.285651
      type: 'suite'
      ...
    # Subtest: computeCandidates
        # Subtest: should return empty array if no active video
        ok 1 - should return empty array if no active video
          ---
          duration_ms: 1.987103
          type: 'test'
          ...
        # Subtest: should compute similar candidates based on tags
        ok 2 - should compute similar candidates based on tags
          ---
          duration_ms: 1.533478
          type: 'test'
          ...
        # Subtest: should exclude blocked authors
        ok 3 - should exclude blocked authors
          ---
          duration_ms: 0.999653
          type: 'test'
          ...
        # Subtest: should prioritize higher shared tag count
        ok 4 - should prioritize higher shared tag count
          ---
          duration_ms: 0.79291
          type: 'test'
          ...
        1..4
    ok 2 - computeCandidates
      ---
      duration_ms: 5.806959
      type: 'suite'
      ...
    # Subtest: updateModal
        # Subtest: should clear similar content if no active video
        ok 1 - should clear similar content if no active video
          ---
          duration_ms: 0.437905
          type: 'test'
          ...
        # Subtest: should set similar content if matches found
        ok 2 - should set similar content if matches found
          ---
          duration_ms: 0.85403
          type: 'test'
          ...
        # Subtest: should clear similar content if no matches found
        ok 3 - should clear similar content if no matches found
          ---
          duration_ms: 0.769425
          type: 'test'
          ...
        1..3
    ok 3 - updateModal
      ---
      duration_ms: 2.531719
      type: 'suite'
      ...
    1..3
ok 1 - SimilarContentController
  ---
  duration_ms: 12.759171
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
# duration_ms 34.015722

→ Running tests/ui/storageService.test.mjs
TAP version 13
[bitvid] [StorageService] Unlocked storage for 00000000...
# Subtest: StorageService
    # Subtest: should unlock storage with a valid signer
    ok 1 - should unlock storage with a valid signer
      ---
      duration_ms: 26.528238
      type: 'test'
      ...
[bitvid] [StorageService] Unlocked storage for 00000000...
[bitvid] [StorageService] Saved connection r2-test-1
    # Subtest: should save and retrieve an R2 connection
    ok 2 - should save and retrieve an R2 connection
      ---
      duration_ms: 11.308539
      type: 'test'
      ...
[bitvid] [StorageService] Unlocked storage for 00000000...
[bitvid] [StorageService] Saved connection s3-generic-1
    # Subtest: should save and retrieve a Generic S3 connection with extra fields
    ok 3 - should save and retrieve a Generic S3 connection with extra fields
      ---
      duration_ms: 5.993534
      type: 'test'
      ...
    # Subtest: should fail to get connection if locked
    ok 4 - should fail to get connection if locked
      ---
      duration_ms: 1.729308
      type: 'test'
      ...
    1..4
ok 1 - StorageService
  ---
  duration_ms: 190.718306
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
# duration_ms 200.8166

→ Running tests/ui/tag-pill-list.test.mjs
TAP version 13
# Subtest: renderTagPillStrip builds buttons with labels and icons
ok 1 - renderTagPillStrip builds buttons with labels and icons
  ---
  duration_ms: 104.374776
  type: 'test'
  ...
# Subtest: renderTagPillStrip applies preference state styling
ok 2 - renderTagPillStrip applies preference state styling
  ---
  duration_ms: 14.956507
  type: 'test'
  ...
# Subtest: renderTagPillStrip wires the activation callback
ok 3 - renderTagPillStrip wires the activation callback
  ---
  duration_ms: 13.947808
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
# duration_ms 148.108947

→ Running tests/ui/tag-preference-menu.test.mjs
TAP version 13
# Subtest: createTagPreferenceMenu renders heading and actions
ok 1 - createTagPreferenceMenu renders heading and actions
  ---
  duration_ms: 101.957562
  type: 'test'
  ...
# Subtest: createTagPreferenceMenu disables actions based on membership and login
ok 2 - createTagPreferenceMenu disables actions based on membership and login
  ---
  duration_ms: 18.836097
  type: 'test'
  ...
# Subtest: createTagPreferenceMenu forwards actions to callback
ok 3 - createTagPreferenceMenu forwards actions to callback
  ---
  duration_ms: 17.27832
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
# duration_ms 153.229546

→ Running tests/ui/tagPreferenceMenuController.test.mjs
TAP version 13
# Subtest: TagPreferenceMenuController
    # Subtest: ensurePopover
        # Subtest: should create a new popover entry if one does not exist
        ok 1 - should create a new popover entry if one does not exist
          ---
          duration_ms: 3.146936
          type: 'test'
          ...
        # Subtest: should return existing entry if one exists
        ok 2 - should return existing entry if one exists
          ---
          duration_ms: 0.757927
          type: 'test'
          ...
        # Subtest: should return null if trigger or tag is missing
        ok 3 - should return null if trigger or tag is missing
          ---
          duration_ms: 1.613216
          type: 'test'
          ...
        1..3
    ok 1 - ensurePopover
      ---
      duration_ms: 7.707898
      type: 'suite'
      ...
    # Subtest: requestMenu
        # Subtest: should ensure popover, close others, and open the requested one
        ok 1 - should ensure popover, close others, and open the requested one
          ---
          duration_ms: 2.271289
          type: 'test'
          ...
        # Subtest: should close the popover if it is already open
        ok 2 - should close the popover if it is already open
          ---
          duration_ms: 0.828928
          type: 'test'
          ...
        1..2
    ok 2 - requestMenu
      ---
      duration_ms: 3.598337
      type: 'suite'
      ...
    # Subtest: handleMenuAction
        # Subtest: should call service method and notify update
        ok 1 - should call service method and notify update
          ---
          duration_ms: 1.002806
          type: 'test'
          ...
        # Subtest: should handle error and call showError
        ok 2 - should handle error and call showError
          ---
          duration_ms: 1.610765
          type: 'test'
          ...
        1..2
    ok 3 - handleMenuAction
      ---
      duration_ms: 3.229053
      type: 'suite'
      ...
    # Subtest: persistPreferencesFromMenu
        # Subtest: should call service.publish
        ok 1 - should call service.publish
          ---
          duration_ms: 1.081546
          type: 'test'
          ...
        # Subtest: should reuse in-flight promise
        ok 2 - should reuse in-flight promise
          ---
          duration_ms: 0.841621
          type: 'test'
          ...
        1..2
    ok 4 - persistPreferencesFromMenu
      ---
      duration_ms: 2.304956
      type: 'suite'
      ...
    1..4
ok 1 - TagPreferenceMenuController
  ---
  duration_ms: 18.698564
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
# duration_ms 48.476053

→ Running tests/ui/torrentStatusController.test.mjs
TAP version 13
# Subtest: TorrentStatusController throws if accessor is missing
ok 1 - TorrentStatusController throws if accessor is missing
  ---
  duration_ms: 2.165513
  type: 'test'
  ...
# Subtest: TorrentStatusController updates video modal and calls onRemovePoster
ok 2 - TorrentStatusController updates video modal and calls onRemovePoster
  ---
  duration_ms: 0.967149
  type: 'test'
  ...
# Subtest: TorrentStatusController handles missing modal gracefully
ok 3 - TorrentStatusController handles missing modal gracefully
  ---
  duration_ms: 0.414692
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
# duration_ms 24.284827

→ Running tests/ui/uploadModal-integration.test.mjs
TAP version 13
# Subtest: UploadModal Integration
    # Subtest: should detect default R2 connection and show summary when loaded and unlocked
    ok 1 - should detect default R2 connection and show summary when loaded and unlocked
      ---
      duration_ms: 61.107754
      type: 'test'
      ...
    # Subtest: should handle locked state and unlock flow
    ok 2 - should handle locked state and unlock flow
      ---
      duration_ms: 36.16853
      type: 'test'
      ...
    1..2
ok 1 - UploadModal Integration
  ---
  duration_ms: 12370.197962
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
# duration_ms 12381.565964

→ Running tests/ui/uploadModal-reset.test.mjs
TAP version 13
# Subtest: UploadModal Reset Logic
    # Subtest: should reset upload state and inputs when resetUploads is called
    ok 1 - should reset upload state and inputs when resetUploads is called
      ---
      duration_ms: 83.152118
      type: 'test'
      ...
    # Subtest: should guard against zombie callbacks when upload is reset during process
    ok 2 - should guard against zombie callbacks when upload is reset during process
      ---
      duration_ms: 41.672484
      type: 'test'
      ...
    # Subtest: should call resetUploads when close is called
    ok 3 - should call resetUploads when close is called
      ---
      duration_ms: 24.303516
      type: 'test'
      ...
    1..3
ok 1 - UploadModal Reset Logic
  ---
  duration_ms: 12422.28384
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
# duration_ms 12437.167684

→ Running tests/ui/url-health-controller.test.mjs
TAP version 13
# Subtest: UrlHealthController
    # Subtest: probeUrl returns ok for valid URL
    ok 1 - probeUrl returns ok for valid URL
      ---
      duration_ms: 150.299423
      type: 'test'
      ...
    # Subtest: probeUrl returns error for 404
    ok 2 - probeUrl returns error for 404
      ---
      duration_ms: 27.114937
      type: 'test'
      ...
    # Subtest: handleUrlHealthBadge updates badge
    ok 3 - handleUrlHealthBadge updates badge
      ---
      duration_ms: 167.975432
      type: 'test'
      ...
    # Subtest: getUrlHealthPlaceholderMarkup returns string
    ok 4 - getUrlHealthPlaceholderMarkup returns string
      ---
      duration_ms: 10.808902
      type: 'test'
      ...
    1..4
ok 1 - UrlHealthController
  ---
  duration_ms: 358.755468
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
# duration_ms 371.921268

→ Running tests/ui/video-list-view-popular-tags.test.mjs
TAP version 13
# Subtest: VideoListView renders sorted popular tag pills
ok 1 - VideoListView renders sorted popular tag pills
  ---
  duration_ms: 156.151119
  type: 'test'
  ...
# Subtest: VideoListView applies tag preference variants to popular tags
ok 2 - VideoListView applies tag preference variants to popular tags
  ---
  duration_ms: 27.045759
  type: 'test'
  ...
# Subtest: VideoListView hides popular tags when no tags are available
ok 3 - VideoListView hides popular tags when no tags are available
  ---
  duration_ms: 16.797573
  type: 'test'
  ...
# Subtest: VideoListView setModerationBlockHandler stores callable
ok 4 - VideoListView setModerationBlockHandler stores callable
  ---
  duration_ms: 9.381039
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
# duration_ms 223.019123

→ Running tests/ui/video-list-view-sorting.test.mjs
TAP version 13
# Subtest: VideoListView sorts cards by original posted timestamp
ok 1 - VideoListView sorts cards by original posted timestamp
  ---
  duration_ms: 138.790977
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
# duration_ms 155.161041

→ Running tests/unit/app_guard_logic.test.mjs
TAP version 13
# Subtest: Application.resetTorrentStats logic
    # Subtest: does not throw when videoModal is null
    ok 1 - does not throw when videoModal is null
      ---
      duration_ms: 0.930404
      type: 'test'
      ...
    # Subtest: does not throw when videoModal is undefined
    ok 2 - does not throw when videoModal is undefined
      ---
      duration_ms: 0.216976
      type: 'test'
      ...
    # Subtest: does not throw when videoModal lacks resetStats
    ok 3 - does not throw when videoModal lacks resetStats
      ---
      duration_ms: 0.27021
      type: 'test'
      ...
    # Subtest: calls resetStats when available
    ok 4 - calls resetStats when available
      ---
      duration_ms: 0.320758
      type: 'test'
      ...
    1..4
ok 1 - Application.resetTorrentStats logic
  ---
  duration_ms: 5.060913
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
# duration_ms 17.53493

→ Running tests/unit/client-count-resilience.test.mjs
TAP version 13
# Subtest: NostrClient resilience to COUNT timeouts
ok 1 - NostrClient resilience to COUNT timeouts
  ---
  duration_ms: 3408.870883
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
# duration_ms 3416.632474

→ Running tests/unit/comment-avatar.test.mjs
TAP version 13
# Subtest: normalizeCommentAvatarKey handles inputs correctly
ok 1 - normalizeCommentAvatarKey handles inputs correctly
  ---
  duration_ms: 1.479206
  type: 'test'
  ...
# Subtest: resolveCommentAvatarAsset resolves avatars correctly
ok 2 - resolveCommentAvatarAsset resolves avatars correctly
  ---
  duration_ms: 3.251655
  type: 'test'
  ...
# Subtest: registerCommentAvatarFailure registers failures correctly
ok 3 - registerCommentAvatarFailure registers failures correctly
  ---
  duration_ms: 0.589599
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
# duration_ms 20.25331

→ Running tests/unit/editModalController.test.mjs
TAP version 13
# Subtest: EditModalController
    # Subtest: open()
        # Subtest: should resolve target and open modal if authorized
        ok 1 - should resolve target and open modal if authorized
          ---
          duration_ms: 2.368792
          type: 'test'
          ...
        # Subtest: should show error if not logged in
        ok 2 - should show error if not logged in
          ---
          duration_ms: 0.933867
          type: 'test'
          ...
        # Subtest: should show error if user does not own video
        ok 3 - should show error if user does not own video
          ---
          duration_ms: 0.583831
          type: 'test'
          ...
        # Subtest: should handle modal load errors
        ok 4 - should handle modal load errors
          ---
          duration_ms: 0.934426
          type: 'test'
          ...
        1..4
    ok 1 - open()
      ---
      duration_ms: 5.927287
      type: 'suite'
      ...
    # Subtest: handleSubmit()
        # Subtest: should handle successful submission
        ok 1 - should handle successful submission
          ---
          duration_ms: 1.047095
          type: 'test'
          ...
        # Subtest: should show error if not logged in
        ok 2 - should show error if not logged in
          ---
          duration_ms: 0.587543
          type: 'test'
          ...
        # Subtest: should handle submission errors
        ok 3 - should handle submission errors
          ---
          duration_ms: 1.522197
          type: 'test'
          ...
        1..3
    ok 2 - handleSubmit()
      ---
      duration_ms: 3.85583
      type: 'suite'
      ...
    1..2
ok 1 - EditModalController
  ---
  duration_ms: 10.667945
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
# duration_ms 31.494605

→ Running tests/unit/embed_player_modal.test.mjs
TAP version 13
# Subtest: EmbedPlayerModal interface
    # Subtest: has expected methods
    ok 1 - has expected methods
      ---
      duration_ms: 2.95981
      type: 'test'
      ...
    # Subtest: resetStats is no-op and does not throw
    ok 2 - resetStats is no-op and does not throw
      ---
      duration_ms: 0.437683
      type: 'test'
      ...
    1..2
ok 1 - EmbedPlayerModal interface
  ---
  duration_ms: 5.313972
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
# duration_ms 20.060005

→ Running tests/unit/embed-accent.test.mjs
TAP version 13
# Subtest: embed accent color configuration
ok 1 - embed accent color configuration
  ---
  duration_ms: 1.762611
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
# duration_ms 15.709864

→ Running tests/unit/hashChangeHandler.test.mjs
TAP version 13
# Subtest: createHashChangeHandler
    # Subtest: loads default view if hash is empty
    ok 1 - loads default view if hash is empty
      ---
      duration_ms: 1.17776
      type: 'test'
      ...
    # Subtest: redirects legacy view
    ok 2 - redirects legacy view
      ---
      duration_ms: 0.263396
      type: 'test'
      ...
    # Subtest: skips redundant reload
    ok 3 - skips redundant reload
      ---
      duration_ms: 0.343289
      type: 'test'
      ...
    1..3
ok 1 - createHashChangeHandler
  ---
  duration_ms: 3.588934
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
# duration_ms 15.587802

→ Running tests/unit/notificationController.test.mjs
TAP version 13
# Subtest: NotificationController
    # Subtest: should instantiate correctly
    ok 1 - should instantiate correctly
      ---
      duration_ms: 2.542451
      type: 'test'
      ...
    # Subtest: showError should update text content and show container
    ok 2 - showError should update text content and show container
      ---
      duration_ms: 1.011945
      type: 'test'
      ...
    # Subtest: showError should hide container when msg is empty
    ok 3 - showError should hide container when msg is empty
      ---
      duration_ms: 1.199473
      type: 'test'
      ...
    # Subtest: updateNotificationPortalVisibility should toggle active class on portal
    ok 4 - updateNotificationPortalVisibility should toggle active class on portal
      ---
      duration_ms: 0.90115
      type: 'test'
      ...
    # Subtest: showSuccess should update text content and show container
    ok 5 - showSuccess should update text content and show container
      ---
      duration_ms: 0.721851
      type: 'test'
      ...
    # Subtest: showStatus should update text content and show container
    ok 6 - showStatus should update text content and show container
      ---
      duration_ms: 0.830914
      type: 'test'
      ...
    # Subtest: showStatus should handle spinner option
    ok 7 - showStatus should handle spinner option
      ---
      duration_ms: 0.74581
      type: 'test'
      ...
    1..7
ok 1 - NotificationController
  ---
  duration_ms: 9.754476
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
# duration_ms 27.153291

→ Running tests/unit/searchFilters.test.mjs
TAP version 13
# Subtest: parseFilterQuery collects filters and text tokens
ok 1 - parseFilterQuery collects filters and text tokens
  ---
  duration_ms: 4.702813
  type: 'test'
  ...
# Subtest: serializeFiltersToQuery emits filter tokens in order
ok 2 - serializeFiltersToQuery emits filter tokens in order
  ---
  duration_ms: 0.547077
  type: 'test'
  ...
# Subtest: video search filter matcher enforces tags, duration, and nsfw when allowed
ok 3 - video search filter matcher enforces tags, duration, and nsfw when allowed
  ---
  duration_ms: 0.759625
  type: 'test'
  ...
# Subtest: video search filter matcher blocks nsfw when disallowed and requires url
ok 4 - video search filter matcher blocks nsfw when disallowed and requires url
  ---
  duration_ms: 0.364788
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
# duration_ms 26.700921

→ Running tests/unit/security-config.test.mjs
TAP version 13
# Subtest: Security configuration: Development mode should be disabled in production
ok 1 - Security configuration: Development mode should be disabled in production
  ---
  duration_ms: 2.947533
  type: 'test'
  ...
# Subtest: Security configuration: Verbose diagnostics should be disabled in production
ok 2 - Security configuration: Verbose diagnostics should be disabled in production
  ---
  duration_ms: 0.243819
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
# duration_ms 15.148989

→ Running tests/unit/services/moderationDecorator.test.mjs
TAP version 13
# Subtest: ModerationDecorator
    # Subtest: deriveModerationReportType
        # Subtest: should return empty string for null summary
        ok 1 - should return empty string for null summary
          ---
          duration_ms: 2.649294
          type: 'test'
          ...
        # Subtest: should return empty string for empty types
        ok 2 - should return empty string for empty types
          ---
          duration_ms: 0.261682
          type: 'test'
          ...
        # Subtest: should return the type with highest trusted count
        ok 3 - should return the type with highest trusted count
          ---
          duration_ms: 0.38577
          type: 'test'
          ...
        1..3
    ok 1 - deriveModerationReportType
      ---
      duration_ms: 5.522071
      type: 'suite'
      ...
    # Subtest: deriveModerationTrustedCount
        # Subtest: should return trusted count for specific type
        ok 1 - should return trusted count for specific type
          ---
          duration_ms: 0.968826
          type: 'test'
          ...
        # Subtest: should fall back to totalTrusted if type not found
        ok 2 - should fall back to totalTrusted if type not found
          ---
          duration_ms: 0.338469
          type: 'test'
          ...
        1..2
    ok 2 - deriveModerationTrustedCount
      ---
      duration_ms: 1.803571
      type: 'suite'
      ...
    # Subtest: getReporterDisplayName
        # Subtest: should return name from cache if available
        ok 1 - should return name from cache if available
          ---
          duration_ms: 0.591911
          type: 'test'
          ...
        # Subtest: should return short formatted string if not in cache
        ok 2 - should return short formatted string if not in cache
          ---
          duration_ms: 1.401139
          type: 'test'
          ...
        1..2
    ok 3 - getReporterDisplayName
      ---
      duration_ms: 2.783754
      type: 'suite'
      ...
    # Subtest: decorateVideo
        # Subtest: should return the video object if input is invalid
        ok 1 - should return the video object if input is invalid
          ---
          duration_ms: 0.783426
          type: 'test'
          ...
        # Subtest: should decorate video with basic moderation
        ok 2 - should decorate video with basic moderation
          ---
          duration_ms: 0.674775
          type: 'test'
          ...
        # Subtest: should flag video as hidden if trusted mute count exceeds threshold
        ok 3 - should flag video as hidden if trusted mute count exceeds threshold
          ---
          duration_ms: 0.741715
          type: 'test'
          ...
        1..3
    ok 4 - decorateVideo
      ---
      duration_ms: 2.713984
      type: 'suite'
      ...
    # Subtest: updateSettings
        # Subtest: should update moderation settings and affect decoration
        ok 1 - should update moderation settings and affect decoration
          ---
          duration_ms: 0.793642
          type: 'test'
          ...
        1..1
    ok 5 - updateSettings
      ---
      duration_ms: 1.143038
      type: 'suite'
      ...
    1..5
ok 1 - ModerationDecorator
  ---
  duration_ms: 16.986325
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
# duration_ms 69.457961

→ Running tests/unit/services/r2Service.storage-config.test.mjs
TAP version 13
[bitvid] [R2] Verifying access for Bucket: 'r2-meta-bucket' in Account: 'acc…23'
# Subtest: R2Service bucket selection
    # Subtest: uses meta.bucket for ensureBucketExists and multipartUpload
    ok 1 - uses meta.bucket for ensureBucketExists and multipartUpload
      ---
      duration_ms: 43.735746
      type: 'test'
      ...
    # Subtest: uses configured meta.bucket when verifying public access
    ok 2 - uses configured meta.bucket when verifying public access
      ---
      duration_ms: 2.982042
      type: 'test'
      ...
    1..2
ok 1 - R2Service bucket selection
  ---
  duration_ms: 49.085707
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
# duration_ms 64.627253

→ Running tests/utils/cardSourceVisibility.test.mjs
TAP version 13
# Subtest: cardSourceVisibility
    # Subtest: updateVideoCardSourceVisibility
        # Subtest: should handle null or undefined input gracefully
        ok 1 - should handle null or undefined input gracefully
          ---
          duration_ms: 10.15611
          type: 'test'
          ...
        # Subtest: should resolve card from object with .card property
        ok 2 - should resolve card from object with .card property
          ---
          duration_ms: 4.146076
          type: 'test'
          ...
        # Subtest: should always show card if owner is viewer
        ok 3 - should always show card if owner is viewer
          ---
          duration_ms: 4.451908
          type: 'test'
          ...
        # Subtest: should show card if at least one source is healthy
        ok 4 - should show card if at least one source is healthy
          ---
          duration_ms: 4.4794
          type: 'test'
          ...
        # Subtest: should show card if at least one source is checking/pending
        ok 5 - should show card if at least one source is checking/pending
          ---
          duration_ms: 3.063519
          type: 'test'
          ...
        # Subtest: should hide card ONLY if both sources are failed (not healthy and not pending)
        ok 6 - should hide card ONLY if both sources are failed (not healthy and not pending)
          ---
          duration_ms: 2.131681
          type: 'test'
          ...
        # Subtest: should recover from hidden state when source becomes healthy
        ok 7 - should recover from hidden state when source becomes healthy
          ---
          duration_ms: 1.610826
          type: 'test'
          ...
        # Subtest: should check closest .card if element is not .card itself
        ok 8 - should check closest .card if element is not .card itself
          ---
          duration_ms: 13.385383
          type: 'test'
          ...
        1..8
    ok 1 - updateVideoCardSourceVisibility
      ---
      duration_ms: 45.973406
      type: 'suite'
      ...
    1..1
ok 1 - cardSourceVisibility
  ---
  duration_ms: 47.480136
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
# duration_ms 86.519459

→ Running tests/utils/domUtils.test.mjs
TAP version 13
# Subtest: domUtils
    # Subtest: escapeHTML
        # Subtest: should return empty string for null or undefined
        ok 1 - should return empty string for null or undefined
          ---
          duration_ms: 3.173139
          type: 'test'
          ...
        # Subtest: should return the string as is if no special characters are present
        ok 2 - should return the string as is if no special characters are present
          ---
          duration_ms: 0.591172
          type: 'test'
          ...
        # Subtest: should escape special characters
        ok 3 - should escape special characters
          ---
          duration_ms: 0.72455
          type: 'test'
          ...
        # Subtest: should escape multiple occurrences of special characters
        ok 4 - should escape multiple occurrences of special characters
          ---
          duration_ms: 0.650133
          type: 'test'
          ...
        # Subtest: should handle mixed content correctly
        ok 5 - should handle mixed content correctly
          ---
          duration_ms: 0.542577
          type: 'test'
          ...
        # Subtest: should convert non-string inputs to string and escape
        ok 6 - should convert non-string inputs to string and escape
          ---
          duration_ms: 0.451401
          type: 'test'
          ...
        1..6
    ok 1 - escapeHTML
      ---
      duration_ms: 8.884011
      type: 'suite'
      ...
    # Subtest: removeTrackingScripts
        # Subtest: should do nothing if root is null or undefined
        ok 1 - should do nothing if root is null or undefined
          ---
          duration_ms: 1.051212
          type: 'test'
          ...
        # Subtest: should do nothing if root has no querySelectorAll
        ok 2 - should do nothing if root has no querySelectorAll
          ---
          duration_ms: 1.027993
          type: 'test'
          ...
        # Subtest: should remove scripts matching the tracking pattern
        ok 3 - should remove scripts matching the tracking pattern
          ---
          duration_ms: 45.912373
          type: 'test'
          ...
        # Subtest: should not remove inline scripts (no src)
        ok 4 - should not remove inline scripts (no src)
          ---
          duration_ms: 6.053008
          type: 'test'
          ...
        # Subtest: should remove scripts where src ends with tracking.js
        ok 5 - should remove scripts where src ends with tracking.js
          ---
          duration_ms: 3.01539
          type: 'test'
          ...
        # Subtest: should remove scripts where src contains /tracking.js
        ok 6 - should remove scripts where src contains /tracking.js
          ---
          duration_ms: 2.273536
          type: 'test'
          ...
        1..6
    ok 2 - removeTrackingScripts
      ---
      duration_ms: 60.976738
      type: 'suite'
      ...
    1..2
ok 1 - domUtils
  ---
  duration_ms: 72.148862
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
# duration_ms 123.743214

→ Running tests/utils/hex.test.mjs
TAP version 13
# Subtest: hex utils
    # Subtest: normalizeHexString
        # Subtest: should return empty string for non-string inputs
        ok 1 - should return empty string for non-string inputs
          ---
          duration_ms: 1.212781
          type: 'test'
          ...
        # Subtest: should return empty string for empty or whitespace-only strings
        ok 2 - should return empty string for empty or whitespace-only strings
          ---
          duration_ms: 0.387299
          type: 'test'
          ...
        # Subtest: should trim and lowercase valid hex strings
        ok 3 - should trim and lowercase valid hex strings
          ---
          duration_ms: 0.329546
          type: 'test'
          ...
        1..3
    ok 1 - normalizeHexString
      ---
      duration_ms: 3.244131
      type: 'suite'
      ...
    # Subtest: aliases
        # Subtest: should export normalizeHexId as an alias
        ok 1 - should export normalizeHexId as an alias
          ---
          duration_ms: 0.348393
          type: 'test'
          ...
        # Subtest: should export normalizeHexPubkey as an alias
        ok 2 - should export normalizeHexPubkey as an alias
          ---
          duration_ms: 0.211949
          type: 'test'
          ...
        1..2
    ok 2 - aliases
      ---
      duration_ms: 1.004396
      type: 'suite'
      ...
    # Subtest: HEX64_REGEX
        # Subtest: should match valid 64-character hex strings
        ok 1 - should match valid 64-character hex strings
          ---
          duration_ms: 0.859454
          type: 'test'
          ...
        # Subtest: should not match strings with incorrect length
        ok 2 - should not match strings with incorrect length
          ---
          duration_ms: 0.811547
          type: 'test'
          ...
        # Subtest: should not match strings with non-hex characters
        ok 3 - should not match strings with non-hex characters
          ---
          duration_ms: 0.452324
          type: 'test'
          ...
        # Subtest: should not match empty strings
        ok 4 - should not match empty strings
          ---
          duration_ms: 0.458017
          type: 'test'
          ...
        1..4
    ok 3 - HEX64_REGEX
      ---
      duration_ms: 3.932372
      type: 'suite'
      ...
    # Subtest: normalizeHexHash
        # Subtest: should return empty string for non-string inputs
        ok 1 - should return empty string for non-string inputs
          ---
          duration_ms: 0.60087
          type: 'test'
          ...
        # Subtest: should return empty string for invalid hex
        ok 2 - should return empty string for invalid hex
          ---
          duration_ms: 0.258261
          type: 'test'
          ...
        # Subtest: should return normalized hex for valid inputs
        ok 3 - should return normalized hex for valid inputs
          ---
          duration_ms: 0.221216
          type: 'test'
          ...
        1..3
    ok 4 - normalizeHexHash
      ---
      duration_ms: 1.587204
      type: 'suite'
      ...
    1..4
ok 1 - hex utils
  ---
  duration_ms: 11.457269
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
# duration_ms 149.499234

→ Running tests/utils/linkPreviewSettings.test.mjs
TAP version 13
# Subtest: linkPreviewSettings
    # Subtest: getLinkPreviewSettings
        # Subtest: returns defaults when storage is empty
        ok 1 - returns defaults when storage is empty
          ---
          duration_ms: 8.07037
          type: 'test'
          ...
        # Subtest: returns stored settings
        ok 2 - returns stored settings
          ---
          duration_ms: 6.124711
          type: 'test'
          ...
        # Subtest: returns defaults when storage is invalid
        ok 3 - returns defaults when storage is invalid
          ---
          duration_ms: 3.145477
          type: 'test'
          ...
        # Subtest: sanitizes settings from storage
        ok 4 - sanitizes settings from storage
          ---
          duration_ms: 1.913814
          type: 'test'
          ...
        1..4
    ok 1 - getLinkPreviewSettings
      ---
      duration_ms: 22.472646
      type: 'suite'
      ...
    # Subtest: setLinkPreviewAutoFetch
        # Subtest: updates settings and persists to storage
        ok 1 - updates settings and persists to storage
          ---
          duration_ms: 3.07489
          type: 'test'
          ...
        # Subtest: emits an event on change
        ok 2 - emits an event on change
          ---
          duration_ms: 3.592867
          type: 'test'
          ...
        1..2
    ok 2 - setLinkPreviewAutoFetch
      ---
      duration_ms: 7.766656
      type: 'suite'
      ...
    # Subtest: allowLinkPreviewDomain
        # Subtest: adds a domain and persists to storage
        ok 1 - adds a domain and persists to storage
          ---
          duration_ms: 2.355605
          type: 'test'
          ...
        # Subtest: handles duplicates
        ok 2 - handles duplicates
          ---
          duration_ms: 1.519101
          type: 'test'
          ...
        # Subtest: normalizes domains
        ok 3 - normalizes domains
          ---
          duration_ms: 1.804789
          type: 'test'
          ...
        # Subtest: emits an event on change
        ok 4 - emits an event on change
          ---
          duration_ms: 1.559698
          type: 'test'
          ...
        # Subtest: respects silent option
        ok 5 - respects silent option
          ---
          duration_ms: 1.171279
          type: 'test'
          ...
        1..5
    ok 3 - allowLinkPreviewDomain
      ---
      duration_ms: 9.891335
      type: 'suite'
      ...
    # Subtest: isLinkPreviewDomainAllowed
        # Subtest: returns true for allowed domains
        ok 1 - returns true for allowed domains
          ---
          duration_ms: 1.599085
          type: 'test'
          ...
        # Subtest: returns false for disallowed domains
        ok 2 - returns false for disallowed domains
          ---
          duration_ms: 0.806145
          type: 'test'
          ...
        # Subtest: handles normalization
        ok 3 - handles normalization
          ---
          duration_ms: 1.757453
          type: 'test'
          ...
        # Subtest: accepts settings object as second argument
        ok 4 - accepts settings object as second argument
          ---
          duration_ms: 0.871044
          type: 'test'
          ...
        1..4
    ok 4 - isLinkPreviewDomainAllowed
      ---
      duration_ms: 5.615777
      type: 'suite'
      ...
    # Subtest: subscribeToLinkPreviewSettings
        # Subtest: calls callback on event emission
        ok 1 - calls callback on event emission
          ---
          duration_ms: 1.860538
          type: 'test'
          ...
        # Subtest: unsubscribes correctly
        ok 2 - unsubscribes correctly
          ---
          duration_ms: 1.653955
          type: 'test'
          ...
        1..2
    ok 5 - subscribeToLinkPreviewSettings
      ---
      duration_ms: 4.058824
      type: 'suite'
      ...
    1..5
ok 1 - linkPreviewSettings
  ---
  duration_ms: 53.033594
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
# duration_ms 145.499879

→ Running tests/utils/lruCache.test.mjs
TAP version 13
# Subtest: LRUCache
    # Subtest: should initialize with default options
    ok 1 - should initialize with default options
      ---
      duration_ms: 2.46741
      type: 'test'
      ...
    # Subtest: should store and retrieve values
    ok 2 - should store and retrieve values
      ---
      duration_ms: 0.742415
      type: 'test'
      ...
    # Subtest: should evict oldest item when limit is reached
    ok 3 - should evict oldest item when limit is reached
      ---
      duration_ms: 0.57686
      type: 'test'
      ...
    # Subtest: should refresh recency on access
    ok 4 - should refresh recency on access
      ---
      duration_ms: 0.729564
      type: 'test'
      ...
    # Subtest: should update value and refresh recency on set
    ok 5 - should update value and refresh recency on set
      ---
      duration_ms: 1.69153
      type: 'test'
      ...
    # Subtest: should track stats
    ok 6 - should track stats
      ---
      duration_ms: 0.915031
      type: 'test'
      ...
    # Subtest: should clear cache
    ok 7 - should clear cache
      ---
      duration_ms: 1.044199
      type: 'test'
      ...
    1..7
ok 1 - LRUCache
  ---
  duration_ms: 11.892023
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
# duration_ms 53.108251

→ Running tests/utils/profileMedia.test.mjs
TAP version 13
# Subtest: sanitizeProfileMediaUrl handles non-string inputs
ok 1 - sanitizeProfileMediaUrl handles non-string inputs
  ---
  duration_ms: 6.394144
  type: 'test'
  ...
# Subtest: sanitizeProfileMediaUrl handles empty or whitespace-only strings
ok 2 - sanitizeProfileMediaUrl handles empty or whitespace-only strings
  ---
  duration_ms: 0.922853
  type: 'test'
  ...
# Subtest: sanitizeProfileMediaUrl trims whitespace and removes quotes
ok 3 - sanitizeProfileMediaUrl trims whitespace and removes quotes
  ---
  duration_ms: 1.997207
  type: 'test'
  ...
# Subtest: sanitizeProfileMediaUrl allows data:image/ URLs
ok 4 - sanitizeProfileMediaUrl allows data:image/ URLs
  ---
  duration_ms: 0.259834
  type: 'test'
  ...
# Subtest: sanitizeProfileMediaUrl allows blob: URLs
ok 5 - sanitizeProfileMediaUrl allows blob: URLs
  ---
  duration_ms: 0.435485
  type: 'test'
  ...
# Subtest: sanitizeProfileMediaUrl rejects specific placeholder images
ok 6 - sanitizeProfileMediaUrl rejects specific placeholder images
  ---
  duration_ms: 0.875293
  type: 'test'
  ...
# Subtest: sanitizeProfileMediaUrl normalizes IPFS URLs
ok 7 - sanitizeProfileMediaUrl normalizes IPFS URLs
  ---
  duration_ms: 0.92166
  type: 'test'
  ...
# Subtest: sanitizeProfileMediaUrl handles protocol-relative URLs
ok 8 - sanitizeProfileMediaUrl handles protocol-relative URLs
  ---
  duration_ms: 0.472034
  type: 'test'
  ...
# Subtest: sanitizeProfileMediaUrl allows relative paths
ok 9 - sanitizeProfileMediaUrl allows relative paths
  ---
  duration_ms: 1.593339
  type: 'test'
  ...
# Subtest: sanitizeProfileMediaUrl adds protocol to domains and localhost
ok 10 - sanitizeProfileMediaUrl adds protocol to domains and localhost
  ---
  duration_ms: 6.155292
  type: 'test'
  ...
# Subtest: sanitizeProfileMediaUrl coerces http to https except for localhost
ok 11 - sanitizeProfileMediaUrl coerces http to https except for localhost
  ---
  duration_ms: 0.83314
  type: 'test'
  ...
# Subtest: sanitizeProfileMediaUrl rejects unsupported patterns
ok 12 - sanitizeProfileMediaUrl rejects unsupported patterns
  ---
  duration_ms: 1.642051
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
# duration_ms 83.833972

→ Running tests/utils/video-deduper.test.mjs
TAP version 13
# Subtest: dedupeToNewestByRoot replaces entries with missing timestamps
ok 1 - dedupeToNewestByRoot replaces entries with missing timestamps
  ---
  duration_ms: 1.93055
  type: 'test'
  ...
# Subtest: dedupeToNewestByRoot replaces entries with non-numeric timestamps
ok 2 - dedupeToNewestByRoot replaces entries with non-numeric timestamps
  ---
  duration_ms: 0.50934
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
# duration_ms 35.45038

→ Running tests/utils/video-tags.test.mjs
TAP version 13
# Subtest: collectVideoTags dedupes across metadata sources and respects casing
ok 1 - collectVideoTags dedupes across metadata sources and respects casing
  ---
  duration_ms: 50.065595
  type: 'test'
  ...
# Subtest: collectVideoTags sorts case-insensitively and adds hashes when requested
ok 2 - collectVideoTags sorts case-insensitively and adds hashes when requested
  ---
  duration_ms: 1.037089
  type: 'test'
  ...
# Subtest: collectVideoTags handles malformed inputs safely
ok 3 - collectVideoTags handles malformed inputs safely
  ---
  duration_ms: 0.917817
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
# duration_ms 89.318014

→ Running tests/utils/videoPointer.test.mjs
TAP version 13
# Subtest: resolveVideoPointer returns address pointer with dTag
ok 1 - resolveVideoPointer returns address pointer with dTag
  ---
  duration_ms: 5.311131
  type: 'test'
  ...
# Subtest: resolveVideoPointer returns address pointer with videoRootId
ok 2 - resolveVideoPointer returns address pointer with videoRootId
  ---
  duration_ms: 1.062901
  type: 'test'
  ...
# Subtest: resolveVideoPointer returns event pointer with fallbackEventId
ok 3 - resolveVideoPointer returns event pointer with fallbackEventId
  ---
  duration_ms: 0.529458
  type: 'test'
  ...
# Subtest: resolveVideoPointer prioritizes dTag over videoRootId
ok 4 - resolveVideoPointer prioritizes dTag over videoRootId
  ---
  duration_ms: 0.392056
  type: 'test'
  ...
# Subtest: resolveVideoPointer prioritizes videoRootId over fallbackEventId
ok 5 - resolveVideoPointer prioritizes videoRootId over fallbackEventId
  ---
  duration_ms: 0.484548
  type: 'test'
  ...
# Subtest: resolveVideoPointer prioritizes dTag over fallbackEventId
ok 6 - resolveVideoPointer prioritizes dTag over fallbackEventId
  ---
  duration_ms: 0.524102
  type: 'test'
  ...
# Subtest: resolveVideoPointer includes relay in pointer
ok 7 - resolveVideoPointer includes relay in pointer
  ---
  duration_ms: 1.02341
  type: 'test'
  ...
# Subtest: resolveVideoPointer normalizes inputs
ok 8 - resolveVideoPointer normalizes inputs
  ---
  duration_ms: 0.684408
  type: 'test'
  ...
# Subtest: resolveVideoPointer uses default kind when kind is missing or invalid
ok 9 - resolveVideoPointer uses default kind when kind is missing or invalid
  ---
  duration_ms: 2.052097
  type: 'test'
  ...
# Subtest: resolveVideoPointer returns null for invalid inputs
ok 10 - resolveVideoPointer returns null for invalid inputs
  ---
  duration_ms: 1.662151
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
# duration_ms 63.974409

→ Running tests/utils/videoTimestamps.test.mjs
TAP version 13
# Subtest: getVideoRootIdentifier
    # Subtest: returns empty string for invalid inputs
    ok 1 - returns empty string for invalid inputs
      ---
      duration_ms: 6.934403
      type: 'test'
      ...
    # Subtest: returns videoRootId when present
    ok 2 - returns videoRootId when present
      ---
      duration_ms: 1.123935
      type: 'test'
      ...
    # Subtest: returns id when videoRootId is missing
    ok 3 - returns id when videoRootId is missing
      ---
      duration_ms: 0.968867
      type: 'test'
      ...
    # Subtest: returns id when videoRootId is not a string
    ok 4 - returns id when videoRootId is not a string
      ---
      duration_ms: 0.933025
      type: 'test'
      ...
    1..4
ok 1 - getVideoRootIdentifier
  ---
  duration_ms: 16.694554
  type: 'test'
  ...
# Subtest: applyRootTimestampToVideosMap
    # Subtest: returns early if videosMap is not a Map
    ok 1 - returns early if videosMap is not a Map
      ---
      duration_ms: 1.26907
      type: 'test'
      ...
    # Subtest: updates rootCreatedAt for matching video ID
    ok 2 - updates rootCreatedAt for matching video ID
      ---
      duration_ms: 0.874187
      type: 'test'
      ...
    # Subtest: updates rootCreatedAt for other videos with same rootId
    ok 3 - updates rootCreatedAt for other videos with same rootId
      ---
      duration_ms: 1.32399
      type: 'test'
      ...
    # Subtest: skips invalid stored objects in map
    ok 4 - skips invalid stored objects in map
      ---
      duration_ms: 1.352556
      type: 'test'
      ...
    1..4
ok 2 - applyRootTimestampToVideosMap
  ---
  duration_ms: 10.784936
  type: 'test'
  ...
# Subtest: syncActiveVideoRootTimestamp
    # Subtest: returns false for invalid timestamp
    ok 1 - returns false for invalid timestamp
      ---
      duration_ms: 1.363772
      type: 'test'
      ...
    # Subtest: returns false for invalid activeVideo
    ok 2 - returns false for invalid activeVideo
      ---
      duration_ms: 0.529702
      type: 'test'
      ...
    # Subtest: returns false if activeVideo has no root identifier
    ok 3 - returns false if activeVideo has no root identifier
      ---
      duration_ms: 0.514563
      type: 'test'
      ...
    # Subtest: returns false if rootId mismatch
    ok 4 - returns false if rootId mismatch
      ---
      duration_ms: 0.920036
      type: 'test'
      ...
    # Subtest: returns false if timestamp already matches
    ok 5 - returns false if timestamp already matches
      ---
      duration_ms: 0.449004
      type: 'test'
      ...
    # Subtest: updates activeVideo and displayTags
    ok 6 - updates activeVideo and displayTags
      ---
      duration_ms: 1.560979
      type: 'test'
      ...
    # Subtest: calls videoModal.updateMetadata if provided
    ok 7 - calls videoModal.updateMetadata if provided
      ---
      duration_ms: 0.489963
      type: 'test'
      ...
    1..7
ok 3 - syncActiveVideoRootTimestamp
  ---
  duration_ms: 9.074519
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
# duration_ms 122.290853

→ Running tests/validate-config.test.mjs
TAP version 13
# Subtest: validateInstanceConfig succeeds with valid configuration
ok 1 - validateInstanceConfig succeeds with valid configuration
  ---
  duration_ms: 6.128733
  type: 'test'
  ...
# Subtest: validateInstanceConfig throws when platform fee is positive without a platform override
ok 2 - validateInstanceConfig throws when platform fee is positive without a platform override
  ---
  duration_ms: 2.974546
  type: 'test'
  ...
# Subtest: validateInstanceConfig throws when ADMIN_SUPER_NPUB is empty
ok 3 - validateInstanceConfig throws when ADMIN_SUPER_NPUB is empty
  ---
  duration_ms: 1.095738
  type: 'test'
  ...
# Subtest: validateInstanceConfig throws when ADMIN_SUPER_NPUB does not start with npub
ok 4 - validateInstanceConfig throws when ADMIN_SUPER_NPUB does not start with npub
  ---
  duration_ms: 0.711175
  type: 'test'
  ...
# Subtest: validateInstanceConfig throws when PLATFORM_FEE_PERCENT is negative
ok 5 - validateInstanceConfig throws when PLATFORM_FEE_PERCENT is negative
  ---
  duration_ms: 0.584953
  type: 'test'
  ...
# Subtest: validateInstanceConfig throws when PLATFORM_FEE_PERCENT is greater than 100
ok 6 - validateInstanceConfig throws when PLATFORM_FEE_PERCENT is greater than 100
  ---
  duration_ms: 0.792492
  type: 'test'
  ...
# Subtest: validateInstanceConfig throws when PLATFORM_FEE_PERCENT is not finite
ok 7 - validateInstanceConfig throws when PLATFORM_FEE_PERCENT is not finite
  ---
  duration_ms: 0.779622
  type: 'test'
  ...
# Subtest: validateInstanceConfig throws when THEME_ACCENT_OVERRIDES has invalid hex color
ok 8 - validateInstanceConfig throws when THEME_ACCENT_OVERRIDES has invalid hex color
  ---
  duration_ms: 0.882488
  type: 'test'
  ...
# Subtest: validateInstanceConfig throws when THEME_ACCENT_OVERRIDES structure is invalid
ok 9 - validateInstanceConfig throws when THEME_ACCENT_OVERRIDES structure is invalid
  ---
  duration_ms: 1.309166
  type: 'test'
  ...
# Subtest: validateInstanceConfig throws when optional URL is invalid
ok 10 - validateInstanceConfig throws when optional URL is invalid
  ---
  duration_ms: 1.909481
  type: 'test'
  ...
# Subtest: validateInstanceConfig throws when optional URL has invalid protocol
ok 11 - validateInstanceConfig throws when optional URL has invalid protocol
  ---
  duration_ms: 1.02561
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
# duration_ms 89.307555

→ Running tests/video-card-source-visibility.test.mjs
TAP version 13
# Subtest: updateVideoCardSourceVisibility hides non-owner cards without healthy sources and restores visibility
ok 1 - updateVideoCardSourceVisibility hides non-owner cards without healthy sources and restores visibility
  ---
  duration_ms: 220.541193
  type: 'test'
  ...
# Subtest: VideoCard hides cards without playable sources until a healthy CDN update arrives
ok 2 - VideoCard hides cards without playable sources until a healthy CDN update arrives
  ---
  duration_ms: 84.473581
  type: 'test'
  ...
# Subtest: VideoCard.closeMoreMenu only restores focus when the trigger was expanded
ok 3 - VideoCard.closeMoreMenu only restores focus when the trigger was expanded
  ---
  duration_ms: 61.422429
  type: 'test'
  ...
# Subtest: VideoCard.closeSettingsMenu only restores focus when the trigger was expanded
ok 4 - VideoCard.closeSettingsMenu only restores focus when the trigger was expanded
  ---
  duration_ms: 55.015894
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
# duration_ms 472.79833

→ Running tests/video-modal-accessibility.test.mjs
TAP version 13
# Subtest: video modal rehydrates and plays through a connected element across views
ok 1 - video modal rehydrates and plays through a connected element across views
  ---
  duration_ms: 564.019693
  type: 'test'
  ...
# Subtest: torrent-only playback resets the modal video before the next hosted session
ok 2 - torrent-only playback resets the modal video before the next hosted session
  ---
  duration_ms: 34.656875
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
  duration_ms: 760.266179
  type: 'test'
  ...
# Subtest: Escape key closes the modal and returns focus to the trigger
ok 4 - Escape key closes the modal and returns focus to the trigger
  ---
  duration_ms: 320.631564
  type: 'test'
  ...
# Subtest: video modal sticky navigation responds to scroll direction
ok 5 - video modal sticky navigation responds to scroll direction
  ---
  duration_ms: 220.638713
  type: 'test'
  ...
# Subtest: video modal video shell is not sticky at mobile breakpoints
ok 6 - video modal video shell is not sticky at mobile breakpoints
  ---
  duration_ms: 100.800857
  type: 'test'
  ...
# Subtest: video modal toggles document scroll locking on open/close
ok 7 - video modal toggles document scroll locking on open/close
  ---
  duration_ms: 198.692404
  type: 'test'
  ...
# Subtest: video modal comments region exposes aria landmarks and stays in the focus order
ok 8 - video modal comments region exposes aria landmarks and stays in the focus order
  ---
  duration_ms: 226.49954
  type: 'test'
  ...
# Subtest: video modal zap dialog updates aria state while toggling
ok 9 - video modal zap dialog updates aria state while toggling
  ---
  duration_ms: 559.882971
  type: 'test'
  ...
# Subtest: video modal inherits design system mode when loaded dynamically
ok 10 - video modal inherits design system mode when loaded dynamically
  ---
  duration_ms: 77.814584
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
# duration_ms 3088.998282

→ Running tests/video-modal-comments.test.mjs
TAP version 13
# Subtest: video modal rehydrates and plays through a connected element across views
ok 1 - video modal rehydrates and plays through a connected element across views
  ---
  duration_ms: 673.891336
  type: 'test'
  ...
# Subtest: torrent-only playback resets the modal video before the next hosted session
ok 2 - torrent-only playback resets the modal video before the next hosted session
  ---
  duration_ms: 55.667666
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
  duration_ms: 678.816543
  type: 'test'
  ...
# Subtest: Escape key closes the modal and returns focus to the trigger
ok 4 - Escape key closes the modal and returns focus to the trigger
  ---
  duration_ms: 274.944255
  type: 'test'
  ...
# Subtest: video modal sticky navigation responds to scroll direction
ok 5 - video modal sticky navigation responds to scroll direction
  ---
  duration_ms: 229.17407
  type: 'test'
  ...
# Subtest: video modal video shell is not sticky at mobile breakpoints
ok 6 - video modal video shell is not sticky at mobile breakpoints
  ---
  duration_ms: 264.737158
  type: 'test'
  ...
# Subtest: video modal toggles document scroll locking on open/close
ok 7 - video modal toggles document scroll locking on open/close
  ---
  duration_ms: 205.53258
  type: 'test'
  ...
# Subtest: video modal comments region exposes aria landmarks and stays in the focus order
ok 8 - video modal comments region exposes aria landmarks and stays in the focus order
  ---
  duration_ms: 389.225081
  type: 'test'
  ...
# Subtest: video modal zap dialog updates aria state while toggling
ok 9 - video modal zap dialog updates aria state while toggling
  ---
  duration_ms: 828.682592
  type: 'test'
  ...
# Subtest: video modal inherits design system mode when loaded dynamically
ok 10 - video modal inherits design system mode when loaded dynamically
  ---
  duration_ms: 204.441361
  type: 'test'
  ...
# Subtest: VideoModal comment section toggles visibility and renders hydrated comments
ok 11 - VideoModal comment section toggles visibility and renders hydrated comments
  ---
  duration_ms: 228.335345
  type: 'test'
  ...
# Subtest: Unauthenticated users can read comments while the composer stays disabled
ok 12 - Unauthenticated users can read comments while the composer stays disabled
  ---
  duration_ms: 210.819921
  type: 'test'
  ...
# Subtest: Guest users render loaded thread snapshots before composer auth enforcement
ok 13 - Guest users render loaded thread snapshots before composer auth enforcement
  ---
  duration_ms: 200.193057
  type: 'test'
  ...
# Subtest: Thread ready snapshots force comments visible before composer gating
ok 14 - Thread ready snapshots force comments visible before composer gating
  ---
  duration_ms: 605.992506
  type: 'test'
  ...
# Subtest: Controller renders synchronous loadThread snapshots immediately
ok 15 - Controller renders synchronous loadThread snapshots immediately
  ---
  duration_ms: 153.890726
  type: 'test'
  ...
# Subtest: VideoModalCommentController attaches profiles using normalized pubkeys
ok 16 - VideoModalCommentController attaches profiles using normalized pubkeys
  ---
  duration_ms: 3.429533
  type: 'test'
  ...
# Subtest: VideoModalCommentController accepts mixed-case videoEventIds for snapshots
ok 17 - VideoModalCommentController accepts mixed-case videoEventIds for snapshots
  ---
  duration_ms: 1.035316
  type: 'test'
  ...
# Subtest: VideoModal comment composer updates messaging and dispatches events
ok 18 - VideoModal comment composer updates messaging and dispatches events
  ---
  duration_ms: 179.85139
  type: 'test'
  ...
# Subtest: VideoModalCommentController load preserves current video for submissions
ok 19 - VideoModalCommentController load preserves current video for submissions
  ---
  duration_ms: 2.100306
  type: 'test'
  ...
# Subtest: VideoModalCommentController falls back to thread pointer when video tags are absent
ok 20 - VideoModalCommentController falls back to thread pointer when video tags are absent
  ---
  duration_ms: 1.088526
  type: 'test'
  ...
# Subtest: VideoModalCommentController preserves videoRootId when only root pointer is provided
ok 21 - VideoModalCommentController preserves videoRootId when only root pointer is provided
  ---
  duration_ms: 1.65271
  type: 'test'
  ...
# Subtest: VideoModalCommentController uses pointerIdentifiers root id fallback
ok 22 - VideoModalCommentController uses pointerIdentifiers root id fallback
  ---
  duration_ms: 1.227976
  type: 'test'
  ...
# Subtest: VideoModalCommentController publishes comment using event id fallback
ok 23 - VideoModalCommentController publishes comment using event id fallback
  ---
  duration_ms: 0.982044
  type: 'test'
  ...
# Subtest: VideoModalCommentController disposes safely during in-flight comment loads
ok 24 - VideoModalCommentController disposes safely during in-flight comment loads
  ---
  duration_ms: 1.215809
  type: 'test'
  ...
# Subtest: VideoModalCommentController prompts login when publish requires authentication
ok 25 - VideoModalCommentController prompts login when publish requires authentication
  ---
  duration_ms: 1.254197
  type: 'test'
  ...
# Subtest: VideoModalCommentController includes parent metadata when replying
ok 26 - VideoModalCommentController includes parent metadata when replying
  ---
  duration_ms: 0.593327
  type: 'test'
  ...
# Subtest: VideoModal comment section exposes aria landmarks and participates in focus trap
ok 27 - VideoModal comment section exposes aria landmarks and participates in focus trap
  ---
  duration_ms: 261.951619
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
# duration_ms 5790.644266

→ Running tests/video-modal-controller.test.mjs
TAP version 13
# Subtest: VideoModalController
    # Subtest: ensureVideoModalReady throws if modal is missing
    ok 1 - ensureVideoModalReady throws if modal is missing
      ---
      duration_ms: 2.572652
      type: 'test'
      ...
    # Subtest: ensureVideoModalReady loads modal if needs rehydrate
    ok 2 - ensureVideoModalReady loads modal if needs rehydrate
      ---
      duration_ms: 0.856755
      type: 'test'
      ...
    # Subtest: showModalWithPoster uses provided video
    ok 3 - showModalWithPoster uses provided video
      ---
      duration_ms: 1.583789
      type: 'test'
      ...
    # Subtest: showModalWithPoster falls back to current video
    ok 4 - showModalWithPoster falls back to current video
      ---
      duration_ms: 1.196012
      type: 'test'
      ...
    # Subtest: forceRemoveModalPoster calls modal method
    ok 5 - forceRemoveModalPoster calls modal method
      ---
      duration_ms: 0.362717
      type: 'test'
      ...
    1..5
ok 1 - VideoModalController
  ---
  duration_ms: 9.918748
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
# duration_ms 35.788631

→ Running tests/video-modal-controllers.test.mjs
TAP version 13
# Subtest: video modal rehydrates and plays through a connected element across views
ok 1 - video modal rehydrates and plays through a connected element across views
  ---
  duration_ms: 631.532286
  type: 'test'
  ...
# Subtest: torrent-only playback resets the modal video before the next hosted session
ok 2 - torrent-only playback resets the modal video before the next hosted session
  ---
  duration_ms: 50.351092
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
  duration_ms: 985.474662
  type: 'test'
  ...
# Subtest: Escape key closes the modal and returns focus to the trigger
ok 4 - Escape key closes the modal and returns focus to the trigger
  ---
  duration_ms: 254.160763
  type: 'test'
  ...
# Subtest: video modal sticky navigation responds to scroll direction
ok 5 - video modal sticky navigation responds to scroll direction
  ---
  duration_ms: 150.469936
  type: 'test'
  ...
# Subtest: video modal video shell is not sticky at mobile breakpoints
ok 6 - video modal video shell is not sticky at mobile breakpoints
  ---
  duration_ms: 194.969526
  type: 'test'
  ...
# Subtest: video modal toggles document scroll locking on open/close
ok 7 - video modal toggles document scroll locking on open/close
  ---
  duration_ms: 240.366196
  type: 'test'
  ...
# Subtest: video modal comments region exposes aria landmarks and stays in the focus order
ok 8 - video modal comments region exposes aria landmarks and stays in the focus order
  ---
  duration_ms: 266.202965
  type: 'test'
  ...
# Subtest: video modal zap dialog updates aria state while toggling
ok 9 - video modal zap dialog updates aria state while toggling
  ---
  duration_ms: 710.214977
  type: 'test'
  ...
# Subtest: video modal inherits design system mode when loaded dynamically
ok 10 - video modal inherits design system mode when loaded dynamically
  ---
  duration_ms: 188.967178
  type: 'test'
  ...
# Subtest: CommentsController lifecycle manages comment references
ok 11 - CommentsController lifecycle manages comment references
  ---
  duration_ms: 159.848787
  type: 'test'
  ...
# Subtest: ReactionsController delegates reaction updates
ok 12 - ReactionsController delegates reaction updates
  ---
  duration_ms: 167.515726
  type: 'test'
  ...
# Subtest: SimilarContentController toggles section visibility
ok 13 - SimilarContentController toggles section visibility
  ---
  duration_ms: 153.907515
  type: 'test'
  ...
# Subtest: ModerationController reset clears moderation overlay references
ok 14 - ModerationController reset clears moderation overlay references
  ---
  duration_ms: 188.707734
  type: 'test'
  ...
# Subtest: VideoModal trims tag strip to fit modal width
ok 15 - VideoModal trims tag strip to fit modal width
  ---
  duration_ms: 299.859157
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
# duration_ms 4781.980798

→ Running tests/video-modal-moderation.test.mjs
TAP version 13
# Subtest: video modal rehydrates and plays through a connected element across views
ok 1 - video modal rehydrates and plays through a connected element across views
  ---
  duration_ms: 765.529172
  type: 'test'
  ...
# Subtest: torrent-only playback resets the modal video before the next hosted session
ok 2 - torrent-only playback resets the modal video before the next hosted session
  ---
  duration_ms: 45.939528
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
  duration_ms: 1200.106835
  type: 'test'
  ...
# Subtest: Escape key closes the modal and returns focus to the trigger
ok 4 - Escape key closes the modal and returns focus to the trigger
  ---
  duration_ms: 370.451638
  type: 'test'
  ...
# Subtest: video modal sticky navigation responds to scroll direction
ok 5 - video modal sticky navigation responds to scroll direction
  ---
  duration_ms: 527.832526
  type: 'test'
  ...
# Subtest: video modal video shell is not sticky at mobile breakpoints
ok 6 - video modal video shell is not sticky at mobile breakpoints
  ---
  duration_ms: 372.428172
  type: 'test'
  ...
# Subtest: video modal toggles document scroll locking on open/close
ok 7 - video modal toggles document scroll locking on open/close
  ---
  duration_ms: 289.470414
  type: 'test'
  ...
# Subtest: video modal comments region exposes aria landmarks and stays in the focus order
ok 8 - video modal comments region exposes aria landmarks and stays in the focus order
  ---
  duration_ms: 392.479054
  type: 'test'
  ...
# Subtest: video modal zap dialog updates aria state while toggling
ok 9 - video modal zap dialog updates aria state while toggling
  ---
  duration_ms: 861.516975
  type: 'test'
  ...
# Subtest: video modal inherits design system mode when loaded dynamically
ok 10 - video modal inherits design system mode when loaded dynamically
  ---
  duration_ms: 240.152338
  type: 'test'
  ...
# Subtest: VideoModal blurs and restores playback when moderation overlay toggles
    # Subtest: trusted reports blur the active video
    ok 1 - trusted reports blur the active video
      ---
      duration_ms: 19.275278
      type: 'test'
      ...
    # Subtest: trusted mute blur state matches moderation context
    ok 2 - trusted mute blur state matches moderation context
      ---
      duration_ms: 7.583324
      type: 'test'
      ...
    1..2
ok 11 - VideoModal blurs and restores playback when moderation overlay toggles
  ---
  duration_ms: 330.899134
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
# duration_ms 5436.565244

→ Running tests/video-modal-tags.test.mjs
TAP version 13
# Subtest: video modal rehydrates and plays through a connected element across views
ok 1 - video modal rehydrates and plays through a connected element across views
  ---
  duration_ms: 746.633691
  type: 'test'
  ...
# Subtest: torrent-only playback resets the modal video before the next hosted session
ok 2 - torrent-only playback resets the modal video before the next hosted session
  ---
  duration_ms: 66.859985
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
  duration_ms: 749.869226
  type: 'test'
  ...
# Subtest: Escape key closes the modal and returns focus to the trigger
ok 4 - Escape key closes the modal and returns focus to the trigger
  ---
  duration_ms: 329.621804
  type: 'test'
  ...
# Subtest: video modal sticky navigation responds to scroll direction
ok 5 - video modal sticky navigation responds to scroll direction
  ---
  duration_ms: 244.422265
  type: 'test'
  ...
# Subtest: video modal video shell is not sticky at mobile breakpoints
ok 6 - video modal video shell is not sticky at mobile breakpoints
  ---
  duration_ms: 219.291224
  type: 'test'
  ...
# Subtest: video modal toggles document scroll locking on open/close
ok 7 - video modal toggles document scroll locking on open/close
  ---
  duration_ms: 322.32707
  type: 'test'
  ...
# Subtest: video modal comments region exposes aria landmarks and stays in the focus order
ok 8 - video modal comments region exposes aria landmarks and stays in the focus order
  ---
  duration_ms: 143.532439
  type: 'test'
  ...
# Subtest: video modal zap dialog updates aria state while toggling
ok 9 - video modal zap dialog updates aria state while toggling
  ---
  duration_ms: 804.384222
  type: 'test'
  ...
# Subtest: video modal inherits design system mode when loaded dynamically
ok 10 - video modal inherits design system mode when loaded dynamically
  ---
  duration_ms: 108.9771
  type: 'test'
  ...
# Subtest: VideoModal renders tag metadata and toggles visibility
ok 11 - VideoModal renders tag metadata and toggles visibility
  ---
  duration_ms: 162.737728
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
# duration_ms 3931.834789

→ Running tests/video-note-payload.test.mjs
TAP version 13
# Subtest: normalizes minimal payload with hosted URL
ok 1 - normalizes minimal payload with hosted URL
  ---
  duration_ms: 7.019507
  type: 'test'
  ...
# Subtest: normalizes mode and boolean flags
ok 2 - normalizes mode and boolean flags
  ---
  duration_ms: 1.063242
  type: 'test'
  ...
# Subtest: augments magnets with ws/xs hints
ok 3 - augments magnets with ws/xs hints
  ---
  duration_ms: 4.406197
  type: 'test'
  ...
# Subtest: normalizes nip71 metadata collections
ok 4 - normalizes nip71 metadata collections
  ---
  duration_ms: 3.423213
  type: 'test'
  ...
# Subtest: derives legacy duration fallback from imeta variants
ok 5 - derives legacy duration fallback from imeta variants
  ---
  duration_ms: 0.893136
  type: 'test'
  ...
# Subtest: reports validation errors for missing fields
ok 6 - reports validation errors for missing fields
  ---
  duration_ms: 0.646738
  type: 'test'
  ...
# Subtest: rejects insecure hosted URLs
ok 7 - rejects insecure hosted URLs
  ---
  duration_ms: 1.018018
  type: 'test'
  ...
# Subtest: allows publishing with only imeta variants
ok 8 - allows publishing with only imeta variants
  ---
  duration_ms: 0.687849
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
# duration_ms 54.193317

→ Running tests/video-schema-and-conversion.test.mjs
TAP version 13
# Subtest: video post schema documents nsfw and kids flags
ok 1 - video post schema documents nsfw and kids flags
  ---
  duration_ms: 3.64297
  type: 'test'
  ...
# Subtest: convertEventToVideo normalizes nsfw and kids booleans
ok 2 - convertEventToVideo normalizes nsfw and kids booleans
  ---
  duration_ms: 1.969638
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
# duration_ms 32.912355

→ Running tests/video-settings-menu-controller.test.mjs
TAP version 13
# Subtest: VideoSettingsMenuController - requestMenu opens popover
ok 1 - VideoSettingsMenuController - requestMenu opens popover
  ---
  duration_ms: 6.485272
  type: 'test'
  ...
# Subtest: VideoSettingsMenuController - closeMenu closes popover
ok 2 - VideoSettingsMenuController - closeMenu closes popover
  ---
  duration_ms: 2.140673
  type: 'test'
  ...
# Subtest: VideoSettingsMenuController - requestMenu toggles if open
ok 3 - VideoSettingsMenuController - requestMenu toggles if open
  ---
  duration_ms: 2.573714
  type: 'test'
  ...
# Subtest: VideoSettingsMenuController - closeAll closes all popovers
ok 4 - VideoSettingsMenuController - closeAll closes all popovers
  ---
  duration_ms: 2.797512
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
# duration_ms 62.508334

→ Running tests/webtorrent-handlers.test.mjs
TAP version 13
# Subtest: TorrentClient Handlers
    # Subtest: handleTorrentStream (chrome) should set up video correctly
    ok 1 - handleTorrentStream (chrome) should set up video correctly
      ---
      duration_ms: 48.743037
      type: 'test'
      ...
[bitvid] CORS warning detected. Attempting to remove the failing webseed/tracker.
[bitvid] Cleaned up webseeds => [ 'http://good.com/video.mp4' ]
[bitvid] Cleaned up trackers => [ 'ws://good.com' ]
    # Subtest: handleTorrentStream (firefox) should set up video correctly with highWaterMark
    ok 2 - handleTorrentStream (firefox) should set up video correctly with highWaterMark
      ---
      duration_ms: 55.704919
      type: 'test'
      ...
    # Subtest: handleTorrentStream (chrome) should handle CORS warning logic
    ok 3 - handleTorrentStream (chrome) should handle CORS warning logic
      ---
      duration_ms: 2.521307
      type: 'test'
      ...
    1..3
ok 1 - TorrentClient Handlers
  ---
  duration_ms: 111.475367
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
# duration_ms 129.221912

→ Running tests/webtorrent-regression.test.mjs
TAP version 13
# Subtest: WebTorrent Regression Tests
    # Subtest: probePeers should report healthy if webseed is present even with 0 peers
    ok 1 - probePeers should report healthy if webseed is present even with 0 peers
      ---
      duration_ms: 9.134921
      type: 'test'
      ...
    # Subtest: probePeers should report unhealthy if no webseed and 0 peers
    ok 2 - probePeers should report unhealthy if no webseed and 0 peers
      ---
      duration_ms: 51.663067
      type: 'test'
      ...
    1..2
ok 1 - WebTorrent Regression Tests
  ---
  duration_ms: 65.118071
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
# duration_ms 78.850611

✔ All unit tests passed
Unit tests exit code: 0
