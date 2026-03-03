from playwright.sync_api import sync_playwright
import time

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()

        try:
            print("Navigating to app...")
            page.goto("http://localhost:3000/")

            print("Waiting for Open Tools button...")
            open_tools_btn = page.get_by_title("Open Tools")
            open_tools_btn.wait_for()

            print("Clicking Open Tools...")
            open_tools_btn.click()

            print("Waiting for dock expansion...")
            # Use data-testid="dock" as context
            dock = page.locator('[data-testid="dock"]')

            # Wait for animation
            time.sleep(1)

            print("Taking screenshot of initial dock...")
            dock.screenshot(path="dock_start.png")

            print("Scrolling dock to end...")
            # Find the scrollable element INSIDE the dock
            scrollable = dock.locator('.overflow-x-auto')

            # Scroll to right
            scrollable.evaluate("el => el.scrollLeft = el.scrollWidth")

            time.sleep(1)

            print("Taking screenshot of scrolled dock...")
            dock.screenshot(path="dock_end.png")

            # Check for Hide button visibility
            hide_btn = page.get_by_title("Minimize Toolbar")
            if hide_btn.is_visible():
                print("Hide button is visible")

        except Exception as e:
            print(f"Error: {e}")
            page.screenshot(path="error_scroll.png")
        finally:
            browser.close()
            print("Done.")

if __name__ == "__main__":
    run()
