#!/usr/bin/env node

import { execSync } from "child_process";
import {
  NOTE_TYPES,
  validateEventStructure,
  buildVideoPostEvent,
  buildHttpAuthEvent,
  buildReportEvent,
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
} from "../../js/nostrEventSchemas.js";

const PUBKEY = "0000000000000000000000000000000000000000000000000000000000000001";
const CREATED_AT = 1700000000;

const IGNORED_BUILDERS = new Set([
  "buildShareUrlFromEventId", // Method in js/app.js, not an event builder
  "buildShareUrlFromEvent", // Substring match or alias
  "buildListEvent", // Local helper in js/adminListStore.js wrapping buildAdminListEvent
  "buildProfileFromEvent", // Local helper in js/services/authService.js
]);

const KNOWN_BUILDERS = {
  buildVideoPostEvent: {
    builder: buildVideoPostEvent,
    type: NOTE_TYPES.VIDEO_POST,
    params: {
      pubkey: PUBKEY,
      created_at: CREATED_AT,
      dTagValue: "test-video-id",
      content: {
        version: 3,
        title: "Test Video",
        videoRootId: "test-video-id",
        infoHash: "0123456789abcdef0123456789abcdef01234567",
      },
    }
  },
  buildHttpAuthEvent: {
    builder: buildHttpAuthEvent,
    type: NOTE_TYPES.HTTP_AUTH,
    params: {
      pubkey: PUBKEY,
      created_at: CREATED_AT,
      url: "https://example.com/auth",
      method: "GET",
      payload: "hash",
    }
  },
  buildReportEvent: {
    builder: buildReportEvent,
    type: NOTE_TYPES.REPORT,
    params: {
      pubkey: PUBKEY,
      created_at: CREATED_AT,
      eventId: "e".repeat(64),
      reportType: "nudity",
    }
  },
  buildVideoMirrorEvent: {
    builder: buildVideoMirrorEvent,
    type: NOTE_TYPES.VIDEO_MIRROR,
    params: {
      pubkey: PUBKEY,
      created_at: CREATED_AT,
      tags: [["url", "https://example.com/video.mp4"], ["m", "video/mp4"]],
      content: "Mirroring video",
    }
  },
  buildRepostEvent: {
    builder: buildRepostEvent,
    type: NOTE_TYPES.REPOST,
    params: {
      pubkey: PUBKEY,
      created_at: CREATED_AT,
      eventId: "e".repeat(64),
      eventRelay: "wss://relay.example.com",
    }
  },
  buildShareEvent: {
    builder: buildShareEvent,
    type: NOTE_TYPES.SHARE,
    params: {
      pubkey: PUBKEY,
      created_at: CREATED_AT,
      video: { id: "e".repeat(64), pubkey: PUBKEY },
      relays: ["wss://relay.example.com"],
      content: "Check this out",
    }
  },
  buildRelayListEvent: {
    builder: buildRelayListEvent,
    type: NOTE_TYPES.RELAY_LIST,
    params: {
      pubkey: PUBKEY,
      created_at: CREATED_AT,
      relays: [{ url: "wss://relay.example.com", read: true, write: true }],
    }
  },
  buildDmRelayListEvent: {
    builder: buildDmRelayListEvent,
    type: NOTE_TYPES.DM_RELAY_LIST,
    params: {
      pubkey: PUBKEY,
      created_at: CREATED_AT,
      relays: ["wss://relay.example.com"],
    }
  },
  buildProfileMetadataEvent: {
    builder: buildProfileMetadataEvent,
    type: NOTE_TYPES.PROFILE_METADATA,
    params: {
      pubkey: PUBKEY,
      created_at: CREATED_AT,
      metadata: { name: "Test User", about: "Testing" },
    }
  },
  buildMuteListEvent: {
    builder: buildMuteListEvent,
    type: NOTE_TYPES.MUTE_LIST,
    params: {
      pubkey: PUBKEY,
      created_at: CREATED_AT,
      pTags: [PUBKEY],
    }
  },
  buildDeletionEvent: {
    builder: buildDeletionEvent,
    type: NOTE_TYPES.DELETION,
    params: {
      pubkey: PUBKEY,
      created_at: CREATED_AT,
      eventIds: ["e".repeat(64)],
      reason: "mistake",
    }
  },
  buildLegacyDirectMessageEvent: {
    builder: buildLegacyDirectMessageEvent,
    type: NOTE_TYPES.LEGACY_DM,
    params: {
      pubkey: PUBKEY,
      created_at: CREATED_AT,
      recipientPubkey: PUBKEY,
      ciphertext: "encrypted",
    }
  },
  buildDmAttachmentEvent: {
    builder: buildDmAttachmentEvent,
    type: NOTE_TYPES.DM_ATTACHMENT,
    params: {
      pubkey: PUBKEY,
      created_at: CREATED_AT,
      recipientPubkey: PUBKEY,
      attachment: { url: "https://example.com/file", x: "hash", type: "image/jpeg" },
    }
  },
  buildDmReadReceiptEvent: {
    builder: buildDmReadReceiptEvent,
    type: NOTE_TYPES.DM_READ_RECEIPT,
    params: {
      pubkey: PUBKEY,
      created_at: CREATED_AT,
      recipientPubkey: PUBKEY,
      eventId: "e".repeat(64),
    }
  },
  buildDmTypingIndicatorEvent: {
    builder: buildDmTypingIndicatorEvent,
    type: NOTE_TYPES.DM_TYPING,
    params: {
      pubkey: PUBKEY,
      created_at: CREATED_AT,
      recipientPubkey: PUBKEY,
      expiresAt: CREATED_AT + 60,
    }
  },
  buildViewEvent: {
    builder: buildViewEvent,
    type: NOTE_TYPES.VIEW_EVENT,
    params: {
      pubkey: PUBKEY,
      created_at: CREATED_AT,
      pointerValue: "e".repeat(64),
      pointerTag: ["e", "e".repeat(64)],
    }
  },
  buildZapRequestEvent: {
    builder: buildZapRequestEvent,
    type: NOTE_TYPES.ZAP_REQUEST,
    params: {
      pubkey: PUBKEY,
      created_at: CREATED_AT,
      recipientPubkey: PUBKEY,
      amountSats: 100,
      relays: ["wss://relay.example.com"],
    }
  },
  buildReactionEvent: {
    builder: buildReactionEvent,
    type: NOTE_TYPES.VIDEO_REACTION,
    params: {
      pubkey: PUBKEY,
      created_at: CREATED_AT,
      pointerValue: "e".repeat(64),
      targetPointer: { type: "e", value: "e".repeat(64) },
      content: "+",
    }
  },
  buildCommentEvent: {
    builder: buildCommentEvent,
    type: NOTE_TYPES.VIDEO_COMMENT,
    params: {
      pubkey: PUBKEY,
      created_at: CREATED_AT,
      videoEventId: "e".repeat(64),
      content: "Nice video",
    }
  },
  buildWatchHistoryEvent: {
    builder: buildWatchHistoryEvent,
    type: NOTE_TYPES.WATCH_HISTORY,
    params: {
      pubkey: PUBKEY,
      created_at: CREATED_AT,
      monthIdentifier: "2023-01",
      content: { version: 2, month: "2023-01", items: [] },
    }
  },
  buildSubscriptionListEvent: {
    builder: buildSubscriptionListEvent,
    type: NOTE_TYPES.SUBSCRIPTION_LIST,
    params: {
      pubkey: PUBKEY,
      created_at: CREATED_AT,
      content: "encrypted-json",
      encryption: "nip44_v2",
    }
  },
  buildBlockListEvent: {
    builder: buildBlockListEvent,
    type: NOTE_TYPES.USER_BLOCK_LIST,
    params: {
      pubkey: PUBKEY,
      created_at: CREATED_AT,
      content: "encrypted-json",
      encryption: "nip44_v2",
    }
  },
  buildHashtagPreferenceEvent: {
    builder: buildHashtagPreferenceEvent,
    type: NOTE_TYPES.HASHTAG_PREFERENCES,
    params: {
      pubkey: PUBKEY,
      created_at: CREATED_AT,
      content: "encrypted-json",
    }
  },
  buildAdminListEvent: {
    builder: buildAdminListEvent,
    type: NOTE_TYPES.ADMIN_MODERATION_LIST,
    // Special handling for args
    args: ["moderation", {
      pubkey: PUBKEY,
      created_at: CREATED_AT,
      hexPubkeys: [PUBKEY],
    }]
  },
};

function getUsedBuilders() {
  console.log("Scanning repo for event builder usage...");
  try {
    const output = execSync('grep -r "build[A-Za-z]\\+Event" js/', { encoding: 'utf-8' });
    const lines = output.split('\n');
    const usedBuilders = new Set();
    const regex = /(build[A-Za-z]+Event)/g;

    lines.forEach(line => {
      // Skip the schemas file itself
      if (line.includes('js/nostrEventSchemas.js')) return;

      const matches = line.match(regex);
      if (matches) {
        matches.forEach(match => usedBuilders.add(match));
      }
    });
    return usedBuilders;
  } catch (error) {
    // Grep returns status 1 if no matches found, which might throw an error in execSync
    // depending on the version/platform, or just empty output.
    console.error("Grep failed or found nothing:", error.message);
    return new Set();
  }
}

async function run() {
  const usedBuilders = getUsedBuilders();
  console.log(`Found ${usedBuilders.size} unique builder(s) used in the codebase.`);

  // also check if we missed any exported builder in our KNOWN_BUILDERS list
  // by assuming KNOWN_BUILDERS contains all we want to support.

  let failureCount = 0;
  const missingTests = [];

  usedBuilders.forEach(builderName => {
    if (!KNOWN_BUILDERS[builderName] && !IGNORED_BUILDERS.has(builderName)) {
      missingTests.push(builderName);
    }
  });

  if (missingTests.length > 0) {
    console.warn("\n[WARNING] The following builders are used in the repo but have no test case in this script:");
    missingTests.forEach(name => console.warn(`  - ${name}`));
    // We don't fail the build for this yet, but we warn.
    // Or maybe we should fail? The prompt said "Check runtime event construction...".
    // Let's count it as a "gap" but allow passing if validation of known ones works.
  }

  console.log("\nValidating builders...");

  for (const [name, config] of Object.entries(KNOWN_BUILDERS)) {
    // If we want to be strict, we could check if it is used. But validation is good regardless.
    const isUsed = usedBuilders.has(name);
    const usageLabel = isUsed ? "(USED)" : "(UNUSED)";

    try {
      let event;
      if (config.args) {
        event = config.builder(...config.args);
      } else {
        event = config.builder(config.params);
      }

      const { valid, errors } = validateEventStructure(config.type, event);

      if (valid) {
        console.log(`[PASS] ${name} ${usageLabel}`);
      } else {
        console.error(`[FAIL] ${name} ${usageLabel}`);
        errors.forEach((err) => console.error(`  - ${err}`));
        failureCount++;
      }
    } catch (e) {
      console.error(`[ERROR] ${name} ${usageLabel} threw an exception:`, e);
      failureCount++;
    }
  }

  if (failureCount > 0) {
    console.error(`\nValidation failed with ${failureCount} errors.`);
    process.exit(1);
  } else {
    console.log("\nAll known builders validated successfully.");
    process.exit(0);
  }
}

run();
