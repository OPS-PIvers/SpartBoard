/**
 * Integration test for PlcAssignmentsLibrarySubTab — covers the
 * post-import class-period picker handoff that prevents teachers from
 * forgetting to target their imported quiz at any classes.
 *
 * The point of this test is the lifecycle around `pendingSetup`:
 *
 *   1. After `createAssignment` resolves, the picker modal renders
 *      OPTIMISTICALLY (from the title cached at import-time) rather
 *      than waiting for the assignments listener to surface the new
 *      doc — snapshot lag would otherwise drop the prompt silently.
 *   2. Concurrent imports are guarded: a second click while another
 *      import is in flight is a no-op.
 *   3. Save invokes `setAssignmentRosters` against the new assignment
 *      id with the targets the modal derived from the roster picker.
 *   4. "Edit all settings…" hands off to the QuizWidget via
 *      `setPendingAssignmentEdit` + closes the PLC dashboard.
 *
 * Heavy collaborators (Drive, Firestore, sync-group Cloud Functions)
 * are mocked at the module boundary — this exercises the component's
 * own orchestration, not the import plumbing.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { PlcAssignmentsLibrarySubTab } from '@/components/plc/tabs/PlcAssignmentsLibrarySubTab';
import type { ClassRoster, Plc } from '@/types';

// Stub AssignClassPicker the same way the modal's own test does, so we
// can drive the roster selection without pulling in ClassLink chrome.
vi.mock('@/components/common/AssignClassPicker', () => ({
  AssignClassPicker: ({
    rosters,
    value,
    onChange,
  }: {
    rosters: ClassRoster[];
    value: { rosterIds: string[] };
    onChange: (next: { rosterIds: string[] }) => void;
  }) => (
    <div data-testid="picker">
      {rosters.map((r) => (
        <label key={r.id}>
          <input
            type="checkbox"
            data-testid={`roster-${r.id}`}
            checked={value.rosterIds.includes(r.id)}
            onChange={(e) =>
              onChange({
                rosterIds: e.target.checked
                  ? [...value.rosterIds, r.id]
                  : value.rosterIds.filter((id) => id !== r.id),
              })
            }
          />
          {r.name}
        </label>
      ))}
    </div>
  ),
}));

// The dialog confirm helper is unrelated to import — point it at a no-op.
vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({ showConfirm: vi.fn().mockResolvedValue(false) }),
}));

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ user: { uid: 'teacher-1' } }),
}));

const addToast = vi.fn();
const setPendingAssignmentEdit = vi.fn();
vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({
    addToast,
    rosters: [
      { id: 'r1', name: 'Math 1', students: [] } as unknown as ClassRoster,
      { id: 'r2', name: 'Math 2', students: [] } as unknown as ClassRoster,
    ],
    setPendingAssignmentEdit,
  }),
}));

const deleteAssignmentTemplate = vi.fn();
vi.mock('@/hooks/usePlcAssignments', () => ({
  usePlcAssignments: () => ({
    templates: [
      {
        id: 'tpl-1',
        syncGroupId: 'sync-1',
        quizTitle: 'Photosynthesis Quiz',
        sharedByName: 'Mrs. Smith',
        sharedByEmail: 'smith@example.com',
        sessionMode: 'live' as const,
        sessionOptions: {},
        attemptLimit: null,
        updatedAt: Date.now(),
      },
    ],
    loading: false,
    deleteAssignmentTemplate,
  }),
}));

const saveQuiz = vi.fn().mockResolvedValue({
  id: 'quiz-1',
  driveFileId: 'drive-1',
  title: 'Photosynthesis Quiz',
});
const deleteQuiz = vi.fn();
const attachSyncLinkage = vi.fn().mockResolvedValue(undefined);
vi.mock('@/hooks/useQuiz', () => ({
  useQuiz: () => ({
    saveQuiz,
    deleteQuiz,
    attachSyncLinkage,
    isDriveConnected: true,
  }),
}));

let createAssignmentResolver:
  | ((value: { id: string; code: string }) => void)
  | null = null;
const createAssignment = vi.fn(
  () =>
    new Promise<{ id: string; code: string }>((resolve) => {
      createAssignmentResolver = resolve;
    })
);
const setAssignmentRosters = vi.fn().mockResolvedValue(undefined);
vi.mock('@/hooks/useQuizAssignments', () => ({
  useQuizAssignments: () => ({
    // `assignments` returns empty so we exercise the optimistic-render
    // fallback (live snapshot hasn't surfaced the new doc yet).
    assignments: [],
    createAssignment,
    setAssignmentRosters,
  }),
}));

vi.mock('@/hooks/useSyncedQuizGroups', () => ({
  pullSyncedQuizContent: vi.fn().mockResolvedValue({
    title: 'Photosynthesis Quiz',
    questions: [],
    version: 1,
  }),
  callJoinPlcAssignmentSyncGroup: vi
    .fn()
    .mockResolvedValue({ groupId: 'sync-1', version: 1 }),
  callLeaveSyncedQuizGroup: vi.fn().mockResolvedValue(undefined),
}));

const plc = {
  id: 'plc-1',
  name: 'Test PLC',
  leadUid: 'teacher-1',
  memberUids: ['teacher-1'],
} as unknown as Plc;

beforeAll(() => {
  void i18n.use(initReactI18next).init({
    lng: 'en',
    fallbackLng: 'en',
    resources: { en: { translation: {} } },
    interpolation: { escapeValue: false },
  });
});

const renderSubject = (onCloseDashboard = vi.fn()) =>
  render(
    <I18nextProvider i18n={i18n}>
      <PlcAssignmentsLibrarySubTab
        plc={plc}
        onCloseDashboard={onCloseDashboard}
      />
    </I18nextProvider>
  );

describe('PlcAssignmentsLibrarySubTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createAssignmentResolver = null;
  });

  it('renders the class-period picker optimistically after import (no listener snapshot)', async () => {
    renderSubject();

    // Open the sync/copy modal.
    fireEvent.click(
      screen.getAllByRole('button', { name: /Add to my board/i })[0]
    );
    // Pick "copy" to advance through `handleImport`. The PlcAssignmentImportModal
    // surfaces both options as buttons — find the copy one.
    fireEvent.click(
      await screen.findByRole('button', { name: /Make a copy/i })
    );

    // Drain the create promise so the picker can mount.
    await waitFor(() => expect(createAssignmentResolver).not.toBeNull());
    createAssignmentResolver?.({ id: 'asg-1', code: 'XYZ' });

    // Picker should render even though useQuizAssignments returns no
    // assignments — title comes from the cached stub.
    expect(await screen.findByText('Photosynthesis Quiz')).toBeInTheDocument();
    expect(screen.getByText(/Set up imported assignment/i)).toBeInTheDocument();
  });

  it('Save invokes setAssignmentRosters with the new assignment id', async () => {
    renderSubject();
    fireEvent.click(
      screen.getAllByRole('button', { name: /Add to my board/i })[0]
    );
    fireEvent.click(
      await screen.findByRole('button', { name: /Make a copy/i })
    );
    await waitFor(() => expect(createAssignmentResolver).not.toBeNull());
    createAssignmentResolver?.({ id: 'asg-1', code: 'XYZ' });

    await screen.findByTestId('roster-r1');
    fireEvent.click(screen.getByTestId('roster-r1'));
    fireEvent.click(screen.getByRole('button', { name: /^Save$/ }));

    await waitFor(() =>
      expect(setAssignmentRosters).toHaveBeenCalledWith(
        'asg-1',
        expect.objectContaining({
          rosterIds: expect.arrayContaining(['r1']),
        })
      )
    );
  });

  it('"Edit all settings…" closes the PLC dashboard and hands off via setPendingAssignmentEdit', async () => {
    const onCloseDashboard = vi.fn();
    renderSubject(onCloseDashboard);

    fireEvent.click(
      screen.getAllByRole('button', { name: /Add to my board/i })[0]
    );
    fireEvent.click(
      await screen.findByRole('button', { name: /Make a copy/i })
    );
    await waitFor(() => expect(createAssignmentResolver).not.toBeNull());
    createAssignmentResolver?.({ id: 'asg-1', code: 'XYZ' });

    fireEvent.click(
      await screen.findByRole('button', { name: /Edit all settings/i })
    );

    expect(setPendingAssignmentEdit).toHaveBeenCalledWith('asg-1');
    expect(onCloseDashboard).toHaveBeenCalledTimes(1);
  });

  it('blocks concurrent imports while one is in flight', async () => {
    renderSubject();

    // First import — open + pick copy. createAssignment is left unresolved
    // so the import stays in flight.
    fireEvent.click(
      screen.getAllByRole('button', { name: /Add to my board/i })[0]
    );
    fireEvent.click(
      await screen.findByRole('button', { name: /Make a copy/i })
    );
    await waitFor(() => expect(createAssignment).toHaveBeenCalledTimes(1));

    // The add button should now be disabled — any further clicks are
    // a no-op. We verify the button is disabled (the visible UI guard)
    // AND that createAssignment isn't called a second time.
    const addButton = screen.getAllByRole('button', {
      name: /Add to my board/i,
    })[0];
    expect(addButton).toBeDisabled();
    fireEvent.click(addButton);
    expect(createAssignment).toHaveBeenCalledTimes(1);
  });
});
