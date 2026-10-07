import { test, expect, type Locator, type Page } from '@playwright/test';
import { dismissWelcomeToast } from './helpers/dismissWelcomeToast';
import { expectScrollEndPadding } from './helpers/scrollEndPadding';

const openBoard = async (page: Page): Promise<void> => {
  await page.goto('/');
  await page.addStyleTag({
    content:
      '*, *::before, *::after { transition: none !important; animation: none !important; }',
  });
  await dismissWelcomeToast(page);
};

// Visits every tab in the dialog's rail and measures each scroller at its end.
const checkEveryTab = async (
  page: Page,
  dialog: Locator,
  surface: string
): Promise<void> => {
  // A short viewport makes most panels overflow, so every tab's end padding is measured.
  await page.setViewportSize({ width: 1280, height: 480 });
  const tabs = dialog.getByRole('tablist').first().getByRole('tab');
  const count = await tabs.count();
  expect(count).toBeGreaterThan(1);
  for (let i = 0; i < count; i++) {
    const tab = tabs.nth(i);
    const name =
      (await tab.getAttribute('title')) ?? (await tab.innerText()).trim();
    await tab.click();
    await expect(tab).toHaveAttribute('aria-selected', 'true');
    // Let lazy data and loading states settle before measuring.
    await page.waitForTimeout(400);
    await expectScrollEndPadding(dialog, `${surface} > ${name}`);
  }
};

test('every Admin Settings tab keeps padding under its last row', async ({
  page,
}) => {
  await openBoard(page);
  await page.getByRole('button', { name: 'Admin Settings' }).click();
  const dialog = page.getByRole('dialog', { name: /admin settings/i });
  await expect(dialog).toBeVisible();
  // Preview-gated tabs are measured too; admins pass the teams-redesign gate.
  await expect(
    dialog.getByRole('tab', { name: 'Team type defaults' })
  ).toBeVisible();
  await checkEveryTab(page, dialog, 'Admin Settings');
});

test('every Profile & Settings section keeps padding under its last row', async ({
  page,
}) => {
  await openBoard(page);
  await page.getByTitle('Open Menu').click();
  await page.getByRole('button', { name: /profile & settings/i }).click();
  const dialog = page.getByRole('dialog', { name: /profile & settings/i });
  await expect(dialog).toBeVisible();
  await checkEveryTab(page, dialog, 'Profile & Settings');
});

test('the widget settings drawer keeps padding under its last row', async ({
  page,
}) => {
  await openBoard(page);
  await page.getByTitle('Open Tools').click();
  await page.waitForTimeout(500);
  await page
    .getByRole('button', { name: /^Clock$/ })
    .first()
    .click({ force: true });
  await page.mouse.click(0, 0);
  const clockWidget = page
    .locator('.widget', { has: page.getByTestId('clock-time-container') })
    .last();
  await clockWidget.click({ position: { x: 20, y: 20 } });
  await page
    .getByRole('button', { name: 'Settings (Alt+S)', exact: true })
    .click();
  const drawer = page.getByRole('dialog');
  await expect(drawer).toBeVisible({ timeout: 10000 });
  await checkEveryTab(page, drawer, 'Clock settings');
});

const LIBRARY_VIEWS = [
  'quiz',
  'video-activity',
  'guided-learning',
  'mini-app',
  'flashcards',
  'activity-wall',
];

for (const view of LIBRARY_VIEWS) {
  test(`every ${view} library tab keeps padding under its last row`, async ({
    page,
  }) => {
    await page.goto(`/library-managers-dev?view=${view}`);
    await page.addStyleTag({
      content:
        '*, *::before, *::after { transition: none !important; animation: none !important; }',
    });
    const shell = page.getByRole('tabpanel', { name: /tab content/ });
    await expect(shell).toBeVisible();
    const body = page.locator('body');
    const tabs = page.getByRole('tablist').first().getByRole('tab');
    const count = await tabs.count();
    for (let i = 0; i < Math.max(count, 1); i++) {
      let name = 'Library';
      if (count > 0) {
        const tab = tabs.nth(i);
        name = (await tab.innerText()).trim() || `tab ${i + 1}`;
        await tab.click();
        await expect(tab).toHaveAttribute('aria-selected', 'true');
      }
      await page.waitForTimeout(300);
      await expectScrollEndPadding(body, `${view} library > ${name}`);
    }
    // An open preview pane must not pin the list to the panel height.
    const firstTab = count > 0 ? tabs.first() : null;
    if (firstTab) await firstTab.click();
    const firstCard = page
      .getByTestId('library-grid')
      .locator(':scope > *')
      .first();
    await firstCard.click({ position: { x: 40, y: 12 } });
    const pane = page.getByRole('complementary', { name: 'Item preview' });
    if (await pane.isVisible({ timeout: 2000 }).catch(() => false)) {
      await expectScrollEndPadding(body, `${view} library > preview open`);
    }
  });
}

// Student landing v2 (fixture page): the class view at Chromebook width, then at phone width with the bottom tab bar.
for (const [label, width] of [
  ['Chromebook', 1366],
  ['phone', 390],
] as const) {
  test(`every student class tab keeps padding under its last row (${label})`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 420 });
    await page.goto('/student-landing-dev?class=eng');
    await page.addStyleTag({
      content:
        '*, *::before, *::after { transition: none !important; animation: none !important; }',
    });
    const body = page.locator('body');
    for (const name of ['Assignments', 'Resources', 'Completed']) {
      const tab =
        width >= 896
          ? page.getByRole('tab', { name: new RegExp(`^${name}`) })
          : page
              .getByRole('navigation', { name: /sections/ })
              .getByRole('button', { name: new RegExp(`^${name}`) });
      await tab.click();
      await page.waitForTimeout(200);
      await expectScrollEndPadding(body, `student ${label} > ${name}`);
    }
  });
}
