import WebTorrent from "../webtorrent.min.js";
import { userLogger } from "./logger.js";

const TORRENT_SEED_OPTIONS = {
  announce: [],
  destroyStoreOnDestroy: true,
};

function seedTorrentForFile(file) {
  if (!file) {
    return Promise.reject(new Error("No file provided for hashing."));
  }

  const client = new WebTorrent({
    tracker: false,
    dht: false,
    lsd: false,
    webSeeds: false,
  });

  return new Promise((resolve, reject) => {
    try {
      client.seed(
        file,
        {
          ...TORRENT_SEED_OPTIONS,
          name: file.name,
        },
        (torrent) => {
          const infoHash = torrent.infoHash;
          const torrentFile = torrent.torrentFile || torrent.torrentFileBuffer || null;
          client.destroy((err) => {
            if (err) {
              userLogger.warn("Error destroying temporary hashing client:", err);
            }
            if (infoHash) {
              resolve({ infoHash, torrentFile });
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

/**
 * Calculates the torrent infoHash for a given file client-side.
 * This operation requires reading and hashing the entire file, so it may take time for large files.
 *
 * @param {File} file - The file object to hash.
 * @returns {Promise<string>} - Resolves with the hex encoded infoHash.
 */
export async function calculateTorrentInfoHash(file) {
  const { infoHash } = await seedTorrentForFile(file);
  return infoHash;
}

export async function createTorrentMetadata(file) {
  return seedTorrentForFile(file);
}
