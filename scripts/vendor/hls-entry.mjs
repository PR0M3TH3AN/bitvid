// Vendor entry for hls.js. We deliberately bundle the FULL build rather than
// `hls.js/light`: the light build drops the alternate-audio stream controller,
// and real-world HLS ladders (e.g. nostube/slidestr publishes an
// `EXT-X-MEDIA:TYPE=AUDIO` rendition group) demux audio into its own playlist.
// With the light build those streams play video-only or not at all.
export { default } from "hls.js";
