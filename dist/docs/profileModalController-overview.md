# ProfileModalController Architecture Overview

The `ProfileModalController` (`js/ui/profileModalController.js`) is the central orchestrator for the "Profile" modal in the application. This modal acts as the user's dashboard, aggregating account management, direct messages, settings, and moderation tools.

## Architecture Pattern: Facade & Orchestrator

Due to the modal's complexity, the `ProfileModalController` implements a **Facade Pattern**. It delegates domain-specific logic to specialized sub-controllers while presenting a unified interface to the main application (`bitvidApp`).

### Sub-Controllers

*   **`ProfileDirectMessageController`**: Manages the Direct Messages UI, including conversation lists, message rendering, attachments, and NIP-17 sealing.
*   **`ProfileRelayController`**: Handles the relay list, including adding/removing relays, restoring defaults, and displaying health metrics.
*   **`ProfileWalletController`**: Manages NWC (Nostr Wallet Connect) settings and zap configurations.
*   **`ProfileAdminController`**: Handles moderation lists (mute/block) and admin tools (if the user is an instance admin).
*   **`ProfileModerationController`**: Manages content safety settings (blur thresholds, autoplay blocking).
*   **`ProfileHashtagController`**: Manages hashtag preferences (interests/disinterests).
*   **`ProfileStorageController`**: Manages R2/S3 storage credentials for file uploads.

### Responsibilities of the Main Controller

1.  **Lifecycle Management**:
    *   `load()`: Fetches the HTML template and injects it into the DOM.
    *   `show(pane)` / `hide()`: Controls visibility and z-index stacking.
    *   `registerEventListeners()`: Binds global navigation and close buttons.

2.  **Navigation State**:
    *   Tracks the `activePane` (e.g., 'account', 'messages', 'relays').
    *   Handles responsive layout switching (Mobile Menu vs. Desktop Pane).

3.  **Authentication Synchronization**:
    *   `handleAuthLogin()`: Triggered when the user logs in. Hydrates all sub-controllers.
    *   `handleAuthLogout()`: Clears sensitive data (DMs, subscriptions) from the UI.
    *   `switchProfile()`: Orchestrates the session switch to another saved account.

4.  **Shared UI Elements**:
    *   Manages the "Saved Profiles" switcher in the header.
    *   Handles the "Add Account" flow and login modal coordination.

## Initialization Flow

1.  **Instantiation**: Created by `bitvidApp` with references to `services` (Nostr, State, etc.) and `callbacks`.
2.  **Loading**: The `load()` method is called once. It:
    *   Fetches `components/profile-modal.html`.
    *   Injects it into the `modalContainer`.
    *   Caches DOM references (`cacheDomReferences()`).
    *   Initializes sub-controllers.
3.  **Display**: When `show()` is called:
    *   The modal becomes visible.
    *   The requested pane is activated.
    *   Data for that pane is hydrated (e.g., fetching relay lists).

## State Management

The controller relies on a `state` object passed during construction (typically wrapping `js/state/cache.js` or similar). It avoids maintaining authoritative state internally, preferring to read from the global store and re-render.

*   **Saved Profiles**: Stored in `state.getSavedProfiles()`.
*   **Active User**: Derived from `state.getActivePubkey()`.

## Direct Messages Integration

The DM interface inside the modal is effectively a "mini-app". The `ProfileDirectMessageController` handles:
*   Real-time subscription to Kind 4 and Kind 1059 events.
*   Decryption (via `nostrClient` helpers).
*   Attachment uploads (via `r2Service`).
*   Typing indicators and read receipts.

## Key Invariants

1.  **Sub-Controller Isolation**: Sub-controllers should not directly manipulate the DOM of other panes.
2.  **Authentication Guard**: Sensitive panes (DMs, Wallet) must clear their state immediately upon logout (`handleAuthLogout`).
3.  **Responsive Design**: The controller monitors window size to toggle between the mobile "Menu View" and the desktop "Pane View".

## When to Refactor

*   **New Panes**: If adding a new feature pane, create a new `Profile[Feature]Controller.js` and instantiate it in the constructor. Do not add logic directly to the main file.
*   **DOM Bloat**: If `cacheDomReferences` grows too large, move pane-specific selectors to their respective sub-controllers.
