# Decisions Log

## 2026-02-17: Dependency Audit & Upgrade

### Context
Ran a daily dependency audit. Found `esbuild` (0.27.2 -> 0.27.3) as a safe candidate and `nostr-tools` (2.19.4 -> 2.23.0) as a risky candidate.

### Decision: Revert `esbuild` Upgrade
- **Proposal:** Upgrade `esbuild` to 0.27.3.
- **Outcome:** FAILED (Reverted).
- **Reason:** While `npm run build` and `npm run test:unit` passed, `npm run test:e2e` failed immediately with "Executable doesn't exist" (missing Playwright browsers).
- **Rationale:** Strict adherence to "If tests fail, do not open the PR".
- **Action:** Reverted changes to `package.json` / `package-lock.json`. Created `issues/upgrade-esbuild.md` to document the environment blocker.

### Decision: Do Not Auto-Upgrade `nostr-tools`
- **Proposal:** Upgrade `nostr-tools`.
- **Outcome:** BLOCKED (By Policy).
- **Reason:** `AGENTS.md` explicitly forbids auto-upgrading protocol/crypto libraries.
- **Action:** Created `issues/upgrade-nostr-tools.md` with a test plan for manual review.

### Decision: Do Not Auto-Upgrade `tailwindcss` (v4)
- **Proposal:** Upgrade `tailwindcss`.
- **Outcome:** BLOCKED (Major Version).
- **Reason:** Major version bump (v3 -> v4) carries significant risk of breaking changes.
- **Action:** Existing issue `issues/upgrade-tailwindcss.md` is sufficient.

## 2026-02-18: Performance - Bounded Concurrency in AuthService

### Context
`loadOwnProfile` in `js/services/authService.js` was using `Promise.allSettled` on all background relays simultaneously. For users with many relays (e.g., 50+), this caused a massive spike in network requests and CPU usage during login/startup.

### Decision: Use `pMap` with Concurrency Limit
- **Proposal:** Replace `Promise.allSettled` with `pMap` for background relays.
- **Outcome:** IMPLEMENTED.
- **Reason:** To prevent network saturation and UI freeze.
- **Details:** Used `RELAY_BACKGROUND_CONCURRENCY` (3) to limit concurrent background requests. Fast relays (top 3) are still fetched in parallel (unbounded, but small set).
