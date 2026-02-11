import "../test-helpers/setup-localstorage.mjs";
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { S3UploadService } from "../../js/services/s3UploadService.js";

// Mock VIDEO_NOTE_ERROR_CODES constants if needed, but they are imported in the service.
// We can just rely on the strings we return from the mocked getVideoNoteErrorMessage.

function createMockDeps() {
  return {
    ensureS3SdkLoaded: mock.fn(async () => {}),
    makeS3Client: mock.fn(() => ({})),
    multipartUpload: mock.fn(async () => {}),
    buildR2Key: mock.fn(() => "mock-key"),
    buildS3ObjectUrl: mock.fn(() => "https://mock-url.com/file"),
    getCorsOrigins: mock.fn(() => ["*"]),
    prepareS3Connection: mock.fn(async (opts) => ({
      ...opts,
      bucket: "mock-bucket",
      publicBaseUrl: "https://mock-url.com",
    })),
    validateS3Connection: mock.fn((settings) => ({
      ...settings,
      bucket: "mock-bucket",
      endpoint: "https://s3.mock",
    })),
    userLogger: {
      warn: mock.fn(),
      error: mock.fn(),
    },
    buildStoragePointerValue: mock.fn(() => "mock-pointer"),
    buildStoragePrefixFromKey: mock.fn(() => "mock-prefix"),
    getVideoNoteErrorMessage: mock.fn((code) => `Error: ${code}`),
    normalizeVideoNotePayload: mock.fn((payload) => ({
      payload,
      errors: [],
    })),
    calculateTorrentInfoHash: mock.fn(async () => "mock-info-hash"),
  };
}

test("S3UploadService", async (t) => {
  await t.test("constructor initializes listeners", () => {
    const service = new S3UploadService(createMockDeps());
    assert.ok(service.listeners instanceof Map);
  });

  await t.test("Event Emitter Logic", async (t) => {
    const service = new S3UploadService(createMockDeps());
    const handler = mock.fn();

    // on
    const unsubscribe = service.on("test-event", handler);
    assert.ok(service.listeners.has("test-event"));
    assert.strictEqual(service.listeners.get("test-event").size, 1);

    // emit
    service.emit("test-event", { foo: "bar" });
    assert.strictEqual(handler.mock.callCount(), 1);
    assert.deepStrictEqual(handler.mock.calls[0].arguments[0], { foo: "bar" });

    // unsubscribe
    unsubscribe();
    assert.ok(!service.listeners.has("test-event"));
  });

  await t.test("emit handles listener errors safely", () => {
    const deps = createMockDeps();
    const service = new S3UploadService(deps);
    const handler = mock.fn(() => {
      throw new Error("oops");
    });

    service.on("error-event", handler);
    service.emit("error-event", {});

    assert.strictEqual(handler.mock.callCount(), 1);
    assert.strictEqual(deps.userLogger.error.mock.callCount(), 1);
    assert.match(
      deps.userLogger.error.mock.calls[0].arguments[0],
      /Listener error for/
    );
  });

  await t.test("verifyConnection", async () => {
    const deps = createMockDeps();
    const service = new S3UploadService(deps);
    const settings = { foo: "bar" };

    const result = await service.verifyConnection({ settings });

    assert.strictEqual(deps.validateS3Connection.mock.callCount(), 1);
    assert.strictEqual(deps.prepareS3Connection.mock.callCount(), 1);
    assert.strictEqual(result.bucket, "mock-bucket");
  });

  await t.test("prepareUpload", async () => {
    const deps = createMockDeps();
    const service = new S3UploadService(deps);
    const settings = { foo: "bar" };

    const result = await service.prepareUpload(settings);

    assert.ok(result.settings);
    assert.ok(result.bucketEntry);
    assert.strictEqual(result.bucketEntry.bucket, "mock-bucket");
  });

  await t.test("uploadFile", async (t) => {
    await t.test("validates parameters", async () => {
      const service = new S3UploadService(createMockDeps());
      await assert.rejects(
        () => service.uploadFile({}),
        /Missing required parameters/
      );
    });

    await t.test("uploads successfully", async () => {
      const deps = createMockDeps();
      const service = new S3UploadService(deps);
      const file = new File(["content"], "test.txt", { type: "text/plain" });
      const options = {
        file,
        endpoint: "https://s3.mock",
        region: "us-east-1",
        accessKeyId: "key",
        secretAccessKey: "secret",
        bucket: "bucket",
        key: "key",
      };

      const result = await service.uploadFile(options);

      assert.strictEqual(deps.ensureS3SdkLoaded.mock.callCount(), 1);
      assert.strictEqual(deps.makeS3Client.mock.callCount(), 1);
      assert.strictEqual(deps.multipartUpload.mock.callCount(), 1);
      assert.strictEqual(result.bucket, "bucket");
      assert.strictEqual(result.key, "key");
    });
  });

  await t.test("uploadVideo", async (t) => {
    const validParams = {
      npub: "npub123",
      file: new File(["video"], "video.mp4", { type: "video/mp4" }),
      metadata: { title: "My Video" },
      publishVideoNote: mock.fn(async () => true),
    };

    await t.test("fails if npub missing", async () => {
      const service = new S3UploadService(createMockDeps());
      const result = await service.uploadVideo({ ...validParams, npub: "" });
      assert.strictEqual(result, false);
    });

    await t.test("fails if title missing", async () => {
      const service = new S3UploadService(createMockDeps());
      const result = await service.uploadVideo({
        ...validParams,
        metadata: { title: "" },
      });
      assert.strictEqual(result, false);
    });

    await t.test("fails if file missing", async () => {
      const service = new S3UploadService(createMockDeps());
      const result = await service.uploadVideo({ ...validParams, file: null });
      assert.strictEqual(result, false);
    });

    await t.test("successful upload flow", async () => {
      const deps = createMockDeps();
      const service = new S3UploadService(deps);

      // Spy on status updates
      const statusHandler = mock.fn();
      service.on("uploadStatus", statusHandler);

      const result = await service.uploadVideo(validParams);

      assert.strictEqual(result, true);
      assert.strictEqual(deps.ensureS3SdkLoaded.mock.callCount(), 1);
      assert.strictEqual(deps.makeS3Client.mock.callCount(), 1);
      // multipartUpload called for video
      assert.ok(deps.multipartUpload.mock.callCount() >= 1);
      assert.strictEqual(deps.calculateTorrentInfoHash.mock.callCount(), 1);
      assert.strictEqual(validParams.publishVideoNote.mock.callCount(), 1);
    });

    await t.test("uploads thumbnail if provided", async () => {
      const deps = createMockDeps();
      const service = new S3UploadService(deps);
      const thumbnailFile = new File(["img"], "thumb.jpg", {
        type: "image/jpeg",
      });

      await service.uploadVideo({ ...validParams, thumbnailFile });

      // multipartUpload called for video and thumbnail
      assert.ok(deps.multipartUpload.mock.callCount() >= 2);
    });

    await t.test("handles validation errors from normalizeVideoNotePayload", async () => {
      const deps = createMockDeps();
      deps.normalizeVideoNotePayload = mock.fn(() => ({
        payload: null,
        errors: ["INVALID_DATA"],
      }));
      const service = new S3UploadService(deps);

      const result = await service.uploadVideo(validParams);

      assert.strictEqual(result, false);
      assert.strictEqual(deps.getVideoNoteErrorMessage.mock.callCount(), 1);
    });

    await t.test("handles upload exception", async () => {
        const deps = createMockDeps();
        deps.multipartUpload = mock.fn(async () => { throw new Error("Upload failed"); });
        const service = new S3UploadService(deps);

        const result = await service.uploadVideo(validParams);

        assert.strictEqual(result, false);
        assert.strictEqual(deps.userLogger.error.mock.callCount(), 1);
    });
  });
});
