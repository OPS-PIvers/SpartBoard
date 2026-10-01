import { describe, expect, it } from 'vitest';
import { audienceSummary, groupFeatureSwitches } from './featureSwitchGroups';
import { widgetSubFeatures } from './accessSearch';
import type { GlobalFeature } from '@/types';

describe('groupFeatureSwitches', () => {
  it('sorts quiz switches into their groups with add-ons under their parent', () => {
    const ids: GlobalFeature[] = [
      'quiz-time-limit',
      'quiz-document-ai-reader',
      'paper-handwritten-responses',
      'quiz-document-import',
      'paper-answer-sheets',
    ];
    expect(groupFeatureSwitches(ids)).toEqual([
      {
        group: 'building',
        rows: [
          { id: 'quiz-document-import', children: ['quiz-document-ai-reader'] },
        ],
      },
      {
        group: 'questions',
        rows: [
          {
            id: 'paper-answer-sheets',
            children: ['paper-handwritten-responses'],
          },
        ],
      },
      { group: 'assigning', rows: [{ id: 'quiz-time-limit', children: [] }] },
    ]);
  });

  it('keeps an add-on at the top level when its parent is not listed', () => {
    expect(groupFeatureSwitches(['quiz-document-ai-reader'])).toEqual([
      {
        group: 'building',
        rows: [{ id: 'quiz-document-ai-reader', children: [] }],
      },
    ]);
  });

  it('puts ungrouped switches in one unnamed list', () => {
    expect(groupFeatureSwitches(['smart-poll'])).toEqual([
      { group: undefined, rows: [{ id: 'smart-poll', children: [] }] },
    ]);
  });
});

describe('widgetSubFeatures', () => {
  it('adds a keep preview to its widget once it is graduated', () => {
    expect(widgetSubFeatures('quiz')).not.toContain('quiz-time-limit');
    expect(widgetSubFeatures('quiz', new Set(['quiz-time-limit']))).toContain(
      'quiz-time-limit'
    );
  });

  it('never graduates a retire flag', () => {
    expect(
      widgetSubFeatures('quiz', new Set(['quiz-review-split']))
    ).not.toContain('quiz-review-split');
  });
});

describe('audienceSummary', () => {
  const base = { featureId: 'quiz-time-limit' as const, betaUsers: [] };
  it('names who has the switch', () => {
    expect(
      audienceSummary({ ...base, enabled: false, accessLevel: 'public' })
    ).toBe('Off');
    expect(
      audienceSummary({ ...base, enabled: true, accessLevel: 'public' })
    ).toBe('Everyone');
    expect(
      audienceSummary({
        ...base,
        enabled: true,
        accessLevel: 'public',
        buildings: ['a', 'b'],
      })
    ).toBe('2 buildings');
    expect(
      audienceSummary({
        ...base,
        enabled: true,
        accessLevel: 'beta',
        betaUsers: ['x@y.org'],
      })
    ).toBe('Admins and 1 tester');
  });
});
