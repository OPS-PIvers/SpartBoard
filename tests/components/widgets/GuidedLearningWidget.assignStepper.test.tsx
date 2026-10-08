// The Guided Learning assign stepper's wiring into performAssign (docs/plans/ASSIGN_STEPPER.md slice 11).
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from '@testing-library/react';

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
  defaultOverridesByStudentId: { 'stu-1': { timeMultiplier: 2 } },
  students: [
    {
      id: 'stu-1',
      firstName: 'Ada',
      lastName: 'Lovelace',
      pin: '01',
      classLinkSourcedId: 'SID-1',
    },
  ],
} as unknown as ClassRoster;

const PERIOD_ROSTER = {
  id: 'roster-2',
  name: 'Period 3',
  driveFileId: null,
  studentCount: 0,
  createdAt: 1000,
  classlinkClassId: 'cl-3',
  students: [
    {
      id: 'stu-3',
      firstName: 'Grace',
      lastName: 'Hopper',
      pin: '03',
      classLinkSourcedId: 'SID-3',
    },
    {
      id: 'stu-4',
      firstName: 'Alan',
      lastName: 'Turing',
      pin: '04',
      classLinkSourcedId: 'SID-4',
    },
  ],
} as unknown as ClassRoster;
const extraRosters: ClassRoster[] = [];
const periodCtx: { current: unknown } = { current: undefined };
vi.mock('@/hooks/useTeacherBellPeriods', () => ({
  useAssignPeriodAccess: () => periodCtx.current,
}));

vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({
    updateWidget,
    addToast,
    updateRoster: vi.fn(),
    rosters: [ROSTER, ...extraRosters],
  }),
}));

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    user: { uid: 'teacher-1', displayName: 'Test Teacher' },
    isAdmin: false,
    getAssignmentMode: () => 'submissions',
    canAccessFeature: (id: string) => id === 'assign-stepper',
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

function makeWidget(config: Partial<GuidedLearningConfig> = {}): WidgetData {
  return {
    id: 'widget-1',
    type: 'guidedLearning',
    x: 0,
    y: 0,
    w: 400,
    h: 300,
    z: 1,
    config: { view: 'library', ...config } as GuidedLearningConfig,
  } as unknown as WidgetData;
}

async function openStepper(config: Partial<GuidedLearningConfig> = {}) {
  render(<GuidedLearningWidget widget={makeWidget(config)} />);
  fireEvent.click(await screen.findByRole('button', { name: /^assign$/i }));
  return screen.findByRole('dialog', { name: /fractions warmup/i });
}

const sessionCall = () =>
  createSession.mock.calls[0] as [
    unknown,
    string[],
    string[],
    string[],
    string,
    { openAt?: number; closeAt?: number; dueAt?: number },
    { workKind?: string },
    (
      | {
          accessMode: string;
          periodAccess: Record<string, { state: string }>;
        }
      | undefined
    ),
  ];

const ctx = () => ({
  bellOptions: [],
  bellWindow: () => null,
  onTagRoster: vi.fn(),
});

beforeEach(() => {
  vi.clearAllMocks();
  extraRosters.length = 0;
  periodCtx.current = undefined;
  createSession.mockResolvedValue(
    'https://spartboard.app/guided-learning/session-1'
  );
  createAssignment.mockResolvedValue(undefined);
  mockCallable.mockResolvedValue({ data: { skipped: [] } });
});

describe('GuidedLearningWidget assign stepper', () => {
  it('opens as a study resource with Classes and Available', async () => {
    const dialog = await openStepper({
      lastRosterIdsBySetId: { 'gl-1': ['roster-1'] },
    });
    expect(
      within(dialog).getByRole('radio', { name: /study resource/i })
    ).toHaveAttribute('aria-checked', 'true');
    expect(within(dialog).getByText('Classes')).toBeInTheDocument();
    expect(within(dialog).getByText('Available')).toBeInTheDocument();
    expect(within(dialog).queryByText('When')).not.toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: /^assign$/i }));
    await waitFor(() => expect(createSession).toHaveBeenCalledOnce());
    const [, , , rosterIds, mode, window, options, gate] = sessionCall();
    expect(rosterIds).toEqual(['roster-1']);
    expect(mode).toBe('submissions');
    expect(options.workKind).toBe('resource');
    expect(window.openAt).toEqual(expect.any(Number));
    expect(gate).toBeUndefined();
  });

  it('Students submit work on Manual gives one class a closed gate and no due date', async () => {
    periodCtx.current = ctx();
    const dialog = await openStepper({
      lastRosterIdsBySetId: { 'gl-1': ['roster-1'] },
    });
    fireEvent.click(
      within(dialog).getByRole('radio', { name: /students submit work/i })
    );
    fireEvent.click(within(dialog).getByRole('button', { name: /continue/i }));
    fireEvent.click(within(dialog).getByRole('radio', { name: /^manual$/i }));
    fireEvent.click(within(dialog).getByRole('button', { name: /^assign$/i }));

    await waitFor(() => expect(createSession).toHaveBeenCalledOnce());
    const [, , , , , window, options, gate] = sessionCall();
    expect(options.workKind).toBe('work');
    expect(gate?.accessMode).toBe('assessment');
    expect(Object.values(gate?.periodAccess ?? {})).toEqual([
      expect.objectContaining({ state: 'closed' }),
    ]);
    expect(window.dueAt).toBeUndefined();
    await waitFor(() => expect(createAssignment).toHaveBeenCalledOnce());
    expect(createAssignment.mock.calls[0][0]).toMatchObject({
      periodGate: gate,
    });
  });

  it('sends only the picked students of a narrowed class', async () => {
    extraRosters.push(PERIOD_ROSTER);
    const dialog = await openStepper({
      lastRosterIdsBySetId: { 'gl-1': ['roster-1', 'roster-2'] },
    });
    fireEvent.click(
      within(dialog).getByRole('button', { name: /period 3: all students/i })
    );
    fireEvent.click(within(dialog).getByLabelText(/grace hopper/i));
    fireEvent.click(within(dialog).getByRole('button', { name: /^assign$/i }));

    await waitFor(() =>
      expect(mockCallable).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: 'guided-learning',
          targetMode: 'class',
          studentTargetClassIds: ['cl-3'],
          add: expect.arrayContaining([
            { kind: 'classlink', sourcedId: 'SID-3' },
          ]),
        })
      )
    );
    const add = (mockCallable.mock.calls[0][0] as { add: unknown[] }).add;
    expect(add).not.toContainEqual({ kind: 'classlink', sourcedId: 'SID-4' });
  });
});
