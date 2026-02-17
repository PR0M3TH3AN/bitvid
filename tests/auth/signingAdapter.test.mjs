import { test, describe, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert";
import { createNip07SigningAdapter } from "../../js/auth/signingAdapter.js";

describe("createNip07SigningAdapter", () => {
  let originalWindow;

  beforeEach(() => {
    // Preserve original window if it exists (for safety, though usually undefined in node)
    if (typeof globalThis.window !== "undefined") {
      originalWindow = globalThis.window;
    }
  });

  afterEach(() => {
    // Restore window
    if (originalWindow) {
      globalThis.window = originalWindow;
    } else {
      delete globalThis.window;
    }
  });

  test("uses explicit extension if provided", async () => {
    const mockExtension = {
      getPublicKey: mock.fn(async () => "explicit_pubkey"),
      signEvent: mock.fn(async (event) => ({ ...event, sig: "signature" })),
    };

    const adapter = createNip07SigningAdapter({ extension: mockExtension });

    const pubkey = await adapter.getPubkey();
    assert.strictEqual(pubkey, "explicit_pubkey");
    assert.strictEqual(mockExtension.getPublicKey.mock.calls.length, 1);

    const event = { id: "123" };
    const signed = await adapter.signEvent(event);
    assert.strictEqual(signed.sig, "signature");
    assert.strictEqual(mockExtension.signEvent.mock.calls.length, 1);
    assert.deepStrictEqual(mockExtension.signEvent.mock.calls[0].arguments[0], event);
  });

  test("falls back to window.nostr if no extension provided", async () => {
    const mockWindowNostr = {
      getPublicKey: mock.fn(async () => "window_pubkey"),
      signEvent: mock.fn(async (event) => ({ ...event, sig: "window_sig" })),
    };

    globalThis.window = { nostr: mockWindowNostr };

    const adapter = createNip07SigningAdapter();

    const pubkey = await adapter.getPubkey();
    assert.strictEqual(pubkey, "window_pubkey");
    assert.strictEqual(mockWindowNostr.getPublicKey.mock.calls.length, 1);
  });

  test("throws error if no extension available", async () => {
    globalThis.window = {}; // No nostr

    const adapter = createNip07SigningAdapter();

    await assert.rejects(
      async () => adapter.getPubkey(),
      { message: "NIP-07 extension unavailable." }
    );

    await assert.rejects(
      async () => adapter.signEvent({}),
      { message: "NIP-07 extension unavailable." }
    );
  });

  test("prioritizes explicit extension over window.nostr", async () => {
    const mockExplicit = {
      getPublicKey: mock.fn(async () => "explicit"),
    };
    const mockWindow = {
      getPublicKey: mock.fn(async () => "window"),
    };

    globalThis.window = { nostr: mockWindow };

    const adapter = createNip07SigningAdapter({ extension: mockExplicit });
    const pubkey = await adapter.getPubkey();

    assert.strictEqual(pubkey, "explicit");
    assert.strictEqual(mockExplicit.getPublicKey.mock.calls.length, 1);
    assert.strictEqual(mockWindow.getPublicKey.mock.calls.length, 0);
  });
});
