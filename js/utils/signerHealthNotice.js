// Shared "is the signer actually answering?" notice.
//
// When encrypted lists (blocks, subscriptions, hashtags, DMs) repeatedly time
// out DESPITE a resolved signer (signerStatus "present"), the cause is almost
// always the NIP-07 extension's background/service-worker channel being
// unresponsive — not bitvid (confirmed by a raw window.nostr probe hanging;
// see KNOWN_BUGS #0). Silently retrying forever leaves the user with no idea
// why their lists never load. This surfaces ONE clear, actionable message so
// they can unlock/reload the extension, then stays quiet so it never spams.

import { userLogger } from "./logger.js";

const CONSECUTIVE_TIMEOUT_THRESHOLD = 3;
const NOTICE_COOLDOWN_MS = 120_000;

const NOTICE_MESSAGE =
  "Your Nostr signer extension isn't responding to decryption requests, so " +
  "encrypted data (hashtags, subscriptions, block list, DMs) can't load. This " +
  "is usually the extension's background worker going to sleep or getting " +
  "stuck. Try unlocking it and/or reloading the extension (toggle it off and " +
  "on from your browser's extensions page), then refresh bitvid.";

let consecutiveTimeouts = 0;
let lastNoticeAt = 0;
let lastDetail = null;

/**
 * Record that a list decrypt timed out while the signer reported itself present.
 * After a few consecutive such timeouts, emit ONE user-facing notice (rate
 * limited) telling the user their signer is unresponsive.
 */
export function noteSignerDecryptTimeout(context = "list") {
  consecutiveTimeouts += 1;
  lastDetail = { context, consecutiveTimeouts, at: Date.now() };
  const now = Date.now();
  if (
    consecutiveTimeouts >= CONSECUTIVE_TIMEOUT_THRESHOLD &&
    now - lastNoticeAt > NOTICE_COOLDOWN_MS
  ) {
    lastNoticeAt = now;
    userLogger.error(`[signer-unresponsive] ${NOTICE_MESSAGE}`, {
      context,
      consecutiveTimeouts,
    });
  }
}

/**
 * Record that a signer call succeeded — the channel is alive, so reset the
 * streak (a single later timeout shouldn't immediately re-warn).
 */
export function noteSignerDecryptSuccess() {
  consecutiveTimeouts = 0;
}

export function getSignerHealthState() {
  return { consecutiveTimeouts, lastNoticeAt, lastDetail };
}

export const __testExports = {
  CONSECUTIVE_TIMEOUT_THRESHOLD,
  NOTICE_COOLDOWN_MS,
  reset() {
    consecutiveTimeouts = 0;
    lastNoticeAt = 0;
    lastDetail = null;
  },
};
