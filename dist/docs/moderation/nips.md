# NIPs bitvid uses (Moderation-Relevant)

## Required
- **NIP-56 — Reporting**
  `kind 1984` events with a `type` tag such as `nudity`, `spam`, `illegal`, `impersonation`, `malware`, `profanity`, `other`.
  Client may act on **reports from friends** (our trusted set).

- **NIP-51 — Lists**
  - `10000` mute list (authors to mute).
  - `30000` categorized people (used for admin/curation lists).
  - `30001` bookmarks (not moderation, but used elsewhere).

- **NIP-10 — Replies & Mentions**
  Threading for comments; moderation badges appear in the thread UI.

## Recommended
- **NIP-45 — COUNT**
  Event counts; we use it opportunistically for faster totals with graceful fallback.

## Nice-to-have
- **NIP-36 — Sensitive Content / Content Warning**
  If present, we pre-blur content even without reports; user can “show anyway”.
