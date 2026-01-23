const DATE_FORMAT_OPTIONS = {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
};

export const DEFAULT_FILTERS = {
  dateRange: {
    after: null,
    before: null,
  },
  sort: "relevance",
  authorPubkeys: [],
  tags: [],
  textScope: "all",
  duration: {
    minSeconds: null,
    maxSeconds: null,
  },
  hasMagnet: null,
  hasUrl: null,
  nsfw: "any",
  relay: null,
  kind: null,
};

const BOOLEAN_OPERATORS = new Set(["AND", "OR", "NOT"]);

const cloneDefaultFilters = () => ({
  dateRange: { ...DEFAULT_FILTERS.dateRange },
  sort: DEFAULT_FILTERS.sort,
  authorPubkeys: [],
  tags: [],
  textScope: DEFAULT_FILTERS.textScope,
  duration: { ...DEFAULT_FILTERS.duration },
  hasMagnet: DEFAULT_FILTERS.hasMagnet,
  hasUrl: DEFAULT_FILTERS.hasUrl,
  nsfw: DEFAULT_FILTERS.nsfw,
  relay: DEFAULT_FILTERS.relay,
  kind: DEFAULT_FILTERS.kind,
});

const normalizeWhitespace = (input) =>
  input.replace(/\s+/g, " ").trim();

const tokenizeQuery = (input) => {
  const tokens = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if (char === '"' && input[i - 1] !== "\\") {
      inQuotes = !inQuotes;
      continue;
    }

    if (!inQuotes && /\s/.test(char)) {
      if (current) {
        tokens.push(current);
        current = "";
      }
      continue;
    }

    current += char;
  }

  if (current) {
    tokens.push(current);
  }

  return tokens;
};

const parseDateValue = (value) => {
  if (!value) return { error: "Date value is missing." };
  if (/^\d+$/.test(value)) {
    const timestamp = Number.parseInt(value, 10);
    if (!Number.isFinite(timestamp)) {
      return { error: "Date timestamp is invalid." };
    }
    return { value: timestamp };
  }

  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return { error: "Date value is invalid." };
  }

  return { value: Math.floor(parsed / 1000) };
};

const parseDurationValue = (value) => {
  const match = value.match(/^(\d+(?:\.\d+)?)(s|m|h)?$/i);
  if (!match) {
    return { error: "Duration format is invalid." };
  }

  const amount = Number.parseFloat(match[1]);
  if (!Number.isFinite(amount)) {
    return { error: "Duration value is invalid." };
  }

  const unit = (match[2] || "s").toLowerCase();
  const multiplier = unit === "h" ? 3600 : unit === "m" ? 60 : 1;

  return { value: Math.round(amount * multiplier) };
};

const applyDurationFilter = (filters, operator, seconds) => {
  if (operator === "<" || operator === "<=") {
    filters.duration.maxSeconds = seconds;
  } else if (operator === ">" || operator === ">=") {
    filters.duration.minSeconds = seconds;
  }
};

const parseKeyValueToken = (token) => {
  const match = token.match(/^([a-zA-Z]+):(.*)$/);
  if (!match) return null;
  return {
    key: match[1].toLowerCase(),
    value: match[2] || "",
  };
};

const formatDateForFilter = (timestampSeconds) => {
  if (!Number.isFinite(timestampSeconds)) return "";
  const date = new Date(timestampSeconds * 1000);
  const parts = new Intl.DateTimeFormat("en-CA", DATE_FORMAT_OPTIONS).formatToParts(
    date,
  );
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
};

const formatDurationValue = (seconds) => {
  if (!Number.isFinite(seconds)) return "";
  if (seconds % 3600 === 0) return `${seconds / 3600}h`;
  if (seconds % 60 === 0) return `${seconds / 60}m`;
  return `${seconds}s`;
};

export function parseFilterQuery(inputString = "") {
  const normalized = normalizeWhitespace(String(inputString || ""));
  const tokens = tokenizeQuery(normalized);
  const filters = cloneDefaultFilters();
  const errors = [];
  const textTokens = [];

  for (const token of tokens) {
    if (!token) continue;
    const upperToken = token.toUpperCase();
    if (BOOLEAN_OPERATORS.has(upperToken)) {
      textTokens.push({ type: "operator", value: upperToken });
      continue;
    }

    const keyValue = parseKeyValueToken(token);
    if (!keyValue) {
      textTokens.push({ type: "term", value: token, isPhrase: token.includes(" ") });
      continue;
    }

    const { key, value } = keyValue;
    if (!value) {
      errors.push({ token, message: "Filter value is missing." });
      continue;
    }

    switch (key) {
      case "author": {
        const values = value.split(",").map((entry) => entry.trim()).filter(Boolean);
        if (values.length === 0) {
          errors.push({ token, message: "Author value is empty." });
          break;
        }
        filters.authorPubkeys.push(...values);
        break;
      }
      case "tag": {
        const values = value
          .split(",")
          .map((entry) => entry.trim().replace(/^#/, ""))
          .filter(Boolean);
        if (values.length === 0) {
          errors.push({ token, message: "Tag value is empty." });
          break;
        }
        filters.tags.push(...values);
        break;
      }
      case "kind": {
        const parsed = Number.parseInt(value, 10);
        if (!Number.isFinite(parsed)) {
          errors.push({ token, message: "Kind must be an integer." });
          break;
        }
        filters.kind = parsed;
        break;
      }
      case "relay": {
        filters.relay = value;
        break;
      }
      case "after": {
        const parsed = parseDateValue(value);
        if (parsed.error) {
          errors.push({ token, message: parsed.error });
          break;
        }
        filters.dateRange.after = parsed.value;
        break;
      }
      case "before": {
        const parsed = parseDateValue(value);
        if (parsed.error) {
          errors.push({ token, message: parsed.error });
          break;
        }
        filters.dateRange.before = parsed.value;
        break;
      }
      case "duration": {
        const match = value.match(/^(<=|>=|<|>)(.+)$/);
        if (!match) {
          errors.push({ token, message: "Duration must use < or > operators." });
          break;
        }
        const operator = match[1];
        const durationValue = match[2].trim();
        const parsed = parseDurationValue(durationValue);
        if (parsed.error) {
          errors.push({ token, message: parsed.error });
          break;
        }
        applyDurationFilter(filters, operator, parsed.value);
        break;
      }
      case "has": {
        const normalizedValue = value.toLowerCase();
        if (normalizedValue === "magnet") {
          filters.hasMagnet = true;
        } else if (normalizedValue === "url") {
          filters.hasUrl = true;
        } else {
          errors.push({ token, message: "Has filter supports magnet or url." });
        }
        break;
      }
      case "nsfw": {
        const normalizedValue = value.toLowerCase();
        if (["any", "true", "false", "only", "safe"].includes(normalizedValue)) {
          filters.nsfw = normalizedValue === "safe" ? "false" : normalizedValue;
        } else {
          errors.push({ token, message: "NSFW filter supports any/true/false/only." });
        }
        break;
      }
      default:
        errors.push({ token, message: `Unknown filter "${key}".` });
    }
  }

  const text = textTokens
    .filter((token) => token.type === "term")
    .map((token) => token.value)
    .join(" ");

  return {
    filters,
    text,
    tokens: textTokens,
    errors,
  };
}

export function serializeFiltersToQuery(filters = DEFAULT_FILTERS) {
  const tokens = [];

  if (filters.authorPubkeys?.length) {
    for (const author of filters.authorPubkeys) {
      tokens.push(`author:${author}`);
    }
  }

  if (filters.tags?.length) {
    for (const tag of filters.tags) {
      tokens.push(`tag:${tag}`);
    }
  }

  if (Number.isFinite(filters.kind)) {
    tokens.push(`kind:${filters.kind}`);
  }

  if (filters.relay) {
    tokens.push(`relay:${filters.relay}`);
  }

  if (Number.isFinite(filters.dateRange?.after)) {
    tokens.push(`after:${formatDateForFilter(filters.dateRange.after)}`);
  }

  if (Number.isFinite(filters.dateRange?.before)) {
    tokens.push(`before:${formatDateForFilter(filters.dateRange.before)}`);
  }

  if (Number.isFinite(filters.duration?.minSeconds)) {
    tokens.push(`duration:>=${formatDurationValue(filters.duration.minSeconds)}`);
  }

  if (Number.isFinite(filters.duration?.maxSeconds)) {
    tokens.push(`duration:<=${formatDurationValue(filters.duration.maxSeconds)}`);
  }

  if (filters.hasMagnet === true) {
    tokens.push("has:magnet");
  }

  if (filters.hasUrl === true) {
    tokens.push("has:url");
  }

  if (filters.nsfw && filters.nsfw !== "any") {
    tokens.push(`nsfw:${filters.nsfw}`);
  }

  return tokens.join(" ");
}

export function filtersToHashParams(filters = DEFAULT_FILTERS) {
  const params = new URLSearchParams();
  const serialized = serializeFiltersToQuery(filters);
  if (serialized) {
    params.set("filters", serialized);
  }
  return params;
}
