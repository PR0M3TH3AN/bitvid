# Release Notes

## 2025-11-04

- **WebTorrent tracker refresh:** Updated the default browser-safe tracker pool in
  [`js/constants.js`](../js/constants.js) to swap out the failing `tracker.fastcast.nz`,
  `tracker.webtorrent.dev`, and `tracker.sloppyta.co` endpoints. The new roster is:
  `wss://tracker.openwebtorrent.com`, `wss://tracker.ghostchu-services.top:443/announce`,
  `wss://tracker.files.fm:7073/announce`, `wss://tracker.dler.org:443/announce`,
  `wss://tracker.btorrent.xyz`, and `wss://tracker.novage.com.ua:443/announce`. Operators
  who override the runtime `WSS_TRACKERS` flag should update their configs to match so
  magnet fallback continues to connect without churn.
