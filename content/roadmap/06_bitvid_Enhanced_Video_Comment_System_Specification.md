# **bitvid: Enhanced Video Comment System Specification**

### **Objective**
To implement a decentralized comment system for videos shared on a Nostr-based platform, combining multiple NIPs to provide structured, interactive, and scalable functionality for video comments, reactions, live discussions, and metadata tagging.

---

### **Features**
1. **Post Comments**:
   - Users can post comments on videos.
   - Comments are associated with a specific video event using the `e` tag.

2. **Structured Threading**:
   - Comments support threading by referencing parent comments using NIP-27 conventions.
   - Threaded replies are visually nested.

3. **Reactions**:
   - Users can react to comments (e.g., upvote, downvote) using NIP-25.

4. **Live Discussions**:
   - Real-time public chat using NIP-28 for live video events.

5. **Optional Metadata**:
   - Extra metadata fields are included for user preferences or administrative tags using NIP-24.

6. **Real-Time Updates**:
   - Comments, reactions, and live chats update in real-time using Nostr subscriptions.

7. **Moderation**:
   - Support for flagging or hiding inappropriate comments.

8. **Privacy**:
   - Encrypted comments for private videos (optional).

---

### **Technical Specifications**

#### **1. Event Structure**
Each component (comments, reactions, live chat) is represented as a Nostr event.

##### **Comment Event**:
bitvid uses standard kind `1` text note replies so they interoperate with the moderation flows documented in [`docs/moderation/nips.md`](../../docs/moderation/nips.md). Each reply keeps both the video event ID and the root video definition tag so downstream services can resolve lineage.

```json
{
    "kind": 1,
    "pubkey": "abcdef1234567890...",
    "created_at": 1675000000,
    "tags": [
        ["e", "video-event-id"], // Reference to the specific video event
        ["a", "30078:video-author-pubkey:video-root-id"], // Reference to the video definition (kind 30078)
        ["e", "parent-comment-id"], // Optional: reference to the parent comment for replies
        ["p", "commenter-pubkey"] // Optional: commenter or video author pubkey for threading UX
    ],
    "content": "This is a great video!"
}
```

##### **Reaction Event**:
```json
{
    "kind": 7,
    "pubkey": "abcdef1234567890...",
    "created_at": 1675000000,
    "tags": [
        ["e", "comment-event-id"], // Reference to the comment being reacted to
        ["p", "reactor-pubkey"]
    ],
    "content": "+" // + for upvote, - for downvote
}
```

##### **Live Chat Event**:
```json
{
    "kind": 42,
    "pubkey": "abcdef1234567890...",
    "created_at": 1675000000,
    "tags": [
        ["e", "video-event-id"], // Reference to the live video
        ["p", "participant-pubkey"]
    ],
    "content": "What a great discussion!"
}
```

##### **Metadata (Optional)**:
Metadata tags are added to comments or live chat events as needed:
```json
{
    "kind": 1,
    "pubkey": "abcdef1234567890...",
    "created_at": 1675000000,
    "tags": [
        ["e", "video-event-id"],
        ["a", "30078:video-author-pubkey:video-root-id"],
        ["m", "featured-comment"], // Example metadata tag
        ["m", "admin-tag"] // Administrative tag
    ],
    "content": "Highlighted comment for this video."
}
```

---

### **Implementation Details**

#### **1. Posting a Comment**
To post a comment:
1. The client constructs a kind `1` comment event using NIP-22 for `created_at` validation.
2. The event includes both the `['e', <videoEventId>]` and `['a', <30078:pubkey:videoRootId>]` tags (mandatory) plus parent comment references when replying. This mirrors the implementation in `js/services/discussionCountService.js` so reply counts and moderation filters remain aligned.
3. The event is signed and published to relays.

##### API Example:
```javascript
async function postComment(
    { videoEventId, videoAuthorPubkey, videoRootId },
    commentText,
    parentCommentId = null
) {
    const event = {
        kind: 1,
        pubkey: userPubkey,
        created_at: Math.floor(Date.now() / 1000),
        tags: [
            ['e', videoEventId],
            ['a', `30078:${videoAuthorPubkey}:${videoRootId}`],
            ...(parentCommentId ? [['e', parentCommentId]] : []),
        ],
        content: commentText
    };

    const signedEvent = await nostrClient.signEvent(event);
    await nostrClient.pool.publish(nostrClient.relays, signedEvent);
}
```

#### **2. Reacting to a Comment**
Reactions use NIP-25.

##### API Example:
```javascript
async function reactToComment(commentId, reaction) {
    const event = {
        kind: 7,
        pubkey: userPubkey,
        created_at: Math.floor(Date.now() / 1000),
        tags: [['e', commentId]],
        content: reaction // Use "+" for upvote, "-" for downvote
    };

    const signedEvent = await nostrClient.signEvent(event);
    await nostrClient.pool.publish(nostrClient.relays, signedEvent);
}
```

#### **3. Fetching Comments**
Comments are retrieved using `REQ` messages filtered by the `e` tag for the video’s event ID and optionally by parent comment IDs for threading.

##### API Example:
```javascript
async function fetchComments({ videoEventId, videoAuthorPubkey, videoRootId }) {
    const filter = {
        kinds: [1],
        '#e': [videoEventId],
        '#a': [`30078:${videoAuthorPubkey}:${videoRootId}`],
        limit: 100
    };

    const comments = await nostrClient.pool.list(nostrClient.relays, [filter]);
    return comments.sort((a, b) => a.created_at - b.created_at);
}
```

#### **4. Live Chat for Live Videos**
Real-time public chats for live videos use NIP-28.

##### API Example:
```javascript
function subscribeToLiveChat(videoId) {
    const sub = nostrClient.pool.sub(nostrClient.relays, [
        {
            kinds: [42],
            '#e': [videoId]
        }
    ]);

    sub.on('event', event => {
        console.log('New chat message:', event);
    });
}
```

#### **5. Metadata Integration**
Use NIP-24 to attach metadata to events for administrative or user-specific tags.

---

### **Data Flow**
1. **Posting a Comment**:
   - User creates a comment event.
   - Client signs and publishes the event to relays.
2. **Fetching Comments**:
   - Client requests comments for a video by filtering events with the combined `#e` and `#a` tags so both the specific video event and its root definition are represented.
3. **Reacting to Comments**:
   - Users react to comments by posting reaction events.
4. **Live Discussions**:
   - Live chat messages are sent and received in real-time using NIP-28.
5. **Metadata Management**:
   - Metadata is attached during event creation or editing.

> **Tagging Requirement:** Clients must keep the combined `#e`/`#a` tagging pattern shown above. `discussionCountService.buildDiscussionCountFilters` depends on those tags when querying relays so UI components can surface accurate comment totals.

---

### **UI/UX Considerations**

1. **Comment Form**:
   - Input field for comments.
   - Button to post comments.
   - Optional reply button for threaded comments.

2. **Reactions**:
   - Upvote and downvote icons next to each comment.
   - Display reaction counts dynamically.

3. **Live Chat**:
   - Real-time message updates below live videos.
   - Highlight important messages using metadata tags.

4. **Nested Threading**:
   - Indent replies to show comment hierarchy.

5. **Comment Gate**:
   - UI components such as `VideoCard.buildDiscussionCount` already hide comment affordances when `enableComments` is false. Future enhancements must honor the same feature flag so comment entry points remain consistent with existing gating.

---

### **Testing and Validation**

1. Validate:
   - Posting, retrieving, and displaying threaded comments.
   - Reactions and live chat events.
   - Metadata tagging.
2. Test:
   - Pagination for large comment threads.
   - Performance under high comment or chat volume.
3. Simulate:
   - Various timestamp scenarios to ensure NIP-22 compliance.

---

### **Benefits**
- Decentralized and censorship-resistant.
- Fully interoperable with other Nostr clients and relays.
- Extensible with reactions, live discussions, and metadata features.

