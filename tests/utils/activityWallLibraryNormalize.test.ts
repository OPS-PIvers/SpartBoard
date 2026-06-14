/**
 * Regression test for the field-stripping bug in the Activity Wall library
 * snapshot listener.
 *
 * Root cause: the inline `docs.map(...)` callback in `useActivityWallLibrary`
 * returned a hand-enumerated literal that silently dropped every optional field
 * on `ActivityWallLibraryEntry` not explicitly listed — including the Phase 5A
 * fields `classIds` and `rosterIds`.
 *
 * Impact: when `onSnapshot` refreshed the library list (e.g. after the teacher
 * edited an activity), the returned entries lost their `classIds` value. Any
 * subsequent `saveActivity` call would then write back the entry *without*
 * `classIds`, permanently deleting the multi-class class targeting from
 * Firestore. Students would no longer see the activity on their
 * `/my-assignments` page.
 *
 * Fix: extracted the normalization logic to `utils/activityWallNormalize.ts`
 * as `normalizeActivityWallLibraryEntry`. The function spreads `...restData`
 * first so all unlisted optional fields survive, then overrides the fields
 * that require normalization or defaulting.
 *
 * This test imports the real exported function so a regression (removing the
 * `...restData` spread) would immediately cause the "preserves optional fields"
 * tests to fail.
 */

import { describe, it, expect } from 'vitest';
import { normalizeActivityWallLibraryEntry } from '@/utils/activityWallNormalize';

const DOC_ID = 'activity-001';

/** Minimal required fields for a fully-normalized entry. */
const MINIMAL_INPUT = {
  title: 'Exit Ticket',
  prompt: 'What did you learn today?',
  mode: 'text' as const,
  moderationEnabled: false,
  identificationMode: 'anonymous' as const,
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_001_000,
};

// ─── optional field preservation (the regression) ────────────────────────────

describe('normalizeActivityWallLibraryEntry — optional field preservation', () => {
  it('preserves classIds when present (primary Phase 5A regression)', () => {
    // Old code dropped classIds entirely — it was not in the hand-enumerated
    // literal. This is the primary regression this test guards against.
    const result = normalizeActivityWallLibraryEntry(DOC_ID, {
      ...MINIMAL_INPUT,
      classIds: ['class-a', 'class-b'],
    });
    expect(result.classIds).toEqual(['class-a', 'class-b']);
  });

  it('preserves rosterIds when present', () => {
    const result = normalizeActivityWallLibraryEntry(DOC_ID, {
      ...MINIMAL_INPUT,
      rosterIds: ['roster-1', 'roster-2'],
    });
    expect(result.rosterIds).toEqual(['roster-1', 'roster-2']);
  });

  it('preserves classId (legacy) when it is a non-empty string', () => {
    const result = normalizeActivityWallLibraryEntry(DOC_ID, {
      ...MINIMAL_INPUT,
      classId: 'class-legacy',
    });
    expect(result.classId).toBe('class-legacy');
  });

  it('omits classId when it is an empty string', () => {
    // Empty-string classId must never reach the output — Firestore's
    // passesStudentClassGate rule treats the field's presence as a
    // class-restriction signal; an empty value blocks all students.
    const result = normalizeActivityWallLibraryEntry(DOC_ID, {
      ...MINIMAL_INPUT,
      classId: '',
    });
    expect('classId' in result).toBe(false);
  });

  it('omits classId when absent in the Firestore doc', () => {
    const result = normalizeActivityWallLibraryEntry(DOC_ID, MINIMAL_INPUT);
    expect('classId' in result).toBe(false);
  });
});

// ─── required field defaults ──────────────────────────────────────────────────

describe('normalizeActivityWallLibraryEntry — required field defaults', () => {
  it('uses docId as id when id is absent in the doc', () => {
    const result = normalizeActivityWallLibraryEntry(DOC_ID, MINIMAL_INPUT);
    expect(result.id).toBe(DOC_ID);
  });

  it('uses the stored id when present (overrides docId)', () => {
    const result = normalizeActivityWallLibraryEntry(DOC_ID, {
      ...MINIMAL_INPUT,
      id: 'stored-id',
    });
    expect(result.id).toBe('stored-id');
  });

  it('defaults title to empty string when absent', () => {
    const { title: _removed, ...rest } = MINIMAL_INPUT;
    void _removed;
    const result = normalizeActivityWallLibraryEntry(DOC_ID, rest);
    expect(result.title).toBe('');
  });

  it('defaults prompt to empty string when absent', () => {
    const { prompt: _removed, ...rest } = MINIMAL_INPUT;
    void _removed;
    const result = normalizeActivityWallLibraryEntry(DOC_ID, rest);
    expect(result.prompt).toBe('');
  });

  it('defaults mode to "text" when absent', () => {
    const { mode: _removed, ...rest } = MINIMAL_INPUT;
    void _removed;
    const result = normalizeActivityWallLibraryEntry(DOC_ID, rest);
    expect(result.mode).toBe('text');
  });

  it('defaults moderationEnabled to false when absent', () => {
    const { moderationEnabled: _removed, ...rest } = MINIMAL_INPUT;
    void _removed;
    const result = normalizeActivityWallLibraryEntry(DOC_ID, rest);
    expect(result.moderationEnabled).toBe(false);
  });

  it('coerces truthy moderationEnabled to boolean true', () => {
    const result = normalizeActivityWallLibraryEntry(DOC_ID, {
      ...MINIMAL_INPUT,
      moderationEnabled: true,
    });
    expect(result.moderationEnabled).toBe(true);
  });

  it('defaults identificationMode to "anonymous" when absent', () => {
    const { identificationMode: _removed, ...rest } = MINIMAL_INPUT;
    void _removed;
    const result = normalizeActivityWallLibraryEntry(DOC_ID, rest);
    expect(result.identificationMode).toBe('anonymous');
  });

  it('defaults createdAt to 0 when absent', () => {
    const { createdAt: _removed, ...rest } = MINIMAL_INPUT;
    void _removed;
    const result = normalizeActivityWallLibraryEntry(DOC_ID, rest);
    expect(result.createdAt).toBe(0);
  });

  it('defaults updatedAt to 0 when absent', () => {
    const { updatedAt: _removed, ...rest } = MINIMAL_INPUT;
    void _removed;
    const result = normalizeActivityWallLibraryEntry(DOC_ID, rest);
    expect(result.updatedAt).toBe(0);
  });

  it('preserves a fully-specified entry unchanged', () => {
    const result = normalizeActivityWallLibraryEntry(DOC_ID, {
      ...MINIMAL_INPUT,
      id: DOC_ID,
    });
    expect(result).toEqual({
      id: DOC_ID,
      ...MINIMAL_INPUT,
    });
  });
});
