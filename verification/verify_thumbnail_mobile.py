from playwright.sync_api import sync_playwright, expect

def run_verification():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # Emulate a mobile device
        context = browser.new_context(
            viewport={"width": 375, "height": 667},
            user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 11_0 like Mac OS X) AppleWebKit/604.1.38 (KHTML, like Gecko) Version/11.0 Mobile/15A372 Safari/604.1"
        )
        page = context.new_page()

        # Navigate to local server
        page.goto("http://localhost:8080/index.html")

        # We need to mock a watch history card because the default state is empty
        # and we don't want to rely on real network calls or complex state setup.
        # We inject HTML directly into the body for verification of the CSS class.

        mock_html = """
        <div class="watch-history-card">
            <div class="watch-history-card__primary flex flex-col">
                <a class="watch-history-card__thumbnail block flex-none text-text no-underline w-56 max-w-full" href="#">
                    <div class="watch-history-card__thumbnailInner aspect-video w-full overflow-hidden rounded-lg bg-surface">
                        <img src="https://via.placeholder.com/640x360" style="width:100%; height:100%; object-fit:cover;">
                    </div>
                </a>
                <div class="watch-history-card__details">
                    <div class="watch-history-card__title">Test Video Title That Might Be Long</div>
                </div>
            </div>
        </div>
        """

        page.evaluate(f"document.body.innerHTML = `{mock_html}`")

        # Wait for potential layout shifts
        page.wait_for_timeout(500)

        # Verify the computed style width of the thumbnail container
        thumbnail = page.locator(".watch-history-card__thumbnail")
        box = thumbnail.bounding_box()
        print(f"Thumbnail width: {box['width']}px")

        # On mobile, html font-size is 80% (12.8px). w-56 is 14rem.
        # 14 * 12.8 = 179.2px.
        # If w-full was active, it would be close to 375px (minus padding if parent had it, but here parent is div block, so likely full width).
        # We check it's close to 179.2

        assert abs(box['width'] - 179.2) < 2, f"Expected width ~179.2px, got {box['width']}px"

        # Take screenshot
        page.screenshot(path="verification/mobile_thumbnail_verification.png")
        print("Screenshot saved to verification/mobile_thumbnail_verification.png")

        browser.close()

if __name__ == "__main__":
    run_verification()
