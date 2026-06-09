/**
 * Regression test for the normalizeSession field-stripping bug in
 * `hooks/useMiniAppSession.ts`.
 *
 * Root cause: the internal `normalizeSession` returned a hand-enumerated
 * literal that silently dropped every optional field on `MiniAppSession`
 * not explicitly listed. Specifically:
 *
 *   - `submissionsEnabled: false` (stored for view-only sessions) was
 *     dropped because the guard was `=== true` only:
 *       `...(data.submissionsEnabled === true ? { submissionsEnabled: true } : {})`
 *     After normalization the field became `undefined`, diverging from the
 *     Firestore source of truth.
 *
 *   - Any future or currently-optional field not named in the literal
 *     (e.g. `classIds`, `rosterIds`) was dropped when the teacher's session
 *     list was refreshed via `onSnapshot`.
 *
 * Impact: every `onSnapshot` update to the session list (triggered by any
 * field change — rename, end, new session) ran `normalizeSession` and
 * stripped the fields. Teacher UI reading `session.submissionsEnabled` from
 * the list received `undefined` instead of `false`.
 *
 * Fix: extracted `normalizeSession` to `utils/miniAppNormalize.ts` as the
 * exported `normalizeMiniAppSession`. The function now spreads `...data` as
 * the first property of the returned object so all optional fields survive,
 * then overrides only the fields that require normalization or defaulting.
 */

import { describe, it, expect } from 'vitest';
import { normalizeMiniAppSession } from '@/utils/miniAppNormalize';

const SESSION_ID = 'session-abc';

/** Minimal required fields that normalizeMiniAppSession must default. */
const MINIMAL_INPUT = {
  appId: 'app-1',
  appTitle: 'My App',
  appHtml: '<h1>Hello</h1>',
  teacherUid: 'teacher-uid',
  assignmentName: 'Test Assignment',
  status: 'active' as const,
  createdAt: 1_700_000_000_000,
};

// ─── field-stripping regression ───────────────────────────────────────────────

describe('normalizeMiniAppSession — optional field preservation', () => {
  it('preserves submissionsEnabled: false (the primary regression)', () => {
    // This is the exact value stored by createSession for view-only sessions.
    // The old code dropped it because `false !== true` in the guard.
    const result = normalizeMiniAppSession(SESSION_ID, {
      ...MINIMAL_INPUT,
      submissionsEnabled: false,
    });
    expect(result.submissionsEnabled).toBe(false);
  });

  it('preserves submissionsEnabled: true', () => {
    const result = normalizeMiniAppSession(SESSION_ID, {
      ...MINIMAL_INPUT,
      submissionsEnabled: true,
    });
    expect(result.submissionsEnabled).toBe(true);
  });

  it('preserves classIds when present', () => {
    const result = normalizeMiniAppSession(SESSION_ID, {
      ...MINIMAL_INPUT,
      classIds: ['class-a', 'class-b'],
    });
    expect(result.classIds).toEqual(['class-a', 'class-b']);
  });

  it('preserves rosterIds when present', () => {
    const result = normalizeMiniAppSession(SESSION_ID, {
      ...MINIMAL_INPUT,
      rosterIds: ['roster-1', 'roster-2'],
    });
    expect(result.rosterIds).toEqual(['roster-1', 'roster-2']);
  });

  it('preserves mode: view-only', () => {
    const result = normalizeMiniAppSession(SESSION_ID, {
      ...MINIMAL_INPUT,
      mode: 'view-only',
    });
    expect(result.mode).toBe('view-only');
  });

  it('preserves mode: submissions', () => {
    const result = normalizeMiniAppSession(SESSION_ID, {
      ...MINIMAL_INPUT,
      mode: 'submissions',
    });
    expect(result.mode).toBe('submissions');
  });

  it('preserves endedAt when present', () => {
    const result = normalizeMiniAppSession(SESSION_ID, {
      ...MINIMAL_INPUT,
      endedAt: 1_700_000_001_000,
    });
    expect(result.endedAt).toBe(1_700_000_001_000);
  });
});

// ─── required field normalization ─────────────────────────────────────────────

describe('normalizeMiniAppSession — required field defaults', () => {
  it('sets id from sessionId argument (overrides any id in data)', () => {
    const result = normalizeMiniAppSession(SESSION_ID, {
      ...MINIMAL_INPUT,
      id: 'wrong-id',
    });
    expect(result.id).toBe(SESSION_ID);
  });

  it('defaults appTitle to "Mini App" when absent', () => {
    const result = normalizeMiniAppSession(SESSION_ID, {
      ...MINIMAL_INPUT,
      appTitle: undefined,
    });
    expect(result.appTitle).toBe('Mini App');
  });

  it('defaults appId to empty string when absent', () => {
    const result = normalizeMiniAppSession(SESSION_ID, {
      ...MINIMAL_INPUT,
      appId: undefined,
    });
    expect(result.appId).toBe('');
  });

  it('defaults teacherUid to empty string when absent', () => {
    const result = normalizeMiniAppSession(SESSION_ID, {
      ...MINIMAL_INPUT,
      teacherUid: undefined,
    });
    expect(result.teacherUid).toBe('');
  });

  it('defaults appHtml to empty string when absent', () => {
    const result = normalizeMiniAppSession(SESSION_ID, {
      ...MINIMAL_INPUT,
      appHtml: undefined,
    });
    expect(result.appHtml).toBe('');
  });

  it('defaults status to "active" for any non-ended value', () => {
    const result = normalizeMiniAppSession(SESSION_ID, {
      ...MINIMAL_INPUT,
      status: undefined,
    });
    expect(result.status).toBe('active');
  });

  it('preserves "ended" status correctly', () => {
    const result = normalizeMiniAppSession(SESSION_ID, {
      ...MINIMAL_INPUT,
      status: 'ended',
    });
    expect(result.status).toBe('ended');
  });

  it('generates assignmentName from title + date when blank', () => {
    const result = normalizeMiniAppSession(SESSION_ID, {
      ...MINIMAL_INPUT,
      assignmentName: '',
      appTitle: 'Science App',
      createdAt: 1_700_000_000_000,
    });
    expect(result.assignmentName).toMatch(/Science App/);
  });

  it('preserves a non-blank assignmentName', () => {
    const result = normalizeMiniAppSession(SESSION_ID, {
      ...MINIMAL_INPUT,
      assignmentName: 'My Assignment',
    });
    expect(result.assignmentName).toBe('My Assignment');
  });

  it('endedAt is absent when not present in data', () => {
    const result = normalizeMiniAppSession(SESSION_ID, MINIMAL_INPUT);
    expect(result.endedAt).toBeUndefined();
  });
});
