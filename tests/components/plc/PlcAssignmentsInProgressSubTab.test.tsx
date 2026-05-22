/**
 * Tests for PlcAssignmentsInProgressSubTab — Task 11.
 *
 * Covers:
 *   1. Owner rows show Monitor + Results buttons; no "Assign to my classes".
 *   2. Non-owner rows with a matching template show "Assign to my classes";
 *      no Monitor/Results.
 *   3. Clicking Monitor opens PlcAssignmentSessionModal with view=monitor.
 *   4. Clicking Results opens PlcAssignmentSessionModal with view=results.
 *   5. Clicking "Assign to my classes" opens the PlcAssignmentImportModal.
 *   6. Picking "sync" in the modal calls callJoinPlcAssignmentSyncGroup and
 *      createAssignment, then shows the class-period picker.
 *   7. Owner video-activity rows ALSO show Monitor/Results, and opening one
 *      threads kind='video-activity' into the session modal.
 *   8. Non-owner rows with no matching template hide "Assign to my classes".
 */

import React from 'react';
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
  within,
} from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { I18nextProvider } from 'react-i18next';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { PlcAssignmentsInProgressSubTab } from '@/components/plc/tabs/PlcAssignmentsInProgressSubTab';
import * as syncedQuizGroupsMod from '@/hooks/useSyncedQuizGroups';
import type { ClassRoster, Plc, PlcAssignmentIndexEntry } from '@/types';

// ---------------------------------------------------------------------------
// i18n stub
// ---------------------------------------------------------------------------
beforeAll(() => {
  void i18n.use(initReactI18next).init({
    lng: 'en',
    fallbackLng: 'en',
    resources: { en: { translation: {} } },
    interpolation: { escapeValue: false },
  });
});

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({ user: { uid: 'owner-1', displayName: 'Teacher One' } }),
}));

const addToast = vi.fn();

vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({
    addToast,
    rosters: [
      { id: 'r1', name: 'Math 1', students: [] } as unknown as ClassRoster,
    ],
  }),
}));

// Stub the session modal — the subtab test only verifies that the right
// view + assignmentId are handed to it. Its own data/rendering is covered
// by the QuizWidget monitor/results suites.
vi.mock('@/components/plc/assignments/PlcAssignmentSessionModal', () => ({
  PlcAssignmentSessionModal: ({
    assignmentId,
    kind,
    view,
  }: {
    assignmentId: string;
    kind: 'quiz' | 'video-activity';
    view: 'monitor' | 'results';
    onClose: () => void;
  }) => (
    <div
      data-testid="session-modal"
      data-assignment-id={assignmentId}
      data-kind={kind}
      data-view={view}
    />
  ),
}));

// Two entries: owner-1 owns entry-1, peer-2 owns entry-2.
const ownerEntry: PlcAssignmentIndexEntry = {
  id: 'entry-1',
  kind: 'quiz',
  ownerUid: 'owner-1',
  ownerName: 'Teacher One',
  ownerEmail: 'one@example.com',
  title: 'Photosynthesis Quiz',
  sheetUrl: 'https://docs.google.com/spreadsheets/d/fake',
  status: 'active',
  createdAt: 1_000_000,
};

const peerEntry: PlcAssignmentIndexEntry = {
  id: 'entry-2',
  kind: 'quiz',
  ownerUid: 'peer-2',
  ownerName: 'Teacher Two',
  ownerEmail: 'two@example.com',
  title: 'Cell Division Quiz',
  sheetUrl: 'https://docs.google.com/spreadsheets/d/fake2',
  status: 'active',
  createdAt: 2_000_000,
};

const videoEntry: PlcAssignmentIndexEntry = {
  id: 'entry-3',
  kind: 'video-activity',
  ownerUid: 'owner-1',
  ownerName: 'Teacher One',
  ownerEmail: 'one@example.com',
  title: 'Cell Cycle Video',
  sheetUrl: 'https://docs.google.com/spreadsheets/d/fake3',
  status: 'active',
  createdAt: 3_000_000,
};

// Mutable so individual tests (e.g. the kindFilter cases) can swap the
// dataset the hook returns. Reset to the default mixed set in beforeEach.
const DEFAULT_INDEX_ENTRIES: PlcAssignmentIndexEntry[] = [
  ownerEntry,
  peerEntry,
  videoEntry,
];
let indexEntries: PlcAssignmentIndexEntry[] = DEFAULT_INDEX_ENTRIES;

vi.mock('@/hooks/usePlcAssignmentIndex', () => ({
  usePlcAssignmentIndex: () => ({
    entries: indexEntries,
    loading: false,
    error: null,
  }),
}));

// Template for peer entry only (owner-1's entries don't need import).
vi.mock('@/hooks/usePlcAssignments', () => ({
  usePlcAssignments: () => ({
    templates: [
      {
        id: 'tpl-2',
        quizTitle: 'Cell Division Quiz',
        quizId: 'quiz-2',
        syncGroupId: 'sync-2',
        sessionMode: 'auto' as const,
        sessionOptions: {},
        attemptLimit: null,
        sharedBy: 'peer-2',
        sharedByEmail: 'two@example.com',
        sharedByName: 'Teacher Two',
        sharedAt: 2_000_000,
        updatedAt: 2_000_000,
      },
    ],
    loading: false,
    error: null,
  }),
}));

const saveQuiz = vi.fn().mockResolvedValue({
  id: 'quiz-new',
  driveFileId: 'drive-new',
  title: 'Cell Division Quiz',
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
    assignments: [],
    createAssignment,
    setAssignmentRosters,
  }),
}));

vi.mock('@/hooks/useSyncedQuizGroups', () => ({
  pullSyncedQuizContent: vi.fn().mockResolvedValue({
    title: 'Cell Division Quiz',
    questions: [],
    version: 1,
  }),
  callJoinPlcAssignmentSyncGroup: vi
    .fn()
    .mockResolvedValue({ groupId: 'sync-2', version: 1 }),
  callLeaveSyncedQuizGroup: vi.fn().mockResolvedValue(undefined),
}));

// Stub AssignClassPicker so roster selection works in tests without full UI.
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

// ---------------------------------------------------------------------------
// Fixture data
// ---------------------------------------------------------------------------

const plc = {
  id: 'plc-1',
  name: 'Test PLC',
  leadUid: 'owner-1',
  memberUids: ['owner-1', 'peer-2'],
} as unknown as Plc;

// ---------------------------------------------------------------------------
// Render helper
// ---------------------------------------------------------------------------

const renderSubject = (
  props: Partial<
    React.ComponentProps<typeof PlcAssignmentsInProgressSubTab>
  > = {}
) =>
  render(
    <I18nextProvider i18n={i18n}>
      <PlcAssignmentsInProgressSubTab plc={plc} {...props} />
    </I18nextProvider>
  );

/**
 * Identity-based row lookup: find the row container by its (unique) title
 * text rather than relying on render order. Returns a scope you can run
 * `within(...)` queries against — robust to entry reordering.
 */
const rowForTitle = (title: string): HTMLElement => {
  const titleEl = screen.getByText(title);
  const row = titleEl.closest<HTMLElement>('div.flex.items-center.gap-3');
  if (!row) {
    throw new Error(`Could not find row container for title: ${title}`);
  }
  return row;
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PlcAssignmentsInProgressSubTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createAssignmentResolver = null;
    indexEntries = DEFAULT_INDEX_ENTRIES;
  });

  it('renders Monitor and Results buttons for owner rows (quiz + video)', () => {
    renderSubject();
    const monitorBtns = screen.getAllByTestId('row-action-monitor');
    const resultsBtns = screen.getAllByTestId('row-action-results');
    // Both owned entries get Monitor/Results: entry-1 (quiz) and entry-3
    // (video-activity). The peer-owned entry-2 does not.
    expect(monitorBtns).toHaveLength(2);
    expect(resultsBtns).toHaveLength(2);
  });

  it('renders Monitor/Results on video-activity owner rows', () => {
    renderSubject();
    // entry-3 is an owned video-activity — Monitor/Results now work for it
    // too (both owned rows surface the buttons).
    const monitorBtns = screen.getAllByTestId('row-action-monitor');
    expect(monitorBtns).toHaveLength(2);
  });

  it('does NOT render "Assign to my classes" on owner rows', () => {
    renderSubject();
    // Only entry-2 (peer-2 owned) should show "Assign to my classes".
    const assignBtns = screen.getAllByTestId('row-action-assign-to-my-classes');
    expect(assignBtns).toHaveLength(1);
  });

  it('renders "Assign to my classes" for non-owner rows with a template', () => {
    renderSubject();
    expect(
      screen.getByTestId('row-action-assign-to-my-classes')
    ).toBeInTheDocument();
  });

  it('clicking Monitor opens the session modal with view=monitor (quiz)', () => {
    renderSubject();

    // Select the Monitor button within the quiz row (entry-1) by its title,
    // so this stays correct regardless of entry render order.
    const quizRow = rowForTitle(ownerEntry.title);
    fireEvent.click(within(quizRow).getByTestId('row-action-monitor'));

    const modal = screen.getByTestId('session-modal');
    expect(modal).toHaveAttribute('data-assignment-id', 'entry-1');
    expect(modal).toHaveAttribute('data-kind', 'quiz');
    expect(modal).toHaveAttribute('data-view', 'monitor');
  });

  it('clicking Results opens the session modal with view=results (quiz)', () => {
    renderSubject();

    const quizRow = rowForTitle(ownerEntry.title);
    fireEvent.click(within(quizRow).getByTestId('row-action-results'));

    const modal = screen.getByTestId('session-modal');
    expect(modal).toHaveAttribute('data-assignment-id', 'entry-1');
    expect(modal).toHaveAttribute('data-kind', 'quiz');
    expect(modal).toHaveAttribute('data-view', 'results');
  });

  it('clicking Monitor on a video-activity row threads kind=video-activity', () => {
    renderSubject();

    // Select within the video-activity row (entry-3) by its title.
    const videoRow = rowForTitle(videoEntry.title);
    fireEvent.click(within(videoRow).getByTestId('row-action-monitor'));

    const modal = screen.getByTestId('session-modal');
    expect(modal).toHaveAttribute('data-assignment-id', 'entry-3');
    expect(modal).toHaveAttribute('data-kind', 'video-activity');
    expect(modal).toHaveAttribute('data-view', 'monitor');
  });

  it('clicking "Assign to my classes" opens the import modal', () => {
    renderSubject();
    fireEvent.click(screen.getByTestId('row-action-assign-to-my-classes'));
    // PlcAssignmentImportModal renders options — look for "Make a copy" text.
    expect(screen.getByText(/Make a copy/i)).toBeInTheDocument();
  });

  it('picking sync mode calls callJoinPlcAssignmentSyncGroup then createAssignment', async () => {
    renderSubject();

    fireEvent.click(screen.getByTestId('row-action-assign-to-my-classes'));

    // Pick the "Synced" option in the modal (the button text is "Synced").
    const syncButton = screen
      .getAllByRole('button')
      .find((b) => b.textContent?.includes('Synced'));
    expect(syncButton).toBeDefined();
    act(() => {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      fireEvent.click(syncButton!);
    });

    await waitFor(() => {
      expect(
        syncedQuizGroupsMod.callJoinPlcAssignmentSyncGroup
      ).toHaveBeenCalledWith('plc-1', 'tpl-2');
    });
    await waitFor(() => {
      expect(createAssignment).toHaveBeenCalled();
    });
  });

  it('after createAssignment resolves, import modal is dismissed', async () => {
    renderSubject();
    fireEvent.click(screen.getByTestId('row-action-assign-to-my-classes'));

    const syncButton = screen
      .getAllByRole('button')
      .find((b) => b.textContent?.includes('Synced'));
    act(() => {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      fireEvent.click(syncButton!);
    });

    // Resolve createAssignment to trigger pendingSetup.
    await act(async () => {
      createAssignmentResolver?.({ id: 'assign-new', code: 'ABC123' });
      await Promise.resolve();
    });

    // The sync/copy picker modal should be dismissed after the import
    // resolves and pendingSetup is set.
    await waitFor(() => {
      expect(screen.queryByText(/Make a copy/i)).not.toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // kindFilter prop (C3)
  // -------------------------------------------------------------------------
  describe('kindFilter', () => {
    // A mixed set with both quiz and video-activity rows, all in progress
    // (active/paused), so the only thing that scopes them is the kindFilter.
    const quizActive: PlcAssignmentIndexEntry = {
      ...ownerEntry,
      id: 'k-quiz-1',
      title: 'Filter Quiz Active',
      kind: 'quiz',
      status: 'active',
    };
    const quizPaused: PlcAssignmentIndexEntry = {
      ...ownerEntry,
      id: 'k-quiz-2',
      title: 'Filter Quiz Paused',
      kind: 'quiz',
      status: 'paused',
    };
    const videoActive: PlcAssignmentIndexEntry = {
      ...videoEntry,
      id: 'k-video-1',
      title: 'Filter Video Active',
      kind: 'video-activity',
      status: 'active',
    };
    const videoPaused: PlcAssignmentIndexEntry = {
      ...videoEntry,
      id: 'k-video-2',
      title: 'Filter Video Paused',
      kind: 'video-activity',
      status: 'paused',
    };

    beforeEach(() => {
      indexEntries = [quizActive, videoActive, quizPaused, videoPaused];
    });

    it('renders only quiz rows when kindFilter="quiz"', () => {
      renderSubject({ kindFilter: 'quiz' });

      expect(screen.getByText(quizActive.title)).toBeInTheDocument();
      expect(screen.getByText(quizPaused.title)).toBeInTheDocument();
      expect(screen.queryByText(videoActive.title)).not.toBeInTheDocument();
      expect(screen.queryByText(videoPaused.title)).not.toBeInTheDocument();
    });

    it('renders only video-activity rows when kindFilter="video-activity"', () => {
      renderSubject({ kindFilter: 'video-activity' });

      expect(screen.getByText(videoActive.title)).toBeInTheDocument();
      expect(screen.getByText(videoPaused.title)).toBeInTheDocument();
      expect(screen.queryByText(quizActive.title)).not.toBeInTheDocument();
      expect(screen.queryByText(quizPaused.title)).not.toBeInTheDocument();
    });

    it('renders all kinds when kindFilter is undefined', () => {
      renderSubject();

      expect(screen.getByText(quizActive.title)).toBeInTheDocument();
      expect(screen.getByText(quizPaused.title)).toBeInTheDocument();
      expect(screen.getByText(videoActive.title)).toBeInTheDocument();
      expect(screen.getByText(videoPaused.title)).toBeInTheDocument();
    });
  });
});
