# NIP-71 On-Boarding + Cross-Ecosystem Dedup — Dev Plan

Status: **planned** (not started). Owner: TBD. Branch: `unstable`.
Companion to `docs/nip71-migration-plan.md` (off-boarding / mirror / ingest, all shipped).

## Goal

Make NIP-71 interop a **two-way street**:

1. **Off-boarding (DONE):** a bitvid video (kind 30078) is mirrored *out* to NIP-71
   (addressable 34235/36) so other apps can discover it.
2. **On-boarding (THIS PLAN):** a creator's NIP-71 video published via another app
   can be pulled *into* bitvid so it gains bitvid's advantages — CDN-hosted URL,
   a WebTorrent source, and (optionally) bitvid extras.

And the invariant that makes both safe to coexist:

3. **One video, never two.** When the same video exists in both ecosystems, always
   prefer the **bitvid** (kind-30078) version, show **exactly one**, in **every**
   grid/list/scenario. Never both.

## The hard constraint (why on-boarding is creator-initiated)

Off-boarding works because the bitvid creator owns the video and signs BOTH events
with their own key. On-boarding is **not symmetric**: a foreign NIP-71 video is
signed by the foreign creator's key, and bitvid cannot forge a kind-30078 note
authored by someone else (no private key). Therefore:

- **On-boarding = creator-initiated self-import only.** A creator who published
  NIP-71 videos elsewhere logs into bitvid **with the same npub**, and bitvid
  offers to import them: re-host the file to **their own** connected storage (CDN),
  optionally seed WebTorrent, and publish a bitvid kind-30078 version **signed by
  their key**. No auto-rehosting of other people's files (consent / cost /
  liability). This mirrors off-boarding exactly: both directions author-owned and
  consensual.

## Locked decisions (from design discussion)

- On-boarding model: **A — creator-initiated self-import.**
- Dedup identity: **explicit import-link + content hash** (`fileSha256`/`ox`) +
  infohash (`i`/magnet btih). NO fuzzy url/title matching (avoids false merges).
  Note: hash-less foreign videos (e.g. url+image only) won't dedup unless they
  were on-boarded (which adds an explicit link) — acceptable.
- Advantages on import: **CDN url + WebTorrent source** (baseline). bitvid extras
  (comments, view counts, edit-in-place, private toggle) come free once it's a
  real 30078 note; no extra work.
- Cadence: **one-shot import with a re-run button** (not continuous lockstep).
  Re-running re-imports anything new.

## Phasing — dedup FIRST (it's needed regardless of on-boarding)

### Phase 1 — Cross-ecosystem dedup ("prefer bitvid, show one, everywhere")

Why first: even today, a creator who independently posts to bitvid AND Nostube can
produce two cards. And the moment on-boarding exists, the original + imported
versions both exist on relays. Dedup must land before/with on-boarding.

- **Identity key:** `author + (importLink ‖ fileSha256 ‖ ox ‖ infoHash)`.
  - `importLink`: pointer an on-boarded 30078 carries to the original NIP-71
    event/address (added in Phase 2). Most reliable.
  - Hashes/infohash already extracted by `convertEventToVideo` (30078) and
    `buildVideoFromNip71Event` (foreign) — confirm both populate `fileSha256` /
    `originalFileSha256` / `infoHash`.
- **Preference:** within an identity group, keep the bitvid version
  (`source !== "nip71-ingest"` / kind 30078); else keep the NIP-71 one.
- **Placement (one chokepoint → all grids):** the feed AND channel profile already
  call `app.dedupeVideosByRoot(...)`. Add a pure `collapseCrossEcosystem(videos)`
  pass and either chain it after root-dedup inside that shared helper, or wrap
  both into one `dedupeVideos(videos)` used everywhere (feed engine
  `createDedupeByRootStage`, `buildRenderableChannelVideos`, My Videos, search,
  playlists, watch history). Audit every list builder for the shared call.
- **Bitvid's own outbound mirrors** are already skipped at ingest
  (`client=bitvid` + `a` back-pointer) — keep that; this pass handles the rest.
- **Tests (cheat-resistant, pure):** same-hash bitvid+foreign → only bitvid kept;
  foreign-only (no bitvid) → foreign kept; distinct videos not merged; hash-less
  pair NOT merged (documented limitation); import-link match → original hidden.
  Mutation-verify the prefer-bitvid selection and the identity grouping.

### Phase 2 — Creator-initiated on-board import

- **Discovery:** on login, find the logged-in creator's own NIP-71 videos (reuse
  the ingest subscription/adapter, scoped to `authors:[viewerPubkey]`) that have
  **no** corresponding bitvid 30078 yet (via the Phase-1 identity key).
- **UI:** a "Import your videos from other apps" surface (My Videos pane or a
  one-time prompt): list importable items, let the creator pick, show what import
  does. Requires their **storage connected** (re-host target) and signer.
- **Import action (per video), reusing existing plumbing:**
  1. Fetch the source file from the foreign `url` (or resolve via magnet).
  2. Re-host to the creator's connected storage (reuse `storageService` /
     `r2Service` upload path used by normal uploads) → bitvid CDN url.
  3. Optionally create a `.torrent` + WebTorrent magnet (reuse upload's torrent
     path) so the video gets a P2P source.
  4. Build + publish a kind-30078 note **signed by the creator** (reuse
     `videoPublisher` / `buildVideoPostEvent`), carrying: title, description,
     hashtags, dims/duration (from the foreign imeta via the adapter), the new
     CDN url + magnet, AND an explicit `["imported-from", "<orig event id / a-addr>"]`
     provenance tag for dedup + attribution.
  5. (Optional, symmetric) since it's now a normal bitvid video, the existing
     outbound mirror/auto-share can keep the NIP-71 side in lockstep going forward.
- **Result:** the bitvid 30078 is now canonical; Phase-1 dedup hides the original
  foreign event everywhere; the creator gets CDN + WebTorrent + bitvid features.
- **Guards:**
  - Only the **same-pubkey** creator can import their own videos (signer == author).
  - Never import NSFW outward against `ALLOW_NSFW_CONTENT` (mirror the existing
    gate); carry `content-warning → isNsfw`.
  - Re-host uses the creator's storage only; surface cost/ownership in the copy.
  - One-shot; a "re-scan / import new" button re-runs discovery.

## Non-goals / future

- No instance-level auto-rehosting of arbitrary creators' files (model B) — consent/
  cost/liability. Revisit only with explicit per-instance policy + creator opt-in.
- No fuzzy (url/title) dedup — revisit only if hash-less dual-posts become a real
  problem.
- Continuous lockstep on the inbound side (re-import on the creator editing the
  original elsewhere) — deferred; one-shot + re-run is enough for launch.

## Reuse map (existing code to lean on)

- `js/nostr/nip71IngestAdapter.js` — foreign event → video (hashes, dims, imeta).
- `js/nostr/nip71Mirror.js` — outbound mirror (keeps NIP-71 side in lockstep after import).
- `js/services/nip71IngestService.js` — author-scoped subscription pattern for discovery.
- `js/channelProfileVideos.js`, feed `createDedupeByRootStage`, `app.dedupeVideosByRoot`
  — the dedup chokepoints to extend.
- `storageService` / `r2Service` / upload + torrent paths — re-host + seed.
- `videoPublisher` / `buildVideoPostEvent` — publish the signed 30078.
