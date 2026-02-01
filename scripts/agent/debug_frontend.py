import asyncio
from playwright.async_api import async_playwright
import sys

async def run():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()

        # Listen for console logs with location
        def handle_console(msg):
            loc = msg.location
            print(f"console:{msg.type}: {msg.text} @ {loc['url']}:{loc['lineNumber']}")

        page.on("console", handle_console)

        # Listen for exceptions
        page.on("pageerror", lambda exc: print(f"pageerror: {exc}"))

        # Listen for failed requests
        page.on("requestfailed", lambda req: print(f"requestfailed: {req.url} {req.failure}"))

        # Listen for 404s specifically
        page.on("response", lambda res: print(f"response:{res.status}: {res.url}") if res.status >= 400 else None)

        try:
            print("Navigating to http://localhost:8000...")
            await page.goto("http://localhost:8000")
            # Wait a bit for initialization
            await page.wait_for_timeout(5000)
        except Exception as e:
            print(f"Navigation error: {e}")
        finally:
            await browser.close()

if __name__ == "__main__":
    asyncio.run(run())
