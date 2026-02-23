# Smoke Test Harness

The `scripts/agent/smoke-test.mjs` script provides a minimal end-to-end smoke test for critical user flows in bitvid. It is designed to be run by AI agents or CI pipelines to verify that the application is functional.

## Purpose

The smoke test verifies:
1.  **Application Startup**: Ensures the static server and relay connection work.
2.  **Authentication**: Verifies ephemeral key login via the Playwright test harness.
3.  **Publishing**: Uses the UI to publish a video (metadata + magnet) and verifies it appears in the feed.
4.  **Direct Messages**: Verifies the end-to-end flow of sending an encrypted DM and decrypting it using the application's decryption logic (`js/dmDecryptor.js`).

## Usage

### Local Execution

You can run the smoke test locally. It requires `Node.js`, `npm` dependencies installed, and `Playwright` browsers.

```bash
# Install dependencies
npm ci
npx playwright install chromium

# Run the test
node scripts/agent/smoke-test.mjs
```

### Options

| Option | Description | Default |
| :--- | :--- | :--- |
| `--serve` | How to start the app server (`npx`, `python`, `none`). | `npx` |
| `--relays` | Comma-separated list of external relays. If omitted, starts a local mock relay. | `ws://localhost:8877` |
| `--timeout` | Timeout per step in seconds. | `30` |
| `--out` | Output directory for artifacts (logs, screenshots). | `artifacts` |

### Example

```bash
# Run with python server and custom timeout
node scripts/agent/smoke-test.mjs --serve=python --timeout=60
```

## CI Integration

The smoke test produces standard artifacts in the `artifacts/` directory:
- `smoke-YYYYMMDD.log`: Detailed execution log.
- `smoke-YYYYMMDD.json`: Structured summary.
- `smoke-YYYYMMDD-screenshots/`: Screenshots (captured on failure).

These artifacts can be archived by CI for debugging.

## Architecture

The harness uses:
- **Playwright**: For headless browser automation.
- **`js/testHarness.js`**: Injected into the app to provide programmatic login and state inspection.
- **`scripts/agent/simple-relay.mjs`**: A lightweight in-memory Nostr relay for isolated testing.
- **`js/dmDecryptor.js`**: Dynamic import within the browser context to verify client-side decryption logic.
