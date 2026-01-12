import WebTorrent from "../webtorrent.min.js";
import { userLogger } from "./logger.js";

/**
 * Calculates the torrent infoHash for a given file client-side.
 * This operation requires reading and hashing the entire file, so it may take time for large files.
 *
 * @param {File} file - The file object to hash.
 * @returns {Promise<string>} - Resolves with the hex encoded infoHash.
 */
export async function calculateTorrentInfoHash(file) {
  if (!file) {
    throw new Error("No file provided for hashing.");
  }

  // Create a temporary client just for hashing.
  // We disable trackers and dht/lsd to keep it quiet and fast (local only).
  const client = new WebTorrent({
    tracker: false,
    dht: false,
    lsd: false,
    webSeeds: false,
  });

  return new Promise((resolve, reject) => {
    // Seed the file. This calculates the infoHash.
    // We use destroyStoreOnDestroy: true to clean up memory/storage afterwards.
    try {
        client.seed(
          file,
          {
            announce: [], // No trackers
            destroyStoreOnDestroy: true,
            name: file.name,
          },
          (torrent) => {
            const infoHash = torrent.infoHash;
            // Destroy the client and the torrent data immediately.
            client.destroy((err) => {
              if (err) {
                userLogger.warn("Error destroying temporary hashing client:", err);
              }
              if (infoHash) {
                resolve(infoHash);
              } else {
                reject(new Error("Failed to calculate info hash."));
              }
            });
          }
        );

        client.on("error", (err) => {
            userLogger.error("WebTorrent client error during hashing:", err);
            client.destroy();
            reject(err);
        });
    } catch (err) {
        client.destroy();
        reject(err);
    }
  });
}
