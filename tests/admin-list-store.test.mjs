// Run with: node tests/admin-list-store.test.mjs

import "./test-helpers/setup-localstorage.mjs";
import assert from "node:assert/strict";

if (typeof globalThis.window === "undefined") {
  globalThis.window = {};
}

if (!globalThis.window.NostrTools) {
  globalThis.window.NostrTools = {};
}

const mockNip19 = {
  decode(value) {
    if (typeof value !== "string") {
      throw new Error("invalid input");
    }
    if (value.trim().toLowerCase().startsWith("npub")) {
      return { type: "npub", data: "mock" };
    }
    throw new Error("unsupported value");
  },
  npubEncode(hex) {
    if (typeof hex !== "string") {
      throw new Error("invalid hex");
    }
    const trimmed = hex.trim();
    if (!trimmed) {
      throw new Error("empty hex");
    }
    return `npub1${trimmed}`;
  },
};

globalThis.window.NostrTools.nip19 = mockNip19;

const capturedWarnings = [];
const originalConsoleWarn = console.warn;
console.warn = (...args) => {
  capturedWarnings.push(args);
};
process.on("exit", () => {
  console.warn = originalConsoleWarn;
});

const { persistAdminState, __adminListStoreTestHooks } = await import(
  "../js/adminListStore.js"
);
const { nostrClient } = await import("../js/nostr.js");
const { ADMIN_SUPER_NPUB } = await import("../js/config.js");

const {
  extractNpubsFromEvent,
  normalizeParticipantTagValue,
  publishListWithFirstAcceptance,
} = __adminListStoreTestHooks;

const sampleHex = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const sampleNpub = "npub1existingparticipant";

const event = {
  tags: [
    ["p", sampleHex],
    ["p", sampleNpub],
    ["p", "  npub1existingparticipant  "],
    ["p", ""],
    ["e", "irrelevant"],
  ],
};

const normalized = extractNpubsFromEvent(event);
assert.deepEqual(
  normalized,
  [
    mockNip19.npubEncode(sampleHex),
    sampleNpub,
  ],
  "should return unique npubs from hex and npub participant tags"
);

mockNip19.decode = () => {
  throw new Error("decode unavailable");
};

assert.equal(
  normalizeParticipantTagValue(sampleNpub),
  sampleNpub,
  "should fall back to the raw npub when decode fails"
);

mockNip19.decode = undefined;
mockNip19.npubEncode = undefined;

globalThis.window.NostrTools.nip19 = mockNip19;

const fallbackHex = "abcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd";

assert.equal(
  normalizeParticipantTagValue(fallbackHex),
  fallbackHex,
  "should preserve hex when nip19 helpers are unavailable"
);

mockNip19.decode = (value) => {
  if (typeof value !== "string") {
    throw new Error("invalid input");
  }
  const trimmed = value.trim();
  if (trimmed.toLowerCase().startsWith("npub")) {
    return { type: "npub", data: `${trimmed}-hex` };
  }
  throw new Error("unsupported value");
};
mockNip19.npubEncode = (hex) => {
  if (typeof hex !== "string") {
    throw new Error("invalid hex");
  }
  const trimmed = hex.trim();
  if (!trimmed) {
    throw new Error("empty hex");
  }
  return `npub1${trimmed}`;
};

globalThis.window.NostrTools.nip19 = mockNip19;

nostrClient.ensureExtensionPermissions = async () => ({ ok: true });

const relays = [
  "wss://relay1.example.com",
  "wss://relay2.example.com",
];
nostrClient.relays = [...relays];
nostrClient.writeRelays = [...relays];

let publishBehaviors = [];
let publishCallIndex = 0;

function setPublishBehaviors(behaviors) {
  publishBehaviors = Array.isArray(behaviors) ? behaviors : [];
  publishCallIndex = 0;
}

nostrClient.pool = {
  publish(urls) {
    const url = Array.isArray(urls) && urls.length > 0 ? urls[0] : "";
    const behavior = publishBehaviors[publishCallIndex++];
    if (!behavior) {
      throw new Error(`Missing publish behavior for ${url}`);
    }
    if (behavior.url && behavior.url !== url) {
      throw new Error(
        `Unexpected publish url ${url}; expected ${behavior.url}`,
      );
    }
    return {
      on(eventName, handler) {
        const schedule = (fn) => {
          const delay =
            typeof behavior.delayMs === "number" && behavior.delayMs >= 0
              ? behavior.delayMs
              : 0;
          if (delay > 0) {
            setTimeout(fn, delay);
          } else {
            queueMicrotask(fn);
          }
        };

        if (eventName === "ok" && behavior.success) {
          schedule(() => {
            handler();
          });
          return true;
        }
        if (eventName === "failed" && !behavior.success) {
          schedule(() => {
            handler(
              behavior.error || new Error(`relay failure for ${url}`),
            );
          });
          return true;
        }
        return false;
      },
    };
  },
};

if (!globalThis.window.nostr) {
  globalThis.window.nostr = {};
}

globalThis.window.nostr.signEvent = async (event) => ({
  ...event,
  id: "signed-event",
});

const additionBehaviors = [
  { url: relays[0], success: false, error: new Error("relay1 add failure") },
  { url: relays[1], success: true },
  { url: relays[0], success: false, error: new Error("relay1 blacklist add failure") },
  { url: relays[1], success: true },
];
setPublishBehaviors(additionBehaviors);

await assert.doesNotReject(
  () =>
    persistAdminState(ADMIN_SUPER_NPUB, {
      whitelist: ["npub1whitelistmember"],
      blacklist: ["npub1blacklistmember"],
    }),
  "should allow adding whitelist/blacklist entries without rejection",
);

assert.equal(
  publishCallIndex,
  additionBehaviors.length,
  "should attempt to publish additions to every relay",
);

const removalBehaviors = [
  { url: relays[0], success: false, error: new Error("relay1 remove failure") },
  { url: relays[1], success: true },
  { url: relays[0], success: false, error: new Error("relay1 blacklist remove failure") },
  { url: relays[1], success: true },
];
setPublishBehaviors(removalBehaviors);

await assert.doesNotReject(
  () =>
    persistAdminState(ADMIN_SUPER_NPUB, {
      whitelist: [],
      blacklist: [],
    }),
  "should allow removing whitelist/blacklist entries without rejection",
);

assert.equal(
  publishCallIndex,
  removalBehaviors.length,
  "should attempt to publish removals to every relay",
);

nostrClient.writeRelays = [relays[1]];

const writerelayBehaviors = [
  { url: relays[1], success: true },
];
setPublishBehaviors(writerelayBehaviors);

await assert.doesNotReject(
  () =>
    persistAdminState(ADMIN_SUPER_NPUB, {
      whitelist: ["npub1writerelaymember"],
    }),
  "should publish whitelist updates to configured write relays",
);

assert.equal(
  publishCallIndex,
  writerelayBehaviors.length,
  "should target only write relays when available",
);

nostrClient.writeRelays = [];

const slowRelayDelayMs = 75;
const fastAcceptanceBehaviors = [
  { url: relays[0], success: true },
  {
    url: relays[1],
    success: false,
    error: new Error("relay2 slow failure"),
    delayMs: slowRelayDelayMs,
  },
];
setPublishBehaviors(fastAcceptanceBehaviors);

const startTime = Date.now();

await assert.doesNotReject(
  () =>
    persistAdminState(ADMIN_SUPER_NPUB, {
      whitelist: ["npub1fastacceptance"],
    }),
  "should resolve whitelist updates after the first relay acceptance",
);

const durationMs = Date.now() - startTime;
assert.ok(
  durationMs < slowRelayDelayMs,
  `should not wait for slower relay failures (duration ${durationMs}ms >= ${slowRelayDelayMs}ms)`,
);

await new Promise((resolve) => setTimeout(resolve, slowRelayDelayMs + 20));

const relayFailureWarnings = capturedWarnings.filter((entry) => {
  const [, message] = entry;
  return (
    typeof message === "string" &&
    message.startsWith("[adminListStore] Publish failed")
  );
});
const failureMessages = relayFailureWarnings.map(([, message]) => message);
const whitelistFailureCount = failureMessages.filter((message) =>
  typeof message === "string" &&
  message.includes("whitelist") &&
  message.includes(relays[0])
).length;
const blacklistFailureCount = failureMessages.filter((message) =>
  typeof message === "string" &&
  message.includes("blacklist") &&
  message.includes(relays[0])
).length;

assert.equal(
  relayFailureWarnings.length,
  5,
  "should warn for each relay failure across scenarios",
);
assert.ok(
  whitelistFailureCount >= 2,
  "should warn when whitelist updates fail on a relay",
);
assert.ok(
  blacklistFailureCount >= 2,
  "should warn when blacklist updates fail on a relay",
);

console.log("admin-list-store tests passed");
