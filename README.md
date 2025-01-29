![](https://bitvid.netlify.app/assets/jpg/bitvid.jpg)

# bitvid - Decentralized Video Sharing

##### IPNS: [k51qzi5uqu5dgwr4oejq9rk41aoe9zcupenby6iqecsk5byc7rx48uecd133a1_](https://k51qzi5uqu5dgwr4oejq9rk41aoe9zcupenby6iqecsk5byc7rx48uecd133a1.ipns.dweb.link/)

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
   - Provide a title, magnet link, and optional thumbnail or description.
   - Toggle "Private" for encrypted listings.
4. **Stream Videos**:
   - Play videos directly in the browser using WebTorrent technology.

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
