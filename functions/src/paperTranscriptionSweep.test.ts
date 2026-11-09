import { describe, it, expect, vi } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import { makeStubFirestore, type StubData } from './testing/stubFirestore';

vi.mock('./firebaseAdmin', () => ({
  apps: [{ name: '[DEFAULT]' }],
  initializeApp: vi.fn(),
  firestore: Object.assign(vi.fn(), {
    FieldValue: { serverTimestamp: () => 'ts' },
  }),
}));
vi.mock('./functionsInit', () => ({}));
vi.mock('./classlinkShared', () => ({ ALLOWED_ORIGINS: [] }));
vi.mock('./quizMediaArchive', () => ({
  archiveQuizArtifactCore: vi.fn(),
  buildDefaultArchiveDeps: vi.fn(),
  retryStorageCleanup: vi.fn(),
  computeHasStuckArchive: (
    archive: Record<string, { archiveStatus?: unknown }>
  ) => Object.values(archive).some((e) => e?.archiveStatus === 'failed'),
  QUIZ_MEDIA_ARCHIVE_SECRETS: [],
}));
vi.mock('firebase-functions/v2/scheduler', () => ({
  onSchedule: (_opts: unknown, handler: unknown) => handler,
}));
vi.mock('firebase-functions/v2/firestore', () => ({
  onDocumentCreated: (_opts: unknown, handler: unknown) => handler,
}));
vi.mock('firebase-functions/v2/https', () => ({
  onCall: (_opts: unknown, handler: unknown) => handler,
  HttpsError: class extends Error {},
}));

import {
  AWAITING_DRIVE_HOLD_MS,
  JOB_QUERY_LIMIT,
  buildExpiryWarningEmail,
  parseCropPath,
  parsePagePath,
  runPaperCropSweep,
  runPaperJobSweep,
  type CropSweepDeps,
  type ListedCrop,
} from './paperTranscriptionSweep';

const NOW = Date.parse('2026-09-25T15:00:00Z');
const DAY = 24 * 60 * 60 * 1000;
const SESSION = 'quiz_sessions/s1';
const RESPONSE = `${SESSION}/responses/r1`;
const JOBS = 'users/t1/paper_transcription_jobs';
const crop = (q: string, scan = 'scan1', seat = 3) =>
  `paper_written_crops/t1/${scan}/${seat}/${q}.webp`;

function job(overrides: StubData = {}): StubData {
  return {
    sessionId: 's1',
    responseKey: 'r1',
    scanId: 'scan1',
    page: 1,
    boxes: [{ questionId: 'q1', storagePath: crop('q1') }],
    status: 'queued',
    attempt: 0,
    charged: false,
    createdAt: NOW - 1000,
    updatedAt: NOW - 1000,
    ...overrides,
  };
}

function response(archive: StubData = {}, scan = 'scan1'): StubData {
  return {
    studentUid: 'p1',
    answers: [
      {
        questionId: 'q1',
        answer: '',
        paperScanId: scan,
        paperTranscript: 'pending',
        artifacts: [
          {
            id: `hw_${scan}_q1`,
            kind: 'handwriting',
            storagePath: crop('q1', scan),
          },
        ],
      },
    ],
    artifactArchive: archive,
  };
}

const privateDoc = (status = 'pending', extra: StubData = {}) => ({
  [`${RESPONSE}/paperPrivate/q1`]: {
    scanId: 'scan1',
    status,
    attempts: 0,
    charged: false,
    updatedAt: 1,
    ...extra,
  },
});

function base(extra: Record<string, StubData> = {}) {
  return makeStubFirestore({
    [SESSION]: { teacherUid: 't1', quizTitle: 'Cells' },
    [RESPONSE]: response(),
    ...privateDoc(),
    ...extra,
  });
}

describe('runPaperJobSweep', () => {
  const run = (stub: ReturnType<typeof base>, isAdmin = false) =>
    runPaperJobSweep({
      db: stub.db as unknown as Firestore,
      now: () => NOW,
      isAdmin: () => Promise.resolve(isAdmin),
    });

  it('re-queues a run whose lease ran out, not one still leased', async () => {
    const s = base({
      [`${JOBS}/scan1_3_1_0`]: job({
        status: 'running',
        leaseUntil: NOW - 1,
      }),
      [`${JOBS}/scan1_3_2_0`]: job({
        page: 2,
        status: 'running',
        leaseUntil: NOW + 60_000,
      }),
    });
    const summary = await run(s);
    expect(summary).toMatchObject({ stuckRunning: 1, requeued: 1 });
    expect(s.get(`${JOBS}/scan1_3_1_1`)).toMatchObject({ status: 'queued' });
    expect(s.get(`${JOBS}/scan1_3_2_0`)).toMatchObject({ status: 'running' });
  });

  it('re-queues a queued job whose trigger never ran', async () => {
    const s = base({
      [`${JOBS}/scan1_3_1_0`]: job({ createdAt: NOW - 60 * 60 * 1000 }),
      [`${JOBS}/scan1_3_2_0`]: job({ page: 2 }),
    });
    expect(await run(s)).toMatchObject({ stuckQueued: 1, requeued: 1 });
    expect(s.has(`${JOBS}/scan1_3_2_1`)).toBe(false);
  });

  it('retries recent failures up to the automatic cap', async () => {
    const s = base({
      [`${JOBS}/scan1_3_1_0`]: job({
        status: 'failed',
        updatedAt: NOW - 60 * 60 * 1000,
      }),
      [`${JOBS}/scan1_3_2_3`]: job({
        page: 2,
        status: 'failed',
        attempt: 3,
        updatedAt: NOW - 60 * 60 * 1000,
      }),
      [`${JOBS}/scan1_3_3_0`]: job({
        page: 3,
        status: 'failed',
        updatedAt: NOW - 2 * DAY,
      }),
      [`${JOBS}/scan1_3_4_0`]: job({
        page: 4,
        status: 'failed',
        updatedAt: NOW - 60 * 1000,
      }),
    });
    expect(await run(s)).toMatchObject({ failed: 2, requeued: 1, skipped: 1 });
    expect(s.has(`${JOBS}/scan1_3_1_1`)).toBe(true);
    expect(s.has(`${JOBS}/scan1_3_2_4`)).toBe(false);
  });

  it('re-queues yesterday’s over-quota pages only while pages are left today', async () => {
    const overQuota = {
      [`${JOBS}/scan1_3_1_0`]: job({
        status: 'over-quota',
        updatedAt: NOW - DAY,
      }),
      [`${JOBS}/scan1_3_2_0`]: job({
        page: 2,
        status: 'over-quota',
        updatedAt: NOW - 60 * 1000,
      }),
    };
    const spent = base({
      ...overQuota,
      'ai_usage/t1_paper-handwritten-responses_2026-09-25': { count: 300 },
    });
    expect(await run(spent)).toMatchObject({ overQuota: 1, requeued: 0 });

    const fresh = base(overQuota);
    expect(await run(fresh)).toMatchObject({ overQuota: 1, requeued: 1 });
    expect(fresh.has(`${JOBS}/scan1_3_1_1`)).toBe(true);
    expect(fresh.has(`${JOBS}/scan1_3_2_1`)).toBe(false);
  });
});

describe('runPaperJobSweep backlog', () => {
  it('reaches an over-quota job queued behind a spent-quota backlog larger than one page', async () => {
    const seed: Record<string, StubData> = {};
    for (let i = 0; i < JOB_QUERY_LIMIT + 5; i++) {
      seed[`users/spent/paper_transcription_jobs/scan1_3_${i}_0`] = job({
        page: i,
        status: 'over-quota',
        updatedAt: NOW - 2 * DAY,
      });
    }
    seed['ai_usage/spent_paper-handwritten-responses_2026-09-25'] = {
      count: 300,
    };
    seed[`${JOBS}/scan1_3_1_0`] = job({
      status: 'over-quota',
      updatedAt: NOW - DAY,
    });
    const s = base(seed);
    const summary = await runPaperJobSweep({
      db: s.db as unknown as Firestore,
      now: () => NOW,
      isAdmin: () => Promise.resolve(false),
    });
    expect(summary.requeued).toBe(1);
    expect(s.has(`${JOBS}/scan1_3_1_1`)).toBe(true);
  });
});

describe('runPaperCropSweep', () => {
  function setup(
    extra: Record<string, StubData>,
    crops: ListedCrop[],
    over: Partial<CropSweepDeps> = {}
  ) {
    const stub = base(extra);
    const deleted: string[] = [];
    const archive = vi.fn(() =>
      Promise.resolve({ archiveStatus: 'awaiting-drive' as const })
    );
    const deps: CropSweepDeps = {
      db: stub.db as unknown as Firestore,
      now: () => NOW,
      listCrops: () => Promise.resolve({ crops }),
      deleteCrop: (path) => {
        deleted.push(path);
        return Promise.resolve();
      },
      archive,
      getTeacherEmail: () => Promise.resolve('teacher@example.org'),
      ...over,
    };
    return { ...stub, deps, deleted, archive };
  }
  const old = (path: string, age = 8 * DAY): ListedCrop => ({
    path,
    createdMs: NOW - age,
  });

  it('removes crops of a scan that was never imported after 7 days', async () => {
    const s = setup({}, [
      old('paper_written_crops/t1/scanX/1/q1.webp'),
      old('paper_written_crops/t1/scanY/1/q1.webp', DAY),
    ]);
    const summary = await runPaperCropSweep(s.deps);
    expect(summary.unimportedDeleted).toBe(1);
    expect(s.deleted).toEqual(['paper_written_crops/t1/scanX/1/q1.webp']);
  });

  it('removes a crop its answer no longer points at, keeping newer-scan crops', async () => {
    const s = setup(
      {
        [RESPONSE]: response({}, 'scan2'),
        ...privateDoc('done', {
          scanId: 'scan2',
          newerScan: { scanId: 'scan3', page: 1, state: 'ink' },
        }),
        [`${JOBS}/scan1_3_1_0`]: job({ status: 'done' }),
        [`${JOBS}/scan3_3_1_0`]: job({ scanId: 'scan3', status: 'done' }),
      },
      [old(crop('q1', 'scan1')), old(crop('q1', 'scan3'))]
    );
    const summary = await runPaperCropSweep(s.deps);
    expect(summary.staleDeleted).toBe(1);
    expect(s.deleted).toEqual([crop('q1', 'scan1')]);
  });

  it('removes a crop for a seat with no job unless a kept answer points at it', async () => {
    const s = setup(
      {
        [`${JOBS}/scan1_3_1_0`]: job({ status: 'done' }),
        'quiz_sessions/s1/responses/r2/paperPrivate/q1': {
          scanId: 'scan0',
          status: 'done',
          newerScan: { scanId: 'scan1', page: 1, state: 'ink' },
        },
      },
      [old(crop('q1', 'scan1', 5)), old(crop('q2', 'scan1', 5))]
    );
    expect(await runPaperCropSweep(s.deps)).toMatchObject({
      unimportedDeleted: 1,
    });
    expect(s.deleted).toEqual([crop('q2', 'scan1', 5)]);
  });

  it('keeps a crop awaiting Drive, warns once at 53 days and removes it at 60', async () => {
    const extra = (since: number) => ({
      [RESPONSE]: response({
        hw_scan1_q1: {
          archiveStatus: 'awaiting-drive',
          awaitingDriveSince: since,
        },
      }),
      [`${JOBS}/scan1_3_1_0`]: job({ status: 'done' }),
    });

    const young = setup(extra(NOW - 20 * DAY), [old(crop('q1'), 20 * DAY)]);
    expect(await runPaperCropSweep(young.deps)).toMatchObject({
      warned: 0,
      expired: 0,
    });
    expect(young.deleted).toEqual([]);
    expect(young.archive).toHaveBeenCalledTimes(1);

    const warn = setup(extra(NOW - 54 * DAY), [old(crop('q1'), 54 * DAY)]);
    expect(await runPaperCropSweep(warn.deps)).toMatchObject({
      warned: 1,
      mailQueued: 1,
    });
    expect(warn.deleted).toEqual([]);
    const mail = warn.get('mail/paper-crops-expiring-t1-2026-09-25');
    expect(mail).toMatchObject({ to: ['teacher@example.org'] });
    expect((mail!.message as { text: string }).text.includes('- Cells')).toBe(
      true
    );
    expect(
      (warn.get(RESPONSE)!.artifactArchive as Record<string, StubData>)
        .hw_scan1_q1
    ).toMatchObject({ archiveStatus: 'awaiting-drive', expiryWarnedAt: NOW });
    expect(await runPaperCropSweep(warn.deps)).toMatchObject({ warned: 0 });

    const expire = setup(extra(NOW - AWAITING_DRIVE_HOLD_MS - DAY), [
      old(crop('q1'), 61 * DAY),
    ]);
    expect(await runPaperCropSweep(expire.deps)).toMatchObject({ expired: 1 });
    expect(expire.deleted).toEqual([crop('q1')]);
    expect(
      (expire.get(RESPONSE)!.artifactArchive as Record<string, StubData>)
        .hw_scan1_q1
    ).toMatchObject({ archiveStatus: 'lost' });
    expect(expire.archive).not.toHaveBeenCalled();
  });

  it('archives a held crop once the teacher has connected Drive', async () => {
    const s = setup(
      {
        [RESPONSE]: response({
          hw_scan1_q1: {
            archiveStatus: 'awaiting-drive',
            awaitingDriveSince: NOW - 54 * DAY,
          },
        }),
        [`${JOBS}/scan1_3_1_0`]: job({ status: 'done' }),
      },
      [old(crop('q1'), 54 * DAY)],
      {
        archive: vi.fn(() =>
          Promise.resolve({
            archiveStatus: 'archived' as const,
            driveFileId: 'd1',
          })
        ),
      }
    );
    expect(await runPaperCropSweep(s.deps)).toMatchObject({
      archived: 1,
      warned: 0,
    });
    expect(s.deleted).toEqual([]);
  });

  it('leaves pending and failed crops for the job pass', async () => {
    const s = setup({ [`${JOBS}/scan1_3_1_0`]: job({ status: 'failed' }) }, [
      old(crop('q1')),
    ]);
    await runPaperCropSweep(s.deps);
    expect(s.deleted).toEqual([]);
    expect(s.archive).not.toHaveBeenCalled();
  });
});

describe('runPaperCropSweep, kept pages', () => {
  const KEY = 'pin-period_1-0003';
  const PAGE_RESPONSE = `${SESSION}/responses/${KEY}`;
  const LOOKUP = 'users/t1/paper_page_scans/scan2';
  const pagePath = (scan = 'scan2', seat = 3, page = 1) =>
    `paper_pages/t1/${scan}/${seat}/${page}.webp`;
  const pageArtifact = (scan = 'scan2', page = 1) => ({
    id: `pg_${scan}_${page}`,
    kind: 'paper-page',
    storagePath: pagePath(scan, 3, page),
  });
  const pageResponse = (archive: StubData = {}, scan = 'scan2') => ({
    studentUid: KEY,
    answers: [],
    paperPages: [pageArtifact(scan)],
    artifactArchive: archive,
  });

  function setup(
    extra: Record<string, StubData>,
    pages: ListedCrop[],
    archiveStatus: 'awaiting-drive' | 'archived' = 'awaiting-drive'
  ) {
    const stub = makeStubFirestore({
      [SESSION]: { teacherUid: 't1', quizTitle: 'Cells' },
      [LOOKUP]: { seats: { 3: { sessionId: 's1', responseKey: KEY } } },
      [PAGE_RESPONSE]: pageResponse(),
      ...extra,
    });
    const deleted: string[] = [];
    const archive = vi.fn(() => Promise.resolve({ archiveStatus }));
    const cleanUpStorage = vi.fn(() => Promise.resolve());
    const deps: CropSweepDeps = {
      db: stub.db as unknown as Firestore,
      now: () => NOW,
      listCrops: () => Promise.resolve({ crops: [] }),
      listPages: () => Promise.resolve({ crops: pages }),
      deleteCrop: (path) => {
        deleted.push(path);
        return Promise.resolve();
      },
      archive,
      cleanUpStorage,
      getTeacherEmail: () => Promise.resolve('teacher@example.org'),
    };
    return { ...stub, deps, deleted, archive, cleanUpStorage };
  }
  const listed = (path: string, age = 8 * DAY): ListedCrop => ({
    path,
    createdMs: NOW - age,
  });

  it('removes pages of a scan nothing imported, and stray names, only after 7 days', async () => {
    const s = setup({}, [
      listed(pagePath('scanX')),
      listed(pagePath('scan2', 5)),
      listed('paper_pages/t1/scan2/3/notes.png'),
      listed(pagePath('scanY'), DAY),
    ]);
    const summary = await runPaperCropSweep(s.deps);
    expect(summary.pagesUnimportedDeleted).toBe(3);
    expect(s.deleted).toEqual([
      pagePath('scanX'),
      pagePath('scan2', 5),
      'paper_pages/t1/scan2/3/notes.png',
    ]);
  });

  it('K12: removes a page a rescan replaced once it is 7 days old', async () => {
    const s = setup(
      {
        'users/t1/paper_page_scans/scan1': {
          seats: { 3: { sessionId: 's1', responseKey: KEY } },
        },
      },
      [listed(pagePath('scan1')), listed(pagePath('scan1', 3, 2), DAY)]
    );
    const summary = await runPaperCropSweep(s.deps);
    expect(summary.pagesStaleDeleted).toBe(1);
    expect(s.deleted).toEqual([pagePath('scan1')]);
    expect(s.archive).not.toHaveBeenCalled();
  });

  it('archives a referenced page on any run, without waiting 7 days', async () => {
    const s = setup({}, [listed(pagePath(), 60 * 1000)], 'archived');
    expect(await runPaperCropSweep(s.deps)).toMatchObject({
      pagesArchived: 1,
    });
    expect(s.archive).toHaveBeenCalledWith({
      sessionId: 's1',
      responseKey: KEY,
      questionId: '',
      artifactId: 'pg_scan2_1',
    });
    expect(s.deleted).toEqual([]);
  });

  it('retries the Storage delete an archived page still owes', async () => {
    const s = setup(
      {
        [PAGE_RESPONSE]: pageResponse({
          pg_scan2_1: { archiveStatus: 'archived', driveFileId: 'd1' },
        }),
      },
      [listed(pagePath())]
    );
    expect(await runPaperCropSweep(s.deps)).toMatchObject({
      pagesCleanedUp: 1,
    });
    expect(s.archive).not.toHaveBeenCalled();
  });

  it('leaves a page a compliance delete owns, or one already lost', async () => {
    for (const archiveStatus of ['deleting', 'lost']) {
      const s = setup(
        { [PAGE_RESPONSE]: pageResponse({ pg_scan2_1: { archiveStatus } }) },
        [listed(pagePath(), 70 * DAY)]
      );
      await runPaperCropSweep(s.deps);
      expect(s.archive).not.toHaveBeenCalled();
      expect(s.deleted).toEqual([]);
    }
  });

  it('holds a page awaiting Drive, warns once at 53 days and removes it at 60', async () => {
    const held = (since: number) => ({
      [PAGE_RESPONSE]: pageResponse({
        pg_scan2_1: {
          archiveStatus: 'awaiting-drive',
          awaitingDriveSince: since,
        },
      }),
    });
    const warn = setup(held(NOW - 54 * DAY), [listed(pagePath(), 54 * DAY)]);
    expect(await runPaperCropSweep(warn.deps)).toMatchObject({
      pagesWarned: 1,
      mailQueued: 1,
    });
    const mail = warn.get('mail/paper-crops-expiring-t1-2026-09-25');
    expect((mail!.message as { subject: string }).subject).toBe(
      'SpartBoard: 1 scanned page will be removed on October 1'
    );
    expect(await runPaperCropSweep(warn.deps)).toMatchObject({
      pagesWarned: 0,
    });

    const expire = setup(held(NOW - AWAITING_DRIVE_HOLD_MS - DAY), [
      listed(pagePath(), 61 * DAY),
    ]);
    expect(await runPaperCropSweep(expire.deps)).toMatchObject({
      pagesExpired: 1,
    });
    expect(expire.deleted).toEqual([pagePath()]);
    expect(
      (expire.get(PAGE_RESPONSE)!.artifactArchive as Record<string, StubData>)
        .pg_scan2_1
    ).toMatchObject({ archiveStatus: 'lost' });
  });

  it('K13: stamps every page of a teacher without Drive on the first run, from its upload', async () => {
    const uploaded = NOW - 60 * 60 * 1000;
    const responses: Record<string, StubData> = {};
    const lookupSeats: Record<string, StubData> = {};
    for (const seat of [3, 4, 5]) {
      const key = `pin-period_1-000${seat}`;
      lookupSeats[seat] = { sessionId: 's1', responseKey: key };
      responses[`${SESSION}/responses/${key}`] = {
        studentUid: key,
        answers: [],
        paperPages: [
          {
            id: 'pg_scan2_1',
            kind: 'paper-page',
            storagePath: pagePath('scan2', seat),
          },
        ],
        artifactArchive:
          seat === 5 ? { pg_scan2_1: { archiveStatus: 'failed' } } : {},
        ...(seat === 5 ? { hasStuckArchive: true } : {}),
      };
    }
    const s = setup({ [LOOKUP]: { seats: lookupSeats }, ...responses }, [
      listed(pagePath('scan2', 3), 60 * 60 * 1000),
      listed(pagePath('scan2', 4), 60 * 60 * 1000),
      listed(pagePath('scan2', 5), 60 * 60 * 1000),
    ]);
    await runPaperCropSweep(s.deps);
    expect(s.archive).toHaveBeenCalledTimes(1);
    for (const path of Object.keys(responses)) {
      const doc = s.get(path)!;
      expect(
        (doc.artifactArchive as Record<string, StubData>).pg_scan2_1
      ).toMatchObject({
        archiveStatus: 'awaiting-drive',
        awaitingDriveSince: uploaded,
      });
      if (path.endsWith('5')) expect(doc.hasStuckArchive).toBe(false);
    }

    let clock = uploaded + 54 * DAY;
    s.deps.now = () => clock;
    expect(await runPaperCropSweep(s.deps)).toMatchObject({
      pagesWarned: 3,
      mailQueued: 1,
    });
    expect(s.archive).toHaveBeenCalledTimes(2);
    const mails = [...s.store.keys()].filter((k) => k.startsWith('mail/'));
    expect(mails).toHaveLength(1);
    expect((s.get(mails[0])!.message as { subject: string }).subject).toMatch(
      /^SpartBoard: 3 scanned pages will be removed on /
    );

    clock = uploaded + 60 * DAY;
    expect(await runPaperCropSweep(s.deps)).toMatchObject({ pagesExpired: 3 });
    expect(s.deleted.sort()).toEqual(
      [3, 4, 5].map((seat) => pagePath('scan2', seat)).sort()
    );
  });

  it('sends a teacher one email covering held crops and held pages', async () => {
    const since = NOW - 54 * DAY;
    const s = setup(
      {
        [RESPONSE]: response({
          hw_scan1_q1: {
            archiveStatus: 'awaiting-drive',
            awaitingDriveSince: since,
          },
        }),
        ...privateDoc(),
        [`${JOBS}/scan1_3_1_0`]: job({ status: 'done' }),
        [PAGE_RESPONSE]: pageResponse({
          pg_scan2_1: {
            archiveStatus: 'awaiting-drive',
            awaitingDriveSince: since,
          },
        }),
      },
      [listed(pagePath(), 54 * DAY)]
    );
    s.deps.listCrops = () =>
      Promise.resolve({ crops: [listed(crop('q1'), 54 * DAY)] });
    expect(await runPaperCropSweep(s.deps)).toMatchObject({
      warned: 1,
      pagesWarned: 1,
      mailQueued: 1,
    });
    // A teacher without Drive costs one archive attempt per run, not one per object.
    expect(s.archive).toHaveBeenCalledTimes(1);
    const mails = [...s.store.keys()].filter((k) => k.startsWith('mail/'));
    expect(mails).toEqual(['mail/paper-crops-expiring-t1-2026-09-25']);
    const { subject, text } = s.get(mails[0])!.message as {
      subject: string;
      text: string;
    };
    expect(subject).toBe(
      'SpartBoard: 2 scanned images will be removed on October 1'
    );
    expect(text).toContain(
      'holding 1 handwritten answer image and 1 scanned page from paper quizzes'
    );
    expect(text).toContain('Scores, typed transcripts and grades are kept.');
  });
});

describe('helpers', () => {
  it('parses crop paths', () => {
    expect(parseCropPath('paper_written_crops/t1/scan1/3/q1.webp')).toEqual({
      uid: 't1',
      scanId: 'scan1',
      seat: 3,
      questionId: 'q1',
    });
    expect(parseCropPath('paper_written_crops/t1/scan1/q1.webp')).toBeNull();
    expect(parseCropPath('quiz_response_media/a/b/c/d.webm')).toBeNull();
  });

  it('parses only canonical page paths', () => {
    expect(parsePagePath('paper_pages/t1/scan1/3/2.webp')).toEqual({
      uid: 't1',
      scanId: 'scan1',
      seat: 3,
      page: 2,
    });
    for (const bad of [
      'paper_pages/t1/scan1/3/2.png',
      'paper_pages/t1/scan1/0/2.webp',
      'paper_pages/t1/scan1/3/02.webp',
      'paper_written_crops/t1/scan1/3/q1.webp',
    ])
      expect(parsePagePath(bad)).toBeNull();
  });

  it('words the warning for pages alone', () => {
    const { subject, text } = buildExpiryWarningEmail([
      {
        quizTitle: 'Cells',
        removeOn: Date.parse('2026-10-02T12:00:00Z'),
        kind: 'page',
      },
      {
        quizTitle: 'Cells',
        removeOn: Date.parse('2026-10-05T12:00:00Z'),
        kind: 'page',
      },
    ]);
    expect(subject).toBe(
      'SpartBoard: 2 scanned pages will be removed on October 2'
    );
    expect(text).toContain(
      "holding 2 scanned pages of students' paper quizzes because Google Drive is not connected. They will be removed starting October 2. Scores and grades are kept."
    );
  });

  it('names the earliest removal date in the warning', () => {
    const { subject, text } = buildExpiryWarningEmail([
      { quizTitle: 'Cells', removeOn: Date.parse('2026-10-02T12:00:00Z') },
      { quizTitle: 'Cells', removeOn: Date.parse('2026-10-05T12:00:00Z') },
    ]);
    expect(subject).toBe(
      'SpartBoard: 2 handwritten answers will be removed on October 2'
    );
    expect(text).toContain('- Cells');
  });
});
