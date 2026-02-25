/**
 * Fallback image source for video thumbnails.
 */
export const FALLBACK_THUMBNAIL_SRC = "/assets/jpg/video-thumbnail-fallback.jpg";

/**
 * Binds error handling and fallback logic to video thumbnail images within a container.
 *
 * @param {HTMLElement} container - The container element to search for thumbnails.
 * @param {string} [fallbackSrc] - The fallback image source to use. Defaults to FALLBACK_THUMBNAIL_SRC.
 */
export function bindThumbnailFallbacks(container, fallbackSrc = FALLBACK_THUMBNAIL_SRC) {
  if (!container || typeof container.querySelectorAll !== "function") {
    return;
  }

  const thumbnails = container.querySelectorAll("[data-video-thumbnail]");
  thumbnails.forEach((img) => {
    if (!img) {
      return;
    }

    const ensureFallbackSource = () => {
      let currentFallback = "";
      if (typeof img.dataset.fallbackSrc === "string") {
        currentFallback = img.dataset.fallbackSrc.trim();
      }

      if (!currentFallback) {
        const attr = img.getAttribute("data-fallback-src") || "";
        currentFallback = attr.trim();
      }

      if (!currentFallback && img.tagName === "IMG") {
        currentFallback = fallbackSrc;
      }

      if (currentFallback) {
        if (img.dataset.fallbackSrc !== currentFallback) {
          img.dataset.fallbackSrc = currentFallback;
        }
        if (!img.getAttribute("data-fallback-src")) {
          img.setAttribute("data-fallback-src", currentFallback);
        }
      }

      return currentFallback;
    };

    const applyFallback = () => {
      const targetFallback = ensureFallbackSource() || fallbackSrc;
      if (!targetFallback) {
        return;
      }

      if (img.src !== targetFallback) {
        img.src = targetFallback;
      }

      img.dataset.thumbnailFailed = "true";
    };

    const handleLoad = () => {
      if (
        (img.naturalWidth === 0 && img.naturalHeight === 0) ||
        !img.currentSrc
      ) {
        applyFallback();
      } else {
        delete img.dataset.thumbnailFailed;
      }
    };

    ensureFallbackSource();

    if (img.dataset.thumbnailFallbackBound === "true") {
      if (img.complete) {
        handleLoad();
      }
      return;
    }

    img.addEventListener("error", applyFallback);
    img.addEventListener("load", handleLoad);

    img.dataset.thumbnailFallbackBound = "true";

    if (img.complete) {
      handleLoad();
    }
  });
}
