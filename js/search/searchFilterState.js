import {
  DEFAULT_FILTERS,
  parseFilterQuery,
  serializeFiltersToQuery,
} from "./searchFilters.js";

const listeners = new Set();

const cloneFilters = (filters = DEFAULT_FILTERS) => ({
  dateRange: {
    after: filters?.dateRange?.after ?? null,
    before: filters?.dateRange?.before ?? null,
  },
  sort: filters?.sort ?? DEFAULT_FILTERS.sort,
  authorPubkeys: Array.isArray(filters?.authorPubkeys)
    ? [...filters.authorPubkeys]
    : [],
  tags: Array.isArray(filters?.tags) ? [...filters.tags] : [],
  textScope: filters?.textScope ?? DEFAULT_FILTERS.textScope,
  duration: {
    minSeconds: filters?.duration?.minSeconds ?? null,
    maxSeconds: filters?.duration?.maxSeconds ?? null,
  },
  hasMagnet:
    typeof filters?.hasMagnet === "boolean" ? filters.hasMagnet : null,
  hasUrl: typeof filters?.hasUrl === "boolean" ? filters.hasUrl : null,
  nsfw: filters?.nsfw ?? DEFAULT_FILTERS.nsfw,
  relay: filters?.relay ?? DEFAULT_FILTERS.relay,
  kind:
    Number.isFinite(filters?.kind) && filters.kind !== null
      ? filters.kind
      : null,
});

let state = {
  text: "",
  filters: cloneFilters(DEFAULT_FILTERS),
};

function notify() {
  const snapshot = getSearchFilterState();
  listeners.forEach((listener) => listener(snapshot));
}

export function getSearchFilterState() {
  return {
    text: state.text,
    filters: cloneFilters(state.filters),
  };
}

export function setSearchFilterState(nextState = {}, options = {}) {
  state = {
    text: typeof nextState.text === "string" ? nextState.text : "",
    filters: cloneFilters(nextState.filters),
  };
  if (options.notify !== false) {
    notify();
  }
}

export function resetSearchFilters(options = {}) {
  state = {
    text: state.text,
    filters: cloneFilters(DEFAULT_FILTERS),
  };
  if (options.notify !== false) {
    notify();
  }
}

export function syncSearchFilterStateFromHash(hash = "") {
  const hashString =
    typeof hash === "string" && hash ? hash : window?.location?.hash || "";
  const hashParams = new URLSearchParams(
    hashString.split("?")[1] || hashString.slice(1),
  );
  const rawQuery = hashParams.get("q") || "";
  const rawFilters = hashParams.get("filters") || "";
  const parsed = parseFilterQuery(
    [rawQuery, rawFilters].filter(Boolean).join(" "),
  );
  setSearchFilterState(
    {
      text: parsed.text || "",
      filters: parsed.filters,
    },
    { notify: true },
  );
  return parsed;
}

export function buildSearchHashFromState(nextState = state) {
  const params = new URLSearchParams();
  if (nextState.text) {
    params.set("q", nextState.text);
  }
  const serialized = serializeFiltersToQuery(nextState.filters);
  if (serialized) {
    params.set("filters", serialized);
  }
  const queryString = params.toString();
  return queryString ? `search&${queryString}` : "search";
}
