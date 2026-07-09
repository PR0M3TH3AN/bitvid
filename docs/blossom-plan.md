# Blossom storage — first-class alongside R2 / S3 — Dev Plan

Status: **DECISIONS NEEDED (D1–D10)** — no code yet. Adds Blossom (nostr-native
blob storage) as a first-class upload provider next to Cloudflare R2 / generic S3
/ Backblaze B2, using the maintained `blossom-client-sdk`. Feature-flagged
(off = no trace). Tracks TODO #30. Research: docs sources at the bottom; spec is
`github.com/hzrd149/blossom` (BUDs). Sibling of the audio / Bitcoin Connect plans.

## Executive summary

bitvid's uploads already flow through one seam: `mediaUploader` selects a service
by provider and calls `service.uploadFile({ … }) → { url, key, … }` (the `url` is
what lands in the kind-30078 video event). Both `r2Service` and `s3UploadService`
implement that `uploadFile` contract; routing is a one-liner
(`isR2Provider(provider) ? r2Service : s3Service`, `mediaUploader.js:38`).

**Blossom = a new `blossomService` implementing the same `uploadFile` contract**,
plus an `isBlossomProvider` branch. Blossom's upload is *simpler* than S3 (no
SigV4, no multipart, no bucket creation, no client-side CORS provisioning) and its
auth is a signed nostr event (kind 24242) — so it reuses **bitvid's existing
signer** with zero new crypto. The one real cost is the Storage-pane config UI,
which today hard-assumes S3 credential fields and needs a parallel **keyless,
multi-server** form.

The payoff: for anyone who picks Blossom, the whole "store an upload secret in the
browser + encrypted-sync it" surface **disappears** (there is no secret — only
server URLs + the user's signer), and files gain **resilience via mirroring** to
multiple servers, which is Blossom's actual advantage over a single S3 bucket.

## Landscape — the Blossom spec today (researched July 2026)

The spec has modularized since older write-ups; the auth and management endpoints
moved into their own BUDs:

| BUD | Covers | Tier |
| --- | --- | --- |
| **BUD-01** | server requirements + blob retrieval (`GET`/`HEAD /<sha256>`) | core |
| **BUD-02** | `PUT /upload` (returns a blob descriptor) | core |
| **BUD-11** | **Nostr Authorization** — kind-24242 auth event | core |
| **BUD-12** | `GET /list/<pubkey>` + `DELETE /<sha256>` (moved out of 02) | opt |
| BUD-03 | server discovery via **kind-10063** user server list | recommended |
| BUD-04 | cross-server **mirroring** (`PUT /mirror`) | recommended |
| BUD-05 | `/media` endpoint (metadata strip / re-encode) | optional |
| BUD-06 | upload **negotiation** (preflight before sending bytes) | recommended |
| BUD-07 / 09 / 10 | payment-gated / reporting / URI scheme | optional |

**Core minimum a client should implement today: BUD-01 + BUD-02 + BUD-11.** Add
BUD-03 (discovery) + BUD-06 (preflight) + BUD-04 (mirror) for a good client.

- **Client SDK:** `blossom-client-sdk` v5 (hzrd149, the spec author). ESM; only
  required dep is `@noble/hashes` — which **bitvid already vendors** (crypto-
  helpers). Optional peer deps (cashu, hls.js) are skipped. Small bundle.
- **Auth (BUD-11):** a kind-24242 event with `t` (`get`/`upload`/`list`/`delete`/
  `media`), a **required NIP-40 `expiration`**, optional `server` (scope to a
  domain) and `x` (scope to a sha256), sent as
  `Authorization: Nostr <base64url event>`. The SDK's `createUploadAuth(signer,
  sha256, { type })` builds it; the `signer` it wants is exactly bitvid's shape
  (`async (eventTemplate) → signed event`).
- **Blob descriptor** (`PUT /upload` response): `{ url, sha256, size, type,
  uploaded, … }` — and MAY include `magnet` / `infohash` / `ipfs`, a direct tie-in
  to bitvid's torrent story. `sha256` maps onto bitvid's existing `fileSha256`/`x`.

## Decisions needed

> **DECISION 1 — Client library. 🔵 NEEDED.**
> - **A — Vendor `blossom-client-sdk` v5** (esbuild bundle like bitcoin-connect /
>   floating-ui; its `@noble/hashes` dep is already vendored). Tracks the spec's
>   ongoing BUD refactors; gives upload/mirror/discovery/negotiation for free.
> - **B — Hand-roll** the ~3 HTTP calls + the kind-24242 auth event.
> _Recommendation: **A** — the spec is actively modularizing (auth→BUD-11,
> list/delete→BUD-12); the maintained SDK absorbs that churn, and it's small._

> **DECISION 2 — Single server vs multi-server + mirror. 🔵 NEEDED.**
> - **A — Multi-server list** (`multiServerUpload`): upload to N servers (HEAD
>   preflight, `/mirror` to register on ones that already have the blob).
> - **B — Single server** URL only.
> _Recommendation: **A** — multiple live copies (resilience/censorship-resistance)
> is the entire point of Blossom over one S3 bucket. Config becomes a server list._

> **DECISION 3 — kind-10063 server discovery/publish (BUD-03). 🔵 NEEDED.**
> Read the user's published server list to pre-fill their servers, and publish/
> update it so other clients can find bitvid-hosted media.
> _Recommendation: **read in v1** (`getServersFromServerListEvent`), **publish in
> v1.5** (a "publish my server list" action). Spec says clients SHOULD do both._

> **DECISION 4 — `/upload` vs `/media` (BUD-05). 🔵 NEEDED.**
> `/media` strips metadata + may re-encode; `/upload` stores exact bytes.
> _Recommendation: **`/upload` for videos** (keeps the exact file so the torrent
> infohash/seed stays valid), optional **`/media` for thumbnails/avatars** later
> (privacy/EXIF strip)._

> **DECISION 5 — Signer wiring. 🔵 NEEDED.**
> _Recommendation: reuse bitvid's **active signer adapter** as the SDK `signer`
> (NIP-07 / NIP-46 / nsec all already produce `async (tpl) → signed event`). No new
> crypto. Respect the signer circuit-breaker; reuse one auth across a mirror set
> (the SDK supports this) so a multi-server upload isn't N prompts._

> **DECISION 6 — Torrent parity. 🔵 NEEDED.**
> S3 uploads also build a magnet + seed via WebTorrent. Keep that for Blossom?
> _Recommendation: **Yes** — keep parity (Blossom URL as the hosted source +
> magnet as the P2P fallback). If the server's blob descriptor already returns
> `magnet`/`infohash`, prefer/verify it; else compute as today. sha256 = the
> shared content id._

> **DECISION 7 — Management (list/delete/orphan-GC). 🔵 NEEDED.**
> BUD-12 `GET /list/<pubkey>` + `DELETE /<sha256>` for the storage-management UI
> (My Videos orphan tools #8/#13).
> _Recommendation: **v2** — v1 ships upload; wire list/delete + orphan parity after._

> **DECISION 8 — Storage-pane config type. 🔵 NEEDED.**
> _Recommendation: add a **"Blossom"** option to `#storageProvider` that swaps the
> S3 fields (endpoint/region/access-key/secret/bucket + CORS helper) for a **keyless
> multi-server list** (add/remove server URLs, mark default, "test", optional
> "import from my kind-10063 list" / "publish my list"). New connection-payload
> variant `{ servers: [...] }` in the per-provider slot model._

> **DECISION 9 — Feature flag. 🔵 NEEDED.**
> _Recommendation: `FEATURE_BLOSSOM_STORAGE` in `config/instance-config.js`
> (default off = no trace), wired like `FEATURE_AUDIO_INGEST` /
> `FEATURE_BITCOIN_CONNECT`. Off ⇒ no Blossom option, SDK never imported._

> **DECISION 10 — Privacy posture. 🔵 NEEDED.**
> Blossom blobs are **public + content-addressed** (anyone with the URL/sha256 can
> fetch), same as a public S3 bucket. There are no private blobs in the base spec.
> _Recommendation: treat Blossom as public hosting (bitvid videos are already
> public); use `/media` to strip EXIF on images; do NOT route anything sensitive
> (e.g. private DMs) through public Blossom without BUD-07-style gating — keep DM
> attachments on the existing path until a private story exists._

## Config flag (off = no trace)

- `FEATURE_BLOSSOM_STORAGE` (default **false**) — gates the "Blossom" storage
  provider option, the blossomService, and the lazy SDK import. Off ⇒ Storage pane
  shows only R2 / S3 / B2 exactly as today.

## The `uploadFile` contract (the seam Blossom implements)

`mediaUploader` calls, for both thumbnail and video (4 call sites):
```
service.uploadFile({ file, key?, contentType?, onProgress, credentials, … })
  → { url, key, storagePointer?, infoHash?, magnet?, torrentUrl?, … }
```
`blossomService.uploadFile` maps to:
1. `sha256 = @noble/hashes` of the file (SDK helper) → the content id + `key`.
2. `createUploadAuth(signer, sha256, { type })` → kind-24242 auth (scoped `x`,
   short `expiration`).
3. `multiServerUpload(servers, file, { onAuth })` (BUD-06 preflight + BUD-04
   mirror) → blob descriptors; pick the primary `url` (default server), keep the
   mirror URLs as fallbacks (map into the video's imeta `sources`, #17/#20).
4. Return `{ url, key: sha256, storagePointer, magnet?, infoHash? }` so the rest of
   the publish pipeline is untouched.

## Architecture

- **`js/services/blossomService.js`** — implements `uploadFile` (+ later
  `listObjects`/`deleteObject` for BUD-12). Wraps the vendored SDK; takes the app's
  active signer. No credentials object — just the server list + signer.
- **`mediaUploader.js`** — add `isBlossomProvider`; route to `blossomService`.
- **Storage pane** (`components/profile-modal.html`, `ProfileStorageController`,
  `storageConnections`) — Blossom provider type: keyless multi-server form +
  payload variant `{ servers }`; hide S3 fields + CORS helper for Blossom.
- **Discovery** — `getServersFromServerListEvent()` + `USER_BLOSSOM_SERVER_LIST_KIND`
  (kind 10063) to read; a publish action to write (BUD-03).
- **Flag** — `config/instance-config.js` → `js/config.js` → `js/constants.js`.
- **Vendor** — `scripts/build-blossom-sdk.mjs` → `vendor/blossom-client-sdk.bundle.min.js`
  (lazy-imported only when a Blossom upload runs).

## Security

- **No stored secret for Blossom** — only public server URLs + the user's signer.
  This *removes* the encrypted-cred-sync surface (#15) for Blossom users; nothing
  to leak, sync, or lock.
- **Auth is short-lived + scoped** — kind-24242 events carry a required NIP-40
  `expiration` and MUST be scoped (`t`, `x` to the blob's sha256, optional `server`
  to the domain). Build fresh per action; never a long-lived token.
- **Signer discipline** — uploads sign per action; reuse one auth across a mirror
  set (SDK) so a multi-server upload isn't N signer prompts, and respect the NIP-07
  circuit-breaker / decrypt-budget invariants. Never log the signed auth event's
  contents beyond what devLogger already gates.
- **Integrity** — verify the returned `sha256` matches the uploaded bytes; on
  download, clients SHOULD verify the hash (BUD-01).
- **Public data only** — Blossom blobs are world-readable; keep private content off
  it (D10).

## Phases (each flag-gated from day one)

- **Phase 0 — Flag + vendor SDK + service skeleton.** `FEATURE_BLOSSOM_STORAGE`,
  `scripts/build-blossom-sdk.mjs`, a `blossomService` stub. No UX.
- **Phase 1 — Upload (headline).** `blossomService.uploadFile` via
  `multiServerUpload` + signer auth + BUD-06 preflight; `isBlossomProvider` routing;
  Storage-pane keyless multi-server form + "test"; torrent parity (D6). Video +
  thumbnail upload land in the same publish pipeline.
- **Phase 1.5 — Discovery.** Read kind-10063 to pre-fill servers; a "publish my
  server list" action (BUD-03).
- **Phase 2 — Management.** BUD-12 `list`/`delete`, orphan-GC parity (#8/#13),
  mirror controls (BUD-04), optional `/media` for thumbnails (BUD-05).
- **Phase 3 — Extras.** DM attachments (only with a private story), BUD-09
  reporting, richer multi-server health/status.

## Risks / watch-items

- **Server availability/churn** → mitigated by multi-server + mirror (D2); surface
  per-server status.
- **Spec still evolving** (BUD-11/12 refactor is recent) → the SDK tracks it; pin
  the exact version (like bitcoin-connect) and wrap it behind our thin service.
- **Large videos = one `PUT`** (no S3 multipart); some servers cap size → BUD-06
  preflight + fall over to another server; surface clear size errors.
- **Server CORS** is the operator's job, not the client's — a misconfigured server
  blocks browser upload; detect + suggest known-good servers.
- **Signer prompts** on multi-server → reuse one auth across the mirror set.
- **Bundle** — lazy-import the SDK only when a Blossom upload actually runs.

## Sources

- Spec + BUDs: `github.com/hzrd149/blossom` (BUD-01/02/03/04/05/06/11/12).
- `github.com/hzrd149/blossom-client-sdk` (v5): `createUploadAuth`, `uploadBlob`,
  `mirrorBlob`, `multiServerUpload`, `multiServerMediaUpload`, `listBlobs`,
  `getServersFromServerListEvent`, `USER_BLOSSOM_SERVER_LIST_KIND`,
  `encodeAuthorizationHeader`.
- NIP-B7 (Blossom media in notes), NIP-40 (expiration), NIP-98 (HTTP auth lineage).
- bitvid: `js/ui/components/mediaUploader.js` (uploadFile seam),
  `js/services/{r2Service,s3UploadService}.js`, `js/ui/profileModal/{ProfileStorageController,storageConnections}.js`,
  `components/profile-modal.html` (Storage pane), `docs/bitcoin-connect-plan.md`
  (flag + vendor pattern), TODO #30.
