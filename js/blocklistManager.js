// js/blocklistManager.js

import { nostrClient } from "./nostr.js";

const LOCAL_STORAGE_PREFIX = "bitvid:blocklist:";
const SAVE_DEBOUNCE_MS = 1000;

function storageKey(pubkey) {
  const suffix = pubkey && typeof pubkey === "string" ? pubkey : "local";
  return `${LOCAL_STORAGE_PREFIX}${suffix}`;
}

function sanitizeNpubList(list) {
  if (!Array.isArray(list)) {
    return [];
  }

  const clean = [];
  const seen = new Set();

  for (const entry of list) {
    if (typeof entry !== "string") {
      continue;
    }
    const trimmed = entry.trim();
    if (!trimmed || !trimmed.startsWith("npub1") || trimmed.length < 10) {
      continue;
    }
    if (!seen.has(trimmed)) {
      seen.add(trimmed);
      clean.push(trimmed);
    }
  }

  return clean;
}

class BlocklistManager {
  constructor() {
    this.lastEventId = null;
    this.lastLoadedPubkey = null;
    this._saveTimer = null;
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
      return sanitizeNpubList(parsed);
    } catch (err) {
      console.warn("[blocklistManager] Failed to load local block list:", err);
      return [];
    }
  }

  saveLocal(pubkey, npubs) {
    if (typeof localStorage === "undefined") {
      return;
    }

    try {
      const clean = sanitizeNpubList(npubs);
      localStorage.setItem(storageKey(pubkey), JSON.stringify(clean));
    } catch (err) {
      console.warn("[blocklistManager] Failed to persist block list locally:", err);
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
        "#d": ["blocklist"],
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
          console.warn(`[blocklistManager] Failed to query ${relayUrl}:`, err);
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
        console.error("[blocklistManager] Failed to decrypt block list:", err);
        return this.loadLocal(pubkey);
      }

      try {
        const parsed = JSON.parse(decrypted);
        if (Array.isArray(parsed?.npubs)) {
          const clean = sanitizeNpubList(parsed.npubs);
          this.saveLocal(pubkey, clean);
          return clean;
        }
      } catch (err) {
        console.error("[blocklistManager] Failed to parse block list payload:", err);
      }

      return this.loadLocal(pubkey);
    } catch (err) {
      console.error("[blocklistManager] Unexpected error during load:", err);
      return this.loadLocal(pubkey);
    }
  }

  async save(pubkey, npubs) {
    const clean = sanitizeNpubList(npubs);
    this.saveLocal(pubkey, clean);

    if (!pubkey || !window.nostr?.nip04?.encrypt || !window.nostr?.signEvent) {
      return { storedLocally: true, published: false };
    }

    const payload = JSON.stringify({ npubs: clean });
    let encrypted;

    try {
      encrypted = await window.nostr.nip04.encrypt(pubkey, payload);
    } catch (err) {
      console.error("[blocklistManager] Failed to encrypt block list:", err);
      throw err;
    }

    const event = {
      kind: 30002,
      pubkey,
      created_at: Math.floor(Date.now() / 1000),
      tags: [["d", "blocklist"]],
      content: encrypted,
    };

    try {
      const signed = await window.nostr.signEvent(event);
      const relays = nostrClient.getRelays();

      await Promise.all(
        relays.map(async (relayUrl) => {
          try {
            await nostrClient.pool.publish([relayUrl], signed);
          } catch (err) {
            console.warn(`[blocklistManager] Failed to publish to ${relayUrl}:`, err);
          }
        })
      );

      this.lastEventId = signed.id;
      this.lastLoadedPubkey = pubkey;
      return { storedLocally: true, published: true };
    } catch (err) {
      console.error("[blocklistManager] Failed to sign/publish block list:", err);
      throw err;
    }
  }

  scheduleSave(pubkey, npubs) {
    if (this._saveTimer) {
      clearTimeout(this._saveTimer);
    }

    this._saveTimer = setTimeout(() => {
      this.save(pubkey, npubs).catch((err) => {
        console.error("[blocklistManager] Debounced save failed:", err);
      });
    }, SAVE_DEBOUNCE_MS);
  }
}

export const blocklistManager = new BlocklistManager();
