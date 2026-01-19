from playwright.sync_api import sync_playwright

def verify_mobile_search_fab():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # Emulate a mobile device to ensure the FAB is visible
        # iPhone 12 Pro dimensions: 390x844
        context = browser.new_context(viewport={'width': 390, 'height': 844})
        page = context.new_page()

        try:
            # Navigate to the local server
            page.goto("http://localhost:8000/index.html")

            # Locate the mobile search FAB
            fab = page.locator("#mobileSearchFab")

            # Wait for it to be visible (it has a hidden class removed by JS logic or media query)
            # The CSS shows md:hidden. We are on mobile viewport, so it should be visible.
            # However, JS logic might also toggle it.
            # Looking at index.js: "mobileSearchFab.classList.remove('hidden')" logic exists.
            # But let's check its visibility.

            # Check the computed style background color
            bg_color = fab.evaluate("element => getComputedStyle(element).backgroundColor")
            print(f"Computed background color: {bg_color}")

            # Take a screenshot of the FAB
            fab.screenshot(path="verification/mobile_search_fab.png")
            print("Screenshot saved to verification/mobile_search_fab.png")

        except Exception as e:
            print(f"Error: {e}")
        finally:
            browser.close()

if __name__ == "__main__":
    verify_mobile_search_fab()
