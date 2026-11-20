import { test, expect, type Locator, type Page } from '@playwright/test';
import {
  createClass,
  expectToast,
  openBoard,
  rowMenuItems,
  setFeatureOverrides,
  teacherFeatureOverrides,
} from './helpers/quiz';

// Pins starting a Review game from the Review widget for a teacher with default flags (docs/plans/QUIZ_WIDGET_STRUCTURE.md S1, D11).
const QUIZ = 'Fractions review';

const addReviewWidget = async (page: Page): Promise<Locator> => {
  await page
    .locator('button[data-tool-id="review"]')
    .evaluate((el) => (el as HTMLElement).click());
  const library = page.getByRole('region', { name: 'Review library' });
  await expect(library).toBeVisible({ timeout: 30000 });
  return library;
};

// Review's New Quiz menu says "Create", not Quiz's "Create quiz", so the shared helper does not fit.
const createReviewQuiz = async (
  page: Page,
  library: Locator,
  title: string
): Promise<void> => {
  await library.getByRole('button', { name: 'New Quiz' }).click();
  await expect(page.getByRole('menuitem')).toHaveText(['Create', 'Import']);
  await page.getByRole('menuitem', { name: 'Create', exact: true }).click();
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
  await expectToast(page, 'Quiz created!');
};

const toastTexts = async (page: Page): Promise<string[]> =>
  (await page.getByRole('status').allInnerTexts())
    .map((text) => text.trim())
    .filter(Boolean);

// Start and End add no toast today; any toast showing after them must already have been there.
const expectNoNewToast = async (
  page: Page,
  before: string[]
): Promise<void> => {
  for (const text of await toastTexts(page)) expect(before).toContain(text);
};

test.beforeEach(async ({ page }) => {
  await setFeatureOverrides(page, teacherFeatureOverrides());
  await openBoard(page);
});

test('a teacher starts a teacher-paced review, runs it and closes it', async ({
  page,
}) => {
  await createClass(page, 'Period 1');
  const library = await addReviewWidget(page);
  const widget = page.locator('.widget').first();
  const panel = library.getByRole('tabpanel');

  await test.step('create a quiz in the Review library', async () => {
    await expect(library.getByRole('tablist', { name: 'Review library tabs' }))
      .toMatchAriaSnapshot(`
      - tab "Library" [selected]
      - tab "Banks"
      - tab "In Progress"
      - tab "Archive"
    `);
    await expect(panel.getByText('No Quizzes Yet')).toBeVisible();
    await createReviewQuiz(page, library, QUIZ);
    await expect(library.getByRole('heading', { name: QUIZ })).toBeVisible();
    await expect(panel.getByText('1 Qs')).toBeVisible();
    await expect(
      panel.getByRole('button', { name: 'Start', exact: true })
    ).toBeEnabled();
    expect(await rowMenuItems(page, library)).toEqual([
      'Check answers',
      'Edit',
      'Duplicate',
      'Share',
      'Move to folder…',
      'Delete',
    ]);
    await page.getByRole('menuitem', { name: 'Edit' }).click();
    const editor = page.getByRole('dialog');
    await expect(editor.getByRole('textbox', { name: 'Title' })).toHaveValue(
      QUIZ
    );
    await editor.getByRole('button', { name: 'Close' }).last().click();
    await expect(editor).toBeHidden();
  });

  await test.step('open the start dialog with its default options', async () => {
    await panel.getByRole('button', { name: 'Start', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: QUIZ });
    await expect(dialog).toMatchAriaSnapshot(`
      - paragraph: Start review
      - heading "${QUIZ}" [level=3]
      - button "Close"
      - paragraph: Session Mode
      - button /^Teacher-paced Show one question at a time on the board\\./ [pressed]
      - button /^Self-paced game Students race through the questions/
      - text: Advance automatically when everyone has answered
      - switch "Advance automatically when everyone has answered"
      - text: Classes
      - group "Classes":
        - checkbox /^Period 1/
        - text: /^Period 1/
      - text: Leaderboard on board
      - group "Leaderboard on board":
        - button "Top 5" [pressed]
        - button "Top 10"
        - button "Everyone"
      - paragraph: Integrity
      - text: Focus mode
      - switch "Focus mode" [checked]
      - text: Auto-submit after repeated tab switches
      - switch "Auto-submit after repeated tab switches" [checked]
      - text: Warnings before auto-submit
      - spinbutton "Warnings before auto-submit": "3"
      - text: Block Copy & Paste
      - switch "Block Copy & Paste"
      - button "Question Randomization"
      - button "Answer Feedback"
      - text: Allow students to raise a hand
      - switch "Allow students to raise a hand"
      - button "Gamification"
      - button "Cancel"
      - button "Start"
    `);
    await expect(
      dialog.getByRole('switch', {
        name: 'Advance automatically when everyone has answered',
      })
    ).not.toBeChecked();
    await expect(
      dialog.getByRole('checkbox', { name: /Period 1/ })
    ).not.toBeChecked();
    await dialog.getByRole('button', { name: 'Gamification' }).click();
    for (const name of [
      'Speed Bonus Points',
      'Streak Bonuses',
      'Podium Between Questions',
      'Sound Effects',
    ]) {
      await expect(dialog.getByRole('switch', { name })).toBeChecked();
    }
  });

  await test.step('start it for a class and land on the paused monitor', async () => {
    const dialog = page.getByRole('dialog', { name: QUIZ });
    await dialog.getByRole('checkbox', { name: /Period 1/ }).check();
    const before = await toastTexts(page);
    await dialog.getByRole('button', { name: 'Start', exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(widget.getByText(QUIZ)).toBeVisible();
    await expect(widget.getByText('Paused', { exact: true })).toBeVisible();
    const status = widget.getByRole('group', { name: 'Student status' });
    await expect(
      status.getByRole('button', { name: '0 Not started' })
    ).toBeVisible();
    for (const name of [
      'Resume',
      'Close all',
      'Join code',
      'Question results',
      'Quiz settings',
    ]) {
      await expect(widget.getByRole('button', { name })).toBeVisible();
    }
    await expectNoNewToast(page, before);
  });

  await test.step('show the join code', async () => {
    await widget.getByRole('button', { name: 'Join code' }).click();
    await expect(widget.getByText('Join code', { exact: true })).toBeVisible();
    await expect(widget.getByText(/^Join at .+\/quiz$/)).toBeVisible();
    await expect(widget.getByText(/^[A-Z0-9]{6}$/)).toBeVisible();
    await expect(
      widget.getByRole('button', { name: 'Copy link' })
    ).toBeVisible();
    await expect(widget.getByRole('link', { name: 'Preview' })).toBeVisible();
    await widget.getByRole('button', { name: 'Back' }).click();
    await expect(widget.getByRole('button', { name: 'Resume' })).toBeVisible();
  });

  await test.step('resume and pause from the monitor', async () => {
    await widget.getByRole('button', { name: 'Resume' }).click();
    await expectToast(page, 'Assignment resumed.');
    await expect(widget.getByText('Live', { exact: true })).toBeVisible();
    await expect(widget.getByText('Ready to start')).toBeVisible();
    await widget.getByRole('button', { name: 'Pause' }).click();
    await expectToast(page, 'Assignment paused.');
    await expect(widget.getByText('Paused', { exact: true })).toBeVisible();
    await expect(widget.getByRole('button', { name: 'Resume' })).toBeVisible();
  });

  await test.step('leave the monitor and find it In Progress', async () => {
    await widget.getByRole('button', { name: 'Back' }).click();
    await expect(
      library.getByRole('tab', { name: 'In Progress' })
    ).toHaveAttribute('aria-selected', 'true');
    await expect(panel.getByText(QUIZ)).toBeVisible();
    await expect(panel.getByText('Paused', { exact: true })).toBeVisible();
    await expect(panel.getByRole('button', { name: '1 class' })).toBeVisible();
    expect(await rowMenuItems(page, library)).toEqual([
      'Results',
      'Share',
      'Assign to Google Classroom',
      'End',
      'Delete',
    ]);
    await page.getByRole('menuitem', { name: 'Results' }).click();
    await expect(widget.getByText('No data available yet')).toBeVisible();
    await widget.getByRole('button', { name: 'Back' }).click();
    await expect(panel.getByText(QUIZ)).toBeVisible();
  });

  await test.step('start it from the row and run the first question', async () => {
    const before = await toastTexts(page);
    await panel.getByRole('button', { name: 'Start', exact: true }).click();
    await expect(widget.getByText('Live', { exact: true })).toBeVisible();
    await expectNoNewToast(page, before);
    await expect(widget.getByText('Ready to start')).toBeVisible();
    await expect(widget.getByText('0 students have joined.')).toBeVisible();
    await widget.getByRole('button', { name: 'Start quiz session' }).click();
    await expect(widget.getByText('What is 2 + 2?')).toBeVisible();
    await expect.poll(() => widget.ariaSnapshot()).toContain('Question 1 of 1');
    await expect(widget.getByRole('button', { name: 'Finish' })).toBeVisible();
    await expect(widget.getByRole('button', { name: 'Pause' })).toBeVisible();
  });

  await test.step('close it for every class', async () => {
    await widget.getByRole('button', { name: 'Close all' }).click();
    const confirm = page.getByRole('dialog', { name: 'Close for all classes' });
    await expect(
      confirm.getByText(
        'Close this assignment for every class? Students lose access, and all responses are kept in the archive.'
      )
    ).toBeVisible();
    const before = await toastTexts(page);
    await confirm.getByRole('button', { name: 'Close all' }).click();
    await expect(library.getByRole('tab', { name: 'Archive' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    await expect(panel.getByText(QUIZ)).toBeVisible();
    await expect(panel.getByText('Ended')).toBeVisible();
    await expect(
      panel.getByRole('button', { name: 'Results', exact: true })
    ).toBeVisible();
    await expectNoNewToast(page, before);
  });
});

test('a teacher starts a self-paced review game and ends it', async ({
  page,
}) => {
  const library = await addReviewWidget(page);
  const widget = page.locator('.widget').first();
  const panel = library.getByRole('tabpanel');
  await createReviewQuiz(page, library, QUIZ);

  await test.step('pick the game mode and see its options', async () => {
    await panel.getByRole('button', { name: 'Start', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: QUIZ });
    await dialog.getByRole('button', { name: /^Self-paced game/ }).click();
    await expect(dialog).toMatchAriaSnapshot(`
      - paragraph: Session Mode
      - button /^Teacher-paced/
      - button /^Self-paced game/ [pressed]
      - text: Game length
      - combobox "Game length":
        - option "3 min"
        - option "5 min"
        - option "10 min" [selected]
        - option "15 min"
        - option "20 min"
        - option "Custom"
      - text: Classes
      - group "Classes"
      - text: Leaderboard on board
      - group "Leaderboard on board":
        - button "Top 5" [pressed]
        - button "Top 10"
        - button "Everyone"
      - paragraph: Integrity
      - text: Focus mode
      - switch "Focus mode" [checked]
      - text: Block Copy & Paste
      - switch "Block Copy & Paste"
      - button "Question Randomization"
      - button "Answer Feedback"
      - text: Allow students to raise a hand
      - switch "Allow students to raise a hand"
      - button "Gamification"
      - button "Cancel"
      - button "Start"
    `);
    await expect(
      dialog.getByRole('switch', {
        name: 'Auto-submit after repeated tab switches',
      })
    ).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Gamification' }).click();
    await expect(
      dialog.getByRole('switch', { name: 'Sound Effects' })
    ).toBeVisible();
    await expect(
      dialog.getByRole('switch', { name: 'Podium Between Questions' })
    ).toHaveCount(0);
  });

  await test.step('start the game with no class', async () => {
    const dialog = page.getByRole('dialog', { name: QUIZ });
    const before = await toastTexts(page);
    await dialog.getByRole('button', { name: 'Start', exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(widget.getByText(QUIZ)).toBeVisible();
    await expect.poll(() => widget.ariaSnapshot()).toContain('Live Ready');
    await expect(widget.getByRole('timer')).toHaveText('10:00');
    await expect(
      widget.getByRole('meter', { name: 'First attempt accuracy' })
    ).toBeVisible();
    await expect(
      widget.getByRole('list', { name: 'Leaderboard' })
    ).toBeVisible();
    for (const name of ['Start game', 'Names off', 'End game', 'Join code']) {
      await expect(widget.getByRole('button', { name })).toBeVisible();
    }
    await expectNoNewToast(page, before);
  });

  await test.step('run the clock', async () => {
    await widget.getByRole('button', { name: 'Start game' }).click();
    await expect(widget.getByText('Time left')).toBeVisible();
    await expect(
      widget.getByRole('button', { name: 'Start game' })
    ).toHaveCount(0);
    await expect(widget.getByRole('button', { name: 'Pause' })).toBeVisible();
    await expect(widget.getByRole('button', { name: '1 min' })).toBeVisible();
  });

  await test.step('end the game', async () => {
    await widget.getByRole('button', { name: 'End game' }).click();
    const confirm = page.getByRole('dialog', { name: 'End game' });
    await expect(
      confirm.getByText(
        'End this game? The student link stops working, but all responses are preserved in the archive.'
      )
    ).toBeVisible();
    const before = await toastTexts(page);
    await confirm.getByRole('button', { name: 'End', exact: true }).click();
    await expect(library.getByRole('tab', { name: 'Archive' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    await expect(panel.getByText(QUIZ)).toBeVisible();
    await expect(panel.getByText('Ended')).toBeVisible();
    await expectNoNewToast(page, before);
  });
});
