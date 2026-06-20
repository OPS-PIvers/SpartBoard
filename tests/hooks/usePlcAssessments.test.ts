import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import {
  usePlcAssessments,
  parsePlcAssessment,
} from '@/hooks/usePlcAssessments';

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  onSnapshot: vi.fn(),
  orderBy: vi.fn((field: string, dir: string) => ({ field, dir })),
  query: vi.fn((ref: unknown, ...rest: unknown[]) => ({ ref, rest })),
}));

vi.mock('@/config/firebase', () => ({
  db: { __mock: 'db' },
  isAuthBypass: false,
}));

vi.mock('@/utils/logError', () => ({ logError: vi.fn() }));

// The standalone path reads the signed-in user; the provider bridge returns
// null when no provider is mounted (the default in these unit tests).
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
  const rendered = renderHook(() => usePlcAssessments(PLC_ID));
  return {
    ...rendered,
    emit: (docs: Array<{ id: string; data: Record<string, unknown> }>) =>
      act(() => onNext(fakeSnap(docs))),
    emitError: (message: string) => act(() => onError(new Error(message))),
  };
}

/** A Firestore Timestamp-like stub for the tolerant-parse tests. */
function ts(millis: number) {
  return { toMillis: () => millis };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCollection.mockImplementation((_db: unknown, ...segs: string[]) =>
    segs.join('/')
  );
});

describe('parsePlcAssessment — tolerant parsing', () => {
  it('parses a fully valid doc with plain-number time fields', () => {
    const parsed = parsePlcAssessment('a1', {
      title: 'Unit 4 CFA',
      kind: 'quiz',
      syncGroupId: 'group-7',
      unitLabel: 'Unit 4',
      opensAt: 100,
      dueAt: 200,
      status: 'active',
      createdBy: 'teacher-1',
      createdAt: 10,
      updatedAt: 20,
    });
    expect(parsed).toEqual({
      id: 'a1',
      title: 'Unit 4 CFA',
      kind: 'quiz',
      syncGroupId: 'group-7',
      unitLabel: 'Unit 4',
      opensAt: 100,
      dueAt: 200,
      status: 'active',
      createdBy: 'teacher-1',
      createdAt: 10,
      updatedAt: 20,
    });
  });

  it('resolves serverTimestamp()-backed Timestamp time fields to millis', () => {
    const parsed = parsePlcAssessment('a1', {
      title: 'T',
      kind: 'video-activity',
      syncGroupId: 'g',
      status: 'planning',
      createdBy: 'u',
      createdAt: ts(1718764800000),
      updatedAt: ts(1718764900000),
    });
    expect(parsed?.createdAt).toBe(1718764800000);
    expect(parsed?.updatedAt).toBe(1718764900000);
  });

  it('resolves an unresolved pending serverTimestamp to 0', () => {
    const parsed = parsePlcAssessment('a1', {
      title: 'T',
      kind: 'quiz',
      syncGroupId: 'g',
      status: 'planning',
      createdBy: 'u',
      createdAt: null,
      updatedAt: undefined,
    });
    expect(parsed?.createdAt).toBe(0);
    expect(parsed?.updatedAt).toBe(0);
  });

  it('preserves explicit null for opensAt / dueAt / deletedAt', () => {
    const parsed = parsePlcAssessment('a1', {
      title: 'T',
      kind: 'quiz',
      syncGroupId: 'g',
      status: 'planning',
      createdBy: 'u',
      createdAt: 1,
      updatedAt: 1,
      opensAt: null,
      dueAt: null,
      deletedAt: null,
    });
    expect(parsed?.opensAt).toBeNull();
    expect(parsed?.dueAt).toBeNull();
    expect(parsed?.deletedAt).toBeNull();
  });

  it('carries deletedAt through as a plain int', () => {
    const parsed = parsePlcAssessment('a1', {
      title: 'T',
      kind: 'quiz',
      syncGroupId: 'g',
      status: 'closed',
      createdBy: 'u',
      createdAt: 1,
      updatedAt: 1,
      deletedAt: 99999,
    });
    expect(parsed?.deletedAt).toBe(99999);
  });

  it('omits absent optional fields', () => {
    const parsed = parsePlcAssessment('a1', {
      title: 'T',
      kind: 'quiz',
      syncGroupId: 'g',
      status: 'planning',
      createdBy: 'u',
      createdAt: 1,
      updatedAt: 1,
    });
    expect(parsed).not.toHaveProperty('unitLabel');
    expect(parsed).not.toHaveProperty('opensAt');
    expect(parsed).not.toHaveProperty('dueAt');
    expect(parsed).not.toHaveProperty('deletedAt');
  });
});

describe('parsePlcAssessment — rejection of malformed docs', () => {
  const base = {
    title: 'T',
    kind: 'quiz' as const,
    syncGroupId: 'g',
    status: 'planning' as const,
    createdBy: 'u',
    createdAt: 1,
    updatedAt: 1,
  };

  it('rejects a non-string title', () => {
    expect(parsePlcAssessment('a', { ...base, title: 42 })).toBeNull();
  });
  it('rejects an out-of-union kind', () => {
    expect(parsePlcAssessment('a', { ...base, kind: 'essay' })).toBeNull();
  });
  it('rejects an empty syncGroupId', () => {
    expect(parsePlcAssessment('a', { ...base, syncGroupId: '' })).toBeNull();
  });
  it('rejects a missing syncGroupId', () => {
    const { syncGroupId: _omit, ...rest } = base;
    void _omit;
    expect(parsePlcAssessment('a', rest)).toBeNull();
  });
  it('rejects an out-of-union status', () => {
    expect(parsePlcAssessment('a', { ...base, status: 'archived' })).toBeNull();
  });
  it('rejects a missing createdBy', () => {
    const { createdBy: _omit, ...rest } = base;
    void _omit;
    expect(parsePlcAssessment('a', rest)).toBeNull();
  });
});

describe('usePlcAssessments — listener wiring', () => {
  it('subscribes to the assessments subcollection ordered by updatedAt desc', () => {
    mockOnSnapshot.mockReturnValue(() => undefined);
    renderHook(() => usePlcAssessments(PLC_ID));
    expect(mockCollection).toHaveBeenCalledWith(
      { __mock: 'db' },
      'plcs',
      PLC_ID,
      'assessments'
    );
    expect(orderBy).toHaveBeenCalledWith('updatedAt', 'desc');
    expect(query).toHaveBeenCalled();
    expect(mockOnSnapshot).toHaveBeenCalledTimes(1);
  });

  it('starts loading until the first snapshot arrives', () => {
    mockOnSnapshot.mockReturnValue(() => undefined);
    const { result } = renderHook(() => usePlcAssessments(PLC_ID));
    expect(result.current.loading).toBe(true);
    expect(result.current.assessments).toHaveLength(0);
    expect(result.current.error).toBeNull();
  });
});

describe('usePlcAssessments — snapshot handling', () => {
  it('parses valid docs and drops soft-deleted ones from the live list', () => {
    const { result, emit } = renderWithCapturedSnapshot();
    emit([
      {
        id: 'live',
        data: {
          title: 'Live',
          kind: 'quiz',
          syncGroupId: 'g1',
          status: 'active',
          createdBy: 'u',
          createdAt: 1,
          updatedAt: 2,
        },
      },
      {
        id: 'deleted',
        data: {
          title: 'Tombstoned',
          kind: 'quiz',
          syncGroupId: 'g2',
          status: 'closed',
          createdBy: 'u',
          createdAt: 1,
          updatedAt: 1,
          deletedAt: 1234,
        },
      },
    ]);
    expect(result.current.loading).toBe(false);
    expect(result.current.assessments).toHaveLength(1);
    expect(result.current.assessments[0]?.id).toBe('live');
  });

  it('drops a malformed doc while keeping a sibling valid one', () => {
    const { result, emit } = renderWithCapturedSnapshot();
    emit([
      {
        id: 'bad',
        data: { title: 'Bad', kind: 'quiz', syncGroupId: '', status: 'active' },
      },
      {
        id: 'good',
        data: {
          title: 'Good',
          kind: 'quiz',
          syncGroupId: 'g',
          status: 'active',
          createdBy: 'u',
          createdAt: 1,
          updatedAt: 1,
        },
      },
    ]);
    expect(result.current.assessments).toHaveLength(1);
    expect(result.current.assessments[0]?.id).toBe('good');
  });

  it('sets error and clears it on recovery', () => {
    const { result, emit, emitError } = renderWithCapturedSnapshot();
    emitError('Missing or insufficient permissions.');
    expect(result.current.error?.message).toBe(
      'Missing or insufficient permissions.'
    );
    expect(result.current.loading).toBe(false);
    emit([]);
    expect(result.current.error).toBeNull();
  });
});

describe('usePlcAssessments — idle path', () => {
  it('stays idle and does not subscribe when plcId is null', () => {
    const { result } = renderHook(() => usePlcAssessments(null));
    expect(result.current.loading).toBe(false);
    expect(result.current.assessments).toHaveLength(0);
    expect(mockOnSnapshot).not.toHaveBeenCalled();
  });
});
