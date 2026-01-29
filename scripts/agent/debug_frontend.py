from playwright.sync_api import sync_playwright
import sys

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()

        # Subscribe to console messages
        page.on("console", lambda msg: print(f"CONSOLE: {msg.type}: {msg.text}"))

        # Subscribe to page errors (uncaught exceptions)
        page.on("pageerror", lambda exc: print(f"PAGEERROR: {exc}"))

        # Subscribe to failed requests
        page.on("requestfailed", lambda req: print(f"REQUESTFAILED: {req.url} {req.failure}"))

        try:
            print("Navigating to http://localhost:8000 ...")
            page.goto("http://localhost:8000")
            # Wait a bit for page to initialize
            page.wait_for_timeout(5000)
        except Exception as e:
            print(f"ERROR: {e}")
        finally:
            browser.close()

if __name__ == "__main__":
    run()
