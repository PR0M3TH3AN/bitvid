# Bitcoin Connect — NWC wallet connect UX — Dev Plan

Status: **DECISIONS NEEDED (D1–D6)** — no code yet. Adds Alby's
[Bitcoin Connect](https://bitcoin-connect.com/) as a smooth "connect your wallet"
front-end for NWC, feeding bitvid's **existing** NWC pipeline. Manual URI entry
stays as the backup/advanced path. Feature-flagged (off = no trace).

## Executive summary

bitvid already has a full NWC stack: manual URI entry (`#walletUri` in the Wallet
Connect pane → `ProfileWalletController`), validation
(`nwcSettingsService.validateWalletUri` — requires `nostr+walletconnect://`),
per-npub storage (`nwcSettings.js`, IndexedDB + localStorage), opt-in encrypted
cross-login sync, and the zap-split/pay_invoice payment pipeline
(`js/payments/*`). The friction is purely the *connect* step — pasting a URI.

Bitcoin Connect solves exactly that: a polished modal that walks the user through
connecting a wallet (CoinOS, Alby Hub, mutiny, etc.) and, for the NWC connector,
**exposes the raw NWC pairing URI**. So we bolt it on as an alternate connect
button that extracts the URI and hands it to bitvid's existing validate→store
pipeline. **No change to how bitvid pays or stores** — one new way to obtain the
same string. Manual entry stays for power users / unsupported wallets.

## How Bitcoin Connect works (verified against the v3 README)

- Package `@getalby/bitcoin-connect` (ESM; Lit web components + functions; bundles
  `@getalby/js-sdk` internally — no separate peer dep). Also loadable from
  `https://esm.sh/@getalby/bitcoin-connect@<pin>` (our CSP already allows esm.sh).
- `init({ appName, filters: ["nwc"], persistConnection, providerConfig: { nwc: {
  authorizationUrlOptions: { requestMethods } } } })` — `filters:["nwc"]` restricts
  the modal to NWC; `requestMethods` requests least-privilege scopes.
- `launchModal()` / `await requestProvider()` opens the connect flow.
- `onConnected((provider) => …)` → a WebLN provider. **NWC extraction:**
  ```js
  import { onConnected } from "@getalby/bitcoin-connect";
  import { WebLNProviders } from "@getalby/sdk"; // or the re-export
  onConnected((provider) => {
    if (provider instanceof WebLNProviders.NostrWebLNProvider) {
      const uri = provider.client.nostrWalletConnectUrl; // ← the NWC secret
    }
  });
  ```
- `disconnect()` clears its connection; `getConnectorConfig()` returns the saved
  connector config. Persistence to localStorage is automatic when
  `persistConnection: true`.
- ⚠️ README says the lib is **Alpha** — pin an exact version.

## Decisions needed

> **DECISION 1 — Delivery. 🔵 NEEDED.**
> - **A — Vendor + lazy `import()`:** esbuild-bundle a pinned `@getalby/bitcoin-connect`
>   into `vendor/bitcoin-connect.bundle.min.js` (same pattern as floating-ui in
>   `scripts/build-beacon.mjs`), dynamically imported only when the user opens the
>   Wallet pane / clicks Connect. Offline-safe, supply-chain-pinned, no main-bundle bloat.
> - **B — Lazy-load from esm.sh** (CSP already allows it) at a pinned version.
>   Zero vendoring work, but a runtime CDN dependency + supply-chain trust.
> _Recommendation: **A** — bitvid vendors its other heavy deps; Bitcoin Connect is
> a Lit bundle (~hundreds of KB) so lazy-import is important either way._

> **DECISION 2 — Persistence ownership. 🔵 NEEDED.**
> - **A — `persistConnection: false`:** Bitcoin Connect is purely the connect UI;
>   bitvid extracts the URI and is the ONLY store (its existing encrypted-sync /
>   per-npub model). No duplicate plaintext copy in `bc:*` localStorage.
> - **B — let it persist** and rely on `disconnect()` on bitvid logout.
> _Recommendation: **A** — one owner of the spending secret; call `disconnect()`
> right after extracting to be safe._

> **DECISION 3 — Connector scope. 🔵 NEEDED.**
> - **A — NWC only** (`filters:["nwc"]`). Yields a URI that flows straight into the
>   existing pipeline; zap-split/pay_invoice unchanged.
> - **B — also allow WebLN / Alby-extension / Alby Hub** connectors. Smoother for
>   Alby users, but those give a WebLN *provider*, not an NWC URI — bitvid's raw-NWC
>   payment pipeline can't consume them without a second WebLN payment path.
> _Recommendation: **A for v1** (matches the pipeline); a WebLN path is a separate
> later effort if there's demand._

> **DECISION 4 — Requested scopes. 🔵 NEEDED.**
> `requestMethods` to request from the wallet. bitvid needs **`pay_invoice`** (zaps);
> `get_balance` (balance display), `make_invoice` / `lookup_invoice` (receipts/tally).
> _Recommendation: `["pay_invoice","get_balance","make_invoice","lookup_invoice"]` —
> least privilege for what bitvid actually calls. (The wallet ultimately decides.)_

> **DECISION 5 — UI placement vs manual mode. 🔵 NEEDED.**
> _Recommendation: In the Wallet Connect pane, make **"Connect wallet"** (Bitcoin
> Connect) the primary CTA, and move the raw-URI field under a collapsible
> **"Advanced / paste a connection manually"** — manual stays a first-class backup,
> just de-emphasized. On success, populate the same status/disconnect UI._

> **DECISION 6 — Feature flag. 🔵 NEEDED.**
> _Recommendation: `FEATURE_BITCOIN_CONNECT` in `config/instance-config.js` (default
> off = no trace), wired exactly like `FEATURE_AUDIO_INGEST`. With it off, only the
> manual URI field shows — zero new code path or bundle load._

## Config flag (off = no trace)

- `FEATURE_BITCOIN_CONNECT` (default **false**) — gates the "Connect wallet" button
  + the lazy Bitcoin Connect import. Off ⇒ manual URI entry only (today's behavior).

## Integration points (small, contained)

- `components/profile-modal.html` — Wallet Connect pane: add the "Connect wallet"
  button; wrap the existing `#walletUri` field as "Advanced/manual."
- `js/ui/profileModal/ProfileWalletController.js` — a `handleBitcoinConnect()` that
  lazy-imports the lib, `init()`s once (NWC-only, least-privilege, no-persist),
  `launchModal()`, and on `onConnected` extracts `nostrWalletConnectUrl` →
  runs the SAME `validateWalletUri` + save path as manual "Save wallet" → then
  `disconnect()`. Reuses all existing status/disconnect/sync UI.
- `config/instance-config.js` / `js/config.js` / `js/constants.js` — the flag.
- `scripts/` + `vendor/` — the esbuild vendor bundle (D1-A).

## Architecture

Bitcoin Connect is a **connect adapter**, not a payment layer:
```
[Connect wallet] → BC modal (NWC) → onConnected(provider)
   → provider.client.nostrWalletConnectUrl
   → validateWalletUri()  (existing, scheme check)
   → nwcSettingsService save  (existing: per-npub store + optional encrypted sync)
   → BC disconnect()          (bitvid now owns the secret)
[zaps] → js/payments/nwcClient pay_invoice + zap-split   (UNCHANGED)
```
The manual field writes to the exact same validate→store path, so the two entry
points converge immediately and everything downstream is untouched.

## Security (NWC URI = bearer SPENDING secret)

- **Never log** `nostrWalletConnectUrl` (or the provider) — extract → validate →
  store via the existing (never-logged) pipeline; treat like the manual field.
- **`persistConnection: false` + `disconnect()`** after extract so the secret isn't
  duplicated in Bitcoin Connect's own plaintext `bc:*` localStorage (D2).
- **Pin the version + vendor it** (Alpha lib) — no unpinned CDN `@latest`.
- **Least-privilege `requestMethods`** (D4) — request only what bitvid calls.
- Re-run bitvid's `validateWalletUri` on the extracted string; don't trust the lib
  blindly. Keep the explicit "a wallet-connect URI can SPEND" warning on the
  encrypted-sync toggle.
- Payment invariants unchanged: `PLATFORM_FEE_PERCENT=30` split, preimage
  verification, and the "a pay_invoice timeout must NEVER auto-resend" rule all live
  in `js/payments/*` and are not touched.

## Phases (flag-gated from day one)

- **Phase 0 — Flag + vendor bundle.** Add `FEATURE_BITCOIN_CONNECT` (off) and the
  esbuild vendor step. No UX.
- **Phase 1 — Connect button (headline).** Wallet pane "Connect wallet" → BC NWC
  modal → extract → existing save path → disconnect. Manual field → "Advanced."
- **Phase 2 — Polish.** Balance display (BC `showBalance` / get_balance), reconnect
  affordance, and a "test connection" ping. Optional.
- **Phase 3 (only if wanted) — WebLN path** (D3-B): accept Alby-extension/Hub
  connectors via a WebLN payment adapter alongside raw NWC. Separate effort.

## Risks / watch-items

- **Alpha library / breaking changes** — pin + vendor; wrap behind our own thin
  adapter so an API change is a one-file fix.
- **Bundle weight** — lazy-import only on Wallet-pane open / button click.
- **Wallet grants fewer scopes than requested** — if `pay_invoice` isn't granted,
  zaps fail; surface a clear error and fall back to manual.
- **Not all wallets support NWC** — manual mode + non-NWC connectors (D3-B) cover the gap.
- **esm.sh path (D1-B)** would add a runtime third-party origin to the trust surface.

## Sources

- getAlby/bitcoin-connect README (v3) — install, `init` filters/providerConfig,
  `onConnected`, `NostrWebLNProvider.client.nostrWalletConnectUrl`, `disconnect`.
- bitcoin-connect.com. Related bitvid: `js/services/nwcSettingsService.js`,
  `js/nwcSettings.js`, `js/ui/profileModal/ProfileWalletController.js`,
  `js/payments/*`, `docs/audio-integration-plan.md` (flag-wiring pattern).
