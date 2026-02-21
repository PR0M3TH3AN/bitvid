# Daily Task: load-test-agent

Date: 2026-02-21
Agent: load-test-agent
Status: Completed

## Summary
Created `scripts/agent/load-test.mjs` to benchmark relay performance.
Verified with `scripts/agent/simple-relay.mjs`.

## Artifacts
- `scripts/agent/load-test.mjs`: The load test harness.
- `artifacts/load-report-20260221.json`: Sample load test report.

## Usage
```bash
RELAY_URL=ws://localhost:8888 CLIENTS=100 node scripts/agent/load-test.mjs
```
