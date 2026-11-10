// Kept scan pages in the paper import (docs/plans/shipped/QUIZ_PAPER_KEPT_PAGES.md §3.1, K12, K17).
import { describe, it, expect, vi } from 'vitest';

vi.mock('./firebaseAdmin', () => ({
  apps: [{ name: '[DEFAULT]' }],
  initializeApp: vi.fn(),
  firestore: Object.assign(vi.fn(), {
    FieldValue: {
      serverTimestamp: () => 'SERVER_TS',
      delete: () => 'DELETE_FIELD',
    },
  }),
}));
vi.mock('firebase-functions/v2/https', () => {
  class FakeHttpsError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  }
  return {
    onCall: (_opts: unknown, handler: unknown) => handler,
    HttpsError: FakeHttpsError,
  };
});
vi.mock('./functionsInit', () => ({}));
vi.mock('./classlinkShared', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./classlinkShared')>()),
  ALLOWED_ORIGINS: [],
}));
vi.mock('./quizMediaArchive', () => ({
  computeHasStuckArchive: (
    archive: Record<string, { archiveStatus?: unknown }>
  ) =>
    Object.values(archive ?? {}).some(
      (e) => e?.archiveStatus === 'failed' || e?.archiveStatus === 'syncing'
    ),
}));

import {
  PAPER_SETTINGS_PATH,
  handleImportPaperResponses,
  parseImportPaperResponsesInput,
  selectKeptPages,
} from './importPaperResponses';

type Doc = Record<string, unknown>;
type Db = Parameters<typeof handleImportPaperResponses>[0];

const isMap = (v: unknown): v is Doc =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** `set(..., { merge: true })`: maps merge, `DELETE_FIELD` removes at any depth. */
function merge(base: Doc, patch: Doc): Doc {
  const out: Doc = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    if (v === 'DELETE_FIELD') delete out[k];
    else out[k] = isMap(v) ? merge(isMap(out[k]) ? out[k] : {}, v) : v;
  }
  return out;
}

function makeDb(docs: Record<string, Doc>) {
  const writes: Array<{ path: string; data: Doc }> = [];
  const apply = (path: string, data: Doc, isMerge: boolean) => {
    writes.push({ path, data });
    docs[path] = isMerge ? merge(docs[path] ?? {}, data) : data;
  };
  const docRef = (path: string): Doc => ({
    path,
    get: () =>
      Promise.resolve({
        exists: docs[path] !== undefined,
        data: () => docs[path],
      }),
    set: (data: Doc, opts?: { merge?: boolean }) => {
      apply(path, data, opts?.merge === true);
      return Promise.resolve();
    },
    collection: (sub: string) => collectionRef(`${path}/${sub}`),
  });
  const collectionRef = (path: string) => ({
    doc: (id: string) => docRef(`${path}/${id}`),
    where: (field: string, _op: string, value: unknown) => ({
      count: () => ({
        get: () =>
          Promise.resolve({
            data: () => ({
              count: Object.entries(docs).filter(
                ([p, d]) =>
                  p.startsWith(`${path}/`) &&
                  !p.slice(path.length + 1).includes('/') &&
                  d[field] === value
              ).length,
            }),
          }),
      }),
    }),
  });
  type Ref = { path: string; get: () => Promise<unknown> };
  const db = {
    doc: (path: string) => docRef(path),
    collection: (c: string) => collectionRef(c),
    runTransaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      const staged: Array<() => void> = [];
      const tx = {
        get: (ref: Ref) => ref.get(),
        getAll: (...refs: Ref[]) => Promise.all(refs.map((r) => r.get())),
        set: (ref: Ref, data: Doc, opts?: { merge?: boolean }) => {
          staged.push(() => apply(ref.path, data, opts?.merge === true));
        },
        create: (ref: Ref, data: Doc) => {
          staged.push(() => apply(ref.path, data, false));
        },
      };
      const result = await fn(tx);
      staged.forEach((s) => s());
      return result;
    },
  } as unknown as Db;
  return { db, writes };
}

const NOW = Date.UTC(2026, 10, 9, 15, 0, 0);
const UID = 'teacher-1';
const ASSIGNMENT = 'a1';
const BATCH = 'b1';
const SCAN = 'scan-2';
const teacher = { uid: UID, studentRole: false, anonymous: false };
const RESP1 = `quiz_sessions/${ASSIGNMENT}/responses/pin-period_1-0001`;
const RESP2 = `quiz_sessions/${ASSIGNMENT}/responses/pin-period_1-0002`;
const LOOKUP = `users/${UID}/paper_page_scans/${SCAN}`;

const baseDocs = (): Record<string, Doc> => ({
  [PAPER_SETTINGS_PATH]: { enabled: true },
  [`users/${UID}/quiz_assignments/${ASSIGNMENT}`]: { quizId: 'quiz-1' },
  [`quiz_sessions/${ASSIGNMENT}`]: {
    teacherUid: UID,
    publicQuestions: [{ id: 'q1' }],
  },
  [`users/${UID}/paper_batches/${BATCH}`]: {
    quizId: 'quiz-1',
    seats: { 1: { rosterId: 'r1' }, 2: { rosterId: 'r1' } },
    keySheetSeat: 4,
  },
  [`users/${UID}/rosters/r1`]: { name: 'Period 1' },
});

const sheet = (seat: number) => ({
  seat,
  rosterId: 'r1',
  pin: String(seat).padStart(4, '0'),
  classPeriod: 'Period 1',
  answers: [{ questionId: 'q1', answer: 'B' }],
});

const pagePath = (seat: number, page: number, uid = UID, scan = SCAN) =>
  `paper_pages/${uid}/${scan}/${seat}/${page}.webp`;
const entry = (seat: number, page: number, over: Doc = {}) => ({
  seat,
  page,
  storagePath: pagePath(seat, page),
  ...over,
});
const artifact = (page: number, seat = 1, scan = SCAN) => ({
  id: `pg_${scan}_${page}`,
  slot: 'primary',
  kind: 'paper-page',
  storagePath: pagePath(seat, page, UID, scan),
  mimeType: 'image/webp',
  uploadState: 'uploaded',
});

async function importWith(
  docs: Record<string, Doc>,
  extra: Doc,
  { granted = true, sheets = [sheet(1), sheet(2)] } = {}
) {
  const { db, writes } = makeDb(docs);
  const gate = vi.fn(() => Promise.resolve(granted));
  const result = await handleImportPaperResponses(
    db,
    teacher,
    { batchId: BATCH, assignmentId: ASSIGNMENT, sheets, ...extra },
    NOW,
    () => Promise.resolve(true),
    gate
  );
  return { result, docs, writes, gate };
}

describe('kept pages: validation', () => {
  const scope = {
    uid: UID,
    scanId: SCAN,
    seats: new Set([1, 2]),
    keySheetSeat: 4,
  };

  it('keeps only paths rebuilt from the caller, the scan and the seat', () => {
    const { bySeat, dropped } = selectKeptPages(
      [
        entry(1, 2),
        entry(1, 1),
        entry(2, 1, { mimeType: 'image/png' }),
        entry(1, 3, { storagePath: pagePath(1, 3, 'someone-else') }),
        entry(1, 4, { storagePath: pagePath(1, 4, UID, 'other-scan') }),
        entry(1, 5, { storagePath: pagePath(2, 5) }),
        entry(1, 6, { storagePath: `${pagePath(1, 6)}/../../x` }),
      ],
      scope
    );
    expect(dropped).toBe(4);
    expect(bySeat.get(1)?.map((p) => p.page)).toEqual([1, 2]);
    expect(bySeat.get(2)).toEqual([
      { seat: 2, page: 1, storagePath: pagePath(2, 1), mimeType: 'image/png' },
    ]);
  });

  it('drops a seat outside this chunk, the key sheet, repeats and non-integers', () => {
    const { bySeat, dropped } = selectKeptPages(
      [
        entry(3, 1),
        { ...entry(4, 1), storagePath: pagePath(4, 1) },
        entry(1, 1),
        entry(1, 1),
        entry(1.5, 1, { storagePath: pagePath(1.5, 1) }),
        entry(1, 2.5, { storagePath: pagePath(1, 2.5) }),
        { seat: '1', page: 1, storagePath: pagePath(1, 1) },
        entry(1, 0),
        entry(1, 64),
        entry(1, 7, { mimeType: 'image/jpeg' }),
        null,
        'paper_pages/x',
      ],
      { ...scope, seats: new Set([1, 2, 4]) }
    );
    expect(dropped).toBe(11);
    expect([...bySeat.keys()]).toEqual([1]);
    expect(bySeat.get(1)).toHaveLength(1);
  });

  it('caps one call at 2000 entries', () => {
    const many = Array.from({ length: 2005 }, () => entry(1, 1));
    expect(selectKeptPages(many, scope).dropped).toBe(2004);
  });

  it('reads scanId beside pages without layoutVersion, and only then', () => {
    const base = {
      batchId: BATCH,
      assignmentId: ASSIGNMENT,
      sheets: [sheet(1)],
    };
    expect(
      parseImportPaperResponsesInput({ ...base, scanId: SCAN, pages: [] })
    ).toMatchObject({ scanId: SCAN, pages: [] });
    const without = parseImportPaperResponsesInput({ ...base, scanId: SCAN });
    expect(without).not.toHaveProperty('scanId');
    expect(without).not.toHaveProperty('pages');
    expect(
      parseImportPaperResponsesInput({ ...base, scanId: 'bad/id', pages: [] })
    ).not.toHaveProperty('scanId');
  });
});

describe('kept pages: recording', () => {
  it('records valid pages on each response with the crop upload state, and a lookup per seat', async () => {
    const { result, docs } = await importWith(baseDocs(), {
      scanId: SCAN,
      pages: [entry(1, 1), entry(1, 2), entry(2, 1), entry(9, 1)],
    });
    expect(result).toEqual({
      written: [1, 2],
      collisions: [],
      keptPages: { recorded: 3, dropped: 1 },
    });
    expect(docs[RESP1].paperPages).toEqual([artifact(1), artifact(2)]);
    expect(docs[RESP2].paperPages).toEqual([artifact(1, 2)]);
    expect(docs[LOOKUP]).toEqual({
      seats: {
        1: { sessionId: ASSIGNMENT, responseKey: 'pin-period_1-0001' },
        2: { sessionId: ASSIGNMENT, responseKey: 'pin-period_1-0002' },
      },
      updatedAt: NOW,
    });
  });

  it('never records a page on a seat that collided', async () => {
    const docs = baseDocs();
    docs[RESP1] = { studentUid: 'device', submittedAt: 5, answers: [] };
    const { result } = await importWith(docs, {
      scanId: SCAN,
      pages: [entry(1, 1), entry(2, 1)],
    });
    expect(result.collisions.map((c) => c.seat)).toEqual([1]);
    expect(result.keptPages).toEqual({ recorded: 1, dropped: 0 });
    expect(docs[RESP1]).not.toHaveProperty('paperPages');
  });

  it('ignores pages entirely when the caller lacks the flag', async () => {
    const flagOff = await importWith(
      baseDocs(),
      {
        scanId: SCAN,
        pages: [entry(1, 1)],
      },
      { granted: false }
    );
    const plain = await importWith(baseDocs(), {});
    expect(flagOff.result).toEqual({ written: [1, 2], collisions: [] });
    expect(flagOff.docs).toEqual(plain.docs);
    expect(flagOff.writes).toEqual(plain.writes);
  });

  it('takes today’s path for a payload without pages on a response that never had any', async () => {
    const docs = baseDocs();
    docs[RESP1] = {
      studentUid: 'pin-period_1-0001',
      paperBatchId: BATCH,
      answers: [],
      artifactArchive: { hw_x: { archiveStatus: 'failed' } },
      hasStuckArchive: true,
    };
    const { result, writes, gate } = await importWith(docs, { scanId: SCAN });
    expect(gate).not.toHaveBeenCalled();
    expect(result).toEqual({ written: [1, 2], collisions: [] });
    expect(writes.some((w) => w.path === LOOKUP)).toBe(false);
    for (const w of writes) {
      expect(w.data).not.toHaveProperty('paperPages');
      expect(w.data).not.toHaveProperty('artifactArchive');
      expect(w.data).not.toHaveProperty('hasStuckArchive');
    }
  });

  // A page left behind would print the new answers' marks on an older scan.
  const priorPages = (): Doc => ({
    studentUid: 'pin-period_1-0001',
    paperBatchId: BATCH,
    answers: [],
    paperPages: [artifact(1, 1, 'scan-1'), artifact(2, 1, 'scan-1')],
    artifactArchive: {
      'pg_scan-1_1': { archiveStatus: 'archived', driveFileId: 'd1' },
      'pg_scan-1_2': { archiveStatus: 'awaiting-drive' },
    },
  });
  const expectCleared = (doc: Doc) => {
    expect(doc).not.toHaveProperty('paperPages');
    expect(doc.artifactArchive).toEqual({
      'pg_scan-1_1': { archiveStatus: 'archived', driveFileId: 'd1' },
    });
    expect(doc.hasStuckArchive).toBe(false);
  };

  it('clears a seat’s older pages when a rescan arrives without pages', async () => {
    const docs = baseDocs();
    docs[RESP1] = priorPages();
    const { gate } = await importWith(docs, { scanId: SCAN });
    expect(gate).not.toHaveBeenCalled();
    expectCleared(docs[RESP1]);
  });

  it('pages-on import, then a pages-off rescan, leaves no page', async () => {
    const docs = baseDocs();
    await importWith(docs, {
      scanId: 'scan-1',
      pages: [entry(1, 1, { storagePath: pagePath(1, 1, UID, 'scan-1') })],
    });
    expect(docs[RESP1].paperPages).toEqual([artifact(1, 1, 'scan-1')]);
    await importWith(docs, { scanId: SCAN });
    expect(docs[RESP1]).not.toHaveProperty('paperPages');
  });

  it('clears a seat’s older pages when the caller lacks the flag', async () => {
    const docs = baseDocs();
    docs[RESP1] = priorPages();
    await importWith(
      docs,
      { scanId: SCAN, pages: [entry(1, 1)] },
      { granted: false }
    );
    expectCleared(docs[RESP1]);
  });

  it('records nothing and clears older pages without a usable scan id', async () => {
    const docs = baseDocs();
    docs[RESP1] = priorPages();
    const { result } = await importWith(docs, { pages: [entry(1, 1)] });
    expect(result.keptPages).toEqual({ recorded: 0, dropped: 1 });
    expectCleared(docs[RESP1]);
    expect(docs[LOOKUP]).toBeUndefined();
  });

  it('K12: a rescan replaces the older pages and drops their pending archive entries, keeping Drive copies', async () => {
    const docs = baseDocs();
    docs[RESP1] = {
      paperBatchId: BATCH,
      answers: [],
      paperPages: [artifact(1, 1, 'scan-1'), artifact(2, 1, 'scan-1')],
      artifactArchive: {
        'pg_scan-1_1': { archiveStatus: 'archived', driveFileId: 'd1' },
        'pg_scan-1_2': { archiveStatus: 'failed', attemptCount: 1 },
        hw_other: { archiveStatus: 'awaiting-drive' },
      },
      hasStuckArchive: true,
    };
    await importWith(docs, { scanId: SCAN, pages: [entry(1, 1)] });
    expect(docs[RESP1].paperPages).toEqual([artifact(1)]);
    expect(docs[RESP1].artifactArchive).toEqual({
      'pg_scan-1_1': { archiveStatus: 'archived', driveFileId: 'd1' },
      hw_other: { archiveStatus: 'awaiting-drive' },
    });
    expect(docs[RESP1].hasStuckArchive).toBe(false);
  });

  it('K12: a rescan with no page for a seat clears that seat’s older pages', async () => {
    const docs = baseDocs();
    docs[RESP1] = {
      paperBatchId: BATCH,
      answers: [],
      paperPages: [artifact(1, 1, 'scan-1')],
    };
    await importWith(docs, { scanId: SCAN, pages: [entry(2, 1)] });
    expect(docs[RESP1]).not.toHaveProperty('paperPages');
    expect(docs[LOOKUP].seats).toEqual({
      2: { sessionId: ASSIGNMENT, responseKey: 'pin-period_1-0002' },
    });
  });

  it('a replay of the same scan leaves an archived page’s bookkeeping alone', async () => {
    const docs = baseDocs();
    docs[RESP1] = {
      paperBatchId: BATCH,
      answers: [],
      paperPages: [artifact(1)],
      artifactArchive: {
        [`pg_${SCAN}_1`]: { archiveStatus: 'archived', driveFileId: 'd1' },
      },
    };
    await importWith(docs, { scanId: SCAN, pages: [entry(1, 1)] });
    expect(docs[RESP1].paperPages).toEqual([artifact(1)]);
    expect(docs[RESP1].artifactArchive).toEqual({
      [`pg_${SCAN}_1`]: { archiveStatus: 'archived', driveFileId: 'd1' },
    });
  });

  it('attaches pages to the device response a hybrid stack merges into', async () => {
    const docs = baseDocs();
    docs[`users/${UID}/quiz_assignments/${ASSIGNMENT}`] = {
      quizId: 'quiz-1',
      writtenOnPaper: true,
      paperBatchId: BATCH,
    };
    docs[RESP1] = {
      studentUid: 'device-student',
      status: 'completed',
      answers: [{ questionId: 'q1', answer: 'A' }],
      paperPages: [{ id: 'forged', kind: 'paper-page', storagePath: 'x' }],
    };
    const { result } = await importWith(
      docs,
      { scanId: SCAN, pages: [entry(1, 1)] },
      { sheets: [{ ...sheet(1), answers: [] }] }
    );
    expect(result.collisions).toEqual([]);
    expect(docs[RESP1]).toMatchObject({
      studentUid: 'device-student',
      status: 'completed',
      paperWrittenSeat: 1,
      paperPages: [artifact(1)],
    });
  });
});
