import { test, expect } from "./helpers/bitvidTestFixture";
import { finalizeEvent, getPublicKey } from "nostr-tools";

function makeHex(char: string) {
  return char.repeat(64);
}

test.describe("Profile list sync diagnostics", () => {
  test("captures console + page errors during login/profile sync baseline", async ({
    page,
    gotoApp,
    loginAs,
    testPubkey,
    relayUrl,
    setTestRelays,
    startDiagnostics,
  }) => {
    const diagnostics = await startDiagnostics(page);

    await gotoApp();
    await loginAs(page);
    await setTestRelays(page, [relayUrl]);

    await page.waitForFunction(
      () => Boolean((window as any).__bitvidTest__?.getAppState?.()?.isLoggedIn),
      { timeout: 15_000 },
    );

    const appState = await page.evaluate(() => {
      return (window as any).__bitvidTest__.getAppState();
    });
    expect(appState.isLoggedIn).toBe(true);

    const syncState = await page.evaluate(async (activePubkey) => {
      const module = await import("/js/userBlocks.js");
      const manager = module.userBlocks;
      const statuses: any[] = [];
      const unsubscribe = manager.on("status", (detail: any) => {
        statuses.push(detail);
      });
      try {
        await manager.loadBlocks(activePubkey, {
          allowPermissionPrompt: false,
          decryptTimeoutMs: 250,
        });
      } finally {
        if (typeof unsubscribe === "function") unsubscribe();
      }
      return {
        statuses,
        blockedPubkeys: manager.getBlockedPubkeys(),
      };
    }, testPubkey);

    const diagnosticsResult = await diagnostics.stop();
    const appErrorLogs = diagnosticsResult.console.filter(
      (entry) =>
        entry.type === "error" ||
        entry.text.includes("[UserBlockList]") ||
        entry.text.includes("profile list") ||
        entry.text.includes("blocked creators"),
    );

    expect(Array.isArray(syncState.statuses)).toBe(true);
    expect(Array.isArray(syncState.blockedPubkeys)).toBe(true);

    // Diagnostic output is intentionally logged for local triage.
    console.log(
      JSON.stringify(
        {
          phase: "baseline",
          appState,
          consoleCount: diagnosticsResult.console.length,
          pageErrorCount: diagnosticsResult.pageErrors.length,
          appErrorLogs,
          syncEventsTail: diagnosticsResult.syncEvents.slice(-8),
          statusTail: syncState.statuses.slice(-8),
          blockedPubkeys: syncState.blockedPubkeys,
        },
        null,
        2,
      ),
    );
  });

  test("forced decrypt-timeout still ingests public mute tags", async ({
    page,
    gotoApp,
    loginAs,
    seedRawEvent,
    testPubkey,
    testPrivateKey,
    relayUrl,
    setTestRelays,
    setDecryptBehavior,
    startDiagnostics,
  }) => {
    const publicBlocked = makeHex("a");
    const privateKeyBytes = Uint8Array.from(Buffer.from(testPrivateKey, "hex"));
    const derivedPubkey = getPublicKey(privateKeyBytes);
    const staleEvent = finalizeEvent(
      {
        kind: 10000,
        created_at: Math.floor(Date.now() / 1000),
        tags: [
          ["encrypted", "nip44"],
          ["p", publicBlocked],
        ],
        content: "ciphertext-timeout",
      },
      privateKeyBytes,
    );
    await seedRawEvent(staleEvent);

    const diagnostics = await startDiagnostics(page);

    await gotoApp();
    await loginAs(page);
    await setTestRelays(page, [relayUrl]);
    await page.waitForFunction(
      () => Boolean((window as any).__bitvidTest__?.getAppState?.()?.isLoggedIn),
      { timeout: 15_000 },
    );

    let result: any = null;
    try {
      await setDecryptBehavior(page, "timeout");
      result = await page.evaluate(
        async ({ activePubkey, blockedPubkey }) => {
          const blocksModule = await import("/js/userBlocks.js");
          const manager = blocksModule.userBlocks;

          const statuses: any[] = [];
          const unsubscribe = manager.on("status", (detail: any) => {
            statuses.push(detail);
          });

          try {
            await manager.loadBlocks(activePubkey, {
              allowPermissionPrompt: false,
              decryptTimeoutMs: 80,
            });
          } finally {
            if (typeof unsubscribe === "function") unsubscribe();
          }

          return {
            statuses,
            blockedPubkeys: manager.getBlockedPubkeys(),
            containsPublicMute: manager.getBlockedPubkeys().includes(blockedPubkey),
          };
        },
        { activePubkey: testPubkey, blockedPubkey: publicBlocked },
      );

      expect(testPubkey).toBe(derivedPubkey);
      expect(result.containsPublicMute).toBe(true);
      expect(
        result.statuses.some(
          (entry: any) =>
            entry?.status === "stale" && entry?.reason === "decrypt-timeout",
        ),
      ).toBe(true);
    } finally {
      await setDecryptBehavior(page, "passthrough");
    }

    const diagnosticsResult = await diagnostics.stop();

    console.log(
      JSON.stringify(
        {
          phase: "forced-timeout",
          consoleCount: diagnosticsResult.console.length,
          pageErrorCount: diagnosticsResult.pageErrors.length,
          syncEventsTail: diagnosticsResult.syncEvents.slice(-10),
          statusTail: result?.statuses?.slice?.(-10) || [],
          blockedPubkeys: result?.blockedPubkeys || [],
        },
        null,
        2,
      ),
    );
  });
});
