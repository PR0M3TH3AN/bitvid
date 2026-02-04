import assert from "node:assert/strict";
import test from "node:test";

import nip07Provider from "../../js/services/authProviders/nip07.js";
import nip46Provider from "../../js/services/authProviders/nip46.js";
import nsecProvider from "../../js/services/authProviders/nsec.js";
import generateProvider from "../../js/services/authProviders/generate.js";

const buildHex = (char) => char.repeat(64);

// NIP-07 Provider Tests
test("nip07Provider: has correct metadata", () => {
  assert.equal(nip07Provider.id, "nip07");
  assert.equal(nip07Provider.label, "extension (nip-07)");
  assert.ok(nip07Provider.description.includes("NIP-07"));
  assert.ok(Array.isArray(nip07Provider.capabilities));
  assert.equal(typeof nip07Provider.login, "function");
});

test("nip07Provider: login throws when nostrClient unavailable", async () => {
  await assert.rejects(
    async () => nip07Provider.login({}),
    { code: "provider-unavailable" }
  );

  await assert.rejects(
    async () => nip07Provider.login({ nostrClient: null }),
    { code: "provider-unavailable" }
  );
});

test("nip07Provider: login throws when loginWithExtension missing", async () => {
  const mockClient = {
    // Missing loginWithExtension
  };

  await assert.rejects(
    async () => nip07Provider.login({ nostrClient: mockClient }),
    { code: "provider-unavailable" }
  );
});

test("nip07Provider: login returns pubkey and signer on success", async () => {
  const expectedPubkey = buildHex("a");
  const mockSigner = { type: "nip07" };

  const mockClient = {
    loginWithExtension: async () => ({
      pubkey: expectedPubkey,
      signer: mockSigner,
    }),
  };

  // Mock accessControl
  const originalAccessControl = await import("../../js/accessControl.js");
  const result = await nip07Provider.login({ nostrClient: mockClient });

  assert.equal(result.authType, "nip07");
  assert.equal(result.pubkey, expectedPubkey);
  assert.equal(result.signer, mockSigner);
});

test("nip07Provider: login normalizes string pubkey result", async () => {
  const expectedPubkey = buildHex("b");

  const mockClient = {
    loginWithExtension: async () => expectedPubkey, // Returns string directly
  };

  const result = await nip07Provider.login({ nostrClient: mockClient });

  assert.equal(result.pubkey, expectedPubkey);
});

test("nip07Provider: login handles publicKey property", async () => {
  const expectedPubkey = buildHex("c");

  const mockClient = {
    loginWithExtension: async () => ({
      publicKey: expectedPubkey, // Uses publicKey instead of pubkey
    }),
  };

  const result = await nip07Provider.login({ nostrClient: mockClient });

  assert.equal(result.pubkey, expectedPubkey);
});

// NIP-46 Provider Tests
test("nip46Provider: has correct metadata", () => {
  assert.equal(nip46Provider.id, "nip46");
  assert.equal(nip46Provider.label, "remote signer (nip-46)");
  assert.ok(nip46Provider.description.includes("remote signer"));
  assert.ok(Array.isArray(nip46Provider.capabilities));
  assert.equal(typeof nip46Provider.login, "function");
});

test("nip46Provider: login throws when nostrClient unavailable", async () => {
  await assert.rejects(
    async () => nip46Provider.login({}),
    { code: "provider-unavailable" }
  );

  await assert.rejects(
    async () => nip46Provider.login({ nostrClient: null }),
    { code: "provider-unavailable" }
  );
});

test("nip46Provider: login throws when connectRemoteSigner missing", async () => {
  const mockClient = {
    // Missing connectRemoteSigner
  };

  await assert.rejects(
    async () => nip46Provider.login({ nostrClient: mockClient }),
    { code: "provider-unavailable" }
  );
});

test("nip46Provider: login in manual mode requires connectionString", async () => {
  const mockClient = {
    connectRemoteSigner: async () => ({}),
  };

  await assert.rejects(
    async () =>
      nip46Provider.login({
        nostrClient: mockClient,
        options: { mode: "manual", connectionString: "" },
      }),
    { code: "connection-required" }
  );
});

test("nip46Provider: login in manual mode uses connectionString", async () => {
  const expectedPubkey = buildHex("d");
  let receivedConnectionString = null;

  const mockClient = {
    connectRemoteSigner: async ({ connectionString }) => {
      receivedConnectionString = connectionString;
      return { pubkey: expectedPubkey };
    },
  };

  const testUri = "nostrconnect://test?secret=abc123";

  const result = await nip46Provider.login({
    nostrClient: mockClient,
    options: {
      mode: "manual",
      connectionString: testUri,
    },
  });

  assert.equal(receivedConnectionString, testUri);
  assert.equal(result.pubkey, expectedPubkey);
  assert.equal(result.authType, "nip46");
});

test("nip46Provider: login with reuseStored calls useStoredRemoteSigner", async () => {
  const expectedPubkey = buildHex("e");
  let usedStoredSigner = false;

  const mockClient = {
    connectRemoteSigner: async () => {
      throw new Error("Should not be called");
    },
    useStoredRemoteSigner: async () => {
      usedStoredSigner = true;
      return { pubkey: expectedPubkey };
    },
  };

  const result = await nip46Provider.login({
    nostrClient: mockClient,
    options: { reuseStored: true },
  });

  assert.equal(usedStoredSigner, true);
  assert.equal(result.pubkey, expectedPubkey);
});

test("nip46Provider: login with reuseStored throws when no stored session", async () => {
  const mockClient = {
    connectRemoteSigner: async () => ({}),
    // Missing useStoredRemoteSigner
  };

  await assert.rejects(
    async () =>
      nip46Provider.login({
        nostrClient: mockClient,
        options: { reuseStored: true },
      }),
    { code: "no-stored-session" }
  );
});

test("nip46Provider: login in handshake mode prepares handshake", async () => {
  const expectedPubkey = buildHex("f");
  let preparedHandshake = false;
  let handshakeData = null;

  const mockHandshake = {
    connectionString: "nostrconnect://test",
    clientPublicKey: buildHex("1"),
    clientPrivateKey: buildHex("2"),
    secret: "test-secret",
    relays: ["wss://relay.example.com"],
    permissions: "",
    metadata: {},
  };

  const mockClient = {
    prepareRemoteSignerHandshake: async (options) => {
      preparedHandshake = true;
      return mockHandshake;
    },
    connectRemoteSigner: async (options) => {
      handshakeData = options;
      return { pubkey: expectedPubkey };
    },
  };

  const result = await nip46Provider.login({
    nostrClient: mockClient,
    options: { mode: "handshake" },
  });

  assert.equal(preparedHandshake, true);
  assert.equal(handshakeData.connectionString, mockHandshake.connectionString);
  assert.equal(result.pubkey, expectedPubkey);
});

test("nip46Provider: login calls onHandshakePrepared callback", async () => {
  const expectedPubkey = buildHex("1");
  let callbackHandshake = null;

  const mockHandshake = {
    connectionString: "nostrconnect://test",
    clientPublicKey: buildHex("2"),
    clientPrivateKey: buildHex("3"),
    secret: "test-secret",
    relays: [],
    permissions: "",
    metadata: {},
  };

  const mockClient = {
    prepareRemoteSignerHandshake: async () => mockHandshake,
    connectRemoteSigner: async () => ({ pubkey: expectedPubkey }),
  };

  await nip46Provider.login({
    nostrClient: mockClient,
    options: {
      mode: "handshake",
      onHandshakePrepared: (handshake) => {
        callbackHandshake = handshake;
      },
    },
  });

  assert.deepEqual(callbackHandshake, mockHandshake);
});

test("nip46Provider: login calls onStatus callback", async () => {
  const statusUpdates = [];

  const mockHandshake = {
    connectionString: "nostrconnect://test",
    clientPublicKey: buildHex("4"),
    clientPrivateKey: buildHex("5"),
    secret: "test-secret",
    relays: [],
    permissions: "",
    metadata: {},
  };

  const mockClient = {
    prepareRemoteSignerHandshake: async () => mockHandshake,
    connectRemoteSigner: async () => ({ pubkey: buildHex("6") }),
  };

  await nip46Provider.login({
    nostrClient: mockClient,
    options: {
      mode: "handshake",
      onStatus: (status) => {
        statusUpdates.push(status);
      },
    },
  });

  assert.ok(statusUpdates.length > 0);
  assert.equal(statusUpdates[0].phase, "handshake");
  assert.equal(statusUpdates[0].state, "preparing");
});

// NSEC Provider Tests
test("nsecProvider: has correct metadata", async () => {
  const module = await import("../../js/services/authProviders/nsec.js");
  const provider = module.default;

  assert.equal(provider.id, "nsec");
  assert.ok(provider.label.includes("nsec"));
  assert.equal(typeof provider.login, "function");
});

test("nsecProvider: login throws when nostrClient unavailable", async () => {
  const module = await import("../../js/services/authProviders/nsec.js");
  const provider = module.default;

  // When nostrClient is missing/invalid, it throws provider-unavailable
  await assert.rejects(
    async () => provider.login({ options: {} }),
    { code: "provider-unavailable" }
  );

  await assert.rejects(
    async () => provider.login({ nostrClient: null, options: {} }),
    { code: "provider-unavailable" }
  );
});

// Generate Provider Tests
test("generateProvider: has correct metadata", async () => {
  const module = await import("../../js/services/authProviders/generate.js");
  const provider = module.default;

  assert.equal(provider.id, "generate");
  // Label is "Create Account"
  assert.ok(provider.label.includes("Create") || provider.label.includes("Account"));
  assert.equal(typeof provider.login, "function");
});

// Provider Index Tests
test("authProviders index: exports all providers", async () => {
  const module = await import("../../js/services/authProviders/index.js");

  // Index exports providers as a map
  assert.ok(module.providers, "Should export providers map");
  assert.ok(module.providers.nip07, "Should have nip07 provider");
  assert.ok(module.providers.nip46, "Should have nip46 provider");
  assert.ok(module.providers.nsec, "Should have nsec provider");
  assert.ok(module.providers.generate, "Should have generate provider");

  // Should also export getProvider function
  assert.equal(typeof module.getProvider, "function");
  assert.equal(typeof module.default, "function"); // default is getProvider
});

// Integration-style tests for provider capabilities
test("providers: all have required interface", async () => {
  const providers = [nip07Provider, nip46Provider];

  for (const provider of providers) {
    assert.ok(provider.id, `Provider missing id`);
    assert.ok(provider.label, `Provider ${provider.id} missing label`);
    assert.ok(provider.description, `Provider ${provider.id} missing description`);
    assert.ok(Array.isArray(provider.capabilities), `Provider ${provider.id} missing capabilities`);
    assert.ok(provider.button, `Provider ${provider.id} missing button config`);
    assert.ok(provider.messages, `Provider ${provider.id} missing messages`);
    assert.equal(typeof provider.login, "function", `Provider ${provider.id} missing login function`);
  }
});

test("providers: capabilities have correct structure", () => {
  const providers = [nip07Provider, nip46Provider];

  for (const provider of providers) {
    for (const capability of provider.capabilities) {
      assert.ok(capability.id, `Capability missing id in ${provider.id}`);
      assert.ok(capability.label, `Capability missing label in ${provider.id}`);
      assert.ok(capability.variant, `Capability missing variant in ${provider.id}`);
    }
  }
});

test("providers: messages have required fields", () => {
  const providers = [nip07Provider, nip46Provider];

  for (const provider of providers) {
    assert.ok(provider.messages.loading, `Provider ${provider.id} missing loading message`);
    assert.ok(provider.messages.slow, `Provider ${provider.id} missing slow message`);
    assert.ok(provider.messages.error, `Provider ${provider.id} missing error message`);
  }
});
