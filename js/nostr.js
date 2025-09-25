// js/nostr.js

import { isDevMode } from "./config.js";
import { ACCEPT_LEGACY_V1 } from "./constants.js";
import { accessControl } from "./accessControl.js";
// 🔧 merged conflicting changes from codex/update-video-publishing-and-parsing-logic vs unstable
import { deriveTitleFromEvent, magnetFromText } from "./videoEventUtils.js";

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

const EXTENSION_MIME_MAP = {
  mp4: "video/mp4",
  m4v: "video/x-m4v",
  webm: "video/webm",
  mkv: "video/x-matroska",
  mov: "video/quicktime",
  avi: "video/x-msvideo",
  ogv: "video/ogg",
  ogg: "video/ogg",
  m3u8: "application/x-mpegURL",
  mpd: "application/dash+xml",
  ts: "video/mp2t",
  mpg: "video/mpeg",
  mpeg: "video/mpeg",
  flv: "video/x-flv",
  "3gp": "video/3gpp",
};

function inferMimeTypeFromUrl(url) {
  if (!url || typeof url !== "string") {
    return "";
  }

  let pathname = "";
  try {
    const parsed = new URL(url);
    pathname = parsed.pathname || "";
  } catch (err) {
    const sanitized = url.split("?")[0].split("#")[0];
    pathname = sanitized || "";
  }

  const lastSegment = pathname.split("/").pop() || "";
  const match = lastSegment.match(/\.([a-z0-9]+)$/i);
  if (!match) {
    return "";
  }

  const extension = match[1].toLowerCase();
  return EXTENSION_MIME_MAP[extension] || "";
}

/**
 * Convert a raw Nostr event into Bitvid's canonical "video" object.
 *
 * The converter intentionally centralises all of the quirky legacy handling so
 * that feed rendering, subscriptions, and deep links rely on the exact same
 * rules. Any future regression around magnet-only posts or malformed JSON
 * should be solved by updating this function (and its tests) instead of
 * sprinkling ad-hoc checks elsewhere in the UI.
 *
 * Also accepts legacy (<v2) payloads when ACCEPT_LEGACY_V1 allows it.
 */
function convertEventToVideo(event = {}) {
  const safeTrim = (value) => (typeof value === "string" ? value.trim() : "");

  const rawContent = typeof event.content === "string" ? event.content : "";
  const tags = Array.isArray(event.tags) ? event.tags : [];

  let parsedContent = {};
  let parseError = null;
  if (rawContent) {
    try {
      const parsed = JSON.parse(rawContent);
      if (parsed && typeof parsed === "object") {
        parsedContent = parsed;
      }
    } catch (err) {
      parseError = err;
      parsedContent = {};
    }
  }

  const directUrl = safeTrim(parsedContent.url);
  const directMagnetRaw = safeTrim(parsedContent.magnet);

  const normalizeMagnetCandidate = (value) => {
    if (typeof value !== "string") {
      return "";
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return "";
    }
    if (trimmed.toLowerCase().startsWith("magnet:?")) {
      return trimmed;
    }
    const extracted = magnetFromText(trimmed);
    return extracted ? extracted.trim() : "";
  };

  let magnet = normalizeMagnetCandidate(directMagnetRaw);
  let rawMagnet = magnet ? directMagnetRaw : "";

  if (!magnet && ACCEPT_LEGACY_V1) {
    const inlineMagnet = normalizeMagnetCandidate(rawContent);
    if (inlineMagnet) {
      magnet = inlineMagnet;
    }

    if (!magnet) {
      outer: for (const tag of tags) {
        if (!Array.isArray(tag) || tag.length < 2) {
          continue;
        }

        const key =
          typeof tag[0] === "string" ? tag[0].trim().toLowerCase() : "";

        const startIndex = key === "magnet" ? 1 : 0;
        for (let i = startIndex; i < tag.length; i += 1) {
          const candidate = normalizeMagnetCandidate(tag[i]);
          if (candidate) {
            magnet = candidate;
            break outer;
          }
        }
      }
    }

    if (!magnet) {
      const recoveredFromRaw = magnetFromText(rawContent);
      if (recoveredFromRaw) {
        magnet = safeTrim(recoveredFromRaw);
      }
    }
  }

  if (!rawMagnet && magnet) {
    rawMagnet = magnet;
  }

  const url = directUrl;

  if (!url && !magnet) {
    return { id: event.id, invalid: true, reason: "missing playable source" };
  }

  const thumbnail = safeTrim(parsedContent.thumbnail);
  const description = safeTrim(parsedContent.description);
  const rawMode = safeTrim(parsedContent.mode);
  const mode = rawMode || "live";
  const deleted = parsedContent.deleted === true;
  const isPrivate = parsedContent.isPrivate === true;
  const videoRootId = safeTrim(parsedContent.videoRootId) || event.id;

  let infoHash = "";
  const pushInfoHash = (candidate) => {
    if (typeof candidate !== "string") {
      return false;
    }
    const normalized = candidate.trim().toLowerCase();
    if (/^[0-9a-f]{40}$/.test(normalized)) {
      infoHash = normalized;
      return true;
    }
    return false;
  };

  pushInfoHash(parsedContent.infoHash);

  if (!infoHash && magnet) {
    const match = magnet.match(/xt=urn:btih:([0-9a-z]+)/i);
    if (match && match[1]) {
      pushInfoHash(match[1]);
    }
  }

  const searchInfoHashInString = (value) => {
    if (infoHash || typeof value !== "string") {
      return;
    }
    const match = value.match(/[0-9a-f]{40}/i);
    if (match && match[0]) {
      pushInfoHash(match[0]);
    }
  };

  if (!infoHash && ACCEPT_LEGACY_V1) {
    searchInfoHashInString(rawContent);
    for (const tag of tags) {
      if (infoHash) {
        break;
      }
      if (!Array.isArray(tag)) {
        continue;
      }
      for (let i = 0; i < tag.length; i += 1) {
        searchInfoHashInString(tag[i]);
        if (infoHash) {
          break;
        }
      }
    }
  }

  const declaredTitle = safeTrim(parsedContent.title);
  const derivedTitle = deriveTitleFromEvent({
    parsedContent,
    tags,
    primaryTitle: declaredTitle,
  });

  let title = safeTrim(derivedTitle);
  if (!title && ACCEPT_LEGACY_V1 && (magnet || infoHash)) {
    title = infoHash
      ? `Legacy Video ${infoHash.slice(0, 8)}`
      : "Legacy BitTorrent Video";
  }

  if (!title) {
    const reason = parseError
      ? "missing title (json parse error)"
      : "missing title";
    return { id: event.id, invalid: true, reason };
  }

  const rawVersion = parsedContent.version;
  let version = rawVersion === undefined ? 2 : Number(rawVersion);
  if (!Number.isFinite(version)) {
    version = rawVersion === undefined ? 2 : 1;
  }

  if (version < 2 && !ACCEPT_LEGACY_V1) {
    return {
      id: event.id,
      invalid: true,
      reason: `unsupported version ${version}`,
    };
  }

  return {
    id: event.id,
    videoRootId,
    version,
    isPrivate,
    title,
    url,
    magnet,
    rawMagnet,
    infoHash,
    thumbnail,
    description,
    mode,
    deleted,
    pubkey: event.pubkey,
    created_at: event.created_at,
    tags,
    invalid: false,
  };
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

export { convertEventToVideo };

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

  // We subscribe to kind `0` purely as a liveness probe because almost every
  // relay can answer it quickly. Either an `event` or `eose` signals success,
  // while the 5s timer guards against relays that never respond. We immediately
  // `unsub` to avoid leaking subscriptions. Note: any future change must still
  // provide a lightweight readiness check with similar timeout semantics.
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
   * Publish a new video using the v3 content schema.
   */
  async publishVideo(videoData, pubkey) {
    if (!pubkey) throw new Error("Not logged in to publish video.");

    if (isDevMode) {
      console.log("Publishing new video with data:", videoData);
    }

    const rawMagnet = typeof videoData.magnet === "string" ? videoData.magnet : "";
    let finalMagnet = rawMagnet.trim();
    if (videoData.isPrivate && finalMagnet) {
      finalMagnet = fakeEncrypt(finalMagnet);
    }
    const finalUrl =
      typeof videoData.url === "string" ? videoData.url.trim() : "";
    const finalThumbnail =
      typeof videoData.thumbnail === "string" ? videoData.thumbnail.trim() : "";
    const finalDescription =
      typeof videoData.description === "string"
        ? videoData.description.trim()
        : "";
    const finalTitle =
      typeof videoData.title === "string" ? videoData.title.trim() : "";
    const providedMimeType =
      typeof videoData.mimeType === "string"
        ? videoData.mimeType.trim()
        : "";

    const createdAt = Math.floor(Date.now() / 1000);

    // brand-new root & d
    const videoRootId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const dTagValue = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const contentObject = {
      version: 3,
      title: finalTitle,
      url: finalUrl,
      magnet: finalMagnet,
      thumbnail: finalThumbnail,
      description: finalDescription,
      mode: videoData.mode || "live",
      videoRootId,
      deleted: false,
      isPrivate: videoData.isPrivate ?? false,
    };

    const event = {
      kind: 30078,
      pubkey,
      created_at: createdAt,
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

      if (finalUrl) {
        const inferredMimeType = inferMimeTypeFromUrl(finalUrl);
        const mimeType =
          providedMimeType || inferredMimeType || "application/octet-stream";

        const mirrorTags = [
          ["url", finalUrl],
          ["m", mimeType],
        ];

        if (finalThumbnail) {
          mirrorTags.push(["thumb", finalThumbnail]);
        }

        const altText = finalDescription || finalTitle || "";
        if (altText) {
          mirrorTags.push(["alt", altText]);
        }

        if (!contentObject.isPrivate && finalMagnet) {
          mirrorTags.push(["magnet", finalMagnet]);
        }

        const mirrorEvent = {
          kind: 1063,
          pubkey,
          created_at: createdAt,
          tags: mirrorTags,
          content: altText,
        };

        if (isDevMode) {
          console.log("Prepared NIP-94 mirror event:", mirrorEvent);
        }

        try {
          const signedMirrorEvent = await window.nostr.signEvent(mirrorEvent);
          if (isDevMode) {
            console.log("Signed NIP-94 mirror event:", signedMirrorEvent);
          }

          await Promise.all(
            this.relays.map(async (url) => {
              try {
                await this.pool.publish([url], signedMirrorEvent);
                if (isDevMode) {
                  console.log(`NIP-94 mirror published to ${url}`);
                }
              } catch (mirrorErr) {
                if (isDevMode) {
                  console.error(
                    `Failed to publish NIP-94 mirror to ${url}`,
                    mirrorErr
                  );
                }
              }
            })
          );

          if (isDevMode) {
            console.log(
              "NIP-94 mirror dispatched for hosted URL:",
              finalUrl
            );
          }
        } catch (mirrorError) {
          if (isDevMode) {
            console.error(
              "Failed to sign/publish NIP-94 mirror event:",
              mirrorError
            );
          }
        }
      } else if (isDevMode) {
        console.log("Skipping NIP-94 mirror: no hosted URL provided.");
      }
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

    const oldUrl = baseEvent.url || "";

    // Determine if the updated note should be private
    const wantPrivate = updatedData.isPrivate ?? baseEvent.isPrivate ?? false;

    // Use the new magnet if provided; otherwise, fall back to the decrypted old magnet
    const newMagnetValue =
      typeof updatedData.magnet === "string" ? updatedData.magnet.trim() : "";
    let finalPlainMagnet = newMagnetValue || oldPlainMagnet;
    let finalMagnet =
      wantPrivate && finalPlainMagnet
        ? fakeEncrypt(finalPlainMagnet)
        : finalPlainMagnet;

    const newUrlValue =
      typeof updatedData.url === "string" ? updatedData.url.trim() : "";
    const finalUrl = newUrlValue || oldUrl;

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
      url: finalUrl,
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
          url: fetched.url,
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
      url: "",
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
            url: vid.url,
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
          `[subscribeVideos] found ${invalidDuringSub.length} invalid video notes (with reasons):`,
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
    const originalUnsub =
      typeof sub.unsub === "function" ? sub.unsub.bind(sub) : () => {};
    let unsubscribed = false;
    sub.unsub = () => {
      if (unsubscribed) {
        return;
      }
      unsubscribed = true;
      clearInterval(processInterval);
      try {
        return originalUnsub();
      } catch (err) {
        console.error("[subscribeVideos] Failed to unsub from pool:", err);
        return undefined;
      }
    };

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
          `Skipped ${invalidNotes.length} invalid video notes:\n`,
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
