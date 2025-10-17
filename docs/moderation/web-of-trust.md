# Web-of-Trust Policy (bitvid)

## Graph terms
- **F1 (friends)**: pubkeys you follow.
- **F2**: friends-of-friends (off by default for Home; allowed for Discovery).
- **Trusted report**: a NIP-56 report from an F1 account.

## Signals we use
- NIP-56 reports by type (`nudity`, `spam`, `illegal`, `impersonation`, etc.).
- NIP-51 lists:
  - 10000 mute list → downrank/hide author content.
  - 30000 categorized people → optional admin lists (see below).
- (Optional) reputation score from a reputation source (e.g., PageRank/DVM) for **Discovery** only.

## Default thresholds (can be tuned)
- `blurThumbnail = trustedReportCount(event,'nudity') >= 3`
- `hideAutoplay = trustedReportCount(event,'nudity') >= 2`
- `downrankIfMutedByF1 = true`

### Why these numbers?
- F1-only reports resist Sybil attacks.
- Blur is reversible; hiding autoplay reduces accidental exposure.

## Admin lists (opt-in)
- We recognize curated lists using `30000` events:
  - `['d','bitvid:admin:blacklist']` → hard-hide when subscribed.
  - `['d','bitvid:admin:whitelist']` → always show in Discovery.
  - `['d','bitvid:admin:editors']` → trusted channel editors.
- Users can subscribe/unsubscribe any time.

### Decision precedence

1. **Personal blocks win first.** If a viewer blocks an author or reporter, we ignore their content and reports regardless of admin lists.
2. **Admin blacklist applies next.** Entries on `bitvid:admin:blacklist` are hard-hidden and their reports suppressed before looking at thresholds.
3. **F1 thresholds run last.** Blur/autoplay gating only evaluates trusted-report counts after personal blocks and admin blacklists. Admin whitelists may bypass Discovery gating, but never override a viewer block.

## Pseudocode

```ts
type Hex = string;

interface Report {
  reporter: Hex; // F1 must include this key
  type: 'nudity'|'spam'|'illegal'|'impersonation'|'malware'|'profanity'|'other';
  targetEvent: string;
}

function trustedReportCount(eventId: string, type: Report['type'], viewerFollows: Set<Hex>, reports: Report[]): number {
  return reports.filter(r => r.targetEvent === eventId && r.type === type && viewerFollows.has(r.reporter)).length;
}

function shouldBlurThumb(eventId: string, ctx: Ctx): boolean {
  return trustedReportCount(eventId, 'nudity', ctx.viewerFollows, ctx.reports) >= 3;
}

function shouldHideAutoplay(eventId: string, ctx: Ctx): boolean {
  return trustedReportCount(eventId, 'nudity', ctx.viewerFollows, ctx.reports) >= 2;
}
```

## UI rules

* Always show a reason chip: e.g., `Blurred · 3 friends reported “nudity” · Show anyway`.
* Respect per-viewer choices (global off, per-channel off).
* Never bury the override.

## Discovery (optional reputation)

* Home feed: **never** gated by reputation.
* Discovery/Trending: may require a minimum score (pluggable `ReputationSource`).
* Keep a toggle in Settings to disable reputation gating.

```ts
interface ReputationSource {
  // returns 0..1 rank per pubkey for a given perspective
  rank(pubkeys: Hex[], perspective?: Hex): Promise<Record<Hex, number>>;
}
```

## Anti-abuse hardening

* Count unique F1 reporters only (dedupe by pubkey).
* Minimum account age or minimum “being-followed” count for reporters (optional).
* Rate-limit rapid report bursts per reporter.
* Ignore reports from muted or blocked reporters.
