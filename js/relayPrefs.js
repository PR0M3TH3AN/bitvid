// js/relayPrefs.js

import { nostrClient, RELAY_URLS } from "./nostr.js";

const LOCAL_STORAGE_PREFIX = "bitvid:relayPrefs:";

function normalizeRelayUrl(candidate) {
  if (typeof candidate !== "string") {
    throw new Error("Relay URL must be a string.");
  }

  const trimmed = candidate.trim();
  if (!trimmed) {
    throw new Error("Relay URL cannot be empty.");
  }

  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch (err) {
    throw new Error(`Invalid relay URL: ${candidate}`);
  }

  if (parsed.protocol !== "wss:" && parsed.protocol !== "ws:") {
    throw new Error("Relay URLs must begin with ws:// or wss://");
  }

  const normalisedPath = parsed.pathname.replace(/\/+$/, "");
  const pathSegment = normalisedPath || "";
  const searchSegment = parsed.search || "";

  return `${parsed.protocol}//${parsed.host}${pathSegment}${searchSegment}`;
}

function sanitizeRelayArray(relays) {
  if (!Array.isArray(relays)) {
    return [];
  }

  const clean = [];
  const seen = new Set();

  for (const relay of relays) {
    try {
      const normalised = normalizeRelayUrl(relay);
      if (!seen.has(normalised)) {
        seen.add(normalised);
        clean.push(normalised);
      }
    } catch (err) {
      console.warn("[relayPrefs] Skipping invalid relay entry:", err?.message || err);
    }
  }

  return clean;
}

function storageKey(pubkey) {
  const suffix = pubkey && typeof pubkey === "string" ? pubkey : "local";
  return `${LOCAL_STORAGE_PREFIX}${suffix}`;
}

class RelayPrefsManager {
  constructor() {
    this.lastEventId = null;
    this.lastLoadedPubkey = null;
  }

  loadLocal(pubkey) {
    if (typeof localStorage === "undefined") {
      return [];
    }

    try {
      const raw = localStorage.getItem(storageKey(pubkey));
      if (!raw) {
        return [];
      }
      const parsed = JSON.parse(raw);
      return sanitizeRelayArray(parsed);
    } catch (err) {
      console.warn("[relayPrefs] Failed to load local relay prefs:", err);
      return [];
    }
  }

  saveLocal(pubkey, relays) {
    if (typeof localStorage === "undefined") {
      return;
    }

    try {
      const clean = sanitizeRelayArray(relays);
      localStorage.setItem(storageKey(pubkey), JSON.stringify(clean));
    } catch (err) {
      console.warn("[relayPrefs] Failed to persist relay prefs locally:", err);
    }
  }

  async load(pubkey) {
    if (!pubkey || !window.nostr?.nip04?.decrypt) {
      return this.loadLocal(pubkey);
    }

    try {
      const filter = {
        kinds: [30002],
        authors: [pubkey],
        "#d": ["relay-prefs"],
        limit: 1,
      };

      const events = [];
      const relays = nostrClient.getRelays();

      for (const relayUrl of relays) {
        try {
          const result = await nostrClient.pool.list([relayUrl], [filter]);
          if (Array.isArray(result) && result.length) {
            events.push(...result);
          }
        } catch (err) {
          console.warn(`[relayPrefs] Failed to load from ${relayUrl}:`, err);
        }
      }

      if (!events.length) {
        return this.loadLocal(pubkey);
      }

      events.sort((a, b) => b.created_at - a.created_at);
      const newest = events[0];
      this.lastEventId = newest.id;
      this.lastLoadedPubkey = pubkey;

      let decrypted = "";
      try {
        decrypted = await window.nostr.nip04.decrypt(pubkey, newest.content);
      } catch (err) {
        console.error("[relayPrefs] Failed to decrypt relay prefs:", err);
        return this.loadLocal(pubkey);
      }

      try {
        const parsed = JSON.parse(decrypted);
        if (Array.isArray(parsed?.relays)) {
          const clean = sanitizeRelayArray(parsed.relays);
          this.saveLocal(pubkey, clean);
          return clean;
        }
      } catch (err) {
        console.error("[relayPrefs] Failed to parse relay prefs payload:", err);
      }

      return this.loadLocal(pubkey);
    } catch (err) {
      console.error("[relayPrefs] Unexpected error during load:", err);
      return this.loadLocal(pubkey);
    }
  }

  async save(pubkey, relayList) {
    const clean = sanitizeRelayArray(relayList);
    this.saveLocal(pubkey, clean);

    if (!pubkey || !window.nostr?.nip04?.encrypt || !window.nostr?.signEvent) {
      return { storedLocally: true, published: false };
    }

    const payload = JSON.stringify({ relays: clean });
    let encrypted;

    try {
      encrypted = await window.nostr.nip04.encrypt(pubkey, payload);
    } catch (err) {
      console.error("[relayPrefs] Failed to encrypt relay prefs:", err);
      throw err;
    }

    const event = {
      kind: 30002,
      pubkey,
      created_at: Math.floor(Date.now() / 1000),
      tags: [["d", "relay-prefs"]],
      content: encrypted,
    };

    try {
      const signed = await window.nostr.signEvent(event);
      const relaysToPublish = clean.length ? clean : RELAY_URLS;

      await Promise.all(
        relaysToPublish.map(async (relayUrl) => {
          try {
            await nostrClient.pool.publish([relayUrl], signed);
          } catch (err) {
            console.warn(`[relayPrefs] Failed to publish to ${relayUrl}:`, err);
          }
        })
      );

      this.lastEventId = signed.id;
      this.lastLoadedPubkey = pubkey;
      return { storedLocally: true, published: true };
    } catch (err) {
      console.error("[relayPrefs] Failed to sign/publish relay prefs:", err);
      throw err;
    }
  }
}

export const relayPrefs = new RelayPrefsManager();
