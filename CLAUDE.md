# CLAUDE.md — AI Assistant Guide for bitvid

This document provides context and guidance for AI assistants working with the bitvid codebase. It explains the project structure, development workflows, conventions, and key architectural decisions.

---

## Project Overview

**bitvid** is a decentralized video sharing platform built on the Nostr protocol. It operates as a static client — no backend server, no custody of user keys, no server-side signing. All authentication and state management happens client-side or via connected Nostr signers.

### Key Technologies
- **Nostr**: Decentralized identity and event protocol (NIP-07, NIP-33, NIP-44, NIP-46, NIP-51, NIP-71, etc.)
- **WebTorrent**: P2P video streaming fallback
- **Tailwind CSS**: Utility-first styling with custom design tokens
- **Playwright**: E2E and visual regression testing
- **Node.js 22+**: Development environment

### License
GPL-3.0-or-later (see `LICENSE`)

---

## Codebase Structure

```
bitvid/
├── js/                     # Main application JavaScript
│   ├── app.js              # Main orchestrator (bitvidApp)
│   ├── nostr/              # Nostr protocol implementation
│   │   ├── client.js       # Core Nostr client with signer adapters
│   │   ├── nip71.js        # NIP-71 video note parsing
│   │   ├── sessionActor.js # Anonymous session actors for telemetry
│   │   └── adapters/       # NIP-07, NIP-46, nsec signer adapters
│   ├── services/           # Business logic services
│   │   └── playbackService.js  # Video playback orchestration
│   ├── ui/                 # UI components and controllers
│   ├── state/              # State management (cache.js)
│   ├── utils/              # Utility functions
│   ├── constants.js        # Feature flags and WSS trackers
│   ├── config.js           # Re-exports from instance config
│   ├── magnetUtils.js      # Magnet URI helpers
│   ├── nostrEventSchemas.js    # Event schema definitions (source of truth)
│   └── nostrClientFacade.js    # Main Nostr client entry point
├── config/
│   └── instance-config.js  # Deployment configuration
├── css/
│   ├── tokens.css          # Design token definitions
│   ├── tailwind.source.css # Tailwind input file
│   └── tailwind.generated.css  # Generated (gitignored)
├── tests/                  # Test suites
│   ├── unit/               # Unit tests
│   ├── e2e/                # End-to-end tests
│   ├── visual/             # Visual regression tests
│   ├── nostr/              # Nostr-specific tests
│   └── moderation/         # Moderation feature tests
├── docs/                   # Documentation
│   ├── nostr-event-schemas.md  # Event schema reference
│   ├── playback-fallback.md    # Playback architecture
│   ├── moderation/         # Moderation system docs
│   └── nips/               # NIP reference documentation
├── views/                  # HTML view templates
├── components/             # HTML component templates
├── content/                # Markdown content (docs, roadmap)
├── torrent/                # WebTorrent integration
├── scripts/                # Build and utility scripts
└── .github/workflows/      # CI/CD configuration
```

---

## Essential Files to Know

| File | Purpose |
|------|---------|
| `AGENTS.md` | AI agent guide with architectural rules and mission |
| `KNOWN_ISSUES.md` | Pre-existing test failures and environmental quirks |
| `CONTRIBUTING.md` | Developer setup and contribution guidelines |
| `js/app.js` | Main application orchestrator (`bitvidApp`) |
| `js/nostr/client.js` | Core Nostr client with signer registry |
| `js/nostrEventSchemas.js` | **Source of truth** for all Nostr event schemas |
| `js/constants.js` | Feature flags and runtime configuration |
| `config/instance-config.js` | Deployment-specific settings |
| `js/testHarness.js` | Playwright test harness (`window.__bitvidTest__`) |
| `tests/e2e/helpers/bitvidTestFixture.ts` | Reusable Playwright fixture for agent testing |
| `scripts/agent/simple-relay.mjs` | Mock Nostr relay with HTTP seeding API |
| `docs/nostr-event-schemas.md` | Event schema documentation |
| `context/` | Agent working state: current goal, scope, assumptions (see AGENTS.md §15) |
| `todo/` | Agent task checklist with done/blocked sections (see AGENTS.md §15) |
| `decisions/` | Agent decision log: choices, alternatives, rationale (see AGENTS.md §15) |
| `test_logs/` | Agent verification log: commands run and results (see AGENTS.md §15) |

---

## Development Workflow

### Initial Setup

```bash
# Clone and install
git clone https://github.com/PR0M3TH3AN/bitvid.git
cd bitvid
npm ci                    # Use ci for exact lockfile deps

# Build (generates Tailwind CSS)
npm run build

# Start local server
python -m http.server 8000
# or
npx serve
```

### Before Every PR

```bash
# Required checks
npm run format            # Format CSS/HTML/MD
npm run lint              # All lint checks
npm run test:unit         # Or use shards for faster feedback

# Recommended for UI changes
npm run test:visual
```

### Available Scripts

| Script | Purpose |
|--------|---------|
| `npm run build` | Full build (Tailwind + dist + verify) |
| `npm run build:css` | Regenerate Tailwind only |
| `npm run format` | Format with Prettier |
| `npm run lint` | Run all linting checks |
| `npm run lint:css` | CSS token validation |
| `npm run lint:inline-styles` | Block inline styles |
| `npm run lint:tokens` | Design token enforcement |
| `npm run lint:file-size` | Enforce file size limits |
| `npm run lint:innerhtml` | Enforce innerHTML baseline |
| `npm run test:unit` | Full unit test suite |
| `npm run test:unit:shard1` | Shard 1/3 (faster local dev) |
| `npm run test:unit:shard2` | Shard 2/3 |
| `npm run test:unit:shard3` | Shard 3/3 |
| `npm run test:smoke` | Run critical path smoke tests |
| `npm run test:dm:unit` | Direct message unit tests |
| `npm run test:dm:integration` | DM integration tests |
| `npm run test:e2e` | Headless E2E tests |
| `npm run test:visual` | Visual regression tests |
| `node scripts/agent/validate-events.mjs` | Validate Nostr event schemas |

---

## CI/CD Pipeline

The CI workflow (`.github/workflows/ci.yml`) runs on every push to `main` and all PRs:

| Job | Timeout | Description |
|-----|---------|-------------|
| `build` | 45 min | Lint, build, visual regression |
| `unit-tests` | 30 min | Sharded unit tests (3 shards) |
| `dm-unit-tests` | 20 min | Direct message unit tests |
| `dm-integration-tests` | 30 min | DM integration tests |
| `e2e-headless` | 45 min | Playwright E2E tests |

**Concurrency**: `cancel-in-progress: true` — new commits cancel running jobs.

---

## Code Conventions

### Logging

**Always use the logger utility**, never call `console.*` directly:

```javascript
import { logger } from './utils/logger.js';

logger.user.error('User-facing error');  // Production visible
logger.dev.log('Debug info');            // Dev mode only (IS_DEV_MODE)
```

### Styling Rules

1. **Token-first**: Use design tokens from `css/tokens.css`, never raw hex colors
2. **No inline styles**: `style=` attributes and `element.style` are blocked by lint
3. **Semantic tokens**: Use `bg`, `text`, `accent`, `border`, `danger`, etc.
4. **Theme scopes**: Toggle themes via `data-theme` attribute, not code

### Nostr Event Schemas

All Nostr events must be defined in `js/nostrEventSchemas.js`:

```javascript
import { buildVideoPostEvent, NOTE_TYPES } from './nostrEventSchemas.js';

const event = buildVideoPostEvent({
  pubkey: hexPubkey,
  created_at: Math.floor(Date.now() / 1000),
  dTagValue: 'video-id',
  content: {
    version: 3,
    title: 'My Video',
    videoRootId: 'video-id',
    url: 'https://example.com/video.mp4'
  }
});
```

### Magnet Handling

**Critical rules** — magnets are fragile:

```javascript
import { safeDecodeMagnet, normalizeAndAugmentMagnet } from './magnetUtils.js';

// Always decode first
const raw = safeDecodeMagnet(userInput);

// Then normalize with hints
const enriched = normalizeAndAugmentMagnet(raw, { wsHint, xsHint });

// NEVER use new URL() on magnets — it corrupts hashes!
```

- WSS trackers only (from `js/constants.js`)
- Persist raw magnet strings, decode only at playback
- Include HTTPS `ws=`/`xs=` hints when available

### Architecture Pattern

**Separation of concerns**:

- `bitvidApp` (js/app.js) — Orchestrator, manages app-wide state
- UI Controllers — Handle specific UI components (e.g., `ProfileModalController`)
- Services — Business logic (e.g., `playbackService.js`)
- State — Central truth in `js/state/cache.js`

**Data flow**:
1. User action triggers controller event handler
2. Controller invokes callback provided by `bitvidApp`
3. `bitvidApp` executes logic, updates central state
4. `bitvidApp` notifies controller to re-render

---

## Feature Flags

Feature flags in `js/constants.js` gate experimental behavior:

| Flag | Default | Purpose |
|------|---------|---------|
| `URL_FIRST_ENABLED` | Depends on config | Try URL before magnet |
| `FEATURE_WATCH_HISTORY_V2` | true | Watch history system |
| `FEATURE_PUBLISH_NIP71` | false | NIP-71 video publishing |
| `FEATURE_SEARCH_FILTERS` | Dev mode only | Advanced search |
| `FEATURE_TRUST_SEEDS` | true | Baseline trust seeds |
| `FEATURE_TRUSTED_HIDE_CONTROLS` | true | Trusted mute/spam hide controls |
| `FEATURE_IMPROVED_COMMENT_FETCHING` | true | Improved comment fetching logic |

Toggle at runtime:
```javascript
import { setUrlFirstEnabled } from './constants.js';
setUrlFirstEnabled(false);  // Disable URL-first playback
```

---

## Nostr Integration

### Key NIPs Used

| NIP | Purpose |
|-----|---------|
| NIP-07 | Browser extension signing |
| NIP-33 | Parameterized replaceable events (videos) |
| NIP-04 | Legacy DM encryption |
| NIP-44 | Modern encryption |
| NIP-46 | Remote signing |
| NIP-51 | Lists (mute, admin) |
| NIP-56 | Moderation reports |
| NIP-71 | Video events |

### Signer Adapters

```javascript
import { nostrClient } from './nostrClientFacade.js';
import { setActiveSigner } from './nostr/client.js';

// Register a signer
setActiveSigner({
  pubkey,
  signEvent: (event) => signer.sign(event),
  nip04Encrypt: (target, text) => signer.nip04.encrypt(target, text),
  nip04Decrypt: (actor, cipher) => signer.nip04.decrypt(actor, cipher),
  // Optional: nip44Encrypt, nip44Decrypt
});
```

### NIP-33 Addressing (Important!)

Video events are addressed by `kind + pubkey + d-tag`:

```javascript
// CORRECT: Use the d-tag for addressing
const dTag = event.tags.find(t => t[0] === 'd')?.[1];

// WRONG: Don't use logical IDs like videoRootId for relay lookups
```

---

## Testing Guidelines

### Before Starting Work

1. Read `KNOWN_ISSUES.md` for pre-existing failures
2. Run relevant test shard to verify baseline

### Running Tests

```bash
# Fast feedback during development
npm run test:unit:shard1

# Full suite before PR
npm run test:unit

# Visual changes
npm run test:visual

# DM features
npm run test:dm:unit && npm run test:dm:integration

# E2E journeys
npm run test:e2e
```

### Test Artifacts

Failed visual tests store artifacts in `artifacts/test-results/`:
- Screenshots
- Videos
- Traces

View with: `./scripts/show-artifacts.sh`

### Agent E2E Testing (Playwright)

bitvid includes a test harness for programmatic Playwright testing without browser extensions or real relays. See `AGENTS.md` Section 14 for the full reference. Quick start:

```typescript
import { test, expect } from "./helpers/bitvidTestFixture";

test("my test", async ({ page, gotoApp, loginAs, seedEvent }) => {
  await seedEvent({ title: "Test Video", url: "https://example.com/v.mp4" });
  await gotoApp();
  await loginAs(page);
  // interact with the app using data-testid selectors
  await expect(page.locator('[data-testid="upload-button"]')).toBeVisible();
});
```

Key capabilities:
- **Programmatic login**: `loginAs(page)` uses `window.__bitvidTest__.loginWithNsec()` — no modal interaction needed
- **Mock relay**: Each test gets an isolated in-memory relay with HTTP seeding
- **Relay override**: `?__test__=1&__testRelays__=ws://localhost:8877` redirects all connections
- **State inspection**: `window.__bitvidTest__.getAppState()` returns login status, relays, etc.
- **Stable selectors**: All key elements have `data-testid` attributes (see AGENTS.md Section 14)

---

## Common Tasks

### Adding a New Nostr Event Type

1. Define schema in `js/nostrEventSchemas.js`
2. Add builder function
3. Document in `docs/nostr-event-schemas.md`
4. Add tests

### Creating UI Components

1. Create controller in `js/ui/`
2. Wire callbacks through `bitvidApp`
3. Read state via provided getters, never directly
4. Use design tokens for styling

### Modifying Playback Behavior

1. Check `js/services/playbackService.js` for stream handling
2. Update `js/constants.js` feature flags if needed
3. Test with both URL and magnet sources
4. Document rollback steps in PR

---

## Troubleshooting

### Build Issues

```bash
# Browserslist warning
npx update-browserslist-db@latest

# Tailwind not regenerating
rm css/tailwind.generated.css && npm run build:css
```

### Test Hangs

- Unit tests may hang after completion — use `Ctrl+C`
- Use shards for faster local runs
- Set `UNIT_TEST_TIMEOUT_MS=120000` for slow tests

### Lint Failures

- **Inline styles**: Move to CSS classes or tokens
- **Hex colors**: Use design tokens
- **Design tokens**: Use `theme()` or existing utilities

---

## Release Channels & Promotion Pipeline

Code flows through three branches with increasing stability:

```
unstable  →  beta  →  main
 (dev)      (soak)   (prod)
```

| Branch | Purpose | CI Required | Manual QA |
|--------|---------|-------------|-----------|
| `unstable` | Active development, AI agent PRs land here | Yes | No |
| `beta` | Stabilization soak (hosted for testing) | Yes | Yes — hosted domain |
| `main` | Production | Yes | Verified via beta |

**Promotion rules:**
- `unstable → beta`: After a batch of improvements passes CI and local testing
- `beta → main`: After weeks of soak time on the beta hosted domain with no regressions
- Never push directly to `main` or `beta` — always promote from the previous stage

### Emergency Response

If a change breaks playback or magnet handling:
1. Revert immediately
2. Note rollback in PR
3. Document in AGENTS.md

---

## Multi-Agent Development Workflow

This project uses multiple AI coding agents working in parallel:
- **Claude Code** — Refactoring, convention enforcement, codebase-wide changes
- **OpenAI Codex** — Isolated feature implementation with clear specs
- **Google Jules** — Issue triage and straightforward bug fixes

### Coordination Rules

All agents **must** follow the subsystem boundaries and PR discipline rules in `AGENTS.md` Section 12. The key principles:

1. **Check before you start.** Look at open PRs before beginning work by running:
   ```
   curl -s "https://api.github.com/repos/PR0M3TH3AN/bitvid/pulls?state=open&per_page=100" | jq '{count: length, titles: [.[].title]}'
   ```
   If another agent has an open PR touching the same files, stop and flag the conflict.
2. **One subsystem per PR.** Don't mix unrelated changes. A lint fix and a feature addition are two separate PRs.
3. **`js/app.js` is single-writer.** Only one PR at a time should modify the main orchestrator.
4. **Merge fast, branch short.** Long-lived branches cause exponential merge pain with multiple agents. Keep PRs small and mergeable in one sitting.

### For Human Maintainers

When assigning work to agents:
- Update the "Currently In-Flight Work" section in `AGENTS.md` to reserve subsystems
- Avoid sending two agents at the same subsystem simultaneously
- Review and merge agent PRs promptly to keep the queue short — stale PRs compound conflicts
- Use PR title prefixes (`[nostr-core]`, `[ui]`, `[playback]`, etc.) to make scope visible

---

## Key Documentation

| Document | What It Covers |
|----------|---------------|
| `AGENTS.md` | AI agent rules, mission, architectural decisions |
| `CONTRIBUTING.md` | Setup, PR process, DCO |
| `KNOWN_ISSUES.md` | Pre-existing test failures |
| `docs/nostr-event-schemas.md` | Event definitions |
| `docs/playback-fallback.md` | URL-first strategy |
| `docs/moderation/README.md` | Moderation system |
| `docs/logging.md` | Logger usage |
| `docs/agents/TORCH.md` | TORCH distributed task locking protocol |
| `context/` / `todo/` / `decisions/` / `test_logs/` | Agent persistent state files (see AGENTS.md §15) |

---

## Quick Reference

### Import Patterns

```javascript
// Nostr client
import { nostrClient } from './nostrClientFacade.js';

// View events (analytics)
import { recordVideoView } from './nostrViewEventsFacade.js';

// Watch history
import { updateWatchHistoryListWithDefaultClient } from './nostrWatchHistoryFacade.js';

// Event building
import { buildVideoPostEvent } from './nostrEventSchemas.js';

// Feature flags
import { URL_FIRST_ENABLED, setUrlFirstEnabled } from './constants.js';

// Logger
import { logger } from './utils/logger.js';
```

### Content Schema v3

```javascript
{
  version: 3,
  title: string,           // Required
  url?: string,            // HTTPS video URL
  magnet?: string,         // WebTorrent magnet
  thumbnail?: string,
  description?: string,
  mode: 'live' | 'dev',
  isPrivate: boolean,
  deleted: boolean,
  videoRootId: string      // Stable identifier
}
```

Validation: Must have `title` + at least one of `url` or `magnet`.

---

## Final Notes

1. **Read AGENTS.md first** — it contains mission-critical architectural decisions and the Agent Execution Protocol (§15)
2. **Check KNOWN_ISSUES.md** — avoid investigating pre-existing failures
3. **Use sharded tests** — faster feedback during development
4. **Never commit generated CSS** — `css/tailwind.generated.css` is gitignored
5. **Token-first styling** — no raw colors, no inline styles
6. **Keep magnets raw** — decode only at playback time
7. **Document rollback steps** — especially for playback changes
