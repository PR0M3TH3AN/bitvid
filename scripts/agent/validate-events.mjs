import {
  getNostrEventSchema,
  validateEventStructure,
  buildVideoPostEvent,
  buildHttpAuthEvent,
  buildReportEvent,
  buildGiftWrapEvent,
  buildSealEvent,
  buildChatMessageEvent,
  buildVideoMirrorEvent,
  buildRepostEvent,
  buildShareEvent,
  buildRelayListEvent,
  buildDmRelayListEvent,
  buildProfileMetadataEvent,
  buildMuteListEvent,
  buildDeletionEvent,
  buildLegacyDirectMessageEvent,
  buildDmAttachmentEvent,
  buildDmReadReceiptEvent,
  buildDmTypingIndicatorEvent,
  buildViewEvent,
  buildZapRequestEvent,
  buildReactionEvent,
  buildCommentEvent,
  buildWatchHistoryEvent,
  buildSubscriptionListEvent,
  buildBlockListEvent,
  buildHashtagPreferenceEvent,
  buildAdminListEvent,
  NOTE_TYPES,
} from "../../js/nostrEventSchemas.js";
import { buildNip71VideoEvent } from "../../js/nostr/nip71.js";
import fs from "fs";
import { execSync } from "child_process";
import path from "path";

// Parse CLI args
const args = process.argv.slice(2);
const getArg = (key) => {
  const arg = args.find(a => a.startsWith(`--${key}=`));
  return arg ? arg.split('=')[1] : null;
};
const hasArg = (key) => args.includes(`--${key}`);

const now = new Date();
const yyyymmdd = now.toISOString().slice(0, 10).replace(/-/g, "");
const defaultOut = `artifacts/validate-events-${yyyymmdd}.json`;

const OUT_FILE = getArg("out") || defaultOut;
const ONLY_BUILDER = getArg("only");
const DRY_RUN = hasArg("dry-run");

// Valid 32-byte hex pubkey for testing
const TEST_PUBKEY = "0000000000000000000000000000000000000000000000000000000000000001";
const TEST_EVENT_ID = "0000000000000000000000000000000000000000000000000000000000000002";

function findCallSites() {
  try {
    // Grep for build*Event calls in js/ directory, excluding node_modules and dist
    // We look for the pattern build[A-Z]...Event
    const cmd = `grep -rn "build[A-Z][a-zA-Z]*Event" js/ --include="*.js" --exclude-dir=node_modules`;
    const output = execSync(cmd, { encoding: 'utf-8' });
    return output.split('\n').filter(Boolean).map(line => {
      // line format: file:line:content
      const parts = line.split(':');
      if (parts.length < 3) return null;
      return {
        file: parts[0],
        line: parts[1],
        content: parts.slice(2).join(':').trim()
      };
    }).filter(Boolean);
  } catch (e) {
    // grep returns exit code 1 if no matches found, which execSync treats as error
    if (e.status === 1) return [];
    console.warn("Could not find call sites via grep:", e.message);
    return [];
  }
}

function runValidation() {
  const results = [];
  const failures = [];

  const runTest = (name, builder, input, expectedType) => {
    if (ONLY_BUILDER && !name.includes(ONLY_BUILDER)) return;

    try {
      const event = builder(input);
      const validation = validateEventStructure(expectedType, event);

      const result = {
        builder: name,
        input: input,
        event: event,
        validation: {
          status: validation.valid ? "PASS" : "FAIL",
          failures: validation.errors.map(msg => ({ message: msg }))
        }
      };

      results.push(result);

      if (!validation.valid) {
        failures.push(result);
        console.error(`❌ ${name} FAILED:`);
        validation.errors.forEach(e => console.error(`   - ${e}`));
      } else {
        console.log(`✅ ${name} PASSED`);
      }
    } catch (e) {
      console.error(`❌ ${name} CRASHED:`, e);
      failures.push({
        builder: name,
        input: input,
        error: e.message,
        validation: { status: "CRASH", failures: [{ message: e.message }] }
      });
    }
  };

  console.log(`Starting event schema validation... Output: ${OUT_FILE}`);

  // 1. Video Post
  runTest("buildVideoPostEvent", buildVideoPostEvent, {
    pubkey: TEST_PUBKEY,
    created_at: 1234567890,
    dTagValue: "video-id",
    content: {
      version: 3,
      title: "My Video",
      videoRootId: "video-id",
      url: "https://example.com/video.mp4"
    }
  }, NOTE_TYPES.VIDEO_POST);

  // 2. HTTP Auth
  runTest("buildHttpAuthEvent", buildHttpAuthEvent, {
    pubkey: TEST_PUBKEY,
    created_at: 1234567890,
    url: "https://example.com/login",
    method: "GET"
  }, NOTE_TYPES.HTTP_AUTH);

  // 3. Report
  runTest("buildReportEvent", buildReportEvent, {
    pubkey: TEST_PUBKEY,
    created_at: 1234567890,
    eventId: TEST_EVENT_ID,
    reportType: "nudity"
  }, NOTE_TYPES.REPORT);

  // 4. Gift Wrap
  runTest("buildGiftWrapEvent", buildGiftWrapEvent, {
    pubkey: TEST_PUBKEY,
    created_at: 1234567890,
    recipientPubkey: TEST_PUBKEY,
    ciphertext: "encrypted-content"
  }, NOTE_TYPES.GIFT_WRAP);

  // 5. Seal
  runTest("buildSealEvent", buildSealEvent, {
    pubkey: TEST_PUBKEY,
    created_at: 1234567890,
    ciphertext: "encrypted-rumor"
  }, NOTE_TYPES.SEAL);

  // 6. Chat Message
  runTest("buildChatMessageEvent", buildChatMessageEvent, {
    pubkey: TEST_PUBKEY,
    created_at: 1234567890,
    recipientPubkey: TEST_PUBKEY,
    content: "Hello world"
  }, NOTE_TYPES.CHAT_MESSAGE);

  // 7. Video Mirror
  runTest("buildVideoMirrorEvent", buildVideoMirrorEvent, {
    pubkey: TEST_PUBKEY,
    created_at: 1234567890,
    content: "https://example.com/video.mp4"
  }, NOTE_TYPES.VIDEO_MIRROR);

  // 8. Repost
  runTest("buildRepostEvent", buildRepostEvent, {
    pubkey: TEST_PUBKEY,
    created_at: 1234567890,
    eventId: TEST_EVENT_ID,
    eventRelay: "wss://relay.example.com"
  }, NOTE_TYPES.REPOST);

  // 9. Share
  runTest("buildShareEvent", buildShareEvent, {
    pubkey: TEST_PUBKEY,
    created_at: 1234567890,
    content: "Check this out!",
    video: { id: "video-id", pubkey: TEST_PUBKEY }
  }, NOTE_TYPES.SHARE);

  // 10. Relay List
  runTest("buildRelayListEvent", buildRelayListEvent, {
    pubkey: TEST_PUBKEY,
    created_at: 1234567890,
    relays: ["wss://relay1.com", { url: "wss://relay2.com", mode: "read" }]
  }, NOTE_TYPES.RELAY_LIST);

  // 11. DM Relay List
  runTest("buildDmRelayListEvent", buildDmRelayListEvent, {
    pubkey: TEST_PUBKEY,
    created_at: 1234567890,
    relays: ["wss://dm.relay.com"]
  }, NOTE_TYPES.DM_RELAY_LIST);

  // 12. Profile Metadata
  runTest("buildProfileMetadataEvent", buildProfileMetadataEvent, {
    pubkey: TEST_PUBKEY,
    created_at: 1234567890,
    metadata: { name: "Alice", about: "Bob" }
  }, NOTE_TYPES.PROFILE_METADATA);

  // 13. Mute List
  runTest("buildMuteListEvent", buildMuteListEvent, {
    pubkey: TEST_PUBKEY,
    created_at: 1234567890,
    pTags: [TEST_PUBKEY]
  }, NOTE_TYPES.MUTE_LIST);

  // 14. Deletion
  runTest("buildDeletionEvent", buildDeletionEvent, {
    pubkey: TEST_PUBKEY,
    created_at: 1234567890,
    eventIds: [TEST_EVENT_ID],
    reason: "spam"
  }, NOTE_TYPES.DELETION);

  // 15. Legacy DM
  runTest("buildLegacyDirectMessageEvent", buildLegacyDirectMessageEvent, {
    pubkey: TEST_PUBKEY,
    created_at: 1234567890,
    recipientPubkey: TEST_PUBKEY,
    ciphertext: "secret message"
  }, NOTE_TYPES.LEGACY_DM);

  // 16. DM Attachment
  runTest("buildDmAttachmentEvent", buildDmAttachmentEvent, {
    pubkey: TEST_PUBKEY,
    created_at: 1234567890,
    recipientPubkey: TEST_PUBKEY,
    attachment: { x: "hash", url: "https://example.com/file.jpg" }
  }, NOTE_TYPES.DM_ATTACHMENT);

  // 17. DM Read Receipt
  runTest("buildDmReadReceiptEvent", buildDmReadReceiptEvent, {
    pubkey: TEST_PUBKEY,
    created_at: 1234567890,
    recipientPubkey: TEST_PUBKEY,
    eventId: TEST_EVENT_ID
  }, NOTE_TYPES.DM_READ_RECEIPT);

  // 18. DM Typing Indicator
  runTest("buildDmTypingIndicatorEvent", buildDmTypingIndicatorEvent, {
    pubkey: TEST_PUBKEY,
    created_at: 1234567890,
    recipientPubkey: TEST_PUBKEY,
    eventId: TEST_EVENT_ID
  }, NOTE_TYPES.DM_TYPING);

  // 19. View Event
  runTest("buildViewEvent", buildViewEvent, {
    pubkey: TEST_PUBKEY,
    created_at: 1234567890,
    pointerValue: "video-id",
    dedupeTag: "random-dedupe"
  }, NOTE_TYPES.VIEW_EVENT);

  // 20. Zap Request
  runTest("buildZapRequestEvent", buildZapRequestEvent, {
    pubkey: TEST_PUBKEY,
    created_at: 1234567890,
    recipientPubkey: TEST_PUBKEY,
    amountSats: 100,
    lnurl: "lnurl1..."
  }, NOTE_TYPES.ZAP_REQUEST);

  // 21. Reaction
  runTest("buildReactionEvent", buildReactionEvent, {
    pubkey: TEST_PUBKEY,
    created_at: 1234567890,
    targetPointer: { type: "e", value: TEST_EVENT_ID },
    content: "+"
  }, NOTE_TYPES.VIDEO_REACTION);

  // 22. Comment
  runTest("buildCommentEvent", buildCommentEvent, {
    pubkey: TEST_PUBKEY,
    created_at: 1234567890,
    videoEventId: TEST_EVENT_ID,
    content: "Nice video!"
  }, NOTE_TYPES.VIDEO_COMMENT);

  // 23. Watch History
  // Testing implicit monthIdentifier via default
  runTest("buildWatchHistoryEvent (Default Month)", buildWatchHistoryEvent, {
    pubkey: TEST_PUBKEY,
    created_at: 1234567890,
    content: { "video-id": 1234567890 }
  }, NOTE_TYPES.WATCH_HISTORY);

  // 24. Subscription List
  runTest("buildSubscriptionListEvent", buildSubscriptionListEvent, {
    pubkey: TEST_PUBKEY,
    created_at: 1234567890,
    content: [["p", TEST_PUBKEY]]
  }, NOTE_TYPES.SUBSCRIPTION_LIST);

  // 25. Block List
  runTest("buildBlockListEvent", buildBlockListEvent, {
    pubkey: TEST_PUBKEY,
    created_at: 1234567890,
    content: [["p", TEST_PUBKEY]]
  }, NOTE_TYPES.USER_BLOCK_LIST);

  // 26. Hashtag Preference
  runTest("buildHashtagPreferenceEvent", buildHashtagPreferenceEvent, {
    pubkey: TEST_PUBKEY,
    created_at: 1234567890,
    content: { version: 1, interests: ["nostr"], disinterests: [] }
  }, NOTE_TYPES.HASHTAG_PREFERENCES);

  // 27. Admin List (Moderation)
  runTest("buildAdminListEvent (Moderation)", (input) => buildAdminListEvent("moderation", input), {
    pubkey: TEST_PUBKEY,
    created_at: 1234567890,
    hexPubkeys: [TEST_PUBKEY]
  }, NOTE_TYPES.ADMIN_MODERATION_LIST);

  // 28. NIP-71 Video
  runTest("buildNip71VideoEvent", buildNip71VideoEvent, {
    pubkey: TEST_PUBKEY,
    created_at: 1234567890,
    title: "NIP-71 Test",
    content: "Summary",
    metadata: {
        duration: 120,
        alt: "Alt text"
    }
  }, NOTE_TYPES.NIP71_VIDEO);

  // Find call sites
  const callSites = findCallSites();
  console.log(`Found ${callSites.length} runtime call sites.`);

  const finalReport = {
    results,
    runtime_call_sites: callSites
  };

  if (!DRY_RUN) {
    fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
    fs.writeFileSync(OUT_FILE, JSON.stringify(finalReport, null, 2));
    console.log(`\nReport written to ${OUT_FILE}`);
  } else {
    console.log("\nDry run: Skipping report write.");
  }

  if (failures.length > 0) {
    console.error(`\n⚠️  Found ${failures.length} validation failures.`);
    process.exit(1);
  } else {
    console.log("\n✨ All validations passed!");
  }
}

runValidation();
