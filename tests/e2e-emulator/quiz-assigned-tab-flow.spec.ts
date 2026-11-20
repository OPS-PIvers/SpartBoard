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

// The teacher flow with the Assigned tab preview on: one row per assignment, one status per class (docs/plans/ASSIGNED_TAB.md).
const QUIZ = 'Fractions check';

test.beforeEach(async ({ page }) => {
  await setFeatureOverrides(page, {
    ...teacherFeatureOverrides(),
    'assigned-tab': true,
  });
  await openBoard(page);
});

test('a teacher runs a quiz class by class from the Assigned tab', async ({
  page,
}) => {
  await createClass(page, 'Period 1');
  await createClass(page, 'Period 2');
  const library = await addQuizWidget(page);
  const widget = page.locator('.widget').first();
  const panel = library.getByRole('tabpanel');
  const classes = library.getByRole('button', { name: `Details for ${QUIZ}` });
  // A row's line is split across elements, so match it as a screen reader reads it.
  const reads = (text: string) =>
    expect.poll(() => panel.ariaSnapshot()).toContain(text);

  await test.step('assign to two classes with a manual start', async () => {
    await expect(library.getByRole('tab')).toHaveText(['Library', 'Assigned']);
    await createQuiz(page, QUIZ);
    await library.getByRole('button', { name: 'Assign', exact: true }).click();
    const stepper = page.getByRole('dialog', { name: QUIZ });
    await stepper.getByRole('checkbox', { name: /Period 1/ }).check();
    await stepper.getByRole('checkbox', { name: /Period 2/ }).check();
    await stepper.getByRole('button', { name: /^2 When/ }).click();
    await stepper.getByRole('radio', { name: 'Manual' }).check();
    await expect(
      stepper.getByText('Starts paused. You start and pause each class.')
    ).toBeVisible();
    await stepper.getByRole('button', { name: 'Assign', exact: true }).click();
    await expect(stepper).toBeHidden();
    await expectToast(
      page,
      'Student link copied — press Play when you’re ready to start.'
    );
    await expect(
      library.getByRole('tab', { name: 'Assigned' })
    ).toHaveAttribute('aria-selected', 'true');
    await reads('Active 1');
    await reads('2 classes');
    await expect(
      panel.getByRole('button', { name: 'Choose class' })
    ).toBeVisible();
    expect(await rowMenuItems(page, library)).toEqual([
      'Monitor',
      'Results',
      'Settings',
      'Share',
      'Assign to Google Classroom',
      'Close for all classes',
      'Move to Finished',
      'Delete',
    ]);
    await page.getByRole('menuitem', { name: 'Settings' }).click();
    const settings = page.getByRole('dialog', { name: QUIZ });
    await settings.getByRole('button', { name: 'Cancel' }).click();
    await expect(settings).toBeHidden();
  });

  await test.step('open one class', async () => {
    await classes.click();
    await reads('Period 1 Ready');
    await reads('Period 2 Ready');
    await reads('Closes manually');
    await panel
      .getByRole('button', { name: 'Open', exact: true })
      .first()
      .click();
    await expectToast(
      page,
      'Period 1 stays open until you pause it. Tag the class with its bell period in My Classes so it closes at the bell.'
    );
    await reads('Open · Period 1 0 turned in · 1 class to go');
    await reads('Period 1 Open 0 turned in');
    await reads('Period 2 Ready');
  });

  await test.step('pause and resume that class', async () => {
    await panel.getByRole('button', { name: 'Pause', exact: true }).click();
    await reads('Paused · Period 1 1 class to go');
    await reads('Period 1 Paused 0 turned in');
    await panel.getByRole('button', { name: 'Resume', exact: true }).click();
    await reads('Period 1 Open 0 turned in');
  });

  await test.step('close it, then reopen it', async () => {
    await panel.getByRole('button', { name: 'Close', exact: true }).click();
    await reads('1 of 2 classes closed');
    await reads('Period 1 Closed 0 turned in');
    await expect(
      panel.getByRole('button', { name: 'Open for Period 2' })
    ).toBeVisible();
    await panel.getByRole('button', { name: 'Reopen', exact: true }).click();
    await reads('Period 1 Open 0 turned in');
  });

  await test.step('open the monitor for the open class and come back', async () => {
    await panel.getByRole('button', { name: 'Monitor' }).first().click();
    await expect(widget.getByText(QUIZ)).toBeVisible();
    await expect(widget.getByRole('combobox', { name: 'Class' })).toHaveValue(
      /.+/
    );
    await expect(
      widget.getByRole('option', { name: 'Period 1 · Open' })
    ).toBeAttached();
    await expect(
      widget.getByRole('option', { name: 'Period 2 · Ready' })
    ).toBeAttached();
    await expect(
      widget.getByRole('button', { name: 'Close Period 1' })
    ).toBeVisible();
    await widget.getByRole('button', { name: 'Back' }).click();
    await reads('Open · Period 1 0 turned in · 1 class to go');
  });

  await test.step('close for all classes, then undo', async () => {
    await rowMenuItems(page, library);
    await page.getByRole('menuitem', { name: 'Close for all classes' }).click();
    await expectToast(page, `${QUIZ} is closed for all classes.`);
    await reads('Nothing active');
    await expect(
      panel.getByRole('button', { name: 'Finished 1' })
    ).toBeVisible();
    await page.getByRole('button', { name: 'Undo' }).click();
    await reads('Active 1');
    await reads('Open · Period 1 0 turned in · 1 class to go');
  });

  await test.step('move to Finished and open results', async () => {
    await rowMenuItems(page, library);
    await page.getByRole('menuitem', { name: 'Move to Finished' }).click();
    await expectToast(page, `${QUIZ} moved to Finished.`);
    await reads('Nothing active');
    await panel.getByRole('button', { name: 'Finished 1' }).click();
    await reads(`${QUIZ} Closed`);
    expect(await rowMenuItems(page, library)).toEqual([
      'Monitor',
      'Settings',
      'Share',
      'Publish scores',
      'Reopen for selected students',
      'Delete',
    ]);
    await page.getByRole('menuitem', { name: 'Publish scores' }).click();
    const publish = page.getByRole('dialog', {
      name: 'Publish scores to students',
    });
    await publish.getByRole('button', { name: 'Cancel' }).click();
    await expect(publish).toBeHidden();
    await panel.getByRole('button', { name: 'Results', exact: true }).click();
    await expect(widget.getByText('No data available yet')).toBeVisible();
    await widget.getByRole('button', { name: 'Back' }).click();
    await expect(
      library.getByRole('tab', { name: 'Assigned' })
    ).toHaveAttribute('aria-selected', 'true');
  });

  await test.step('delete the assignment', async () => {
    const done = panel.getByRole('button', { name: 'Finished 1' });
    if ((await done.getAttribute('aria-expanded')) !== 'true')
      await done.click();
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
    await reads('Nothing active');
    await expect(panel.getByRole('button', { name: /^Finished/ })).toHaveCount(
      0
    );
  });
});
