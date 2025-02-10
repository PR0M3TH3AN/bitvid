## Bug Fixes

> ⚠️ **Note:** If you find a new bug thats not listed here. Please submit a [Bug Report](https://bitvid.network/?modal=bug).

- Speed up loading in subscriptions. Save to local cache?
- Fix "Dev Mode" publishing "Live Mode" notes—add a flag for dev mode posts.
- Fix issue with video post set to private.
- Disable "private video" until I can make it work better.
- Make "private video" work better using nip-04 encryption for magnet field.
- Fix slow back button issues on Firefox.
- Add Amber login support for mobile.
- Add settings (three dots) button for all videos, not the same as gear menu. Only show delete and edit gear for logged-in users videos.
- Add support for "Playlist" lists and other custom lists (named whatever) and also "Watch Later" list and "Watch History".
- Add an "add to playlist" button to the edit button.
- Add "add to watch later" option to edit button.
- Add block button to settings button.
- Add report button to settings button.
- Fix autoplay broken on iPhone chrome.
- Fix playback broken on Safari on iPhone.
- Update note spec v3 transition to include new fields that have been added like "has previous" or "videoRootID" or enentID if null.
- Change "explore" view to "kids" view and add flag to all notes to see if they are for kids.
- Add "seed" lists.
- Make "edit" video a form modal rather than a browser pop-up.
- Add "upload thumbnail" as option to add/edit video form. (use https://apidocs.imgur.com/)
- Fix issue where page refreshes when pulling up a video in the video modal.
- Fix sidebar media query settings on medium-sized screens. (tablet/laptops)
- Fix various "text wrap" issues causing scroll left and right on profile and modal pages.
- Add zaps to profile and video modal pages.
- Add comments to video modal pages.

## Feature Additions

> ⚠️ **Note:** Have an idea for improving bitvid? We’d love to hear it! Please use [this form](https://bitvid.network/?modal=feature) to request new features or enhancements.

- Allow users to set custom relay settings, stored in local cache.
- Add a "Publish" step in the video editing process.
- Add Profile/Channel Views. [Click for more details](https://github.com/PR0M3TH3AN/bitvid/blob/main/content/roadmap/04_bitvid_Enhanced_Profile_Channel_Views_Specification.md)
- Improve event spec for migration to new versions. [Click for more details](https://github.com/PR0M3TH3AN/bitvid/blob/main/content/roadmap/02_bitvid_Enhanced_Migration_of_Note_Spec_Logic.md)
- Migrate event spec to v3 and add support for Audio/Podcast content. [Click for more details](https://github.com/PR0M3TH3AN/bitvid/blob/main/content/roadmap/03_bitvid_Enhanced_Nostr_Video_%26_Audio_Note_Specification_Version%203.md)
- Add Block List, Subscription List, Playlist, and Reporting Specification. [Click for more details](https://github.com/PR0M3TH3AN/bitvid/blob/main/content/roadmap/05_bitvid_Enhanced_Block_Subscription_%26_Reporting_Specification.md)
- Add comments to the video modal. [Click for more details](https://github.com/PR0M3TH3AN/bitvid/blob/main/content/roadmap/06_bitvid_Enhanced_Video_Comment_System_Specification.md)
- Implement an "Adult Content" flag for note submissions.
- Enable custom hashtags in the submission spec and form. (Use with future search system)
- Allow multiple video resolutions with a selector in the video player. (v3 event spec needed)
- Introduce a subscription mechanism with notifications.
- Add zaps to videos, profiles, and comments.
- Create a VRR (View, Rating, and Retention) Penalty Scoring system. [Click for more details](https://github.com/PR0M3TH3AN/bitvid/blob/main/content/roadmap/07_bitvid_Enhanced_View_Rating_%26_Retention_Penalty_Scoring.md)
- Implement visibility filtering for videos:
  - Show only videos whose magnet links have at least **one active peer online**.
  - Integrate the filtering mechanism into the video list rendering process.
  - Update the video list dynamically based on real-time peer availability. (this may not be possible)
- Dynamic Home Page and Video Tracking Specification. [Click for more details](https://github.com/PR0M3TH3AN/bitvid/blob/main/content/roadmap/08_bitvid_Enhanced_Dynamic_Home_Page_%26_Video_Tracking_Specification.md)
- Add multi-language support for content and filtration. (v4?)
- Create a settings menu for local account preferences, including relay, adult content, theme, and language.
- Better integrate with other Nostr/torrent ecosystem. (NIP-35 + WebRTC Check Integration) [Click for more details](https://github.com/PR0M3TH3AN/bitvid/blob/main/content/roadmap/09_bitvid_Enhanced_NIP-35_%2B_WebRTC_Check_Integration.md)

> ⚠️ **Note:** Your feedback helps us improve bitvid! Whether it’s a suggestion, a concern, or general thoughts on the platform, we’d love to hear from you. Please tell us what you think [with this form](https://bitvid.network/?modal=feedback).
