
import { test } from "node:test";
import assert from "node:assert";
import { NostrClient } from "../../js/nostr/client.js";

// Mock global objects if needed
if (!globalThis.localStorage) {
  globalThis.localStorage = {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  };
}

test("NostrClient resilience to COUNT timeouts", async (t) => {
  const client = new NostrClient();
  const relayUrl = "wss://slow.relay.example";
  client.relays = [relayUrl];

  // Mock the pool
  client.pool = {
    ensureRelay: async (url) => {
        return {
            url,
            count: async () => {
                // Simulate timeout by waiting longer than the client's timeout
                await new Promise(r => setTimeout(r, 100));
                // In the real code, withRequestTimeout throws the error, the relay just hangs or returns late.
                // But here we can simulate the client's wrapper throwing 'count-timeout'
                // Actually, client.sendRawCountFrame handles the timeout wrapping.
                // So we just need a promise that hangs.
                return new Promise(() => {});
            }
        };
    }
  };

  // We need to override getRequestTimeoutMs to be very short for the test
  client.getRequestTimeoutMs = () => 10; // 10ms timeout

  // Verify initial state
  assert.strictEqual(client.unreachableRelays.has(relayUrl), false);

  // Trigger the count
  await client.countEventsAcrossRelays([{ kinds: [1] }]);

  // Check if relay was marked unreachable
  // logic:
  // 1. sendRawCountFrame calls withRequestTimeout
  // 2. timeouts after 10ms -> throws 'count-timeout'
  // 3. countEventsAcrossRelays catches 'count-timeout'
  // 4. currently calls markRelayUnreachable

  const isUnreachable = client.unreachableRelays.has(relayUrl);

  assert.strictEqual(isUnreachable, false, "Relay should NOT be marked unreachable after count timeout");
});
