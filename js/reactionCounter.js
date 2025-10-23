import { publishVideoReaction } from "./nostr.js";
import { devLogger, userLogger } from "./utils/logger.js";

export const reactionCounter = {
  async publish(pointer, options = {}) {
    try {
      const publishOptions = { ...options };

      const pointerRelayFromPointer = (() => {
        if (Array.isArray(pointer) && pointer.length >= 3) {
          const relay = pointer[2];
          if (typeof relay === "string" && relay.trim()) {
            return relay.trim();
          }
        }
        if (pointer && typeof pointer === "object") {
          const relay = pointer.relay;
          if (typeof relay === "string" && relay.trim()) {
            return relay.trim();
          }
        }
        return "";
      })();

      const pointerRelay =
        typeof publishOptions.pointerRelay === "string" && publishOptions.pointerRelay.trim()
          ? publishOptions.pointerRelay.trim()
          : pointerRelayFromPointer;

      if (pointerRelay && !publishOptions.pointerRelay) {
        publishOptions.pointerRelay = pointerRelay;
      }

      const enrichedPointer = (() => {
        if (!pointerRelay) {
          return pointer;
        }

        if (Array.isArray(pointer) && pointer.length >= 2) {
          const [type, value] = pointer;
          return [type, value, pointerRelay];
        }

        if (pointer && typeof pointer === "object") {
          return { ...pointer, relay: pointerRelay };
        }

        return pointer;
      })();

      const explicitAuthor =
        typeof publishOptions.targetAuthorPubkey === "string" &&
        publishOptions.targetAuthorPubkey.trim()
          ? publishOptions.targetAuthorPubkey.trim()
          : "";

      if (!explicitAuthor) {
        const fallbackAuthor = (() => {
          if (
            typeof publishOptions.authorPubkey === "string" &&
            publishOptions.authorPubkey.trim()
          ) {
            return publishOptions.authorPubkey.trim();
          }
          if (
            typeof publishOptions.currentVideoPubkey === "string" &&
            publishOptions.currentVideoPubkey.trim()
          ) {
            return publishOptions.currentVideoPubkey.trim();
          }
          if (
            publishOptions.video &&
            typeof publishOptions.video.pubkey === "string" &&
            publishOptions.video.pubkey.trim()
          ) {
            return publishOptions.video.pubkey.trim();
          }
          return "";
        })();

        if (fallbackAuthor) {
          publishOptions.targetAuthorPubkey = fallbackAuthor;
        }
      }

      const result = await publishVideoReaction(enrichedPointer, publishOptions);
      if (!result || !result.ok) {
        userLogger.warn(
          "[reactionCounter] Reaction publish rejected by relays:",
          result?.results || result
        );
      } else if (Array.isArray(result.acceptedRelays)) {
        devLogger.info(
          `[reactionCounter] Reaction accepted by ${result.acceptedRelays.length} relay(s):`,
          result.acceptedRelays.join(", ")
        );
      }
      return result;
    } catch (error) {
      userLogger.warn("[reactionCounter] Failed to publish reaction event:", error);
      throw error;
    }
  },
};

export default reactionCounter;
