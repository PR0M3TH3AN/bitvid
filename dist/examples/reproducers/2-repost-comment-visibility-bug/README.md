# Repost Comment Visibility Bug

This reproducer demonstrates an issue where comments made on an original video are not visible when viewing that video via a Repost (Kind 6).

## The Bug

When viewing a repost, the application often passes the Repost event's metadata (Kind 6, Reposter Pubkey) along with the *Original Video's ID* to the comment system.

The `CommentThreadService` (via `normalizeCommentTarget`) creates a filter descriptor based on this input. It expects comments to tag the **Repost** (Kind 6) and the **Reposter**.

However, comments are almost always made on the **Original Video** (Kind 30078), tagging the **Original Author**.

Because `isVideoCommentEvent` enforces strict matching of `rootKind` and `rootAuthor` against the descriptor, it rejects the valid comments on the original video, resulting in an empty comment section.

## Running the Reproducer

```bash
node --import ./tests/test-helpers/setup-localstorage.mjs examples/reproducers/2-repost-comment-visibility-bug/reproduce_issue.js
```

## Expected Output (Failure)

```
Input Target: { ... videoKind: 6 ... }
Generated Descriptor: { ... rootKind: '6' ... }
...
Is Comment Visible? false
FAIL: Comment on original video is NOT visible when viewing repost.
```
