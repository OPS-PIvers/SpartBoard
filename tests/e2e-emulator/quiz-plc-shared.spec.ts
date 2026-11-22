import {
  test,
  expect,
  type APIRequestContext,
  type Locator,
  type Page,
} from '@playwright/test';
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
// A seeded team reaches the PLC picker, the Sharing step and Share results; exporting the team's Google Sheet stays out of reach.
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

const ADMIN = 'http://127.0.0.1:8080/v1';
const TEAMMATE = { uid: 'teammate-e2e', email: 'teammate@example.com' };
const seededPlcs: string[] = [];

const member = (uid: string, email: string, role: 'lead' | 'member') => ({
  mapValue: {
    fields: {
      uid: { stringValue: uid },
      email: { stringValue: email },
      displayName: { stringValue: email.split('@')[0] },
      role: { stringValue: role },
      status: { stringValue: 'active' },
      joinedAt: { timestampValue: new Date().toISOString() },
    },
  },
});

// Under the emulators the mock teacher is an anonymous Auth user; read its uid from the page's Auth store.
const signedInUid = (page: Page): Promise<string> =>
  page.evaluate(
    () =>
      new Promise<string>((resolve, reject) => {
        const open = indexedDB.open('firebaseLocalStorageDb');
        open.onerror = () => reject(new Error(String(open.error)));
        open.onsuccess = () => {
          const rows = open.result
            .transaction('firebaseLocalStorage')
            .objectStore('firebaseLocalStorage')
            .getAll();
          rows.onsuccess = () => {
            const row = (
              rows.result as { fbase_key: string; value: { uid: string } }[]
            ).find((r) => r.fbase_key.startsWith('firebase:authUser:'));
            if (row) resolve(row.value.uid);
            else reject(new Error('No signed-in Auth user yet'));
          };
        };
      })
  );

// Seeds a team the teacher leads, shaped like createPlc's write plus one teammate.
const seedPlc = async (
  page: Page,
  request: APIRequestContext
): Promise<void> => {
  let uid = '';
  await expect
    .poll(async () => (uid = await signedInUid(page).catch(() => '')))
    .not.toBe('');
  const id = `plc-e2e-${crypto.randomUUID()}`;
  const now = { timestampValue: new Date().toISOString() };
  const res = await request.post(`${FIRESTORE}/plcs?documentId=${id}`, {
    headers: OWNER,
    data: {
      fields: {
        name: { stringValue: PLC.name },
        leadUid: { stringValue: uid },
        memberUids: {
          arrayValue: {
            values: [{ stringValue: uid }, { stringValue: TEAMMATE.uid }],
          },
        },
        memberEmails: {
          mapValue: {
            fields: {
              [uid]: { stringValue: 'mock@example.com' },
              [TEAMMATE.uid]: { stringValue: TEAMMATE.email },
            },
          },
        },
        members: {
          mapValue: {
            fields: {
              [uid]: member(uid, 'mock@example.com', 'lead'),
              [TEAMMATE.uid]: member(TEAMMATE.uid, TEAMMATE.email, 'member'),
            },
          },
        },
        createdAt: now,
        updatedAt: now,
      },
    },
  });
  expect(res.ok()).toBe(true);
  seededPlcs.push(`${FIRESTORE.slice(ADMIN.length + 1)}/plcs/${id}`);
};

// Deletes a document and everything under it, so the seeded team never reaches another test.
const deleteTree = async (
  request: APIRequestContext,
  name: string
): Promise<void> => {
  const listed = await request.post(`${ADMIN}/${name}:listCollectionIds`, {
    headers: OWNER,
    data: {},
  });
  const { collectionIds = [] } = (await listed.json()) as {
    collectionIds?: string[];
  };
  for (const collectionId of collectionIds) {
    const docs = await request.get(
      `${ADMIN}/${name}/${collectionId}?pageSize=300&showMissing=true`,
      { headers: OWNER }
    );
    const { documents = [] } = (await docs.json()) as {
      documents?: { name: string }[];
    };
    for (const d of documents) await deleteTree(request, d.name);
  }
  const deleted = await request.delete(`${ADMIN}/${name}`, { headers: OWNER });
  expect(deleted.ok()).toBe(true);
};

test.afterEach(async ({ request }) => {
  for (const name of seededPlcs.splice(0)) await deleteTree(request, name);
});

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
    await expect(stepper.getByRole('button', { name: /sharing/i })).toHaveCount(
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

test('a teacher in a PLC shares a quiz with the team', async ({
  page,
  request,
}) => {
  await seedPlc(page, request);
  // Reload so the team is there from the board's first PLC read.
  await openBoard(page);
  const library = await addQuizWidget(page);
  await expect(
    library.getByRole('tabpanel').getByText('No Quizzes Yet')
  ).toBeVisible();
  const title = 'Team decimals check';
  await createQuiz(page, title);
  await rowMenuItems(page, library);
  await page.getByRole('menuitem', { name: 'Share', exact: true }).click();
  await page
    .getByRole('menu', { name: 'Share' })
    .getByRole('menuitem', { name: 'Share with PLC' })
    .click();
  const picker = page.getByRole('dialog', {
    name: 'Pick a team to share with',
  });
  await expect(
    picker.getByRole('heading', { name: 'Share with team' })
  ).toBeVisible();
  await expect(picker.getByText(title)).toBeVisible();
  await expect(picker.getByRole('radio', { name: PLC.name })).toBeChecked();
  await expect(picker.getByText(/^2 members$/i)).toBeVisible();
  await picker.getByRole('button', { name: 'Share', exact: true }).click();
  await expect(picker).toBeHidden();
  await expectToast(page, `Shared with ${PLC.name}.`);
  await expect(
    library.getByRole('tabpanel').getByText('Synced', { exact: true })
  ).toBeVisible();
});

const assignTo = async (
  page: Page,
  library: Locator,
  title: string,
  share: boolean
): Promise<void> => {
  await createQuiz(page, title);
  await library.getByRole('button', { name: 'Assign', exact: true }).click();
  const stepper = page.getByRole('dialog', { name: title });
  // A sole PLC is picked by default; the last step holds it beside raise a hand.
  const sharing = stepper.getByRole('button', {
    name: /^\d+ Additional settings and sharing/,
  });
  await expect(sharing).toHaveText(
    new RegExp(`sharing\\s*Shared with ${PLC.name}$`)
  );
  await sharing.click();
  const toggle = stepper.getByRole('switch', {
    name: `Share results with ${PLC.name}`,
  });
  await expect(toggle).toBeChecked();
  if (!share) {
    await toggle.click();
    await expect(toggle).not.toBeChecked();
  }
  await stepper.getByRole('button', { name: /^1 Classes/ }).click();
  await expect(sharing).toHaveText(
    share
      ? new RegExp(`sharing\\s*Shared with ${PLC.name}$`)
      : /sharing\s*Not shared$/
  );
  await stepper.getByRole('checkbox', { name: /Period 1/ }).check();
  await stepper.getByRole('button', { name: 'Assign', exact: true }).click();
  await expect(stepper).toBeHidden();
  await expectToast(
    page,
    'Student link copied — press Play when you’re ready to start.'
  );
  await expect(
    library.getByRole('tabpanel').getByText('Paused', { exact: true })
  ).toBeVisible();
};

// Opens the row's Share submenu and checks its items.
const expectShareItems = async (
  page: Page,
  library: Locator,
  items: string[]
): Promise<void> => {
  expect(await rowMenuItems(page, library)).toEqual(ROW_MENU);
  const shareItem = page.getByRole('menuitem', { name: 'Share', exact: true });
  await expect(shareItem).toHaveAttribute('aria-haspopup', 'menu');
  await shareItem.click();
  await expect(
    page.getByRole('menu', { name: 'Share' }).getByRole('menuitem')
  ).toHaveText(items);
};

test('the assign flow shares a new assignment with a sole PLC by default', async ({
  page,
  request,
}) => {
  await seedPlc(page, request);
  // Reload so the team is there from the board's first PLC read.
  await openBoard(page);
  await createClass(page, 'Period 1');
  const library = await addQuizWidget(page);
  await assignTo(page, library, 'Team area check', true);
  await expectShareItems(page, library, [
    'Get link',
    `Stop sharing with ${PLC.name}`,
  ]);
  await closeRowMenu(page, library);
});

test('a teacher pools an unshared assignment’s results with their PLC', async ({
  page,
  request,
}) => {
  await seedPlc(page, request);
  // Reload so the team is there from the board's first PLC read.
  await openBoard(page);
  await createClass(page, 'Period 1');
  const library = await addQuizWidget(page);
  const title = 'Team volume check';
  await assignTo(page, library, title, false);
  await expectShareItems(page, library, [
    'Get link',
    'Share results with PLC…',
  ]);
  await page
    .getByRole('menu', { name: 'Share' })
    .getByRole('menuitem', { name: 'Share results with PLC…' })
    .click();
  const dialog = page.getByRole('dialog', { name: 'Share results with PLC' });
  await expect(dialog.getByText(title, { exact: true })).toBeVisible();
  const submit = dialog.getByRole('button', { name: 'Share results' });
  await expect(submit).toBeDisabled();
  await dialog
    .getByRole('radio', { name: `Create new pool: ${title}` })
    .check();
  await submit.click();
  await expect(dialog).toBeHidden();
  await expectToast(page, `Results now pool with ${PLC.name}.`);
  await expectShareItems(page, library, [
    'Get link',
    `Stop sharing with ${PLC.name}`,
  ]);
  await closeRowMenu(page, library);
});
