import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

import {
  updateVideoCardSourceVisibility,
  cardNeedsEagerLivenessProbe,
} from "../js/utils/cardSourceVisibility.js";
import { setCardLivenessPolicy } from "../js/constants.js";
import { VideoCard } from "../js/ui/components/VideoCard.js";

function setupDom(t) {
  const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>", {
    url: "https://example.com",
    pretendToBeVisual: true,
  });

  const { window } = dom;
  const previous = new Map();
  const keys = [
    "window",
    "document",
    "HTMLElement",
    "Element",
    "Node",
    "MouseEvent",
    "CustomEvent",
    "ResizeObserver",
    "IntersectionObserver",
    "CSSStyleSheet",
    "requestAnimationFrame",
    "cancelAnimationFrame",
  ];

  keys.forEach((key) => {
    const hadValue = Object.prototype.hasOwnProperty.call(globalThis, key);
    previous.set(key, hadValue ? globalThis[key] : Symbol.for("__undefined__"));
    if (key === "requestAnimationFrame" && typeof window[key] !== "function") {
      window.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
    } else if (key === "cancelAnimationFrame" && typeof window[key] !== "function") {
      window.cancelAnimationFrame = (id) => clearTimeout(id);
    } else if (key === "ResizeObserver" && typeof window[key] !== "function") {
      window.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
      };
    } else if (
      key === "IntersectionObserver" &&
      typeof window[key] !== "function"
    ) {
      // JSDOM doesn't implement IntersectionObserver; VideoCard.observeViewport
      // constructs one at build time. A no-op stub is enough for these tests.
      window.IntersectionObserver = class {
        constructor() {}
        observe() {}
        unobserve() {}
        disconnect() {}
        takeRecords() {
          return [];
        }
      };
    }
    globalThis[key] = window[key];
  });

  if (!window.requestAnimationFrame) {
    window.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
    globalThis.requestAnimationFrame = window.requestAnimationFrame;
  }

  if (!window.cancelAnimationFrame) {
    window.cancelAnimationFrame = (id) => clearTimeout(id);
    globalThis.cancelAnimationFrame = window.cancelAnimationFrame;
  }

  if (!window.ResizeObserver) {
    class ResizeObserverStub {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    window.ResizeObserver = ResizeObserverStub;
    globalThis.ResizeObserver = ResizeObserverStub;
  }

  t.after(() => {
    dom.window.close();
    keys.forEach((key) => {
      const previousValue = previous.get(key);
      if (previousValue === Symbol.for("__undefined__")) {
        delete globalThis[key];
      } else {
        globalThis[key] = previousValue;
      }
    });
  });

  return { window, document: window.document };
}

test("updateVideoCardSourceVisibility hides non-owner cards without healthy sources and restores visibility", (t) => {
  const { document } = setupDom(t);

  const createCard = ({ owner = "false", urlState = "offline", streamState = "unhealthy" } = {}) => {
    const card = document.createElement("article");
    card.classList.add("card");
    card.dataset.ownerIsViewer = owner;
    card.dataset.urlHealthState = urlState;
    card.dataset.streamHealthState = streamState;
    document.body.appendChild(card);
    return card;
  };

  const viewerCard = createCard();
  updateVideoCardSourceVisibility(viewerCard);
  assert.equal(viewerCard.hidden, true, "non-owners should be hidden when all sources fail");
  assert.equal(viewerCard.dataset.sourceVisibility, "hidden", "hidden cards should record a hidden state");

  const ownerCard = createCard({ owner: "true" });
  ownerCard.hidden = true;
  ownerCard.dataset.sourceVisibility = "hidden";
  updateVideoCardSourceVisibility(ownerCard);
  assert.equal(ownerCard.hidden, false, "owners should remain visible despite failing sources");
  assert.equal(ownerCard.dataset.sourceVisibility, "visible", "owner visibility should be marked explicitly");

  viewerCard.dataset.streamHealthState = "healthy";
  updateVideoCardSourceVisibility(viewerCard);
  assert.equal(viewerCard.hidden, false, "cards should unhide once a source becomes healthy");
  assert.equal(viewerCard.dataset.sourceVisibility, "visible", "recovering cards should record visible state");
});

test("VideoCard hides cards without playable sources until a healthy CDN update arrives", (t) => {
  const { document } = setupDom(t);

  const card = new VideoCard({
    document,
    video: {
      id: "event-123",
      title: "Unplayable Clip",
    },
    formatters: {
      formatTimeAgo: () => "just now",
    },
    helpers: {
      isMagnetSupported: () => false,
    },
  });

  const root = card.getRoot();
  document.body.appendChild(root);

  assert.equal(root.hidden, true, "cards without playable sources should start hidden");
  assert.equal(root.dataset.sourceVisibility, "hidden", "initial visibility state should be hidden");

  root.dataset.urlHealthState = "healthy";
  updateVideoCardSourceVisibility(root);

  assert.equal(root.hidden, false, "a healthy CDN update should unhide the card");
  assert.equal(root.dataset.sourceVisibility, "visible", "visibility dataset should reflect the restored state");
});

function makeCard(
  document,
  {
    foreign = "false",
    owner = "false",
    url = "checking",
    stream = "checking",
    cdnUrl = "https://cdn.example/v.mp4", // pass "" for a WebTorrent-only card
  } = {}
) {
  const card = document.createElement("article");
  card.classList.add("card");
  card.dataset.ownerIsViewer = owner;
  card.dataset.foreign = foreign;
  card.dataset.urlHealthState = url;
  card.dataset.streamHealthState = stream;
  if (cdnUrl) {
    card.dataset.urlHealthUrl = encodeURIComponent(cdnUrl);
  }
  document.body.appendChild(card);
  return card;
}

test("CARD_LIVENESS_POLICY=show-pending keeps a pending foreign card visible (current behavior)", (t) => {
  const { document } = setupDom(t);
  setCardLivenessPolicy("show-pending");
  t.after(() => setCardLivenessPolicy("show-pending"));

  // Probes still running (checking) → the card shows; it only hides once every
  // source is confirmed dead.
  const card = makeCard(document, { foreign: "true", url: "checking", stream: "checking" });
  updateVideoCardSourceVisibility(card);
  assert.equal(card.hidden, false, "pending foreign card is visible under show-pending");

  card.dataset.urlHealthState = "offline";
  card.dataset.streamHealthState = "unhealthy";
  updateVideoCardSourceVisibility(card);
  assert.equal(card.hidden, true, "confirmed-dead card hides");
});

test("CARD_LIVENESS_POLICY=hide-foreign hides pending FOREIGN cards but shows pending NATIVE cards", (t) => {
  const { document } = setupDom(t);
  setCardLivenessPolicy("hide-foreign");
  t.after(() => setCardLivenessPolicy("show-pending"));

  const foreignCard = makeCard(document, { foreign: "true", url: "checking", stream: "checking" });
  updateVideoCardSourceVisibility(foreignCard);
  assert.equal(foreignCard.hidden, true, "foreign card stays hidden until a source verifies");

  const nativeCard = makeCard(document, { foreign: "false", url: "checking", stream: "checking" });
  updateVideoCardSourceVisibility(nativeCard);
  assert.equal(nativeCard.hidden, false, "native card keeps show-pending behavior");

  // A foreign card becomes visible the moment any source proves playable.
  foreignCard.dataset.streamHealthState = "healthy";
  updateVideoCardSourceVisibility(foreignCard);
  assert.equal(foreignCard.hidden, false, "verified foreign card appears");
});

test("CARD_LIVENESS_POLICY=hide-all hides every pending non-owner card but never the owner's", (t) => {
  const { document } = setupDom(t);
  setCardLivenessPolicy("hide-all");
  t.after(() => setCardLivenessPolicy("show-pending"));

  const nativeCard = makeCard(document, { foreign: "false", url: "checking", stream: "checking" });
  updateVideoCardSourceVisibility(nativeCard);
  assert.equal(nativeCard.hidden, true, "even a native card hides until verified under hide-all");

  const ownerCard = makeCard(document, { owner: "true", url: "checking", stream: "checking" });
  updateVideoCardSourceVisibility(ownerCard);
  assert.equal(ownerCard.hidden, false, "the owner's own card is always visible");

  nativeCard.dataset.urlHealthState = "healthy";
  updateVideoCardSourceVisibility(nativeCard);
  assert.equal(nativeCard.hidden, false, "card appears once a source verifies");
});

// WebTorrent-only foreign content must NOT get buried under hide-foreign: its
// only signal is the slow/unreliable swarm probe (20s + 5min cache), so a
// live-but-slow P2P video would otherwise stay hidden. It falls back to
// show-pending instead (shown while checked, hidden only once confirmed dead).
test("hide-foreign does not bury WebTorrent-only foreign cards (no CDN to verify fast)", (t) => {
  const { document } = setupDom(t);
  setCardLivenessPolicy("hide-foreign");
  t.after(() => setCardLivenessPolicy("show-pending"));

  // No CDN url → urlHealthState resolves to "offline"; stream probe still running.
  const p2pCard = makeCard(document, {
    foreign: "true",
    cdnUrl: "",
    url: "offline",
    stream: "checking",
  });
  updateVideoCardSourceVisibility(p2pCard);
  assert.equal(p2pCard.hidden, false, "P2P-only foreign card is shown while its swarm is checked, not buried");
  assert.equal(
    cardNeedsEagerLivenessProbe(p2pCard),
    false,
    "P2P-only card is show-pending, so it is not eager-probed",
  );

  // Only once the swarm probe also confirms it dead does it hide.
  p2pCard.dataset.streamHealthState = "unhealthy";
  updateVideoCardSourceVisibility(p2pCard);
  assert.equal(p2pCard.hidden, true, "confirmed-dead P2P card finally hides");

  // A CDN-backed foreign card, by contrast, IS hidden while its fast probe runs.
  const cdnCard = makeCard(document, { foreign: "true", url: "checking", stream: "checking" });
  updateVideoCardSourceVisibility(cdnCard);
  assert.equal(cdnCard.hidden, true, "CDN-backed foreign card stays hidden during its fast probe");
});

// Hide-until-verified cards start display:none, so the viewport observer can't
// fire for them — they must be eager-probed. This predicate gates that, and it
// must mirror the visibility policy exactly so the right cards get probed.
test("cardNeedsEagerLivenessProbe gates eager probing to hidden-until-verified cards", (t) => {
  const { document } = setupDom(t);
  t.after(() => setCardLivenessPolicy("show-pending"));

  const foreign = makeCard(document, { foreign: "true" });
  const native = makeCard(document, { foreign: "false" });
  const owner = makeCard(document, { foreign: "true", owner: "true" });

  setCardLivenessPolicy("show-pending");
  assert.equal(cardNeedsEagerLivenessProbe(foreign), false, "show-pending never eager-probes");
  assert.equal(cardNeedsEagerLivenessProbe(native), false);

  setCardLivenessPolicy("hide-foreign");
  assert.equal(cardNeedsEagerLivenessProbe(foreign), true, "foreign card is eager-probed");
  assert.equal(cardNeedsEagerLivenessProbe(native), false, "native card stays viewport-gated");
  assert.equal(cardNeedsEagerLivenessProbe(owner), false, "owner card is never gated");

  setCardLivenessPolicy("hide-all");
  assert.equal(cardNeedsEagerLivenessProbe(native), true, "hide-all eager-probes native too");
  assert.equal(cardNeedsEagerLivenessProbe(owner), false, "owner card is never gated");
});

test("VideoCard.closeMoreMenu only restores focus when the trigger was expanded", (t) => {
  const { document } = setupDom(t);

  const card = new VideoCard({
    document,
    video: {
      id: "event-focus",
      title: "Focusable clip",
    },
    formatters: {
      formatTimeAgo: () => "just now",
    },
    helpers: {
      isMagnetSupported: () => true,
    },
  });

  const root = card.getRoot();
  document.body.appendChild(root);

  const trigger = card.moreMenuButton;
  assert.ok(trigger, "the more menu trigger should exist");

  let focusCalls = 0;
  trigger.focus = () => {
    focusCalls += 1;
  };

  card.onCloseMoreMenu = () => false;

  card.closeMoreMenu();
  assert.equal(
    focusCalls,
    0,
    "collapsed menus should not restore focus when closing",
  );

  trigger.setAttribute("aria-expanded", "true");
  card.closeMoreMenu();
  assert.equal(
    focusCalls,
    1,
    "expanded menus should restore focus back to the trigger",
  );

  trigger.setAttribute("aria-expanded", "true");
  card.closeMoreMenu({ restoreFocus: false });
  assert.equal(
    focusCalls,
    1,
    "restoreFocus=false should suppress focus restoration",
  );
});

test("VideoCard.closeSettingsMenu only restores focus when the trigger was expanded", (t) => {
  const { document } = setupDom(t);

  const card = new VideoCard({
    document,
    video: {
      id: "event-settings",
      title: "Editable clip",
    },
    capabilities: {
      canEdit: true,
    },
    formatters: {
      formatTimeAgo: () => "just now",
    },
    helpers: {
      isMagnetSupported: () => true,
    },
  });

  const root = card.getRoot();
  document.body.appendChild(root);

  const trigger = card.settingsButton;
  assert.ok(trigger, "the settings trigger should exist when canEdit is true");

  let focusCalls = 0;
  trigger.focus = () => {
    focusCalls += 1;
  };

  card.onCloseSettingsMenu = () => false;

  card.closeSettingsMenu();
  assert.equal(
    focusCalls,
    0,
    "collapsed settings menus should not restore focus when closing",
  );

  trigger.setAttribute("aria-expanded", "true");
  card.closeSettingsMenu();
  assert.equal(
    focusCalls,
    1,
    "expanded settings menus should restore focus back to the trigger",
  );

  trigger.setAttribute("aria-expanded", "true");
  card.closeSettingsMenu({ restoreFocus: false });
  assert.equal(
    focusCalls,
    1,
    "restoreFocus=false should suppress settings focus restoration",
  );
});
