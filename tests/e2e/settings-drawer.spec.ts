import { test, expect, type Page } from '@playwright/test';

const addNoteWidget = async (page: Page) => {
  await page.addStyleTag({
    content:
      '*, *::before, *::after { transition: none !important; animation: none !important; }',
  });
  await page.getByTitle('Open Tools').click();
  await page.waitForTimeout(500);

  const noteButton = page.getByRole('button', { name: /Note/i }).first();
  await expect(noteButton).toBeVisible();
  await noteButton.click({ force: true });

  // Close the dock, then select the new widget: the gear only renders while selected.
  await page.mouse.click(0, 0);
  const noteWidget = page
    .locator('.widget', { has: page.locator('[contenteditable]') })
    .last();
  await expect(noteWidget).toBeVisible();
  await noteWidget.click({ position: { x: 20, y: 20 } });
};

const openDrawer = async (page: Page) => {
  const gear = page.getByRole('button', {
    name: 'Settings (Alt+S)',
    exact: true,
  });
  await expect(gear).toBeVisible();
  await gear.click({ force: true });
  const drawer = page.getByRole('dialog');
  await expect(drawer).toBeVisible({ timeout: 10000 });
  return drawer;
};

test.describe('settings drawer at 1280x800', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('opens as a side drawer with the filter, escape ladder and resize handle', async ({
    page,
  }) => {
    await page.goto('/');
    await addNoteWidget(page);

    const widget = page.locator('.widget').first();
    await expect(widget).toBeVisible();
    const before = await widget.boundingBox();

    const drawer = await openDrawer(page);
    await expect(
      drawer.locator('[data-testid="settings-drawer-close"]')
    ).toBeVisible();
    await expect(drawer).toHaveAttribute('aria-modal', 'false');
    await expect(drawer).not.toHaveAttribute('data-placement', 'bottom');

    // Tabs are always both present until a query is active.
    const tabs = drawer.getByRole('tab');
    await expect(tabs).toHaveCount(2);

    // Find-a-setting: typing hides the tab bar, clearing restores it.
    const filter = drawer.getByRole('textbox', { name: 'Find a setting' });
    await filter.fill('trans');
    await expect(drawer.getByRole('tab')).toHaveCount(0);

    // Escape ladder: clear the query, blur the input, then close the drawer.
    await filter.press('Escape');
    await expect(filter).toHaveValue('');
    await expect(drawer.getByRole('tab')).toHaveCount(2);
    await filter.press('Escape');
    await expect(filter).not.toBeFocused();

    // Resize handle: keyboard-operable, reports its width in px.
    const handle = drawer.locator('[data-testid="settings-drawer-resize"]');
    await expect(handle).toHaveAttribute('aria-orientation', 'vertical');
    const startWidth = Number(await handle.getAttribute('aria-valuenow'));
    await handle.press('ArrowLeft');
    await expect
      .poll(async () => Number(await handle.getAttribute('aria-valuenow')))
      .toBeGreaterThan(startWidth);

    // Third Escape (from the drawer, outside a form field) closes it.
    await drawer.getByRole('heading').first().press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);

    // §4.9: the drawer must never move a widget.
    const after = await widget.boundingBox();
    expect(after).toEqual(before);
  });
});

test.describe('settings drawer at 820x640', () => {
  test.use({ viewport: { width: 820, height: 640 } });

  test('renders as a full-width bottom sheet', async ({ page }) => {
    await page.goto('/');
    await addNoteWidget(page);

    const drawer = await openDrawer(page);
    await expect(drawer).toHaveAttribute('data-placement', 'bottom');

    const handle = drawer.locator('[data-testid="settings-drawer-resize"]');
    await expect(handle).toHaveAttribute('aria-orientation', 'horizontal');
    await expect(handle).toHaveAttribute('aria-valuemin', '35');
    await expect(handle).toHaveAttribute('aria-valuemax', '85');

    const box = await drawer.boundingBox();
    expect(box?.width).toBe(820);

    await drawer.locator('[data-testid="settings-drawer-close"]').click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
});
