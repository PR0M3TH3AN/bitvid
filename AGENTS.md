# bitvid — AI Agent Guide

This guide tells AI agents how to keep bitvid aligned with the current product direction. Follow it whenever you touch code, content, or documentation inside this repository.

**Important:** Before starting any development or debugging, please review `KNOWN_ISSUES.md`. This file documents pre-existing test failures, environmental quirks, and architectural limitations that you should be aware of to avoid unnecessary investigation.

For any nostr related work, please review the nip documentation located in /docs/nips before beginning work.

**Comment publishing guardrail:** Session actors are limited to passive telemetry (e.g., view counters). Always require the logged-in Nostr signer when sending video comments through [`js/nostr/commentEvents.js`](js/nostr/commentEvents.js). See the reminder in [`docs/nostr-event-schemas.md`](docs/nostr-event-schemas.md#event-catalogue) for context.

---

## 1. Release Channels: Main vs. Unstable

* **Main** is the production track. Anything merged here must preserve today’s UX and magnet safety guarantees. Rollbacks should be painless: keep commits atomic, avoid destructive migrations, and leave feature flags in a known-good default (`false` unless product explicitly flips them).
* **Unstable** is our experimentation lane. Gate risky behavior behind feature flags defined in `js/constants.js` and document the toggle/rollback plan in PR descriptions.
* **Emergency response:** If a change regresses playback or breaks magnet parsing, revert immediately, call this out in the PR, and annotate the AGENTS.md changelog with remediation tips. **Note:** These regressions usually surface in dev logs and tests around playback/magnet helpers—reference them when triaging so future agents don’t repeat the mistake.

### Browser logging policy

* Route every browser log through `js/utils/logger.js`. Do **not** call `console.*` directly.
* Use `logger.dev.*` for diagnostics that should disappear in production (flagged by `IS_DEV_MODE`/`isDevMode`). Use `logger.user.*` for operator-facing warnings and errors that must reach production consoles.
* Before promoting a build, flip `IS_DEV_MODE` in `config/instance-config.js` to match the target environment so `window.__BITVID_DEV_MODE__` and the logger channels behave correctly.
* Review and follow [`docs/logging.md`](docs/logging.md) whenever you add new logging or touch inline scripts.

## 2. Mission: Hybrid Playback Strategy

* **Goal:** Always deliver smooth playback while optimizing for the configured priority (hosted URL or P2P).
* **Configuration:** `DEFAULT_PLAYBACK_SOURCE` in `config/instance-config.js` determines whether `url` or `torrent` is attempted first.
* **Runtime behavior:** Call `bitvidApp.playVideoWithFallback({ url, magnet })` (implemented in `js/app/playbackCoordinator.js` and bound to the app instance in `js/app.js`). This function attempts the preferred source first and falls back to the alternative if the primary fails or stalls. `js/playbackUtils.js` now provides magnet/session helper utilities rather than the playback entry point itself.
* **Content contract:** bitvid posts (Nostr kind `30078`) must include a `title` and at least one of `url` or `magnet`. Prefer to publish both along with optional `thumbnail`, `description`, and `mode` fields. When mirroring to NIP‑94 (`kind 1063`), copy the hosted URL and (optionally) the magnet so other clients can discover the same asset.

## Styling & Theming Rules (token-first)

* **Single source of truth:** All colors, spacing, radii, and typography decisions must flow through our design tokens; never reach for ad-hoc HEX/RGB values when a token exists.
* **Theme scopes:** Tokens live at three levels—`core` (global primitives), `theme` (light/dark surface/background mappings), and `component` (contextual overrides). Additions must document their scope and consumers.
* **Semantic tokens:** Maintain this canonical list: `bg`, `bg-muted`, `bg-raised`, `text`, `text-muted`, `border`, `border-strong`, `accent`, `accent-hover`, `accent-active`, `accent-muted`, `accent-contrast`, `danger`, `warning`, `success`, `info`, `overlay`, `overlay-strong`.
* **Palette guidance:** Map semantic tokens to palette primitives defined in the CSS build pipeline; when a new primitive is needed, extend the palette once and remap consumers rather than hard-coding colors downstream.
* **Icon contrast rule:** Icons and glyph-only buttons must meet a minimum 3:1 contrast ratio against their background; prefer `accent-contrast` or `text` tokens when in doubt.
* **Accessibility expectations:** Default themes must satisfy WCAG 2.1 AA contrast ratios for text and controls, and preserve focus outlines sourced from the token set.
* **Prohibitions:** Do not commit inline styles, `<font>` tags, or CSS variables whose values are literal colors; always reference the appropriate token variables.
* **Theme toggling:** Implement new themes through token swaps only (e.g., toggling the `data-theme` attribute) and keep component logic agnostic to specific palette values. Document toggles alongside the [README CSS build pipeline](README.md#css-build-pipeline).

---

## 3. Magnet Handling — Do’s & Don’ts

* **Use the helpers every time:** Always run inbound values through `safeDecodeMagnet()` before playback or normalization, and call `normalizeAndAugmentMagnet()` (see `js/magnetUtils.js`) to append `ws=` / `xs=` hints without mutating hashes.
* **Keep magnets raw:** Persist the literal `magnet:?xt=urn:btih:...` string. Decode once, then feed that exact value to WebTorrent or storage. Never rely on re-encoding helpers that might alter casing.
* **Never call `new URL()` on magnets:** URL constructors/`URLSearchParams` percent-encode the `xt` payload and can corrupt legacy hashes. Manipulate magnets with the helper utilities or string functions that respect the raw hash.
* **HTTP hints:** Encourage HTTPS `ws=` web seeds (file roots only) and HTTPS `xs=` pointers to `.torrent` files so fallback peers warm quickly.
* **Tracker policy:** Browser code must ship **WSS trackers only**. Pull the canonical list from `js/constants.js`; do not add UDP or plaintext HTTP trackers. (If you introduce a new tracker set or feature flag, update `js/constants.js` and mention it here.)
* **Validation reference:** When in doubt about legacy infohash handling or normalization, consult the existing tests that cover legacy/bare infohash inputs and magnet normalization. If you extend helper behavior, extend those tests alongside the code.

---

## 4. Upload Modal Troubleshooting

1. **Required fields:** Validation must ensure a title exists and that either a hosted URL or a magnet (or both) is supplied. Optional `ws` / `xs` inputs should be appended only when a magnet is present.
2. **Magnet parsing errors:** When a user pastes encoded magnets, run `safeDecodeMagnet()` before normalizing. Show inline errors if decoding fails and confirm the raw `magnet:?xt=` string survives the round trip.
3. **Playback source promise:** After submission, confirm the resulting feed item carries `data-play-url` and `data-play-magnet` attributes so playback utilities can attempt the configured source first.
4. **Mixed-content warnings:** If the page is served over HTTPS, reject `ws=` or `xs=` hints that begin with `http://` and show guidance to upgrade to HTTPS. Document the copy in README/UX strings so operators can align messaging.
5. **Telemetry hooks:** Keep existing analytics/logging untouched unless instructed. If you add new modal states, annotate them clearly in code comments.
6. **Modal regressions:** If validation or helper wiring breaks in Main, disable new feature flags and ship a revert PR immediately. Note the rollback steps in AGENTS.md for posterity.

---

## 5. Manual QA Checklist

Run this script before shipping notable UI changes, especially around upload/playback flows. Automate when possible, but manual verification is required for releases.

1. **Smoke test the modal**

   * Launch the site, open the Upload modal, and confirm required-field validation (title + one of URL/magnet).
   * Submit with URL only, magnet only, and both; ensure success states are clear.
2. **Hybrid playback**

   * Publish a post with both URL and magnet. Load the card and verify the player fetches the configured preferred source first (check network tab or logs).
   * Temporarily block the primary source (e.g., devtools throttling or offline). Confirm playback seamlessly falls back to the secondary source.
3. **Magnet hygiene**

   * Paste an encoded magnet; ensure `safeDecodeMagnet()` returns the raw value and the final string still includes the original `xt` hash.
   * Confirm `normalizeAndAugmentMagnet()` appends `ws=`/`xs=` hints without corrupting parameters.
4. **P2P hints**

   * Verify magnets authored through the modal include HTTPS `ws=` and optional `xs=` values when provided.
   * Ensure tracker lists come from `js/constants.js` and remain WSS-only.
5. **Cross-browser sanity**

   * Spot-check playback in Chromium and Firefox (desktop) to ensure no console errors related to CORS, Range requests, or tracker connections.

Document the run in PR descriptions so QA can cross-reference results.

---

## 6. Moderation Quickstart (bitvid)

The moderation and admin list tooling remain active in bitvid and must follow Nostr moderation policies and QA steps. Review `docs/moderation/README.md` and these key expectations:

1. **Report thresholds:** Parse NIP-56 reports and compute `trustedReportCount` using **only F1 followers**.
2. **Default behaviors:** Blur thumbnails at ≥3 F1 `nudity` reports and block autoplay at ≥2.
3. **Admin lists:** Use NIP‑51 lists — `10000` for mute/downrank and `30000` for admin hard-hide/whitelist. Ensure these list IDs are correctly handled in the profile modal.
4. **Profile Modal Integration:** Admin list toggles and moderation controls in `ProfileModalController` must trigger local state changes and reflect mutations visually without breaking cached profiles.
5. **User overrides:** Add a “show anyway” option to any blurred or blocked content.
6. **Testing:** Run all cases from `docs/moderation/testing.md` before shipping changes. Confirm blur, hide, and override flows function correctly across sessions.
7. **Telemetry and privacy:** Log moderation decisions locally for debugging without leaking PII.
8. **QA demo:** Record a ≤90 s screen demo showing blur/hide/override flows when submitting major moderation work.

---

## 7. Content Schema v3 & Playback Rules

* **Event payloads:** New video notes serialize as version `3` with the JSON shape:
  `{ "version": 3, "title": string, "url"?: string, "magnet"?: string, "thumbnail"?: string, "description"?: string, "mode": "live"|"dev", "isPrivate": boolean, "deleted": boolean, "videoRootId": string }`.
* **Validation:** Every note must include a non-empty `title` plus at least one playable source (`url` or `magnet`). URL-only and magnet-only posts are both valid. Legacy v2 magnet notes stay readable.
* **Upload UX:** The modal collects a hosted HTTPS URL and/or magnet. Enforce HTTPS for direct playback while keeping magnets optional when a URL is supplied.
* **Playback orchestration:** `bitvidApp.playVideoWithFallback` probes and plays the HTTPS URL first, watches for stalls/errors, and then falls back to WebTorrent. When both sources exist, pass the hosted URL through to WebTorrent as a webseed hint.
* **Status messaging:** Update modal copy to reflect whether playback is direct or via P2P so regressions surface quickly during QA.

---

## 8. Architectural Guide: `bitvidApp` vs. UI Controllers

To keep the codebase maintainable, we are moving complex UI logic from `js/app.js` into dedicated controller classes (e.g., `ProfileModalController`, `UploadModal`). **This is an architectural direction for `unstable`**—some controllers may not exist yet. When working on these components, follow these core principles:

#### **Principle: Separation of Concerns**

* **`bitvidApp` (js/app.js): The Orchestrator.** Its main job is to manage application-wide state, wire up services, and orchestrate high-level actions. It should **not** directly manipulate the DOM elements of complex components like modals. Instead, it should instantiate their controllers and communicate with them through a clean API.

* **UI Controllers (e.g., `js/ui/profileModalController.js`): The Specialists.** A controller is responsible for a specific piece of the UI. It manages its own DOM elements, handles user interactions within its scope, and uses services and callbacks provided by `bitvidApp` to perform actions.

#### **State Management: The Source of Truth**

The single source of truth for shared application state (like saved profiles, relay lists, and block lists) lives in modules like `js/state/cache.js` and services like `relayManager`.

1. **`bitvidApp` Writes State:** `bitvidApp` is responsible for calling the functions that mutate this central state (e.g., `setSavedProfiles`, `userBlocks.addBlock`).
2. **`bitvidApp` Notifies the Controller:** After updating the state, `bitvidApp` must call a method on the controller to tell it that its data is stale and it needs to re-render.

   * **Example:** When a user logs in, `bitvidApp` updates the active user and saved profiles, then calls `this.profileModalController.handleAuthLogin(detail)` so the modal can update its own display.
3. **Controller Reads State:** The controller receives functions to *read* this state in its constructor (via the `state` and `services` objects). It should **always** use these functions (e.g., `this.state.getSavedProfiles()`, `this.services.userBlocks.getBlocked()`) to get the data it needs to render.

#### **Execution Flow: Callbacks**

When a user performs an action inside a modal that needs to affect the whole application (like switching a profile or updating relays), the flow is:

1. **User Action:** A user clicks a "Switch Profile" button inside the modal.
2. **Controller Event Handler:** The controller's internal event listener fires.
3. **Controller Invokes Callback:** The controller calls a callback function passed to it by `bitvidApp` (e.g., `this.callbacks.onRequestSwitchProfile({ pubkey })`). It does *not* contain the logic for switching profiles itself.
4. **`bitvidApp` Executes the Logic:** `bitvidApp` provides the implementation for that callback (e.g., `handleProfileSwitchRequest`). This method contains the actual logic to call the auth service, reload videos, and update the application state.

#### **Checklist for Refactoring from `bitvidApp` to a Controller:**

When moving a feature to a controller, follow these steps:

1. **Identify Logic:** Find the methods in `js/app.js` that directly read from or write to the modal's DOM (e.g., old `renderSavedProfiles` or `populateBlockedList` logic).
2. **Create Controller Method:** Implement the new logic inside the controller. Ensure it gets its data from `this.services.*` or `this.state.*`.
3. **Create `bitvidApp` Wrapper:** In `js/app.js`, replace the old logic with a new, thin wrapper method. This wrapper should:

   * a. Update any central application state if needed.
   * b. Call the new method on the controller instance (e.g., `this.profileModalController.populateBlockedList()`).
4. **Wire Up Callbacks:** If the controller needs to trigger an app-wide action, ensure a callback is defined in the controller's constructor and provided by `bitvidApp` during instantiation.
5. **Remove Old Code:** Once fully replaced, delete the old DOM manipulation logic and direct event listeners from `js/app.js`. All interactions should be routed through the controller.

#### **File Map (quick reference)**

* `js/app.js` — **`bitvidApp`** (orchestrator; owns high-level flows like `playVideoWithFallback` wiring)
* `js/services/playbackService.js` — Lower-level playback stream handling
* `js/playbackUtils.js` — Magnet/session helper utilities
* `js/magnetUtils.js` — `safeDecodeMagnet`, `normalizeAndAugmentMagnet` (WSS trackers, `ws=`/`xs=` hints)
* `js/constants.js` — Feature flags, canonical WSS tracker list

---

## 9. Nostr Addressing & NIP-33 (Lessons Learned)

* **Addressing Rule:** NIP-33 events (e.g., videos, long-form content) are uniquely identified by the combination of `kind`, `pubkey`, and the `d` tag.
* **The `d` tag is King:** When creating pointers for these events, **always use the `d` tag** as the identifier.
* **Avoid Logical IDs:** Do not confuse logical identifiers (like `videoRootId`) with the network identifier (`d` tag). While they might often be the same, they are not guaranteed to be.
* **Hydration Pitfall:** If you create a pointer using a logical ID that differs from the `d` tag, relays will fail to find the event during hydration because the index relies on the `d` tag.
* **Fix Pattern:** When resolving a pointer from an event, prioritize checking `tags.find(t => t[0] === 'd')?.[1]` over any other ID field.

---

## 10. Direct Messages (NIP-04 vs NIP-44)

* **Dual Support:** We must support both legacy NIP-04 and newer NIP-44 Direct Messages.
* **Reasoning:** A significant portion of the user base still relies on NIP-04 DMs. While NIP-44 offers better security, we cannot drop NIP-04 support until adoption of the new standard is nearly universal.
* **Implementation:** When working on DM features, ensure code paths exist for both encryption/decryption methods. Do not deprecate or remove NIP-04 handling logic. Other legacy methods can be considered for removal, but NIP-04 is critical.

---

## 11. Telemetry & Error Aggregation

* **Tooling:** Use `npm run telemetry:aggregate` (which runs `scripts/agent/telemetry-aggregator.mjs`) to collect, sanitize, and aggregate errors from CI/test runs, smoke tests, and agent logs.
* **Privacy Policy:** The tool automatically strips PII (IPs, emails, hex keys, bech32 keys) from logs. **Do not** manually inspect raw logs containing PII unless necessary for debugging in a secure environment; rely on the sanitized reports in `ai/reports/`.
* **Opt-in:** Telemetry generation is opt-in. You must set the environment variable `ENABLE_TELEMETRY=true` when running the aggregator.
* **Reports:** Aggregated reports are generated in `ai/reports/telemetry-YYYYMMDD.md` and `artifacts/error-aggregates.json`. These files provide prioritized issues for triage.

---

## 12. Multi-Agent Coordination

This project uses multiple AI agents (Claude Code, OpenAI Codex, Google Jules) working in parallel. Without coordination, agents will create conflicting PRs, duplicate work, and cause painful merge conflicts. Follow these rules to keep things clean.

### Before Starting Work

1. **Check open PRs.** Run the following command to list all open PRs:
   ```
   curl -s "https://api.github.com/repos/PR0M3TH3AN/bitvid/pulls?state=open&per_page=100" | jq '{count: length, titles: [.[].title]}'
   ```
   If another agent already has a PR touching the same files or subsystem, do not create a competing PR. Instead, note the conflict and ask the maintainer how to proceed.
2. **Check this section for in-flight work.** The maintainer may list active work areas below. Respect these reservations.
3. **Read KNOWN_ISSUES.md.** Do not open PRs to fix issues already documented there unless explicitly asked.

### Subsystem Boundaries

To minimize merge conflicts, treat these as independent work zones. An agent should avoid touching files outside its assigned zone in a single PR:

| Zone | Key Files | Description |
|------|-----------|-------------|
| **Nostr Core** | `js/nostr/client.js`, `js/nostr/adapters/`, `js/nostrClientFacade.js` | Protocol client, signers, relay management |
| **Event Schemas** | `js/nostrEventSchemas.js`, `docs/nostr-event-schemas.md` | Event definitions and documentation |
| **Playback** | `js/services/playbackService.js`, `js/playbackUtils.js`, `js/magnetUtils.js` | Video streaming, magnet handling |
| **UI Controllers** | `js/ui/` | Modal controllers, notification, components |
| **State** | `js/state/` | Profile cache, application state |
| **DMs** | `js/ui/dm/`, `js/nostr/dm/` | Direct messaging subsystem |
| **Moderation** | `js/moderation/`, `docs/moderation/` | Content moderation, reports, admin lists |
| **Build & CI** | `.github/workflows/`, `scripts/`, `tailwind.config.cjs` | CI pipeline, lint scripts, build tooling |
| **Styling** | `css/tokens.css`, `css/tailwind.source.css` | Design tokens and Tailwind source |
| **App Orchestrator** | `js/app.js`, `js/app/` | Main app wiring (high conflict risk — only one PR at a time) |

**`js/app.js` is the highest-risk file.** It wires everything together. Never have two agent PRs modifying it simultaneously.

### PR Discipline

- **One subsystem per PR.** A PR that touches Nostr Core and UI Controllers is two PRs. Split them.
- **Small and mergeable.** Target PRs that can be reviewed in one sitting. If a refactor spans 10+ files, break it into sequential PRs.
- **Merge before branching.** Before starting new work on a subsystem, ensure all open PRs for that subsystem are merged or closed.
- **Rebase, don't stack.** Long-lived branches diverge fast with multiple agents. Rebase onto `unstable` frequently.

### Signaling Work to Other Agents

When you create a PR or start work, leave a clear signal:
- **PR title prefix**: Use a descriptive prefix like `[nostr-core]`, `[playback]`, `[ui]`, `[ci]` so the scope is visible at a glance.
- **PR description**: Include a "Files Modified" section listing the key files touched, so other agents can quickly detect conflicts.

### Task Claiming Protocol (TORCH)

Task coordination uses **TORCH** (Task Orchestration via Relay-Coordinated Handoff) — a decentralized locking protocol built on Nostr. Agents publish ephemeral lock events to public relays; locks auto-expire via NIP-40. No tokens, no secrets, no git push required. Works across all platforms (Claude Code, Codex, Jules). See `docs/agents/TORCH.md` for the full protocol documentation.

**Before starting any task:**

1. **Check for existing claims:**
   ```bash
   node scripts/agent/nostr-lock.mjs check --cadence <daily|weekly>
   ```
   Returns JSON with `locked` (claimed agents) and `available` (free agents) arrays. If an agent appears in the `locked` list, **skip it**.

2. **Claim the task:**
   ```bash
   AGENT_PLATFORM=<jules|claude-code|codex> \
   node scripts/agent/nostr-lock.mjs lock \
     --agent <agent-name> \
     --cadence <daily|weekly>
   ```
   The script generates an ephemeral keypair, publishes a lock event to public Nostr relays, and performs a built-in race check. The key is used once and discarded. Locks auto-expire after 2 hours (configurable via `NOSTR_LOCK_TTL`).

   - **Exit 0** = lock acquired, begin work.
   - **Exit 3** = race lost, another agent claimed first. Go back to step 1.
   - **Exit 2** = relay error. Write a `_failed.md` log and stop.

3. **View all active locks** (optional, for debugging):
   ```bash
   node scripts/agent/nostr-lock.mjs list
   ```

**Scheduler agents:** Daily and weekly scheduler agents must follow this protocol in addition to their directory-based rotation logic (`docs/agents/task-logs/daily/` and `docs/agents/task-logs/weekly/`). The lock check happens _after_ determining the next task but _before_ executing it. See the scheduler prompts for the specific implementation steps.

### Currently In-Flight Work

<!-- Maintainer: update this list when assigning work to agents. Agents: check this before starting. -->

_No reservations currently active._

---

## 13. Code Health Rules (CI-Enforced)

Three automated lint checks protect the codebase from common growth problems. These run in CI via `npm run lint` and will block your PR if violated.

### File Size Limits

**Script:** `npm run lint:file-size` (`scripts/check-file-size.mjs`)

- New `.js` files under `js/` must stay **under 1,000 lines**.
- Existing oversized files are grandfathered with a recorded line count. They must **not grow** beyond their recorded count + 50 lines.
- If your change would push a grandfathered file over its limit, **extract logic into a new module first**, then make your change.

**Decomposition strategy for agents:**
1. Identify a cohesive block of logic (e.g., a group of related methods, a subsection of a controller).
2. Extract it into a new file in the same directory.
3. Export the extracted functions/class.
4. Import and re-wire from the original file.
5. Run `npm run lint:file-size` to confirm the original file shrank.
6. Update the grandfathered count if needed (the maintainer will handle this when merging).

### innerHTML Baseline

**Script:** `npm run lint:innerhtml` (`scripts/check-innerhtml.mjs`)

- Every file has a **baseline** innerHTML assignment count. Adding new `innerHTML` usage beyond the baseline fails the lint.
- For new UI code, use **safe DOM APIs** instead:
  ```javascript
  // PREFERRED: auto-escaped, no XSS risk
  element.textContent = userProvidedString;
  const el = document.createElement("div");
  el.className = "card";
  parent.appendChild(el);

  // ACCEPTABLE: innerHTML with escapeHtml for all user data
  import { escapeHtml } from "../utils/domUtils.js";
  container.innerHTML = `<span>${escapeHtml(title)}</span>`;

  // BLOCKED: innerHTML with unescaped user data
  container.innerHTML = `<span>${title}</span>`; // XSS vulnerability
  ```
- If you must add innerHTML (e.g., loading a view template), update the baseline: `node scripts/check-innerhtml.mjs --update` and include the updated BASELINE in your PR.

### Constants — No Duplication

- Relay timing constants live in **`js/nostr/relayConstants.js`** — always import from there.
- Before defining a new numeric constant, search for existing ones with the same value. If a match exists, import it.
- Feature flags live in **`js/constants.js`**.
- Cache policies live in **`js/nostr/cachePolicies.js`**.
- Do not define the same constant in two files. If two modules need the same value, create a shared module and import from it.

---

## 14. Playwright Agent Testing Infrastructure

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
| `testPubkey` | `string` | Hex pubkey of the test key |
| `relayUrl` | `string` | WebSocket URL of the mock relay |

### `data-testid` Selectors

Use these for stable element targeting:

| Selector | Element |
|----------|---------|
| `[data-testid="login-button"]` | Header login button |
| `[data-testid="upload-button"]` | Header upload button (hidden until logged in) |
| `[data-testid="profile-button"]` | Header profile button (hidden until logged in) |
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

---

## 15. Agent Execution Protocol

This section defines the meta-workflow that **every AI agent** must follow when executing tasks in this codebase. It ensures safe, incremental changes, a clear decision trail, and continuity across context resets or agent hand-offs.

### Mindset

- Implement changes safely. Match existing conventions. Leave a clear trail of decisions.
- Correctness > cleverness. Consistent conventions > personal preference. Explicit tradeoffs > "should work."
- Prefer minimal, incremental changes over rewrites. Keep the build and tests green.
- Do not invent files, APIs, libraries, or behaviors. If unsure, inspect the codebase first.

### Scoping the Work

Before writing any code, establish clarity on three things:

1. **Primary goal** — What is being built or fixed?
2. **Success criteria** — How will we know it's done? (e.g., tests pass, feature visible in UI, lint clean)
3. **Non-goals** — What is explicitly out of scope? (Prevents scope creep across agent sessions.)

### External Notes (Persistent State Files)

Agents lose context across sessions. These files act as persistent memory that any agent (or human) can read to resume work or understand project status. **Update them before any likely context reset.**

**Storage Rule:** To prevent conflicts, these files are stored in dedicated directories with timestamps.
- **Read:** Always look for the **latest** timestamped file in the directory (e.g., `ls context/ | sort | tail -n 1`).
- **Write:** Never overwrite an existing file. Create a **new** file with a new timestamp (e.g., `context/CONTEXT_YYYY-MM-DD_HH-MM-SS.md`).

| Directory | File Pattern | Purpose | When to Update |
|-----------|--------------|---------|----------------|
| `context/` | `CONTEXT_<timestamp>.md` | Current goal, scope, assumptions, constraints, and "Definition of Done" | At start; when scope changes |
| `todo/` | `TODO_<timestamp>.md` | Checkbox task list with "Done" and "Blocked/Questions" sections | After planning; after tasks |
| `decisions/` | `DECISIONS_<timestamp>.md` | Key choices made, alternatives considered, and rationale | When making tradeoffs |
| `test_logs/` | `TEST_LOG_<timestamp>.md` | Commands run and their results (including failures) | After every lint/test/build run |

**Rules for external notes:**
- These files are working documents. They should reflect the *current* state of work.
- When starting a fresh task, clear stale content (by writing a fresh file) and re-scope.
- Keep entries concise — bullet points and checklists, not prose.
- `decisions/` is especially important: when you make a tradeoff, write it down so the next agent doesn't undo it.

### Work Loop

For each task item, repeat this cycle:

#### A) Locate

- Identify the relevant code and existing patterns. Find the "right place" to make the change.
- Write a short plan (3–7 bullets) before editing. If the task touches multiple subsystem zones (see Section 12), flag this — it may need to be split into separate PRs.

#### B) Implement

- Make the smallest change that satisfies the requirement.
- Keep edits cohesive. Avoid unrelated refactors in the same commit.
- Follow all conventions already documented in this file (logging via `logger`, token-first styling, magnet safety, schema definitions in `nostrEventSchemas.js`, etc.).

#### C) Verify

- Run the most relevant lint/test commands (see CLAUDE.md "Available Scripts" for the full list):
  ```bash
  npm run lint              # Required
  npm run test:unit:shard1  # Fast feedback; run full suite before PR
  ```
- If there's no test coverage for your change, add focused tests or document in `decisions/` why tests aren't feasible.
- Log all commands and results in a new `test_logs/TEST_LOG_<timestamp>.md` file.

#### D) Update Notes

- Check off completed items in the latest `todo/` file (by creating a new one).
- Record decisions in a new `decisions/` file.
- Log verification results in a new `test_logs/` file.
- **Do this before any likely context/memory reset** — if you're about to hit a token limit, finish a long session, or hand off to another agent, update notes first.

### Context Recovery

If an agent starts a session and finds existing work-in-progress:

1. **Immediately read the latest files** in `context/`, `todo/`, `decisions/`, and `test_logs/`.
2. Resume from the next unchecked item in the latest `todo/` file.
3. Verify the current state by running `git status`, `git log --oneline -10`, and a quick lint/test pass.
4. Do not re-do work that the latest `test_logs/` shows already passed — unless the code has changed since.

### Output Requirements

When finishing a task or handing off, provide:

- **Summary** of what changed and why.
- **Files changed** (list).
- **Verification results** (from the latest `test_logs/` file).
- **Follow-ups / risks / remaining TODOs**.
- **If blocked:** Ask specific questions and propose 1–2 options.

### Quality Bar

| Principle | Meaning |
|-----------|---------|
| Correctness over cleverness | Simple, working code beats elegant abstractions |
| Conventions over preference | Match what's already in the repo, even if you'd do it differently |
| Explicit tradeoffs | Write down *why* in `decisions/`, don't leave the next agent guessing |
| Logged verification | Every claim of "tests pass" must have a `test_logs/` entry to back it up |
| Incremental over sweeping | Small, reviewable changes that keep the build green at every step |

---

## Next

Please read these documents next.

* `docs/nostr-event-schemas.md`
* `js/nostrEventSchemas.js`

And if you need to create new nostr kinds please keep the logic centralized there in `nostrEventSchemas.js` and the `nostr-event-schemas.md` up to date.

**End of AGENTS.md**
