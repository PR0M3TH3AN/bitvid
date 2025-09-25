![](https://bitvid.netlify.app/assets/jpg/bitvid.jpg)

# bitvid - Decentralized Video Sharing

##### IPNS: [k51qzi5uqu5dgwr4oejq9rk41aoe9zcupenby6iqecsk5byc7rx48uecd133a1](https://k51qzi5uqu5dgwr4oejq9rk41aoe9zcupenby6iqecsk5byc7rx48uecd133a1.ipns.dweb.link/)

**bitvid** is a decentralized platform where users can share videos and follow creators with privacy and freedom. Built with a static site architecture, it’s lightweight, efficient, and fully decentralized, making it ideal for hosting or local deployment.

---

## Features

- **Decentralized Sharing**: Video sharing without central servers.
- **Private Video Listings**: Share encrypted videos for added privacy.
- **Nostr Integration**: Use Nostr keys for login and interaction.
- **WebTorrent Streaming**: Stream videos directly through torrent technology.
- **Developer-Friendly**: Open source and customizable for your needs.
- **Responsive Design**: Seamless experience across devices.

---

## For Users

### Getting Started

1. **Visit the Site**: Navigate to the live instance of **bitvid** (e.g., `[https://bitvid.network](https://bitvid.network)`).
2. **Login with Nostr**:
   - Use a compatible Nostr browser extension or manually input your public key.
3. **Upload Videos**:
   - Provide a title plus a hosted URL (recommended) and optionally a magnet link. Bitvid plays the URL first and falls back to WebTorrent.
   - Toggle "Private" for encrypted listings.
4. **Stream Videos**:
   - The player attempts the hosted URL first and uses WebTorrent as a fallback when a magnet is available.

#### P2P Hints

- Append `ws=` parameters to magnets to expose HTTPS web seeds that help the fallback warm up quickly.
- Append `xs=` parameters when you have an HTTPS `.torrent` URL so WebTorrent can bootstrap without waiting on peer discovery.

---

## For Developers

### Local Setup

To run **bitvid** locally:

1. Clone the repository:

   ```bash
   git clone https://github.com/PR0M3TH3AN/bitvid.git
   cd bitvid
   ```

2. Start a local server:

   - Using Python:
     ```bash
     python -m http.server 8000
     ```
   - Or with Node.js:
     ```bash
     npx serve
     ```

3. Open the site in your browser:
   ```
   http://localhost:8000
   ```

### Configuration

- **`config.js`**:
  - Toggle `isDevMode` for development (`true`) or production (`false`).
- **`js/constants.js`**:
  - Source for browser-safe tracker lists and feature flags that govern WebTorrent behavior.
- **Magnet helpers**:
  - Use `safeDecodeMagnet()` and `normalizeAndAugmentMagnet()` from `js/magnetUtils.js` to preserve hashes and add `ws=` / `xs=` hints safely.

### Adding Features

1. **Fork the repository** and create a new branch for your feature.
2. Make changes and test locally.
3. Submit a pull request with a detailed explanation of your contribution.

---

## For Contributors

### How to Contribute

1. **Fork and Clone**:
   ```bash
   git clone https://github.com/PR0M3TH3AN/bitvid.git
   cd bitvid
   ```
2. **Create a Branch**:
   ```bash
   git checkout -b feature/your-feature-name
   ```
3. **Make Changes**:
   - Ensure your code follows best practices and is well-documented.
4. **Test**:
   - Validate the site functionality locally before submitting.
5. **Submit a Pull Request**:
   - Explain your changes and reference any related issues.

### Contribution Guidelines

- Follow the [MIT License](https://opensource.org/licenses/MIT).
- Use clear, concise commit messages.
- Respect the existing coding style and architecture.
- Run the manual QA script (see below) and note results in PR descriptions for changes that affect upload or playback.

---

## Testing

Use the manual QA checklist before releases or when altering upload/playback flows:

1. Open the Upload modal, confirm validation (title plus URL or magnet), and test submissions for URL-only, magnet-only, and combined entries.
2. Publish a post with both URL and magnet, verify the player streams the hosted URL, then simulate a URL failure and confirm WebTorrent playback.
3. Paste encoded magnets to ensure `safeDecodeMagnet()` returns the raw string and `normalizeAndAugmentMagnet()` adds `ws=` / `xs=` hints without corruption.
4. Confirm magnets include HTTPS `ws=` / optional `xs=` hints and use the WSS tracker list from `js/constants.js`.
5. Spot-check Chromium and Firefox for console warnings (CORS, Range requests, tracker connectivity).

See [`docs/qa.md`](docs/qa.md) for the copy/paste-friendly checklist we share with QA.

---

## Acknowledgments

**bitvid** leverages the following open-source technologies:

- **Nostr Tools** for decentralized identity management.
- **WebTorrent** for P2P video streaming.
- **TailwindCSS** for responsive design.

---

## Contact & Support

- **Website**: [bitvid.network](https://bitvid.network)
- **GitHub**: [PR0M3TH3AN](https://github.com/PR0M3TH3AN)
- **Nostr**: [npub13yarr7j6vjqjjkahd63dmr27curypehx45ucue286ac7sft27y0srnpmpe](https://primal.net/p/npub13yarr7j6vjqjjkahd63dmr27curypehx45ucue286ac7sft27y0srnpmpe)
