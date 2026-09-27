import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const updateDoc = vi.fn(() => Promise.resolve());
let adminDoc: { data: () => unknown } = { data: () => undefined };
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...path: string[]) => path.join('/'),
  deleteField: () => 'DELETE',
  updateDoc: (...args: unknown[]) => updateDoc(...(args as [])),
  onSnapshot: (_ref: unknown, next: (snap: typeof adminDoc) => void) => {
    next(adminDoc);
    return () => undefined;
  },
}));
vi.mock('@/config/firebase', () => ({ db: {} }));
let connector = true;
vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    user: { uid: 'u1' },
    canAccessFeature: () => connector,
  }),
}));
const showConfirm = vi.fn(() => Promise.resolve(false));
vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({ showConfirm }),
}));

import { useClaudeReview } from './useClaudeReview';

const marked = { id: 'q1', title: 'Cells', claudeReviewPendingAt: 9 };

describe('useClaudeReview', () => {
  beforeEach(() => {
    connector = true;
    adminDoc = { data: () => undefined };
    updateDoc.mockClear();
    showConfirm.mockClear();
  });

  it('badges a marked item and asks before it reaches students', async () => {
    const { result } = renderHook(() => useClaudeReview('quizzes'));
    expect(result.current.badge(marked)).toMatchObject({
      label: 'Review before assigning',
      tone: 'warn',
    });
    expect(result.current.badge({ id: 'x' })).toBeNull();
    expect(await result.current.confirmUse(marked)).toBe(false);
    expect(showConfirm).toHaveBeenCalledTimes(1);
    expect(await result.current.confirmUse({ id: 'x' })).toBe(true);
    expect(showConfirm).toHaveBeenCalledTimes(1);
  });

  it('clears the mark when the editor opens', () => {
    const { result } = renderHook(() => useClaudeReview('miniapps'));
    result.current.markReviewed(marked);
    expect(updateDoc).toHaveBeenCalledWith('users/u1/miniapps/q1', {
      claudeReviewPendingAt: 'DELETE',
    });
    result.current.markReviewed({ id: 'clean' });
    expect(updateDoc).toHaveBeenCalledTimes(1);
  });

  it('stays quiet when an admin turns reminders off or the teacher lacks the connector', async () => {
    adminDoc = { data: () => ({ enabled: false }) };
    const off = renderHook(() => useClaudeReview('quizzes'));
    expect(off.result.current.badge(marked)).toBeNull();
    expect(await off.result.current.confirmUse(marked)).toBe(true);
    adminDoc = { data: () => undefined };
    connector = false;
    const noFlag = renderHook(() => useClaudeReview('quizzes'));
    expect(noFlag.result.current.badge(marked)).toBeNull();
  });
});

describe('whenReviewed', () => {
  it('runs at once for an unmarked item and only after a yes for a marked one', async () => {
    connector = true;
    adminDoc = { data: () => undefined };
    const { result } = renderHook(() => useClaudeReview('quizzes'));
    const go = vi.fn();
    result.current.whenReviewed({ id: 'x' }, go);
    expect(go).toHaveBeenCalledTimes(1);
    showConfirm.mockResolvedValueOnce(true);
    result.current.whenReviewed(marked, go);
    expect(go).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(go).toHaveBeenCalledTimes(2));
  });
});
