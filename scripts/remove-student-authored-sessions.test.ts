import { describe, expect, it } from 'vitest';
import {
  authSaysStudent,
  isStudentPseudonym,
  planCleanup,
  sessionOwner,
} from './remove-student-authored-sessions.mjs';

const STUDENT = 'a'.repeat(63) + 'f';
const TEACHER = 'Xy3kP0qL9mN2bV7cR4tW8sZ1aE5d';

describe('isStudentPseudonym', () => {
  it('matches only 64-character lowercase hex uids', () => {
    expect(isStudentPseudonym(STUDENT)).toBe(true);
    expect(isStudentPseudonym(TEACHER)).toBe(false);
    expect(isStudentPseudonym(STUDENT.toUpperCase())).toBe(false);
    expect(isStudentPseudonym(STUDENT.slice(1))).toBe(false);
    expect(isStudentPseudonym('mock-user-id')).toBe(false);
    expect(isStudentPseudonym(null)).toBe(false);
  });
});

describe('sessionOwner', () => {
  it('reads teacherUid, falling back to the Activity Wall id prefix', () => {
    expect(sessionOwner('quiz_sessions', 's1', { teacherUid: TEACHER })).toBe(
      TEACHER
    );
    expect(sessionOwner('quiz_sessions', `${STUDENT}_x`, {})).toBeNull();
    expect(sessionOwner('activity_wall_sessions', `${STUDENT}_act-1`, {})).toBe(
      STUDENT
    );
    expect(
      sessionOwner('activity_wall_sessions', `${STUDENT}_act-1`, {
        teacherUid: TEACHER,
      })
    ).toBe(TEACHER);
    expect(sessionOwner('activity_wall_sessions', 'no-prefix', {})).toBeNull();
  });
});

describe('authSaysStudent / planCleanup', () => {
  it('deletes when Auth has no account or no provider, and holds back a provider account', () => {
    expect(authSaysStudent(undefined)).toBe(true);
    expect(authSaysStudent({ providerData: [] })).toBe(true);
    expect(
      authSaysStudent({ providerData: [{ providerId: 'google.com' }] })
    ).toBe(false);

    const other = 'b'.repeat(64);
    const candidates = [
      { id: 's1', owner: STUDENT },
      { id: 's2', owner: other },
    ];
    const users = new Map([
      [other, { providerData: [{ providerId: 'google.com' }] }],
    ]);
    const { remove, review } = planCleanup(candidates, users);
    expect(remove.map((c) => c.id)).toEqual(['s1']);
    expect(review.map((c) => c.id)).toEqual(['s2']);
  });
});
