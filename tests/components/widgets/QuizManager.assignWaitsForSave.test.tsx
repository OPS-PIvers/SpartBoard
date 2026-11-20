// QuizManager assign submit with the `quiz-assign-waits-for-save` preview flag off and on.
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
  act,
} from '@testing-library/react';
import '@/i18n';

import { QuizManager } from '@/components/widgets/QuizWidget/components/QuizManager';
import type { ClassRoster, QuizConfig, QuizMetadata } from '@/types';

let waitsForSave = false;

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

vi.mock('@/hooks/useSessionViewCount', () => ({
  useSessionViewCount: () => ({ count: 0 }),
}));

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    user: { uid: 'teacher-1', displayName: 'Test Teacher' },
    canSeeShareTracking: () => false,
    canAccessQuizMediaResponse: () => false,
    canAccessFeature: (id: string) =>
      id === 'quiz-assign-waits-for-save' && waitsForSave,
  }),
}));

vi.mock('@/hooks/useLastQuizAssignSettings', () => ({
  useLastQuizAssignSettings: () => ({
    lastUsed: null,
    loaded: true,
    save: vi.fn(),
  }),
}));

const ROSTERS: ClassRoster[] = [
  {
    id: 'r1',
    name: 'Period 1',
    students: [],
    source: 'manual',
  } as unknown as ClassRoster,
  {
    id: 'r2',
    name: 'Period 2',
    students: [],
    source: 'manual',
  } as unknown as ClassRoster,
];

const QUIZ: QuizMetadata = {
  id: 'quiz-1',
  title: 'Chapter 5 Review',
  driveFileId: 'drive-1',
  questionCount: 5,
  createdAt: 1000,
  updatedAt: 2000,
};

const deferred = () => {
  let resolve!: () => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const openStepper = async (
  onAssign: React.ComponentProps<typeof QuizManager>['onAssign']
) => {
  render(
    <QuizManager
      quizzes={[QUIZ]}
      loading={false}
      error={null}
      onNew={vi.fn()}
      onImport={vi.fn()}
      onEdit={vi.fn()}
      onPreview={vi.fn()}
      onAssign={onAssign}
      onResults={vi.fn()}
      onDelete={vi.fn()}
      onShare={vi.fn()}
      rosters={ROSTERS}
      config={{ view: 'manager', managerTab: 'library' } as QuizConfig}
      managerTab="library"
    />
  );
  fireEvent.click(await screen.findByRole('button', { name: /^assign$/i }));
  return screen.findByRole('dialog', { name: /chapter 5 review/i });
};

const assignButton = (dialog: HTMLElement) =>
  within(dialog).getByRole('button', { name: /^assign$/i });

describe('QuizManager assign waits for the save', () => {
  afterEach(() => {
    waitsForSave = false;
  });

  it('flag off: closes at once, before the save settles', async () => {
    const save = deferred();
    const onAssign = vi.fn(() => save.promise);
    const dialog = await openStepper(onAssign);
    fireEvent.click(assignButton(dialog));
    await waitFor(() => expect(onAssign).toHaveBeenCalledOnce());
    expect(
      screen.queryByRole('dialog', { name: /chapter 5 review/i })
    ).not.toBeInTheDocument();
    save.resolve();
    await act(() => save.promise);
  });

  it('flag on: spins and blocks a second submit until the save succeeds, then closes', async () => {
    waitsForSave = true;
    const save = deferred();
    const onAssign = vi.fn(() => save.promise);
    const dialog = await openStepper(onAssign);
    fireEvent.click(assignButton(dialog));
    await waitFor(() => expect(onAssign).toHaveBeenCalledOnce());

    expect(dialog).toBeInTheDocument();
    await waitFor(() => expect(assignButton(dialog)).toBeDisabled());
    expect(
      within(dialog).getByRole('button', { name: /^cancel$/i })
    ).toBeDisabled();
    fireEvent.click(assignButton(dialog));
    expect(onAssign).toHaveBeenCalledOnce();

    save.resolve();
    await act(() => save.promise);
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: /chapter 5 review/i })
      ).not.toBeInTheDocument()
    );
  });

  it('flag on: a failed save stays open with the error and the choices kept', async () => {
    waitsForSave = true;
    const onAssign = vi
      .fn<React.ComponentProps<typeof QuizManager>['onAssign']>()
      .mockRejectedValueOnce(new Error('Could not reach the server.'))
      .mockResolvedValueOnce(undefined);
    const dialog = await openStepper(onAssign);
    fireEvent.click(
      within(dialog).getByRole('checkbox', { name: /period 2/i })
    );
    fireEvent.click(assignButton(dialog));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Could not reach the server.'
    );
    expect(
      within(dialog).getByRole('checkbox', { name: /period 2/i })
    ).toBeChecked();
    expect(assignButton(dialog)).toBeEnabled();

    fireEvent.click(assignButton(dialog));
    await waitFor(() => expect(onAssign).toHaveBeenCalledTimes(2));
    expect(onAssign.mock.calls[1][3]).toEqual(['r2']);
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: /chapter 5 review/i })
      ).not.toBeInTheDocument()
    );
  });
});
