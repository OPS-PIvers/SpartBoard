import { describe, it, expect } from 'vitest';
import type { QuizAssignment } from '@/types';
import { latestArchivedAssignment } from './latestArchivedAssignment';

const a = (
  id: string,
  quizId: string,
  status: string,
  createdAt: number
): QuizAssignment => ({ id, quizId, status, createdAt }) as QuizAssignment;

describe('latestArchivedAssignment', () => {
  it('picks the newest ended assignment of the requested quiz only', () => {
    const list = [
      a('old', 'q1', 'inactive', 1),
      a('new', 'q1', 'inactive', 5),
      a('other', 'q2', 'inactive', 9),
      a('live', 'q1', 'active', 10),
    ];
    expect(latestArchivedAssignment(list, 'q1')?.id).toBe('new');
  });

  it('returns undefined when the quiz has no ended assignment', () => {
    expect(
      latestArchivedAssignment([a('x', 'q2', 'inactive', 1)], 'q1')
    ).toBeUndefined();
  });
});
