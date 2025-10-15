![](https://bitvid.netlify.app/assets/jpg/bitvid.jpg)

# bitvid - Decentralized Video Sharing

##### IPNS: [k51qzi5uqu5dgwr4oejq9rk41aoe9zcupenby6iqecsk5byc7rx48uecd133a1](https://k51qzi5uqu5dgwr4oejq9rk41aoe9zcupenby6iqecsk5byc7rx48uecd133a1.ipns.dweb.link/)

**bitvid** is a decentralized platform where users can share videos and follow creators with privacy and freedom. Built with a static site architecture, it’s lightweight, efficient, and fully decentralized, making it ideal for hosting or local deployment.

---

## Features

- **Decentralized Sharing**: Video sharing without central servers.
- **Private Video Listings**: Hide cards from shared grids so only the owner sees them.
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

### Post a video

The upload modal enforces **Title + (URL or Magnet)**. Hosted URLs are strongly recommended so the player can start instantly, and you may also add a magnet for resilience.

- **Title**: Required. Matches the in-app validation copy.
- **Hosted URL (recommended)**: Supply an HTTPS MP4/WebM/HLS/DASH asset. This is the primary playback path.
- **Magnet (optional but encouraged)**: Paste the literal `magnet:?xt=urn:btih:...` string. The form decodes it with `safeDecodeMagnet()` to prevent hash corruption. Never wrap magnets in `new URL()`—store them raw or decode then pass directly to the helpers.
- **Web seeds (`ws=`)**: HTTPS only. Point to a file root (e.g., `https://cdn.example.com/video/`). Mixed-content (`http://`) hints are rejected just like the modal message explains.
- **Additional sources (`xs=`)**: Recommend adding an HTTPS `.torrent` link so WebTorrent peers can bootstrap faster.
- **Trackers**: bitvid’s browser client only connects to WSS trackers shipped in `js/constants.js`. Do not add UDP or plaintext HTTP trackers to published magnets.
- **Private toggle**: Hides the card from shared grids so only you see it and adds a purple accent so the private state stands out.

### How playback works

1. **URL-first**: `playVideoWithFallback({ url, magnet })` attempts the hosted URL immediately. Healthy URLs deliver the full experience without touching P2P resources.
2. **WebTorrent fallback**: If the URL probe fails or returns an error status, bitvid falls back to WebTorrent using the raw magnet. The helpers append HTTPS `ws=`/`xs=` hints so peers seed quickly.
3. **Safety checks**: Magnets are decoded with `safeDecodeMagnet()` and normalized via `normalizeAndAugmentMagnet()` before reaching WebTorrent. Trackers remain WSS-only to satisfy browser constraints.
4. **Operator playbook**: If a deployment causes playback regressions, flip the relevant feature flags back to their default values in `js/constants.js` and redeploy. Capture the rollback steps in AGENTS.md and the PR description so the Main channel stays stable.

---

## For Developers

### Local Setup

To run **bitvid** locally:

1. Clone the repository:

   ```bash
   git clone https://github.com/PR0M3TH3AN/bitvid.git
   cd bitvid
   ```

2. Start a local server:
   - Using Python:
     ```bash
     python -m http.server 8000
     ```
   - Or with Node.js:
     ```bash
     npx serve
     ```

3. Open the site in your browser:

```
http://localhost:8000
```

### CSS build pipeline

Tailwind utilities are generated from `css/tailwind.source.css` and themed via
the shared tokens in `css/tokens.css`. Install dependencies once and lean on the
package scripts to keep formatting, linting, and generated output consistent:

- **Token imports:** `css/tokens.css` feeds `css/style.css`, which in turn seeds
  `tailwind.config.cjs` so utilities inherit the same palette, spacing, and
  typography primitives across the stack.
- **Core scripts:**

  ```bash
  npm run format    # normalize CSS/HTML/JS/MD sources with Prettier + tailwindcss plugin
  npm run lint:css  # enforce design token usage and guard against raw hex colors
  npm run build:css # rebuild css/tailwind.generated.css from tailwind.source.css
  npm run check:css # fail CI if tailwind.generated.css is out of date
  ```

- **No hard-coded colors:** Follow the token-first rules in `AGENTS.md`—reach
  for semantic tokens instead of literal HEX/RGB values.
- **Theme scopes:** Apply tokens by toggling the `data-theme` attribute on
  scope wrappers so components stay palette-agnostic.

```bash
npm install               # install Prettier, Stylelint, and Tailwind toolchain
npm run format            # format CSS/HTML/JS/MD with Prettier + tailwindcss plugin
npm run lint              # run CSS, hex color, and inline-style guards in one pass
npm run lint:css          # enforce token usage and forbid raw hex colors
npm run lint:inline-styles # fail CI if inline style attributes or element.style usage slip in
npm run build:css         # rebuild css/tailwind.generated.css from tailwind.source.css
npm run build:beacon      # bundle torrent/dist assets and re-run the inline-style guard
npm run build:beacon:bundle # bundle beacon assets without running the guard (rarely needed)
npm run check:css         # CI-friendly guard that fails if tailwind.generated.css is dirty
```

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

The script now crawls every markup-emitting module under `js/blog`, `js/ui`,
`js/channelProfile.js`, and `torrent/ui`, so UI tweaks anywhere in the repo
benefit from the guard without manual configuration.

Beacon builds inherit the same rule. `npm run build:beacon` now bundles
`torrent/dist` and immediately re-runs the inline-style checker against the
fresh output so third-party dependencies cannot sneak inline style mutations
into production. Use `npm run build:beacon:bundle` only if you need the raw
esbuild output for debugging.

The build command compiles Tailwind with `tailwind.config.cjs`, runs it through
the PostCSS pipeline defined in `postcss.config.cjs` (for autoprefixing), and
emits the purged, minified stylesheet at `css/tailwind.generated.css`. Commit the
regenerated file alongside any template changes so deployments pick up the
latest styles. This generated bundle is the only stylesheet we ship—reference
`css/tailwind.generated.css` everywhere and avoid vendoring older `tailwind.min.css`
artifacts.

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

1. **Fork and Clone**:
   ```bash
   git clone https://github.com/PR0M3TH3AN/bitvid.git
   cd bitvid
   ```
2. **Create a Branch**:
   ```bash
   git checkout -b feature/your-feature-name
   ```
3. **Make Changes**:
   - Ensure your code follows best practices and is well-documented.
4. **Test**:
   - Validate the site functionality locally before submitting.
5. **Submit a Pull Request**:
   - Explain your changes and reference any related issues.

### Contribution Guidelines

- Follow the [MIT License](https://opensource.org/licenses/MIT).
- Use clear, concise commit messages.
- Respect the existing coding style and architecture.
- Run the manual QA script (see below) and note results in PR descriptions for changes that affect upload or playback.

---

## Testing

Continuous integration runs CSS linting/builds, the Playwright kitchen-sink snapshots, and the Node-based unit tests on every push.
Before pushing, run `npm run check:css` locally so `css/tailwind.generated.css` stays clean. Pair that with `npm run test:unit` for
application logic changes and `npm run test:visual` for presentation updates to mirror the CI surface area.

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
