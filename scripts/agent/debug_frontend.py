from playwright.sync_api import sync_playwright
import time
import sys

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()

        print("--- Console Messages ---")
        page.on("console", lambda msg: print(f"console:{msg.type}: {msg.text}"))

        print("--- Page Errors ---")
        page.on("pageerror", lambda exc: print(f"pageerror: {exc}"))

        print("--- Failed Requests ---")
        page.on("requestfailed", lambda req: print(f"requestfailed: {req.url} {req.failure}"))

        try:
            page.goto("http://localhost:8000")
            # Wait for potential initialization errors
            time.sleep(5)
        except Exception as e:
            print(f"Navigation failed: {e}")

        browser.close()

if __name__ == "__main__":
    run()
