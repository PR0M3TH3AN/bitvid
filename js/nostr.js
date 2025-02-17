// js/nostr.js

import { isDevMode } from "./config.js";
import { accessControl } from "./accessControl.js";

/**
 * The usual relays
 */
const RELAY_URLS = [
  "wss://relay.damus.io",
  "wss://nos.lol",
  "wss://relay.snort.social",
  "wss://relay.primal.net",
  "wss://relay.nostr.band",
];

// To limit error spam
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
 * In real usage, replace with actual crypto.
 */
function fakeEncrypt(magnet) {
  return magnet.split("").reverse().join("");
}
function fakeDecrypt(encrypted) {
  return encrypted.split("").reverse().join("");
}

/**
 * Convert a raw Nostr event => your "video" object.
 * CHANGED: skip if version <2
 */
function convertEventToVideo(event) {
  try {
    const content = JSON.parse(event.content || "{}");

    // Example checks:
    const isSupportedVersion = content.version >= 2;
    const hasRequiredFields = !!(content.title && content.magnet);

    if (!isSupportedVersion) {
      return {
        id: event.id,
        invalid: true,
        reason: "version <2",
      };
    }
    if (!hasRequiredFields) {
      return {
        id: event.id,
        invalid: true,
        reason: "missing title/magnet",
      };
    }

    return {
      id: event.id,
      videoRootId: content.videoRootId || event.id,
      version: content.version,
      isPrivate: content.isPrivate ?? false,
      title: content.title ?? "",
      magnet: content.magnet ?? "",
      thumbnail: content.thumbnail ?? "",
      description: content.description ?? "",
      mode: content.mode ?? "live",
      deleted: content.deleted === true,
      pubkey: event.pubkey,
      created_at: event.created_at,
      tags: event.tags,
      invalid: false,
    };
  } catch (err) {
    // JSON parse error
    return { id: event.id, invalid: true, reason: "json parse error" };
  }
}

/**
 * If the video has videoRootId => use that as the “group key”.
 * Otherwise fallback to (pubkey + dTag), or if no dTag => “LEGACY:id”
 */
function getActiveKey(video) {
  if (video.videoRootId) {
    return `ROOT:${video.videoRootId}`;
  }
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

    // Store all events so older links still work
    this.allEvents = new Map();

    // “activeMap” holds only the newest version for each root
    this.activeMap = new Map();
  }

  /**
   * Connect to the configured relays
   */
  async init() {
    if (isDevMode) console.log("Connecting to relays...");

    try {
      this.pool = new window.NostrTools.SimplePool();
      const results = await this.connectToRelays();
      const successfulRelays = results
        .filter((r) => r.success)
        .map((r) => r.url);
      if (successfulRelays.length === 0) {
        throw new Error("No relays connected");
      }
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
   * Attempt login with a Nostr extension
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
      // Access control
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
    } catch (err) {
      console.error("Login error:", err);
      throw err;
    }
  }

  logout() {
    this.pubkey = null;
    if (isDevMode) console.log("User logged out.");
  }

  /**
   * Publish a new video
   * CHANGED: Force version=2 for all new notes
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

    // brand-new root & d
    const videoRootId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const dTagValue = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const contentObject = {
      videoRootId,
      version: 2, // forcibly set version=2
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
   *
   * This version forces version=2 for the original note and uses
   * lowercase comparison for public keys.
   */
  async editVideo(originalEventStub, updatedData, userPubkey) {
    if (!userPubkey) {
      throw new Error("Not logged in to edit.");
    }

    // Convert the provided pubkey to lowercase
    const userPubkeyLower = userPubkey.toLowerCase();

    // Use getEventById to fetch the full original event details
    const baseEvent = await this.getEventById(originalEventStub.id);
    if (!baseEvent) {
      throw new Error("Could not retrieve the original event to edit.");
    }

    // Check that the original event is version 2 or higher
    if (baseEvent.version < 2) {
      throw new Error(
        "This video is not in the supported version for editing."
      );
    }

    // Ownership check (compare lowercase hex public keys)
    if (
      !baseEvent.pubkey ||
      baseEvent.pubkey.toLowerCase() !== userPubkeyLower
    ) {
      throw new Error("You do not own this video (pubkey mismatch).");
    }

    // Decrypt the old magnet if the note is private
    let oldPlainMagnet = baseEvent.magnet || "";
    if (baseEvent.isPrivate && oldPlainMagnet) {
      oldPlainMagnet = fakeDecrypt(oldPlainMagnet);
    }

    // Determine if the updated note should be private
    const wantPrivate = updatedData.isPrivate ?? baseEvent.isPrivate ?? false;

    // Use the new magnet if provided; otherwise, fall back to the decrypted old magnet
    let finalPlainMagnet = (updatedData.magnet || "").trim() || oldPlainMagnet;
    let finalMagnet = wantPrivate
      ? fakeEncrypt(finalPlainMagnet)
      : finalPlainMagnet;

    // Use the existing videoRootId (or fall back to the base event's ID)
    const oldRootId = baseEvent.videoRootId || baseEvent.id;

    // Generate a new d-tag so that the edit gets its own share link
    const newD = `${Date.now()}-edit-${Math.random().toString(36).slice(2)}`;

    // Build the updated content object
    const contentObject = {
      videoRootId: oldRootId,
      version: updatedData.version ?? baseEvent.version ?? 2,
      deleted: false,
      isPrivate: wantPrivate,
      title: updatedData.title ?? baseEvent.title,
      magnet: finalMagnet,
      thumbnail: updatedData.thumbnail ?? baseEvent.thumbnail,
      description: updatedData.description ?? baseEvent.description,
      mode: updatedData.mode ?? baseEvent.mode ?? "live",
    };

    const event = {
      kind: 30078,
      // Use the provided userPubkey (or you can also force it to lowercase here if desired)
      pubkey: userPubkeyLower,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ["t", "video"],
        ["d", newD], // new share link tag
      ],
      content: JSON.stringify(contentObject),
    };

    if (isDevMode) {
      console.log("Creating edited event with root ID:", oldRootId);
      console.log("Event content:", event.content);
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
              console.log(`Edited video published to ${url}`);
            }
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
   * revertVideo => old style
   */
  async revertVideo(originalEvent, pubkey) {
    if (!pubkey) {
      throw new Error("Not logged in to revert.");
    }
    if (originalEvent.pubkey !== pubkey) {
      throw new Error("Not your event (pubkey mismatch).");
    }

    let baseEvent = originalEvent;
    if (!baseEvent.tags || !Array.isArray(baseEvent.tags)) {
      const fetched = await this.getEventById(originalEvent.id);
      if (!fetched) {
        throw new Error("Could not fetch the original event for reverting.");
      }
      baseEvent = {
        id: fetched.id,
        pubkey: fetched.pubkey,
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

    const dTag = baseEvent.tags.find((t) => t[0] === "d");
    if (!dTag) {
      throw new Error(
        'No "d" tag => cannot revert addressable kind=30078 event.'
      );
    }
    const existingD = dTag[1];

    const oldContent = JSON.parse(baseEvent.content || "{}");
    const oldVersion = oldContent.version ?? 1;

    let finalRootId = oldContent.videoRootId || null;
    if (!finalRootId) {
      finalRootId = `LEGACY:${baseEvent.pubkey}:${existingD}`;
    }

    const contentObject = {
      videoRootId: finalRootId,
      version: oldVersion,
      deleted: true,
      isPrivate: oldContent.isPrivate ?? false,
      title: oldContent.title || "",
      magnet: "",
      thumbnail: "",
      description: "This version was reverted by the creator.",
      mode: oldContent.mode || "live",
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

    const signedEvent = await window.nostr.signEvent(event);
    await Promise.all(
      this.relays.map(async (url) => {
        try {
          await this.pool.publish([url], signedEvent);
        } catch (err) {
          if (isDevMode) console.error(`Failed to revert on ${url}`, err);
        }
      })
    );

    return signedEvent;
  }

  /**
   * "Deleting" => Mark all content with the same videoRootId as {deleted:true}
   * and blank out magnet/desc.
   *
   * This version now asks for confirmation before proceeding.
   */
  async deleteAllVersions(videoRootId, pubkey) {
    if (!pubkey) {
      throw new Error("Not logged in to delete all versions.");
    }

    // Ask for confirmation before proceeding
    if (
      !window.confirm(
        "Are you sure you want to delete all versions of this video? This action cannot be undone."
      )
    ) {
      console.log("Deletion cancelled by user.");
      return null; // Cancel deletion if user clicks "Cancel"
    }

    // 1) Find all events in our local allEvents that share the same root.
    const matchingEvents = [];
    for (const [id, vid] of this.allEvents.entries()) {
      if (
        vid.videoRootId === videoRootId &&
        vid.pubkey === pubkey &&
        !vid.deleted
      ) {
        matchingEvents.push(vid);
      }
    }
    if (!matchingEvents.length) {
      throw new Error("No existing events found for that root.");
    }

    // 2) For each event, create a "revert" event to mark it as deleted.
    // This will prompt the user (via the extension) to sign the deletion.
    for (const vid of matchingEvents) {
      await this.revertVideo(
        {
          id: vid.id,
          pubkey: vid.pubkey,
          content: JSON.stringify({
            version: vid.version,
            deleted: vid.deleted,
            isPrivate: vid.isPrivate,
            title: vid.title,
            magnet: vid.magnet,
            thumbnail: vid.thumbnail,
            description: vid.description,
            mode: vid.mode,
          }),
          tags: vid.tags,
        },
        pubkey
      );
    }

    return true;
  }

  /**
 * Saves all known events to localStorage (or a different storage if you prefer).
 */
  saveLocalData() {
    // Convert our allEvents map into a plain object for JSON storage
    const allEventsObject = {};
    for (const [id, vid] of this.allEvents.entries()) {
      allEventsObject[id] = vid;
    }
    localStorage.setItem("bitvidEvents", JSON.stringify(allEventsObject));
  }

  /**
   * Subscribe to *all* videos (old and new) with a single subscription,
   * buffering incoming events to avoid excessive DOM updates.
   */
  subscribeVideos(onVideo) {
    const filter = {
      kinds: [30078],
      "#t": ["video"],
      // Adjust limit/time as desired
      limit: 500,
      since: 0,
    };

    if (isDevMode) {
      console.log("[subscribeVideos] Subscribing with filter:", filter);
    }

    const sub = this.pool.sub(this.relays, [filter]);
    const invalidDuringSub = [];

    // We'll collect events here instead of processing them instantly
    let eventBuffer = [];

    // 1) On each incoming event, just push to the buffer
    sub.on("event", (event) => {
      eventBuffer.push(event);
    });

    // 2) Process buffered events on a setInterval (e.g., every second)
    const processInterval = setInterval(() => {
      if (eventBuffer.length > 0) {
        // Copy and clear the buffer
        const toProcess = eventBuffer.slice();
        eventBuffer = [];

        // Now handle each event
        for (const evt of toProcess) {
          try {
            const video = convertEventToVideo(evt);

            if (video.invalid) {
              invalidDuringSub.push({ id: video.id, reason: video.reason });
              continue;
            }

            // Store in allEvents
            this.allEvents.set(evt.id, video);

            // If it's a "deleted" note, remove from activeMap
            if (video.deleted) {
              const activeKey = getActiveKey(video);
              this.activeMap.delete(activeKey);
              continue;
            }

            // Otherwise, if it's newer than what we have, update activeMap
            const activeKey = getActiveKey(video);
            const prevActive = this.activeMap.get(activeKey);
            if (!prevActive || video.created_at > prevActive.created_at) {
              this.activeMap.set(activeKey, video);
              onVideo(video); // Trigger the callback that re-renders
            }
          } catch (err) {
            if (isDevMode) {
              console.error("[subscribeVideos] Error processing event:", err);
            }
          }
        }

        // Optionally, save data to local storage after processing the batch
        this.saveLocalData();
      }
    }, 1000);

    // You can still use sub.on("eose") if needed
    sub.on("eose", () => {
      if (isDevMode && invalidDuringSub.length > 0) {
        console.warn(
          `[subscribeVideos] found ${invalidDuringSub.length} invalid v2 notes:`,
          invalidDuringSub
        );
      }
      if (isDevMode) {
        console.log(
          "[subscribeVideos] Reached EOSE for all relays (historical load done)"
        );
      }
    });

    // Return the subscription object if you need to unsub manually later
    return sub;
  }

  /**
   * fetchVideos => old approach
   */
  async fetchVideos() {
    const filter = {
      kinds: [30078],
      "#t": ["video"],
      limit: 300,
      since: 0,
    };

    const localAll = new Map();
    // NEW: track invalid
    const invalidNotes = [];

    try {
      await Promise.all(
        this.relays.map(async (url) => {
          const events = await this.pool.list([url], [filter]);
          for (const evt of events) {
            const vid = convertEventToVideo(evt);
            if (vid.invalid) {
              // Accumulate if invalid
              invalidNotes.push({ id: vid.id, reason: vid.reason });
            } else {
              // Only add if good
              localAll.set(evt.id, vid);
            }
          }
        })
      );

      // Merge into allEvents
      for (const [id, vid] of localAll.entries()) {
        this.allEvents.set(id, vid);
      }

      // Rebuild activeMap
      this.activeMap.clear();
      for (const [id, video] of this.allEvents.entries()) {
        if (video.deleted) continue;
        const activeKey = getActiveKey(video);
        const existing = this.activeMap.get(activeKey);

        if (!existing || video.created_at > existing.created_at) {
          this.activeMap.set(activeKey, video);
        }
      }

      // OPTIONAL: Log invalid stats
      if (invalidNotes.length > 0 && isDevMode) {
        console.warn(
          `Skipped ${invalidNotes.length} invalid v2 notes:\n`,
          invalidNotes.map((n) => `${n.id.slice(0, 8)}.. => ${n.reason}`)
        );
      }

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
   * getEventById => old approach
   */
  async getEventById(eventId) {
    const local = this.allEvents.get(eventId);
    if (local) {
      return local;
    }
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
    return null;
  }

  getActiveVideos() {
    return Array.from(this.activeMap.values()).sort(
      (a, b) => b.created_at - a.created_at
    );
  }
}

export const nostrClient = new NostrClient();
