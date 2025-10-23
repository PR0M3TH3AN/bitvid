// Run with: node tests/nostr-view-event-bindings.test.mjs

import "./test-helpers/setup-localstorage.mjs";
import assert from "node:assert/strict";

const { nostrClient } = await import("../js/nostrClientFacade.js");
const {
  listVideoViewEventsWithDefaultClient,
  subscribeVideoViewEventsWithDefaultClient,
  countVideoViewEventsWithDefaultClient,
} = await import("../js/nostrViewEventsFacade.js");

function temporarilyUnset(client, methodName) {
  const original = client[methodName];
  client[methodName] = undefined;
  return () => {
    client[methodName] = original;
  };
}

async function testListBindingGuardsMissingMethod() {
  const restore = temporarilyUnset(nostrClient, "listVideoViewEvents");
  try {
    assert.throws(
      () => listVideoViewEventsWithDefaultClient({ type: "e", value: "guard" }),
      {
        message: "Video view listing is unavailable in this build.",
      }
    );
  } finally {
    restore();
  }
}

async function testSubscribeBindingGuardsMissingMethod() {
  const restore = temporarilyUnset(nostrClient, "subscribeVideoViewEvents");
  try {
    assert.throws(
      () =>
        subscribeVideoViewEventsWithDefaultClient({ type: "e", value: "guard" }),
      {
        message: "Video view subscriptions are unavailable in this build.",
      }
    );
  } finally {
    restore();
  }
}

async function testCountBindingGuardsMissingMethod() {
  const restore = temporarilyUnset(nostrClient, "countVideoViewEvents");
  try {
    assert.throws(
      () => countVideoViewEventsWithDefaultClient({ type: "e", value: "guard" }),
      {
        message: "Video view counting is unavailable in this build.",
      }
    );
  } finally {
    restore();
  }
}

async function testListBindingPassesThroughWhenAvailable() {
  const pointer = { type: "e", value: "list-success" };
  const options = { limit: 5 };
  const sentinel = [{ id: "1" }];
  const original = nostrClient.listVideoViewEvents;
  let receivedArgs = null;
  nostrClient.listVideoViewEvents = async (...args) => {
    receivedArgs = args;
    return sentinel;
  };
  try {
    const result = await listVideoViewEventsWithDefaultClient(pointer, options);
    assert.equal(result, sentinel, "binding should return the client result");
    assert.deepEqual(
      receivedArgs,
      [pointer, options],
      "binding should forward pointer and options"
    );
  } finally {
    nostrClient.listVideoViewEvents = original;
  }
}

async function testSubscribeBindingPassesThroughWhenAvailable() {
  const pointer = { type: "e", value: "subscribe-success" };
  const handler = () => {};
  const options = { onEvent: handler };
  const original = nostrClient.subscribeVideoViewEvents;
  let receivedArgs = null;
  const unsubscribe = () => "unsub";
  nostrClient.subscribeVideoViewEvents = (...args) => {
    receivedArgs = args;
    return unsubscribe;
  };
  try {
    const result = subscribeVideoViewEventsWithDefaultClient(pointer, options);
    assert.equal(result, unsubscribe, "binding should return unsubscribe value");
    assert.deepEqual(
      receivedArgs,
      [pointer, options],
      "binding should forward subscription arguments"
    );
  } finally {
    nostrClient.subscribeVideoViewEvents = original;
  }
}

async function testCountBindingPassesThroughWhenAvailable() {
  const pointer = { type: "e", value: "count-success" };
  const options = { relays: ["wss://example"] };
  const sentinel = { total: 1 };
  const original = nostrClient.countVideoViewEvents;
  let receivedArgs = null;
  nostrClient.countVideoViewEvents = async (...args) => {
    receivedArgs = args;
    return sentinel;
  };
  try {
    const result = await countVideoViewEventsWithDefaultClient(pointer, options);
    assert.equal(result, sentinel, "binding should return the client result");
    assert.deepEqual(
      receivedArgs,
      [pointer, options],
      "binding should forward pointer and options"
    );
  } finally {
    nostrClient.countVideoViewEvents = original;
  }
}

await testListBindingGuardsMissingMethod();
await testSubscribeBindingGuardsMissingMethod();
await testCountBindingGuardsMissingMethod();
await testListBindingPassesThroughWhenAvailable();
await testSubscribeBindingPassesThroughWhenAvailable();
await testCountBindingPassesThroughWhenAvailable();

console.log("nostr-view-event-bindings tests passed");
