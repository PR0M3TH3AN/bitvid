import assert from "node:assert/strict";
import test from "node:test";

import {
  nostrClient as facadeClient,
  requestDefaultExtensionPermissions as facadeRequest,
} from "../../js/nostrClientFacade.js";
import {
  nostrClient as directClient,
  requestDefaultExtensionPermissions as directRequest,
} from "../../js/nostr/defaultClient.js";

test("nostrClientFacade forwards the default client instance", () => {
  assert.equal(
    facadeClient,
    directClient,
    "facade should expose the default client singleton",
  );
});

test("nostrClientFacade forwards the default permission helper", async () => {
  assert.equal(
    facadeRequest,
    directRequest,
    "facade should reuse the registered permission helper",
  );
});
