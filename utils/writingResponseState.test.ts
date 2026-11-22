import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { countWords } from './wordCount';
import {
  WRITING_CLOSE_GRACE_MS,
  WRITING_RESPONSE_STATUSES,
  WRITING_TIMER_SKEW_MS,
  canSaveFeedback,
  canTakeBack,
  canTurnIn,
  countWritingWords,
  deriveWritingStatus,
  isWritingTurnedIn,
  isWritingUnlocked,
  resolveWritingCloseAt,
  resolveWritingDueAt,
  stripTagsOnce,
  takeBackBlock,
  timedTurnInDue,
  turnInBlock,
  writingDeadline,
  writingEventAllowed,
  writingTransition,
  type WritingEvent,
  type WritingResponseStatus,
  type WritingTakeBackFacts,
} from './writingResponseState';

const MARKER = '// ---- shared body ----';
const bodyOf = (path: string): string => {
  const src = readFileSync(resolve(__dirname, path), 'utf8');
  return src.slice(src.indexOf(MARKER));
};

const OPEN: WritingTakeBackFacts = {
  now: 1_000,
  dueAt: 2_000,
  hasFeedback: false,
  timed: false,
};

const ALL_EVENTS: WritingEvent[] = [
  { type: 'turn-in' },
  { type: 'take-back', facts: OPEN, draftsLeft: 0 },
  { type: 'return' },
  { type: 'return-for-revision' },
];

describe('writingResponseState mirror', () => {
  it('matches functions/src/writingResponseState.ts below the marker', () => {
    expect(bodyOf('../functions/src/writingResponseState.ts')).toBe(
      bodyOf('./writingResponseState.ts')
    );
  });
});

describe('writingTransition', () => {
  it('turns in a draft and a revision', () => {
    expect(writingTransition('draft', { type: 'turn-in' })).toBe('turned-in');
    expect(writingTransition('revising', { type: 'turn-in' })).toBe(
      'turned-in'
    );
  });

  it('takes back to a draft, or to revising when an earlier draft remains', () => {
    expect(
      writingTransition('turned-in', {
        type: 'take-back',
        facts: OPEN,
        draftsLeft: 0,
      })
    ).toBe('draft');
    expect(
      writingTransition('turned-in', {
        type: 'take-back',
        facts: OPEN,
        draftsLeft: 1,
      })
    ).toBe('revising');
  });

  it('refuses take back once feedback is saved, the due date passed, or the work is timed', () => {
    for (const facts of [
      { ...OPEN, hasFeedback: true },
      { ...OPEN, now: 2_001 },
      { ...OPEN, timed: true },
    ]) {
      expect(
        writingTransition('turned-in', {
          type: 'take-back',
          facts,
          draftsLeft: 0,
        })
      ).toBe('turned-in');
    }
  });

  it('allows take back with no due date until feedback', () => {
    const noDue = { ...OPEN, dueAt: null, now: 9e12 };
    expect(canTakeBack('turned-in', noDue)).toBe(true);
    expect(canTakeBack('turned-in', { ...noDue, hasFeedback: true })).toBe(
      false
    );
  });

  it('allows take back at the due date itself', () => {
    expect(canTakeBack('turned-in', { ...OPEN, now: 2_000 })).toBe(true);
  });

  it('Return keeps it locked and Return for revision unlocks it', () => {
    expect(writingTransition('turned-in', { type: 'return' })).toBe('returned');
    expect(
      writingTransition('turned-in', { type: 'return-for-revision' })
    ).toBe('revising');
    expect(writingTransition('returned', { type: 'return-for-revision' })).toBe(
      'revising'
    );
  });

  it('Return and Return for revision repeat', () => {
    expect(writingEventAllowed('returned', { type: 'return' })).toBe(true);
    expect(
      writingEventAllowed('revising', { type: 'return-for-revision' })
    ).toBe(true);
  });

  it('a draft ignores everything but turn in', () => {
    for (const e of ALL_EVENTS.slice(1)) {
      expect(writingTransition('draft', e)).toBe('draft');
      expect(writingEventAllowed('draft', e)).toBe(false);
    }
  });

  it('a returned piece cannot be taken back or turned in again', () => {
    expect(writingEventAllowed('returned', ALL_EVENTS[0])).toBe(false);
    expect(writingEventAllowed('returned', ALL_EVENTS[1])).toBe(false);
  });

  it('a turned-in piece cannot be turned in twice', () => {
    expect(writingEventAllowed('turned-in', { type: 'turn-in' })).toBe(false);
  });

  it('a revision cannot be taken back or returned before it is turned in', () => {
    expect(writingEventAllowed('revising', ALL_EVENTS[1])).toBe(false);
    expect(writingEventAllowed('revising', { type: 'return' })).toBe(false);
  });

  it('covers every status and event', () => {
    const table: Record<WritingResponseStatus, (string | null)[]> = {
      draft: ['turned-in', null, null, null],
      'turned-in': [null, 'draft', 'returned', 'revising'],
      returned: [null, null, 'returned', 'revising'],
      revising: ['turned-in', null, null, 'revising'],
    };
    for (const status of WRITING_RESPONSE_STATUSES) {
      ALL_EVENTS.forEach((event, i) => {
        const allowed = writingEventAllowed(status, event);
        expect(allowed ? writingTransition(status, event) : null).toBe(
          table[status][i]
        );
      });
    }
  });
});

describe('takeBackBlock', () => {
  it('names the reason in D12 order', () => {
    expect(takeBackBlock('draft', OPEN)).toBe('not-turned-in');
    expect(takeBackBlock('turned-in', { ...OPEN, timed: true })).toBe('timed');
    expect(takeBackBlock('turned-in', { ...OPEN, hasFeedback: true })).toBe(
      'feedback'
    );
    expect(takeBackBlock('turned-in', { ...OPEN, now: 3_000 })).toBe(
      'past-due'
    );
    expect(takeBackBlock('turned-in', OPEN)).toBeNull();
  });
  it('refuses once closed or ended, past the grace', () => {
    const closed = { ...OPEN, dueAt: null, closeAt: 0 };
    expect(
      takeBackBlock('turned-in', { ...closed, now: WRITING_CLOSE_GRACE_MS })
    ).toBeNull();
    expect(
      takeBackBlock('turned-in', { ...closed, now: WRITING_CLOSE_GRACE_MS + 1 })
    ).toBe('closed');
  });
});

describe('resolveWritingCloseAt', () => {
  it('takes the pointer close, else the session close', () => {
    expect(resolveWritingCloseAt({ closeAt: 5 }, 9)).toBe(9);
    expect(resolveWritingCloseAt({ closeAt: 5 })).toBe(5);
    expect(resolveWritingCloseAt({})).toBeNull();
  });
  it('brings the close forward to the teacher end', () => {
    expect(
      resolveWritingCloseAt({ status: 'ended', endedAt: 3, closeAt: 5 })
    ).toBe(3);
    expect(resolveWritingCloseAt({ status: 'ended', endedAt: 7 })).toBe(7);
    expect(
      resolveWritingCloseAt({ status: 'ended', endedAt: 7, closeAt: 5 })
    ).toBe(5);
  });
});

describe('turnInBlock', () => {
  const facts = { now: 1_000, closeAt: null, wordCount: 50 };
  it('refuses a locked piece', () => {
    expect(turnInBlock('turned-in', facts)).toBe('locked');
    expect(turnInBlock('returned', facts)).toBe('locked');
  });
  it('refuses after the close plus the grace', () => {
    expect(
      turnInBlock('draft', {
        ...facts,
        closeAt: 0,
        now: WRITING_CLOSE_GRACE_MS,
      })
    ).toBeNull();
    expect(
      turnInBlock('draft', {
        ...facts,
        closeAt: 0,
        now: WRITING_CLOSE_GRACE_MS + 1,
      })
    ).toBe('closed');
  });
  it('enforces word limits only when asked', () => {
    const limits = { minWords: 100, maxWords: 200 };
    expect(canTurnIn('draft', { ...facts, ...limits })).toBe(true);
    expect(
      turnInBlock('draft', { ...facts, ...limits, enforceWordLimit: true })
    ).toBe('too-short');
    expect(
      turnInBlock('revising', {
        ...facts,
        ...limits,
        wordCount: 201,
        enforceWordLimit: true,
      })
    ).toBe('too-long');
  });
});

describe('helpers', () => {
  it('unlocked and turned-in sets', () => {
    expect(WRITING_RESPONSE_STATUSES.filter(isWritingUnlocked)).toEqual([
      'draft',
      'revising',
    ]);
    expect(WRITING_RESPONSE_STATUSES.filter(isWritingTurnedIn)).toEqual([
      'turned-in',
      'returned',
    ]);
  });

  it('derives a status from a stored doc', () => {
    expect(deriveWritingStatus(null)).toBe('draft');
    expect(deriveWritingStatus({ status: 'returned' })).toBe('returned');
    expect(deriveWritingStatus({ status: 'bogus', turnedInAt: 5 })).toBe(
      'turned-in'
    );
    expect(deriveWritingStatus({ status: 7 })).toBe('draft');
  });

  it('feedback needs a frozen copy and a piece past draft', () => {
    expect(canSaveFeedback('turned-in', true)).toBe(true);
    expect(canSaveFeedback('revising', true)).toBe(true);
    expect(canSaveFeedback('turned-in', false)).toBe(false);
    expect(canSaveFeedback('draft', true)).toBe(false);
  });

  it('resolves the due date: pointer, then class, then session', () => {
    const session = { dueAt: 10, dueAtByClassId: { c1: 20 } };
    expect(resolveWritingDueAt(session, 'c1', 30)).toBe(30);
    expect(resolveWritingDueAt(session, 'c1')).toBe(20);
    expect(resolveWritingDueAt(session, 'c2')).toBe(10);
    expect(resolveWritingDueAt({}, null)).toBeNull();
  });

  it('computes the deadline with extra time', () => {
    expect(writingDeadline(0, 10)).toBe(600_000);
    expect(writingDeadline(0, 10, 1.5)).toBe(900_000);
    expect(writingDeadline(0, 10, 2)).toBe(1_200_000);
    expect(writingDeadline(0, 10, 'unlimited')).toBeNull();
    expect(writingDeadline(0, undefined)).toBeNull();
    expect(writingDeadline(0, 0)).toBeNull();
  });

  it('a timed turn in waits for the clock, allowing a little skew', () => {
    expect(timedTurnInDue(10_000 - WRITING_TIMER_SKEW_MS - 1, 10_000)).toBe(
      false
    );
    expect(timedTurnInDue(10_000 - WRITING_TIMER_SKEW_MS, 10_000)).toBe(true);
  });

  it('counts words the way the editor does', () => {
    for (const html of [
      '',
      '<p>One two</p><p>three</p>',
      'a&nbsp;b <b>c</b>d',
      '<ul><li>x</li><li>y z</li></ul>',
      '<<b>i>nested',
    ]) {
      expect(countWritingWords(html)).toBe(countWords(html));
    }
  });
});

describe('linear tag stripping (security #19)', () => {
  const BREAKING =
    /<\/?(?:p|div|br|li|ul|ol|h[1-6]|blockquote|pre|tr|td|th|table|hr)\b[^>]*>/gi;
  const regexCount = (html: string): number => {
    if (!html) return 0;
    let stripped = html.replace(BREAKING, ' ');
    let previous;
    do {
      previous = stripped;
      stripped = stripped.replace(/<[^>]+>/g, '');
    } while (stripped !== previous);
    const text = stripped
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return text ? text.split(' ').length : 0;
  };

  it('matches the old regex count on random tag soup', () => {
    const parts = [
      '<',
      '>',
      '/',
      'p',
      'b',
      'r',
      'li',
      'div',
      ' ',
      'x',
      'H1',
      '&nbsp;',
      '<>',
    ];
    let seed = 7;
    const rand = (n: number): number => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed % n;
    };
    for (let t = 0; t < 3000; t++) {
      let html = '';
      const len = rand(30);
      for (let i = 0; i < len; i++) html += parts[rand(parts.length)];
      expect(countWritingWords(html), html).toBe(regexCount(html));
      expect(countWords(html), html).toBe(regexCount(html));
      expect(stripTagsOnce(html, true), html).toBe(
        html.replace(/<[^>]*>/g, '')
      );
    }
  });

  it('counts 400,000 unclosed < in linear time', () => {
    for (const html of [
      '<'.repeat(400_000),
      '<p'.repeat(200_000),
      'a<<>'.repeat(100_000),
    ]) {
      const start = Date.now();
      countWritingWords(html);
      countWords(html);
      expect(Date.now() - start).toBeLessThan(1000);
    }
  });
});

describe('countWordsCached', () => {
  it('returns the same count as countWords for new and repeated input', async () => {
    const { countWordsCached } = await import('./wordCount');
    expect(countWordsCached('<p>one two</p>')).toBe(2);
    expect(countWordsCached('<p>one two</p>')).toBe(2);
    expect(countWordsCached('three')).toBe(1);
  });
});
