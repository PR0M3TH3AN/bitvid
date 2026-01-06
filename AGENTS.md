# bitvid — AI Agent Guide

This guide tells AI agents how to keep bitvid aligned with the current product direction. Follow it whenever you touch code, content, or documentation inside this repository.

For any nostr related work, please review the nip documentation located in /docs/nips before begining work.

**Comment publishing guardrail:** Session actors are limited to passive telemetry (e.g., view counters). Always require the logged-in Nostr signer when sending video comments through [`js/nostr/commentEvents.js`](js/nostr/commentEvents.js). See the reminder in [`docs/nostr-event-schemas.md`](docs/nostr-event-schemas.md#event-catalogue) for context.

---

## 1. Release Channels: Main vs. Unstable

* **Main** is the production track. Anything merged here must preserve today’s UX and magnet safety guarantees. Rollbacks should be painless: keep commits atomic, avoid destructive migrations, and leave feature flags in a known-good default (`false` unless product explicitly flips them).
* **Unstable** is our experimentation lane. Gate risky behavior behind feature flags defined in `js/constants.js` and document the toggle/rollback plan in PR descriptions.
* **Emergency response:** If a change regresses URL-first playback or breaks magnet parsing, revert immediately, call this out in the PR, and annotate the AGENTS.md changelog with remediation tips. **Note:** These regressions usually surface in dev logs and tests around playback/magnet helpers—reference them when triaging so future agents don’t repeat the mistake.

### Browser logging policy

* Route every browser log through `js/utils/logger.js`. Do **not** call `console.*` directly.
* Use `logger.dev.*` for diagnostics that should disappear in production (flagged by `IS_DEV_MODE`/`isDevMode`). Use `logger.user.*` for operator-facing warnings and errors that must reach production consoles.
* Before promoting a build, flip `IS_DEV_MODE` in `config/instance-config.js` to match the target environment so `window.__BITVID_DEV_MODE__` and the logger channels behave correctly.
* Review and follow [`docs/logging.md`](docs/logging.md) whenever you add new logging or touch inline scripts.

## 2. Mission: URL‑First Playback with WebTorrent Fallback

* **Goal:** Always deliver smooth playback while keeping hosting costs low.
* **Primary transport:** A hosted video URL (MP4/WebM/HLS/DASH) that the `<video>` element can stream directly.
* **Fallback transport:** A WebTorrent magnet that includes browser‑safe trackers plus optional HTTP hints.
* **Runtime behavior:** Call `bitvidApp.playVideoWithFallback({ url, magnet })` in `js/app.js`. This function orchestrates URL probing and magnet fallback, delegating low-level stream handling to `js/services/playbackService.js`. `js/playbackUtils.js` now provides magnet/session helper utilities rather than the playback entry point itself.
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
3. **URL-first promise:** After submission, confirm the resulting feed item carries `data-play-url` and `data-play-magnet` attributes so playback utilities can attempt the URL first.
4. **Mixed-content warnings:** If the page is served over HTTPS, reject `ws=` or `xs=` hints that begin with `http://` and show guidance to upgrade to HTTPS. Document the copy in README/UX strings so operators can align messaging.
5. **Telemetry hooks:** Keep existing analytics/logging untouched unless instructed. If you add new modal states, annotate them clearly in code comments.
6. **Modal regressions:** If validation or helper wiring breaks in Main, disable new feature flags and ship a revert PR immediately. Note the rollback steps in AGENTS.md for posterity.

---

## 5. Manual QA Checklist

Run this script before shipping notable UI changes, especially around upload/playback flows. Automate when possible, but manual verification is required for releases.

1. **Smoke test the modal**

   * Launch the site, open the Upload modal, and confirm required-field validation (title + one of URL/magnet).
   * Submit with URL only, magnet only, and both; ensure success states are clear.
2. **URL-first playback**

   * Publish a post with both URL and magnet. Load the card and verify the player fetches the hosted URL first (check network tab or logs).
   * Temporarily block the URL (e.g., devtools throttling or offline). Confirm playback seamlessly falls back to the magnet.
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

## Next

Please read these documents next.

* `docs/nostr-event-schemas.md`
* `js/nostrEventSchemas.js`

And if you need to create new nostr kinds please keep the logic centralized there in `nostrEventSchemas.js` and the `nostr-event-schemas.md` up to date.

**End of AGENTS.md**
