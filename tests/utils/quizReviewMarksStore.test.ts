import { describe, it, expect, beforeEach } from 'vitest';
import {
  clearReviewState,
  loadReviewState,
  reviewStateKey,
  saveReviewState,
} from '@/utils/quizReviewMarksStore';

describe('review marks store (M24)', () => {
  beforeEach(() => window.sessionStorage.clear());

  it('keys by session, response and attempt, and waits for the response', () => {
    expect(reviewStateKey('s1', 'r1', 2)).toBe(
      'spartboard:quiz-review:s1:r1:2'
    );
    expect(reviewStateKey('s1', undefined, 0)).toBeNull();
  });

  it('round-trips marks and the open screen, and drops an empty state', () => {
    const key = 'spartboard:quiz-review:s1:r1:0';
    saveReviewState(key, { marked: ['q1'], open: true, returnTo: false });
    expect(loadReviewState(key)).toEqual({
      marked: ['q1'],
      open: true,
      returnTo: false,
    });
    saveReviewState(key, { marked: [], open: false, returnTo: false });
    expect(window.sessionStorage.getItem(key)).toBeNull();
  });

  it('reads junk as empty and clears on submit', () => {
    const key = 'spartboard:quiz-review:s1:r1:0';
    window.sessionStorage.setItem(key, '{not json');
    expect(loadReviewState(key).marked).toEqual([]);
    window.sessionStorage.setItem(key, JSON.stringify({ marked: [1, 'q2'] }));
    expect(loadReviewState(key).marked).toEqual(['q2']);
    clearReviewState(key);
    expect(window.sessionStorage.getItem(key)).toBeNull();
    expect(loadReviewState(null).open).toBe(false);
  });
});
