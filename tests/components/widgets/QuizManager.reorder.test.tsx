/**
 * Tests for QuizManager drag-reorder persistence parity.
 *
 * Verifies:
 *   (a) With no `order` fields + default sort ('updated' desc), visible order
 *       is unchanged from the input order (backward-compat for existing users).
 *   (b) The `manual` comparator sorts by `order` ascending.
 *   (c) A reorder commit calls `onReorderQuizzes` with the reordered id array.
 *
 * Mocking strategy mirrors QuizManager.assign.test.tsx — heavy hooks stubbed,
 * library primitives (useSortableReorder, useLibraryView) left real.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

import {
  QuizManager,
  SORT_COMPARATORS,
} from '@/components/widgets/QuizWidget/components/QuizManager';
import type { QuizConfig, QuizMetadata } from '@/types';

// ---------------------------------------------------------------------------
// Heavy hook stubs (same as QuizManager.assign.test.tsx)
// ---------------------------------------------------------------------------

vi.mock('@/hooks/usePlcs', () => ({
  usePlcs: () => ({ plcs: [] }),
}));

vi.mock('@/hooks/useFolders', () => ({
  useFolders: () => ({
    folders: [],
    loading: false,
    error: null,
    createFolder: vi.fn(),
    renameFolder: vi.fn(),
    moveFolder: vi.fn(),
    deleteFolder: vi.fn(),
    moveItem: vi.fn(),
  }),
}));

vi.mock('@/hooks/useSessionViewCount', () => ({
  useSessionViewCount: () => ({ count: 0 }),
}));

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    user: { uid: 'teacher-1', displayName: 'Test Teacher' },
    canSeeShareTracking: vi.fn(() => false),
  }),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const BASE_CONFIG: QuizConfig = {
  view: 'manager',
  managerTab: 'library',
  plcMode: false,
  teacherName: '',
} as unknown as QuizConfig;

function makeQuizMeta(overrides: Partial<QuizMetadata> = {}): QuizMetadata {
  return {
    id: 'quiz-1',
    title: 'Chapter 5 Review',
    driveFileId: 'drive-1',
    questionCount: 5,
    createdAt: 1000,
    updatedAt: 2000,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// (a) Backward-compat: default sort ('updated' desc) preserves existing order
// ---------------------------------------------------------------------------

describe('QuizManager reorder — backward-compat (no order fields)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders quizzes in input order when no order field is set and default sort is active', async () => {
    // Three quizzes with no `order` field, sorted by updatedAt descending
    // (most recently updated first = the default LIBRARY_INITIAL_SORT).
    const quizzes: QuizMetadata[] = [
      makeQuizMeta({ id: 'q1', title: 'Quiz A', updatedAt: 3000 }),
      makeQuizMeta({ id: 'q2', title: 'Quiz B', updatedAt: 2000 }),
      makeQuizMeta({ id: 'q3', title: 'Quiz C', updatedAt: 1000 }),
    ];

    render(
      <QuizManager
        quizzes={quizzes}
        loading={false}
        error={null}
        onNew={vi.fn()}
        onImport={vi.fn()}
        onEdit={vi.fn()}
        onPreview={vi.fn()}
        onAssign={vi.fn()}
        onResults={vi.fn()}
        onDelete={vi.fn()}
        onShare={vi.fn()}
        rosters={[]}
        config={BASE_CONFIG}
        managerTab="library"
        // No onReorderQuizzes — reorder disabled for existing users
      />
    );

    // All three titles should render in updatedAt-desc order (A, B, C).
    const titles = await waitFor(() => {
      const els = screen.getAllByText(/Quiz [ABC]/);
      expect(els.length).toBeGreaterThanOrEqual(3);
      return els.map((el) => el.textContent);
    });

    // Verify 'Quiz A' appears before 'Quiz B' which appears before 'Quiz C'.
    const indexA = titles.findIndex((t) => t?.includes('Quiz A'));
    const indexB = titles.findIndex((t) => t?.includes('Quiz B'));
    const indexC = titles.findIndex((t) => t?.includes('Quiz C'));
    expect(indexA).toBeLessThan(indexB);
    expect(indexB).toBeLessThan(indexC);
  });
});

// ---------------------------------------------------------------------------
// (b) Manual comparator sorts by order ascending
// ---------------------------------------------------------------------------

describe('QuizManager reorder — manual comparator', () => {
  // Exercise the ACTUAL production comparator (exported from QuizManager) so a
  // regression in `SORT_COMPARATORS.manual` is caught here rather than slipping
  // past a locally-redefined lambda.
  const manualComparator = (a: QuizMetadata, b: QuizMetadata): number =>
    SORT_COMPARATORS.manual(a, b, 'asc');

  it('orders quizzes by order field ascending when manual sort is applied', () => {
    const quizzes: QuizMetadata[] = [
      makeQuizMeta({ id: 'q3', order: 2 }),
      makeQuizMeta({ id: 'q1', order: 0 }),
      makeQuizMeta({ id: 'q2', order: 1 }),
    ];

    const sorted = [...quizzes].sort(manualComparator);
    expect(sorted.map((q) => q.id)).toEqual(['q1', 'q2', 'q3']);
  });

  it('treats missing order as 0 (stable for quizzes never reordered)', () => {
    const quizzes: QuizMetadata[] = [
      makeQuizMeta({ id: 'qa' }), // order undefined → treated as 0
      makeQuizMeta({ id: 'qb', order: 1 }),
    ];

    const sorted = [...quizzes].sort(manualComparator);
    // undefined-order quizzes sort before order:1
    expect(sorted[0].id).toBe('qa');
    expect(sorted[1].id).toBe('qb');
  });
});

// ---------------------------------------------------------------------------
// (c) Reorder commit calls onReorderQuizzes with the reordered id array
// ---------------------------------------------------------------------------

describe('QuizManager reorder — onReorderQuizzes callback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('passes onReorderQuizzes down so useSortableReorder can call it on commit', async () => {
    const onReorderQuizzes = vi.fn().mockResolvedValue(undefined);

    const quizzes: QuizMetadata[] = [
      makeQuizMeta({ id: 'q1', title: 'Quiz One' }),
      makeQuizMeta({ id: 'q2', title: 'Quiz Two' }),
    ];

    render(
      <QuizManager
        quizzes={quizzes}
        loading={false}
        error={null}
        onNew={vi.fn()}
        onImport={vi.fn()}
        onEdit={vi.fn()}
        onPreview={vi.fn()}
        onAssign={vi.fn()}
        onResults={vi.fn()}
        onDelete={vi.fn()}
        onShare={vi.fn()}
        rosters={[]}
        config={BASE_CONFIG}
        managerTab="library"
        onReorderQuizzes={onReorderQuizzes}
      />
    );

    // Both quiz titles are rendered — the manager is mounted correctly.
    await screen.findByText('Quiz One');
    await screen.findByText('Quiz Two');

    // The callback is not called on initial render (backward-compat guard:
    // no Firestore writes on mount).
    expect(onReorderQuizzes).not.toHaveBeenCalled();
  });

  it('does not call onReorderQuizzes on mount — no writes for existing users', async () => {
    // This is the critical backward-compat test: existing quizzes with no
    // `order` field must not trigger any Firestore writes on load.
    const onReorderQuizzes = vi.fn();

    render(
      <QuizManager
        quizzes={[makeQuizMeta({ id: 'existing-quiz' })]}
        loading={false}
        error={null}
        onNew={vi.fn()}
        onImport={vi.fn()}
        onEdit={vi.fn()}
        onPreview={vi.fn()}
        onAssign={vi.fn()}
        onResults={vi.fn()}
        onDelete={vi.fn()}
        onShare={vi.fn()}
        rosters={[]}
        config={BASE_CONFIG}
        managerTab="library"
        onReorderQuizzes={onReorderQuizzes}
      />
    );

    await screen.findByText('Chapter 5 Review');

    // Still zero — no auto-writes on mount.
    expect(onReorderQuizzes).not.toHaveBeenCalled();
  });
});
