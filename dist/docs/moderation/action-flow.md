# Moderation action flow (end-to-end)

This document describes how moderation data flows from Nostr reports and block lists into local state and UI updates. It complements the broader guidance in [`docs/moderation/README.md`](README.md).

## Core services and responsibilities

### `js/services/moderationService.js`

`moderationService` aggregates report events, contact lists, and trusted mute lists, then emits summarized moderation data for the rest of the application to consume.

* **Contacts + trusted reporters:** When contacts are rebuilt, the service emits a `contacts` event and recomputes every moderation summary. This ensures trusted reports stay in sync as the viewer’s social graph changes.【F:js/services/moderationService.js†L520-L569】
* **Report summaries:** For each event, the service recomputes a summary of total vs. trusted reports, stores it, and emits a `summary` event with the updated data.【F:js/services/moderationService.js†L1869-L1998】
* **Threshold transitions:** The service logs when trusted report counts cross the autoplay/block or blur thresholds. These thresholds are defined in the service (`AUTOPLAY_TRUST_THRESHOLD` and `BLUR_TRUST_THRESHOLD`) and used when trusted counts change.【F:js/services/moderationService.js†L7-L8】【F:js/services/moderationService.js†L668-L706】

### `js/services/moderationActionController.js`

`ModerationActionController` is the orchestration layer for user-triggered moderation actions. It is responsible for:

* **Overrides (“show anyway”):** `handleOverride` persists the override, clears hide state on the target video, decorates moderation state, refreshes the card UI, dispatches an override event, and resumes playback if needed.【F:js/services/moderationActionController.js†L77-L126】
* **Block actions:** `handleBlock` ensures the viewer is logged in, updates the block list, clears overrides, re-decorates moderation state, refreshes the card UI, dispatches block/hide events, and triggers a list refresh so the feed reflects the new block state.【F:js/services/moderationActionController.js†L128-L224】
* **Hide actions:** `handleHide` clears overrides, updates the moderation state, refreshes the card UI, and dispatches a hide event.【F:js/services/moderationActionController.js†L226-L263】

## Local state updates

Moderation overrides are persisted in local state through the cache module:

* `setModerationOverride` stores (and optionally persists) “show anyway” entries in the moderation override map and local storage.【F:js/state/cache.js†L1269-L1318】
* `clearModerationOverride` removes entries and persists the cleanup when requested.【F:js/state/cache.js†L1320-L1341】

`ModerationActionController` uses these helpers via injected services when users override, hide, or block content, ensuring the UI state and local storage stay consistent.【F:js/services/moderationActionController.js†L10-L24】【F:js/services/moderationActionController.js†L77-L224】

## UI update flow

### Application wiring (`js/app.js`)

`bitvidApp` wires `ModerationActionController` to application state and UI updates. The controller receives callbacks to:

* Decorate moderation state for videos.
* Refresh card moderation UI.
* Dispatch DOM events for moderation actions (`video:moderation-override`, `video:moderation-block`, `video:moderation-hide`).【F:js/app.js†L6029-L6114】

This keeps moderation mutations in one place while delegating the UI refresh to controllers and card views.

### Profile modal integration (`js/ui/profileModalController.js`)

`ProfileModalController` subscribes to `moderationService` contact updates and refreshes the friends list when the trusted contacts set changes. This keeps the moderation settings screen aligned with the viewer’s social graph.【F:js/ui/profileModalController.js†L891-L921】

## End-to-end flow summary

1. **Ingest & summarize:** `moderationService` ingests reports/mutes/contacts, recomputes summaries, emits `summary` and `contacts`, and logs threshold transitions for autoplay and blur rules.【F:js/services/moderationService.js†L520-L706】【F:js/services/moderationService.js†L1869-L1998】
2. **Decorate playback state:** Application-level logic consumes summaries and settings to decorate moderation state on videos (blur/autoplay/hide metadata) before rendering or playback decisions.【F:js/app.js†L5980-L6067】
3. **User action:** UI triggers `ModerationActionController` (`handleOverride`, `handleHide`, `handleBlock`) to mutate overrides, update block lists, and refresh UI with event dispatches.【F:js/services/moderationActionController.js†L77-L224】
4. **Persist & refresh:** Overrides persist via `js/state/cache.js`, and UI controllers refresh based on moderation events or service subscriptions.【F:js/state/cache.js†L1269-L1341】【F:js/ui/profileModalController.js†L891-L921】

For broader moderation policies and QA guidance, refer to [`docs/moderation/README.md`](README.md).
