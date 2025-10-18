# QA & Test Vectors (Moderation)

## Quick checklist
- [ ] F1 set cached and used for “trusted reports”.
  - Automated coverage: `tests/moderation/trusted-report-count.test.mjs` (run via `npm run test:unit`).
- [ ] Blur at ≥3 F1 reports of `nudity`; autoplay blocked at ≥2.
  - Automated coverage: `tests/visual/moderation.spec.ts` blur and autoplay scenarios (run via `npm run test:visual`).
- [ ] “Show anyway” works and records only local pref.
  - Automated coverage: `tests/visual/moderation.spec.ts` show-anyway persistence scenario (run via `npm run test:visual`).
- [ ] Mute list (10000) downranks/hides consistently.
  - Manual: subscribe to fixture B and verify muted author disappears from feeds after refresh.
- [ ] Admin lists (30000) take effect only when subscribed.
  - Manual: load fixture C, toggle subscription, and confirm the hard-hide only applies while subscribed.
- [ ] COUNT fallback shows placeholders and doesn’t crash UI.
  - Manual: point the client at a relay without COUNT support and confirm placeholders render instead of errors.
- [ ] Comment threads render with NIP-10; moderation badges show in context.
  - Manual: open a reported thread and confirm badges + reply ordering remain intact.
- [ ] Reports from muted reporters are ignored.
  - Automated coverage: `tests/moderation/trusted-report-count.test.mjs` (muted reporter case).

## Fixtures (create on test relays / served in `/docs/moderation/fixtures/`)

### A) NIP-56 report events
Create three distinct F1 reporter keys; each sends:

```json
{
  "kind": 1984,
  "tags": [
    ["e", "<VIDEO_EVENT_ID>", "nudity"],
    ["p", "<AUTHOR_PUBKEY>"]
  ],
  "content": "test: thumbnail too revealing"
}
```

Expected:

* After 1 report → no blur; autoplay allowed.
* After 2 reports → autoplay blocked.
* After 3 reports → thumbnail blurred; reason chip shown.

### B) Mute list (10000)

```json
{
  "kind": 10000,
  "tags": [
    ["p", "<AUTHOR_PUBKEY>"]
  ]
}
```

Expected: author’s items are downranked/hidden for this viewer.

### C) Admin blacklist (30000)

```json
{
  "kind": 30000,
  "tags": [
    ["d", "bitvid:admin:blacklist"],
    ["p", "<AUTHOR_PUBKEY>"]
  ]
}
```

Expected: when viewer subscribes to this list, author is hard-hidden.

### D) COUNT fallback

* Use a relay that doesn’t support COUNT.
* Verify “—” placeholders; no spinner loops; no crashes.

## Automated checks (suggested)

* `npm run test:unit` — covers `tests/moderation/trusted-report-count.test.mjs` for deduping and mute handling.
* `npm run test:visual` — runs Playwright fixtures in `tests/visual/moderation.spec.ts` against `/docs/moderation/fixtures/index.html`.
* Integration test: emit events over a local relay; assert UI state.
* Regression test: ensure Home feed ignores reputation gating.
