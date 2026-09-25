import { describe, it, expect, vi } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import { makeStubFirestore, type StubData } from './testing/stubFirestore';

vi.mock('firebase-admin', () => ({
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
  buildExpiryWarningEmail,
  parseCropPath,
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
