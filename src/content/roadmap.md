# Roadmap and Bug List

## UI Enhancements

- Add a copy Magnet button labeled "Seed".
- Add a warning disclaimer pop-up.
- Convert "Logged in as" from public key to profile image and username (use npub as fallback).
- Add a sidebar for improved UI flexibility.
- Customize home screen content via algorithms for better feeds. (trending, new, for you etc.)
- Improve UI/UX and CSS.
- Add custom color themes and toggle between light and dark mode.

## Bug Fixes

- Fix public key wrapping issue on smaller screens.
- Fix video editing failures.
- Resolve issue where reopening the same video doesn't work after closing the video player.
- Address "Video playback error: MEDIA_ELEMENT_ERROR: Empty src attribute" error.
- Fix "Dev Mode" publishing "Live Mode" notes—add a flag for dev mode posts.

## Feature Additions

- Add an `npub` whitelist for login access.
- Allow users to set custom relay settings, stored in local cache.
- Add a "Publish" step in the video editing process.
- Add comments to the video modal.
- Implement an "Adult Content" flag for note submissions.
- Enable custom hashtags in the submission spec and form.
- Allow multiple video resolutions with a selector in the video player.
- Add a block/unblock list with import/export functionality.
- Assign unique URLs to each video.
- Add a profile modal for each user/profile.
- Introduce a subscription mechanism with notifications.
- Add zaps to videos, profiles, and comments.
- Implement visibility filtering for videos:
  - Show only videos whose magnet links have at least **one active peer online**.
  - Integrate the filtering mechanism into the video list rendering process.
  - Update the video list dynamically based on real-time peer availability.
- Add multi-language support for content and filtration.
- Create a settings menu for local account preferences, including relay, adult content, theme, and language.

## Long-Term Goals

- Add a system for creating high-quality, algorithm-driven content feeds.
- Thoroughly bug test the video editing and submission process.

If you find a new bug thats not listed here. DM me on [Nostr](https://primal.net/p/npub13yarr7j6vjqjjkahd63dmr27curypehx45ucue286ac7sft27y0srnpmpe).
