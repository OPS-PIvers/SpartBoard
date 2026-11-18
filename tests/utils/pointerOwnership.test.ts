import { describe, expect, it } from 'vitest';
import { isForeignPointer } from '@/utils/pointerOwnership';
import { isForeignPointer as serverIsForeignPointer } from '@/functions/src/pointerOwnership';

describe('isForeignPointer', () => {
  const expected = { sessionId: 's1', teacherUid: 't1' };

  it('accepts a pointer stamped for the same session and teacher', () => {
    expect(
      isForeignPointer({ sessionId: 's1', teacherUid: 't1' }, expected)
    ).toBe(false);
  });

  it('rejects a pointer planted by another teacher for their own session', () => {
    expect(
      isForeignPointer({ sessionId: 's2', teacherUid: 't2' }, expected)
    ).toBe(true);
    expect(
      isForeignPointer({ sessionId: 's1', teacherUid: 't2' }, expected)
    ).toBe(true);
  });

  it('tolerates legacy pointers and unknown expectations', () => {
    expect(isForeignPointer({}, expected)).toBe(false);
    expect(isForeignPointer(null, expected)).toBe(false);
    expect(isForeignPointer({ sessionId: 's2', teacherUid: 't2' }, {})).toBe(
      false
    );
  });

  it('rejects a pointer of another kind when the reader names its kind', () => {
    const withKind = { ...expected, kind: 'writing' };
    expect(
      isForeignPointer(
        { sessionId: 's1', teacherUid: 't1', kind: 'quiz' },
        withKind
      )
    ).toBe(true);
    expect(
      isForeignPointer(
        { sessionId: 's1', teacherUid: 't1', kind: 'writing' },
        withKind
      )
    ).toBe(false);
    expect(isForeignPointer({ kind: 'quiz' }, expected)).toBe(false);
  });

  it('matches the server copy', () => {
    const withKind = { ...expected, kind: 'writing' };
    for (const p of [{ kind: 'quiz' }, { kind: 'writing' }]) {
      expect(serverIsForeignPointer(p, withKind)).toBe(
        isForeignPointer(p, withKind)
      );
    }
    for (const p of [{ sessionId: 's2' }, { teacherUid: 't1' }, {}]) {
      expect(serverIsForeignPointer(p, expected)).toBe(
        isForeignPointer(p, expected)
      );
    }
  });
});
