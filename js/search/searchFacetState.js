const listeners = new Set();

const cloneFacetList = (list) =>
  Array.isArray(list) ? list.map((entry) => ({ ...entry })) : [];

let state = {
  tags: [],
  authors: [],
  relays: [],
};

function notify() {
  const snapshot = getSearchFacetCounts();
  listeners.forEach((listener) => listener(snapshot));
}

export function getSearchFacetCounts() {
  return {
    tags: cloneFacetList(state.tags),
    authors: cloneFacetList(state.authors),
    relays: cloneFacetList(state.relays),
  };
}

export function setSearchFacetCounts(nextState = {}) {
  state = {
    tags: cloneFacetList(nextState.tags),
    authors: cloneFacetList(nextState.authors),
    relays: cloneFacetList(nextState.relays),
  };
  notify();
}

export function subscribeSearchFacetCounts(listener) {
  if (typeof listener !== "function") {
    return () => {};
  }
  listeners.add(listener);
  return () => listeners.delete(listener);
}
