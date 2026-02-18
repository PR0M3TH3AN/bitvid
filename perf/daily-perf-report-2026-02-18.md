# Daily Performance Report - 2026-02-18

## Summary
Total Hits: 1303

### Hits by Pattern
- Nostr/Relay/Auth: 257
- Promise Concurrency: 66
- WebTorrent: 771
- Timeouts/Intervals: 153
- Visibility: 19
- Workers: 37

## Top Files by Activity
- js/webtorrent.js: 100 hits
- js/services/playbackService.js: 76 hits
- js/app.js: 72 hits
- js/app/playbackCoordinator.js: 71 hits
- js/ui/components/UploadModal.js: 64 hits
- js/app/authSessionCoordinator.js: 47 hits
- js/ui/components/VideoCard.js: 34 hits
- js/ui/applicationBootstrap.js: 31 hits
- js/ui/components/EditModal.js: 30 hits
- js/nostr/client.js: 28 hits

## Potential P0/P1 Candidates (Sample)
These locations involve concurrency or heavy relay operations:

- **js/adminListStore.js:567** (Nostr/Relay/Auth): `events = await nostrClient.pool.list(relays, [normalizedFilter]);`
- **js/app.js:2828** (Nostr/Relay/Auth): `if (!nostrClient?.pool || typeof nostrClient.pool.list !== "function") {`
- **js/app.js:2833** (Nostr/Relay/Auth): `const events = await nostrClient.pool.list(relayList, [`
- **js/channelProfile.js:5402** (Nostr/Relay/Auth): `const fallbackEvents = await nostrClient.pool.list(`
- **js/channelProfile.js:5415** (Nostr/Relay/Auth): `(url) => nostrClient.pool.list([url], [filter]),`
- **js/dmDecryptor.js:456** (Promise Concurrency): `return await Promise.any(decryptors.map(attemptUnwrap));`
- **js/embed.js:274** (Nostr/Relay/Auth): `const events = await pool.list(relayList, [filter]);`
- **js/embed.js:282** (Nostr/Relay/Auth): `devLogger.warn("[embed] Failed to fetch naddr via pool.list:", error);`
- **js/feedEngine/watchHistoryFeed.js:406** (Nostr/Relay/Auth): `const events = await nostrClient.pool.list(mergedRelays, filters);`
- **js/feedEngine/watchHistoryFeed.js:514** (Nostr/Relay/Auth): `const events = await nostrClient.pool.list(relays, [filter]);`

## Actions Taken
- Ran search patterns and generated inventory.
- No automatic fixes applied in this run.
