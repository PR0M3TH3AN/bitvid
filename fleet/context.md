# Context for the session manager
repo: /home/user/Documents/GitHub/bitvid
node: v22.23.1
harness binaries on PATH: claude, codex
top: .agents .devcontainer .dockerignore .env.local .gitattributes .github .gitignore .npmrc .nvmrc .vercel .vscode AFTER.md AGENTS.md AUDIT_REPORT.md BASELINE.md CHANGELOG.md CLAUDE.md CONTRIBUTING.md Dockerfile INITIAL_BASELINE.md KNOWN_ISSUES.md LICENSE NIP_INVENTORY.md ONBOARDING_REPORT.md OPTIMIZATION_TASKS.md PROTOCOL_INVENTORY.md PR_REVIEWS.md README.md REMEDIATION_REPORT.md SECURITY.md TEST_INTEGRITY.md TRADEMARKS.md VALIDATION_REPORT.md _headers _redirects ai api apply_fix.py artifacts assets audit-report.md benchmarks bitvid-site.zip bitvid_logo calculate_excess.js calculate_excess.mjs components config content context css daily-perf-report-2026-02-08.md daily-perf-report-2026-02-13.md daily-perf-report-2026-02-14.md daily-perf-report-2026-02-15.md daily-perf-report-2026-02-17.md daily-perf-report-2026-02-18.md debug_sidebar.mjs decisions dist docs embed.html examples fleet fleet.config.json index.html issues js memory-update.md middleware.js nip-report-2025-02-12.md nip-report-2026-02-12.md nip-report-2026-02-13.md nip-report-2026-02-15.md nip-report-2026-02-18.md nip-report-2026-02-21.md nip-report-2026-02-22.md node_modules package-lock.json package.json perf playwright-report playwright.bench.config.ts playwright.config.ts postcss.config.cjs prettier.config.cjs releases reports scripts site.webmanifest src stylelint.config.cjs sw.min.js tailwind.config.cjs test-audit test-audit-report-2025-02-18.md test-audit-report-2026-02-12.md test-audit-report-2026-02-15.md test-audit-report-2026-02-18.md test_logs tests todo tools torrent updated_baseline.txt vendor vercel.json verification verify-app.mjs verify-syntax-test.mjs views weekly-perf-report-2026-02-21.md
README:
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
   - Use a compatible NIP-07 browser extension or manually input your public key.
   - For the most reliable experience we recommend a well-maintained signer such as [nos2x](https://github.com/fiatjaf/nos2x) or [Alby](https://getalby.com/). Encrypted features (DMs, hashtag preferences, watch history, block/subscription lists) require the extension to respond to decryption requests.
   - **Troubleshooting:** if those encrypted lists never finish loading after login, bitvid will surface a notice — your extension's signer is likely locked or its background worker went to sleep. Unlock/reload the extension and refresh the page. (bitvid caps relay fan-out and fast-fails an unresponsive signer so the tab no longer pins the CPU while waiting.)

### Upload a video

Open the **Upload** modal from the header toolbar and start by selecting the NIP-71 event type that matches your post. The chooser sets the correct Nostr kind and schema defaults so the published note follows [`docs/nostr-event-schemas.md`](docs/nostr-event-schemas.md).

package: bitvid — 
scripts: start, prepare, serve, build, archive, build:css, build:beacon:bundle, build:beacon, build:bitcoin-connect, build:blossom-sdk, build:hls, ci:beacon, format, audit, lint, lint:file-size, lint:innerhtml, lint:css, lint:hex, lint:inline-styles, lint:tokens, lint:tailwind-brackets, lint:tailwind-colors, check:css, test:visual, test:visual:update, test:e2e, test:e2e:chromium, test:e2e:firefox, test:e2e:deterministic, test:e2e:coverage, test:e2e:coverage:report, test:e2e:extension, test:load, test:smoke, test:dm:unit, test:dm:integration, test, test:unit, test:unit:shard1, test:unit:shard2, test:unit:shard3, telemetry:aggregate, lint:assets, lint:sw-compat, hash:dist, diff:dist-hashes, verify:dist:deploy-artifact, verify:deployed:index-html, purge:cloudflare:changed, smoke:dist-assets, test:e2e:cache-upgrade, lint:pool-access
recent commits:
5fdf53de chore: pause Bitvid automated design audit
4dd3eb03 Add repo memory layer and agent governance
911afb1c Split AGENTS.md reference sections into docs/; keep thin agent constitution
6eb89afc Dedupe CLAUDE.md testing rules into AGENTS.md pointer; untrack agent memory scratch
c098612c Make 'npm test' run the real unit suite
1ddfa95a [auth] Vendor BitLogin 30b4f34 and allow WASM in the app CSP
fbac54dd Re-vendor BitLogin at 205b067, and record its provenance
58922e55 Record the caching decision: content-hash filenames, then immutable
