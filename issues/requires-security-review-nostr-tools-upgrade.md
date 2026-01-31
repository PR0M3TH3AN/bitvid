# Security Review: Upgrade nostr-tools to 2.19.4

## Issue
There is a version mismatch between the declared dependency in `package.json` and the runtime import in the browser.

- **`package.json`**: `"nostr-tools": "^2.19.4"`
- **`js/nostrToolsBootstrap.js`**: Hardcodes `2.17.0` from `esm.sh` and `jsdelivr`.

## Symptoms
The browser console logs numerous errors from relays indicating invalid commands:
```
console:debug: NOTICE from wss://relay.damus.io/: ERROR: bad msg: unknown cmd @ https://esm.sh/nostr-tools@2.17.0/es2022/nostr-tools.mjs:1
console:debug: NOTICE from wss://relay.primal.net/: ERROR: bad msg: unknown cmd @ https://esm.sh/nostr-tools@2.17.0/es2022/nostr-tools.mjs:1
```
This suggests that the client (running `2.17.0`) might be constructing messages (e.g. NIP-45 `COUNT` or others) in a way that is incompatible with the relays or missing protocol updates present in `2.19.4`.

## Policy
`AGENTS.md` states:
> Upgrades to cryptographic or protocol libraries (specifically `nostr-tools`) are restricted and require manual review; automatic upgrades are prohibited to prevent breaking NIP implementations.

## Action Required
A manual security review is required to update `js/nostrToolsBootstrap.js` to match the version in `package.json` (`2.19.4`).

## Secondary Finding
The following resource fails to load (404):
```
https://pub-ca50f43da1364bf6a552b90443fcdc64.r2.dev/bitvid-logo-loop.mp4
```
This appears to be a missing content asset.
