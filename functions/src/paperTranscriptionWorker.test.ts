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
vi.mock('firebase-functions/v2/firestore', () => ({
  onDocumentCreated: (_opts: unknown, handler: unknown) => handler,
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

import {
  handleRetryPaperTranscription,
  parseRetryRequest,
  requeuePaperJob,
  runPaperTranscriptionJob,
  seatFromJobId,
  type WorkerDeps,
} from './paperTranscriptionWorker';
import type { PaperPageTranscript } from './paperTranscribe';

const NOW = Date.parse('2026-09-25T15:00:00Z');
const SESSION = 'quiz_sessions/s1';
const RESPONSE = `${SESSION}/responses/r1`;
const PRIV = (q: string) => `${RESPONSE}/paperPrivate/${q}`;
const JOBS = 'users/t1/paper_transcription_jobs';
const JOB = `${JOBS}/scan1_3_1_0`;
const USAGE = 'ai_usage/t1_paper-handwritten-responses_2026-09-25';
const crop = (q: string, scan = 'scan1') =>
  `paper_written_crops/t1/${scan}/3/${q}.webp`;

function answer(q: string, transcript: 'pending' | 'blank', scan = 'scan1') {
  return {
    questionId: q,
    answer: '',
    status: 'submitted',
    paperScanId: scan,
    paperTranscript: transcript,
    artifacts: [
      {
        id: `hw_${scan}_${q}`,
        slot: 'primary',
        kind: 'handwriting',
        storagePath: crop(q, scan),
        mimeType: 'image/webp',
        uploadState: 'uploaded',
      },
    ],
  };
}

function seed(overrides: Record<string, StubData> = {}) {
  return {
    [SESSION]: { teacherUid: 't1', quizTitle: 'Cells' },
    [RESPONSE]: {
      studentUid: 'p1',
      answers: [
        { questionId: 'm1', answer: 'B', status: 'submitted' },
        answer('q1', 'pending'),
        answer('q2', 'blank'),
      ],
    },
    [PRIV('q1')]: {
      scanId: 'scan1',
      status: 'pending',
      attempts: 0,
      charged: false,
      updatedAt: 1,
    },
    [PRIV('q2')]: {
      scanId: 'scan1',
      status: 'blank',
      attempts: 0,
      charged: false,
      updatedAt: 1,
    },
    [JOB]: {
      sessionId: 's1',
      responseKey: 'r1',
      scanId: 'scan1',
      page: 1,
      boxes: [
        { questionId: 'q1', storagePath: crop('q1') },
        { questionId: 'q2', storagePath: crop('q2') },
      ],
      status: 'queued',
      attempt: 0,
      charged: false,
      createdAt: NOW - 1000,
      updatedAt: NOW - 1000,
    },
    ...overrides,
  };
}

function okPage(...ids: string[]): PaperPageTranscript {
  return {
    model: 'gemini-standard',
    boxes: ids.map((questionId) => ({
      questionId,
      ok: true as const,
      rawTranscript: `words for ${questionId}`,
      html: `<p>words for ${questionId}</p>`,
      uncertainSpans: [{ start: 0, end: 5 }],
      illegibleCount: 0,
    })),
  };
}

function setup(
  overrides: Record<string, StubData> = {},
  deps: Partial<Omit<WorkerDeps, 'db'>> = {}
) {
  const stub = makeStubFirestore(seed(overrides));
  const transcribe = vi.fn<WorkerDeps['transcribe']>((boxes) =>
    Promise.resolve(okPage(...boxes.map((b) => b.questionId)))
  );
  const archive = vi.fn<WorkerDeps['archive']>(() =>
    Promise.resolve({ archiveStatus: 'archived', driveFileId: 'd1' })
  );
  const full: WorkerDeps = {
    db: stub.db as unknown as Firestore,
    now: () => NOW,
    isAdmin: () => Promise.resolve(false),
    transcribe,
    archive,
    ...deps,
  };
  return { ...stub, deps: full, transcribe, archive };
}

const answerOf = (s: ReturnType<typeof setup>, q: string) =>
  (s.get(RESPONSE)!.answers as Array<Record<string, unknown>>).find(
    (a) => a.questionId === q
  )!;

describe('runPaperTranscriptionJob', () => {
  it('writes the transcript, charges one page and archives ink and blank crops', async () => {
    const s = setup();
    expect(await runPaperTranscriptionJob('t1', 'scan1_3_1_0', s.deps)).toBe(
      'done'
    );
    expect(s.transcribe).toHaveBeenCalledTimes(1);
    expect(s.transcribe.mock.calls[0][0]).toEqual([
      { questionId: 'q1', storagePath: crop('q1') },
    ]);
    expect(s.transcribe.mock.calls[0][1]).toBe('standard');
    expect(answerOf(s, 'q1')).toMatchObject({
      answer: '<p>words for q1</p>',
      paperTranscript: 'done',
    });
    expect(answerOf(s, 'q2')).toMatchObject({
      answer: '',
      paperTranscript: 'blank',
    });
    expect(answerOf(s, 'm1')).toMatchObject({ answer: 'B' });
    expect(s.get(PRIV('q1'))).toMatchObject({
      scanId: 'scan1',
      status: 'done',
      rawTranscript: 'words for q1',
      uncertainSpans: [{ start: 0, end: 5 }],
      attempts: 1,
      charged: true,
    });
    expect(s.get(PRIV('q2'))).toMatchObject({ status: 'blank' });
    expect(s.get(USAGE)).toMatchObject({ count: 1 });
    expect(s.get(JOB)).toMatchObject({ status: 'done', charged: true });
    expect(s.archive.mock.calls.map((c) => c[0])).toEqual([
      {
        sessionId: 's1',
        responseKey: 'r1',
        questionId: 'q1',
        artifactId: 'hw_scan1_q1',
      },
      {
        sessionId: 's1',
        responseKey: 'r1',
        questionId: 'q2',
        artifactId: 'hw_scan1_q2',
      },
    ]);
  });

  it('does not double-charge or re-transcribe on replay', async () => {
    const s = setup();
    await runPaperTranscriptionJob('t1', 'scan1_3_1_0', s.deps);
    expect(await runPaperTranscriptionJob('t1', 'scan1_3_1_0', s.deps)).toBe(
      'not-claimed'
    );
    expect(s.transcribe).toHaveBeenCalledTimes(1);
    expect(s.get(USAGE)).toMatchObject({ count: 1 });
  });

  it('leaves a job another run holds under a live lease', async () => {
    const s = setup({
      [JOB]: { ...seed()[JOB], status: 'running', leaseUntil: NOW + 60_000 },
    });
    expect(await runPaperTranscriptionJob('t1', 'scan1_3_1_0', s.deps)).toBe(
      'not-claimed'
    );
    expect(s.transcribe).not.toHaveBeenCalled();
  });

  it('ignores a job created over quota', async () => {
    const s = setup({ [JOB]: { ...seed()[JOB], status: 'over-quota' } });
    expect(await runPaperTranscriptionJob('t1', 'scan1_3_1_0', s.deps)).toBe(
      'not-claimed'
    );
  });

  it('ends superseded without writing when the answer moved to a newer scan', async () => {
    const s = setup({
      [RESPONSE]: {
        studentUid: 'p1',
        answers: [
          answer('q1', 'pending', 'scan2'),
          answer('q2', 'blank', 'scan2'),
        ],
      },
    });
    expect(await runPaperTranscriptionJob('t1', 'scan1_3_1_0', s.deps)).toBe(
      'superseded'
    );
    expect(s.transcribe).not.toHaveBeenCalled();
    expect(s.archive).not.toHaveBeenCalled();
    expect(s.get(JOB)).toMatchObject({ status: 'superseded', charged: false });
    expect(s.has(USAGE)).toBe(false);
  });

  it('never overwrites an answer the teacher edited', async () => {
    const s = setup({
      [PRIV('q1')]: {
        scanId: 'scan1',
        status: 'pending',
        attempts: 0,
        charged: false,
        editedAt: NOW - 5,
        editedBy: 't1',
        updatedAt: 1,
      },
    });
    await runPaperTranscriptionJob('t1', 'scan1_3_1_0', s.deps);
    expect(s.transcribe).not.toHaveBeenCalled();
    expect(answerOf(s, 'q1')).toMatchObject({ answer: '' });
    expect(s.has(USAGE)).toBe(false);
  });

  it('skips an answer edited while Gemini was running', async () => {
    const s = setup();
    s.transcribe.mockImplementationOnce(() => {
      s.store.set(PRIV('q1'), {
        ...s.get(PRIV('q1'))!,
        editedAt: NOW,
        editedBy: 't1',
      });
      return Promise.resolve(okPage('q1'));
    });
    expect(await runPaperTranscriptionJob('t1', 'scan1_3_1_0', s.deps)).toBe(
      'superseded'
    );
    expect(answerOf(s, 'q1')).toMatchObject({ answer: '' });
    expect(s.has(USAGE)).toBe(false);
  });

  it('marks the page over quota, then a retry succeeds once pages are free', async () => {
    const s = setup({ [USAGE]: { count: 300 } });
    expect(await runPaperTranscriptionJob('t1', 'scan1_3_1_0', s.deps)).toBe(
      'over-quota'
    );
    expect(s.transcribe).not.toHaveBeenCalled();
    expect(s.get(JOB)).toMatchObject({ status: 'over-quota', charged: false });
    expect(s.get(PRIV('q1'))).toMatchObject({ status: 'over-quota' });
    expect(answerOf(s, 'q1')).toMatchObject({ paperTranscript: 'pending' });

    s.store.set(USAGE, { count: 299 });
    expect(
      await requeuePaperJob(s.deps.db, 't1', 'scan1_3_1_0', {
        now: NOW,
        maxAttempt: 10,
      })
    ).toBe('requeued');
    expect(s.get(JOB)).toMatchObject({
      status: 'superseded',
      supersededBy: 'scan1_3_1_1',
    });
    expect(s.get(`${JOBS}/scan1_3_1_1`)).toMatchObject({
      status: 'queued',
      attempt: 1,
      charged: false,
      boxes: [
        { questionId: 'q1', storagePath: crop('q1') },
        { questionId: 'q2', storagePath: crop('q2') },
      ],
    });
    expect(s.get(PRIV('q1'))).toMatchObject({ status: 'pending' });
    expect(s.get(PRIV('q2'))).toMatchObject({ status: 'blank' });

    expect(await runPaperTranscriptionJob('t1', 'scan1_3_1_1', s.deps)).toBe(
      'done'
    );
    expect(answerOf(s, 'q1')).toMatchObject({ paperTranscript: 'done' });
    expect(s.get(USAGE)).toMatchObject({ count: 300 });
  });

  it('lets admins past the page limit', async () => {
    const s = setup(
      { [USAGE]: { count: 300 } },
      { isAdmin: () => Promise.resolve(true) }
    );
    expect(await runPaperTranscriptionJob('t1', 'scan1_3_1_0', s.deps)).toBe(
      'done'
    );
  });

  it('respects the gemini-functions kill switch', async () => {
    const s = setup(
      { 'global_permissions/gemini-functions': { enabled: false } },
      { isAdmin: () => Promise.resolve(true) }
    );
    expect(await runPaperTranscriptionJob('t1', 'scan1_3_1_0', s.deps)).toBe(
      'over-quota'
    );
    expect(s.transcribe).not.toHaveBeenCalled();
  });

  it('keeps the crop and still writes the transcript when Drive is not connected', async () => {
    const s = setup(
      {},
      {
        archive: vi.fn(() =>
          Promise.resolve({ archiveStatus: 'awaiting-drive' as const })
        ),
      }
    );
    expect(await runPaperTranscriptionJob('t1', 'scan1_3_1_0', s.deps)).toBe(
      'done'
    );
    expect(answerOf(s, 'q1')).toMatchObject({ paperTranscript: 'done' });
  });

  it('keeps the transcript when archival throws', async () => {
    const s = setup(
      {},
      {
        archive: vi.fn(() => Promise.reject(new Error('drive down'))),
      }
    );
    expect(await runPaperTranscriptionJob('t1', 'scan1_3_1_0', s.deps)).toBe(
      'done'
    );
    expect(s.get(JOB)).toMatchObject({ status: 'done', charged: true });
  });

  it('records a failed call without charging', async () => {
    const s = setup();
    s.transcribe.mockRejectedValueOnce(new Error('vertex 503'));
    expect(await runPaperTranscriptionJob('t1', 'scan1_3_1_0', s.deps)).toBe(
      'failed'
    );
    expect(s.get(JOB)).toMatchObject({
      status: 'failed',
      charged: false,
      lastError: 'vertex 503',
    });
    expect(s.get(PRIV('q1'))).toMatchObject({
      status: 'failed',
      attempts: 1,
      lastError: 'vertex 503',
    });
    expect(s.has(USAGE)).toBe(false);
    // The blank crop is still archived.
    expect(s.archive).toHaveBeenCalledTimes(1);
  });

  it('charges once but fails the job when one box could not be read', async () => {
    const s = setup({
      [RESPONSE]: {
        studentUid: 'p1',
        answers: [answer('q1', 'pending'), answer('q3', 'pending')],
      },
      [PRIV('q3')]: {
        scanId: 'scan1',
        status: 'pending',
        attempts: 0,
        charged: false,
        updatedAt: 1,
      },
      [JOB]: {
        ...seed()[JOB],
        boxes: [
          { questionId: 'q1', storagePath: crop('q1') },
          { questionId: 'q3', storagePath: crop('q3') },
        ],
      },
    });
    s.transcribe.mockResolvedValueOnce({
      model: 'm',
      boxes: [
        okPage('q1').boxes[0],
        { questionId: 'q3', ok: false, error: 'missing from the model reply' },
      ],
    });
    expect(await runPaperTranscriptionJob('t1', 'scan1_3_1_0', s.deps)).toBe(
      'failed'
    );
    expect(s.get(JOB)).toMatchObject({ status: 'failed', charged: true });
    expect(s.get(USAGE)).toMatchObject({ count: 1 });
    expect(s.get(PRIV('q3'))).toMatchObject({ status: 'failed', attempts: 1 });
    expect(answerOf(s, 'q1')).toMatchObject({ paperTranscript: 'done' });

    await requeuePaperJob(s.deps.db, 't1', 'scan1_3_1_0', {
      now: NOW,
      maxAttempt: 10,
    });
    expect(s.get(`${JOBS}/scan1_3_1_1`)).toMatchObject({
      boxes: [{ questionId: 'q3', storagePath: crop('q3') }],
    });
  });

  it('refuses a job whose session belongs to another teacher', async () => {
    const s = setup({ [SESSION]: { teacherUid: 'other' } });
    expect(await runPaperTranscriptionJob('t1', 'scan1_3_1_0', s.deps)).toBe(
      'failed'
    );
    expect(s.transcribe).not.toHaveBeenCalled();
  });

  it('never reads a crop outside the teacher and scan prefix', async () => {
    const s = setup({
      [JOB]: {
        ...seed()[JOB],
        boxes: [
          {
            questionId: 'q1',
            storagePath: 'paper_written_crops/t2/scan1/3/q1.webp',
          },
        ],
      },
    });
    expect(await runPaperTranscriptionJob('t1', 'scan1_3_1_0', s.deps)).toBe(
      'superseded'
    );
    expect(s.transcribe).not.toHaveBeenCalled();
  });

  it('reports a missing job', async () => {
    const s = setup();
    expect(await runPaperTranscriptionJob('t1', 'nope_1_1_0', s.deps)).toBe(
      'missing'
    );
  });
});

describe('requeuePaperJob', () => {
  it('collides instead of duplicating when the next attempt exists', async () => {
    const s = setup({
      [JOB]: { ...seed()[JOB], status: 'failed' },
      [`${JOBS}/scan1_3_1_1`]: { ...seed()[JOB], attempt: 1 },
    });
    expect(
      await requeuePaperJob(s.deps.db, 't1', 'scan1_3_1_0', {
        now: NOW,
        maxAttempt: 10,
      })
    ).toBe('skipped');
  });

  it('fails a stuck run that reached the attempt cap', async () => {
    const s = setup({
      [JOB]: {
        ...seed()[JOB],
        status: 'running',
        attempt: 3,
        leaseUntil: NOW - 1,
      },
    });
    expect(
      await requeuePaperJob(s.deps.db, 't1', 'scan1_3_1_0', {
        now: NOW,
        maxAttempt: 3,
      })
    ).toBe('skipped');
    expect(s.get(JOB)).toMatchObject({ status: 'failed' });
  });

  it('supersedes a job with nothing left to transcribe', async () => {
    const s = setup({
      [JOB]: { ...seed()[JOB], status: 'failed' },
      [PRIV('q1')]: { scanId: 'scan1', status: 'done', attempts: 1 },
    });
    expect(
      await requeuePaperJob(s.deps.db, 't1', 'scan1_3_1_0', {
        now: NOW,
        maxAttempt: 10,
      })
    ).toBe('superseded');
    expect(s.has(`${JOBS}/scan1_3_1_1`)).toBe(false);
  });
});

describe('handleRetryPaperTranscription', () => {
  const teacher = { uid: 't1', anonymous: false, studentRole: false };

  it('re-queues the failed jobs of one answer for the session teacher', async () => {
    const s = setup({ [JOB]: { ...seed()[JOB], status: 'failed' } });
    const result = await handleRetryPaperTranscription(
      s.deps.db,
      teacher,
      { sessionId: 's1', responseKey: 'r1', questionId: 'q1' },
      NOW
    );
    expect(result).toEqual({ requeued: 1, superseded: 0, skipped: 0 });
    expect(s.get(`${JOBS}/scan1_3_1_1`)).toMatchObject({ status: 'queued' });
  });

  it('leaves done and queued jobs alone', async () => {
    const s = setup();
    const result = await handleRetryPaperTranscription(
      s.deps.db,
      teacher,
      { sessionId: 's1' },
      NOW
    );
    expect(result).toEqual({ requeued: 0, superseded: 0, skipped: 0 });
  });

  it('denies other teachers, students and signed-out callers', async () => {
    const s = setup({ [JOB]: { ...seed()[JOB], status: 'failed' } });
    await expect(
      handleRetryPaperTranscription(
        s.deps.db,
        { uid: 't2', anonymous: false, studentRole: false },
        { sessionId: 's1' },
        NOW
      )
    ).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(
      handleRetryPaperTranscription(
        s.deps.db,
        { uid: 't1', anonymous: true, studentRole: false },
        { sessionId: 's1' },
        NOW
      )
    ).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(
      handleRetryPaperTranscription(
        s.deps.db,
        { uid: 't1', anonymous: false, studentRole: true },
        { sessionId: 's1' },
        NOW
      )
    ).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(
      handleRetryPaperTranscription(s.deps.db, null, { sessionId: 's1' }, NOW)
    ).rejects.toMatchObject({ code: 'unauthenticated' });
  });
});

describe('helpers', () => {
  it('parses the retry request', () => {
    expect(parseRetryRequest({ sessionId: 's1' })).toEqual({ sessionId: 's1' });
    expect(() => parseRetryRequest({})).toThrow();
    expect(() => parseRetryRequest({ sessionId: 'a/b' })).toThrow();
    expect(() =>
      parseRetryRequest({ sessionId: 's1', questionId: 'q1' })
    ).toThrow();
  });

  it('reads the seat from a job id', () => {
    expect(seatFromJobId('scan1_3_1_0', 'scan1')).toBe(3);
    expect(seatFromJobId('a_b_12_2_0', 'a_b')).toBe(12);
    expect(seatFromJobId('other_3_1_0', 'scan1')).toBeNull();
  });
});
