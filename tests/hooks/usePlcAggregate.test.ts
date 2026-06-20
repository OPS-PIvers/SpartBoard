import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { collection, onSnapshot } from 'firebase/firestore';
import { usePlcAggregate, parsePlcAggregate } from '@/hooks/usePlcAggregate';

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  onSnapshot: vi.fn(),
}));

vi.mock('@/config/firebase', () => ({
  db: { __mock: 'db' },
  isAuthBypass: false,
}));

vi.mock('@/utils/logError', () => ({ logError: vi.fn() }));

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ user: { uid: 'me' } }),
}));

vi.mock('@/context/usePlcContext', () => ({
  usePlcSubcollection: () => null,
}));

const mockCollection = collection as Mock;
const mockOnSnapshot = onSnapshot as Mock;

const PLC_ID = 'plc-1';

function fakeSnap(docs: Array<{ id: string; data: Record<string, unknown> }>) {
  return {
    forEach: (fn: (d: { id: string; data: () => unknown }) => void) => {
      for (const d of docs) fn({ id: d.id, data: () => d.data });
    },
  };
}

function renderWithCapturedSnapshot() {
  let onNext: (snap: unknown) => void = () => undefined;
  let onError: (err: Error) => void = () => undefined;
  mockOnSnapshot.mockImplementation((_ref, next, err) => {
    onNext = next as (snap: unknown) => void;
    onError = err as (e: Error) => void;
    return () => undefined;
  });
  const rendered = renderHook(() => usePlcAggregate(PLC_ID));
  return {
    ...rendered,
    emit: (docs: Array<{ id: string; data: Record<string, unknown> }>) =>
      act(() => onNext(fakeSnap(docs))),
    emitError: (message: string) => act(() => onError(new Error(message))),
  };
}

function ts(millis: number) {
  return { toMillis: () => millis };
}

function validAggregateData(over: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    teacherCount: 2,
    studentCount: 40,
    teamAveragePercent: 78,
    perQuestion: [
      { questionId: 'q1', text: 'Q1', correctPercent: 80, points: 1 },
      { questionId: 'q2', text: 'Q2', correctPercent: 60, points: 2 },
    ],
    perTeacher: [
      {
        teacherUid: 'tA',
        teacherName: 'Teacher A',
        classCount: 2,
        averagePercent: 82,
        studentCount: 22,
      },
    ],
    ranAt: 1718764800000,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCollection.mockImplementation((_db: unknown, ...segs: string[]) =>
    segs.join('/')
  );
});

describe('parsePlcAggregate — tolerant parsing', () => {
  it('parses a fully valid doc and keys assessmentId off the doc id', () => {
    const parsed = parsePlcAggregate('assess-7', validAggregateData());
    expect(parsed).not.toBeNull();
    expect(parsed?.assessmentId).toBe('assess-7');
    expect(parsed?.schemaVersion).toBe(1);
    expect(parsed?.teacherCount).toBe(2);
    expect(parsed?.studentCount).toBe(40);
    expect(parsed?.teamAveragePercent).toBe(78);
    expect(parsed?.perQuestion).toHaveLength(2);
    expect(parsed?.perTeacher[0]?.teacherUid).toBe('tA');
    expect(parsed?.ranAt).toBe(1718764800000);
  });

  it('prefers the doc id over a (conflicting) stored assessmentId', () => {
    const parsed = parsePlcAggregate(
      'canonical-id',
      validAggregateData({ assessmentId: 'stale-id' })
    );
    expect(parsed?.assessmentId).toBe('canonical-id');
  });

  it('resolves a serverTimestamp()-backed ranAt to millis', () => {
    const parsed = parsePlcAggregate(
      'a',
      validAggregateData({ ranAt: ts(123456) })
    );
    expect(parsed?.ranAt).toBe(123456);
  });

  it('resolves a pending (unresolved) ranAt to 0 — the updating window', () => {
    const parsed = parsePlcAggregate('a', validAggregateData({ ranAt: null }));
    expect(parsed?.ranAt).toBe(0);
  });

  it('never emits student names (anonymized perTeacher rows)', () => {
    const parsed = parsePlcAggregate('a', validAggregateData());
    const serialized = JSON.stringify(parsed);
    expect(serialized).not.toContain('studentDisplayName');
    for (const row of parsed?.perTeacher ?? []) {
      expect(row).not.toHaveProperty('studentDisplayName');
      expect(row).toHaveProperty('studentCount');
    }
  });
});

describe('parsePlcAggregate — rejection of malformed docs', () => {
  it('rejects a non-number schemaVersion', () => {
    expect(
      parsePlcAggregate('a', validAggregateData({ schemaVersion: 'one' }))
    ).toBeNull();
  });
  it('rejects when perQuestion is not an array', () => {
    expect(
      parsePlcAggregate('a', validAggregateData({ perQuestion: {} }))
    ).toBeNull();
  });
  it('rejects the WHOLE doc when a perQuestion entry is malformed', () => {
    expect(
      parsePlcAggregate(
        'a',
        validAggregateData({
          perQuestion: [
            { questionId: 'q1', text: 'Q1', correctPercent: 80, points: 1 },
            { questionId: 'q2', text: 'Q2', correctPercent: 'high', points: 2 },
          ],
        })
      )
    ).toBeNull();
  });
  it('rejects the WHOLE doc when a perTeacher entry is malformed', () => {
    expect(
      parsePlcAggregate(
        'a',
        validAggregateData({
          perTeacher: [
            {
              teacherUid: 'tA',
              teacherName: 'A',
              classCount: 1,
              averagePercent: 50,
              // studentCount missing → reject
            },
          ],
        })
      )
    ).toBeNull();
  });
});

describe('usePlcAggregate — listener wiring + selectors', () => {
  it('subscribes to the aggregates subcollection (no orderBy)', () => {
    mockOnSnapshot.mockReturnValue(() => undefined);
    renderHook(() => usePlcAggregate(PLC_ID));
    expect(mockCollection).toHaveBeenCalledWith(
      { __mock: 'db' },
      'plcs',
      PLC_ID,
      'aggregates'
    );
    expect(mockOnSnapshot).toHaveBeenCalledTimes(1);
  });

  it('sorts the list by assessmentId and builds the by-id map', () => {
    const { result, emit } = renderWithCapturedSnapshot();
    emit([
      { id: 'zeta', data: validAggregateData() },
      { id: 'alpha', data: validAggregateData() },
    ]);
    expect(result.current.aggregates.map((a) => a.assessmentId)).toEqual([
      'alpha',
      'zeta',
    ]);
    expect(Object.keys(result.current.aggregatesById).sort()).toEqual([
      'alpha',
      'zeta',
    ]);
    expect(result.current.aggregatesById['alpha']?.assessmentId).toBe('alpha');
    expect(result.current.loading).toBe(false);
  });

  it('drops malformed docs but keeps valid siblings', () => {
    const { result, emit } = renderWithCapturedSnapshot();
    emit([
      { id: 'bad', data: { schemaVersion: 'nope' } },
      { id: 'good', data: validAggregateData() },
    ]);
    expect(result.current.aggregates).toHaveLength(1);
    expect(result.current.aggregates[0]?.assessmentId).toBe('good');
  });

  it('sets error and clears it on recovery', () => {
    const { result, emit, emitError } = renderWithCapturedSnapshot();
    emitError('boom');
    expect(result.current.error?.message).toBe('boom');
    emit([{ id: 'a', data: validAggregateData() }]);
    expect(result.current.error).toBeNull();
    expect(result.current.aggregates).toHaveLength(1);
  });
});

describe('usePlcAggregate — idle path', () => {
  it('stays idle and does not subscribe when plcId is null', () => {
    const { result } = renderHook(() => usePlcAggregate(null));
    expect(result.current.loading).toBe(false);
    expect(result.current.aggregates).toHaveLength(0);
    expect(result.current.aggregatesById).toEqual({});
    expect(mockOnSnapshot).not.toHaveBeenCalled();
  });
});
