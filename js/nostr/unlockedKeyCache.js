// Opt-in "keep unlocked" cache for a decrypted nsec key so the user isn't
// re-prompted for their PIN after every page reload (TODO #51). SECURITY TRADEOFF:
// while an unlocked key is cached it is stored DECRYPTED — the passphrase no longer
// protects it at rest. Two tiers, chosen by the user at unlock time:
//   - session (default): sessionStorage — survives refresh/navigation, auto-cleared
//     when the tab/browser closes. Roughly the same exposure as the in-memory signer.
//   - persistent (opt-in checkbox + one-time warning): also localStorage — survives
//     until the user clears site data. Convenient, but the key sits on disk.
//
// readUnlockedKey transparently promotes a persistent copy back into the session
// store so subsequent reads are cheap. Everything is keyed per pubkey.

const STORE_KEY = "bitvid:unlockedKeys:v1";
const HEX64 = /^[0-9a-f]{64}$/;

function normalizePubkey(pubkey) {
  return typeof pubkey === "string" ? pubkey.trim().toLowerCase() : "";
}

function getStore(kind) {
  try {
    const store =
      kind === "session"
        ? globalThis.sessionStorage
        : globalThis.localStorage;
    if (
      store &&
      typeof store.getItem === "function" &&
      typeof store.setItem === "function" &&
      typeof store.removeItem === "function"
    ) {
      return store;
    }
  } catch (error) {
    // Access can throw (privacy mode, disabled storage) — treat as unavailable.
  }
  return null;
}

function readMap(store) {
  if (!store) {
    return {};
  }
  try {
    const raw = store.getItem(STORE_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    return {};
  }
}

function writeMap(store, map) {
  if (!store) {
    return;
  }
  try {
    const keys = Object.keys(map || {});
    if (!keys.length) {
      store.removeItem(STORE_KEY);
      return;
    }
    store.setItem(STORE_KEY, JSON.stringify(map));
  } catch (error) {
    // Quota / disabled storage — best-effort only.
  }
}

/**
 * Cache a decrypted nsec key so it can be restored without the passphrase.
 * Always writes the session tier; the persistent tier is written only when
 * `persist` is true (and any stale persistent copy is removed otherwise).
 *
 * @returns {boolean} true if a valid key was cached.
 */
export function rememberUnlockedKey(pubkey, privateKeyHex, { persist = false } = {}) {
  const key = normalizePubkey(pubkey);
  const value =
    typeof privateKeyHex === "string" ? privateKeyHex.trim().toLowerCase() : "";
  if (!key || !HEX64.test(value)) {
    return false;
  }

  const session = getStore("session");
  if (session) {
    const map = readMap(session);
    map[key] = value;
    writeMap(session, map);
  }

  const local = getStore("local");
  if (local) {
    const map = readMap(local);
    if (persist) {
      map[key] = value;
    } else {
      delete map[key];
    }
    writeMap(local, map);
  }

  return true;
}

/**
 * Read a cached decrypted key for a pubkey (session first, then persistent). A
 * persistent hit is promoted back into the session store.
 *
 * @returns {string} the hex private key, or "" if none is cached.
 */
export function readUnlockedKey(pubkey) {
  const key = normalizePubkey(pubkey);
  if (!key) {
    return "";
  }

  const session = getStore("session");
  const sessionValue = readMap(session)[key];
  if (typeof sessionValue === "string" && HEX64.test(sessionValue)) {
    return sessionValue;
  }

  const local = getStore("local");
  const localValue = readMap(local)[key];
  if (typeof localValue === "string" && HEX64.test(localValue)) {
    // Warm the session tier so later reads don't touch the persistent store.
    if (session) {
      const map = readMap(session);
      map[key] = localValue;
      writeMap(session, map);
    }
    return localValue;
  }

  return "";
}

/** True if this pubkey has a persistent (on-disk) cached key. */
export function hasPersistentUnlockedKey(pubkey) {
  const key = normalizePubkey(pubkey);
  if (!key) {
    return false;
  }
  const value = readMap(getStore("local"))[key];
  return typeof value === "string" && HEX64.test(value);
}

/** Forget the cached key for one pubkey (both tiers). */
export function forgetUnlockedKey(pubkey) {
  const key = normalizePubkey(pubkey);
  if (!key) {
    return;
  }
  for (const kind of ["session", "local"]) {
    const store = getStore(kind);
    if (!store) {
      continue;
    }
    const map = readMap(store);
    if (key in map) {
      delete map[key];
      writeMap(store, map);
    }
  }
}

/** Forget every cached key (both tiers). Used on full logout / lock-all. */
export function clearAllUnlockedKeys() {
  for (const kind of ["session", "local"]) {
    const store = getStore(kind);
    if (store) {
      try {
        store.removeItem(STORE_KEY);
      } catch (error) {
        // best-effort
      }
    }
  }
}

export const UNLOCKED_KEY_STORE_KEY = STORE_KEY;
