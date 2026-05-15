/**
 * Unit coverage for the shared `parsePublicationFields` helper that drives
 * both Quiz and Guided Learning `gradingStateFrom` rules. The rule decides
 * whether the student's `/my-assignments` row renders "View results" (graded)
 * or "Not graded" — getting it wrong means students either silently miss a
 * published score or click into an empty review.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { parsePublicationFields } from '@/hooks/useStudentAssignments';

describe('parsePublicationFields', () => {
  // `vi.spyOn` with an explicit `typeof console` generic tripped vitest 4's
  // `Methods<Required<T>>` constraint under the CI tsc ("warn" does not
  // satisfy the constraint '"Console"'). `vi.mocked(console.warn)` after
  // setup is the type-safe way to grab the spy in each test without
  // storing it in a typed `let` — matches the rest of the codebase's
  // spy patterns.
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const warnSpy = () => vi.mocked(console.warn);

  it("returns 'graded' when scoreVisibility is non-'none' AND scorePublishedAt is a number", () => {
    expect(
      parsePublicationFields('quiz', {
        scoreVisibility: 'score-only',
        scorePublishedAt: 1234567890,
      })
    ).toBe('graded');
    expect(
      parsePublicationFields('guided-learning', {
        scoreVisibility: 'score-responses-and-answers',
        scorePublishedAt: 1,
      })
    ).toBe('graded');
  });

  it("returns 'not-graded' when scoreVisibility is 'none' regardless of timestamp", () => {
    // The unpublish branch leaves the doc with `scoreVisibility: deleteField()`
    // on Firestore (so the field is absent on disk) — but a stale snapshot
    // or a mid-migration doc could still carry the literal 'none'. Both
    // paths must downgrade to 'not-graded'.
    expect(
      parsePublicationFields('quiz', {
        scoreVisibility: 'none',
        scorePublishedAt: 1234,
      })
    ).toBe('not-graded');
  });

  it("returns 'not-graded' when scorePublishedAt is missing even if visibility is set", () => {
    expect(
      parsePublicationFields('quiz', {
        scoreVisibility: 'score-only',
      })
    ).toBe('not-graded');
  });

  it("returns 'not-graded' and console.warns when fields have the wrong type", () => {
    expect(
      parsePublicationFields('quiz', {
        scoreVisibility: 42, // wrong type
        scorePublishedAt: 'not-a-number', // wrong type
      })
    ).toBe('not-graded');
    expect(warnSpy()).toHaveBeenCalledTimes(1);
    expect(warnSpy().mock.calls[0][0]).toMatch(/malformed quiz/);
  });

  it("returns 'not-graded' for null / non-object data without crashing the row", () => {
    // Firestore can briefly hand back partial snapshots during deletion
    // races. A runtime TypeError here would crash the whole assignments
    // list, not just drop one row — this guard is load-bearing.
    expect(
      parsePublicationFields(
        'quiz',
        null as unknown as Parameters<typeof parsePublicationFields>[1]
      )
    ).toBe('not-graded');
    expect(
      parsePublicationFields(
        'quiz',
        undefined as unknown as Parameters<typeof parsePublicationFields>[1]
      )
    ).toBe('not-graded');
  });

  it('only warns once per (kind, visibility-type, publishedAt-type) signature', () => {
    // Three repeats of the same malformed shape => exactly one warn.
    const bad = {
      scoreVisibility: 99,
      scorePublishedAt: 'string',
    };
    parsePublicationFields('guided-learning', bad);
    parsePublicationFields('guided-learning', bad);
    parsePublicationFields('guided-learning', bad);
    expect(warnSpy()).toHaveBeenCalledTimes(1);
  });
});
