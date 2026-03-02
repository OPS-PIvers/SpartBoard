import time
import os
from playwright.sync_api import sync_playwright

BASE_URL = os.environ.get("PLAYWRIGHT_BASE_URL", "http://localhost:3000")

def verify_instructional_routines_manager(page):
    print(f"Navigating to home page at {BASE_URL}...")
    page.goto(BASE_URL)

    # Wait for the page to load
    page.wait_for_load_state("networkidle")

    # Wait for Admin Settings button to appear in the dock
    # It requires isAdmin to be true.
    print("Waiting for Admin Settings button...")
    admin_settings_button = page.locator('button[aria-label="Admin Settings"]')

    # It might take a moment for auth to initialize and isAdmin to be true
    try:
        admin_settings_button.wait_for(state="visible", timeout=10000)
    except Exception as e:
        print("Admin Settings button not found. Taking screenshot of dock.")
        page.screenshot(path="debug_dock.png")
        raise

    admin_settings_button.click()
    print("Admin Settings opened.")

    # Wait for Feature Permissions to load (default tab)
    print("Waiting for Feature Permissions...")
    page.locator("text=Widget Permissions").wait_for(state="visible", timeout=10000)

    # Find Instructional Routines card
    print("Finding Instructional Routines card...")
    # The card should have text "Instructional Routines" (label) or "instructionalRoutines" (type)
    # The label is likely "Instructional Routines" or "Routines" depending on config.
    # Let's search for the text "instructionalRoutines" which is the type ID displayed in the card.

    # We want to click the Settings button in that card.
    # We can find the card container by looking for the type ID.
    # The type ID is displayed in a <p> tag: <p class="text-xs text-slate-500">instructionalRoutines</p>

    # Locate the card containing "instructionalRoutines"
    routines_type_text = page.locator("p", has_text="instructionalRoutines")
    routines_type_text.wait_for(state="visible", timeout=5000)

    # Go up to the card container.
    # The structure is: div > div(header) > div(left) > div(right with buttons)
    # We can just find the button *near* this text.
    # Or cleaner: find the card div that has this text, then find the button inside it.

    card = page.locator("div.bg-white", has=routines_type_text).last

    # Find the settings button inside that card
    settings_button = card.locator('button[title="Edit widget configuration"]')
    settings_button.wait_for(state="visible", timeout=5000)
    settings_button.click()
    print("Clicked settings button.")

    # Wait for the modal "Instructional Routines Library"
    print("Waiting for library modal...")
    page.get_by_role("heading", name="Instructional Routines Library").wait_for(state="visible", timeout=10000)

    # Wait a bit for animations
    time.sleep(1)

    # Take screenshot
    print("Taking screenshot...")
    page.screenshot(path="verification_routines_manager.png")
    print("Screenshot saved to verification_routines_manager.png")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # Set viewport to something reasonable
        context = browser.new_context(viewport={"width": 1280, "height": 720})
        page = context.new_page()
        try:
            verify_instructional_routines_manager(page)
        except Exception as e:
            print(f"Error: {e}")
            page.screenshot(path="error_screenshot.png")
        finally:
            browser.close()
