import React from 'react';
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { doc, getDoc } from 'firebase/firestore';
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

const study: AssignmentSummary = {
  compositeId: 'flashcards:fc-1',
  kind: 'flashcards',
  sessionId: 'fc-1',
  title: 'Spanish Food',
  openHref: '/flashcards/a/fc-1',
  channel: 'active',
  classIds: [],
  gradingState: 'not-graded',
  flashcardKind: 'study',
};

const progressDoc = (data: Record<string, unknown> | null) => ({
  exists: () => data !== null,
  data: () => data ?? undefined,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('AssignmentListItem — flashcards', () => {
  it('reads the auth-uid progress doc and treats a Study with progress as not completed', async () => {
    (getDoc as Mock).mockResolvedValue(progressDoc({ round: 3 }));
    const onResolved = vi.fn();
    render(
      <AssignmentListItem
        assignment={study}
        pseudonymUid="uid-1"
        onCompletionResolved={onResolved}
      />
    );
    await waitFor(() =>
      expect(onResolved).toHaveBeenCalledWith(
        'fc-1',
        'flashcards',
        'not-completed'
      )
    );
    expect(doc).toHaveBeenCalledWith(
      expect.anything(),
      'flashcard_sessions',
      'fc-1',
      'progress',
      'uid-1'
    );
  });

  it('marks a Check completed only when submittedAt is numeric', async () => {
    (getDoc as Mock).mockResolvedValue(progressDoc({ submittedAt: 42 }));
    const onResolved = vi.fn();
    render(
      <AssignmentListItem
        assignment={{ ...study, flashcardKind: 'check' }}
        pseudonymUid="uid-1"
        onCompletionResolved={onResolved}
      />
    );
    await waitFor(() =>
      expect(onResolved).toHaveBeenCalledWith('fc-1', 'flashcards', 'completed')
    );
  });

  it('keeps a closed Study clickable', async () => {
    (getDoc as Mock).mockResolvedValue(progressDoc({ round: 1 }));
    render(
      <AssignmentListItem
        assignment={study}
        pseudonymUid="uid-1"
        windowState="closed"
      />
    );
    const link = await screen.findByRole('link');
    expect(link).toHaveAttribute('href', '/flashcards/a/fc-1');
  });

  it('locks an upcoming Study and a closed unsubmitted Check', async () => {
    (getDoc as Mock).mockResolvedValue(progressDoc(null));
    const { unmount } = render(
      <AssignmentListItem
        assignment={study}
        pseudonymUid="uid-1"
        windowState="upcoming"
      />
    );
    expect(screen.getByRole('button')).not.toHaveAttribute('href');
    unmount();
    render(
      <AssignmentListItem
        assignment={{ ...study, flashcardKind: 'check' }}
        pseudonymUid="uid-1"
        windowState="closed"
      />
    );
    expect(await screen.findByRole('button')).not.toHaveAttribute('href');
  });
});
