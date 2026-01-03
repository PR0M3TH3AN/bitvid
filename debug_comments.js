
import { __testExports } from "./js/nostr/commentEvents.js";
const { isVideoCommentEvent, normalizeCommentTarget } = __testExports;
import { devLogger, userLogger } from "./js/utils/logger.js";

// Logger mocking removed

const videoEventId = "0000000000000000000000000000000000000000000000000000000000000001";
const rootKind = "30078";
const rootAuthor = "0000000000000000000000000000000000000000000000000000000000000002";

const targetInput = {
    videoEventId,
    videoKind: rootKind,
    videoAuthorPubkey: rootAuthor,
};

const descriptor = normalizeCommentTarget(targetInput);

console.log("Descriptor:", JSON.stringify(descriptor, null, 2));

const validEvent = {
    kind: 1111,
    tags: [
        ["e", videoEventId, "wss://relay.example.com", "root"],
        ["K", rootKind],
        ["P", rootAuthor],
    ],
};

const missingKTagEvent = {
    kind: 1111,
    tags: [
        ["e", videoEventId, "wss://relay.example.com", "root"],
        ["P", rootAuthor],
    ],
};

const mismatchKTagEvent = {
    kind: 1111,
    tags: [
        ["e", videoEventId, "wss://relay.example.com", "root"],
        ["K", "12345"], // Wrong kind
        ["P", rootAuthor],
    ],
};

const legacyEvent = {
    kind: 1,
    tags: [
        ["e", videoEventId, "wss://relay.example.com", "root"],
    ],
};

console.log("Testing Valid Event:", isVideoCommentEvent(validEvent, descriptor));
console.log("Testing Missing K Tag Event:", isVideoCommentEvent(missingKTagEvent, descriptor));
console.log("Testing Mismatch K Tag Event:", isVideoCommentEvent(mismatchKTagEvent, descriptor));
console.log("Testing Legacy Event:", isVideoCommentEvent(legacyEvent, descriptor));
