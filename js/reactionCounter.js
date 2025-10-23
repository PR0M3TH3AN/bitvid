import { publishVideoReaction } from "./nostr.js";
import { devLogger, userLogger } from "./utils/logger.js";

export const reactionCounter = {
  async publish(pointer, options = {}) {
    try {
      const result = await publishVideoReaction(pointer, options);
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
