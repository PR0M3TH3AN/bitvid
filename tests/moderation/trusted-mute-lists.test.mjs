import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_AUTOPLAY_BLOCK_THRESHOLD,
  DEFAULT_BLUR_THRESHOLD,
  DEFAULT_TRUSTED_MUTE_HIDE_THRESHOLD,
} from "../../js/constants.js";
import { createModerationStage } from "../../js/feedEngine/stages.js";
import { withMockedNostrTools, createModerationServiceHarness } from "../helpers/moderation-test-helpers.mjs";

const { userBlocks } = await import("../../js/userBlocks.js");
const { nostrClient } = await import("../../js/nostrClientFacade.js");
const { setActiveSigner, clearActiveSigner } = await import("../../js/nostr.js");

test("trusted mute lists from seeds hide authors for anonymous viewers", async (t) => {
  withMockedNostrTools(t);

  const seedHex = "1".repeat(64);
  const mutedHex = "2".repeat(64);

  const originalBlocked = new Set(userBlocks.blockedPubkeys);
  const originalBlockEventId = userBlocks.blockEventId;
  const originalBlockEventCreatedAt = userBlocks.blockEventCreatedAt;
  const originalLastPublishedCreatedAt = userBlocks.lastPublishedCreatedAt;
  const originalMuteEventId = userBlocks.muteEventId;
  const originalMuteEventCreatedAt = userBlocks.muteEventCreatedAt;
  const originalLoaded = userBlocks.loaded;
  const originalLoadBlocks = userBlocks.loadBlocks;
  const originalRelays = Array.isArray(nostrClient.relays)
    ? [...nostrClient.relays]
    : nostrClient.relays;
  const originalWriteRelays = Array.isArray(nostrClient.writeRelays)
    ? [...nostrClient.writeRelays]
    : nostrClient.writeRelays;
  const originalPool = nostrClient.pool;

  t.after(() => {
    userBlocks.blockedPubkeys = originalBlocked;
    userBlocks.blockEventId = originalBlockEventId;
    userBlocks.blockEventCreatedAt = originalBlockEventCreatedAt;
    userBlocks.lastPublishedCreatedAt = originalLastPublishedCreatedAt;
    userBlocks.muteEventId = originalMuteEventId;
    userBlocks.muteEventCreatedAt = originalMuteEventCreatedAt;
    userBlocks.loaded = originalLoaded;
    userBlocks.loadBlocks = originalLoadBlocks;
    nostrClient.relays = originalRelays;
    nostrClient.writeRelays = originalWriteRelays;
    nostrClient.pool = originalPool;
    clearActiveSigner();
  });

  const publishedEvents = [];
  nostrClient.relays = ["wss://seed-relay.example"];
  nostrClient.writeRelays = nostrClient.relays;
  nostrClient.pool = {
    publish: (_targets, event) => {
      publishedEvents.push(event);
      return {
        on(eventName, handler) {
          if (eventName === "ok") {
            setImmediate(handler);
            return true;
          }
          return false;
        },
      };
    },
    list: async () => [],
  };

  userBlocks.loadBlocks = async () => {};
  userBlocks.blockedPubkeys = new Set();
  userBlocks.blockEventId = null;
  userBlocks.blockEventCreatedAt = null;
  userBlocks.lastPublishedCreatedAt = null;
  userBlocks.muteEventId = null;
  userBlocks.muteEventCreatedAt = null;
  userBlocks.loaded = true;

  const signedEvents = [];
  setActiveSigner({
    type: "private-key",
    pubkey: seedHex,
    nip04Encrypt: async (pubkey, plaintext) => {
      assert.equal(pubkey, seedHex, "nip04 encrypt should target the seed pubkey");
      return `nip04:${plaintext}`;
    },
    nip44Encrypt: async (pubkey, plaintext) => {
      assert.equal(pubkey, seedHex, "nip44 encrypt should target the seed pubkey");
      return `nip44:${plaintext}`;
    },
    signEvent: async (event) => {
      const signed = {
        ...event,
        id: `event-${signedEvents.length + 1}`,
        created_at: event.created_at ?? Math.floor(Date.now() / 1000),
      };
      signedEvents.push(signed);
      return signed;
    },
  });

  await userBlocks.addBlock(mutedHex, seedHex);

  const muteEvent = signedEvents.find(
    (event) =>
      event.kind === 10000 &&
      Array.isArray(event.tags) &&
      event.tags.some((tag) => Array.isArray(tag) && tag[0] === "p"),
  );
  assert(muteEvent, "block list updates should publish a kind 10000 mute list event");
  assert(
    muteEvent.tags.some((tag) => Array.isArray(tag) && tag[0] === "p" && tag[1] === mutedHex),
    "mute list event should include p-tags for blocked pubkeys",
  );
  const publishedMuteEvents = publishedEvents.filter(
    (event) =>
      event?.kind === 10000 &&
      Array.isArray(event.tags) &&
      event.tags.some((tag) => Array.isArray(tag) && tag[0] === "p"),
  );
  assert(publishedMuteEvents.length >= 1, "mute list event should be published to relays");

  const { service } = createModerationServiceHarness(t, { userBlocks });
  service.refreshViewerFromClient = async () => {};
  service.setActiveEventIds = async () => {};
  service.subscribeToReports = async () => {};
  service.teardownReportSubscription = () => {};
  service.getAdminListSnapshot = () => ({
    whitelist: new Set(),
    whitelistHex: new Set(),
    blacklist: new Set(),
    blacklistHex: new Set(),
  });
  service.getAccessControlStatus = () => ({ whitelisted: false, blacklisted: false, hex: "" });

  service.setTrustedSeeds([seedHex]);
  service.ingestTrustedMuteEvent(muteEvent);

  assert.equal(
    service.isAuthorMutedByTrusted(mutedHex),
    true,
    "trusted mute ingestion should flag the author as muted",
  );

  const stage = createModerationStage({
    service,
    autoplayThreshold: DEFAULT_AUTOPLAY_BLOCK_THRESHOLD,
    blurThreshold: DEFAULT_BLUR_THRESHOLD,
    trustedMuteHideThreshold: DEFAULT_TRUSTED_MUTE_HIDE_THRESHOLD,
    reportType: "nudity",
  });

  const items = [{ video: { id: "video-muted", pubkey: mutedHex }, metadata: {} }];
  const why = [];
  const context = {
    runtime: { isAuthorBlocked: () => false },
    addWhy(detail) {
      why.push(detail);
      return detail;
    },
    log() {},
  };

  const result = await stage(items, context);

  assert.equal(result.length, 0, "trusted mute threshold should hide the muted author");
  const reasons = why.map((entry) => entry.reason);
  assert(
    reasons.includes("trusted-mute"),
    "moderation stage should record trusted mute metadata",
  );
  assert(
    reasons.includes("trusted-mute-hide"),
    "moderation stage should record the trusted mute hide reason",
  );
});
