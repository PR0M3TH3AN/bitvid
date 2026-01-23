import os
from playwright.sync_api import sync_playwright

def verify_share_modal():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Navigate to the app
        print("Navigating to app...")
        page.goto("http://localhost:8000")

        # Wait for app to initialize
        print("Waiting for network idle...")
        page.wait_for_load_state("networkidle")

        # Force open the modal using module import
        print("Opening modal...")
        page.evaluate("""
            (async () => {
                const { getApplication } = await import('./js/applicationContext.js');
                const app = getApplication();

                if (!app) {
                    console.error("Application instance not found");
                    return;
                }

                const video = {
                    id: "test-video-id",
                    title: "Frontend Verification Video",
                    pubkey: "abcd1234abcd1234abcd1234abcd1234",
                    creatorName: "Verified User",
                    thumbnail: "/assets/jpg/video-thumbnail-fallback.jpg",
                    shareUrl: "http://localhost:8000/?v=test"
                };

                // We use app.openShareNostrModal to test the integration in app.js as well
                await app.openShareNostrModal({ video });
            })()
        """)

        # Wait for modal to appear
        print("Waiting for modal...")
        modal = page.locator("#shareNostrModal")
        modal.wait_for(state="visible", timeout=10000)

        # Take screenshot
        os.makedirs("verification", exist_ok=True)
        screenshot_path = os.path.abspath("verification/share_modal.png")
        modal.screenshot(path=screenshot_path)
        print(f"Screenshot saved to {screenshot_path}")

        browser.close()

if __name__ == "__main__":
    verify_share_modal()
