const FALLBACK_MUTE_DATASET_KEY = "bitvidAutoplayFallbackMute";

/**
 * Mute playback after an unmuted autoplay rejection without recording the
 * browser-policy fallback as a viewer preference.
 */
export function muteForAutoplayFallback(videoElement) {
  if (!videoElement || videoElement.muted) {
    return false;
  }

  if (videoElement.dataset) {
    videoElement.dataset[FALLBACK_MUTE_DATASET_KEY] = "true";
  }
  videoElement.muted = true;
  return true;
}

/** Consume the marker attached to the next fallback-generated volume change. */
export function consumeAutoplayFallbackMute(videoElement) {
  if (videoElement?.dataset?.[FALLBACK_MUTE_DATASET_KEY] !== "true") {
    return false;
  }

  delete videoElement.dataset[FALLBACK_MUTE_DATASET_KEY];
  return true;
}
