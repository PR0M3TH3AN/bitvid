# Angular UI Grid and ng-notify Audit

The legacy `BTorrent` Angular module relied on `angular-ui-grid` for active torrent layout and `ng-notify` for toast notifications. The following table summarizes the features we must preserve while removing inline-style dependencies.

| Area | Feature | Inline style dependency | Notes |
| ---- | ------- | ----------------------- | ----- |
| `app.js` (`BTorrentCtrl`) | Hidden download anchors created in `$rootScope.downloadAll` and `$rootScope.saveTorrentFile` | Uses `applyBeaconDynamicStyles` with the `hiddenDownload` slot to set `display: none` and provide fallback classes. | Required to trigger native downloads without visible UI.
| `app.js` (`BTorrentCtrl`) | Clipboard fallback in `$rootScope.copyMagnetURI` | Applies dynamic styles through `applyBeaconDynamicStyles` (slot `clipboard`) to position a temporary `<textarea>` off-screen. | Ensures fallback copy logic does not flash on screen.
| `FullCtrl` / `full.html` | Active torrent table provided by `ui-grid` with `ui-grid`, `ui-grid-resize-columns`, and `ui-grid-selection` directives | `ui-grid` injects inline `style` attributes to size columns (`width`, `min-width`) and to control row selection styling. | Also manages focus styling and keyboard navigation.
| `FullCtrl` / `full.html` | Automatic row selection updates | `ui-grid` sets inline `style` on selected rows and attaches `aria-selected`. | Selection must continue to highlight chosen torrent.
| `BTorrentCtrl` (global error handling) | Error, success, and info notifications via `ngNotify.set(message, type)` | `ng-notify` writes inline `style` values (`display`, `opacity`, transition timers) into its toast container and message wrapper. | Notification durations and stickiness are controlled through inline `opacity` animations.
| Clipboard success/error toasts | `ngNotify.set` invoked for both async clipboard API flow and fallback copy path | Same inline-style dependency as above. | Messages require success/error tokens.
| Metadata fetch toast | `$rootScope.onTorrent` calls `ngNotify.set` for "Received … metadata" message | Same inline-style dependency as above. | Should remain a neutral/info message.
| WebRTC support warning | Initialization displays `ngNotify.set("Please use a browser with WebRTC support.", "error")` | Same inline-style dependency as above. | Needs to retain prominent error styling.

These touchpoints guided the design of the Tailwind token replacements added in this change.
