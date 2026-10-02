import React from 'react';
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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

const quiz: AssignmentSummary = {
  compositeId: 'quiz:q-1',
  workKind: 'work',
  kind: 'quiz',
  sessionId: 'q-1',
  title: 'Unit 3 quiz',
  openHref: '/quiz?code=1',
  channel: 'active',
  classIds: [],
  gradingState: 'not-graded',
};

const responseDoc = (data: Record<string, unknown> | null) => ({
  exists: () => data !== null,
  data: () => data ?? undefined,
});

beforeEach(() => {
  vi.clearAllMocks();
});

const renderRow = (onResolved: Mock) =>
  render(
    <AssignmentListItem
      assignment={quiz}
      pseudonymUid="uid-1"
      onCompletionResolved={onResolved}
    />
  );

describe('AssignmentListItem — turned-in check', () => {
  it('shows a half-finished quiz as in progress, not done', async () => {
    (getDoc as Mock).mockResolvedValue(responseDoc({ status: 'joined' }));
    const onResolved = vi.fn();
    renderRow(onResolved);
    await waitFor(() =>
      expect(onResolved).toHaveBeenCalledWith('q-1', 'quiz', 'in-progress')
    );
    expect(screen.getByText('In progress')).toBeInTheDocument();
  });

  it('marks a submitted quiz completed', async () => {
    (getDoc as Mock).mockResolvedValue(responseDoc({ status: 'completed' }));
    const onResolved = vi.fn();
    renderRow(onResolved);
    await waitFor(() =>
      expect(onResolved).toHaveBeenCalledWith('q-1', 'quiz', 'completed')
    );
  });

  it('keeps a retaking student turned in', async () => {
    (getDoc as Mock).mockResolvedValue(
      responseDoc({ status: 'joined', completedAttempts: 1 })
    );
    const onResolved = vi.fn();
    renderRow(onResolved);
    await waitFor(() =>
      expect(onResolved).toHaveBeenCalledWith('q-1', 'quiz', 'completed')
    );
  });

  it('treats no response doc as not completed', async () => {
    (getDoc as Mock).mockResolvedValue(responseDoc(null));
    const onResolved = vi.fn();
    renderRow(onResolved);
    await waitFor(() =>
      expect(onResolved).toHaveBeenCalledWith('q-1', 'quiz', 'not-completed')
    );
  });
});
