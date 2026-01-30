import sys
from playwright.sync_api import sync_playwright

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()

        page.on("console", lambda msg: print(f"console:{msg.type}: {msg.text}"))
        page.on("pageerror", lambda exc: print(f"pageerror: {exc}"))
        page.on("requestfailed", lambda req: print(f"requestfailed: {req.url} - {req.failure}"))

        try:
            page.goto("http://localhost:8000")
            # Wait a bit for JS to execute and errors to appear
            page.wait_for_timeout(5000)
        except Exception as e:
            print(f"Error navigating: {e}")
        finally:
            browser.close()

if __name__ == "__main__":
    run()
