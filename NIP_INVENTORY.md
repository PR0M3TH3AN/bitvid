# NIP Inventory

| NIP / Kind | Description | Repo Locations | Status | Notes |
|------------|-------------|----------------|--------|-------|
| **NIP-01** | Basic Protocol Flow | `js/nostr/client.js`, `docs/nips/01.md` | Compliant | Base implementation verified via `client.js`. |
| **NIP-04** | Encrypted Direct Message | `js/nostr/dmDecryptWorker.js`, `js/nostr/client.js` | Compliant | Verified by `tests/nostr-specs/nip04-nip44.test.mjs`. |
| **NIP-07** | `window.nostr` Capability | `js/nostr/nip07Permissions.js`, `js/nostr/adapters/nip07Adapter.js` | Compliant | Retry logic and timeouts verified in `nip07_compliance.test.mjs`. |
| **NIP-09** | Event Deletion | `js/nostr/client.js`, `docs/nips/09.md` | Partial | `deleteAllVersions` implements Kind 5 logic. |
| **NIP-10** | Text Notes & Threads | `js/nostr/commentEvents.js`, `docs/nips/10.md` | Compliant | `buildCommentEvent` implements NIP-10 threading markers (E, P, K tags). |
| **NIP-17** | Private Direct Messages | `js/nostr/client.js`, `js/ui/profileModal/ProfileDirectMessageRenderer.js` | Compliant | Explicit support for Gift Wraps (Kind 1059) and Seals (Kind 13). |
| **NIP-19** | bech32-encoded entities | `js/utils/nostrHelpers.js`, `js/nostr/nip71.js` | Compliant | Uses `nostr-tools` for correct encoding/decoding. |
| **NIP-21** | `nostr:` URI scheme | `docs/nips/21.md` | Unknown | Usage in content parsing verified in `js/utils/nostrHelpers.js`. |
| **NIP-33** | Addressable Events | `js/nostr/client.js` | Compliant | `d` tag usage verified in `video_note_compliance.test.mjs`. |
| **NIP-44** | Encrypted Payloads (Versioned) | `js/nostr/dmDecryptWorker.js`, `js/nostr/client.js` | Compliant | Verified by `tests/nostr-specs/nip04-nip44.test.mjs`. |
| **NIP-46** | Nostr Remote Signing | `js/nostr/nip46Client.js` | Compliant | Full client implementation for remote signing. |
| **NIP-51** | Lists | `js/userBlocks.js`, `js/subscriptions.js` | Compliant | Mute list (Kind 10000) and Subscription list (Kind 30000) logic aligns with spec. |
| **NIP-56** | Reporting | `js/services/moderationService.js`, `docs/nips/56.md` | Compliant | `buildReportEvent` implements Kind 1984. |
| **NIP-57** | Zaps | `js/payments/zapRequests.js`, `js/payments/zapSplit.js` | Compliant | Implements Kind 9734/9735 flow. |
| **NIP-59** | Gift Wrap | `js/nostr/client.js` | Compliant | Implemented as part of NIP-17. |
| **NIP-65** | Relay List Metadata | `js/relayManager.js` | Compliant | Code supports Kind 10002. Verified by `tests/nostr-specs/nip65_compliance.test.mjs`. |
| **NIP-71** | Video Events | `js/nostr/nip71.js` | Partial | Kinds 21/22 supported in schema, but Kind 30078 is primary. Verified tag generation in `tests/nostr-specs/kind30078.test.mjs`. |
| **NIP-78** | Application-specific data | `js/services/hashtagPreferencesService.js` | Compliant | Used for hashtag preferences (Kind 30015). |
| **NIP-94** | File Metadata | `js/nostr/videoPublisher.js` | Compliant | `buildVideoMirrorEvent` implements Kind 1063. |
| **NIP-96** | HTTP File Storage Integration | `js/nostr/videoPublisher.js` | Partial | References `service nip96` in NIP-71 tags. |
| **NIP-98** | HTTP Auth | `js/services/r2Service.js` | Compliant | Used for R2 service authentication (Kind 27235). |
| **Kind 21** | NIP-71 Video | `js/nostr/nip71.js` | Compliant | Implemented. |
| **Kind 22** | NIP-71 Short Video | `js/nostr/nip71.js` | Compliant | Implemented. |
| **Kind 10000** | Mute List | `js/userBlocks.js` | Compliant | Uses standard NIP-51 (no d tag for main list). |
| **Kind 10002** | Relay List | `js/relayManager.js` | Compliant | Verified. |
| **Kind 1063** | File Header | `js/nostr/videoPublisher.js` | Compliant | Implemented for NIP-94 mirroring. |
| **Kind 30000** | Subscription List | `js/subscriptions.js` | Compliant | Implements NIP-51 follow sets. |
| **Kind 30015** | Hashtag Preferences | `js/services/hashtagPreferencesService.js` | Compliant | Implemented. |
| **Kind 30078** | App Data | `js/nostr/client.js`, `js/nostr/videoPayloadBuilder.js` | Compliant | Verified by `tests/nostr-specs/kind30078.test.mjs`. |
| **Kind 30079** | Watch History | `js/nostr/watchHistory.js`, `config/instance-config.js` | Compliant | Parameterized replaceable list (custom kind). Implements bucketing and encryption. |
| **NIP-25** | Reactions | `js/nostr/reactionEvents.js`, `js/nostrEventSchemas.js` | Compliant | Implements Kind 7 reaction events. |
| **NIP-42** | Authentication of clients to relays | `js/nostr/client.js` | Unknown | Needs verification of AUTH command handling. |
| **NIP-47** | Wallet Connect | `js/payments/nwcClient.js` | Compliant | Implements NWC client for zaps. |
