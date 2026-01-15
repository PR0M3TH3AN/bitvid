from playwright.sync_api import sync_playwright
import time

def verify_source_toggle():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Navigate to the local server
        page.goto("http://localhost:8080/index.html")

        # Wait for the app to initialize (give it a moment)
        page.wait_for_load_state("networkidle")

        # We need to simulate opening the modal with a video that has both sources
        # We'll use page.evaluate to interact with the Javascript context
        # Assuming 'app' is globally available or we can instantiate VideoModal

        page.evaluate("""
            async () => {
                // Mock a video object with both URL and Magnet
                const mockVideo = {
                    id: 'test-video-123',
                    title: 'Test Video with Source Toggle',
                    url: 'https://example.com/video.mp4',
                    magnet: 'magnet:?xt=urn:btih:example',
                    torrentSupported: true,
                    moderation: {}
                };

                // Access the global app instance or find the video modal
                // Looking at js/app.js, it might attach to window.app
                // If not, we might need to find the modal instance another way.

                // Let's assume window.app exists as is common in these setups,
                // or we try to find the modal controller.

                if (window.app && window.app.videoModal) {
                    await window.app.videoModal.open(mockVideo);
                } else {
                    console.error("Could not find window.app.videoModal");
                    // Fallback: Try to find the modal element and manually unhide it
                    // to verify the toggle structure exists, though open() is better.

                    // Note: If window.app isn't exposed, we might struggle to invoke .open() directly
                    // without module injection.
                }
            }
        """)

        # Wait for the modal to appear
        try:
            page.wait_for_selector("#playerModal", state="visible", timeout=5000)
            print("Modal opened successfully.")
        except:
            print("Modal did not open via app.videoModal. attempting manual check...")

        # specific check for the toggle container
        # The toggle container has attribute [data-source-toggle-container]
        toggle_selector = "[data-source-toggle-container]"

        # Expect it to be visible
        try:
            page.wait_for_selector(toggle_selector, state="visible", timeout=2000)
            print("Source toggle container is visible!")
        except:
            print("Source toggle container NOT visible or not found.")
            # If it's not visible, maybe the video didn't load right.
            # Let's try to inspect the DOM to see if the element exists at all.
            content = page.content()
            if "data-source-toggle-container" in content:
                print("Element exists in DOM but might be hidden.")
            else:
                print("Element does NOT exist in DOM.")

        # Take a screenshot of the modal
        # We can focus on the stats container where the toggle is
        stats_selector = "[data-video-stats-container]"
        try:
            page.wait_for_selector(stats_selector, state="visible")
            # Screenshot the whole page or just the modal
            page.screenshot(path="/home/jules/verification/verification.png")
            print("Screenshot saved.")
        except Exception as e:
            print(f"Could not take targeted screenshot: {e}")
            page.screenshot(path="/home/jules/verification/verification_fallback.png")

        browser.close()

if __name__ == "__main__":
    verify_source_toggle()
