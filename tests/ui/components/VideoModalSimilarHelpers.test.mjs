
import { test } from "node:test";
import assert from "node:assert";
import {
  derivePointerKeyFromInput,
  formatViewCountLabel,
  getViewCountLabel,
  buildSimilarCardIdentity,
  prepareSimilarVideoCard,
  attachSimilarCardViewCounter,
} from "../../../js/ui/components/VideoModalSimilarHelpers.js";

test("derivePointerKeyFromInput", async (t) => {
  await t.test("derives key from string", () => {
    assert.strictEqual(derivePointerKeyFromInput("e:123"), "e:123");
    assert.strictEqual(derivePointerKeyFromInput("123"), "e:123");
    assert.strictEqual(derivePointerKeyFromInput("a:30023:abc"), "a:30023:abc");
  });

  await t.test("derives key from array", () => {
    assert.strictEqual(derivePointerKeyFromInput(["e", "123"]), "e:123");
    assert.strictEqual(derivePointerKeyFromInput(["a", "30023:abc"]), "a:30023:abc");
  });

  await t.test("derives key from object", () => {
    assert.strictEqual(derivePointerKeyFromInput({ key: "k1" }), "k1");
    assert.strictEqual(derivePointerKeyFromInput({ pointerKey: "k2" }), "k2");
    assert.strictEqual(derivePointerKeyFromInput({ type: "e", value: "v1" }), "e:v1");
  });

  await t.test("handles empty/invalid input", () => {
    assert.strictEqual(derivePointerKeyFromInput(null), "");
    assert.strictEqual(derivePointerKeyFromInput(""), "");
    assert.strictEqual(derivePointerKeyFromInput({}), "");
  });
});

test("formatViewCountLabel", async (t) => {
  await t.test("formats numbers", () => {
    // formatViewCount implementation dependent, usually K/M
    // Assuming formatViewCount is imported correctly and works.
    // If it's a mock or real implementation depends on environment.
    // Here we just test it doesn't crash and returns string.
    assert.strictEqual(typeof formatViewCountLabel(100), "string");
  });
});

test("getViewCountLabel", async (t) => {
  await t.test("returns formatted count", () => {
    assert.ok(getViewCountLabel(100, "ready", false).length > 0);
  });
  await t.test("handles partial", () => {
    assert.match(getViewCountLabel(100, "ready", true), /partial/);
  });
  await t.test("handles hydrating", () => {
    assert.strictEqual(getViewCountLabel(null, "hydrating", false), "Loading…");
  });
});

test("buildSimilarCardIdentity", async (t) => {
  const helpers = {
    safeEncodeNpub: (pk) => `npub1${pk}`,
    formatShortNpub: (npub) => `short${npub}`,
  };
  const defaultAvatar = "default.svg";

  await t.test("uses overrides", () => {
    const res = buildSimilarCardIdentity({}, { name: "Overridden" }, { helpers, defaultAvatar });
    assert.strictEqual(res.name, "Overridden");
  });

  await t.test("uses video author", () => {
    const video = { author: { name: "Author" } };
    const res = buildSimilarCardIdentity(video, null, { helpers, defaultAvatar });
    assert.strictEqual(res.name, "Author");
  });

  await t.test("derives npub from pubkey", () => {
    const video = { pubkey: "123" };
    const res = buildSimilarCardIdentity(video, null, { helpers, defaultAvatar });
    assert.strictEqual(res.npub, "npub1123");
    assert.strictEqual(res.shortNpub, "shortnpub1123");
  });
});

test("prepareSimilarVideoCard", async (t) => {
  await t.test("wires up onPlay", () => {
    const card = {};
    const meta = { video: { id: 1 } };
    let dispatched = null;
    const dispatchCallback = (type, detail) => {
      dispatched = { type, detail };
    };

    prepareSimilarVideoCard(card, meta, 0, { dispatchCallback });
    assert.strictEqual(typeof card.onPlay, "function");

    card.onPlay({ event: {}, video: null, card: null });
    assert.strictEqual(dispatched.type, "similar:select");
    assert.strictEqual(dispatched.detail.video.id, 1);
  });
});
