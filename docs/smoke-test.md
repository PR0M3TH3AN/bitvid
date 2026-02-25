# Smoke Test Harness

The `scripts/agent/smoke-test.mjs` script verifies critical application flows (login, relay connection, publishing, DM decryption) using a headless browser (Playwright) and a Node.js Nostr client.

It is designed to be lightweight, fast, and suitable for both local development and CI/CD pipelines.

## Features

- **Ephemeral Keys**: Generates fresh keys for every run; never touches your private keys.
- **Headless Browser**: Uses Playwright to verify UI rendering and login state.
- **End-to-End Verification**: Publishes events via Node.js client and verifies them in the browser, and vice-versa.
- **Artifact Generation**: produces logs, JSON summaries, and screenshots on failure (or success).
- **Flexible Configuration**: Supports local relays, external relays, and custom timeouts.

## Usage

### Local Development (Default)

Runs with a local ephemeral relay (port 8899) and starts the app with `npx serve` (port 8000).

```bash
npm run test:smoke
# OR
node scripts/agent/smoke-test.mjs
```

### Custom Output Directory

```bash
node scripts/agent/smoke-test.mjs --out=artifacts/my-run
```

### External Relays

To test against real relays (e.g., in a staging environment):

```bash
node scripts/agent/smoke-test.mjs --relays="wss://relay.example.com,wss://relay2.example.com" --serve=none --confirm-public
```

**Note**: When using public/external relays, you must provide `--confirm-public` to acknowledge that test data will be published. The test uses a unique `d` tag and ephemeral keys to minimize pollution, but always use test-specific relays when possible.

### CLI Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--relays` | string | `ws://localhost:8899` | Comma-separated list of relay URLs. |
| `--serve` | string | `npx` | How to serve the app: `npx`, `python`, or `none`. |
| `--out` | string | `artifacts` | Directory to save logs, screenshots, and summaries. |
| `--timeout` | number | `30` | Timeout in seconds for UI and network operations. |
| `--burst` | number | `1` | (Unused currently) Number of events to publish in burst. |
| `--dry-run` | boolean | `false` | If true, skips publishing and browser interactions. |
| `--confirm-public` | boolean | `false` | Required if non-localhost relays are used. |

## Artifacts

After a run, check the output directory (default `artifacts/`):

- `smoke-YYYYMMDD.log`: Full execution log.
- `smoke-summary-YYYYMMDD.json`: Structured summary (status, event IDs, pubkeys).
- `smoke-test-ui.png`: Screenshot of the feed (success state).
- `smoke-fail-*.png`: Screenshots captured upon failure (login or feed).

## CI Integration

To run this in GitHub Actions or other CI:

```yaml
- name: Install Playwright Browsers
  run: npx playwright install --with-deps chromium

- name: Build App
  run: npm run build

- name: Run Smoke Test
  run: node scripts/agent/smoke-test.mjs --serve=npx --timeout=60
```
