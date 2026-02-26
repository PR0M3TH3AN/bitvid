import fs from 'node:fs';
import { MS_PER_SECOND } from './constants.mjs';

export function todayDateStr() {
  return new Date().toISOString().slice(0, 10);
}

export function nowUnix() {
  return Math.floor(Date.now() / MS_PER_SECOND);
}

export function getIsoWeekStr(dateInput) {
  // Parse input to ensure we work with a Date object
  // If dateInput is YYYY-MM-DD string, new Date() treats it as UTC.
  const d = dateInput ? new Date(dateInput) : new Date();

  // If valid date, use UTC components to avoid local timezone issues
  if (isNaN(d.getTime())) return '';

  // Copy date so we don't mutate the original if passed by reference (though new Date() handles that)
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

  // ISO week date system: Thursday determines the year
  // day: 0 (Sun) -> 6 (Sat). We want 1 (Mon) -> 7 (Sun)
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);

  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);

  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

export function detectPlatform() {
  if (process.env.JULES_API_KEY || process.env.JULES_SESSION_ID) return 'jules';
  if (process.env.CODEX_API_KEY || process.env.CODEX_SESSION_ID) return 'codex';
  if (process.env.GOOSE_API_KEY || process.env.GOOSE_SESSION_ID) return 'goose';
  if (process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_SESSION_ID) return 'claude';
  if (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY) return 'gemini';
  if (process.env.ANTIGRAVITY_API_KEY || process.env.ANTIGRAVITY_SESSION_ID) return 'antigravity';
  if (process.env.QWEN_API_KEY || process.env.QWEN_SESSION_ID) return 'qwen';
  return null;
}

export function mergeRelayList(primaryRelays, fallbackRelays) {
  return [...new Set([...primaryRelays, ...fallbackRelays])];
}

export function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function relayListLabel(relays) {
  return relays.join(', ');
}
