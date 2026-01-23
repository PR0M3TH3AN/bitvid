import sys
from playwright.sync_api import sync_playwright

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()

        # Listen for console messages
        page.on("console", lambda msg: print(f"console:{msg.type}: {msg.text}"))

        # Listen for uncaught exceptions
        page.on("pageerror", lambda exc: print(f"pageerror: {exc}"))

        # Listen for failed network requests
        page.on("requestfailed", lambda req: print(f"requestfailed: {req.url} {req.failure}"))

        print("Navigating to http://localhost:8000 ...")
        try:
            page.goto("http://localhost:8000", wait_until="networkidle")
        except Exception as e:
            print(f"Navigation failed: {e}")

        browser.close()

if __name__ == "__main__":
    run()
