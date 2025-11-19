
import { __testExports } from "./js/nostr/commentEvents.js";
const { isVideoCommentEvent, normalizeCommentTarget } = __testExports;

const originalVideoId = "0000000000000000000000000000000000000000000000000000000000000001";
const originalAuthor = "0000000000000000000000000000000000000000000000000000000000000002";
const originalKind = "30078";

const reposterPubkey = "0000000000000000000000000000000000000000000000000000000000000003";
const repostKind = "6";

// Scenario: UI passes the Repost event as the "video"
const targetInput = {
    videoEventId: originalVideoId, // The ID is usually the original ID even in reposts? No, repost has its own ID.
    // But CommentThreadService uses video.id.
    // If video is Repost, video.id is Repost ID.
    // But comments are on Original ID.
    // So if video.id is Repost ID, then we are fetching comments for the Repost ID!
    // And the comment event tags the Repost ID? No, it tags the Original ID.
    // So we wouldn't even FETCH the comments if we used Repost ID.

    // Wait, if loadThread is called with Repost object, videoEventId = Repost ID.
    // fetchThread queries for #e = Repost ID.
    // But comments are on Original ID.
    // So we get NO comments.

    // So the issue is even earlier: we are querying for the wrong ID.

    // BUT, assuming we somehow got the comment (maybe via legacy #e tag pointing to Repost?), 
    // let's see if it passes filter.

    // Let's assume the UI unwraps the ID but passes the Repost Kind/Pubkey?
    // If video.id is Original ID, but video.kind is 6 (Repost Kind) and video.pubkey is Reposter.

    videoEventId: originalVideoId,
    videoKind: repostKind,
    videoAuthorPubkey: reposterPubkey,
};

const descriptor = normalizeCommentTarget(targetInput);

console.log("Descriptor:", JSON.stringify(descriptor, null, 2));

const validCommentOnOriginal = {
    kind: 1111,
    tags: [
        ["e", originalVideoId, "wss://relay.example.com", "root"],
        ["K", originalKind],
        ["P", originalAuthor],
    ],
};

console.log("Testing Valid Comment on Original (against Repost metadata):", isVideoCommentEvent(validCommentOnOriginal, descriptor));
