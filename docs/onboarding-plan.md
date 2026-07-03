# bitvid First-Run Experience (Onboarding) — Plan

Goal: escort fresh logins through the tool with a guided, skippable tour —
spotlight + accent-glow highlights, popover explanations — and route them into
the two setup flows that unlock the product (storage for uploading, NWC for
zapping). All state is local (static client, no backend).

## Locked decisions (2026-07-02, maintainer approved)

1. **Hand-rolled tour engine, no dependency** (`js/ui/onboarding/tourEngine.js`).
   Spotlight = one scrim element whose huge `box-shadow` dims everything except a
   cutout over the anchor; an `::after` ring pulses with `--color-accent` /
   `--color-accent-strong` (theme-aware glow). Positioning via CSS custom
   properties set from JS (`style.setProperty` — the codebase's sanctioned
   pattern); all visuals in an injected stylesheet using design tokens only.
2. **Anchors reuse existing stable selectors** (`data-testid` added for e2e +
   sidebar ids). Steps whose anchor is missing in the current layout are skipped
   automatically, so one script serves desktop + mobile.
3. **Once per pubkey per device** (`bitvid:onboarding:v1` map in localStorage —
   same shape as `settingsRestorePrompt`'s offered-flags). Fully skippable
   (Skip button, Esc), keyboard navigable (arrows), and **re-launchable** from
   the profile modal footer ("Take the tour", `force: true`).
4. **Trigger**: 3.5s after login (feed rendered thanks to the warm cold-boot
   work; the settings-restore prompt's 2s window — which only fires for accounts
   with synced settings, i.e. NOT first-run users — has passed). Never blocks
   login.
5. **Final card = setup CTAs**: "Set up storage" / "Connect wallet" deep-link
   into the profile modal panes (`profileController.show("storage"|"wallet")`).

## Phases

- **Phase 1 (BUILT)**: tour engine + spotlight/glow CSS, bitvid step script
  (welcome → feeds → subscriptions → upload → profile → setup CTAs), first-login
  trigger, per-pubkey flag, "Take the tour" relaunch button.
- **Phase 2**: "Getting started" checklist card (verify relays ✓, follow 3
  channels ✓, set up storage ✓, connect wallet ✓, first upload ✓) — persistent
  and dismissible; catches users who skip the tour.
- **Phase 3**: empty-state upgrades — every empty feed/pane teaches + CTA
  (suggested channels from trust seeds in an empty For You / Subscriptions).
- **Phase 4**: fresh-npub bootstrap — hook the existing `generate` auth provider
  into a "Create account" flow with a REQUIRED key-backup step, then inline
  kind-0 profile setup (name + avatar), then the tour.

## Non-goals

- No server-side anything (static client rule).
- No tour analytics/telemetry.
- The tour never performs actions for the user — it points and deep-links only.
