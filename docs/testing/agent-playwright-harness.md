# Playwright Agent Testing Infrastructure

> Extracted verbatim from `AGENTS.md` §14, which retains a short summary. This is the full reference for the Playwright agent test harness, mock relay, fixtures, and `data-testid` selectors.

bitvid includes a test harness and fixtures that let Playwright CLI agents programmatically log in, seed relay data, and inspect app state — no browser extensions or real relays required.

### Activating Test Mode

Add `?__test__=1` to the URL, or set `localStorage.__bitvidTestMode__ = "1"` via `addInitScript`. This installs `window.__bitvidTest__` on the page.

### Overriding Relays

Point the app at a local mock relay instead of production:

```
?__test__=1&__testRelays__=ws://127.0.0.1:8877
```

Or set `localStorage.__bitvidTestRelays__` to a JSON array of relay URLs.

### Test Harness API (`window.__bitvidTest__`)

| Method | Returns | Purpose |
|--------|---------|---------|
| `loginWithNsec(hexKey)` | `Promise<string>` (pubkey) | Programmatic login, bypasses the modal |
| `logout()` | `void` | Clear active signer |
| `getAppState()` | `{ isLoggedIn, activePubkey, relays, ... }` | Inspect current state |
| `getFeedItems()` | `Array<{ title, pubkey, dTag, hasUrl, hasMagnet }>` | Scrape video cards from DOM |
| `waitForFeedItems(n, ms)` | `Promise<Array>` | Wait for N cards to appear |
| `waitForSelector(sel, ms)` | `Promise<true>` | Wait for a DOM element |
| `getRelayHealth()` | `{ relays, unreachable, backoff }` | Relay connection status |
| `applyRelayOverrides(urls)` | `boolean` | Redirect relay connections |
| `setTestRelays(urls)` | `{ ok, relays }` | Align relayManager + nostrClient to a deterministic relay set |
| `setSignerDecryptBehavior(mode, opts?)` | `{ ok, mode, ... }` | Force decrypt behavior (`passthrough`, `timeout`, `error`, `delay`) for signer-based list sync tests |
| `getListSyncEvents()` | `Array<{ source, at, detail }>` | Read captured sync timeline (`bitvid:auth-loading-state` + `userBlocks` status) |
| `clearListSyncEvents()` | `void` | Reset captured sync events between assertions |
| `waitForListSyncEvent(criteria, ms?)` | `Promise<Event>` | Wait for sync milestones (`status`, `reason`, `source`) |
| `nostrClient` | `NostrClient` | Direct access for advanced use |

### Mock Relay (`scripts/agent/simple-relay.mjs`)

Start with `startRelay(port, { httpPort })`. Alongside the Nostr WebSocket protocol, exposes an HTTP API:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/seed` | `POST` | Inject signed events (single object or array) |
| `/events` | `GET` | List all stored events |
| `/events` | `DELETE` | Clear all events |
| `/health` | `GET` | Event count + connection count |

Programmatic API: `relay.seedEvent(event)`, `relay.clearEvents()`, `relay.getEvents()`.

### Playwright Fixture (`tests/e2e/helpers/bitvidTestFixture.ts`)

Import `test` and `expect` from the fixture for tests that need the full stack:

```typescript
import { test, expect } from "./helpers/bitvidTestFixture";

test("agent can seed and view videos", async ({ page, gotoApp, loginAs, seedEvent }) => {
  await seedEvent({ title: "Test Video", url: "https://example.com/v.mp4" });
  await gotoApp();
  await loginAs(page);
  // ... assertions
});
```

**Available fixture values:**

| Fixture | Type | Purpose |
|---------|------|---------|
| `relay` | Relay instance | Auto-started/stopped per test |
| `seedEvent(video)` | `(TestVideoEvent) => Promise` | Create a signed kind 30078 event and inject it |
| `seedRawEvent(event)` | `(any) => Promise` | Inject a pre-built event |
| `clearRelay()` | `() => Promise` | Wipe all relay events |
| `gotoApp(path?)` | `(string?) => Promise` | Navigate with test mode + relay overrides |
| `loginAs(page)` | `(Page) => Promise<string>` | Login with deterministic test key |
| `setTestRelays(page, relays)` | `(Page, string[]) => Promise<{ok, relays}>` | Force relay alignment through harness + relayManager |
| `setDecryptBehavior(page, mode, opts?)` | `(Page, mode, opts?) => Promise` | Force signer decrypt behavior (`passthrough`, `timeout`, `error`, `delay`) |
| `startDiagnostics(page, opts?)` | `(Page, opts?) => Promise<{stop()}>` | Capture console/page errors and list-sync telemetry for assertions |
| `testPubkey` | `string` | Hex pubkey of the test key |
| `relayUrl` | `string` | WebSocket URL of the mock relay |

### `data-testid` Selectors

Use these for stable element targeting:

| Selector | Element |
|----------|---------|
| `[data-testid="login-button"]` | Header login button |
| `[data-testid="upload-button"]` | Header upload button (hidden until logged in) |
| `[data-testid="profile-button"]` | Header profile button (hidden until logged in) |
| `[data-testid="profile-permission-prompt"]` | Profile list-sync permission CTA container |
| `[data-testid="profile-permission-prompt-button"]` | Profile list-sync permission/retry CTA button |
| `[data-testid="search-input"]` | Header search field |
| `[data-testid="login-modal"]` | Login modal container |
| `[data-testid="login-provider-button"]` | Login provider option buttons |
| `[data-testid="nsec-secret-input"]` | Private key textarea in nsec login |
| `[data-testid="nsec-submit"]` | Nsec login submit button |
| `[data-testid="upload-modal"]` | Upload modal container |
| `[data-testid="upload-title"]` | Video title input |
| `[data-testid="upload-url"]` | Video URL input |
| `[data-testid="upload-magnet"]` | Magnet link input |
| `[data-testid="upload-submit"]` | Publish button |
| `[data-testid="hashtags-sync-status"]` | Profile hashtag sync status message |
| `[data-testid="subscriptions-sync-status"]` | Profile subscriptions sync status message |
| `[data-testid="blocked-refresh-button"]` | Profile blocked creators refresh button |
| `[data-testid="blocked-sync-status"]` | Profile blocked creators sync status message |
| `[data-testid="blocked-list"]` | Blocked creators list container |
| `[data-testid="blocked-empty-state"]` | Blocked creators empty state |
| `[data-testid="video-modal"]` | Video player modal |
| `[data-testid="video-card"]` | Individual video card in the feed |
| `[data-testid="video-list"]` | Video feed grid container |

### Key Files

| File | Purpose |
|------|---------|
| `js/testHarness.js` | Test harness module (installs `window.__bitvidTest__`) |
| `scripts/agent/simple-relay.mjs` | Mock relay with HTTP seeding API |
| `tests/e2e/helpers/bitvidTestFixture.ts` | Reusable Playwright fixture |
| `tests/e2e/agent-testability.spec.ts` | Infrastructure validation tests |
| `scripts/playwright/run-extension-persistent.mjs` | Dedicated persistent-context launcher for extension smoke tests |
| `docs/testing/playwright-integration-recommendations-2026-02-22.md` | Playwright/extension integration recommendations and follow-ups |
| `docs/testing/playwright-function-coverage.md` | Playwright coverage integration, latest baseline metrics, and improvement plan |

