import { describe, expect, it } from 'vitest';
import {
  accountLibraryText,
  rosterListText,
} from '@/scripts/widget-grader/measure/sharedLibrary';
import { analyzeG4 } from '@/scripts/widget-grader/measure/analyze';

describe('accountLibraryText', () => {
  it('collects titles from per-account library collections only', () => {
    const text = accountLibraryText({
      'users/u/projects/p1': { title: 'Science fair' },
      'users/u/quizzes/q1': { title: 'Unit review' },
      'users/u/flashcard_sets/s1': { title: 'Cell parts' },
      'users/u/other/o1': { title: 'Private board note' },
      'admin_settings/projects_widget': { title: 'Rollout' },
    });
    expect(text).toContain('Science fair');
    expect(text).toContain('Unit review');
    expect(text).toContain('Cell parts');
    expect(text).not.toContain('Private board note');
    expect(text).not.toContain('Rollout');
  });

  it('returns nothing without library docs', () => {
    expect(accountLibraryText(undefined)).toBe('');
  });

  it('stops library titles counting as a leak but not board content', () => {
    const base = {
      beforeReload: 'x',
      afterReload: 'x',
      emptyText: 'Library',
      typicalText: 'Science fair Ecosystem model Cellular respiration notes',
      secondText: 'Science fair Ecosystem model Cellular respiration notes',
    };
    expect(analyzeG4(base).pass).toBe(false);
    expect(
      analyzeG4({
        ...base,
        sharedText: accountLibraryText({
          'users/u/projects/a': { title: 'Science fair' },
          'users/u/projects/b': { title: 'Ecosystem model' },
        }),
      }).pass
    ).toBe(false);
    expect(
      analyzeG4({
        ...base,
        sharedText: accountLibraryText({
          'users/u/projects/a': { title: 'Science fair' },
          'users/u/projects/b': { title: 'Ecosystem model' },
          'users/u/projects/c': { title: 'Cellular respiration notes' },
        }),
      }).pass
    ).toBe(true);
  });
});

describe('rosterListText', () => {
  it('is keyed by widget type', () => {
    expect(rosterListText('classes')).toContain('Switch To');
    expect(rosterListText('checklist')).toBe('');
    expect(rosterListText('toString')).toBe('');
  });
});
