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

If we later introduce **dual-licensing** options (e.g., commercial licenses for enterprises), we may add an *optional* CLA for contributors who want to grant relicense rights. You will be asked to agree explicitly in any PR that requires it. We will keep community use under GPL-3.0-or-later.

## Code Guidelines

* Prefer small, focused PRs.
* Add tests where reasonable; keep UI accessible.
* Follow existing formatting/lint rules.
* Update docs and user-facing text when behavior changes.
* Do not commit `css/tailwind.generated.css`; it is generated at build time.

## Agent PR Conventions

Automated agents contributing to this repository should follow these rules:
- **Atomic Commits**: Keep changes small and self-contained.
- **Descriptive Titles**: Use clear, semantic titles (e.g., `fix(ui): resolve upload modal overflow`).
- **Commit Messages**: Use the convention `type(scope): description (agent)` (e.g., `fix(ai): formatting (agent)` or `docs(ai): update quickstart (agent)`).
- **Reference Issues**: Link to relevant issues in the PR description.
- **Review AGENTS.md**: Always consult `AGENTS.md` for specific architectural guidelines and constraints before starting work.

## Submitting a Pull Request

1. Fork the repository and create a new branch from `main`.
2. Make your changes, adding tests if applicable.
3. Run `npm run test:unit` and `npm run lint` to ensure quality.
4. Push your branch and open a Pull Request against the `main` branch.
5. Provide a clear description of the problem and solution.

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

1. **Install Dependencies**:
   ```bash
   npm ci
   ```

2. **Build**:
   ```bash
   npm run build
   ```
   (This runs `npm run build:css` to generate Tailwind styles.)

3. **Run Tests**:
   ```bash
   npm run test:unit
   ```
   *Note: Unit tests may take a few minutes to complete.*

4. **Format & Lint**:
   ```bash
   npm run format
   npm run lint
   ```

5. **Git Hooks (Optional)**:
   We provide a script to set up a git pre-commit hook that runs linting and CSS builds automatically before you commit.
   ```bash
   ./scripts/setup-pre-commit.sh
   ```

For a full guide, see the [Local Setup section in README.md](./README.md#local-setup).

### Troubleshooting

- **Browserslist Warning**: If you see `Browserslist: caniuse-lite is outdated` during the build, run:
  ```bash
  npx update-browserslist-db@latest
  ```

## Dev Container

This project includes a `.devcontainer` configuration for VS Code. It provides a pre-configured environment with Node.js 22 and necessary extensions.

To use it:
1. Open the project in VS Code.
2. When prompted, re-open in Container (or use the command palette: "Dev Containers: Reopen in Container").
3. The container will automatically install dependencies and run the build.

## Security

If you find a vulnerability, please email **[security@bitvid.network](mailto:security@bitvid.network)**. We’ll coordinate a responsible disclosure window before public release.

## Trademark

The **bitvid** name and logos are trademarks (see `TRADEMARKS.md`). Don’t use them in ways that imply official sponsorship or confuse users. “Powered by bitvid” attribution is encouraged.
