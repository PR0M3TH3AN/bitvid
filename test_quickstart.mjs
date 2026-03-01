import { buildVideoPostEvent } from "./js/nostrEventSchemas.js";

const event = buildVideoPostEvent({
  pubkey: "your_pubkey_hex",
  created_at: Math.floor(Date.now() / 1000),
  dTagValue: "my-first-video", // The stable identifier (d-tag) for this video series
  content: {
    version: 3,
    title: "My First Video",
    videoRootId: "my-first-video", // Logical ID, matches the d-tag
    url: "https://example.com/video.mp4", // The builder automatically derives the required 's' storage tag from this URL
    description: "This is a test video post sent via the SDK."
    // magnet: "magnet:?xt=urn:btih:..." // Optional fallback (provide the raw magnet string)
  }
});

console.log("Event constructed:", event);
