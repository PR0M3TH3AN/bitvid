#!/usr/bin/env node
import { runRelayHealthCheck } from '../../src/relay-health.mjs';

function parseArgs(argv) {
  const args = {
    cadence: 'daily',
    timeoutMs: 6000,
    allRelaysDownMinutes: 10,
    minSuccessRate: 0.7,
    windowMinutes: 60,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i];
    if (!value.startsWith('--') && !args.cadence) {
      args.cadence = value;
      continue;
    }
    if (value === '--cadence') {
      args.cadence = argv[i + 1] || args.cadence;
      i += 1;
    } else if (value === '--timeout-ms') {
      args.timeoutMs = Number.parseInt(argv[i + 1], 10) || args.timeoutMs;
      i += 1;
    } else if (value === '--all-relays-down-minutes') {
      args.allRelaysDownMinutes = Number.parseInt(argv[i + 1], 10) || args.allRelaysDownMinutes;
      i += 1;
    } else if (value === '--min-success-rate') {
      const parsed = Number.parseFloat(argv[i + 1]);
      args.minSuccessRate = Number.isFinite(parsed) ? parsed : args.minSuccessRate;
      i += 1;
    } else if (value === '--window-minutes') {
      args.windowMinutes = Number.parseInt(argv[i + 1], 10) || args.windowMinutes;
      i += 1;
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.cadence !== 'daily' && args.cadence !== 'weekly') {
    console.error('Usage: node scripts/agent/check-relay-health.mjs --cadence <daily|weekly>');
    process.exit(1);
  }

  const result = await runRelayHealthCheck(args);
  if (!result.ok) {
    result.failureCategory = 'all relays unhealthy';
  }
  console.log(JSON.stringify(result));
  process.exit(result.ok ? 0 : 2);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error ?? 'unknown error');
  console.log(JSON.stringify({ ok: false, failureCategory: 'health check failed', error: message }));
  process.exit(2);
});
