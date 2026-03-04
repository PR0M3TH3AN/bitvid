/**
 * A Map extension that maintains an author-based index for fast lookups.
 * Used for `rawEvents` in NostrClient.
 */
export class EventsMap extends Map {
  constructor(entries) {
    super(entries);
    this.authorIndex = new Map(); // pubkey -> Set<Event>

    // If entries provided, index them
    if (entries) {
      for (const [key, value] of this.entries()) {
        this._addToIndex(value);
      }
    }
  }

  _normalizePubkey(pubkey) {
    if (typeof pubkey !== "string") return "";
    return pubkey.trim().toLowerCase();
  }

  _addToIndex(event) {
    if (!event || typeof event !== "object") return;
    const pubkey = this._normalizePubkey(event.pubkey);
    if (!pubkey) return;

    let set = this.authorIndex.get(pubkey);
    if (!set) {
      set = new Set();
      this.authorIndex.set(pubkey, set);
    }
    set.add(event);
  }

  _removeFromIndex(event) {
    if (!event || typeof event !== "object") return;
    const pubkey = this._normalizePubkey(event.pubkey);
    if (!pubkey) return;

    const set = this.authorIndex.get(pubkey);
    if (set) {
      set.delete(event);
      if (set.size === 0) {
        this.authorIndex.delete(pubkey);
      }
    }
  }

  set(key, value) {
    const existing = this.get(key);
    // If the value is identical, we still set it in the map,
    // but the index doesn't strictly need updating.
    // However, if the key was mapped to a DIFFERENT object with the SAME pubkey,
    // we must update the Set (remove old object, add new object).
    if (existing) {
        if (existing === value) {
            // No index change needed
            return super.set(key, value);
        }
        this._removeFromIndex(existing);
    }

    super.set(key, value);
    this._addToIndex(value);
    return this;
  }

  delete(key) {
    const value = this.get(key);
    const result = super.delete(key);
    if (result && value) {
      this._removeFromIndex(value);
    }
    return result;
  }

  clear() {
    super.clear();
    this.authorIndex.clear();
  }

  getEventsByAuthor(pubkey) {
    const normalized = this._normalizePubkey(pubkey);
    if (!normalized) return [];
    const set = this.authorIndex.get(normalized);
    // Return array to allow iteration
    return set ? Array.from(set) : [];
  }
}
