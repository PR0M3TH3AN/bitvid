import { userLogger } from "../utils/logger.js";
// js/feedEngine/engine.js

import { isPlainObject } from "./utils.js";

const DEFAULT_FEED_CONFIG = Object.freeze({
  timeWindow: null,
  actorFilters: [],
  tagFilters: [],
  sortOrder: "recent",
});

const DEFAULT_CONFIG_SCHEMA = Object.freeze({
  timeWindow: {
    type: "relative-window",
    description:
      "Restrict results to a rolling time window (e.g., last 24 hours).",
    default: null,
  },
  actorFilters: {
    type: "string[]",
    description: "Optional list of author pubkeys to include in the feed.",
    default: [],
  },
  tagFilters: {
    type: "string[]",
    description: "Optional list of tag identifiers to include in the feed.",
    default: [],
  },
  sortOrder: {
    type: "enum",
    values: ["recent"],
    description:
      "Controls the final ordering of the feed. Currently only 'recent' is implemented.",
    default: "recent",
  },
});

function normalizeLogger(logger) {
  if (typeof logger === "function") {
    return logger;
  }
  if (logger && typeof logger.log === "function") {
    return (...args) => logger.log(...args);
  }
  return () => {};
}

function normalizeArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry) => typeof entry === "function");
}

function normalizeDto(candidate) {
  if (!candidate || typeof candidate !== "object") {
    return null;
  }

  const video = candidate.video ?? null;
  const pointer = candidate.pointer ?? null;
  const metadata = isPlainObject(candidate.metadata)
    ? { ...candidate.metadata }
    : {};

  return { video, pointer, metadata };
}

function normalizeItems(items) {
  if (!Array.isArray(items)) {
    return [];
  }
  const normalized = [];
  for (const candidate of items) {
    const dto = normalizeDto(candidate);
    if (dto) {
      normalized.push(dto);
    }
  }
  return normalized;
}

function createExecutionContext(entry, { config, hooks, runtime, logger }) {
  const whyLog = [];
  const resolvedLogger = normalizeLogger(logger);

  const context = {
    feedName: entry.name,
    config: { ...entry.defaultConfig, ...(isPlainObject(config) ? config : {}) },
    hooks: isPlainObject(hooks) ? { ...entry.hooks, ...hooks } : { ...entry.hooks },
    runtime: isPlainObject(runtime) ? { ...runtime } : {},
    log: (...args) => {
      try {
        resolvedLogger(`[feed:${entry.name}]`, ...args);
      } catch (error) {
        userLogger.warn(`[feed:${entry.name}] logger threw`, error);
      }
    },
    addWhy: (detail) => {
      if (!isPlainObject(detail)) {
        return;
      }
      const record = { feed: entry.name, ...detail };
      whyLog.push(record);
      return record;
    },
    getWhy: () => whyLog.slice(),
  };

  return context;
}

function normalizeDefinition(name, definition = {}) {
  if (typeof name !== "string" || !name.trim()) {
    throw new Error("Feed name must be a non-empty string");
  }

  if (typeof definition.source !== "function") {
    throw new Error(`Feed \"${name}\" is missing a source function`);
  }

  const stages = normalizeArray(definition.stages);
  const decorators = normalizeArray(definition.decorators);
  const sorter =
    typeof definition.sorter === "function" ? definition.sorter : null;
  const hooks = isPlainObject(definition.hooks) ? { ...definition.hooks } : {};
  const defaultConfig = {
    ...DEFAULT_FEED_CONFIG,
    ...(isPlainObject(definition.defaultConfig) ? definition.defaultConfig : {}),
  };
  const configSchema = isPlainObject(definition.configSchema)
    ? { ...DEFAULT_CONFIG_SCHEMA, ...definition.configSchema }
    : { ...DEFAULT_CONFIG_SCHEMA };

  return {
    name,
    source: definition.source,
    stages,
    sorter,
    decorators,
    hooks,
    defaultConfig,
    configSchema,
    publicDefinition: Object.freeze({
      name,
      configDefaults: { ...defaultConfig },
      configSchema: { ...configSchema },
    }),
  };
}

export function createFeedEngine({ logger } = {}) {
  const feeds = new Map();
  const resolvedLogger = normalizeLogger(logger);

  function registerFeed(name, definition) {
    if (feeds.has(name)) {
      throw new Error(`Feed \"${name}\" is already registered`);
    }

    const entry = normalizeDefinition(name, definition);
    feeds.set(name, entry);
    return entry.publicDefinition;
  }

  async function runFeed(name, options = {}) {
    const entry = feeds.get(name);
    if (!entry) {
      throw new Error(`Feed \"${name}\" is not registered`);
    }

    const context = createExecutionContext(entry, {
      config: options.config,
      hooks: options.hooks,
      runtime: options.runtime,
      logger: resolvedLogger,
    });

    const sourceResult = await entry.source(context);
    let items = normalizeItems(await Promise.resolve(sourceResult));

    for (const stage of entry.stages) {
      const result = await stage(items, context);
      if (Array.isArray(result)) {
        items = normalizeItems(result);
      } else if (result == null) {
        items = normalizeItems(items);
      }
    }

    if (entry.sorter) {
      const sorted = await entry.sorter(items, context);
      if (Array.isArray(sorted)) {
        items = normalizeItems(sorted);
      }
    }

    for (const decorator of entry.decorators) {
      const decorated = await decorator(items, context);
      if (Array.isArray(decorated)) {
        items = normalizeItems(decorated);
      }
    }

    return {
      items,
      videos: items.map((item) => item.video).filter(Boolean),
      metadata: {
        why: context.getWhy(),
        config: context.config,
      },
    };
  }

  function listFeeds() {
    return Array.from(feeds.values()).map((entry) => entry.publicDefinition);
  }

  function getFeedDefinition(name) {
    const entry = feeds.get(name);
    return entry ? entry.publicDefinition : null;
  }

  return {
    registerFeed,
    runFeed,
    listFeeds,
    getFeedDefinition,
  };
}

export { DEFAULT_FEED_CONFIG, DEFAULT_CONFIG_SCHEMA };