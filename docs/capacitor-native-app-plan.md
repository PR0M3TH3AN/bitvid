# Capacitor Native App Plan

> **Status**: Planning
> **Platforms**: Android, iOS, Windows, macOS, Linux
> **Framework**: [Capacitor](https://capacitorjs.com/) by Ionic
> **Goal**: Ship bitvid as a native app on all major platforms while keeping a single codebase with the existing web/PWA deployment.

---

## Table of Contents

1. [Why Capacitor](#why-capacitor)
2. [Architecture Overview](#architecture-overview)
3. [Repository Structure](#repository-structure)
4. [Phase 1 — Foundation](#phase-1--foundation)
5. [Phase 2 — Android & iOS](#phase-2--android--ios)
6. [Phase 3 — Desktop (Electron via Capacitor)](#phase-3--desktop-electron-via-capacitor)
7. [Phase 4 — Platform-Specific Enhancements](#phase-4--platform-specific-enhancements)
8. [Phase 5 — CI/CD for Native Builds](#phase-5--cicd-for-native-builds)
9. [Phase 6 — Testing Strategy](#phase-6--testing-strategy)
10. [Platform Considerations & Risks](#platform-considerations--risks)
11. [App Store Strategy](#app-store-strategy)
12. [Task Checklist](#task-checklist)

---

## Why Capacitor

### Fit for bitvid

bitvid is a fully static, client-side web application. There is no backend server — all authentication, data, and state management happens in the browser via Nostr relays and WebTorrent. This makes it an ideal candidate for Capacitor, which wraps an existing web app in a native WebView shell.

### Key reasons

| Reason | Detail |
|--------|--------|
| **Zero rewrite** | The existing `dist/` build output drops directly into Capacitor as the web layer. No framework migration needed. |
| **Single codebase** | Web, PWA, Android, iOS, and desktop all share the same HTML/CSS/JS. Platform-specific behavior is handled via feature detection and Capacitor's plugin bridge. |
| **Progressive native access** | Start with a pure web wrapper, then incrementally add native plugins (deep links, push notifications, share targets, file system) only when needed. |
| **Mature mobile support** | Capacitor has first-class Android and iOS support with a large plugin ecosystem. |
| **Desktop via Electron** | The `@nicepkg/capacitor-electron` community plugin (or the `@nicepkg/cap-electron` plugin) lets Capacitor drive an Electron shell for Windows/macOS/Linux using the same web build. |
| **Existing PWA foundation** | bitvid already has `site.webmanifest`, a service worker (`sw.min.js`), and app icons — all of which Capacitor respects and builds on. |
| **Active ecosystem** | Large community, official Ionic backing, regular releases, good documentation. |

### Alternatives considered

| Framework | Why not primary |
|-----------|----------------|
| **Tauri** | Excellent for desktop (small binaries, Rust backend), but mobile support is still in beta. Could be revisited later as a desktop-only option if Electron bundle size becomes a concern. |
| **Electron standalone** | Bundles ~150MB of Chromium per platform. Capacitor+Electron gives us the same result but with a unified build pipeline across all platforms. |
| **React Native / Flutter** | Would require a complete rewrite. bitvid is vanilla JS with no component framework — porting to RN or Flutter would be a ground-up rebuild. |
| **PWA only** | Already partially implemented. Good for web-savvy users but lacks app store discoverability, has weaker iOS support (no push notifications, limited background execution), and misses users who expect a "real" app install. |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                    bitvid codebase                   │
│                                                     │
│  ┌───────────┐   npm run build   ┌───────────────┐  │
│  │  Source    │ ────────────────→ │    dist/      │  │
│  │  (js/,    │                   │  (static web  │  │
│  │   css/,   │                   │   assets)     │  │
│  │   views/) │                   └──────┬────────┘  │
│  └───────────┘                          │           │
│                                         │           │
│                        ┌────────────────┼─────┐     │
│                        │  npx cap sync  │     │     │
│                        ▼                ▼     ▼     │
│                   ┌─────────┐  ┌─────┐  ┌────────┐  │
│                   │ android/│  │ ios/│  │electron/│  │
│                   │ (native │  │     │  │        │  │
│                   │ project)│  │     │  │        │  │
│                   └─────────┘  └─────┘  └────────┘  │
│                                                     │
│  Deploy targets:                                    │
│  • Web/PWA  → dist/ served via Netlify/Vercel/etc   │
│  • Android  → android/ → Play Store APK/AAB        │
│  • iOS      → ios/     → App Store IPA             │
│  • Desktop  → electron/ → Windows/macOS/Linux      │
└─────────────────────────────────────────────────────┘
```

### Data flow (unchanged)

The native shell is purely a container. All app logic remains in the web layer:

1. User action triggers a UI controller event handler
2. Controller invokes callback provided by `bitvidApp`
3. `bitvidApp` executes logic, communicates with Nostr relays via WebSocket
4. WebTorrent handles P2P video streaming via WebRTC data channels
5. UI updates via DOM manipulation

The only new data path is the **Capacitor bridge** — a thin JS-to-native channel used for:
- Deep link handling (Nostr URIs, `nostr:` protocol)
- Push notification tokens (optional, future)
- Native share sheet integration
- App lifecycle events (background/foreground)
- Status bar / navigation bar styling

---

## Repository Structure

The native project directories live at the repo root alongside the existing web source. This is the standard Capacitor monorepo layout.

```
bitvid/
├── android/                    # NEW — Native Android project (Android Studio)
│   ├── app/
│   │   ├── src/main/
│   │   │   ├── AndroidManifest.xml
│   │   │   ├── java/com/bitvid/app/
│   │   │   └── res/
│   │   └── build.gradle
│   ├── capacitor.settings.gradle
│   └── build.gradle
├── ios/                        # NEW — Native iOS project (Xcode)
│   └── App/
│       ├── App/
│       │   ├── AppDelegate.swift
│       │   ├── Info.plist
│       │   └── capacitor.config.json (generated)
│       ├── App.xcodeproj
│       └── Podfile
├── electron/                   # NEW — Electron desktop shell
│   ├── src/
│   │   ├── index.ts
│   │   └── preload.ts
│   ├── capacitor.config.ts
│   └── package.json
├── capacitor.config.ts         # NEW — Capacitor root config
├── dist/                       # Existing build output (web assets)
├── js/                         # Existing source
├── css/                        # Existing source
├── config/
│   └── instance-config.js      # Extended with platform detection
├── scripts/
│   ├── build-dist.mjs          # Existing web build
│   ├── build-android.mjs       # NEW — Android build helper
│   ├── build-ios.mjs           # NEW — iOS build helper
│   └── build-desktop.mjs       # NEW — Electron build helper
├── tests/
│   ├── unit/                   # Existing
│   ├── e2e/                    # Existing (web)
│   ├── visual/                 # Existing
│   ├── native/                 # NEW — Native-specific tests
│   │   ├── android/
│   │   ├── ios/
│   │   └── desktop/
│   └── platform/               # NEW — Cross-platform behavior tests
├── .github/workflows/
│   ├── ci.yml                  # Existing (web CI)
│   ├── ci-android.yml          # NEW — Android build + test
│   ├── ci-ios.yml              # NEW — iOS build + test
│   └── ci-desktop.yml          # NEW — Electron build + test
├── package.json                # Extended with native scripts
├── capacitor.config.ts         # Capacitor root configuration
└── site.webmanifest            # Existing PWA manifest
```

### What gets gitignored

```gitignore
# Native build artifacts
android/app/build/
android/.gradle/
android/capacitor-cordova-android-plugins/build/
ios/App/Pods/
ios/App/DerivedData/
electron/dist/
electron/node_modules/

# Capacitor copies of web assets (regenerated by cap sync)
android/app/src/main/assets/public/
ios/App/App/public/
```

### What gets committed

The native project scaffolding (`android/`, `ios/`, `electron/`) **is committed** to the repo. This is the Capacitor convention — the native projects are source code, not generated artifacts. They contain platform-specific configuration (permissions, entitlements, splash screens, icons) that must be version-controlled.

---

## Phase 1 — Foundation

**Goal**: Initialize Capacitor, get the web app running inside native shells on Android and iOS simulators, and Electron on desktop.

### Tasks

1. **Install Capacitor core**
   ```bash
   npm install @capacitor/core @capacitor/cli
   ```

2. **Create `capacitor.config.ts`**
   ```typescript
   import type { CapacitorConfig } from '@capacitor/cli';

   const config: CapacitorConfig = {
     appId: 'com.bitvid.app',
     appName: 'bitvid',
     webDir: 'dist',
     server: {
       // Allow WebSocket connections to Nostr relays
       allowNavigation: ['*'],
     },
     plugins: {
       SplashScreen: {
         launchShowDuration: 2000,
         backgroundColor: '#0f172a', // matches theme
       },
     },
   };

   export default config;
   ```

3. **Add native platforms**
   ```bash
   npx cap add android
   npx cap add ios
   ```

4. **Update build pipeline** — extend `build-dist.mjs` or add a wrapper:
   ```bash
   npm run build && npx cap sync
   ```
   The `cap sync` command copies `dist/` into each native project and updates native dependencies.

5. **Add Electron support** via community plugin:
   ```bash
   npm install @nicepkg/capacitor-electron
   npx cap add electron
   ```

6. **Add npm scripts**
   ```json
   {
     "scripts": {
       "cap:sync": "npx cap sync",
       "cap:android": "npm run build && npx cap sync android && npx cap open android",
       "cap:ios": "npm run build && npx cap sync ios && npx cap open ios",
       "cap:electron": "npm run build && npx cap sync electron && npx cap open electron",
       "build:all": "npm run build && npx cap sync"
     }
   }
   ```

7. **Verify basic functionality**
   - App loads in Android emulator
   - App loads in iOS simulator
   - App loads in Electron window
   - Nostr relay WebSocket connections work
   - Theme renders correctly
   - Navigation / SPA routing works

### Platform detection helper

Add a lightweight platform detection utility that the rest of the app can use:

```javascript
// js/utils/platform.js
import { Capacitor } from '@capacitor/core';

export const platform = {
  isNative: Capacitor.isNativePlatform(),
  isAndroid: Capacitor.getPlatform() === 'android',
  isIos: Capacitor.getPlatform() === 'ios',
  isElectron: Capacitor.getPlatform() === 'electron',
  isWeb: Capacitor.getPlatform() === 'web',
};
```

This module is safe to import on web — `@capacitor/core` detects it's running in a browser and returns `'web'` for the platform.

---

## Phase 2 — Android & iOS

**Goal**: Production-quality mobile builds ready for app store submission.

### Android-specific work

1. **Permissions** in `AndroidManifest.xml`:
   - `INTERNET` (already default)
   - `ACCESS_NETWORK_STATE` (connectivity detection)
   - `CAMERA` / `MICROPHONE` — only if video recording is added later (not needed now)

2. **WebView configuration**:
   - Enable mixed content mode (for WebSocket `wss://` alongside `https://`)
   - Enable JavaScript (default in Capacitor)
   - Set `webSettings.mediaPlaybackRequiresUserGesture = false` for autoplay

3. **App icons and splash screens**:
   - Use `@capacitor/splash-screen` plugin
   - Generate from existing `assets/png/android-chrome-512x512.png`
   - Use `cordova-res` or `@capacitor/assets` to generate all density variants

4. **Deep links**:
   - Register `nostr:` URI scheme via Android intent filters
   - Register `https://bitvid.tv` domain for App Links (needs `.well-known/assetlinks.json`)

5. **Status bar and navigation bar**:
   - `@capacitor/status-bar` plugin to match the dark theme (`#0f172a`)
   - Handle safe areas / notch insets via CSS `env(safe-area-inset-*)`

### iOS-specific work

1. **Info.plist configuration**:
   - `NSAppTransportSecurity` — allow WebSocket connections
   - App description strings for any permission prompts

2. **WKWebView settings**:
   - `allowsInlineMediaPlayback: true`
   - `mediaTypesRequiringUserActionForPlayback: []` (enables autoplay)
   - These are configurable in `capacitor.config.ts` under `ios.webContentsConfiguration`

3. **Deep links**:
   - Universal Links (needs `apple-app-site-association` on the domain)
   - Custom URL scheme `bitvid://`

4. **Safe areas**:
   - iOS notch, Dynamic Island, home indicator
   - CSS `env(safe-area-inset-top)` etc. — update layout in `index.html` and key UI components

5. **App icons**:
   - Generate full icon set from existing 512x512 source
   - Must include 1024x1024 for App Store

### Shared mobile work

1. **Hardware back button** (Android):
   - Handle back navigation within the SPA instead of exiting the app
   - Use `@capacitor/app` plugin's `backButton` listener

2. **App lifecycle**:
   - Pause/resume WebSocket connections on app background/foreground
   - Use `@capacitor/app` `appStateChange` listener

3. **Keyboard handling**:
   - Adjust layout when virtual keyboard appears (search bar, comment inputs)
   - Capacitor provides `Keyboard` plugin for this

4. **Haptic feedback** (optional):
   - Light haptics on zap actions using `@capacitor/haptics`

---

## Phase 3 — Desktop (Electron via Capacitor)

**Goal**: Ship bitvid as a standalone desktop app for Windows, macOS, and Linux.

### Approach

Use Capacitor's Electron integration so the desktop build uses the same `dist/` web assets and the same Capacitor plugin bridge as mobile.

### Desktop-specific work

1. **Window configuration**:
   - Default size: 1280x800 (fits well for video content)
   - Minimum size: 800x600
   - Remember window position/size across launches
   - Frameless window option with custom title bar (matches bitvid header)

2. **Menu bar**:
   - Minimal native menu (File, Edit, View, Help)
   - Or hide native menu and use the web app's own navigation

3. **Tray icon** (optional):
   - System tray icon for background seeding (WebTorrent)
   - "Minimize to tray" behavior

4. **Auto-updater**:
   - Electron's `autoUpdater` for seamless desktop updates
   - Or use GitHub Releases as the update feed

5. **Protocol handler**:
   - Register `nostr:` and `bitvid:` URI schemes at OS level

6. **Packaging**:
   - Windows: NSIS installer or MSIX
   - macOS: DMG + notarization
   - Linux: AppImage, .deb, .rpm

---

## Phase 4 — Platform-Specific Enhancements

These are optional features that improve the native experience. Implement after core functionality is solid.

### Native share sheet

```javascript
import { Share } from '@capacitor/share';

async function shareVideo(video) {
  if (platform.isNative) {
    await Share.share({
      title: video.title,
      text: video.description,
      url: `https://bitvid.tv/#video/${video.id}`,
      dialogTitle: 'Share video',
    });
  }
}
```

### Push notifications (future)

Nostr-based push could be implemented via:
- A lightweight push relay that watches for mentions/zaps and sends FCM/APNs
- `@capacitor/push-notifications` plugin to receive them

This is a significant feature and should be its own planning document.

### Offline support

- Cache the app shell and critical assets in the service worker
- Cache recently viewed video metadata for offline browsing
- Queue zaps and reactions for when connectivity returns

### Picture-in-picture

- Android: native PiP mode via custom Capacitor plugin
- iOS: `AVPictureInPictureController` via the WebView's native video player
- Desktop: Electron `BrowserWindow` PiP API

---

## Phase 5 — CI/CD for Native Builds

### New CI workflows

#### `ci-android.yml`

```yaml
name: CI — Android

on:
  push:
    branches: [main]
    paths:
      - 'js/**'
      - 'css/**'
      - 'views/**'
      - 'components/**'
      - 'android/**'
      - 'capacitor.config.ts'
      - 'package.json'
  pull_request:
    paths:
      - 'js/**'
      - 'css/**'
      - 'views/**'
      - 'components/**'
      - 'android/**'
      - 'capacitor.config.ts'

jobs:
  build-android:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - uses: actions/setup-java@v4
        with:
          distribution: 'temurin'
          java-version: '17'
      - name: Install dependencies
        run: npm ci
      - name: Build web assets
        run: npm run build
      - name: Sync Capacitor
        run: npx cap sync android
      - name: Build Android debug APK
        working-directory: android
        run: ./gradlew assembleDebug
      - name: Upload APK artifact
        uses: actions/upload-artifact@v4
        with:
          name: bitvid-android-debug
          path: android/app/build/outputs/apk/debug/app-debug.apk
```

#### `ci-ios.yml`

```yaml
name: CI — iOS

on:
  push:
    branches: [main]
    paths: ['js/**', 'css/**', 'views/**', 'ios/**', 'capacitor.config.ts']
  pull_request:
    paths: ['js/**', 'css/**', 'views/**', 'ios/**', 'capacitor.config.ts']

jobs:
  build-ios:
    runs-on: macos-latest
    timeout-minutes: 45
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - name: Install dependencies
        run: npm ci
      - name: Build web assets
        run: npm run build
      - name: Sync Capacitor
        run: npx cap sync ios
      - name: Install CocoaPods
        working-directory: ios/App
        run: pod install
      - name: Build iOS (no sign)
        run: |
          xcodebuild build \
            -workspace ios/App/App.xcworkspace \
            -scheme App \
            -destination 'generic/platform=iOS Simulator' \
            CODE_SIGN_IDENTITY="" \
            CODE_SIGNING_REQUIRED=NO
```

#### `ci-desktop.yml`

```yaml
name: CI — Desktop

on:
  push:
    branches: [main]
    paths: ['js/**', 'css/**', 'views/**', 'electron/**', 'capacitor.config.ts']
  pull_request:
    paths: ['js/**', 'css/**', 'views/**', 'electron/**', 'capacitor.config.ts']

jobs:
  build-desktop:
    strategy:
      matrix:
        os: [ubuntu-latest, windows-latest, macos-latest]
    runs-on: ${{ matrix.os }}
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - name: Install dependencies
        run: npm ci
      - name: Build web assets
        run: npm run build
      - name: Sync Capacitor
        run: npx cap sync electron
      - name: Build Electron
        working-directory: electron
        run: npm run build
```

### Path-filtered triggers

Each native CI workflow uses `paths` filters so that:
- A CSS-only change triggers Android + iOS + Desktop builds (the web layer changed)
- A change to only `android/` triggers just the Android build
- Existing web CI (`ci.yml`) continues to run independently

### CI cost management

Native CI is more expensive than web CI:
- **iOS builds require `macos-latest` runners** (2-3x cost on GitHub Actions)
- **Android builds need JDK + Gradle** (slower startup)
- **Desktop builds run on 3 OS matrix** entries

To manage costs:
- Only run native CI on PRs that touch relevant paths
- Cache Gradle/CocoaPods/node_modules aggressively
- Consider running iOS CI only on `main` merges (not every PR) initially
- Use GitHub Actions concurrency groups with `cancel-in-progress: true`

---

## Phase 6 — Testing Strategy

### Testing layers

```
┌─────────────────────────────────────────────┐
│  Unit Tests (existing)                      │  ← Platform-agnostic
│  vitest — js logic, nostr, schemas, utils   │     No changes needed
├─────────────────────────────────────────────┤
│  Visual Regression (existing)               │  ← Web viewport
│  Playwright — screenshot comparison         │     Add mobile viewports
├─────────────────────────────────────────────┤
│  E2E Web (existing)                         │  ← Browser-based
│  Playwright — user journeys in Chrome       │     No changes needed
├─────────────────────────────────────────────┤
│  E2E Mobile (NEW)                           │  ← Device/emulator
│  Appium or Detox — native app user flows    │
├─────────────────────────────────────────────┤
│  Platform Smoke Tests (NEW)                 │  ← Quick validation
│  Per-platform build + launch + basic checks │
├─────────────────────────────────────────────┤
│  Cross-Platform Behavior Tests (NEW)        │  ← Feature parity
│  Verify features work consistently across   │
│  web, Android, iOS, and desktop             │
└─────────────────────────────────────────────┘
```

### New test categories

#### Platform smoke tests (`tests/native/`)

Quick checks that run after each native build:
- App launches without crash
- Main view renders
- WebSocket connection to a relay succeeds
- Video playback starts (URL source)
- Theme renders correctly (screenshot comparison)

#### Mobile viewport visual tests

Extend existing Playwright visual tests with mobile viewports:
```javascript
// playwright.config.ts addition
projects: [
  // existing desktop viewports...
  {
    name: 'Mobile Android',
    use: { ...devices['Pixel 7'] },
  },
  {
    name: 'Mobile iOS',
    use: { ...devices['iPhone 14'] },
  },
]
```

This runs in Playwright's browser emulation (not on real devices) but catches responsive layout issues early.

#### WebView-specific E2E tests

For testing inside the actual native WebView (not just a browser), use:
- **Android**: Espresso + WebView assertions, or Appium with WebView context switching
- **iOS**: XCUITest + WebView inspection, or Appium

These are heavier to set up but catch WebView-specific issues (service worker behavior, WebRTC in WKWebView, etc).

#### What to test per platform

| Test | Web | Android | iOS | Desktop |
|------|-----|---------|-----|---------|
| Unit tests | yes | n/a | n/a | n/a |
| Visual regression (browser) | yes | mobile viewport | mobile viewport | yes |
| E2E web journeys | yes | — | — | — |
| App launches | — | yes | yes | yes |
| Relay WebSocket connects | yes | yes | yes | yes |
| Video playback (URL) | yes | yes | yes | yes |
| Video playback (WebTorrent) | yes | yes | **test carefully** | yes |
| Deep links (`nostr:`) | — | yes | yes | yes |
| Back button navigation | — | yes | — | — |
| Safe area rendering | — | — | yes | — |
| Keyboard interaction | — | yes | yes | — |
| Offline behavior | yes | yes | yes | yes |

---

## Platform Considerations & Risks

### WebTorrent on iOS (HIGH RISK)

**Issue**: WKWebView's WebRTC support is more limited than desktop Chrome. WebTorrent relies on WebRTC data channels for peer-to-peer streaming.

**Mitigation**:
- bitvid already has a URL-first playback fallback (`DEFAULT_PLAYBACK_SOURCE` in instance config)
- For iOS builds, default to URL-first playback: `DEFAULT_PLAYBACK_SOURCE: 'url'`
- Use platform detection to set this automatically:
  ```javascript
  if (platform.isIos) {
    setUrlFirstEnabled(true);
  }
  ```
- Test WebTorrent streaming on real iOS devices — it may work in modern iOS versions (16+), but should not be the primary path

### Service worker in Capacitor WebView

**Issue**: The `sw.min.js` service worker intercepts fetch requests to proxy WebTorrent stream data. Service worker support in native WebViews varies.

**Mitigation**:
- Android: WKWebView supports service workers (API level 33+). For older Android, the URL fallback handles it.
- iOS: WKWebView supports service workers in iOS 14+, but with some caveats around scope and lifecycle.
- Test the WebTorrent streaming service worker flow specifically in native WebViews.
- If service worker is unreliable, consider a Capacitor plugin that bridges native HTTP interception as an alternative stream proxy.

### WebSocket connectivity

**Issue**: Native platforms may restrict background WebSocket connections.

**Mitigation**:
- Use `@capacitor/app` lifecycle events to gracefully disconnect/reconnect:
  ```javascript
  App.addListener('appStateChange', ({ isActive }) => {
    if (isActive) {
      nostrClient.reconnect();
    } else {
      nostrClient.pause();
    }
  });
  ```
- This also reduces battery drain from idle relay connections.

### Content Security Policy

**Issue**: Capacitor serves web assets from a local origin (`capacitor://localhost` on iOS, `https://localhost` on Android). CSP rules may need adjustment.

**Mitigation**:
- Update `_headers` / CSP meta tags to allow the Capacitor local origin
- Allow `wss://*` for Nostr relay connections
- Allow `blob:` and `data:` for WebTorrent stream playback

### App Store rejection risk

See the [App Store Strategy](#app-store-strategy) section below.

---

## App Store Strategy

### Google Play Store

**Risk level**: Low-Medium

Google is generally more permissive. Key considerations:
- **Content rating**: Declare user-generated content (UGC) in the rating questionnaire
- **Moderation**: bitvid's existing moderation system (NIP-56 reports, NIP-51 mute lists, blur thresholds, autoplay blocking) demonstrates active content moderation
- **Crypto/payments**: Lightning/Zap functionality may trigger financial services review. Frame it as "tips" or "donations", not as a payment system. Emphasize that bitvid does not custody funds.

### Apple App Store

**Risk level**: Medium-High

Apple has been unpredictable with Nostr/decentralized apps. Key considerations:
- **Guideline 4.2 (Minimum Functionality)**: The app must provide functionality beyond a "repackaged website". Native features (deep links, share sheet, haptics, PiP) help differentiate.
- **Guideline 1.2 (User Generated Content)**: Must have content reporting, blocking, and moderation. bitvid already has this.
- **Guideline 3.1.1 (In-App Purchase)**: If Lightning zaps are interpreted as digital purchases, Apple may require IAP. Mitigation: frame zaps as peer-to-peer tips external to the app (similar to how other Nostr apps handle this).
- **Review strategy**: Submit early with a clear App Review note explaining the decentralized architecture and content moderation approach. Engage with the review team proactively.

### Desktop distribution

**Risk level**: Low

- **Windows**: Distribute via GitHub Releases initially. Microsoft Store submission optional.
- **macOS**: Notarize the DMG with an Apple Developer account. Distribute via GitHub Releases or the Mac App Store.
- **Linux**: AppImage on GitHub Releases. Snap Store / Flathub optional.

---

## Task Checklist

### Phase 1 — Foundation
- [ ] Install `@capacitor/core` and `@capacitor/cli`
- [ ] Create `capacitor.config.ts` with bitvid app ID and config
- [ ] Run `npx cap add android` and verify project structure
- [ ] Run `npx cap add ios` and verify project structure
- [ ] Set up Electron via community Capacitor plugin
- [ ] Add `js/utils/platform.js` platform detection utility
- [ ] Update `package.json` with Capacitor scripts (`cap:sync`, `cap:android`, `cap:ios`, `cap:electron`)
- [ ] Update `.gitignore` for native build artifacts
- [ ] Verify web app loads in Android emulator
- [ ] Verify web app loads in iOS simulator
- [ ] Verify web app loads in Electron window
- [ ] Verify Nostr relay connections work on all platforms
- [ ] Document local development setup for native builds

### Phase 2 — Android & iOS
- [ ] Configure Android permissions in `AndroidManifest.xml`
- [ ] Configure iOS `Info.plist` settings
- [ ] Generate app icons for all densities (Android + iOS)
- [ ] Generate splash screens
- [ ] Implement safe area CSS for iOS notch / Dynamic Island
- [ ] Add `@capacitor/status-bar` and theme it to match bitvid
- [ ] Add `@capacitor/app` for lifecycle events (background/foreground)
- [ ] Implement hardware back button handling (Android)
- [ ] Set up deep link handling for `nostr:` URIs
- [ ] Configure WebView settings for media autoplay
- [ ] Test video playback (URL source) on both platforms
- [ ] Test video playback (WebTorrent) on both platforms
- [ ] Test service worker behavior in native WebViews
- [ ] Set iOS default to URL-first playback if WebTorrent is unreliable

### Phase 3 — Desktop
- [ ] Configure Electron window defaults (size, min size, position memory)
- [ ] Set up native menu bar or hide it
- [ ] Register `nostr:` protocol handler at OS level
- [ ] Configure packaging (NSIS/DMG/AppImage)
- [ ] Test on Windows, macOS, and Linux
- [ ] Set up auto-updater with GitHub Releases feed

### Phase 4 — Platform Enhancements
- [ ] Implement native share sheet integration
- [ ] Add `@capacitor/keyboard` for mobile input handling
- [ ] Explore picture-in-picture on each platform
- [ ] Add haptic feedback for zap actions (optional)
- [ ] Implement app shell caching in service worker for offline support

### Phase 5 — CI/CD
- [ ] Create `ci-android.yml` workflow
- [ ] Create `ci-ios.yml` workflow
- [ ] Create `ci-desktop.yml` workflow (3-OS matrix)
- [ ] Add path filters to limit when native CI runs
- [ ] Set up artifact uploads for debug builds
- [ ] Configure caching (Gradle, CocoaPods, node_modules)
- [ ] Add concurrency groups to cancel stale runs
- [ ] Document release signing process (keystores, certificates, notarization)

### Phase 6 — Testing
- [ ] Add mobile viewport projects to Playwright config
- [ ] Create platform smoke test suite (`tests/native/`)
- [ ] Set up Android emulator tests in CI
- [ ] Set up iOS simulator tests in CI
- [ ] Test WebTorrent streaming in native WebViews on real devices
- [ ] Test service worker behavior across platforms
- [ ] Test deep link handling on all platforms
- [ ] Create cross-platform feature parity test matrix
- [ ] Document known platform-specific limitations in `KNOWN_ISSUES.md`

### App Store Submission
- [ ] Create Google Play developer account
- [ ] Prepare Play Store listing (screenshots, description, content rating)
- [ ] Submit Android app for review
- [ ] Create Apple Developer account (if not existing)
- [ ] Prepare App Store listing (screenshots, description, review notes)
- [ ] Submit iOS app for review
- [ ] Set up GitHub Releases for desktop distribution
- [ ] Notarize macOS DMG

---

## Related Documentation

- [Playback Fallback Architecture](playback-fallback.md) — URL-first strategy that mitigates WebTorrent issues on mobile
- [Instance Configuration](instance-config.md) — Platform-specific config overrides
- [WebTorrent Architecture](webtorrent-architecture.md) — Service worker streaming details
- [Moderation Service Overview](moderation-service-overview.md) — Content moderation (relevant for app store review)
