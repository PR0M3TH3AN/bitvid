# Upgrade: nostr-tools

**Current Version:** 2.19.4
**Target Version:** 2.23.0
**Risk Level:** High (Protocol/Crypto)

## Status
Blocked by policy: "Do not upgrade cryptographic or protocol libraries without manual review".

## Plan
1.  Review changelog for breaking changes between 2.19.4 and 2.23.0.
2.  Verify NIP implementation compatibility.
3.  Test heavily against all Nostr interactions (signing, publishing, relay pools).
4.  Check for any API changes in `SimplePool` or `finalizeEvent`.

## Action Required
Manual review and testing required before upgrade.
