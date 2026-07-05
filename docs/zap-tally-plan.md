# bitvid-native zap tally — dev plan

> Status: **PLANNED (not started)** · Author: agent handoff · Created 2026-07-04
> Scope: (1) a bitvid-published, preimage-verified zap event so "Most Zapped" and
> the per-card / per-modal zap totals are global, durable, and independent of
> whether the recipient's Lightning provider publishes NIP-57 receipts; and (2) a
> second (orange) zaps-over-time line on the per-video Popularity chart, with a
> legend (red=Views / orange=Zaps) and visible date labels (§5.9).

This document is the single source of truth for the change so work stays neat
across sessions. Read it top to bottom before touching code; the **Task
checklist** at the end is the ordered work queue.

---

## 1. Problem & context

Zap totals today come from **NIP-57 zap receipts (kind 9735)**, which are
published by the **recipient's LNURL / Lightning-address server** — not by
bitvid, not by NWC, not by the sender's wallet. Custodial providers (Strike,
the current `PLATFORM_LUD16_OVERRIDE`) routinely **do not publish** them. So a
paid zap can leave **no on-relay record at all**, and:

- per-card / modal zap badges show `0 sats` for videos that were really zapped,
- "Most Zapped" ranks by recency because the metric is empty,
- there is no global/cross-user tally to display.

### What already exists (as of commit `cbc62306`)

The zap-totals store (`js/zapTotals.js`) already layers three concerns; this
plan **adds a fourth source** and leaves the rest intact:

1. **Real 9735 receipts** — fetched + summed from relays, deduped by event id
   (`runBatch`). Gold standard when they exist. **Keep.**
2. **Session optimistic bump** — `ingestLocalZap`, shown instantly on send,
   cleared when a real receipt for the pointer later arrives. **Keep.**
3. **Durable local ledger** — `localStorage: bitvid:sentZaps:v1`, seeds the
   optimistic layer at construction so the sender's own zaps survive reload.
   Sender-only, per-device, not global. **Keep** (becomes the offline/instant
   overlay).
4. **NEW: bitvid-native zap tally event** — this plan. Global, durable,
   cross-user, cryptographically verifiable, wallet-independent.

### The insight that makes this sound (not a hack)

A NIP-57 receipt is trusted because the recipient's server signs it — but the
reason the *server* can attest is that it holds the **preimage** (proof the
invoice settled). **The payer holds the same preimage** after an NWC
`pay_invoice`. And the invoice's **description hash commits to the zap request**
(`description_hash(bolt11) === sha256(zapRequestJSON)`), and the zap request
contains the **video/profile pointer + amount**. So a payer-signed event
carrying `{ zapRequest, bolt11, preimage }` is verifiable by *any* client with
the same cryptographic strength as a 9735 receipt:

1. `sha256(preimage) === payment_hash(bolt11)` → the invoice was actually paid.
2. `description_hash(bolt11) === sha256(zapRequestJSON)` → that payment was for
   *this* zap request (binds it to the pointer + amount — replay-proof: a stolen
   preimage cannot be reused for a different video).

bitvid **already implements both halves** of the bolt11 decode in
`js/payments/zapReceiptValidator.js` (`extractDescriptionHashFromBolt11`, bech32
tagged-field walker) — we extend it to also pull `payment_hash` and add one
sha256 check. No new crypto dependency.

---

## 2. Goals & non-goals

**Goals**
- A zap the user sends through bitvid produces a **published, verifiable** event
  so **other bitvid users** see it and it ranks on Most Zapped.
- Survives reload / new device (it's on relays).
- Works for **video zaps and profile zaps**.
- Anti-spam by construction (must actually pay to inflate; misattribution
  blocked by the description-hash binding).
- Never double-counts against a real 9735 receipt for the same payment.
- **Popularity chart** (§5.9): a second **orange zaps-over-time line** beside the
  red views line, a **legend**, and **visible date labels** so the chart is
  self-explanatory.

**Non-goals**
- Interop with other Nostr clients' zap UIs. bitvid **cannot** mint a valid
  NIP-57 9735 (that must be signed by the recipient's server), so this event is
  **bitvid-specific**; other clients ignore it. We still *count* real 9735s
  wherever they exist, so bitvid stays a good NIP-57 citizen on the read side.
- Replacing the local ledger or the 9735 path — this is an **additional** source.
- Server-side aggregation. bitvid is a static client; counting stays client-side
  (same as view counts).

---

## 3. The new event

A **regular, non-replaceable** event (one per successful zap share; they sum),
signed by the **payer's active signer** (the logged-in user). Modeled on how the
kind-9735 receipt is shaped so our existing validator logic transfers.

```
kind:    ZAP_TALLY_KIND            // see Open decision D1 (proposed 9736)
pubkey:  <payer pubkey>            // the sender's active signer
created_at: <now>
content: ""                        // (optional: mirror the zap comment)
tags:
  ["p", <recipientPubkey>]                       // zapped party
  ["e", <videoEventId>]        (video zaps)       // from the zap request
  ["a", "30078:<pubkey>:<dTag>"] (video zaps)     // stable coordinate
  ["amount", "<msats>"]                           // echoes the zap request
  ["bolt11", "<invoice>"]                          // carries payment_hash + description_hash
  ["preimage", "<preimage>"]                       // proof of settlement
  ["description", <zapRequestJSON>]                // the signed 9734 (NIP-57 shape)
  ["client", "bitvid"]                             // provenance marker
  ["t", "zap"]
```

- For **profile-only** zaps there is no `e`/`a`; the `p` tag is the pointer.
- `description`, `bolt11`, `preimage`, `amount` are **exactly** what a 9735 would
  carry, so verification reuses the 9735 validator almost verbatim.
- The event is **self-verifying**: no need to trust the `amount` tag — the
  authoritative amount is derived from the bolt11 (as the 9735 path already does
  via `nip57.getSatoshisAmountFromBolt11`).

### Verification algorithm (a valid tally event)
1. `kind === ZAP_TALLY_KIND` and has a `bolt11` + `preimage` tag.
2. `sha256(hexToBytes(preimage)) === payment_hash` extracted from the bolt11.
3. `description_hash` from the bolt11 `=== sha256(utf8(description tag JSON))`.
   *(NIP-57's own check — already the spine of `zapReceiptValidator`.)*
4. Sats = `getSatoshisAmountFromBolt11(bolt11)` (authoritative, not the tag).
5. Pointer keys = the `a`/`e` (and `p`) tags **from the embedded zap request**,
   not the outer event's tags (defense against a mangled wrapper).

Steps 2–3 are the anti-spam core. A faker must pay a real invoice, and cannot
retarget a stolen preimage to a different video (the description hash binds it).

---

## 4. Counting, dedup & reconciliation

The store gains a **fourth input** folded into the same `totals` map. The
critical new concern is **cross-source dedup by `payment_hash`** so a single
payment that produces *both* a 9735 receipt *and* a bitvid tally is counted once.

Per-pointer entry becomes:
```
{
  sats,                 // real receipts (9735) + verified tallies, deduped
  optimisticSats,       // durable ledger + session bumps (unchanged)
  receiptIds: Set,      // dedup by EVENT id (unchanged, for 9735)
  paymentHashes: Set,   // NEW: dedup across sources by payment_hash
  fetchedAt,
}
```

Folding rules in `runBatch` (which now queries **both** kinds — see §5):
- **9735 receipt**: if its `payment_hash` (from its bolt11) is already in
  `paymentHashes` for the pointer → skip; else add sats, record event id +
  payment_hash. 9735 is **preferred**: if a tally with the same payment_hash was
  already counted, the 9735 replaces it (same sats — no delta — but marks the
  payment as recipient-attested).
- **bitvid tally**: run the §3 verification. If it fails → ignore. If its
  `payment_hash` is already counted (by a 9735 or an earlier tally) → skip. Else
  add the bolt11-derived sats, record payment_hash.
- **optimistic/ledger prune** (existing behavior, generalized): when a pointer
  gains *any* real counted zap (9735 **or** verified tally) whose payment_hash
  matches nothing we optimistically bumped, we still clear the pointer's
  `optimisticSats` + ledger entry, because the relay is now authoritative for it.
  (Same "relay wins" rule already shipped; just triggered by tallies too.)

Result: exactly-once counting per real payment, 9735-preferred, tally as the
fallback, local ledger as the instant/offline overlay.

---

## 5. Code changes (file by file)

### 5.1 `js/nostrEventSchemas.js` — new event type + builder
- Add `NOTE_TYPES.ZAP_TALLY = "zapTally"` and a schema entry (kind
  `ZAP_TALLY_KIND`, append-tags, content=text) next to `ZAP_REQUEST`.
- Add `buildZapTallyEvent({ pubkey, created_at, recipientPubkey, eventId,
  coordinate, amountMsats, bolt11, preimage, zapRequestJSON, comment })` mirroring
  `buildZapRequestEvent` (§2270). Returns the unsigned event; caller signs.
- Export the constant `ZAP_TALLY_KIND` (Open decision D1).

### 5.2 `js/payments/zapReceiptValidator.js` — extract payment_hash + verify
- Generalize the existing bolt11 tagged-field walker
  (`extractDescriptionHashFromBolt11`, §164) into a helper that can also return
  the **payment_hash** field (bolt11 tag `p`, 256-bit) — e.g.
  `extractBolt11Fields(bolt11) -> { descriptionHash, paymentHash }`. Keep the old
  function as a thin wrapper (no behavior change to the 9735 path).
- Add `verifyPaymentPreimage(preimage, paymentHash)` = `sha256(hexToBytes(
  preimage)) === paymentHash` (use `@noble/hashes/sha256` already pulled via
  nostr-tools, or WebCrypto `subtle.digest`).
- Add `verifyBitvidZapTally(event, { tools })` implementing §3 steps 1–5,
  returning `{ ok, sats, pointerTags, paymentHash }`. Reuses the description-hash
  check the 9735 validator already performs.

### 5.3 `js/payments/zapSplit.js` — surface bolt11 + preimage on the receipt
- The per-share `receipt` object (§481) already carries `invoice`, `payment`,
  `zapRequest`, `amount`. Add the resolved **preimage** explicitly:
  `receipt.preimage = payment?.result?.preimage || null` (the NWC `pay_invoice`
  result is `payment.result` per `nwcClient.js` §1155; NIP-47 puts the preimage
  there). No flow change — just expose it so the controller can publish a tally.
- (bolt11 is already on `receipt.invoice.invoice`.)

### 5.4 `js/ui/zapController.js` — publish tallies on success
- The success terminal point already fires `this.callbacks.onZapSuccess({ video,
  sats })` (added commit `af09505f`). **Extend the payload** to include the
  per-share proof needed to build tallies:
  `onZapSuccess({ video, sats, shares: receipts.map(r => ({ recipientType,
  amountSats: r.amount, bolt11: r.invoice?.invoice, preimage: r.preimage,
  zapRequest: r.zapRequest })) })`.
- Only include shares whose `status === "success"` **and** have a `preimage`
  (payment settled). Unvalidated-on-relay is fine — that's exactly the case this
  feature exists for.
- The **retry** path (`executeRetry`, §226) should fire the same hook for the
  shares it settles (today it doesn't call onZapSuccess at all — wire it).

### 5.5 `js/ui/ModalManager.js` — build, sign, publish, ingest
- The `onZapSuccess` callback (added `af09505f`, currently just calls
  `ingestLocalVideoZap`) becomes:
  1. Keep the instant `ingestLocalVideoZap(pointer, sats)` (optimistic overlay).
  2. For each successful share with a preimage, call a new
     `app.publishZapTally({ video, share })` (thin app method) that:
     - derives the pointer via `app.deriveVideoPointerInfo(video)` (same key the
       badge uses),
     - builds the tally via `buildZapTallyEvent(...)`,
     - signs with the active signer (the user is logged in to have zapped),
     - publishes via the existing relay-publish path
       (`signAndPublishEvent` / `publishEventToRelays`, using
       `assertAnyRelayAcceptedOrUnconfirmed` — an all-timeout publish is a soft
       success like #49),
     - on success, `store.ingestVerifiedZap(pointer, sats, paymentHash)` so the
       local view is authoritative immediately (and the durable ledger entry can
       be upgraded/cleared — see §4).
- Publishing is **best-effort and non-blocking**: a failed tally publish must not
  affect the payment UX (the sats already moved). Log + rely on the local ledger.

### 5.6 `js/zapTotals.js` — count tallies as a fourth source
- `runBatch`: add a second filter set querying `kinds: [ZAP_TALLY_KIND]` by the
  same `#a`/`#e` pointer batches (and `#p` for profile pointers — see Open
  decision D2). One `manager.list` call can carry both kinds' filters.
- Fold results per §4: verify each tally (`verifyBitvidZapTally`), dedup by
  `payment_hash`, prefer 9735.
- Add `paymentHashes` to entries; thread it through the existing dedup.
- Add `ingestVerifiedZap(pointer, sats, paymentHash)` — like `ingestLocalZap`
  but records the payment_hash and writes to `sats` (authoritative) rather than
  `optimisticSats`, so the sender's own tally isn't re-counted when it comes back
  from the relay (dedup by payment_hash handles the echo).
- Expose `verifyBitvidZapTally` injection point for tests (mirror `getTools`).

### 5.7 `js/constants.js` — feature flag
- Add `FEATURE_ZAP_TALLY` (default **off** for the first ship; flip on after a
  soak). Gate both **publishing** (5.5) and **counting** (5.6) behind it so it's
  a clean rollback and so a half-rolled-out network doesn't miscount.

### 5.8 Profile zaps (optional, same primitives)
- Channel/profile zap surfaces that call the zap flow pass a `p`-only pointer;
  the store keys by `p:<pubkey>`. The card/modal badges are video-scoped today,
  so a profile zap total would surface on channel pages — a follow-up UI task,
  not required for the video path. Track as D2.

### 5.9 Popularity chart: second (orange) zaps line + legend + date axis

The per-video **Popularity** modal (`js/viewCountChart.js`, opened from the ⋯
menu — feature #26) currently plots ONE cumulative **views** series and, notably,
puts the date range only in the SVG `aria-label` — there is **no visible legend
and no visible date labels**. This sub-feature adds a second series and the
missing chart furniture. It can ship in two stages: the chart plumbing works
with today's on-relay zap data (real 9735 receipts) even before the tally event
(§3) exists; tallies simply make the orange line populated for Strike-style zaps.

**Current shape to build on**
- `buildViewCountTimeSeries(events)` → `{ series:[{bucketStart, count,
  cumulative}], total }`, bucketed per day (`VIEW_CHART_WINDOW_SECONDS`).
- `buildViewCountChartSvg(doc, series, {width,height})` — one `<polyline>` +
  area, colored by `svg.classList.add("text-accent")` + `stroke="currentColor"`
  (this instance's `--color-accent` is red). `pad.bottom:18` already reserves
  space for an axis strip that today draws nothing visible.
- The modal (`openPopularityModal`) fetches view events
  (`listVideoViewEventsWithDefaultClient` + `subscribe…`), dedupes by id, and
  re-renders on a 250ms debounce.

**Changes**

1. **Zap time-series data.** Add a `buildZapSatsTimeSeries(events, { tools })`
   next to `buildViewCountTimeSeries`: bucket **cumulative SATS** per day from
   the union of **9735 receipts** and **verified bitvid tallies** (§3), deduping
   by **payment_hash** (reuse the store's rule so the chart and the badge agree).
   Amount per event = `getSatoshisAmountFromBolt11` (authoritative), created_at =
   the receipt/tally timestamp. Output shape mirrors the view series:
   `{ series:[{bucketStart, sats, cumulative}], total }`.

2. **Zap event source.** Add `listVideoZapEventsWithDefaultClient(pointer)` +
   `subscribeVideoZapEvents…` (mirror the view-event facade) that list/subscribe
   `kinds:[9735, ZAP_TALLY_KIND]` for the pointer's `#a`/`#e`. The modal fetches
   BOTH streams (views + zaps) and re-renders on the same debounce. Reuse the
   store's verify + payment_hash dedup helpers (§5.6) so there is one code path
   for "what counts."

3. **Dual-series renderer.** Generalize `buildViewCountChartSvg` into
   `buildPopularityChartSvg(doc, { views, zaps }, opts)` that draws BOTH
   cumulative lines on a shared **time** X axis, each with its **own Y scale**
   (views in counts, zaps in sats are different units — independent per-series
   scaling shows the trend/shape honestly without a misleading shared axis; a
   dual labeled Y-axis is an option — see D5). Colors are token-based:
   - views line/area → `text-accent` / `currentColor` (red) — unchanged.
   - zaps line/area → the **`--color-zap`** orange token added for the badges.
     The token lint forbids raw colors and `var()` in attributes, so add a
     small utility class (e.g. `.text-zap { color: var(--color-zap); }` in
     `css/tailwind.source.css`) and wrap the zap series in a `<g class="text-zap">`
     using `stroke="currentColor"` — same pattern the views line already uses.
   Draw the zap area at a low opacity like the views area so overlaps stay legible.

4. **Legend.** Below/above the chart, a small two-item legend: a red swatch
   "Views" and an orange swatch "Zaps (sats)". Plain DOM (`el(doc,…)` helper),
   token colors via the `.text-accent` / `.text-zap` classes. Include it in the
   modal so both series are labeled; keep it out of the tiny inline card sparkline
   if one is ever added.

5. **Visible date axis.** Draw X-axis tick labels (not just `aria-label`): at
   minimum the first and last bucket dates, ideally 3–4 evenly spaced ticks, using
   the existing `formatDay(seconds)` formatter, as `<text>` nodes in the reserved
   `pad.bottom` strip (token text color, `text-2xs`). Add light vertical gridlines
   at the ticks if it reads cleanly. This answers "users don't know what they're
   looking at."

6. **Headline + copy.** The modal headline stays the authoritative view count;
   add a second line for the zap total (from `store.getSnapshot`, so it matches
   the badge) — e.g. "1.2K views · 4.3K sats zapped". Update the footer note to
   "Public view + zap data · updates as more load."

**Empty/degenerate states** (mirror the view chart): no zaps → no orange line +
a greyed "Zaps (sats)" legend item (or omit); a single zap bucket → flat baseline
segment like the single-view case.

**Independence:** this renders whatever zap events exist on relays. Before the
tally event ships, the orange line reflects only real 9735s (often empty for
Strike); after, it reflects tallies too. The local durable ledger (badge-only,
no per-event timestamps) does **not** feed the time chart — another reason the
published tally matters for a meaningful zaps-over-time line.

---

## 6. Data flow (end to end)

```
User clicks Zap (video modal)
  → zapController.sendZap → runZapAttempt → app.splitAndZap (zapSplit)
      → per share: build 9734 zap request → LNURL callback → invoice
      → NWC pay_invoice → payment.result.preimage
      → receipt { amount, invoice.invoice(bolt11), preimage, zapRequest, status }
  → success terminal:
      onZapSuccess({ video, sats, shares:[{amountSats,bolt11,preimage,zapRequest}] })
        → ingestLocalVideoZap(pointer, sats)          // instant + durable ledger
        → for each settled share: app.publishZapTally  // build→sign→publish
              → store.ingestVerifiedZap(pointer, sats, paymentHash)

Any client later, on a grid/modal:
  store.request(pointer) → runBatch queries kinds [9735, ZAP_TALLY_KIND] by #a/#e
    → 9735: sum (dedup by event id + payment_hash)
    → tally: verifyBitvidZapTally → sum (dedup by payment_hash, 9735-preferred)
  → badge + Most-Zapped metric reflect the global, verified total
```

---

## 7. Security & edge cases

- **Fake inflation** — blocked: must pay a real invoice (preimage check), and the
  sats are bolt11-derived, not tag-claimed. Inflation costs the attacker real
  sats.
- **Preimage replay to another video** — blocked: `description_hash(bolt11)`
  commits to the zap request, which contains the pointer; a retargeted event
  fails step 3.
- **Duplicate publish / relay echo** — dedup by `payment_hash` across all
  sources; the sender's own tally coming back from a relay is a no-op.
- **Self-zapping** — possible but only adds sats the attacker actually spent;
  economically pointless. WoT/moderation already available if we later want to
  weight or hide (mirror the view-count treatment).
- **Amount mismatch** — ignore the `amount` tag; always use the bolt11 amount.
- **Missing preimage** (wallet returns none) — skip the tally, fall back to the
  local ledger; the sender still sees their zap, it just isn't globally attested.
- **REQ load** — one extra kind in the existing batched receipt fetch (no new
  round trip); one publish per zap share (small, non-blocking).
- **Privacy** — a tally publicly links the payer pubkey → video + amount. This is
  the same disclosure as a NIP-57 zap (zaps are public by design), but note it in
  the UI copy. The feature flag lets us default-off until we're comfortable.

---

## 8. Testing plan

Unit (node:test, deterministic, no network):
- `zap-tally-verify.test.mjs` — `verifyBitvidZapTally`: valid passes; bad preimage
  fails (step 2); mismatched description hash fails (step 3, replay); amount taken
  from bolt11 not the tag. Use fixed bolt11/preimage vectors.
- `zap-tally-schema.test.mjs` — `buildZapTallyEvent` emits the exact tag set for
  video vs profile pointers.
- Extend `zap-totals.test.mjs` — cross-source dedup: a 9735 and a tally with the
  same payment_hash count once; a tally with a new payment_hash adds; an invalid
  tally is ignored; 9735-preferred.
- `zap-controller` / `ModalManager` wiring — onZapSuccess forwards per-share
  proof; publishZapTally is best-effort (a publish throw doesn't break the success
  path); flag-off short-circuits publish + count.

Live (Playwright harness, mock relay — pattern from this session's diagnostics):
- Seed a verified tally event → it counts + ranks; seed an invalid one → ignored.
- End-to-end with a stubbed wallet returning a known preimage → publish → re-fetch
  → badge reflects it after a simulated reload.

Gates: `npm run lint`, `npm run build`, targeted suites. New tests carry
`test_integrity_note` blocks (Dark Factory rules).

---

## 9. Rollout

1. Land behind `FEATURE_ZAP_TALLY = false` on `unstable`; verify counting logic
   with seeded events (no publishing yet in the wild).
2. Flip publishing on for `unstable`, dogfood real zaps, confirm cross-user
   visibility on a second browser.
3. Soak on `beta`; watch for miscounts / dedup gaps.
4. Default-on to `main` once the payment_hash dedup is proven against real 9735s.

Rollback: flip the flag off (stops publishing + counting); already-published
tallies simply stop being counted. No data migration.

---

## 10. Decisions (RESOLVED 2026-07-04)

- **D1 — event kind → ADDRESSABLE `ZAP_TALLY_KIND = 30081`, `d = payment_hash`.**
  Chosen: a higher, app-specific kind in bitvid's own family (30078 video,
  30079 view, **30081** zap tally). Addressable (30000–39999) with the
  per-payment `payment_hash` as the `d` tag makes each real payment map to
  exactly ONE canonical event — relay-level idempotency; a re-publish replaces
  rather than duplicates. Still queried by its `#a`/`#e`/`#p` tags like a 9735.
  Reserve the kind in `docs/nostr-event-schemas.md`.
- **D2 — scope → VIDEO + PROFILE zaps in v1.** Video path drives the badges/Most
  Zapped; profile path reuses the same primitives with a `p`-only pointer and a
  channel-page total (new small UI surface). Both ship in v1.
- **D3 — publish relays → user's WRITE relays** (same path as video publishing).
  The store queries `client.relays` (a superset incl. write relays); verify at
  wiring time.
- **D4 — publishing → ON BY DEFAULT.** `FEATURE_ZAP_TALLY` still exists for
  rollback but defaults **true**; every successful zap publishes a tally. Keep a
  short one-line disclosure in the zap UI ("zaps are publicly attributed on
  bitvid") since it's honest and cheap, but no opt-in gate.
- **D5 — chart Y-axis → INDEPENDENT PER-SERIES scaling.** Each cumulative line
  fills the height against its own max; the legend names the two units. No dual
  labeled Y-axis.

---

## 11. Task checklist (ordered — pick up here across sessions)

- [x] **D1** `ZAP_TALLY_KIND = 30081` (addressable, d=payment_hash) + constant +
      `docs/nostr-event-schemas.md` row. (commit a6b2996f)
- [x] `constants.js`: `FEATURE_ZAP_TALLY` (default ON per D4) + runtime plumbing.
- [x] `nostrEventSchemas.js`: `NOTE_TYPES.ZAP_TALLY` schema + `buildZapTallyEvent`.
- [x] `zapReceiptValidator.js`: `extractBolt11Fields`, `verifyPaymentPreimage`,
      `verifyBitvidZapTally`. Tests incl. a real amount-bearing bolt11 e2e.
- [x] `zapSplit.js`: expose `receipt.preimage`. (commit 41e533e6)
- [x] `zapController.js`: `onZapSuccess` forwards per-share proof.
      *(Retry path still TODO — see below.)*
- [x] `zapTallyPublisher.js` (buildTallyFromShare + publishZapTallies) +
      `ModalManager.js` wiring: build→sign→publish (best-effort, flag-gated).
      No `ingestVerifiedZap` needed — the store's existing "relay wins" prune
      reconciles the optimistic ledger when the published tally is fetched back.
- [x] `zapTotals.js`: query `[9735, ZAP_TALLY_KIND]`, verify + dedup by
      payment_hash (`paymentHashes` set), flag-gated counting. (commit 025ab348)
- [x] Tests: verify, schema, publisher, cross-source dedup, flag-off, e2e verify.
- [x] `lint` + `build` + suites green; pushed to `unstable`.
- [ ] **Remaining v1 work:**
      - [ ] **Profile-zap counting:** the store queries `#a`/`#e` only — add
            `#p` batches so a profile-only tally (no video pointer) is fetched,
            and a channel-page total UI surface (D2 chose video+profile).
      - [ ] **Retry path:** `zapController.executeRetry` doesn't fire
            `onZapSuccess`; wire it so retried shares also publish tallies.
      - [ ] **Popularity chart §5.9:** orange zaps line + legend + date axis.
      - [ ] Live end-to-end on unstable (real zap → tally on relay → second
            browser counts it); rollout per §9.

**Popularity chart (§5.9 — can start once the store's verify + dedup helpers
exist; the renderer/legend/axis parts have no dependency on publishing tallies):**
- [ ] `.text-zap` utility in `css/tailwind.source.css`.
- [ ] `viewCountChart.js`: `buildZapSatsTimeSeries` (bucket cumulative sats,
      verify + payment_hash dedup).
- [ ] Zap-event facade: `listVideoZapEventsWithDefaultClient` +
      `subscribeVideoZapEvents…` (kinds `[9735, ZAP_TALLY_KIND]`).
- [ ] Generalize `buildViewCountChartSvg` → `buildPopularityChartSvg({views,zaps})`:
      two token-colored lines, per-series Y (D5), visible X date ticks via
      `formatDay`, legend (Views=red / Zaps=orange), second headline line.
- [ ] Wire both fetches + debounced re-render in `openPopularityModal`; empty/
      single-bucket states for the zap line.
- [ ] Tests: `zap-time-series.test.mjs` (bucketing + dedup); chart-svg test
      (two `<polyline>`s, legend nodes, date-tick `<text>` present).

---

## 12. Relationship to existing work (so nothing regresses)

- `js/zapTotals.js` — extend, don't rewrite. The array/object `pointerKey` fix,
  the always-visible badge, optimistic bump, durable ledger, and "relay wins"
  prune all stay; the tally is a new counted source folded into the same map.
- `js/app/modalCoordinator.js` / `js/ui/views/videoCardZapTotals.js` — **no
  change**; they render `store.getSnapshot`, which now includes verified tallies.
- `js/feedEngine/mostZappedFeed.js` — **no change**; its metric is
  `requestVideoZapTotal`, which now reflects tallies.
- The NIP-57 `zapReceiptValidator` 9735 path — untouched behavior; we only add
  helpers and reuse its bolt11 decode.
- `js/viewCountChart.js` (§5.9) — the single view series stays; we generalize the
  SVG builder to two series and add the legend + visible date axis the view chart
  never had. The `--color-zap` token (already added for the badges) is reused for
  the orange zap line, so cards, modal badge, and chart all share one zap color.
```
