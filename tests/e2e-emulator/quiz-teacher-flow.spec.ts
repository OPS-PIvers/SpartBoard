import { test, expect } from '@playwright/test';
import {
  addQuizWidget,
  createClass,
  createQuiz,
  expectToast,
  openBoard,
  rowMenuItems,
  setFeatureOverrides,
  teacherFeatureOverrides,
} from './helpers/quiz';

// Pins what a teacher with default flags sees and what each action does, end to end on the real widget (docs/plans/QUIZ_WIDGET_STRUCTURE.md S1).
const QUIZ = 'Fractions check';

test.beforeEach(async ({ page }) => {
  await setFeatureOverrides(page, teacherFeatureOverrides());
  await openBoard(page);
});

test('a teacher assigns, runs, ends, reopens and deletes a quiz', async ({
  page,
}) => {
  await createClass(page, 'Period 1');
  const library = await addQuizWidget(page);
  const widget = page.locator('.widget').first();
  const row = library.getByRole('tabpanel');

  await test.step('create a quiz', async () => {
    await expect(row.getByText('No Quizzes Yet')).toBeVisible();
    await createQuiz(page, QUIZ);
    await expect(library.getByRole('heading', { name: QUIZ })).toBeVisible();
    await expect(row.getByText('1 Qs')).toBeVisible();
  });

  await test.step('assign it to a class', async () => {
    await library.getByRole('button', { name: 'Assign', exact: true }).click();
    const stepper = page.getByRole('dialog', { name: QUIZ });
    await expect(
      stepper.getByRole('button', { name: /^1 Classes/ })
    ).toBeVisible();
    await stepper.getByRole('checkbox', { name: /Period 1/ }).check();
    await stepper.getByRole('button', { name: 'Assign', exact: true }).click();
    await expect(stepper).toBeHidden();
    await expectToast(
      page,
      'Student link copied — press Play when you’re ready to start.'
    );
    await expect(
      library.getByRole('tab', { name: 'In Progress' })
    ).toHaveAttribute('aria-selected', 'true');
    await expect(row.getByText(QUIZ)).toBeVisible();
    await expect(row.getByText('Paused', { exact: true })).toBeVisible();
    await expect(row.getByRole('button', { name: '1 class' })).toBeVisible();
    expect(await rowMenuItems(page, library)).toEqual([
      'Results',
      'Settings',
      'Share',
      'Assign to Google Classroom',
      'End',
      'Delete',
    ]);
    await page.getByRole('menuitem', { name: 'Settings' }).click();
    const settings = page.getByRole('dialog', { name: QUIZ });
    await expect(settings.getByRole('button', { name: 'Save' })).toBeVisible();
    await settings.getByRole('button', { name: 'Cancel' }).click();
    await expect(settings).toBeHidden();
  });

  await test.step('start it and open the monitor', async () => {
    await row.getByRole('button', { name: 'Start', exact: true }).click();
    await expect(widget.getByText('Live', { exact: true })).toBeVisible();
    await expect(widget.getByText(QUIZ)).toBeVisible();
    const status = widget.getByRole('group', { name: 'Student status' });
    await expect(
      status.getByRole('button', { name: '0 Not started' })
    ).toBeVisible();
    await expect(widget.getByRole('button', { name: 'Pause' })).toBeVisible();
    await expect(
      widget.getByRole('button', { name: 'Close all' })
    ).toBeVisible();
  });

  await test.step('leave the monitor and pause from the row', async () => {
    await widget.getByRole('button', { name: 'Back' }).click();
    await expect(row.getByText('Live', { exact: true })).toBeVisible();
    await expect(
      row.getByRole('button', { name: 'Monitor', exact: true })
    ).toBeVisible();
    expect(await rowMenuItems(page, library)).toEqual([
      'Results',
      'Settings',
      'Share',
      'Assign to Google Classroom',
      'Pause',
      'End',
      'Delete',
    ]);
    await page.getByRole('menuitem', { name: 'Pause' }).click();
    await expectToast(page, 'Assignment paused.');
    await expect(row.getByText('Paused', { exact: true })).toBeVisible();
    await expect(
      row.getByRole('button', { name: 'Start', exact: true })
    ).toBeVisible();
  });

  await test.step('end it', async () => {
    await rowMenuItems(page, library);
    await page.getByRole('menuitem', { name: 'End' }).click();
    const confirm = page.getByRole('dialog', { name: 'End Assignment' });
    await expect(
      confirm.getByText(
        'End this assignment? The join URL will stop working. Responses are preserved.'
      )
    ).toBeVisible();
    await confirm.getByRole('button', { name: 'End' }).click();
    await expectToast(page, 'Assignment deactivated. Responses preserved.');
    await expect(row.getByText('No quizzes in progress')).toBeVisible();
    await library.getByRole('tab', { name: 'Completed' }).click();
    await expect(row.getByText(QUIZ)).toBeVisible();
    await expect(row.getByText('Ended', { exact: true })).toBeVisible();
  });

  await test.step('open results and come back', async () => {
    await row.getByRole('button', { name: 'Results', exact: true }).click();
    await expect(widget.getByText('No data available yet')).toBeVisible();
    await expect(
      widget.getByRole('button', { name: 'Publish results' })
    ).toBeVisible();
    await widget.getByRole('button', { name: 'Back' }).click();
    await expect(
      library.getByRole('tab', { name: 'Completed' })
    ).toHaveAttribute('aria-selected', 'true');
    await expect(row.getByText('Ended', { exact: true })).toBeVisible();
  });

  await test.step('publish scores', async () => {
    expect(await rowMenuItems(page, library)).toEqual([
      'Monitor',
      'Settings',
      'Share',
      'Publish scores',
      'Reopen',
      'Delete',
    ]);
    await page.getByRole('menuitem', { name: 'Publish scores' }).click();
    const publish = page.getByRole('dialog', {
      name: 'Publish scores to students',
    });
    await expect(
      publish.getByRole('radio', { name: 'Score only' })
    ).toBeChecked();
    await publish.getByRole('button', { name: 'Publish', exact: true }).click();
    await expectToast(
      page,
      'Scores published. Students will see results once they submit.'
    );
    expect(await rowMenuItems(page, library)).toContain('Published scores');
  });

  await test.step('reopen it', async () => {
    await page.getByRole('menuitem', { name: 'Reopen' }).click();
    await expectToast(page, 'Reopened — click Resume to accept submissions.');
    await expect(row.getByText('No completed assignments')).toBeVisible();
    await library.getByRole('tab', { name: 'In Progress' }).click();
    await expect(row.getByText(QUIZ)).toBeVisible();
    await expect(row.getByText('Paused', { exact: true })).toBeVisible();
  });

  await test.step('delete the assignment', async () => {
    await rowMenuItems(page, library);
    await page.getByRole('menuitem', { name: 'Delete' }).click();
    const confirm = page.getByRole('dialog', { name: 'Delete Assignment' });
    await expect(
      confirm.getByText(
        'Delete this assignment and all responses? This cannot be undone.'
      )
    ).toBeVisible();
    await confirm.getByRole('button', { name: 'Delete' }).click();
    await expectToast(page, 'Assignment deleted.');
    await expect(row.getByText('No quizzes in progress')).toBeVisible();
  });

  await test.step('delete the quiz', async () => {
    await library.getByRole('tab', { name: 'Library' }).click();
    await expect(library.getByRole('heading', { name: QUIZ })).toBeVisible();
    await rowMenuItems(page, library);
    await page.getByRole('menuitem', { name: 'Delete' }).click();
    const confirm = page.getByRole('dialog', { name: `Delete "${QUIZ}"?` });
    await expect(confirm.getByText('This cannot be undone.')).toBeVisible();
    await confirm.getByRole('button', { name: 'Delete' }).click();
    await expectToast(page, 'Quiz deleted.');
    await expect(row.getByText('No Quizzes Yet')).toBeVisible();
  });
});

test('a teacher assigns a quiz with no class', async ({ page }) => {
  const library = await addQuizWidget(page);
  const row = library.getByRole('tabpanel');
  await createQuiz(page, QUIZ);
  await library.getByRole('button', { name: 'Assign', exact: true }).click();
  const stepper = page.getByRole('dialog', { name: QUIZ });
  await expect(
    stepper.getByText(
      'No classes yet. Create one in My Classes or import from ClassLink to assign here.'
    )
  ).toBeVisible();
  await stepper.getByRole('button', { name: 'Assign', exact: true }).click();
  await expect(stepper).toBeHidden();
  await expectToast(
    page,
    'Student link copied — press Play when you’re ready to start.'
  );
  await expect(row.getByText(QUIZ)).toBeVisible();
  await expect(row.getByText('No classes')).toBeVisible();
  await expect(row.getByText('Paused', { exact: true })).toBeVisible();
});
