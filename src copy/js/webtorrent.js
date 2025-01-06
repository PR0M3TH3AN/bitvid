// js/webtorrent.js

export class TorrentClient {
    constructor() {
        this.client = new WebTorrent();
        this.currentTorrent = null;

        // Handle client-level errors
        this.client.on('error', (err) => {
            console.error('WebTorrent client error:', err.message);
            // Optionally, emit events or handle errors globally
        });
    }

    /**
     * Streams a video from a given Magnet URI into a specified HTML element.
     * @param {string} magnetURI - The Magnet URI of the torrent.
     * @param {HTMLElement} playerElement - The HTML element where the video will be rendered.
     * @returns {Promise<void>} Resolves when streaming starts successfully.
     */
    streamVideo(magnetURI, playerElement) {
        return new Promise((resolve, reject) => {
            if (!magnetURI) {
                reject(new Error('Magnet URI is required.'));
                return;
            }

            console.log(`Adding torrent: ${magnetURI}`);

            // If there's an existing torrent, remove it first
            if (this.currentTorrent) {
                console.log('Removing existing torrent before adding a new one.');
                this.client.remove(this.currentTorrent, (err) => {
                    if (err) {
                        console.error('Error removing existing torrent:', err.message);
                        // Proceed to add the new torrent even if removal fails
                    }
                    this._addTorrent(magnetURI, playerElement, resolve, reject);
                });
            } else {
                this._addTorrent(magnetURI, playerElement, resolve, reject);
            }
        });
    }

    /**
     * Adds a torrent and streams the video.
     * @private
     * @param {string} magnetURI - The Magnet URI of the torrent.
     * @param {HTMLElement} playerElement - The HTML element where the video will be rendered.
     * @param {Function} resolve - The resolve function of the Promise.
     * @param {Function} reject - The reject function of the Promise.
     */
    _addTorrent(magnetURI, playerElement, resolve, reject) {
        this.client.add(magnetURI, (torrent) => {
            this.currentTorrent = torrent;
            console.log('Torrent metadata received:', torrent.infoHash);

            // Find the first compatible video file in the torrent
            const file = torrent.files.find(file => {
                return file.name.endsWith('.mp4') || 
                       file.name.endsWith('.webm') ||
                       file.name.endsWith('.mkv');
            });

            if (!file) {
                console.error('No compatible video file found in the torrent.');
                reject(new Error('No compatible video file found in the torrent.'));
                return;
            }

            console.log('Streaming file:', file.name);

            // Use renderTo for better compatibility and simplicity
            file.renderTo(playerElement, { autoplay: true, controls: true }, (err, elem) => {
                if (err) {
                    console.error('Error rendering video:', err);
                    reject(err);
                } else {
                    console.log('Video rendered successfully.');
                    resolve();
                }
            });
        });

        // Handle torrent-specific errors
        this.client.on('torrent', (torrent) => {
            torrent.on('error', (err) => {
                console.error(`Torrent error (${torrent.infoHash}):`, err.message);
                reject(err);
            });
        });
    }

    /**
     * Stops streaming the current torrent and cleans up resources.
     * @returns {Promise<void>} Resolves when the torrent is successfully removed.
     */
    stopStreaming() {
        return new Promise((resolve, reject) => {
            if (this.currentTorrent) {
                console.log('Removing current torrent:', this.currentTorrent.infoHash);
                this.client.remove(this.currentTorrent, (err) => {
                    if (err) {
                        console.error('Error removing torrent:', err.message);
                        reject(err);
                    } else {
                        console.log('Torrent removed successfully.');
                        this.currentTorrent = null;
                        resolve();
                    }
                });
            } else {
                console.warn('No active torrent to stop.');
                resolve(); // Nothing to do
            }
        });
    }
}

// Export an instance of TorrentClient
export const torrentClient = new TorrentClient();
