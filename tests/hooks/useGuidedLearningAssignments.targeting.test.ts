import { describe, expect, it, vi, beforeEach, type Mock } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { setDoc } from 'firebase/firestore';
import { useGuidedLearningAssignments } from '@/hooks/useGuidedLearningAssignments';
import type { StudentOverride, StudentTargetRef } from '@/types';

// M17 §5 B3-gl — createAssignment persists the new targeting/window fields
// onto the teacher's assignment doc, omitting anything unset so legacy
// class-wide assignments stay free of the new fields.

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  deleteField: vi.fn(),
  doc: vi.fn(() => 'assignment-doc-ref'),
  documentId: vi.fn(),
  getDocs: vi.fn(),
  limit: vi.fn(),
  onSnapshot: vi.fn(() => vi.fn()),
  query: vi.fn(),
  startAfter: vi.fn(),
  orderBy: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  writeBatch: vi.fn(),
}));

vi.mock('@/config/firebase', () => ({
  db: {},
}));

vi.mock('./useSessionViewCount', () => ({
  invalidateSessionViewCount: vi.fn(),
}));

const mockSetDoc = setDoc as Mock;

beforeEach(() => {
  mockSetDoc.mockReset().mockResolvedValue(undefined);
});

describe('useGuidedLearningAssignments.createAssignment — targeting fields', () => {
  it('omits targeting/window fields for a plain class-wide assignment', async () => {
    const { result } = renderHook(() =>
      useGuidedLearningAssignments('teacher-1')
    );
    await act(async () => {
      await result.current.createAssignment({
        sessionId: 'session-1',
        setId: 'set-1',
        setTitle: 'Test Set',
      });
    });
    const written = mockSetDoc.mock.calls[0][1];
    expect(written).not.toHaveProperty('targetMode');
    expect(written).not.toHaveProperty('targetStudents');
    expect(written).not.toHaveProperty('targetGroupIds');
    expect(written).not.toHaveProperty('overridesBySourcedId');
    expect(written).not.toHaveProperty('openAt');
    expect(written).not.toHaveProperty('closeAt');
    expect(written).not.toHaveProperty('dueAt');
  });

  it('persists targeting, overrides, and window fields when provided', async () => {
    const targetStudents: StudentTargetRef[] = [
      { kind: 'classlink', sourcedId: 'abc123' },
    ];
    const overridesBySourcedId: Record<string, StudentOverride> = {
      'classlink:abc123': { timeMultiplier: 2 },
    };
    const { result } = renderHook(() =>
      useGuidedLearningAssignments('teacher-1')
    );
    await act(async () => {
      await result.current.createAssignment({
        sessionId: 'session-1',
        setId: 'set-1',
        setTitle: 'Test Set',
        targetMode: 'students',
        targetStudents,
        targetGroupIds: ['group-1'],
        overridesBySourcedId,
        openAt: 1000,
        closeAt: 2000,
        dueAt: 1500,
      });
    });
    const written = mockSetDoc.mock.calls[0][1] as Record<string, unknown>;
    expect(written.targetMode).toBe('students');
    expect(written.targetStudents).toEqual(targetStudents);
    expect(written.targetGroupIds).toEqual(['group-1']);
    expect(written.overridesBySourcedId).toEqual(overridesBySourcedId);
    expect(written.openAt).toBe(1000);
    expect(written.closeAt).toBe(2000);
    expect(written.dueAt).toBe(1500);
  });
});
