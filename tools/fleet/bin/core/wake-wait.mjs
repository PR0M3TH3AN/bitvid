#!/usr/bin/env node
// One detached waiter for a busy pane. Started by nudgeMail, not by hand.
import { flag, loadConfig, runningAsMain } from '../lib.mjs';
import { runWakeWait } from './ops.mjs';

if (runningAsMain(import.meta.url)) {
  const c = loadConfig();
  runWakeWait(c, {
    area: flag(process.argv, '--area'),
    from: flag(process.argv, '--from') || 'fleet',
    file: flag(process.argv, '--file') || '',
    pollMs: Number(flag(process.argv, '--poll-ms')) || 0,
    maxMs: Number(flag(process.argv, '--max-ms')) || 0,
  });
}
