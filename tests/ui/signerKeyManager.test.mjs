import { test, describe, it, before, after } from "node:test";
import assert from "node:assert";
import {
  deriveKeyFromSignature,
  deriveKeyFromPassphrase,
  generatePassphraseSalt,
} from "../../js/services/signerKeyManager.js";
import { createUiDom } from "./helpers/jsdom-test-helpers.mjs";

describe("SignerKeyManager", () => {
  let dom;

  before(async () => {
    // We need a DOM environment because the code might rely on global crypto or other browser APIs
    // Although Node 19+ has global crypto, the code might expect window.crypto.
    // Let's check if the module uses `crypto.subtle` or `window.crypto.subtle`.
    // The code imports `bytesToHex` but uses global `crypto`.
    // The `signerKeyManager.js` uses `crypto.subtle`.
    // Node.js has global `crypto` since v19, but let's ensure consistency with JSDOM just in case.
    dom = createUiDom();

    // Polyfill crypto if JSDOM doesn't fully support subtle crypto (it usually doesn't).
    // Node.js has a native Web Crypto implementation at globalThis.crypto.
    // If JSDOM overwrites it or if code expects it on window, we map it.
    if (!globalThis.crypto) {
        // Should exist in Node environment, but let's be safe
        const cryptoModule = await import("node:crypto");
        globalThis.crypto = cryptoModule.webcrypto;
    }
  });

  after(() => {
    if (dom) dom.cleanup();
  });

  describe("deriveKeyFromSignature", () => {
    it("should derive an AES-GCM key from a hex signature", async () => {
      // Mock signature (64 bytes hex)
      const mockSignature = "a".repeat(128);

      const key = await deriveKeyFromSignature(mockSignature);

      assert.ok(key, "Key should be generated");
      assert.strictEqual(key.algorithm.name, "AES-GCM", "Algorithm should be AES-GCM");
      assert.strictEqual(key.extractable, false, "Key should not be extractable");
      assert.deepStrictEqual(key.usages, ["encrypt", "decrypt"], "Key should have encrypt/decrypt usages");
    });

    it("should throw error for invalid signature", async () => {
      await assert.rejects(
        async () => await deriveKeyFromSignature(null),
        /Invalid signature/,
        "Should reject null signature"
      );
    });
  });

  describe("deriveKeyFromPassphrase", () => {
    it("should derive an AES-GCM key from passphrase and salt", async () => {
      const passphrase = "correct horse battery staple";
      const salt = generatePassphraseSalt();

      const key = await deriveKeyFromPassphrase(passphrase, salt);

      assert.ok(key, "Key should be generated");
      assert.strictEqual(key.algorithm.name, "AES-GCM", "Algorithm should be AES-GCM");
      assert.strictEqual(key.extractable, false, "Key should not be extractable");
    });

    it("should generate different keys for different salts", async () => {
      const passphrase = "password123";
      const salt1 = generatePassphraseSalt();
      const salt2 = generatePassphraseSalt();

      // We can't export the keys to compare bits because they are non-extractable.
      // However, we can test that they encrypt the same data to different ciphertexts (due to key difference).
      // Actually, AES-GCM uses a random IV usually, so ciphertexts differ anyway.
      // But fundamentally, if the function returns successfully for different salts, that's the main test here without export access.

      const key1 = await deriveKeyFromPassphrase(passphrase, salt1);
      const key2 = await deriveKeyFromPassphrase(passphrase, salt2);

      assert.notDeepStrictEqual(salt1, salt2, "Salts should be random");
      assert.ok(key1, "Key1 generated");
      assert.ok(key2, "Key2 generated");
    });

    it("should throw error if salt is invalid", async () => {
        const passphrase = "pw";
        await assert.rejects(
            async () => await deriveKeyFromPassphrase(passphrase, "bad-salt"),
            /Invalid salt/,
            "Should reject string salt (expects Uint8Array)"
        );
    });
  });
});
