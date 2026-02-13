# VideoModal Component Overview

The `VideoModal` (`js/ui/components/VideoModal.js`) is the primary UI controller for the full-screen video playback experience in bitvid. It manages the modal lifecycle, orchestrates playback, and coordinates sub-controllers for social interactions (comments, reactions, moderation).

## Core Responsibilities

1.  **Lifecycle Management**: Handles lazy-loading of the modal HTML, DOM injection, and visibility toggling.
2.  **Playback Orchestration**: Connects the video metadata to the underlying media player (via `mediaLoader` or direct video element manipulation).
3.  **Social Coordination**: Instantiates and manages `CommentsController`, `ReactionsController`, `SimilarContentController`, and `ModerationController`.
4.  **Accessibility**: Enforces focus trapping and ARIA attributes via `ModalAccessibility`.
5.  **Global State Integration**: Updates the application's modal state (`setGlobalModalState`) to pause background feeds and handle back-button navigation.

## Public API

The `VideoModal` exposes a minimal public interface for the application orchestrator (`ModalManager` or `App`):

| Method | Description |
|--------|-------------|
| `constructor(deps)` | Initializes the controller with dependencies (DOM, logger, state helpers). Does *not* touch the DOM. |
| `async load()` | Fetches `components/video-modal.html`, injects it into the DOM, and hydrates references. Safe to call multiple times (idempotent). |
| `open(video, options)` | Resets state, populates the modal with the given `video` object, and makes it visible. |
| `close()` | Hides the modal, pauses playback, clears state, and returns focus to the trigger element. |

### Dependencies
The constructor requires a robust dependency injection object:
- `document`: The DOM document.
- `setGlobalModalState`: Function to notify the app of modal visibility changes.
- `logger`: Logging utility.
- `mediaLoader`: Service for handling media source resolution.
- `assets`, `state`, `helpers`: Configuration objects.

## internal Architecture

### Lazy Loading & Hydration
To improve initial page load performance, `VideoModal` does not render its markup until `load()` is called (typically on the first user interaction).
1.  **Fetch**: Retrieves `components/video-modal.html`.
2.  **Inject**: Appends the HTML to the `#modalContainer`.
3.  **Hydrate**: Queries for all necessary DOM elements (buttons, containers, inputs) and binds event listeners.
4.  **Sub-Controller Init**: Initializes `CommentsController`, `ReactionsController`, etc., passing them the fresh DOM references.

### Sub-Controllers
The `VideoModal` acts as a parent controller, delegating specific logic to specialized classes:
- **`CommentsController`**: Manages the comment thread, composer, and fetching.
- **`ReactionsController`**: Handles likes/dislikes and reaction counts.
- **`SimilarContentController`**: Fetches and renders related videos.
- **`ModerationController`**: Manages content warnings, blurring, and reporting flows.

## Usage Example

```javascript
// Instantiation (usually in ModalManager)
const videoModal = new VideoModal({
  document: document,
  setGlobalModalState: (key, active) => app.setModalState(key, active),
  logger: logger,
  mediaLoader: mediaLoader
});

// Initialization (lazy)
await videoModal.load();

// Opening
const video = {
  id: "...",
  title: "My Video",
  pubkey: "...",
  // ... other metadata
};
videoModal.open(video, { triggerElement: clickedCard });
```

## Key Invariants

1.  **Single Active Instance**: Only one video modal exists in the DOM at a time. Opening a new video replaces the content of the existing modal.
2.  **Focus Management**: When open, the modal traps focus. When closed, it restores focus to the element that triggered it (via `options.triggerElement`).
3.  **State Synchronization**: The `setGlobalModalState` callback MUST be called on open/close to ensure the back button works correctly and background videos pause.

## When to Change

- **Refactoring**: This file is extremely large (>6000 LOC). Consider extracting more logic into sub-controllers (e.g., a `MetadataController` for title/description/tags).
- **Styling**: Changes to the modal layout should be mirrored in `components/video-modal.html` and tested for responsiveness.
- **Playback Logic**: Changes to how videos load or play should likely be done in `mediaLoader` or `PlaybackService` rather than here, unless it's strictly UI-related (e.g., custom controls).
