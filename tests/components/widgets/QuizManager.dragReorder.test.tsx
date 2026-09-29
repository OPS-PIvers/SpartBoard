// A card-to-card drop in the Quiz library must persist and show the new order,
// including from the default "Last updated" sort.

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';

import { QuizManager } from '@/components/widgets/QuizWidget/components/QuizManager';
import type { QuizConfig, QuizMetadata } from '@/types';

const dnd = vi.hoisted(() => ({
  onReorder: undefined as ((ids: string[]) => Promise<void> | void) | undefined,
}));

vi.mock('@/components/common/library/LibraryDndContext', () => ({
  LibraryDndContext: ({
    onReorder,
    children,
  }: {
    onReorder?: (ids: string[]) => Promise<void> | void;
    children: React.ReactNode;
  }) => {
    dnd.onReorder = onReorder;
    return <>{children}</>;
  },
}));

// ---------------------------------------------------------------------------
// Heavy hook stubs (same as QuizManager.assign.test.tsx)
// ---------------------------------------------------------------------------

vi.mock('@/hooks/usePlcs', () => ({
  usePlcs: () => ({ plcs: [] }),
}));

vi.mock('@/hooks/usePlcQuizzes', () => ({
  usePlcQuizzes: () => ({ quizzes: [], loading: false, error: null }),
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

vi.mock('@/hooks/useRubrics', () => ({
  useRubrics: () => ({ rubrics: [] }),
}));

vi.mock('@/hooks/useSessionViewCount', () => ({
  useSessionViewCount: () => ({ count: 0 }),
}));

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    user: { uid: 'teacher-1', displayName: 'Test Teacher' },
    canSeeShareTracking: vi.fn(() => false),
    canAccessQuizMediaResponse: vi.fn(() => false),
    canAccessFeature: vi.fn(() => false),
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

function renderManager(
  quizzes: QuizMetadata[],
  onReorderQuizzes: (ids: string[]) => Promise<void>
) {
  return render(
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
      userId="teacher-1"
      onReorderQuizzes={onReorderQuizzes}
    />
  );
}

const titleOrder = (titles: string[]): string[] => {
  const text = document.body.textContent ?? '';
  return [...titles].sort((a, b) => text.indexOf(a) - text.indexOf(b));
};

describe('QuizManager drag reorder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dnd.onReorder = undefined;
  });

  it('persists and shows a drop made from the default Last updated sort', async () => {
    const onReorderQuizzes = vi.fn().mockResolvedValue(undefined);
    const quizzes = [
      makeQuizMeta({ id: 'q1', title: 'Quiz One', updatedAt: 3000, order: 0 }),
      makeQuizMeta({ id: 'q2', title: 'Quiz Two', updatedAt: 2000, order: 1 }),
      makeQuizMeta({
        id: 'q3',
        title: 'Quiz Three',
        updatedAt: 1000,
        order: 2,
      }),
    ];
    const { rerender } = renderManager(quizzes, onReorderQuizzes);
    await screen.findByText('Quiz One');
    const titles = ['Quiz One', 'Quiz Two', 'Quiz Three'];
    expect(titleOrder(titles)).toEqual(titles);

    expect(dnd.onReorder).toBeDefined();
    await act(async () => {
      await dnd.onReorder?.(['q3', 'q1', 'q2']);
    });

    expect(onReorderQuizzes).toHaveBeenCalledWith(['q3', 'q1', 'q2']);
    expect(titleOrder(titles)).toEqual(['Quiz Three', 'Quiz One', 'Quiz Two']);

    // The Firestore snapshot then delivers the saved order fields.
    rerender(
      <QuizManager
        quizzes={[
          { ...quizzes[0], order: 1 },
          { ...quizzes[1], order: 2 },
          { ...quizzes[2], order: 0 },
        ]}
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
        userId="teacher-1"
        onReorderQuizzes={onReorderQuizzes}
      />
    );
    expect(titleOrder(titles)).toEqual(['Quiz Three', 'Quiz One', 'Quiz Two']);
  });

  it('reverts the order when saving fails', async () => {
    const onReorderQuizzes = vi.fn().mockRejectedValue(new Error('nope'));
    const quizzes = [
      makeQuizMeta({ id: 'q1', title: 'Quiz One', updatedAt: 3000 }),
      makeQuizMeta({ id: 'q2', title: 'Quiz Two', updatedAt: 2000 }),
    ];
    renderManager(quizzes, onReorderQuizzes);
    await screen.findByText('Quiz One');

    await act(async () => {
      await dnd.onReorder?.(['q2', 'q1']);
    });

    expect(onReorderQuizzes).toHaveBeenCalledWith(['q2', 'q1']);
    expect(titleOrder(['Quiz One', 'Quiz Two'])).toEqual([
      'Quiz One',
      'Quiz Two',
    ]);
  });
});
