// js/utils/mediaLoader.js

/**
 * Simple IntersectionObserver-based lazy loader for images (or videos).
 *
 * Usage:
 *   const mediaLoader = new MediaLoader();
 *   mediaLoader.observe(imgElement);
 *
 * This will load the real image source from `imgElement.dataset.lazy`
 * once the image enters the viewport.
 */
export class MediaLoader {
  constructor(rootMargin = "50px") {
    this.observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) {
          continue;
        }

        const el = entry.target;
        const lazySrc =
          typeof el.dataset.lazy === "string" ? el.dataset.lazy.trim() : "";

        if (!lazySrc) {
          continue;
        }

        const fallbackSrc =
          (typeof el.dataset.fallbackSrc === "string"
            ? el.dataset.fallbackSrc.trim()
            : "") ||
          el.getAttribute("data-fallback-src") ||
          "";

        if (el.tagName === "IMG" || el.tagName === "IMAGE") {
          el.src = lazySrc;
          if (fallbackSrc) {
            el.onerror = () => {
              el.src = fallbackSrc;
            };
          }
        } else if (el.tagName === "VIDEO") {
          el.src = lazySrc;
          if (fallbackSrc) {
            el.poster = fallbackSrc;
          }
        } else {
          el.style.backgroundImage = `url('${lazySrc}')`;
        }

        delete el.dataset.lazy;
        this.observer.unobserve(el);
      }
    }, {
      rootMargin,
      threshold: 0.01,
    });
  }

  observe(el) {
    if (!el || typeof el !== "object") {
      return;
    }

    if ("decoding" in HTMLImageElement.prototype) {
      el.decoding = el.decoding || "async";
    }

    const lazySrc =
      typeof el.dataset.lazy === "string" ? el.dataset.lazy.trim() : "";
    if (lazySrc) {
      this.observer.observe(el);
    }
  }

  disconnect() {
    this.observer.disconnect();
  }
}

export default MediaLoader;
