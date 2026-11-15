import { describe, it, expect } from 'vitest';
import type { QuizResponse } from '@/types';
import { buildReopenOptions } from './reopenOptions';
import type { NotJoinedStudent } from './rosterNotJoined';

const response = (over: Partial<QuizResponse>): QuizResponse =>
  ({
    studentUid: 'u',
    status: 'completed',
    answers: [],
    ...over,
  }) as QuizResponse;

const notJoined = (over: Partial<NotJoinedStudent>): NotJoinedStudent => ({
  key: 'k',
  name: 'N',
  studentUid: 'n1',
  period: 'Period 3',
  periodKey: 'cl-3',
  absent: false,
  rosterId: 'r',
  studentId: 's',
  ...over,
});

describe('buildReopenOptions', () => {
  it('reopens submitted attempts and lets in everyone else by uid', () => {
    const out = buildReopenOptions(
      [
        {
          key: 'u1',
          name: 'Ada',
          response: response({ studentUid: 'u1', classPeriod: 'Period 1' }),
        },
        {
          key: 'u2',
          name: 'Bo',
          response: response({ studentUid: 'u2', status: 'in-progress' }),
        },
      ],
      [notJoined({ key: 'x', studentUid: 'n1', absent: true })],
      {}
    );
    expect(out).toEqual([
      expect.objectContaining({
        uid: 'u1',
        status: 'turned-in',
        responseKey: 'u1',
        className: 'Period 1',
      }),
      expect.objectContaining({ uid: 'u2', status: 'in-progress' }),
      expect.objectContaining({ uid: 'n1', status: 'absent', key: 'roster:x' }),
    ]);
    expect(out[1].responseKey).toBeUndefined();
  });

  it('leaves out PIN-only students and duplicates', () => {
    const out = buildReopenOptions(
      [{ key: 'p', name: 'Pin', response: response({ studentUid: '' }) }],
      [
        notJoined({ studentUid: null }),
        notJoined({ key: 'y', studentUid: 'u9' }),
        notJoined({ key: 'z', studentUid: 'u9' }),
      ],
      {}
    );
    expect(out.map((o) => o.uid)).toEqual(['u9']);
  });
});
