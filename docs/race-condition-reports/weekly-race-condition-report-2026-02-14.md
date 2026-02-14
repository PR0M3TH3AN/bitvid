# Weekly Race Condition Report — 2026-02-14

**Agent:** `bitvid-race-condition-agent`
**Focus Areas:** App initialization, DOM binding, and Login flow (`js/app.js`, `js/index.js`, `js/nostr/client.js`).

## Findings

### 1. Initialization Race: DOM Binding vs. Async Fetch (High Severity)

**Description:**
The application initialization logic (`application.init()`) runs concurrently with the interface bootstrapping logic (`bootstrapInterface()`).
- `application.init()` -> `initializeUserInterface()` -> `_initUI()` attempts to grab DOM elements by ID (e.g., `subscriptionsLink` in the sidebar).
- `bootstrapInterface()` fetches `sidebar.html` over the network and injects it into the DOM.

**Dangerous Interleaving:**
1. `initializeInterface()` calls `startApplication()`, which starts `application.init()`.
2. `initializeInterface()` calls `bootstrapInterface()`, which starts fetching HTML.
3. `application.init()` completes network/service setup and runs `_initUI()`.
4. If the sidebar HTML fetch is slower than the app setup (common on slow networks or fast local app init), `document.getElementById("subscriptionsLink")` returns `null`.
5. `this.subscriptionsLink` remains null, breaking sidebar navigation features (e.g., count updates) for the session.

**Fix Approach:**
Ensure `bootstrapInterface()` completes (DOM is ready) before `application.init()` attempts to bind UI elements.

### 2. Initialization Race: LoginModalController Binding (High Severity)

**Description:**
The `LoginModalController` is responsible for attaching event listeners to the Login modal (e.g., handling "Login with Extension" clicks).
- `bootstrapInterface()` attempts to initialize this controller *if* the `application` instance exists.
- `application` is created asynchronously in `startApplication()`.

**Dangerous Interleaving:**
1. `bootstrapInterface()` finishes loading modals.
2. It checks `if (application && ...)` to initialize the controller.
3. If `startApplication()` (which awaits dynamic imports) hasn't finished assigning the `application` variable yet, the check fails.
4. `bootstrapInterface()` exits without initializing the controller.
5. `application.init()` runs but does *not* explicitly initialize `LoginModalController` in its default flow.
6. Result: The "Login" button opens the modal (handled by `index.js`), but the buttons inside the modal do nothing because the controller never attached listeners.

**Fix Approach:**
1. Serialize startup in `js/index.js` to ensure consistent ordering.
2. Add an explicit `this.initializeLoginModalController()` call within `js/app.js`'s `initializeUserInterface` to guarantee binding once the app is ready.

### 3. Signer Manager Extension Detection (Medium Severity)

**Description:**
`SignerManager.ensureActiveSignerForPubkey` checks for `window.nostr`. If missing, it only waits if `extensionPermissionCache` has entries.
- For a new user (empty cache) who just installed an extension, if `window.nostr` injection is slower than the first auth check (e.g., auto-login or immediate interaction), the signer resolution might fail prematurely.

**Status:**
Not addressing in this run to focus on the critical initialization races.

## Applied Fixes

**PR:** `fix: initialization race conditions in app startup`

1. **`js/index.js`**: Changed `initializeInterface` to `await bootstrapInterface()` *before* calling `startApplication()`. This ensures the DOM (sidebar, modals) is fully loaded before the application logic tries to bind to it.
2. **`js/app.js`**: Added `this.initializeLoginModalController()` to `_initUI()`. This ensures the login controller is always initialized when the UI starts, regardless of the `bootstrapInterface` timing or `application` variable availability.

## Verification

- **Manual Verification:** Verified that `bootstrapInterface` promise is awaited before app start. Verified `_initUI` calls controller init.
- **Automated Tests:** Running `npm run test:unit` to ensure no regressions in app startup logic.
