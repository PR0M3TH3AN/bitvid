// js/webtorrent.js

import WebTorrent from './webtorrent.min.js'

export class TorrentClient {
    constructor() {
        this.client = new WebTorrent()
        this.currentTorrent = null
        this.TIMEOUT_DURATION = 60000 // 60 seconds
        this.statsInterval = null
    }

    log(msg) {
        console.log(msg)
    }

    async isBrave() {
        return (navigator.brave?.isBrave && await navigator.brave.isBrave()) || false
    }

    async waitForServiceWorkerActivation(registration) {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Service worker activation timeout'))
            }, this.TIMEOUT_DURATION)

            this.log('Waiting for service worker activation...')
            
            const checkActivation = () => {
                if (registration.active) {
                    clearTimeout(timeout)
                    this.log('Service worker is active')
                    resolve(registration)
                    return true
                }
                return false
            }

            if (checkActivation()) return

            registration.addEventListener('activate', () => {
                checkActivation()
            })

            if (registration.waiting) {
                this.log('Service worker is waiting, sending skip waiting message')
                registration.waiting.postMessage({ type: 'SKIP_WAITING' })
            }

            registration.addEventListener('statechange', () => {
                checkActivation()
            })
        })
    }

    async setupServiceWorker() {
        try {
            const isBraveBrowser = await this.isBrave()
            
            if (!window.isSecureContext) {
                throw new Error('HTTPS or localhost required')
            }

            if (!('serviceWorker' in navigator) || !navigator.serviceWorker) {
                throw new Error('Service Worker not supported or disabled')
            }

            if (isBraveBrowser) {
                this.log('Checking Brave configuration...')
                
                if (!navigator.serviceWorker) {
                    throw new Error('Please enable Service Workers in Brave Shield settings')
                }

                if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                    throw new Error('Please enable WebRTC in Brave Shield settings')
                }

                const registrations = await navigator.serviceWorker.getRegistrations()
                for (const registration of registrations) {
                    await registration.unregister()
                }
                await new Promise(resolve => setTimeout(resolve, 1000))
            }

            const currentPath = window.location.pathname
            const basePath = currentPath.substring(0, currentPath.lastIndexOf('/') + 1)
            
            this.log('Registering service worker...')
            const registration = await navigator.serviceWorker.register('./sw.min.js', {
                scope: basePath,
                updateViaCache: 'none'
            })
            this.log('Service worker registered')

            if (registration.installing) {
                this.log('Waiting for installation...')
                await new Promise((resolve, reject) => {
                    const timeout = setTimeout(() => {
                        reject(new Error('Installation timeout'))
                    }, this.TIMEOUT_DURATION)

                    registration.installing.addEventListener('statechange', (e) => {
                        this.log('Service worker state:', e.target.state)
                        if (e.target.state === 'activated' || e.target.state === 'redundant') {
                            clearTimeout(timeout)
                            resolve()
                        }
                    })
                })
            }

            await this.waitForServiceWorkerActivation(registration)
            this.log('Service worker activated')

            const readyRegistration = await Promise.race([
                navigator.serviceWorker.ready,
                new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('Service worker ready timeout')), this.TIMEOUT_DURATION)
                )
            ])

            if (!readyRegistration.active) {
                throw new Error('Service worker not active after ready state')
            }

            this.log('Service worker ready')
            return registration
        } catch (error) {
            this.log('Service worker setup error:', error)
            throw error
        }
    }

    formatBytes(bytes) {
        if (bytes === 0) return '0 B'
        const k = 1024
        const sizes = ['B', 'KB', 'MB', 'GB']
        const i = Math.floor(Math.log(bytes) / Math.log(k))
        return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`
    }

    async streamVideo(magnetURI, videoElement) {
        try {
            // Setup service worker first
            const registration = await this.setupServiceWorker()
            
            if (!registration || !registration.active) {
                throw new Error('Service worker setup failed')
            }

            // Create WebTorrent server AFTER service worker is ready
            this.client.createServer({ controller: registration })
            this.log('WebTorrent server created')

            return new Promise((resolve, reject) => {
                this.log('Starting torrent download')
                this.client.add(magnetURI, torrent => {
                    this.log('Torrent added: ' + torrent.name)
                    const status = document.getElementById('status')
                    const progress = document.getElementById('progress')
                    const peers = document.getElementById('peers')
                    const speed = document.getElementById('speed')
                    const downloaded = document.getElementById('downloaded')

                    if (status) status.textContent = `Loading ${torrent.name}...`

                    const file = torrent.files.find(file => 
                        file.name.endsWith('.mp4') || 
                        file.name.endsWith('.webm') || 
                        file.name.endsWith('.mkv')
                    )

                    if (!file) {
                        const error = new Error('No compatible video file found in torrent')
                        this.log(error.message)
                        if (status) status.textContent = 'Error: No video file found'
                        reject(error)
                        return
                    }

                    videoElement.muted = true
                    videoElement.crossOrigin = 'anonymous'

                    videoElement.addEventListener('error', (e) => {
                        const error = e.target.error
                        this.log('Video error:', error)
                        if (error) {
                            this.log('Error code:', error.code)
                            this.log('Error message:', error.message)
                        }
                        if (status) status.textContent = 'Error playing video. Try disabling Brave Shields.'
                    })

                    videoElement.addEventListener('canplay', () => {
                        const playPromise = videoElement.play()
                        if (playPromise !== undefined) {
                            playPromise
                                .then(() => this.log('Autoplay started'))
                                .catch(err => {
                                    this.log('Autoplay failed:', err)
                                    if (status) status.textContent = 'Click to play video'
                                    videoElement.addEventListener('click', () => {
                                        videoElement.play()
                                            .then(() => this.log('Play started by user'))
                                            .catch(err => this.log('Play failed:', err))
                                    }, { once: true })
                                })
                        }
                    })

                    videoElement.addEventListener('loadedmetadata', () => {
                        this.log('Video metadata loaded')
                        if (videoElement.duration === Infinity || isNaN(videoElement.duration)) {
                            this.log('Invalid duration, attempting to fix...')
                            videoElement.currentTime = 1e101
                            videoElement.currentTime = 0
                        }
                    })

                    try {
                        file.streamTo(videoElement)
                        this.log('Streaming started')

                        // Update stats every second
                        this.statsInterval = setInterval(() => {
                            if (!document.body.contains(videoElement)) {
                                clearInterval(this.statsInterval)
                                return
                            }

                            const percentage = torrent.progress * 100
                            if (progress) progress.style.width = `${percentage}%`
                            if (peers) peers.textContent = `Peers: ${torrent.numPeers}`
                            if (speed) speed.textContent = `${this.formatBytes(torrent.downloadSpeed)}/s`
                            if (downloaded) downloaded.textContent = 
                                `${this.formatBytes(torrent.downloaded)} / ${this.formatBytes(torrent.length)}`
                            
                            if (status) {
                                status.textContent = torrent.progress === 1 
                                    ? `${torrent.name}` 
                                    : `Loading ${torrent.name}...`
                            }
                        }, 1000)

                        this.currentTorrent = torrent
                        resolve()
                    } catch (error) {
                        this.log('Streaming error:', error)
                        if (status) status.textContent = 'Error starting video stream'
                        reject(error)
                    }

                    torrent.on('error', err => {
                        this.log('Torrent error:', err)
                        if (status) status.textContent = 'Error loading video'
                        clearInterval(this.statsInterval)
                        reject(err)
                    })
                })
            })
        } catch (error) {
            this.log('Failed to setup video streaming:', error)
            throw error
        }
    }

    async cleanup() {
        try {
            if (this.statsInterval) {
                clearInterval(this.statsInterval)
            }
            if (this.currentTorrent) {
                this.currentTorrent.destroy()
            }
            if (this.client) {
                await this.client.destroy()
                this.client = new WebTorrent() // Create a new client for future use
            }
        } catch (error) {
            this.log('Cleanup error:', error)
        }
    }
}

export const torrentClient = new TorrentClient()