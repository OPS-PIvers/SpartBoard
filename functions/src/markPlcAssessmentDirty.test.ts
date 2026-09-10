import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('firebase-admin', () => ({
  apps: [{ name: '[DEFAULT]' }],
  initializeApp: vi.fn(),
  firestore: Object.assign(vi.fn(), {
    FieldValue: { serverTimestamp: vi.fn(() => 'SERVER_TS') },
  }),
}));
vi.mock('firebase-functions/v2', () => ({ setGlobalOptions: vi.fn() }));
vi.mock('firebase-functions/v2/scheduler', () => ({
  onSchedule: (_opts: unknown, handler: () => Promise<void>) => handler,
}));
vi.mock('firebase-functions/v2/firestore', () => ({
  onDocumentWritten: (_opts: unknown, handler: unknown) => handler,
}));
vi.mock('firebase-functions/logger', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));
vi.mock('./recomputePlcAssessments', () => ({
  recomputeOnePlcAssessment: vi.fn(() => Promise.resolve()),
}));

import { recomputeOnePlcAssessment } from './recomputePlcAssessments';
import {
  ensureAssessment,
  markDirty,
  markPlcAssessmentDirtyOnResponse,
  markPlcAssessmentDirtyOnSession,
  parseLinkedSession,
} from './markPlcAssessmentDirty';
import { makeStubFirestore, type StubData } from './testing/stubFirestore';
import * as admin from 'firebase-admin';

type Db = Parameters<typeof markDirty>[0];
type Handler = (event: {
  params: Record<string, string>;
  data?: {
    before: { exists: boolean; data: () => StubData | undefined };
    after: { exists: boolean; data: () => StubData | undefined };
  };
}) => Promise<void>;

const onSession = markPlcAssessmentDirtyOnSession as unknown as Handler;
const onResponse = markPlcAssessmentDirtyOnResponse as unknown as Handler;
const recompute = vi.mocked(recomputeOnePlcAssessment);

const NOW = 1_700_000_000_000;

const linkedSession: StubData = {
  teacherUid: 'tA',
  quizId: 'quiz-a',
  quizTitle: 'Unit 4 CFA',
  status: 'active',
  plcId: 'plc-1',
  syncGroupId: 'grp-1',
  publicQuestions: [],
};

function snap(data: StubData | null) {
  return { exists: data !== null, data: () => data ?? undefined };
}

function sessionEvent(before: StubData | null, after: StubData | null) {
  return {
    params: { sessionId: 'sess-a' },
    data: { before: snap(before), after: snap(after) },
  };
}

function responseEvent(before: StubData | null, after: StubData | null) {
  return {
    params: { sessionId: 'sess-a', responseKey: 'r1' },
    data: { before: snap(before), after: snap(after) },
  };
}

let stub: ReturnType<typeof makeStubFirestore>;

beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(NOW);
  recompute.mockClear();
  stub = makeStubFirestore({ 'quiz_sessions/sess-a': linkedSession });
  vi.mocked(admin.firestore).mockReturnValue(stub.db as never);
});

describe('parseLinkedSession', () => {
  it('returns null without plcId + syncGroupId', () => {
    expect(parseLinkedSession({ plcId: 'p' })).toBeNull();
    expect(parseLinkedSession({ syncGroupId: 'g' })).toBeNull();
    expect(parseLinkedSession(undefined)).toBeNull();
    expect(parseLinkedSession(linkedSession)).toMatchObject({
      plcId: 'plc-1',
      syncGroupId: 'grp-1',
      scorePublishedAt: null,
    });
  });
});

describe('ensureAssessment', () => {
  const session = parseLinkedSession(linkedSession)!;

  it('creates assessments/{syncGroupId} already dirty when none is live', async () => {
    const result = await ensureAssessment(
      stub.db as unknown as Db,
      'plc-1',
      'grp-1',
      session,
      NOW
    );
    expect(result).toEqual({ id: 'grp-1', created: true });
    expect(stub.get('plcs/plc-1/assessments/grp-1')).toEqual({
      id: 'grp-1',
      title: 'Unit 4 CFA',
      kind: 'quiz',
      syncGroupId: 'grp-1',
      status: 'active',
      createdBy: 'tA',
      createdAt: 'SERVER_TS',
      updatedAt: 'SERVER_TS',
      sourceQuizId: 'quiz-a',
      dirtyAt: NOW,
    });
  });

  it('defaults the title when the session has none', async () => {
    await ensureAssessment(
      stub.db as unknown as Db,
      'plc-1',
      'grp-1',
      { ...session, quizTitle: '' },
      NOW
    );
    expect(stub.get('plcs/plc-1/assessments/grp-1')?.title).toBe(
      'Untitled assessment'
    );
  });

  it('picks the smallest live id when several match and ignores tombstones', async () => {
    stub.store.set('plcs/plc-1/assessments/zzz', { syncGroupId: 'grp-1' });
    stub.store.set('plcs/plc-1/assessments/mmm', { syncGroupId: 'grp-1' });
    stub.store.set('plcs/plc-1/assessments/aaa', {
      syncGroupId: 'grp-1',
      deletedAt: 5,
    });
    const result = await ensureAssessment(
      stub.db as unknown as Db,
      'plc-1',
      'grp-1',
      session,
      NOW
    );
    expect(result).toEqual({ id: 'mmm', created: false });
    expect(stub.has('plcs/plc-1/assessments/grp-1')).toBe(false);
  });

  it('swallows ALREADY_EXISTS from a concurrent create', async () => {
    stub.hooks.beforeWrite = (op, path) => {
      if (op === 'create') {
        stub.hooks.beforeWrite = undefined;
        stub.store.set(path, { syncGroupId: 'grp-1', dirtyAt: 1 });
      }
    };
    const result = await ensureAssessment(
      stub.db as unknown as Db,
      'plc-1',
      'grp-1',
      session,
      NOW
    );
    expect(result).toEqual({ id: 'grp-1', created: false });
  });
});

describe('markDirty', () => {
  const session = parseLinkedSession(linkedSession)!;

  it('sets dirtyAt only when unset', async () => {
    stub.store.set('plcs/plc-1/assessments/grp-1', {
      syncGroupId: 'grp-1',
      dirtyAt: null,
    });
    await markDirty(stub.db as unknown as Db, 'plc-1', 'grp-1', session, NOW);
    expect(stub.get('plcs/plc-1/assessments/grp-1')?.dirtyAt).toBe(NOW);

    const before = stub.writes.length;
    await markDirty(
      stub.db as unknown as Db,
      'plc-1',
      'grp-1',
      session,
      NOW + 1
    );
    expect(stub.writes.length).toBe(before);
    expect(stub.get('plcs/plc-1/assessments/grp-1')?.dirtyAt).toBe(NOW);
  });

  it('creates the assessment when missing', async () => {
    const id = await markDirty(
      stub.db as unknown as Db,
      'plc-1',
      'grp-1',
      session,
      NOW
    );
    expect(id).toBe('grp-1');
    expect(stub.get('plcs/plc-1/assessments/grp-1')?.dirtyAt).toBe(NOW);
  });
});

describe('markPlcAssessmentDirtyOnResponse', () => {
  it('marks dirty on create, completion, and score changes only', async () => {
    stub.store.set('plcs/plc-1/assessments/grp-1', {
      syncGroupId: 'grp-1',
      dirtyAt: null,
    });
    const draft = { status: 'in-progress', score: null, answers: [] };

    await onResponse(
      responseEvent(draft, { ...draft, answers: [{ questionId: 'q1' }] })
    );
    expect(stub.get('plcs/plc-1/assessments/grp-1')?.dirtyAt).toBeNull();

    await onResponse(responseEvent(draft, { ...draft, status: 'completed' }));
    expect(stub.get('plcs/plc-1/assessments/grp-1')?.dirtyAt).toBe(NOW);

    stub.store.set('plcs/plc-1/assessments/grp-1', {
      syncGroupId: 'grp-1',
      dirtyAt: null,
    });
    await onResponse(
      responseEvent(
        { ...draft, status: 'completed' },
        { ...draft, status: 'completed', score: 80 }
      )
    );
    expect(stub.get('plcs/plc-1/assessments/grp-1')?.dirtyAt).toBe(NOW);

    stub.store.set('plcs/plc-1/assessments/grp-1', {
      syncGroupId: 'grp-1',
      dirtyAt: null,
    });
    await onResponse(responseEvent(null, draft));
    expect(stub.get('plcs/plc-1/assessments/grp-1')?.dirtyAt).toBe(NOW);

    stub.store.set('plcs/plc-1/assessments/grp-1', {
      syncGroupId: 'grp-1',
      dirtyAt: null,
    });
    await onResponse(responseEvent(draft, null));
    expect(stub.get('plcs/plc-1/assessments/grp-1')?.dirtyAt).toBe(NOW);
  });

  it('does nothing for a session without PLC linkage', async () => {
    stub.store.set('quiz_sessions/sess-a', {
      teacherUid: 'tA',
      status: 'active',
    });
    await onResponse(responseEvent(null, { status: 'completed' }));
    expect(stub.writes).toEqual([]);
  });

  it('never throws when the session read fails', async () => {
    stub.db.collection = (() => {
      throw new Error('firestore down');
    }) as typeof stub.db.collection;
    await expect(
      onResponse(responseEvent(null, { status: 'completed' }))
    ).resolves.toBeUndefined();
  });
});

describe('markPlcAssessmentDirtyOnSession', () => {
  it('creates the assessment and recomputes immediately when a session is first linked', async () => {
    await onSession(sessionEvent(null, linkedSession));
    expect(stub.get('plcs/plc-1/assessments/grp-1')?.dirtyAt).toBe(NOW);
    expect(recompute).toHaveBeenCalledWith(stub.db, 'plc-1', 'grp-1');
  });

  it('only marks dirty on an unrelated session update', async () => {
    stub.store.set('plcs/plc-1/assessments/grp-1', {
      syncGroupId: 'grp-1',
      dirtyAt: null,
    });
    await onSession(
      sessionEvent(linkedSession, { ...linkedSession, currentQuestionIndex: 3 })
    );
    expect(stub.get('plcs/plc-1/assessments/grp-1')?.dirtyAt).toBe(NOW);
    expect(recompute).not.toHaveBeenCalled();
  });

  it('recomputes immediately when scores publish or the session ends', async () => {
    stub.store.set('plcs/plc-1/assessments/grp-1', {
      syncGroupId: 'grp-1',
      dirtyAt: 1,
    });
    await onSession(
      sessionEvent(linkedSession, { ...linkedSession, scorePublishedAt: NOW })
    );
    expect(recompute).toHaveBeenCalledTimes(1);

    await onSession(
      sessionEvent(linkedSession, { ...linkedSession, status: 'ended' })
    );
    expect(recompute).toHaveBeenCalledTimes(2);

    await onSession(
      sessionEvent(
        { ...linkedSession, status: 'ended' },
        { ...linkedSession, status: 'ended' }
      )
    );
    expect(recompute).toHaveBeenCalledTimes(2);
  });

  it('recomputes the old pair when the PLC link is removed, without creating an assessment', async () => {
    stub.store.set('plcs/plc-1/assessments/grp-1', {
      syncGroupId: 'grp-1',
      dirtyAt: null,
    });
    const { plcId: _plcId, ...unlinked } = linkedSession;
    void _plcId;
    await onSession(sessionEvent(linkedSession, unlinked));
    expect(stub.get('plcs/plc-1/assessments/grp-1')?.dirtyAt).toBe(NOW);
    expect(recompute).toHaveBeenCalledWith(stub.db, 'plc-1', 'grp-1');
  });

  it('handles a delete of a linked session whose assessment is already gone', async () => {
    await onSession(sessionEvent(linkedSession, null));
    expect(stub.has('plcs/plc-1/assessments/grp-1')).toBe(false);
    expect(recompute).not.toHaveBeenCalled();
  });

  it('touches both pairs when a session moves between PLCs', async () => {
    stub.store.set('plcs/plc-1/assessments/grp-1', {
      syncGroupId: 'grp-1',
      dirtyAt: null,
    });
    await onSession(
      sessionEvent(linkedSession, { ...linkedSession, plcId: 'plc-2' })
    );
    expect(stub.get('plcs/plc-1/assessments/grp-1')?.dirtyAt).toBe(NOW);
    expect(stub.get('plcs/plc-2/assessments/grp-1')?.dirtyAt).toBe(NOW);
    expect(recompute).toHaveBeenCalledTimes(2);
  });

  it('ignores sessions that were never linked', async () => {
    await onSession(sessionEvent({ status: 'active' }, { status: 'ended' }));
    expect(stub.writes).toEqual([]);
    expect(recompute).not.toHaveBeenCalled();
  });

  it('never throws when the recompute fails', async () => {
    recompute.mockRejectedValueOnce(new Error('boom'));
    await expect(
      onSession(sessionEvent(null, linkedSession))
    ).resolves.toBeUndefined();
  });
});
