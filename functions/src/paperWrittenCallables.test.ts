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
vi.mock('./googleOAuth', () => ({ refreshGoogleAccessTokenForUid: vi.fn() }));
vi.mock('./quizMediaArchive', () => ({
  archiveQuizArtifactCore: vi.fn(),
  buildDefaultArchiveDeps: vi.fn(),
  QUIZ_MEDIA_ARCHIVE_SECRETS: [],
  QUIZ_MEDIA_GOOGLE_SECRETS: [],
  isQuizMediaResponseGranted: vi.fn(),
}));
vi.mock('firebase-functions/v2/firestore', () => ({
  onDocumentCreated: (_opts: unknown, handler: unknown) => handler,
}));
vi.mock('firebase-functions/v2/https', () => {
  class FakeHttpsError extends Error {
    code: string;
    details: unknown;
    constructor(code: string, message: string, details?: unknown) {
      super(message);
      this.code = code;
      this.details = details;
    }
  }
  return {
    onCall: (_opts: unknown, handler: unknown) => handler,
    HttpsError: FakeHttpsError,
  };
});

import {
  handleApplyPaperNewerScan,
  handleGetPaperWrittenCrop,
  handleTranscribePaperBlank,
  handleUpdatePaperTranscript,
  isTeacherCropPath,
  type Caller,
  type PaperWrittenDeps,
} from './paperWrittenCallables';
import {
  resolveServerResultsVisibility,
  studentMaySeeHandwriting,
} from './quizResultsVisibilityServer';

const NOW = Date.parse('2026-09-25T15:00:00Z');
const SESSION = 'quiz_sessions/s1';
const RESPONSE = `${SESSION}/responses/r1`;
const PRIV = (q: string) => `${RESPONSE}/paperPrivate/${q}`;
const JOBS = 'users/t1/paper_transcription_jobs';
const crop = (q: string, scan = 'scan1') =>
  `paper_written_crops/t1/${scan}/3/${q}.webp`;

const TEACHER: Caller = { uid: 't1', anonymous: false, studentRole: false };
const OTHER_TEACHER: Caller = {
  uid: 't2',
  anonymous: false,
  studentRole: false,
};
const STUDENT: Caller = { uid: 'p1', anonymous: false, studentRole: true };
const OTHER_STUDENT: Caller = {
  uid: 'p2',
  anonymous: false,
  studentRole: true,
};

function written(
  q: string,
  transcript: 'pending' | 'blank' | 'done',
  scan = 'scan1',
  answer = ''
) {
  return {
    questionId: q,
    answer,
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

function job(
  scan: string,
  page: number,
  attempt: number,
  status: string,
  boxes: string[],
  extra: StubData = {}
): StubData {
  return {
    sessionId: 's1',
    responseKey: 'r1',
    scanId: scan,
    page,
    boxes: boxes.map((q) => ({ questionId: q, storagePath: crop(q, scan) })),
    status,
    attempt,
    charged: false,
    createdAt: 1,
    updatedAt: 1,
    ...extra,
  };
}

function seed(
  overrides: Record<string, StubData> = {}
): Record<string, StubData> {
  return {
    [SESSION]: {
      teacherUid: 't1',
      scoreVisibility: 'score-and-responses',
      writtenReturnMode: 'handwriting',
    },
    [RESPONSE]: {
      studentUid: 'p1',
      paperSeat: 3,
      answers: [
        { questionId: 'm1', answer: 'B', status: 'submitted' },
        written('q1', 'done', 'scan1', '<p>old</p>'),
        written('q2', 'blank'),
        { questionId: 'f1', answer: '<p>typed</p>', status: 'submitted' },
      ],
    },
    [PRIV('q1')]: {
      scanId: 'scan1',
      status: 'done',
      rawTranscript: 'old',
      attempts: 1,
      charged: true,
      updatedAt: 1,
    },
    [PRIV('q2')]: {
      scanId: 'scan1',
      status: 'blank',
      attempts: 0,
      charged: false,
      updatedAt: 1,
    },
    [`${JOBS}/scan1_3_1_0`]: job('scan1', 1, 0, 'done', ['q1', 'q2']),
    ...overrides,
  };
}

function makeDeps(
  store: Record<string, StubData>,
  objects: Record<string, { bytes: string; contentType?: string }> = {},
  drive: Record<string, string> = {}
) {
  const stub = makeStubFirestore(store);
  const deps: PaperWrittenDeps = {
    db: stub.db as unknown as Firestore,
    now: () => NOW,
    readObject: vi.fn((path: string) => {
      const o = objects[path];
      return Promise.resolve(
        o ? { data: Buffer.from(o.bytes), contentType: o.contentType } : null
      );
    }),
    statObject: vi.fn((path: string) => {
      const o = objects[path];
      return Promise.resolve(
        o ? { contentType: o.contentType, size: o.bytes.length } : null
      );
    }),
    getAccessToken: vi.fn(() => Promise.resolve('tok')),
    downloadDriveFile: vi.fn((_t: string, id: string) =>
      drive[id]
        ? Promise.resolve(Buffer.from(drive[id]))
        : Promise.reject(new Error('404'))
    ),
  };
  return { stub, deps };
}

const b64 = (s: string) => Buffer.from(s).toString('base64');
const target = { sessionId: 's1', responseKey: 'r1', questionId: 'q1' };

async function expectCode(p: Promise<unknown>, code: string) {
  await expect(p).rejects.toMatchObject({ code });
}

describe('isTeacherCropPath', () => {
  it('accepts only the caller prefix with the full shape', () => {
    expect(isTeacherCropPath(crop('q1'), 't1')).toBe(true);
    expect(isTeacherCropPath(crop('q1'), 't2')).toBe(false);
    expect(
      isTeacherCropPath('paper_written_crops/t1/scan1/q1.webp', 't1')
    ).toBe(false);
    expect(isTeacherCropPath('paper_written_crops/t1/../3/q1.webp', 't1')).toBe(
      false
    );
    expect(isTeacherCropPath('other/t1/scan1/3/q1.webp', 't1')).toBe(false);
  });
});

describe('resolveServerResultsVisibility', () => {
  const session = { scoreVisibility: 'score-and-responses' };
  it('follows the class without an override', () => {
    expect(resolveServerResultsVisibility(session, {}, NOW).visibility).toBe(
      'score-and-responses'
    );
  });
  it('lets an unexpired override win and an expired one lapse', () => {
    const hidden = { resultsOverride: { mode: 'hidden', publishedAt: 1 } };
    expect(
      resolveServerResultsVisibility(session, hidden, NOW).visibility
    ).toBe('none');
    const expired = {
      resultsOverride: { mode: 'hidden', publishedAt: 1, expiresAt: NOW - 1 },
    };
    expect(
      resolveServerResultsVisibility(session, expired, NOW).visibility
    ).toBe('score-and-responses');
    const shown = {
      resultsOverride: {
        mode: 'shown',
        visibility: 'score-only',
        publishedAt: 1,
      },
    };
    expect(
      resolveServerResultsVisibility({ scoreVisibility: 'none' }, shown, NOW)
        .visibility
    ).toBe('score-only');
  });
  it('fails closed on unknown values', () => {
    expect(
      resolveServerResultsVisibility({ scoreVisibility: 'all' }, {}, NOW)
        .visibility
    ).toBe('none');
  });
  it('needs responses and a handwriting mode', () => {
    expect(studentMaySeeHandwriting(session, {}, NOW)).toBe(true);
    expect(
      studentMaySeeHandwriting(
        { ...session, writtenReturnMode: 'typed' },
        {},
        NOW
      )
    ).toBe(false);
    expect(
      studentMaySeeHandwriting(
        { ...session, writtenReturnMode: 'both' },
        {},
        NOW
      )
    ).toBe(true);
    expect(
      studentMaySeeHandwriting({ scoreVisibility: 'score-only' }, {}, NOW)
    ).toBe(false);
  });
});

describe('getPaperWrittenCropV1', () => {
  const objects = { [crop('q1')]: { bytes: 'img', contentType: 'image/png' } };

  it('serves the owning teacher the Storage copy', async () => {
    const { deps } = makeDeps(seed(), objects);
    await expect(
      handleGetPaperWrittenCrop(deps, TEACHER, target)
    ).resolves.toEqual({
      status: 'ready',
      mimeType: 'image/png',
      data: b64('img'),
      source: 'storage',
    });
  });

  it('denies another teacher', async () => {
    const { deps } = makeDeps(seed(), objects);
    await expectCode(
      handleGetPaperWrittenCrop(deps, OTHER_TEACHER, target),
      'permission-denied'
    );
  });

  it('requires sign-in', async () => {
    const { deps } = makeDeps(seed(), objects);
    await expectCode(
      handleGetPaperWrittenCrop(deps, null, target),
      'unauthenticated'
    );
  });

  it('falls back to the archived Drive copy once Storage is cleared', async () => {
    const store = seed();
    store[RESPONSE] = {
      ...store[RESPONSE],
      artifactArchive: {
        hw_scan1_q1: { archiveStatus: 'archived', driveFileId: 'd1' },
      },
    };
    const { deps } = makeDeps(store, {}, { d1: 'drive-img' });
    await expect(
      handleGetPaperWrittenCrop(deps, TEACHER, target)
    ).resolves.toEqual({
      status: 'ready',
      mimeType: 'image/webp',
      data: b64('drive-img'),
      source: 'drive',
    });
    expect(deps.getAccessToken).toHaveBeenCalledWith('t1');
  });

  it('reports a deleted crop without reading anything', async () => {
    const store = seed();
    store[RESPONSE] = {
      ...store[RESPONSE],
      artifactArchive: { hw_scan1_q1: { archiveStatus: 'deleted' } },
    };
    const { deps } = makeDeps(store, objects);
    await expect(
      handleGetPaperWrittenCrop(deps, TEACHER, target)
    ).resolves.toEqual({ status: 'not-available', reason: 'deleted' });
    expect(deps.readObject).not.toHaveBeenCalled();
  });

  it('reports no crop for a typed answer', async () => {
    const { deps } = makeDeps(seed(), objects);
    await expect(
      handleGetPaperWrittenCrop(deps, TEACHER, { ...target, questionId: 'f1' })
    ).resolves.toEqual({ status: 'not-available', reason: 'no-crop' });
  });

  it('serves the student their own crop when responses are published', async () => {
    const { deps } = makeDeps(seed(), objects);
    await expect(
      handleGetPaperWrittenCrop(deps, STUDENT, target)
    ).resolves.toMatchObject({ status: 'ready' });
  });

  it('denies another student', async () => {
    const { deps } = makeDeps(seed(), objects);
    await expectCode(
      handleGetPaperWrittenCrop(deps, OTHER_STUDENT, target),
      'permission-denied'
    );
  });

  it.each([
    ['nothing published', { scoreVisibility: 'none' }, {}],
    ['score only', { scoreVisibility: 'score-only' }, {}],
    ['typed return mode', { writtenReturnMode: 'typed' }, {}],
    [
      'a per-student hidden override',
      {},
      { resultsOverride: { mode: 'hidden', publishedAt: 1 } },
    ],
  ])('denies the student at %s', async (_label, session, response) => {
    const store = seed();
    store[SESSION] = { ...store[SESSION], ...session };
    store[RESPONSE] = { ...store[RESPONSE], ...response };
    const { deps } = makeDeps(store, objects);
    await expectCode(
      handleGetPaperWrittenCrop(deps, STUDENT, target),
      'permission-denied'
    );
  });

  it('lets a per-student shown override open the crop before the class publish', async () => {
    const store = seed();
    store[SESSION] = { ...store[SESSION], scoreVisibility: 'none' };
    store[RESPONSE] = {
      ...store[RESPONSE],
      resultsOverride: {
        mode: 'shown',
        visibility: 'score-and-responses',
        publishedAt: 1,
      },
    };
    const { deps } = makeDeps(store, objects);
    await expect(
      handleGetPaperWrittenCrop(deps, STUDENT, target)
    ).resolves.toMatchObject({ status: 'ready' });
  });

  it('never gives a student the newer scan', async () => {
    const { deps } = makeDeps(seed(), objects);
    await expectCode(
      handleGetPaperWrittenCrop(deps, STUDENT, { ...target, scan: 'newer' }),
      'permission-denied'
    );
  });

  it('serves the teacher the newer scan crop', async () => {
    const store = seed();
    store[PRIV('q1')] = {
      ...store[PRIV('q1')],
      newerScan: { scanId: 'scan2', page: 1, state: 'ink' },
    };
    const { deps } = makeDeps(store, {
      [crop('q1', 'scan2')]: { bytes: 'new', contentType: 'image/webp' },
    });
    await expect(
      handleGetPaperWrittenCrop(deps, TEACHER, { ...target, scan: 'newer' })
    ).resolves.toMatchObject({ status: 'ready', data: b64('new') });
  });

  it('reads an owner storage path directly and refuses anyone else', async () => {
    const { deps } = makeDeps(seed(), objects);
    await expect(
      handleGetPaperWrittenCrop(deps, TEACHER, { storagePath: crop('q1') })
    ).resolves.toMatchObject({ status: 'ready' });
    await expectCode(
      handleGetPaperWrittenCrop(deps, OTHER_TEACHER, {
        storagePath: crop('q1'),
      }),
      'permission-denied'
    );
    await expectCode(
      handleGetPaperWrittenCrop(
        deps,
        { uid: 't1', anonymous: true, studentRole: false },
        { storagePath: crop('q1') }
      ),
      'permission-denied'
    );
    await expect(
      handleGetPaperWrittenCrop(deps, TEACHER, { storagePath: crop('zz') })
    ).resolves.toEqual({ status: 'not-available', reason: 'missing' });
  });
});

describe('updatePaperTranscriptV1', () => {
  it('writes the escaped transcript and records the edit', async () => {
    const { deps, stub } = makeDeps(seed());
    await expect(
      handleUpdatePaperTranscript(deps, TEACHER, {
        ...target,
        text: 'New <b>text</b>\n\nSecond',
      })
    ).resolves.toEqual({
      answer: '<p>New &lt;b&gt;text&lt;/b&gt;</p><p>Second</p>',
      snapshotRewritten: false,
    });
    const answers = stub.get(RESPONSE)?.answers as Array<StubData>;
    expect(answers[1]).toMatchObject({
      answer: '<p>New &lt;b&gt;text&lt;/b&gt;</p><p>Second</p>',
      paperTranscript: 'done',
    });
    expect(stub.get(PRIV('q1'))).toMatchObject({
      status: 'done',
      rawTranscript: 'old',
      editedBy: 't1',
      editedAt: NOW,
    });
  });

  it('asks for confirmation before replacing graded text', async () => {
    const store = seed();
    store[RESPONSE] = {
      ...store[RESPONSE],
      grading: {
        q1: {
          pointsAwarded: 2,
          overallComment: 'Good',
          rubricScores: [{ criterionId: 'c', levelId: 'l' }],
          gradingSnapshot: '<p>old</p>',
          annotations: [{ id: 'a', from: 0, to: 2 }],
          gradedBy: 't1',
        },
        q9: { pointsAwarded: 1, gradedBy: 't1' },
      },
    };
    const { deps, stub } = makeDeps(store);
    await expect(
      handleUpdatePaperTranscript(deps, TEACHER, { ...target, text: 'fixed' })
    ).rejects.toMatchObject({
      code: 'failed-precondition',
      details: { reason: 'confirm-snapshot-rewrite' },
    });
    await expect(
      handleUpdatePaperTranscript(deps, TEACHER, {
        ...target,
        text: 'fixed',
        confirmSnapshotRewrite: true,
      })
    ).resolves.toEqual({ answer: '<p>fixed</p>', snapshotRewritten: true });
    const grading = stub.get(RESPONSE)?.grading as Record<string, StubData>;
    expect(grading.q1).toEqual({
      pointsAwarded: 2,
      overallComment: 'Good',
      rubricScores: [{ criterionId: 'c', levelId: 'l' }],
      gradingSnapshot: '<p>fixed</p>',
      gradedBy: 't1',
    });
    expect(grading.q9).toEqual({ pointsAwarded: 1, gradedBy: 't1' });
  });

  it('refuses typed answers, other teachers and students', async () => {
    const { deps } = makeDeps(seed());
    await expectCode(
      handleUpdatePaperTranscript(deps, TEACHER, {
        ...target,
        questionId: 'f1',
        text: 'x',
      }),
      'failed-precondition'
    );
    await expectCode(
      handleUpdatePaperTranscript(deps, OTHER_TEACHER, {
        ...target,
        text: 'x',
      }),
      'permission-denied'
    );
    await expectCode(
      handleUpdatePaperTranscript(deps, STUDENT, { ...target, text: 'x' }),
      'permission-denied'
    );
  });

  it('aborts when a rescan replaced the answer', async () => {
    const { deps } = makeDeps(seed());
    await expectCode(
      handleUpdatePaperTranscript(deps, TEACHER, {
        ...target,
        text: 'x',
        expectedScanId: 'scan0',
      }),
      'aborted'
    );
  });
});

describe('applyPaperNewerScanV1', () => {
  function newerSeed(extra: Record<string, StubData> = {}) {
    const store = seed(extra);
    store[PRIV('q1')] = {
      ...store[PRIV('q1')],
      editedBy: 't1',
      editedAt: 5,
      newerScan: { scanId: 'scan2', page: 1, state: 'ink' },
    };
    store[RESPONSE] = {
      ...store[RESPONSE],
      grading: {
        q1: {
          pointsAwarded: 2,
          gradingSnapshot: '<p>old</p>',
          annotations: [{ id: 'a', from: 0, to: 1 }],
          gradedBy: 't1',
        },
      },
    };
    return store;
  }
  const scan2Crop = {
    [crop('q1', 'scan2')]: { bytes: 'n', contentType: 'image/png' },
  };

  it('swaps the answer to the new scan and queues its page', async () => {
    const { deps, stub } = makeDeps(newerSeed(), scan2Crop);
    await expect(
      handleApplyPaperNewerScan(deps, TEACHER, target)
    ).resolves.toEqual({
      scanId: 'scan2',
      paperTranscript: 'pending',
      jobId: 'scan2_3_1_0',
    });
    const answers = stub.get(RESPONSE)?.answers as Array<StubData>;
    expect(answers[1]).toMatchObject({
      answer: '',
      paperScanId: 'scan2',
      paperTranscript: 'pending',
      artifacts: [
        {
          id: 'hw_scan2_q1',
          kind: 'handwriting',
          storagePath: crop('q1', 'scan2'),
          mimeType: 'image/png',
        },
      ],
    });
    expect(stub.get(PRIV('q1'))).toEqual({
      scanId: 'scan2',
      status: 'pending',
      attempts: 0,
      charged: false,
      updatedAt: NOW,
    });
    const grading = stub.get(RESPONSE)?.grading as Record<string, StubData>;
    expect(grading.q1).toEqual({ pointsAwarded: 2, gradedBy: 't1' });
    expect(stub.get(`${JOBS}/scan2_3_1_0`)).toMatchObject({
      status: 'queued',
      attempt: 0,
      boxes: [{ questionId: 'q1', storagePath: crop('q1', 'scan2') }],
    });
  });

  it('folds into an unfinished job on the same page', async () => {
    const { deps, stub } = makeDeps(
      newerSeed({
        [`${JOBS}/scan2_3_1_0`]: job('scan2', 1, 0, 'failed', ['q3']),
      }),
      scan2Crop
    );
    await expect(
      handleApplyPaperNewerScan(deps, TEACHER, target)
    ).resolves.toMatchObject({ jobId: 'scan2_3_1_1' });
    expect(stub.get(`${JOBS}/scan2_3_1_0`)).toMatchObject({
      status: 'superseded',
      supersededBy: 'scan2_3_1_1',
    });
    expect(
      (stub.get(`${JOBS}/scan2_3_1_1`)?.boxes as StubData[]).map(
        (b) => b.questionId
      )
    ).toEqual(['q3', 'q1']);
  });

  it('waits while the page is being transcribed', async () => {
    const { deps } = makeDeps(
      newerSeed({
        [`${JOBS}/scan2_3_1_0`]: job('scan2', 1, 0, 'running', ['q3'], {
          leaseUntil: NOW + 1000,
        }),
      }),
      scan2Crop
    );
    await expectCode(
      handleApplyPaperNewerScan(deps, TEACHER, target),
      'aborted'
    );
  });

  it('needs a newer scan and its image', async () => {
    const { deps } = makeDeps(seed(), scan2Crop);
    await expectCode(
      handleApplyPaperNewerScan(deps, TEACHER, target),
      'failed-precondition'
    );
    const { deps: noImage } = makeDeps(newerSeed());
    await expectCode(
      handleApplyPaperNewerScan(noImage, TEACHER, target),
      'failed-precondition'
    );
  });

  it('is teacher only', async () => {
    const { deps } = makeDeps(newerSeed(), scan2Crop);
    await expectCode(
      handleApplyPaperNewerScan(deps, OTHER_TEACHER, target),
      'permission-denied'
    );
    await expectCode(
      handleApplyPaperNewerScan(deps, STUDENT, target),
      'permission-denied'
    );
  });
});

describe('transcribePaperBlankV1', () => {
  const blank = { ...target, questionId: 'q2' };

  it('flips a blank answer to pending and queues the next attempt', async () => {
    const { deps, stub } = makeDeps(seed());
    await expect(
      handleTranscribePaperBlank(deps, TEACHER, blank)
    ).resolves.toEqual({ jobId: 'scan1_3_1_1' });
    const answers = stub.get(RESPONSE)?.answers as Array<StubData>;
    expect(answers[2]).toMatchObject({ paperTranscript: 'pending' });
    expect(stub.get(PRIV('q2'))).toMatchObject({
      status: 'pending',
      updatedAt: NOW,
    });
    expect(stub.get(`${JOBS}/scan1_3_1_1`)).toMatchObject({
      status: 'queued',
      attempt: 1,
      boxes: [{ questionId: 'q2', storagePath: crop('q2') }],
    });
    // A finished job is left alone.
    expect(stub.get(`${JOBS}/scan1_3_1_0`)?.status).toBe('done');
  });

  it('refuses an answer that is not blank', async () => {
    const { deps } = makeDeps(seed());
    await expectCode(
      handleTranscribePaperBlank(deps, TEACHER, target),
      'failed-precondition'
    );
  });

  it('is teacher only', async () => {
    const { deps } = makeDeps(seed());
    await expectCode(
      handleTranscribePaperBlank(deps, OTHER_TEACHER, blank),
      'permission-denied'
    );
    await expectCode(
      handleTranscribePaperBlank(deps, STUDENT, blank),
      'permission-denied'
    );
  });
});
