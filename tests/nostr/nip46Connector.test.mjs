
import { describe, it, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import { Nip46Connector } from "../../js/nostr/nip46Connector.js";

const VALID_HEX_KEY = "0000000000000000000000000000000000000000000000000000000000000001";
const VALID_PUBKEY = "0000000000000000000000000000000000000000000000000000000000000002";

// Mock dependencies
const mockDeps = {
  parseNip46ConnectionString: mock.fn(),
  generateNip46Secret: mock.fn(),
  readStoredNip46Session: mock.fn(),
  writeStoredNip46Session: mock.fn(),
  clearStoredNip46Session: mock.fn(),
  normalizeNip46EncryptionAlgorithm: mock.fn(),
  decryptNip46Session: mock.fn(),
  attemptDecryptNip46HandshakePayload: mock.fn(),
  sanitizeNip46Metadata: mock.fn((m) => m || {}),
  resolveNip46Relays: mock.fn((r) => r || []),
  normalizeNostrPubkey: mock.fn((k) => k),
  encodeHexToNpub: mock.fn((k) => "npub" + k),
  bytesToHex: mock.fn((b) => VALID_HEX_KEY),
  signEventWithPrivateKey: mock.fn(),
  Nip46RpcClient: class MockRpcClient {
    constructor() {
      this.destroy = mock.fn();
      this.ensureSubscription = mock.fn(() => Promise.resolve());
      this.connect = mock.fn(() => Promise.resolve());
      this.getUserPubkey = mock.fn(() => Promise.resolve(VALID_PUBKEY));
      this.metadata = {};
    }
  },
  ensureNostrTools: mock.fn(async () => ({
    generateSecretKey: () => new Uint8Array(32),
    getPublicKey: () => VALID_PUBKEY,
  })),
  getCachedNostrTools: mock.fn(() => ({
    generateSecretKey: () => new Uint8Array(32),
    getPublicKey: () => VALID_PUBKEY,
  })),
  NIP46_RPC_KIND: 24133,
  NIP46_HANDSHAKE_TIMEOUT_MS: 100,
  NIP46_AUTH_CHALLENGE_MAX_ATTEMPTS: 3,
};

describe("Nip46Connector", () => {
  let connector;
  let mockNostrClient;

  beforeEach(() => {
    // Reset mocks
    Object.values(mockDeps).forEach((m) => {
      if (m.mock) m.mock.resetCalls();
    });

    mockNostrClient = {
      pool: {
        publish: mock.fn(() => Promise.resolve()),
        sub: mock.fn(() => ({
          on: mock.fn(),
          unsub: mock.fn(),
        })),
      },
      ensurePool: mock.fn(async () => mockNostrClient.pool),
      connectToRelays: mock.fn(async () => []),
      emitRemoteSignerChange: mock.fn(),
      relays: ["wss://relay.example.com"],
    };

    connector = new Nip46Connector(mockNostrClient, mockDeps);
  });

  describe("createKeyPair", () => {
    it("should generate a new key pair if none provided", async () => {
      mockDeps.generateNip46Secret.mock.mockImplementationOnce(() => "mock-secret");

      const result = await connector.createKeyPair();

      assert.deepEqual(result, {
        privateKey: VALID_HEX_KEY,
        publicKey: VALID_PUBKEY,
      });
    });

    it("should use existing keys if provided", async () => {
      const result = await connector.createKeyPair(
        VALID_HEX_KEY,
        VALID_PUBKEY
      );
      assert.deepEqual(result, {
        privateKey: VALID_HEX_KEY,
        publicKey: VALID_PUBKEY,
      });
    });
  });

  describe("prepareHandshake", () => {
    it("should parse connection string and return details", async () => {
      mockDeps.generateNip46Secret.mock.mockImplementationOnce(() => "handshake-secret");

      const result = await connector.prepareHandshake({
        connectionString: "bunker://...",
      });

      assert.equal(result.clientPrivateKey, VALID_HEX_KEY);
      assert.equal(result.secret, "handshake-secret");
      assert.match(result.connectionString, /^nostrconnect:\/\//);
    });
  });

  describe("connect", () => {
    it("should connect directly if remote pubkey is known", async () => {
      const options = {
        connectionString: "bunker://remote-pub?relay=wss://relay.com",
        clientPrivateKey: VALID_HEX_KEY,
      };

      mockDeps.parseNip46ConnectionString.mock.mockImplementationOnce(() => ({
        relays: ["wss://relay.com"],
        remotePubkey: VALID_PUBKEY,
        type: "bunker",
      }));
      mockDeps.normalizeNip46EncryptionAlgorithm.mock.mockImplementationOnce(() => "nip44");
      mockDeps.normalizeNostrPubkey.mock.mockImplementation((k) => k);

      const result = await connector.connect(options);

      assert.equal(result.pubkey, VALID_PUBKEY);
      assert.ok(result.client instanceof mockDeps.Nip46RpcClient);
      assert.equal(mockDeps.writeStoredNip46Session.mock.callCount(), 1);
    });
  });

  describe("reconnectStored", () => {
    it("should throw if no stored session", async () => {
      mockDeps.readStoredNip46Session.mock.mockImplementationOnce(() => null);
      await assert.rejects(connector.reconnectStored(), /No remote signer session is stored/);
    });

    it("should reconnect using stored session", async () => {
      mockDeps.readStoredNip46Session.mock.mockImplementationOnce(() => ({
        userPubkey: "user-pub",
        remotePubkey: "remote-pub",
        relays: [],
        clientPrivateKey: "client-priv",
        secret: "secret",
      }));
      mockDeps.decryptNip46Session.mock.mockImplementationOnce((s) => s);

      const result = await connector.reconnectStored();

      assert.equal(result.pubkey, VALID_PUBKEY);
      assert.ok(result.client instanceof mockDeps.Nip46RpcClient);
    });
  });

  describe("disconnect", () => {
    it("should clear stored session and emit change", async () => {
      await connector.disconnect({ keepStored: false });
      assert.equal(mockDeps.clearStoredNip46Session.mock.callCount(), 1);
    });
  });
});
