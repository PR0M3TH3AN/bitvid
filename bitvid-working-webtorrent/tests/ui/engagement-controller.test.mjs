import test from "node:test";
import assert from "node:assert/strict";
import EngagementController from "../../js/ui/engagementController.js";

test("EngagementController", async (t) => {
  let controller;
  let mockNostrClient;
  let mockShowError;
  let mockShowSuccess;
  let mockShowStatus;
  let mockGetCurrentVideo;
  let mockGetCurrentVideoPointer;

  t.beforeEach(() => {
    mockNostrClient = {
      repostEvent: t.mock.fn(),
      mirrorVideoEvent: t.mock.fn(),
      rebroadcastEvent: t.mock.fn(),
    };
    mockShowError = t.mock.fn();
    mockShowSuccess = t.mock.fn();
    mockShowStatus = t.mock.fn();
    mockGetCurrentVideo = t.mock.fn();
    mockGetCurrentVideoPointer = t.mock.fn();

    controller = new EngagementController({
      services: { nostrClient: mockNostrClient },
      ui: {
        showError: mockShowError,
        showSuccess: mockShowSuccess,
        showStatus: mockShowStatus,
      },
      state: {
        getCurrentVideo: mockGetCurrentVideo,
        getCurrentVideoPointer: mockGetCurrentVideoPointer
      },
    });
  });

  await t.test("handleRepostAction - should show error if no event ID is available", async () => {
    await controller.handleRepostAction({});
    assert.equal(mockShowError.mock.calls.length, 1);
    assert.deepEqual(mockShowError.mock.calls[0].arguments, ["No event is available to repost."]);
    assert.equal(mockNostrClient.repostEvent.mock.calls.length, 0);
  });

  await t.test("handleRepostAction - should call repostEvent with correct parameters", async () => {
    const eventId = "test-event-id";
    mockNostrClient.repostEvent.mock.mockImplementation(async () => ({ ok: true, summary: { accepted: [] } }));

    await controller.handleRepostAction({ eventId, kind: "30078" });

    assert.equal(mockNostrClient.repostEvent.mock.calls.length, 1);
    const args = mockNostrClient.repostEvent.mock.calls[0].arguments;
    assert.equal(args[0], eventId);
    assert.equal(args[1].kind, 30078);

    assert.equal(mockShowSuccess.mock.calls.length, 1);
    assert.deepEqual(mockShowSuccess.mock.calls[0].arguments, ["Reposted."]);
  });

  await t.test("handleRepostAction - should handle failure from repostEvent", async () => {
    const eventId = "test-event-id";
    mockNostrClient.repostEvent.mock.mockImplementation(async () => ({ ok: false, error: "signing-failed" }));

    await controller.handleRepostAction({ eventId });

    assert.equal(mockShowError.mock.calls.length, 1);
    assert.deepEqual(mockShowError.mock.calls[0].arguments, ["Failed to sign the repost. Please try again."]);
  });

  await t.test("handleRepostAction - should use currentVideoPointer when in modal context", async () => {
    const eventId = "test-event-id";
    const videoPointer = ["nevent", "test-nevent", "wss://relay.example.com"];
    mockNostrClient.repostEvent.mock.mockImplementation(async () => ({ ok: true, summary: { accepted: [] } }));

    // In node:test, mocking return values is done via implementation if it's a mock function
    mockGetCurrentVideoPointer.mock.mockImplementation(() => videoPointer);

    await controller.handleRepostAction({ eventId, context: "modal" });

    assert.equal(mockNostrClient.repostEvent.mock.calls.length, 1);
    const args = mockNostrClient.repostEvent.mock.calls[0].arguments;
    assert.deepEqual(args[1].pointer, videoPointer);
  });

  await t.test("handleMirrorAction - should show error if video has no URL", async () => {
    const eventId = "test-event-id";
    await controller.handleMirrorAction({ eventId });
    assert.equal(mockShowError.mock.calls.length, 1);
    assert.deepEqual(mockShowError.mock.calls[0].arguments, ["This video does not expose a hosted URL to mirror."]);
  });

  await t.test("handleMirrorAction - should call mirrorVideoEvent when URL is provided", async () => {
    const eventId = "test-event-id";
    const url = "https://example.com/video.mp4";
    mockNostrClient.mirrorVideoEvent.mock.mockImplementation(async () => ({ ok: true, summary: { accepted: [] } }));

    await controller.handleMirrorAction({ eventId, url });

    assert.equal(mockNostrClient.mirrorVideoEvent.mock.calls.length, 1);
    const args = mockNostrClient.mirrorVideoEvent.mock.calls[0].arguments;
    assert.equal(args[0], eventId);
    assert.equal(args[1].url, url);

    assert.equal(mockShowSuccess.mock.calls.length, 1);
    assert.deepEqual(mockShowSuccess.mock.calls[0].arguments, ["Mirrored."]);
  });

  await t.test("handleMirrorAction - should prevent mirroring private videos", async () => {
    const eventId = "test-event-id";
    const url = "https://example.com/video.mp4";
    await controller.handleMirrorAction({ eventId, url, isPrivate: true });

    assert.equal(mockShowError.mock.calls.length, 1);
    assert.deepEqual(mockShowError.mock.calls[0].arguments, ["Mirroring is unavailable for private videos."]);
    assert.equal(mockNostrClient.mirrorVideoEvent.mock.calls.length, 0);
  });

  await t.test("handleEnsurePresenceAction - should show error if no event ID", async () => {
    await controller.handleEnsurePresenceAction({});
    assert.equal(mockShowError.mock.calls.length, 1);
    assert.deepEqual(mockShowError.mock.calls[0].arguments, ["No event is available to rebroadcast."]);
  });

  await t.test("handleEnsurePresenceAction - should handle throttled response", async () => {
    const eventId = "test-event-id";
    mockNostrClient.rebroadcastEvent.mock.mockImplementation(async () => ({ throttled: true, cooldown: { remainingMs: 5000 } }));

    global.window = { setTimeout: t.mock.fn() };

    await controller.handleEnsurePresenceAction({ eventId });

    assert.equal(mockShowStatus.mock.calls.length, 1);
    assert.match(mockShowStatus.mock.calls[0].arguments[0], /Rebroadcast is cooling down/);

    delete global.window;
  });

  await t.test("handleEnsurePresenceAction - should show success on successful rebroadcast", async () => {
    const eventId = "test-event-id";
    mockNostrClient.rebroadcastEvent.mock.mockImplementation(async () => ({ ok: true }));

    await controller.handleEnsurePresenceAction({ eventId });

    assert.equal(mockShowSuccess.mock.calls.length, 1);
    assert.deepEqual(mockShowSuccess.mock.calls[0].arguments, ["Rebroadcast requested across relays."]);
  });
});
