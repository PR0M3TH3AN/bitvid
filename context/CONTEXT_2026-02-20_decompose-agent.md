# Decomposition Plan for `js/ui/components/VideoModal.js`

**Date:** 2026-02-20
**Agent:** decompose-agent (via scheduler)
**Target File:** `js/ui/components/VideoModal.js`
**Current Size:** ~6000 lines (grandfathered)

## Rationale
`VideoModal.js` is one of the largest files in the codebase. It handles too many responsibilities beyond just managing the modal lifecycle and video playback. Specifically, it contains extensive logic for:
1.  **Zap Dialog Management**: Handling the entire flow of zapping, including popover, form validation, receipts, and error handling.
2.  **Link Previews**: Fetching and rendering link previews for the video description.

Extracting these into dedicated controllers will significantly reduce the size of `VideoModal.js` and improve cohesion.

## Extraction Plan

### 1. `ZapController`
**Source:** `js/ui/components/VideoModal.js`
**Destination:** `js/ui/components/video-modal/zapController.js`

**Responsibilities:**
- Manage the Zap dialog DOM elements (`modalZapDialog`, `modalZapForm`, etc.).
- Handle Zap interactions (open, close, submit).
- Render Zap receipts.
- Manage Zap visibility and state.

**Methods to Move:**
- `setupModalZapPopover`
- `openZapDialog`
- `closeZapDialog`
- `isZapDialogOpen`
- `focusZapAmount`
- `getZapAmountValue`, `setZapAmount`
- `getZapCommentValue`, `setZapComment`
- `resetZapForm`
- `setZapSplitSummary`
- `setZapStatus`
- `clearZapReceipts`, `renderZapReceipts`
- `setZapPending`, `setZapRetryPending`, `setZapCompleted`
- `applyZapSendButtonState`
- `setZapVisibility`
- `setWalletPromptVisible`

### 2. `LinkPreviewController`
**Source:** `js/ui/components/VideoModal.js`
**Destination:** `js/ui/components/video-modal/linkPreviewController.js`

**Responsibilities:**
- Manage link preview DOM elements (`videoDescriptionPreviews`).
- Fetch and render link previews.
- Handle link preview settings.

**Methods to Move:**
- `renderLinkPreviews`
- `clearLinkPreviews`, `clearLinkPreviewRequests`
- `extractDescriptionUrls`
- `normalizePreviewUrl`, `extractPreviewDomain`
- `createLinkPreviewCard`, `updateLinkPreviewCard`
- `setLinkPreviewStatus`
- `resolveLinkPreview`
- `handleLinkPreviewSettingsChange`

## Implementation Details
- `VideoModal` will instantiate these controllers in its constructor.
- `hydrate()` will call `controller.initialize()`.
- `destroy()` will call `controller.destroy()`.
- `VideoModal` will delegate relevant calls to these controllers.
- Existing event listeners in `VideoModal` that trigger these actions will be updated to use the controllers.

## Verification
- `npm run lint`
- `npm run test:unit`
- Manual verification via code review (simulated).
