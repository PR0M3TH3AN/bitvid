# ModerationService Overview

The `ModerationService` is the central authority for Trust & Safety within the application. It implements a "Web of Trust" model to filter content, aggregating reports (NIP-56) and mute lists (NIP-51) to determine the visibility and safety level of content.

## Core Concepts

### 1. Web of Trust
Instead of a centralized moderation authority, the service builds a local "trust graph" based on the user's social connections:
- **Viewer**: The currently logged-in user.
- **Trusted Contacts**: Users followed by the Viewer (Kind 3 contact list).
- **Trusted Seeds**: An optional set of admin-defined pubkeys that provide a baseline of trust (e.g., project maintainers).
- **Admin Whitelist/Blacklist**: Hardcoded lists in `accessControl` that override dynamic trust.

### 2. Trust Aggregation
When a piece of content (Event) is reported (Kind 1984), the service aggregates these reports but *only counts reports from trusted users*.
- **Untrusted Reports**: Ignored by default.
- **Trusted Reports**: Count towards the "trust score" for a specific category (e.g., "nudity", "spam").

### 3. Thresholds
The service defines thresholds for automatic actions based on the trusted report count:
- **`AUTOPLAY_TRUST_THRESHOLD` (1)**: If ≥1 trusted user reports content as NSFW/Spam, autoplay is disabled.
- **`BLUR_TRUST_THRESHOLD` (1)**: If ≥1 trusted user reports content, it is blurred by default.
- **`TRUSTED_MUTE_WINDOW_DAYS` (60)**: Mute list entries are considered valid for 60 days to prevent stale mutes from persisting forever.

## Architecture

```mermaid
graph TD
    User[User / Viewer] -->|Follows| Contacts[Trusted Contacts]
    Admins[Admin / Seed List] -->|Augments| Contacts

    Reports[Report Events (Kind 1984)] -->|Ingested| Service[Moderation Service]
    Contacts -->|Filters| Service

    Service -->|Aggregates| Summary[Trusted Report Summary]
    Summary -->|Checks Thresholds| UI[UI Components]

    UI -->|Blur / Hide| Content
```

## Data Flow

1.  **Initialization**:
    - The service initializes with empty sets.
    - When `setViewerPubkey(pubkey)` is called, it fetches the user's Kind 3 Contact List.
    - It merges these contacts with any configured `trustedSeedContacts`.

2.  **Report Ingestion**:
    - The service subscribes to Kind 1984 events referencing active content.
    - When a report arrives, `ingestReportEvent` checks if the reporter is in the `trustedContacts` set.
    - If trusted, the report is indexed by `targetEventId` -> `reportType`.

3.  **Summary Recomputation**:
    - `recomputeSummaryForEvent` calculates the total number of *trusted* reports per category.
    - It emits a `summary` event, which UI components listen to (e.g., `VideoCard`).
    - It logs "threshold transitions" (e.g., "autoplay-block-enabled") to the user logger.

4.  **Muting**:
    - **Viewer Mutes**: The user's own Kind 10000 mute list. Directly hides content.
    - **Trusted Mutes**: Aggregates mute lists from trusted contacts. If enough trusted users mute an author, that author may be flagged (feature partially implemented via `trustedMutedAuthors`).

## Key Methods

-   `setViewerPubkey(pubkey)`: Switches the active user context, reloading trust lists.
-   `submitReport({ eventId, type, ... })`: Publishes a NIP-56 report to relays.
-   `getTrustedReportSummary(eventId)`: Returns the current trust status for an event.
-   `getAccessControlStatus(pubkey)`: Checks against the hardcoded Admin Whitelist/Blacklist.

## Internal Utilities

The file includes internal implementations of `bech32` encoding/decoding. This is done to:
1.  Reduce external dependencies for critical path logic.
2.  Ensure consistent handling of `npub` / `hex` conversions without relying on the global `NostrTools` object potentially being unavailable or different versions.
