# Zap System Audit — Plan & Findings

Status: **in progress** (audit started 2026-06-23). Branch: `unstable`.
Pre-launch priority #3. The zap flow feels clunky and errors on send.

## Architecture (map for the next session)
- **Two controllers**: `js/ui/components/video-modal/zapController.js` (the in-modal
  UI — button, popover, comment/amount inputs; dispatches `video:zap` / `zap:open`)
  and `js/ui/zapController.js` (the logic — `open()`, `sendZap()`, retry, receipts).
  `ModalManager` wires `video:zap → zapController.sendZap`.
- **Payment flow**: `sendZap` → `splitAndZap` (`js/payments/zapSplit.js`) → per share
  (`creator`, `platform`) `processShare` → `lnurl.fetchPayServiceData` →
  `buildZapRequest` (kind 9734, comment in `content`) → `lnurl.requestInvoice`
  (`nostr=` zapRequest + optional `comment=` param) → `wallet.sendPayment` (NWC,
  `nwcClient.js`) → `zapReceiptValidator` (kind 9735).
- **Fee split**: `PLATFORM_FEE_PERCENT` (instance-config, currently 30) →
  `platformShare = floor(amount*fee/100)`, `creatorShare = amount - platformShare`;
  platform address via `platformAddress.js` / `PLATFORM_LUD16_OVERRIDE`.

## Findings so far

### 2026-06-23 session 3 (live-test: successful zap reported as error)
- **A successful zap was shown as a red error (FIXED, item #4).** Live test: zapping
  `NosToons@coinos.io` (CORS-friendly) actually PAID — the platform fee landed — but
  bitvid showed *"Awaiting validated zap receipt… No zap receipt was published on the
  advertised relays."* Root cause: a share whose PAYMENT succeeded (NWC returned a
  preimage) but whose kind-9735 receipt couldn't be validated was routed through
  `notifyError` as a warning. The preimage is proof the invoice was paid; the 9735 is
  supplementary and a static client commonly can't see it (relay coverage/timing/late
  publish). Fixed (`js/ui/zapController.js`): paid-but-unvalidated is now a SUCCESS with
  a soft note ("Payment went through; couldn't confirm the zap receipt on relays").
  Genuine payment failures (status !== success) still go through the failure/retry path.
  Spec-corrected test in `tests/video-modal-zap.test.mjs` (see TEST_INTEGRITY.md).
  RECEIPT DISCOVERY FIXED (item #4, 2026-06-23): the validator queried receipts with
  `{ kinds:[9735], "#bolt11":[invoice] }` — but most relays DON'T index arbitrary tags
  like `bolt11`, so the query returned nothing even when the receipt was published.
  New `buildReceiptFilters` (`js/payments/zapReceiptValidator.js`) queries by the
  reliably-indexed `#e` (event) / `#a` (coordinate) + `#p` (recipient) tags from the
  zap request, falling back to `#bolt11` only if no anchor exists; the precise match
  (author pubkey + bolt11 + description hash) still confirms the right receipt. Tests
  in `tests/zap-receipt-pool.test.mjs` + spec-corrected `tests/zap-split.test.mjs`.
  TIMING GAP CLOSED (2026-06-23): the validator now POLLS for the receipt — up to 3
  lookups (default), ~1.2s apart — so a receipt the recipient's service publishes a
  few seconds after EOSE is still caught. Stops as soon as it's found (no delay in the
  common case); attempts/delay/sleep are injectable (`receiptLookupAttempts`,
  `receiptLookupDelayMs`, `sleep`) and tests stub `sleep` so they don't wait. Reason
  now distinguishes "no events at all" vs "events but none matched". Tests:
  `testValidateZapReceiptRetriesForLateReceipt` (found on 3rd poll) +
  `testValidateZapReceiptGivesUpAfterRetries` in `tests/zap-split.test.mjs`. NOTE: in
  the no-receipt case this adds ~2.4s before the (success-with-note) status shows;
  acceptable for a payment confirmation. A fully background validate-and-upgrade flow
  remains a possible future refinement.
- LOG NOISE seen during the live test (pre-existing, separate items): cold-start
  RELAY STORM (~28 REQ/s, item #9); `bad req: uneven size input to from_hex` (odd-length
  hex reaching a relay — the sanitizer #9 should catch this; re-confirm); watch-history
  bucketing items with `watchedAt:0` into a `1970-01` month (minor watch-history bug).

### 2026-06-23 session 2 (live-test fixes)
- **Couldn't type in the zap comment box (FIXED, real bug).** The shared popover
  engine treats every panel as an ARIA menu and `preventDefault`'d single-character
  + arrow keydowns → every keystroke in the comment/amount fields was swallowed.
  `handleMenuKeydown` now ignores events from editable targets
  (input/textarea/select/contenteditable/role=textbox). Regression test in
  `tests/ui/popoverEngine.test.mjs`.
- **NWC wallet didn't restore "like storage" (FIXED, real bug).** The "already
  offered" flag in `settingsRestorePrompt.js` was per-PUBKEY, so the first item
  offered (storage) flagged the whole account and the wallet note was never offered
  afterward. Now tracked PER-ITEM. Decision (user, 2026-06-23): keep the one-time
  CONFIRM for the wallet (it's a spending secret) — not silent auto-restore.
  Regression test in `tests/settings-restore-prompt.test.mjs`.
- **"Click the Zap button many times before it opens" (FIX — needs live confirm).**
  A click during an in-flight open canceled it (`pendingToggle="close"`), so rapid
  double-clicks toggled the popover back closed. Now an in-flight-open click is
  ignored unless the dialog is already visibly open. (`video-modal/zapController.js`)
- **CORS confirmed for goblinbox** (`unitypay.cash/.well-known/lnurlp/goblinbox` →
  net::ERR_FAILED). With the NWC fix in place, `wallet.hasUri:true` — the send fails
  purely at the LNURL fetch (CORS), not NWC. This is the data point for the proxy
  decision (item 1).

### 2026-06-23 session (fixes landed)
- **NWC wallet connection was BROKEN (launch-blocker, FIXED).** `parseNwcUri`
  (`js/payments/nwcClient.js`) passed the hex `secret` to nostr-tools `getPublicKey`,
  which in v2.x requires a `Uint8Array` → it threw `expected Uint8Array` and the whole
  NWC connect failed (NWC is the only zap payment path). Now converts hex→bytes (try
  hex, fall back to `hexToBytesCompat`). Real-tools regression test:
  `tests/nwc-parse-uri.test.mjs`. (The mock-based `tests/nwc-client.test.mjs` is still
  quarantined — its nostr-tools mock is shadowed by the frozen canonical toolkit; needs
  a harness rework, but the bug itself is fixed + guarded.)
- **In-flight "Sending… sats" status was mis-toned as `warning` (FIXED).** A pending
  state was colored `text-warning-strong` (alarming) and counted as a warning. Now
  `neutral`. (`js/ui/zapController.js`)
- **Success path didn't fully reset the form (FIXED).** The terminal success path
  cleared only the comment (`setZapComment`) while the validation-warning path used the
  holistic `resetZapForm`. Unified to `resetZapForm({amount:"",comment:""})` so amount +
  comment reset consistently after a send. (`js/ui/zapController.js`)
- **Fee-fallback is no-bypass (verified).** `resolvePlatformFeePercent` falls back to
  the configured `PLATFORM_FEE_PERCENT` (30) on an unparseable override — a junk override
  can't silently disable the fee. (Stale test that expected 0 corrected.)
- **3a popover** — FIXED separately (see TODO 3a); the in-modal zap dialog now portals
  to `#uiOverlay` so it positions `bottom-end` under the button.

### Earlier findings
- **Send error = recipient LNURL unreachable (CORS/offline).** [PARTLY FIXED]
  Sending to a creator whose LNURL host is down or lacks CORS headers (observed:
  `unitypay.cash/.well-known/lnurlp/goblinbox`) makes the browser `fetch` reject
  with "Failed to fetch". Shipped (`dd1ce113`): `fetchPayServiceData` now throws a
  clear, coded (`lnurl-unreachable`) message. **Root issue remains**: a static
  client CANNOT fetch CORS-less LNURL hosts — see "CORS proxy" below.
- **Comment box works.** Confirmed via screenshot — the textarea renders and binds;
  the comment is carried in the zap-request `content` + the LNURL `comment` param.
  The earlier "message doesn't work" was the popover being mis-positioned/hard to
  use (see 3a), not a comment bug.
- **Popover mis-positioning (zap + embed)** — see TODO 3a; shared `popoverEngine`.

## To do (next session, in priority order)
1. **CORS / LNURL proxy — DECISION: re-test first (2026-06-23).** Because the NWC
   connection was fully broken (hex secret → `getPublicKey`; fixed this session), an
   unknown share of the observed "send errors" were the NWC bug, NOT CORS. Plan:
   deploy the NWC fix, run real zaps, and measure the actual CORS failure rate before
   committing to a proxy. THEN choose: (a) small Vercel edge proxy that fetches LNURL
   pay-data + invoice and returns with CORS [recommended if the rate is high — what web
   wallets do]; (b) document the limit / CORS-only hosts; (c) route LN-address
   resolution via the connected NWC wallet. Also confirm whether `unitypay.cash` is
   simply offline vs. CORS-less.
2. **Popover positioning (3a).** Fix the shared engine safely (portal in-modal
   panels out to `#uiOverlay`, or remove the modal-subtree containing block).
   Needs the live computed `position/left/top` + DOM parent of `#modalZapDialog`.
   VERIFY non-modal popovers still position right after.
3. **Platform-fee split correctness.** Verify recipients/percentages/rounding;
   ensure the fee can't swallow the whole zap, be bypassed, or (earlier report)
   land the platform fee in the *sender's* own wallet when zapping certain targets.
   Check the self-zap / creator==platform edge case. Add cheat-resistant tests.
4. **Receipt validation (kind 9735).** Confirm accuracy before crediting; the
   `unvalidatedReceipts`/`failureReceipts` paths and the "Awaiting validated zap
   receipt" state. (Earlier fix: `zapReceiptValidator` SimplePool `.list` shim.)
5. **NWC error UX.** "Budget exceeded" and partial-share retry flow — make the
   messaging + retry obviously usable (it's currently terse).
6. **General clunkiness.** Step back on the whole flow: amount presets, the
   split summary, success/partial/failure states, focus, and mobile.

## Cheat-resistant testing notes
- `fetchPayServiceData` / `requestInvoice` accept an injectable `fetcher` — test
  failure modes by injecting rejecting/erroring fetchers (see
  `tests/lnurl-fetch-error.test.mjs`).
- `splitAndZap` takes injectable `dependencies` (see `tests/zap-split.test.mjs`) —
  use it to assert fee math, rounding, and recipient routing without real LN.
