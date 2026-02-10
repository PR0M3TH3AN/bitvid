# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- New views for Kids, History, Search, Subscriptions, and Docs. (PR #2129, PR #2153 by PR0M3TH3AN)
- Comprehensive test suite for Nostr features and UI components. (PR #2153 by PR0M3TH3AN)
- Provider-agnostic S3 multipart upload helpers to support large file uploads and bucket management. (PR #1620 by PR0M3TH3AN)

### Changed

- Performance improvements for documentation scroll spy. (PR #2129 by PR0M3TH3AN)
- Optimized Nostr login speed. (PR #2153 by PR0M3TH3AN)
- Updated `nostr-tools`, `floating-ui`, and `crypto-helpers` dependencies. (PR #2153 by PR0M3TH3AN)
- Major repository update and synchronization (Commit `b429b1c` by thePR0M3TH3AN)
- Removed runtime `ASSET_VERSION` query-string cache busting for static assets. Deployment freshness is now driven by build-time hashed filenames and `asset-manifest.json` rewrites.

### Fixed

- Reverted webseed regression fix (PR #2002 by thePR0M3TH3AN)
