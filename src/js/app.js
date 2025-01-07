// js/app.js

import { nostrClient } from './nostr.js';
import { torrentClient } from './webtorrent.js';
import { isDevMode } from './config.js';

class NosTubeApp {
    constructor() {
        // Authentication Elements
        this.loginButton = document.getElementById('loginButton');
        this.logoutButton = document.getElementById('logoutButton');
        this.userStatus = document.getElementById('userStatus');
        this.userPubKey = document.getElementById('userPubKey');

        // Form Elements
        this.submitForm = document.getElementById('submitForm');
        this.videoFormContainer = document.getElementById('videoFormContainer');

        // Video List Element
        this.videoList = document.getElementById('videoList');

        // Video Player Elements
        this.playerSection = document.getElementById('playerSection');
        this.videoElement = document.getElementById('video');
        this.status = document.getElementById('status');
        this.progressBar = document.getElementById('progress');
        this.peers = document.getElementById('peers');
        this.speed = document.getElementById('speed');
        this.downloaded = document.getElementById('downloaded');

        // Modal Elements
        this.playerModal = document.getElementById('playerModal');
        this.modalVideo = document.getElementById('modalVideo');
        this.modalStatus = document.getElementById('modalStatus');
        this.modalProgress = document.getElementById('modalProgress');
        this.modalPeers = document.getElementById('modalPeers');
        this.modalSpeed = document.getElementById('modalSpeed');
        this.modalDownloaded = document.getElementById('modalDownloaded');
        this.closePlayerBtn = document.getElementById('closePlayer');

        // Video Info Elements
        this.videoTitle = document.getElementById('videoTitle');
        this.videoDescription = document.getElementById('videoDescription');
        this.videoTimestamp = document.getElementById('videoTimestamp');

        // Creator Info Elements
        this.creatorAvatar = document.getElementById('creatorAvatar').querySelector('img');
        this.creatorName = document.getElementById('creatorName');
        this.creatorNpub = document.getElementById('creatorNpub');

        // Notification Containers
        this.errorContainer = document.getElementById('errorContainer');
        this.successContainer = document.getElementById('successContainer');

        this.pubkey = null;
        this.currentMagnetUri = null;
    }

    /**
     * Initializes the application by setting up the Nostr client and loading videos.
     */
    async init() {
        try {
            // Hide the video player sections initially
            this.playerSection.classList.add('hidden');
            this.playerModal.classList.add('hidden');

            // Initialize Nostr client
            await nostrClient.init();
            this.log('Nostr client initialized.');

            // Check if user is already logged in
            const savedPubKey = localStorage.getItem('userPubKey');
            if (savedPubKey) {
                this.login(savedPubKey, false);
            }

            // Setup event listeners
            this.setupEventListeners();
            this.log('Event listeners set up.');

            // Load videos
            await this.loadVideos();
            this.log('Videos loaded.');
        } catch (error) {
            this.log('Failed to initialize app:', error);
            this.showError('Failed to connect to Nostr relay. Please try again later.');
        }
    }

    /**
     * Formats a timestamp into a "time ago" format.
     */
    formatTimeAgo(timestamp) {
        const seconds = Math.floor((Date.now() / 1000) - timestamp);
        const intervals = {
            year: 31536000,
            month: 2592000,
            week: 604800,
            day: 86400,
            hour: 3600,
            minute: 60
        };
        
        for (const [unit, secondsInUnit] of Object.entries(intervals)) {
            const interval = Math.floor(seconds / secondsInUnit);
            if (interval >= 1) {
                return `${interval} ${unit}${interval === 1 ? '' : 's'} ago`;
            }
        }
        
        return 'just now';
    }

    /**
     * Sets up event listeners for various UI interactions.
     */
    setupEventListeners() {
        // Login Button
        this.loginButton.addEventListener('click', async () => {
            try {
                const pubkey = await nostrClient.login();
                this.login(pubkey, true);
            } catch (error) {
                this.log('Login failed:', error);
                this.showError('Failed to login. Please try again.');
            }
        });

        // Logout Button
        this.logoutButton.addEventListener('click', () => {
            this.logout();
        });

        // Form submission
        this.submitForm.addEventListener('submit', (e) => this.handleSubmit(e));

        // Close Modal Button
        if (this.closePlayerBtn) {
            this.closePlayerBtn.addEventListener('click', async () => {
                await this.hideModal();
            });
        }

        // Close Modal by clicking outside content
        if (this.playerModal) {
            this.playerModal.addEventListener('click', async (e) => {
                if (e.target === this.playerModal) {
                    await this.hideModal();
                }
            });
        }

        // Video error handling
        this.videoElement.addEventListener('error', (e) => {
            const error = e.target.error;
            this.log('Video error:', error);
            if (error) {
                this.showError(`Video playback error: ${error.message || 'Unknown error'}`);
            }
        });

        // Detailed Modal Video Event Listeners
        if (this.modalVideo) {
            // Add detailed video error logging
            this.modalVideo.addEventListener('error', (e) => {
                const error = e.target.error;
                this.log('Modal video error:', error);
                if (error) {
                    this.log('Error code:', error.code);
                    this.log('Error message:', error.message);
                    this.showError(`Video playback error: ${error.message || 'Unknown error'}`);
                }
            });

            this.modalVideo.addEventListener('loadstart', () => {
                this.log('Video loadstart event fired');
            });

            this.modalVideo.addEventListener('loadedmetadata', () => {
                this.log('Video loadedmetadata event fired');
            });

            this.modalVideo.addEventListener('canplay', () => {
                this.log('Video canplay event fired');
            });
        }

        // Cleanup on page unload
        window.addEventListener('beforeunload', async () => {
            await this.cleanup();
        });
    }

    /**
     * Handles user login.
     */
    login(pubkey, saveToStorage = true) {
        this.pubkey = pubkey;
        this.loginButton.classList.add('hidden');
        this.logoutButton.classList.remove('hidden');
        this.userStatus.classList.remove('hidden');
        this.userPubKey.textContent = pubkey;
        this.videoFormContainer.classList.remove('hidden');
        this.log(`User logged in as: ${pubkey}`);

        if (saveToStorage) {
            localStorage.setItem('userPubKey', pubkey);
        }
    }

    /**
     * Handles user logout.
     */
    logout() {
        nostrClient.logout();
        this.pubkey = null;
        this.loginButton.classList.remove('hidden');
        this.logoutButton.classList.add('hidden');
        this.userStatus.classList.add('hidden');
        this.userPubKey.textContent = '';
        this.videoFormContainer.classList.add('hidden');
        localStorage.removeItem('userPubKey');
        this.log('User logged out.');
    }

    /**
     * Cleans up video player and torrents.
     */
    async cleanup() {
        try {
            if (this.videoElement) {
                this.videoElement.pause();
                this.videoElement.src = '';
                this.videoElement.load();
            }
            if (this.modalVideo) {
                this.modalVideo.pause();
                this.modalVideo.src = '';
                this.modalVideo.load();
            }
            await torrentClient.cleanup();
        } catch (error) {
            this.log('Cleanup error:', error);
        }
    }

    /**
     * Hides the video player section.
     */
    async hideVideoPlayer() {
        await this.cleanup();
        this.playerSection.classList.add('hidden');
    }

    /**
     * Hides the video modal.
     */
    async hideModal() {
        await this.cleanup();
        this.playerModal.style.display = 'none';
        this.playerModal.classList.add('hidden');
    }

    /**
     * Handles video submission.
     */
    async handleSubmit(e) {
        e.preventDefault();

        if (!this.pubkey) {
            this.showError('Please login to post a video.');
            return;
        }

        const descriptionElement = document.getElementById('description');
        const formData = {
            title: document.getElementById('title') ? document.getElementById('title').value.trim() : '',
            magnet: document.getElementById('magnet') ? document.getElementById('magnet').value.trim() : '',
            thumbnail: document.getElementById('thumbnail') ? document.getElementById('thumbnail').value.trim() : '',
            description: descriptionElement ? descriptionElement.value.trim() : '',
            mode: isDevMode ? 'dev' : 'live'
        };

        // Debugging Log: Check formData
        this.log('Form Data Collected:', formData);

        if (!formData.title || !formData.magnet) {
            this.showError('Title and Magnet URI are required.');
            return;
        }

        try {
            await nostrClient.publishVideo(formData, this.pubkey);
            this.submitForm.reset();
            await this.loadVideos();
            this.showSuccess('Video shared successfully!');
        } catch (error) {
            this.log('Failed to publish video:', error.message);
            this.showError('Failed to share video. Please try again later.');
        }
    }

    /**
     * Loads and displays videos from Nostr.
     */
    async loadVideos() {
        try {
            const videos = await nostrClient.fetchVideos();
            this.log('Fetched videos (raw):', videos);
            
            // Log detailed type info
            this.log('Videos type:', typeof videos);
            this.log('Is Array:', Array.isArray(videos), 'Length:', videos?.length);
            
            if (!videos) {
                this.log('No videos received');
                throw new Error('No videos received from relays');
            }

            // Convert to array if it isn't one
            const videosArray = Array.isArray(videos) ? videos : [videos];
            
            this.log('Processing videos array:', JSON.stringify(videosArray, null, 2));

            if (videosArray.length === 0) {
                this.log('No valid videos found.');
                this.videoList.innerHTML = '<p class="text-center text-gray-500">No videos available yet. Be the first to upload one!</p>';
                return;
            }

            // Log each video object before rendering
            videosArray.forEach((video, index) => {
                this.log(`Video ${index} details:`, {
                    id: video.id,
                    title: video.title,
                    magnet: video.magnet,
                    mode: video.mode,
                    pubkey: video.pubkey,
                    created_at: video.created_at,
                    hasTitle: Boolean(video.title),
                    hasMagnet: Boolean(video.magnet),
                    hasMode: Boolean(video.mode)
                });
            });

            this.renderVideoList(videosArray);
            this.log(`Rendered ${videosArray.length} videos successfully`);
        } catch (error) {
            this.log('Failed to fetch videos:', error);
            this.log('Error details:', {
                name: error.name,
                message: error.message,
                stack: error.stack
            });
            this.showError('An error occurred while loading videos. Please try again later.');
            this.videoList.innerHTML = '<p class="text-center text-gray-500">No videos available at the moment. Please try again later.</p>';
        }
    }

    async renderVideoList(videos) {
        try {
            console.log('RENDER VIDEO LIST - Start', { 
                videosReceived: videos, 
                videosCount: videos ? videos.length : 'N/A',
                videosType: typeof videos 
            });
    
            if (!videos) {
                console.error('NO VIDEOS RECEIVED');
                this.videoList.innerHTML = '<p class="text-center text-gray-500">No videos found.</p>';
                return;
            }
    
            // Ensure videos is an array
            const videoArray = Array.isArray(videos) ? videos : [videos];
    
            if (videoArray.length === 0) {
                console.error('VIDEO ARRAY IS EMPTY');
                this.videoList.innerHTML = '<p class="text-center text-gray-500">No videos available.</p>';
                return;
            }
    
            // Sort videos by creation date (newest first)
            videoArray.sort((a, b) => b.created_at - a.created_at);
            
            // Fetch usernames and profile pictures for all pubkeys
            const userProfiles = new Map();
            const uniquePubkeys = [...new Set(videoArray.map(v => v.pubkey))];
            
            for (const pubkey of uniquePubkeys) {
                try {
                    const userEvents = await nostrClient.pool.list(nostrClient.relays, [{
                        kinds: [0],
                        authors: [pubkey],
                        limit: 1
                    }]);
                    
                    if (userEvents[0]?.content) {
                        const profile = JSON.parse(userEvents[0].content);
                        userProfiles.set(pubkey, {
                            name: profile.name || profile.display_name || 'Unknown',
                            picture: profile.picture || `https://robohash.org/${pubkey}`
                        });
                    } else {
                        userProfiles.set(pubkey, {
                            name: 'Unknown',
                            picture: `https://robohash.org/${pubkey}`
                        });
                    }
                } catch (error) {
                    console.error(`Profile fetch error for ${pubkey}:`, error);
                    userProfiles.set(pubkey, {
                        name: 'Unknown',
                        picture: `https://robohash.org/${pubkey}`
                    });
                }
            }
    
            const renderedVideos = videoArray.map((video, index) => {
                try {
                    if (!this.validateVideo(video, index)) {
                        console.error(`Invalid video: ${video.title}`);
                        return '';
                    }
                    
                    const profile = userProfiles.get(video.pubkey) || { 
                        name: 'Unknown', 
                        picture: `https://robohash.org/${video.pubkey}` 
                    };
                    const timeAgo = this.formatTimeAgo(video.created_at);
                    
                    // Only show "Edit" button if this user owns the video (video.pubkey === this.pubkey)
                    const canEdit = (video.pubkey === this.pubkey);
                    const editButton = canEdit
                      ? `<button
                           class="mt-2 text-sm text-blue-400 hover:text-blue-300"
                           onclick="app.handleEditVideo(${index})">
                           Edit
                         </button>`
                      : '';

                    return `
                        <div class="video-card bg-gray-900 rounded-lg overflow-hidden shadow-lg hover:shadow-2xl transition-all duration-300">
                            <div class="aspect-w-16 aspect-h-9 bg-gray-800 cursor-pointer relative group" 
                                 onclick="app.playVideo('${encodeURIComponent(video.magnet)}')">
                                ${video.thumbnail ? 
                                    `<img src="${this.escapeHTML(video.thumbnail)}" 
                                         alt="${this.escapeHTML(video.title)}" 
                                         class="w-full h-full object-cover">` :
                                    `<div class="flex items-center justify-center h-full bg-gray-800">
                                        <svg class="w-16 h-16 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                    </div>`
                                }
                                <div class="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-20 transition-opacity duration-300"></div>
                            </div>
                            <div class="p-4">
                                <h3 class="text-lg font-bold text-white mb-2 line-clamp-2 hover:text-blue-400 cursor-pointer"
                                    onclick="app.playVideo('${encodeURIComponent(video.magnet)}')">
                                    ${this.escapeHTML(video.title)}
                                </h3>
                                <div class="flex space-x-3 items-center mb-2">
                                    <div class="flex-shrink-0">
                                        <div class="w-8 h-8 rounded-full bg-gray-700 overflow-hidden">
                                            <img src="${this.escapeHTML(profile.picture)}" alt="${profile.name}" class="w-full h-full object-cover">
                                        </div>
                                    </div>
                                    <div class="flex-1 min-w-0">
                                        <p class="text-sm text-gray-400 hover:text-gray-300 cursor-pointer">
                                            ${this.escapeHTML(profile.name)}
                                        </p>
                                        <div class="flex items-center text-xs text-gray-500 mt-1">
                                            <span>${timeAgo}</span>
                                        </div>
                                    </div>
                                </div>
                                ${editButton}
                            </div>
                        </div>
                    `;
                } catch (error) {
                    console.error(`Error processing video ${index}:`, error);
                    return '';
                }
            }).filter(html => html.length > 0);
    
            console.log('Rendered videos:', renderedVideos.length);
    
            if (renderedVideos.length === 0) {
                this.videoList.innerHTML = '<p class="text-center text-gray-500">No valid videos to display.</p>';
                return;
            }
    
            this.videoList.innerHTML = renderedVideos.join('');
            console.log('Videos rendered successfully');
    
        } catch (error) {
            console.error('Rendering error:', error);
            this.videoList.innerHTML = '<p class="text-center text-gray-500">Error loading videos.</p>';
        }
    }

    /**
     * Validates a video object
     * Updated to include event ID validation
     */
    validateVideo(video, index) {
        const validationResults = {
            hasId: Boolean(video?.id),
            isValidId: typeof video?.id === 'string' && video.id.trim().length > 0,
            hasVideo: Boolean(video),
            hasTitle: Boolean(video?.title),
            hasMagnet: Boolean(video?.magnet),
            hasMode: Boolean(video?.mode),
            hasPubkey: Boolean(video?.pubkey),
            isValidTitle: typeof video?.title === 'string' && video.title.length > 0,
            isValidMagnet: typeof video?.magnet === 'string' && video.magnet.length > 0,
            isValidMode: typeof video?.mode === 'string' && ['dev', 'live'].includes(video.mode)
        };
        
        const passed = Object.values(validationResults).every(Boolean);
        console.log(`Video ${video?.title} validation results:`, validationResults, passed ? 'PASSED' : 'FAILED');
        
        return passed;
    }

    /**
     * Gets a user-friendly error message.
     */
    getErrorMessage(error) {
        if (error.message.includes('404')) {
            return 'Service worker not found. Please check server configuration.';
        } else if (error.message.includes('Brave')) {
            return 'Please disable Brave Shields for this site to play videos.';
        } else if (error.message.includes('timeout')) {
            return 'Connection timeout. Please check your internet connection.';
        } else {
            return 'Failed to play video. Please try again.';
        }
    }

    /**
     * Shows an error message to the user.
     */
    showError(message) {
        if (this.errorContainer) {
            this.errorContainer.textContent = message;
            this.errorContainer.classList.remove('hidden');
            setTimeout(() => {
                this.errorContainer.classList.add('hidden');
                this.errorContainer.textContent = '';
            }, 5000);
        } else {
            alert(message);
        }
    }

    /**
     * Shows a success message to the user.
     */
    showSuccess(message) {
        if (this.successContainer) {
            this.successContainer.textContent = message;
            this.successContainer.classList.remove('hidden');
            setTimeout(() => {
                this.successContainer.classList.add('hidden');
                this.successContainer.textContent = '';
            }, 5000);
        } else {
            alert(message);
        }
    }

    /**
     * Escapes HTML to prevent XSS.
     */
    escapeHTML(unsafe) {
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    /**
     * Logs messages to console.
     */
    log(message) {
        console.log(message);
    }

    /**
     * Plays a video given its magnet URI.
     * This method handles the logic to initiate torrent download and play the video.
     */
    async playVideo(magnetURI) {
        try {
            if (!magnetURI) {
                this.showError('Invalid Magnet URI.');
                return;
            }
    
            // Decode the magnet URI
            const decodedMagnet = decodeURIComponent(magnetURI);
            
            // Don't restart if it's the same video
            if (this.currentMagnetUri === decodedMagnet) {
                this.log('Same video requested - already playing');
                return;
            }
    
            // Store current magnet URI
            this.currentMagnetUri = decodedMagnet;
    
            // Show the modal first
            this.playerModal.style.display = 'flex';
            this.playerModal.classList.remove('hidden');
    
            // Find the video data
            const videos = await nostrClient.fetchVideos();
            const video = videos.find(v => v.magnet === decodedMagnet);
            
            if (!video) {
                this.showError('Video data not found.');
                return;
            }
    
            // Fetch creator profile
            let creatorProfile = { name: 'Unknown', picture: `https://robohash.org/${video.pubkey}` };
            try {
                const userEvents = await nostrClient.pool.list(nostrClient.relays, [{
                    kinds: [0],
                    authors: [video.pubkey],
                    limit: 1
                }]);
                
                if (userEvents[0]?.content) {
                    const profile = JSON.parse(userEvents[0].content);
                    creatorProfile = {
                        name: profile.name || profile.display_name || 'Unknown',
                        picture: profile.picture || `https://robohash.org/${video.pubkey}`
                    };
                }
            } catch (error) {
                this.log('Error fetching creator profile:', error);
            }
    
            // Convert pubkey to npub
            let creatorNpub = 'Unknown';
            try {
                creatorNpub = window.NostrTools.nip19.npubEncode(video.pubkey);
            } catch (error) {
                this.log('Error converting pubkey to npub:', error);
                creatorNpub = video.pubkey;
            }
    
            // Update video info
            this.videoTitle.textContent = video.title || 'Untitled';
            this.videoDescription.textContent = video.description || 'No description available.';
            this.videoTimestamp.textContent = this.formatTimeAgo(video.created_at);
    
            // Update creator info
            this.creatorName.textContent = creatorProfile.name;
            this.creatorNpub.textContent = `${creatorNpub.slice(0, 8)}...${creatorNpub.slice(-4)}`;
            this.creatorAvatar.src = creatorProfile.picture;
            this.creatorAvatar.alt = creatorProfile.name;
    
            // Start streaming
            this.log('Starting video stream:', decodedMagnet);
            await torrentClient.streamVideo(decodedMagnet, this.modalVideo);
    
            // Update UI elements based on existing DOM elements that webtorrent.js updates
            const updateInterval = setInterval(() => {
                // Check if modal is still visible
                if (!document.body.contains(this.modalVideo)) {
                    clearInterval(updateInterval);
                    return;
                }
    
                const status = document.getElementById('status');
                const progress = document.getElementById('progress');
                const peers = document.getElementById('peers');
                const speed = document.getElementById('speed');
                const downloaded = document.getElementById('downloaded');
    
                if (status) this.modalStatus.textContent = status.textContent;
                if (progress) this.modalProgress.style.width = progress.style.width;
                if (peers) this.modalPeers.textContent = peers.textContent;
                if (speed) this.modalSpeed.textContent = speed.textContent;
                if (downloaded) this.modalDownloaded.textContent = downloaded.textContent;
            }, 1000);
    
        } catch (error) {
            this.log('Error in playVideo:', error);
            this.showError(`Playback error: ${error.message}`);
        }
    }

    /**
     * Updates the UI with the current torrent status.
     */
    updateTorrentStatus(torrent) {
        if (!torrent) return;

        this.modalStatus.textContent = torrent.status;
        this.modalProgress.style.width = `${(torrent.progress * 100).toFixed(2)}%`;
        this.modalPeers.textContent = `Peers: ${torrent.numPeers}`;
        this.modalSpeed.textContent = `${(torrent.downloadSpeed / 1024).toFixed(2)} KB/s`;
        this.modalDownloaded.textContent = `${(torrent.downloaded / (1024 * 1024)).toFixed(2)} MB / ${(torrent.length / (1024 * 1024)).toFixed(2)} MB`;

        // Update periodically
        if (torrent.ready) {
            this.modalStatus.textContent = 'Ready to play';
        } else {
            setTimeout(() => this.updateTorrentStatus(torrent), 1000);
        }
    }

    /**
     * Allows the user to edit a video note (only if they are the owner).
     * We reuse the note's existing d tag via nostrClient.editVideo.
     * @param {number} index - The index of the video in the rendered list
     */
    async handleEditVideo(index) {
        try {
            const videos = await nostrClient.fetchVideos();
            const video = videos[index];
    
            if (!this.pubkey) {
                this.showError('Please login to edit videos.');
                return;
            }
            if (video.pubkey !== this.pubkey) {
                this.showError('You do not own this video.');
                return;
            }
    
            // Prompt for new fields, but leave old value if user cancels or leaves blank.
            const newTitle = prompt('New Title? (Leave blank to keep existing)', video.title);
            const newMagnet = prompt('New Magnet Link? (Leave blank to keep existing)', video.magnet);
            const newThumbnail = prompt('New Thumbnail URL? (Leave blank to keep existing)', video.thumbnail);
            const newDescription = prompt('New Description? (Leave blank to keep existing)', video.description);
    
            // If user cancels ANY prompt, it returns `null`.
            // If user typed nothing and clicked OK, it’s an empty string ''.
            // So we do checks to keep the old value if needed:
            const title = (newTitle === null || newTitle.trim() === '') 
                ? video.title 
                : newTitle.trim();
    
            const magnet = (newMagnet === null || newMagnet.trim() === '') 
                ? video.magnet 
                : newMagnet.trim();
    
            const thumbnail = (newThumbnail === null || newThumbnail.trim() === '') 
                ? video.thumbnail 
                : newThumbnail.trim();
    
            const description = (newDescription === null || newDescription.trim() === '') 
                ? video.description 
                : newDescription.trim();
    
            // Build updated data
            const updatedData = {
                title,
                magnet,
                thumbnail,
                description,
                mode: isDevMode ? 'dev' : 'live'
            };
    
            const originalEvent = {
                id: video.id,
                pubkey: video.pubkey,
                tags: video.tags // Must include ["d","someValue"] to reuse the same note
            };
    
            await nostrClient.editVideo(originalEvent, updatedData, this.pubkey);
            this.showSuccess('Video updated successfully!');
            await this.loadVideos();
        } catch (err) {
            this.log('Failed to edit video:', err.message);
            this.showError('Failed to edit video. Please try again later.');
        }
    }
    
}

export const app = new NosTubeApp();

// Initialize app
app.init();

// Make playVideo accessible globally for the onclick handlers
window.app = app;
