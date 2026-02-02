# Reproducer for Channel Moderation Test Crash

This reproducer demonstrates a bug in the test harness setup used in `tests/app/channel-profile-moderation.test.mjs`.

## Issue Description

The test helper `createModerationAppHarness` in `tests/helpers/moderation-test-helpers.mjs` instantiates the `Application` class using `Object.create(Application.prototype)`, bypassing the constructor.

The `Application` constructor is responsible for initializing `this.moderationDecorator`.

When `app.decorateVideoModeration()` is called (which is done in `renderChannelVideosFromList`), it attempts to call `this.moderationDecorator.decorateVideo()`. Since `this.moderationDecorator` is undefined, it throws a `TypeError: Cannot read properties of undefined (reading 'decorateVideo')`.

This causes tests in `tests/app/channel-profile-moderation.test.mjs` to fail with exit code 1.

## How to Run

Run the reproducer script:

```bash
node examples/reproducers/issue-channel-moderation-test-crash/repro.mjs
```

A successful run (reproduction of the crash) will output:
`SUCCESS: Caught expected error: Cannot read properties of undefined (reading 'decorateVideo')`

## Fix (Recommendation)

The `createModerationAppHarness` helper should ensure `moderationDecorator` is initialized on the mock `Application` instance, or use a method of instantiation that runs the constructor (if feasible with mocks).

Example fix in `tests/helpers/moderation-test-helpers.mjs`:

```javascript
  // ... inside createModerationAppHarness
  const app = Object.create(Application.prototype);
  // ...
  // Manually initialize moderationDecorator since constructor is skipped
  app.moderationDecorator = new ModerationDecorator({
      getProfileCacheEntry: (pubkey) => app.getProfileCacheEntry(pubkey),
  });
  // ...
```
