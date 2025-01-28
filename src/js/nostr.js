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

class NostrClient {
  constructor() {
    this.pool = null;
    this.pubkey = null;
    this.relays = RELAY_URLS;

    // We keep a Map of subscribed videos for quick lookups by event.id
    this.subscribedVideos = new Map();
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

      if (isDevMode)
        console.log(`Connected to ${successfulRelays.length} relay(s)`);
    } catch (err) {
      console.error("Nostr init failed:", err);
      throw err;
    }
  }

  // Helper method to handle relay connections
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

      // Debug logs
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
      if (isDevMode)
        console.log(
          "Successfully logged in with extension. Public key:",
          this.pubkey
        );
      return this.pubkey;
    } catch (e) {
      console.error("Login error:", e);
      throw e;
    }
  }

  /**
   * Logs out the user.
   */
  logout() {
    this.pubkey = null;
    if (isDevMode) console.log("User logged out.");
  }

  /**
   * Decodes an NSEC key.
   */
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

    // Default version is 1 if not specified
    const version = videoData.version ?? 1;

    const uniqueD = `${Date.now()}-${Math.random()
      .toString(36)
      .substring(2, 10)}`;

    // Always mark "deleted" false for new posts
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
      created_at: Math.floor(Date.now() / 100),
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

    // Grab the d tag from the original event
    const dTag = originalEvent.tags.find((tag) => tag[0] === "d");
    if (!dTag) {
      throw new Error(
        'This event has no "d" tag, cannot edit as addressable kind=30078.'
      );
    }
    const existingD = dTag[1];

    // Parse old content
    const oldContent = JSON.parse(originalEvent.content || "{}");
    if (isDevMode) {
      console.log("Old content:", oldContent);
    }

    // Keep old version & deleted status
    const oldVersion = oldContent.version ?? 1;
    const oldDeleted = oldContent.deleted === true;
    const newVersion = updatedVideoData.version ?? oldVersion;

    const oldWasPrivate = oldContent.isPrivate === true;

    // 1) If old was private, decrypt the old magnet once => oldPlainMagnet
    let oldPlainMagnet = oldContent.magnet || "";
    if (oldWasPrivate && oldPlainMagnet) {
      oldPlainMagnet = fakeDecrypt(oldPlainMagnet);
    }

    // 2) If updatedVideoData.isPrivate is explicitly set, use that; else keep the old isPrivate
    const newIsPrivate =
      typeof updatedVideoData.isPrivate === "boolean"
        ? updatedVideoData.isPrivate
        : oldContent.isPrivate ?? false;

    // 3) The user might type a new magnet or keep oldPlainMagnet
    const userTypedMagnet = (updatedVideoData.magnet || "").trim();
    const finalPlainMagnet = userTypedMagnet || oldPlainMagnet;

    // 4) If new is private => encrypt finalPlainMagnet once; otherwise store plaintext
    let finalMagnet = finalPlainMagnet;
    if (newIsPrivate) {
      finalMagnet = fakeEncrypt(finalPlainMagnet);
    }

    // Build updated content
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

      // Publish to all relays
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
   * and republishing with the same (kind=30078, pubkey, d) address.
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
      throw new Error(
        'This event has no "d" tag, cannot delete as addressable kind=30078.'
      );
    }
    const existingD = dTag[1];

    const oldContent = JSON.parse(originalEvent.content || "{}");
    const oldVersion = oldContent.version ?? 1;

    // Mark it "deleted" and clear out magnet, thumbnail, etc.
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

    // Reuse the same d-tag for an addressable edit
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
   * Subscribes to video events from all configured relays, storing them in a Map.
   *
   * @param {Function} onVideo - Callback fired for each new/updated video
   */
  subscribeVideos(onVideo) {
    const filter = {
      kinds: [30078],
      "#t": ["video"],
      limit: 500, // Adjust as needed
      since: 0,
    };

    if (isDevMode) {
      console.log("[subscribeVideos] Subscribing with filter:", filter);
    }

    // Create subscription across all relays
    const sub = this.pool.sub(this.relays, [filter]);

    sub.on("event", (event) => {
      try {
        const content = JSON.parse(event.content);

        // If marked deleted
        if (content.deleted === true) {
          // Remove it from our Map if we had it
          if (this.subscribedVideos.has(event.id)) {
            this.subscribedVideos.delete(event.id);
            // Optionally notify the callback so UI can remove it
            // onVideo(null, { deletedId: event.id });
          }
          return;
        }

        // Construct a video object
        const video = {
          id: event.id,
          version: content.version ?? 1,
          isPrivate: content.isPrivate ?? false,
          title: content.title || "",
          magnet: content.magnet || "",
          thumbnail: content.thumbnail || "",
          description: content.description || "",
          mode: content.mode || "live",
          pubkey: event.pubkey,
          created_at: event.created_at,
          tags: event.tags,
        };

        // Check if we already have it in our Map
        if (!this.subscribedVideos.has(event.id)) {
          // It's new, so store it
          this.subscribedVideos.set(event.id, video);
          // Then notify the callback that a new video arrived
          onVideo(video);
        } else {
          // Optional: if you want to detect edits, compare the new vs. old and update
          // this.subscribedVideos.set(event.id, video);
          // onVideo(video) to re-render, etc.
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
      // Optionally: onVideo(null, { eose: true }) to signal initial load done
    });

    return sub; // so you can unsub later if needed
  }

  /**
   * A one-time, bulk fetch of videos from all configured relays.
   * (Limit has been reduced to 300 for better performance.)
   */
  async fetchVideos() {
    const filter = {
      kinds: [30078],
      "#t": ["video"],
      limit: 300, // Reduced from 1000 for quicker fetches
      since: 0,
    };
    const videoEvents = new Map();

    try {
      // Query each relay in parallel
      await Promise.all(
        this.relays.map(async (url) => {
          const events = await this.pool.list([url], [filter]);
          for (const evt of events) {
            try {
              const content = JSON.parse(evt.content);
              if (content.deleted) {
                videoEvents.delete(evt.id);
              } else {
                videoEvents.set(evt.id, {
                  id: evt.id,
                  pubkey: evt.pubkey,
                  created_at: evt.created_at,
                  title: content.title || "",
                  magnet: content.magnet || "",
                  thumbnail: content.thumbnail || "",
                  description: content.description || "",
                  mode: content.mode || "live",
                  isPrivate: content.isPrivate || false,
                  tags: evt.tags,
                });
              }
            } catch (e) {
              console.error("Error parsing event content:", e);
            }
          }
        })
      );

      // Turn the Map into a sorted array
      const allVideos = Array.from(videoEvents.values()).sort(
        (a, b) => b.created_at - a.created_at
      );
      return allVideos;
    } catch (err) {
      console.error("fetchVideos error:", err);
      return [];
    }
  }

  /**
   * Validates video content structure.
   */
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
        console.log("Validation details:", {
          hasTitle: typeof content.title === "string",
          hasMagnet: typeof content.magnet === "string",
          hasMode: typeof content.mode === "string",
          validThumbnail:
            typeof content.thumbnail === "string" ||
            typeof content.thumbnail === "undefined",
          validDescription:
            typeof content.description === "string" ||
            typeof content.description === "undefined",
        });
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
