import sys
import time
from playwright.sync_api import sync_playwright

def run():
    with sync_playwright() as p:
        # Launch browser (headless by default)
        browser = p.chromium.launch()
        page = browser.new_page()

        # Capture console messages
        page.on("console", lambda msg: print(f"console:{msg.type}: {msg.text}"))

        # Capture uncaught exceptions
        page.on("pageerror", lambda exc: print(f"pageerror: {exc}"))

        # Capture failed requests
        page.on("requestfailed", lambda request: print(f"requestfailed: {request.url} {request.failure}"))

        try:
            print("Navigating to http://localhost:8000...")
            page.goto("http://localhost:8000")

            # Wait for some time to catch initialization errors
            time.sleep(5)

        except Exception as e:
            print(f"Script error: {e}")
        finally:
            browser.close()

if __name__ == "__main__":
    run()
