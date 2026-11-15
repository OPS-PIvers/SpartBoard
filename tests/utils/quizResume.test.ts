import { describe, it, expect } from 'vitest';
import { resumeQuestionIndex } from '@/utils/quizResume';

const ids = ['q1', 'q2', 'q3'];
const ans = (questionId: string, status?: 'draft') => ({ questionId, status });

describe('resumeQuestionIndex', () => {
  it('returns 0 for an empty list', () => {
    expect(resumeQuestionIndex([], 'q1', [])).toBe(0);
  });
  it('uses the stored id when present', () => {
    expect(resumeQuestionIndex(ids, 'q3', [])).toBe(2);
  });
  it('falls back when the stored id is not in the list', () => {
    expect(resumeQuestionIndex(ids, 'gone', [])).toBe(0);
  });
  it('starts at 0 with no answers', () => {
    expect(resumeQuestionIndex(ids, null, [])).toBe(0);
  });
  it('lands on the first unanswered question', () => {
    expect(resumeQuestionIndex(ids, null, [ans('q1'), ans('q2')])).toBe(2);
  });
  it('does not count a draft answer as done', () => {
    expect(
      resumeQuestionIndex(ids, null, [ans('q1'), ans('q2', 'draft')])
    ).toBe(1);
  });
  it('lands on the last question when all are submitted', () => {
    expect(
      resumeQuestionIndex(ids, null, [ans('q1'), ans('q2'), ans('q3')])
    ).toBe(2);
  });
});
