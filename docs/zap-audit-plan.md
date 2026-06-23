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
1. **CORS / LNURL proxy decision (the real reliability fix).** A static client
   can't fetch LNURL endpoints that omit CORS headers, so zaps to many creators
   fail. Options: (a) a small server-side/edge proxy (Vercel function) that fetches
   the LNURL pay-service data + invoice and returns it with CORS — what most web
   wallets do; (b) document the limitation and only support CORS-enabled hosts;
   (c) route via the connected NWC wallet if it can resolve LN addresses. Decide,
   then implement. Confirm whether `unitypay.cash` is also just offline.
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
