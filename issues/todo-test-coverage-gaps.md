# TODO: Improve Test Coverage for Untested Areas

**Source:** Test coverage analysis (Feb 2026)

**Context:**
Several areas of the codebase lack unit test coverage. This document tracks the remaining gaps after the initial test coverage expansion. Items are ordered by risk/impact.

---

## P0 — Financial Correctness (js/payments/)

These files handle real money (Lightning/zap payments). Bugs here directly affect user funds. **No existing tests except zapSplit, zapSharedState, and nwcClient.**

### [x] `js/payments/lnurl.js` — LNURL protocol + bech32 encoding
**Exports:** `encodeLnurlBech32`, `resolveLightningAddress`, `fetchPayServiceData`, `validateInvoiceAmount`, `requestInvoice`
**Testing helpers via `__TESTING__`:** `bech32Encode`, `bech32Decode`, `decodeLnurlBech32`, `convertWords`, `createChecksum`
**Dependencies:** TextEncoder/TextDecoder, fetch API
**Test cases needed:**
- bech32 encode/decode roundtrip for various URLs
- `resolveLightningAddress`: lnurl-encoded input, email format (`user@domain`), HTTPS URL, invalid/empty input, mixed-case rejection
- `fetchPayServiceData`: successful fetch, HTTP errors (404/500), invalid JSON, missing callback, error status in response body, invalid metadata JSON gracefully skipped
- `validateInvoiceAmount`: within limits, below min, above max, zero/negative, non-numeric
- `requestInvoice`: valid retrieval, comment truncation based on `commentAllowed`, both `amountSats` and `amountMsats`, missing invoice in response, error response

### [x] `js/payments/zapReceiptValidator.js` — Validates zap receipts from relays
**Exports:** `validateZapReceipt(context, overrides)`
**Returns:** `{status: "passed"|"failed"|"skipped", reason, event, checkedRelays}`
**Dependencies:** nostr-tools (SimplePool, event validation), bech32, sha256, bytesToHex
**Test cases needed:**
- Missing/invalid zap request JSON → status:"skipped"
- Valid zap request but no relays specified → status:"skipped"
- Invoice description hash extraction and SHA256 matching
- Amount validation (invoice amount vs expected share, with tolerance)
- Receipt found with matching pubkey and valid signature → status:"passed"
- Receipt found with wrong pubkey → status:"failed"
- No receipt found on relays → status:"failed"
- Override injection for `createPool`, `listEvents`, `decodeDescriptionHash`, `getAmountFromBolt11`
- BOLT11 parsing: valid with description hash tag "h", without it, truncated/invalid

### [x] `js/payments/platformFee.js` — Fee percentage parsing and clamping
**Exports:** `parsePercentValue`, `clampPercent`, `getDefaultPlatformFeePercent`, `resolvePlatformFeePercent`
**Dependencies:** `../config.js` (PLATFORM_FEE_PERCENT)
**Test cases needed:**
- `parsePercentValue`: integers, floats, bigints, string percentages ("50%"), string fractions ("10/100"), division by zero, empty strings, whitespace
- `clampPercent`: 0, 50, 100, >100, <0, NaN, non-numeric → 0
- `getDefaultPlatformFeePercent`: valid config, invalid config → 0
- `resolvePlatformFeePercent`: with override (uses override), without (uses default), null/undefined → default

### [x] `js/payments/zapRequests.js` — Zap request event creation and publishing
**Exports:** `resolveZapRecipient`, `buildZapRequestPayload`, `signZapRequest`, `publishZapRequest`, `createAndPublishZapRequest`
**Testing helpers via `__TESTING__`:** `normalizeRelayList`, `resolveLnurlTag`
**Dependencies:** lnurl.js, nostrEventSchemas, nostrPublish, signRequestQueue, RELAY_URLS
**Test cases needed:**
- `buildZapRequestPayload`: all params, minimal params, created_at override, additionalTags passthrough → verify kind:9734 event structure
- `signZapRequest`: valid signer, timeout scenario
- `publishZapRequest`: relay acceptance, relay rejection → throws
- `createAndPublishZapRequest`: full flow, recipient doesn't support Nostr zaps, invoice fetch failure (non-fatal)
- `normalizeRelayList`: deduplication, empty list

### [ ] `js/payments/zapNotifications.js` — UI notifications for zap events
**Exports:** `showLoginRequiredToZapNotification`, `syncNotificationPortalVisibility`
**Dependencies:** DOM APIs, applicationContext, zapMessages
**Test cases needed:**
- With app context (showStatus available)
- Fallback to showError
- Without app context (creates DOM portal elements)
- Auto-hide timing (configurable `autoHideMs`)
- Portal visibility sync based on banner state
- Multiple calls don't duplicate elements
- Accessibility attributes (aria-live, aria-label)

### [ ] `js/payments/platformAddress.js` — Platform Lightning address from admin profile
**Exports:** `getPlatformLightningAddress`, `__resetPlatformAddressCache`
**Dependencies:** config (PLATFORM_LUD16_OVERRIDE, ADMIN_SUPER_NPUB), nostrClient, nostr-tools (nip19)
**Test cases needed:**
- PLATFORM_LUD16_OVERRIDE set → returns immediately
- No override: fetches admin kind:0 profile, extracts lud16 or lud06
- Cache TTL (10 min): fresh → returns cached, expired → re-fetches
- forceRefresh bypasses cache
- Missing ADMIN_SUPER_NPUB → null
- Relay failures → null (logged)
- nostr-tools unavailable → fallback handling

---

## P0 — Identity/Feed-Critical Utilities

### [ ] `js/utils/hex.js` — Hex normalization for Nostr pubkeys
**Exports:** `normalizeHexString`, `normalizeHexId`, `normalizeHexPubkey`
**Dependencies:** None (pure utility)
**Why P0:** Incorrect hex normalization breaks identity lookups silently.
**Test cases needed:**
- Valid 64-char hex → lowercase trimmed
- Mixed case → normalized
- Whitespace → trimmed
- Non-string inputs → graceful handling
- Empty string, null, undefined

### [ ] `js/utils/hashtagNormalization.js` — Hashtag canonicalization
**Exports:** `normalizeHashtag`, `formatHashtag`
**Dependencies:** None (pure utility)
**Why P0:** Affects feed filtering and content matching across the app.
**Test cases needed:**
- Strip `#` prefix, handle `##` double prefix
- Trim whitespace before and after
- Lowercase conversion
- Empty-after-strip detection
- `formatHashtag` adds `#` prefix back
- Roundtrip: normalizeHashtag → formatHashtag

---

## P1 — Upload Reliability (js/storage/)

### [ ] `js/storage/s3-multipart.js` — Multipart upload chunking
**Why:** Multipart upload bugs are extremely hard to debug in production. Only `dmDb.js` is tested in this directory.
**Test cases needed:**
- Chunk splitting at correct sizes
- Part numbering sequence
- Upload completion/abort flows
- Progress tracking
- Error recovery for individual part failures

### [ ] `js/storage/s3-client.js` — S3-compatible client
**Test cases needed:**
- Request signing
- Bucket operations
- Error response parsing
- SDK loading fallback

### [ ] `js/storage/r2-mgmt.js` — R2 bucket management
### [ ] `js/storage/r2-s3.js` — R2/S3 integration layer
### [ ] `js/services/s3UploadService.js` — Upload orchestration and progress tracking

---

## P1 — Content Safety (js/feedEngine/)

### [ ] `js/feedEngine/kidsAudienceFilterStage.js` — Kids mode content filtering
**Exports:** `createKidsAudienceFilterStage()` → async filter function
**Dependencies:** nostrService, `toSet` utility
**Why P1:** Safety-critical — wrong classification shows inappropriate content to children.
**Test cases needed:**
- Removes non-kids, NSFW, blacklisted, content-warning-flagged videos
- Warning normalization: `trim().toLowerCase().replace(/[\s_]+/g, "-")`
- Array/string/Set warning inputs; comma/semicolon/pipe delimiters
- Context fallback: runtime → config → fallback defaults
- Empty video lists, null video objects

### [ ] `js/feedEngine/kidsScoring.js` — Kids content scoring (0-1 clamped)
**Exports:** `createKidsScorerStage()` → async scoring function
**Dependencies:** `normalizeHashtag`, `toSet`, `isPlainObject`
**Key factors:** age-appropriateness (0.35), educational (0.25), author trust (0.15), popularity (0.1), freshness (0.1), safety multiplier (0.6 weight)
**Test cases needed:**
- Individual factor calculations at boundaries
- Clamping edge cases (NaN, Infinity → 0 or 1)
- Exponential freshness decay with various half-lives
- Safety penalty stacking (trusted reports + muted)
- Weight override resolution order: options → runtime → config
- Metadata injection correctness (kidsScore, components)

### [ ] `js/feedEngine/sorters.js` — Feed sorting strategies
**Exports:** `createChronologicalSorter()`, `createExploreDiversitySorter()`, `createKidsScoreSorter()`
**Test cases needed:**
- Chronological: timestamp resolution path priority (hook → rootCreatedAt → nip71Source → created_at), trustedMuted items sunk to end
- MMR diversity: cosine similarity on zero vectors, NaN handling, lambda=0 (pure diversity) vs lambda=1 (pure relevance)
- Kids score: desc score → desc timestamp → video ID tiebreak

---

## P1 — DM UI Components (js/ui/dm/)

**Why:** 14 files, zero tests. Growing feature area with complex state management.

### [ ] `js/ui/dm/MessageBubble.js` — Individual message rendering
### [ ] `js/ui/dm/Composer.js` — Message composition UI
### [ ] `js/ui/dm/DMPrivacySettings.js` — Privacy configuration
### [ ] `js/ui/dm/MessageThread.js` — Message thread display
### [ ] `js/ui/dm/NotificationCenter.js` — Notification handling
### [ ] `js/ui/dm/ConversationList.js` — Conversation list rendering
### [ ] `js/ui/dm/ZapInterface.js` — In-chat zap sending
### [ ] `js/ui/dm/ZapReceiptList.js` — Zap receipt display
### [ ] `js/ui/dm/ContactRow.js` — Contact list item
### [ ] `js/ui/dm/Avatar.js` — Profile avatar display
### [ ] `js/ui/dm/AppShell.js` — DM app shell layout
### [ ] `js/ui/dm/DayDivider.js` — Date separator between messages
### [ ] `js/ui/dm/index.js` — Module entry point

---

## P2 — Playback Failure Modes

### [ ] `js/services/playbackService.js` — Additional failure/fallback path tests
**Existing tests:** playbackService.test.mjs (3 variants: base, forcedSource, order)
**What's missing:** The URL→magnet fallback chain is documented as the most fragile path.
**Test cases to add:**
- No video element → error path
- No playable source (no URL, bad magnet)
- Probe HEAD timeout → triggers torrent fallback
- Playback stall (8s default watchdog) → triggers fallback
- Unsupported BTIH magnet format
- Autoplay blocked (NotAllowedError) → wait for user play → restore watchdog
- Race conditions: request signature matching, overlapping session cleanup
- effectiveTimeout=0 when forcedSource set
- Watchdog cleanup before new session

---

## P2 — View Managers

### [ ] `js/forYouView.js` — "For You" feed with empty state lifecycle
**Exports:** `initForYouView()`, `ForYouView` class
**Test focus:** MutationObserver lifecycle, empty state injection/removal, action button delegation

### [ ] `js/exploreView.js` — Explore feed
**Test focus:** Same empty state management pattern as forYouView

### [ ] `js/searchView.js` — Search results with profile/video dual search
**Exports:** `initSearchView()` + internal helpers
**Test focus:** Token cancellation for stale searches, JSON.parse failures, filter state persistence, relay search fallback to local

### [ ] `js/hashView.js` — Hash-based view routing
**Exports:** `getHashViewName()`, `setHashView(viewName, options)`
**Test focus:** Regex extraction, URL param manipulation, modal/v param preservation

### [ ] `js/kidsView.js` — Kids-only feed
**Test focus:** Same pattern as exploreView

---

## P2 — UI Modal Components

### [ ] `js/ui/ModalManager.js` — Modal lifecycle management
### [ ] `js/ui/components/DeleteModal.js` — Delete confirmation (destructive operation)
### [ ] `js/ui/components/UploadModal.js` — Upload flow (destructive operation)
### [ ] `js/ui/components/EditModal.js` — Edit modal
### [ ] `js/ui/components/SearchFilterModal.js` — Search filter UI
### [ ] `js/ui/components/EventDetailsModal.js` — Event details display
### [ ] `js/ui/initEditModal.js` — Edit modal initialization
### [ ] `js/ui/initDeleteModal.js` — Delete modal initialization

---

## P2 — Utilities (js/utils/)

### [ ] `js/utils/logger.js` — Logger with dev/user channels
**Exports:** `logger`, `devLogger`, `userLogger`, `isCompatibleLogger`
**Test focus:** Console fallback chain, force flag parsing, dev mode gating, noop fallback for missing console

### [ ] `js/utils/profileBatchFetcher.js` — Batch profile fetching
**Exports:** `batchFetchProfilesFromRelays`
**Test focus:** Pubkey validation (HEX64), cache hit bypass, newest-by-timestamp dedup, malformed JSON handling, relay timeouts

### [ ] `js/utils/domUtils.js` — DOM helpers
### [ ] `js/utils/storage.js` — localStorage abstraction
### [ ] `js/utils/storagePointer.js` — Storage pointer helpers
### [ ] `js/utils/videoTimestamps.js` — Timestamp parsing
### [ ] `js/utils/videoPointer.js` — Video pointer utilities
### [ ] `js/utils/torrentHash.js` — Torrent hash utilities
### [ ] `js/utils/linkPreviewSettings.js` — Link preview config
### [ ] `js/utils/profileMedia.js` — Profile media handling
### [ ] `js/utils/qrcode.js` — QR code generation

---

## P3 — Infrastructure Improvements

### [ ] Add coverage reporting
**Details:** Add `--experimental-test-coverage` to Node.js test runner (available since Node 20) or integrate `c8`. This gives concrete numbers and trend tracking for CI.

### [ ] Worker test harness
**Details:** Web Worker code (`dmDecryptWorker.js`, `nip04Worker.js`) can't be tested in JSDOM. Consider `vitest` with `@vitest/web-worker` or a lightweight worker polyfill.

### [ ] Fix flaky E2E tests
**Details:** `KNOWN_ISSUES.md` documents broken E2E tests: modal timeouts, missing elements, undefined functions. Fix these to restore CI confidence.

---

## P3 — Low Priority / Hard to Test

### Nostr Workers (need worker harness)
- [ ] `js/nostr/dmDecryptWorker.js`
- [ ] `js/nostr/dmDecryptWorkerClient.js`
- [ ] `js/nostr/nip04Worker.js`
- [ ] `js/nostr/nip04WorkerClient.js`

### Diagnostic/Debug Files
- [ ] `js/nostr/countDiagnostics.js`
- [ ] `js/nostr/maxListenerDiagnostics.js`

### Remaining UI Components
- [ ] `js/ui/watchHistoryController.js`
- [ ] `js/ui/profileIdentityController.js`
- [ ] `js/ui/ambientBackground.js`
- [ ] `js/ui/components/FeedInfoPopover.js`
- [ ] `js/ui/components/EmbedVideoModal.js`
- [ ] `js/ui/components/RevertModal.js`
- [ ] `js/ui/components/ShareNostrModal.js`

---

## E2E Test Gaps

Only 6 E2E tests exist. Consider adding:

- [ ] Full upload flow (video file → published note)
- [ ] Video playback fallback scenarios (URL → magnet)
- [ ] Authentication flows (NIP-07, NIP-46 connection)
- [ ] Relay switching behavior under failure conditions
- [ ] Watch history persistence and sync
- [ ] DM conversation flow

---

## Notes

- When adding tests, follow existing patterns in `tests/` directory
- Use `node:test` and `node:assert/strict` for unit tests
- Use Playwright for E2E tests
- Mock external dependencies (nostr-tools, relays) appropriately
- Run `npm run test:unit` to verify new tests pass
- Files exposing `__TESTING__` objects provide internal helpers for white-box testing
- Payment files are pure-ish logic (no DOM) — good candidates for straightforward unit tests
