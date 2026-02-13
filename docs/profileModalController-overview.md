# ProfileModalController Overview

**File:** `js/ui/profileModalController.js`

The `ProfileModalController` is the central orchestrator for the user profile modal. It manages authentication flows, user settings, wallet interactions, direct messages, and moderation controls. Due to its size (~8000 LOC), it delegates specific domains to sub-controllers (e.g., `ProfileWalletController`, `ProfileDirectMessageController`).

## Public API

The controller exposes a minimal public API for the application orchestrator (`js/app.js`) to interact with.

| Method | Description |
|---|---|
| `show(pane)` | Opens the modal and displays the specified pane (e.g., "account", "wallet"). |
| `hide()` | Closes the modal and resets UI state. |
| `handleAuthLogin(detail)` | Callback triggered after a successful login to refresh data. |

## Architecture & Sub-Controllers

The controller initializes several sub-controllers in its constructor:

- `ProfileWalletController`: Lightning wallet interactions (NWC).
- `ProfileDirectMessageController`: Encrypted DMs (NIP-04/NIP-44).
- `ProfileRelayController`: Relay list management (NIP-65).
- `ProfileHashtagController`: Hashtag following/muting.
- `ProfileStorageController`: Storage provider management.

## Key Flows

### Initialization
1. `constructor` initializes state and sub-controllers.
2. `registerEventListeners` binds DOM events (delegated).

### Opening the Modal
1. `show(pane)` is called.
2. `renderSavedProfiles` updates the account switcher.
3. `open(pane)` makes the modal visible.
4. Expensive operations (e.g., wallet refresh) are deferred via `requestAnimationFrame`.

### Login Flow
1. `handleAuthLogin` is triggered by `js/app.js`.
2. It updates `internalState.activePubkey`.
3. It calls `this.services.fetchProfile(pubkey)` to get metadata.
4. It refreshes all sub-panes (wallet, relays, etc.).

## Refactoring & Maintenance

This file is explicitly identified as a candidate for decomposition in `AGENTS.md`. Future work should focus on:
1. Moving more logic into existing sub-controllers.
2. Creating new sub-controllers for isolated features (e.g., moderation settings).
3. Reducing the size of `handleAuthLogin` by delegating updates.
