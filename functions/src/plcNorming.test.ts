// Unit tests for PLC norming flags: anonymized copies, pointers and lifecycle cleanup.
import { describe, it, expect, vi } from 'vitest';

vi.mock('firebase-admin', () => ({
  apps: [{ name: '[DEFAULT]' }],
  initializeApp: vi.fn(),
  storage: vi.fn(),
  firestore: vi.fn(),
}));
vi.mock('firebase-functions/v2/https', () => {
  class FakeHttpsError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  }
  return { onCall: (_o: unknown, h: unknown) => h, HttpsError: FakeHttpsError };
});
vi.mock('firebase-functions/v2/firestore', () => ({
  onDocumentWritten: (_o: unknown, h: unknown) => h,
  onDocumentDeleted: (_o: unknown, h: unknown) => h,
}));
vi.mock('firebase-functions/logger', () => ({ warn: vi.fn(), error: vi.fn() }));
vi.mock('ffmpeg-static', () => ({ default: '/usr/bin/ffmpeg' }));
vi.mock('fluent-ffmpeg', () => ({
  default: Object.assign(vi.fn(), { setFfmpegPath: vi.fn() }),
}));
vi.mock('./functionsInit', () => ({}));
vi.mock('./classlinkShared', () => ({ ALLOWED_ORIGINS: [] }));
vi.mock('./googleOAuth', () => ({ refreshGoogleAccessTokenForUid: vi.fn() }));
vi.mock('./quizMediaArchive', () => ({
  isGlobalFeatureGranted: vi.fn(),
  QUIZ_MEDIA_GOOGLE_SECRETS: [],
  QUIZ_MEDIA_STORAGE_ROOT: 'quiz_response_media',
}));
vi.mock('./getQuizArtifactPlaybackUrl', () => ({
  downloadDriveFileById: vi.fn(),
}));

import {
  canFlagInPlc,
  cleanupNormingForMembers,
  cleanupNormingForPlc,
  cleanupNormingForResponse,
  cleanupNormingSourcesForSession,
  departedMemberUids,
  extractNormingContent,
  normingSourceId,
  parseNormingRequest,
  setPlcNormingFlag,
  type NormingDeps,
} from './plcNorming';
import { makeStubFirestore, type StubData } from './testing/stubFirestore';

const T = 'teacher-1';
const SESSION = 'sess-1';
const KEY = 'pin-3rd-1234';
const PLC = 'plc-1';

function seed(
  overrides: Record<string, StubData> = {}
): Record<string, StubData> {
  return {
    [`quiz_sessions/${SESSION}`]: {
      teacherUid: T,
      plcId: PLC,
      syncGroupId: 'grp-1',
      publicQuestions: [
        { id: 'q0', type: 'MC', text: 'Pick one' },
        { id: 'q1', type: 'free-response', text: 'Explain photosynthesis.' },
      ],
    },
    [`quiz_sessions/${SESSION}/responses/${KEY}`]: {
      studentUid: 'student-uid-9',
      pin: '1234',
      classPeriod: '3rd',
      answers: [
        {
          questionId: 'q1',
          answer: 'Plants make food from light.',
          status: 'submitted',
          answeredAt: 5,
        },
      ],
    },
    [`plcs/${PLC}`]: {
      memberUids: [T, 'teacher-2', 'viewer-1'],
      members: {
        [T]: {
          role: 'member',
          status: 'active',
          displayName: 'Ms. Rivera',
          email: 't1@x.org',
        },
        'viewer-1': { role: 'viewer', status: 'active' },
      },
    },
    [`plcs/${PLC}/assessments/grp-1`]: {
      syncGroupId: 'grp-1',
      deletedAt: null,
    },
    ...overrides,
  };
}

function setup(overrides: Record<string, StubData> = {}) {
  const stub = makeStubFirestore(seed(overrides));
  const saved = new Map<string, Buffer>();
  const deleted: string[] = [];
  let n = 0;
  const deps: NormingDeps = {
    db: stub.db as unknown as NormingDeps['db'],
    isFeatureGranted: vi.fn(() => Promise.resolve(true)),
    newId: () => `norm${++n}`,
    now: () => 1000,
    readTransit: vi.fn(() => Promise.resolve(null)),
    readDrive: vi.fn(() => Promise.resolve(Buffer.from('drive-audio'))),
    stripAudio: vi.fn((b: Buffer) =>
      Promise.resolve(Buffer.concat([Buffer.from('m4a:'), b]))
    ),
    saveAudio: vi.fn((p: string, b: Buffer) => {
      saved.set(p, b);
      return Promise.resolve();
    }),
    deleteAudio: vi.fn((p: string) => {
      deleted.push(p);
      return Promise.resolve();
    }),
  };
  return { stub, deps, saved, deleted };
}

const flag = (
  level: 'high' | 'medium' | 'low' | 'review' | null,
  slot = 'primary'
) =>
  parseNormingRequest({
    sessionId: SESSION,
    responseKey: KEY,
    questionId: 'q1',
    slot,
    level,
  });

const sourcePath = (slot = 'primary') =>
  `plc_norming_sources/${normingSourceId(T, SESSION, KEY, 'q1', slot)}`;

describe('parseNormingRequest', () => {
  it('rejects unknown levels, slots and path-like ids', () => {
    expect(() =>
      parseNormingRequest({
        sessionId: 's',
        responseKey: 'k',
        questionId: 'q',
        level: 'top',
      })
    ).toThrow();
    expect(() =>
      parseNormingRequest({
        sessionId: 's',
        responseKey: 'k',
        questionId: 'q',
        slot: 'x',
        level: 'high',
      })
    ).toThrow();
    expect(() =>
      parseNormingRequest({
        sessionId: 'a/b',
        responseKey: 'k',
        questionId: 'q',
        level: 'high',
      })
    ).toThrow();
    expect(() =>
      parseNormingRequest({ plcId: 'p', normingId: 'n', level: 'high' })
    ).toThrow();
  });
});

describe('canFlagInPlc', () => {
  it('allows editing members and legacy map-less members, denies viewers and outsiders', () => {
    const plc = seed()[`plcs/${PLC}`];
    expect(canFlagInPlc(plc, T)).toBe(true);
    expect(canFlagInPlc(plc, 'teacher-2')).toBe(true);
    expect(canFlagInPlc(plc, 'viewer-1')).toBe(false);
    expect(canFlagInPlc(plc, 'stranger')).toBe(false);
    expect(canFlagInPlc(undefined, T)).toBe(false);
  });
});

describe('extractNormingContent', () => {
  const session = seed()[`quiz_sessions/${SESSION}`];
  it('refuses non free-response questions and drafts', () => {
    const response = { answers: [{ questionId: 'q0', answer: 'A' }] };
    expect(() =>
      extractNormingContent(session, response, SESSION, KEY, 'q0', 'primary')
    ).toThrow();
    const draft = {
      answers: [{ questionId: 'q1', answer: 'x', status: 'draft' }],
    };
    expect(() =>
      extractNormingContent(session, draft, SESSION, KEY, 'q1', 'primary')
    ).toThrow();
  });

  it('truncates long text and marks it', () => {
    const long = 'a'.repeat(20_050);
    const out = extractNormingContent(
      session,
      { answers: [{ questionId: 'q1', answer: long }] },
      SESSION,
      KEY,
      'q1',
      'primary'
    );
    expect(out).toMatchObject({ kind: 'text', truncated: true });
    expect(out.kind === 'text' && out.answerText.length).toBe(20_000);
  });

  it('ignores a storage path outside this response and a deleted recording', () => {
    const response = {
      answers: [
        {
          questionId: 'q1',
          answer: '',
          artifacts: [
            {
              id: 'a1',
              kind: 'audio',
              slot: 'primary',
              storagePath: 'quiz_response_media/other/key/a1.webm',
            },
          ],
        },
      ],
    };
    const out = extractNormingContent(
      session,
      response,
      SESSION,
      KEY,
      'q1',
      'primary'
    );
    expect(out).toMatchObject({
      kind: 'audio',
      storagePath: null,
      driveFileId: null,
    });
    const gone = {
      ...response,
      artifactArchive: { a1: { archiveStatus: 'deleted' } },
    };
    expect(() =>
      extractNormingContent(session, gone, SESSION, KEY, 'q1', 'primary')
    ).toThrow();
  });

  it('copies a handwritten transcript as text with no crop reference', () => {
    const crop = {
      id: 'hw_scan1_q1',
      kind: 'handwriting',
      slot: 'primary',
      storagePath: 'paper_crops/t/scan1/q1.png',
    };
    const out = extractNormingContent(
      session,
      {
        answers: [
          {
            questionId: 'q1',
            answer: '<p>Plants need light.</p>',
            paperScanId: 'scan1',
            paperTranscript: 'done',
            artifacts: [crop],
          },
        ],
      },
      SESSION,
      KEY,
      'q1',
      'primary'
    );
    expect(out).toEqual({
      kind: 'text',
      questionIndex: 1,
      questionText: 'Explain photosynthesis.',
      answerText: '<p>Plants need light.</p>',
      truncated: false,
    });
    expect(JSON.stringify(out)).not.toMatch(/hw_scan1|paper_crops|scan1/);
    const pending = {
      answers: [
        {
          questionId: 'q1',
          answer: '',
          paperTranscript: 'pending',
          artifacts: [crop],
        },
      ],
    };
    expect(() =>
      extractNormingContent(session, pending, SESSION, KEY, 'q1', 'primary')
    ).toThrow('still being transcribed');
  });
});

describe('setPlcNormingFlag', () => {
  it('writes an anonymized copy and a private pointer', async () => {
    const { stub, deps } = setup();
    const out = await setPlcNormingFlag(flag('high'), T, 't1@x.org', deps);
    expect(out).toEqual({ normingId: 'norm1', level: 'high' });
    const copy = stub.get(`plcs/${PLC}/norming/norm1`)!;
    expect(copy).toMatchObject({
      assessmentId: 'grp-1',
      questionId: 'q1',
      questionText: 'Explain photosynthesis.',
      answerText: 'Plants make food from light.',
      kind: 'text',
      level: 'high',
      flaggedByName: 'Ms. Rivera',
    });
    const text = JSON.stringify(copy);
    for (const secret of [SESSION, KEY, 'student-uid-9', '1234', '3rd']) {
      expect(text).not.toContain(secret);
    }
    expect(stub.get(sourcePath())).toMatchObject({
      normingId: 'norm1',
      sessionId: SESSION,
      responseKey: KEY,
    });
  });

  it('changes the level in place, then unflags', async () => {
    const { stub, deps } = setup();
    await setPlcNormingFlag(flag('high'), T, null, deps);
    await setPlcNormingFlag(flag('review'), T, null, deps);
    expect(stub.get(`plcs/${PLC}/norming/norm1`)?.level).toBe('review');
    await setPlcNormingFlag(flag(null), T, null, deps);
    expect(stub.has(`plcs/${PLC}/norming/norm1`)).toBe(false);
    expect(stub.has(sourcePath())).toBe(false);
  });

  it('denies another teacher, a viewer, a closed flag and an unlinked session', async () => {
    const { deps } = setup();
    await expect(
      setPlcNormingFlag(flag('high'), 'teacher-2', null, deps)
    ).rejects.toMatchObject({ code: 'permission-denied' });
    const viewer = setup({
      [`quiz_sessions/${SESSION}`]: {
        ...seed()[`quiz_sessions/${SESSION}`],
        teacherUid: 'viewer-1',
      },
    });
    await expect(
      setPlcNormingFlag(flag('high'), 'viewer-1', null, viewer.deps)
    ).rejects.toMatchObject({ code: 'permission-denied' });
    const off = setup();
    off.deps.isFeatureGranted = () => Promise.resolve(false);
    await expect(
      setPlcNormingFlag(flag('high'), T, null, off.deps)
    ).rejects.toMatchObject({ code: 'permission-denied' });
    const unlinked = setup({
      [`quiz_sessions/${SESSION}`]: {
        ...seed()[`quiz_sessions/${SESSION}`],
        plcId: '',
      },
    });
    await expect(
      setPlcNormingFlag(flag('high'), T, null, unlinked.deps)
    ).rejects.toMatchObject({ code: 'failed-precondition' });
  });

  it('copies archived audio from Drive to a random path and deletes it on unflag', async () => {
    const { stub, deps, saved, deleted } = setup({
      [`quiz_sessions/${SESSION}/responses/${KEY}`]: {
        studentUid: 'student-uid-9',
        answers: [
          {
            questionId: 'q1',
            answer: '',
            artifacts: [
              { id: 'art1', kind: 'audio', slot: 'primary', durationMs: 4000 },
            ],
          },
        ],
        artifactArchive: {
          art1: { archiveStatus: 'archived', driveFileId: 'drive-9' },
        },
      },
    });
    await setPlcNormingFlag(flag('low'), T, null, deps);
    expect(deps.readDrive).toHaveBeenCalledWith(T, 'drive-9');
    expect(saved.get(`plc_norming_media/${PLC}/norm1.m4a`)?.toString()).toBe(
      'm4a:drive-audio'
    );
    const copy = stub.get(`plcs/${PLC}/norming/norm1`)!;
    expect(copy).toMatchObject({
      kind: 'audio',
      audioPath: `plc_norming_media/${PLC}/norm1.m4a`,
      mimeType: 'audio/mp4',
      durationMs: 4000,
    });
    expect(JSON.stringify(copy)).not.toContain('drive-9');
    await setPlcNormingFlag(flag(null), T, null, deps);
    expect(deleted).toContain(`plc_norming_media/${PLC}/norm1.m4a`);
  });

  it('deletes the upload when the transaction refuses', async () => {
    const { stub, deps, deleted } = setup({
      [`quiz_sessions/${SESSION}/responses/${KEY}`]: {
        answers: [
          {
            questionId: 'q1',
            artifacts: [
              {
                id: 'art1',
                kind: 'audio',
                slot: 'primary',
                storagePath: `quiz_response_media/${SESSION}/${KEY}/art1.webm`,
              },
            ],
          },
        ],
      },
    });
    deps.readTransit = () => Promise.resolve(Buffer.from('webm'));
    deps.saveAudio = () => {
      stub.store.set(`plcs/${PLC}/assessments/grp-1`, {
        syncGroupId: 'grp-1',
        deletedAt: 5,
      });
      return Promise.resolve();
    };
    await expect(
      setPlcNormingFlag(flag('high'), T, null, deps)
    ).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(deleted).toEqual([`plc_norming_media/${PLC}/norm1.m4a`]);
    expect(stub.has(`plcs/${PLC}/norming/norm1`)).toBe(false);
  });

  it('lets only the flagging teacher remove a copy from the PLC page', async () => {
    const { stub, deps } = setup();
    await setPlcNormingFlag(flag('high'), T, null, deps);
    const remove = parseNormingRequest({
      plcId: PLC,
      normingId: 'norm1',
      level: null,
    });
    await expect(
      setPlcNormingFlag(remove, 'teacher-2', null, deps)
    ).rejects.toMatchObject({ code: 'permission-denied' });
    await setPlcNormingFlag(remove, T, null, deps);
    expect(stub.has(`plcs/${PLC}/norming/norm1`)).toBe(false);
    expect(stub.has(sourcePath())).toBe(false);
  });
});

describe('cleanup', () => {
  const cleanupDeps = (
    stub: ReturnType<typeof makeStubFirestore>,
    deleted: string[],
    prefixes: string[] = []
  ) => ({
    db: stub.db as unknown as NormingDeps['db'],
    deleteAudio: (p: string) => {
      deleted.push(p);
      return Promise.resolve();
    },
    deleteAudioPrefix: (p: string) => {
      prefixes.push(p);
      return Promise.resolve();
    },
  });

  it('finds departed members', () => {
    expect(
      departedMemberUids({ memberUids: ['a', 'b', 'c'] }, { memberUids: ['a'] })
    ).toEqual(['b', 'c']);
    expect(
      departedMemberUids({ memberUids: ['a'] }, { memberUids: ['a', 'b'] })
    ).toEqual([]);
  });

  it("removes a leaver's copies, audio and pointers only", async () => {
    const stub = makeStubFirestore({
      [`plcs/${PLC}/norming/n1`]: {
        flaggedByUid: T,
        audioPath: 'plc_norming_media/plc-1/n1.m4a',
      },
      [`plcs/${PLC}/norming/n2`]: { flaggedByUid: 'teacher-2' },
      'plc_norming_sources/s1': { flaggedByUid: T, plcId: PLC },
      'plc_norming_sources/s2': { flaggedByUid: T, plcId: 'other' },
    });
    const deleted: string[] = [];
    await cleanupNormingForMembers(cleanupDeps(stub, deleted), PLC, [T]);
    expect(stub.has(`plcs/${PLC}/norming/n1`)).toBe(false);
    expect(stub.has(`plcs/${PLC}/norming/n2`)).toBe(true);
    expect(stub.has('plc_norming_sources/s1')).toBe(false);
    expect(stub.has('plc_norming_sources/s2')).toBe(true);
    expect(deleted).toEqual(['plc_norming_media/plc-1/n1.m4a']);
  });

  it('clears everything for a deleted PLC', async () => {
    const stub = makeStubFirestore({
      [`plcs/${PLC}/norming/n1`]: { flaggedByUid: T },
      'plc_norming_sources/s1': { flaggedByUid: T, plcId: PLC },
    });
    const prefixes: string[] = [];
    await cleanupNormingForPlc(cleanupDeps(stub, [], prefixes), PLC);
    expect(stub.has(`plcs/${PLC}/norming/n1`)).toBe(false);
    expect(stub.has('plc_norming_sources/s1')).toBe(false);
    expect(prefixes).toEqual([`plc_norming_media/${PLC}/`]);
  });

  it('drops audio copies of a deleted response and keeps text copies', async () => {
    const stub = makeStubFirestore({
      [`plcs/${PLC}/norming/audio`]: {
        kind: 'audio',
        audioPath: 'plc_norming_media/plc-1/audio.m4a',
      },
      [`plcs/${PLC}/norming/text`]: { kind: 'text' },
      'plc_norming_sources/sa': {
        sessionId: SESSION,
        responseKey: KEY,
        plcId: PLC,
        normingId: 'audio',
        questionId: 'q1',
      },
      'plc_norming_sources/st': {
        sessionId: SESSION,
        responseKey: KEY,
        plcId: PLC,
        normingId: 'text',
        questionId: 'q2',
      },
    });
    const deleted: string[] = [];
    await cleanupNormingForResponse(cleanupDeps(stub, deleted), SESSION, KEY);
    expect(stub.has(`plcs/${PLC}/norming/audio`)).toBe(false);
    expect(stub.has(`plcs/${PLC}/norming/text`)).toBe(true);
    expect(stub.has('plc_norming_sources/sa')).toBe(false);
    expect(stub.has('plc_norming_sources/st')).toBe(false);
    expect(deleted).toEqual(['plc_norming_media/plc-1/audio.m4a']);
  });

  it('drops audio copies when the session is deleted before its responses', async () => {
    const stub = makeStubFirestore({
      [`plcs/${PLC}/norming/audio`]: {
        kind: 'audio',
        audioPath: 'plc_norming_media/plc-1/audio.m4a',
      },
      [`plcs/${PLC}/norming/text`]: { kind: 'text' },
      'plc_norming_sources/sa': {
        sessionId: SESSION,
        responseKey: KEY,
        plcId: PLC,
        normingId: 'audio',
        questionId: 'q1',
      },
      'plc_norming_sources/st': {
        sessionId: SESSION,
        responseKey: 'other-key',
        plcId: PLC,
        normingId: 'text',
        questionId: 'q2',
      },
    });
    const deleted: string[] = [];
    await cleanupNormingSourcesForSession(cleanupDeps(stub, deleted), SESSION);
    expect(stub.has(`plcs/${PLC}/norming/audio`)).toBe(false);
    expect(stub.has(`plcs/${PLC}/norming/text`)).toBe(true);
    expect(stub.has('plc_norming_sources/sa')).toBe(false);
    expect(stub.has('plc_norming_sources/st')).toBe(false);
    expect(deleted).toEqual(['plc_norming_media/plc-1/audio.m4a']);
  });
});
