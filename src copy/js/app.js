// js/app.js

import { nostrClient } from './nostr.js';
import { torrentClient } from './webtorrent.js';
import { isDevMode } from './config.js';

class NosTubeApp {
    constructor() {
        this.loginButton = document.getElementById('loginButton');
        this.logoutButton = document.getElementById('logoutButton'); // Added logout button
        this.userStatus = document.getElementById('userStatus');
        this.userPubKey = document.getElementById('userPubKey');
        this.submitForm = document.getElementById('submitForm');
        this.playerModal = document.getElementById('playerModal');
        this.player = document.getElementById('player');
        this.videoList = document.getElementById('videoList');
        this.closePlayerBtn = document.getElementById('closePlayer');
        this.errorContainer = document.getElementById('errorContainer');
        this.successContainer = document.getElementById('successContainer');
        this.videoFormContainer = document.getElementById('videoFormContainer'); // Added form container

        this.pubkey = null;
    }

    /**
     * Initializes the application by setting up the Nostr client and loading videos.
     */
    async init() {
        try {
            // Ensure the modal is hidden by default
            this.playerModal.classList.add('hidden');

            // Hide the video submission form initially
            this.videoFormContainer.classList.add('hidden');

            // Initialize Nostr client
            await nostrClient.init();
            console.log('Nostr client initialized.');

            // Check if user is already logged in (e.g., from localStorage)
            const savedPubKey = localStorage.getItem('userPubKey');
            if (savedPubKey) {
                this.login(savedPubKey, false); // Do not prompt for login again
            }

            // Setup event listeners
            this.setupEventListeners();
            console.log('Event listeners set up.');

            // Load videos
            await this.loadVideos();
            console.log('Videos loaded.');
        } catch (error) {
            console.error('Failed to initialize app:', error);
            this.showError('Failed to connect to Nostr relay. Please try again later.');
        }
    }

    /**
     * Sets up event listeners for login, logout, form submission, and modal interactions.
     */
    setupEventListeners() {
        // Login Button
        this.loginButton.addEventListener('click', async () => {
            try {
                const pubkey = await nostrClient.login();
                this.login(pubkey, true);
            } catch (error) {
                console.error('Login failed:', error);
                this.showError('Failed to login. Please try again.');
            }
        });

        // Logout Button
        this.logoutButton.addEventListener('click', () => {
            this.logout();
        });

        // Form submission
        this.submitForm.addEventListener('submit', (e) => this.handleSubmit(e));

        // Close player modal
        if (this.closePlayerBtn) {
            this.closePlayerBtn.addEventListener('click', () => {
                console.log('Close button clicked. Hiding modal...');
                this.hideModal();
            });
        } else {
            console.error('Close button not found!');
        }

        // Close modal when clicking outside the modal content
        if (this.playerModal) {
            this.playerModal.addEventListener('click', (e) => {
                if (e.target === this.playerModal) {
                    console.log('Clicked outside modal content. Hiding modal...');
                    this.hideModal();
                }
            });
        } else {
            console.error('playerModal not found!');
        }
    }

    /**
     * Handles user login by updating UI elements.
     * @param {string} pubkey - The public key of the logged-in user.
     * @param {boolean} saveToStorage - Whether to save the pubkey to localStorage.
     */
    login(pubkey, saveToStorage = true) {
        this.pubkey = pubkey;
        this.loginButton.classList.add('hidden');
        this.logoutButton.classList.remove('hidden');
        this.userStatus.classList.remove('hidden');
        this.userPubKey.textContent = pubkey;
        this.videoFormContainer.classList.remove('hidden'); // Show form
        console.log(`User logged in as: ${pubkey}`);

        if (saveToStorage) {
            localStorage.setItem('userPubKey', pubkey);
        }
    }

    /**
     * Logs out the user by resetting UI elements and internal state.
     */
    logout() {
        nostrClient.logout();
        this.pubkey = null;
        this.loginButton.classList.remove('hidden');
        this.logoutButton.classList.add('hidden');
        this.userStatus.classList.add('hidden');
        this.userPubKey.textContent = '';
        this.videoFormContainer.classList.add('hidden'); // Hide form
        localStorage.removeItem('userPubKey');
        console.log('User logged out.');
    }

    /**
     * Hides the player modal, clears the player content, and stops streaming.
     */
    async hideModal() {
        if (this.playerModal) {
            this.playerModal.classList.add('hidden');
            this.playerModal.classList.remove('flex');
            console.log('Modal hidden.');
        } else {
            console.error('playerModal is undefined.');
        }

        if (this.player) {
            this.player.innerHTML = ''; // Clear video content when modal is closed
            console.log('Player content cleared.');
        } else {
            console.error('player is undefined.');
        }

        try {
            await torrentClient.stopStreaming();
            console.log('Streaming stopped.');
        } catch (error) {
            console.error('Error stopping streaming:', error.message);
        }
    }

    /**
     * Handles the submission of a new video.
     * @param {Event} e - The form submission event.
     */
    async handleSubmit(e) {
        e.preventDefault();

        if (!this.pubkey) {
            this.showError('Please login to post a video.');
            return;
        }

        const formData = {
            title: document.getElementById('title').value.trim(),
            magnet: document.getElementById('magnet').value.trim(),
            thumbnail: document.getElementById('thumbnail').value.trim(),
            mode: isDevMode ? 'dev' : 'live', // Add mode to the metadata
        };

        // Basic client-side validation
        if (!formData.title || !formData.magnet) {
            this.showError('Title and Magnet URI are required.');
            return;
        }

        try {
            await nostrClient.publishVideo(formData, this.pubkey);
            this.submitForm.reset();
            await this.loadVideos(); // Refresh video list
            this.showSuccess('Video shared successfully!');
        } catch (error) {
            console.error('Failed to publish video:', error.message);
            this.showError('Failed to share video. Please try again later.');
        }
    }

    /**
     * Loads videos from the relays and renders them.
     */
    async loadVideos() {
        try {
            const videos = await nostrClient.fetchVideos();
            if (videos.length === 0) {
                console.log('No valid videos found.');
            }
            this.renderVideoList(videos);
        } catch (error) {
            console.error('Failed to fetch videos:', error.message);
            this.showError('An error occurred while loading videos. Please try again later.');
        }
    }

    /**
     * Renders the list of videos in the UI.
     * @param {Array} videos - An array of video objects to render.
     */
    renderVideoList(videos) {
        if (videos.length === 0) {
            this.videoList.innerHTML = '<p class="text-center text-gray-500">No videos available yet. Be the first to upload one!</p>';
            return;
        }

        // Sort videos by creation date (newest first)
        videos.sort((a, b) => b.created_at - a.created_at);

        this.videoList.innerHTML = videos.map(video => `
            <div class="video-card ${video.mode === 'dev' ? 'border border-red-500' : ''}">
                <div class="aspect-w-16 aspect-h-9 bg-gray-100">
                    ${video.thumbnail ? 
                        `<img src="${this.escapeHTML(video.thumbnail)}" alt="${this.escapeHTML(video.title)}" class="object-cover w-full h-48">` :
                        '<div class="flex items-center justify-center h-48 bg-gray-200">No thumbnail</div>'
                    }
                </div>
                <div class="details p-4">
                    <h3 class="text-lg font-semibold mb-2">${this.escapeHTML(video.title)}</h3>
                    <p class="text-sm ${video.mode === 'dev' ? 'text-red-500' : 'text-green-500'}">
                        ${video.mode.toUpperCase()}
                    </p>
                    <button 
                        onclick="app.playVideo('${encodeURIComponent(video.magnet)}')"
                        class="bg-blue-500 text-white px-4 py-2 rounded-md hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                    >
                        Play Video
                    </button>
                </div>
            </div>
        `).join('');
    }

    /**
     * Plays the selected video using the torrent client.
     * @param {string} magnetURI - The Magnet URI of the video to play.
     */
    async playVideo(magnetURI) {
        if (!magnetURI) {
            this.showError('Invalid Magnet URI.');
            return;
        }

        console.log('Opening video modal...');
        this.playerModal.classList.remove('hidden');
        this.playerModal.classList.add('flex');
        console.log('Modal opened for video playback.');

        try {
            await torrentClient.streamVideo(decodeURIComponent(magnetURI), this.player);
        } catch (error) {
            console.error('Failed to play video:', error.message);
            this.showError('Failed to play video. Please try again.');
            this.hideModal();
        }
    }

    /**
     * Displays an error message to the user.
     * @param {string} message - The error message to display.
     */
    showError(message) {
        if (this.errorContainer) {
            this.errorContainer.textContent = message;
            this.errorContainer.classList.remove('hidden');
            console.warn(`Error displayed to user: ${message}`);

            // Hide the error message after 5 seconds
            setTimeout(() => {
                this.errorContainer.classList.add('hidden');
                this.errorContainer.textContent = '';
            }, 5000);
        } else {
            console.warn('Error container not found. Falling back to alert.');
            alert(message); // Fallback for missing error container
        }
    }

    /**
     * Displays a success message to the user.
     * @param {string} message - The success message to display.
     */
    showSuccess(message) {
        if (this.successContainer) {
            this.successContainer.textContent = message;
            this.successContainer.classList.remove('hidden');
            console.log(`Success message displayed: ${message}`);

            // Hide the success message after 5 seconds
            setTimeout(() => {
                this.successContainer.classList.add('hidden');
                this.successContainer.textContent = '';
            }, 5000);
        } else {
            console.log('Success container not found. Falling back to alert.');
            alert(message); // Fallback for missing success container
        }
    }

    /**
     * Escapes HTML characters to prevent XSS attacks.
     * @param {string} unsafe - The string to escape.
     * @returns {string} The escaped string.
     */
    escapeHTML(unsafe) {
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
}

// Initialize app
const app = new NosTubeApp();
app.init();

// Make playVideo accessible globally for the onclick handlers
window.app = app;
