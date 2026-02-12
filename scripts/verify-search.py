from playwright.sync_api import sync_playwright
import os

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context()

    # Inject localStorage to bypass disclaimer
    page = context.new_page()
    page.add_init_script("""
        localStorage.setItem("hasSeenDisclaimer", "true");
    """)

    # Capture console logs
    page.on("console", lambda msg: print(f"Browser console: {msg.text}"))

    try:
        # Navigate to the correct search URL format
        page.goto("http://localhost:3000/#view=search&q=test", wait_until="networkidle")
        print("Navigated to page")

        # Wait for #searchTitle
        print("Waiting for #searchTitle")
        page.wait_for_selector("#searchTitle", timeout=10000)
        print("Found #searchTitle")

        # Wait for results or "no results" message
        try:
            # My refactor uses <p> with text content
            page.wait_for_selector("#searchVideoList p", timeout=10000)
            print("Found search results message")
        except:
            print("Timeout waiting for search results message")

        # Take a screenshot
        os.makedirs("verification", exist_ok=True)
        page.screenshot(path="verification/search-results.png")
        print("Screenshot saved")

    except Exception as e:
        print(f"Error: {e}")
        page.screenshot(path="verification/error.png")

    finally:
        browser.close()

with sync_playwright() as playwright:
    run(playwright)
