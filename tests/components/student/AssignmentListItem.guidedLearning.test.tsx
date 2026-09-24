import React from 'react';
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { getDoc } from 'firebase/firestore';
import { AssignmentListItem } from '@/components/student/AssignmentListItem';
import type { AssignmentSummary } from '@/hooks/useStudentAssignments';

vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({ showAlert: vi.fn().mockResolvedValue(undefined) }),
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db: unknown, ...segs: string[]) => segs.join('/')),
  getDoc: vi.fn(),
}));

vi.mock('@/config/firebase', () => ({ db: {}, functions: {} }));

const gl: AssignmentSummary = {
  compositeId: 'guided-learning:gl-1',
  kind: 'guided-learning',
  sessionId: 'gl-1',
  title: 'Cell parts',
  openHref: '/guided-learning/gl-1',
  channel: 'active',
  classIds: [],
  gradingState: 'not-graded',
};

const responseDoc = (data: Record<string, unknown>) => ({
  exists: () => true,
  data: () => data,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('AssignmentListItem — guided learning', () => {
  it('keeps answers saved without a submit out of Completed', async () => {
    (getDoc as Mock).mockResolvedValue(
      responseDoc({ answers: [], completedAt: null })
    );
    const onResolved = vi.fn();
    render(
      <AssignmentListItem
        assignment={gl}
        pseudonymUid="uid-1"
        onCompletionResolved={onResolved}
      />
    );
    await waitFor(() =>
      expect(onResolved).toHaveBeenCalledWith(
        'gl-1',
        'guided-learning',
        'not-completed'
      )
    );
  });

  it('marks a submitted response completed', async () => {
    (getDoc as Mock).mockResolvedValue(
      responseDoc({ answers: [], completedAt: 9 })
    );
    const onResolved = vi.fn();
    render(
      <AssignmentListItem
        assignment={gl}
        pseudonymUid="uid-1"
        onCompletionResolved={onResolved}
      />
    );
    await waitFor(() =>
      expect(onResolved).toHaveBeenCalledWith(
        'gl-1',
        'guided-learning',
        'completed'
      )
    );
  });
});
