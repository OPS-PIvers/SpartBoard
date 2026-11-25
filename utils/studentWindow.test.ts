import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  classCloseAt,
  hasStudentWindows,
  studentCloseAt,
  studentDueAt,
} from './studentWindow';

const MARKER = '// ---- shared body ----';
const bodyOf = (path: string): string => {
  const src = readFileSync(resolve(__dirname, path), 'utf8');
  return src.slice(src.indexOf(MARKER));
};

describe('studentWindow mirror', () => {
  it('matches functions/src/studentWindow.ts below the marker', () => {
    expect(bodyOf('../functions/src/studentWindow.ts')).toBe(
      bodyOf('./studentWindow.ts')
    );
  });
});

describe('classCloseAt', () => {
  it('is the session close without a marker', () => {
    expect(classCloseAt({ closeAt: 500 })).toBe(500);
    expect(classCloseAt({})).toBeNull();
    expect(hasStudentWindows({ studentWindows: undefined })).toBe(false);
  });

  it('is the class close while the widened close still stands', () => {
    const session = {
      closeAt: 900,
      studentWindows: { classCloseAt: 500, closeAt: 900 },
    };
    expect(hasStudentWindows(session)).toBe(true);
    expect(classCloseAt(session)).toBe(500);
  });

  it('follows a later Close or Reopen that rewrote the session close', () => {
    const marker = { classCloseAt: 500, closeAt: 900 };
    expect(classCloseAt({ closeAt: 300, studentWindows: marker })).toBe(300);
    expect(classCloseAt({ closeAt: null, studentWindows: marker })).toBeNull();
  });

  it('keeps an unbounded class unbounded', () => {
    expect(
      classCloseAt({
        closeAt: null,
        studentWindows: { classCloseAt: null, closeAt: null },
      })
    ).toBeNull();
  });
});

describe('studentCloseAt', () => {
  const widened = {
    closeAt: 900,
    studentWindows: { classCloseAt: 500, closeAt: 900 },
  };
  it("takes the student's own close first", () => {
    expect(studentCloseAt(widened, 900)).toBe(900);
    expect(studentCloseAt(widened, 400)).toBe(400);
  });
  it('closes a student without one at the class close', () => {
    expect(studentCloseAt(widened)).toBe(500);
    expect(studentCloseAt(widened, null)).toBe(500);
  });
});

describe('studentDueAt', () => {
  const session = { dueAt: 10, dueAtByClassId: { c1: 20, c2: 25 } };
  it('resolves pointer, then class, then session', () => {
    expect(studentDueAt(session, 'c1', 30)).toBe(30);
    expect(studentDueAt(session, 'c1')).toBe(20);
    expect(studentDueAt(session, ['c3', 'c2'])).toBe(25);
    expect(studentDueAt(session, 'c3')).toBe(10);
    expect(studentDueAt({}, null)).toBeNull();
  });
});
