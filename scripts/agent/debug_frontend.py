import sys
from playwright.sync_api import sync_playwright

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()

        # Print all console messages
        page.on("console", lambda msg: print(f"CONSOLE [{msg.type}]: {msg.text}"))

        # Print all uncaught exceptions
        page.on("pageerror", lambda exc: print(f"PAGE ERROR: {exc}"))

        # Print failed network requests
        page.on("requestfailed", lambda req: print(f"REQUEST FAILED: {req.url} {req.failure}"))

        try:
            print("Navigating to http://localhost:8000...")
            page.goto("http://localhost:8000")
            # Wait a few seconds to capture initialization errors
            page.wait_for_timeout(5000)
        except Exception as e:
            print(f"SCRIPT ERROR: {e}")
        finally:
            browser.close()

if __name__ == "__main__":
    run()
