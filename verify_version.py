from playwright.sync_api import sync_playwright
import re

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        try:
            page.goto("http://localhost:8080")

            # Pattern for version string
            pattern = re.compile(r"v:\s+[a-f0-9]{8}\s+•\s+\d{4}-\d{2}-\d{2}")

            locator = page.get_by_text(pattern)
            locator.wait_for()

            # Scroll to element
            locator.scroll_into_view_if_needed()

            # Take a screenshot of the element specifically, plus some context
            # Or just the page after scrolling
            page.screenshot(path="verification.png")

            content = locator.text_content()
            print(f"Found version string: '{content.strip()}'")

        except Exception as e:
            print(f"Error: {e}")
        finally:
            browser.close()

if __name__ == "__main__":
    run()
