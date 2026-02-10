/**
 * VideoEventBuffer
 *
 * Handles buffering and batch processing of incoming video events
 * to prevent UI thrashing during high-volume updates (e.g. initial load).
 */

import { isDevMode } from "../config.js";
import { devLogger, userLogger } from "../utils/logger.js";
import { convertEventToVideo } from "./nip71.js";

export class VideoEventBuffer {
  constructor(client, onVideo) {
    this.client = client;
    this.onVideo = onVideo;
    this.buffer = [];
    this.invalidEvents = [];
    this.flushTimerId = null;
    this.FLUSH_DEBOUNCE_MS = 75;
  }

  push(event) {
    this.buffer.push(event);
    this.scheduleFlush(false);
  }

  scheduleFlush(immediate = false) {
    if (this.flushTimerId) {
      if (!immediate) {
        return;
      }
      clearTimeout(this.flushTimerId);
      this.flushTimerId = null;
    }

    if (immediate) {
      this.flush();
      return;
    }

    this.flushTimerId = setTimeout(() => {
      this.flushTimerId = null;
      this.flush();
    }, this.FLUSH_DEBOUNCE_MS);
  }

  flush() {
    if (!this.buffer.length) {
      return;
    }

    const toProcess = this.buffer;
    this.buffer = [];
    const updatedVideos = [];

    for (const evt of toProcess) {
      try {
        if (evt && evt.id) {
          this.client.rawEvents.set(evt.id, evt);
        }
        const video = convertEventToVideo(evt);

        if (video.invalid) {
          this.invalidEvents.push({ id: video.id, reason: video.reason });
          continue;
        }

        // Merge any NIP-71 metadata we might already have cached for this video
        this.client.mergeNip71MetadataIntoVideo(video);
        // Determine the "true" creation time of the root video
        this.client.applyRootCreatedAt(video);

        const activeKey = this.client.getActiveKey(video);
        const wasDeletedEvent = video.deleted === true;

        // If this is a deletion event (Kind 5 or deletion marker), record a tombstone
        // to prevent older versions from resurrecting.
        if (wasDeletedEvent) {
          this.client.recordTombstone(activeKey, video.created_at);
        } else {
          // Otherwise, check if this video is already known to be deleted
          this.client.applyTombstoneGuard(video);
        }

        // Store in allEvents (history preservation)
        this.client.allEvents.set(evt.id, video);
        this.client.dirtyEventIds.add(evt.id);

        // If it's a "deleted" note, remove from activeMap
        if (video.deleted) {
          if (activeKey) {
            if (wasDeletedEvent) {
              this.client.activeMap.delete(activeKey);
            } else {
              const currentActive = this.client.activeMap.get(activeKey);
              if (currentActive?.id === video.id) {
                this.client.activeMap.delete(activeKey);
              }
            }
          }
          continue;
        }

        // LATEST-WINS LOGIC
        // We only update the UI if the incoming video is newer than what we have.
        // This handles the "Edit" case where multiple versions exist on relays.
        const prevActive = this.client.activeMap.get(activeKey);
        if (!prevActive || video.created_at > prevActive.created_at) {
          this.client.activeMap.set(activeKey, video);
          updatedVideos.push(video);
        }
      } catch (err) {
        devLogger.error("[VideoEventBuffer] Error processing event:", err);
      }
    }

    if (updatedVideos.length > 0) {
      // Trigger the callback once per batch to avoid UI thrashing
      this.onVideo(updatedVideos);

      // Fetch NIP-71 metadata (categorization tags) in the background for the whole batch
      this.client.populateNip71MetadataForVideos(updatedVideos)
        .then(() => {
          for (const video of updatedVideos) {
            this.client.applyRootCreatedAt(video);
          }
        })
        .catch((error) => {
          devLogger.warn(
            "[nostr] Failed to hydrate NIP-71 metadata for live video batch:",
            error
          );
        });
    }

    // Persist processed events after each flush so reloads warm quickly.
    this.client.saveLocalData("subscribeVideos:flush");
  }

  handleEose() {
    if (isDevMode && this.invalidEvents.length > 0) {
      userLogger.warn(
        `[subscribeVideos] found ${this.invalidEvents.length} invalid video notes (with reasons):`,
        this.invalidEvents
      );
    }
    devLogger.log(
      "[subscribeVideos] Reached EOSE for all relays (historical load done)"
    );
    this.scheduleFlush(true);
  }

  cleanup() {
    if (this.flushTimerId) {
      clearTimeout(this.flushTimerId);
      this.flushTimerId = null;
    }
    // Ensure any straggling events are flushed before tearing down.
    this.flush();
  }
}
