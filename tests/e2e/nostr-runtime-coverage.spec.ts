import { expect, test } from "./helpers/instrumentedTest";

const HEX_A = "a".repeat(64);
const HEX_B = "b".repeat(64);
const HEX_C = "c".repeat(64);
const HEX_D = "d".repeat(64);

test.describe("nostr runtime coverage (deterministic)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/docs/kitchen-sink.html", { waitUntil: "networkidle" });
  });

  test("exercises publish helper signing + rebroadcast guard paths", async ({
    page,
  }) => {
    const result = await page.evaluate(async ({ actorA, actorB }) => {
      const {
        deriveRebroadcastScope,
        deriveRebroadcastBucketIndex,
        rememberRebroadcastAttempt,
        hasRecentRebroadcastAttempt,
        getRebroadcastCooldownState,
        signAndPublishEvent,
      } = await import("/js/nostr/publishHelpers.js");

      const scope = deriveRebroadcastScope(actorA, "f".repeat(64));
      const bucket = deriveRebroadcastBucketIndex(1_700_000_000);
      rememberRebroadcastAttempt(scope, bucket);
      const hasRecent = hasRecentRebroadcastAttempt(scope, bucket);
      const cooldown = getRebroadcastCooldownState(scope);

      const publishCalls = [];
      const client = {
        pubkey: actorA,
        writeRelays: ["wss://relay.one", "wss://relay.two"],
        relays: ["wss://relay.one"],
        sessionActor: null,
        ensureSessionActor: async () => {
          client.sessionActor = {
            pubkey: actorB,
            privateKey: "1".repeat(64),
            source: "nip46",
          };
          return actorB;
        },
        pool: {
          publish(relays, event) {
            publishCalls.push({ relays, event });
            return {
              on(eventName, handler) {
                if (eventName === "ok") {
                  Promise.resolve().then(() => handler());
                }
              },
            };
          },
        },
      };

      const activeEvent = {
        kind: 1,
        pubkey: actorA,
        created_at: 123,
        tags: [],
        content: "active-signer",
      };

      const activeResult = await signAndPublishEvent({
        client,
        event: activeEvent,
        options: { context: "test-active", logName: "active" },
        resolveActiveSigner: () => ({
          signEvent: async (event) => ({
            ...event,
            id: "id-active",
            sig: "sig-active",
          }),
        }),
        shouldRequestExtensionPermissions: () => false,
        signEventWithPrivateKey: () => {
          throw new Error("unexpected-session-fallback");
        },
      });

      let fallbackSignCalls = 0;
      const fallbackEvent = {
        kind: 1,
        pubkey: actorB,
        created_at: 456,
        tags: [],
        content: "session-signer",
      };

      const fallbackResult = await signAndPublishEvent({
        client,
        event: fallbackEvent,
        options: { context: "test-fallback", logName: "fallback" },
        resolveActiveSigner: () => null,
        shouldRequestExtensionPermissions: () => false,
        signEventWithPrivateKey: (event) => {
          fallbackSignCalls += 1;
          return {
            ...event,
            id: "id-session",
            sig: "sig-session",
          };
        },
      });

      return {
        hasRecent,
        cooldownRemainingPositive: Number(cooldown?.remainingMs || 0) > 0,
        activeAcceptedCount: activeResult.summary.accepted.length,
        activeSignerPubkey: activeResult.signerPubkey,
        fallbackAcceptedCount: fallbackResult.summary.accepted.length,
        fallbackSignerPubkey: fallbackResult.signerPubkey,
        fallbackSignCalls,
        publishCallCount: publishCalls.length,
      };
    }, { actorA: HEX_A, actorB: HEX_B });

    expect(result.hasRecent).toBe(true);
    expect(result.cooldownRemainingPositive).toBe(true);
    expect(result.activeAcceptedCount).toBeGreaterThan(0);
    expect(result.activeSignerPubkey).toBe(HEX_A);
    expect(result.fallbackAcceptedCount).toBeGreaterThan(0);
    expect(result.fallbackSignerPubkey).toBe(HEX_B);
    expect(result.fallbackSignCalls).toBe(1);
    expect(result.publishCallCount).toBeGreaterThanOrEqual(2);
  });

  test("exercises comment publish/list/subscribe and session-actor publish guard", async ({
    page,
  }) => {
    const result = await page.evaluate(async ({ actor }) => {
      const {
        COMMENT_EVENT_KIND,
        publishComment,
        listVideoComments,
        subscribeVideoComments,
      } = await import("/js/nostr/commentEvents.js");

      const relay = "wss://relay.comments";
      const videoEventId = "e".repeat(64);
      const listCalls = [];
      const publishedEvents = [];
      let subEventHandler = null;
      let unsubCalled = false;

      const client = {
        pubkey: actor,
        relays: [relay],
        ensureExtensionPermissions: async () => ({ ok: true }),
        pool: {
          publish(relays, event) {
            publishedEvents.push({ relays, event });
            return {
              on(eventName, handler) {
                if (eventName === "ok") {
                  Promise.resolve().then(() => handler());
                }
              },
            };
          },
          async list(relays, filters) {
            listCalls.push({ relays, filters });
            const match = publishedEvents[0]?.event || null;
            const invalid = {
              id: "invalid-comment-id",
              kind: COMMENT_EVENT_KIND,
              created_at: 1,
              tags: [["e", "not-the-video"]],
              content: "invalid",
              pubkey: actor,
              sig: "s",
            };
            return [match, invalid].filter(Boolean);
          },
          sub(relays, filters) {
            listCalls.push({ relays, filters, type: "sub" });
            return {
              on(eventName, handler) {
                if (eventName === "event") {
                  subEventHandler = handler;
                }
              },
              unsub() {
                unsubCalled = true;
              },
            };
          },
        },
      };

      const signer = {
        signEvent: async (event) => ({
          ...event,
          id: "comment-event-id",
          sig: "comment-event-sig",
        }),
      };

      const publishResult = await publishComment(
        client,
        { videoEventPointer: ["e", videoEventId, relay] },
        {
          content: { text: "coverage comment" },
          additionalTags: [["client", "playwright"]],
        },
        {
          resolveActiveSigner: () => signer,
          shouldRequestExtensionPermissions: () => false,
          DEFAULT_NIP07_PERMISSION_METHODS: [],
        },
      );

      const listedFirst = await listVideoComments(
        client,
        { videoEventPointer: ["e", videoEventId, relay] },
        { forceRefresh: true, relays: [relay] },
      );

      const listCallCountAfterFirst = listCalls.length;
      const listedSecond = await listVideoComments(
        client,
        { videoEventPointer: ["e", videoEventId, relay] },
        { relays: [relay] },
      );
      const listCallCountAfterSecond = listCalls.length;

      const seenIds = [];
      const unsubscribe = subscribeVideoComments(
        client,
        { videoEventPointer: ["e", videoEventId, relay] },
        {
          relays: [relay],
          onEvent: (event) => {
            seenIds.push(event.id);
          },
        },
      );

      await Promise.resolve();
      if (typeof subEventHandler === "function") {
        subEventHandler(publishResult.event);
        subEventHandler({
          id: "mismatch",
          kind: COMMENT_EVENT_KIND,
          created_at: 2,
          tags: [["e", "not-the-video"]],
          pubkey: actor,
          content: "skip",
          sig: "s",
        });
      }
      unsubscribe();

      const blockedClient = {
        pubkey: actor,
        sessionActor: { pubkey: actor, source: "nip46" },
        relays: [relay],
        pool: client.pool,
      };
      const blockedPublishResult = await publishComment(
        blockedClient,
        { videoEventPointer: ["e", videoEventId, relay] },
        { content: "blocked" },
        {
          resolveActiveSigner: () => signer,
          shouldRequestExtensionPermissions: () => false,
          DEFAULT_NIP07_PERMISSION_METHODS: [],
        },
      );

      return {
        publishOk: publishResult.ok,
        publishKind: publishResult.event?.kind,
        listedFirstCount: listedFirst.length,
        listedSecondCount: listedSecond.length,
        usedCacheOnSecondList:
          listCallCountAfterSecond === listCallCountAfterFirst,
        seenIds,
        unsubCalled,
        blockedError: blockedPublishResult.error,
      };
    }, { actor: HEX_C });

    expect(result.publishOk).toBe(true);
    expect(result.publishKind).toBeGreaterThan(0);
    expect(result.listedFirstCount).toBe(1);
    expect(result.listedSecondCount).toBe(1);
    expect(result.usedCacheOnSecondList).toBe(true);
    expect(result.seenIds).toEqual(["comment-event-id"]);
    expect(result.unsubCalled).toBe(true);
    expect(result.blockedError).toBe("session-actor-publish-blocked");
  });

  test("exercises reaction publish/list for active signer and session fallback", async ({
    page,
  }) => {
    const result = await page.evaluate(async ({ actorA, actorB }) => {
      const { publishVideoReaction, listVideoReactions } = await import(
        "/js/nostr/reactionEvents.js"
      );

      const relay = "wss://relay.reactions";
      const videoEventId = "9".repeat(64);
      const listCalls = [];
      const publishedEvents = [];
      let fallbackSignCalls = 0;

      const client = {
        pubkey: actorA,
        relays: [relay],
        sessionActor: null,
        ensureExtensionPermissions: async () => ({ ok: true }),
        ensureSessionActor: async (forceNew = false) => {
          if (!client.sessionActor || forceNew) {
            client.sessionActor = {
              pubkey: forceNew ? actorB : actorA,
              privateKey: "2".repeat(64),
              source: "nip46",
            };
          }
          return client.sessionActor.pubkey;
        },
        pool: {
          publish(relays, event) {
            publishedEvents.push({ relays, event });
            return {
              on(eventName, handler) {
                if (eventName === "ok") {
                  Promise.resolve().then(() => handler());
                }
              },
            };
          },
          async list(relays, filters) {
            listCalls.push({ relays, filters });
            const primary = publishedEvents[0]?.event || null;
            const invalid = {
              id: "invalid-reaction",
              kind: 7,
              created_at: 2,
              tags: [["e", "deadbeef"]],
              pubkey: actorA,
              content: "+",
              sig: "s",
            };
            return [primary, invalid].filter(Boolean);
          },
        },
      };

      const activeResult = await publishVideoReaction(
        client,
        ["e", videoEventId, relay],
        { content: "+" },
        {
          resolveActiveSigner: () => ({
            signEvent: async (event) => ({
              ...event,
              id: "reaction-active-id",
              sig: "reaction-active-sig",
            }),
          }),
          shouldRequestExtensionPermissions: () => false,
          signEventWithPrivateKey: () => {
            throw new Error("unexpected-session-fallback");
          },
          DEFAULT_NIP07_PERMISSION_METHODS: [],
        },
      );

      const reactionsFirst = await listVideoReactions(
        client,
        { id: videoEventId },
        { forceRefresh: true, relays: [relay] },
      );
      const listCountAfterFirst = listCalls.length;
      const reactionsSecond = await listVideoReactions(
        client,
        { id: videoEventId },
        { relays: [relay] },
      );
      const listCountAfterSecond = listCalls.length;

      client.pubkey = actorA;
      client.sessionActor = { pubkey: actorB, privateKey: "3".repeat(64), source: "nip46" };
      const fallbackResult = await publishVideoReaction(
        client,
        ["e", videoEventId, relay],
        { content: "🔥" },
        {
          resolveActiveSigner: () => null,
          shouldRequestExtensionPermissions: () => false,
          signEventWithPrivateKey: (event) => {
            fallbackSignCalls += 1;
            return {
              ...event,
              id: "reaction-session-id",
              sig: "reaction-session-sig",
            };
          },
          DEFAULT_NIP07_PERMISSION_METHODS: [],
        },
      );

      return {
        activeOk: activeResult.ok,
        activeAccepted: activeResult.acceptedRelays.length,
        reactionsFirstCount: reactionsFirst.length,
        reactionsSecondCount: reactionsSecond.length,
        usedCacheOnSecondList: listCountAfterSecond === listCountAfterFirst,
        fallbackOk: fallbackResult.ok,
        fallbackSignCalls,
      };
    }, { actorA: HEX_A, actorB: HEX_D });

    expect(result.activeOk).toBe(true);
    expect(result.activeAccepted).toBeGreaterThan(0);
    expect(result.reactionsFirstCount).toBe(1);
    expect(result.reactionsSecondCount).toBe(1);
    expect(result.usedCacheOnSecondList).toBe(true);
    expect(result.fallbackOk).toBe(true);
    expect(result.fallbackSignCalls).toBe(1);
  });
});
