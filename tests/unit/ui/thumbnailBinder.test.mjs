/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { bindThumbnailFallbacks, FALLBACK_THUMBNAIL_SRC } from "../../../js/ui/thumbnailBinder.js";

describe("bindThumbnailFallbacks", () => {
  let container;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
    vi.restoreAllMocks();
  });

  it("should do nothing if container is invalid", () => {
    // Should not throw
    bindThumbnailFallbacks(null);
    bindThumbnailFallbacks({});
  });

  it("should bind error handlers to images with data-video-thumbnail", () => {
    const img = document.createElement("img");
    img.setAttribute("data-video-thumbnail", "true");
    img.src = "invalid-image.jpg";
    container.appendChild(img);

    // Spy on addEventListener
    const addEventListenerSpy = vi.spyOn(img, "addEventListener");

    bindThumbnailFallbacks(container);

    expect(addEventListenerSpy).toHaveBeenCalledWith("error", expect.any(Function));
    expect(addEventListenerSpy).toHaveBeenCalledWith("load", expect.any(Function));
    expect(img.dataset.thumbnailFallbackBound).toBe("true");
  });

  it("should apply fallback source on error", () => {
    const img = document.createElement("img");
    img.setAttribute("data-video-thumbnail", "true");
    img.src = "invalid-image.jpg";
    container.appendChild(img);

    bindThumbnailFallbacks(container);

    // Trigger error event
    const errorEvent = new Event("error");
    img.dispatchEvent(errorEvent);

    expect(img.src).toContain(FALLBACK_THUMBNAIL_SRC);
    expect(img.dataset.thumbnailFailed).toBe("true");
  });

  it("should use custom fallback source if provided in dataset", () => {
    const customFallback = "custom-fallback.jpg";
    const img = document.createElement("img");
    img.setAttribute("data-video-thumbnail", "true");
    img.setAttribute("data-fallback-src", customFallback);
    img.src = "invalid-image.jpg";
    container.appendChild(img);

    bindThumbnailFallbacks(container);

    // Trigger error event
    const errorEvent = new Event("error");
    img.dispatchEvent(errorEvent);

    expect(img.src).toContain(customFallback);
  });

  it("should use passed fallback source argument", () => {
    const argFallback = "arg-fallback.jpg";
    const img = document.createElement("img");
    img.setAttribute("data-video-thumbnail", "true");
    img.src = "invalid-image.jpg";
    container.appendChild(img);

    bindThumbnailFallbacks(container, argFallback);

    // Trigger error event
    const errorEvent = new Event("error");
    img.dispatchEvent(errorEvent);

    expect(img.src).toContain(argFallback);
  });

  it("should handle naturalWidth/Height checks on load", () => {
    const img = document.createElement("img");
    img.setAttribute("data-video-thumbnail", "true");
    img.src = "empty-image.jpg";
    container.appendChild(img);

    // Mock natural dimensions
    Object.defineProperty(img, "naturalWidth", { value: 0 });
    Object.defineProperty(img, "naturalHeight", { value: 0 });
    Object.defineProperty(img, "currentSrc", { value: "empty-image.jpg" }); // Ensure currentSrc exists

    bindThumbnailFallbacks(container);

    // Trigger load event
    const loadEvent = new Event("load");
    img.dispatchEvent(loadEvent);

    expect(img.src).toContain(FALLBACK_THUMBNAIL_SRC);
    expect(img.dataset.thumbnailFailed).toBe("true");
  });

  it("should not re-bind if already bound", () => {
    const img = document.createElement("img");
    img.setAttribute("data-video-thumbnail", "true");
    container.appendChild(img);

    bindThumbnailFallbacks(container);
    const addEventListenerSpy = vi.spyOn(img, "addEventListener");

    // Call again
    bindThumbnailFallbacks(container);

    expect(addEventListenerSpy).not.toHaveBeenCalled();
  });
});
