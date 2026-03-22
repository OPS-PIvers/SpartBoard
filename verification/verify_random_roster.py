import asyncio
from playwright.async_api import async_playwright

async def verify():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 1280, "height": 800})
        page = await context.new_page()

        print("Navigating to app...")
        await page.goto("http://localhost:3000")

        # We can bypass the UI dock entirely and trigger the widget open via state or evaluating in the browser context if possible.
        # Another option is to use the global testing hooks if they exist, or just use the UI that is visible.

        # Wait for app to load
        await page.wait_for_timeout(3000)

        # Let's open the dock
        await page.get_by_role("button", name="Open Tools").click(force=True)
        await page.wait_for_timeout(1000)

        # Let's click "Random" which IS visible on the dock right now.
        print("Adding Random...")
        # from screenshot we know the Random button is visible and says "RANDOM" in all caps
        await page.get_by_text("RANDOM").click(force=True)
        await page.wait_for_timeout(1000)

        # Open the Random settings
        print("Opening Random Settings...")
        await page.locator("button:has(svg.lucide-settings)").last.click(force=True)
        await page.wait_for_timeout(1000)

        print("Taking final screenshot...")
        await page.screenshot(path="/home/jules/verification/debug_random_settings.png")

        await browser.close()

asyncio.run(verify())
