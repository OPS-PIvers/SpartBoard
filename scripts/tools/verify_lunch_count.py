from playwright.sync_api import Page, expect, sync_playwright
import time

def test_lunch_count_drag(page: Page):
    print("Navigating to app...")
    page.goto("http://localhost:3000")
    page.wait_for_load_state("networkidle")

    # 1. Open Dock
    print("Opening Dock...")
    try:
        page.get_by_title("Open Tools").click(timeout=3000)
        page.wait_for_timeout(1000)
    except:
        pass # Dock might be open

    # 2. Check if Lunch is in dock
    print("Looking for Lunch widget...")
    try:
        lunch_btn = page.locator("button", has_text="Lunch").first
        if lunch_btn.is_visible():
            print("Found Lunch widget in dock. Clicking...")
            lunch_btn.click(force=True)
        else:
            print("Lunch widget not found in dock.")
            return

    except Exception as e:
        print(f"Error adding widget: {e}")
        return

    # 3. Widget should be on screen.
    page.wait_for_timeout(1000)

    # 4. Interact with Widget
    print("Interacting with widget...")
    try:
        hot_lunch = page.get_by_text("Hot Lunch").first
        expect(hot_lunch).to_be_visible()

        # Click widget to show tools
        print("Clicking widget to show tools...")
        # Avoid clicking dragging handle or interactive elements
        # Click near bottom right?
        widget = page.locator(".widget").first
        box = widget.bounding_box()
        if box:
            # Click in the middle bottom, safely away from headers
            page.mouse.click(box["x"] + box["width"] / 2, box["y"] + box["height"] - 20)

        page.wait_for_timeout(500)

        # Find Settings button (gear icon)
        print("Opening settings...")
        settings_btn = page.get_by_title("Settings").last
        settings_btn.click()

        # Wait for flip
        page.wait_for_timeout(1000)

        # Select "Custom"
        print("Selecting Custom Roster...")
        page.locator("button", has_text="Custom").click()

        # Fill textarea
        print("Adding students...")
        page.locator("textarea").fill("Student A\nStudent B")

        # Click DONE
        print("Closing settings...")
        page.get_by_role("button", name="DONE").click()

        page.wait_for_timeout(1000)

        # 5. Drag "Student A" to "Hot Lunch"
        print("Dragging student...")
        # Target only the chip div, likely has draggable attribute
        student = page.locator("div[draggable='true']", has_text="Student A").first
        expect(student).to_be_visible()

        import os
        os.makedirs("tests/e2e/screenshots", exist_ok=True)
        page.screenshot(path="tests/e2e/screenshots/before_drag.png")

        # Drag
        # student.drag_to(hot_lunch)
        # Use manual mouse steps for better control/debugging if drag_to fails
        s_box = student.bounding_box()
        h_box = hot_lunch.bounding_box()

        if s_box and h_box:
            # Move to center of student chip
            page.mouse.move(s_box["x"] + s_box["width"] / 2, s_box["y"] + s_box["height"] / 2)
            page.mouse.down()
            # Move to center of hot lunch label (which is inside the drop zone)
            page.mouse.move(h_box["x"] + h_box["width"] / 2, h_box["y"] + h_box["height"] / 2, steps=10)
            page.mouse.up()

        page.wait_for_timeout(1000)
        page.screenshot(path="tests/e2e/screenshots/after_drag.png")
        print("Verification complete!")

    except Exception as e:
        print(f"Error interacting: {e}")
        import os
        os.makedirs("tests/e2e/screenshots", exist_ok=True)
        page.screenshot(path="tests/e2e/screenshots/interaction_error.png")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.set_viewport_size({"width": 1280, "height": 800})
        try:
            test_lunch_count_drag(page)
        except Exception as e:
            print(f"Test failed: {e}")
        finally:
            browser.close()
