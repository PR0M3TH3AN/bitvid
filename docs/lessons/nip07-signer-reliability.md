# NIP-07 Signer Reliability & Encrypted-List Loading (hard-won, 2026-06-16)

> Extracted verbatim from `AGENTS.md` §17, which retains a short summary. Dated incident writeup; see also `docs/KNOWN_BUGS.md` #0.

The single biggest source of "DMs / hashtags / watch-history / block & subscription lists won't load after login" is **not** bitvid — it's an **unresponsive NIP-07 signer**. The extension's MV3 background service-worker can die or its content-script↔worker channel can orphan, after which raw `window.nostr` calls hang forever. No client change can force a dead signer to answer.

* **Diagnose first, don't guess.** Run a single raw `window.nostr` probe in the page console (`getPublicKey → nip04.encrypt → nip04.decrypt`) that bypasses bitvid entirely. If *that* hangs, it's the extension/environment. Recommend a well-maintained signer (nos2x, Alby); KeysBand's dead worker was the root cause and switching to nos2x fixed everything.
* **Resilience invariants — do not regress these** (see `docs/KNOWN_BUGS.md` #0 for the full history and the files):
  1. **Cap relay fan-out** (`js/nostr/toolkit.js` `capReadRelays`, ≤8, user-relays-first + 2 reserved default slots). An uncapped cold-login REQ storm to ~20 dead NIP-65 relays starves the single-threaded signer's postMessage round-trips.
  2. **Circuit breaker** on the NIP-07 channel (`js/nostr/nip07Permissions.js`): after N consecutive *timeouts* fast-fail instead of hanging ~15s each. Channel-death errors must count toward opening (not reset it); interactive permission prompts bypass it; one periodic probe detects recovery.
  3. **Never swallow a transient decrypt error as an empty result.** Re-throw channel-death/timeout sub-errors so the retry path runs — returning `[]` turns "signer is slow" into "user has no blocks/lists" and kills retries.
  4. **Generous decrypt budget** (~25–30s/call, ~60s backoff cap); a 6s timeout kills slow-but-responsive signers mid-decrypt. Handshake variant timeout is ~20s for the same reason.
  5. **One actionable user notice** (`js/utils/signerHealthNotice.js`) after a few timeouts with `signerStatus: "present"` — not a silent forever-retry.
* **Don't render into closed modals at login.** Once a responsive signer makes decryption instant, eagerly populating every profile panel at login (friends avatars, subscriptions, blocks, DM summaries) freezes the main thread ~10–15s. Populate each pane lazily on open (`selectPane`) and gate data-change re-render listeners on "is the view open".
* **Deterministic testing.** Reproduce signer-dependent bugs headlessly with a fake `window.nostr` (Playwright `exposeBinding` + `addInitScript`) + a mock relay + configurable channel models (healthy/slow/overload/dead, latency override). See `scripts/perf/nip07-channel-sim.mjs`.
