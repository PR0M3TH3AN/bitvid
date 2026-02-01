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

const {
  loadAdminState,
  persistAdminState,
  readCachedAdminState,
  __adminListStoreTestHooks,
} = await import(
  "../js/adminListStore.js"
);
const [{ nostrClient }, { setActiveSigner }] = await Promise.all([
  import("../js/nostrClientFacade.js"),
  import("../js/nostr/client.js"),
]);
const {
  ADMIN_SUPER_NPUB,
  ADMIN_LIST_NAMESPACE,
  ADMIN_COMMUNITY_BLACKLIST_PREFIX,
  ADMIN_COMMUNITY_BLACKLIST_SOURCES,
} = await import("../js/config.js");
const { ADMIN_LIST_IDENTIFIERS } = await import(
  "../js/nostrEventSchemas.js"
);
const { AccessControl } = await import("../js/accessControl.js");

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

if (typeof localStorage !== "undefined") {
  localStorage.clear();
}

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

const superHex = mockNip19.decode(ADMIN_SUPER_NPUB).data;
const editorNpub = "npub1editormember";
const whitelistNpub = "npub1whitelistmember";
const directBlacklistNpub = "npub1directblacklist";
const communityMemberNpub = "npub1communityblacklist";
const communitySecondMemberNpub = "npub1communitytwo";
const communityCuratorOneNpub = "npub1communitycurator";
const communityCuratorTwoNpub = "npub1communitycurator2";
const communityCuratorOneHex = mockNip19.decode(communityCuratorOneNpub).data;
const communityCuratorTwoHex = mockNip19.decode(communityCuratorTwoNpub).data;
const communityCuratorOneAuthorHex = mockNip19.decode(
  communityCuratorOneHex
).data;
const communityCuratorTwoAuthorHex = mockNip19.decode(
  communityCuratorTwoHex
).data;
const editorsDTag = `${ADMIN_LIST_NAMESPACE}:${ADMIN_LIST_IDENTIFIERS.editors}`;
const whitelistDTag = `${ADMIN_LIST_NAMESPACE}:${ADMIN_LIST_IDENTIFIERS.whitelist}`;
const blacklistDTag = `${ADMIN_LIST_NAMESPACE}:${ADMIN_LIST_IDENTIFIERS.blacklist}`;
const communitySourceDTag = `${ADMIN_LIST_NAMESPACE}:${ADMIN_COMMUNITY_BLACKLIST_SOURCES}`;
const communityListOneDTag = `${ADMIN_LIST_NAMESPACE}:${ADMIN_COMMUNITY_BLACKLIST_PREFIX}:crew-alpha`;
const communityListTwoDTag = `${ADMIN_LIST_NAMESPACE}:${ADMIN_COMMUNITY_BLACKLIST_PREFIX}:crew-beta`;

function setPublishBehaviors(behaviors) {
  publishBehaviors = Array.isArray(behaviors) ? behaviors : [];
  publishCallIndex = 0;
}

const listEventRegistry = new Map();
let listFailureMode = null;

function resetListRegistry() {
  listEventRegistry.clear();
  listFailureMode = null;
}

function registerListEvent({ dTag, authorHex = null, event }) {
  const key = `${authorHex || "*"}::${dTag}`;
  listEventRegistry.set(key, event);
}

function createListEvent({ dTag, tags, pubkey, createdAt }) {
  return {
    kind: 30000,
    pubkey: pubkey || "",
    created_at: typeof createdAt === "number" ? createdAt : Math.floor(Date.now() / 1000),
    id: `${dTag}:${pubkey || "anon"}:${createdAt || 0}`,
    tags: Array.isArray(tags) ? tags : [],
  };
}

function setListFailureMode(mode) {
  listFailureMode = typeof mode === "string" ? mode : null;
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
  async list(relayUrls, filters) {
    const filter = Array.isArray(filters) && filters.length ? filters[0] : {};
    const dValues = Array.isArray(filter?.["#d"]) ? filter["#d"] : [];
    const authors = Array.isArray(filter?.authors) ? filter.authors : [];
    const dTag = dValues.length ? dValues[0] : "";
    const authorKey = authors.length ? authors[0] : "*";

    if (listFailureMode === "throw-all") {
      throw new Error("list failure for cache test");
    }

    if (listFailureMode === "throw-authors" && authors.length) {
      throw new Error("list failure for authors");
    }

    if (listFailureMode === "throw-community") {
      const fullSourceTag = `${ADMIN_LIST_NAMESPACE}:${ADMIN_COMMUNITY_BLACKLIST_SOURCES}`;
      const fullPrefix = `${ADMIN_LIST_NAMESPACE}:${ADMIN_COMMUNITY_BLACKLIST_PREFIX}`;
      if (dTag === fullSourceTag || dTag.startsWith(fullPrefix)) {
        throw new Error("list failure for community");
      }
    }

    const key = `${authorKey}::${dTag}`;
    const fallbackKey = `*::${dTag}`;
    const event = listEventRegistry.get(key) || listEventRegistry.get(fallbackKey);

    if (!event) {
      return [];
    }

    return [event];
  },
};

if (!globalThis.window.nostr) {
  globalThis.window.nostr = {};
}

globalThis.window.nostr.signEvent = async (event) => ({
  ...event,
  id: "signed-event",
});

setActiveSigner({
  pubkey: superHex,
  signEvent: globalThis.window.nostr.signEvent,
  type: "test",
});

resetListRegistry();

registerListEvent({
  dTag: editorsDTag,
  event: createListEvent({
    dTag: editorsDTag,
    pubkey: superHex,
    createdAt: 1,
    tags: [["p", editorNpub]],
  }),
});
registerListEvent({
  dTag: whitelistDTag,
  event: createListEvent({
    dTag: whitelistDTag,
    pubkey: superHex,
    createdAt: 2,
    tags: [["p", whitelistNpub]],
  }),
});
registerListEvent({
  dTag: blacklistDTag,
  event: createListEvent({
    dTag: blacklistDTag,
    pubkey: superHex,
    createdAt: 3,
    tags: [["p", directBlacklistNpub]],
  }),
});
registerListEvent({
  dTag: communitySourceDTag,
  authorHex: superHex,
  event: createListEvent({
    dTag: communitySourceDTag,
    pubkey: superHex,
    createdAt: 4,
    tags: [
      ["a", `30000:${communityCuratorOneHex}:${communityListOneDTag}`],
      ["a", `30000:${communityCuratorOneHex}:${communityListOneDTag}`],
      ["a", `10000:${communityCuratorOneHex}:${communityListOneDTag}`],
      ["a", `30000:${communityCuratorTwoHex}:${communityListTwoDTag}`],
      ["p", editorNpub],
    ],
  }),
});
registerListEvent({
  dTag: communityListOneDTag,
  authorHex: communityCuratorOneAuthorHex,
  event: createListEvent({
    dTag: communityListOneDTag,
    pubkey: communityCuratorOneHex,
    createdAt: 5,
    tags: [
      ["p", communityMemberNpub],
      ["p", directBlacklistNpub],
      ["p", ADMIN_SUPER_NPUB],
      ["p", whitelistNpub],
      ["p", editorNpub],
    ],
  }),
});
registerListEvent({
  dTag: communityListTwoDTag,
  authorHex: communityCuratorTwoAuthorHex,
  event: createListEvent({
    dTag: communityListTwoDTag,
    pubkey: communityCuratorTwoHex,
    createdAt: 6,
    tags: [
      ["p", communitySecondMemberNpub],
      ["p", communitySecondMemberNpub],
    ],
  }),
});

const adminState = await loadAdminState();

assert.deepEqual(
  adminState.editors,
  [editorNpub],
  "should hydrate editors from the primary admin list",
);
assert.deepEqual(
  adminState.whitelist,
  [whitelistNpub],
  "should hydrate whitelist entries from the primary admin list",
);
assert.deepEqual(
  adminState.blacklist,
  [directBlacklistNpub, communityMemberNpub, communitySecondMemberNpub],
  "should merge community blacklists with base entries while deduping and respecting guards",
);
assert.ok(
  !adminState.blacklist.includes(ADMIN_SUPER_NPUB),
  "should exclude super admin from merged blacklist",
);
assert.ok(
  !adminState.blacklist.includes(whitelistNpub),
  "should exclude whitelist members from merged blacklist",
);
assert.ok(
  !adminState.blacklist.includes(editorNpub),
  "should exclude editor members from merged blacklist",
);

const cachedSnapshot = readCachedAdminState();
assert.deepEqual(
  cachedSnapshot,
  adminState,
  "should cache the merged admin state after successful load",
);

setListFailureMode("throw-all");

const cachedFallback = await loadAdminState();
assert.deepEqual(
  cachedFallback,
  adminState,
  "should return cached admin state when relay queries fail",
);

const accessControlFromCache = new AccessControl();

assert.ok(
  accessControlFromCache.getEditors().includes(editorNpub),
  "should hydrate access control editors from cached state",
);
assert.deepEqual(
  accessControlFromCache.getWhitelist(),
  adminState.whitelist,
  "should hydrate access control whitelist from cached state",
);
assert.deepEqual(
  accessControlFromCache.getBlacklist(),
  adminState.blacklist,
  "should hydrate access control blacklist from cached state",
);

await assert.doesNotReject(
  () => accessControlFromCache.refresh(),
  "should keep cached state available when refresh relies on cached data",
);

assert.deepEqual(
  accessControlFromCache.getBlacklist(),
  adminState.blacklist,
  "should preserve cached blacklist entries after a failed refresh",
);

setListFailureMode(null);

resetListRegistry();
setListFailureMode("throw-community");

registerListEvent({
  dTag: editorsDTag,
  event: createListEvent({
    dTag: editorsDTag,
    pubkey: superHex,
    createdAt: 11,
    tags: [["p", editorNpub]],
  }),
});
registerListEvent({
  dTag: whitelistDTag,
  event: createListEvent({
    dTag: whitelistDTag,
    pubkey: superHex,
    createdAt: 12,
    tags: [["p", whitelistNpub]],
  }),
});
registerListEvent({
  dTag: blacklistDTag,
  event: createListEvent({
    dTag: blacklistDTag,
    pubkey: superHex,
    createdAt: 13,
    tags: [["p", directBlacklistNpub]],
  }),
});

const fallbackState = await loadAdminState();

assert.deepEqual(
  fallbackState.blacklist,
  [directBlacklistNpub],
  "should fall back to base blacklist when community list loading fails",
);

resetListRegistry();
setListFailureMode(null);

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
