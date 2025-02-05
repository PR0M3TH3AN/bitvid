# **bitvid: Enhanced Block, Subscription, and Reporting Specification**

This document describes how to implement **Block Lists**, **Subscription Lists**, and **Reporting** (NIP-56) for a Nostr-based video platform such as bitvid. It covers how users can manage their own moderation tools and how the platform can apply additional checks.

---

## Table of Contents

1. [Subscription List Specification](#subscription-list-specification)  
   1.1 [Purpose](#purpose)  
   1.2 [Event Kind](#event-kind)  
   1.3 [JSON Structure](#json-structure)  
   1.4 [Example](#example)  
   1.5 [Features](#features)  

2. [Block List Specification](#block-list-specification)  
   2.1 [Purpose](#purpose-1)  
   2.2 [Event Kind](#event-kind-1)  
   2.3 [JSON Structure](#json-structure-1)  
   2.4 [Examples](#examples)  
   2.5 [Features](#features-1)  

3. [Reporting with NIP-56](#reporting-with-nip-56)  
   3.1 [Overview](#overview)  
   3.2 [Report Types](#report-types)  
   3.3 [Example Events](#example-events)  
   3.4 [Client and Relay Behavior](#client-and-relay-behavior)  

4. [Implementation Details](#implementation-details)  
   4.1 [Replaceable Events](#replaceable-events)  
   4.2 [Encryption](#encryption)  
   4.3 [Fetching User Lists](#fetching-user-lists)  
   4.4 [Pushing Updates to Relays](#pushing-updates-to-relays)  

5. [UI Integration](#ui-integration)  
   5.1 [Subscription Management](#subscription-management)  
   5.2 [Block Management](#block-management)  
   5.3 [Report Management](#report-management)  

6. [Future Considerations](#future-considerations)

---

## Subscription List Specification

### Purpose
A **Subscription List** lets users follow video creators independently of their main “following” list on Nostr. It supports categorization and can be made private via encryption.

### Event Kind
- **Kind**: `30002`  
- **Description**: “Video Subscription List” (inspired by NIP-51 but for custom lists)

### JSON Structure
**Public Tags**  
- `["p", <pubkey>]`: Public keys of creators to follow  
- `["t", <category>]`: Optional categories (e.g., “comedy,” “music”)

**Private Tags**  
- Encrypted list of subscriptions using NIP-04

**Metadata**  
- Additional information like category names, custom labels, etc.

### Example
```json
{
  "kind": 30002,
  "tags": [
    ["d", "favorite-creators"],
    ["p", "npub1creator1pubkey"],
    ["p", "npub1creator2pubkey"],
    ["t", "comedy"],
    ["t", "science"]
  ],
  "content": "Encrypted list content for private subscriptions",
  "created_at": 1735689600,
  "pubkey": "your-public-key",
  "id": "event-id"
}
```

### Features
1. **Categorization**  
   Users can group subscribed creators by genres or topics.
2. **Privacy Options**  
   Private subscriptions can be hidden by encrypting tags.
3. **Replaceable Event**  
   Users can update their list by publishing a new event with the same `d` tag (e.g., `["d","favorite-creators"]`) and a later `created_at`.

---

## Block List Specification

### Purpose
A **Block List** gives users the ability to mute or block specific creators or users. It supports both public reasons (tags) and private reasons (encrypted content).

### Event Kind
- **Kind**: `10001`  
- **Description**: “Block or Mute List” (per NIP-51)

### JSON Structure
**Public Tags**  
- `["p", <pubkey>]`: Public keys of blocked users  
- `["r", <reason>]`: Optional reasons (spam, harassment, etc.)

**Private Tags**  
- Encrypted details for blocking, using NIP-04

### Examples

#### Public Block List
```json
{
  "kind": 10001,
  "tags": [
    ["p", "npub1blockeduser1pubkey", "reason", "spam"],
    ["p", "npub1blockeduser2pubkey", "reason", "harassment"]
  ],
  "content": "",
  "created_at": 1735689600,
  "pubkey": "your-public-key",
  "id": "event-id"
}
```

#### Private Block List
```json
{
  "kind": 10001,
  "tags": [
    ["p", "npub1blockeduser1pubkey"],
    ["p", "npub1blockeduser2pubkey"]
  ],
  "content": "Encrypted reasons for blocking (e.g., personal dispute info)",
  "created_at": 1735689600,
  "pubkey": "your-public-key",
  "id": "event-id"
}
```

### Features
1. **Integration**  
   - Offer a “Block/Unblock” button in the UI.
   - Provide a page to manage blocks.
2. **Filtering**  
   - Automatically exclude blocked users from feed results.
3. **Categorization**  
   - Tag reasons for blocking, such as spam or harassment.
4. **Privacy Options**  
   - Keep certain block reasons encrypted if needed.

---

## Reporting with NIP-56

### Overview
NIP-56 introduces a **kind `1984`** event that flags content or profiles as objectionable. It’s a flexible way to let users or relays see reports and decide on any actions.

### Report Types
The `p` tag references a pubkey, and the `e` tag references a note. The third element of the tag can be:
- `nudity`
- `malware`
- `profanity`
- `illegal`
- `spam`
- `impersonation`
- `other`

### Example Events

```jsonc
// Reporting a user for nudity
{
  "kind": 1984,
  "tags": [
    ["p", "<pubkey>", "nudity"]
  ],
  "content": "Optional comment or additional info.",
  "created_at": 1735689600,
  "pubkey": "your-public-key",
  "id": "report-event-id"
}

// Reporting a note as illegal
{
  "kind": 1984,
  "tags": [
    ["e", "<eventId>", "illegal"],
    ["p", "<pubkey>"]
  ],
  "content": "User is breaking local laws.",
  "created_at": 1735689600,
  "pubkey": "your-public-key",
  "id": "report-event-id"
}
```

### Client and Relay Behavior
- **Clients**  
  - May choose to highlight or hide reported notes if enough trusted users report them.
  - Could display “flagged content” warnings based on the user’s web-of-trust.
- **Relays**  
  - Not mandated to do anything automatically.
  - An admin could manually block content if a trusted source files many valid reports.

---

## Implementation Details

### Replaceable Events
- **Subscription Lists** (`30002`) and **Block Lists** (`10001`) can be implemented as replaceable events by using a deterministic `d` tag.  
- For example, `["d","my-blocklist"]` ensures older events with the same `d` are replaced when new ones arrive.

### Encryption
- Use [NIP-04](https://github.com/nostr-protocol/nips/blob/master/04.md) for any private or sensitive data in `content` or tags.
- Public reasons for blocking or reporting can remain in tags or clear text.

### Fetching User Lists
1. **On Login**  
   - Query each relay for events matching:
     ```jsonc
     {
       "kinds": [10001, 30002],
       "authors": [<user-pubkey>]
     }
     ```
   - Merge and deduplicate block/subscription lists from the resulting events.
2. **Processing**  
   - For blocklists, unify all “p” tags into a single set of blocked pubkeys.
   - For subscriptions, unify “p” tags or categories if the user merges multiple lists.

### Pushing Updates to Relays
1. **Create Event**  
   - Include kind, pubkey, timestamp, tags, and optional content.
2. **Sign Event**  
   - Use `window.nostr.signEvent` or your own signing library.
3. **Publish**  
   - Send the signed event to each configured relay.  
   - Example in pseudocode:
     ```javascript
     const signedEvent = await signEvent(myEvent);
     for (const relay of relays) {
       pool.publish([relay], signedEvent);
     }
     ```

---

## UI Integration

### Subscription Management
- **List View**  
  - Show subscribed creators with categories if applicable.
- **Add/Remove**  
  - Allow users to add an `npub` to their list.
  - Save as a new replaceable event.

### Block Management
- **Block/Unblock Button**  
  - Quick action to add or remove a pubkey from the user’s blocklist.
- **Blocklist Editor**  
  - Display current blocks.  
  - Optionally show reasons (public or private).  
  - Publish changes via a new replaceable event.

### Report Management
- **Report Button**  
  - Attached to each video or note.  
  - Triggers a “kind:1984” event with the chosen category (spam, nudity, etc.).
- **Displaying Reports**  
  - Optionally show how many “trusted friends” have reported a user/note.
  - Let users decide whether to hide or blur content with certain flags.

---

## Future Considerations
1. **Paid Subscriptions**  
   - Could layer subscription tiers on top of `30002` events.
2. **Global Block Lists**  
   - Let users publish or subscribe to a curated blocklist (or share one in a group).
3. **Web of Trust**  
   - Filter reports based on which reporters a user trusts.

---

### Summary
By leveraging Nostr event kinds (`30002` for subscriptions, `10001` for blocks, and `1984` for reports), bitvid can maintain a decentralized, user-controlled moderation system. Users can sync their lists across devices through relays, while administrators can choose how to handle flagged content on a platform level. This approach keeps moderation flexible and transparent.
