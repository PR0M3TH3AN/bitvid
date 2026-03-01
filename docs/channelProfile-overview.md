# Channel Profile Manager Overview

This module (`js/channelProfile.js`) encapsulates the behavior, rendering logic, and Nostr data synchronization required for displaying a "Channel Profile". This includes parsing the user identifier (npub/hex), fetching the creator's metadata (avatar, banner, description), fetching their video events, constructing `VideoCard` components for their content, and handling profile-level actions like Zaps, Moderation reporting, and Subscriptions.

## Architecture and Responsibilities

- **Identity Parsing:** Handles the conversion of npub strings to hex IDs.
- **Data Hydration:** Subscribes to and processes `kind:0` (metadata) and `kind:34235` (videos) events.
- **Profile Presentation:** Updates the DOM elements containing the channel's banner, avatar, name, follower counts, and 'about' text.
- **Content Grid:** Creates, updates, and inserts `VideoCard` elements into the channel's video feed.
- **Moderation:** Integrates with `moderationService` to display badges/warnings on the channel profile and its videos.
- **Zaps:** Integrates with Lightning Network logic and UI to process tips/zaps directed at the channel owner.
- **Subscriptions:** Handles the follow/unfollow logic.

## Public API Summary

- `initChannelProfile(npub)`: Initializes the channel view for the given npub.
- `hydrateChannelMetadata(hexId, metadataObj)`: Applies fetched metadata to the channel UI.
- `updateChannelGridItem(video)`: Updates or adds a video card in the channel grid.
- `clearChannelVideoCardRegistry()`: Clears the internal mapping of video cards to ensure clean state on navigation.

## When to change

- **Refactoring:** This file is currently 5,500+ lines long and acts as a 'god object' for the channel profile view. Logic for Zaps, Moderation Overlays, and Subscription UI should ideally be extracted to dedicated controllers (e.g., `ChannelZapController`, `ChannelModerationController`).
- **Performance:** Consider changing the grid rendering logic to a virtualized list if channels start containing thousands of videos.
- **Features:** When adding new profile-level interactions (e.g., direct messaging, viewing follower lists).
