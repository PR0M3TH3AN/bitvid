from playwright.sync_api import sync_playwright
import time

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Set dummy profile in localStorage to simulate login
        page.add_init_script("""
            localStorage.setItem("bitvid:savedProfiles", JSON.stringify([{pubkey: "0000000000000000000000000000000000000000000000000000000000000001", authType: "nip07"}]));
            localStorage.setItem("bitvid:activeProfilePubkey", "0000000000000000000000000000000000000000000000000000000000000001");
        """)

        page.goto("http://localhost:8080")

        # Wait for app to load and hydrate
        try:
            page.wait_for_selector("#profileButton:not(.hidden)", timeout=10000)
        except:
            print("Profile button did not appear. Dumping console logs.")
            # Maybe auth failed or slow.
            # Let's try to find if app is attached to window? No.
            pass

        # If profile button is visible, click it
        if page.is_visible("#profileButton"):
            print("Clicking profile button...")
            page.click("#profileButton")
        else:
            print("Profile button not visible. Trying to find it anyway (maybe hidden class issue).")
            # If hidden, maybe just click it?
            # Or maybe I need to wait longer.
            # Let's try to access the modal directly if it's already loaded? No it loads on show.

        # Wait for modal
        try:
            page.wait_for_selector("#profileModal", state="visible", timeout=5000)
        except:
            print("Profile modal did not appear.")

        # Click "Relays" nav
        try:
            page.click("#profileNavRelays")
        except:
            print("Could not click Relays nav.")

        # Wait for relay list
        page.wait_for_selector("#relayList", state="visible")

        # Check if relayHealthPanel is gone
        health_panel = page.query_selector("#relayHealthPanel")
        if health_panel:
            print("FAILURE: #relayHealthPanel should not exist!")
        else:
            print("SUCCESS: #relayHealthPanel is gone.")

        # Check if telemetry toggle is present (moved)
        toggle = page.query_selector("#relayHealthTelemetryOptIn")
        if toggle:
            print("SUCCESS: Telemetry toggle found.")
        else:
            print("FAILURE: Telemetry toggle not found.")

        # Check for health stats placeholders in relay list items
        # If there are no relays, we might see "No relays configured".
        # We can add a relay via UI or script.

        # Take screenshot
        page.screenshot(path="verification/relay_ui.png")

        browser.close()

if __name__ == "__main__":
    run()
