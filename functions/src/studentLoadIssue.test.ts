import { describe, it, expect } from 'vitest';
import { sanitizeLoadIssues } from './studentLoadIssue';

describe('sanitizeLoadIssues', () => {
  it('keeps known collections and trims fields', () => {
    expect(
      sanitizeLoadIssues([
        {
          source: 'class',
          collection: 'flashcard_sessions',
          channel: 'active',
          code: 'permission-denied',
          attempt: 2.7,
          gaveUp: false,
        },
      ])
    ).toEqual([
      {
        source: 'class',
        collection: 'flashcard_sessions',
        channel: 'active',
        code: 'permission-denied',
        attempt: 2,
        gaveUp: false,
      },
    ]);
  });

  it('drops unknown sources and collections, and caps the batch', () => {
    const good = {
      source: 'pointer',
      collection: 'student_assignments',
      code: 'unavailable',
    };
    expect(
      sanitizeLoadIssues([
        { ...good, source: 'nope' },
        { ...good, collection: 'users' },
        'junk',
        null,
      ])
    ).toEqual([]);
    expect(
      sanitizeLoadIssues(Array.from({ length: 40 }, () => good))
    ).toHaveLength(10);
    expect(sanitizeLoadIssues('not a list')).toEqual([]);
  });

  it('strips odd characters from codes and clamps attempts', () => {
    const [issue] = sanitizeLoadIssues([
      {
        source: 'class',
        collection: 'quiz_sessions',
        channel: 'sideways',
        code: '<script>',
        attempt: 1e9,
      },
    ]);
    expect(issue).toMatchObject({
      channel: '',
      code: 'script',
      attempt: 99,
      gaveUp: false,
    });
  });
});
