import WebTorrent from 'https://esm.sh/webtorrent'

const client = new WebTorrent()

function log(msg) {
    console.log(msg)
}

// Check if running in Brave browser
async function isBrave() {
    return (navigator.brave?.isBrave && await navigator.brave.isBrave()) || false
}

// Longer timeout for Brave
const TIMEOUT_DURATION = 60000 // 60 seconds

const torrentId = 'magnet:?xt=urn:btih:08ada5a7a6183aae1e09d831df6748d566095a10&dn=Sintel&tr=udp%3A%2F%2Fexplodie.org%3A6969&tr=udp%3A%2F%2Ftracker.coppersurfer.tk%3A6969&tr=udp%3A%2F%2Ftracker.empire-js.us%3A1337&tr=udp%3A%2F%2Ftracker.leechers-paradise.org%3A6969&tr=udp%3A%2F%2Ftracker.opentrackr.org%3A1337&tr=wss%3A%2F%2Ftracker.btorrent.xyz&tr=wss%3A%2F%2Ftracker.fastcast.nz&tr=wss%3A%2F%2Ftracker.openwebtorrent.com&ws=https%3A%2F%2Fwebtorrent.io%2Ftorrents%2F&xs=https%3A%2F%2Fwebtorrent.io%2Ftorrents%2Fsintel.torrent'

async function waitForServiceWorkerActivation(registration) {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            reject(new Error('Service worker activation timeout'))
        }, TIMEOUT_DURATION)

        log('Waiting for service worker activation...')
        
        const checkActivation = () => {
            if (registration.active) {
                clearTimeout(timeout)
                log('Service worker is active')
                resolve(registration)
                return true
            }
            return false
        }

        // Check immediately
        if (checkActivation()) return

        // Set up activation listener
        registration.addEventListener('activate', () => {
            checkActivation()
        })

        // Handle waiting state
        if (registration.waiting) {
            log('Service worker is waiting, sending skip waiting message')
            registration.waiting.postMessage({ type: 'SKIP_WAITING' })
        }

        // Additional state change listener
        registration.addEventListener('statechange', () => {
            checkActivation()
        })
    })
}

async function setupServiceWorker() {
    try {
        // Check for service worker support
        if (!('serviceWorker' in navigator) || !navigator.serviceWorker) {
            throw new Error('Service Worker not supported or disabled')
        }

        // Brave-specific initialization
        if (await isBrave()) {
            log('Brave browser detected')
            // Force clear any existing registrations in Brave
            const registrations = await navigator.serviceWorker.getRegistrations()
            for (const registration of registrations) {
                await registration.unregister()
            }
            // Add delay for Brave's privacy checks
            await new Promise(resolve => setTimeout(resolve, 1000))
        }

        // Get current path for service worker scope
        const currentPath = window.location.pathname
        const basePath = currentPath.substring(0, currentPath.lastIndexOf('/') + 1)
        
        // Register service worker with explicit scope
        log('Registering service worker...')
        const registration = await navigator.serviceWorker.register('./sw.min.js', {
            scope: basePath,
            updateViaCache: 'none'
        })
        log('Service worker registered')

        // Wait for installation
        if (registration.installing) {
            log('Waiting for installation...')
            await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error('Installation timeout'))
                }, TIMEOUT_DURATION)

                registration.installing.addEventListener('statechange', (e) => {
                    log('Service worker state:', e.target.state)
                    if (e.target.state === 'activated' || e.target.state === 'redundant') {
                        clearTimeout(timeout)
                        resolve()
                    }
                })
            })
        }

        // Wait for activation
        await waitForServiceWorkerActivation(registration)
        log('Service worker activated')

        // Wait for ready state
        const readyRegistration = await Promise.race([
            navigator.serviceWorker.ready,
            new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Service worker ready timeout')), TIMEOUT_DURATION)
            )
        ])

        if (!readyRegistration.active) {
            throw new Error('Service worker not active after ready state')
        }

        log('Service worker ready')
        return registration
    } catch (error) {
        log('Service worker setup error:', error)
        throw error
    }
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`
}

function startTorrent() {
    log('Starting torrent download')
    client.add(torrentId, torrent => {
        const status = document.querySelector('#status')
        const progress = document.querySelector('#progress')
        const video = document.querySelector('#video')
        const peers = document.querySelector('#peers')
        const speed = document.querySelector('#speed')
        const downloaded = document.querySelector('#downloaded')
        
        log('Torrent added: ' + torrent.name)
        status.textContent = `Loading ${torrent.name}...`

        const file = torrent.files.find(file => file.name.endsWith('.mp4'))
        if (!file) {
            log('No MP4 file found in torrent')
            status.textContent = 'Error: No video file found'
            return
        }

        // Set up video element
        video.muted = true
        video.crossOrigin = 'anonymous'

        // Enhanced video error handling
        video.addEventListener('error', (e) => {
            const error = e.target.error
            log('Video error:', error)
            if (error) {
                log('Error code:', error.code)
                log('Error message:', error.message)
            }
            status.textContent = 'Error playing video. Try disabling Brave Shields for this site.'
        })

        video.addEventListener('canplay', () => {
            const playPromise = video.play()
            if (playPromise !== undefined) {
                playPromise
                    .then(() => log('Autoplay started'))
                    .catch(err => {
                        log('Autoplay failed:', err)
                        status.textContent = 'Click to play video'
                        // Add click-to-play handler
                        video.addEventListener('click', () => {
                            video.play()
                                .then(() => log('Play started by user'))
                                .catch(err => log('Play failed:', err))
                        }, { once: true })
                    })
            }
        })

        // Handle metadata loading
        video.addEventListener('loadedmetadata', () => {
            log('Video metadata loaded')
            if (video.duration === Infinity || isNaN(video.duration)) {
                log('Invalid duration, attempting to fix...')
                video.currentTime = 1e101
                video.currentTime = 0
            }
        })

        try {
            file.streamTo(video)
            log('Streaming started')
        } catch (error) {
            log('Streaming error:', error)
            status.textContent = 'Error starting video stream'
        }

        // Update stats every second
        const statsInterval = setInterval(() => {
            if (!document.body.contains(video)) {
                clearInterval(statsInterval)
                return
            }

            const percentage = torrent.progress * 100
            progress.style.width = `${percentage}%`
            peers.textContent = `Peers: ${torrent.numPeers}`
            speed.textContent = `${formatBytes(torrent.downloadSpeed)}/s`
            downloaded.textContent = `${formatBytes(torrent.downloaded)} / ${formatBytes(torrent.length)}`
            
            if (torrent.progress === 1) {
                status.textContent = `${torrent.name}`
            } else {
                status.textContent = `Loading ${torrent.name}...`
            }
        }, 1000)

        torrent.on('error', err => {
            log('Torrent error:', err)
            status.textContent = 'Error loading video'
            clearInterval(statsInterval)
        })

        // Cleanup handler
        window.addEventListener('beforeunload', () => {
            clearInterval(statsInterval)
            client.destroy()
        })
    })
}

async function init() {
    try {
        const isBraveBrowser = await isBrave()
        
        // Check for secure context
        if (!window.isSecureContext) {
            throw new Error('HTTPS or localhost required')
        }

        // Brave-specific checks
        if (isBraveBrowser) {
            log('Checking Brave configuration...')
            
            // Check if service workers are enabled
            if (!navigator.serviceWorker) {
                throw new Error('Please enable Service Workers in Brave Shield settings')
            }

            // Check for WebRTC
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                throw new Error('Please enable WebRTC in Brave Shield settings')
            }
        }

        log('Setting up service worker...')
        const registration = await setupServiceWorker()
        
        if (!registration || !registration.active) {
            throw new Error('Service worker setup failed')
        }
        
        log('Service worker activated and ready')

        // Create WebTorrent server with activated service worker
        client.createServer({ controller: registration })
        log('WebTorrent server created')

        // Start the torrent
        startTorrent()
    } catch (error) {
        log('Initialization error:', error)
        const status = document.querySelector('#status')
        if (status) {
            const errorMessage = await isBrave() 
                ? `${error.message} (Try disabling Brave Shields for this site)`
                : error.message
            status.textContent = 'Error initializing: ' + errorMessage
        }
    }
}

// Start everything when page loads
window.addEventListener('load', init)