// Regression: clicking the "Message" button on the profile of someone you've
// never DMed sets the recipient, but buildDmConversationData used to discard it
// (no existing thread => not in conversationMap => fall back to conversations[0])
// and silently focus the TOP conversation instead. Any message you then sent
// went to the wrong person ("it says sent but I don't see it").
//
// Scenario (SCN-dm-focus-new-recipient):
//   Given an inbox with one existing thread (Bob),
//   And the user has explicitly selected a brand-new recipient (Carol) with no
//     messages yet,
//   When the DM conversation data is built,
//   Then the active conversation is Carol's (not Bob's), Carol appears as a
//     synthesized conversation, and the active remote pubkey is Carol — so the
//     composer targets Carol.

import test from "node:test";
import assert from "node:assert/strict";

import { ProfileDirectMessageHelper } from "../../js/ui/profileModal/ProfileDirectMessageHelper.js";

const ACTOR = "a".repeat(64);
const BOB = "b".repeat(64);
const CAROL = "c".repeat(64);

function buildHelper({ storedRecipient }) {
  const mainController = {
    normalizeHexPubkey: (value) =>
      typeof value === "string" && value.trim() ? value.trim() : "",
    getActivePubkey: () => ACTOR,
    safeEncodeNpub: (hex) => `npub_${hex.slice(0, 6)}`,
    formatShortNpub: (npub) => npub,
    services: {
      nostrClient: {},
      getProfileCacheEntry: () => null,
    },
    state: {
      getDmRecipient: () => storedRecipient,
      getDmRelayHints: () => [],
      getDmRelayPreferences: () => [],
    },
    nostrService: {
      getDirectMessageUnseenCount: () => 0,
    },
  };
  const controller = {
    activeDmConversationId: "",
    directMessagesCache: [],
  };
  const helper = new ProfileDirectMessageHelper(mainController, controller);

  // Keep the focus-selection logic real; stub only presentation helpers that
  // would otherwise require a full profile cache.
  helper.resolveProfileSummaryForPubkey = (pubkey) => ({
    displayName: `name_${pubkey.slice(0, 4)}`,
    avatarSrc: "",
    status: "",
    lightningAddress: "",
  });
  helper.resolveDirectMessagePreviewForConversation = () => "preview";
  helper.buildDmMessageTimeline = () => [];

  return helper;
}

// One existing message thread with Bob.
const MESSAGES = [
  {
    ok: true,
    actorPubkey: ACTOR,
    senderPubkey: BOB,
    recipientPubkey: ACTOR,
    remotePubkey: BOB,
    created_at: 1000,
    content: "hi from bob",
    scheme: "nip04",
  },
];

test("focuses a freshly-selected recipient with no thread instead of the top conversation", async () => {
  const helper = buildHelper({ storedRecipient: CAROL });

  const data = await helper.buildDmConversationData(MESSAGES, { actorPubkey: ACTOR });

  const carolId = helper.buildDmConversationId(ACTOR, CAROL);
  const bobId = helper.buildDmConversationId(ACTOR, BOB);

  assert.equal(
    data.activeConversationId,
    carolId,
    "active conversation must be the selected recipient (Carol), not the top thread (Bob)",
  );
  assert.notEqual(data.activeConversationId, bobId);
  assert.equal(
    data.activeRemotePubkey,
    CAROL,
    "composer target (activeRemotePubkey) must be Carol",
  );
  assert.ok(
    data.conversations.some((c) => c.pubkey === CAROL),
    "a synthesized conversation for Carol must be present in the list",
  );
});

test("still defaults to the top conversation when no recipient is selected", async () => {
  const helper = buildHelper({ storedRecipient: null });

  const data = await helper.buildDmConversationData(MESSAGES, { actorPubkey: ACTOR });

  const bobId = helper.buildDmConversationId(ACTOR, BOB);
  assert.equal(
    data.activeConversationId,
    bobId,
    "with no explicit recipient, default to the most recent thread (Bob)",
  );
  assert.equal(data.activeRemotePubkey, BOB);
});
