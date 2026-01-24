from playwright.sync_api import sync_playwright
import sys

def run():
    with sync_playwright() as p:
        # Launch browser
        browser = p.chromium.launch()
        page = browser.new_page()

        # Listen for console messages
        page.on("console", lambda msg: print(f"console:{msg.type}: {msg.text}"))

        # Listen for uncaught exceptions
        page.on("pageerror", lambda exc: print(f"pageerror: {exc}"))

        # Listen for failed requests
        page.on("requestfailed", lambda req: print(f"requestfailed: {req.url} {req.failure}"))

        try:
            print("Navigating to http://localhost:8000")
            page.goto("http://localhost:8000")
            # Wait for a bit to capture initial errors
            page.wait_for_timeout(5000)
        except Exception as e:
            print(f"Navigation failed: {e}")

        browser.close()

if __name__ == "__main__":
    run()
