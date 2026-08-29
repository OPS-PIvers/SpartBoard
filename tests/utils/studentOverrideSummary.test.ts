import { describe, it, expect } from 'vitest';
import type { TFunction } from 'i18next';
import i18n from '@/i18n';
import { summarizeOverride } from '@/utils/studentOverrideSummary';
import type { StudentOverride } from '@/types';

const t = i18n.t.bind(i18n) as TFunction;

describe('summarizeOverride', () => {
  it('returns no chips for an empty override', () => {
    expect(summarizeOverride({}, t)).toEqual([]);
  });

  it('summarizes each override dimension', () => {
    const override: StudentOverride = {
      timeMultiplier: 2,
      questionIds: ['q1'],
      hiddenOptionIdsByQuestion: { q1: ['b'] },
      rubricOverrideByQuestion: { q2: 'points' },
      tabWarningThreshold: 'off',
      openAt: 1,
    };
    expect(summarizeOverride(override, t, { totalQuestions: 2 })).toEqual([
      '2x time',
      '1/2 Qs',
      '1 option hidden',
      '1 rubric swap',
      'Tab warnings off',
      'Window shifted',
    ]);
  });

  it('pluralizes the hidden-option and rubric-swap chips', () => {
    expect(
      summarizeOverride(
        {
          hiddenOptionIdsByQuestion: { q1: ['b', 'c'], q2: ['a'] },
          rubricOverrideByQuestion: { q1: 'points', q2: 'points' },
        },
        t
      )
    ).toEqual(['3 options hidden', '2 rubric swaps']);
  });

  it('reports unlimited time and a numeric tab-warning threshold', () => {
    expect(
      summarizeOverride(
        { timeMultiplier: 'unlimited', tabWarningThreshold: 5 },
        t
      )
    ).toEqual(['Unlimited time', 'Tab warning: 5']);
  });

  it('renders every chip through the active locale', async () => {
    await i18n.changeLanguage('de');
    try {
      expect(
        summarizeOverride(
          {
            timeMultiplier: 'unlimited',
            openAt: 1,
            tabWarningThreshold: 'off',
          },
          t
        )
      ).toEqual([
        'Unbegrenzte Zeit',
        'Tab-Warnungen aus',
        'Zeitfenster verschoben',
      ]);
    } finally {
      await i18n.changeLanguage('en');
    }
  });
});
