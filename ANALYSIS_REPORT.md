# Performance Analysis: NIP-07 Login & Hashtag Syncing

This document outlines the architectural patterns responsible for the high performance and reliability of NIP-07 logins and Hashtag Preference syncing in this repository, compared to standard or "unstable" implementations.

## 1. NIP-07 Login Optimizations

The fast login experience is primarily driven by **Permission Caching** and **Retry Logic**.

### A. Permission Caching (Crucial for Speed)
Standard implementations often call `window.nostr.enable()` every time an action is performed. This can trigger a popup or a delay while the extension verifies the origin.

**This Repository:**
*   **Mechanism:** It persists granted permissions to `localStorage`.
*   **File:** `js/nostr/nip07Permissions.js` -> `readStoredNip07Permissions`.
*   **Logic:** In `js/nostr/client.js`, the `ensureExtensionPermissions` method checks `this.extensionPermissionCache` *before* calling the extension.
*   **Impact:** If the user has logged in before, the client knows it has permission and skips the `enable()` call entirely, resulting in near-instant readiness.

### B. Retry Wrappers (Crucial for Reliability)
Browser extensions inject `window.nostr` asynchronously. A race condition often occurs where the app loads before the extension.

**This Repository:**
*   **Mechanism:** All extension calls are wrapped in `runNip07WithRetry`.
*   **File:** `js/nip07Support.js` (and `js/nostr/nip07Permissions.js`).
*   **Logic:** It attempts the call; if it fails (or `window.nostr` is missing), it waits and retries up to a timeout.
*   **Impact:** Prevents "Nostr extension not found" errors on initial page load.

## 2. Hashtag List Syncing Optimizations

The "Hashtag Preferences" syncing feels fast and robust due to **Optimistic Updates** and **Multi-Scheme Decryption**.

### A. Optimistic UI Updates (Crucial for Perceived Speed)
When a user toggles a tag, the UI shouldn't wait for the network round-trip.

**This Repository:**
*   **Mechanism:** In-memory state update + Event Emission.
*   **File:** `js/services/hashtagPreferencesService.js` (`addInterest`, `removeInterest`).
*   **Logic:**
    1. Update `this.interests` Set immediately.
    2. Emit `change` event.
    3. UI re-renders instantly.
    4. *Then* call `publish()` to sync with relays.
*   **Impact:** The user feels zero latency interaction.

### B. Multi-Scheme Decryption (Crucial for Compatibility)
Extensions vary in which encryption standards they support (NIP-04 vs NIP-44).

**This Repository:**
*   **Mechanism:** `decryptEvent` tries everything.
*   **File:** `js/services/hashtagPreferencesService.js`.
*   **Logic:** It iterates through `['nip04', 'nip44', 'nip44_v2']`. If one fails, it catches the error and tries the next.
*   **Impact:** Ensures data retrieval works even if the user switched extensions or if the data was saved with an older standard.

### C. Dual Kind Support
*   **Mechanism:** Queries for both Kind `30015` (Canonical) and `30005` (Legacy).
*   **Impact:** Ensures preferences aren't "lost" if the user posted them from a different client using the older kind.

## Summary for Porting

To replicate this performance in the unstable repo:

1.  **Implement `readStoredNip07Permissions`** and check it before calling `enable()`.
2.  **Wrap all `window.nostr` calls** in a retry loop (`runNip07WithRetry`).
3.  **Update the Hashtag Service** to modify local state *before* awaiting the `publish` promise.
