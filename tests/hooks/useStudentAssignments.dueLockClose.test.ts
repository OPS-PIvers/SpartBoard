import { describe, it, expect } from 'vitest';
import { dueLockClose } from '@/hooks/useStudentAssignments';

describe('dueLockClose', () => {
  const session = (periodAccess: Record<string, unknown>) => ({
    dueLocks: true,
    dueAt: 100,
    periodAccess,
  });

  it('closes a Manual due-date quiz at the due for a locked class', () => {
    expect(
      dueLockClose(session({ a: { state: 'closed', closeAt: 100 } }), ['a'])
    ).toBe(100);
  });

  it('runs to a late-started class close, or stays open with none', () => {
    expect(
      dueLockClose(session({ a: { state: 'open', closeAt: 300 } }), ['a'])
    ).toBe(300);
    expect(
      dueLockClose(session({ a: { state: 'open', closeAt: null } }), ['a'])
    ).toBeUndefined();
  });

  it('ignores sessions without a due lock', () => {
    expect(dueLockClose({ dueAt: 100 }, ['a'])).toBeUndefined();
  });
});
