import { describe, it, expect } from 'vitest';
import {
  buildVideoActivitySessionDoc,
  type BuildVideoActivitySessionDocInput,
} from '@/utils/videoActivitySessionDoc';
import type { VideoActivityQuestion } from '@/types';

const question = {
  id: 'q1',
  timestamp: 12,
  type: 'MC',
  text: 'Which?',
  correctAnswer: 'A',
  incorrectAnswers: ['B'],
  timeLimit: 0,
} as unknown as VideoActivityQuestion;

const base = (
  over: Partial<BuildVideoActivitySessionDocInput> = {}
): BuildVideoActivitySessionDocInput => ({
  sessionId: 's1',
  activity: {
    id: 'a1',
    title: 'Cells',
    youtubeUrl: 'https://youtube.com/watch?v=x',
    questions: [question],
  },
  teacherUid: 't1',
  assignmentName: 'Cells P2',
  settings: {
    autoPlay: true,
    requireCorrectAnswer: true,
    allowSkipping: false,
  },
  sessionOptions: { blockCopyPaste: true, focusLevel: 'lock' },
  status: 'active',
  now: 1000,
  gates: {
    tabAwayTimerOn: false,
    pageProtectionsOn: false,
    allowAnonymousJoin: true,
  },
  ...over,
});

describe('buildVideoActivitySessionDoc', () => {
  it('strips page protections when the admin gate is off', () => {
    const { session } = buildVideoActivitySessionDoc(base());
    expect(session.sessionOptions).not.toHaveProperty('blockCopyPaste');
    expect(session.sessionOptions).not.toHaveProperty('blockPrint');
    expect(session.sessionOptions).not.toHaveProperty('focusLevel');
    expect(session.sessionOptions).not.toHaveProperty('tabAwayLimitSeconds');
  });

  it('blocks print with copy and paste when the gate is on', () => {
    const { session } = buildVideoActivitySessionDoc(
      base({
        gates: {
          tabAwayTimerOn: true,
          pageProtectionsOn: true,
          allowAnonymousJoin: false,
        },
      })
    );
    expect(session.sessionOptions).toMatchObject({
      blockCopyPaste: true,
      blockPrint: true,
      focusLevel: 'lock',
      tabAwayAutoSubmit: false,
    });
    expect(session.sessionOptions?.tabAwayLimitSeconds).toEqual(
      expect.any(Number)
    );
    expect(session.allowAnonymousJoin).toBe(false);
  });

  it('writes the window on the session', () => {
    const { session } = buildVideoActivitySessionDoc(
      base({
        window: { openAt: 10, closeAt: 20, dueAt: 30, workKind: 'resource' },
      })
    );
    expect(session).toMatchObject({
      openAt: 10,
      closeAt: 20,
      dueAt: 30,
      workKind: 'resource',
    });
  });

  it('keeps only the due date on a per-period session', () => {
    const docs = buildVideoActivitySessionDoc(
      base({
        window: { openAt: 10, closeAt: 20, dueAt: 30 },
        periodGate: { accessMode: 'assessment', periodAccess: {} },
      })
    );
    expect(docs.session.openAt).toBeUndefined();
    expect(docs.session.closeAt).toBeUndefined();
    expect(docs.session.dueAt).toBe(30);
    expect(docs.session.publicQuestions).toEqual([]);
    expect(docs.content?.publicQuestions).toHaveLength(1);
  });

  it('keeps the answer key off the session doc', () => {
    const docs = buildVideoActivitySessionDoc(base());
    expect(docs.session.questions).toEqual([]);
    expect(docs.key.questions[0].correctAnswer).toBe('A');
    expect(docs.content).toBeUndefined();
  });

  it('stamps endedAt on a session created ended', () => {
    const { session } = buildVideoActivitySessionDoc(base({ status: 'ended' }));
    expect(session.status).toBe('ended');
    expect(session.endedAt).toBe(1000);
  });

  it('starts a live run waiting with self-paced rules forced off', () => {
    const { session } = buildVideoActivitySessionDoc(
      base({
        sessionMode: 'teacher',
        sessionOptions: { attemptLimit: 3, rewindOnIncorrectSeconds: 10 },
      })
    );
    expect(session.status).toBe('waiting');
    expect(session.sessionMode).toBe('teacher');
    expect(session.settings).toEqual({
      autoPlay: false,
      requireCorrectAnswer: false,
      allowSkipping: true,
    });
    expect(session.sessionOptions).toMatchObject({
      attemptLimit: 1,
      rewindOnIncorrectSeconds: 0,
      pointPenaltyOnIncorrect: 0,
    });
  });

  it('mirrors the first class id for older rules', () => {
    const { session } = buildVideoActivitySessionDoc(
      base({ classIds: ['c1', 'c2'], mode: 'view-only' })
    );
    expect(session.classId).toBe('c1');
    expect(session.mode).toBe('view-only');
  });
});
