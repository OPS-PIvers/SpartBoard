import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useStudentAssignmentPointer } from '@/hooks/useStudentAssignmentPointer';

const mockOnSnapshot = vi.hoisted(() => vi.fn());

vi.mock('firebase/firestore', () => ({
  doc: vi.fn(() => ({ path: 'mock' })),
  onSnapshot: mockOnSnapshot,
}));

vi.mock('@/config/firebase', () => ({ db: {} }));

const pointer = {
  kind: 'quiz',
  sessionId: 'w1',
  teacherUid: 'teacher-a',
  classId: 'c1',
  closeAt: 9_999_999_999_999,
};

const renderWithPointer = (
  expected: Parameters<typeof useStudentAssignmentPointer>[3]
) => {
  let deliver: ((snap: unknown) => void) | undefined;
  mockOnSnapshot.mockImplementation((_ref, next) => {
    deliver = next;
    return () => undefined;
  });
  const hook = renderHook(() =>
    useStudentAssignmentPointer('uid1', 'w1', true, expected)
  );
  act(() => deliver?.({ exists: () => true, data: () => pointer }));
  return hook;
};

describe('useStudentAssignmentPointer — foreign pointers', () => {
  beforeEach(() => mockOnSnapshot.mockReset());

  it('ignores a same-id pointer another teacher planted for another kind', () => {
    const { result } = renderWithPointer({
      sessionId: 'w1',
      teacherUid: 'teacher-v',
      kind: 'writing',
    });
    expect(result.current).toBeNull();
  });

  it('ignores a pointer of another kind even when the teacher matches', () => {
    const { result } = renderWithPointer({
      sessionId: 'w1',
      teacherUid: 'teacher-a',
      kind: 'flashcards',
    });
    expect(result.current).toBeNull();
  });

  it('returns the pointer stamped for this session, teacher and kind', () => {
    const { result } = renderWithPointer({
      sessionId: 'w1',
      teacherUid: 'teacher-a',
      kind: 'quiz',
    });
    await waitFor(() => expect(result.current).toEqual(pointer));
  });
});
