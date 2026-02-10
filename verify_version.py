from playwright.sync_api import sync_playwright

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        page.goto("http://localhost:3000")

        # Locate the tagline
        tagline = page.get_by_text("seed. zap. subscribe.")

        # Locate the version info which should be nearby
        # The tagline is an h2 inside a div.
        container = tagline.locator("..")

        # Wait for fade-in to settle or just force visibility?
        # The container has "fade-in" class. It might take time.
        # I'll wait for the version text to be visible.
        version_locator = container.locator("div.text-xs")
        version_locator.wait_for()

        print("Version text found:", version_locator.inner_text())

        # Screenshot the container
        container.screenshot(path="verification.png")
        browser.close()

if __name__ == "__main__":
    run()
