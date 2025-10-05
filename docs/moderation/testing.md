# QA & Test Vectors (Moderation)

## Quick checklist
- [ ] F1 set cached and used for “trusted reports”.
- [ ] Blur at ≥3 F1 reports of `nudity`; autoplay blocked at ≥2.
- [ ] “Show anyway” works and records only local pref.
- [ ] Mute list (10000) downranks/hides consistently.
- [ ] Admin lists (30000) take effect only when subscribed.
- [ ] COUNT fallback shows placeholders and doesn’t crash UI.
- [ ] Comment threads render with NIP-10; moderation badges show in context.
- [ ] Reports from muted reporters are ignored.

## Fixtures (create on test relays)

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

* Unit test `trustedReportCount`.
* Integration test: emit events over a local relay; assert UI state.
* Regression test: ensure Home feed ignores reputation gating.
