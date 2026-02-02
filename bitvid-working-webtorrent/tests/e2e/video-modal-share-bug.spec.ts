import { expect, test } from "@playwright/test";
import { applyReducedMotion, failOnConsoleErrors } from "./helpers/uiTestUtils";

test.describe("video modal share button", () => {
  test("opens the share menu when clicked", async ({ page }) => {
    await applyReducedMotion(page);
    await page.goto("/components/video-modal.html", { waitUntil: "networkidle" });

    await page.addScriptTag({
      type: "module",
      content: `
        import { VideoModal } from "/js/ui/components/VideoModal.js";

        // Mock dependencies
        const mockSetGlobalModalState = (name, isOpen) => {
          console.log(\`setGlobalModalState: \${name} = \${isOpen}\`);
        };

        const mockMediaLoader = {
          observe: () => {},
          unobserve: () => {},
        };

        const videoModal = new VideoModal({
          document: document,
          setGlobalModalState: mockSetGlobalModalState,
          mediaLoader: mockMediaLoader,
        });

        // Force loaded state and hydrate
        const playerModal = document.getElementById("playerModal");
        if (playerModal) {
            videoModal.loaded = true;
            videoModal.hydrate(playerModal);

            // Mock an active video so the share menu has data
            videoModal.activeVideo = {
                id: "test-video-id",
                title: "Test Video",
                url: "https://example.com/video.mp4",
                magnet: "magnet:?xt=urn:btih:test",
            };

            // Open the modal
            videoModal.open(videoModal.activeVideo);
        }

        window.__videoModal = videoModal;
      `,
    });

    // Ensure modal is visible
    const modal = page.locator("#playerModal");
    await expect(modal).not.toHaveClass(/hidden/);

    // Click share button
    const shareBtn = page.locator("#shareBtn");
    await expect(shareBtn).toBeVisible();
    await shareBtn.click();

    // Expect popover to be open
    // The popover engine adds data-popover-state="open" to the panel
    const popoverPanel = page.locator('[data-menu="video-share"]');
    await expect(popoverPanel).toBeVisible();
    await expect(popoverPanel).toHaveAttribute("data-popover-state", "open");
  });
});
