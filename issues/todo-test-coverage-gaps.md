# TODO: Improve Test Coverage for Untested Areas

**Source:** Test coverage analysis (Feb 2026)

**Context:**
Several areas of the codebase lack unit test coverage. This document tracks the remaining gaps after the initial test coverage expansion.

---

## High Priority

### Storage Layer
Files with no tests that handle critical upload/storage functionality:

- [ ] `js/storage/s3-multipart.js` - Multipart upload logic, bucket management
- [ ] `js/storage/s3-client.js` - S3 client wrapper, SDK loading
- [ ] `js/storage/r2-mgmt.js` - R2 bucket management operations
- [ ] `js/storage/r2-s3.js` - R2/S3 integration layer
- [ ] `js/services/s3UploadService.js` - Upload orchestration and progress tracking

**Why:** These are user-facing upload paths. Failures here directly impact content creators.

---

## Medium Priority

### DM Components
The `js/ui/dm/` directory lacks unit tests:

- [ ] `ConversationList.js` - Conversation list rendering
- [ ] `MessageThread.js` - Message thread display
- [ ] `MessageBubble.js` - Individual message rendering
- [ ] `Composer.js` - Message composition UI
- [ ] `ZapInterface.js` - Zap sending interface
- [ ] `NotificationCenter.js` - DM notification handling
- [ ] `Avatar.js` - Profile avatar display
- [ ] `ContactRow.js` - Contact list item
- [ ] `DMPrivacySettings.js` - Privacy settings UI
- [ ] `AppShell.js` - DM app shell layout

**Why:** Growing feature area with complex state management.

### Video Utilities
- [ ] `js/utils/videoTimestamps.js` - Timestamp parsing and formatting
- [ ] `js/utils/videoPointer.js` - Video pointer utilities
- [ ] `js/utils/torrentHash.js` - Torrent hash utilities

**Why:** Core video functionality used throughout the app.

---

## Low-Medium Priority

### Kids Mode Features
Safety-critical filtering that should have thorough test coverage:

- [ ] `js/feedEngine/kidsAudienceFilterStage.js` - Kids mode content filtering
- [ ] `js/feedEngine/kidsScoring.js` - Kids-appropriate content scoring

**Why:** Safety-critical filtering for younger audiences.

### Application Bootstrap
- [ ] `js/app.js` - Main application orchestrator
- [ ] `js/bootstrap.js` - Application initialization
- [ ] `js/applicationContext.js` - Application context management

**Why:** Complex initialization logic that's difficult to test but important for reliability.

---

## Low Priority

### Miscellaneous Utilities
- [ ] `js/utils/domUtils.js` - DOM helper functions
- [ ] `js/utils/hex.js` - Hex encoding utilities
- [ ] `js/utils/qrcode.js` - QR code generation
- [ ] `js/utils/linkPreviewSettings.js` - Link preview configuration
- [ ] `js/utils/storage.js` - Local storage utilities
- [ ] `js/utils/storagePointer.js` - Storage pointer helpers
- [ ] `js/utils/profileMedia.js` - Profile media handling

### UI Components
- [ ] `js/ui/ModalManager.js` - Modal lifecycle management
- [ ] `js/ui/initEditModal.js` - Edit modal initialization
- [ ] `js/ui/initDeleteModal.js` - Delete modal initialization
- [ ] `js/ui/watchHistoryController.js` - Watch history UI
- [ ] `js/ui/profileIdentityController.js` - Profile identity display
- [ ] `js/ui/ambientBackground.js` - Ambient background effects
- [ ] `js/ui/components/DeleteModal.js` - Delete confirmation modal
- [ ] `js/ui/components/FeedInfoPopover.js` - Feed information popover
- [ ] `js/ui/components/EventDetailsModal.js` - Event details display
- [ ] `js/ui/components/EmbedVideoModal.js` - Video embed modal

### Nostr Internals
- [ ] `js/nostr/dmDecryptWorker.js` - DM decryption web worker
- [ ] `js/nostr/dmDecryptWorkerClient.js` - Worker client interface
- [ ] `js/nostr/nip04Worker.js` - NIP-04 web worker
- [ ] `js/nostr/nip04WorkerClient.js` - NIP-04 worker client
- [ ] `js/nostr/countDiagnostics.js` - Count query diagnostics
- [ ] `js/nostr/maxListenerDiagnostics.js` - Event listener diagnostics

---

## E2E Test Gaps

Only 6 E2E tests exist. Consider adding:

- [ ] Full upload flow (video file -> published note)
- [ ] Video playback fallback scenarios (URL -> magnet)
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
