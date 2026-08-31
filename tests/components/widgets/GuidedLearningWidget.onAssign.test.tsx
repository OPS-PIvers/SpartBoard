/**
 * M17 §5 B3 — GuidedLearningWidget's real assign wiring (`performAssign`).
 * Mirrors the VideoActivityWidget onAssign fix (origin/m17/b3-va,
 * commit 45ad9a1c): the CF is called ONLY when `targetMode === 'students'`
 * — a class-wide assignment, even with a Schedule window set, must make
 * zero `setAssignmentTargetsV1` calls, since window fields already land
 * on the session/assignment docs via `createSession`/`createAssignment`.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from '@testing-library/react';
import { httpsCallable } from 'firebase/functions';

import { GuidedLearningWidget } from '@/components/widgets/GuidedLearning/Widget';
import type {
  WidgetData,
  GuidedLearningSetMetadata,
  GuidedLearningConfig,
  ClassRoster,
} from '@/types';

vi.mock('@/config/firebase', () => ({
  db: { __mock: 'db' },
  functions: { __mock: 'functions' },
  isAuthBypass: false,
}));

const mockUpdateDoc = vi.fn(
  (..._args: unknown[]): Promise<void> => Promise.resolve()
);
vi.mock('firebase/firestore', () => ({
  doc: vi.fn((..._args: unknown[]) => ({ __mockDocRefArgs: _args })),
  updateDoc: (...args: unknown[]): Promise<void> => mockUpdateDoc(...args),
  writeBatch: vi.fn(),
}));

const mockCallable = vi.fn();
vi.mock('firebase/functions', () => ({
  httpsCallable: vi.fn(() => mockCallable),
}));

const addToast = vi.fn();
const updateWidget = vi.fn();
const ROSTER: ClassRoster = {
  id: 'roster-1',
  name: 'Period 1',
  driveFileId: null,
  studentCount: 1,
  createdAt: 1000,
  students: [{ id: 'stu-1', name: 'Ada Lovelace' }],
} as unknown as ClassRoster;

vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({
    updateWidget,
    addToast,
    rosters: [ROSTER],
  }),
}));

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    user: { uid: 'teacher-1', displayName: 'Test Teacher' },
    isAdmin: false,
    getAssignmentMode: () => 'graded',
  }),
}));

vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({ showConfirm: vi.fn() }),
}));

const SET_META: GuidedLearningSetMetadata = {
  id: 'gl-1',
  title: 'Fractions Warmup',
  driveFileId: 'drive-1',
  slideCount: 3,
  createdAt: 1000,
  updatedAt: 2000,
} as unknown as GuidedLearningSetMetadata;

vi.mock('@/hooks/useGuidedLearning', () => ({
  useGuidedLearning: () => ({
    sets: [SET_META],
    buildingSets: [],
    loading: false,
    buildingLoading: false,
    isDriveConnected: true,
    saveSet: vi.fn(),
    loadSetData: vi.fn().mockResolvedValue({
      id: 'gl-1',
      title: 'Fractions Warmup',
      slides: [],
    }),
    deleteSet: vi.fn(),
    duplicateSet: vi.fn(),
    saveBuildingSet: vi.fn(),
    deleteBuildingSet: vi.fn(),
    duplicateBuildingSet: vi.fn(),
  }),
}));

const createSession = vi
  .fn()
  .mockResolvedValue('https://spartboard.app/guided-learning/session-1');
vi.mock('@/hooks/useGuidedLearningSession', () => ({
  useGuidedLearningSessionTeacher: () => ({ createSession }),
}));

const createAssignment = vi.fn().mockResolvedValue(undefined);
vi.mock('@/hooks/useGuidedLearningAssignments', () => ({
  useGuidedLearningAssignments: () => ({
    assignments: [],
    loading: false,
    createAssignment,
    archiveAssignment: vi.fn(),
    unarchiveAssignment: vi.fn(),
    deleteAssignment: vi.fn(),
    publishAssignmentScores: vi.fn(),
    unpublishAssignmentScores: vi.fn(),
  }),
}));

vi.mock('@/hooks/useFolders', () => ({
  useFolders: () => ({ folders: [], moveItem: vi.fn() }),
}));

// Stub the manager UI down to a single "Assign" button — this test targets
// the widget's own onAssign wiring (CF gating), not the manager's list/menu
// chrome, which has its own dedicated tests.
vi.mock(
  '@/components/widgets/GuidedLearning/components/GuidedLearningManager',
  () => ({
    GuidedLearningManager: (props: {
      onAssign: (setId: string, driveFileId?: string) => void;
    }) => (
      <button type="button" onClick={() => props.onAssign('gl-1', 'drive-1')}>
        Assign
      </button>
    ),
  })
);

function makeWidget(): WidgetData {
  return {
    id: 'widget-1',
    type: 'guidedLearning',
    x: 0,
    y: 0,
    w: 400,
    h: 300,
    z: 1,
    config: { view: 'library' } as GuidedLearningConfig,
  } as unknown as WidgetData;
}

async function openAssignModal() {
  render(<GuidedLearningWidget widget={makeWidget()} />);
  const assignBtn = await screen.findByRole('button', { name: /^assign$/i });
  fireEvent.click(assignBtn);
  return screen.findByRole('dialog', { name: /fractions warmup/i });
}

function confirmAssign(dialog: HTMLElement) {
  fireEvent.click(within(dialog).getByRole('button', { name: /^assign$/i }));
}

function enableIndividualTargeting(dialog: HTMLElement) {
  fireEvent.click(
    within(dialog).getByText(/\+ individual students & overrides/i)
  );
}

function setScheduleWindow(dialog: HTMLElement) {
  fireEvent.click(within(dialog).getByText(/^schedule$/i));
  fireEvent.change(within(dialog).getByLabelText(/opens/i), {
    target: { value: '2026-06-01T09:00' },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  createSession.mockResolvedValue(
    'https://spartboard.app/guided-learning/session-1'
  );
  createAssignment.mockResolvedValue(undefined);
});

describe('GuidedLearningWidget onAssign — class-wide flow', () => {
  it('never calls setAssignmentTargetsV1 for a class-wide assignment', async () => {
    const dialog = await openAssignModal();
    confirmAssign(dialog);

    await waitFor(() => expect(createSession).toHaveBeenCalledOnce());
    expect(httpsCallable).not.toHaveBeenCalled();
  });

  it('never calls setAssignmentTargetsV1 even when a Schedule window is set', async () => {
    const dialog = await openAssignModal();
    setScheduleWindow(dialog);
    confirmAssign(dialog);

    await waitFor(() => expect(createSession).toHaveBeenCalledOnce());
    expect(httpsCallable).not.toHaveBeenCalled();
    // Window still reaches the assignment doc through the normal path.
    expect(createAssignment).toHaveBeenCalledWith(
      expect.objectContaining({ openAt: expect.any(Number) })
    );
  });
});

describe('GuidedLearningWidget onAssign — individual targeting', () => {
  it('calls setAssignmentTargetsV1 when targetMode is students', async () => {
    mockCallable.mockResolvedValue({ data: { skipped: [] } });
    const dialog = await openAssignModal();
    enableIndividualTargeting(dialog);
    confirmAssign(dialog);

    await waitFor(() =>
      expect(httpsCallable).toHaveBeenCalledWith(
        expect.anything(),
        'setAssignmentTargetsV1'
      )
    );
    expect(mockCallable).toHaveBeenCalledWith(
      expect.objectContaining({
        assignmentId: 'session-1',
        kind: 'guided-learning',
      })
    );
  });
});
