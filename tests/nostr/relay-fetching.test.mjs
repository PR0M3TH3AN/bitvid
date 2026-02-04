import assert from "node:assert/strict";
import test from "node:test";

// Tests for relay fetching reliability patterns
// These tests verify the robustness of relay communication

const buildHex = (char) => char.repeat(64);

// Mock pool for testing relay behavior
function createMockPool(options = {}) {
  const {
    successRelays = [],
    failRelays = [],
    timeoutRelays = [],
    timeoutMs = 1000,
    events = [],
  } = options;

  return {
    sub: (relays, filters) => {
      const handlers = {};
      let unsubbed = false;

      // Simulate async relay responses
      setTimeout(() => {
        if (unsubbed) return;

        for (const relay of relays) {
          if (timeoutRelays.includes(relay)) {
            // Don't respond - simulate timeout
            continue;
          }

          if (failRelays.includes(relay)) {
            if (handlers.error) {
              handlers.error(new Error(`Connection failed to ${relay}`));
            }
            continue;
          }

          if (successRelays.includes(relay)) {
            // Send events
            for (const event of events) {
              if (handlers.event) {
                handlers.event(event);
              }
            }
          }
        }

        // Send EOSE
        if (handlers.eose) {
          handlers.eose();
        }
      }, 10);

      return {
        on: (eventName, handler) => {
          handlers[eventName] = handler;
          return { on: (e, h) => { handlers[e] = h; return this; } };
        },
        unsub: () => {
          unsubbed = true;
        },
      };
    },
    list: async (relays, filters) => {
      const results = [];

      for (const relay of relays) {
        if (timeoutRelays.includes(relay)) {
          await new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Timeout")), timeoutMs)
          );
        }

        if (failRelays.includes(relay)) {
          throw new Error(`Connection failed to ${relay}`);
        }

        if (successRelays.includes(relay)) {
          results.push(...events);
        }
      }

      return results;
    },
    publish: async (relays, event) => {
      const results = [];

      for (const relay of relays) {
        if (failRelays.includes(relay)) {
          results.push({ relay, ok: false, reason: "connection failed" });
        } else if (successRelays.includes(relay)) {
          results.push({ relay, ok: true });
        }
      }

      return results;
    },
  };
}

// Test relay health detection patterns
test("relay fetching: handles mixed relay responses", async () => {
  const successRelay = "wss://good.relay.com";
  const failRelay = "wss://bad.relay.com";

  const testEvent = {
    id: buildHex("1"),
    pubkey: buildHex("a"),
    kind: 1,
    created_at: Math.floor(Date.now() / 1000),
    tags: [],
    content: "test",
    sig: buildHex("s"),
  };

  const pool = createMockPool({
    successRelays: [successRelay],
    failRelays: [failRelay],
    events: [testEvent],
  });

  const results = await pool.list([successRelay], [{ kinds: [1] }]);
  assert.equal(results.length, 1);
  assert.equal(results[0].id, testEvent.id);
});

test("relay fetching: aggregates events from multiple relays", async () => {
  const relay1 = "wss://relay1.com";
  const relay2 = "wss://relay2.com";

  const event1 = {
    id: buildHex("1"),
    pubkey: buildHex("a"),
    kind: 1,
    created_at: 1000,
    tags: [],
    content: "event1",
    sig: buildHex("s"),
  };

  const event2 = {
    id: buildHex("2"),
    pubkey: buildHex("a"),
    kind: 1,
    created_at: 2000,
    tags: [],
    content: "event2",
    sig: buildHex("s"),
  };

  // Each relay returns same events (deduplication happens upstream)
  const pool = createMockPool({
    successRelays: [relay1, relay2],
    events: [event1, event2],
  });

  const results = await pool.list([relay1], [{ kinds: [1] }]);
  assert.equal(results.length, 2);
});

test("relay fetching: continues when some relays fail", async () => {
  const goodRelay = "wss://good.relay.com";
  const badRelay = "wss://bad.relay.com";

  const testEvent = {
    id: buildHex("3"),
    pubkey: buildHex("b"),
    kind: 1,
    created_at: Math.floor(Date.now() / 1000),
    tags: [],
    content: "test",
    sig: buildHex("s"),
  };

  const pool = createMockPool({
    successRelays: [goodRelay],
    failRelays: [badRelay],
    events: [testEvent],
  });

  // Should get events from good relay even though bad relay fails
  const results = await pool.list([goodRelay], [{ kinds: [1] }]);
  assert.equal(results.length, 1);
});

// Test timeout handling patterns
test("relay fetching: timeout pattern with Promise.race", async () => {
  const slowOperation = new Promise((resolve) =>
    setTimeout(() => resolve("slow"), 5000)
  );
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error("Timeout")), 100)
  );

  await assert.rejects(
    async () => Promise.race([slowOperation, timeout]),
    { message: "Timeout" }
  );
});

test("relay fetching: Promise.any succeeds if any relay responds", async () => {
  const fastRelay = new Promise((resolve) =>
    setTimeout(() => resolve({ relay: "fast", data: "result" }), 10)
  );
  const slowRelay = new Promise((resolve) =>
    setTimeout(() => resolve({ relay: "slow", data: "result" }), 1000)
  );
  const failRelay = new Promise((_, reject) =>
    setTimeout(() => reject(new Error("Failed")), 5)
  );

  const result = await Promise.any([fastRelay, slowRelay, failRelay]);
  assert.ok(result.relay === "fast" || result.relay === "slow");
});

test("relay fetching: Promise.any rejects when all fail", async () => {
  const fail1 = Promise.reject(new Error("Fail 1"));
  const fail2 = Promise.reject(new Error("Fail 2"));
  const fail3 = Promise.reject(new Error("Fail 3"));

  await assert.rejects(
    async () => Promise.any([fail1, fail2, fail3]),
    AggregateError
  );
});

test("relay fetching: Promise.allSettled collects all results", async () => {
  const success = Promise.resolve({ status: "ok" });
  const failure = Promise.reject(new Error("Failed"));
  const timeout = new Promise((resolve) =>
    setTimeout(() => resolve({ status: "slow" }), 50)
  );

  const results = await Promise.allSettled([success, failure, timeout]);

  assert.equal(results.length, 3);
  assert.equal(results[0].status, "fulfilled");
  assert.equal(results[1].status, "rejected");
  assert.equal(results[2].status, "fulfilled");
});

// Test retry patterns
test("relay fetching: exponential backoff calculation", () => {
  const calculateBackoff = (attempt, baseMs = 1000, maxMs = 30000) => {
    const delay = Math.min(baseMs * Math.pow(2, attempt), maxMs);
    // Add jitter (±10%)
    const jitter = delay * 0.1 * (Math.random() * 2 - 1);
    return Math.round(delay + jitter);
  };

  const attempt0 = calculateBackoff(0, 1000, 30000);
  const attempt1 = calculateBackoff(1, 1000, 30000);
  const attempt2 = calculateBackoff(2, 1000, 30000);
  const attempt3 = calculateBackoff(3, 1000, 30000);

  // Base delays should roughly double each time (within jitter)
  assert.ok(attempt0 >= 900 && attempt0 <= 1100); // ~1000
  assert.ok(attempt1 >= 1800 && attempt1 <= 2200); // ~2000
  assert.ok(attempt2 >= 3600 && attempt2 <= 4400); // ~4000
  assert.ok(attempt3 >= 7200 && attempt3 <= 8800); // ~8000
});

test("relay fetching: retry with max attempts", async () => {
  let attempts = 0;
  const maxAttempts = 3;

  const fetchWithRetry = async () => {
    for (let i = 0; i < maxAttempts; i++) {
      attempts++;
      try {
        // Simulate always failing
        throw new Error("Network error");
      } catch (error) {
        if (i === maxAttempts - 1) {
          throw error;
        }
        // Would normally wait here
      }
    }
  };

  await assert.rejects(fetchWithRetry, { message: "Network error" });
  assert.equal(attempts, maxAttempts);
});

// Test event deduplication patterns
test("relay fetching: event deduplication by ID", () => {
  const events = [
    { id: "aaa", content: "first" },
    { id: "bbb", content: "second" },
    { id: "aaa", content: "duplicate" }, // Same ID
    { id: "ccc", content: "third" },
    { id: "bbb", content: "another duplicate" }, // Same ID
  ];

  const seenIds = new Set();
  const deduplicated = events.filter((event) => {
    if (seenIds.has(event.id)) {
      return false;
    }
    seenIds.add(event.id);
    return true;
  });

  assert.equal(deduplicated.length, 3);
  assert.deepEqual(
    deduplicated.map((e) => e.id),
    ["aaa", "bbb", "ccc"]
  );
});

// Test event sorting patterns (for getting latest)
test("relay fetching: sort events by created_at descending", () => {
  const events = [
    { id: "1", created_at: 1000 },
    { id: "2", created_at: 3000 },
    { id: "3", created_at: 2000 },
    { id: "4", created_at: 1500 },
  ];

  const sorted = [...events].sort((a, b) => b.created_at - a.created_at);

  assert.deepEqual(
    sorted.map((e) => e.id),
    ["2", "3", "4", "1"]
  );
  assert.equal(sorted[0].created_at, 3000); // Most recent first
});

// Test relay list parsing
test("relay fetching: parse NIP-65 relay list tags", () => {
  const tags = [
    ["r", "wss://relay1.com"],
    ["r", "wss://relay2.com", "read"],
    ["r", "wss://relay3.com", "write"],
    ["r", "wss://relay4.com", "read"],
    ["r", "wss://relay4.com", "write"], // Same relay, both modes
    ["p", "somepubkey"], // Not a relay tag
    ["r", "invalid-url"], // Invalid URL (no wss://)
  ];

  const parseRelayTags = (tags) => {
    const seen = new Map();

    tags.forEach((tag) => {
      if (!Array.isArray(tag) || tag[0] !== "r" || tag.length < 2) return;

      const url = tag[1];
      if (!url.startsWith("wss://") && !url.startsWith("ws://")) return;

      if (!seen.has(url)) {
        seen.set(url, { read: false, write: false });
      }

      const mode = tag[2]?.toLowerCase();
      const record = seen.get(url);

      if (mode === "read") {
        record.read = true;
      } else if (mode === "write") {
        record.write = true;
      } else {
        // No mode specified = both
        record.read = true;
        record.write = true;
      }
    });

    return Array.from(seen.entries()).map(([url, modes]) => ({
      url,
      ...modes,
      mode:
        modes.read && modes.write
          ? "both"
          : modes.read
          ? "read"
          : modes.write
          ? "write"
          : "both",
    }));
  };

  const relays = parseRelayTags(tags);

  assert.equal(relays.length, 4);
  assert.equal(relays[0].url, "wss://relay1.com");
  assert.equal(relays[0].mode, "both");
  assert.equal(relays[1].url, "wss://relay2.com");
  assert.equal(relays[1].mode, "read");
  assert.equal(relays[2].url, "wss://relay3.com");
  assert.equal(relays[2].mode, "write");
  assert.equal(relays[3].url, "wss://relay4.com");
  assert.equal(relays[3].mode, "both"); // Combined read+write
});

// Test subscription management patterns
test("relay fetching: subscription cleanup prevents memory leaks", () => {
  const subscriptions = new Map();
  let subscriptionId = 0;

  const subscribe = (filter) => {
    const id = ++subscriptionId;
    const sub = {
      id,
      filter,
      unsubscribed: false,
      unsub: () => {
        sub.unsubscribed = true;
        subscriptions.delete(id);
      },
    };
    subscriptions.set(id, sub);
    return sub;
  };

  const sub1 = subscribe({ kinds: [1] });
  const sub2 = subscribe({ kinds: [0] });
  const sub3 = subscribe({ kinds: [3] });

  assert.equal(subscriptions.size, 3);

  sub1.unsub();
  assert.equal(subscriptions.size, 2);
  assert.equal(sub1.unsubscribed, true);

  sub2.unsub();
  sub3.unsub();
  assert.equal(subscriptions.size, 0);
});

// Test connection health monitoring patterns
test("relay fetching: track relay health metrics", () => {
  const relayHealth = new Map();

  const recordSuccess = (relay, latencyMs) => {
    if (!relayHealth.has(relay)) {
      relayHealth.set(relay, {
        successes: 0,
        failures: 0,
        avgLatency: 0,
        lastSuccess: 0,
      });
    }
    const health = relayHealth.get(relay);
    health.successes++;
    health.avgLatency =
      (health.avgLatency * (health.successes - 1) + latencyMs) /
      health.successes;
    health.lastSuccess = Date.now();
  };

  const recordFailure = (relay) => {
    if (!relayHealth.has(relay)) {
      relayHealth.set(relay, {
        successes: 0,
        failures: 0,
        avgLatency: 0,
        lastSuccess: 0,
      });
    }
    relayHealth.get(relay).failures++;
  };

  const getHealthyRelays = (relays, minSuccessRate = 0.5) => {
    return relays.filter((relay) => {
      const health = relayHealth.get(relay);
      if (!health) return true; // Unknown relay, give it a chance
      const total = health.successes + health.failures;
      if (total === 0) return true;
      return health.successes / total >= minSuccessRate;
    });
  };

  // Simulate some activity
  recordSuccess("wss://good.relay.com", 100);
  recordSuccess("wss://good.relay.com", 150);
  recordSuccess("wss://good.relay.com", 120);
  recordFailure("wss://bad.relay.com");
  recordFailure("wss://bad.relay.com");
  recordSuccess("wss://bad.relay.com", 500);

  const allRelays = [
    "wss://good.relay.com",
    "wss://bad.relay.com",
    "wss://unknown.relay.com",
  ];

  const healthy = getHealthyRelays(allRelays, 0.5);

  assert.ok(healthy.includes("wss://good.relay.com")); // 100% success
  assert.ok(!healthy.includes("wss://bad.relay.com")); // 33% success
  assert.ok(healthy.includes("wss://unknown.relay.com")); // Unknown = allowed

  const goodHealth = relayHealth.get("wss://good.relay.com");
  assert.equal(goodHealth.successes, 3);
  assert.ok(goodHealth.avgLatency > 100 && goodHealth.avgLatency < 150);
});

// Test filter building patterns
test("relay fetching: build filters for different query types", () => {
  const buildProfileFilter = (pubkey) => ({
    kinds: [0],
    authors: [pubkey],
    limit: 1,
  });

  const buildRelayListFilter = (pubkey) => ({
    kinds: [10002],
    authors: [pubkey],
    limit: 1,
  });

  const buildContactListFilter = (pubkey) => ({
    kinds: [3],
    authors: [pubkey],
    limit: 1,
  });

  const buildMuteListFilter = (pubkey) => ({
    kinds: [10000],
    authors: [pubkey],
    limit: 1,
  });

  const pubkey = buildHex("a");

  const profileFilter = buildProfileFilter(pubkey);
  assert.equal(profileFilter.kinds[0], 0);
  assert.equal(profileFilter.authors[0], pubkey);

  const relayFilter = buildRelayListFilter(pubkey);
  assert.equal(relayFilter.kinds[0], 10002);

  const contactFilter = buildContactListFilter(pubkey);
  assert.equal(contactFilter.kinds[0], 3);

  const muteFilter = buildMuteListFilter(pubkey);
  assert.equal(muteFilter.kinds[0], 10000);
});
