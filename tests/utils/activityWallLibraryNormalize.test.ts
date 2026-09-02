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
import {
  normalizeActivityWallLibraryEntry,
  normalizeActivityWallSubmission,
  normalizeActivityWallSession,
  buildDefaultWall,
  mirrorSessionFromEntry,
} from '@/utils/activityWallNormalize';
import type { ActivityWallIdentificationMode } from '@/types';

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

  it('preserves a fully-specified entry unchanged aside from derived new-field defaults', () => {
    const result = normalizeActivityWallLibraryEntry(DOC_ID, {
      ...MINIMAL_INPUT,
      id: DOC_ID,
    });
    expect(result).toEqual({
      id: DOC_ID,
      ...MINIMAL_INPUT,
      layout: 'wordcloud',
      allowedTypes: { photo: false, link: false, file: false, video: false },
      appearance: {
        kind: 'gradient',
        value: 'bg-gradient-to-br from-slate-900 to-slate-700',
      },
      allowGuests: true,
      showNames: false,
      maxPostsPerStudent: 0,
      allowStudentEdit: false,
      allowStudentDelete: false,
      acceptingResponses: true,
    });
  });
});

// ─── Padlet-lite redesign (P1-1): legacy → new-field derivation ─────────────

describe('normalizeActivityWallLibraryEntry — legacy layout/allowedTypes derivation', () => {
  it('defaults layout to "wordcloud" for legacy text mode', () => {
    const result = normalizeActivityWallLibraryEntry(DOC_ID, {
      ...MINIMAL_INPUT,
      mode: 'text',
    });
    expect(result.layout).toBe('wordcloud');
    expect(result.allowedTypes).toEqual({
      photo: false,
      link: false,
      file: false,
      video: false,
    });
  });

  it('defaults layout to "wall" and allowedTypes.photo to true for legacy photo mode', () => {
    const result = normalizeActivityWallLibraryEntry(DOC_ID, {
      ...MINIMAL_INPUT,
      mode: 'photo',
    });
    expect(result.layout).toBe('wall');
    expect(result.allowedTypes).toEqual({
      photo: true,
      link: false,
      file: false,
      video: false,
    });
  });

  it('does not override an explicit layout/allowedTypes already on the doc', () => {
    const result = normalizeActivityWallLibraryEntry(DOC_ID, {
      ...MINIMAL_INPUT,
      mode: 'photo',
      layout: 'map',
      allowedTypes: { photo: false, link: true, file: false, video: false },
    });
    expect(result.layout).toBe('map');
    expect(result.allowedTypes).toEqual({
      photo: false,
      link: true,
      file: false,
      video: false,
    });
  });

  it('defaults appearance to the shared gradient default', () => {
    const result = normalizeActivityWallLibraryEntry(DOC_ID, MINIMAL_INPUT);
    expect(result.appearance).toEqual({
      kind: 'gradient',
      value: 'bg-gradient-to-br from-slate-900 to-slate-700',
    });
  });

  it('defaults maxPostsPerStudent to 0 (unlimited) and acceptingResponses to true', () => {
    const result = normalizeActivityWallLibraryEntry(DOC_ID, MINIMAL_INPUT);
    expect(result.maxPostsPerStudent).toBe(0);
    expect(result.acceptingResponses).toBe(true);
    expect(result.allowStudentEdit).toBe(false);
    expect(result.allowStudentDelete).toBe(false);
  });
});

describe('normalizeActivityWallLibraryEntry — legacy identificationMode → allowGuests/showNames', () => {
  const LEGACY_MODES: {
    mode: ActivityWallIdentificationMode;
    showNames: boolean;
  }[] = [
    { mode: 'anonymous', showNames: false },
    { mode: 'pin', showNames: false },
    { mode: 'name', showNames: true },
    { mode: 'name-pin', showNames: true },
  ];

  for (const { mode, showNames } of LEGACY_MODES) {
    it(`maps identificationMode "${mode}" to allowGuests=true, showNames=${showNames}`, () => {
      const result = normalizeActivityWallLibraryEntry(DOC_ID, {
        ...MINIMAL_INPUT,
        identificationMode: mode,
      });
      // The pre-redesign student page always signed in anonymously regardless
      // of identificationMode, so every legacy mode implies allowGuests: true.
      expect(result.allowGuests).toBe(true);
      expect(result.showNames).toBe(showNames);
    });
  }

  it('respects an explicit allowGuests/showNames already on the doc', () => {
    const result = normalizeActivityWallLibraryEntry(DOC_ID, {
      ...MINIMAL_INPUT,
      identificationMode: 'anonymous',
      allowGuests: false,
      showNames: true,
    });
    expect(result.allowGuests).toBe(false);
    expect(result.showNames).toBe(true);
  });
});

describe('normalizeActivityWallSubmission', () => {
  it('normalizes a legacy submission with no type as "text" on a non-photo wall', () => {
    const result = normalizeActivityWallSubmission(
      'sub-1',
      {
        content: 'Hello world',
        submittedAt: 1_700_000_000_000,
        status: 'approved',
      },
      false
    );
    expect(result.type).toBe('text');
    expect(result.id).toBe('sub-1');
  });

  it('normalizes a legacy submission with no type as "photo" when content is a URL on a legacy photo wall', () => {
    const result = normalizeActivityWallSubmission(
      'sub-2',
      {
        content: 'https://example.com/photo.jpg',
        submittedAt: 1_700_000_000_000,
        status: 'approved',
      },
      true
    );
    expect(result.type).toBe('photo');
  });

  it('normalizes a legacy submission as "text" on a legacy photo wall when content is not a URL', () => {
    const result = normalizeActivityWallSubmission(
      'sub-3',
      {
        content: 'not a url',
        submittedAt: 1_700_000_000_000,
        status: 'approved',
      },
      true
    );
    expect(result.type).toBe('text');
  });

  it('preserves an explicit type already on the doc', () => {
    const result = normalizeActivityWallSubmission(
      'sub-4',
      {
        content: 'https://example.com',
        submittedAt: 1_700_000_000_000,
        status: 'approved',
        type: 'link',
      },
      true
    );
    expect(result.type).toBe('link');
  });

  it('defaults status to "approved" when absent and content/submittedAt when absent', () => {
    const result = normalizeActivityWallSubmission('sub-5', {});
    expect(result.status).toBe('approved');
    expect(result.content).toBe('');
    expect(result.submittedAt).toBe(0);
  });
});

describe('normalizeActivityWallSession', () => {
  it('derives layout/allowedTypes/allowGuests/showNames from legacy fields', () => {
    const result = normalizeActivityWallSession('uid_activity-1', {
      title: 'Wall',
      prompt: 'Prompt',
      mode: 'photo',
      identificationMode: 'name',
      moderationEnabled: false,
      activityId: 'activity-1',
      teacherUid: 'uid',
    });
    expect(result.layout).toBe('wall');
    expect(result.allowedTypes).toEqual({
      photo: true,
      link: false,
      file: false,
      video: false,
    });
    expect(result.allowGuests).toBe(true);
    expect(result.showNames).toBe(true);
  });

  it('computes driveVisibility "anyone" when allowGuests is true', () => {
    const result = normalizeActivityWallSession('uid_activity-1', {
      identificationMode: 'anonymous',
      activityId: 'activity-1',
      teacherUid: 'uid',
    });
    expect(result.allowGuests).toBe(true);
    expect(result.driveVisibility).toBe('anyone');
  });

  it('computes driveVisibility "domain" when allowGuests is explicitly false', () => {
    const result = normalizeActivityWallSession('uid_activity-1', {
      allowGuests: false,
      activityId: 'activity-1',
      teacherUid: 'uid',
    });
    expect(result.driveVisibility).toBe('domain');
  });

  it('respects an explicit driveVisibility already on the doc', () => {
    const result = normalizeActivityWallSession('uid_activity-1', {
      allowGuests: true,
      driveVisibility: 'domain',
      activityId: 'activity-1',
      teacherUid: 'uid',
    });
    expect(result.driveVisibility).toBe('domain');
  });
});

describe('buildDefaultWall', () => {
  it('returns a blank entry with sensible defaults when no building defaults are given', () => {
    const result = buildDefaultWall();
    expect(result.title).toBe('');
    expect(result.prompt).toBe('');
    expect(result.mode).toBe('text');
    expect(result.layout).toBe('wordcloud');
    expect(result.allowGuests).toBe(true);
    expect(result.showNames).toBe(false);
    expect(result.acceptingResponses).toBe(true);
    expect(result.maxPostsPerStudent).toBe(0);
    expect(typeof result.id).toBe('string');
    expect(result.id.length).toBeGreaterThan(0);
  });

  it('seeds mode/moderationEnabled/identificationMode from building defaults', () => {
    const result = buildDefaultWall({
      mode: 'photo',
      moderationEnabled: true,
      identificationMode: 'name',
    });
    expect(result.mode).toBe('photo');
    expect(result.layout).toBe('wall');
    expect(result.moderationEnabled).toBe(true);
    expect(result.showNames).toBe(true);
  });
});

describe('mirrorSessionFromEntry', () => {
  it('computes driveVisibility "anyone" for a guest-allowed entry', () => {
    const entry = buildDefaultWall();
    const session = mirrorSessionFromEntry(entry, 'teacher-uid');
    expect(session.driveVisibility).toBe('anyone');
    expect(session.teacherUid).toBe('teacher-uid');
    expect(session.activityId).toBe(entry.id);
    expect(session.id).toBe(`teacher-uid_${entry.id}`);
  });

  it('computes driveVisibility "domain" when the entry disallows guests', () => {
    const entry = { ...buildDefaultWall(), allowGuests: false };
    const session = mirrorSessionFromEntry(entry, 'teacher-uid');
    expect(session.driveVisibility).toBe('domain');
  });

  it('carries classIds/sections/mapCenter onto the session when present', () => {
    const entry = {
      ...buildDefaultWall(),
      classIds: ['class-a'],
      sections: [{ id: 's1', label: 'Column 1' }],
      mapCenter: { lat: 1, lng: 2, zoom: 3 },
    };
    const session = mirrorSessionFromEntry(entry, 'teacher-uid');
    expect(session.classIds).toEqual(['class-a']);
    expect(session.sections).toEqual([{ id: 's1', label: 'Column 1' }]);
    expect(session.mapCenter).toEqual({ lat: 1, lng: 2, zoom: 3 });
  });
});
