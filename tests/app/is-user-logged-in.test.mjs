import test from "node:test";
import assert from "node:assert/strict";

import { Application } from "../../js/app.js";
import { nostrClient } from "../../js/nostrClientFacade.js";

const HEX64_REGEX = /^[0-9a-f]{64}$/i;

function createTestApp(pubkey) {
  const app = {
    _pubkey: pubkey,
    normalizeHexPubkey(value) {
      if (typeof value !== "string") {
        return null;
      }

      const trimmed = value.trim();
      if (!trimmed) {
        return null;
      }

      if (HEX64_REGEX.test(trimmed)) {
        return trimmed.toLowerCase();
      }

      return null;
    },
    isUserLoggedIn: Application.prototype.isUserLoggedIn,
  };

  Object.defineProperty(app, "pubkey", {
    get() {
      return this._pubkey;
    },
    set(value) {
      this._pubkey = value;
    },
  });

  return app;
}

test("isUserLoggedIn returns false when no user pubkey is set", () => {
  const previousPubkey = nostrClient.pubkey;
  const previousSessionActor = nostrClient.sessionActor;

  try {
    nostrClient.pubkey = null;
    nostrClient.sessionActor = null;

    const app = createTestApp(null);
    assert.equal(app.isUserLoggedIn(), false);
  } finally {
    nostrClient.pubkey = previousPubkey;
    nostrClient.sessionActor = previousSessionActor;
  }
});

test("isUserLoggedIn treats extension logins as authenticated", () => {
  const previousPubkey = nostrClient.pubkey;
  const previousSessionActor = nostrClient.sessionActor;

  try {
    const pubkey = "893a31fa5a6481295bb76ea2dd8d5ec70640e6e6ad398e6547d771e8256af11f";
    nostrClient.pubkey = pubkey;
    nostrClient.sessionActor = { pubkey };

    const app = createTestApp(pubkey);
    assert.equal(app.isUserLoggedIn(), true);
  } finally {
    nostrClient.pubkey = previousPubkey;
    nostrClient.sessionActor = previousSessionActor;
  }
});

test("isUserLoggedIn guards against mismatched nostrClient state", () => {
  const previousPubkey = nostrClient.pubkey;
  const previousSessionActor = nostrClient.sessionActor;

  try {
    const pubkey = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    nostrClient.pubkey = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    nostrClient.sessionActor = { pubkey };

    const app = createTestApp(pubkey);
    assert.equal(app.isUserLoggedIn(), false);
  } finally {
    nostrClient.pubkey = previousPubkey;
    nostrClient.sessionActor = previousSessionActor;
  }
});

test("isUserLoggedIn rejects mismatched session actor pubkeys", () => {
  const previousPubkey = nostrClient.pubkey;
  const previousSessionActor = nostrClient.sessionActor;

  try {
    const pubkey = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    nostrClient.pubkey = pubkey;
    nostrClient.sessionActor = {
      pubkey: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    };

    const app = createTestApp(pubkey);
    assert.equal(app.isUserLoggedIn(), false);
  } finally {
    nostrClient.pubkey = previousPubkey;
    nostrClient.sessionActor = previousSessionActor;
  }
});
