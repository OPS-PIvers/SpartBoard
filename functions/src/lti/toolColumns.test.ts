/* eslint-disable @typescript-eslint/require-await, @typescript-eslint/unbound-method --
   fakes mirror async APIs, and vi.fn spies are asserted through the deps object. */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  CREATE_LEASE_MS,
  MISSING_COMMENT,
  SKIP,
  mergeSectionResults,
  pushSection,
  validateCategoryProposal,
  type ColumnStore,
  type GradeEntry,
  type PushSectionInput,
  type RestOps,
  type ToolColumnDeps,
  type ToolColumnRecord,
} from './toolColumns';
import { schoologySectionUrls, type NewLineItem } from './lineItems';
import type { NrpsMember } from './nrps';
import { AgsRequestError } from './lineItems';

const CTX = '7660186912';
const { lineitemsUrl } = schoologySectionUrls(CTX);
const ITEM = `${lineitemsUrl}/8604205395`;
const LEARNER = 'http://purl.imsglobal.org/vocab/lis/v2/membership#Learner';
const INSTRUCTOR =
  'http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor';

const learner = (
  uid: string,
  email: string,
  status = 'Active'
): NrpsMember => ({
  userId: `${uid}::hash${uid}`,
  givenName: '',
  familyName: '',
  email,
  roles: [LEARNER],
  status,
});

// subUid(sub) = 'su-' + schoology uid, so tests can name keys plainly.
const subUidOf = (sub: string) => `su-${sub.split('::')[0]}`;

class MemoryStore implements ColumnStore {
  records = new Map<string, ToolColumnRecord>();
  claims = new Map<string, number>();
  prefs = new Map<string, string>();
  pushes: Record<string, string>[] = [];
  async get(ctx: string) {
    const r = this.records.get(ctx);
    return r ? structuredClone(r) : null;
  }
  async claimCreate(ctx: string, now: number) {
    const r = this.records.get(ctx);
    if (r) return { state: 'exists' as const, record: structuredClone(r) };
    const lease = this.claims.get(ctx);
    if (lease !== undefined && lease > now) return { state: 'busy' as const };
    this.claims.set(ctx, now + CREATE_LEASE_MS);
    return { state: 'claimed' as const };
  }
  async releaseClaim(ctx: string) {
    this.claims.delete(ctx);
  }
  async save(ctx: string, record: ToolColumnRecord) {
    this.claims.delete(ctx);
    this.records.set(ctx, structuredClone(record));
  }
  async clear(ctx: string) {
    this.records.delete(ctx);
  }
  async recordPush(
    ctx: string,
    lastPushed: Record<string, string>,
    max: number
  ) {
    this.pushes.push(lastPushed);
    const r = this.records.get(ctx);
    if (r) {
      r.lastPushed = { ...r.lastPushed, ...lastPushed };
      r.scoreMaximum = max;
    }
  }
  async setCategoryId(ctx: string, categoryId: string) {
    const r = this.records.get(ctx);
    if (r) r.categoryId = categoryId;
  }
  async getPref(ctx: string) {
    return this.prefs.get(ctx) ?? null;
  }
  async setPref(ctx: string, categoryId: string) {
    this.prefs.set(ctx, categoryId);
  }
}

function makeRest(overrides: Partial<RestOps> = {}): RestOps {
  return {
    listGradingCategories: vi.fn(async () => [
      { id: '111', title: 'Academic Practice', weight: 20 },
      { id: '222', title: 'Academic Achievement', weight: 80 },
    ]),
    createGradingCategories: vi.fn(async () => []),
    setColumnCategory: vi.fn(async () => undefined),
    getColumnCategory: vi.fn(async () => '222'),
    listColumnGrades: vi.fn(async () => []),
    setExceptions: vi.fn(async (_s: string, rows: unknown[]) =>
      rows.map(() => true)
    ),
    listEnrollments: vi.fn(async () => [
      { enrollmentId: 'e1', uid: '1', isAdmin: false },
      { enrollmentId: 'e2', uid: '2', isAdmin: false },
      { enrollmentId: 'e3', uid: '3', isAdmin: false },
      { enrollmentId: 'e9', uid: '9', isAdmin: true },
    ]),
    ...overrides,
  };
}

let store: MemoryStore;
let deps: ToolColumnDeps;
let members: NrpsMember[];

beforeEach(() => {
  store = new MemoryStore();
  members = [
    learner('1', 'a@school.edu'),
    learner('2', 'b@school.edu'),
    learner('3', 'c@school.edu'),
    {
      ...learner('7', 't@school.edu'),
      roles: [INSTRUCTOR],
    },
  ];
  deps = {
    now: () => 1_000_000,
    token: vi.fn(async () => 'tok'),
    listLineItems: vi.fn(async () => []),
    createLineItem: vi.fn(
      async (_u: string, _t: string, item: NewLineItem) => ({
        id: ITEM,
        label: item.label,
        scoreMaximum: item.scoreMaximum,
      })
    ),
    updateLineItemMaximum: vi.fn(async () => 'unchanged' as const),
    postScore: vi.fn(async () => ({
      ok: true,
      status: 200,
      isRedirect: false,
    })),
    nrpsMembers: vi.fn(async () => members),
    subUid: subUidOf,
    bridgeUids: vi.fn(async () => new Map([['su-2', 'cl-bob']])),
    oneRosterUids: vi.fn(async () => new Map([['c@school.edu', 'cl-carol']])),
    rest: makeRest(),
    store,
  };
});

const input = (over: Partial<PushSectionInput> = {}): PushSectionInput => ({
  section: { contextId: CTX, title: 'Bio P2', classlinkClassId: 'class-9' },
  resourceId: 'spartboard:quiz:S1',
  label: 'Cells quiz',
  maxPoints: 10,
  grades: [
    { pseudonymUid: 'su-1', pointsEarned: 8 },
    { pseudonymUid: 'cl-bob', pointsEarned: 12 },
    { pseudonymUid: 'cl-carol', missing: true },
  ],
  create: true,
  categoryId: '222',
  ...over,
});

const posted = () =>
  (deps.postScore as ReturnType<typeof vi.fn>).mock.calls.map(
    (c) => (c[0] as { score: Record<string, unknown> }).score
  );

describe('pushSection: creating the column', () => {
  it('creates once, sets the category, and writes scores and Missing', async () => {
    const out = await pushSection(deps, input());
    expect(out.status).toBe('pushed');
    expect(out.columnCreated).toBe(true);
    expect(deps.createLineItem).toHaveBeenCalledWith(lineitemsUrl, 'tok', {
      label: 'Cells quiz',
      resourceId: 'spartboard:quiz:S1',
      scoreMaximum: 10,
    });
    expect(deps.rest?.setColumnCategory).toHaveBeenCalledWith(
      CTX,
      '8604205395',
      '222'
    );
    expect(store.records.get(CTX)?.categoryId).toBe('222');
    expect(store.prefs.get(CTX)).toBe('222');
    // Direct sub match and bridge match get scores, clamped to the total.
    expect(posted()).toEqual([
      { userId: '1::hash1', scoreGiven: 8, scoreMaximum: 10 },
      { userId: '2::hash2', scoreGiven: 10, scoreMaximum: 10 },
    ]);
    // Email match gets the real Missing flag through REST.
    expect(deps.rest?.setExceptions).toHaveBeenCalledWith(CTX, [
      { columnId: '8604205395', enrollmentId: 'e3', exception: 3 },
    ]);
    expect(out.results.map((r) => r.ok)).toEqual([true, true, true]);
    expect(out.results[2]).toMatchObject({ missing: true });
    expect(store.records.get(CTX)?.lastPushed).toEqual({
      'su-1': 's:8',
      'su-2': 's:10',
      'su-3': 'm',
    });
  });

  it('reuses the column on the next push instead of creating another', async () => {
    await pushSection(deps, input());
    await pushSection(deps, input());
    expect(deps.createLineItem).toHaveBeenCalledTimes(1);
  });

  it('recovers a column a crashed create left behind, by resource id', async () => {
    deps.listLineItems = vi.fn(async () => [
      { id: ITEM, label: 'Cells quiz', scoreMaximum: 9 },
    ]);
    const out = await pushSection(deps, input());
    expect(deps.createLineItem).not.toHaveBeenCalled();
    expect(deps.updateLineItemMaximum).toHaveBeenCalledWith(ITEM, 'tok', 10);
    expect(out.columnCreated).toBe(false);
    expect(store.records.get(CTX)?.lineitemUrl).toBe(ITEM);
  });

  it('is blocked while a parallel create holds the lease', async () => {
    store.claims.set(CTX, 1_000_000 + 5_000);
    const out = await pushSection(deps, input());
    expect(out.status).toBe('busy');
    expect(deps.createLineItem).not.toHaveBeenCalled();
    expect(deps.postScore).not.toHaveBeenCalled();
  });

  it('takes over an expired lease', async () => {
    store.claims.set(CTX, 1_000_000 - 1);
    const out = await pushSection(deps, input());
    expect(out.status).toBe('pushed');
  });

  it('releases the claim when create fails', async () => {
    deps.createLineItem = vi.fn(async () => {
      throw new AgsRequestError('boom', 500, false);
    });
    await expect(pushSection(deps, input())).rejects.toThrow('boom');
    expect(store.claims.has(CTX)).toBe(false);
  });

  it('never creates from Publish = Push', async () => {
    const out = await pushSection(deps, input({ create: false }));
    expect(out.status).toBe('no-column');
    expect(out.results.every((r) => r.reason === SKIP.NO_COLUMN)).toBe(true);
    expect(deps.createLineItem).not.toHaveBeenCalled();
  });

  it('needs a category pick when the course has categories', async () => {
    const out = await pushSection(deps, input({ categoryId: null }));
    expect(out.status).toBe('needs-category');
    expect(out.results.every((r) => r.reason === SKIP.NO_CATEGORY)).toBe(true);
    expect(deps.createLineItem).not.toHaveBeenCalled();
  });

  it('refuses a category that is not in the course', async () => {
    const out = await pushSection(deps, input({ categoryId: '999' }));
    expect(out.status).toBe('needs-category');
  });

  it('skips a course with no categories (the teacher declined to create any)', async () => {
    deps.rest = makeRest({ listGradingCategories: vi.fn(async () => []) });
    const out = await pushSection(deps, input({ categoryId: null }));
    expect(out.status).toBe('needs-category');
  });

  it('fails instead of creating a hidden column when the category list fails', async () => {
    deps.rest = makeRest({
      listGradingCategories: vi.fn(async () => {
        throw new Error('401');
      }),
    });
    await expect(pushSection(deps, input())).rejects.toThrow('401');
    expect(deps.createLineItem).not.toHaveBeenCalled();
    expect(store.claims.has(CTX)).toBe(false);
  });

  it('flags the new column when setting its category fails', async () => {
    deps.rest = makeRest({
      setColumnCategory: vi.fn(async () => {
        throw new Error('500');
      }),
    });
    const out = await pushSection(deps, input());
    expect(out.status).toBe('pushed');
    expect(out.needsCategory).toBe(true);
    expect(store.records.get(CTX)?.categoryId).toBeNull();
  });

  it('holds the create lease longer than four 15 s calls', () => {
    expect(CREATE_LEASE_MS).toBeGreaterThan(4 * 15_000);
  });

  it('creates without a category when REST is not configured', async () => {
    deps.rest = null;
    const out = await pushSection(deps, input({ categoryId: null }));
    expect(out.status).toBe('pushed');
    expect(store.records.get(CTX)?.categoryId).toBeNull();
  });
});

describe('pushSection: an existing column', () => {
  beforeEach(() => {
    store.records.set(CTX, {
      lineitemUrl: ITEM,
      columnId: '8604205395',
      scoreMaximum: 10,
      categoryId: '222',
      lastPushed: { 'su-1': 's:8', 'su-2': 's:10', 'su-3': 'm' },
    });
  });

  it('writes only cells that changed', async () => {
    const out = await pushSection(
      deps,
      input({
        grades: [
          { pseudonymUid: 'su-1', pointsEarned: 8 },
          { pseudonymUid: 'cl-bob', pointsEarned: 7 },
          { pseudonymUid: 'cl-carol', missing: true },
        ],
      })
    );
    expect(posted()).toEqual([
      { userId: '2::hash2', scoreGiven: 7, scoreMaximum: 10 },
    ]);
    expect(deps.rest?.setExceptions).not.toHaveBeenCalled();
    expect(out.results.map((r) => r.reason)).toEqual([
      SKIP.UNCHANGED,
      undefined,
      SKIP.UNCHANGED,
    ]);
    expect(store.pushes).toEqual([{ 'su-2': 's:7' }]);
  });

  it('does not record a failed post, so the next push retries it', async () => {
    deps.postScore = vi.fn(async () => ({
      ok: false,
      status: 503,
      isRedirect: false,
    }));
    const out = await pushSection(
      deps,
      input({ grades: [{ pseudonymUid: 'su-1', pointsEarned: 9 }] })
    );
    expect(out.results[0]).toMatchObject({ ok: false, status: 503 });
    expect(store.records.get(CTX)?.lastPushed['su-1']).toBe('s:8');
  });

  it('keeps the total equal to SpartBoard’s and records it', async () => {
    deps.updateLineItemMaximum = vi.fn(async () => 'updated' as const);
    await pushSection(
      deps,
      input({
        maxPoints: 9,
        grades: [{ pseudonymUid: 'su-1', pointsEarned: 8 }],
      })
    );
    expect(deps.updateLineItemMaximum).toHaveBeenCalledWith(ITEM, 'tok', 9);
    expect(store.records.get(CTX)?.scoreMaximum).toBe(9);
  });

  it('recreates a column the teacher deleted in Schoology', async () => {
    deps.updateLineItemMaximum = vi.fn(async () => 'not-found' as const);
    const out = await pushSection(deps, input());
    expect(deps.createLineItem).toHaveBeenCalledTimes(1);
    expect(out.columnCreated).toBe(true);
    // A new column starts with no history, so every cell is written.
    expect(posted()).toHaveLength(2);
  });

  it('does not recreate a deleted column from Publish = Push', async () => {
    deps.updateLineItemMaximum = vi.fn(async () => 'not-found' as const);
    const out = await pushSection(deps, input({ create: false }));
    expect(out.status).toBe('no-column');
    expect(store.records.has(CTX)).toBe(false);
  });

  it('never moves a column the teacher put in another category', async () => {
    deps.rest = makeRest({ getColumnCategory: vi.fn(async () => '111') });
    await pushSection(deps, input({ categoryId: '222' }));
    expect(deps.rest.setColumnCategory).not.toHaveBeenCalled();
  });

  it('repairs a column left in no category when a category is picked', async () => {
    deps.rest = makeRest({ getColumnCategory: vi.fn(async () => '0') });
    const out = await pushSection(deps, input({ categoryId: '111' }));
    expect(deps.rest.setColumnCategory).toHaveBeenCalledWith(
      CTX,
      '8604205395',
      '111'
    );
    expect(out.needsCategory).toBe(false);
    expect(store.records.get(CTX)?.categoryId).toBe('111');
  });

  it('keeps flagging an uncategorized column while the category read fails', async () => {
    const failing = vi.fn(async (): Promise<string | null> => {
      throw new Error('down');
    });
    deps.rest = makeRest({ getColumnCategory: failing });
    store.records.get(CTX)!.categoryId = null;
    expect((await pushSection(deps, input())).needsCategory).toBe(true);
    store.records.get(CTX)!.categoryId = '222';
    expect((await pushSection(deps, input())).needsCategory).toBe(false);
  });

  it('reports a column in no category when none is picked', async () => {
    deps.rest = makeRest({ getColumnCategory: vi.fn(async () => '0') });
    const out = await pushSection(deps, input({ categoryId: null }));
    expect(out.needsCategory).toBe(true);
    expect(out.status).toBe('pushed');
  });
});

describe('pushSection: Missing', () => {
  const missingOnly = (uid = 'cl-carol'): Partial<PushSectionInput> => ({
    grades: [{ pseudonymUid: uid, missing: true }],
  });

  it('never overwrites a flag the teacher set', async () => {
    deps.rest = makeRest({
      listColumnGrades: vi.fn(async () => [
        { enrollmentId: 'e3', grade: null, exception: 1, comment: '' },
      ]),
    });
    const out = await pushSection(deps, input(missingOnly()));
    expect(out.results[0].reason).toBe(SKIP.FLAGGED);
    expect(deps.rest.setExceptions).not.toHaveBeenCalled();
    expect(deps.postScore).not.toHaveBeenCalled();
  });

  it('never replaces a grade the teacher typed in Schoology', async () => {
    deps.rest = makeRest({
      listColumnGrades: vi.fn(async () => [
        { enrollmentId: 'e3', grade: 6, exception: 0, comment: '' },
      ]),
    });
    const out = await pushSection(deps, input(missingOnly()));
    expect(out.results[0].reason).toBe(SKIP.GRADED_THERE);
  });

  it('replaces a score SpartBoard wrote when the submission is gone', async () => {
    store.records.set(CTX, {
      lineitemUrl: ITEM,
      columnId: '8604205395',
      scoreMaximum: 10,
      categoryId: '222',
      lastPushed: { 'su-3': 's:6' },
    });
    deps.rest = makeRest({
      listColumnGrades: vi.fn(async () => [
        { enrollmentId: 'e3', grade: 6, exception: 0, comment: '' },
      ]),
    });
    const out = await pushSection(deps, input(missingOnly()));
    expect(out.results[0]).toMatchObject({ ok: true, missing: true });
  });

  it('falls back to a Missing comment when REST fails', async () => {
    deps.rest = makeRest({
      setExceptions: vi.fn(async () => {
        throw new Error('down');
      }),
    });
    const out = await pushSection(deps, input(missingOnly()));
    expect(posted()).toEqual([
      { userId: '3::hash3', scoreMaximum: 10, comment: MISSING_COMMENT },
    ]);
    expect(out.results[0]).toMatchObject({
      ok: true,
      missing: true,
      missingComment: true,
    });
    expect(store.records.get(CTX)?.lastPushed['su-3']).toBe('mc');
  });

  it('falls back for a row Schoology refuses', async () => {
    deps.rest = makeRest({ setExceptions: vi.fn(async () => [false]) });
    const out = await pushSection(deps, input(missingOnly()));
    expect(out.results[0].missingComment).toBe(true);
  });

  it('falls back when the sub prefix is not a Schoology uid', async () => {
    members = [{ ...learner('3', 'c@school.edu'), userId: 'abc::x' }];
    deps.subUid = () => 'su-3';
    const out = await pushSection(deps, input(missingOnly()));
    expect(deps.rest?.setExceptions).not.toHaveBeenCalled();
    expect(out.results[0].missingComment).toBe(true);
  });

  it('uses the comment when REST is not configured', async () => {
    deps.rest = null;
    const out = await pushSection(deps, input(missingOnly()));
    expect(out.results[0].missingComment).toBe(true);
  });
});

describe('pushSection: matching', () => {
  it('skips PIN students, strangers, inactive learners and duplicates', async () => {
    members = [
      learner('1', 'a@school.edu'),
      learner('4', 'd@school.edu', 'Inactive'),
    ];
    const grades: GradeEntry[] = [
      { pseudonymUid: 'pin-P1-1234', pointsEarned: 5 },
      { pseudonymUid: 'someone-else', pointsEarned: 5 },
      { pseudonymUid: 'su-4', pointsEarned: 5 },
      { pseudonymUid: 'su-1', pointsEarned: 5 },
      { pseudonymUid: 'su-1', pointsEarned: 6 },
    ];
    deps.bridgeUids = vi.fn(async () => new Map());
    deps.oneRosterUids = vi.fn(async () => new Map([['a@school.edu', 'cl-a']]));
    const out = await pushSection(
      deps,
      input({ grades: [...grades, { pseudonymUid: 'cl-a', pointsEarned: 7 }] })
    );
    expect(out.results.map((r) => r.reason ?? 'ok')).toEqual([
      SKIP.PIN,
      SKIP.NOT_IN_SECTION,
      SKIP.NOT_IN_SECTION,
      'ok',
      // A second response for the same student, by uid or by email, is not posted again.
      SKIP.DUPLICATE,
      SKIP.DUPLICATE,
    ]);
    expect(posted()).toEqual([
      { userId: '1::hash1', scoreGiven: 5, scoreMaximum: 10 },
    ]);
  });

  it('still pushes when the OneRoster lookup fails', async () => {
    deps.oneRosterUids = vi.fn(async () => {
      throw new Error('classlink down');
    });
    const out = await pushSection(
      deps,
      input({ grades: [{ pseudonymUid: 'su-1', pointsEarned: 3 }] })
    );
    expect(out.results[0].ok).toBe(true);
  });
});

describe('mergeSectionResults', () => {
  it('reports each entry from the section it belongs to', () => {
    const grades: GradeEntry[] = [
      { pseudonymUid: 'a', pointsEarned: 1 },
      { pseudonymUid: 'b', pointsEarned: 1 },
      { pseudonymUid: 'c', pointsEarned: 1 },
    ];
    const merged = mergeSectionResults(grades, [
      {
        contextId: '1',
        title: null,
        status: 'pushed',
        columnCreated: false,
        needsCategory: false,
        results: [
          { pseudonymUid: 'a', ok: true },
          { pseudonymUid: 'b', ok: false, reason: SKIP.NOT_IN_SECTION },
          { pseudonymUid: 'c', ok: false, reason: SKIP.NOT_IN_SECTION },
        ],
      },
      {
        contextId: '2',
        title: null,
        status: 'pushed',
        columnCreated: false,
        needsCategory: false,
        results: [
          { pseudonymUid: 'a', ok: false, reason: SKIP.NOT_IN_SECTION },
          { pseudonymUid: 'b', ok: false, status: 503 },
          { pseudonymUid: 'c', ok: false, reason: SKIP.UNCHANGED },
        ],
      },
    ]);
    expect(merged).toEqual([
      { pseudonymUid: 'a', ok: true },
      { pseudonymUid: 'b', ok: false, status: 503 },
      { pseudonymUid: 'c', ok: false, reason: SKIP.UNCHANGED },
    ]);
  });
});

describe('validateCategoryProposal', () => {
  it('accepts named rows totalling 100', () => {
    expect(
      validateCategoryProposal([
        { title: ' Academic Practice ', weight: 20 },
        { title: 'Academic Achievement', weight: 80 },
      ])
    ).toEqual([
      { title: 'Academic Practice', weight: 20 },
      { title: 'Academic Achievement', weight: 80 },
    ]);
  });

  it.each([
    [[]],
    [[{ title: 'A', weight: 90 }]],
    [[{ title: '', weight: 100 }]],
    [
      [
        { title: 'A', weight: 50.5 },
        { title: 'B', weight: 49.5 },
      ],
    ],
    [
      [
        { title: 'A', weight: 50 },
        { title: 'a', weight: 50 },
      ],
    ],
    [
      [
        { title: 'A', weight: -10 },
        { title: 'B', weight: 110 },
      ],
    ],
    ['nope'],
  ])('rejects %j', (raw) => {
    expect(validateCategoryProposal(raw)).toBeNull();
  });
});
