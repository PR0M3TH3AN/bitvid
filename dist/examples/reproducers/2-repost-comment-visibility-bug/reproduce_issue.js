import { __testExports } from "../../../js/nostr/commentEvents.js";
const { isVideoCommentEvent, normalizeCommentTarget } = __testExports;

/**
 * REPRODUCER: Repost Comment Visibility Bug
 *
 * ISSUE:
 * When a video is a repost (Kind 6), the UI may pass the Repost event's metadata
 * (kind: 6, author: reposter) along with the Original Video's ID to the comment service.
 *
 * `normalizeCommentTarget` uses this metadata to build a descriptor that expects comments
 * to tag the Repost event (Kind 6) and the Reposter.
 *
 * However, comments are typically made on the Original Video (Kind 30078), tagging the
 * Original Author and Original Kind.
 *
 * `isVideoCommentEvent` then filters out these valid comments because they don't match
 * the "expected" rootKind/rootAuthor (which are set to Repost details).
 *
 * EXPECTED BEHAVIOR:
 * Comments on the original video should be visible even when viewing the repost.
 * The descriptor should normalize to the Original Video's metadata if the ID belongs to it,
 * OR `isVideoCommentEvent` should be smart enough to handle this mismatch.
 */

// Mock Data
const originalVideoId =
  "0000000000000000000000000000000000000000000000000000000000000001";
const originalAuthor =
  "0000000000000000000000000000000000000000000000000000000000000002";
const originalKind = 30078;

const reposterPubkey =
  "0000000000000000000000000000000000000000000000000000000000000003";
const repostKind = 6;

// The Input provided by UI when viewing a Repost
// It incorrectly mixes Original ID with Repost Kind/Author in the current flow
const targetInput = {
  videoEventId: originalVideoId,
  videoKind: repostKind,
  videoAuthorPubkey: reposterPubkey
};

console.log("Input Target:", targetInput);

const descriptor = normalizeCommentTarget(targetInput);
console.log("Generated Descriptor:", JSON.stringify(descriptor, null, 2));

// A valid comment on the ORIGINAL video
const validCommentOnOriginal = {
  kind: 1111,
  tags: [
    ["e", originalVideoId, "wss://relay.example.com", "root"],
    ["K", String(originalKind)],
    ["P", originalAuthor]
  ]
};

console.log("Comment Event Tags:", validCommentOnOriginal.tags);

// Run the check
const isVisible = isVideoCommentEvent(validCommentOnOriginal, descriptor);
console.log(`\nIs Comment Visible? ${isVisible}`);

if (!isVisible) {
  console.error(
    "FAIL: Comment on original video is NOT visible when viewing repost."
  );
  process.exit(1);
} else {
  console.log("PASS: Comment on original video is visible.");
}
