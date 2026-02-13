# ProfileModalController Overview

**File:** `js/ui/profileModalController.js`
**Role:** Manages the user profile interface, including login, settings, and profile editing.

## Summary

The `ProfileModalController` is a complex UI orchestrator that manages the "Profile" modal. This modal is the central hub for user identity and configuration in bitvid. It handles:

1.  **Authentication**: Login (NIP-07, NIP-46, nsec), Logout, Account Switching.
2.  **Profile Editing**: Updating metadata (name, about, picture) via NIP-01.
3.  **Wallet (NWC)**: Configuring Nostr Wallet Connect for zaps.
4.  **Relays**: Managing read/write relays and NIP-65 lists.
5.  **Moderation**: Managing mute lists, block lists, and content warnings.
6.  **Direct Messages**: Viewing and sending encrypted DMs (NIP-04/NIP-44).
7.  **Storage**: Managing R2/S3 credentials for uploads.

## Architecture

Due to its complexity, `ProfileModalController` delegates specific domains to sub-controllers:

| Controller | Role |
|String|String|
| `ProfileWalletController` | Manages NWC connection string and wallet balance/status. |
| `ProfileStorageController` | Manages S3/R2 endpoints and credentials. |
| `ProfileRelayController` | Manages relay lists and connectivity status. |
| `ProfileDirectMessageController` | Manages DM inbox, chat view, and encryption. |
| `ProfileHashtagController` | Manages followed hashtags (future/experimental). |

The main controller handles the "Account" pane (login/switch/edit) and orchestrates the navigation between these sub-controllers.

## Key Flows

### 1. Opening the Modal
- **Call:** `controller.open(pane)`
- **Action:**
  - Ensures the modal DOM is visible.
  - Updates global modal state (`setGlobalModalState`).
  - Calls `selectPane(pane)` to load the specific view.

### 2. Switching Panes
- **Call:** `controller.selectPane(paneName)`
- **Action:**
  - Updates the active tab UI.
  - Hides/shows the corresponding content section.
  - Lazily initializes the sub-controller if needed (e.g., `relayController.render()` is called when switching to "relays").

### 3. Login / Switch Account
- **User Action:** Clicks "Add account" or selects a saved profile.
- **Controller:**
  - `handleAuthLogin` is triggered.
  - Calls `callbacks.onRequestLogin` or `callbacks.onRequestSwitchProfile`.
  - `bitvidApp` handles the actual auth logic and updates the state.
  - `bitvidApp` calls back into `controller.renderSavedProfiles()` or `handleActivePubkeyChange()` to update the UI.

## Public API

| Method | Description |
|--------|-------------|
| `open(pane)` | Opens the modal to a specific pane. |
| `hide(options)` | Closes the modal. |
| `selectPane(pane)` | Switches the active view (account, wallet, relays, etc.). |
| `renderSavedProfiles()` | Refreshes the list of saved accounts. |
| `setMobileView(view)` | Toggles between "menu" and "content" views on mobile. |
| `handleAuthLoadingStateChange(detail)` | Updates UI during auth operations. |

## Integration

- **State**: Reads from `this.state` (injected getters) for `activePubkey`, `savedProfiles`, etc.
- **Services**: Uses `this.services` (injected) for `nostrService` calls, `relayManager`, etc.
- **Callbacks**: Emits events via `this.callbacks` (e.g., `onRequestLogout`) which are handled by `bitvidApp`.

## When to Change

- **New Settings**: If adding a new global setting, consider if it belongs in a new sub-controller or an existing one.
- **Refactoring**: This file is very large. Logic related to specific panes should be moved to their respective sub-controllers whenever possible.
