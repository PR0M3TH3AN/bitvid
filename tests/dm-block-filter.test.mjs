import "./test-helpers/setup-localstorage.mjs";
import { describe, it, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import nostrService from "../js/services/nostrService.js";
import { userBlocks } from "../js/userBlocks.js";
import { nostrClient } from "../js/nostrClientFacade.js";
import { relayManager } from "../js/relayManager.js";
import {
  BLOCK_LIST_IDENTIFIER,
  KIND_MUTE_LIST,
} from "../js/nostrEventSchemas.js";

const ACTOR_PUBKEY = "aaaa".repeat(16);
const BLOCKED_PUBKEY = "bbbb".repeat(16);
const ALLOWED_PUBKEY = "cccc".repeat(16);

function makeDmMessage({ senderPubkey, receiverPubkey, eventId, direction }) {
  return {
    ok: true,
    direction: direction || "incoming",
    sender: { pubkey: senderPubkey },
    recipients: [{ pubkey: receiverPubkey }],
    remotePubkey:
      direction === "outgoing" ? receiverPubkey : senderPubkey,
    actorPubkey: direction === "outgoing" ? senderPubkey : receiverPubkey,
    timestamp: Math.floor(Date.now() / 1000),
    plaintext: "Hello",
    event: {
      id: eventId || `evt-${Math.random().toString(36).slice(2)}`,
      kind: 4,
      pubkey: senderPubkey,
      created_at: Math.floor(Date.now() / 1000),
      tags: [["p", receiverPubkey]],
    },
    message: {
      kind: 4,
      pubkey: senderPubkey,
      tags: [["p", receiverPubkey]],
    },
  };
}

describe("DM block/mute filtering", () => {
  beforeEach(() => {
    nostrService.dmMessages = [];
    nostrService.dmMessageIndex = new Map();
    nostrService.dmActorPubkey = ACTOR_PUBKEY;
    nostrService.dmHydratedFromSnapshot = false;
  });

  afterEach(() => {
    nostrService.setDmBlockChecker(null);
    nostrService.dmMessages = [];
    nostrService.dmMessageIndex = new Map();
    nostrService.dmActorPubkey = null;
    mock.reset();
  });

  describe("setDmBlockChecker", () => {
    it("should accept a function", () => {
      nostrService.setDmBlockChecker(() => false);
      assert.equal(typeof nostrService._dmBlockChecker, "function");
    });

    it("should clear checker when passed null", () => {
      nostrService.setDmBlockChecker(() => true);
      nostrService.setDmBlockChecker(null);
      assert.equal(nostrService._dmBlockChecker, null);
    });

    it("should clear checker when passed non-function", () => {
      nostrService.setDmBlockChecker(() => true);
      nostrService.setDmBlockChecker("not-a-function");
      assert.equal(nostrService._dmBlockChecker, null);
    });
  });

  describe("applyDirectMessage with block checker", () => {
    it("should drop messages from blocked senders", () => {
      nostrService.setDmBlockChecker((pubkey) => pubkey === BLOCKED_PUBKEY);

      const message = makeDmMessage({
        senderPubkey: BLOCKED_PUBKEY,
        receiverPubkey: ACTOR_PUBKEY,
        eventId: "blocked-msg-1",
        direction: "incoming",
      });

      nostrService.applyDirectMessage(message, { reason: "test" });

      assert.equal(nostrService.dmMessages.length, 0);
      assert.equal(nostrService.dmMessageIndex.has("blocked-msg-1"), false);
    });

    it("should allow messages from non-blocked senders", () => {
      nostrService.setDmBlockChecker((pubkey) => pubkey === BLOCKED_PUBKEY);

      const message = makeDmMessage({
        senderPubkey: ALLOWED_PUBKEY,
        receiverPubkey: ACTOR_PUBKEY,
        eventId: "allowed-msg-1",
        direction: "incoming",
      });

      nostrService.applyDirectMessage(message, { reason: "test" });

      assert.equal(nostrService.dmMessages.length, 1);
    });

    it("should allow all messages when no block checker is set", () => {
      const message = makeDmMessage({
        senderPubkey: BLOCKED_PUBKEY,
        receiverPubkey: ACTOR_PUBKEY,
        eventId: "no-checker-msg-1",
        direction: "incoming",
      });

      nostrService.applyDirectMessage(message, { reason: "test" });

      assert.equal(nostrService.dmMessages.length, 1);
    });

    it("should block outgoing messages to blocked recipients", () => {
      nostrService.setDmBlockChecker((pubkey) => pubkey === BLOCKED_PUBKEY);

      const message = makeDmMessage({
        senderPubkey: ACTOR_PUBKEY,
        receiverPubkey: BLOCKED_PUBKEY,
        eventId: "outgoing-blocked-1",
        direction: "outgoing",
      });

      nostrService.applyDirectMessage(message, { reason: "test" });

      assert.equal(nostrService.dmMessages.length, 0);
    });
  });

  describe("_isDmRemoteBlocked", () => {
    it("should return false when no checker is set", () => {
      const message = makeDmMessage({
        senderPubkey: BLOCKED_PUBKEY,
        receiverPubkey: ACTOR_PUBKEY,
        direction: "incoming",
      });
      assert.equal(nostrService._isDmRemoteBlocked(message), false);
    });

    it("should return true for blocked remote pubkey", () => {
      nostrService.setDmBlockChecker((pubkey) => pubkey === BLOCKED_PUBKEY);
      const message = makeDmMessage({
        senderPubkey: BLOCKED_PUBKEY,
        receiverPubkey: ACTOR_PUBKEY,
        direction: "incoming",
      });
      assert.equal(nostrService._isDmRemoteBlocked(message), true);
    });

    it("should return false for allowed remote pubkey", () => {
      nostrService.setDmBlockChecker((pubkey) => pubkey === BLOCKED_PUBKEY);
      const message = makeDmMessage({
        senderPubkey: ALLOWED_PUBKEY,
        receiverPubkey: ACTOR_PUBKEY,
        direction: "incoming",
      });
      assert.equal(nostrService._isDmRemoteBlocked(message), false);
    });

    it("should handle checker that throws", () => {
      nostrService.setDmBlockChecker(() => {
        throw new Error("checker error");
      });
      const message = makeDmMessage({
        senderPubkey: BLOCKED_PUBKEY,
        receiverPubkey: ACTOR_PUBKEY,
        direction: "incoming",
      });
      assert.equal(nostrService._isDmRemoteBlocked(message), false);
    });
  });

  describe("integration with loaded user block list", () => {
    it("should block DM contact for pubkeys loaded from both standard and legacy lists", async () => {
      const actor = ACTOR_PUBKEY;
      const legacyBlockedPubkey = "dddd".repeat(16);
      const standardBlockedPubkey = "eeee".repeat(16);

      const UserBlockListManager = userBlocks.constructor;
      const manager = new UserBlockListManager();

      const originalNostr = globalThis.window?.nostr;
      const originalRelays = Array.isArray(nostrClient.relays)
        ? [...nostrClient.relays]
        : nostrClient.relays;
      const originalFetchListIncrementally = nostrClient.fetchListIncrementally;
      const originalRelayEntries = relayManager.getEntries();

      const relayUrls = ["wss://dm-block-regression.example"];
      relayManager.setEntries(
        relayUrls.map((url) => ({ url, mode: "both" })),
        { allowEmpty: false, updateClient: false },
      );
      nostrClient.relays = relayUrls;

      if (typeof globalThis.window === "undefined") {
        globalThis.window = {};
      }

      globalThis.window.nostr = {
        ...(originalNostr || {}),
        nip04: {
          ...((originalNostr && originalNostr.nip04) || {}),
          decrypt: async () =>
            JSON.stringify({
              blockedPubkeys: [legacyBlockedPubkey],
            }),
        },
      };

      const standardEvent = {
        id: "event-standard-mute",
        kind: KIND_MUTE_LIST,
        created_at: 2_000,
        pubkey: actor,
        content: "",
        tags: [["p", standardBlockedPubkey]],
      };

      const legacyEvent = {
        id: "event-legacy-blocks",
        kind: KIND_MUTE_LIST,
        created_at: 1_000,
        pubkey: actor,
        content: "legacy-encrypted",
        tags: [["d", BLOCK_LIST_IDENTIFIER]],
      };

      nostrClient.fetchListIncrementally = async ({
        kind,
        dTag,
      } = {}) => {
        if (kind === KIND_MUTE_LIST && dTag === BLOCK_LIST_IDENTIFIER) {
          return [legacyEvent];
        }
        if (kind === KIND_MUTE_LIST && !dTag) {
          return [standardEvent];
        }
        if (kind === 30002 && dTag === BLOCK_LIST_IDENTIFIER) {
          return [];
        }
        return [];
      };

      try {
        await manager.loadBlocks(actor, { allowPermissionPrompt: false });

        const waitForMergedBlocks = async (timeoutMs = 250) => {
          const startedAt = Date.now();
          while (Date.now() - startedAt < timeoutMs) {
            if (
              manager.isBlocked(legacyBlockedPubkey) &&
              manager.isBlocked(standardBlockedPubkey)
            ) {
              return;
            }
            await new Promise((resolve) => setTimeout(resolve, 10));
          }
        };
        await waitForMergedBlocks();

        nostrService.setDmBlockChecker((pubkey) => manager.isBlocked(pubkey));

        nostrService.applyDirectMessage(
          makeDmMessage({
            senderPubkey: legacyBlockedPubkey,
            receiverPubkey: actor,
            eventId: "blocked-legacy",
            direction: "incoming",
          }),
          { reason: "integration-test" },
        );

        nostrService.applyDirectMessage(
          makeDmMessage({
            senderPubkey: standardBlockedPubkey,
            receiverPubkey: actor,
            eventId: "blocked-standard",
            direction: "incoming",
          }),
          { reason: "integration-test" },
        );

        nostrService.applyDirectMessage(
          makeDmMessage({
            senderPubkey: ALLOWED_PUBKEY,
            receiverPubkey: actor,
            eventId: "allowed-contact",
            direction: "incoming",
          }),
          { reason: "integration-test" },
        );

        assert.equal(
          nostrService.dmMessages.length,
          1,
          "only non-blocked contacts should remain in DM message state",
        );
        assert.equal(
          nostrService.dmMessages[0]?.remotePubkey,
          ALLOWED_PUBKEY,
          "allowed contact should pass block filter",
        );
      } finally {
        relayManager.setEntries(originalRelayEntries, {
          allowEmpty: false,
          updateClient: false,
        });
        nostrClient.relays = originalRelays;
        nostrClient.fetchListIncrementally = originalFetchListIncrementally;
        if (typeof globalThis.window === "undefined") {
          globalThis.window = {};
        }
        globalThis.window.nostr = originalNostr;
      }
    });
  });
});
