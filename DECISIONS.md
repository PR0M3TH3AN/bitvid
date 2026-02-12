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
