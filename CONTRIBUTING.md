# Contributing to bitvid

Thanks for helping build an open video ecosystem on nostr!

## License Model

- **App** (this repo): GPL-3.0-or-later
- **Potential SDKs/embeds** (if split later): Apache-2.0 (to keep integration friction low)

All contributions to this repository are made under the repository’s license (GPL-3.0-or-later).

## Developer Certificate of Origin (DCO)

We use the DCO to keep contributions simple and legally sound. Sign your commits with `-s`:

```bash
git commit -s -m "feat: add cool thing"
```

This adds a `Signed-off-by: Your Name <you@example.com>` line and certifies you have the right to contribute under the project license.
See [https://developercertificate.org/](https://developercertificate.org/) for the full text.

## (Optional) Contributor License Agreement (CLA)

If we later introduce **dual-licensing** options (e.g., commercial licenses for enterprises), we may add an _optional_ CLA for contributors who want to grant relicense rights. You will be asked to agree explicitly in any PR that requires it. We will keep community use under GPL-3.0-or-later.

## Code Guidelines

- Prefer small, focused PRs.
- Add tests where reasonable; keep UI accessible.
- Follow existing formatting/lint rules.
- Update docs and user-facing text when behavior changes.
- Do not commit `css/tailwind.generated.css`; it is generated at build time.

## Agent PR Conventions

Automated agents contributing to this repository should follow these rules:

- **Atomic Commits**: Keep changes small, focused, and self-contained.
- **Descriptive Titles**: Use clear, semantic titles (e.g., `fix(ui): resolve upload modal overflow`).
- **Commit Messages**: Use the convention `type(scope): description (agent)` (e.g., `fix(ai): formatting (agent)` or `docs(ai): update quickstart (agent)`).
- **Reference Issues**: Link to relevant issues in the PR description.
- **Review AGENTS.md**: Always consult `AGENTS.md` for specific architectural guidelines (like URL-first playback, token-first design system) and constraints before starting work.
- **Review KNOWN_ISSUES.md**: Before starting development or debugging, review `KNOWN_ISSUES.md` to avoid investigating pre-existing failures or limitations.
- **Dependency Upgrades**: Major or risky dependency upgrades must be documented by creating a Markdown file in the `issues/` directory (e.g., `issues/upgrade-<pkg>.md`) with a plan and risk assessment, rather than opening an immediate PR.
- **Efficiency**: Prefer running targeted or sharded tests (e.g., `npm run test:unit:shard1`, `shard2`, or `shard3`) to conserve resources during iteration.

## Submitting a Pull Request

1. Fork the repository and create a new branch from `main`.
2. Make your changes, adding tests if applicable.
3. Run `npm run format`, `npm run lint`, and unit tests (e.g. `npm run test:unit` or a shard like `npm run test:unit:shard1`) to ensure quality before pushing.
4. (Optional) Run `npm run test:visual` if you made UI changes.
5. (Optional) Run domain-specific tests if relevant (e.g., `npm run test:dm:unit` for Direct Messages).
6. Push your branch and open a Pull Request against the `main` branch.
7. Provide a clear description of the problem and solution.

## CI Behavior and Operations

### Concurrency (superseded runs)

The `CI` workflow is configured with `concurrency.cancel-in-progress: true`, which means when you push new commits to the same PR or branch, any in-flight run for the same workflow group is canceled automatically. This keeps the latest changes running and stops superseded runs from burning capacity. If you need to cancel runs manually (for example, stuck or obviously outdated runs), operators can use the GitHub CLI:

```bash
gh run list --workflow=CI --limit 10
gh run list --workflow=CI --limit 10 | awk 'NR>1 {print $1}' | xargs -n1 gh run cancel
```

If a run refuses to cancel normally, GitHub provides a `force-cancel` endpoint. We only use this in the automated cleanup workflow (below) or when a normal `gh run cancel` does not take effect.

### Job timeouts

Each job in the `CI` workflow has an explicit timeout:

- `build`: 45 minutes
- `unit-tests` (sharded): 30 minutes
- `dm-unit-tests`: 20 minutes
- `dm-integration-tests`: 30 minutes
- `e2e-headless`: 45 minutes

If a job exceeds its timeout, the runner terminates it automatically, so keep an eye on the longest-running suites when adjusting tests.

### Cleanup workflow (manual invocation)

The `Cleanup stuck workflow runs` workflow cancels queued or in-progress runs older than the configured stale threshold (currently 2 hours). It runs on a schedule every 30 minutes, but you can also trigger it manually:

```bash
gh workflow run "Cleanup stuck workflow runs"
```

This workflow uses the `force-cancel` endpoint to ensure stalled runs are terminated reliably, so prefer it for true stuck runs instead of normal cancellation.

## Development Setup

To set up the project locally:

1. **Prerequisites**:
   - **Node.js**: v22 or higher (enforced by `.npmrc`).
   - **NPM**: v10 or higher (included with Node 22).

2. **Install Dependencies**:
   Use `npm ci` to ensure you get the exact dependencies from `package-lock.json`.

   ```bash
   npm ci
   ```

3. **Start the Application**:

   ```bash
   npm start
   ```

   This command runs a full production build (generating `dist/` and `css/tailwind.generated.css`) and starts a local server.

   **Or, build manually:**

   ```bash
   npm run build
   npx serve dist
   ```

   (The build command populates the `dist/` directory, which you can then serve locally.)

   **For CSS-only changes:**
   If you are only iterating on styles, you can run the faster CSS build:

   ```bash
   npm run build:css
   ```

4. **Run Tests**:

   ```bash
   npm run test:unit
   ```

   _Note: Running the full suite (`npm run test:unit`) is resource-intensive, runs sequentially, and may time out in some environments. We strongly recommend using sharded runs for local development to save time: `npm run test:unit:shard1`, `shard2`, or `shard3`._

   You can also run end-to-end, smoke, and visual tests:

   ```bash
   npm run test:e2e
   npm run test:smoke
   npm run test:visual
   ```

   To run load tests (agent-driven):

   ```bash
   npm run test:load
   ```

   To update visual regression baselines:

   ```bash
   npm run test:visual:update
   ```

   For Direct Message features, run:

   ```bash
   npm run test:dm:unit
   npm run test:dm:integration
   ```

   To run smoke tests (critical path verification):

   ```bash
   npm run test:smoke
   ```

   To aggregate telemetry from test logs:

   ```bash
   npm run telemetry:aggregate
   ```

5. **Format & Lint**:

   ```bash
   npm run format
   npm run lint
   ```

   - **Format**: Targets CSS, HTML, Markdown, and config files. (Note: JavaScript files are not currently auto-formatted by this command).
   - **Lint**: Checks for CSS errors, hex color usage, inline styles, design tokens, Tailwind guards, file size limits, innerHTML usage, asset references, and Service Worker compatibility. (Note: There is no ESLint configuration for JavaScript logic; this step focuses on style and design system guards).
   - **Note**: `npm run lint` includes an asset verification step (`lint:assets`) which checks the `dist/` directory. For full coverage, run `npm run build` before linting.
   - **Audit**: `npm run audit` runs a design system audit and generates `REMEDIATION_REPORT.md` with auto-fix suggestions.

6. **Git Hooks (Optional)**:
   We provide a script to set up a git pre-commit hook that runs linting and CSS builds automatically before you commit.
   ```bash
   ./scripts/setup-pre-commit.sh
   ```

For a full guide, see the [Local Setup section in README.md](./README.md#local-setup).

### Event Schema Validation

When modifying event schemas or builders, verify your changes against the codebase and test suite:

```bash
node scripts/agent/validate-events.mjs
```

This script checks that all event builders produce valid events according to the definitions in `js/nostrEventSchemas.js`.

### Troubleshooting

- **Browserslist Warning**: If you see `Browserslist: caniuse-lite is outdated` during the build, run:

  ```bash
  npx update-browserslist-db@latest
  ```

- **Unit Test Hangs**: `npm run test:unit` may occasionally hang after completion due to open handles. If this happens, use `Ctrl+C` to exit. For CI or faster local runs, consider running specific shards (e.g., `npm run test:unit:shard1`).

- **Linting Failures**: `npm run lint` includes checks for inline styles (e.g., `style="..."` or `.style.prop = ...`). Move these styles to CSS classes or design tokens to pass linting.

## Dev Container

This project includes a `.devcontainer` configuration for VS Code. It provides a pre-configured environment with Node.js 22, the GitHub CLI, and necessary extensions.

To use it:

1. Open the project in VS Code.
2. When prompted, re-open in Container (or use the command palette: "Dev Containers: Reopen in Container").
3. The container will automatically:
   - Install NPM dependencies (`npm ci`)
   - Run the build (`npm run build`)
   - Install Playwright browsers (so you can run `npm run test:visual`)

## Key Documentation

Before starting your work, please review these key documents:

- **[AGENTS.md](./AGENTS.md)**: Architectural guidelines, mission statement, and troubleshooting tips.
- **[Documentation Index](./docs/README.md)**: A complete list of system documentation, including architecture and feed logic.
- **[Nostr Event Schemas](./docs/nostr-event-schemas.md)**: The source of truth for all Nostr events published by the application.
- **[Playback Fallback](./docs/playback-fallback.md)**: Details on the URL-first playback strategy and WebTorrent fallback mechanism.

## Security

If you find a vulnerability, please email **[security@bitvid.network](mailto:security@bitvid.network)**. We’ll coordinate a responsible disclosure window before public release.

## Trademark

The **bitvid** name and logos are trademarks (see `TRADEMARKS.md`). Don’t use them in ways that imply official sponsorship or confuse users. “Powered by bitvid” attribution is encouraged.
