// js/nostr.js

import { isDevMode } from "./config.js";
import { accessControl } from "./accessControl.js";

const RELAY_URLS = [
  "wss://relay.damus.io",
  "wss://nos.lol",
  "wss://relay.snort.social",
  "wss://nostr.wine",
  "wss://relay.nostr.band",
];

// Rate limiting for error logs
let errorLogCount = 0;
const MAX_ERROR_LOGS = 100; // Adjust as needed

function logErrorOnce(message, eventContent = null) {
  if (errorLogCount < MAX_ERROR_LOGS) {
    console.error(message);
    if (eventContent) {
      console.log(`Event Content: ${eventContent}`);
    }
    errorLogCount++;
  }
  if (errorLogCount === MAX_ERROR_LOGS) {
    console.error(
      "Maximum error log limit reached. Further errors will be suppressed."
    );
  }
}

/**
 * A very naive "encryption" function that just reverses the string.
 * In a real app, use a proper crypto library (AES-GCM, ECDH, etc.).
 */
function fakeEncrypt(magnet) {
  return magnet.split("").reverse().join("");
}

function fakeDecrypt(encrypted) {
  return encrypted.split("").reverse().join("");
}

/**
 * Convert a raw Nostr event into your "video" object.
 */
function convertEventToVideo(event) {
  const content = JSON.parse(event.content || "{}");
  return {
    id: event.id,
    version: content.version ?? 1,
    isPrivate: content.isPrivate ?? false,
    title: content.title || "",
    magnet: content.magnet || "",
    thumbnail: content.thumbnail || "",
    description: content.description || "",
    mode: content.mode || "live",
    deleted: content.deleted === true,
    pubkey: event.pubkey,
    created_at: event.created_at,
    tags: event.tags,
  };
}

/**
 * Return a combined key for (pubkey, dTagValue).
 * If there's no `d` tag, we fallback to a special key so
 * those older events still appear in the grid.
 */
function getPubkeyDKey(evt) {
  const dTag = evt.tags.find((t) => t[0] === "d");
  if (dTag) {
    return `${evt.pubkey}:${dTag[1]}`;
  } else {
    // NEW: older events didn't have a d-tag, so use an alternative key
    // Example: "npubXYZ:no-d:id-of-event"
    return `${evt.pubkey}:no-d:${evt.id}`;
  }
}

class NostrClient {
  constructor() {
    this.pool = null;
    this.pubkey = null;
    this.relays = RELAY_URLS;

    // All events, old or new, keyed by event.id
    this.allEvents = new Map();

    // Only the "active" (non-deleted) newest version per (pubkey + dTag OR fallback)
    this.activeMap = new Map();
  }

  /**
   * Initializes the Nostr client by connecting to relays.
   */
  async init() {
    if (isDevMode) console.log("Connecting to relays...");

    try {
      this.pool = new window.NostrTools.SimplePool();
      const results = await this.connectToRelays();
      const successfulRelays = results
        .filter((r) => r.success)
        .map((r) => r.url);

      if (successfulRelays.length === 0) throw new Error("No relays connected");
      if (isDevMode) {
        console.log(`Connected to ${successfulRelays.length} relay(s)`);
      }
    } catch (err) {
      console.error("Nostr init failed:", err);
      throw err;
    }
  }

  // Connects to each relay, ensuring they're alive
  async connectToRelays() {
    return Promise.all(
      this.relays.map(
        (url) =>
          new Promise((resolve) => {
            const sub = this.pool.sub([url], [{ kinds: [0], limit: 1 }]);
            const timeout = setTimeout(() => {
              sub.unsub();
              resolve({ url, success: false });
            }, 5000);

            const succeed = () => {
              clearTimeout(timeout);
              sub.unsub();
              resolve({ url, success: true });
            };

            sub.on("event", succeed);
            sub.on("eose", succeed);
          })
      )
    );
  }

  /**
   * Logs in the user using a Nostr extension or by entering an NSEC key.
   */
  async login() {
    try {
      if (!window.nostr) {
        console.log("No Nostr extension found");
        throw new Error(
          "Please install a Nostr extension (like Alby or nos2x)."
        );
      }

      const pubkey = await window.nostr.getPublicKey();
      const npub = window.NostrTools.nip19.npubEncode(pubkey);

      if (isDevMode) {
        console.log("Got pubkey:", pubkey);
        console.log("Converted to npub:", npub);
        console.log("Whitelist:", accessControl.getWhitelist());
        console.log("Blacklist:", accessControl.getBlacklist());
        console.log("Is whitelisted?", accessControl.isWhitelisted(npub));
        console.log("Is blacklisted?", accessControl.isBlacklisted(npub));
      }

      // Check access control
      if (!accessControl.canAccess(npub)) {
        if (accessControl.isBlacklisted(npub)) {
          throw new Error(
            "Your account has been blocked from accessing this platform."
          );
        } else {
          throw new Error(
            "Access is currently restricted to whitelisted users only."
          );
        }
      }

      this.pubkey = pubkey;
      if (isDevMode) {
        console.log(
          "Successfully logged in with extension. Public key:",
          this.pubkey
        );
      }
      return this.pubkey;
    } catch (e) {
      console.error("Login error:", e);
      throw e;
    }
  }

  logout() {
    this.pubkey = null;
    if (isDevMode) console.log("User logged out.");
  }

  decodeNsec(nsec) {
    try {
      const { data } = window.NostrTools.nip19.decode(nsec);
      return data;
    } catch (error) {
      throw new Error("Invalid NSEC key.");
    }
  }

  /**
   * Publishes a new video event to all relays (creates a brand-new note).
   */
  async publishVideo(videoData, pubkey) {
    if (!pubkey) {
      throw new Error("User is not logged in.");
    }

    if (isDevMode) {
      console.log("Publishing video with data:", videoData);
    }

    // If user sets "isPrivate = true", encrypt the magnet
    let finalMagnet = videoData.magnet;
    if (videoData.isPrivate === true) {
      finalMagnet = fakeEncrypt(finalMagnet);
    }

    const version = videoData.version ?? 1;
    const uniqueD = `${Date.now()}-${Math.random()
      .toString(36)
      .substring(2, 10)}`;
    const contentObject = {
      version,
      deleted: false,
      isPrivate: videoData.isPrivate || false,
      title: videoData.title,
      magnet: finalMagnet,
      thumbnail: videoData.thumbnail,
      description: videoData.description,
      mode: videoData.mode,
    };

    const event = {
      kind: 30078,
      pubkey,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ["t", "video"],
        ["d", uniqueD],
      ],
      content: JSON.stringify(contentObject),
    };

    if (isDevMode) {
      console.log("Event content after stringify:", event.content);
      console.log("Using d tag:", uniqueD);
    }

    try {
      const signedEvent = await window.nostr.signEvent(event);
      if (isDevMode) {
        console.log("Signed event:", signedEvent);
      }

      await Promise.all(
        this.relays.map(async (url) => {
          try {
            await this.pool.publish([url], signedEvent);
            if (isDevMode) {
              console.log(`Event published to ${url}`);
            }
          } catch (err) {
            if (isDevMode) {
              console.error(`Failed to publish to ${url}:`, err.message);
            }
          }
        })
      );

      return signedEvent;
    } catch (error) {
      if (isDevMode) {
        console.error("Failed to sign event:", error.message);
      }
      throw new Error("Failed to sign event.");
    }
  }

  /**
   * Edits an existing video event by reusing the same "d" tag.
   * Allows toggling isPrivate on/off and re-encrypting or decrypting the magnet.
   */
  async editVideo(originalEvent, updatedVideoData, pubkey) {
    if (!pubkey) {
      throw new Error("User is not logged in.");
    }
    if (originalEvent.pubkey !== pubkey) {
      throw new Error("You do not own this event (different pubkey).");
    }

    if (isDevMode) {
      console.log("Editing video event:", originalEvent);
      console.log("New video data:", updatedVideoData);
    }

    const dTag = originalEvent.tags.find((tag) => tag[0] === "d");
    if (!dTag) {
      throw new Error('No "d" tag => cannot edit as addressable kind=30078.');
    }
    const existingD = dTag[1];

    const oldContent = JSON.parse(originalEvent.content || "{}");
    const oldVersion = oldContent.version ?? 1;
    const oldDeleted = oldContent.deleted === true;
    const newVersion = updatedVideoData.version ?? oldVersion;

    const oldWasPrivate = oldContent.isPrivate === true;
    let oldPlainMagnet = oldContent.magnet || "";
    if (oldWasPrivate && oldPlainMagnet) {
      oldPlainMagnet = fakeDecrypt(oldPlainMagnet);
    }

    const newIsPrivate =
      typeof updatedVideoData.isPrivate === "boolean"
        ? updatedVideoData.isPrivate
        : oldContent.isPrivate ?? false;

    const userTypedMagnet = (updatedVideoData.magnet || "").trim();
    const finalPlainMagnet = userTypedMagnet || oldPlainMagnet;

    let finalMagnet = finalPlainMagnet;
    if (newIsPrivate) {
      finalMagnet = fakeEncrypt(finalPlainMagnet);
    }

    const contentObject = {
      version: newVersion,
      deleted: oldDeleted,
      isPrivate: newIsPrivate,
      title: updatedVideoData.title,
      magnet: finalMagnet,
      thumbnail: updatedVideoData.thumbnail,
      description: updatedVideoData.description,
      mode: updatedVideoData.mode,
    };

    if (isDevMode) {
      console.log("Building updated content object:", contentObject);
    }

    const event = {
      kind: 30078,
      pubkey,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ["t", "video"],
        ["d", existingD],
      ],
      content: JSON.stringify(contentObject),
    };

    if (isDevMode) {
      console.log("Reusing d tag:", existingD);
      console.log("Updated event content:", event.content);
    }

    try {
      const signedEvent = await window.nostr.signEvent(event);
      if (isDevMode) {
        console.log("Signed edited event:", signedEvent);
      }

      await Promise.all(
        this.relays.map(async (url) => {
          try {
            await this.pool.publish([url], signedEvent);
            if (isDevMode) {
              console.log(
                `Edited event published to ${url} (d="${existingD}")`
              );
            }
          } catch (err) {
            if (isDevMode) {
              console.error(
                `Failed to publish edited event to ${url}:`,
                err.message
              );
            }
          }
        })
      );

      return signedEvent;
    } catch (error) {
      if (isDevMode) {
        console.error("Failed to sign edited event:", error.message);
      }
      throw new Error("Failed to sign edited event.");
    }
  }

  /**
   * Soft-delete or hide an existing video by marking content as "deleted: true"
   */
  async deleteVideo(originalEvent, pubkey) {
    if (!pubkey) {
      throw new Error("User is not logged in.");
    }
    if (originalEvent.pubkey !== pubkey) {
      throw new Error("You do not own this event (different pubkey).");
    }

    if (isDevMode) {
      console.log("Deleting video event:", originalEvent);
    }

    const dTag = originalEvent.tags.find((tag) => tag[0] === "d");
    if (!dTag) {
      throw new Error('No "d" tag => cannot delete addressable kind=30078.');
    }
    const existingD = dTag[1];

    const oldContent = JSON.parse(originalEvent.content || "{}");
    const oldVersion = oldContent.version ?? 1;

    const contentObject = {
      version: oldVersion,
      deleted: true,
      title: oldContent.title || "",
      magnet: "",
      thumbnail: "",
      description: "This video has been deleted.",
      mode: oldContent.mode || "live",
      isPrivate: oldContent.isPrivate || false,
    };

    const event = {
      kind: 30078,
      pubkey,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ["t", "video"],
        ["d", existingD],
      ],
      content: JSON.stringify(contentObject),
    };

    if (isDevMode) {
      console.log("Reusing d tag for delete:", existingD);
      console.log("Deleted event content:", event.content);
    }

    try {
      const signedEvent = await window.nostr.signEvent(event);
      if (isDevMode) {
        console.log("Signed deleted event:", signedEvent);
      }

      await Promise.all(
        this.relays.map(async (url) => {
          try {
            await this.pool.publish([url], signedEvent);
            if (isDevMode) {
              console.log(
                `Deleted event published to ${url} (d="${existingD}")`
              );
            }
          } catch (err) {
            if (isDevMode) {
              console.error(`Failed to publish deleted event to ${url}:`, err);
            }
          }
        })
      );

      return signedEvent;
    } catch (error) {
      if (isDevMode) {
        console.error("Failed to sign deleted event:", error);
      }
      throw new Error("Failed to sign deleted event.");
    }
  }

  /**
   * Subscribes to all video events from all relays.
   * We store them in `allEvents` (so old IDs are still available),
   * and we also maintain `activeMap` for the newest versions of each pubkey-dKey.
   *
   * @param {Function} onVideo - Callback for each newly recognized "active" video
   */
  subscribeVideos(onVideo) {
    const filter = {
      kinds: [30078],
      "#t": ["video"],
      limit: 500,
      since: 0, // we want from the beginning
    };

    if (isDevMode) {
      console.log("[subscribeVideos] Subscribing with filter:", filter);
    }

    const sub = this.pool.sub(this.relays, [filter]);

    sub.on("event", (event) => {
      try {
        // Convert event => video object
        const video = convertEventToVideo(event);

        // Always store it in allEvents
        this.allEvents.set(event.id, video);

        // If deleted, remove from activeMap if it's the active version
        if (video.deleted) {
          const key = getPubkeyDKey(event); // might be no-d if no 'd' tag
          const activeVid = this.activeMap.get(key);
          if (activeVid && activeVid.id === event.id) {
            this.activeMap.delete(key);
          }
          return;
        }

        // It's not deleted => see if we should set it as active
        const key = getPubkeyDKey(event); // might be "npubXYZ:no-d:ID"
        const existingActive = this.activeMap.get(key);
        if (!existingActive) {
          // brand new => store it
          this.activeMap.set(key, video);
          onVideo(video);
        } else {
          // We have an active version; check timestamps
          if (video.created_at > existingActive.created_at) {
            // It's newer => overwrite
            this.activeMap.set(key, video);
            onVideo(video);
          } else {
            // It's an older event => ignore from "active" perspective
            // but still in allEvents for old links
          }
        }
      } catch (err) {
        if (isDevMode) {
          console.error("[subscribeVideos] Error parsing event:", err);
        }
      }
    });

    sub.on("eose", () => {
      if (isDevMode) {
        console.log("[subscribeVideos] Reached EOSE for all relays");
      }
      // Optionally notify that the initial load is done
    });

    return sub;
  }

  /**
   * Bulk fetch of videos from all relays. Then we build the `activeMap`
   * so your grid can show all old & new events (even if no 'd' tag).
   */
  async fetchVideos() {
    const filter = {
      kinds: [30078],
      "#t": ["video"],
      // Increase limit if you want more than 300
      limit: 300,
      since: 0,
    };

    const localAll = new Map();

    try {
      await Promise.all(
        this.relays.map(async (url) => {
          const events = await this.pool.list([url], [filter]);
          for (const evt of events) {
            const video = convertEventToVideo(evt);
            localAll.set(evt.id, video);
          }
        })
      );

      // Merge localAll into our global allEvents
      for (const [id, vid] of localAll.entries()) {
        this.allEvents.set(id, vid);
      }

      // Re-build activeMap
      this.activeMap.clear();
      for (const [id, video] of this.allEvents.entries()) {
        if (video.deleted) continue; // skip
        const key = getPubkeyDKey({
          id,
          tags: video.tags,
          pubkey: video.pubkey,
        });
        const existing = this.activeMap.get(key);
        if (!existing || video.created_at > existing.created_at) {
          this.activeMap.set(key, video);
        }
      }

      // Return sorted "active" array for your grid
      const activeVideos = Array.from(this.activeMap.values()).sort(
        (a, b) => b.created_at - a.created_at
      );
      return activeVideos;
    } catch (err) {
      console.error("fetchVideos error:", err);
      return [];
    }
  }

  /**
   * Get an event by ID from our local cache (allEvents) if present.
   * If missing, do a direct pool.get() for that ID. This ensures older
   * "archived" events might still be loaded from the relays.
   */
  async getEventById(eventId) {
    const local = this.allEvents.get(eventId);
    if (local) {
      return local;
    }

    // NEW: do a direct fetch if not found
    try {
      for (const url of this.relays) {
        const maybeEvt = await this.pool.get([url], { ids: [eventId] });
        if (maybeEvt && maybeEvt.id === eventId) {
          const video = convertEventToVideo(maybeEvt);
          // store in allEvents
          this.allEvents.set(eventId, video);
          return video;
        }
      }
    } catch (err) {
      if (isDevMode) {
        console.error("getEventById direct fetch error:", err);
      }
    }

    // not found
    return null;
  }

  /**
   * Return the "active" videos, i.e. latest for each (pubkey+d or fallback).
   */
  getActiveVideos() {
    return Array.from(this.activeMap.values()).sort(
      (a, b) => b.created_at - a.created_at
    );
  }

  isValidVideo(content) {
    try {
      const isValid =
        content &&
        typeof content === "object" &&
        typeof content.title === "string" &&
        content.title.length > 0 &&
        typeof content.magnet === "string" &&
        content.magnet.length > 0 &&
        typeof content.mode === "string" &&
        ["dev", "live"].includes(content.mode) &&
        (typeof content.thumbnail === "string" ||
          typeof content.thumbnail === "undefined") &&
        (typeof content.description === "string" ||
          typeof content.description === "undefined");

      if (isDevMode && !isValid) {
        console.log("Invalid video content:", content);
      }
      return isValid;
    } catch (error) {
      if (isDevMode) {
        console.error("Error validating video:", error);
      }
      return false;
    }
  }
}

export const nostrClient = new NostrClient();
