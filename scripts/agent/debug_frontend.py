from playwright.sync_api import sync_playwright
import sys
import time

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Subscribe to console messages
        page.on("console", lambda msg: print(f"console:{msg.type}: {msg.text}"))

        # Subscribe to uncaught exceptions
        page.on("pageerror", lambda exc: print(f"pageerror: {exc}"))

        # Subscribe to failed network requests
        page.on("requestfailed", lambda req: print(f"requestfailed: {req.url} {req.failure}"))

        try:
            # Navigate to localhost
            page.goto("http://localhost:8000", wait_until="networkidle")
            # Wait a bit for async operations
            time.sleep(2)
        except Exception as e:
            print(f"Error navigating: {e}")
        finally:
            browser.close()

if __name__ == "__main__":
    run()
