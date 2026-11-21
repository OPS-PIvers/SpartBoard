import { beforeEach, describe, expect, it, vi } from 'vitest';

const sent = vi.hoisted(() => ({
  call: vi.fn((_data: unknown) => Promise.resolve({ data: {} })),
  name: '',
}));

vi.mock('firebase/functions', () => ({
  httpsCallable: (_functions: unknown, name: string) => {
    sent.name = name;
    return sent.call;
  },
}));
vi.mock('@/config/firebase', () => ({ functions: {}, isAuthBypass: false }));

import {
  noteTransactionFailure,
  pathShape,
  resetTransactionFailuresForTest,
  touchedShapes,
} from './transactionFailureReport';

const touched = [
  { op: 'get', path: 'quiz_sessions/s1/responses/r1' },
  { op: 'update', path: 'quiz_sessions/s1/responses/r1' },
];

describe('transactionFailureReport', () => {
  beforeEach(() => {
    resetTransactionFailuresForTest();
    vi.clearAllMocks();
  });

  it('replaces every id in a path', () => {
    expect(pathShape('quiz_sessions/s1/responses/r1')).toBe(
      'quiz_sessions/{id}/responses/{id}'
    );
    expect(touchedShapes([...touched, touched[0]])).toEqual([
      'get quiz_sessions/{id}/responses/{id}',
      'update quiz_sessions/{id}/responses/{id}',
    ]);
  });

  it('reports once the same transaction fails five times in a minute', () => {
    for (let i = 0; i < 4; i++) {
      noteTransactionFailure('failed-precondition', touched, 1000 + i);
    }
    expect(sent.call).not.toHaveBeenCalled();
    noteTransactionFailure('failed-precondition', touched, 1010);
    expect(sent.name).toBe('reportTransactionFailureV1');
    expect(sent.call).toHaveBeenCalledWith({
      code: 'failed-precondition',
      ops: [
        'get quiz_sessions/{id}/responses/{id}',
        'update quiz_sessions/{id}/responses/{id}',
      ],
      count: 5,
      page: '/',
    });
  });

  it('does not count failures older than a minute or from another call site', () => {
    for (let i = 0; i < 4; i++) {
      noteTransactionFailure('failed-precondition', touched, i);
    }
    noteTransactionFailure('failed-precondition', touched, 70_000);
    noteTransactionFailure(
      'failed-precondition',
      [{ op: 'update', path: 'users/u1/dashboards/d1' }],
      70_001
    );
    expect(sent.call).not.toHaveBeenCalled();
  });

  it('waits five minutes between reports and stops after three', () => {
    const burst = (start: number) => {
      for (let i = 0; i < 5; i++) {
        noteTransactionFailure('failed-precondition', touched, start + i);
      }
    };
    burst(0);
    burst(10_000);
    expect(sent.call).toHaveBeenCalledTimes(1);
    burst(400_000);
    burst(800_000);
    burst(1_200_000);
    expect(sent.call).toHaveBeenCalledTimes(3);
  });

  it('ignores a failure that touched no document', () => {
    for (let i = 0; i < 6; i++) noteTransactionFailure('aborted', [], i);
    expect(sent.call).not.toHaveBeenCalled();
  });
});
