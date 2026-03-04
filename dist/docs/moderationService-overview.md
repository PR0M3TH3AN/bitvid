# Moderation Service Overview

**File**: `js/services/moderationService.js`

## Purpose

The `ModerationService` implements the decentralized Trust & Safety model for bitvid. It filters content based on a "Web of Trust" derived from the current user's social graph (NIP-02 Contact List, Kind 3) and administrative overrides.

Instead of a central authority deciding what is "safe," the service aggregates reports (NIP-56) only from users the viewer follows (their "trusted contacts"). This creates a personalized moderation layer where spam and abuse are filtered by community consensus within the user's network.

## Key Concepts

### Web of Trust
-   **Viewer Context**: The service tracks the currently logged-in user (`viewerPubkey`).
-   **Trusted Contacts**: The set of pubkeys the viewer follows (from their Kind 3 event).
-   **Trust Score**: The number of unique trusted users who have reported a specific piece of content.
-   **Thresholds**: Actions (e.g., blurring, disabling autoplay) are triggered when the Trust Score exceeds defined limits (`AUTOPLAY_TRUST_THRESHOLD`, `BLUR_TRUST_THRESHOLD`).

### NIP-56 Reports (Kind 1984)
-   Users can report content for reasons like `nudity`, `spam`, `illegal`, etc.
-   Reports are public events signed by the reporter.
-   The service subscribes to reports for active content and aggregates them locally.
-   **Crucially**: Reports from users *outside* the trusted contact list are ignored (unless whitelisted by admin).

### NIP-51 Mutes (Kind 10000)
-   Users can mute other users to hide their content entirely.
-   The service syncs with `UserBlocks` to enforce mutes.
-   It also supports "Trusted Mutes" where mutes from trusted contacts can influence visibility (though this feature is evolving).

### Admin Overrides
-   The service integrates with `AccessControl` to respect an instance-wide **Blacklist** (always hidden) and **Whitelist** (always trusted).

## Architecture & Data Flow

### 1. Initialization (Setting the Viewer)
When a user logs in, `setViewerPubkey(pubkey)` is called:
1.  The service fetches the user's latest Kind 3 Contact List.
2.  It extracts all followed pubkeys into `trustedContacts`.
3.  It merges any admin-defined "Trust Seeds" (default trusted users).
4.  It recomputes trust scores for all currently loaded content based on the new graph.

### 2. Report Aggregation
When viewing a video, the app calls `subscribeToReports(eventId)`:
1.  The service subscribes to Kind 1984 events referencing the video ID.
2.  Incoming reports are ingested via `ingestReportEvent`.
3.  `recomputeSummaryForEvent` checks if the reporter is in `trustedContacts`.
4.  If trusted, the report increments the score for its category.
5.  If the score crosses a threshold, the service emits a `summary` event, updating the UI (e.g., to blur the video).

## Usage Example

```javascript
import moderationService from './services/moderationService.js';

// 1. Initialize with the logged-in user
await moderationService.setViewerPubkey(myPubkey);

// 2. Subscribe to reports for a video
await moderationService.subscribeToReports(videoEventId);

// 3. Listen for trust score updates
const unsubscribe = moderationService.on('summary', ({ eventId, summary }) => {
  if (summary.totalTrusted >= 1) {
    console.log(`Video ${eventId} is flagged by trusted users!`);
    // UI logic: blur thumbnail, show warning
  }
});

// 4. Submit a report (as the viewer)
await moderationService.submitReport({
  eventId: videoEventId,
  type: 'nudity',
  targetPubkey: videoAuthorPubkey,
  content: 'Contains explicit content'
});
```

## Public API Summary

| Method | Description |
| :--- | :--- |
| `setViewerPubkey(pubkey)` | Sets the active user and rebuilds the trust graph from their contacts. |
| `subscribeToReports(eventId)` | Starts listening for NIP-56 reports for the given event ID. |
| `submitReport(params)` | Publishes a signed Kind 1984 report event to relays. |
| `getTrustedReportSummary(eventId)` | Returns the current aggregated trust score and report types. |
| `isPubkeyBlockedByViewer(pubkey)` | Checks if the author is blocked/muted by the viewer. |
| `refreshViewerFromClient()` | Helper to sync the viewer with the active Nostr client state. |

## Invariants

-   **Trust is Subjective**: A report only counts if the *viewer* follows the reporter. Changing the viewer changes all trust scores immediately.
-   **Admin Trumps Trust**: Blacklisted users are ignored even if followed. Whitelisted users are trusted even if not followed.
-   **Reactive**: The service emits events (`summary`, `contacts`, `user-blocks`) to drive UI updates; it does not directly manipulate the DOM.

## When to Change

-   **Refactoring**: Logic for "Trusted Mutes" (NIP-51 lists from others) is complex and partially deprecated/evolved. This area may need cleanup.
-   **Performance**: If the number of reports or contacts grows large, the in-memory aggregation (`reportEvents` map) might need optimization or worker offloading.
-   **Protocol Updates**: Changes to NIP-56 or NIP-51 should be reflected here.
