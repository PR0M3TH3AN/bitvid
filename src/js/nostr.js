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

// Just a helper to keep error spam in check
let errorLogCount = 0;
const MAX_ERROR_LOGS = 100;
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
 * Example "encryption" that just reverses strings.
 * In real usage, swap with actual crypto.
 */
function fakeEncrypt(magnet) {
  return magnet.split("").reverse().join("");
}
function fakeDecrypt(encrypted) {
  return encrypted.split("").reverse().join("");
}

/**
 * Convert a raw Nostr event => your "video" object.
 */
function convertEventToVideo(event) {
  const content = JSON.parse(event.content || "{}");
  return {
    id: event.id,
    // We store a 'videoRootId' in content so we can group multiple edits
    videoRootId: content.videoRootId || null,
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
 * Key each "active" video by its root ID => so you only store
 * the newest version for each root. But for older events w/o videoRootId,
 * or w/o 'd' tag, we handle fallback logic below.
 */
function getActiveKey(video) {
  // If it has a videoRootId, we use that
  if (video.videoRootId) {
    return `ROOT:${video.videoRootId}`;
  }
  // Otherwise fallback to (pubkey + dTag) or if no dTag, fallback to event.id
  // This is a fallback approach so older events appear in the "active map".
  const dTag = video.tags?.find((t) => t[0] === "d");
  if (dTag) {
    return `${video.pubkey}:${dTag[1]}`;
  }
  return `LEGACY:${video.id}`;
}

class NostrClient {
  constructor() {
    this.pool = null;
    this.pubkey = null;
    this.relays = RELAY_URLS;

    // All events—old or new—so older share links still work
    this.allEvents = new Map();

    // "activeMap" holds only the newest version for each root ID (or fallback).
    this.activeMap = new Map();
  }

  /**
   * Connect to all configured relays
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
   * Attempt Nostr extension login or abort
   */
  async login() {
    try {
      if (!window.nostr) {
        console.log("No Nostr extension found");
        throw new Error(
          "Please install a Nostr extension (Alby, nos2x, etc.)."
        );
      }

      const pubkey = await window.nostr.getPublicKey();
      const npub = window.NostrTools.nip19.npubEncode(pubkey);

      if (isDevMode) {
        console.log("Got pubkey:", pubkey);
        console.log("Converted to npub:", npub);
        console.log("Whitelist:", accessControl.getWhitelist());
        console.log("Blacklist:", accessControl.getBlacklist());
      }

      // Access control check
      if (!accessControl.canAccess(npub)) {
        if (accessControl.isBlacklisted(npub)) {
          throw new Error("Your account has been blocked on this platform.");
        } else {
          throw new Error("Access restricted to whitelisted users only.");
        }
      }

      this.pubkey = pubkey;
      if (isDevMode) {
        console.log("Logged in with extension. Pubkey:", this.pubkey);
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
   * Publish a *new* video with a brand-new d tag & brand-new videoRootId
   */
  async publishVideo(videoData, pubkey) {
    if (!pubkey) throw new Error("Not logged in to publish video.");

    if (isDevMode) {
      console.log("Publishing new video with data:", videoData);
    }

    let finalMagnet = videoData.magnet;
    if (videoData.isPrivate) {
      finalMagnet = fakeEncrypt(finalMagnet);
    }

    // new "videoRootId" ensures all future edits know they're from the same root
    const videoRootId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const dTagValue = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const contentObject = {
      videoRootId,
      version: videoData.version ?? 1,
      deleted: false,
      isPrivate: videoData.isPrivate ?? false,
      title: videoData.title || "",
      magnet: finalMagnet,
      thumbnail: videoData.thumbnail || "",
      description: videoData.description || "",
      mode: videoData.mode || "live",
    };

    const event = {
      kind: 30078,
      pubkey,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ["t", "video"],
        ["d", dTagValue],
      ],
      content: JSON.stringify(contentObject),
    };

    if (isDevMode) {
      console.log("Publish event with brand-new root:", videoRootId);
      console.log("Event content:", event.content);
    }

    try {
      const signedEvent = await window.nostr.signEvent(event);
      if (isDevMode) console.log("Signed event:", signedEvent);

      await Promise.all(
        this.relays.map(async (url) => {
          try {
            await this.pool.publish([url], signedEvent);
            if (isDevMode) console.log(`Video published to ${url}`);
          } catch (err) {
            if (isDevMode) console.error(`Failed to publish: ${url}`, err);
          }
        })
      );

      return signedEvent;
    } catch (err) {
      if (isDevMode) console.error("Failed to sign/publish:", err);
      throw err;
    }
  }

  /**
   * Edits a video by creating a *new event* with a brand-new d tag,
   * but reuses the same videoRootId as the original.
   * => old link remains pinned to the old event, new link is a fresh ID.
   */
  async editVideo(originalVideo, updatedData, pubkey) {
    if (!pubkey) throw new Error("Not logged in to edit.");
    if (originalVideo.pubkey !== pubkey) {
      throw new Error("You do not own this video (different pubkey).");
    }

    // Use the videoRootId directly from the converted video
    const rootId = originalVideo.videoRootId || null;

    // Decrypt the old magnet if it was private
    let oldPlainMagnet = originalVideo.magnet || "";
    if (originalVideo.isPrivate && oldPlainMagnet) {
      oldPlainMagnet = fakeDecrypt(oldPlainMagnet);
    }

    // Determine new privacy setting
    const wantPrivate =
      updatedData.isPrivate ?? originalVideo.isPrivate ?? false;

    // Fallback to old magnet if none provided
    let finalPlainMagnet = (updatedData.magnet || "").trim();
    if (!finalPlainMagnet) {
      finalPlainMagnet = oldPlainMagnet;
    }

    // Re-encrypt if user wants private
    let finalMagnet = finalPlainMagnet;
    if (wantPrivate) {
      finalMagnet = fakeEncrypt(finalPlainMagnet);
    }

    // If there's no root yet (legacy), generate it
    const newRootId =
      rootId || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const newD = `${Date.now()}-edit-${Math.random().toString(36).slice(2)}`;

    // Build updated content
    const contentObject = {
      videoRootId: newRootId,
      version: updatedData.version ?? originalVideo.version ?? 1,
      deleted: false,
      isPrivate: wantPrivate,
      title: updatedData.title ?? originalVideo.title,
      magnet: finalMagnet,
      thumbnail: updatedData.thumbnail ?? originalVideo.thumbnail,
      description: updatedData.description ?? originalVideo.description,
      mode: updatedData.mode ?? originalVideo.mode ?? "live",
    };

    const event = {
      kind: 30078,
      pubkey,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ["t", "video"],
        ["d", newD], // new share link
      ],
      content: JSON.stringify(contentObject),
    };

    if (isDevMode) {
      console.log("Creating edited event with root ID:", newRootId);
      console.log("Event content:", event.content);
    }

    try {
      const signedEvent = await window.nostr.signEvent(event);
      await Promise.all(
        this.relays.map(async (url) => {
          try {
            await this.pool.publish([url], signedEvent);
          } catch (err) {
            if (isDevMode) {
              console.error(`Publish failed to ${url}`, err);
            }
          }
        })
      );
      return signedEvent;
    } catch (err) {
      console.error("Edit failed:", err);
      throw err;
    }
  }

  /**
   * "Deleting" => we just mark content as {deleted:true} and blank out magnet/desc
   */
  async deleteVideo(originalEvent, pubkey) {
    if (!pubkey) {
      throw new Error("Not logged in to delete.");
    }
    if (originalEvent.pubkey !== pubkey) {
      throw new Error("Not your event (pubkey mismatch).");
    }

    // If front-end didn't pass the tags array, load the full event from local or from the relay:
    let baseEvent = originalEvent;
    if (!baseEvent.tags || !Array.isArray(baseEvent.tags)) {
      const fetched = await this.getEventById(originalEvent.id);
      if (!fetched) {
        throw new Error("Could not fetch the original event for deletion.");
      }
      // Rebuild baseEvent as a raw Nostr event that includes .tags and .content
      baseEvent = {
        id: fetched.id,
        pubkey: fetched.pubkey,
        // put the raw JSON content back into string form:
        content: JSON.stringify({
          version: fetched.version,
          deleted: fetched.deleted,
          isPrivate: fetched.isPrivate,
          title: fetched.title,
          magnet: fetched.magnet,
          thumbnail: fetched.thumbnail,
          description: fetched.description,
          mode: fetched.mode,
        }),
        tags: fetched.tags,
      };
    }

    // Now try to get the old d-tag
    const dTag = baseEvent.tags.find((t) => t[0] === "d");
    if (!dTag) {
      throw new Error('No "d" tag => cannot delete addressable kind=30078.');
    }
    const existingD = dTag[1];

    // After you've parsed oldContent:
    const oldContent = JSON.parse(baseEvent.content || "{}");
    const oldVersion = oldContent.version ?? 1;

    // ADD this block to handle the old root or fallback:
    let finalRootId = oldContent.videoRootId || null;
    if (!finalRootId) {
      // If it’s a legacy video (no root), we can fallback to your
      // existing logic used by getActiveKey. For instance, if it had a 'd' tag:
      if (dTag) {
        // Some devs store it as 'LEGACY:pubkey:dTagValue'
        // or you could just store the same as the old approach:
        finalRootId = `LEGACY:${baseEvent.pubkey}:${dTag[1]}`;
      } else {
        finalRootId = `LEGACY:${baseEvent.id}`;
      }
    }

    // Now build the content object, including videoRootId:
    const contentObject = {
      videoRootId: finalRootId, // <-- CRUCIAL so the delete event shares the same root key
      version: oldVersion,
      deleted: true,
      isPrivate: oldContent.isPrivate ?? false,
      title: oldContent.title || "",
      magnet: "",
      thumbnail: "",
      description: "Video was deleted by creator.",
      mode: oldContent.mode || "live",
    };

    const event = {
      kind: 30078,
      pubkey,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ["t", "video"],
        // We reuse the same d => overshadow the original event
        ["d", existingD],
      ],
      content: JSON.stringify(contentObject),
    };

    if (isDevMode) {
      console.log("Deleting video => mark 'deleted:true'.", event.content);
    }

    try {
      const signedEvent = await window.nostr.signEvent(event);
      if (isDevMode) {
        console.log("Signed deleted event:", signedEvent);
      }

      // Publish everywhere
      await Promise.all(
        this.relays.map(async (url) => {
          try {
            await this.pool.publish([url], signedEvent);
            if (isDevMode) {
              console.log(`Delete event published to ${url}`);
            }
          } catch (err) {
            if (isDevMode) {
              console.error(`Failed to publish deleted event to ${url}:`, err);
            }
          }
        })
      );
      return signedEvent;
    } catch (err) {
      if (isDevMode) {
        console.error("Failed to sign deleted event:", err);
      }
      throw new Error("Failed to sign deleted event.");
    }
  }

  /**
   * Subscribes to *all* video events. We store them in this.allEvents so older
   * notes remain accessible by ID, plus we maintain this.activeMap for the newest
   * version of each root (or fallback).
   */
  subscribeVideos(onVideo) {
    const filter = {
      kinds: [30078],
      "#t": ["video"],
      limit: 500,
      since: 0,
    };
    if (isDevMode) {
      console.log("[subscribeVideos] Subscribing with filter:", filter);
    }

    const sub = this.pool.sub(this.relays, [filter]);
    sub.on("event", (event) => {
      try {
        const video = convertEventToVideo(event);
        this.allEvents.set(event.id, video);

        // If it’s marked deleted, remove from active map if it’s the active version
        // NEW CODE
        if (video.deleted) {
          const activeKey = getActiveKey(video);
          // Don't compare IDs—just remove that key from the active map
          this.activeMap.delete(activeKey);

          // (Optional) If you want a debug log:
          // console.log(`[DELETE] Removed activeKey=${activeKey}`);

          return;
        }

        // Not deleted => see if it’s the newest
        const activeKey = getActiveKey(video);
        const prevActive = this.activeMap.get(activeKey);
        if (!prevActive) {
          // brand new => set it
          this.activeMap.set(activeKey, video);
          onVideo(video);
        } else {
          // compare timestamps
          if (video.created_at > prevActive.created_at) {
            this.activeMap.set(activeKey, video);
            onVideo(video);
          }
        }
      } catch (err) {
        if (isDevMode) {
          console.error("[subscribeVideos] Error processing event:", err);
        }
      }
    });

    sub.on("eose", () => {
      if (isDevMode) {
        console.log("[subscribeVideos] Reached EOSE for all relays");
      }
    });

    return sub;
  }

  /**
   * Bulk fetch from all relays, store in allEvents, rebuild activeMap
   */
  async fetchVideos() {
    const filter = {
      kinds: [30078],
      "#t": ["video"],
      limit: 300,
      since: 0,
    };

    const localAll = new Map();
    try {
      // 1) Fetch all events from each relay
      await Promise.all(
        this.relays.map(async (url) => {
          const events = await this.pool.list([url], [filter]);
          for (const evt of events) {
            const vid = convertEventToVideo(evt);
            localAll.set(evt.id, vid);
          }
        })
      );

      // 2) Merge into this.allEvents
      for (const [id, vid] of localAll.entries()) {
        this.allEvents.set(id, vid);
      }

      // 3) Rebuild activeMap
      this.activeMap.clear();
      for (const [id, video] of this.allEvents.entries()) {
        // Skip if the video is marked deleted
        if (video.deleted) continue;

        const activeKey = getActiveKey(video);
        const existing = this.activeMap.get(activeKey);

        // If there's no existing entry or this is newer, set/replace
        if (!existing || video.created_at > existing.created_at) {
          this.activeMap.set(activeKey, video);
        }
      }

      // 4) Return newest version for each root in descending order
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
   * Attempt to fetch an event by ID from local cache, then from the relays
   */
  async getEventById(eventId) {
    const local = this.allEvents.get(eventId);
    if (local) {
      return local;
    }
    // direct fetch if missing
    try {
      for (const url of this.relays) {
        const maybeEvt = await this.pool.get([url], { ids: [eventId] });
        if (maybeEvt && maybeEvt.id === eventId) {
          const video = convertEventToVideo(maybeEvt);
          this.allEvents.set(eventId, video);
          return video;
        }
      }
    } catch (err) {
      if (isDevMode) {
        console.error("getEventById direct fetch error:", err);
      }
    }
    return null; // not found
  }

  /**
   * Return newest versions from activeMap if you want to skip older events
   */
  getActiveVideos() {
    return Array.from(this.activeMap.values()).sort(
      (a, b) => b.created_at - a.created_at
    );
  }
}

export const nostrClient = new NostrClient();
