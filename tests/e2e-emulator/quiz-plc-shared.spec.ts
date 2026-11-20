import { test, expect, type Locator, type Page } from '@playwright/test';
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

// Pins the PLC-shared assignment variant (docs/plans/QUIZ_WIDGET_STRUCTURE.md S1, D5) with default teacher flags.
// usePlcs lists no PLCs under auth bypass, so the PLC picker and the stepper's Sharing step stay out of reach here.
const QUIZ = 'Team fractions check';
const PLC = { id: 'plc-e2e', name: 'Grade 5 Math Team' };
const FIRESTORE =
  'http://127.0.0.1:8080/v1/projects/demo-spartboard-e2e/databases/(default)/documents';
const OWNER = { Authorization: 'Bearer owner' };

// Gives this spec's one assignment the `plc` link a PLC share writes, through the emulator's admin REST API.
const linkAssignmentToPlc = async (page: Page): Promise<void> => {
  const found = await page.request.post(`${FIRESTORE}:runQuery`, {
    headers: OWNER,
    data: {
      structuredQuery: {
        from: [{ collectionId: 'quiz_assignments', allDescendants: true }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'quizTitle' },
            op: 'EQUAL',
            value: { stringValue: QUIZ },
          },
        },
      },
    },
  });
  expect(found.ok()).toBe(true);
  const rows = (await found.json()) as { document?: { name: string } }[];
  const names = rows.flatMap((r) => (r.document ? [r.document.name] : []));
  expect(names).toHaveLength(1);
  const patched = await page.request.patch(
    `http://127.0.0.1:8080/v1/${names[0]}?updateMask.fieldPaths=plc`,
    {
      headers: OWNER,
      data: {
        fields: {
          plc: {
            mapValue: {
              fields: {
                id: { stringValue: PLC.id },
                name: { stringValue: PLC.name },
                memberEmails: {
                  arrayValue: {
                    values: [
                      { stringValue: 'mock@example.com' },
                      { stringValue: 'teammate@example.com' },
                    ],
                  },
                },
              },
            },
          },
        },
      },
    }
  );
  expect(patched.ok()).toBe(true);
};

// Closes an open row menu with its own toggle (Escape would leave a board overlay behind).
const closeRowMenu = async (page: Page, library: Locator): Promise<void> => {
  await library.getByRole('button', { name: 'More actions' }).click();
  await expect(page.getByRole('menuitem')).toHaveCount(0);
};

const ROW_MENU = [
  'Results',
  'Settings',
  'Share',
  'Assign to Google Classroom',
  'End',
  'Delete',
];

test.beforeEach(async ({ page }) => {
  await setFeatureOverrides(page, teacherFeatureOverrides());
  await openBoard(page);
});

test('a teacher with no PLC is pointed to My Teams when sharing a quiz', async ({
  page,
}) => {
  const library = await addQuizWidget(page);
  await expect(
    library.getByRole('tabpanel').getByText('No Quizzes Yet')
  ).toBeVisible();
  await createQuiz(page, QUIZ);
  await rowMenuItems(page, library);
  await page.getByRole('menuitem', { name: 'Share', exact: true }).click();
  const share = page.getByRole('menu', { name: 'Share' });
  await expect(share.getByRole('menuitem')).toHaveText([
    'Get link',
    'Share with PLC',
  ]);
  await share.getByRole('menuitem', { name: 'Share with PLC' }).click();
  await expectToast(
    page,
    'Join a team under My Teams in the sidebar to share quizzes with teammates.'
  );
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('a teacher stops sharing a PLC-linked assignment', async ({ page }) => {
  await createClass(page, 'Period 1');
  const library = await addQuizWidget(page);
  const widget = page.locator('.widget').first();
  const row = library.getByRole('tabpanel');

  await test.step('the assign flow offers no Sharing step without a PLC', async () => {
    await expect(row.getByText('No Quizzes Yet')).toBeVisible();
    await createQuiz(page, QUIZ);
    await library.getByRole('button', { name: 'Assign', exact: true }).click();
    const stepper = page.getByRole('dialog', { name: QUIZ });
    await expect(
      stepper.getByRole('button', { name: /^1 Classes/ })
    ).toBeVisible();
    await expect(stepper.getByRole('button', { name: /Sharing/ })).toHaveCount(
      0
    );
    await stepper.getByRole('checkbox', { name: /Period 1/ }).check();
    await stepper.getByRole('button', { name: 'Assign', exact: true }).click();
    await expect(stepper).toBeHidden();
    await expectToast(
      page,
      'Student link copied — press Play when you’re ready to start.'
    );
    await expect(row.getByText('Paused', { exact: true })).toBeVisible();
    expect(await rowMenuItems(page, library)).toEqual(ROW_MENU);
    await expect(
      page.getByRole('menuitem', { name: 'Share', exact: true })
    ).not.toHaveAttribute('aria-haspopup');
    await closeRowMenu(page, library);
  });

  await test.step('a PLC-linked row folds Stop sharing under Share', async () => {
    await rowMenuItems(page, library);
    await linkAssignmentToPlc(page);
    const shareItem = page.getByRole('menuitem', {
      name: 'Share',
      exact: true,
    });
    await expect(shareItem).toHaveAttribute('aria-haspopup', 'menu');
    await expect(page.getByRole('menuitem')).toHaveText(ROW_MENU);
    await shareItem.click();
    await expect(
      page.getByRole('menu', { name: 'Share' }).getByRole('menuitem')
    ).toHaveText(['Get link', `Stop sharing with ${PLC.name}`]);
    await closeRowMenu(page, library);
  });

  await test.step('its results offer the same Sheets export', async () => {
    await rowMenuItems(page, library);
    await page.getByRole('menuitem', { name: 'Results' }).click();
    await expect(widget.getByText('No data available yet')).toBeVisible();
    await expect(
      widget.getByRole('button', { name: 'Export to Sheets' })
    ).toBeVisible();
    await expect(
      widget.getByRole('button', { name: 'Open Sheet' })
    ).toHaveCount(0);
    await widget.getByRole('button', { name: 'Back' }).click();
    await expect(row.getByText('Paused', { exact: true })).toBeVisible();
  });

  const stopSharing = async (): Promise<Locator> => {
    await rowMenuItems(page, library);
    await page.getByRole('menuitem', { name: 'Share', exact: true }).click();
    await page
      .getByRole('menu', { name: 'Share' })
      .getByRole('menuitem', { name: `Stop sharing with ${PLC.name}` })
      .click();
    const confirm = page.getByRole('dialog', { name: 'Stop sharing results' });
    await expect(
      confirm.getByText(
        `Stop sharing "${QUIZ}" results with ${PLC.name}? Its responses leave the team's pooled view.`
      )
    ).toBeVisible();
    return confirm;
  };

  await test.step('stop sharing, cancelled then confirmed', async () => {
    const cancelled = await stopSharing();
    await cancelled.getByRole('button', { name: 'Cancel' }).click();
    await expect(cancelled).toBeHidden();
    const confirm = await stopSharing();
    await confirm.getByRole('button', { name: 'Stop sharing' }).click();
    await expectToast(page, `No longer sharing results with ${PLC.name}.`);
    expect(await rowMenuItems(page, library)).toEqual(ROW_MENU);
    await expect(
      page.getByRole('menuitem', { name: 'Share', exact: true })
    ).not.toHaveAttribute('aria-haspopup');
    await closeRowMenu(page, library);
  });
});
