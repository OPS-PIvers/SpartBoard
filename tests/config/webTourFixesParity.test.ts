import { describe, it, expect } from 'vitest';
import type { GuidedLearningStep, WebTourLocator } from '@/types';
import type { TourRun } from '@/components/tours/tourRuns';
import * as client from '@/components/tours/web/webTourFixes';
import * as server from '@/functions/src/mcp/webTourFixes';

// Shared fixture: every clue fixKey reads, the ones it ignores, and edge cases.
const LOCATORS: WebTourLocator[] = [
  {},
  { role: 'button' },
  { role: 'button', name: 'Save' },
  { role: 'button', name: 'Save', text: 'Save', css: 'form > button' },
  { name: 'Gradebook', heading: 'Course tools' },
  { attrs: { testId: 'grades-link' } },
  { attrs: { ariaLabel: 'Open grades', name: 'grades' } },
  { attrs: { href: '/course/*/grades' } },
  {
    role: 'link',
    name: 'Grades',
    text: 'Grades',
    css: '#nav > a',
    heading: 'Course',
    attrs: {
      testId: 'g',
      ariaLabel: 'Grades',
      name: 'grades',
      href: '/c/*/g',
    },
  },
  { name: 'Ünïcödé "quotes" \\ back' },
  {
    role: 'button',
    name: 'Save',
    box: { x: 0.1, y: 0.2, w: 0.1, h: 0.1 },
    pageTitle: 'Biology',
    frames: [{ urlPattern: 'https://a.example/f', index: 0 }],
  },
];

const step = (id: string, locator: WebTourLocator): GuidedLearningStep => ({
  id,
  xPct: 50,
  yPct: 50,
  imageIndex: 0,
  interactionType: 'tooltip',
  web: { urlPattern: 'https://a.example/*', action: 'click', locator },
});

const run = (fix: WebTourLocator, over: Partial<TourRun> = {}): TourRun => ({
  v: 5,
  startedAt: 1,
  furthest: 0,
  done: false,
  misses: ['a'],
  surface: 'web',
  weak: [],
  fixes: { a: fix },
  ...over,
});

describe('web tour fixes client/server parity', () => {
  it('shares the teacher-run threshold', () => {
    expect(server.MIN_TEACHER_RUNS).toBe(client.MIN_TEACHER_RUNS);
  });

  it('fingerprints every fixture locator the same way', () => {
    for (const l of LOCATORS) expect(server.fixKey(l)).toBe(client.fixKey(l));
    const keys = new Set(LOCATORS.map((l) => client.fixKey(l)));
    // Box, page title and frames don't count, so only that last pair collides.
    expect(keys.size).toBe(LOCATORS.length - 1);
  });

  it('shows a teacher fix at the same run count on both sides', () => {
    const recorded: WebTourLocator = { role: 'button', name: 'Save' };
    const fix: WebTourLocator = { role: 'button', name: 'Save changes' };
    const steps = [step('a', recorded)];
    for (let n = 1; n <= client.MIN_TEACHER_RUNS + 1; n++) {
      const runs = Array.from({ length: n }, () => run(fix));
      const fromClient = client.suggestionFor(
        {},
        steps[0],
        client.runSuggestions(runs, 5, steps)
      );
      const fromServer = server
        .stepFixes({ steps }, { at: 5, steps }, runs)
        .get('a');
      expect(fromServer?.count).toBe(fromClient?.count);
      expect(fromServer?.source).toBe(fromClient?.source);
      expect(!!fromServer).toBe(n >= client.MIN_TEACHER_RUNS);
    }
  });
});
