import { describe, it, expect } from 'vitest';
import type {
  PlcQuestionBankEntry,
  QuestionBankData,
  QuestionBankMetadata,
  QuizQuestion,
} from '@/types';
import {
  buildBankMetadata,
  mergeBankSources,
  plcBankHeader,
  plcBankHeaderPatch,
  stripUndefined,
  syncedBankPayload,
  withPlcId,
  withoutPlcId,
} from './questionBankRecords';

function q(id: string, targetIds: string[] = []): QuizQuestion {
  return {
    id,
    text: `Question ${id}`,
    type: 'MC',
    incorrectAnswers: ['b'],
    correctAnswer: 'a',
    timeLimit: 30,
    ...(targetIds.length > 0
      ? {
          targets: targetIds.map((tid) => ({
            id: tid,
            kind: 'personal' as const,
            label: tid,
          })),
        }
      : {}),
  };
}

const bank: QuestionBankData = {
  id: 'bank-1',
  title: 'Fractions',
  questions: [q('q1', ['t1']), q('q2'), q('q3', ['t1', 't2'])],
  targets: [{ id: 'bank-tag', kind: 'personal', label: 'Bank tag' }],
  createdAt: 100,
  updatedAt: 200,
};

function meta(
  overrides: Partial<QuestionBankMetadata> = {}
): QuestionBankMetadata {
  return {
    id: 'bank-1',
    title: 'Fractions',
    driveFileId: 'drive-1',
    questionCount: 3,
    targetIds: ['t1'],
    targetCounts: { t1: 2 },
    createdAt: 100,
    updatedAt: 200,
    ...overrides,
  };
}

function entry(
  overrides: Partial<PlcQuestionBankEntry> = {}
): PlcQuestionBankEntry {
  return {
    id: 'entry-1',
    title: 'Shared',
    questionCount: 4,
    syncGroupId: 'group-x',
    targetIds: ['t9'],
    sharedBy: 'uid-b',
    sharedByEmail: 'b@school.org',
    sharedByName: 'Teacher B',
    sharedAt: 50,
    updatedAt: 50,
    ...overrides,
  };
}

describe('stripUndefined', () => {
  it('drops undefined keys and keeps null', () => {
    expect(stripUndefined({ a: 1, b: undefined, c: null })).toEqual({
      a: 1,
      c: null,
    });
  });
});

describe('buildBankMetadata', () => {
  it('indexes targets, counts questions and never writes undefined', () => {
    const m = buildBankMetadata(bank, 'drive-9');
    expect(m.driveFileId).toBe('drive-9');
    expect(m.questionCount).toBe(3);
    expect(m.targetIds).toEqual(['bank-tag', 't1', 't2']);
    expect(m.targetCounts).toEqual({ 'bank-tag': 3, t1: 2, t2: 1 });
    expect(m.searchText).toContain('question q1');
    expect(Object.values(m)).not.toContain(undefined);
    expect('sync' in m).toBe(false);
  });

  it('preserves folderId, order and a cloned sync linkage', () => {
    const sync = { groupId: 'g', plcIds: ['p1'] };
    const m = buildBankMetadata(bank, 'drive-9', {
      folderId: 'f1',
      order: 2,
      sync,
    });
    expect(m.folderId).toBe('f1');
    expect(m.order).toBe(2);
    expect(m.sync).toEqual(sync);
    expect(m.sync).not.toBe(sync);
  });
});

describe('syncedBankPayload', () => {
  it('matches the rules allowlist and omits empty optional lists', () => {
    const p = syncedBankPayload(bank, {
      groupId: 'g1',
      ownerUid: 'uid-a',
      plcIds: ['p1'],
      version: 3,
      createdAt: 10,
      updatedAt: 20,
    });
    expect(Object.keys(p).sort()).toEqual(
      [
        'id',
        'ownerUid',
        'plcIds',
        'version',
        'title',
        'questions',
        'targets',
        'questionCount',
        'targetIds',
        'targetCounts',
        'createdAt',
        'updatedAt',
      ].sort()
    );
    expect(p.id).toBe('g1');
    expect(p.version).toBe(3);
    expect(p.targetIds).toEqual(['bank-tag', 't1', 't2']);
  });
});

describe('plc headers', () => {
  it('builds a header with lowercased email and no deletedAt', () => {
    const h = plcBankHeader(bank, {
      id: 'e1',
      syncGroupId: 'g1',
      sharedBy: 'uid-a',
      sharedByEmail: 'Teacher@School.ORG',
      sharedByName: 'Teacher A',
      now: 500,
    });
    expect(h).toEqual({
      id: 'e1',
      title: 'Fractions',
      questionCount: 3,
      syncGroupId: 'g1',
      targetIds: ['bank-tag', 't1', 't2'],
      sharedBy: 'uid-a',
      sharedByEmail: 'teacher@school.org',
      sharedByName: 'Teacher A',
      sharedAt: 500,
      updatedAt: 500,
    });
  });

  it('patches only the mutable mirror fields', () => {
    expect(Object.keys(plcBankHeaderPatch(bank, 7)).sort()).toEqual(
      ['questionCount', 'targetIds', 'title', 'updatedAt'].sort()
    );
  });
});

describe('sync linkage helpers', () => {
  it('withPlcId mints a linkage or appends without duplicates', () => {
    expect(withPlcId(undefined, 'g', 'p1')).toEqual({
      groupId: 'g',
      plcIds: ['p1'],
    });
    expect(withPlcId({ groupId: 'g', plcIds: ['p1'] }, 'g', 'p1')).toEqual({
      groupId: 'g',
      plcIds: ['p1'],
    });
    expect(withPlcId({ groupId: 'g', plcIds: ['p1'] }, 'g', 'p2')).toEqual({
      groupId: 'g',
      plcIds: ['p1', 'p2'],
    });
  });

  it('withoutPlcId returns undefined once the last PLC is removed', () => {
    expect(withoutPlcId({ groupId: 'g', plcIds: ['p1', 'p2'] }, 'p1')).toEqual({
      groupId: 'g',
      plcIds: ['p2'],
    });
    expect(
      withoutPlcId({ groupId: 'g', plcIds: ['p1'] }, 'p1')
    ).toBeUndefined();
  });
});

describe('mergeBankSources', () => {
  it('lists own banks first, keyed by group id when shared', () => {
    const own = [
      meta({ id: 'a', sync: { groupId: 'group-a', plcIds: ['p1'] } }),
      meta({ id: 'b', driveFileId: 'drive-b' }),
    ];
    const out = mergeBankSources(own, []);
    expect(out.map((s) => s.key)).toEqual(['group-a', 'b']);
    expect(out[0]).toMatchObject({
      kind: 'personal',
      bankId: 'a',
      syncGroupId: 'group-a',
    });
    expect('syncGroupId' in out[1]).toBe(false);
    expect(out[1].driveFileId).toBe('drive-b');
  });

  it('dedupes the owner’s own shared bank, deleted rows and repeated groups', () => {
    const own = [
      meta({ id: 'a', sync: { groupId: 'group-a', plcIds: ['p1'] } }),
    ];
    const shared = [
      {
        plcId: 'p1',
        plcName: 'Math',
        entry: entry({ syncGroupId: 'group-a' }),
      },
      {
        plcId: 'p1',
        plcName: 'Math',
        entry: entry({ id: 'e2', deletedAt: 9 }),
      },
      { plcId: 'p1', plcName: 'Math', entry: entry({ id: 'e3' }) },
      { plcId: 'p2', plcName: 'Sci', entry: entry({ id: 'e4' }) },
    ];
    const out = mergeBankSources(own, shared);
    expect(out).toHaveLength(2);
    expect(out[1]).toMatchObject({
      key: 'group-x',
      kind: 'plc',
      syncGroupId: 'group-x',
      plcId: 'p1',
      plcName: 'Math',
      sharedByName: 'Teacher B',
      questionCount: 4,
      targetIds: ['t9'],
    });
  });
});
