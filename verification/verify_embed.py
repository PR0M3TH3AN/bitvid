from playwright.sync_api import sync_playwright
import time

def verify_embed_overlay():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()

        # Inject disclaimer bypass
        context.add_init_script("localStorage.setItem('hasSeenDisclaimer', 'true');")

        page = context.new_page()

        # Go to embed page
        # Note: We don't have a valid pointer, so video won't load, but UI should be there.
        page.goto("http://localhost:3000/embed.html")

        # Wait for page load
        time.sleep(2)

        # Force hover on the container to show overlay
        container = page.locator("#embedRoot section")
        container.hover()

        # Wait for transition
        time.sleep(1)

        # Check elements visibility
        overlay = page.locator("#embedOverlay")
        watch_btn = page.locator("#embedWatchButton")
        stats = page.locator("#embedViewCount")

        print(f"Overlay visible: {overlay.is_visible()}")
        print(f"Watch button visible: {watch_btn.is_visible()}")
        print(f"Stats visible: {stats.is_visible()}")

        # Screenshot
        page.screenshot(path="verification/embed_verification.png")

        browser.close()

if __name__ == "__main__":
    verify_embed_overlay()
