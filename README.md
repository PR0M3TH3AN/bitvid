![](https://bitvid.netlify.app/assets/jpg/bitvid.jpg)

# bitvid - Decentralized Video Sharing

**bitvid** is a decentralized platform where users can share videos and follow creators with privacy and freedom. Built with a static site architecture, it operates entirely as a **static client**—it does not run a backend server, hold custody of user keys, or sign requests on behalf of users. All signing and state management happen client-side or via a connected Nostr signer.

---

## Features

- **Decentralized Sharing**: Publish and browse videos without a centralized server.
- **Channel profile pages**: The [channel view](views/channel-profile.html) and `js/channelProfile.js` render banners, playlists, links, and follow stats so every creator has a branded landing page.
- **Audience flags**: The [Upload](components/upload-modal.html) and [Edit Video](components/edit-video-modal.html) modals expose **NSFW** and **For Kids** toggles that map straight to note metadata for safer discovery.
- **Richer metadata repeaters**: Configure variants, captions, segments, participants, references, and hashtags directly in the Upload modal so posts ship with structured context.
- **Flexible S3 Uploads**: Publish using browser-held keys, manual uploads, or presigned manifests.
- **Encrypted Watch History**: Sync viewing activity privately through the NIP-04 encrypted pipeline with local fallbacks.
- **Live View Counters**: Subscribe to view events and see totals update in real time on video cards and the video modal.
- **Lightning Zaps**: Tip creators with Lightning payments via the Zap controls in the video modal.
- **Private Video Listings**: Hide cards from shared grids by flipping the visibility switch in the Edit Video modal after publishing.
- **Nostr Integration**: Use Nostr keys for login and interaction.
- **WebTorrent Streaming**: Stream videos directly through torrent technology.
- **Developer-Friendly**: Open source and customizable for your needs.
- **Responsive Design**: Seamless experience across devices.

---

## For Users

### Getting Started

1. **Visit the Site**: Navigate to the live instance of **bitvid** (e.g., `[https://bitvid.network](https://bitvid.network)`).
2. **Login with Nostr**:
   - Use a compatible Nostr browser extension or manually input your public key.

### Upload a video

Open the **Upload** modal from the header toolbar and start by selecting the NIP-71 event type that matches your post. The chooser sets the correct Nostr kind and schema defaults so the published note follows [`docs/nostr-event-schemas.md`](docs/nostr-event-schemas.md).

Both upload modes expose metadata repeaters for **variants** and **hashtags**, while the [Edit Video](components/edit-video-modal.html) modal offers the full suite (including **captions/text tracks**, **segments**, **participants**, and **references**). Use these when you have multiple playback qualities (variants), accessibility tracks (captions), multipart drops (segments), discoverability tags (hashtags), credited collaborators (participants), or cross-posts/threads (references). Skip any repeater you don’t need—the base schema stays valid without them.

Pick the flow that matches your source material. Supported S3 upload modes include:

1.  **Browser-held S3 keys (trusted operator only):** Enter your S3 credentials in the Storage tab to upload directly from the browser.
    > **Security Warning:** This mode requires storing encrypted credentials in the browser's IndexedDB. While keys are encrypted at rest, they are decrypted in memory during use. Use this mode only on self-hosted, trusted deployments where you control the environment. Do not enter high-value credentials on public or untrusted instances.
2.  **Manual upload via provider console:** Upload your file to your storage provider (e.g., R2, S3) manually, then paste the public URL into the upload form.
3.  **Operator-provided presigned manifests:** Use a presigned JSON manifest prepared externally to authorize the upload without exposing long-lived credentials to the browser.

**Upload File (direct S3 upload)**:
If you are using **Mode 1** (Browser-held keys), enter your credentials in the guided form or Storage tab. Optionally expand the **Advanced options** accordion to override pathing or access controls, then drop media files for bitvid to upload through the S3 API. The modal tracks progress, applies your metadata selections, auto-fills the primary `imeta` variant once the upload completes, and publishes the resulting URL back into the note automatically.

**External Link (hosted URL or magnet)**:
For **Mode 2** (Manual upload) or external content, provide a title plus an HTTPS video URL and/or a WebTorrent magnet. The form requires at least one transport, validates `ws=`/`xs=` hints, keeps magnets raw by decoding them with `safeDecodeMagnet()` before publish, and applies whatever metadata repeaters you configured. If you submit a magnet without a hosted URL, the modal warns that availability depends on peers seeding the torrent.

Hosted URLs remain the preferred playback path, and you can still add a magnet or supplemental web seeds when using any mode. Use the **Private** toggle to keep the resulting card visible only to you, and lean on the repeaters whenever you want to surface richer context or alternate assets as outlined in the event schema reference.

### User content identifiers & storage layout

Every video note ships with a stable series identifier so edits and deletes can be stitched together reliably. bitvid sets both the `videoRootId` (content payload) and the NIP-33 `d` tag to the same value. When you publish, the identifier is chosen from the first provided value in `videoRootId`, `seriesId`, or `seriesIdentifier`; if none are supplied, bitvid generates a timestamp-based fallback. Keep this identifier stable across edits so older versions collapse correctly in the UI.【F:js/nostr/client.js†L5348-L5389】

Storage tags hang off that identifier to make asset discovery deterministic:

- **Storage pointer (`s` tag)**: The note includes `['s', '<provider>:<prefix>']`. If you don’t supply a pointer, bitvid derives one from the hosted URL (preferred), the torrent info hash (as `btih:<hash>`), or finally the `videoRootId` fallback (`nostr:<videoRootId>`).【F:js/nostr/client.js†L823-L862】
- **Prefix derivation**: For URL-based assets, the prefix is the public base URL plus the object key **without** its file extension. For example, `/uploads/demo/video.mp4` becomes `/uploads/demo/video`.【F:js/utils/storagePointer.js†L56-L88】
- **`info.json` location**: The companion metadata file lives at `<prefix>.info.json`. If the storage prefix is not an absolute URL, the UI uses the hosted URL’s origin to build the prefix before appending `.info.json` (and falls back to the raw prefix when no URL is available).【F:js/utils/storagePointer.js†L90-L129】
- **`info.json` contents**: The file is expected to describe the stored assets that back the note—typically the hosted URLs and optional WebTorrent metadata (info hash, web seeds, torrent URL) along with the derived prefix—so the UI can hydrate asset metadata even when the note only carries minimal fields.

**How the UI resolves assets**

1. The NIP-71 parser reads the `s` tag and hosted URL from the note, then computes `infoJsonUrl` from the storage pointer and URL fallback rules.【F:js/nostr/nip71.js†L1479-L1510】【F:js/utils/storagePointer.js†L90-L129】
2. Video cards embed the hosted URL, magnet, and `infoJsonUrl` as `data-play-url`, `data-play-magnet`, and `data-info-json` attributes for click handlers to consume.【F:js/ui/components/VideoCard.js†L2641-L2687】
3. When a card is clicked, the view extracts those attributes; if `infoJsonUrl` is missing, playback still proceeds using the hosted URL/magnet from the note without the extra metadata file.【F:js/ui/views/VideoListView.js†L1032-L1072】

**Example object key layout**

```
Storage pointer (s tag): s3:https://cdn.example.com/uploads/demo/video
Hosted asset:            https://cdn.example.com/uploads/demo/video.mp4
Torrent metadata:        https://cdn.example.com/uploads/demo/video.torrent
Info JSON:               https://cdn.example.com/uploads/demo/video.info.json
```

### How playback works

1. **URL-first**: `playVideoWithFallback({ url, magnet })` attempts the hosted URL immediately. Healthy URLs deliver the full experience without touching P2P resources.
2. **WebTorrent fallback**: If the URL probe fails or returns an error status, bitvid falls back to WebTorrent using the raw magnet. The helpers append HTTPS `ws=`/`xs=` hints so peers seed quickly.
3. **Safety checks**: Magnets are decoded with `safeDecodeMagnet()` and normalized via `normalizeAndAugmentMagnet()` before reaching WebTorrent. Trackers remain WSS-only to satisfy browser constraints.
4. **Operator playbook**: If a deployment causes playback regressions, flip the relevant feature flags back to their default values in `js/constants.js` and redeploy. Capture the rollback steps in AGENTS.md and the PR description so the Main channel stays stable.
5. **Deep dive**: See [`docs/playback-fallback.md`](docs/playback-fallback.md) for the call flow into `playbackService`, magnet normalization details, and fallback hand-off points.

### Embed player

- **Embed URL format**: `/embed.html?pointer=<naddr-or-nevent>&playback=<url|torrent>`. The `pointer` can be a NIP-19 `naddr`/`nevent`, a `kind:pubkey:d` string, or a raw hex event id. The `playback` query param forces CDN (`url`) or WebTorrent (`torrent`) mode; omit it to let bitvid choose automatically.
- **Same-origin requirement**: To reuse session-actor storage for view counters, the embed must be served from the same origin as the parent page (so the iframe can access the same storage bucket).
- **Framing headers**: If you intend to embed across sites, ensure your hosting headers allow framing (e.g., Netlify `_headers` with `Content-Security-Policy: frame-ancestors *` or a narrowed allowlist).
- **X-Frame-Options**: Do not set `X-Frame-Options: DENY` or `SAMEORIGIN` if cross-site embedding is required.

### Watch history & view counts

- **Encrypted watch history**: When you opt into watch history, bitvid stores entries locally and syncs them as NIP-04 encrypted events so only your keys can decrypt them. The History view and the Profile modal’s History tab hydrate from relays when available and gracefully fall back to the local cache when offline.
- **Live view counters**: The `viewCounter` module hydrates totals from relays, subscribes to live updates, and dedupes local plays. Video cards and the video modal update in real time as new view events arrive.

### Support creators with Lightning

Click a card to open the video modal and use the **Zap** button (lightning bolt icon) to send Lightning payments. The Zap dialog walks you through selecting an amount, splitting sats, and pushing the payment through your active wallet connection or Nostr Wallet Connect session.

### Moderation & safety controls

Operators can tune thresholds and lists from the Profile modal:

- The **Moderation** tab manages blur and autoplay limits plus the relay-synced mute/ban lists.
- Each video card’s **More** menu surfaces per-video actions powered by `videoMenuRenderers.js`, including:
  - **Repost** to boost the note as a kind 6 event.
  - **Mirror** to republish the hosted URL and magnet as a kind 1063 event.
  - **Rebroadcast** to push the existing event to additional relays (see cooldown note below).
  - **Remove from history** to clear the item from your encrypted watch log.
  - **Mute/Unmute creator** to control local visibility without severing follows.
  - **Blacklist creator** for operators who maintain shared deny lists.
  - **Block creator** to drop their events entirely.
  - **Report** to issue a NIP-56 moderation report.
- When a rebroadcast hits rate limits, the app surfaces cooldown guidance (e.g., “Rebroadcast is cooling down. Try again in 30s.”) so operators know when to retry without spamming relays.

### Hashtag interests & disinterests

- The Profile modal’s **Hashtags** tab lets you maintain interests (tags you want surfaced) and disinterests (tags to downrank) with dedicated input fields and per-tag remove actions. Preferences are cached locally so list edits render instantly.
- bitvid persists the lists by publishing a replaceable `kind 30015` event (legacy `30005` remains readable) with the identifier `bitvid:tag-preferences`. The `HashtagPreferencesService` normalizes tags, keeps interests and disinterests mutually exclusive, and emits change events so UI stays in sync.【F:js/services/hashtagPreferencesService.js†L206-L276】【F:js/services/hashtagPreferencesService.js†L304-L324】【F:docs/nostr-event-schemas.md†L154-L201】
- Legacy `30005` preference events are still fetched and decrypted; saving updates reissues them as `30015`, so convergence happens automatically as viewers adjust their lists. Operators who need a faster rollout can ask affected accounts to re-save (e.g., toggle a tag) to trigger the new publish cycle.【F:js/services/hashtagPreferencesService.js†L360-L470】【F:docs/nostr-event-schemas.md†L196-L201】
- Preference payloads are encrypted before leaving the browser. The service attempts NIP-44 v2 first, falls back to NIP-44 or NIP-04 based on the signer/browser capabilities, records the active scheme in the `['encrypted', <scheme>]` tag, and decrypts in the same priority order when loading from relays.【F:js/services/hashtagPreferencesService.js†L520-L657】【F:js/services/hashtagPreferencesService.js†L356-L511】
- Published ciphertext is stored on every configured write relay and accepted ones are tracked so operators can diagnose relay failures without exposing the plaintext list.【F:js/services/hashtagPreferencesService.js†L658-L711】

---

## For Developers

### Local Setup

To run **bitvid** locally:

1. Clone the repository:

   ```bash
   git clone https://github.com/PR0M3TH3AN/bitvid.git
   cd bitvid
   ```

2. Install dependencies:

   Use `npm ci` to install dependencies exactly as specified in `package-lock.json`. This ensures `npx` finds the correct local `tailwindcss` version.

   ```bash
   npm ci
   ```

3. Build the project:

   ```bash
   npm run build
   ```

   (This generates `css/tailwind.generated.css`, which is gitignored and required for styling.)

4. Start a local server:
   - Using Python:
     ```bash
     python -m http.server 8000
     ```
   - Or with Node.js:
     ```bash
     npx serve
     ```

5. Open the site in your browser:

```
http://localhost:8000
```

### Developer Quickstart

See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for the full developer guide.

**Verify your work:**

- **Run unit tests**: `npm run test:unit` (Required before PRs). _Tip: Use `npm run test:unit:shard1` for faster local feedback._
- **Format code**: `npm run format` (Required before PRs)
- **Lint code**: `npm run lint` (Checks for CSS, hex colors, inline styles)

**Other commands:**

- **Run DM unit tests**: `npm run test:dm:unit`
- **Run DM integration tests**: `npm run test:dm:integration`
- **Run headless E2E tests**: `npm run test:e2e`
- **Run visual regression tests**: `npm run test:visual`
- **Cancel CI runs**: See [`docs/cancelling-ci-runs.md`](docs/cancelling-ci-runs.md) for a script to clear pending workflows.

### Docs navigation & TOC updates

The docs viewer reads `content/docs/toc.json` to build the sidebar tree and map `doc` slugs to Markdown files. Each entry defines the label shown in the UI and the slug used in deep links. Add new docs content by creating a Markdown file under `content/` (or a subfolder) and then adding a matching entry in `content/docs/toc.json` that points to the new slug. Keep the slug and filename in sync so the reader can resolve the Markdown content and the sidebar link. Deep links follow the format `#view=docs&doc=<slug>` (for example, `#view=docs&doc=getting-started`). QA acceptance criteria for new docs include: the sidebar link appears, the deep link opens the correct document, the mobile drawer lists the new item, and the Markdown renders as expected (headings, lists, links, etc.).【F:content/docs/toc.json†L1-L5】

### Running Tests in Docker

To run Playwright tests in a consistent containerized environment, use the provided Docker script:

```bash
./scripts/run-playwright-docker.sh [command]
```

- **Default**: Runs `npm run test:visual`.
- **Custom command**: Pass any command as an argument, e.g., `./scripts/run-playwright-docker.sh npm run test:e2e`.

The script:

1. Builds the `bitvid-playwright` Docker image (based on `mcr.microsoft.com/playwright`).
2. Mounts the current directory to `/app` (allowing source changes to be reflected immediately).
3. Uses an anonymous volume for `/app/node_modules` to preserve the container's Linux-specific dependencies.
4. Outputs test artifacts to `artifacts/test-results` (accessible on the host).

### Visual Regression Debugging

Visual regression tests (`test:visual`) are configured to retain screenshots, videos, and traces when they fail. These artifacts are stored in the `artifacts/test-results` directory.

To quickly view the location of these artifacts:

```bash
./scripts/show-artifacts.sh
```

Use these artifacts to inspect the UI state at the moment of failure and diagnose rendering issues or regressions.

### Send your first video post

Use the event builders in `js/nostrEventSchemas.js` (the source of truth for all event definitions) to construct valid video notes. See [`docs/nostr-event-schemas.md`](docs/nostr-event-schemas.md) for full schema documentation.

```javascript
import { buildVideoPostEvent } from "./js/nostrEventSchemas.js";

// 1. Build the event object (useful for inspection or custom publishing)
const event = buildVideoPostEvent({
  // Provide your hex pubkey (not npub)
  pubkey: "your_pubkey_hex",
  created_at: Math.floor(Date.now() / 1000),
  dTagValue: "my-first-video", // The stable identifier (d-tag) for this video series
  content: {
    version: 3,
    title: "My First Video",
    videoRootId: "my-first-video", // Logical ID, matches the d-tag
    url: "https://example.com/video.mp4",
    description: "This is a test video post sent via the SDK."
    // magnet: "magnet:?xt=urn:btih:..." // Optional fallback (provide the raw magnet string)
  }
});

console.log("Event constructed:", event);

// 2. Publish using the high-level client (requires browser/extension or active signer)
/*
import { nostrClient } from "./js/nostrClientFacade.js";

// Ensure client is connected
await nostrClient.init();

// Login (prompts NIP-07 extension)
await nostrClient.login();

// Publish! (Handles signing and relay broadcasting)
await nostrClient.publishVideo({
  title: "My First Video",
  url: "https://example.com/video.mp4",
  description: "Published via bitvid SDK"
}, nostrClient.pubkey);
*/
```

### CSS build pipeline

Tailwind utilities are generated from `css/tailwind.source.css` and themed via
the shared tokens in `css/tokens.css`. Install dependencies once and lean on the
package scripts to keep formatting, linting, and generated output consistent:

- **Token imports:** `css/tailwind.source.css` imports `css/tokens.css`, and
  Tailwind consumes that source file directly so utilities inherit the same
  palette, spacing, and typography primitives across the stack—no
  `css/style.css` intermediary.
- **Core scripts:**

  ```bash
  npm run format    # normalize CSS/HTML/JS/MD sources with Prettier + tailwindcss plugin
  npm run lint:css  # enforce design token usage and guard against raw hex colors
  npm run build     # run the Tailwind build locally (output remains gitignored)
  ```

- **No hard-coded colors:** Follow the token-first rules in `AGENTS.md`—reach
  for semantic tokens instead of literal HEX/RGB values.
- **Theme scopes:** Apply tokens by toggling the `data-theme` attribute on
  scope wrappers so components stay palette-agnostic.

```bash
npm install               # install Prettier, Stylelint, and Tailwind toolchain
npm run format            # format CSS/HTML/MD with Prettier + tailwindcss plugin
npm run lint              # run CSS, hex color, inline-style, design-token, and Tailwind color/bracket guards in one pass
npm run lint:css          # enforce token usage and forbid raw hex colors
npm run lint:inline-styles # fail CI if inline style attributes or element.style usage slip in
npm run build             # run the Tailwind build (delegates to npm run build:css)
npm run build:beacon      # bundle torrent/dist assets and re-run the inline-style guard
npm run build:beacon:bundle # bundle beacon assets without running the guard (rarely needed)
```

#### Admin runbook: regenerate Tailwind styles

Need to confirm Tailwind picks up token or template changes? Run these
commands from the repo root:

1. Install dependencies (only required after cloning or when packages change):

   ```bash
   npm install
   ```

2. Rebuild the Tailwind bundle for local verification (the output stays
   gitignored and CI/Netlify handle deploy-time generation):

   ```bash
   npm run build:css
   ```

The generated `css/tailwind.generated.css` artifact is ignored in git. CI
workflows and Netlify deploys run `npm run build` to produce the compiled
stylesheet during deployment, so source changes are all you need to commit.

Inline styles are intentionally blocked. `npm run lint:inline-styles` scans HTML
and scripts for `style=` attributes, `element.style`, or `style.cssText` usage
and will fail CI until offending markup is moved into the shared CSS/token
system.

#### Design token guard

`npm run lint:tokens` inspects JavaScript **and** `css/tailwind.source.css`
for raw `px`/`rem` measurements. Prefer design tokens, Tailwind `theme()` calls,
or existing utilities over hard-coded lengths. When unavoidable (for example
hairline borders or browser reset quirks) add an explicit allowlist entry in
`scripts/check-design-tokens.mjs` so future contributors understand why the
constant exists.

The script now crawls every markup-emitting module under `js/ui`,
`js/channelProfile.js`, and `torrent/ui`, so UI tweaks anywhere in the repo
benefit from the guard without manual configuration.

Beacon builds inherit the same rule. `npm run build:beacon` now bundles
`torrent/dist` and immediately re-runs the inline-style checker against the
fresh output so third-party dependencies cannot sneak inline style mutations
into production. Use `npm run build:beacon:bundle` only if you need the raw
esbuild output for debugging.

### Nostr facade migration

Nostr helpers now ship behind dedicated facades so downstream plugins can pick
the entry point that matches their feature set:

1. **Default client ([NIP-07](https://github.com/nostr-protocol/nips/blob/master/07.md)):** `import { nostrClient, requestDefaultExtensionPermissions } from './nostrClientFacade.js';`
2. **View counters ([NIP-71](https://github.com/nostr-protocol/nips/blob/master/71.md)):** `import { recordVideoView, subscribeVideoViewEvents } from './nostrViewEventsFacade.js';`
3. **Watch-history lists ([NIP-51](https://github.com/nostr-protocol/nips/blob/master/51.md) + [NIP-04](https://github.com/nostr-protocol/nips/blob/master/04.md) encryption):** `import { updateWatchHistoryListWithDefaultClient } from './nostrWatchHistoryFacade.js';`

The legacy `js/nostr.js` shim has been removed. Update any remaining
`import { ... } from './nostr.js';` calls to use the facades above so upgrades
stay painless.

### Signer Adapters

bitvid exposes a stable signer API through `js/nostrClientFacade.js`, which
wraps the shared client created in `js/nostr/defaultClient.js` and registers
signer adapters in `js/nostr/client.js`. Import the facade whenever you need to
sign events or encrypt payloads so the adapter registry can select the active
signer, fall back to supported capabilities, and surface permission prompts.

Use the facade for the common, stable entry points:

```js
import {
  nostrClient,
  requestDefaultExtensionPermissions
} from "./nostrClientFacade.js";
```

Custom auth providers should still register their signer object through the
adapter registry in `js/nostr/client.js`, but downstream modules should only
call the facade to keep API surfaces consistent.

### Nostr video fetch limits

`nostrClient.fetchVideos(options)` now accepts an optional `options.limit` to
control how many video events are requested per relay. The request size defaults
to `DEFAULT_VIDEO_REQUEST_LIMIT` (150) and is clamped to
`MAX_VIDEO_REQUEST_LIMIT` (500) to avoid accidental firehose requests as the
network grows. Use a smaller limit for lightweight surfaces or a larger value
when running batch jobs that can tolerate additional load.

The build command compiles Tailwind with `tailwind.config.cjs`, runs it through
the PostCSS pipeline defined in `postcss.config.cjs` (for autoprefixing), and
emits the purged, minified stylesheet at `css/tailwind.generated.css`. That
bundle is generated automatically during CI/Netlify deploys and remains
gitignored locally; reference `css/tailwind.generated.css` in templates, but do
not commit the compiled file. Avoid vendoring legacy `tailwind.min.css`
artifacts now that the deploy pipeline owns the build step.

### Logo usage

- Wrap inline logo `<svg>` elements with the `.bv-logo` component class. It
  seeds `--logo-wordmark-color`, `--logo-accent-color`, and
  `--logo-background-color` with the palette tokens exported in
  `css/tokens.css`.
- Adjust variants through data attributes instead of inline styles. For
  example, `data-wordmark="current"` ties the wordmark to the wrapper’s
  `currentColor`, `[data-variant="inverse"]` swaps in the inverse palette, and
  `data-accent="current"` makes the accent follow the surrounding text when
  needed.
- Inside the SVG, target elements with `.bv-logo__wordmark`,
  `.bv-logo__accent`, and `.bv-logo__background` so fills inherit the custom
  properties seeded by `.bv-logo`. Group paths with `<g>` wrappers where
  possible to avoid repeating classes on every primitive.
- Use Tailwind text utilities (such as `text-text-strong` or `text-text`) on the
  wrapper to resolve to token-backed colors. Avoid hard-coded hex colors in the
  SVG; customize the logo via the provided classes when deployments need a
  different accent or background.

### Configuration

- **`config/instance-config.js`**:
  - Central place for instance-specific values like the Super Admin npub and the
    default whitelist-only mode setting. Update the documented exports here when
    preparing a new deployment.
  - See [`docs/instance-config.md`](docs/instance-config.md) for a full
    reference of every setting and how to tune it.
  - Flip `IS_DEV_MODE` to `false` before shipping production builds. The flag
    flows into `js/config.js` as `isDevMode`, seeds the
    `window.__BITVID_DEV_MODE__` global for inline scripts, and gates whether the
    dev logging channel emits to the console. See
    [`docs/logging.md`](docs/logging.md) for rollout guidance.
  - Tune `PLATFORM_FEE_PERCENT` (0–100) to keep a percentage of Lightning tips.
    When the fee is positive, bitvid routes the platform’s split to
    `PLATFORM_LUD16_OVERRIDE`, so set it to the Lightning address that should
    receive the sats (or publish a `lud16` on the Super Admin profile). Leave
    the fee at `0` to pass through every satoshi.
  - Populate `DEFAULT_RELAY_URLS_OVERRIDE` with WSS URLs to replace the bundled
    relay bootstrap list. Keep it empty to stick with the upstream defaults.
  - Customize `THEME_ACCENT_OVERRIDES` with `#RRGGBB` hex strings when you want
    light or dark mode to use different accent, accent-strong, or
    accent-pressed colors. Leave the values `null` to inherit the defaults from
    `css/tokens.css`.
- **`js/config.js`**:
  - Re-exports `isDevMode` (derived from `IS_DEV_MODE`) for modules, publishes
    `window.__BITVID_DEV_MODE__`, and centralizes the global configuration
    surface.
- **`js/utils/logger.js`**:
  - Provides the shared `logger` utility. Route user-facing errors through
    `logger.user` and keep experimental diagnostics on `logger.dev` so operators
    can quiet development noise in production. Details live in
    [`docs/logging.md`](docs/logging.md).
- **`js/constants.js`**:
  - Source for browser-safe tracker lists and feature flags that govern WebTorrent behavior.
- **Magnet helpers**:
  - Use `safeDecodeMagnet()` and `normalizeAndAugmentMagnet()` from `js/magnetUtils.js` to preserve hashes and add `ws=` / `xs=` hints safely.

### Relay compatibility

bitvid now requests per-video discussion counts using the NIP-45 `COUNT` frame. The bundled client opens each relay via
`this.pool.ensureRelay(url)` and streams a raw `COUNT` message, so your relay stack must understand that verb (nostr-tools ≥ 1.8
or any relay advertising NIP-45 support). Relays that do not implement `COUNT` are skipped gracefully—the UI keeps the count
placeholder at “—” and development builds log a warning—so mixed deployments remain usable while you phase in compatible relays.

### Adding Features

1. **Fork the repository** and create a new branch for your feature.
2. Make changes and test locally.
3. Submit a pull request with a detailed explanation of your contribution.

---

## For Contributors

### How to Contribute

Please see [`CONTRIBUTING.md`](./CONTRIBUTING.md) for detailed setup instructions, code guidelines, and agent PR conventions.

1. **Fork and Clone** the repository.
2. **Create a Branch** for your feature or fix.
3. **Install Dependencies** with `npm ci`.
4. **Make Changes** and ensure tests pass.
5. **Submit a Pull Request** with a clear description.

---

## Testing

Continuous integration runs CSS linting/builds, the DM unit/integration suites, the Playwright kitchen-sink snapshots, headless E2E flows, and the Node-based unit tests on every push.
Before pushing, run `npm run build` locally so the Tailwind bundle regenerates.
Pair that with `npm run test:unit` for application logic changes, or a shard
(`npm run test:unit:shard1`, `test:unit:shard2`, `test:unit:shard3`) when you want to
split the suite. You can also set `UNIT_TEST_SHARD=1/3` or pass `--shard=1/3`
to `scripts/run-unit-tests.mjs` for custom shard splits, and use
`UNIT_TEST_TIMEOUT_MS=120000` to abort a single stalled test file without
blocking the entire run. `npm run test:visual` covers presentation updates to mirror the CI surface area.
For DM-specific changes, also run `npm run test:dm:unit` and
`npm run test:dm:integration` to cover the direct message flows.
Use `npm run test:e2e` to execute the headless Playwright journeys in `tests/e2e`.

### Manual QA checklist

Use this checklist before releases or when altering upload/playback flows:

1. Open the Upload modal, confirm validation (title plus URL or magnet), and test submissions for URL-only, magnet-only, and combined entries.
2. Publish a post with both URL and magnet, verify the player streams the hosted URL, then simulate a URL failure and confirm WebTorrent playback.
3. Paste encoded magnets to ensure `safeDecodeMagnet()` returns the raw string and `normalizeAndAugmentMagnet()` adds `ws=` / `xs=` hints without corruption.
4. Confirm magnets include HTTPS `ws=` / optional `xs=` hints and use the WSS tracker list from `js/constants.js`.
5. Spot-check Chromium and Firefox for console warnings (CORS, Range requests, tracker connectivity).

See [`docs/qa.md`](docs/qa.md) for the copy/paste-friendly checklist we share with QA.

---

## Acknowledgments

**bitvid** leverages the following open-source technologies:

- **Nostr Tools** for decentralized identity management.
- **WebTorrent** for P2P video streaming.
- **TailwindCSS** for responsive design.

---

## Contact & Support

- **Website**: [bitvid.network](https://bitvid.network)
- **GitHub**: [PR0M3TH3AN](https://github.com/PR0M3TH3AN)
- **Nostr**: [npub13yarr7j6vjqjjkahd63dmr27curypehx45ucue286ac7sft27y0srnpmpe](https://primal.net/p/npub13yarr7j6vjqjjkahd63dmr27curypehx45ucue286ac7sft27y0srnpmpe)

---

## License

GPL-3.0-or-later. See [LICENSE](./LICENSE).
