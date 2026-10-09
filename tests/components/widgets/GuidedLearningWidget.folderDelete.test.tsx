// "Delete the folder and everything in it" keeps GL sets that have open assignments.
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';

import { GuidedLearningWidget } from '@/components/widgets/GuidedLearning/Widget';
import type { FolderDeleteActions } from '@/components/common/library/FolderSidebar';
import type {
  WidgetData,
  GuidedLearningSetMetadata,
  GuidedLearningConfig,
} from '@/types';

vi.mock('@/config/firebase', () => ({
  db: { __mock: 'db' },
  functions: { __mock: 'functions' },
  isAuthBypass: false,
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  updateDoc: vi.fn(() => Promise.resolve()),
  writeBatch: vi.fn(),
}));

vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn() }));

vi.mock('@/hooks/useTeacherBellPeriods', () => ({
  useAssignPeriodAccess: () => undefined,
}));

vi.mock('@/context/useDashboard', () => ({
  useDashboard: () => ({
    updateWidget: vi.fn(),
    addToast: vi.fn(),
    updateRoster: vi.fn(),
    rosters: [],
  }),
}));

vi.mock('@/context/useAuth', () => ({
  useAuth: () => ({
    user: { uid: 'teacher-1', displayName: 'Test Teacher' },
    isAdmin: false,
    getAssignmentMode: () => 'graded',
    canAccessFeature: () => false,
  }),
}));

vi.mock('@/context/useDialog', () => ({
  useDialog: () => ({ showConfirm: vi.fn() }),
}));

const SETS = ['gl-live', 'gl-idle'].map(
  (id) =>
    ({
      id,
      title: id,
      driveFileId: `drive-${id}`,
      slideCount: 1,
      createdAt: 1,
      updatedAt: 1,
    }) as unknown as GuidedLearningSetMetadata
);

const deleteSet = vi.fn().mockResolvedValue(undefined);
vi.mock('@/hooks/useGuidedLearning', () => ({
  useGuidedLearning: () => ({
    sets: SETS,
    buildingSets: [],
    loading: false,
    buildingLoading: false,
    isDriveConnected: true,
    saveSet: vi.fn(),
    loadSetData: vi.fn(),
    deleteSet,
    duplicateSet: vi.fn(),
    saveBuildingSet: vi.fn(),
    deleteBuildingSet: vi.fn(),
    duplicateBuildingSet: vi.fn(),
  }),
}));

vi.mock('@/hooks/useGuidedLearningSession', () => ({
  useGuidedLearningSessionTeacher: () => ({ createSession: vi.fn() }),
}));

const assignmentsState = { loading: false };
vi.mock('@/hooks/useGuidedLearningAssignments', () => ({
  useGuidedLearningAssignments: () => ({
    assignments: [
      { id: 'a1', setId: 'gl-live', status: 'active' },
      { id: 'a2', setId: 'gl-idle', status: 'inactive' },
    ],
    loading: assignmentsState.loading,
    createAssignment: vi.fn(),
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

const captured: { actions?: FolderDeleteActions } = {};
vi.mock(
  '@/components/widgets/GuidedLearning/components/GuidedLearningManager',
  () => ({
    GuidedLearningManager: (props: {
      folderDeleteActions?: FolderDeleteActions;
    }) => {
      captured.actions = props.folderDeleteActions;
      return null;
    },
  })
);

const widget = {
  id: 'widget-1',
  type: 'guidedLearning',
  x: 0,
  y: 0,
  w: 400,
  h: 300,
  z: 1,
  config: { view: 'library' } as GuidedLearningConfig,
} as unknown as WidgetData;

describe('GuidedLearningWidget folder delete', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    captured.actions = undefined;
    assignmentsState.loading = false;
  });

  it('blocks sets with an open assignment', async () => {
    render(<GuidedLearningWidget widget={widget} />);
    await waitFor(() => expect(captured.actions).toBeDefined());
    const actions = captured.actions;
    expect(actions?.isBlocked?.('gl-live')).toBe(true);
    expect(actions?.isBlocked?.('gl-idle')).toBe(false);
    expect(actions?.blockedReason?.(1)).toBe('1 set has an open assignment');
    expect(actions?.blockedReason?.(2)).toBe('2 sets have open assignments');
  });

  it('refuses to delete while assignments are still loading', async () => {
    assignmentsState.loading = true;
    render(<GuidedLearningWidget widget={widget} />);
    await waitFor(() => expect(captured.actions).toBeDefined());
    await expect(captured.actions?.deleteItems?.(['gl-idle'])).rejects.toThrow(
      /check assignments/
    );
    expect(deleteSet).not.toHaveBeenCalled();
  });
});
