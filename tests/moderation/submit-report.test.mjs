import test from "node:test";
import assert from "node:assert/strict";

import { ModerationService } from "../../js/services/moderationService.js";
import { withMockedNostrTools } from "../helpers/moderation-test-helpers.mjs";

function createRelayPublishingPool(publishCalls) {
  return {
    publish(urls, event) {
      publishCalls.push({ urls, event });
      return {
        on(eventName, handler) {
          if (eventName === "ok") {
            setTimeout(() => handler(), 0);
            return true;
          }
          return false;
        },
      };
    },
  };
}

test("submitReport emits NIP-56 compliant report tags", async (t) => {
  withMockedNostrTools(t);

  const reporterPubkey = "a".repeat(64);
  const targetPubkey = "b".repeat(64);
  const eventId = "c".repeat(64);
  const relayHint = "wss://relay.example";

  const extension = {
    async signEvent(event) {
      return { ...event, id: "signed-event", sig: "sig" };
    },
  };

  const previousExtension = globalThis.window.nostr;
  globalThis.window.nostr = extension;
  t.after(() => {
    if (typeof previousExtension === "undefined") {
      delete globalThis.window.nostr;
    } else {
      globalThis.window.nostr = previousExtension;
    }
  });

  const publishCalls = [];
  const nostrClient = {
    pubkey: reporterPubkey,
    relays: ["wss://relay.one"],
    ensurePool: async () => {},
    ensureExtensionPermissions: async () => ({ ok: true }),
<<<<<<< HEAD
    ensureActiveSignerForPubkey: async () => ({
      type: "extension",
      signEvent: async (evt) => ({ ...evt, id: "signed-event", sig: "sig" }),
    }),
=======
>>>>>>> origin/main
    pool: createRelayPublishingPool(publishCalls),
  };

  const service = new ModerationService({ nostrClient, logger: () => {} });

  const { event, ok } = await service.submitReport({
    eventId,
    type: "malware",
    targetPubkey,
    relayHint,
  });

  assert.equal(ok, true, "submitReport should resolve with ok: true");

  const eTag = event.tags.find((tag) => Array.isArray(tag) && tag[0] === "e");
  assert.deepEqual(
    eTag,
    ["e", eventId, "malware", relayHint],
    "e tag should include type before relay hint",
  );

  const pTag = event.tags.find((tag) => Array.isArray(tag) && tag[0] === "p");
  assert.deepEqual(pTag, ["p", targetPubkey, "malware"], "p tag should include reported author and type");

  assert.equal(
    event.tags.filter((tag) => Array.isArray(tag) && tag[0] === "report").length,
    0,
    "legacy report tag should be omitted",
  );

  const followupId = "d".repeat(64);
  const { event: followup } = await service.submitReport({
    eventId: followupId,
    type: "spam",
    targetPubkey,
  });

  const followupETag = followup.tags.find((tag) => Array.isArray(tag) && tag[0] === "e");
  assert.deepEqual(
    followupETag,
    ["e", followupId, "spam"],
    "e tag without relay hint should place type as third entry",
  );

  assert.ok(publishCalls.length >= 2, "submitReport should publish each report");
});
