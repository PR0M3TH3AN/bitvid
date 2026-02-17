// js/nostr/relayConstants.js
// Canonical relay timing and circuit-breaker constants.
// Import from here — do NOT duplicate these values in other modules.

import {
  SHORT_TIMEOUT_MS,
  LONG_TIMEOUT_MS,
  ONE_SECOND_MS,
  TEN_MINUTES_MS,
  FIVE_MINUTES_MS,
  MEDIUM_TIMEOUT_MS,
} from "../constants.js";

export const RELAY_CONNECT_TIMEOUT_MS = SHORT_TIMEOUT_MS;
export const RELAY_RECONNECT_BASE_DELAY_MS = 2000;
export const RELAY_RECONNECT_MAX_DELAY_MS = LONG_TIMEOUT_MS;
export const RELAY_RECONNECT_MAX_ATTEMPTS = 5;
export const RELAY_BACKOFF_BASE_DELAY_MS = ONE_SECOND_MS;
export const RELAY_BACKOFF_MAX_DELAY_MS = 8000;
export const RELAY_CIRCUIT_BREAKER_THRESHOLD = 3;
export const RELAY_CIRCUIT_BREAKER_COOLDOWN_MS = TEN_MINUTES_MS;
export const RELAY_FAILURE_WINDOW_MS = FIVE_MINUTES_MS;
export const RELAY_FAILURE_WINDOW_THRESHOLD = 3;
export const RELAY_SUMMARY_LOG_INTERVAL_MS = MEDIUM_TIMEOUT_MS;
export const RELAY_BACKGROUND_CONCURRENCY = 3;
