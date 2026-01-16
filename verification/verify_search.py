from playwright.sync_api import sync_playwright, expect

def test_search_functionality():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Navigate to the home page
        page.goto("http://localhost:3000/index.html")

        # Verify search input exists
        search_input = page.locator("#headerSearchInput")
        expect(search_input).to_be_visible()

        # Type a query
        search_input.fill("test")
        search_input.press("Enter")

        # Wait for hash change and search results view
        page.wait_for_timeout(2000) # Give it a moment to load view

        # Verify the hash updated
        assert "#view=search&q=test" in page.url

        # Verify the search title updated
        title_locator = page.locator("#searchTitle")
        expect(title_locator).to_be_visible()
        expect(title_locator).to_have_text('Search Results for "test"')

        # Verify sections exist
        expect(page.locator("#searchChannelList")).to_be_visible()
        expect(page.locator("#searchVideoList")).to_be_visible()

        # Take a screenshot
        page.screenshot(path="verification/search_view.png", full_page=True)

        browser.close()

if __name__ == "__main__":
    test_search_functionality()
