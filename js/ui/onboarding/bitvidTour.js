// bitvid's first-run guided tour (docs/onboarding-plan.md): the step script fed
// into the generic tourEngine. Anchors use existing stable selectors (ids +
// data-testid added for e2e), and steps whose anchor is absent in the current
// layout are skipped automatically by the engine.

import { createTour } from "./tourEngine.js";
import {
  shouldOfferOnboarding,
  markOnboarding,
} from "../../services/onboardingService.js";

export function buildBitvidTourSteps({ openProfilePane } = {}) {
  const open = (pane) => () => {
    try {
      openProfilePane?.(pane);
    } catch (error) {
      // best-effort deep link
    }
  };

  return [
    {
      id: "welcome",
      title: "Welcome to bitvid 👋",
      body:
        "bitvid is decentralized video on Nostr — your identity, follows, and videos belong to you, not a platform. Here's a quick tour (30 seconds).",
    },
    {
      id: "feeds",
      target: "#sidebar",
      placement: "right", // full-height column — popover beside it, not below
      title: "Your feeds",
      body:
        "Recent shows the newest videos across the network. For You learns from what you watch, and Trending ranks by views. Switch any time from this sidebar.",
    },
    {
      id: "subscriptions",
      target: "#subscriptionsLink",
      title: "Follow creators",
      body:
        "Subscribe to channels you like and they'll fill this feed. Your follow list is a Nostr list — it travels with your account to any client.",
    },
    {
      id: "upload",
      target: '[data-testid="upload-button"]',
      title: "Post your own videos",
      body:
        "Upload to your own storage (Cloudflare R2, S3, B2) or paste a link to a video hosted anywhere. bitvid adds WebTorrent peer-to-peer streaming on top automatically.",
    },
    {
      id: "profile",
      target: '[data-testid="profile-button"]',
      title: "Everything else lives here",
      body:
        "Your profile menu holds relays, direct messages, storage, your wallet, moderation settings — and this tour, if you ever want it again.",
    },
    {
      id: "finish",
      title: "You're set 🎉",
      body:
        "Two optional power-ups: connect storage so you can upload videos, and connect a Lightning wallet (NWC) so you can zap creators.",
      actions: [
        { label: "Set up storage", onClick: open("storage"), variant: "ghost" },
        { label: "Connect wallet", onClick: open("wallet"), variant: "ghost" },
      ],
    },
  ];
}

// Launch the tour for a pubkey. `force` (the "Take the tour" button) ignores the
// once-per-account flag. Returns true when the tour actually started.
export function launchBitvidTour({
  pubkey,
  openProfilePane,
  document: doc,
  force = false,
} = {}) {
  if (!force && !shouldOfferOnboarding(pubkey)) {
    return false;
  }

  const tour = createTour({
    steps: buildBitvidTourSteps({ openProfilePane }),
    document: doc,
    onFinish: () => markOnboarding(pubkey, "completed"),
    onSkip: () => markOnboarding(pubkey, "skipped"),
  });

  return Boolean(tour?.start());
}

export default launchBitvidTour;
