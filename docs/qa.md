# bitvid Manual QA Script

Run this checklist before publishing releases or merging changes that touch upload or playback flows. Copy/paste the steps into QA tickets when requesting validation.

Before starting, open `docs/kitchen-sink.html` in a browser to review the modal surface reference. With that page as your visual baseline, perform this quick accessibility spot check in the running app:

* Launch the site, trigger any video card or thumbnail to open the playback modal, and keep track of the element you used to open it.
* Scroll the modal content down and back up; confirm the sticky navigation bar hides on downward scroll and reappears when you reverse direction.
* Activate the zap button to display the popover and tab through its fields to confirm focus stays within the dialog; press `Escape` to close it and ensure focus returns to the zap trigger.
* Close the video modal first with `Escape` and again by clicking the dimmed backdrop; in both cases, focus should move back to the original trigger element you used to open the modal.
* Repeat the accessibility spot check for the Upload, Edit, and Revert modals along with static dialogs (Login, Application form, Content appeals, Feedback, Feature request, Bug report, and Disclaimer). Ensure `Tab`/`Shift+Tab` stay within each modal and that pressing `Escape` or clicking a dismissible backdrop closes the dialog and restores focus to the opener.

1. **Upload Modal Smoke Test**
   - Open the Upload modal, verify title is required, and ensure either a hosted URL or a magnet (or both) must be supplied.
   - Submit three variants: URL-only, magnet-only, and both URL + magnet. Confirm success messaging or event publication in each case.
2. **URL-First Playback**
   - For a post with both URL and magnet, play the video and confirm the hosted URL loads first (inspect network requests or logs).
   - Simulate a dead URL (offline mode or request blocker) and confirm playback falls back to WebTorrent without breaking the UI.
3. **Magnet Safety**
   - Paste an encoded magnet and confirm `safeDecodeMagnet()` outputs the raw string before playback.
   - Ensure `normalizeAndAugmentMagnet()` adds provided `ws=` / `xs=` hints while keeping the original `xt` hash intact.
4. **P2P Hints & Trackers**
   - Confirm magnets generated through the modal include HTTPS `ws=` seeds and optional HTTPS `xs=` torrent URLs when supplied.
   - Check that tracker arrays originate from `js/constants.js` and only include WSS endpoints.
5. **Cross-Browser Verification**
   - Spot-check Chromium and Firefox (desktop) for console warnings about CORS, Range requests, or tracker connectivity.
   - Optionally validate on mobile Safari/Chrome if the change targets mobile UX.
6. **Saved Profile Metadata Refresh**
   - In the browser devtools console/storage panel, delete `bitvid:profileCache:v1` but keep `bitvid:savedProfiles:v1` populated with Nostr pubkeys that lack stored names/avatars.
   - Reload the page and open the profile switcher; confirm avatars and display names populate automatically without manual refresh.
7. **View Logging Per Identity**
   - Play the same video until a view event is logged, then log out (or switch to a different pubkey) and repeat the playback.
   - Confirm two distinct view events appear (e.g., via relay logs or UI counters) and the aggregated view count increments twice.

Document findings (pass/fail notes plus relevant screenshots or logs) so they can be attached to release or PR notes.
