import { test, expect } from "./helpers/persistentExtensionFixture";

test.describe("NIP-07 extension smoke", () => {
  test("extension injects a NIP-07 API surface", async ({ page }) => {
    await page.goto("/");

    await page.waitForFunction(
      () =>
        typeof (window as any).nostr === "object" &&
        (typeof (window as any).nostr.getPublicKey === "function" ||
          typeof (window as any).nostr.nip04?.decrypt === "function" ||
          typeof (window as any).nostr.nip44?.decrypt === "function"),
      { timeout: 15_000 },
    );

    const capabilities = await page.evaluate(() => {
      const api = (window as any).nostr;
      return {
        hasGetPublicKey: typeof api?.getPublicKey === "function",
        hasSignEvent: typeof api?.signEvent === "function",
        hasNip04Decrypt: typeof api?.nip04?.decrypt === "function",
        hasNip44Decrypt:
          typeof api?.nip44?.decrypt === "function" ||
          typeof api?.nip44?.v2?.decrypt === "function",
      };
    });

    expect(
      capabilities.hasGetPublicKey ||
        capabilities.hasNip04Decrypt ||
        capabilities.hasNip44Decrypt,
    ).toBe(true);
  });
});
