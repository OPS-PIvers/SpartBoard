/**
 * Integration test for PlcQuizLibraryBody — guards the assign-pickup
 * lifecycle ported from the now-deleted PlcAssignmentsLibrarySubTab plus
 * the NEW source-based sync-join routing.
 *
 * Two findings drive this file:
 *
 *   C1 — assign-pickup lifecycle (mirrors the deleted
 *        PlcAssignmentsLibrarySubTab test, adapted to the per-row
 *        "Assign to my classes" button on PlcQuizLibraryBody):
 *          1. The import modal opens; picking a mode runs `handleAssign`,
 *             which calls `createAssignment` with `initialStatus: 'paused'`,
 *             `skipPlcTemplateWrite: true`, and the row's run-settings.
 *          2. After `createAssignment` resolves, the class-period picker
 *             renders OPTIMISTICALLY from the import-time stub (before the
 *             assignments snapshot would surface the doc).
 *          3. Save invokes `setAssignmentRosters(newId, targets)`.
 *          4. A second assign while one is in flight is a no-op.
 *          5. "Edit all settings…" hands off via `setPendingAssignmentEdit`
 *             + `onCloseDashboard`.
 *
 *   C2 — sync-join routing by source: a `source: 'quiz'` row joins via
 *        `callJoinPlcQuizSyncGroup`; a `source: 'template'` row (legacy
 *        template-only, not present among the synced quizzes) joins via
 *        `callJoinPlcAssignmentSyncGroup`.
 *
 * Heavy collaborators (Drive, Firestore, sync-group Cloud Functions) are
 * mocked at the module boundary — this exercises the component's own
 * orchestration, not the import plumbing.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import i18n from 'i18next';
import { PlcQuizLibraryBody } from '@/components/plc/bodies/PlcQuizLibraryBody';
import type {
  ClassRoster,
  Plc,
  PlcAssignmentTemplate,
  PlcQuizEntry,
} from '@/types';

// Stub AssignClassPicker (used inside QuizAssignmentImportSetupModal) the
// same way the modal's own test does, so we can drive roster selection
// without pulling in ClassLink chrome.
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

// The dialog confirm helper is only used by unshare — point it at a no-op.
vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({ showConfirm: vi.fn().mockResolvedValue(false) }),
}));

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    user: { uid: 'teacher-1', email: 't@example.com' },
    canAccessFeature: () => true,
  }),
}));

// QuizEditorModal is always mounted (isOpen-gated) but irrelevant to the
// assign/sync flows under test — stub it so its dependency tree (Gemini AI
// gating, editor state) stays out of these tests.
vi.mock('@/components/widgets/QuizWidget/components/QuizEditorModal', () => ({
  QuizEditorModal: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div data-testid="quiz-editor-modal" /> : null,
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

// --- PLC content hooks: drive the unified row list. -----------------------

const unshareQuizFromPlc = vi.fn().mockResolvedValue(undefined);
const restoreQuizInPlc = vi.fn().mockResolvedValue(undefined);
let mockPlcQuizzes: PlcQuizEntry[] = [];
vi.mock('@/hooks/usePlcQuizzes', () => ({
  usePlcQuizzes: () => ({
    quizzes: mockPlcQuizzes,
    loading: false,
    unshareQuizFromPlc,
    restoreQuizInPlc,
  }),
  writePlcQuizEntry: vi.fn().mockResolvedValue(undefined),
}));

// usePlcSoftDelete (Decision 3.1): the unshare handler routes through it. The
// mock runs the supplied `runDelete` so the unshare path is still exercised.
const softDeleteMock = vi.fn(
  async (input: { runDelete: () => Promise<void> }) => {
    await input.runDelete();
  }
);
vi.mock('@/hooks/usePlcTrash', () => ({
  usePlcSoftDelete: () => ({ softDelete: softDeleteMock }),
}));

const deleteAssignmentTemplate = vi.fn().mockResolvedValue(undefined);
let mockTemplates: PlcAssignmentTemplate[] = [];
vi.mock('@/hooks/usePlcAssignments', () => ({
  usePlcAssignments: () => ({
    templates: mockTemplates,
    deleteAssignmentTemplate,
  }),
}));

// --- Quiz library / Drive boundary. ---------------------------------------

const saveQuiz = vi.fn().mockResolvedValue({
  id: 'quiz-personal-1',
  driveFileId: 'drive-1',
  title: 'Photosynthesis Quiz',
});
const deleteQuiz = vi.fn().mockResolvedValue(undefined);
const attachSyncLinkage = vi.fn().mockResolvedValue(undefined);
vi.mock('@/hooks/useQuiz', () => ({
  SyncedQuizVersionConflictError: class extends Error {},
  useQuiz: () => ({
    quizzes: [],
    saveQuiz,
    deleteQuiz,
    attachSyncLinkage,
    loadQuizData: vi.fn(),
    pullSyncedQuiz: vi.fn(),
    isDriveConnected: true,
  }),
}));

// --- Assignments hook: deferred createAssignment so we can prove the ------
// optimistic picker render and the busy-guard. -----------------------------

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
    // `assignments` stays empty so the picker has to render off the
    // import-time stub (snapshot lag scenario).
    assignments: [],
    createAssignment,
    setAssignmentRosters,
  }),
}));

// --- Sync-group Cloud Functions: the routing assertions for C2. -----------

interface JoinResult {
  groupId: string;
  version: number;
}

const callJoinPlcQuizSyncGroup = vi
  .fn<(plcId: string, sourceId: string) => Promise<JoinResult>>()
  .mockResolvedValue({ groupId: 'sync-quiz', version: 1 });
const callJoinPlcAssignmentSyncGroup = vi
  .fn<(plcId: string, sourceId: string) => Promise<JoinResult>>()
  .mockResolvedValue({ groupId: 'sync-tpl', version: 1 });
vi.mock('@/hooks/useSyncedQuizGroups', () => ({
  pullSyncedQuizContent: vi.fn().mockResolvedValue({
    title: 'Photosynthesis Quiz',
    questions: [],
    version: 1,
  }),
  callJoinPlcQuizSyncGroup: (plcId: string, sourceId: string) =>
    callJoinPlcQuizSyncGroup(plcId, sourceId),
  callJoinPlcAssignmentSyncGroup: (plcId: string, sourceId: string) =>
    callJoinPlcAssignmentSyncGroup(plcId, sourceId),
  callLeaveSyncedQuizGroup: vi.fn().mockResolvedValue(undefined),
  createSyncedQuizGroup: vi.fn().mockResolvedValue(undefined),
}));

const plc = {
  id: 'plc-1',
  name: 'Test PLC',
  leadUid: 'teacher-1',
  memberUids: ['teacher-1'],
} as unknown as Plc;

const makeQuizRow = (over: Partial<PlcQuizEntry> = {}): PlcQuizEntry =>
  ({
    id: 'plcquiz-1',
    title: 'Photosynthesis Quiz',
    questionCount: 5,
    syncGroupId: 'sync-quiz',
    sharedBy: 'teacher-2',
    sharedByEmail: 'smith@example.com',
    sharedByName: 'Mrs. Smith',
    sharedAt: 1000,
    updatedAt: 2000,
    sessionMode: 'auto',
    sessionOptions: {},
    attemptLimit: null,
    quizId: 'src-quiz-1',
    ...over,
  }) as unknown as PlcQuizEntry;

const makeTemplateRow = (
  over: Partial<PlcAssignmentTemplate> = {}
): PlcAssignmentTemplate =>
  ({
    id: 'plctpl-1',
    quizTitle: 'Legacy Cell Biology',
    quizId: 'src-tpl-1',
    syncGroupId: 'sync-tpl',
    sessionMode: 'self-paced',
    sessionOptions: {},
    attemptLimit: 2,
    sharedBy: 'teacher-3',
    sharedByEmail: 'jones@example.com',
    sharedByName: 'Mr. Jones',
    sharedAt: 500,
    updatedAt: 1500,
    ...over,
  }) as unknown as PlcAssignmentTemplate;

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
      <PlcQuizLibraryBody plc={plc} onCloseDashboard={onCloseDashboard} />
    </I18nextProvider>
  );

const openAssignModal = () =>
  // Each row exposes an "Assign to my classes" button (title + visible label).
  fireEvent.click(
    screen.getAllByRole('button', { name: /Assign to my classes/i })[0]
  );

const pickCopy = async () =>
  fireEvent.click(await screen.findByRole('button', { name: /Make a copy/i }));

describe('PlcQuizLibraryBody', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createAssignmentResolver = null;
    mockPlcQuizzes = [makeQuizRow()];
    mockTemplates = [];
  });

  describe('C1 — assign-pickup lifecycle', () => {
    it('creates a paused, template-write-skipping assignment with the row run-settings', async () => {
      mockPlcQuizzes = [makeQuizRow({ sessionMode: 'auto', attemptLimit: 3 })];
      renderSubject();

      openAssignModal();
      await pickCopy();

      await waitFor(() => expect(createAssignment).toHaveBeenCalledTimes(1));
      expect(createAssignment).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'quiz-personal-1' }),
        expect.objectContaining({
          sessionMode: 'auto',
          sessionOptions: {},
          attemptLimit: 3,
        }),
        expect.objectContaining({
          initialStatus: 'paused',
          skipPlcTemplateWrite: true,
        })
      );
    });

    it('renders the class-period picker optimistically after assign (no listener snapshot)', async () => {
      renderSubject();

      openAssignModal();
      await pickCopy();

      // Drain the create promise so the picker can mount — it must render
      // even though useQuizAssignments returns no assignments (the title
      // comes from the import-time stub).
      await waitFor(() => expect(createAssignmentResolver).not.toBeNull());
      createAssignmentResolver?.({ id: 'asg-1', code: 'XYZ' });

      expect(
        await screen.findByText('Photosynthesis Quiz')
      ).toBeInTheDocument();
      expect(await screen.findByTestId('picker')).toBeInTheDocument();
    });

    it('Save invokes setAssignmentRosters with the new assignment id', async () => {
      renderSubject();

      openAssignModal();
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

    it('blocks a second assign while one is in flight (no-op, does not clobber pendingSetup)', async () => {
      // Two quiz rows so a second row exists to click.
      mockPlcQuizzes = [
        makeQuizRow({ id: 'plcquiz-1', syncGroupId: 'sync-quiz', title: 'A' }),
        makeQuizRow({
          id: 'plcquiz-2',
          syncGroupId: 'sync-quiz-2',
          title: 'B',
        }),
      ];
      renderSubject();

      // First assign — leave createAssignment unresolved so it stays in flight.
      fireEvent.click(
        screen.getAllByRole('button', { name: /Assign to my classes/i })[0]
      );
      await pickCopy();
      await waitFor(() => expect(createAssignment).toHaveBeenCalledTimes(1));

      // Every assign button is disabled while busy — the visible UI guard.
      const assignButtons = screen.getAllByRole('button', {
        name: /Assign to my classes/i,
      });
      assignButtons.forEach((btn) => expect(btn).toBeDisabled());

      // Clicking a still-rendered button is a no-op: createAssignment isn't
      // called a second time, so the first import's pendingSetup is intact.
      fireEvent.click(assignButtons[1]);
      expect(createAssignment).toHaveBeenCalledTimes(1);
    });

    it('"Edit all settings…" closes the PLC dashboard and hands off via setPendingAssignmentEdit', async () => {
      const onCloseDashboard = vi.fn();
      renderSubject(onCloseDashboard);

      openAssignModal();
      await pickCopy();
      await waitFor(() => expect(createAssignmentResolver).not.toBeNull());
      createAssignmentResolver?.({ id: 'asg-1', code: 'XYZ' });

      fireEvent.click(
        await screen.findByRole('button', { name: /Edit all settings/i })
      );

      expect(setPendingAssignmentEdit).toHaveBeenCalledWith('asg-1');
      expect(onCloseDashboard).toHaveBeenCalledTimes(1);
    });
  });

  describe('C2 — sync-join routing by source', () => {
    it('joins a quiz-source row via callJoinPlcQuizSyncGroup', async () => {
      mockPlcQuizzes = [makeQuizRow({ id: 'plcquiz-7', syncGroupId: 'sg-q' })];
      mockTemplates = [];
      renderSubject();

      openAssignModal();
      // Sync mode triggers the join Cloud Function.
      fireEvent.click(await screen.findByRole('button', { name: /Synced/i }));

      await waitFor(() =>
        expect(callJoinPlcQuizSyncGroup).toHaveBeenCalledWith(
          'plc-1',
          'plcquiz-7'
        )
      );
      expect(callJoinPlcAssignmentSyncGroup).not.toHaveBeenCalled();
    });

    it('joins a template-source row via callJoinPlcAssignmentSyncGroup', async () => {
      // Quiz row and a template row with a DIFFERENT syncGroupId, so the
      // template survives dedup and renders as a 'template'-source row.
      mockPlcQuizzes = [makeQuizRow({ syncGroupId: 'sg-quiz' })];
      mockTemplates = [
        makeTemplateRow({ id: 'plctpl-9', syncGroupId: 'sg-tpl' }),
      ];
      renderSubject();

      // The template row is the legacy one — assign it. Rows render
      // newest-first by updatedAt (quiz row 2000 > template row 1500), so the
      // template row's assign button is the second one. Walk up from its
      // title to scope the button lookup so the test stays robust to ordering.
      const titleEl = screen.getByText('Legacy Cell Biology');
      // The row container is the only ancestor that also wraps the row's
      // action buttons (the inner title wrapper does not).
      const templateAssignBtn = screen
        .getAllByRole('button', { name: /Assign to my classes/i })
        .find((b) => {
          const row = b.closest('.gap-3');
          return row !== null && row.contains(titleEl);
        }) as HTMLElement;
      fireEvent.click(templateAssignBtn);
      fireEvent.click(await screen.findByRole('button', { name: /Synced/i }));

      await waitFor(() =>
        expect(callJoinPlcAssignmentSyncGroup).toHaveBeenCalledWith(
          'plc-1',
          'plctpl-9'
        )
      );
      expect(callJoinPlcQuizSyncGroup).not.toHaveBeenCalled();
    });
  });
});
