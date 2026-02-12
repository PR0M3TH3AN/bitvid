# Upgrade Proposal: `nostr-tools` (v2.19.4 -> v2.23.0)

**Status:** `REVIEW-REQUIRED` (Protocol Library)
**Priority:** High (Security/Protocol Compliance)

## Context
`nostr-tools` is the core protocol library for bitvid. `AGENTS.md` explicitly forbids automatic upgrades for crypto/protocol libraries.

## Version Changes
- **Current:** `2.19.4`
- **Target:** `2.23.0`
- **Changelog:** [Link to nostr-tools releases](https://github.com/nbd-wtf/nostr-tools/releases)
  - Contains updates to NIP-44 encryption/decryption? (Check changelog)
  - Contains updates to NIP-01 signatures?

## Risk Assessment
- **High Risk:** Changes to signing or encryption could break user logins or private messaging (NIP-04/NIP-44).
- **Compliance:** Must ensure `nip04_44_compliance.test.mjs` passes.

## Test Plan
1. **Unit Tests:** Run `npm run test:unit`.
2. **Compliance Tests:** Explicitly run `node scripts/run-targeted-tests.mjs tests/compliance/nip04_44_compliance.test.mjs`.
3. **E2E Tests:** Verify login flow and DM flow.
4. **Manual QA:**
   - Log in with NIP-07 extension.
   - Send/Receive DM.
   - Publish video event.

## Action Items
- [ ] Create branch `chore/upgrade-nostr-tools`
- [ ] Bump version.
- [ ] Run full test suite.
- [ ] Review changelog for breaking changes in `SimplePool` or `finalizeEvent`.
- [ ] Request maintainer review.
