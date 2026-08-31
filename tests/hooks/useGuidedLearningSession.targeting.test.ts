import { describe, expect, it, vi, beforeEach, type Mock } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { doc, setDoc } from 'firebase/firestore';
import { useGuidedLearningSessionTeacher } from '@/hooks/useGuidedLearningSession';
import type { GuidedLearningSet } from '@/types';

// M17 §5 B3-gl — createSession's `window` param mirrors openAt/closeAt/dueAt
// onto the session doc, matching AssignTargetingSection's contract.

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  doc: vi.fn(() => 'session-doc-ref'),
  onSnapshot: vi.fn(),
  orderBy: vi.fn(),
  query: vi.fn(),
  setDoc: vi.fn(),
}));

vi.mock('@/config/firebase', () => ({
  db: {},
}));

const mockSetDoc = setDoc as Mock;
const mockDoc = doc as Mock;

function baseSet(): GuidedLearningSet {
  return {
    id: 'set-1',
    title: 'Test Set',
    imageUrls: [],
    steps: [],
    mode: 'guided',
    createdAt: 0,
    updatedAt: 0,
  };
}

beforeEach(() => {
  mockSetDoc.mockReset().mockResolvedValue(undefined);
  mockDoc.mockReset().mockReturnValue('session-doc-ref');
  // crypto.randomUUID is used to mint the session id.
  vi.stubGlobal('crypto', { randomUUID: () => 'session-1' });
});

describe('useGuidedLearningSessionTeacher.createSession — window fields', () => {
  it('omits openAt/closeAt/dueAt when no window is passed', async () => {
    const { result } = renderHook(() =>
      useGuidedLearningSessionTeacher('teacher-1')
    );
    await act(async () => {
      await result.current.createSession(baseSet());
    });
    const written = mockSetDoc.mock.calls[0][1];
    expect(written).not.toHaveProperty('openAt');
    expect(written).not.toHaveProperty('closeAt');
    expect(written).not.toHaveProperty('dueAt');
  });

  it('mirrors only the window fields that are actually set', async () => {
    const { result } = renderHook(() =>
      useGuidedLearningSessionTeacher('teacher-1')
    );
    await act(async () => {
      await result.current.createSession(
        baseSet(),
        [],
        [],
        [],
        'submissions',
        { openAt: 1000, closeAt: undefined, dueAt: 2000 }
      );
    });
    const written = mockSetDoc.mock.calls[0][1];
    expect(written.openAt).toBe(1000);
    expect(written).not.toHaveProperty('closeAt');
    expect(written.dueAt).toBe(2000);
  });
});
