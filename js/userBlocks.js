// js/userBlocks.js
import {
  nostrClient,
  requestDefaultExtensionPermissions,
} from "./nostr.js";
import { buildBlockListEvent, BLOCK_LIST_IDENTIFIER } from "./nostrEventSchemas.js";
import { userLogger } from "./utils/logger.js";
import {
  publishEventToRelays,
  assertAnyRelayAccepted,
} from "./nostrPublish.js";

const FAST_BLOCKLIST_RELAY_LIMIT = 3;
const FAST_BLOCKLIST_TIMEOUT_MS = 2500;
const BACKGROUND_BLOCKLIST_TIMEOUT_MS = 6000;

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

    const permissionResult = await requestDefaultExtensionPermissions();
    if (!permissionResult.ok) {
      userLogger.warn(
        "[UserBlockList] Unable to load block list without extension permissions.",
        permissionResult.error,
      );
      this.reset();
      this.loaded = true;
      return;
    }

    if (!window?.nostr?.nip04?.decrypt) {
      userLogger.warn(
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

      const relays = Array.isArray(nostrClient.relays)
        ? nostrClient.relays.filter((relay) => typeof relay === "string" && relay)
        : [];

      if (!relays.length) {
        this.blockedPubkeys.clear();
        this.blockEventId = null;
        this.loaded = true;
        return;
      }

      const fastRelays = relays.slice(0, FAST_BLOCKLIST_RELAY_LIMIT);
      const backgroundRelays = relays.slice(fastRelays.length);

      const fetchFromRelay = (relayUrl, timeoutMs, requireEvent) =>
        new Promise((resolve, reject) => {
          let settled = false;
          const timer = setTimeout(() => {
            if (settled) {
              return;
            }
            settled = true;
            const timeoutError = new Error(
              `Timed out fetching block list from ${relayUrl} after ${timeoutMs}ms`
            );
            timeoutError.code = "timeout";
            timeoutError.relay = relayUrl;
            timeoutError.timeoutMs = timeoutMs;
            reject(timeoutError);
          }, timeoutMs);

          Promise.resolve()
            .then(() => nostrClient.pool.list([relayUrl], [filter]))
            .then((result) => {
              if (settled) {
                return;
              }
              settled = true;
              clearTimeout(timer);
              const events = Array.isArray(result)
                ? result.filter((event) => event && event.pubkey === normalized)
                : [];
              if (requireEvent && !events.length) {
                const emptyError = new Error(
                  `No block list events returned from ${relayUrl}`
                );
                emptyError.code = "empty";
                emptyError.relay = relayUrl;
                reject(emptyError);
                return;
              }
              resolve({ relayUrl, events });
            })
            .catch((error) => {
              if (settled) {
                return;
              }
              settled = true;
              clearTimeout(timer);
              const wrapped =
                error instanceof Error ? error : new Error(String(error));
              wrapped.relay = relayUrl;
              reject(wrapped);
            });
        });

      const fastPromises = fastRelays.map((relayUrl) =>
        fetchFromRelay(relayUrl, FAST_BLOCKLIST_TIMEOUT_MS, true)
      );
      const backgroundPromises = backgroundRelays.map((relayUrl) =>
        fetchFromRelay(relayUrl, BACKGROUND_BLOCKLIST_TIMEOUT_MS, false)
      );

      const applyEvents = async (events, { skipIfEmpty = false } = {}) => {
        if (!Array.isArray(events) || !events.length) {
          if (skipIfEmpty) {
            return;
          }
          this.blockedPubkeys.clear();
          this.blockEventId = null;
          return;
        }

        const sorted = events
          .filter((event) => event && event.pubkey === normalized)
          .sort((a, b) => (b?.created_at || 0) - (a?.created_at || 0));

        if (!sorted.length) {
          if (skipIfEmpty) {
            return;
          }
          this.blockedPubkeys.clear();
          this.blockEventId = null;
          return;
        }

        const newest = sorted[0];
        if (newest?.id && newest.id === this.blockEventId && this.blockedPubkeys.size) {
          return;
        }

        this.blockEventId = newest?.id || null;

        if (!newest?.content) {
          this.blockedPubkeys.clear();
          return;
        }

        let decrypted = "";
        try {
          decrypted = await window.nostr.nip04.decrypt(normalized, newest.content);
        } catch (err) {
          userLogger.error("[UserBlockList] Failed to decrypt block list:", err);
          this.blockedPubkeys.clear();
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
          userLogger.error("[UserBlockList] Failed to parse block list:", err);
          this.blockedPubkeys.clear();
        }
      };

      const background = Promise.allSettled([
        ...fastPromises,
        ...backgroundPromises,
      ])
        .then(async (outcomes) => {
          const aggregated = [];
          for (const outcome of outcomes) {
            if (outcome.status === "fulfilled") {
              const events = Array.isArray(outcome.value?.events)
                ? outcome.value.events
                : [];
              if (events.length) {
                aggregated.push(...events);
              }
            } else {
              const reason = outcome.reason;
              if (reason?.code === "timeout") {
                userLogger.warn(
                  `[UserBlockList] Relay ${reason.relay} timed out while loading block list (${reason.timeoutMs}ms)`
                );
              } else {
                const relay = reason?.relay || reason?.relayUrl;
                userLogger.error(
                  `[UserBlockList] Relay error at ${relay}:`,
                  reason?.error ?? reason
                );
              }
            }
          }

          if (!aggregated.length) {
            return;
          }

          await applyEvents(aggregated, { skipIfEmpty: true });
        })
        .catch((error) => {
          userLogger.error("[UserBlockList] background block list refresh failed:", error);
        });

      let fastResult = null;
      if (fastPromises.length) {
        try {
          fastResult = await Promise.any(fastPromises);
        } catch (error) {
          if (error instanceof AggregateError) {
            error.errors?.forEach((err) => {
              if (err?.code === "timeout") {
                userLogger.warn(
                  `[UserBlockList] Relay ${err.relay} timed out while loading block list (${err.timeoutMs}ms)`
                );
              }
            });
          } else {
            userLogger.error("[UserBlockList] Fast block list fetch failed:", error);
          }
        }
      }

      if (fastResult?.events?.length) {
        await applyEvents(fastResult.events);
        background.catch(() => {});
        return;
      }

      this.blockedPubkeys.clear();
      this.blockEventId = null;
      background.catch(() => {});
    } catch (error) {
      userLogger.error("[UserBlockList] loadBlocks failed:", error);
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
    const permissionResult = await requestDefaultExtensionPermissions();
    if (!permissionResult.ok) {
      userLogger.warn(
        "[UserBlockList] Extension permissions denied while updating the block list.",
        permissionResult.error,
      );
      const err = new Error(
        "The NIP-07 extension must allow encryption and signing before updating the block list.",
      );
      err.code = "extension-permission-denied";
      err.cause = permissionResult.error;
      throw err;
    }

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

    const publishResults = await publishEventToRelays(
      nostrClient.pool,
      nostrClient.relays,
      signedEvent
    );

    let publishSummary;
    try {
      publishSummary = assertAnyRelayAccepted(publishResults, {
        context: "block list",
      });
    } catch (publishError) {
      if (publishError?.relayFailures?.length) {
        publishError.relayFailures.forEach(
          ({ url, error: relayError, reason }) => {
            userLogger.error(
              `[UserBlockList] Block list rejected by ${url}: ${reason}`,
              relayError || reason
            );
          }
        );
      }
      throw publishError;
    }

    if (publishSummary.failed.length) {
      publishSummary.failed.forEach(({ url, error: relayError }) => {
        const reason =
          relayError instanceof Error
            ? relayError.message
            : relayError
            ? String(relayError)
            : "publish failed";
        userLogger.warn(
          `[UserBlockList] Block list not accepted by ${url}: ${reason}`,
          relayError
        );
      });
    }

    this.blockEventId = signedEvent.id;
    return signedEvent;
  }
}

export const userBlocks = new UserBlockListManager();

if (typeof window !== "undefined") {
  window.userBlocks = userBlocks;
}
