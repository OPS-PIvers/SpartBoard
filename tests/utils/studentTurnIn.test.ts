import { describe, it, expect } from 'vitest';
import {
  compareByDueDate,
  formatDueLabel,
  isMissingStillOpen,
  readTurnInState,
  type TurnInState,
} from '@/utils/studentTurnIn';

describe('readTurnInState', () => {
  it('has no state without a response doc', () => {
    expect(readTurnInState('quiz', undefined, null)).toBe('not-started');
    expect(readTurnInState('mini-app', undefined, null)).toBe('not-started');
  });

  it('counts a quiz only once it is completed', () => {
    expect(readTurnInState('quiz', undefined, { status: 'joined' })).toBe(
      'in-progress'
    );
    expect(readTurnInState('quiz', undefined, { status: 'in-progress' })).toBe(
      'in-progress'
    );
    expect(readTurnInState('quiz', undefined, { status: 'completed' })).toBe(
      'turned-in'
    );
  });

  it('keeps a quiz turned in during a retake', () => {
    expect(
      readTurnInState('quiz', undefined, {
        status: 'joined',
        completedAttempts: 1,
      })
    ).toBe('turned-in');
    expect(
      readTurnInState('quiz', undefined, {
        status: 'joined',
        completedAttempts: 0,
      })
    ).toBe('in-progress');
  });

  it('counts a video activity and guided learning by completedAt', () => {
    expect(readTurnInState('video-activity', undefined, { answers: [] })).toBe(
      'in-progress'
    );
    expect(
      readTurnInState('video-activity', undefined, { completedAt: 5 })
    ).toBe('turned-in');
    expect(
      readTurnInState('video-activity', undefined, { completedAttempts: 2 })
    ).toBe('turned-in');
    expect(readTurnInState('guided-learning', undefined, {})).toBe(
      'in-progress'
    );
    expect(
      readTurnInState('guided-learning', undefined, { completedAt: 5 })
    ).toBe('turned-in');
  });

  it('counts flashcards Check by submittedAt and never Study', () => {
    expect(readTurnInState('flashcards', 'check', { cards: [] })).toBe(
      'in-progress'
    );
    expect(readTurnInState('flashcards', 'check', { submittedAt: 9 })).toBe(
      'turned-in'
    );
    expect(readTurnInState('flashcards', 'study', { submittedAt: 9 })).toBe(
      'not-started'
    );
  });

  it('counts any mini-app submission', () => {
    expect(readTurnInState('mini-app', undefined, {})).toBe('turned-in');
  });

  it('has no per-student state for walls and projects', () => {
    expect(readTurnInState('activity-wall', undefined, {})).toBe('not-started');
    expect(readTurnInState('projects', undefined, {})).toBe('not-started');
  });
});

const NOW = new Date(2026, 9, 5, 12, 0).getTime();
const HOUR = 3_600_000;
const work = { workKind: 'work' as const };

describe('isMissingStillOpen', () => {
  it('flags unsubmitted Work past due that is still open', () => {
    expect(
      isMissingStillOpen({ ...work, dueAt: NOW - HOUR }, 'not-started', NOW)
    ).toBe(true);
    expect(
      isMissingStillOpen({ ...work, dueAt: NOW - HOUR }, 'in-progress', NOW)
    ).toBe(true);
  });

  it('skips turned-in, not-yet-due, undated and Resource rows', () => {
    const past = { ...work, dueAt: NOW - HOUR };
    expect(isMissingStillOpen(past, 'turned-in', NOW)).toBe(false);
    expect(
      isMissingStillOpen({ ...work, dueAt: NOW + HOUR }, 'not-started', NOW)
    ).toBe(false);
    expect(isMissingStillOpen(work, 'not-started', NOW)).toBe(false);
    expect(
      isMissingStillOpen(
        { workKind: 'resource', dueAt: NOW - HOUR },
        'not-started',
        NOW
      )
    ).toBe(false);
  });

  it('skips a row that has closed or ended', () => {
    expect(
      isMissingStillOpen(
        { ...work, dueAt: NOW - 2 * HOUR, closeAt: NOW - HOUR },
        'not-started',
        NOW
      )
    ).toBe(false);
    expect(
      isMissingStillOpen(
        { ...work, dueAt: NOW - HOUR, endedAt: NOW - 1 },
        'not-started',
        NOW
      )
    ).toBe(false);
  });
});

describe('compareByDueDate', () => {
  const mk = (title: string, dueAt?: number, createdAt = 0) => ({
    ...work,
    title,
    dueAt,
    createdAt,
  });

  it('orders missing-still-open, then by due date, then undated', () => {
    const rows = [
      mk('undated'),
      mk('later', NOW + 5 * HOUR),
      mk('missing', NOW - HOUR),
      mk('soon', NOW + HOUR),
    ];
    const turnIn = (): TurnInState => 'not-started';
    rows.sort((a, b) => compareByDueDate(a, b, turnIn, NOW));
    expect(rows.map((r) => r.title)).toEqual([
      'missing',
      'soon',
      'later',
      'undated',
    ]);
  });

  it('breaks ties newest first, then by title', () => {
    const turnIn = (): TurnInState => 'not-started';
    const a = mk('a', NOW + HOUR, 1);
    const b = mk('b', NOW + HOUR, 2);
    expect(compareByDueDate(a, b, turnIn, NOW)).toBeGreaterThan(0);
    expect(
      compareByDueDate(
        mk('a', undefined, 1),
        mk('b', undefined, 1),
        turnIn,
        NOW
      )
    ).toBeLessThan(0);
  });
});

describe('formatDueLabel', () => {
  it('reads "Due today" with the time for the same day', () => {
    const label = formatDueLabel(new Date(2026, 9, 5, 23, 59).getTime(), NOW);
    expect(label.startsWith('Due today, ')).toBe(true);
    expect(label).toMatch(/11:59/);
  });

  it('reads the weekday and date otherwise', () => {
    const label = formatDueLabel(new Date(2026, 9, 9, 8, 0).getTime(), NOW);
    expect(label.startsWith('Due ')).toBe(true);
    expect(label).not.toContain('today');
    expect(label).toMatch(/Oct/);
  });
});
