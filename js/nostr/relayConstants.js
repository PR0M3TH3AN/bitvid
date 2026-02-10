// js/nostr/relayConstants.js
// Canonical relay timing and circuit-breaker constants.
// Import from here — do NOT duplicate these values in other modules.

export const RELAY_CONNECT_TIMEOUT_MS = 5000;
export const RELAY_RECONNECT_BASE_DELAY_MS = 2000;
export const RELAY_RECONNECT_MAX_DELAY_MS = 60000;
export const RELAY_RECONNECT_MAX_ATTEMPTS = 5;
export const RELAY_BACKOFF_BASE_DELAY_MS = 1000;
export const RELAY_BACKOFF_MAX_DELAY_MS = 8000;
export const RELAY_CIRCUIT_BREAKER_THRESHOLD = 3;
export const RELAY_CIRCUIT_BREAKER_COOLDOWN_MS = 10 * 60 * 1000;
export const RELAY_FAILURE_WINDOW_MS = 5 * 60 * 1000;
export const RELAY_FAILURE_WINDOW_THRESHOLD = 3;
export const RELAY_SUMMARY_LOG_INTERVAL_MS = 30000;
