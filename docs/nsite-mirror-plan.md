# nsite mirror — censorship-resistant app-shell backup (NIP-5A) — Dev Plan

Status: **DECISIONS LOCKED (D1–D8; D2 revised to manual-publish 2026-07-14)** —
the on-push **site-archive** workflow is shipped (`.github/workflows/nsite-archive.yml`
+ `npm run archive`); the actual nsite publish is a deliberate **manual** step the
maintainer runs when releasing (see "Maintainer steps"). Adds an
independently-recoverable mirror of bitvid's compiled static app on
**Nostr + Blossom**, published alongside Vercel. Full CI-signed publishing remains a
documented Phase-3 option below.

Related: `docs/blossom-plan.md` (Blossom storage — nsite reuses the same blob
infra) and `docs/blossom-torrent-metadata-plan.md`.

## Executive summary

An **nsite** (NIP-5A) is a static website whose **identity + file map** live on
Nostr and whose **files** live on Blossom as content-addressed (sha256) blobs. A
signed Nostr manifest maps every path (`/index.html`, `/js/app.js`, …) to a blob
hash; any **gateway** reads the manifest from relays, fetches the blobs from
Blossom, and serves the site over HTTPS at e.g. `https://<npub>.<gateway>`. Root
sites use **kind 15128**; a key can also host named sites with **kind 35128**.

bitvid is a **fully static client** (verified: no `api/` dir, no Vercel functions,
`outputDirectory: "dist"`). So an nsite is not a "degraded emergency shell" — it is
a **complete, runnable copy of bitvid** that any gateway can serve. This is a
natural extension of bitvid's decentralization stack:

| Layer | Decentralized by |
|---|---|
| Identity | Nostr (already) |
| Distribution | WebTorrent P2P (already) |
| Media storage | Blossom / R2 / S3 (already) |
| **App shell** | **nsite — this plan** |

The mirror is a **disaster-recovery / censorship-resistance layer**, published
alongside — never replacing — the primary Vercel deploy. Git remains the
source-of-truth backup; nsite backs up *exactly what users run*, not how it was
built.

## Why it fits bitvid (verified facts)

- **Fully static** ⇒ the nsite is a full mirror, not a degraded shell.
- **Every file fits the Blossom free tier.** The largest file in a fresh `dist/`
  is **1.85 MB** (a placeholder gif); everything else < 0.75 MB — all well under
  Blossom's ~20 MiB free-per-blob cap. No paid Blossom tier needed for the mirror.
- **Reads work from any origin.** Nostr relays (wss), WebTorrent webseeds, and
  Blossom reads are CORS-open, so a viewer at `<npub>.<gateway>` gets a working
  player.
- **Synergy with the Blossom work already shipped** — same blob servers, same
  `blossom-client-sdk` mental model.

## Decisions

> **DECISION 1 — Role. ✅ LOCKED.**
> nsite is a **DR/mirror of the production (`main`) build**, not primary hosting.
> Vercel stays the polished public entry point on bitvid.network.
> _Rationale: parallel + independent; a Vercel outage/censorship still leaves a
> loadable bitvid on any gateway._

> **DECISION 2 — Publish trigger: MANUAL, with an automated archive. ✅ LOCKED
> (revised 2026-07-14).**
> The actual nsite publish is a **manual step** — a deliberate release ritual, not a
> push hook — so the signing key **never lives in CI**. To make that painless, a
> GitHub Action (`.github/workflows/nsite-archive.yml`) builds a **fresh,
> downloadable site archive on every push (any branch)** and uploads it as a
> workflow artifact (GitHub serves artifacts as a `.zip` on download). The
> maintainer grabs the latest archive (or runs `npm run archive` locally) and
> publishes it to an nsite deployer that signs **in-browser via NIP-07** (e.g.
> nsite.run) or via the local `nsyte` CLI.
> _Rationale: bitvid ships to prod manually and infrequently, and is aggressively
> key-safe — keeping the nsite key out of CI (no `nbunksec`, nothing to rotate/leak)
> matches that. Automating only the archive gives "always-ready to publish" without
> automating the signing. Never publish from Vercel's build command — a preview or
> rolled-back promotion could clobber the public mirror._
>
> _Full CI publishing (a signing Action with an `nbunksec`) remains a Phase-3 option
> if the manual step ever becomes a chore — the manual flow validates everything
> first, so switching later is low-risk._

> **DECISION 3 — Directory. ✅ LOCKED.**
> Publish **`dist/`** (bitvid's `outputDirectory`, the exact bytes Vercel serves),
> after `npm ci && npm run build`.

> **DECISION 4 — Identity. ✅ LOCKED.**
> A **dedicated bitvid nsite key** (NOT the personal or admin npub), **root site
> kind 15128**. Publish the npub + a canonical gateway URL so users/docs can find
> the mirror.
> _Rationale: project isolation, easy key rotation/hand-off, no exposure of a
> personal signing identity. Root (15128) is simplest for a single dedicated key
> (35128 named sites are for one key hosting several sites)._

> **DECISION 5 — Signing credential. ✅ LOCKED (revised 2026-07-14).**
> Default: **sign client-side, never in CI** — a NIP-07 extension (via a web
> deployer) or the local `nsyte` CLI with the dedicated nsite key on the maintainer's
> machine. **Never** put an `nsec` in CI. _If_ Phase-3 CI publishing is later
> adopted, use an **nbunksec** (restricted NIP-46 bunker credential) minted with
> `nsyte ci`, stored as the GitHub secret `NBUNK_SECRET`, rotated periodically with
> permitted kinds restricted where the bunker allows.

> **DECISION 6 — Redundancy. ✅ LOCKED.**
> **≥3 Nostr relays + ≥2 Blossom servers**, `publishRelayList` + `publishServerList`
> on. Reuse Blossom servers bitvid already knows; add a **self-hosted Synology
> Blossom** as a personally-controlled copy later.
> _Rationale: one relay + one server is just a second centralized dependency._

> **DECISION 7 — SPA fallback. ✅ LOCKED.**
> `fallback: /index.html`. bitvid's routing is hash/query-based (`?v=<nevent>`,
> `#view=…`), which resolves against `index.html`; the fallback covers gateways that
> 404 unknown deep-link paths. `embed.html` and `views/*.html` are distinct files
> served directly.

> **DECISION 8 — Safety: secret scan + snapshots. ✅ LOCKED.**
> Keep the action's **secret scan ON** (`scan_level: medium`) as a guard even though
> bitvid's `dist/` is a public static client with no bundled secrets, and take an
> **immutable snapshot** per release so historical production builds stay
> addressable. Note: `dist/` currently includes source maps (`*.map`) — publishing
> them is harmless (they're already public) but the scan surfaces them.

## The one real caveat — uploads & CORS

The mirror **loads and plays** everywhere. But **uploads from a gateway origin**
depend on the target storage's CORS:

- **Blossom uploads work** from the mirror (Blossom servers send `Access-Control-
  Allow-Origin: *`).
- **R2 / S3 uploads will fail CORS** from `<npub>.<gateway>` unless the user adds
  that gateway origin to their bucket's CORS allow-list (buckets are normally
  scoped to `bitvid.network`).

So the mirror is positioned as a **resilient player / reader / DR layer** first;
full R2/S3 upload from the mirror is opt-in (add the gateway origin to bucket CORS).
Share/canonical links keep pointing at `bitvid.network` (`BITVID_WEBSITE_URL` /
`DNS_URL` are hardcoded) — which is correct, not a bug.

## What nsite does and does NOT back up

| Backs up | Does NOT back up |
|---|---|
| The compiled `dist/` (HTML/CSS/JS bundles, images, fonts, manifests) | Source + Git history (that's Git) |
| Exactly what users run | Env vars / credentials (none are in `dist/`) |
| Per-release snapshots (historical builds) | User videos (already on R2/S3/Blossom) |
| | Nostr events (already on relays) |

## Architecture

```
push to any branch
  ├── Vercel  → production build → bitvid.network            (primary, unchanged)
  └── GitHub Action (.github/workflows/nsite-archive.yml)   [SHIPPED]
        npm ci && npm run build → dist/
          → any branch: actions/upload-artifact → downloadable site .zip (30d)
          → main only:  GitHub Release (site-<date>-<sha>, --latest) w/ bitvid-site.zip
                        stable URL: /releases/latest/download/bitvid-site.zip
          (no Nostr signing key, does not publish to nsite)

manual release (maintainer, when promoting to prod)
  download latest archive  (or: npm run archive → bitvid-site.zip)
    → nsite deployer that signs in-browser via NIP-07 (e.g. nsite.run)
      or the local `nsyte` CLI
        → publish manifest (kind 15128) + blobs across Blossom servers
        → reachable at https://<bitvid-nsite-npub>.<gateway>
```

## The archive workflow (shipped)

`.github/workflows/nsite-archive.yml` — runs on **push to any branch** + manual
`workflow_dispatch`. It holds **no Nostr signing key** and does not publish to nsite;
it only produces the compiled `dist/` for a manual publish:

- **Every branch** → uploads `dist/` as an artifact `bitvid-site-<branch>-<shortsha>`
  (30-day retention). GitHub serves it as a `.zip` on download, `index.html` at the
  root — drop-in for an nsite deployer. Grab the latest for a branch with
  `gh run download` (see below).
- **`main` only** → additionally cuts an **immutable GitHub Release** (tag
  `site-<date>-<shortsha>`, marked `--latest`) with `bitvid-site.zip` attached, giving
  a **stable download URL** for the current production archive:

  ```
  https://github.com/PR0M3TH3AN/bitvid/releases/latest/download/bitvid-site.zip
  ```

  The Release contains only the public compiled app (identical to what Vercel serves),
  so it's safe to expose permanently; it doubles as the per-release snapshot from D8.

Grab the latest archive for a non-prod branch:

```bash
gh run download -R PR0M3TH3AN/bitvid \
  "$(gh run list -R PR0M3TH3AN/bitvid --workflow=nsite-archive.yml \
       --branch unstable --status success -L1 --json databaseId -q '.[0].databaseId')" \
  --dir ./site-archive
```

Locally, `npm run archive` produces the same thing as `bitvid-site.zip` (gitignored)
for an offline/manual publish.

## The publish step (manual)

Signing happens **off CI**, in the maintainer's control:

1. Get the compiled site — download the latest `bitvid-site-*` artifact, or run
   `npm run archive` locally.
2. Publish it with an nsite deployer that signs client-side:
   - **Web**: an nsite uploader such as nsite.run, authorizing with a **NIP-07**
     extension (the key never leaves the browser); or
   - **CLI**: `nsyte deploy ./dist …` on the maintainer's machine (see recovery /
     integrity commands below), signing with the dedicated nsite key locally.
3. Verify with `nsyte status --full` and by loading `https://<npub>.<gateway>`.

### Optional Phase-3: fully-automated CI publishing (reference only)

If the manual step ever becomes a chore, a decoupled production-only Action can sign
in CI with a **restricted `nbunksec`** (NIP-46 bunker credential — **never an
`nsec`**). Not shipped; kept here as the migration target. The manual flow above
validates relays/servers/fallback first, so switching later is low-risk.

```yaml
name: Publish nsite mirror
on:
  push:
    branches: [main]
  workflow_dispatch:
permissions:
  contents: read
concurrency:
  group: nsite-production
  cancel-in-progress: true
jobs:
  publish:
    runs-on: ubuntu-latest
    # Skip entirely until the maintainer adds NBUNK_SECRET.
    if: ${{ github.repository == 'PR0M3TH3AN/bitvid' }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npm run build
      - name: Guard on secret
        id: guard
        run: echo "have=${{ secrets.NBUNK_SECRET != '' }}" >> "$GITHUB_OUTPUT"
      - name: Publish to Nostr + Blossom
        if: steps.guard.outputs.have == 'true'
        uses: sandwichfarm/nsite-action@v0.5.1
        with:
          nbunksec: ${{ secrets.NBUNK_SECRET }}
          directory: ./dist
          sync: true
          fallback: /index.html
          skip_secrets_scan: false
          scan_level: medium
          publish_relay_list: true
          publish_server_list: true
          relays: |
            wss://relay.nsite.lol
            wss://relay.damus.io
            wss://nos.lol
          servers: |
            https://cdn.hzrd149.com
            https://blossom.band
```

Pin the action + tool version once verified; curate relays/servers to ones whose
retention/payment policies are understood (do not blindly trust example public
servers). Add the Synology Blossom to `servers:` when it's up.

## Security

- **No secrets in `dist/`** — bitvid is a static client; `instance-config.js`
  carries public flags/thresholds/npubs only. Secret scan stays on as a guard.
- **No signing key in CI (default).** The shipped archive workflow holds no secret;
  publishing is signed client-side (NIP-07 or local `nsyte`). If Phase-3 CI
  publishing is ever enabled, it signs with a restricted **`nbunksec`**, never an
  `nsec`; a dedicated project key limits blast radius and eases rotation.
- **Public + immutable once replicated** — assume published blobs/manifests may
  remain retrievable even after deletion requests (some relays ignore deletions).
  Never publish a build containing anything you wouldn't put on a public CDN.
- **Gateway origin is untrusted infrastructure** — bitvid already treats relay/
  storage/tracker responses as untrusted; loading the shell from a gateway changes
  the origin but not the trust model (all signing is client-side via the user's
  own signer).

## Recovery procedure

If Vercel is lost:

```bash
nsyte download ./recovered-site      # pull the whole published build
cd recovered-site && python3 -m http.server 8080   # or re-host anywhere
# or fetch individual files:
nsyte get /index.html --output ./index.html
```

The mirror is therefore an **independently reconstructable production artifact**,
not merely a failover URL.

## Integrity checks (post-release / weekly)

```bash
npm run build
nsyte scan ./dist          # catch accidental .env / sourcemaps / secrets
nsyte deploy ./dist --sync # replicate any missing blobs across servers
nsyte snapshot             # immutable release snapshot
nsyte status --full        # manifest + relay + server + per-file coverage
nsyte debug                # relay discovery, manifest availability, sampled blob hashes
```

## Phases

- **Phase 0 — Archive wiring (behavior-neutral). ✅ SHIPPED.**
  `.github/workflows/nsite-archive.yml` (build + upload artifact on push to any
  branch) + `npm run archive` + this doc. Publishes nothing; no secret involved.
- **Phase 1 — Go live (manual publish).** Maintainer generates the dedicated nsite
  key, grabs the latest archive (or `npm run archive`), and publishes with a
  client-side-signing deployer (nsite.run + NIP-07, or local `nsyte deploy`). Verify
  with `nsyte status --full` and by loading `<npub>.<gateway>`. Repeat on each prod
  release.
- **Phase 2 — Harden.** Add the self-hosted Synology Blossom to the server list; run
  periodic `nsyte debug` / `nsyte status --full` integrity checks; document/link the
  mirror URL in bitvid (e.g. a "decentralized mirror" footer link).
- **Phase 3 — Reach / automate (optional).** Move signing into CI with a restricted
  `nbunksec` (the reference workflow above) if manual publishing becomes a chore;
  per-channel mirrors (a beta nsite); a named site (kind 35128); ENS/DNS `_nostr`
  discovery.

## Maintainer steps (only the human can do these)

Archive automation is already live — these are the human-only publish steps:

1. Generate a **dedicated bitvid nsite key** (not personal/admin).
2. Get the compiled site: download the latest `bitvid-site-*` GitHub artifact, or run
   `npm run archive` locally (→ `bitvid-site.zip`).
3. Publish with a **client-side-signing** deployer — nsite.run authorized via a
   **NIP-07** extension, or `nsyte deploy ./dist …` locally. The key stays on your
   machine/extension; **do not** put an `nsec` (or `nbunksec`) in CI for the manual flow.
4. (Later) stand up a Synology Blossom server and add it to the server list.
5. (Optional) publish the npub + gateway URL so users can find the mirror.
6. (Optional, Phase 3) if automating: `nsyte ci` → `nbunksec1…`, add it as the
   `NBUNK_SECRET` GitHub secret, and enable the reference publish workflow.

## Risks / watch-items

- **Uploads from the gateway origin** need bucket CORS (R2/S3); Blossom uploads
  work. Positioned as a player/DR layer first — documented above.
- **Gateway availability/trust** — mitigate with multiple relays + servers and by
  publishing the relay/server lists so any gateway can resolve the site.
- **Blob/relay retention** — free servers may prune; the self-hosted Synology
  Blossom + periodic `--sync` keep coverage. `nsyte status --full` reports gaps.
- **Build determinism** — the mirror must publish the same `npm run build` output
  Vercel serves; the Action rebuilds from the same `main` commit, so they match.
- **Source maps in `dist/`** — harmless to publish (already public); strip in build
  later if undesired.
- **CI credential leakage** — restricted `nbunksec` in the secret manager, rotated;
  a dedicated key caps the blast radius.

## Sources

- NIP-5A (nsite / Blossom static sites), kinds 15128 / 35128.
- `nsyte` CLI + `sandwichfarm/nsite-action` (deploy, snapshot, status, debug, ci).
- `docs/blossom-plan.md` (shared Blossom infrastructure).
