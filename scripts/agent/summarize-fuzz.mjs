import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ARTIFACTS_DIR = path.resolve(__dirname, "../../artifacts");

const TARGETS = {
  nostrEventSchemas: [
    "sanitizeAdditionalTags",
    "validateEventStructure",
    "buildVideoPostEvent",
    "buildHttpAuthEvent",
    "buildReportEvent",
    "buildGiftWrapEvent",
    "buildSealEvent",
    "buildChatMessageEvent",
    "buildVideoMirrorEvent",
    "buildRepostEvent",
    "buildShareEvent",
    "buildRelayListEvent",
    "buildDmRelayListEvent",
    "buildProfileMetadataEvent",
    "buildMuteListEvent",
    "buildDeletionEvent",
    "buildLegacyDirectMessageEvent",
    "buildDmAttachmentEvent",
    "buildDmReadReceiptEvent",
    "buildDmTypingIndicatorEvent",
    "buildViewEvent",
    "buildZapRequestEvent",
    "buildReactionEvent",
    "buildCommentEvent",
    "buildWatchHistoryEvent",
    "buildSubscriptionListEvent",
    "buildBlockListEvent",
    "buildHashtagPreferenceEvent",
    "buildAdminListEvent",
  ],
  dmDecryptor: ["decryptDM"],
  magnetUtils: [
    "safeDecodeMagnet",
    "extractBtihFromMagnet",
    "normalizeInfoHash",
    "normalizeAndAugmentMagnet",
  ],
};

function main() {
  for (const [target, functions] of Object.entries(TARGETS)) {
    const summary = {
      target,
      totalFailures: 0,
      details: {},
    };

    for (const fn of functions) {
      const reportFile = path.join(ARTIFACTS_DIR, `fuzz-report-${fn}.json`);
      if (fs.existsSync(reportFile)) {
        try {
          const data = JSON.parse(fs.readFileSync(reportFile, "utf8"));
          summary.details[fn] = data;
          summary.totalFailures += data.length;
        } catch (e) {
          console.error(`Failed to read report for ${fn}:`, e);
        }
      }
    }

    const summaryPath = path.join(ARTIFACTS_DIR, `fuzz-report-${target}.json`);
    fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
    console.log(`Generated summary for ${target} at ${summaryPath}`);
  }
}

main();
