// js/userBlocks.js
import { nostrClient } from "./nostr.js";
import { buildBlockListEvent, BLOCK_LIST_IDENTIFIER } from "./nostrEventSchemas.js";

function normalizeHex(pubkey) {
  if (typeof pubkey !== "string") {
    return null;
  }

  const trimmed = pubkey.trim();
  if (!trimmed) {
    return null;
  }

  if (/^[0-9a-f]{64}$/i.test(trimmed)) {
    return trimmed.toLowerCase();
  }

  return null;
}

class UserBlockListManager {
  constructor() {
    this.blockedPubkeys = new Set();
    this.blockEventId = null;
    this.loaded = false;
  }

  reset() {
    this.blockedPubkeys.clear();
    this.blockEventId = null;
    this.loaded = false;
  }

  getBlockedPubkeys() {
    return Array.from(this.blockedPubkeys);
  }

  isBlocked(pubkey) {
    const normalized = normalizeHex(pubkey);
    if (!normalized) {
      return false;
    }
    return this.blockedPubkeys.has(normalized);
  }

  async ensureLoaded(userPubkey) {
    if (this.loaded) {
      return;
    }

    const normalized = normalizeHex(userPubkey);
    if (!normalized) {
      return;
    }

    await this.loadBlocks(normalized);
  }

  async loadBlocks(userPubkey) {
    const normalized = normalizeHex(userPubkey);
    if (!normalized) {
      this.reset();
      this.loaded = true;
      return;
    }

    if (!window?.nostr?.nip04?.decrypt) {
      console.warn(
        "[UserBlockList] nip04.decrypt is unavailable; treating block list as empty."
      );
      this.reset();
      this.loaded = true;
      return;
    }

    try {
      const filter = {
        kinds: [30002],
        authors: [normalized],
        "#d": [BLOCK_LIST_IDENTIFIER],
        limit: 1,
      };

      const events = [];
      for (const relay of nostrClient.relays) {
        try {
          const res = await nostrClient.pool.list([relay], [filter]);
          if (Array.isArray(res) && res.length) {
            events.push(...res);
          }
        } catch (err) {
          console.error(`[UserBlockList] Relay error at ${relay}:`, err);
        }
      }

      if (!events.length) {
        this.blockedPubkeys.clear();
        this.blockEventId = null;
        this.loaded = true;
        return;
      }

      events.sort((a, b) => b.created_at - a.created_at);
      const newest = events[0];
      this.blockEventId = newest.id;

      let decrypted = "";
      try {
        decrypted = await window.nostr.nip04.decrypt(
          normalized,
          newest.content
        );
      } catch (err) {
        console.error("[UserBlockList] Failed to decrypt block list:", err);
        this.blockedPubkeys.clear();
        this.loaded = true;
        return;
      }

      try {
        const parsed = JSON.parse(decrypted);
        const list = Array.isArray(parsed?.blockedPubkeys)
          ? parsed.blockedPubkeys
          : [];
        const sanitized = list
          .map((entry) => normalizeHex(entry))
          .filter((candidate) => {
            if (!candidate) {
              return false;
            }
            if (candidate === normalized) {
              return false;
            }
            return true;
          });
        this.blockedPubkeys = new Set(sanitized);
      } catch (err) {
        console.error("[UserBlockList] Failed to parse block list:", err);
        this.blockedPubkeys.clear();
      }
    } catch (error) {
      console.error("[UserBlockList] loadBlocks failed:", error);
      this.blockedPubkeys.clear();
    } finally {
      this.loaded = true;
    }
  }

  async addBlock(targetPubkey, userPubkey) {
    const actorHex = normalizeHex(userPubkey);
    if (!actorHex) {
      throw new Error("Invalid user pubkey.");
    }

    const targetHex = normalizeHex(targetPubkey);
    if (!targetHex) {
      const err = new Error("Invalid target pubkey.");
      err.code = "invalid";
      throw err;
    }

    if (actorHex === targetHex) {
      const err = new Error("Cannot block yourself.");
      err.code = "self";
      throw err;
    }

    await this.ensureLoaded(actorHex);

    if (this.blockedPubkeys.has(targetHex)) {
      return { ok: true, already: true };
    }

    const snapshot = new Set(this.blockedPubkeys);
    this.blockedPubkeys.add(targetHex);

    try {
      await this.publishBlockList(actorHex);
      return { ok: true };
    } catch (err) {
      this.blockedPubkeys = snapshot;
      throw err;
    }
  }

  async removeBlock(targetPubkey, userPubkey) {
    const actorHex = normalizeHex(userPubkey);
    if (!actorHex) {
      throw new Error("Invalid user pubkey.");
    }

    const targetHex = normalizeHex(targetPubkey);
    if (!targetHex) {
      return { ok: true, already: true };
    }

    await this.ensureLoaded(actorHex);

    if (!this.blockedPubkeys.has(targetHex)) {
      return { ok: true, already: true };
    }

    const snapshot = new Set(this.blockedPubkeys);
    this.blockedPubkeys.delete(targetHex);

    try {
      await this.publishBlockList(actorHex);
      return { ok: true };
    } catch (err) {
      this.blockedPubkeys = snapshot;
      throw err;
    }
  }

  async publishBlockList(userPubkey) {
    if (!window?.nostr?.nip04?.encrypt) {
      const err = new Error(
        "NIP-04 encryption is required to update the block list."
      );
      err.code = "nip04-missing";
      throw err;
    }

    if (typeof window.nostr.signEvent !== "function") {
      const err = new Error("Nostr extension missing signEvent support.");
      err.code = "nip04-missing";
      throw err;
    }

    const normalized = normalizeHex(userPubkey);
    if (!normalized) {
      throw new Error("Invalid user pubkey.");
    }

    const payload = {
      blockedPubkeys: Array.from(this.blockedPubkeys).filter(
        (candidate) => candidate && candidate !== normalized
      ),
    };
    const plaintext = JSON.stringify(payload);

    let cipherText = "";
    try {
      cipherText = await window.nostr.nip04.encrypt(normalized, plaintext);
    } catch (error) {
      const err = new Error("Failed to encrypt block list.");
      err.code = "nip04-missing";
      throw err;
    }

    const event = buildBlockListEvent({
      pubkey: normalized,
      created_at: Math.floor(Date.now() / 1000),
      content: cipherText,
    });

    const signedEvent = await window.nostr.signEvent(event);

    await Promise.all(
      nostrClient.relays.map(async (relay) => {
        try {
          await nostrClient.pool.publish([relay], signedEvent);
        } catch (err) {
          console.error(`[UserBlockList] Failed to publish to ${relay}:`, err);
        }
      })
    );

    this.blockEventId = signedEvent.id;
    return signedEvent;
  }
}

export const userBlocks = new UserBlockListManager();

if (typeof window !== "undefined") {
  window.userBlocks = userBlocks;
}
