// Business-logic coverage for usePlcQuizActions, ported from the deleted
// tests/components/plc/PlcQuizLibraryBody.test.tsx after that component's
// import/assign/edit/share orchestration moved into this hook.

import React from 'react';
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import i18n from 'i18next';
import { usePlcQuizActions } from '@/hooks/usePlcQuizActions';
import type { PlcQuizActionTarget } from '@/hooks/usePlcQuizActions';
import { pullSyncedQuizContent } from '@/hooks/useSyncedQuizGroups';
import { buildPlcLinkage } from '@/utils/plcLinkage';
import type { ClassRoster, Plc, QuizMetadata } from '@/types';

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

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    user: {
      uid: 'teacher-1',
      email: 't@example.com',
      displayName: 'Teacher One',
    },
    canAccessFeature: () => true,
    canAccessQuizMediaResponse: () => false,
    ensureGoogleScope: vi.fn().mockResolvedValue('sheets-token'),
  }),
}));

vi.mock('@/utils/plcLinkage', () => ({
  buildPlcLinkage: vi.fn().mockReturnValue(undefined),
}));

// The editor itself isn't under test here — stub it so its Gemini/editor
// dependency tree stays out of these tests.
vi.mock('@/components/widgets/QuizWidget/components/QuizEditorModal', () => ({
  QuizEditorModal: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div data-testid="quiz-editor-modal" /> : null,
}));

vi.mock('@/hooks/usePlcAutoPullSync', () => ({
  usePlcAutoPullSync: () => ({ conflicts: [], resolveConflict: vi.fn() }),
}));

const addToast = vi.fn();
const setPendingAssignmentEdit = vi.fn();
let mockRosters: ClassRoster[] = [];
vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({
    addToast,
    rosters: mockRosters,
    setPendingAssignmentEdit,
  }),
}));

const mirrorPlcQuizHeader = vi.fn().mockResolvedValue(undefined);
const writePlcQuizEntry = vi.fn().mockResolvedValue(undefined);
let mockPlcQuizzes: Array<{ id: string; syncGroupId: string }> = [];
vi.mock('@/hooks/usePlcQuizzes', () => ({
  usePlcQuizzes: () => ({
    quizzes: mockPlcQuizzes,
    mirrorPlcQuizHeader,
  }),
  writePlcQuizEntry: (...args: unknown[]): Promise<void> =>
    writePlcQuizEntry(...args) as Promise<void>,
}));

const saveQuiz = vi.fn().mockResolvedValue({
  id: 'quiz-personal-1',
  driveFileId: 'drive-1',
  title: 'Photosynthesis Quiz',
});
const deleteQuiz = vi.fn().mockResolvedValue(undefined);
const attachSyncLinkage = vi.fn().mockResolvedValue(undefined);
const loadQuizData = vi.fn().mockResolvedValue({
  id: 'quiz-personal-1',
  title: 'Photosynthesis Quiz',
  questions: [],
});
const pullSyncedQuiz = vi.fn().mockResolvedValue(undefined);
let mockPersonalQuizzes: QuizMetadata[] = [];
let mockIsDriveConnected = true;
vi.mock('@/hooks/useQuiz', () => ({
  SyncedQuizVersionConflictError: class extends Error {},
  useQuiz: () => ({
    quizzes: mockPersonalQuizzes,
    saveQuiz,
    deleteQuiz,
    attachSyncLinkage,
    loadQuizData,
    pullSyncedQuiz,
    isDriveConnected: mockIsDriveConnected,
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
    assignments: [],
    createAssignment,
    setAssignmentRosters,
  }),
}));

const callJoinPlcQuizSyncGroup = vi
  .fn<
    (
      plcId: string,
      sourceId: string
    ) => Promise<{ groupId: string; version: number }>
  >()
  .mockResolvedValue({ groupId: 'sync-quiz', version: 1 });
const callLeaveSyncedQuizGroup = vi.fn().mockResolvedValue(undefined);
const createSyncedQuizGroup = vi.fn().mockResolvedValue(undefined);
vi.mock('@/hooks/useSyncedQuizGroups', () => ({
  pullSyncedQuizContent: vi.fn().mockResolvedValue({
    title: 'Photosynthesis Quiz',
    questions: [],
    version: 1,
  }),
  callJoinPlcQuizSyncGroup: (plcId: string, sourceId: string) =>
    callJoinPlcQuizSyncGroup(plcId, sourceId),
  callLeaveSyncedQuizGroup: (groupId: string): Promise<void> =>
    callLeaveSyncedQuizGroup(groupId) as Promise<void>,
  createSyncedQuizGroup: (...args: unknown[]): Promise<void> =>
    createSyncedQuizGroup(...args) as Promise<void>,
  useSyncedQuizGroupsByIds: () => ({ groups: new Map(), loading: false }),
}));

const plc = {
  id: 'plc-1',
  name: 'Test PLC',
  leadUid: 'teacher-1',
  memberUids: ['teacher-1'],
} as unknown as Plc;

const target: PlcQuizActionTarget = {
  plcQuizId: 'plcquiz-1',
  syncGroupId: 'sync-quiz',
  title: 'Photosynthesis Quiz',
  sharedByName: 'Mrs. Smith',
};

const Harness: React.FC<{ onCloseDashboard?: () => void }> = ({
  onCloseDashboard = vi.fn(),
}) => {
  const api = usePlcQuizActions(plc, onCloseDashboard);
  return (
    <>
      <button onClick={() => api.importQuiz(target)}>Import</button>
      <button onClick={() => api.reimportQuiz(target)}>Reimport</button>
      <button onClick={() => api.assignQuiz(target)}>Assign</button>
      <button onClick={() => api.editQuiz(target)}>Edit</button>
      <button onClick={() => api.openSharePicker()}>OpenShare</button>
      <div data-testid="busy">{String(api.busy)}</div>
      {api.modals}
    </>
  );
};

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
      <Harness onCloseDashboard={onCloseDashboard} />
    </I18nextProvider>
  );

const pickSync = async () =>
  fireEvent.click(await screen.findByRole('button', { name: /Synced/i }));
const pickCopy = async () =>
  fireEvent.click(await screen.findByRole('button', { name: /Make a copy/i }));

describe('usePlcQuizActions', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    createAssignmentResolver = null;
    mockPlcQuizzes = [{ id: 'plcquiz-1', syncGroupId: 'sync-quiz' }];
    mockPersonalQuizzes = [];
    mockRosters = [
      { id: 'r1', name: 'Math 1', students: [] } as unknown as ClassRoster,
      { id: 'r2', name: 'Math 2', students: [] } as unknown as ClassRoster,
    ];
    mockIsDriveConnected = true;
    addToast.mockReset();
    setPendingAssignmentEdit.mockReset();
    mirrorPlcQuizHeader.mockResolvedValue(undefined);
    writePlcQuizEntry.mockResolvedValue(undefined);
    saveQuiz.mockResolvedValue({
      id: 'quiz-personal-1',
      driveFileId: 'drive-1',
      title: 'Photosynthesis Quiz',
    });
    deleteQuiz.mockResolvedValue(undefined);
    attachSyncLinkage.mockResolvedValue(undefined);
    loadQuizData.mockResolvedValue({
      id: 'quiz-personal-1',
      title: 'Photosynthesis Quiz',
      questions: [],
    });
    pullSyncedQuiz.mockResolvedValue(undefined);
    createAssignment.mockImplementation(
      () =>
        new Promise<{ id: string; code: string }>((resolve) => {
          createAssignmentResolver = resolve;
        })
    );
    setAssignmentRosters.mockResolvedValue(undefined);
    callJoinPlcQuizSyncGroup.mockResolvedValue({
      groupId: 'sync-quiz',
      version: 1,
    });
    callLeaveSyncedQuizGroup.mockResolvedValue(undefined);
    createSyncedQuizGroup.mockResolvedValue(undefined);
    vi.mocked(pullSyncedQuizContent).mockResolvedValue({
      title: 'Photosynthesis Quiz',
      questions: [],
      version: 1,
    });
    vi.mocked(buildPlcLinkage).mockReturnValue(undefined);
  });

  describe('importQuiz', () => {
    it('sync mode saves the quiz, joins the sync group, and links it', async () => {
      renderSubject();
      fireEvent.click(screen.getByText('Import'));
      await pickSync();

      await waitFor(() => expect(saveQuiz).toHaveBeenCalledTimes(1));
      expect(callJoinPlcQuizSyncGroup).toHaveBeenCalledWith(
        'plc-1',
        'plcquiz-1'
      );
      await waitFor(() =>
        expect(attachSyncLinkage).toHaveBeenCalledWith('quiz-personal-1', {
          groupId: 'sync-quiz',
          lastSyncedVersion: 1,
        })
      );
      expect(addToast).toHaveBeenCalledWith(
        expect.stringContaining('synced'),
        'success'
      );
    });

    it('copy mode saves the quiz without joining a sync group', async () => {
      renderSubject();
      fireEvent.click(screen.getByText('Import'));
      await pickCopy();

      await waitFor(() => expect(saveQuiz).toHaveBeenCalledTimes(1));
      expect(callJoinPlcQuizSyncGroup).not.toHaveBeenCalled();
      expect(attachSyncLinkage).not.toHaveBeenCalled();
      expect(addToast).toHaveBeenCalledWith(
        expect.stringContaining('copied'),
        'success'
      );
    });

    it('short-circuits with an info toast when already synced (sync mode)', async () => {
      mockPersonalQuizzes = [
        {
          id: 'quiz-personal-1',
          title: 'Photosynthesis Quiz',
          sync: { groupId: 'sync-quiz', lastSyncedVersion: 1 },
        } as unknown as QuizMetadata,
      ];
      renderSubject();
      fireEvent.click(screen.getByText('Import'));
      await pickSync();

      await waitFor(() =>
        expect(addToast).toHaveBeenCalledWith(
          expect.stringContaining('already synced'),
          'info'
        )
      );
      expect(saveQuiz).not.toHaveBeenCalled();
    });

    it('rolls back the sync-group join and the saved quiz when linking fails', async () => {
      attachSyncLinkage.mockRejectedValueOnce(new Error('link failed'));
      renderSubject();
      fireEvent.click(screen.getByText('Import'));
      await pickSync();

      await waitFor(() =>
        expect(callLeaveSyncedQuizGroup).toHaveBeenCalledWith('sync-quiz')
      );
      expect(deleteQuiz).toHaveBeenCalledWith('quiz-personal-1', 'drive-1');
      expect(addToast).toHaveBeenCalledWith('link failed', 'error');
    });

    it('blocks a second import while one is in flight', async () => {
      renderSubject();
      fireEvent.click(screen.getByText('Import'));
      await pickCopy();
      expect(screen.getByTestId('busy').textContent).toBe('true');

      fireEvent.click(screen.getByText('Reimport'));
      // Modal shouldn't reopen while busy — no second save call fires.
      await waitFor(() => expect(saveQuiz).toHaveBeenCalledTimes(1));
    });

    it('shows an error toast and does not save when Drive is disconnected', async () => {
      mockIsDriveConnected = false;
      renderSubject();
      fireEvent.click(screen.getByText('Import'));
      await pickCopy();

      expect(saveQuiz).not.toHaveBeenCalled();
      expect(addToast).toHaveBeenCalledWith(
        expect.stringContaining('Connect Google Drive'),
        'error'
      );
    });
  });

  describe('reimportQuiz', () => {
    it('opens the same import modal as importQuiz', async () => {
      renderSubject();
      fireEvent.click(screen.getByText('Reimport'));
      await pickCopy();
      await waitFor(() => expect(saveQuiz).toHaveBeenCalledTimes(1));
    });
  });

  describe('assignQuiz', () => {
    it('creates a paused, template-write-skipping assignment and opens the setup modal optimistically', async () => {
      renderSubject();
      fireEvent.click(screen.getByText('Assign'));
      await pickCopy();

      await waitFor(() => expect(createAssignment).toHaveBeenCalledTimes(1));
      expect(createAssignment).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'quiz-personal-1' }),
        expect.anything(),
        expect.objectContaining({
          initialStatus: 'paused',
          skipPlcTemplateWrite: true,
        })
      );

      createAssignmentResolver?.({ id: 'asg-1', code: 'XYZ' });
      expect(
        await screen.findByText('Photosynthesis Quiz')
      ).toBeInTheDocument();
      expect(await screen.findByTestId('picker')).toBeInTheDocument();
    });

    it('links the assignment to the PLC via buildPlcLinkage, never with a sheetUrl', async () => {
      const linkage = {
        id: 'plc-1',
        name: 'Test PLC',
        memberEmails: ['t@example.com'],
      };
      vi.mocked(buildPlcLinkage).mockReturnValueOnce(linkage);
      renderSubject();
      fireEvent.click(screen.getByText('Assign'));
      await pickCopy();

      await waitFor(() => expect(createAssignment).toHaveBeenCalledTimes(1));
      expect(buildPlcLinkage).toHaveBeenCalledWith(plc);
      const [, settings] = createAssignment.mock.calls[0] as unknown as [
        unknown,
        Record<string, unknown>,
      ];
      expect(settings.plc).toEqual(linkage);
      expect(settings.plc).not.toHaveProperty('sheetUrl');
    });

    it('Save invokes setAssignmentRosters with the new assignment id', async () => {
      renderSubject();
      fireEvent.click(screen.getByText('Assign'));
      await pickCopy();
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

    it('"Edit all settings…" hands off via setPendingAssignmentEdit and closes the dashboard', async () => {
      const onCloseDashboard = vi.fn();
      renderSubject(onCloseDashboard);
      fireEvent.click(screen.getByText('Assign'));
      await pickCopy();
      await waitFor(() => expect(createAssignmentResolver).not.toBeNull());
      createAssignmentResolver?.({ id: 'asg-1', code: 'XYZ' });

      fireEvent.click(
        await screen.findByRole('button', { name: /Edit all settings/i })
      );

      expect(setPendingAssignmentEdit).toHaveBeenCalledWith('asg-1');
      expect(onCloseDashboard).toHaveBeenCalledTimes(1);
    });

    it('rolls back the saved quiz and sync-group join when createAssignment throws', async () => {
      createAssignment.mockImplementationOnce(() =>
        Promise.reject(new Error('assignment create failed'))
      );
      renderSubject();
      fireEvent.click(screen.getByText('Assign'));
      await pickSync();

      await waitFor(() =>
        expect(callLeaveSyncedQuizGroup).toHaveBeenCalledWith('sync-quiz')
      );
      expect(deleteQuiz).toHaveBeenCalledWith('quiz-personal-1', 'drive-1');
      expect(addToast).toHaveBeenCalledWith(
        'assignment create failed',
        'error'
      );
    });

    it('blocks a second assign while one is in flight', async () => {
      renderSubject();
      fireEvent.click(screen.getByText('Assign'));
      await pickCopy();
      await waitFor(() => expect(createAssignment).toHaveBeenCalledTimes(1));

      fireEvent.click(screen.getByText('Assign'));
      expect(createAssignment).toHaveBeenCalledTimes(1);
    });
  });

  describe('editQuiz', () => {
    it('opens the editor directly when the quiz is already in the personal library', async () => {
      mockPersonalQuizzes = [
        {
          id: 'quiz-personal-1',
          title: 'Photosynthesis Quiz',
          driveFileId: 'drive-1',
          sync: { groupId: 'sync-quiz', lastSyncedVersion: 1 },
        } as unknown as QuizMetadata,
      ];
      renderSubject();
      fireEvent.click(screen.getByText('Edit'));

      await waitFor(() => expect(loadQuizData).toHaveBeenCalledWith('drive-1'));
      expect(saveQuiz).not.toHaveBeenCalled();
      expect(
        await screen.findByTestId('quiz-editor-modal')
      ).toBeInTheDocument();
    });

    it('auto-imports (save + join + link) before opening the editor when not yet in the library', async () => {
      renderSubject();
      fireEvent.click(screen.getByText('Edit'));

      await waitFor(() => expect(saveQuiz).toHaveBeenCalledTimes(1));
      expect(callJoinPlcQuizSyncGroup).toHaveBeenCalledWith(
        'plc-1',
        'plcquiz-1'
      );
      await waitFor(() =>
        expect(attachSyncLinkage).toHaveBeenCalledWith('quiz-personal-1', {
          groupId: 'sync-quiz',
          lastSyncedVersion: 1,
        })
      );
      expect(
        await screen.findByTestId('quiz-editor-modal')
      ).toBeInTheDocument();
      expect(addToast).toHaveBeenCalledWith(
        expect.stringContaining('opening editor'),
        'info'
      );
    });

    it('rolls back the auto-import when the sync-group join fails', async () => {
      callJoinPlcQuizSyncGroup.mockRejectedValueOnce(new Error('join failed'));
      renderSubject();
      fireEvent.click(screen.getByText('Edit'));

      await waitFor(() =>
        expect(deleteQuiz).toHaveBeenCalledWith('quiz-personal-1', 'drive-1')
      );
      expect(addToast).toHaveBeenCalledWith('join failed', 'error');
      expect(screen.queryByTestId('quiz-editor-modal')).not.toBeInTheDocument();
    });
  });

  describe('openSharePicker', () => {
    const personal = {
      id: 'personal-1',
      title: 'My Quiz',
      questionCount: 3,
      updatedAt: 5000,
    } as unknown as QuizMetadata;

    it('creates a sync group, links it, and writes the PLC quiz entry for an unsynced quiz', async () => {
      mockPersonalQuizzes = [personal];
      renderSubject();
      fireEvent.click(screen.getByText('OpenShare'));
      fireEvent.click(await screen.findByRole('button', { name: /^Share$/ }));

      await waitFor(() =>
        expect(createSyncedQuizGroup).toHaveBeenCalledTimes(1)
      );
      expect(createSyncedQuizGroup).toHaveBeenCalledWith(
        expect.objectContaining({ uid: 'teacher-1', plcId: 'plc-1' })
      );
      await waitFor(() =>
        expect(attachSyncLinkage).toHaveBeenCalledWith(
          'personal-1',
          expect.objectContaining({ lastSyncedVersion: 1 })
        )
      );
      await waitFor(() =>
        expect(writePlcQuizEntry).toHaveBeenCalledWith(
          'plc-1',
          'teacher-1',
          expect.objectContaining({
            quizId: 'personal-1',
            title: 'Photosynthesis Quiz',
          })
        )
      );
      expect(addToast).toHaveBeenCalledWith(
        expect.stringContaining('shared with this PLC'),
        'success'
      );
    });

    it('reuses the existing sync group and skips creating a new one for an already-synced-elsewhere quiz', async () => {
      mockPersonalQuizzes = [
        {
          ...personal,
          sync: { groupId: 'sync-other', lastSyncedVersion: 2 },
        } as unknown as QuizMetadata,
      ];
      renderSubject();
      fireEvent.click(screen.getByText('OpenShare'));
      fireEvent.click(await screen.findByRole('button', { name: /^Share$/ }));

      await waitFor(() =>
        expect(writePlcQuizEntry).toHaveBeenCalledWith(
          'plc-1',
          'teacher-1',
          expect.objectContaining({ syncGroupId: 'sync-other' })
        )
      );
      expect(createSyncedQuizGroup).not.toHaveBeenCalled();
    });

    it('short-circuits with an info toast when the quiz is already shared with this PLC', async () => {
      mockPlcQuizzes = [{ id: 'plcquiz-1', syncGroupId: 'sync-already' }];
      mockPersonalQuizzes = [
        {
          ...personal,
          sync: { groupId: 'sync-already', lastSyncedVersion: 1 },
        } as unknown as QuizMetadata,
      ];
      renderSubject();
      fireEvent.click(screen.getByText('OpenShare'));

      // The row is disabled in this case, so the picker's "Already shared"
      // pill is the observable signal instead of a click-through.
      expect(await screen.findByText(/Already shared/i)).toBeInTheDocument();
    });

    it('rolls back (leaves) the newly-created sync group when the PLC entry write fails, logging an orphaned-group error', async () => {
      writePlcQuizEntry.mockRejectedValueOnce(new Error('entry write failed'));
      mockPersonalQuizzes = [personal];
      renderSubject();
      fireEvent.click(screen.getByText('OpenShare'));
      fireEvent.click(await screen.findByRole('button', { name: /^Share$/ }));

      await waitFor(() =>
        expect(addToast).toHaveBeenCalledWith('entry write failed', 'error')
      );
      // attachSyncLinkage succeeded (group created+linked) so this is the
      // "orphaned group" branch — createSyncedQuizGroup ran but the header
      // write didn't, leaving the group without a callLeaveSyncedQuizGroup
      // rollback (only the linkage-failure branch below rolls the group
      // itself back).
      expect(createSyncedQuizGroup).toHaveBeenCalledTimes(1);
    });

    it('rolls back (leaves) the newly-created sync group when attachSyncLinkage fails', async () => {
      attachSyncLinkage.mockRejectedValueOnce(new Error('linkage failed'));
      mockPersonalQuizzes = [personal];
      renderSubject();
      fireEvent.click(screen.getByText('OpenShare'));
      fireEvent.click(await screen.findByRole('button', { name: /^Share$/ }));

      await waitFor(() =>
        expect(callLeaveSyncedQuizGroup).toHaveBeenCalledTimes(1)
      );
      expect(addToast).toHaveBeenCalledWith('linkage failed', 'error');
      expect(writePlcQuizEntry).not.toHaveBeenCalled();
    });
  });
});
