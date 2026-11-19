import { expect, type Locator, type Page } from '@playwright/test';
import { FEATURE_DEFAULTS } from '@/config/featureDefaults';

const OVERRIDES_KEY = 'authBypassFeatureOverrides';

export const setFeatureOverrides = async (
  page: Page,
  overrides: Record<string, boolean>
): Promise<void> => {
  await page.addInitScript(([key, value]) => localStorage.setItem(key, value), [
    OVERRIDES_KEY,
    JSON.stringify(overrides),
  ] as const);
};

// Auth bypass grants every flag; this switches off the ones a teacher does not have by default.
export const teacherFeatureOverrides = (): Record<string, boolean> =>
  Object.fromEntries(
    Object.entries(FEATURE_DEFAULTS)
      .filter(
        ([, feature]) =>
          feature.defaultAccessLevel !== 'public' || !feature.defaultEnabled
      )
      .map(([id]) => [id, false])
  );

export const openBoard = async (page: Page): Promise<void> => {
  await page.goto('/');
  await page.waitForSelector('#dashboard-root', { timeout: 90000 });
  await expect(page.getByTitle('Open Menu')).toBeVisible();
};

// Rosters live in memory under auth bypass, so each test makes its class through My Classes.
export const createClass = async (page: Page, name: string): Promise<void> => {
  await page.getByTitle('Open Menu').click();
  await page.getByRole('button', { name: /^My Classes/ }).click();
  await page.getByRole('button', { name: 'New Class', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'New Class' });
  await dialog.getByRole('textbox', { name: 'Class Name' }).fill(name);
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toBeHidden();
  await page.getByRole('button', { name: 'Close Menu' }).click();
};

export const addQuizWidget = async (page: Page): Promise<Locator> => {
  await page
    .locator('button[data-tool-id="quiz"]')
    .evaluate((el) => (el as HTMLElement).click());
  const library = page.getByRole('region', { name: 'Quiz library' });
  await expect(library).toBeVisible({ timeout: 30000 });
  return library;
};

export const createQuiz = async (page: Page, title: string): Promise<void> => {
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Create quiz' }).click();
  const editor = page.getByRole('dialog');
  await editor.getByRole('textbox', { name: 'Title' }).fill(title);
  await editor.getByRole('button', { name: 'Add', exact: true }).click();
  await editor
    .getByRole('textbox', { name: 'Question prompt' })
    .fill('What is 2 + 2?');
  const options = { A: '3', B: '4', C: '5', D: '22' };
  for (const [letter, text] of Object.entries(options)) {
    await editor
      .getByRole('textbox', { name: `Option ${letter}`, exact: true })
      .fill(text);
  }
  await editor.getByRole('radio', { name: 'Option B is correct' }).check();
  await expect(editor.getByText('Saved', { exact: true })).toBeVisible();
  await expect(editor.getByText(/Not ready to use yet/)).toHaveCount(0);
  await editor.getByRole('button', { name: 'Close' }).last().click();
  await expect(editor).toBeHidden();
};

export const expectToast = async (page: Page, text: string): Promise<void> => {
  await expect(
    page.getByRole('status').filter({ hasText: text }).first()
  ).toBeVisible();
};

export const rowMenuItems = async (
  page: Page,
  library: Locator
): Promise<string[]> => {
  await library.getByRole('button', { name: 'More actions' }).click();
  await expect(page.getByRole('menuitem').first()).toBeVisible();
  return page.getByRole('menuitem').allInnerTexts();
};
