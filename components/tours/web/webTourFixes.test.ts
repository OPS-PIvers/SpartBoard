import { describe, expect, it } from 'vitest';
import type { GuidedLearningSet, GuidedLearningStep } from '@/types';
import type { TourRun } from '@/components/tours/tourRuns';
import { fixKey as serverFixKey } from '@/functions/src/mcp/webTourFixes';
import {
  applyFix,
  dismissFix,
  fixKey,
  recordCheckSuggestion,
  runSuggestions,
  suggestionFor,
} from './webTourFixes';
import {
  checkPasses,
  recordCheckResult,
  startCheckRun,
  targetsSignature,
} from './webStepReview';
import { buildTourContent } from '@/components/tours/tourSnapshot';

const step = (id: string, name: string): GuidedLearningStep => ({
  id,
  xPct: 50,
  yPct: 50,
  imageIndex: 0,
  interactionType: 'tooltip',
  label: `Click ${name}`,
  text: '',
  web: {
    urlPattern: 'https://lms.example.com/*',
    action: 'click',
    locator: {
      role: 'button',
      name,
      box: { x: 0.1, y: 0.1, w: 0.1, h: 0.1 },
      frames: [{ urlPattern: 'https://lms.example.com/frame', index: 0 }],
    },
  },
});

const set = (steps = [step('a', 'Save'), step('b', 'Post')]) =>
  ({
    id: 't1',
    title: 'Tour',
    mode: 'tour',
    surface: 'web',
    imageUrls: [],
    steps,
    createdAt: 0,
    updatedAt: 0,
  }) as unknown as GuidedLearningSet;

const run = (over: Partial<TourRun>): TourRun => ({
  v: 5,
  startedAt: 1,
  furthest: 1,
  done: false,
  misses: ['a'],
  surface: 'web',
  weak: [],
  ...over,
});

const fix = { role: 'button', name: 'Save changes' };

describe('runSuggestions', () => {
  const published = set().steps;

  it('needs two teacher runs to agree before a fix shows (C16)', () => {
    expect(
      runSuggestions([run({ fixes: { a: fix } })], 5, published).has('a')
    ).toBe(false);
    const two = runSuggestions(
      [
        run({ fixes: { a: fix }, startedAt: 3 }),
        run({ fixes: { a: fix }, startedAt: 9 }),
      ],
      5,
      published
    ).get('a');
    expect(two).toMatchObject({ source: 'teacher', count: 2, at: 9 });
  });

  it("shows an admin's own run after one run", () => {
    expect(
      runSuggestions(
        [run({ fixes: { a: fix }, admin: true })],
        5,
        published
      ).get('a')?.source
    ).toBe('admin');
  });

  it('counts only runs of this version in which the step struggled', () => {
    const out = runSuggestions(
      [
        run({ fixes: { a: fix } }),
        run({ v: 4, fixes: { a: fix } }),
        run({ misses: [], fixes: { a: fix } }),
        run({ misses: [], weak: ['a:score'], fixes: { a: fix } }),
      ],
      5,
      published
    );
    expect(out.get('a')?.count).toBe(2);
  });
});

describe('suggestionFor, applyFix and dismissFix', () => {
  const runs = [run({ fixes: { a: fix } }), run({ fixes: { a: fix } })];

  it('accepting replaces the locator, keeps its frames, and expires the check (C13)', () => {
    let s = set();
    const sig = targetsSignature(s);
    s = startCheckRun(s, 'admin', sig);
    for (const id of ['a', 'b']) s = recordCheckResult(s, sig, id, 'found');
    expect(checkPasses(s)).toBe(true);
    const shown = suggestionFor(
      s,
      s.steps[0],
      runSuggestions(runs, 5, s.steps)
    );
    expect(shown).not.toBeNull();
    if (!shown) return;
    const next = applyFix(s, 'a', shown);
    expect(next.steps[0].web?.locator).toEqual({
      role: 'button',
      name: 'Save changes',
      box: { x: 0.1, y: 0.1, w: 0.1, h: 0.1 },
      frames: [{ urlPattern: 'https://lms.example.com/frame', index: 0 }],
    });
    expect(checkPasses(next)).toBe(false);
    // Now in use, so it no longer shows.
    expect(
      suggestionFor(next, next.steps[0], runSuggestions(runs, 5, s.steps))
    ).toBeNull();
  });

  it('hides a dismissed fix, and one for a step that changed since', () => {
    const s = set();
    const fromRuns = runSuggestions(runs, 5, s.steps);
    const shown = suggestionFor(s, s.steps[0], fromRuns);
    if (!shown) throw new Error('expected a fix');
    const dismissed = dismissFix(s, 'a', shown);
    expect(suggestionFor(dismissed, dismissed.steps[0], fromRuns)).toBeNull();
    const changed = set([step('a', 'Other'), step('b', 'Post')]);
    expect(suggestionFor(changed, changed.steps[0], fromRuns)).toBeNull();
  });

  it('saves a check run fix only for the targets it played, scrubbed', () => {
    const s = set();
    const sig = targetsSignature(s);
    const next = recordCheckSuggestion(
      s,
      sig,
      'b',
      { role: 'button', name: 'Post for kid@school.org' },
      7
    );
    const saved = next.webSuggestions?.b;
    expect(saved).toMatchObject({ source: 'check', count: 1, at: 7 });
    expect(JSON.stringify(saved)).not.toContain('kid@school.org');
    expect(suggestionFor(next, next.steps[1], new Map())).toEqual(saved);
    expect(recordCheckSuggestion(s, 'old-sig', 'b', fix, 7)).toBe(s);
  });

  it('never publishes suggestions or dismissals', () => {
    const s = dismissFix(
      recordCheckSuggestion(set(), targetsSignature(set()), 'b', fix, 1),
      'a',
      { locator: fix, source: 'teacher', count: 2, at: 1, base: 'x' }
    );
    const out = buildTourContent(s) as unknown as Record<string, unknown>;
    expect(out.webSuggestions).toBeUndefined();
    expect(out.webFixDismissed).toBeUndefined();
  });
});

describe('fixKey', () => {
  it('matches the connector, ignoring position and page title', () => {
    const l = {
      role: 'link',
      name: 'Grades',
      text: 'Grades',
      css: 'a.g',
      heading: 'Course',
      attrs: { testId: 'g', href: '/c/*/g' },
    };
    expect(fixKey(l)).toBe(serverFixKey(l));
    expect(
      fixKey({ ...l, box: { x: 0, y: 0, w: 1, h: 1 }, pageTitle: 'X' })
    ).toBe(fixKey(l));
    expect(fixKey({ ...l, name: 'Other' })).not.toBe(fixKey(l));
  });
});
