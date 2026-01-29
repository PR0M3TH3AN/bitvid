# **bitvid: Enhanced NIP-35 + WebRTC Check Integration**

### Summary
This NIP introduces **`kind=2003`** events as a standardized way to index BitTorrent metadata on Nostr. Such events typically include enough information for Nostr-based clients or indexers to display, categorize, and construct magnet links. They do **not** contain `.torrent` files themselves, only the metadata.

---

## 1. Torrent Events

**`kind=2003`** events are interpreted as “Torrent” posts. Clients can index, display, and search them. The essential tags are:

1. **`x`** (required)
   - The BitTorrent V1 info hash (hex-encoded).
   - Matches the `xt=urn:btih:HASH` parameter in magnet links.

2. **`file`** (optional, multiple)
   - Each `["file", "<filename>", "<filesize-in-bytes>"]` entry describes a file within the torrent.

3. **`tracker`** (recommended, multiple)
   - Each `["tracker", "<tracker-url>"]` entry specifies a tracker (UDP/HTTP/HTTPS/WSS).
   - If you want to support **WebTorrent/WebRTC** streaming, include at least one `wss://` tracker such as `wss://tracker.webtorrent.io`.

4. **`title`** (optional)
   - A short user-facing title or release name.

5. **`t`** (optional, multiple)
   - Simple categories or tags, e.g., `movie`, `tv`, `4k`, `3d`, `adult`.

### Example
```jsonc
{
  "kind": 2003,
  "content": "Extended cut with behind-the-scenes footage.",
  "tags": [
    ["title", "The Outer Space (Extended Cut) 2025 UHD"],
    ["x", "abc123def4567890abc123def4567890abc123de"],
    ["file", "outer_space_2025_UHD.mkv", "78000000000"],
    ["file", "extra_features", "2000000000"],
    ["tracker", "udp://tracker.openbittorrent.com:6969/announce"],
    ["tracker", "wss://tracker.webtorrent.io"],           // WebRTC-compatible
    ["t", "movie"],
    ["t", "uhd"]
  ]
}
```

---

## 2. Tag Prefixes for Extra Metadata

Beyond the basic torrent info, **NIP-35** supports optional tag prefixes to map the event to external data sources or richer category structures:

- **`tcat:`** A comma-separated category path (e.g., `["i", "tcat:video,movie,4k"]`).
- **`newznab:`** [newznab](https://github.com/Prowlarr/Prowlarr/blob/develop/src/NzbDrone.Core/Indexers/NewznabStandardCategory.cs) category IDs.
- **`tmdb:`, `ttvdb:`, `imdb:`, `mal:`, `anilist:`** References to well-known movie, TV, or anime databases.
  - May include specific media types, like `tmdb:movie:693134` or `mal:anime:9253`.

These references are optional but help indexers or other clients correlate torrent data with known database records.

### Example with prefixes
```jsonc
{
  "kind": 2003,
  "content": "Full UHD release with commentary track.",
  "tags": [
    ["title", "Dune Part Two 2160p HDR"],
    ["x", "abcdef0123456789..."],
    ["file", "Dune.Part.Two.2024.UHD.mkv", "50000000000"],
    ["tracker", "udp://tracker.openbittorrent.com:6969"],
    ["tracker", "wss://tracker.webtorrent.io"],
    ["i", "tcat:video,movie,4k"],
    ["i", "tmdb:movie:693134"],
    ["i", "ttvdb:movie:290272"],
    ["t", "movie"],
    ["t", "4k"]
  ]
}
```

---

## 3. Constructing Magnet Links

A **kind=2003** torrent event provides data to build a magnet link, typically:

```
magnet:?xt=urn:btih:<info-hash>&tr=<tracker1>&tr=<tracker2>...
```

- **`x`** tag → `<info-hash>`
- **`tracker`** tags → `&tr=<tracker-url>`

If a torrent is intended for **WebTorrent** streaming, it **must** have a `wss://` tracker in its `tracker` tags.

### Example Magnet
```
magnet:?xt=urn:btih:abc123def...&tr=wss%3A%2F%2Ftracker.webtorrent.io&tr=udp%3A%2F%2Ftracker.openbittorrent.com%3A6969
```

---

## 4. WebTorrent/WebRTC Considerations

1. **Include at least one `wss://` tracker** in your `tracker` tags. Example:
   ```jsonc
   ["tracker", "wss://tracker.webtorrent.io"]
   ```
2. **Active WebRTC seeder**: Even with a `wss://` tracker, the torrent must be seeded in real time by at least one WebTorrent/WebRTC peer. Without a WebRTC seed, browser-based clients (like bitvid or other WebTorrent-powered apps) cannot download or stream.

3. **No `.torrent` file on Nostr**: This NIP is purely metadata (info hash, tracker URLs). Traditional BitTorrent clients can still use the magnet link if it has UDP/HTTP trackers.

---

## 5. Searching & Indexing

Implementers can:

- **Index** `kind=2003` events from multiple relays.
- Provide an interface to **search** by:
  - Title (`["title", ...]`)
  - Info hash (`["x", ...]`)
  - File names (`["file", ...]`)
  - Categories (`["t", ...]`, `["i", "tcat:..."]`, etc.)
  - External references (`["i", "tmdb:movie:..."]`, `["i", "imdb:..."]`)
- **Filter** adult content by a specific tag or category if desired.

---

## 6. Torrent Comments (kind=2004)

A **kind=2004** event is used to reply to a torrent event. It functions much like a regular text note (kind=1), but:
- References the torrent event via NIP-10 reply tags.
- Often used to discuss quality, seeding, or additional info about the torrent.

---

## 7. Blocklists & Adult Filtering

While the protocol is open, clients or aggregators may apply local policies:
- **Blocklists** to ignore certain pubkeys or known spam.
- **Adult filtering** to hide or show certain categories or tags (like `["t", "adult"]` or `["i", "tcat:video,adult"]`).

This is **not** enforced at the protocol level but is left to each implementer’s discretion.

---

## 8. Implementation Notes

1. **No `.torrent` Files**
   `.torrent` files are not stored on Nostr—just the info hash and any relevant tracker URLs.

2. **Announce Sets**
   Clients should collect **all** `["tracker", ...]` tags to build a comprehensive announce set in the magnet link. This ensures maximum connectivity for both UDP/HTTP and WebRTC trackers.

3. **Fallback**
   If a torrent lacks `wss://` trackers, WebTorrent clients can’t stream it unless an external service or user rehosts it with a WebRTC seed/tracker combination.

4. **Metadata Matching**
   If `["i", "tmdb:movie:693134"]` or similar tags are present, clients may fetch additional metadata (like cover art) from that external database. This is optional and outside the core scope of NIP-35 but encouraged for better user experience.

5. **Periodic Refresh**
   Since torrents are seeded in real time, a WebTorrent client (e.g., in a browser) may show a torrent as “active” only if at least one WebRTC seed is online. Clients/aggregators might periodically check the presence of active WebRTC peers to update their UI.

---

## 9. Example JSON

Below is a more complete JSON example following NIP-35 conventions, demonstrating various optional fields:

```jsonc
{
  "kind": 2003,
  "content": "Full UHD release. Contains behind-the-scenes extras, commentary track, and sample clips.",
  "tags": [
    ["title", "Dune Part Two 2160p HDR"],
    ["x", "abcdef0123456789abcdef0123456789abcdef01"],
    ["file", "Dune.Part.Two.2024.UHD.mkv", "50000000000"],
    ["file", "Behind.The.Scenes.mp4", "2000000000"],
    ["tracker", "udp://tracker.openbittorrent.com:6969"],
    ["tracker", "wss://tracker.webtorrent.io"],
    ["tracker", "udp://tracker.coppersurfer.tk:6969"],
    ["i", "tcat:video,movie,uhd"],
    ["i", "tmdb:movie:693134"],
    ["i", "imdb:tt15239678"],
    ["t", "movie"],
    ["t", "uhd"]
  ]
}
```

---

## 10. References & Links

- **[BitTorrent Magnet Link Specification (BEP-0053)](https://www.bittorrent.org/beps/bep_0053.html)**
- **[WebTorrent Documentation](https://webtorrent.io/)**
- **[NIP-10: Replies and Mentions](https://github.com/nostr-protocol/nips/blob/master/10.md)**
- **[dtan.xyz Repository](https://git.v0l.io/Kieran/dtan)**
- **[nostrudel.ninja Implementation](https://github.com/hzrd149/nostrudel/tree/next/src/views/torrents)**

---

### End of Updated Spec Sheet

This revision aims to integrate WebTorrent/WebRTC considerations seamlessly into the existing NIP-35 structure. It remains optional to provide `wss://` trackers, but doing so is strongly recommended if you want real-time streaming in browser-based clients like bitvid or other WebTorrent-powered frontends.